var co = require('co')
var bluebird = require('bluebird')
var dnode = require('dnode')
var seaport = require('seaport')

var ports = seaport.connect(9090)
ports.get('devious-boxes:account-provider', function(services) {
	co(function*() {
		var client = yield new Promise(function(resolve, reject) {
			dnode.connect(services[0].host, services[0].port).on('remote', function(client) {
				resolve(client)
			})
		})
		var old = client
		var client = {}
		for(k in old)
			if(old.hasOwnProperty(k) && typeof(old[k]) == 'function')
				client[k] = bluebird.promisify(old[k])
		var stations = yield client.stations()
		var station = stations.find(function(s) { return s.name == 'Folk' })
		console.log(station)
		console.log((yield client.cache(station.id)).filter(function(song) {
			return song.songName != null
		}).map(function(song) {
			return song.songName + " by " + song.artistName
		}))
	}).catch(function(e) { console.error(e.stack) })
})
