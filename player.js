var pull = require('./util/pull')
var dnode = require('dnode')
var Promise = require('bluebird')
var mixer = require('./mixer')
var utils = require('./util/s')
var co = require('co')
var MuxDemux = require('mux-demux')
var net

function Player(ports, speaker, opts) {
	var self = this

	pull.events(self)
	self.mixer = mixer()
	self.accounts = {}
	self.stations = {}
	self.speaker = speaker
	self._paused = true

	if(typeof(opts) != 'object') opts = {}
	if(typeof(opts.connect) == 'function') this.connect = opts.connect

	function addStation(station) {
		var account = station.account, host = station.host
		var stations = self.stations[station.id]
		if(!stations) self.stations[station.id] = stations = []
		stations.push(station)
		stations.sort(function(a, b) {
			if( a.shared && !b.shared) return 1
			if(!a.shared &&  b.shared) return -1
			else return 0
		})
		var accountStations = account.stations[station.id]
		if(!accountStations) account.stations[station.id] = accountStations = []
		accountStations.push(station)
		host.stations[station.id] = station
		self.emit('station:add', station)
	}

	function rmStation(station) {
		var account = station.account, host = station.host
		var stations = self.stations[station.id]
		utils.array.remove(stations, station)
		utils.array.remove(account.stations[station.id], station)
		delete host.stations[station.id]
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
				if(self.accounts[meta.account]) {
					account = self.accounts[meta.account]
				} else {
					self.accounts[meta.account] = account = {
						hosts: {},
						stations: {},
						id: meta.account,
					}
					self.emit('account:add', account)
				}
				if(account.hosts[hostId]) throw new Error('incorrect state (readding host)')
				var host = {
					id: hostId,
					seaport: meta,
					account: account,
					stations: {},
				}
				account.hosts[hostId] = host
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
					Object.keys(host.stations).forEach(function(id) {
						var s = host.stations[id]
						current[id] = s
						current.add(id)
					})
					var new_ = new Set
					stations.forEach(function(s) {
						new_[s.id] = s
						s.account = account
						s.host = host
						new_.add(s.id)
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
				if(self.accounts[meta.account]) {
					var account = self.accounts[meta.account]
					var host = account.hosts.get(hostId)
					delete account.hosts[hostId]
					var stations = []
					for(var s of host.stations.values()) {
						rmStation(s)
					}
					self.emit('host:rm', host)
					if(account.hosts.size == 0) {
						delete self.accounts[meta.account]
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

	pull(self.speaker.on(/time|audio:meta/), self.emitter)

	self.interface = {
		mix: function(mix, cb) {
			if(!Array.isArray(mix)) {
				return utils.cb(mix)(null, self.mix())
			} else {
				self.mix(mix)
				utils.cb(cb)(null)
			}
		},
		rate: function() {
			var station, song, rating, cb = utils.cb()
			for(var i = 0; i < arguments.length; i++) {
				var arg = arguments[i]
				if(typeof(arg) == 'number') rating = arg
				else if(utils.isSong(arg)) song = arg
				else if(utils.isStation(arg)) station = arg
				else if(typeof(arg) == 'function') cb = utils.cb(arg)
				else cb(new Error('invalid arg: ' + i))
			}
			co(function*() {
				yield self.rate(station, song, rating)
			}).then(function() {
				cb(null)
			}).catch(function(e) {
				cb(e)
			})
		},
		next: function(cb) {
			cb = utils.cb(cb)
			co(function*() {
				yield self.next()
			}).then(function() {
				cb(null)
			}).catch(function(e) {
				cb(e)
			})
		},
		resume: function(cb) {
			cb = utils.cb(cb)
			co(function*() {
				yield self.resume()
			}).then(function() {
				cb(null)
			}).catch(function(e) {
				cb(e)
			})
		},
		pause: function(cb) {
			cb = utils.cb(cb)
			co(function*() {
				yield self.pause()
			}).then(function() {
				cb(null)
			}).catch(function(e) {
				cb(e)
			})
		},
		paused: function(cb) {
			utils.cb(cb)(null, self.paused())
		},
		stations: function(cb) {
			cb = utils.cb(cb)
			co(function*() {
				var res = {}
				for(var id in self.stations) {
					res[id] = self.stations[id].map(function(station) {
						return {
							host: station.host.id,
							allowAddMusic: station.allowAddMusic,
							allowDelete: station.allowDelete,
							allowRename: station.allowRename,
							client: station.client,
							extended: station.extended,
							feedback: station.feedback,
							id: station.id,
							name: station.name,
							quickmix: station.quickmix,
							shared: station.shared,
						}
					})
				}
				return stations
			}).then(function(res) {
				cb(null, res)
			}).catch(function(e) {
				cb(e)
			})
		},
		hosts: function(cb) {
			cb = utils.cb(cb)
			co(function*() {
				var hosts = {}
				for(var id in self.hosts) {
					var host = self.hosts[id]
					hosts[id] = {
						id: host.id,
						account: {
							username: host.account.id,
							hosts: Object.keys(host.account.hosts).map(function(id) { return host.account.hosts[id] }),
						},
						stations: Object.keys(host.stations),
					}
				}
				return hosts
			}).then(function(res) {
				cb(null, res)
			}).catch(function(e) {
				cb(e)
			})
		},
	}
	// self.localInterface = self.localInterface()
	self.localInterface = {}
	for(var k in self.interface) {
		self.localInterface[k] = Promise.promisify(self.interface[k])
	}
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

// this is replaced with it's result when the player is created
Player.prototype.localInterface = function() {
	var self = this
	return {
		player: self,
		on: function() { return self.on.apply(self, arguments) },
		mix: co.wrap(function*() { return yield Promise.resolve(self.mix.apply(self, arguments)) }),
		rate:   co.wrap(function*() { return yield self.rate  .apply(self, arguments) }),
		next:   co.wrap(function*() { return yield self.next  .apply(self, arguments) }),
		resume: co.wrap(function*() { return yield self.resume.apply(self, arguments) }),
		pause:  co.wrap(function*() { return yield self.pause .apply(self, arguments) }),
		paused: co.wrap(function*() { return yield self.paused.apply(self, arguments) }),
	}
}

Player.prototype.stream = function() {
	var self = this

	var mx = MuxDemux(function(stream) {
		switch(stream.meta) {
			case 'dnode':
				stream.pipe(dnode(self.interface)).pipe(stream)
				break

			case 'events':
				pull(self.on(), pull.from.sink(stream))
				break
		}
	})

	return pull.from.duplex(mx)
}

Player.fromStream = Promise.promisify(co.wrap(function*(s) {
	var mx = MuxDemux()
	pull(s, pull.from.duplex(mx), s)
	var d = dnode()
	var remote = new Promise(function(resolve, reject) {
		d.on('remote', function(r) {
			resolve(r)
		})
	})
	d.pipe(mx.createStream('dnode')).pipe(d)
	remote = yield remote

	var res = {
		mix:    function() { return remote.mixAsync   .apply(remote, arguments) },
		rate:   function() { return remote.rateAsync  .apply(remote, arguments) },
		next:   function() { return remote.nextAsync  .apply(remote, arguments) },
		resume: function() { return remote.resumeAsync.apply(remote, arguments) },
		pause:  function() { return remote.pauseAsync .apply(remote, arguments) },
		paused: function() { return remote.pausedAsync.apply(remote, arguments) },
	}

	pull.events(res)
	pull(pull.from.source(mx.createStream('events')), res.emitter)

	return res
}))

module.exports = Player
