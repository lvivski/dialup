import EventEmitter from './eventemitter.js'

export default function Channel(url, room = '') {
	const target = new EventEmitter()
	const ws = new WebSocket(url)

	ws.onopen = function () {
		target.send('join', { room })
	}

	ws.onmessage = function ({data}) {
		const message = JSON.parse(data)
		const eventType = message.type
		delete message.type
		target.dispatchEvent(new MessageEvent(eventType, {
			data: message
		}))
	}

	target.send = function (message, data) {
		data.type = message
		ws.send(JSON.stringify(data))
	}

	return target
}
