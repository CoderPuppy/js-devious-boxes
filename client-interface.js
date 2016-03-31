var Promise = require('bluebird')

module.exports = function(client) {
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
