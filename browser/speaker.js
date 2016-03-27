var bean = require('bean')
var pull = require('../util/pull')

module.exports = function() {
	var self = {}
	pull.events(self)
	self.el = document.createElement('audio')

	bean.on(self.el, 'loadedmetadata', function() {
		self.meta = {
			duration: this.duration,
		}
		self.emit('audio:meta', self.meta)
	})
	bean.on(self.el, 'timeupdate', function() {
		self.emit('time', this.currentTime)
	})
	bean.on(self.el, 'ended', function() {
		self.emit('end')
	})
	bean.on(self.el, 'error', function() {
		co(function*() {
			self.emit('end')
		}).catch(function(e) { console.error(e.stack) })
	})

	self.load = function(url) { self.el.src = url; self.el.load() }
	self.resume = function() { self.el.play() }
	self.pause = function() { self.el.pause() }
	self.paused = function() { return self.el.paused }

	return self
}
