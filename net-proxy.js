var MuxDemux = require('mux-demux')
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
		var mx = MuxDemux(function(s) {
			if(!s.meta) return
			switch(s.meta.type) {
			case 'client':
				pull(
					pull.from.source(s),
					bufser.input(),
					interface.request(s.meta),
					bufser.output(),
					pull.from.sink(s)
				)
				break

			case 'server':
				throw new Error('todo')
				break
			}
		})

		return pull.from.duplex(mx)
	})()

	var tcpStream = (function() {
		var mx = MuxDemux(Promise.coroutine(function*(s) {
			if(!s.meta) return
			switch(s.meta.type) {
			case 'client':
				pull(
					pull.from.source(s),
					bufser.input(),
					interface.tcp.client(s.meta.host, s.meta.port, s.meta.tls),
					bufser.output(),
					pull.from.sink(s)
				)
				break

			case 'server':
				pull(
					pull.from.source(s),
					yield tcpServer(s.meta),
					pull.from.sink(s)
				)
				break
			}
		}))

		tcpServer = Promise.coroutine(function*(meta) {
			debug('starting server', meta)
			var mx = MuxDemux()

			function handle(s) {
				pull(
					s,
					bufser.output(),
					pull.from.duplex(mx.createStream({
						type: 'client',
						local: s.local,
						remote: s.remote,
					})),
					bufser.input(),
					s
				)
			}

			var server = interface.tcp.server(meta.listen, meta.tls || false, handle)
			yield server.start()
			debug('server started', server.service || server.address(), meta)

			var signal
			process.nextTick(function() {
				signal = mx.createStream({ type: 'signal', service: server.service })
			})

			var stopped = false
			function stop() {
				if(stopped) return
				stopped = true
				debug('stopping server', server.service || server.address())
				server.stop()
				if(server.service)
					interface.ports.free(server.service)
			}

			mx.on('end', stop)
			mx.on('close', stop)

			return pull.from.duplex(mx)
		})

		return pull.from.duplex(mx)
	})()

	var cryptoStream = pull.from.duplex(MuxDemux(function(s) {
		pull(
			pull.from.source(s),
			bufser.input(),
			interface.crypto(s.meta.type, s.meta.algo, s.meta),
			bufser.output(),
			pull.from.sink(s)
		)
	}))

	var mx = MuxDemux(function(s) {
		switch(s.meta) {
		case 'http':
			pull(pull.from.source(s), httpStream, pull.from.sink(s))
			break

		case 'net':
			pull(pull.from.source(s), tcpStream, pull.from.sink(s))
			break

		case 'crypto':
			pull(pull.from.source(s), cryptoStream, pull.from.sink(s))
			break

		case 'seaport':
			s.pipe(interface.ports.createStream('remote')).pipe(s)
			break

			// TODO: tls, https?
		}
	})

	return pull.from.duplex(mx)
}
