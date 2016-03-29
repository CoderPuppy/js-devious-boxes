exports.id = function id(o) {
	if(o && (o.id || o.token || o.songIdentity)) o = o.id || o.token || o.songIdentity
	else return o
}

exports.cb = function cb(o) {
	return typeof(o) == 'function' ? o : function(err) { if(err) throw err }
}

exports.isSong = function isSong(s) {
	return (typeof(s) == 'string' && s.length == 32) || isSong(s.songIdentity)
}
exports.isStation = function isStation(s) {
	return (typeof(s) == 'string' && s.length == 19) || isStation(s.id)
}

exports.set = {}
exports.set.toArray = function(s) { return exports.evalIter(s.values()) }
exports.set.intersect = function(a, b) {
	var res = new Set
	for(var va of a.values()) {
		if(b.has(va)) res.add(va)
	}
	return res
}
exports.set.diff = function(a, b) {
	var res = new Set
	for(var va of a.values()) {
		if(!b.has(va)) res.add(va)
	}
	return res
}

exports.array = {}
exports.array.remove = function(arr, el) {
	var index = arr.indexOf(el)
	if(index != -1)
		return arr.splice(index, 1)[0]
}
