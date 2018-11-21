var debug = require('debug')('koa-router');
var pathToRegExp = require('path-to-regexp');
var uri = require('urijs');

module.exports = Layer;

/**
 * Initialize a new routing Layer with given `method`, `path`, and `middleware`.
 *
 * @param {String|RegExp} path Path string or regular expression.
 * @param {Array} methods Array of HTTP verbs.
 * @param {Array} middleware Layer callback/middleware or series of.
 * @param {Object=} opts
 * @param {String=} opts.name route name
 * @param {String=} opts.sensitive case sensitive (default: false)
 * @param {String=} opts.strict require the trailing slash (default: false)
 * @returns {Layer}
 * @private
 */

function Layer(path, methods, middleware, opts) {
  this.opts = opts || {};
  this.name = this.opts.name || null;
  this.methods = [];
  // paramNames保存的是路由参数
  // 例如：
  // let keys = []
  // let reg = pathToRegExp('/user/:id', keys)
  // console.log(keys) =====> 
  // [ 
  //   {
  //       name: 'id',
  //       prefix: '/',
  //       delimiter: '/',
  //       optional: false,
  //       repeat: false,
  //       partial: false,
  //       pattern: '[^\\/]+?'
  //   }
  // ]
  this.paramNames = [];
  // middleware
  this.stack = Array.isArray(middleware) ? middleware : [middleware];

  // 将methods中的每一项转换成大写并加入this.methods。如果methods中含有"GET"，还将在this.methods数组前面增加一项“HEAD”
  // 尝试优化如下：
  // this.methods = methods.map(method => method.toUpperCase())
  // if(this.methods.includes('GET')) {
  //   this.methods.unshift('HEAD')
  // }
  methods.forEach(function(method) {
    var l = this.methods.push(method.toUpperCase());
    if (this.methods[l-1] === 'GET') {
      this.methods.unshift('HEAD');
    }
  }, this);

  // 保证middleware是由函数组成的数组
  // ensure middleware is a function
  this.stack.forEach(function(fn) {
    var type = (typeof fn);
    if (type !== 'function') {
      throw new Error(
        methods.toString() + " `" + (this.opts.name || path) +"`: `middleware` "
        + "must be a function, not `" + type + "`"
      );
    }
  }, this);

  this.path = path;
  // 将路径字符串（如/user/:name）转换为正则表达式。
  // ep: path: /name/:id
  //     regexp: /^\/name\/((?:[^\/]+?))(?:\/(?=$))?$/i
  this.regexp = pathToRegExp(path, this.paramNames, this.opts);

  debug('defined route %s %s', this.methods, this.opts.prefix + this.path);
};

/**
 * Returns whether request `path` matches route.
 * // 判断是否符合该路由正则表达式
 *
 * @param {String} path
 * @returns {Boolean}
 * @private
 */

Layer.prototype.match = function (path) {
  return this.regexp.test(path);
};

/**
 * Returns map of URL parameters for given `path` and `paramNames`.
 * 返回path中的变量的值，格式如下：
 * （captures及其对应的属性值，expand existingParams参数。）
 * {
 *  id: 1,
 *  post: 2,
 * }
 *
 * @param {String} path
 * @param {Array.<String>} captures
 * @param {Object=} existingParams
 * @returns {Object}
 * @private
 */

Layer.prototype.params = function (path, captures, existingParams) {
  var params = existingParams || {};

  for (var len = captures.length, i=0; i<len; i++) {
    if (this.paramNames[i]) {
      var c = captures[i];
      params[this.paramNames[i].name] = c ? safeDecodeURIComponent(c) : c;
    }
  }

  return params;
};

/**
 * Returns array of regexp url path captures.
 * 返回route中的变量组成的数组
 *
 * @param {String} path
 * @returns {Array.<String>}
 * @private
 */

Layer.prototype.captures = function (path) {
  if (this.opts.ignoreCaptures) return [];
  // route: /name/:id/:a
  // pathToRegExp(route) ===> /^\/name\/((?:[^\/]+?))\/((?:[^\/]+?))(?:\/(?=$))?$/i
  // '/name/10/11'.match(new RegExp(/^\/name\/((?:[^\/]+?))\/((?:[^\/]+?))(?:\/(?=$))?$/i)).slice(1) ===>   ["10", "11"]
  return path.match(this.regexp).slice(1);
};

/**
 * Generate URL for route using given `params`.
 * 根据传的参数生成URL
 *
 * @example
 *
 * ```javascript
 * var route = new Layer(['GET'], '/users/:id', fn);
 *
 * route.url({ id: 123 }); // => "/users/123"
 * ```
 *
 * @param {Object} params url parameters
 * @returns {String}
 * @private
 */

Layer.prototype.url = function (params, options) {
  var args = params;
  // 将(.*)在path中移除
  var url = this.path.replace(/\(\.\*\)/g, '');
  // var toPath = pathToRegexp.compile('/user/:id')
  // toPath({ id: 123 }) //=> "/user/123"
  // toPath({ id: 'café' }) //=> "/user/caf%C3%A9"
  // toPath({ id: '/' }) //=> "/user/%2F"
  var toPath = pathToRegExp.compile(url);
  var replaced;

  if (typeof params != 'object') {
    args = Array.prototype.slice.call(arguments);
    if (typeof args[args.length - 1] == 'object') {
      options = args[args.length - 1];
      args = args.slice(0, args.length - 1);
    }
  }
  // var tokens = pathToRegexp.parse('/route/:foo/(.*)')
  // console.log(tokens[0])
  // //=> "/route"
  // console.log(tokens[1])
  // //=> { name: 'foo', prefix: '/', delimiter: '/', optional: false, repeat: false, pattern: '[^\\/]+?' }
  // console.log(tokens[2])
  // //=> { name: 0, prefix: '/', delimiter: '/', optional: false, repeat: false, pattern: '.*' }

  var tokens = pathToRegExp.parse(url);
  var replace = {};

  if (args instanceof Array) {
    for (var len = tokens.length, i=0, j=0; i<len; i++) {
      if (tokens[i].name) replace[tokens[i].name] = args[j++];
    }
  } else if (tokens.some(token => token.name)) {
    replace = params;
  } else {
    options = params;
  }

  replaced = toPath(replace);

  if (options && options.query) {
    var replaced = new uri(replaced)
    replaced.search(options.query);
    return replaced.toString();
  }

  return replaced;
};

/**
 * Run validations on route named parameters.
 *
 * @example
 *
 * ```javascript
 * router
 *   .param('user', function (id, ctx, next) {
 *     ctx.user = users[id];
 *     if (!user) return ctx.status = 404;
 *     next();
 *   })
 *   .get('/users/:user', function (ctx, next) {
 *     ctx.body = ctx.user;
 *   });
 * ```
 *
 * @param {String} param
 * @param {Function} middleware
 * @returns {Layer}
 * @private
 */
  // 将fn生成的新的middleware加入到this.stack这个中间件数组中
  // 主要是使用router.param('user', function (id, ctx, next){}的方式传递参数
Layer.prototype.param = function (param, fn) {
  // 转换成数组后的middleware
  var stack = this.stack;
  // path正则化后的参数
  var params = this.paramNames;
  // ctx.params[param] ==> 相当于获取id的值
  var middleware = function (ctx, next) {
    return fn.call(this, ctx.params[param], ctx, next);
  };
  // 将该中间件增加一个属性param: param
  middleware.param = param;
  // example: route如下/user/:id/:post ==> name: ['id', 'post']
  var names = params.map(function (p) {
    return p.name;
  });
  // fn这个中间件是否加载就是由这里控制 x = names.indexOf(param);
  // 路由中还有这个参数，就将fn这个中间件加入middleware数组
  var x = names.indexOf(param);
  // 保证传递的参数在route正则化获取的参数之列
  if (x > -1) {
    // iterate through the stack, to figure out where to place the handler fn
    stack.some(function (fn, i) {
      // param handlers are always first, so when we find an fn w/o a param property, stop here
      // if the param handler at this part of the stack comes after the one we are adding, stop here
      // 如果[middleware]数组没有加入过由param处理过的中间件，则将this中间件加到[middleware]的第一位
      // 如果[middleware]数组有加入过由param处理过的中间件，则将this中间件按照route正则化后的参数的顺序加入[middleware]
      if (!fn.param || names.indexOf(fn.param) > x) {
        // inject this param handler right before the current item
        stack.splice(i, 0, middleware);
        return true; // then break the loop
      }
    });
  }

  return this;
};

/**
 * Prefix route path.
 * 路径增加前缀
 * 将原来的path前面增加前缀后重新生成RegExp
 *
 * @param {String} prefix
 * @returns {Layer}
 * @private
 */

Layer.prototype.setPrefix = function (prefix) {
  if (this.path) {
    this.path = prefix + this.path;
    this.paramNames = [];
    this.regexp = pathToRegExp(this.path, this.paramNames, this.opts);
  }

  return this;
};

/**
 * Safe decodeURIComponent, won't throw any error.
 * If `decodeURIComponent` error happen, just return the original value.
 * decodeURIComponent() 函数可对 encodeURIComponent() 函数编码的 URI 进行解码
 *
 * @param {String} text
 * @returns {String} URL decode original string.
 * @private
 */

function safeDecodeURIComponent(text) {
  try {
    return decodeURIComponent(text);
  } catch (e) {
    return text;
  }
}
