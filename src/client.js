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

	/** @type Object.<string,RTCPeerConnection> */
	const connections = {}

	/** @type Object.<string,RTCDataChannel> */
	const data = {}

	/** @type MediaStream[] */
	const streams = []

	const controller = Streamlet.control()
	const stream = controller.stream


	this.onAdd = stream.filter(message => message.type === 'add')
	this.onData = stream.filter(message => message.type === 'data')
	this.onPeers = channel.onPeers
	this.onLeave = channel.onLeave

	this.broadcast = function (message) {
		for (const clientId in data) {
			this.send(clientId, message)
		}
	}

	/**
	 * @param {string} clientId
	 * @param {any} message
	 */
	this.send = function (clientId, message) {
		const dc = data[clientId]
		if (dc.readyState === 'open') {
			dc.send(message)
		}
	}

	/**
	 * @param {boolean} audio
	 * @param {boolean} video
	 * @returns Promise<MediaStream>
	 */
	this.createStream = function (audio, video) {
		return navigator.mediaDevices.getUserMedia({
			audio: audio,
			video: video
		}).then(function (stream) {

			Overtone.filter(stream)

			streams.push(stream)

			for (const id of clientIds) {
				const connection = connections[id] = createPeerConnection(id)

				for (const stream of streams) {
					stream.getTracks().forEach(function (track) {
						connection.addTrack(track, stream)
					})
				}

				createDataChannel(id, connection)
				createOffer(id, connection)
			}

			return stream
		})
	}

	channel.onPeers.listen(function (message) {
		me = message.you

		for (const id of message.connections) {
			clientIds.push(id)
		}
	})

	channel.onCandidate.listen(function (message) {
		const clientId = message.id

		connections[clientId].addIceCandidate(message.candidate)
	})

	channel.onNew.listen(function (message) {
		const clientId = message.id
		const pc = createPeerConnection(clientId)

		clientIds.push(clientId)
		connections[clientId] = pc

		streams.forEach(function (stream) {
			stream.getTracks().forEach(function (track) {
				pc.addTrack(track, stream)
			})
		})
	})

	channel.onLeave.listen(function (message) {
		const clientId = message.id
		delete connections[clientId]
		delete data[clientId]
		clientIds.splice(clientIds.indexOf(clientId), 1)
	})

	channel.onOffer.listen(function (message) {
		const clientId = message.id
		const pc = connections[clientId]
		pc.setRemoteDescription(message.description)
		createAnswer(clientId, pc)
	})

	channel.onAnswer.listen(function (message) {
		const clientId = message.id
		const pc = connections[clientId]
		pc.setRemoteDescription(message.description)
	})

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

		data[clientId] = dc
	}

	/**
	 * @param {string} clientId
	 * @returns RTCPeerConnection
	 */
	function createPeerConnection(clientId) {
		const pc = new RTCPeerConnection(configuration)

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
