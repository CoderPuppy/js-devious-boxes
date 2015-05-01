var bluebird = require('bluebird')
var pull = require('./util/pull')
var hyperquest = require('hyperquest')
var crypto = require('crypto')
var util = require('util')
var Stream = require('stream')

function hexDecode(data) {
	return new Buffer(data, 'hex').binarySlice()
}

function time() {
	return Math.floor(Date.now() / 1000)
}

function Station(client, s) {
	this.client = client
	this.name = s.stationName
	this.token = s.stationToken
	this.id = s.stationId
	this.allowRename = s.allowRename
	this.allowAddMusic = s.allowAddMusic
	this.allowDelete = s.allowDelete
	this.shared = s.isShared
	this.quickmix = s.isQuickMix
}

Station.prototype.cache = function*(fetch) {
	return yield this.client.getCache(this, fetch)
}

Station.prototype.queue = function*(fetch) {
	return yield this.client.getQueue(this, fetch)
}

Station.prototype.pull = function*() {
	return yield this.client.pullSong(this)
}

function Client(partner) {
	if(!partner || typeof(partner) != 'object') partner = Client.partners.android
	this.partner = partner
	this.caches = {}
	this.places = {}
	this.stations = []
	this.request = function() {
		return pull.from.duplex(hyperquest.apply(null, arguments))
	}
	this.crypto = function(type, algo, opts) {
		console.log(type, algo, opts)
		switch(type) {
		case 'cipher':
			if(opts.iv)
				return pull.from.duplex(crypto.createCipheriv(algo, opts.key, opts.iv))
			else
				return pull.from.duplex(crypto.createCipher(algo, opts.key))

		case 'decipher':
			if(opts.iv)
				return pull.from.duplex(crypto.createDecipheriv(algo, opts.key, opts.iv))
			else
				return pull.from.duplex(crypto.createDecipher(algo, opts.password))

		case 'hash':
			return pull.from.duplex(crypto.createHash(algo))

		default: throw new Error('unknown op: ' + type)
		}
	}
}

var iv = new Buffer("")

Client.prototype.encrypt = function*(data) {
	// var self = this
	// return yield new Promise(function(resolve, reject) {
	// 	console.log(data.toString())
	// 	pull(pull.values([data.toString()]), self.crypto('cipher', 'bf-ecb', { key: self.partner.encryptPassword, iv: iv }), pull.collect(function(err, d) {
	// 		resolve(d.map(function(d) {
	// 			return new Buffer(d).toString('hex')
	// 		}).join(''))
	// 	}))
	// })
	var c = crypto.createCipheriv('bf-ecb', this.partner.encryptPassword, iv)
	return Buffer.concat([
		c.update(data),
		c.final()
	]).toString('hex')
}

Client.prototype.decrypt = function*(data) {
	// var self = this
	// console.log('decrypt', data.toString(), new Buffer(data, 'hex').toString())
	// data = new Buffer(data, 'hex')
	// return yield new Promise(function(resolve, reject) {
	// 	console.log(data.toString())
	// 	pull(pull.values([data.toString()]), self.crypto('decipher', 'bf-ecb', { key: self.partner.decryptPassword, iv: iv }), pull.collect(function(err, d) {
	// 		resolve(d.map(function(d) {
	// 			return d.toString()
	// 		}).join(''))
	// 	}))
	// })
	data = new Buffer(data, 'hex')
	var c = crypto.createDecipheriv('bf-ecb', this.partner.decryptPassword, iv)
	return Buffer.concat([
		c.update(data),
		c.final()
	]).toString('utf-8')
}

Client.prototype.partnerLogin = function*() {
	var t = time()
	var res = yield* this.call('auth.partnerLogin', {
		username: this.partner.username,
		password: this.partner.password,
		deviceModel: this.partner.deviceModel,
		version: this.partner.version,
	}, {
		encrypt: false,
		ssl: true,
	})
	console.log('syncTime', res.syncTime, (yield this.decrypt(res.syncTime)).toString())
	var syncTime = parseInt((yield this.decrypt(res.syncTime)).slice(4).toString())
	this.timeOffset = time() - syncTime
	this.partnerAuthToken = res.partnerAuthToken
	this.partnerID = res.partnerId
	this.partnered = true
}

Client.partners = {
	android: {
		url: 'tuner.pandora.com/services/json/',
		username: 'android',
		password: 'AC7IBG09A3DTSYM4R41UJWL07VLN8JI7',
		deviceModel: 'android-generic',
		encryptPassword: '6#26FRL$ZWD',
		decryptPassword: 'R=U!LH$O2B#',
		version: '5',
	}
}

Client.prototype.login = function*(username, password) {
	this.username = username
	this.userPassword = password
	var res = yield* this.call('auth.userLogin', {
		loginType: 'user',
		username: username,
		password: password,
		partnerAuthToken: this.partnerAuthToken,
		returnStationList: true,
	}, {
		ssl: true,
	})
	this.userID = res.userId
	this.userAuthToken = res.userAuthToken
	this.loggedIn = true
	this.loadStations(res.stationListResult.stations)
}

Client.prototype.fetchStations = function*() {
	var res = yield this.call('user.getStationList', {})
	this.loadStations(res.stations)
}

Client.prototype.loadStations = function(stations) {
	var self = this
	this.stations = stations.map(function(station) {
		return new Station(self, station)
	})
	this.stations.forEach(function(station) {
		self.stations[station.id] = station
	})
}

Client.prototype.getCache = function*(station) {
	if(station && station.id) station = station.id
	var place = this.places[station]
	var cache = this.caches[station]
	if(!cache || place == cache.length - 1) {
		this.places[station] = 0
		var res = yield this.call('station.getPlaylist', {
			stationToken: station,
		}, {
			ssl: true,
		})
		// console.log(res.items)
		return this.caches[station] = res.items//.filter(function(s) { return s.songName })
	}
	return cache
}

Client.prototype.getQueue = function*(station, fetch) {
	if(station && station.id) station = station.id
	var cache = yield this.getCache(station)
	if(typeof(this.places[station]) != 'number') this.places[station] = 0
	return cache.slice(this.places[station])
}

Client.prototype.pullSong = function*(station) {
	if(station && station.id) station = station.id
	var song = (yield this.getQueue(station))[0]
	if(!song) throw new Error('no song')
	this.places[station]++
	return song
}

Client.prototype.call = function*(method, data, opts) {
	var self = this

	if(!opts || typeof(opts) != 'object') opts = {}
	if(typeof(opts.encrypt) != 'boolean') opts.encrypt = true

	var url = 'http' + (opts.ssl ? 's' : '') + '://' + this.partner.url + '?method=' + encodeURIComponent(method)
	if(this.partnered) {
		url += '&partner_id=' + encodeURIComponent('' + this.partnerID)
		if(!this.loggedIn)
			url += '&auth_token=' + encodeURIComponent('' + this.partnerAuthToken)
		data.syncTime = time() + this.timeOffset
	}

	if(this.loggedIn) {
		data.userAuthToken = this.userAuthToken
		url += '&user_id=' + encodeURIComponent('' + this.userID)
		url += '&auth_token=' + encodeURIComponent('' + this.userAuthToken)
	}

	if(opts.log)
		console.log('sending', method, util.inspect(data, {colors:true,depth:null}), 'to', url)

	var origData = data

	data = JSON.stringify(data)
	if(opts.encrypt) {
		data = yield this.encrypt(data)
	}

	var req = this.request(url, {method: 'POST'})

	var res = yield new Promise(function(resolve, reject) {
		pull(
			pull.values([data]),
			req,
			pull.collect(function(err, data) {
				if(err)
					reject(err)
				else
					resolve(JSON.parse(data.join('')))
			})
		)
	})

	if(opts.log)
		console.log('got', util.inspect(res, {colors:true,depth:null}))

	if(res.stat != 'ok') {
		console.log('res.code', res.code, typeof(res.code))
		if(res.code == 1001) {
			console.log('logging back in')
			this.partnered = false
			this.loggedIn = false
			yield this.partnerLogin()
			yield this.login(this.username, this.userPassword)
			return yield this.call(method, origData, opts)
		}
		// console.log('pandora error:', res.code, origData)
		throw new Error('Pandora error: ' + res.code)
	}

	return res.result
}

exports = module.exports = Client
