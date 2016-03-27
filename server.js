var pull = require('./util/pull')
var proxy = require('./util/net-proxy')
var ports = require('seaport').connect(process.env.SEAPORT || 9090)
var server = require('http').createServer(require('ecstatic')({ root: __dirname + '/public' }))
var engine = require('engine.io-stream/server')(function(s) {
	console.log('conn')
	s.on('end', function() { console.log('conn end') }).on('close', function() { console.log('conn close') })
	pull(pull.from.source(s), proxy(ports), pull.from.sink(s))
})
engine.attach(server, '/engine.io')
server.listen(ports.register('devious-boxes:web', { port: parseInt(process.env.PORT || process.env.npm_package_config_port) }), function() {
	console.log('[web] Listening on http://127.0.0.1:%s/', server.address().port)
})
