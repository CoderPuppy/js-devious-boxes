var Promise = require('bluebird')
var bean = require('../utils/bean')
var interface = require('./interface')
var pull = require('../pull')
var dnode = require('../dnode')
var msgpack = require('msgpack-lite')
var debug = require('../debug').sub('ui', 'player-controls')

var $ = document.querySelector.bind(document)

module.exports = Promise.coroutine(function*() {
	var E = {
		pause: $('#player-controls #pause'),
		players: {
			el: $('#player-controls #players'),
			map: {},
		},
		mixer: {
			el: $('#player-controls #stations'),
			sources: {},
			stations: {},
		},
	}

	var controls

	var players = {}

	var player
	var updatePlayer = Promise.coroutine(function*() {
		var id = E.players.el.value

		if(player && id == player.id) return
		if(id == '') {
			debug('removing player', player)
			player = null
			return
		}

		var meta = players[id]

		if(!meta) return debug('invalid player id:', id)

		var player_ = {
			id: id,
			meta: meta,
		}

		debug('connecting to player', meta)

		player_.dnode = dnode()
		player_.kill = pull.kill(player_.dnode)

		pull(
			player_.kill,
			pull.map(msgpack.encode),
			interface.tcp.client(meta.host, meta.port),
			pull.map(msgpack.decode),
			player_.kill
		)

		player_.remote = yield player_.dnode.remote
		player = player_

		debug('connected to player', meta, player.remote)

		controls = new PlayerControls(E, player)
	})

	pull(pull.seaport(interface.ports, 'devious-boxes:player'), pull.drain(function(d) {
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
			updatePlayer()
			break

		case 'del':
			debug('removing player', meta)
			delete players[meta.id]
			E.players.el.removeChild(E.players.map[meta.id])
			delete E.players.map[meta.id]
			updatePlayer()

		default:
			debug('invalid operator:', d[0], d)
		}
	}))

	bean.on(E.players.el, 'change', updatePlayer)
})

function PlayerControls(E, player) {
	var self = this

	self.E = E
	self.bean = bean.ctx()
	self.player = player

	self.bean.on(E.pause, 'click', Promise.coroutine(function*() {
		this.textContent = '⥁'
		if(yield self.player.remote.playing()) {
			yield self.player.remote.playing(false)
			this.textContent = '||'
		} else {
			yield self.player.remote.playing(true)
			this.textContent = '▶'
		}
	}))

	function addSource(source) {
		debug('+source', source)
		if(self.E.mixer.sources[source.id]) return

		var el = document.createElement('optgroup')
		el.label = source.name
		self.E.mixer.sources[source.id] = el
		self.E.mixer.el.appendChild(el)
	}

	function addStation(station) {
		debug('+station', station)
		if(Array.isArray(station)) station = station[0]
		if(self.E.mixer.stations[station.id]) return
		if(!self.E.mixer.sources[station.source]) return debug('missing source for station', station)

		var el = document.createElement('option')
		el.value = station.id
		el.textContent = station.name
		self.E.mixer.stations[station.id] = el
		self.E.mixer.sources[station.source].appendChild(el)
	}

	pull(self.player.remote.on('source:add'), pull.drain(function(e) {
		addSource(e[2])
	}))
	pull(self.player.remote.on('station:add'), pull.drain(function(e) {
		addStation(e[2])
	}))

	Promise.coroutine(function*() {
		var sources = yield self.player.remote.sources()
		var stations = yield self.player.remote.stations()

		debug('got', sources, stations)

		for(var id in sources) {
			addSource(sources[id])
		}

		for(var id in stations) {
			addStation(stations[id])
		}
	})()

	self.bean.enable()
}

PlayerControls.prototype.close = function() {
	self.bean.disable()
}
