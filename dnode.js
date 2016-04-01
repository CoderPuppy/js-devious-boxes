var dnode = require('dnode')
var Promise = require('bluebird')
var pull = require('./pull')
var MuxDemux = require('mux-demux')
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
	var mx = MuxDemux(function(s) {
		switch(s.meta.type) {
		case 'dnode':
			debug('got dnode stream')
			s.pipe(d)
			break

		case 'events':
			debug('got events stream')
			if(exp && exp.on && exp.emitter) {
				pull(
					exp.on(),
					pull.debug(debug, 'events on'),
					pull.from.duplex(s),
					pull.debug(debug, 'events emit'),
					exp.emitter()
				)
			}
			break

		default:
			debug('invalid stream type:', s.meta)
		}
	})
	d.pipe(mx.createStream({ type: 'dnode' }))

	return {
		sink: pull.from.sink(mx),
		source: pull.from.source(mx),
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

					var stream = mx.createStream({ type: 'events' })
					pull(eventsPush, pull.from.duplex(stream), i.emitter())
				}

				r_.emit = function() {
					var msg = []
					for(var i = 0; i < arguments.length; i++) msg[i] = arguments[i]
					ensure()
					eventsPush.push(msg)
					return r_
				}

				r_.emitter = pull.Sink(function(read) {
					return pull.drain(function(msg) {
						eventsPush.push(msg)
					})(read)
				})()

				r_.on = pull.Source(function() {
					ensure()
					return i.on.apply(i, arguments)
				})

				resolve(r_)
			})
		}),
	}
}
