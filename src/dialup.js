var Stream, Promise, Audio
if (typeof define === 'function' && define.amd) {
	define(['streamlet', 'davy', 'overtone'], function (Streamlet, Davy, Overtone) {
		Stream = Streamlet
		Promise = Davy
		Audio = Overtone
		return Dialup
	})
} else if (typeof module === 'object' && module.exports) {
	module.exports = Dialup
	Stream = require('streamlet')
	Promise = require('davy')
	Audio = require('overtone')
} else {
	global.Dialup = Dialup
	Stream = global.Streamlet
	Promise = global.Davy
	Audio = global.Overtone
}
