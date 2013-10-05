if (typeof define === 'function' && define.amd) {
	define(Dialup)
} else if (typeof module === 'object' && module.exports) {
	module.exports = Dialup
} else {
	global.Dialup = Dialup
}
