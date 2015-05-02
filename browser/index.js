var pull = require('../util/pull')
var xtend = require('xtend')
var URL = require('url')
var dnode = require('dnode')
var bean = require('bean')
var co = require('co')
var Promise = require('bluebird')

var conn = require('./connection')
var request = conn.request
var tcp = conn.tcp
var ports = Promise.promisifyAll(conn.ports)

var accounts = new Map()
var hosts = new Map()
var mixer = require('../mixer')()
mixer.cache = new Map()
var player = new(require('../player'))(ports, require('./speaker'), {
	connect: tcp.client,
})
window.player = player

require('domready')(co.wrap(function*() {
	var player = document.getElementById('player')
	var stationsEl = document.getElementById('stations')
	var albumArtEl = document.getElementById('albumart')
	var songNameEl = document.getElementById('song-name')
	var songArtistEl = document.getElementById('song-artist')
	var positionSliderEl = document.getElementById('position-slider')
	var songAlbumEl = document.getElementById('song-album')
	var pullSong = co.wrap(function*() {
		if(mixer.stations.length == 0) {
			alert('Select a station')
			return
		}
		var song = yield mixer()
		var player = document.getElementById('player')
		console.log(song)
		player.src = song[2].audioUrlMap.lowQuality.audioUrl
		player.load()
		albumArtEl.src = song[2].albumArtUrl
		songNameEl.textContent = song[2].songName
		songArtistEl.textContent = song[2].artistName
		songAlbumEl.textContent = song[2].albumName
		player.play()
	})
	bean.on(player, 'ended', function() {
		console.log('song ended')
		pullSong()
	})
	bean.on(player, 'loadedmetadata', function() {
		console.log('duration', player.duration)
		positionSliderEl.max = player.duration
	})
	bean.on(player, 'timeupdate', function() {
		positionSliderEl.value = player.currentTime
	})
	bean.on(player, 'stalled', function() {
		console.log('stalled', arguments)
	})
	bean.on(document.getElementById('playpause-btn'), 'click', function() {
		if(player.src) {
			if(player.paused) {
				player.play()
				this.textContent = 'Pause'
			} else {
				player.pause()
				this.textContent = 'Play'
			}
		} else if(mixer.stations.length == 0) {
			alert('Select a station')
		} else {
			pullSong()
			this.textContent = 'Pause'
		}
	})
	bean.on(document.getElementById('skip-btn'), 'click', function() {
		pullSong()
	})
	bean.on(document.getElementById('volume-slider'), 'change', function() {
		player.volume = this.valueAsNumber / 100
		console.log('volume', player.volume)
	})
	bean.on(positionSliderEl, 'change', function() {
		player.currentTime = this.valueAsNumber
	})
	bean.on(stationsEl, 'change', function() {
		var stations = [].slice.call(stationsEl.selectedOptions)
			.map(function(o) {
				var key = o.value
				if(!mixer.cache.has(key)) {
					var pkey = JSON.parse(key)
					if(!hosts.has(pkey[0])) throw new Error('invalid host')
					var host = hosts.get(pkey[0])
					mixer.cache.set(key, [host.remote, pkey[1]])
				}
				return mixer.cache.get(key)
			})
		mixer.stations = stations
	})
	pull(pull.seaport(ports, 'devious-boxes:account-provider'), pull.drain(co.wrap(function*(d) {
		var op = d[0], meta = d[1]
		var hostId = JSON.stringify([meta.host, meta.port])
		if(op == 'add') {
			var account = accounts.get(meta.account)
			if(!account) {
				accounts.set(meta.account, account = {
					hosts: new Set(),
					stations: new Map(),
				})
				account.el = document.createElement('optgroup')
				account.el.label = meta.account
				stationsEl.appendChild(account.el)
			}
			account.hosts.add(hostId)
			var host = {
				hostname: meta.host,
				port: meta.port,
				account: account,
				stations: new Map(),
			}
			hosts.set(hostId, host)
			console.log(meta.account, account, accounts)
			var d = dnode()
			var r = new Promise(function(resolve, reject) {
				d.on('remote', function(r) {
					resolve(r)
				})
			})
			pull(pull.from.source(d), tcp.client(meta.host, meta.port), pull.from.sink(d))
			r = Promise.promisifyAll(yield r)
			host.remote = r
			var stations = yield r.stationsAsync()
			;(function() {
				var s = new Map()
				stations.forEach(function(station) {
					console.log(station.name, station)
					s.set(station.id, station.name)
					var el = document.createElement('option')
					el.textContent = station.name
					el.value = JSON.stringify([hostId, station.id])
					account.el.appendChild(el)
				})
				account.stations = s
			})()
		} else if(op == 'del') {
			if(meta.role == 'devious-boxes:account-provider') {
				var account = accounts.get(meta.account)
				if(account) {
					account.hosts.delete(hostId)
					if(account.hosts.size == 0) {
						accounts.delete(meta.account)
						account.el.parentNode.removeChild(account.el)
					}
				}
			}
		}
	})))

	window.mixer = mixer
	window.bean = bean
	window.ports = ports
	window.accounts = accounts
	window.hosts = hosts
	window.pullSong = pullSong
	window.co = co
	yield Promise.resolve()
}))
