var navigator = global.navigator,
	RTCPeerConnection = global.mozRTCPeerConnection || global.webkitRTCPeerConnection || global.PeerConnection,
	getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia).bind(navigator),
	RTCIceCandidate = global.mozRTCIceCandidate || global.RTCIceCandidate,
	RTCSessionDescription = global.mozRTCSessionDescription || global.RTCSessionDescription,
	AudioContext = global.webkitAudioContext || global.mozAudioContext || global.AudioContext,
	MediaStream = global.webkitMediaStream || global.mozMediaStream || global.MediaStream

global.URL = global.URL || global.webkitURL || global.msURL
