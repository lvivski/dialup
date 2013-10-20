var Stream, Promise
if (typeof define === 'function' && define.amd) {
	define(['streamlet', 'davy'], function (Streamlet, Davy) {
		Stream = Streamlet
		Promise = Davy
		return Dialup
	})
} else if (typeof module === 'object' && module.exports) {
	module.exports = Dialup
	Stream = require('streamlet')
	Promise = require('davy')
} else {
	global.Dialup = Dialup
	Stream = global.Stream
	Promise = global.Promise
}
