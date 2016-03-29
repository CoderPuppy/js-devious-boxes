var Promise = require('bluebird')

exports.publish = function(client) {
	return {
		stations: function() {
			return Promise.resolve(client.stations)
		},
		station: function(k) {
			return Promise.resolve(client.stations[k])
		},
		refreshStations: Promise.coroutine(function*() {
			yield client.fetchStations()
		}),
		cache: Promise.coroutine(function*(station, fetch) {
			if(fetch === undefined) fetch = true
			return yield client.getCache(station, fetch)
		}),
		queue: Promise.coroutine(function*(station, fetch, cb) {
			if(fetch === undefined) fetch = true
			return yield client.getQueue(station, fetch)
		}),
		place: function(station) {
			return Promise.resolve(client.places[station.id])
		},
		pull: Promise.coroutine(function*(station) {
			return yield client.pullSong(station)
		}),
		rate: Promise.coroutine(function*(station, song, rating) {
			return yield client.rateSong(station, song, rating)
		})
	}
}
