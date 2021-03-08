import Streamlet from 'streamlet'
import Overtone from 'overtone'
import iceServers from './ice.js'
import Channel from './channel.js'

const configuration = {
	iceServers
}

export default function Dialup(url, room) {
	let me = null
	const channel = new Channel(url, room)

	/** @type string[] */
	const clientIds = []

	/** @type MediaStream[] */
	const streams = []

	/** @type Object.<string,RTCPeerConnection> */
	const peerConnections = {}

	/** @type Object.<string,RTCDataChannel> */
	const dataChannels = {}

	const controller = Streamlet.control()
	const stream = controller.stream

	this.onAdd = stream.filter(message => message.type === 'add')
	this.onData = stream.filter(message => message.type === 'data')
	this.onPeers = channel.onPeers
	this.onLeave = channel.onLeave

	this.broadcast = function (message) {
		for (const clientId in dataChannels) {
			this.send(clientId, message)
		}
	}

	/**
	 * @param {string} clientId
	 * @param {any} message
	 */
	this.send = function (clientId, message) {
		const dc = dataChannels[clientId]
		if (dc.readyState === 'open') {
			dc.send(message)
		}
	}

	/**
	 * @param {boolean} audio
	 * @param {boolean} video
	 * @returns Promise<MediaStream>
	 */
	this.getUserStream = async function (audio, video) {
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: audio,
			video: video ? { facingMode: 'user' } : false
		})

		streams.push(stream)

		Overtone.filter(stream)

		for (const clientId of clientIds) {
			addTracks(clientId, stream)
		}

		return stream
	}

	this.getDisplayStream = async function () {
		const stream = await navigator.mediaDevices.getDisplayMedia()

		streams.push(stream)

		for (const clientId of clientIds) {
			addTracks(clientId, stream)
		}

		return stream
	}

	this.stopStream = function (stream) {
		for (const track of stream.getTracks()) {
			track.stop()
		}
		streams.splice(streams.indexOf(stream), 1)
	}

	channel.onPeers.listen(function (message) {
		me = message.you

		for (const clientId of message.connections) {
			clientIds.push(clientId)

			createPeerConnection(clientId)
			createDataChannel(clientId)
		}
	})

	channel.onNew.listen(function (message) {
		const clientId = message.id
		clientIds.push(clientId)

		createPeerConnection(clientId)
	})

	channel.onCandidate.listen(function (message) {
		const clientId = message.id
		const pc = peerConnections[clientId]

		pc.addIceCandidate(message.candidate)
	})

	channel.onLeave.listen(function (message) {
		const clientId = message.id

		delete peerConnections[clientId]
		delete dataChannels[clientId]
		clientIds.splice(clientIds.indexOf(clientId), 1)
	})

	channel.onOffer.listen(async function (message) {
		const clientId = message.id
		const pc = peerConnections[clientId]

		await pc.setRemoteDescription(message.description)

		if (pc.iceConnectionState === 'new') {
			for (const stream of streams) {
				addTracks(clientId, stream)
			}
		}

		await createAnswer(clientId)
	})

	channel.onAnswer.listen(async function (message) {
		const clientId = message.id
		const pc = peerConnections[clientId]

		await pc.setRemoteDescription(message.description)
	})

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
	function createDataChannel(clientId, label) {
		label || (label = 'dataChannel')

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

		dc.onmessage = function (e) {
			controller.add({
				id: clientId,
				type: 'data',
				data: e.data
			})
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

		pc.oniceconnectionstatechange = function() {
			switch (pc.iceConnectionState) {
				case 'disconnected':
					break
				case 'failed':
					pc.close()
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
			controller.add({
				id: clientId,
				type: 'add',
				stream: e.streams[0]
			})
		}

		pc.ondatachannel = function (e) {
			addDataChannel(clientId, e.channel)
		}

		return pc
	}
}
