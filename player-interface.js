var Promise = require('bluebird')
var pull = require('./pull')

module.exports = function(player) {
	var res = {}

	res.on = player.on
	res.emit = player.emit
	res.emitter = player.emitter

	return res
}
