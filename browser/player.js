var conn = require('./connection')
var pull = require('../util/pull')

module.exports = function(label) {
	var player = new(require('../player'))(ports, require('./speaker')(), {
		connect: conn.tcp.client,
	})
	document.body.appendChild(player.speaker.el)

	var stopServer = conn.tcp.server({
		role: 'devious-boxes:player',
	 	label: label,
	}, function(s) {
		pull(s, player.stream(), s)
	})

	player.stop = function() {
		player.pause()
		stopServer()
		document.body.removeChild(player.speaker.el)
	}

	return player
}
