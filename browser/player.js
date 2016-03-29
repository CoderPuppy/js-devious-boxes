var Promise = require('bluebird')
var bean = require('bean')

var $ = document.querySelector.bind(document)

module.exports = Promise.coroutine(function*() {
	var E = {
		el: $('#player'),
		form: $('form#player'),
		email: $('#player #name'),
		stst: $('#player #stst'),
	}

	var running = false

	bean.on(E.form, 'submit', function(e) {
		e.stop()
		if(running) {
			E.stst.textContent = 'Start'
			E.el.classList.remove('running')
			running = false
		} else {
			E.stst.textContent = 'Stop'
			E.el.classList.add('running')
			running = true
		}
	})
})
