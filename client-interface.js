var Promise = require('bluebird')
var xtend = require('xtend')

module.exports = function(client) {
	return {
		stations: Promise.coroutine(function*(force) {
			if(force || Date.now() > client.lastStationsUpdate + 10 * 60 * 1000)
				yield client.fetchStations()
			return client.stations.map(function(station) {
				return xtend(station, {
					id: 'pandora:' + station.id,
				})
			})
		}),
		station: function(k) {
			var station = client.stations[k]
			return Promise.resolve(station && xtend(station, {
				id: 'pandora:' + station.id,
			}))
		},
		cache: function(station, fetch) {
			if(fetch === undefined) fetch = true
			return client.getCache(station, fetch)
		},
		queue: function(station, fetch) {
			if(fetch === undefined) fetch = true
			return client.getQueue(station, fetch)
		},
		place: function(station) {
			return Promise.resolve(client.places[station.id])
		},
		pull: function(station) {
			return client.pullSong(station)
		},
		rate: function(station, song, rating) {
			return client.rateSong(station, song, rating)
		}
	}
}
