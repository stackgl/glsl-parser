module.exports = parser

var Stream = require('stream').Stream

function create_stream() {
  var stream = new Stream
  stream.readable =
  stream.writable = true
  return stream
}

var _ = 0
  , STMT = _++
  , STMTLIST = _++
  , STRUCT = _++
  , FUNCTION = _++
  , FUNCTIONARGS = _++
  , FUNCTIONBODY = _++
  , DECL = _++
  , DECLLIST = _++
  , FORLOOP = _++
  , WHILELOOP = _++
  , IF = _++
  , EXPR = _++
  , PRECISION = _++
  , COMMENT = _++
  , PREPROCESSOR = _++
  , KEYWORD = _++
  , KEYWORD_OR_IDENT = _++
  , IDENT = _++
  , RETURN = _++

var QUALIFIERS = ['const', 'attribute', 'uniform', 'varying']

var NO_ASSIGN_ALLOWED = false

// map of tokens to stmt types
var token_map = {
  'block-comment': COMMENT
, 'line-comment': COMMENT
, 'preprocessor': PREPROCESSOR
}

// map of stmt types to human
var stmt_type = {}
stmt_type[COMMENT] = 'comment'
stmt_type[PREPROCESSOR] = 'preprocessor'

function parser() {
  var stream = create_stream()
    , check = arguments.slice ? [].slice.call(arguments) : /.*/ 

  stream.write = write
  stream.end = end
  stream.destroy = destroy

  var symbol_table = {}
    , base_symbol

  base_symbol = {
      nud: unexpected
    , led: unexpected
  }


  var node = stmtlist()
  node.expecting = '(eof)'
  node.mode = STMTLIST
  var depth = 0
    , state = []
    , tokens = []
    , scope = {}
    , whitespace = []
    , errored = false
    , token

  state.shift = special_shift
  state.unshift = special_unshift
  state.fake = function(x) {
    state.unshift(x)
    state.shift()
  }

  token = {type: '(program)', data: '(program)'}
  node.token = token
  state.unshift(node)
  return stream

  function write(input) {
    if(input.type === 'whitespace') {
      whitespace.push(input)
      return
    }
    tokens.push(input)
    token = token || tokens[0]

    if(node) {
      (node.whitespace = node.whitespace || []).concat(whitespace.splice(0, whitespace.length))
    }

    while(take()) switch(state[0].mode) {
      case STMT: parse_stmt(); break
      case STMTLIST: parse_stmtlist(); break
      case DECL: parse_decl(); break
      case DECLLIST: parse_decllist(); break
      case EXPR: parse_expr(); break
      case STRUCT: parse_struct(); break
      case PRECISION: parse_precision(); break
      case IDENT: parse_ident(); break
      case KEYWORD: parse_keyword(); break
      case KEYWORD_OR_IDENT: parse_keyword_or_ident(); break
      case FUNCTION: parse_function(); break
      case FUNCTIONARGS: parse_function_args(); break
      case FUNCTIONBODY: parse_function_body(); break
      case FORLOOP: parse_forloop(); break
      case WHILELOOP: parse_whileloop(); break
      case RETURN: parse_return(); break
      case IF: parse_if(); break
    }
  }

  function destroy() {
    this.write = function(){}
    this.writable = false
    this.emit('close')
  }

  function take() {
    if(errored || !state.length)
      return errored

    return token = tokens[0]
  }

  function special_unshift(_node) {
    var ret = [].unshift.call(this, _node)

    var pad = ''
    for(var i = 0, len = this.length; i < len; ++i)
      pad += ' |' 
    console.log(pad + '\\' + _node.type + ': ' + _node.id + ':\t\t' + JSON.stringify(_node.token.data))

    node.children.push(_node)
    node = _node

    return ret
  }

  function special_shift() {
    var pad = ''
    for(var i = 0, len = this.length; i < len; ++i)
      pad += ' |'
    console.log(pad + '/' + this[0].type + ': ' + this[0].id)

    var _node = [].shift.call(this)
      , okay = check[this.length - 1]

    if(!check.length || (okay && okay.test && okay.test(_node.type)) || okay === _node.type) {
      stream.emit('data', node) 
    }
  
    node = _node.parent
    return _node
  }

  function end(tokens) {
    if(arguments.length) {
      write(tokens)
    }

    if(state.length > 1) {
      unexpected('unexpected EOF')
      return
    }

    stream.readable = false
    stream.closed = true
    stream.emit('close')
  }

  // parse states ---------------

  function parse_stmtlist() {
    // determine the type of the statement
    // and then start parsing, goddamnit

    if(token.data === state[0].expecting) {
      return state.shift()
    }
    switch(token.type) {
      case 'whitespace':
        tokens.shift()
      return
      case 'block-comment':
      case 'line-comment':
      case 'preprocessor':
        state.fake(adhoc())
        tokens.shift()
      return
      default:
        state.unshift(stmt())
      return 
    }
  }

  function parse_stmt() {
    var _node
    if(state[0].brace) {
      if(token.data !== '}') {
        return unexpected('expected `}`, got '+token.data)
      }
      state[0].brace = false
      return tokens.shift(), state.shift()
    }
    switch(token.type) {
      case 'eof': return state.shift()
      case 'keyword': 
        switch(token.data) {
          case 'for': return state.unshift(forstmt());
          case 'if': return state.unshift(ifstmt());
          case 'while': return state.unshift(whilestmt());
          case 'break':
          case 'continue':
          case 'discard':
            state.fake(mknode(token.data, STMT, token, node))
          return tokens.shift()
          case 'return': return state.unshift(returnstmt());
        }
        if(token.data === 'struct')
          _node = struct()
        else if(token.data === 'precision')
          _node = precision()
        else
          _node = decl()
        return state.unshift(_node)
      case 'ident':
        if(state.data in scope) {
          return state.unshift(decl())
        }
      case 'operator':
        if(token.data === '{') {
          state[0].brace = true
          var n = stmtlist()
          n.expecting = '}'
          return tokens.shift(), state.unshift(n)
        }
        if(token.data === ';') {
          return tokens.shift(), state.shift()
        }
      default: return state.unshift(expr(';'))
    }
  }

  function parse_struct() {
    // "struct" [ident] "{" decl; "}"
    switch(state[0].stage) {
      case 0:
      default:
        if(token.data !== 'struct') {
          return unexpected('expected `struct`')
        }
        state[0].stage = 1
        return tokens.shift()

      case 1:
        if(token.type !== 'ident') {
          return unexpected('expected `ident`, got '+token.data)
        }
        state[0].stage = 2 
        scope[token.data] = true

        return state.unshift(ident())

      case 2:
        if(token.type !== 'operator' || token.data !== '{') {
          return unexpected('expected `{`, got '+token.data)
        }
        state[0].stage = 3 
        return tokens.shift()

      case 3:
        if(token.data === '}') {
          delete state[0].stage
          return state.shift(), state.shift(), tokens.shift()
        }
        
        if(token.data === ';') {
          return tokens.shift()
        }

        if(token.type !== 'keyword' && (token.type === 'ident' && !(token.type in scope))) {
          return unexpected('expected decl or `}`, got '+token.data)
        }
        return state.unshift(decl(NO_ASSIGN_ALLOWED))
    }
  }

  function parse_precision() {
    switch(state[0].stage) {
      case 0:
      default:
        state[0].stage = 1
      return tokens.shift()

      case 1:
        if(token.type !== 'keyword' || !~['mediump', 'highp', 'lowp'].indexOf(token.data)) {
          return unexpected('expected one of mediump, highp, or lowp, got '+token.data)
        }

        state[0].precision = token.data
        state[0].stage = 2

        return tokens.shift()

      case 2:
        if(token.type !== 'keyword') {
          return unexpected('expected builtin type, got '+token.data)
        }

        state[0].precision_type = token.data
        delete state[0].stage
        return state.shift(), tokens.shift() 
    }
  }

  function parse_forloop() {
    // "for" "(" expr ";" expr ";" expr ")" "{" stmtlist "}"
    switch(state[0].stage) {
      case 0:
      default:
        if(token.data !== 'for')
          return unexpected('expected `for`, got '+token.data)
        state[0].stage = 1
        return tokens.shift()

      case 1:
        if(token.data !== '(')
          return unexpected('expected `(` got '+token.data)

        state[0].stage = 2
        return tokens.shift()

      case 2:
        state[0].stage = 3
        state.unshift(expr(';'))
        return

      case 3:
        if(token.data !== ';')
          return unexpected('expected `;`, got '+token.data)

        state[0].stage = 4
        return tokens.shift()

      case 4: 
        state[0].stage = 5
        state.unshift(expr(';'))
        return

      case 5:
        if(token.data !== ';')
          return unexpected('expected `;`, got '+token.data)

        state[0].stage = 6 
        return tokens.shift()

      case 6: 
        state[0].stage = 7 
        state.unshift(expr(')'))
        return

      case 7:
        if(token.data !== ')')
          return unexpected('expected `)`, got '+token.data)

        state[0].stage = 8 
        return tokens.shift()

      case 8:
        // this is strictly incorrect, we should be able to single-line.
        if(token.data !== '{') {
          state[0].stage = 11
          return state.unshift(stmt())
        }

        state[0].stage = 9
        return tokens.shift()

      case 9:
        state[0].stage = 10
        var n = stmtlist()
        n.expecting = '}'
        return state.unshift(n)

      case 10:
        if(token.data !== '}')
          return unexpected('expected `{`, got '+token.data)

        state[0].stage = 11
        return tokens.shift()

      case 11:
        return state.shift(), state.shift()
    }
  }

  function parse_if() {

    switch(state[0].stage) {
      // if
      case 0:
      default:
        if(token.data !== 'if') {
          return unexpected('expected `if`, got '+token.data)
        }

        state[0].stage = 1
        return tokens.shift()
      // (
      case 1:
        if(token.data !== '(') {
          return unexpected('expected `(`, got '+token.data)
        }

        state[0].stage = 2
        return tokens.shift()

      // expr
      case 2:
        state[0].stage = 3
        return state.unshift(expr(')'))

      // )
      case 3:
        if(token.data !== ')') {
          return unexpected('expected `)`, got '+token.data)
        }

        state[0].stage = 4
        return tokens.shift()

      // "{"?
      case 4:
        if(token.data !== '{') {
          state[0].stage = 7
          return state.unshift(stmt())
        }

        state[0].stage = 5
        return tokens.shift()

      // stmtlist
      case 5:
        state[0].stage = 6
        var n = stmtlist()
        n.expecting = '}'
        return state.unshift(n)

      // "}"
      case 6:
        if(token.data !== '}')
          return unexpected('expected `}`, got '+token.data)

        state[0].stage = 7
        return tokens.shift()

      // "else"?
      case 7:
        state[0].stage = 8
        if(token.data === 'else') {
          // oh god an else statement
          state[0].stage = 9
          return tokens.shift(), state.unshift(stmt())
        }
        return state.shift(), state.shift()
      case 8:
        return state.shift()
      case 9:
        return state.shift(), state.shift()

    }
    throw new Error(arguments.callee.name)
  }

  function parse_return() {
    if(!state[0].stage) {
      state[0].stage = 1
      return tokens.shift()
    }

    if(state[0].stage === 1) {
      state[0].stage = 2

      if(token.data === ';') {
        return
      }
      return state.unshift(expr(';'))
    }

    return tokens.shift(), state.shift(), state.shift()
  }

  function parse_whileloop() {
    switch(state[0].stage) {
      // while
      case 0:
      default:
        if(token.data !== 'while')
          return unexpected('expected `while`, got '+token.data)

        state[0].stage = 1
        return tokens.shift()
      // (
      case 1:
        if(token.data !== '(')
          return unexpected('expected `while`, got '+token.data)

        state[0].stage = 2 
        return tokens.shift()
      // expr
      case 2:
        state[0].stage = 3
        return state.unshift(expr(')'))
      // )
      case 3:
        if(token.data !== ')')
          return unexpected('expected `)`, got '+token.data)

        state[0].stage = 4 
        return tokens.shift()

      // "{"?
      case 4:
        if(token.data !== '{') {
          state[0].stage = 7
          return state.unshift(stmt())
        }

        state[0].stage = 5
        return tokens.shift()

      // stmtlist
      case 5: 
        state[0].stage = 6
        var n = stmtlist()
        n.expecting = '}'
        return state.unshift(n)

      // "}"
      case 6:
        if(token.data !== '}')
          return unexpected('expected `}`, got '+token.data)

        tokens.shift()
      // done
      case 7:
          return state.shift(), state.shift()
    }
  }

  function parse_decl() {
    // [qual]? [type] [name] (["=" "expr"] | [";"] | ["("])

    // we need 3-4 tokens to determine whether this is a 
    // function declaration or a variable declaration list

    if(state[0].children.length) {
      delete state[0].got
      delete state[0].need
      //if(state[1] && state[1].mode === STMT)
      //  state.shift()
      return state.shift()//, state.shift()
    }

    if(state[0].need === undefined) {
      state[0].qualified = QUALIFIERS.indexOf(token.data) > -1 
      state[0].need = state[0].qualified ? 4 : 3
      state[0].got = []
    }

    state[0].got.push(tokens.shift())

    if(state[0].need !== state[0].got.length)
      return

    // it's a decllist
    if(state[0].qualified || state[0].got[2].data !== '(') {
      if(state[0].qualified) {
        token = state[0].got.shift(), state.fake(keyword())
      } else {
        state.fake(keyword('<default>'))
      }   
      token = state[0].got.shift(), state.fake(keyword())

      while(state[0].got.length)
        tokens.unshift(token = state[0].got.pop())

      return state.unshift(decllist())
    }

    // it's a function
    token = state[0].got.shift(), state.fake(keyword())
    // replace the last two tokens
    tokens.unshift(state[0].got.pop())
    tokens.unshift(token = state[0].got.pop())

    return state.unshift(fn())
  }
  
  function parse_decllist() {
    // grab ident
    if(token.type === 'ident') {
      return state.unshift(ident())
    }

    if(token.type === 'operator') {

      if(token.data === ',') {
        // multi-decl!
        return tokens.shift()
      } else if(token.data === '=') {
        tokens.shift()

        // push old child back onto stack without emitting it.

        state.unshift(expr(',', ';'))
        return
      }
    }
    return state.shift()
  }


  function parse_keyword_or_ident() {
    if(token.type === 'keyword') {
      state[0].type = 'keyword'
      state[0].mode = KEYWORD
      return
    }

    if(token.type === 'ident') {
      state[0].type = 'ident'
      state[0].mode = IDENT
      return
    }

    return unexpected('expected keyword or user-defined name, got '+token.data)
  }

  function parse_keyword() {
    if(token.type !== 'keyword') {
      return unexpected('expected keyword, got '+token.data)
    }

    return state.shift(), tokens.shift()
  }

  function parse_ident() {
    if(token.type !== 'ident') {
      return unexpected('expected user-defined name, got '+token.data)
    }

    return state.shift(), tokens.shift()
  }

  function parse_function() {
    switch(state[0].stage) {
      case 0:
      default:
        state[0].stage = 1
        if(token.type !== 'ident') {
          return unexpected('expected user-defined name, got '+token.data)
        }

        scope[token.data] = true
        state.fake(ident())
        return tokens.shift()

      // (functionargs
      case 1:
        if(token.data !== '(') {
          return unexpected('expected `(`, got '+token.data)
        }

        state[0].stage = 2
        return state.unshift(fnargs()), tokens.shift()

      // )
      case 2:
        if(token.data !== ')') {
          return unexpected('expected `)`, got '+token.data)
        } 

        state[0].stage = 3
        return tokens.shift()

      // {
      case 3:
        if(token.data !== '{') {
          return unexpected('expected `{`, got '+token.data)
        } 
  
        state[0].stage = 4 

        var n = stmtlist()
        n.expecting = '}'

        return tokens.shift(), state.unshift(n)

      // }
      case 4:
        if(token.data !== '}') { 
          return unexpected('expected `}`, got '+token.data)
        } 
        return tokens.shift(), state.shift(), state.shift() 
    }

  }

  function parse_function_args() {
    switch(state[0].stage) {
      // looking for type or "void" or ")"
      case 0:
      default:
        state[0].stage = 1
        if(token.data === 'void') {
          state.fake(keyword())
          return token.shift()
        }
        if(token.data === ')') {
          return state.shift()
        }

        return state.unshift(keyword_or_ident())
      // looking for ident
      case 1:
        state[0].stage = 2
        return state.unshift(ident())

      // looking for "," or ")"
      case 2:
        if(token.data === ',') {
          state[0].stage = 0
          return tokens.shift()
        }

        if(token.data === ')') {
          return state.shift()
        }

        return unexpected('expected one of `,` or `)`, got '+token.data)
    }
  }

  function parse_expr() {
    var expecting = state[0].expecting

    state[0].tokens = state[0].tokens || []
    if(state[0].parenlevel === undefined) {
      state[0].parenlevel = 0
      state[0].bracelevel = 0
    }
    if(state[0].parenlevel < 1 && expecting.indexOf(token.data) > -1) {
      return parseexpr(state[0].tokens)
    }
    if(token.data === '(') {
      ++state[0].parenlevel
    } else if(token.data === ')') {
      --state[0].parenlevel
    }

    switch(token.data) {
      case '{': ++state[0].bracelevel; break
      case '}': --state[0].bracelevel; break
      case '(': ++state[0].parenlevel; break
      case ')': --state[0].parenlevel; break
    }

    if(state[0].parenlevel < 0) return unexpected('unexpected `)`')
    if(state[0].bracelevel < 0) return unexpected('unexpected `}`')

    state[0].tokens.push(tokens.shift())
    return

    function parseexpr(tokens) {
      return state.shift()
    }
  }

  // node types ---------------

  function adhoc() {
    return mknode(stmt_type[token_map[token.type]], token_map[token.type], token, node)
  }

  function stmtlist() {
    return mknode('stmtlist', STMTLIST, token, node)
  }

  function stmt() {
    return mknode('stmt', STMT, token, node)
  }

  function decl(allow_assign) {
    var _ = mknode('decl', DECL, token, node)
    _.allow_assign = allow_assign === undefined ? true : allow_assign
    return _
  }

  function decllist() {
    return mknode('decllist', DECLLIST, token, node)
  }

  function expr() {
    var n = mknode('expr', EXPR, token, node)

    n.expecting = [].slice.call(arguments)
    return n
  }

  function struct() {
    return mknode('declstruct', STRUCT, token, node)
  }

  function precision() {
    return mknode('declprec', PRECISION, token, node)
  }

  function keyword(default_value) {
    var t = token
    if(default_value) {
      t = {'type': '(implied)', data: '(default)', position: t.position} 
    }
    return mknode('keyword', KEYWORD, t, node)
  }

  function ident() {
    return mknode('ident', IDENT, token, node)
  }

  function keyword_or_ident() {
    return mknode('kw-or-ident', KEYWORD_OR_IDENT, token, node)
  }

  function fn() {
    return mknode('function', FUNCTION, token, node)
  }

  function fnargs() {
    return mknode('function-args', FUNCTIONARGS, token, node)
  }

  function fnbody() {
    return mknode('function-body', FUNCTIONBODY, token, node)
  }

  function forstmt() {
    return mknode('for', FORLOOP, token, node)
  }

  function ifstmt() {
    return mknode('if', IF, token, node)
  }

  function whilestmt() {
    return mknode('while', WHILELOOP, token, node)
  }

  function returnstmt() {
    return mknode('return', RETURN, token, node)
  }
  // utils

  function unexpected(str) {
    errored = true
    stream.emit('error', new Error(str || 'unexpected '+this.id))
  }

  // expressions --------------------------
}

function mknode(type, mode, sourcetoken, parent) {
  return {
      mode: mode
    , token: sourcetoken
    , parent: parent
    , children: []
    , type: type
    , id: (Math.random() * 0xFFFFFFFF).toString(16)
  }
}
