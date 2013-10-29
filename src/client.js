function Dialup(url, room) {
	var me = null,
	    sockets = [],
	    connections = {},
	    data = {},
	    streams = [],
	    stream = new Stream,
	    socket = new WebSocket(url)

	var constraints = {
	    	optional: [],
	    	mandatory: {
	    		OfferToReceiveAudio:true,
	    		OfferToReceiveVideo:true
	    	}
	    },
	    servers = {
	    	iceServers: [{ url: 'stun:stun.l.google.com:19302' }]
	    },
	    config = {
	    	optional: [{ RtpDataChannels: true }, { DtlsSrtpKeyAgreement: true }]
	    }

	socket.onopen = function () {
		send('join', {
			room: room || ''
		})
	}

	socket.onerror = function () {}

	socket.onmessage = function (e) {
		stream.add(JSON.parse(e.data))
	}

	this.onOffer = stream.filter(function (message) {
		return message.type === 'offer'
	})

	this.onAnswer = stream.filter(function (message) {
		return message.type === 'answer'
	})

	this.onCandidate = stream.filter(function (message) {
		return message.type === 'candidate'
	})

	this.onNew = stream.filter(function (message) {
		return message.type === 'new'
	})

	this.onPeers = stream.filter(function (message) {
		return message.type === 'peers'
	})

	this.onLeave = stream.filter(function (message) {
		return message.type === 'leave'
	})

	this.onAdd = stream.filter(function (message) {
		return message.type === 'add'
	})

	this.onRemove = stream.filter(function (message) {
		return message.type === 'remove'
	})

	this.onData = stream.filter(function (message) {
		return message.type === 'data'
	})

	this.broadcast = function (message) {
		for (var k in data) {
			this.send(k, message)
		}
	}
	
	this.send = function (id, message) {
		var d = data[id]
		if (d.readyState === 'open')
			d.send(message)
	}

	this.createStream = function (audio, video) {
		var promise = new Promise

		getUserMedia({audio: audio, video: video}, function (stream) {
			if (AudioContext) {
				var audio = stream.getAudioTracks()[0],
				    context = new AudioContext(),
				    media = new MediaStream()

				media.addTrack(audio)
				stream.removeTrack(audio)

				var source = context.createMediaStreamSource(media),
				    filter = context.createBiquadFilter(),
				    destination = context.createMediaStreamDestination()

				filter.type = filter.LOWPASS
				filter.Q.value = 0
				filter.frequency.value = 2000

				source.connect(filter)
				filter.connect(destination)
				stream.addTrack(destination.stream.getAudioTracks()[0])
			}

			streams.push(stream)

			for (var i = 0; i < sockets.length; ++i) {
				var socket = sockets[i]
				connections[socket] = createPeerConnection(socket)
			}

			for (i = 0; i < streams.length; ++i) {
				var stream = streams[i]
				for (var socket in connections) {
					var connection = connections[socket]
					connection.addStream(stream)
				}
			}

			for (socket in connections) {
				connection = connections[socket]
				createDataChannel(socket, connection)
				createOffer(socket, connection)
			}

			promise.fulfill(stream)
		}, function () {}, constraints)

		return promise
	}

	this.onPeers.listen(function (message) {
		me = message.you

		for (var i in message.connections) {
			var connection = message.connections[i]
			sockets.push(connection)
		}
	})

	this.onCandidate.listen(function (message) {
		var candidate = new RTCIceCandidate({
			sdpMLineIndex: message.label,
			candidate: message.candidate
		})

		connections[message.id].addIceCandidate(candidate)
	})

	this.onNew.listen(function (message) {
		var id = message.id,
		    pc = createPeerConnection(id)

		sockets.push(id)
		connections[id] = pc
		streams.forEach(function (stream) {
			pc.addStream(stream)
		})
	})

	this.onLeave.listen(function (message) {
		var id = message.id
		delete connections[id]
		delete data[id]
		sockets.splice(sockets.indexOf(id), 1)
	})

	this.onOffer.listen(function (message) {
		var pc = connections[message.id]
		pc.setRemoteDescription(new RTCSessionDescription(message.description))
		createAnswer(message.id, pc)
	})

	this.onAnswer.listen(function (message) {
		var pc = connections[message.id]
		pc.setRemoteDescription(new RTCSessionDescription(message.description))
	})

	function createOffer(socket, pc) {
		pc.createOffer(function (session) {
			pc.setLocalDescription(session)
			send('offer', {
				id: socket,
				description: {
					sdp: session.sdp,
					type: session.type
				}
			})
		}, function () {}, constraints)
	}

	function createAnswer(socket, pc) {
		pc.createAnswer(function (session) {
			pc.setLocalDescription(session)
			send('answer', {
				id: socket,
				description: {
					sdp: session.sdp,
					type: session.type
				}
			})
		}, function () {})
	}

	function createDataChannel(id, pc, label) {
		var channel = pc.createDataChannel(label || 'fileTransfer', { reliable: false })
		addDataChannel(id, channel)
	}

	function addDataChannel(id, channel) {
		channel.onopen = function () {}

		channel.onmessage = function (e) {
			stream.add({
				type: 'data',
				id: id,
				data: e.data
			})
		}

		channel.onclose = function () {}

		data[id] = channel
	}

	function createPeerConnection(id) {
		var pc = new RTCPeerConnection(servers, config)

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

		pc.onaddstream = function (e) {
			stream.add({
				type: 'add',
				id: id,
				stream: e.stream
			})
		}

		pc.onremovestream = function (e) {
			stream.add({
				type: 'remove',
				id: id,
				stream: e.stream
			})
		}

		pc.ondatachannel = function (e) {
			addDataChannel(id, e.channel)
		}

		return pc
	}

	function send(event, data) {
		data.type = event
		socket.send(JSON.stringify(data))
	}
}
