var match = require('./utils/match')
var utils = require('./utils')
var uuid = require('uuid')
var debug = require('./debug').sub('pull')
debug.kill = debug.sub('kill')
debug.mux = debug.sub('mux')
debug.join = debug.sub('join')

var pull = require('pull-stream')

pull.from = require('stream-to-pull-stream')
pull.to = require('pull-stream-to-stream')
pull.through = require('pull-through')
pull.defer = require('pull-defer')
pull.pushable = require('pull-pushable')
pull.many = require('pull-many')
pull.pair = require('pull-pair')
pull.delay = require('pull-delay')

pull.seaport = (function() {
	var semver = require('semver')
	return pull.Source(function(ports, meta) {
		// these are from seaport
		function fixMeta (meta, port) {
			if (!meta) return {};
			if (typeof meta === 'string') {
				if (typeof port === 'object') {
					port.role = meta;
					meta = port;
				}
				else meta = { role: meta };
			}
			if (typeof port === 'number') {
				meta.port = port;
			}
			if (/@/.test(meta.role)) {
				meta.version = meta.role.split('@')[1];
				meta.role = meta.role.split('@')[0];
			}
			return meta;
		}

		meta = fixMeta(meta)
		var mkeys = Object.keys(meta)

		function matches (row) {
			for (var i = 0; i < mkeys.length; i++) {
				var mkey = mkeys[i];
				if (mkey === 'version') {
					if (!semver.satisfies(row.version, meta.version)) {
						return false;
					}
				}
				else if (row[mkey] !== meta[mkey]) return false;
			}
			return true;
		}

		var out = pull.pushable()

		ports.on('register', function(s) {
			if(matches(s)) out.push(['add', s])
		})
		ports.on('free', function(s) {
			if(matches(s)) out.push(['del', s])
		})

		ports.query(meta).forEach(function(s) {
			out.push(['add', s])
		})

		return out
	})
})()

pull.events = function(self) {
	var queue = []

	self.emit = function() {
		var msg = []
		for(var i = 0; i < arguments.length; i++) msg[i] = arguments[i]
		var oldQueue = queue
		queue = []
		for(var i = 0; i < oldQueue.length; i++) {
			if(match(oldQueue[i][0], msg)) {
				oldQueue[i][1](null, msg)
			} else {
				queue.push(oldQueue[i])
			}
		}
		return self
	}

	self.emitter = pull.Sink(function(read) {
		return pull.drain(function(msg) {
			self.emit.apply(self, msg)
		})(read)
	})()

	self.on = pull.Source(function() {
		var pat = []
		for(var i = 0; i < arguments.length; i++) pat[i] = arguments[i]
		function read(end, cb) {
			if(end) return cb(true)
			queue.push([pat, cb])
		}
		// read = pull.flow.serial()(read)
		read.pat = pat
		return read
	})

	return self
}

pull.debug = pull.Through(function(read, debug) {
	var args = []
	for(var i = 2; i < arguments.length; i++) args[i - 2] = arguments[i]

	return pull.map(function(d) {
		debug.apply(null, args.concat([d]))
		return d
	})(read)
})

pull.kill = function(stream) {
	if(typeof(stream) == 'object') {
		var res = {
			sink: pull.kill(stream.sink),
			source: pull.kill(stream.source),
			kill: function() {
				res.sink.kill()
				res.source.kill()
			},
		}
		return res
	} else {
		var killed = false
		var cbs = []

		var res = function(end, cb) {
			if(typeof(end) == 'function') {
				// if it's a sink this'll get called with `(read)`
				var read = end
				cbs.push(function() {
					read(true, function() {})
				})
				stream(function(end, cb) {
					// pass it to `read` unless it's killed (and it's not already ending)
					if(!end && killed) {
						debug.kill('killing sink')
						read(true, cb)
						return
					}
					read(end, cb)
				})
				return res
			} else {
				// if it's a source this'll get called with `(end, cb)`
				// pass it to `stream` unless it's killed (and it's not already ending)
				var read = stream
				type = 'source'
				if(!end && killed) {
					debug.kill('killing source')
					read(true, cb)
					return
				}
				read(end, cb)
			}
		}
		res.kill = function() {
			if(killed) return
			debug.kill('setting kill')
			killed = true
			cbs.forEach(function(cb) { cb() })
		}
		return res
	}
}

pull.onEnd = pull.Through(function(read, onEnd) {
	var ended = false
	return function(end, cb) {
		return read(end, function(end, data) {
			if(end && !ended) ended = true, onEnd()
			cb(end, data)
		})
	}
})

pull.join = pull.Source(function(srcs) {
	srcs = srcs.map(function(src) {
		return { read: src }
	})

	var ended
	var cb_

	function doEnd(end) {
		debug.join('end', end)
		ended = end
		for(var src of srcs) {
			if(src.ended) continue
			src.ended = true
			src.read(end, function(end, data) {
				debug.join('got after end', end, data)
			})
		}
		if(cb_) {
			debug.join('calling cb_')
			var t = cb_
			cb_ = null
			t(end)
		}
	}

	function read(src) {
		debug.join('reading from source')
		src.read(null, function(end, data) {
			if(end === true) {
				utils.array.remove(srcs, src)
				debug.join('removing source')
				if(srcs.length == 0) {
					debug.join('no more sources')
					doEnd(true)
				}
				return
			}
			if(end) {
				debug.join('source ending', end)
				src.ended = true
				doEnd(end)
				return
			}

			debug.join('got data')

			if(cb_) {
				var t = cb_
				cb_ = null
				t(null, data)
				debug.join('done reading')
			} else {
				src.hasPacket = true
				src.packet = data
				debug.join('caching data')
			}
		})
	}

	var res = function(end, cb) {
		cb_ = cb
		if(end) return doEnd(end)
		if(ended) {
			debug.join('sending previous end')
			cb_ = null
			cb(ended)
			return
		}

		for(var src of srcs) {
			if(src.hasPacket) {
				debug.join('found cached data')
				var packet = src.packet
				src.hasPacket = false
				src.packet = null
				return cb(null, packet)
			}
		}
		debug.join('starting reading')
		srcs.forEach(read)
	}

	res.add = function(srcRead) {
		debug.join('adding source')
		var src = {
			read: srcRead,
		}
		srcs.push(src)
		if(cb_) {
			read(src)
		}
	}

	return res
})

pull.mux = function(cb) {
	cb = cb || function() {}

	var mx = {}

	var streams = {}

	var signal = pull.pushable()

	mx.source = pull.join([signal])

	function createStream(id, meta) {
		var s = {}
		s.id = id
		s.meta = meta
		streams[s.id] = s

		s.output = pull.pair()
		s.sink = s.output.sink
		mx.source.add(pull(
			s.output.source,
			pull.Through(function(read) {
				var ended

				return function(end, cb) {
					if(end && !ended) {
						ended = end
						read(end, function(end) {
							cb(null, [id, 'end', end])
						})
						return
					}
					if(ended) return read(ended, cb)

					read(null, function(end, data) {
						if(end && !ended) {
							cb(null, [id, 'end', end])
							ended = end
							return
						}
						cb(null, [id, 'data', data])
					})
				}
			})()
		))

		s.source = pull.pushable()

		return s
	}

	mx.sink = pull.drain(function(d) {
		var id = d[0]
		var op = d[1]
		var data = d[2]
		var s = streams[id]

		switch(op) {
		case 'new':
			s = createStream(id, data)
			cb(s)
			break

		case 'data':
			s.source.push(data)
			break

		case 'end':
			s.source.end()
			break

		default:
			debug.mux('invalid operator:', op)
		}

		debug.mux('d', d)
	}, function(end) {
		debug.mux('end', end)
	})

	mx.create = function(meta) {
		var id = uuid.v1()
		debug.mux('creating', meta, 'as', id)
		signal.push([id, 'new', meta])

		var s = createStream(id, meta)

		return s
	}

	return mx
}

module.exports = pull
