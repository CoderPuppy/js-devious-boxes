function generate(namespace) {
	function rc(key) {
		for(var i = 0; i < exports.lookups.length; i++) {
			var val = exports.lookups[i](rc, key)
			if(val) return val
		}
	}

	rc.set = function(key, value) {
		return exports.lookups[0](rc, key, value)
	}

	rc.namespace = namespace
	rc.namespacePath = [namespace]
	rc.sub = function() {
		var cur = rc
		for(var i = 0; i < arguments.length; i++) {
			var sub = generate(arguments[i])
			sub.parent = cur
			sub.namespacePath = cur.namespacePath.concat([sub.namespace])
			cur = sub
		}
		return cur
	}

	rc.fullUnwrap = rc

	return rc
}

exports = module.exports = generate('rc')
exports.namespace = ''
exports.namespacePath = []

exports.ser = require('./ser')
exports.defaults = require('./defaults')

exports.lookups = []
if(process.browser)
	exports.lookups.push(function(rc, key, value) {
		var index = 'rc - ' + rc.namespacePath.join('/') + ' - ' + key
		if(value === undefined)
			return localStorage[index]
		else
			localStorage[index] = value
	})
exports.lookups.push(function(rc, key, value) {
	var path = rc.namespacePath.join('_')
	var index = path.length == 0 ? key : path + '_' + key
	if(value === undefined)
		return process.env[index]
	else
		process.env[index] = value
})
exports.lookups.push(function(rc, key, value) {
	var index = 'npm_package_config_' + key
	if(value === undefined)
		return process.env[index]
	else
		process.env[index] = value
})
