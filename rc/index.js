var cache = {}

function generate(namespace, parent) {
	var namespacePath = (parent ? parent.namespacePath : []).concat([namespace])
	var key = namespacePath.join('/')
	if(cache[key]) return cache[key]

	function rc(key) {
		for(var i = 0; i < exports.lookups.length; i++) {
			var val = exports.lookups[i](rc, key)
			if(val !== undefined) return val
		}
	}

	cache[key] = rc

	rc.set = function(key, value) {
		return exports.lookups[0](rc, key, value)
	}

	if(parent) rc.parent = parent
	rc.namespace = namespace
	rc.namespacePath = namespacePath
	rc.sub = function() {
		var cur = rc
		for(var i = 0; i < arguments.length; i++)
			cur = generate(arguments[i], cur)
		return cur
	}

	rc.fullUnwrap = rc

	return rc
}

exports = module.exports = generate('rc')
exports.namespace = ''
exports.namespacePath = []

exports.generate = generate

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
