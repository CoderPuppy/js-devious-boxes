var interface = require('./interface')
var Promise = require('bluebird')
var bean = require('../utils/bean')

var $ = document.querySelector.bind(document)

window.interface = interface
window.pull = require('../pull')
window.bean = bean
window.Promise = Promise
window.Buffer = Buffer
window.process = process
window.rc = require('../rc')
window.debug = require('../debug')

require('domready')(Promise.coroutine(function*() {
	yield require('./account-provider')()
	yield require('./test-provider')()
	yield require('./player-controls')()
	yield require('./player')()
}))
