function Dialup(url, room) {
	let me = null
	const sockets = []
	const connections = {}
	const data = {}
	const streams = []
	const controller = Streamlet.control()
	const stream = controller.stream
	const ws = new WebSocket(url)

	const constraints = {
		offerToReceiveAudio: true,
		offerToReceiveVideo: true
	}

	const configuration = {
		iceServers: iceServers
	}

	ws.onopen = function () {
		send('join', {
			room: room || ''
		})
	}

	ws.onerror = function () {}

	ws.onmessage = function (e) {
		controller.add(JSON.parse(e.data))
	}

	this.onOffer = stream.filter(message => message.type === 'offer')

	this.onAnswer = stream.filter(message => message.type === 'answer')

	this.onCandidate = stream.filter(message => message.type === 'candidate')

	this.onNew = stream.filter(message => message.type === 'new')

	this.onPeers = stream.filter(message => message.type === 'peers')

	this.onLeave = stream.filter(message => message.type === 'leave')

	this.onAdd = stream.filter(message => message.type === 'add')

	this.onData = stream.filter(message => message.type === 'data')

	this.broadcast = function (message) {
		for (const k in data) {
			this.send(k, message)
		}
	}

	this.send = function (id, message) {
		const d = data[id]
		if (d.readyState === 'open')
			d.send(message)
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

	this.onPeers.listen(function (message) {
		me = message.you

		for (const i in message.connections) {
			const connection = message.connections[i]
			sockets.push(connection)
		}
	})

	this.onCandidate.listen(function (message) {
		const candidate = new RTCIceCandidate({
			sdpMLineIndex: message.label,
			candidate: message.candidate
		})

		connections[message.id].addIceCandidate(candidate).catch(function (e) {
			console.log(e)
		})
	})

	this.onNew.listen(function (message) {
		const id = message.id
		const pc = createPeerConnection(id)

		sockets.push(id)
		connections[id] = pc
		streams.forEach(function (stream) {
			stream.getTracks().forEach(function (track) {
				pc.addTrack(track, stream)
			})
		})
	})

	this.onLeave.listen(function (message) {
		const id = message.id
		delete connections[id]
		delete data[id]
		sockets.splice(sockets.indexOf(id), 1)
	})

	this.onOffer.listen(function (message) {
		const pc = connections[message.id]
		pc.setRemoteDescription(new RTCSessionDescription(message.description))
		createAnswer(message.id, pc)
	})

	this.onAnswer.listen(function (message) {
		const pc = connections[message.id]
		pc.setRemoteDescription(new RTCSessionDescription(message.description))
	})

	function createOffer(socket, pc) {
		pc.createOffer(constraints).then(
			function (session) {
				pc.setLocalDescription(session).then(
					function() {
						send('offer', {
							id: socket,
							description: {
								sdp: session.sdp,
								type: session.type
							}
						})
					}
				)

			},
			function () {}
		)
	}

	function createAnswer(socket, pc) {
		pc.createAnswer().then(
			function (session) {
				pc.setLocalDescription(session)
				send('answer', {
					id: socket,
					description: {
						sdp: session.sdp,
						type: session.type
					}
				})
			},
			function () {}
		)
	}

	function createDataChannel(id, pc, label) {
		label || (label = 'dataChannel')

		const channel = pc.createDataChannel(label)
		addDataChannel(id, channel)
	}

	function addDataChannel(id, channel) {
		channel.onopen = function () {}

		channel.onmessage = function (e) {
			controller.add({
				type: 'data',
				id: id,
				data: e.data
			})
		}

		channel.onclose = function () {}

		data[id] = channel
	}

	function createPeerConnection(id) {
		const pc = new RTCPeerConnection(configuration)

		pc.onicecandidate = function (e) {
			if (e.candidate != null) {
				send('candidate', {
					label: e.candidate.sdpMLineIndex,
					id: id,
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
				type: 'add',
				id: id,
				stream: e.streams[0]
			})
		}

		pc.ondatachannel = function (e) {
			addDataChannel(id, e.channel)
		}

		return pc
	}

	function send(event, data) {
		data.type = event
		ws.send(JSON.stringify(data))
	}
}
