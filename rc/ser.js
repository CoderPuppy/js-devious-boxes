module.exports = function(rc, ser, unser) {
	function res(key) {
		return unser(rc(key))
	}

	res.namespace = rc.namespace
	res.sub = rc.sub
	res.parent = rc.parent
	res.set = function(key, value) {
		return unser(rc.set(key, ser(value)))
	}

	res.unwrap = rc
	res.fullUnwrap = rc.fullUnwrap

	return res
}
