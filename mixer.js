module.exports = function() {
	function* mixer() {
		if(mixer.stations.length == 0) throw new Error('no stations')
		var i = mixer.stations.indexOf(mixer.last)
		if(i == -1) i = 0
		else if(i >= mixer.stations.length - 1) i = 0
		else i++
		var station = mixer.stations[i]
		mixer.last = station
		return station.concat([yield station[0].pullAsync(station[1])])
	}
	mixer.stations = []

	return mixer
}
