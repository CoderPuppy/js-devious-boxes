var pull = require('./pull')
var proxy = require('./net-proxy')
var interface = require('./interface')
var debug = require('./debug').sub('server')
var msgpack = require('msgpack-lite')

var server = require('http').createServer(require('ecstatic')({ root: __dirname + '/public' }))
require('websocket-stream').createServer({ server: server}, function(s) {
	pull(
		pull.from.source(s),
		pull.map(msgpack.decode),
		pull.debug(debug.trace, 'b → s'),
		proxy(interface),
		pull.debug(debug.trace, 's → b'),
		pull.map(msgpack.encode),
		pull.from.sink(s)
	)
})
server.listen(interface.ports.register('devious-boxes:web', {
	port: parseInt(process.env.PORT || process.env.npm_package_config_port)
}), function() {
	debug('Listening on http://127.0.0.1:' + this.address().port + '/')
})
