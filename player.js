var Promise = require('bluebird')
var pull = require('./pull')
var dnode = require('./dnode')
var utils = require('./utils')

var debug = require('./debug').sub('player')
debug.stations = debug.sub('stations')

function goe(map, id, def) {
	let val = map.get(id)
	if(val === undefined) {
		val = def()
		map.set(id, val)
	}
	return val
}

function Player(interface) {
	var self = this

	pull.events(self)

	self.interface = interface
	self.sources = new Map
	self.hosts = new Map
	self.stations = new Map

	function addStationHost(host, remote) {
		const source = host.source
		const station = goe(self.stations, remote.id, () => ({
			id: remote.id,
			name: remote.name,
			hosts: new Set,
		}))
		const srcStations = goe(source.stations, station.id, () => new Set)
		const stationHost = {
			station: station,
			host: host,
			remote: remote,
		}

		host.stations.set(station.id, stationHost)
		station.hosts.add(stationHost)
		srcStations.add(stationHost)

		debug.stations('new station host', stationHost)
		self.emit('station:host:add', stationHost)
		if(station.hosts.size == 1) {
			debug.stations('new station', station)
			self.emit('station:add', station)
		}
	}

	function rmStationHost(stationHost) {
		const host = stationHost.host, source = host.source, station = stationHost.station
		debug.stations('removed station', host.id, host.source.id, station.id)
		const srcStations = source.stations.get(station.id)

		host.stations.delete(station.id)
		srcStations.delete(stationHost)
		if(srcStations.size == 0)
			source.stations.delete(station.id)
		station.hosts.remove(stationHost)

		self.emit('station:host:rm', stationHost)
		if(stations.size == 0) {
			self.stations.delete(station.id)
			debug.stations('removing station', station)
			self.emit('station:rm', station)
		}
	}

	pull(pull.seaport(self.interface.ports, 'devious-boxes:music-source'), pull.drain(Promise.coroutine(function*(d) {
		debug(d)
		var meta = d[1]
		switch(d[0]) {
		case 'add': {
			const source = goe(self.sources, meta.sourceId, () => {
				const source = {
					id: meta.sourceId,
					name: meta.name,
					hosts: new Map,
					stations: new Map,
				}
				debug('new source', source)
				return source
			})

			if(self.hosts.has(meta.id)) return debug('reregistering host:', meta)
			var host = {
				id: meta.id,
				meta: meta,
				source: source,
				stations: new Map,
			}
			self.hosts.set(host.id, host)
			source.hosts.set(host.id, host)
			debug('new host', host)

			host.dnode = dnode()
			host.kill = pull.kill(host.dnode)
			pull(
				host.kill,
				pull.encode(),
				interface.tcp.client(meta.host, meta.port),
				pull.decode(),
				host.kill
			)
			debug('connecting to ' + meta.host + ':' + meta.port)
			host.remote = yield host.dnode.remote
			debug('connected', host.remote)

			self.emit('host:add', host)
			self.emit('source:add', source)

			var refreshStations = Promise.coroutine(function*() {
				debug('refreshing stations on', host.id, host.source.id)
				var stations = yield host.remote.stations()
				debug.stations('got stations from', host.id, host.source.id, stations)

				var new_ = new Set()
				for(const station of stations) {
					new_.add(station.id)
					if(!host.stations.has(station.id)) {
						addStationHost(host, station)
					}
				}
				for(const [_, station] of host.stations) {
					if(!new_.has(station.id))
						rmStationHost(station)
				}

				host.stationRefreshTimerId = setTimeout(refreshStations, 60 * 1000)
			})
			yield refreshStations()

			break
		}

		case 'del': {
			const host = self.hosts.get(meta.id)
			if(!host) break
			self.hosts.delete(host.id)

			const source = host.source
			source.hosts.delete(host.id)

			debug('removing host', host)
			self.emit('host:rm', host)

			if(Object.keys(source.hosts).length == 0) {
				self.sources.delete(source.id)
				debug('removing source', source)
				self.emit('source:rm', source)
			}

			for(const [_, station] of host.stations) {
				rmStationHost(station)
			}

			host.kill.kill()

			break
		}

		default:
			debug('invalid operator:', d[0], d)
		}
	})))

	self._playing = false
}

Player.prototype.stop = function() {
	var self = this
	for(var id in self.hosts) {
		var host = self.hosts.get(id)
		host.kill.kill()
		if(host.stationRefreshTimerId)
			clearTimeout(host.stationRefreshTimerId)
	}
}

Player.prototype.playing = Promise.coroutine(function*(value) {
	switch(value) {
	case true:
		self._playing = true
		break

	case false:
		self._playing = false
		break

	case 'toggle':
		self._playing = !self._playing
		break
	}

	return self._playing
})

module.exports = Player
