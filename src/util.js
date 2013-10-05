var navigator = global.navigator,
	RTCPeerConnection = global.PeerConnection || global.webkitPeerConnection00 || global.webkitRTCPeerConnection || global.mozRTCPeerConnection,
	getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || noop).bind(navigator),
	RTCIceCandidate = global.mozRTCIceCandidate || global.RTCIceCandidate,
	RTCSessionDescription = global.mozRTCSessionDescription || global.RTCSessionDescription

global.URL = global.URL || global.webkitURL || global.msURL
