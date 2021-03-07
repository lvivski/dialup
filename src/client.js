const constraints = {
	offerToReceiveAudio: true,
	offerToReceiveVideo: true
}

const configuration = {
	iceServers: iceServers
}

function Dialup(url, room) {
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
	this.getUserStream = function (audio, video) {
		return navigator.mediaDevices.getUserMedia({
			audio: audio,
			video: video ? { facingMode: 'user' } : false
		}).then(function (stream) {
			Overtone.filter(stream)

			streams.push(stream)

			for (const clientId of clientIds) {
				const pc = peerConnections[clientId]
				addTracks(pc, stream)
			}

			return stream
		})
	}

	this.getDisplayStream = function () {
		return navigator.mediaDevices.getDisplayMedia()
			.then(function (stream) {
				streams.push(stream)

				for (const clientId of clientIds) {
					const pc = peerConnections[clientId]
					addTracks(pc, stream)
				}

				return stream
			})
	}

	this.stopStream = function (stream) {
		stream.getTracks().forEach(function (track) {
			track.stop()
		})
	}

	channel.onPeers.listen(function (message) {
		me = message.you

		for (const clientId of message.connections) {
			clientIds.push(clientId)

			const pc = createPeerConnection(clientId)
			createDataChannel(clientId, pc)
		}
	})

	channel.onNew.listen(function (message) {
		const clientId = message.id
		clientIds.push(clientId)

		const pc = createPeerConnection(clientId)
		createDataChannel(clientId, pc)

		for (const stream of streams) {
			addTracks(pc, stream)
		}
	})

	channel.onCandidate.listen(function (message) {
		const clientId = message.id

		peerConnections[clientId].addIceCandidate(message.candidate)
	})

	channel.onLeave.listen(function (message) {
		const clientId = message.id

		delete peerConnections[clientId]
		delete dataChannels[clientId]
		clientIds.splice(clientIds.indexOf(clientId), 1)
	})

	channel.onOffer.listen(function (message) {
		const clientId = message.id
		const pc = peerConnections[clientId]
		pc.setRemoteDescription(message.description)
			.then(() => createAnswer(clientId, pc))
	})

	channel.onAnswer.listen(function (message) {
		const clientId = message.id
		const pc = peerConnections[clientId]
		pc.setRemoteDescription(message.description)
	})

	/**
	 * @param {RTCPeerConnection} pc
	 * @param {MediaStream} stream
	 */
	function addTracks(pc, stream) {
		stream.getTracks().forEach(function (track) {
			pc.addTrack(track, stream)
		})
	}

	/**
	 * @param {string} clientId
	 * @param {RTCPeerConnection} pc
	 */
	function createOffer(clientId, pc) {
		pc.createOffer(constraints)
			.then(offer => pc.setLocalDescription(offer))
			.then(() =>
				channel.send('offer', {
					id: clientId,
					description: pc.localDescription
				}),
				function () {}
			)
	}

	/**
	 * @param {string} clientId
	 * @param {RTCPeerConnection} pc
	 */
	function createAnswer(clientId, pc) {
		pc.createAnswer()
			.then(answer => pc.setLocalDescription(answer))
			.then(() =>
				channel.send('answer', {
					id: clientId,
					description: pc.localDescription
				}),
				function () {}
			)
	}

	/**
	 * @param {string} clientId
	 * @param {RTCPeerConnection} pc
	 * @param {string} [label]
	 */
	function createDataChannel(clientId, pc, label) {
		label || (label = 'dataChannel')

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

		pc.onnegotiationneeded = function () {
			createOffer(clientId, pc)
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
