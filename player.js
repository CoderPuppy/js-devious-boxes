var pull = require('./util/pull')

function Player(ports, speaker) {
	pull(pull.seaport(ports, 'devious-boxes:account-provider'), pull.drain(function(d) {
		console.log(d)
	}))
	this.speaker = speaker(this)
}

module.exports = Player
