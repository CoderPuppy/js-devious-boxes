var hyperquest = require('hyperquest')
var http = require('http')
var net = require('net')
var tls = require('tls')
var seaport = require('seaport')
var pull = require('./pull')
var bufser = require('./utils/buffer-serialization')
var Promise = require('bluebird')
var debug = require('./debug').sub('net-proxy')

module.exports = function(interface) {
	var httpStream = (function() {
		var mx = pull.mux(function(s) {
			if(!s.meta) return
			switch(s.meta.type) {
			case 'client':
				pull(
					s,
					bufser.input(),
					interface.request(s.meta),
					bufser.output(),
					s
				)
				break

			case 'server':
				throw new Error('todo')
				break
			}
		})

		return mx
	})()

	var tcpStream = (function() {
		var mx = pull.mux(Promise.coroutine(function*(s) {
			if(!s.meta) return
			switch(s.meta.type) {
			case 'client':
				pull(
					s,
					bufser.input(),
					interface.tcp.client(s.meta.host, s.meta.port, s.meta.tls),
					bufser.output(),
					s
				)
				break

			case 'server':
				pull(
					s,
					yield tcpServer(s.meta),
					s
				)
				break
			}
		}))

		var tcpServer = Promise.coroutine(function*(meta) {
			debug('starting server', meta)
			var mx = pull.mux()

			function handle(s) {
				pull(
					s,
					bufser.output(),
					mx.create({
						type: 'client',
						local: s.local,
						remote: s.remote,
					}),
					bufser.input(),
					s
				)
			}

			var server = interface.tcp.server(meta.opts, handle)
			yield server.start()
			debug('server started', server.service || server.server.address(), meta)

			var signal
			process.nextTick(function() {
				signal = mx.create({ type: 'signal', service: server.service })
			})

			var stopped = false
			function stop() {
				if(stopped) return
				stopped = true
				debug('stopping server', server.service || server.server.address(), meta)
				server.stop()
				if(server.service)
					interface.ports.free(server.service)
			}

			return {
				sink: pull(
					pull.onEnd(stop),
					mx
				),
				source: pull(
					mx,
					pull.onEnd(stop)
				),
			}
		})

		return mx
	})()

	var cryptoStream = pull.mux(function(s) {
		pull(
			s,
			bufser.input(),
			interface.crypto(s.meta.type, s.meta.algo, s.meta),
			bufser.output(),
			s
		)
	})

	var mx = pull.mux(function(s) {
		debug('meta', s.meta)
		switch(s.meta) {
		case 'http':
			pull(s, httpStream, s)
			break

		case 'tcp':
			pull(s, tcpStream, s)
			break

		case 'crypto':
			pull(s, cryptoStream, s)
			break

		case 'seaport':
			pull(s, pull.from.duplex(interface.ports.createStream('remote')), s)
			break

			// TODO: tls, https?
		default:
			debug('unknown stream type:', s.meta)
		}
	})

	return mx
}
