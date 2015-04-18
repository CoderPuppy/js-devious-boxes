var ports = require('seaport')()
var socket = require('net').connect({
	host: '127.0.0.1',
	port: 9090
})
var pull = require('./util/pull')
socket.on('connect', ports.emit.bind(ports, 'connect'))
var through = require('through2')
socket.pipe(through.obj(function(d, e, cb) {
	console.log('<-- %s', d)
		this.push(d)
		cb()
})).pipe(ports.createStream()).pipe(through.obj(function(d, e, cb) {
	console.log('--> %s', d)
		this.push(d)
		cb()
})).pipe(socket)
// pull(
// 	pull.from.source(socket),
// 	pull.map(function(d) {
// 		console.log('<--', d)
// 			return d
// 	}),
// 	pull.from.duplex(ports.createStream()),
// 	pull.map(function(d) {
// 		console.log('-->', d)
// 			return d
// 	}),
// 	pull.from.sink(socket)
// )
