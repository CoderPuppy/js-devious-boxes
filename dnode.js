var dnode = require('dnode')
var Promise = require('bluebird')
var pull = require('./pull')
var debug = require('./debug').sub('dnode')

var exports = module.exports = function(exp) {
	var export_ = {}
	if(exp) {
		Object.keys(exp).forEach(function(k) {
			var v = exp[k]
			if(typeof(v) != 'function') return export_[k] = v
			if(k == 'on' || k == 'emitter' || k == 'emit') return

			export_[k] = function() {
				var args = Array.from(arguments)
				v.apply(exp, args.slice(0, -1)).asCallback(args[args.length - 1])
			}
		})
	}
	var d = dnode(export_)
	var mx = pull.mux(function(s) {
		switch(s.meta.type) {
		case 'dnode':
			debug('got dnode stream')
			pull(s, pull.from.sink(d))
			break

		case 'events':
			debug('got events stream')
			if(exp && exp.on && exp.emitter) {
				pull(
					exp.on(),
					pull.debug(debug, 'events on'),
					s,
					pull.debug(debug, 'events emit'),
					exp.emitter()
				)
			}
			break

		default:
			debug('invalid stream type:', s.meta)
		}
	})
	pull(pull.from.source(d), mx.create({ type: 'dnode' }))

	return {
		sink: mx.sink,
		source: mx.source,
		remote: new Promise(function(resolve, reject) {
			d.on('remote', function(r) {
				var r_ = {}
				for(var k in r) {
					r_[k] = Promise.promisify(r[k])
				}

				var i = pull.events({})

				var eventsPush = pull.pushable()
				var connected = false
				function ensure() {
					if(connected) return
					connected = true

					debug('creating events stream')

					var stream = mx.create({ type: 'events' })
					pull(eventsPush, stream, i.emitter())
				}

				r_.emit = function() {
					var msg = []
					for(var i = 0; i < arguments.length; i++) msg[i] = arguments[i]
					ensure()
					eventsPush.push(msg)
					return r_
				}

				r_.emitter = function(read) {
					return pull.drain(function(msg) {
						eventsPush.push(msg)
					})(read)
				}

				r_.on = function() {
					ensure()
					return i.on.apply(i, arguments)
				}

				resolve(r_)
			})
		}),
	}
}
