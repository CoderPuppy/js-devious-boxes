var pull = require('./util/pull')
var proxy = require('./util/net-proxy')
var ports = require('seaport').connect(process.env.SEAPORT || 9090)
var server = require('http').createServer(require('ecstatic')({ root: __dirname + '/public' }))
var engine = require('engine.io-stream/server')(function(s) {
	pull(pull.from.source(s), proxy(ports), pull.from.sink(s))
})
engine.attach(server, '/engine.io')
server.listen(ports.register('devious-boxes:web', { port: parseInt(process.env.PORT || process.env.npm_package_config_port) }), function() {
	console.log('[web] Listening on http://127.0.0.1:%s/', server.address().port)
})

var co = require('co')
var URL = require('url')
var crypto = require('crypto')
var jsonBody = require('body/json')
require('http').createServer(co.wrap(function*(req, res) {
	var url = URL.parse(req.url, true)
	var parts = url.pathname.split('/').filter(function(v) { return v.length > 0 })
	switch(parts[0]) {
	case 'cipher':
		if(url.query.iv)
			req.pipe(crypto.createCipheriv(parts[1], new Buffer(url.query.key, 'hex'), new Buffer(url.query.iv, 'hex'))).pipe(res)
		else
			req.pipe(crypto.createCipher(parts[1], new Buffer(url.query.password, 'hex'))).pipe(res)
		break

	case 'decipher':
		if(url.query.iv)
			req.pipe(crypto.createDecipheriv(parts[1], new Buffer(url.query.key, 'hex'), new Buffer(url.query.iv, 'hex'))).pipe(res)
		else
			req.pipe(crypto.createDecipher(parts[1], new Buffer(url.query.password, 'hex'))).pipe(res)
		break

	case 'hash':
		req.pipe(crypto.createHash(parts[1])).pipe(res)
		break

	default:
		res.writeHead(404)
		res.end('unknown operation: %s', url.pathname)
	}
})).listen(ports.register('devious-boxes:crypto'), function() {
	console.log('[crypto] Listening on http://127.0.0.1:%s/', this.address().port)
})
