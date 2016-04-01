var Promise = require('bluebird')
var bean = require('bean')
var Player = require('../player')
var PlayerInterface = require('../player-interface')
var interface = require('./interface')
var debug = require('../debug').sub('ui', 'player')
var dnode = require('../dnode')

var $ = document.querySelector.bind(document)

module.exports = Promise.coroutine(function*() {
	var E = {
		el: $('#player'),
		form: $('form#player'),
		name: $('#player #name'),
		stst: $('#player #stst'),
	}

	var running = false

	var name, player, service

	bean.on(E.form, 'submit', Promise.coroutine(function*(e) {
		e.stop()
		if(running) {
			E.stst.textContent = 'Start'
			E.el.classList.remove('running')
			running = false

			if(player) player.stop()
			if(service) yield service.stop()
			player = null, service = null
		} else {
			name = E.name.value

			E.stst.textContent = 'Stop'
			E.el.classList.add('running')
			running = true

			player = new Player(interface)
			window.player = player
			debug('starting as', name)
			var playerInterface = PlayerInterface(player)
			service = interface.tcp.server({
				role: 'devious-boxes:player',
				name: name,
			}, function(s) {
				var d = dnode(playerInterface)
				pull(s, d, s)
			})
			yield service.start()
			debug('serving', name)
		}
	}))
})
