exports = module.exports = {
	account: require('./account')
}

exports.help = function(command) {
	if(command) {
		return exports[command].usage
	} else {
		var out = 'Usage: devious-boxes <command>'
		for(k in exports)
			if(k != 'help' && exports.hasOwnProperty(k))
				out += '\n' + exports.help(k).split('\n').map(function(l) { return '\t' + l }).join('\n')
		return out
	}
}
