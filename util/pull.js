var match = require('./match')

var pull = require('pull-stream')

pull.to = require('pull-stream-to-stream')
pull.from = require('stream-to-pull-stream')
pull.defer = require('pull-defer')
pull.pushable = require('pull-pushable')
// pull.flow = require('pull-flow')
pull.through = require('pull-through')
pull.tee = require('pull-tee')
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
pull.pausable = function() {
	var queue = []
	var paused = true
	function run(fn) {
		if(paused)
			queue.push(fn)
		else
			fn()
	}
	return function(read) {
		function _read(end, cb) {
			run(function() {
				read(end, function(err, data) {
					run(function() {
						cb(err, data)
					})
				})
			})
		}
		_read.pause = function() { paused = true }
		_read.resume = function() {
			paused = false
			queue.forEach(function(fn) { fn() })
		}
		_read.paused = function() { return paused }
		return _read
	}
}
pull.events = function(self) {
	var queue = []

	function matches(pat, msg) {
		return match(pat[0], msg[0]) && match(pat.slice(1), msg.slice(1))
	}

	self.emit = function() {
		var msg = []
		for(var i = 0; i < arguments.length; i++) msg[i] = arguments[i]
		var oldQueue = queue
		queue = []
		for(var i = 0; i < oldQueue.length; i++) {
			if(matches(oldQueue[i][0], msg)) {
				oldQueue[i][1](null, msg)
			} else {
				queue.push(oldQueue[i])
			}
		}
		return self
	}

	self.emitter = function(read) {
		return pull.drain(function(msg) {
			self.emit.apply(self, msg)
		})(read)
	}

	self.on = function() {
		var pat = []
		for(var i = 0; i < arguments.length; i++) pat[i] = arguments[i]
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

module.exports = pull
