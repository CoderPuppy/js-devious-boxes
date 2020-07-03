var Promise = require('bluebird')
var interface = require('./interface')
var bean = require('bean')
var dnode = require('../dnode')
var debug = require('../debug').sub('ui', 'test-provider')

var $ = document.querySelector.bind(document)

module.exports = Promise.coroutine(function*() {
	var E = {
		el: $('#test-provider'),
		form: $('form#test-provider'),
		name: $('#test-provider #name'),
		stst: $('#test-provider #stst'),
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
			var name = E.name.value

			E.stst.textContent = 'Stop'
			E.el.classList.add('running')
			running = true

			var stations = [
				{
					id: 'test:a',
					name: 'Test: a',
				},
			]
			var clientInterface = {
				stations: function(force) {
					debug('got request for stations')
					return Promise.resolve(stations)
				},
				station: function(k) {
					return Promise.resolve(stations[k])
				},
				cache: function(station, fetch) {
					return Promise.resolve([])
				},
				queue: function(station, fetch) {
					return Promise.resolve([])
				},
				place: function(station) {
					return Promise.resolve(0)
				},
				pull: function(station) {
					debug('pulling song, NOT IMPLEMENTED', station)
					return Promise.resolve({})
				},
				rate: function(station, song, rating) {
					debug('rating song', station, song, rating)
					return Promise.resolve({})
				}
			}
			debug('starting', name)
			service = interface.tcp.server({
				seaport: {
					role: 'devious-boxes:music-source',
					sourceId: 'test:' + name,
					name: 'Test: ' + name,
				},
			}, function(s) {
				var d = dnode(clientInterface)
				pull(
					s,
					pull.decode(),
					d,
					pull.encode(),
					s
				)
			})
			yield service.start()
			debug('serving', name)
		}
	}))
})
