var dnode = require('dnode')
var Promise = require('bluebird')
var pull = require('./pull')

var exports = module.exports = function(exp) {
	var export_ = {}
	if(exp) {
		Object.keys(exp).forEach(function(k) {
			export_[k] = function() {
				var args = Array.from(arguments)
				exp[k].apply(exp, args.slice(0, -1)).asCallback(args[args.length - 1])
			}
		})
	}
	var d = dnode(export_)

	return {
		sink: pull.from.sink(d),
		source: pull.from.source(d),
		remote: new Promise(function(resolve, reject) {
			d.on('remote', function(r) {
				var r_ = {}
				for(var k in r) {
					r_[k] = Promise.promisify(r[k])
				}
				resolve(r_)
			})
		}),
	}
}
