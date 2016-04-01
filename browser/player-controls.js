var Promise = require('bluebird')
var bean = require('../utils/bean')
var interface = require('./interface')
var pull = require('../pull')
var dnode = require('../dnode')
var debug = require('../debug').sub('ui', 'player-controls')

var $ = document.querySelector.bind(document)

module.exports = Promise.coroutine(function*() {
	var E = {
		pause: $('#player-controls #pause'),
		players: {
			el: $('#player-controls #players'),
			map: {},
		},
	}

	var controls

	var players = {}

	pull(pull.seaport(interface.ports, 'devious-boxes:player'), pull.drain(function(d) {
		debug(d)
		var meta = d[1]
		switch(d[0]) {
		case 'add':
			debug('new player', meta)
			players[meta.id] = meta
			var el = document.createElement('option')
			el.textContent = meta.name && meta.name.length > 0 ? meta.name : meta.id
			el.value = meta.id
			E.players.map[meta.id] = el
			E.players.el.appendChild(el)
			break

		default:
			debug('invalid operator:', d[0], d)
		}
	}))

	var playing = false

	bean.on(pause, 'click', function() {
		if(playing) {
			playing = false
			this.textContent = '▶'
		} else {
			playing = true
			this.textContent = '||'
		}
	})
})

function PlayerControls(E, player) {
	var self = this

	self.E = E
	self.bean = bean.ctx()
	self.player = player
}

PlayerControls.prototype.close = function() {
	self.bean.disable()
}
