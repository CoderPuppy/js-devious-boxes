var pull = require('../util/pull')
var xtend = require('xtend')
var MuxDemux = require('mux-demux')

var mx
var queue = []
require('reconnect-engine')(function(stream) {
	mx = MuxDemux()
	mx.http = MuxDemux()
	mx.http.pipe(mx.createStream('http')).pipe(mx.http)
	mx.tcp = MuxDemux()
	mx.tcp.pipe(mx.createStream('net')).pipe(mx.tcp)
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

var url = require('url')
function request(uri, opts) {
	if(typeof(uri) == 'object') opts = uri, uri = undefined
	if(!opts) opts = {}
	if(uri != null) opts.uri = uri
	// if(typeof(opts.uri) == 'string') opts.uri = url.parse(opts.uri, true)

	var stream = {
		sink: pull.defer.sink(),
		source: pull.defer.source(),
	}
		
	run(function() {
		console.log('job running', opts, mx)
		var real = mx.http.createStream(xtend(opts, {
			type: 'client',
		}), {
			allowHalfOpen: true
		})
		stream.sink.resolve(pull.from.sink(real))
		stream.source.resolve(pull(pull.from.source(real), pull.map(function(d) {
			console.log('<--', d)
			return String.fromCharCode.apply(String, d.data)
		})))
	})

	return stream
}

var tcp = {}
tcp.client = function(host, port, tls) {
	var stream = {
		sink: pull.defer.sink(),
		source: pull.defer.source(),
	}
		
	run(function() {
		console.log('job running %s:%s', host, port, mx)
		var real = mx.tcp.createStream({
			type: 'client',
			host: host,
			port: port,
			tls: !!tls,
		})
		stream.sink.resolve(pull.from.sink(real))
		stream.source.resolve(pull(pull.from.source(real), pull.map(function(d) {
			return String.fromCharCode.apply(String, d.data)
		})))
	})

	return stream
}
tcp.server = function(port, seaport, cb) {
	if(typeof(seaport) == 'function') cb = seaport, seaport = undefined
	if(typeof(port) == 'string' || typeof(port) == 'object') {
		var t = seaport; seaport = port, port = seaport
	}
	var mxdx = MuxDemux(function(s) {
		cb({
			sink: pull.from.sink(s),
			source: pull(pull.from.source(s), pull.map(function(d) {
				return String.fromCharCode.apply(String, d.data)
			})),
			local: s.meta.address,
			remote: s.meta.remote,
		})
	})

	run(function() {
		mxdx.pipe(mx.tcp.createStream({
			type: 'server',
			listen: xtend(seaport, {
				port: port || seaport.port,
				role: seaport,
			}),
		})).pipe(mxdx)
	})
}

var accounts = new Map()

var ports = require('seaport')()
ports.on('register', function(meta) {
	console.log(meta)
	if(meta.role == 'devious-boxes:account-provider') {
		var hosts = accounts.get(meta.account)
		if(!hosts) accounts.set(meta.account, hosts = new Set())
		hosts.add(JSON.stringify([meta.host, meta.port]))
		console.log(meta.account, hosts, accounts)
	}
}).on('free', function(meta) {
	console.log(meta)
	if(meta.role == 'devious-boxes:account-provider') {
		var hosts = accounts.get(meta.account)
		if(hosts)
			hosts.delete(JSON.stringify([meta.host, meta.port]))
		console.log(meta.account, hosts, accounts)
	}
})
var s = pull.from.duplex(ports.createStream())
pull(s, tcp.client('localhost', 9090), s)

var co = require('co')

co(function*() {
	var username = prompt('Username'), password = prompt('Password')
	var client = new (require('../client'))()
	client.request = request
	console.log('Partner login:', client.partner.username)
	yield* client.partnerLogin()
	console.log('Login as', username)
	yield* client.login(username, password)

	setInterval(function() {
		co(client.fetchStations.bind(client)).catch(function(e) {
			console.error(e.stack)
		})
	}, 60 * 1000)

	tcp.server({
		role: 'devious-boxes:account-provider', 
		account: username,
	}, function(s) {
		console.log('connection', s)
		var d = require('dnode')(require('../account-provider').publish(client))
		pull(s, pull.from.duplex(d), s)
	})
	server.listen(ports.register('devious-boxes:account-provider', { account: username }))
}).catch(function(e) {
	console.error(e.stack)
})
