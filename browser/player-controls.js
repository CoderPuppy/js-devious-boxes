var Promise = require('bluebird')
var bean = require('bean')

var $ = document.querySelector.bind(document)

module.exports = Promise.coroutine(function*() {
	var E = {
		pause: $('#player-controls #pause'),
	}
	var playing = false
	bean.on(pause, 'click', function() {
		if(playing) {
			playing = false
			this.textContent = '▶'
		} else {
			playing = true
			this.textContent = '||'
		}
	})
})
