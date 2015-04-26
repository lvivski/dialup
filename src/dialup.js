var Observable, Promise, Audio
if (typeof define === 'function' && define.amd) {
	define(['streamlet', 'davy', 'overtone'], function (streamlet, davy, overtone) {
		Observable = streamlet
		Promise = davy
		Audio = overtone
		return Dialup
	})
} else if (typeof module === 'object' && module.exports) {
	module.exports = Dialup
	Observable = require('streamlet')
	Promise = require('davy')
	Audio = require('overtone')
} else {
	global.Dialup = Dialup
	Observable = global.Streamlet
	Promise = global.Davy
	Audio = global.Overtone
}
