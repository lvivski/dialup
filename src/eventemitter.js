export default function EventEmitter() {
	const target = new EventTarget()
	const dispatch = target.dispatchEvent

	target.dispatchEvent = function (e) {
		const onevent = this[`on${e.type}`]
		if (typeof onevent === 'function') {
			onevent.call(this, e)
		}
		dispatch.call(this, e)
	}

	return target
}
