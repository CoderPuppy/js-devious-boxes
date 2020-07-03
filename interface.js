var pull = require('./pull')
var xtend = require('xtend')
var seaport = require('seaport')
var seaportHost = process.env.SEAPORT_HOST || process.env.npm_package_config_seaport_host || 'localhost'
var seaportPort = parseInt(process.env.SEAPORT_PORT || process.env.npm_package_config_seaport_port || 9090)
var ports = seaport.connect(seaportHost, seaportPort)
ports.host = seaportHost
ports.port = seaportPort
var debug = require('./debug').sub('interface')
debug.crypto = debug.sub('crypto')
debug.tcp = debug.sub('tcp')
debug.http = debug.sub('http')

var net = require('net')
var tls = require('tls')
var crypto = require('crypto')
var hyperquest = require('hyperquest')

exports.crypto = function(type, algo, opts) {
	var stream = (function() {
		var iv = opts.iv
		if(iv && iv.type == 'Buffer') iv = new Buffer(iv.data)
		var key = opts.key
		if(key && key.type == 'Buffer') key = new Buffer(key.data)
		debug.crypto('type =', type, 'algo =', algo, 'iv =', iv, 'key =', key, 'opts =', opts)

		switch(type) {
		case 'encipher':
			var cipher = iv ? crypto.createCipheriv(algo, key, iv) : crypto.createCipher(algo, key)
			return function(read) {
				var end_

				return function(end, cb) {
					if(end) return read(end, cb)
					if(end_) return cb(end_)

					read(null, function(end, data) {
						if(end) {
							end_ = true
							cb(null, cipher.final())
						} else {
							cb(null, cipher.update(data))
						}
					})
				}
			}

		case 'decipher':
			var cipher = iv ? crypto.createDecipheriv(algo, key, iv) : crypto.createDecipher(algo, key)
			return function(read) {
				var end_

				return function(end, cb) {
					if(end) return read(end, cb)
					if(end_) return cb(end_)

					read(null, function(end, data) {
						if(end) {
							end_ = true
							cb(null, cipher.final())
						} else {
							cb(null, cipher.update(data))
						}
					})
				}
			}

		case 'hash':
			var hash = crypto.createHash(algo)
			return function(read) {
				var end_
				return function(end, cb) {
					if(end) return read(end, cb)
					if(end_) return cb(end_)

					read(null, function(end, data) {
						if(end) {
							cb(null, hash.digest())
							end_ = end
						} else {
							hash.update(data)
						}
					})
				}
			}

		default: throw new Error('unknown op: ' + type)
		}
	})()
	return stream
	// return pull(
	// 	pull.map(function(d) {
	// 		debug.crypto('in =', new Buffer(d))
	// 		debug.crypto('in =', '[' + d.toString() + ']')
	// 		return d
	// 	}),
	// 	stream,
	// 	pull.map(function(d) {
	// 		debug.crypto('out =', new Buffer(d))
	// 		debug.crypto('out =', '[' + d.toString() + ']')
	// 		return d
	// 	})
	// )
}

var url = require('url')
function request(uri, opts) {
	if(typeof(uri) == 'object') opts = uri, uri = undefined
	if(!opts) opts = {}
	if(uri != null) opts.uri = uri
	// if(typeof(opts.uri) == 'string') opts.uri = url.parse(opts.uri, true)
		
	debug.http('uri =', uri, 'opts =', opts)

	var s = pull.from.duplex(hyperquest(opts))

	// return s
	return {
		sink: pull(pull.map(function(d) {
			debug.http('b → h', d)
			return d
		}), s.sink),
		source: pull(s.source, pull.map(function(d) {
			debug.http('h → b', d)
			return d
		}))
	}
}
exports.request = request

var tcp = exports.tcp = {}
tcp.client = function(host, port, isTLS) {
	var s = pull.from.duplex(
		(!!isTLS ? tls : net).connect({ host: host, port: port })
	)
	return s
}
tcp.server = function(opts, cb) {
	opts = xtend(opts)

	var server = (opts.tls ? tls : net).createServer(function(s) {
		cb({
			sink: pull.from.sink(s),
			source: pull.from.source(s),
			local: s.address(),
			remote: {
				port: s.remotePort,
				family: s.remoteFamily,
				address: s.remoteAddress
			},
		})
	})

	if(opts.seaport)
		opts.seaport = xtend(opts.seaport, {
			role: opts.seaport.role || opts.seaport,
		})

	var service

	var res = {}
	res.server = server

	var enabled = false

	server.on('listening', function() {
		var addr = server.address()
		debug.tcp('listening', opts, addr)
		if(opts.seaport)
			res.service = service = ports.registerMeta(xtend(opts.seaport, {
				port: addr.port,
			}))
	})

	server.on('close', function() {
		debug.tcp('closing', opts)
		if(service)
			ports.free(service)
		res.service = service = null
	})

	server.on('error', function(e) {
		console.error('TODO: TCP SERVER ERROR', e)
	})

	res.start = function() {
		return new Promise(function(resolve, reject) {
			if(opts.port)
				server.listen(opts.port)
			else
				server.listen()
			server.once('listening', resolve)
			server.once('error', reject)
		})
	}

	res.stop = function() {
		return new Promise(function(resolve, reject) {
			server.close(function(err) {
				if(err)
					reject(err)
				else
					resolve()
			})
		})
	}

	return res
}

exports.ports = ports
