var pull = require('pull-stream')
pull.to = require('pull-stream-to-stream')
pull.from = require('stream-to-pull-stream')
pull.defer = require('pull-defer')
module.exports = pull
