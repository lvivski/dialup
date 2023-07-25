import iceServers from './ice.js'

const configuration = {
	iceServers,
}

export function addTracks(pc: RTCPeerConnection, stream: MediaStream) {
	for (const track of stream.getTracks()) {
		pc.addTrack(track, stream)
	}
}

export function removeTracks(pc: RTCPeerConnection, stream: MediaStream) {
	const senders = pc.getSenders()

	for (const track of stream.getTracks()) {
		const sender = senders.find(sender => sender.track === track)
		if (sender) {
			pc.removeTrack(sender)
		}
	}
}

export function replaceTracks(pc: RTCPeerConnection, stream: MediaStream) {
	const senders = pc.getSenders()

	for (const track of stream.getTracks()) {
		const sender = senders.find(sender => sender.track?.kind === track.kind)
		if (sender) {
			sender.replaceTrack(track)
		}
	}
}

export function stopTracks(streams: MediaStream[], stream: MediaStream) {
	streams.splice(streams.indexOf(stream), 1)

	for (const track of stream.getTracks()) {
		track.stop()
	}
}

export async function createOffer(
	clientId: string,
	pc: RTCPeerConnection,
	socket: WebSocket
) {
	await pc.setLocalDescription(await pc.createOffer())

	socket.send(
		JSON.stringify({
			type: 'offer',
			id: clientId,
			description: pc.localDescription,
		})
	)
}

export async function createAnswer(
	clientId: string,
	pc: RTCPeerConnection,
	socket: WebSocket
) {
	await pc.setLocalDescription(await pc.createAnswer())

	socket.send(
		JSON.stringify({
			type: 'answer',
			id: clientId,
			description: pc.localDescription,
		})
	)
}

export function createDataChannel(
	clientId: string,
	pc: RTCPeerConnection,
	emitter: EventTarget
) {
	const dc = pc.createDataChannel('dataChannel')

	return addDataChannel(clientId, dc, emitter)
}

export function addDataChannel(
	clientId: string,
	dc: RTCDataChannel,
	emitter: EventTarget
) {
	dc.onopen = function () {}
	dc.onclose = function () {}

	dc.onmessage = function ({ data }) {
		emitter.dispatchEvent(
			new MessageEvent('data', {
				data: {
					id: clientId,
					data,
				},
			})
		)
	}

	return dc
}

export function createPeerConnection(
	clientId: string,
	socket: WebSocket,
	emitter: EventTarget,
	dataChannels?: any
) {
	const pc = new RTCPeerConnection(configuration)

	pc.onicecandidate = function (e) {
		if (e.candidate && e.candidate.candidate) {
			socket.send(
				JSON.stringify({
					type: 'candidate',
					id: clientId,
					candidate: e.candidate,
				})
			)
		}
	}

	pc.oniceconnectionstatechange = function () {
		switch (pc.iceConnectionState) {
			case 'failed':
				pc.restartIce()
				break
			case 'closed':
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

	pc.onnegotiationneeded = async function () {
		await createOffer(clientId, pc, socket)
	}

	pc.ontrack = function (e) {
		emitter.dispatchEvent(
			new MessageEvent('add', {
				data: {
					id: clientId,
					stream: e.streams[0],
				},
			})
		)
	}

	pc.ondatachannel = function (e) {
		const channel = addDataChannel(clientId, e.channel, emitter)
		if (dataChannels) {
			dataChannels[clientId] = channel
		}
	}

	return pc
}
