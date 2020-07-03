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
			return ['source:add', self.source(e[1].id).value()]
		}),
		self.emitter()
	)
	
	pull(
		player.on('station:add'),
		pull.map(function(e) {
			return ['station:add', self.station(e[1].id).value()]
		}),
		self.emitter()
	)
	
	pull(
		player.on('station:host:add'),
		pull.map(function(e) {
			return ['station:host:add', self.stationHost(e[1].host.id, e[1].station.id).value()]
		}),
		self.emitter()
	)
	
	pull(
		player.on('host:add'),
		pull.map(function(e) {
			return ['host:add', self.host(e[1].id).value()]
		}),
		self.emitter()
	)

	self.playing = player.playing

	self.station = function(id) {
		const station = player.stations.get(id)
		const res = xtend(station, {
			hosts: new Set(Array.from(station.hosts, stationHost => stationHost.host.id)),
		})
		return res
	}

	self.stations = Promise.coroutine(function*() {
		const res = new Map
		for(const [id, _] of player.stations) {
			res.set(id, yield self.station(id))
		}
		return res
	})

	self.stationHost = function(hostId, stationId) {
		const stationHost = player.hosts.get(hostId).stations.get(stationId)
		return Promise.resolve(xtend(stationHost, {
			station: stationHost.station.id,
			host: stationHost.host.id,
			source: stationHost.host.source.id,
		}))
	}

	self.stationHosts = Promise.coroutine(function*() {
		const res = new Set
		for(const [_, station] of player.stations) {
			for(const stationHost of station.hosts) {
				res.add(self.stationHost(stationHost.host.id, stationHost.station.id))
			}
		}
		return res
	})

	self.host = function(id) {
		const host = player.hosts.get(id)
		return Promise.resolve(xtend(host, {
			source: host.source.id,
			stations: new Set(Array.from(host.stations, kv => kv[0])),
		}))
	}

	self.hosts = Promise.coroutine(function*() {
		const res = new Map
		for(const [id, _] of player.hosts) {
			res.set(id, yield self.host(id))
		}
		return res
	})

	self.source = function(id) {
		const source = player.sources.get(id)
		return Promise.resolve(xtend(source, {
			stations: new Map(Array.from(source.stations, kv => [kv[0], kv[1].host.id])),
			hosts: new Set(Array.from(source.hosts, kv => kv[0])),
		}))
	}

	self.sources = Promise.coroutine(function*() {
		const res = new Map
		for(const [id, _] of player.sources) {
			res.set(id, yield self.source(id))
		}
		return res
	})

	return self
}
