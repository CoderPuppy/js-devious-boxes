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
var player = new(require('../player'))(ports, require('./speaker')(), {
	connect: tcp.client,
})
window.player = player

require('domready')(co.wrap(function*() {
	var E = {
		mixer: {
			el: document.getElementById('stations'),
			accounts: {},
			stations: {},
		},
		player: player.speaker.el,
		albumArt: document.getElementById('albumart'),
		songName: document.getElementById('song-name'),
		songArtist: document.getElementById('song-artist'),
		positionSlider: document.getElementById('position-slider'),
		songAlbum: document.getElementById('song-album'),
		playPauseBtn: document.getElementById('playpause-btn'),
		rating: {
			like: document.getElementById('like-btn'),
			neutral: document.getElementById('neutral-btn'),
			ban: document.getElementById('ban-btn'),
		},
	}
	document.body.appendChild(E.player)
	bean.on(E.player, 'loadedmetadata', function() {
		console.log('duration', this.duration)
		E.positionSlider.max = this.duration
	})
	pull(player.on('time'), pull.drain(function(msg) {
		E.positionSlider.value = msg[1]
	}))
	bean.on(E.player, 'stalled', function() {
		console.log('stalled', arguments)
	})
	bean.on(document.getElementById('skip-btn'), 'click', function() {
		co(function*() {
			yield player.next()
		}).catch(function(e) { console.error(e.stack) })
	})
	bean.on(document.getElementById('volume-slider'), 'change', function() {
		player.volume(this.valueAsNumber / 100)
	})
	bean.on(E.positionSlider, 'change', function() {
		player.seek(this.valueAsNumber)
	})

	bean.on(E.playPauseBtn, 'click', function() {
		var self = this
		co(function*() {
			if(self.textContent == 'Play') yield player.resume()
			else if(self.textContent == 'Pause') yield player.pause()
			else throw new Error('bad: ' + self.textContent)
		}).catch(function(e) { console.error(e.stack) })
	})
	pull(player.on('resume'), pull.drain(function(msg) {
		E.playPauseBtn.textContent = 'Pause'
	}))
	pull(player.on('pause'), pull.drain(function(msg) {
		E.playPauseBtn.textContent = 'Play'
	}))

	pull(player.on('song'), pull.drain(function(msg) {
		var song = msg[1]
		console.log(song.songName, song)
		E.albumArt.src = song.albumArtUrl
		E.songName.textContent = song.songName
		E.songArtist.textContent = song.artistName
		E.songAlbum.textContent = song.albumName
		if(song.songRating > 0) E.rating.like.checked = true
		else if(song.songRating == 0) E.rating.neutral.checked = true
		else if(song.songRating < 0) E.rating.ban.checked = true
	}))

	bean.on(E.rating.like,    'change', function() { if(this.checked) co(function*() { yield player.rate( 1) }).catch(function(e) { console.error(e.stack) }) })
	bean.on(E.rating.neutral, 'change', function() { if(this.checked) co(function*() { yield player.rate( 0) }).catch(function(e) { console.error(e.stack) }) })
	bean.on(E.rating.ban,     'change', function() { if(this.checked) co(function*() { yield player.rate(-1) }).catch(function(e) { console.error(e.stack) }) })

	pull(player.on('account:add'), pull.drain(function(msg) {
		var account = msg[1]
		var el = E.mixer.accounts[account.id] = document.createElement('optgroup')
		el.label = account.id
		E.mixer.el.appendChild(el)
	}))
	pull(player.on('account:rm'), pull.drain(function(msg) {
		var account = msg[1]
		var el = E.mixer.accounts[account.id]
		if(el && el.parentNode)
			el.parentNode.removeChild(el)
		delete E.mixer.accounts[account.id]
	}))
	pull(player.on('station:add'), pull.drain(function(msg) {
		var station = msg[1]
		var el = E.mixer.stations[station.id] = document.createElement('option')
		el.textContent = station.name
		el.value = station.id
		E.mixer.accounts[station.account.id].appendChild(el)
	}))
	pull(player.on('station:rm'), pull.drain(function(msg) {
		var station = msg[1]
		var el = E.mixer.stations[station.id]
		if(el && el.parentNode)
			el.parentNode.removeChild(el)
		delete E.mixer.stations[station.id]
	}))
	bean.on(E.mixer.el, 'change', function() {
		player.mix([].slice.call(E.mixer.el.selectedOptions) .map(function(o) { return o.value }))
	})

	window.mixer = mixer
	window.bean = bean
	window.ports = ports
	window.accounts = accounts
	window.hosts = hosts
	window.co = co
	yield Promise.resolve()
}))
