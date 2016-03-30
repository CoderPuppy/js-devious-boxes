var pull = require('./pull')
var seaport = require('seaport')
var seaport_host = process.env.SEAPORT_HOST || process.env.npm_package_config_seaport_host || 'localhost'
var seaport_port = parseInt(process.env.SEAPORT_PORT || process.env.npm_package_config_seaport_port || 9090)
var ports = seaport.connect(seaport_host, seaport_port)

var net = require('net')
var tls = require('tls')
var crypto = require('crypto')
var hyperquest = require('hyperquest')

exports.crypto = function(type, algo, opts) {
	var stream = (function() {
		var iv = opts.iv
		console.log(iv)
		// if(opts.iv) console.log(opts.iv.type == 'Buffer', new Buffer(opts.iv.data))
		if(iv && iv.type == 'Buffer') iv = new Buffer(iv.data)
		console.log(iv)
		var key = opts.key
		if(key && key.type == 'Buffer') key = new Buffer(key.data)
		console.log('type = [%j], algo = [%j], iv = [%j], key = [%j], opts = [%j]', type, algo, iv, key, opts)

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
							cb(null, cipher.final())
							end_ = true
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
							cb(null, cipher.final())
							end_ = true
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
	return pull(
		pull.map(function(d) {
			console.log('in', new Buffer(d))
			console.log('in: [%s]', d.toString())
			return d
		}),
		stream,
		pull.map(function(d) {
			console.log('out', new Buffer(d))
			console.log('out: [%s]', d.toString())
			return d
		})
	)
}

var url = require('url')
function request(uri, opts) {
	if(typeof(uri) == 'object') opts = uri, uri = undefined
	if(!opts) opts = {}
	if(uri != null) opts.uri = uri
	// if(typeof(opts.uri) == 'string') opts.uri = url.parse(opts.uri, true)
		
	console.log(uri, opts)

	var s = pull.from.duplex(hyperquest(opts))

	return s
	// return {
	// 	sink: pull(pull.map(function(d) {
	// 		console.log('b → h', d)
	// 		return d
	// 	}), s.sink),
	// 	source: pull(s.source, pull.map(function(d) {
	// 		console.log('h → b', d)
	// 		return d
	// 	}))
	// }
}
exports.request = request

var tcp = exports.tcp = {}
tcp.client = function(host, port, isTLS) {
	return pull(
		pull.from.duplex(
			(!!isTLS ? tls : net).connect({ host: host, port: port })
		),
		pull.map(function(d) {
			return String.fromCharCode.apply(String, d.data)
		})
	)
}
tcp.server = function(port, seaport, isTLS, cb) {
	if(typeof(seaport) != 'string' && typeof(seaport) != 'object') {
		cb = isTLS, isTLS = seaport, seaport = undefined
	}
	if(typeof(isTLS) != 'boolean') {
		cb = isTLS, isTLS = undefined
	}
	if(typeof(port) == 'string' || typeof(port) == 'object') {
		cb = isTLS, isTLS = seaport, seaport = port, port = undefined
	}

	var server = (isTLS ? tls : net).createServer(function(s) {
		cb({
			sink: pull.from.sink(s),
			source: pull(pull.from.source(s), pull.map(function(d) {
				return String.fromCharCode.apply(String, d.data)
			})),
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

	if(listen.role)
		server.listen(ports.register(listen))
	else
		server.listen(listen)

	return function() {
		server.close()
	}
}

exports.ports = ports
