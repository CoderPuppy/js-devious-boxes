function match(p, r) {
	if(Array.isArray(p)) {
		return p.every(function(p, i) {
			return match(p, r[i])
		})
	} else if(typeof(p) == 'object' && p && !(p instanceof Number || p instanceof String || p instanceof RegExp || p instanceof Boolean)) {
		for(var k in p) {
			if(!match(p[k], r[k])) return false
		}
		return true
	} else if(p instanceof RegExp && (typeof(r) == 'string' || r instanceof String)) {
		return p.test(r)
	} else if(p === undefined) {
		return true
	} else if(p === null) {
		return p === null || p === undefined
	} else {
		return p === r
	}
}
module.exports = match
