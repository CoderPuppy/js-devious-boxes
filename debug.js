var rc = require('./rc')

var cache = new Map
var explicits = new Set

function generate(rcl, explicit) {
	if(cache.has(rcl)) {
		debug = cache.get(rcl)
	} else {
		var log = console.log.bind(console, '[' + rcl.namespacePath.join('/') + ']')

		function debug(a1, a2) {
			var allowed = false
			var rcc = rcl
			var name
			while(rcc) {
				name = rcc.namespacePath.join('/')

				var part = (rcc('debug') || '').split(',').reverse().find(function(part) {
					if(!part) return false

					if(part[0] == '-') part = part.slice(1)

					for(var i = 0; i < part.length; i++) {
						if(part[i] != name[i] && (part[i] != '*' || i + 1 != part.length))
							return false
					}

					return true
				})
				if(part)
					if(part[0] == '-')
						allowed = false
					else
						allowed = true

				rcc = rcc.parent
			}

			if(allowed)
				log.apply(null, arguments)

			return typeof(a1) == 'string' ? (a2 === undefined ? a1 : a2) : a1
		}

		debug.rc = rcl
		debug.namespace = rcl.namespace
		if(rcl.parent) debug.parent = generate(rcl.parent, false)
		debug.sub = function() {
			return generate(rcl.sub.apply(rcl, arguments), true)
		}

		cache.set(rcl, debug)
	}

	if(!debug.explicit && explicit)
		explicits.add(debug)
	debug.explicit = debug.explicit || explicit

	return debug
}

exports = module.exports = generate(rc)
exports.explicits = explicits
