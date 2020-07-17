var parse   = require('./lib/index')
var through = require('through2').obj

module.exports = parseStream

function parseStream() {
  var parser = parse()
  var stream = through(write, flush)

  stream.program = parser.program
  stream.scope   = parser.scope

  return stream

  function write(data, _, next) {
    var nodes
    try {
        nodes = parser(data)
    } catch (error) {
        next(error)
        return;
    }
    for (var i = 0; i < nodes.length; i++) {
      this.push(nodes[i])
    }

    next()
  }

  function flush() {
    this.push(null)
  }
}
