var Promise = require('bluebird')
var pull = require('./pull')
var debug = require('./debug').sub('player')
var dnode = require('./dnode')
var events = require('./utils/events')
var utils = require('./utils')

function goe(reg, id, def) {
	var obj = reg[id]
	if(!obj) obj = reg[id] = def
	return obj
}

function Player(interface) {
	var self = this

	events(self)

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

		debug('new station host', station)
		self.emit('station:host:add', station)
		if(stations.length == 1) {
			debug('new station', station)
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

		debug('removing station host', station)
		self.emit('station:host:rm', station)

		if(srcStations.length == 0)
			delete self.srcStations[station.id]
		if(stations.length == 0) {
			delete self.stations[station.id]
			debug('removing station', station)
			self.emit('station:rm', station.id, station)
		}
	}

	pull(pull.seaport(self.interface.ports, 'devious-boxes:music-source'), pull.drain(Promise.coroutine(function*(d) {
		debug(d)
		var meta = d[1]
		switch(d[0]) {
		case 'add':
			var source = self.sources[meta.sourceId]
			if(!source) {
				source = self.sources[meta.sourceId] = {
					id: meta.sourceId,
					name: meta.name,
					hosts: {},
					stations: {},
				}
				debug('new source', source)
				self.emit('source:add', source)
			}
			if(self.hosts[meta.id]) return debug('reregistering host:', meta)
			var host = self.hosts[meta.id] = {
				id: meta.id,
				meta: meta,
				source: source,
				stations: {},
			}
			debug('new host', host)
			self.emit('host:add', host)

			host.dnode = dnode()
			pull(host.dnode, interface.tcp.client(meta.host, meta.port), host.dnode)

			debug('connecting to ' + meta.host + ':' + meta.port)

			host.remote = yield host.dnode.remote

			debug('connected', host.remote)

			var refreshStations = Promise.coroutine(function*() {
				debug('refreshing stations on', host.id, host.source.id)
				var stations = yield host.remote.stations()
				debug('got stations from', host.id, host.source.id, stations)

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

				debug('new stations on', host.id, host.source.id, added)
				debug('removed stations on', host.id, host.source.id, removed)

				added.forEach(function(id) { addStation(new_[id]) })
				removed.forEach(function(id) { rmStation(current[id]) })

				host.stationRefreshTimerId = setTimeout(refreshStations, 60 * 1000)
			})

			yield refreshStations()

			break

		case 'del':
			var host = self.hosts[meta.id]
			if(!host) break
			delete self.hosts[host.id]
			var source = host.source
			delete source.hosts[host.id]

			debug('removing host', host)
			self.emit('host:rm', host)

			if(Object.keys(source.hosts).length == 0) {
				delete self.sources[source.id]
				debug('removing source', source)
				self.emit('source:rm', source)
			}

			for(var id in host.stations) {
				rmStation(host.stations[id])
			}

			break

		default:
			debug('invalid operand:', d[0], d)
		}
	})))
}

module.exports = Player
