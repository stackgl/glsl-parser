var tokenizer = require('glsl-tokenizer')()
  , fs = require('fs')
  , parser = require('../index')
  , path = require('path').join(__dirname, 'test.glsl')

var num = 0

fs.createReadStream(path)
  .pipe(tokenizer)
  .pipe(parser())
  .on('data', function(x) {
  })
