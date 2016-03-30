var pull = require('./pull')
var proxy = require('./net-proxy')
var seaport = require('seaport')
var seaport_host = process.env.SEAPORT_HOST || process.env.npm_package_config_seaport_host || 'localhost'
var seaport_port = parseInt(process.env.SEAPORT_PORT || process.env.npm_package_config_seaport_port || 9090)
var interface = require('./interface')
var xtend = require('xtend')

var server = require('http').createServer(require('ecstatic')({ root: __dirname + '/public' }))
var engine = require('engine.io-stream/server')(function(s) {
	pull(
		pull.from.source(s),
		proxy(xtend(interface, {
			ports: seaport.connect(seaport_host, seaport_port),
		})),
		pull.from.sink(s)
	)
})
engine.attach(server, '/engine.io')
server.listen(interface.ports.register('devious-boxes:web', {
	port: parseInt(process.env.PORT || process.env.npm_package_config_port)
}), function() {
	console.log('[web] Listening on http://127.0.0.1:%s/', this.address().port)
})
