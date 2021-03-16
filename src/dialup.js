import Overtone from 'overtone'
import Chromatone from 'chromatone'
import EventEmitter from './eventemitter.js'
import iceServers from './ice.js'
import Channel from './channel.js'

const configuration = {
	iceServers
}

export default function Dialup(url, room) {
	let me = null

	/** @type string[] */
	const clientIds = []

	/** @type MediaStream[] */
	const streams = []

	/** @type Object.<string,RTCPeerConnection> */
	const peerConnections = {}

	/** @type Object.<string,RTCDataChannel> */
	const dataChannels = {}

	/** @type Object.<string,MediaStream[]> */

	const target = new EventEmitter()

	/**
	 * @param {boolean | string} audio
	 * @param {boolean | string} video
	 * @returns Promise<MediaStream>
	 */
	target.getUserStream = async function (audio, video) {
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: typeof audio === 'string'
				? { deviceId: audio }
				: audio,

			video: typeof video === 'string'
				? { deviceId: video }
				: video
					? { facingMode: 'user' }
					: false
		})

		const replace = Boolean(streams[0])

		if (replace) {
			stopTracks(streams[0])
		} else {
			streams.unshift(stream)
		}

		Overtone.filter(stream)
		Chromatone.filter(stream)

		for (const clientId of clientIds) {
			if (replace) {
				replaceTracks(clientId, stream)
			} else {
				addTracks(clientId, stream)
			}
		}

		return stream
	}

	target.getDisplayStream = async function () {
		const stream = await navigator.mediaDevices.getDisplayMedia()

		streams.push(stream)

		for (const clientId of clientIds) {
			addTracks(clientId, stream)
		}

		const video = stream.getVideoTracks()[0]

		video.onended = function () {
			target.removeStream(stream)
		}

		return stream
	}

	target.getMediaDevices = async function () {
		const mediaDevices = await navigator.mediaDevices.enumerateDevices()
		const devices = {
			video: [],
			audio: []
		}

		for (const device of mediaDevices) {
			if (device.kind === 'videoinput') {
				devices.video.push({
					id: device.deviceId,
					label:  device.label || `Camera ${devices.video.length +1}`
				})
			} else {
				devices.audio.push({
					id: device.deviceId,
					label: device.label || `Mic ${devices.audio.length +1}`
				})
			}
		}

		return devices
	}

	target.removeStream = function (stream) {
		stopTracks(stream)

		for (const clientId of clientIds) {
			removeTracks(clientId, stream)
		}

		return stream
	}

	/**
	 * @param {string} clientId
	 * @param {any} message
	 */
	 target.send = function (clientId, message) {
		const dc = dataChannels[clientId]
		if (dc.readyState === 'open') {
			dc.send(message)
		}
	}

	/**
	 * @param {string} message
	 */
	target.broadcast = function (message) {
		for (const clientId in dataChannels) {
			target.send(clientId, message)
		}
	}

	const channel = new Channel(url, room)

	channel.onpeers = function (e) {
		me = e.data.you

		for (const clientId of e.data.connections) {
			clientIds.push(clientId)

			createPeerConnection(clientId)
			createDataChannel(clientId)
		}

		target.dispatchEvent(e)
	}

	channel.onnew = function (e) {
		const clientId = e.data.id

		clientIds.push(clientId)
		createPeerConnection(clientId)

		target.dispatchEvent(e)
	}

	channel.oncandidate = function (e) {
		const clientId = e.data.id

		const pc = peerConnections[clientId]
		pc.addIceCandidate(e.data.candidate)
	}

	channel.onleave = function (e) {
		const clientId = e.data.id

		delete peerConnections[clientId]
		delete dataChannels[clientId]
		clientIds.splice(clientIds.indexOf(clientId), 1)

		target.dispatchEvent(e)
	}

	channel.onoffer = async function (e) {
		const clientId = e.data.id

		const pc = peerConnections[clientId]
		await pc.setRemoteDescription(e.data.description)

		if (pc.iceConnectionState === 'new') {
			for (const stream of streams) {
				addTracks(clientId, stream)
			}
		}

		await createAnswer(clientId)
	}

	channel.onanswer = async function (e) {
		const clientId = e.data.id

		const pc = peerConnections[clientId]
		await pc.setRemoteDescription(e.data.description)
	}

	/**
	 * @param {string} clientId
	 * @param {MediaStream} stream
	 */
	function addTracks(clientId, stream) {
		const pc = peerConnections[clientId]

		for (const track of stream.getTracks()) {
			pc.addTrack(track, stream)
		}
	}

	/**
	 * @param {string} clientId
	 * @param {MediaStream} stream
	 */
	 function removeTracks(clientId, stream) {
		const pc = peerConnections[clientId]
		const senders = pc.getSenders()

		for (const track of stream.getTracks()) {
			const sender = senders.find(sender => sender.track === track)
			if (sender) {
				pc.removeTrack(sender)
			}
		}
	}

	/**
	 * @param {string} clientId
	 * @param {MediaStream} stream
	 */
	 function replaceTracks(clientId, stream) {
		const pc = peerConnections[clientId]
		const senders = pc.getSenders()

		for (const track of stream.getTracks()) {
			const sender = senders.find(sender => sender.track.kind === track.kind)
			if (sender) {
				sender.replaceTrack(track)
			}
		}
	}

	/**
	 * @param {MediaStream} stream
	 */
	 function stopTracks(stream) {
		streams.splice(streams.indexOf(stream), 1)

		for (const track of stream.getTracks()) {
			track.stop()
		}
	}

	/**
	 * @param {string} clientId
	 */
	async function createOffer(clientId) {
		const pc = peerConnections[clientId]

		await pc.setLocalDescription(await pc.createOffer())

		channel.send('offer', {
			id: clientId,
			description: pc.localDescription
		})
	}

	/**
	 * @param {string} clientId
	 */
	async function createAnswer(clientId) {
		const pc = peerConnections[clientId]

		await pc.setLocalDescription(await pc.createAnswer())

		channel.send('answer', {
			id: clientId,
			description: pc.localDescription
		})
	}

	/**
	 * @param {string} clientId
	 * @param {string} [label]
	 */
	function createDataChannel(clientId, label = 'dataChannel') {
		const pc = peerConnections[clientId]
		const dc = pc.createDataChannel(label)

		addDataChannel(clientId, dc)
	}

	/**
	 * @param {string} clientId
	 * @param {RTCDataChannel} dc
	 */
	function addDataChannel(clientId, dc) {
		dc.onopen = function () {}

		dc.onmessage = function ({data}) {
			target.dispatchEvent(new MessageEvent('data', {
				data: {
					id: clientId,
					data
				}
			}))
		}

		dc.onclose = function () {}

		dataChannels[clientId] = dc
	}

	/**
	 * @param {string} clientId
	 * @returns RTCPeerConnection
	 */
	function createPeerConnection(clientId) {
		const pc = new RTCPeerConnection(configuration)
		peerConnections[clientId] = pc

		pc.onicecandidate = function (e) {
			if (e.candidate && e.candidate.candidate) {
				channel.send('candidate', {
					id: clientId,
					candidate: e.candidate
				})
			}
		}

		pc.oniceconnectionstatechange = function () {
			switch (pc.iceConnectionState) {
				case 'failed':
				case 'closed':
					pc.close()
					break
				case 'disconnected':
					break
				case 'completed':
					pc.onicecandidate = function () {}
					break
			}
		}

		pc.onicecandidateerror = function (e) {
			console.log(e)
		}

		// very unreliable
		pc.onnegotiationneeded = function () {
			createOffer(clientId)
		}

		pc.ontrack = function (e) {
			target.dispatchEvent(new MessageEvent('add', {
				data: {
					id: clientId,
					stream: e.streams[0]
				}
			}))
		}

		pc.ondatachannel = function (e) {
			addDataChannel(clientId, e.channel)
		}

		return pc
	}

	return target
}
