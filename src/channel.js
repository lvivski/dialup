function Channel(url, room) {
	const controller = Streamlet.control()
	const stream = controller.stream
	const ws = new WebSocket(url)

	ws.onopen = function () {
		send('join', {
			room: room || ''
		})
	}

	ws.onerror = function () {}

	ws.onmessage = function (e) {
		controller.add(JSON.parse(e.data))
	}

	function send(message, data) {
		data.type = message
		ws.send(JSON.stringify(data))
	}

	this.send = send

	this.onOffer = stream.filter(message => message.type === 'offer')

	this.onAnswer = stream.filter(message => message.type === 'answer')

	this.onCandidate = stream.filter(message => message.type === 'candidate')

	this.onNew = stream.filter(message => message.type === 'new')

	this.onPeers = stream.filter(message => message.type === 'peers')

	this.onLeave = stream.filter(message => message.type === 'leave')
}
