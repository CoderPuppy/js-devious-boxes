var bean = require('bean')

module.exports = function(controller) {
	var speaker = {}
	speaker.el = document.createElement('audio')

	bean.on(speaker.el, 'ended', function() {

	})

	speaker.load = function(url) { speaker.el.src = url; speaker.el.load() }
	speaker.resume = function() { speaker.el.play() }
	speaker.pause = function() { speaker.el.pause() }
	speaker.paused = function() { return speaker.el.paused }

	return speaker
}
