var serversList = [
	'stun.l.google.com:19302',
	'stun1.l.google.com:19302',
	'stun2.l.google.com:19302',
	'stun3.l.google.com:19302',
	'stun4.l.google.com:19302',
	'stun.ekiga.net',
	'stun.ideasip.com',
	'stun.rixtelecom.se',
	'stun.schlund.de',
	'stun.stunprotocol.org:3478',
	'stun.voiparound.com',
	'stun.voipbuster.com',
	'stun.voipstunt.com',
	'stun.voxgratia.org',
]

var iceServers = serversList.reduce(function (servers, server) {
	var lastEntry = servers[servers.length - 1]
	server = 'stun:' + server
	if (lastEntry) {
		var lastServer = lastEntry.urls[0]
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
