module.exports = function(rc) {
	function res(key, def) {
		var value = rc(key)
		if(value === undefined)
			value = rc.set(key, def)
		return value
	}

	res.namespace = rc.namespace
	res.sub = rc.sub
	res.parent = rc.parent
	res.set = rc.set

	res.unwrap = rc
	res.fullUnwrap = rc.fullUnwrap

	return res
}
