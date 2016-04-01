var match = require('./utils/match')
var debug = require('./debug').sub('pull')
debug.kill = debug.sub('kill')
debug.mux = debug.sub('mux')

var pull = require('pull-stream')

pull.from = require('stream-to-pull-stream')
pull.to = require('pull-stream-to-stream')
pull.through = require('pull-through')
pull.defer = require('pull-defer')
pull.pushable = require('pull-pushable')

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

pull.debug = pull.Through(function(read, debug, msg) {
	return pull.map(function(d) {
		debug(msg, d)
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

		var res = function(end, cb) {
			if(typeof(end) == 'function') {
				// if it's a sink this'll get called with `(read)`
				var read = end
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
				if(!end && killed) {
					debug.kill('killing source')
					read(true, cb)
					return
				}
				read(end, cb)
			}
		}
		res.kill = function() {
			debug.kill('setting kill')
			killed = true
		}
		return res
	}
}

pull.mux = function() {
	var res = {}

	res.sink = pull.drain(function(d) {
		debug.mux('d', d)
	}, function(end) {
		debug.mux('end', end)
	})

	res.source = pull.many()

	return res
}

module.exports = pull
