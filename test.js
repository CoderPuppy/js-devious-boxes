var interface = require('./interface')
var pull = require('./pull')
var Promise = require('bluebird')
var dnode = require('./dnode')
var rc = require('./rc')
var debug = require('./debug')

var mx1 = pull.mux(function(s) {
	debug('mx1', s)
	pull(s, pull.debug(debug, 'mx1', s.meta), pull.drain())
})

var mx2 = pull.mux(function(s) {
	debug('mx2', s)
	pull(s, pull.debug(debug, 'mx2', s.meta), pull.drain())
})

pull(mx1, pull.debug(debug, '1 → 2'), mx2)
pull(mx2, pull.debug(debug, '2 → 1'), mx1)

pull(pull.values([1, 2, 3]), mx2.create('a'))
