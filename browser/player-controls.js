var pull = require('../util/pull')
var bean = require('../util/bean')

function PlayerControls(player, E) {
	var self = this
	self.player = player
	self.E = E

	self.bean = bean.ctx()
	self.pullPause = pull.pausable()
	self.pullPause.pause()

	pull(self.player.on('time'), self.pullPause, pull.drain(function(msg) {
		self.E.positionSlider.value = msg[1]
	}))
	self.bean.on(document.getElementById('skip-btn'), 'click', function() {
		co(function*() {
			yield self.player.next()
		}).catch(function(e) { console.error(e.stack) })
	})
	self.bean.on(document.getElementById('volume-slider'), 'change', function() {
		self.player.volume(this.valueAsNumber / 100)
	})
	self.bean.on(self.E.positionSlider, 'change', function() {
		self.player.seek(this.valueAsNumber)
	})

	self.bean.on(self.E.playPauseBtn, 'click', function() {
		var self = this
		co(function*() {
			if(self.textContent == 'Play') yield self.player.resume()
			else if(self.textContent == 'Pause') yield self.player.pause()
			else throw new Error('bad: ' + self.textContent)
		}).catch(function(e) { console.error(e.stack) })
	})
	pull(self.player.on('resume'), self.pullPause, pull.drain(function(msg) {
		self.E.playPauseBtn.textContent = 'Pause'
	}))
	pull(self.player.on('pause'), self.pullPause, pull.drain(function(msg) {
		self.E.playPauseBtn.textContent = 'Play'
	}))

	pull(self.player.on('song'), self.pullPause, pull.drain(function(msg) {
		var song = msg[1]
		console.log(song.songName, song)
		self.E.albumArt.src = song.albumArtUrl
		self.E.songName.textContent = song.songName
		self.E.songArtist.textContent = song.artistName
		self.E.songAlbum.textContent = song.albumName
		if(song.songRating > 0) self.E.rating.like.checked = true
		else if(song.songRating == 0) self.E.rating.neutral.checked = true
		else if(song.songRating < 0) self.E.rating.ban.checked = true
	}))

	self.bean.on(self.E.rating.like,    'change', function() { if(this.checked) co(function*() { yield self.player.rate( 1) }).catch(function(e) { console.error(e.stack) }) })
	self.bean.on(self.E.rating.neutral, 'change', function() { if(this.checked) co(function*() { yield self.player.rate( 0) }).catch(function(e) { console.error(e.stack) }) })
	self.bean.on(self.E.rating.ban,     'change', function() { if(this.checked) co(function*() { yield self.player.rate(-1) }).catch(function(e) { console.error(e.stack) }) })

	co(function*() {
		console.log(yield self.player.stations())
	}).catch(function(e) { console.error(e.stack) })

	pull(self.player.on('account:add'), self.pullPause, pull.drain(function(msg) {
		console.log('+account', msg)
		var account = msg[1]
		var el = self.E.mixer.accounts[account.id] = document.createElement('optgroup')
		el.label = account.id
		self.E.mixer.el.appendChild(el)
	}))
	pull(self.player.on('account:rm'), self.pullPause, pull.drain(function(msg) {
		console.log('-account', msg)
		var account = msg[1]
		var el = self.E.mixer.accounts[account.id]
		if(el && el.parentNode)
			el.parentNode.removeChild(el)
		delete self.E.mixer.accounts[account.id]
	}))
	pull(self.player.on('station:add'), self.pullPause, pull.drain(function(msg) {
		console.log('+station', msg)
		var station = msg[1]
		var el = self.E.mixer.stations[station.id] = document.createElement('option')
		el.textContent = station.name
		el.value = station.id
		self.E.mixer.accounts[station.account.id].appendChild(el)
	}))
	pull(self.player.on('station:rm'), self.pullPause, pull.drain(function(msg) {
		console.log('-station', msg)
		var station = msg[1]
		var el = self.E.mixer.stations[station.id]
		if(el && el.parentNode)
			el.parentNode.removeChild(el)
		delete self.E.mixer.stations[station.id]
	}))
	self.bean.on(self.E.mixer.el, 'change', function() {
		self.player.mix([].slice.call(self.E.mixer.el.selectedOptions).map(function(o) { return o.value }))
	})
}

PlayerControls.prototype.enable = function() {
	this.bean.enable()
	this.pullPause.resume()
}
PlayerControls.prototype.disable = function() {
	this.bean.disable()
	this.pullPause.pause()
}

module.exports = PlayerControls
