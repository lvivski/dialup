import {
	addTracks,
	createAnswer,
	createDataChannel,
	createPeerConnection,
	removeTracks,
	replaceTracks,
	stopTracks
} from './helpers.js'

type DataChannels = {
	[key: string]: RTCDataChannel
}

type PeerConnections = {
	[key: string]: RTCPeerConnection
}

type DialupEventType = 'peers' | 'new' | 'candidate' | 'leave' | 'offer' | 'answer' | 'add' | 'data'

interface DialupEvent extends MessageEvent {
	type: DialupEventType
	data: {
		id: string
		[key: string]: any
	}
}

type Device = {
	id: string
	label: string
}

type Devices = {
	video: Device[]
	audio: Device[]
}

interface DialupEventListener extends EventListenerObject {
	handleEvent(e: DialupEvent): void;
}

interface Dialup extends EventTarget {
	addEventListener<K extends DialupEventType>(type: K, callback: DialupEventListener | null, options?: AddEventListenerOptions | boolean): void
}

interface StreamFilter {
	filter(stream: MediaStream): void
}

class Dialup extends EventTarget {
	#socket: WebSocket
	#clientIds: string[] = []
	#userStreams: MediaStream[] = []
	#filters: StreamFilter[] = []
	#dataChannels: DataChannels = {}
	#peerConnections: PeerConnections = {}

	constructor(url: string, room = '') {
		super()

		this.#socket = new WebSocket(url)

		this.#socket.onopen = function () {
			this.send(JSON.stringify({ type: 'join', room }))
		}

		this.#socket.onmessage = ({ data }) => {
			const message = JSON.parse(data)
			const eventType: DialupEventType = message.type
			delete message.type
			this.handleMessageEvent(new MessageEvent(eventType, {
				data: message
			}) as DialupEvent)
		}
	}

	async getUserStream(audio: MediaTrackConstraints, video: MediaTrackConstraints) {
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

		const replace = Boolean(this.#userStreams[0])

		if (replace) {
			stopTracks(this.#userStreams, this.#userStreams[0])
		} else {
			this.#userStreams.unshift(stream)
		}

		for (const filter of this.#filters) {
			filter.filter(stream)
		}

		for (const clientId of this.#clientIds) {
			if (replace) {
				replaceTracks(this.#peerConnections[clientId], stream)
			} else {
				addTracks(this.#peerConnections[clientId], stream)
			}
		}

		return stream
	}

	async getDisplayStream() {
		const stream = await navigator.mediaDevices.getDisplayMedia()

		this.#userStreams.push(stream)

		for (const clientId of this.#clientIds) {
			addTracks(this.#peerConnections[clientId], stream)
		}

		const video = stream.getVideoTracks()[0]

		video.onended = () => {
			this.removeStream(stream)
		}

		return stream
	}

	async getMediaDevices() {
		const mediaDevices = await navigator.mediaDevices.enumerateDevices()
		const devices: Devices = {
			video: [],
			audio: []
		}

		for (const device of mediaDevices) {
			if (device.kind === 'videoinput') {
				devices.video.push({
					id: device.deviceId,
					label: device.label || `Camera ${devices.video.length + 1}`
				})
			} else {
				devices.audio.push({
					id: device.deviceId,
					label: device.label || `Mic ${devices.audio.length + 1}`
				})
			}
		}

		return devices
	}

	async handleMessageEvent(e: DialupEvent) {
		const clientId = e.data.id
		const pc = this.#peerConnections[clientId]
		switch (e.type) {
			case 'peers':
				for (const clientId of e.data.connections) {
					this.#clientIds.push(clientId)

					const pc = this.#peerConnections[clientId] = createPeerConnection(clientId, this.#socket, this)
					this.#dataChannels[clientId] = createDataChannel(clientId, pc, this)
				}

				this.dispatchEvent(e)
				break
			case 'new':
				this.#clientIds.push(clientId)
				this.#peerConnections[clientId] = createPeerConnection(clientId, this.#socket, this, this.#dataChannels)

				this.dispatchEvent(e)
				break
			case 'candidate':
				pc.addIceCandidate(e.data.candidate)
				break
			case 'leave':
				delete this.#peerConnections[clientId]
				delete this.#dataChannels[clientId]
				this.#clientIds.splice(this.#clientIds.indexOf(clientId), 1)

				this.dispatchEvent(e)
				break
			case 'offer':
				await pc.setRemoteDescription(e.data.description)

				if (pc.iceConnectionState === 'new') {
					for (const stream of this.#userStreams) {
						addTracks(pc, stream)
					}
				}
				await createAnswer(clientId, pc, this.#socket)
				break
			case 'answer':
				await pc.setRemoteDescription(e.data.description)
				break
		}
	}

	addFilter(filter: StreamFilter) {
		this.#filters.push(filter)
	}

	removeStream(stream: MediaStream) {
		stopTracks(this.#userStreams, stream)

		for (const clientId of this.#clientIds) {
			removeTracks(this.#peerConnections[clientId], stream)
		}

		return stream
	}

	send(clientId: string, message: string) {
		const dc = this.#dataChannels[clientId]
		if (dc.readyState === 'open') {
			dc.send(message)
		}
	}

	broadcast(message: string) {
		for (const clientId in this.#dataChannels) {
			this.send(clientId, message)
		}
	}
}

export default Dialup
