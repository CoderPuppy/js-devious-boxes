var Promise = require('bluebird')
var pull = require('./pull')
var dnode = require('./dnode')
var utils = require('./utils')
var msgpack = require('msgpack-lite')

var debug = require('./debug').sub('player')
debug.stations = debug.sub('stations')

function goe(reg, id, def) {
	var obj = reg[id]
	if(!obj) obj = reg[id] = def
	return obj
}

function Player(interface) {
	var self = this

	pull.events(self)

	self.interface = interface
	self.sources = {}
	self.hosts = {}
	self.stations = {}

	function addStation(station) {
		var host = station.host, source = host.source
		var stations = goe(self.stations, station.id, [])
		var srcStations = goe(source.stations, station.id, [])

		stations.id = station.id
		stations.name = station.name
		srcStations.id = station.id
		srcStations.name = station.name

		host.stations[station.id] = station
		stations.push(station)
		srcStations.push(station)
		stations.sort(function(a, b) {
			if( a.shared && !b.shared) return 1
			if(!a.shared &&  b.shared) return -1
			else return 0
		})

		debug.stations('new station host', station)
		self.emit('station:host:add', host.id, station.id, station)
		if(stations.length == 1) {
			debug.stations('new station', station)
			self.emit('station:add', station.id, station)
		}
	}

	function rmStation(station) {
		var host = station.host, source = host.source
		var stations = self.stations[station.id]
		var srcStations = source.stations[station.id]

		utils.array.remove(stations, station)
		utils.array.remove(srcStations, station)
		delete host.stations[station.id]

		debug.stations('removing station host', station)
		self.emit('station:host:rm', host.id, station.id, station)

		if(srcStations.length == 0)
			delete source.stations[station.id]
		if(stations.length == 0) {
			delete self.stations[station.id]
			debug.stations('removing station', station)
			self.emit('station:rm', station.id, station)
		}
	}

	pull(pull.seaport(self.interface.ports, 'devious-boxes:music-source'), pull.drain(Promise.coroutine(function*(d) {
		debug(d)
		var meta = d[1]
		switch(d[0]) {
		case 'add':
			var newSource = false
			var source = self.sources[meta.sourceId]
			if(!source) {
				source = self.sources[meta.sourceId] = {
					id: meta.sourceId,
					name: meta.name,
					hosts: {},
					stations: {},
				}
				debug('new source', source)
				newSource = true
			}
			if(self.hosts[meta.id]) return debug('reregistering host:', meta)
			var host = self.hosts[meta.id] = {
				id: meta.id,
				meta: meta,
				source: source,
				stations: {},
			}
			source.hosts[meta.id] = host
			debug('new host', host)

			host.dnode = dnode()
			host.kill = pull.kill(host.dnode)
			pull(
				host.kill,
				pull.map(msgpack.encode),
				interface.tcp.client(meta.host, meta.port),
				pull.map(msgpack.decode),
				host.kill
			)

			debug('connecting to ' + meta.host + ':' + meta.port)

			host.remote = yield host.dnode.remote

			debug('connected', host.remote)

			var refreshStations = Promise.coroutine(function*() {
				debug('refreshing stations on', host.id, host.source.id)
				var stations = yield host.remote.stations()
				debug.stations('got stations from', host.id, host.source.id, stations)

				var current = new Set()
				for(var id in host.stations) {
					current.add(id)
					current[id] = host.stations[id]
				}

				var new_ = new Set()
				stations.forEach(function(station) {
					new_[station.id] = station
					new_.add(station.id)
					station.host = host
					delete station.client
				})

				var added = utils.set.diff(new_, current)
				var removed = utils.set.diff(current, new_)

				debug.stations('new stations on', host.id, host.source.id, added)
				debug.stations('removed stations on', host.id, host.source.id, removed)

				added.forEach(function(id) { addStation(new_[id]) })
				removed.forEach(function(id) { rmStation(current[id]) })

				host.stationRefreshTimerId = setTimeout(refreshStations, 60 * 1000)
			})

			self.emit('host:add', host.id, host)
			self.emit('source:add', source.id, source)

			yield refreshStations()
			break

		case 'del':
			var host = self.hosts[meta.id]
			if(!host) break
			delete self.hosts[host.id]
			var source = host.source
			delete source.hosts[host.id]

			debug('removing host', host)
			self.emit('host:rm', host.id, host)

			if(Object.keys(source.hosts).length == 0) {
				delete self.sources[source.id]
				debug('removing source', source)
				self.emit('source:rm', source.id, source)
			}

			for(var id in host.stations) {
				rmStation(host.stations[id])
			}

			host.kill.kill()

			break

		default:
			debug('invalid operator:', d[0], d)
		}
	})))

	self._playing = false
}

Player.prototype.stop = function() {
	var self = this
	for(var id in self.hosts) {
		var host = self.hosts[id]
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
