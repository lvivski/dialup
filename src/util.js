var navigator = global.navigator,
	RTCPeerConnection = global.PeerConnection || global.webkitPeerConnection00 || global.webkitRTCPeerConnection || global.mozRTCPeerConnection,
	getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia).bind(navigator),
	RTCIceCandidate = global.mozRTCIceCandidate || global.RTCIceCandidate,
	RTCSessionDescription = global.mozRTCSessionDescription || global.RTCSessionDescription,
	AudioContext = global.AudioContext || global.webkitAudioContext || global.mozAudioContext,
	MediaStream = global.MediaStream || global.webkitMediaStream || global.mozMediaStream

global.URL = global.URL || global.webkitURL || global.msURL
