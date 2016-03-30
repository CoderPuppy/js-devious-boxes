var Promise = require('bluebird')
var Client = require('../client')
var ClientInterface = require('../client-interface')
var interface = require('./interface')
var bean = require('bean')

var $ = document.querySelector.bind(document)

module.exports = Promise.coroutine(function*() {
	var E = {
		el: $('#account-provider'),
		form: $('form#account-provider'),
		email: $('#account-provider #email'),
		password: $('#account-provider #password'),
		stst: $('#account-provider #stst'),
	}

	var running = false

	var client, clientInterface, stop

	bean.on(E.form, 'submit', Promise.coroutine(function*(e) {
		e.stop()
		if(running) {
			E.stst.textContent = 'Start'
			E.el.classList.remove('running')
			running = false

			// stop()
		} else {
			E.stst.textContent = 'Stop'
			E.el.classList.add('running')
			E.password.value = ''
			running = true

			client = new Client(interface)
			window.client = client
			console.log('Partner Login:', client.partner.username)
			yield client.partnerLogin()
			console.log('Login as', username)
			yield client.login(E.email.value, E.password.value)
		}
	}))
})
