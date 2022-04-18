var dnode = require('dnode')
var co = require('co')

exports = module.exports = function*(ports, argv) {
	var username = argv._[0], password = argv._[1]
	
	var client = new (require('../client'))()
	console.log('Partner login:', client.partner.username)
	yield* client.partnerLogin()
	console.log('Login as', username)
	yield* client.login(username, password)
	
	setInterval(function() {
		co(client.fetchStations.bind(client)).catch(function(e) {
			console.error(e.stack)
		})
	}, 60 * 1000)

	var server = dnode(require('../account-provider').publish(client), { weak: false })
	server.listen(ports.register('devious-boxes:account-provider', { account: username }))
	// this is just an easy way to make it never be done
	// so it can keep hosting the server
	yield new Promise(function() {})
}

exports.mOpts = {

}
exports.usage = 'account <username> <password>'
