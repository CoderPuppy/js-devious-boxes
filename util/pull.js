var pull = require('pull-stream')

pull.to = require('pull-stream-to-stream')
pull.from = require('stream-to-pull-stream')
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
pull.pausable = function() {
pull.pausable = function() {
	var queue = []
	var paused = true
	function run(fn) {
		if(paused)
			queue.push(fn)
		else
			fn()
	}
	return pull.Through(function(read) {
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
		return _read
	})()
	var queue = []
	var paused = true
	function run(fn) {
		if(paused)
			queue.push(fn)
		else
			fn()
	}
	return pull.Through(function(read) {
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
	})()
}

module.exports = pull
