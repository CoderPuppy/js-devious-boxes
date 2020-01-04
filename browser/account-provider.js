var Promise = require('bluebird')
var Client = require('../client')
var ClientInterface = require('../client-interface')
var interface = require('./interface')
var bean = require('bean')
var dnode = require('../dnode')
var debug = require('../debug').sub('ui', 'account-provider')
var msgpack = require('msgpack-lite')

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

	var client, service

	bean.on(E.form, 'submit', Promise.coroutine(function*(e) {
		e.stop()
		if(running) {
			E.stst.textContent = 'Start'
			E.el.classList.remove('running')
			running = false

			if(service) yield service.stop()
			client = null, service = null
		} else {
			var email = E.email.value, password = E.password.value

			E.stst.textContent = 'Stop'
			E.el.classList.add('running')
			E.password.value = ''
			running = true

			client = new Client(interface)
			window.client = client
			debug('partner login:', client.partner.username)
			yield client.partnerLogin()
			debug('logging in as', email)
			yield client.login(email, password)
			password = null
			debug('logged in as', email)
			var clientInterface = ClientInterface(client)
			service = interface.tcp.server({
				seaport: {
					role: 'devious-boxes:music-source',
					sourceId: 'pandora:' + email,
					name: 'Pandora: ' + email,
				},
			}, function(s) {
				var d = dnode(clientInterface)
				pull(
					s,
					pull.map(msgpack.decode),
					d,
					pull.map(msgpack.encode),
					s
				)
			})
			yield service.start()
			debug('serving', email)
		}
	}))
})
