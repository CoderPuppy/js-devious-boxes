var conn = require('./connection')
var Promise = require('bluebird')
var bean = require('../utils/bean')

var $ = document.querySelector.bind(document)

require('domready')(Promise.coroutine(function*() {
	yield require('./account-provider')()
	yield require('./player-controls')()
	yield require('./player')()
}))
