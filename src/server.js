'use strict'

const WebSocketServer = require('ws').Server
const Streamlet = require('streamlet')

module.exports = function Dialup(options) {
	const sockets = {}
  const rooms = {}
  const controller = Streamlet.control()
	const stream = controller.stream
	const wss = new WebSocketServer(options)

	this.onJoin = stream.filter(message => message.type === 'join')
	this.onOffer = stream.filter(message => message.type === 'offer')
	this.onAnswer = stream.filter(message => message.type === 'answer')
	this.onCandidate = stream.filter(message => message.type === 'candidate')

	this.onJoin.listen(function (message) {
		const socket = message.origin

		if (rooms[message.room] == null) {
			rooms[message.room] = []
		}

		rooms[message.room].forEach(function (client) {
			sockets[client].send(JSON.stringify({
				type: 'new',
				id: socket.clientId
			}))
		})

		socket.send(JSON.stringify({
			type: 'peers',
			connections: rooms[message.room],
			you: socket.clientId
		}))

		rooms[message.room].push(socket.clientId)
	})

	this.onOffer.listen(relay)

	this.onAnswer.listen(relay)

	this.onCandidate.listen(relay)

	function relay(message) {
		const from = message.origin
		const socket = sockets[message.id]

		delete message.origin

		socket.send(JSON.stringify({
			...message,
			id: from.clientId
		}))
	}

	wss.on('connection', function (socket) {
		socket.clientId = Math.random().toString(36).slice(2)

		sockets[socket.clientId] = socket

		socket.on('message', function (message) {
			message = JSON.parse(message)
			message.origin = socket

			controller.add(message)
		})

		socket.on('close', function () {
			const id = socket.clientId
			delete sockets[id]

			for (const room in rooms) {
				const clients = rooms[room]
				if (clients.indexOf(id) !== -1) {
					clients.splice(clients.indexOf(id), 1)

					clients.forEach(function (client) {
						sockets[client].send(JSON.stringify({
							type: 'leave',
							id: id
						}))
					})
				}
			}
		})
	})
}
