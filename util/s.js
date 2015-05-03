exports.id = function id(o) {
	if(o && (o.id || o.token || o.songIdentity)) o = o.id || o.token || o.songIdentity
	else return o
}

exports.isSong = function isSong(s) {
	return (typeof(s) == 'string' && s.length == 32) || isSong(s.songIdentity)
}
exports.isStation = function isStation(s) {
	return (typeof(s) == 'string' && s.length == 19) || isSong(s.id)
}

exports.evalIter = function(i) {
	var res = []
	for(var v of i) {
		res.push(v)
	}
	return res
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
