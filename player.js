var pull = require('./util/pull')
var dnode = require('dnode')
var Promise = require('bluebird')
var net

function Player(ports, speaker, opts) {
	var self = this
	pull.events(self)
	if(typeof(opts) != 'object') opts = {}
	if(typeof(opts.connect) == 'function') this.connect = opts.connect
	self.accounts = new Map()
	self.stations = new Map()
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
				}
				console.log('add', host)
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
				var stations = yield r.stationsAsync()
				stations.forEach(function(station) {
					station.account = account
					station.host = host
					delete station.client
					var exists = self.stations.has(station.id)
					if(exists ? !station.shared && self.stations.get(station.id).shared : true) {
						var old = self.stations.get(station.id)
						self.stations.set(station.id, station)
						if(exists) {
							self.emit('station:update', station, old)
							self.emit('station:rm', old)
						}

						self.emit('station:add', station)
					}
				})
			} else if(op == 'del') {
				if(self.accounts.has(meta.account)) {
					var account = self.accounts.get(meta.account)
					var host = account.hosts.get(hostId)
					account.hosts.delete(hostId)
					self.emit('host:rm', host)
					if(account.get(meta.account).hosts.size == 0) {
						self.accounts.delete(meta.account)
						self.emit('account:rm', account)
					}
				}
			} else throw new Error('unknown: ' + op)
		}).catch(function(e) { console.error(e.stack) })
	}))
	self.speaker = speaker(self)
}

Player.prototype.connect = function(host, port) {
	if(!net) net = require('net')
	return pull.from.duplex(net.connect(port, host))
}

module.exports = Player
