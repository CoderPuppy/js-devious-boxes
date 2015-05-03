module.exports = function() {
	function mixer() {
		if(mixer.options.length == 0) throw new Error('no options')
		if(mixer.next == null) mixer.next = mixer.options[0]
		var next = mixer.next
		mixer.last = next
		var i = mixer.options.indexOf(next)
		if(i == -1) i = 0
		else if(i >= mixer.options.length - 1) i = 0
		else i++
		var option = mixer.options[i]
		mixer.next = option
		return next
	}
	mixer.options = []

	return mixer
}
