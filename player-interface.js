var Promise = require('bluebird')
var pull = require('./pull')
var xtend = require('xtend')
var debug = require('./debug').sub('player-interface')

module.exports = function(player) {
	var self = {}

	pull.events(self)

	pull(
		player.on('source:add'),
		pull.map(function(e) {
			return ['source:add', self.source(e[1]).value()]
		}),
		self.emitter()
	)
	
	pull(
		player.on('station:add'),
		pull.map(function(e) {
			return ['station:add', self.station(e[1]).value()]
		}),
		self.emitter()
	)
	
	pull(
		player.on('host:add'),
		pull.map(function(e) {
			return ['host:add', self.host(e[1]).value()]
		}),
		self.emitter()
	)

	self.playing = player.playing

	self.station = function(id) {
		return Promise.resolve(player.stations[id].map(function(station) {
			return xtend(station, {
				host: station.host.id,
				source: station.host.source.id,
			})
		}))
	}

	self.stations = Promise.coroutine(function*() {
		var res = {}
		for(var id in player.stations) {
			res[id] = yield self.station(id)
		}
		return res
	})

	self.host = function(id) {
		var host = player.hosts[id]
		var res = xtend(host, {
			source: host.source.id,
		})
		res.stations = []
		for(var id in host.stations) {
			res.stations.push(id)
		}
		return Promise.resolve(res)
	}

	self.hosts = Promise.coroutine(function*() {
		var res = {}
		for(var id in player.hosts) {
			res[id] = yield self.host(id)
		}
		return res
	})

	self.source = function(id) {
		var source = player.sources[id]
		var res = xtend(source)
		res.stations = []
		for(var id in source.stations) {
			res.stations.push(id)
		}
		res.hosts = []
		for(var id in source.hosts) {
			res.hosts.push(id)
		}
		return Promise.resolve(res)
	}

	self.sources = Promise.coroutine(function*() {
		var res = {}
		for(var id in player.sources) {
			res[id] = yield self.source(id)
		}
		return res
	})

	return self
}
