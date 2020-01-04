var pull = require('../pull')

exports.output = function() {
	return pull.map(function(d) {
		return new Buffer(d).toJSON()
		// return d
	})
}
exports.input = function() {
	return pull.map(function(d) {
		if(d.type == 'Buffer' && Array.isArray(d.data))
			return new Buffer(d.data)
		else
			return d
	})
}
