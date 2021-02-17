var Streamlet, Overtone
if (typeof define === 'function' && define.amd) {
	define(['streamlet', 'overtone'], function (streamlet, overtone) {
		Streamlet = streamlet
		Overtone = overtone
		return Dialup
	})
} else if (typeof module === 'object' && module.exports) {
	module.exports = Dialup
	Streamlet = require('streamlet')
	Overtone = require('overtone')
} else {
	global.Dialup = Dialup
	Streamlet = global.Streamlet
	Overtone = global.Overtone
}
