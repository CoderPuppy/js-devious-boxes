var pull = require('../util/pull')
var xtend = require('xtend')
var URL = require('url')
var dnode = require('dnode')
var bean = require('../util/bean')
var co = require('co')
var Promise = require('bluebird')
var Player = require('./player')
var PlayerControls = require('./player-controls')

var conn = require('./connection')
var request = conn.request
var tcp = conn.tcp
var ports = Promise.promisifyAll(conn.ports)

var player

require('domready')(co.wrap(function*() {
	var E = {
		mixer: {
			el: document.getElementById('stations'),
			accounts: {},
			stations: {},
		},
		albumArt: document.getElementById('albumart'),
		songName: document.getElementById('song-name'),
		songArtist: document.getElementById('song-artist'),
		positionSlider: document.getElementById('position-slider'),
		songAlbum: document.getElementById('song-album'),
		playPauseBtn: document.getElementById('playpause-btn'),
		rating: {
			like: document.getElementById('like-btn'),
			neutral: document.getElementById('neutral-btn'),
			ban: document.getElementById('ban-btn'),
		},
		player: {
			select: document.getElementById('players'),
			players: {},
			enable: document.getElementById('enable-player'),
			label: document.getElementById('player-label'),
		},
	}

	pull(pull.seaport(ports, 'devious-boxes:player'), pull.drain(function(d) {
		var meta = d[1]
		var id = JSON.stringify([meta.host, meta.port])
		var label = meta.label || meta.host + ':' + meta.port
		if(d[0] == 'add') {
			var el = document.createElement('option')
			el.textContent = label
			el.value = id
			E.player.players[id] = el
			E.player.select.appendChild(el)
		} else if(d[0] == 'del') {
			var el = E.player.players[id]
			if(el)
				el.parentNode.removeChild(el)
			delete E.player.players[id]
		}
		console.log(d)
	}))

	// var controls// = PlayerControls(player, E)

	bean.on(E.player.enable, 'change', function() {
		if(this.checked) {
			E.player.label.readOnly = true
			player = Player(E.player.label.value)
			// controls = PlayerControls(player, E)
		} else {
			E.player.label.readOnly = false
			player.stop()
			player = null
			// controls = null
		}
	})

	window.bean = bean
	window.ports = ports
	window.co = co
	window.E = E
	yield Promise.resolve()
}))
