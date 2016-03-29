var pull = require('pull-stream')

pull.from = require('stream-to-pull-stream')
pull.to = require('pull-stream-to-stream')
pull.through = require('pull-through')
pull.defer = require('pull-defer')

module.exports = pull
