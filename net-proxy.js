var MuxDemux = require('mux-demux')
var hyperquest = require('hyperquest')
var http = require('http')
var net = require('net')
var tls = require('tls')
var seaport = require('seaport')
var pull = require('./pull')

module.exports = function(interface) {
	var httpStream = (function() {
		var mx = MuxDemux(function(s) {
			if(!s.meta) return
			switch(s.meta.type) {
			case 'client':
				pull(
					pull.from.source(s),
					interface.request(s.meta),
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
				// again i'm just using streams 3 here because it's a very small isolated case
				// if i ever do anything more with this i'll use pull streams
				s.pipe((s.meta.tls ? tls : net).connect(s.meta).on('error', function(e) {
					s.end()
				})).pipe(s)
				break

			case 'server':
				pull(pull.from.source(s), tcpServer(s.meta), pull.from.sink(s))
				break
			}
		})

		return pull.from.duplex(mx)
	})()

	function tcpServer(meta) {
		var mx = MuxDemux()

		mx.on('end', function() {
			console.log('server closed')
		})

		function handle(s) {
			s.pipe(mx.createStream({
				address: s.address(),
				remote: {
					port: s.remotePort,
					family: s.remoteFamily,
					address: s.remoteAddress
				}
			})).pipe(s)
		}

		if(meta.tls)
			server = tls.createServer(meta, handle)
		else
			server = net.createServer(meta, handle)

		if(meta.listen.role && ports) {
			server.listen(ports.register(meta.listen))
		} else {
			if(meta.listen.role)
				console.warn('no seaport instance provided, but seaport registration requested')
			server.listen(meta.listen)
		}

		return pull(
			pull.Through(function(read) {
				return function(end, cb) {
					read(end, function(err, data) {
						if(err) console.log(err)
						cb(err, data)
					})
				}
			})(),
			pull.from.duplex(mx)
		)
	}

	var mx = MuxDemux(function(s) {
		switch(s.meta) {
		case 'http':
			pull(pull.from.source(s), httpStream, pull.from.sink(s))
			break

		case 'net':
			pull(pull.from.source(s), tcpStream, pull.from.sink(s))
			break

		case 'seaport':
			if(ports) {
				s.pipe(ports.createStream('remote')).pipe(s)
			} else {
				console.warn('seaport requested')
			}
			break

			// TODO: tls, https?
		}
	})

	return pull(
		// pull.Through(function(read) {
		// 	var reads = 0
		// 	return function(end, cb) {
		// 		reads++
		// 			// if(reads > 1) console.trace()
		// 			// console.trace()
		// 		// console.log('read', reads)
		// 		read(end, function(err, data) {
		// 			if(err) console.log('conn', err)
		// 			reads--
		// 			// console.log('done', reads)
		// 			cb(err, data)
		// 		})
		// 	}
		// })(),
		pull.through(function(v) {
			this.queue(v)
		}, function(end) {
			this.queue(null)
			ports.close()
		}),
		pull.from.duplex(mx)
	)
	// return pull.from.duplex(mx)
}
