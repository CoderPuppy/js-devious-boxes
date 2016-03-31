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
			return pull.Through(function(read) {
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
			})()

		case 'decipher':
			var cipher = iv ? crypto.createDecipheriv(algo, key, iv) : crypto.createDecipher(algo, key)
			return pull.Through(function(read) {
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
			})()

		case 'hash':
			var hash = crypto.createHash(algo)
			return pull.Through(function(read) {
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
			})()

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

	return s
	// return {
	// 	sink: pull(pull.map(function(d) {
	// 		debug.http('b → h', d)
	// 		return d
	// 	}), s.sink),
	// 	source: pull(s.source, pull.map(function(d) {
	// 		debug.http('h → b', d)
	// 		return d
	// 	}))
	// }
}
exports.request = request

var tcp = exports.tcp = {}
tcp.client = function(host, port, isTLS) {
	var s = pull.from.duplex(
		(!!isTLS ? tls : net).connect({ host: host, port: port })
	)
	return s
}
tcp.server = function(port, seaport, isTLS, cb) {
	if(typeof(port) == 'string' || typeof(port) == 'object') {
		cb = isTLS, isTLS = seaport, seaport = port, port = undefined
	}
	if(typeof(seaport) != 'string' && typeof(seaport) != 'object') {
		cb = isTLS, isTLS = seaport, seaport = undefined
	}
	if(typeof(isTLS) != 'boolean') {
		cb = isTLS, isTLS = undefined
	}

	var server = (isTLS ? tls : net).createServer(function(s) {
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

	var listen = xtend(seaport, {
		port: port || seaport.port,
		role: seaport.role || seaport,
	})

	var service

	var res = {}

	res.start = function() {
		return new Promise(function(resolve) {
			if(listen.role)
				server.listen((res.service = service = ports.registerMeta(listen)).port, resolve)
			else
				server.listen(listen, resolve)
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
			if(service)
				ports.free(service)
			res.service = service = null
		})
	}

	return res
}

exports.ports = ports
