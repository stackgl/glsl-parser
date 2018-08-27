var test = require('tape')
var path = require('path')
var fs   = require('fs')

var TokenStream = require('glsl-tokenizer/stream')
var TokenString = require('glsl-tokenizer/string')
var ParseStream = require('../stream')
var ParseArray  = require('../direct')

var expectSelectors = require('./selectors-expected.json')
var fixture = path.join(__dirname, 'fixture.glsl')

test('selector stream', function(t) {
  var selectors = []

  fs.createReadStream(fixture)
    .pipe(TokenStream())
    .pipe(ParseStream())
    .on('data', function(x) {
      selectors.push(selector(x))
    })
    .once('end', function() {
      t.deepEqual(selectors, expectSelectors)
      t.end()
    })

  function selector(x) {
    var list = []

    do {
      list.unshift(x.type)
    } while (x = x.parent)

    return list
  }
})

test('stream().program === array()', function(t) {
  getAST(true, function(ast1) {
    getAST(false, function(ast2) {
      t.deepEqual(ast1, ast2, 'pair are exactly equivalent')
      t.end()
    })
  })
})

;[true, false].forEach(function(streaming) {
  var prefix = (streaming ? 'stream' : 'sync') + ': '

  test(prefix + 'scope', function(t) {
    getAST(streaming, function(err, ast) {
      if (err) return t.fail(err.message)

      var actual = Object.keys(ast.scope).sort()
      var expect = [
          'a', 'b', 'c', 'distance', 'eigth', 'empty', 'emptyname'
        , 'emptynameemptyname', 'fifth', 'first', 'forwarddecl'
        , 'fourth', 'gary', 'main', 'one', 'position', 'proj'
        , 'second', 'seventh', 'sixth', 'texcoord', 'third', 'two'
        , 'vPosition', 'vTexcoord', 'view', 'www', 'xxx'
      ]

      t.deepEqual(expect, actual, 'contains all expected values in root scope')
      t.equal(ast.scope.xxx.type, 'ident', 'xxx.type === "ident"')
      t.equal(ast.scope.gary.parent.type, 'struct', 'gary.parent.type === "struct"')
      t.equal(ast.scope.vTexcoord.parent.parent.token.type, 'keyword', 'vTexcoord.parent.parent.token.type === "keyword"')

      t.end()
    })
  })
})

function getAST(streaming, done) {
  if (streaming) {
    var stream = fs.createReadStream(fixture)
      .pipe(TokenStream())
      .pipe(ParseStream())

    stream.on('data', function(){})
    stream.once('end', function(data) {
      done(null, stream.program)
    })
  } else {
    var src    = fs.readFileSync(fixture, 'utf8')
    var tokens = TokenString(src)
    var ast    = ParseArray(tokens)

    done(null, ast)
  }
}
