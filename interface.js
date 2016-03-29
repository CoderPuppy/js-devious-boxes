var pull = require('./pull')
var seaport = require('seaport')
var seaport_host = process.env.SEAPORT_HOST || process.env.npm_package_config_seaport_host || 'localhost'
var seaport_port = parseInt(process.env.SEAPORT_PORT || process.env.npm_package_config_seaport_port || 9090)
var ports = seaport.connect(seaport_host, seaport_port)

exports.cipher = function(type, algo, opts) {
	console.log(type, algo, opts)
	switch(type) {
	case 'cipher':
		if(opts.iv)
			return pull.from.duplex(crypto.createCipheriv(algo, opts.key, opts.iv))
		else
			return pull.from.duplex(crypto.createCipher(algo, opts.key))

	case 'decipher':
		if(opts.iv)
			return pull.from.duplex(crypto.createDecipheriv(algo, opts.key, opts.iv))
		else
			return pull.from.duplex(crypto.createDecipher(algo, opts.password))

	case 'hash':
		return pull.from.duplex(crypto.createHash(algo))

	default: throw new Error('unknown op: ' + type)
	}
}

var url = require('url')
function request(uri, opts) {
	if(typeof(uri) == 'object') opts = uri, uri = undefined
	if(!opts) opts = {}
	if(uri != null) opts.uri = uri
	// if(typeof(opts.uri) == 'string') opts.uri = url.parse(opts.uri, true)

	return pull(
		pull.from.duplex(hyperquest(opts)),
		pull.map(function(d) {
			return String.fromCharCode.apply(String, d.data)
		})
	)
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
tcp.server = function(port, seaport, cb) {
	if(typeof(seaport) == 'function') cb = seaport, seaport = undefined
	if(typeof(port) == 'string' || typeof(port) == 'object') {
		var t = seaport; seaport = port, port = t
	}

	var server = net.createServer(function(s) {
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
