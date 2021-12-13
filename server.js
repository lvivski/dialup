import { WebSocketServer } from 'ws'

export default function Dialup(options) {
	const sockets = {}
	const rooms = {}
	const wss = new WebSocketServer(options)

	wss.on('connection', function (socket) {
		socket.clientId = Math.random().toString(36).slice(2)

		sockets[socket.clientId] = socket

		socket.on('message', function (message) {
			message = JSON.parse(message)

			switch (message.type) {
				case 'offer':
				case 'answer':
				case 'candidate':
					relay(socket, message)
					break
				case 'join':
					const roomId = message.room
					if (rooms[roomId] == null) {
						rooms[roomId] = []
					}

					const clients = rooms[roomId]

					clients.forEach(function (client) {
						sockets[client].send(JSON.stringify({
							type: 'new',
							id: socket.clientId
						}))
					})

					socket.send(JSON.stringify({
						type: 'peers',
						connections: clients,
						you: socket.clientId
					}))

					clients.push(socket.clientId)
					break
			}
		})

		socket.on('close', function () {
			const id = socket.clientId
			delete sockets[id]

			for (const roomId in rooms) {
				const clients = rooms[roomId]
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

	function relay(from, message) {
		const socket = sockets[message.id]
		if (socket) {
			socket.send(JSON.stringify({
				...message,
				id: from.clientId
			}))
		} else {
			console.error(`Socket is not defined for ID:${message.id}`)
		}
	}
}
