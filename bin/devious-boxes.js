var xtend = require('xtend')
var minimist = require('minimist')
var mOpts = {
	string: [],
	boolean: [],
	alias: {
		help: 'h',
	},
	default: {
	},
}
var argv = minimist(process.argv.slice(2))
var ports = require('seaport').connect('localhost', parseInt(argv.seaport || process.env.SEAPORT || 9090))

var commands = require('./commands')

require('bluebird')
require('co')(function*() {
	var command = argv._.shift()
	var impl = commands[command]
	if(!command || command == 'help' || argv.help || !impl) {
		console.warn(commands.help())
	} else {
		var imOpts = impl.mOpts
		argv = minimist(process.argv.slice(2), {
			string: mOpts.string.concat(imOpts.string || []),
			boolean: mOpts.boolean.concat(imOpts.boolean || []),
			alias: xtend(mOpts.alias, imOpts.alias || {}),
			default: xtend(mOpts.default, imOpts.default || {}),
			stopEarly: imOpts.stopEarly,
			'--': imOpts['--'],
			unknown: imOpts.unknown,
		})
		argv._.shift()
		yield impl(ports, argv)
	}
	process.exit()
}).catch(function(e) { console.error(e.stack) })
