var pull = require('./util/pull')
var dnode = require('dnode')
var Promise = require('bluebird')
var mixer = require('./mixer')
var utils = require('./util/s')
var net

function Player(ports, speaker, opts) {
	var self = this

	pull.events(self)
	self.mixer = mixer()
	self.accounts = new Map()
	self.stations = new Map()
	self.speaker = speaker
	self._paused = true

	if(typeof(opts) != 'object') opts = {}
	if(typeof(opts.connect) == 'function') this.connect = opts.connect

	function addStation(station) {
		var account = station.account, host = station.host
		var stations = self.stations.get(station.id)
		if(!stations) self.stations.set(station.id, stations = [])
		stations.push(station)
		stations.sort(function(a, b) {
			if( a.shared && !b.shared) return 1
			if(!a.shared &&  b.shared) return -1
			else return 0
		})
		var accountStations = account.stations.get(station.id)
		if(!accountStations) account.stations.set(station.id, accountStations = [])
		accountStations.push(station)
		host.stations.set(station.id, station)
		self.emit('station:add', station)
	}

	function rmStation(station) {
		var account = station.account, host = station.host
		var stations = self.stations.get(station.id)
		utils.array.remove(stations, station)
		utils.array.remove(account.stations.get(station.id), station)
		host.stations.delete(station.id)
		if(stations.length == 0) {
			self.mix(self.mix().filter(function(id) { return id != station.id }))
			self.emit('station:rm', station)
		}
	}

	pull(pull.seaport(ports, 'devious-boxes:account-provider'), pull.drain(function(d) {
		var op = d[0], meta = d[1]
		co(function*() {
			var hostId = JSON.stringify([ meta.host, meta.port ])
			if(op == 'add') {
				var account
				if(self.accounts.has(meta.account)) {
					account = self.accounts.get(meta.account)
				} else {
					self.accounts.set(meta.account, account = {
						hosts: new Map(),
						stations: new Map(),
						id: meta.account,
					})
					self.emit('account:add', account)
				}
				if(account.hosts.has(hostId)) throw new Error('incorrect state (readding host)')
				var host = {
					id: hostId,
					seaport: meta,
					account: account,
					stations: new Map(),
				}
				account.hosts.set(hostId, host)
				var d = dnode()
				var r = new Promise(function(resolve, reject) {
					d.on('remote', function(r) {
						resolve(r)
					})
				})
				pull(pull.from.source(d), self.connect(meta.host, meta.port), pull.from.sink(d))
				r = Promise.promisifyAll(yield r)
				host.remote = r
				self.emit('host:add', host)

				function* fetchStations() {
					var stations = yield r.stationsAsync()
					var current = new Set()
					utils.evalIter(host.stations.values()).map(function(s) {
						current[s.id] = s
						return s.id
					}).forEach(function(s) {
						current.add(s)
					})
					var new_ = new Set
					stations.map(function(s) {
						new_[s.id] = s
						s.account = account
						s.host = host
						return s.id
					}).forEach(function(s) {
						new_.add(s)
					})
					var added = utils.set.diff(new_, current)
					var removed = utils.set.diff(current, new_)
					for(var s of added) addStation(new_[s])
					for(var s of removed) rmStation(current[s])
					stations.forEach(function(station) {
						station.account = account
						station.host = host
						delete station.client
					})
				}
				yield fetchStations()
				if(host.stations.size == 0) {
					yield r.refreshStationsAsync()
					yield fetchStations()
				}
			} else if(op == 'del') {
				if(self.accounts.has(meta.account)) {
					var account = self.accounts.get(meta.account)
					var host = account.hosts.get(hostId)
					account.hosts.delete(hostId)
					var stations = []
					for(var s of host.stations.values()) {
						rmStation(s)
					}
					self.emit('host:rm', host)
					if(account.hosts.size == 0) {
						self.accounts.delete(meta.account)
						self.emit('account:rm', account)
					}
				}
			} else throw new Error('unknown: ' + op)
		}).catch(function(e) { console.error(e.stack) })
	}))

	pull(self.speaker.on('end'), pull.tee(self.emitter), pull.drain(function(msg) {
		co(function*() {
			self.current = null
			yield self.next()
			if(!self._paused) {
				yield self.resume()
			}
		}).catch(function(e) { console.error(e.stack) })
	}))

	pull(self.speaker.on('time'), self.emitter)
}

Player.prototype.mix = function(mix) {
	var self = this
	if(mix) {
		self.mixer.options = mix.map(function(station) {
			station = utils.id(station)
			function* pull() {
				var stationR = self.stations.get(station)
				if(!stationR) throw new Error('no station: ' + station)
				stationR = stationR[0]
				if(!stationR) throw new Error('no station: ' + station)
				return yield stationR.host.remote.pullAsync(station)
			}
			pull.station = station
			return pull
		})
	} else {
		return self.mixer.options.map(function(o) { return o.station })
	}
}

Player.prototype.connect = function(host, port) {
	if(!net) net = require('net')
	return pull.from.duplex(net.connect(port, host))
}

Player.prototype.rate = function*() {
	var station, song, rating
	for(var i = 0; i < arguments.length; i++) {
		var arg = arguments[i]
		if(typeof(arg) == 'number') rating = arg
		else if(utils.isSong(arg)) song = arg
		else if(utils.isStation(arg)) station = arg
		else throw new Error('invalid arg: ' + i)
	}
	station = utils.id(station) || this.current.stationId
	song = utils.id(song) || this.current.songIdentity
	var stations = this.stations.get(station)
	if(!stations || stations.length == 0) throw new Error('no host for station: ' + station)
	station = stations[0]
	yield station.host.remote.rateAsync(station.id, song, rating)
}

Player.prototype.next = function*() {
	var self = this
	var song = yield (self.mixer())()
	self.current = song
	self.speaker.load(song.audioUrlMap.lowQuality.audioUrl)
	self.emit('song', song)
}

function speakerPaused(speaker, paused) {
	if(paused) speaker.pause()
	else speaker.resume()
}

Player.prototype.resume = function*() {
	if(!this.current) yield this.next()
	this._paused = false
	speakerPaused(this.speaker, this._paused)
	this.emit('resume')
}

// this doesn't need to be a generator, but i want it to be consistent with resume
Player.prototype.pause = function*() {
	this._paused = true
	speakerPaused(this.speaker, this._paused)
	this.emit('pause')
}

Player.prototype.paused = function() { return this._paused }

// todo: seek, volume
;[].forEach(function(name) {
	Player.prototype[name] = function() { return this.speaker[name].apply(this, arguments) }
})

module.exports = Player
