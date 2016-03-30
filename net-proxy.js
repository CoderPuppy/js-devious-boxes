var MuxDemux = require('mux-demux')
var hyperquest = require('hyperquest')
var http = require('http')
var net = require('net')
var tls = require('tls')
var seaport = require('seaport')
var pull = require('./pull')
var bufser = require('./utils/buffer-serialization')

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
		var mx = MuxDemux(function(s) {
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
					tcpServer(s.meta),
					pull.from.sink(s)
				)
				break
			}
		})

		function tcpServer(meta) {
			var mx = MuxDemux()

			mx.on('end', function() {
				console.log('server closed')
			})

			function handle(s) {
				pull(
					s,
					bufser.input(),
					pull.from.duplex(mx.createStream({
						local: s.local,
						remote: s.remote,
					})),
					bufser.output(),
					s
				)
			}

			return pull.from.duplex(mx)
		}

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
			if(interface.ports) {
				s.pipe(interface.ports.createStream('remote')).pipe(s)
			} else {
				console.warn('seaport requested')
			}
			break

			// TODO: tls, https?
		}
	})

	return pull(
		pull.through(function(v) {
			this.queue(v)
		}, function(end) {
			this.queue(null)
			interface.ports.close()
		}),
		pull.from.duplex(mx)
	)
}
