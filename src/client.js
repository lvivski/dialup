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
	const sockets = []
	const connections = {}
	const data = {}
	const streams = []

	const controller = Streamlet.control()
	const stream = controller.stream


	this.onAdd = stream.filter(message => message.type === 'add')
	this.onData = stream.filter(message => message.type === 'data')

	this.broadcast = function (message) {
		for (const socket in data) {
			this.send(socket, message)
		}
	}

	this.send = function (socket, message) {
		const dataConnection = data[socket]
		if (dataConnection.readyState === 'open') {
			dataConnection.send(message)
		}
	}

	this.createStream = function (audio, video) {
		return navigator.mediaDevices.getUserMedia({
			audio: audio,
			video: video
		}).then(function (stream) {

			Overtone.filter(stream)

			streams.push(stream)

			for (const socket of sockets) {
				connections[socket] = createPeerConnection(socket)
			}

			for (const stream of streams) {
				for (const socket in connections) {
					const connection = connections[socket]
					stream.getTracks().forEach(function (track) {
						connection.addTrack(track, stream)
					})
				}
			}

			for (const socket in connections) {
				const connection = connections[socket]
				createDataChannel(socket, connection)
				createOffer(socket, connection)
			}

			return stream
		})
	}

	channel.onPeers.listen(function (message) {
		me = message.you

		for (const socket of message.connections) {
			sockets.push(socket)
		}
	})

	channel.onCandidate.listen(function (message) {
		const socket = message.id
		const candidate = new RTCIceCandidate({
			sdpMLineIndex: message.label,
			candidate: message.candidate
		})

		connections[socket].addIceCandidate(candidate)
	})

	channel.onNew.listen(function (message) {
		const socket = message.id
		const pc = createPeerConnection(socket)

		sockets.push(socket)
		connections[socket] = pc
		streams.forEach(function (stream) {
			stream.getTracks().forEach(function (track) {
				pc.addTrack(track, stream)
			})
		})
	})

	channel.onLeave.listen(function (message) {
		const socket = message.id
		delete connections[socket]
		delete data[socket]
		sockets.splice(sockets.indexOf(socket), 1)
	})

	channel.onOffer.listen(function (message) {
		const socket = message.id
		const pc = connections[socket]
		pc.setRemoteDescription(new RTCSessionDescription(message.description))
		createAnswer(socket, pc)
	})

	channel.onAnswer.listen(function (message) {
		const socket = message.id
		const pc = connections[socket]
		pc.setRemoteDescription(new RTCSessionDescription(message.description))
	})

	function createOffer(socket, pc) {
		pc.createOffer(constraints)
			.then(offer => pc.setLocalDescription(offer))
			.then(offer =>
				channel.send('offer', {
					id: socket,
					description: {
						sdp: offer.sdp,
						type: offer.type
					}
				}),
				function () {}
			)
	}

	function createAnswer(socket, pc) {
		pc.createAnswer()
			.then(answer => pc.setLocalDescription(answer))
			.then(answer =>
				channel.send('answer', {
					id: socket,
					description: {
						sdp: answer.sdp,
						type: answer.type
					}
				}),
				function () {}
			)
	}

	function createDataChannel(socket, pc, label) {
		label || (label = 'dataChannel')

		const channel = pc.createDataChannel(label)
		addDataChannel(socket, channel)
	}

	function addDataChannel(socket, channel) {
		channel.onopen = function () {}

		channel.onmessage = function (e) {
			controller.add({
				id: socket,
				type: 'data',
				data: e.data
			})
		}

		channel.onclose = function () {}

		data[socket] = channel
	}

	function createPeerConnection(socket) {
		const pc = new RTCPeerConnection(configuration)

		pc.onicecandidate = function (e) {
			if (e.candidate && e.candidate.candidate) {
				channel.send('candidate', {
					id: socket,
					label: e.candidate.sdpMLineIndex,
					candidate: e.candidate.candidate
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
				id: socket,
				type: 'add',
				stream: e.streams[0]
			})
		}

		pc.ondatachannel = function (e) {
			addDataChannel(socket, e.channel)
		}

		return pc
	}
}
