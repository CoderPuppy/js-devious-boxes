var co = require('co')

exports.publish = function(client) {
	return {
		stations: function(cb) {
			cb(null, client.stations)
		},
		station: function(k) {
			cb(null, client.stations[k])
		},
		refreshStations: function(cb) {
			co(function*() {
				yield client.fetchStations()
			}).then(function() {
				cb(null)
			}, function(err) {
				cb(err)
			})
		},
		cache: function(station, fetch, cb) {
			if(!cb) cb = fetch, fetch = true
			co(function*() {
				return yield client.getCache(station, fetch)
			}).then(function(v) {
				cb(null, v)
			}, function(err) {
				cb(err)
			})
		},
		queue: function(station, fetch, cb) {
			if(!cb) cb = fetch, fetch = true
			co(function*() {
				return yield client.getQueue(station, fetch)
			}).then(function(v) {
				cb(null, v)
			}, function(err) {
				cb(err)
			})
		},
		place: function(station, cb) {
			cb(null, client.places[station.id])
		},
		pull: function(station, cb) {
			co(function*() {
				return yield client.pullSong(station)
			}).then(function(v) {
				cb(null, v)
			}, function(err) {
				cb(err)
			})
		},
		rate: function(station, song, rating) {
			co(function*() {
				return yield client.rateSong(station, song, rating)
			}).then(function() {
				cb(null)
			}, function(err) {
				cb(err)
			})
		}
	}
}
