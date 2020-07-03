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
pull.split = require('pull-split')

pull.seaport = (function() {
	var semver = require('semver')
	return function(ports, meta) {
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
	}
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

	self.emitter = function() {
		return pull.drain(function(msg) {
			self.emit.apply(self, msg)
		})
	}

	self.on = function(...pat) {
		function read(end, cb) {
			if(end) return cb(true)
			queue.push([pat, cb])
		}
		// read = pull.flow.serial()(read)
		read.pat = pat
		return read
	}

	return self
}

pull.debug = function(debug, ...args) {
	return pull.map(function(d) {
		debug.apply(null, args.concat([d]))
		return d
	})
}

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
		var ended
		var cbs = []

		var res = function(end, cb) {
			if(typeof(end) == 'function') {
				// if it's a sink this'll get called with `(read)`
				var read = end

				cbs.push(function() {
					read(ended, function() {})
				})

				stream(function(end, cb) {
					if(end) ended = end
					if(ended) return read(ended, cb)

					read(null, cb)
				})

				return res
			} else {
				// if it's a source this'll get called with `(end, cb)`
				var read = stream

				if(end) ended = end
				if(ended) return read(ended, cb)

				read(null, function(end, data) {
					if(end) ended = end

					cb(end, data)
				})
			}
		}
		res.kill = function() {
			if(ended) return
			debug.kill('setting kill')
			ended = true
			cbs.forEach(function(cb) { cb() })
		}
		return res
	}
}

pull.onEnd = function(onEnd) { return function(read) {
	var ended = false
	return function(end, cb) {
		return read(end, function(end, data) {
			if(end && !ended) ended = true, onEnd()
			cb(end, data)
		})
	}
} }

pull.join = function(srcs) {
	srcs = new Set(srcs.map(function(src, i) {
		return { read: src, i: i }
	}))

	const id = Math.floor(Math.random() * 1000)
	let pendingCB = null
	let nextI = srcs.size

	debug.join('create', id, srcs)

	function read(src) {
		if(src.reading) return;
		src.reading = true
		src.read(null, function(end, data) {
			src.reading = false
			if(end === true) {
				srcs.delete(src)
				if(srcs.size == 0 && pendingCB) pendingCB(end)
			} else if(end) {
				src.pendingErr = end
				if(pendingCB) pendingCB(end)
			} else {
				if(pendingCB) {
					const cb = pendingCB
					pendingCB = null
					cb(null, data)
				} else {
					src.pending = data
				}
			}
		})
	}

	let abortCB = null
	function doAbort(abort) {
		if(srcs.size == 0) {
			if(abortCB) abortCB(true)
			return
		}
		for(const src of srcs) {
			if(src.reading) continue;
			src.reading = true
			src.read(abort, function(end, data) {
				src.reading = false
				if(end) {
					srcs.delete(src)
					doAbort(abort)
				} else {
					throw new Error('TODO: bad')
				}
			})
		}
	}

	const res = function(abort, cb) {
		if(abort) {
			abortCB = cb
			doAbort(abort)
			return
		}

		if(srcs.size == 0) {
			cb(true)
			return
		}

		for(const src of srcs) {
			if(src.pendingErr) {
				cb(src.pendingErr)
				return
			}
			if(src.pending) {
				const data = src.pending
				src.pending = null
				cb(null, data)
				return
			}
		}

		pendingCB = cb
		for(const src of srcs) {
			read(src)
		}
	}

	res.add = function(src) {
		debug.join('add', id, nextI, src)
		src = {
			read: src,
			i: nextI,
		}
		srcs.add(src)
		nextI += 1
		if(pendingCB) read(src)
	}

	return res
}

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
			function(read) {
				var realEnd

				return function(end, cb) {
					end = end || s.aborted
					if(end) {
						read(end, function(end, data) {
							debug.mux('data after abort', end, data)
						})
						cb(end)
					} else if(realEnd) {
						cb(realEnd)
					} else {
						read(null, function(end, data) {
							if(end) {
								cb(null, [id, 'end', end])
								realEnd = end
							} else {
								cb(null, [id, 'data', data])
							}
						})
					}
				}
			}
		))

		s.input = pull.pushable(true)
		s.source = pull(
			s.input.source,
			function(read) {
				return function(abort, cb) {
					if(abort) {
						debug.mux(id, 'stream source closed:', abort)
						signal.push([id, 'abort', abort])
					}
					read(abort, cb)
				}
			}
		)

		return s
	}

	mx.sink = pull.drain(function(d) {
		var id = d[0]
		var op = d[1]
		var data = d[2]
		var s = streams[id]

		if(op == 'new') {
			debug.mux('got new stream', id, data)
			s = createStream(id, data)
			cb(s)
		} else if(s) {
			switch(op) {
			case 'data':
				s.input.push(data)
				break

			case 'end':
				s.input.end(data)
				break

			case 'abort':
				s.aborted = true
				break

			default:
				debug.mux('invalid operator:', op, d)
			}
		} else {
			debug.mux('no stream: ', id, d)
		}
	}, function(end) {
		debug.mux('end', end)
		for(var id in streams) {
			var stream = streams[id]
			stream.input.end()
			stream.output.source(true, function() {})
		}
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

pull.encode = function() {
	return pull.map(d => JSON.stringify(d) + '\n')
}

pull.decode = function() {
	return pull(
		pull.split('\n'),
		pull.filter(),
		pull.map(JSON.parse)
	)
}

module.exports = pull
