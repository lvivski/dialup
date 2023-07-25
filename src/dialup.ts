import {
	addTracks,
	createAnswer,
	createDataChannel,
	createPeerConnection,
	removeTracks,
	replaceTracks,
	stopTracks,
} from './helpers.js'

type DataChannels = {
	[key: string]: RTCDataChannel
}

type PeerConnections = {
	[key: string]: RTCPeerConnection
}

type DialupEventType =
	| 'peers'
	| 'new'
	| 'candidate'
	| 'leave'
	| 'offer'
	| 'answer'
	| 'add'
	| 'data'

interface DialupEvent extends MessageEvent {
	type: DialupEventType
	data: {
		id: string
		[key: string]: any
	}
}

interface DialupEventListener extends EventListenerObject {
	handleEvent(e: DialupEvent): void
}

interface Dialup extends EventTarget {
	addEventListener<K extends DialupEventType>(
		type: K,
		callback: DialupEventListener | null,
		options?: AddEventListenerOptions | boolean
	): void
}

class Dialup extends EventTarget {
	#clientIds: string[] = []
	#dataChannels: DataChannels = {}
	#localStreams: MediaStream[] = []
	#peerConnections: PeerConnections = {}
	#socket: WebSocket

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
			this.handleMessageEvent(
				new MessageEvent(eventType, {
					data: message,
				}) as DialupEvent
			)
		}
	}

	addStream(stream: MediaStream) {
		for (const clientId of this.#clientIds) {
			addTracks(this.#peerConnections[clientId], stream)
		}

		const track = stream.getVideoTracks()[0] || stream.getAudioTracks()[0]

		track.onended = () => {
			this.removeStream(stream)
		}
	}

	async handleMessageEvent(e: DialupEvent) {
		const clientId = e.data.id
		const pc = this.#peerConnections[clientId]
		switch (e.type) {
			case 'peers':
				for (const clientId of e.data.connections) {
					this.#clientIds.push(clientId)

					const pc = (this.#peerConnections[clientId] = createPeerConnection(
						clientId,
						this.#socket,
						this
					))
					this.#dataChannels[clientId] = createDataChannel(clientId, pc, this)
				}

				this.dispatchEvent(e)
				break
			case 'new':
				this.#clientIds.push(clientId)
				this.#peerConnections[clientId] = createPeerConnection(
					clientId,
					this.#socket,
					this,
					this.#dataChannels
				)

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
					for (const stream of this.#localStreams) {
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

	removeStream(stream: MediaStream) {
		stopTracks(this.#localStreams, stream)

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
