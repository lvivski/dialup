const serversList = [
	'stun.l.google.com:19302',
]

export default serversList.reduce(function (servers, server) {
	server = 'stun:' + server
	const lastEntry = servers[servers.length - 1]
	if (lastEntry) {
		const lastServer = lastEntry.urls[0]
		if (trimIce(lastServer) === trimIce(server)) {
			lastEntry.urls.push(server)
		} else {
			servers.push({urls: [server]})
		}
	} else {
		servers.push({urls: [server]})
	}

	return servers
}, [])

function trimIce(server) {
	return server.replace(/^stun:stun\d*\./, '').replace(/:\d+$/, '')
}
