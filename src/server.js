'use strict'

const WebSocket = require('ws').Server
const Streamlet = require('streamlet')

module.exports = function Dialup(options) {
	const sockets = {}
  const rooms = {}
  const controller = Streamlet.control()
	const stream = controller.stream
	const ws = new WebSocket(options)

	this.onJoin = stream.filter(message => message.type === 'join')

	this.onOffer = stream.filter(message => message.type === 'offer')

	this.onAnswer = stream.filter(message => message.type === 'answer')

	this.onCandidate = stream.filter(message => message.type === 'candidate')

	this.onJoin.listen(function (message) {
		var socket = message._socket

		if (rooms[message.room] == null) {
			rooms[message.room] = []
		}

		rooms[message.room].forEach(function (client) {
			sockets[client].send(JSON.stringify({
				type: 'new',
				id: socket.hashCode
			}))
		})

		socket.send(JSON.stringify({
			type: 'peers',
			connections: rooms[message.room],
			you: socket.hashCode
		}))

		rooms[message.room].push(socket.hashCode)
	})

	this.onOffer.listen(function (message) {
		var socket = message._socket,
		    soc = sockets[message.id]

		soc.send(JSON.stringify({
			type: 'offer',
			description: message.description,
			id: socket.hashCode
		}))
	})

	this.onAnswer.listen(function (message) {
		var socket = message._socket,
		    soc = sockets[message.id]

		soc.send(JSON.stringify({
			type: 'answer',
			description: message.description,
			id: socket.hashCode
		}))
	})

	this.onCandidate.listen(function (message) {
		var socket = message._socket,
		    soc = sockets[message.id]

		soc.send(JSON.stringify({
			type: 'candidate',
			label: message.label,
			candidate: message.candidate,
			id: socket.hashCode
		}))
	})

	ws.on('connection', function (socket) {
		socket.hashCode = Math.random().toString(36).slice(2)

		sockets[socket.hashCode] = socket

		socket.on('message', function (message) {
			message = JSON.parse(message)
			message._socket = socket
			controller.add(message)
		})

		socket.on('close', function () {
			var id = socket.hashCode
			delete sockets[id]

			for (var room in rooms) {
				var clients = rooms[room]
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
