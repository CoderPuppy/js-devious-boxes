var xtend = require('xtend')
var pull = require('../pull')
var bufser = require('../utils/buffer-serialization.js')
var debug = require('../debug').sub('interface')
debug.crypto = debug.sub('crypto')
debug.tcp = debug.sub('tcp')
debug.http = debug.sub('http')

var mx
var queue = []
var services = new Set()
var re = require('reconnect-ws')()
re.on('connect', function(s) {
	debug('connected')
	exports.mx = mx = pull.mux()

	mx.http = pull.mux()
	pull(mx.http, mx.create('http'), mx.http)

	mx.tcp = pull.mux()
	pull(mx.tcp, mx.create('tcp'), mx.tcp)

	mx.crypto = pull.mux()
	pull(mx.crypto, mx.create('crypto'), mx.crypto)

	pull(
		mx,
		pull.debug(debug.trace, 'b → s'),
		pull.encode(),
		pull.debug(debug.trace, 'b → s [enc]'),
		pull.from.duplex(s),
		pull.debug(debug.trace, 's → b [enc]'),
		pull.decode(),
		pull.debug(debug.trace, 's → b'),
		mx
	)

	queue.forEach(function(req) {
		req()
	})
	queue = []
	services.forEach(function(service) {
		service._start()
	})
})
re.on('disconnect', function() {
	debug('disconnected')
	exports.mx = mx = null
	services.forEach(function(service) {
		service._stop()
	})
})
re.on('error', debug.bind(null, 'error'))
re.connect('ws://' + location.host)

exports.re = re
exports.mx = mx
exports.queue = queue
exports.services = services

function run(job) {
	if(mx)
		job()
	else
		queue.push(job)
}
exports.run = run

function service(start) {
	var service = {
		status: 'down',
		enabled: false,
		startCb: start,

		start: Promise.coroutine(function*() {
			service.enabled = true
			services.add(service)
			yield service._start()
		}),

		_start: Promise.coroutine(function*() {
			if(service.status != 'down') return
			if(!mx) return
			service.status = 'starting'
			service.stopCb = yield service.startCb()
			service.status = 'up'
		}),

		stop: Promise.coroutine(function*() {
			service.enabled = false
			services.delete(service)
			yield service._stop()
		}),

		_stop: Promise.coroutine(function*() {
			if(service.status != 'up') return
			service.status = 'stopping'
			yield service.stopCb()
			service.status = 'down'
			service.stopCb = null
		}),
	}
	services.add(service)
	return service
}
exports.service = service

exports.crypto = function cipher(type, algo, opts) {
	var stream = {
		sink: pull.defer.sink(),
		source: pull.defer.source(),
	}

	run(function() {
		var real = mx.crypto.create(xtend(opts, {
			type: type,
			algo: algo,
		}), {
			allowHalfOpen: true
		})

		stream.sink.resolve(pull(
			// pull.map(function(d) {
			// 	debug.crypto('out', new Buffer(d))
			// 	return d
			// }),
			bufser.output(),
			// pull.map(function(d) {
			// 	debug.crypto('out wire', d)
			// 	return d
			// }),
			real
		))
		stream.source.resolve(pull(
			real,
			// pull.map(function(d) {
			// 	debug.crypto('in wire', d)
			// 	return d
			// }),
			bufser.input()
			// pull.map(function(d) {
			// 	debug.crypto('in', new Buffer(d))
			// 	return d
			// })
		))
	})

	return stream
}

var url = require('url')
exports.request = function request(uri, opts) {
	if(typeof(uri) == 'object') opts = uri, uri = undefined
	if(!opts) opts = {}
	if(uri != null) opts.uri = uri
	// if(typeof(opts.uri) == 'string') opts.uri = url.parse(opts.uri, true)

	var stream = {
		sink: pull.defer.sink(),
		source: pull.defer.source(),
	}
		
	run(function() {
		var real = mx.http.create(xtend(opts, {
			type: 'client',
		}), {
			allowHalfOpen: true
		})
		stream.sink.resolve(pull(
			// pull.map(function(d) {
			// 	debug.http('b → h', d)
			// 	return d
			// }),
			bufser.output(),
			real
		))
		stream.source.resolve(pull(
			real,
			bufser.input()
			// pull.map(function(d) {
			// 	debug.http('h → b', d.toString())
			// 	return d
			// })
		))
	})

	return stream
}

var tcp = exports.tcp = {}
tcp.client = function(host, port, tls) {
	var stream = {
		sink: pull.defer.sink(),
		source: pull.defer.source(),
	}
		
	run(function() {
		var real = mx.tcp.create({
			type: 'client',
			host: host,
			port: port,
			tls: !!tls,
		})
		stream.sink.resolve(pull(
			bufser.output(),
			real
		))
		stream.source.resolve(pull(
			real,
			bufser.input()
		))
	})

	return stream
}
tcp.server = function(opts, cb) {
	var ser = service(Promise.coroutine(function*() {
		debug.tcp('starting server', opts)
		var mxdx
		var p = new Promise(function(resolve) {
			mxdx = pull.mux(function(s) {
				switch(s.meta.type) {
				case 'client':
					cb({
						sink: pull(
							bufser.output(),
							s
						),
						source: pull(
							s,
							bufser.input()
						),
						local: s.meta.local,
						remote: s.meta.remote,
					})
					break

				case 'signal':
					var data = s.meta
					ser.service = data.service
					
					resolve()
					break

				default:
					debug.tcp('unknown stream type:', s.meta.type)
				}
			})
		})


		var kill = pull.kill(mxdx)

		pull(
			kill,
			mx.tcp.create({
				type: 'server',
				opts: opts,
			}),
			kill
		)

		yield p
		debug.tcp('listening ' + ser.service.host + ':' + ser.service.port)
		
		return function() {
			debug.tcp('[connection] [tcp.server] stopping server ' + ser.service.host + ':' + ser.service.port)
			kill.kill()
			return Promise.resolve()
		}
	}))
	return ser
}

var ports = exports.ports = exports.seaport = require('seaport')()
run(function() {
	var s = mx.create('seaport')
	pull(
		s,
		pull.from.duplex(ports.createStream()),
		s
	)
})
