var MuxDemux = require('mux-demux')
var xtend = require('xtend')
var pull = require('../pull')
var bufser = require('../utils/buffer-serialization.js')

var mx
var queue = []
require('reconnect-engine')(function(stream) {
	mx = MuxDemux()
	mx.http = MuxDemux()
	mx.http.pipe(mx.createStream('http')).pipe(mx.http)
	mx.tcp = MuxDemux()
	mx.tcp.pipe(mx.createStream('net')).pipe(mx.tcp)
	mx.crypto = MuxDemux()
	mx.crypto.pipe(mx.createStream('crypto')).pipe(mx.crypto)
	mx.pipe(stream).pipe(mx)
	queue.forEach(function(req) {
		req()
	})
	queue = []
	console.log('Connected')
}).on('disconnect', function() {
	mx = null
}).connect('/engine.io')

function run(job) {
	if(mx)
		job()
	else
		queue.push(job)
}
exports.run = run

exports.crypto = function cipher(type, algo, opts) {
	var stream = {
		sink: pull.defer.sink(),
		source: pull.defer.source(),
	}

	run(function() {
		var real = mx.crypto.createStream(xtend(opts, {
			type: type,
			algo: algo,
		}), {
			allowHalfOpen: true
		})

		stream.sink.resolve(pull(
			// pull.map(function(d) {
			// 	console.log('out', new Buffer(d))
			// 	return d
			// }),
			bufser.output(),
			// pull.map(function(d) {
			// 	console.log('out wire', d)
			// 	return d
			// }),
			pull.from.sink(real)
		))
		stream.source.resolve(pull(
			pull.from.source(real),
			// pull.map(function(d) {
			// 	console.log('in wire', d)
			// 	return d
			// }),
			bufser.input()
			// pull.map(function(d) {
			// 	console.log('in', new Buffer(d))
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
		var real = mx.http.createStream(xtend(opts, {
			type: 'client',
		}), {
			allowHalfOpen: true
		})
		stream.sink.resolve(pull(
			// pull.map(function(d) {
			// 	console.log('b → h', d)
			// 	return d
			// }),
			bufser.output(),
			pull.from.sink(real)
		))
		stream.source.resolve(pull(
			pull.from.source(real),
			bufser.input()
			// pull.map(function(d) {
			// 	console.log('h → b', d.toString())
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
		var real = mx.tcp.createStream({
			type: 'client',
			host: host,
			port: port,
			tls: !!tls,
		})
		stream.sink.resolve(pull(
			bufser.output(),
			pull.from.sink(real)
		))
		stream.source.resolve(pull(
			pull.from.source(real),
			bufser.input()
		))
	})

	return stream
}
tcp.server = function(port, seaport, cb) {
	if(typeof(seaport) == 'function') cb = seaport, seaport = undefined
	if(typeof(port) == 'string' || typeof(port) == 'object') {
		var t = seaport; seaport = port, port = t
	}
	var mxdx = MuxDemux(function(s) {
		cb({
			sink: pull(
				bufser.output(),
				pull.from.sink(real)
			),
			source: pull(
				pull.from.source(s),
				bufser.input()
			),
			local: s.meta.address,
			remote: s.meta.remote,
		})
	})

	run(function() {
		mxdx.pipe(mx.tcp.createStream({
			type: 'server',
			listen: xtend(seaport, {
				port: port || seaport.port,
				role: seaport.role || seaport,
			}),
		})).pipe(mxdx)
	})
	return function() {
		mxdx.end()
	}
}

var ports = exports.ports = exports.seaport = require('seaport')()
run(function() {
	var s = mx.createStream('seaport')
	s.pipe(ports.createStream()).pipe(s)
})
