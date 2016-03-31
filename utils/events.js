var EE = require('events')

module.exports = function(self) {
	for(var k in EE.prototype) {
		if(typeof(EE.prototype[k]) == 'function') {
			self[k] = EE.prototype[k]
		}
	}
	EE.call(self)
	return self
}
