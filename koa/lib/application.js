
'use strict';

/**
 * Module dependencies.
 */

const isGeneratorFunction = require('is-generator-function');
const debug = require('debug')('koa:application');
// on-finished: Execute a callback when a HTTP request closes, finishes, or errors.
// example:
// var destroy = require('destroy')
// var http = require('http')
// var onFinished = require('on-finished')
 
// http.createServer(function onRequest(req, res) {
//   var stream = fs.createReadStream('package.json')
//   stream.pipe(res)
//   onFinished(res, function (err) {
//     destroy(stream)
//   })
// })
const onFinished = require('on-finished');
const response = require('./response');
const compose = require('koa-compose');
/**
 * Check if `body` should be interpreted as json.
 */

// function isJSON(body) {
//   if (!body) return false;
//   if ('string' == typeof body) return false;
//   if ('function' == typeof body.pipe) return false;
//   if (Buffer.isBuffer(body)) return false;
//   return true;
// }
const isJSON = require('koa-is-json');
const context = require('./context');
const request = require('./request');
// HTTP status utility for node.
// https://www.npmjs.com/package/statuses
// status(403) // => 403
// status('403') // => 403
// status('forbidden') // => 403
// status('Forbidden') // => 403
// status(306) // throws, as it's not supported by node.js
const statuses = require('statuses');
const Emitter = require('events');
const util = require('util');
const Stream = require('stream');
const http = require('http');
// module.exports = function(obj, keys){
//   obj = obj || {};
//   if ('string' == typeof keys) keys = keys.split(/ +/);
//   return keys.reduce(function(ret, key){
//     if (null == obj[key]) return ret;
//     ret[key] = obj[key];
//     return ret;
//   }, {});
// };
// example:
// var obj = {
//   name: 'tobi',
//   last: 'holowaychuk',
//   email: 'tobi@learnboost.com',
//   _id: '12345'
// };

// var user = only(obj, 'name last email'); or var user = only(obj, ['name', 'last', 'email']); ===> {name: 'tobi', last: 'holowaychuk', email: 'tobi@learnboost.com'}
const only = require('only');
// Convert koa legacy ( 0.x & 1.x ) generator middleware to modern promise middleware ( 2.x ).
const convert = require('koa-convert');
// Deprecate all the things
const deprecate = require('depd')('koa');

/**
 * Expose `Application` class.
 * Inherits from `Emitter.prototype`.
 */

module.exports = class Application extends Emitter {
  /**
   * Initialize a new `Application`.
   *
   * @api public
   */

  constructor() {
    super();

    this.proxy = false;
    this.middleware = [];
    this.subdomainOffset = 2;
    this.env = process.env.NODE_ENV || 'development';
    this.context = Object.create(context);
    this.request = Object.create(request);
    this.response = Object.create(response);
    // 自定义[util.inspect.custom](depth, opts)函数。
    // 使用util.inspect()调用该对象时，会返回该函数的结果
    // 详情查看：http://nodejs.cn/api/util.html#util_custom_inspection_functions_on_objects
    if (util.inspect.custom) {
      this[util.inspect.custom] = this.inspect;
    }
  }

  /**
   * Shorthand for:
   *
   *    http.createServer(app.callback()).listen(...)
   *
   * @param {Mixed} ...
   * @return {Server}
   * @api public
   */
  // http://nodejs.cn/api/http.html#http_http_createserver_options_requestlistener
  // http.createServer([options][, requestListener])； 返回一个新的 http.Server实例。
  // requestListener为一个以request, response为参数的函数。
  // this.callback()返回值即为以request, response为参数的函数
  listen(...args) {
    debug('listen');
    const server = http.createServer(this.callback());
    return server.listen(...args);
  }

  /**
   * Return JSON representation.
   * We only bother showing settings.
   *
   * @return {Object}
   * @api public
   */

  toJSON() {
    return only(this, [
      'subdomainOffset',
      'proxy',
      'env'
    ]);
  }

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @api public
   */

  inspect() {
    return this.toJSON();
  }

  /**
   * Use the given middleware `fn`.
   *
   * Old-style middleware will be converted.
   *
   * @param {Function} fn
   * @return {Application} self
   * @api public
   */
  // 将fn加入this.middleware数组中。
  use(fn) {
    if (typeof fn !== 'function') throw new TypeError('middleware must be a function!');
    if (isGeneratorFunction(fn)) {
      deprecate('Support for generators will be removed in v3. ' +
                'See the documentation for examples of how to convert old middleware ' +
                'https://github.com/koajs/koa/blob/master/docs/migration.md');
      fn = convert(fn);
    }
    debug('use %s', fn._name || fn.name || '-');
    this.middleware.push(fn);
    return this;
  }

  /**
   * Return a request handler callback
   * for node's native http server.
   * this.callback()返回一个以（req, res）为参数的函数。
   * 参考http://javascript.ruanyifeng.com/nodejs/http.html 中最简单的http例子。
   * function onRequest(request, response) {
   * response.writeHead(200, {"Content-Type": "text/plain"});
   * response.write("Hello World");
   * response.end();
   * }
   * http.createServer(onRequest).listen(process.env.PORT);
   * 
   * koa中所有处理逻辑都在下面的handleRequest函数。
   * handleRequest函数返回值为：
   * fnMiddleware(ctx).then(handleResponse).catch(onerror);
   * 参考koa-compose，fnMiddleware(ctx)会以ctx为参数按照洋葱圈模型调用整个中间件链并返回一个promise对象。
   * ctx由this.createContext(req, res)获取。
   * handleResponse为调用中间件链后的处理逻辑。
   * 错误捕获后由ctx.onerror(err)处理。
   *
   * @return {Function}
   * @api public
   */

  callback() {
    const fn = compose(this.middleware);

    if (!this.listenerCount('error')) this.on('error', this.onerror);

    const handleRequest = (req, res) => {
      const ctx = this.createContext(req, res);
      return this.handleRequest(ctx, fn);
    };

    return handleRequest;
  }

  /**
   * Handle request in callback.
   *
   * @api private
   */

  handleRequest(ctx, fnMiddleware) {
    const res = ctx.res;
    res.statusCode = 404;
    const onerror = err => ctx.onerror(err);
    const handleResponse = () => respond(ctx);
    onFinished(res, onerror);
    return fnMiddleware(ctx).then(handleResponse).catch(onerror);
  }

  /**
   * Initialize a new context.
   * 初始化一个新的ctx;
   * ctx.request主要作为ctx和req中间的桥梁，并且做了很多处理。详见request.js
   * ctx.response主要作为ctx和res中间的桥梁，并且做了很多处理。详见reponse.js
   *
   * @api private
   */

  createContext(req, res) {
    const context = Object.create(this.context);                         // 创建ctx                    
    const request = context.request = Object.create(this.request);       // ctx.request = this.request;
    const response = context.response = Object.create(this.response);    // ctx.response = this.response;
    context.app = request.app = response.app = this;                     // ctx.app = ctx.request.app = ctx.response.app = this;
    context.req = request.req = response.req = req;                      // ctx.req = ctx.request.req = ctx.response.req = req; 
    context.res = request.res = response.res = res;                      // ctx.res = ctx.request.res = ctx.response.res = res;
    request.ctx = response.ctx = context;                                // ctx.request.ctx = ctx; ctx.response.ctx = ctx;
    request.response = response;                                         // ctx.request.response = this.response;
    response.request = request;                                          // ctx.response.request = this.pequest;
    context.originalUrl = request.originalUrl = req.url;                 // ctx.originalUrl = ctx.request.originalUrl = req.url;
    context.state = {};                                                  // ctx.state = {};
    return context;
  }

  /**
   * Default error handler.
   *
   * @param {Error} err
   * @api private
   */

  onerror(err) {
    if (!(err instanceof Error)) throw new TypeError(util.format('non-error thrown: %j', err));

    if (404 == err.status || err.expose) return;
    if (this.silent) return;

    const msg = err.stack || err.toString();
    console.error();
    console.error(msg.replace(/^/gm, '  '));
    console.error();
  }
};

/**
 * Response helper.
 */

function respond(ctx) {
  // allow bypassing koa
  if (false === ctx.respond) return;

  const res = ctx.res;
  if (!ctx.writable) return;

  let body = ctx.body;
  const code = ctx.status;

  // ignore body
  // status.empty[200] // => undefined
  // status.empty[204] // => true
  // status.empty[304] // => true
  if (statuses.empty[code]) {
    // strip headers
    ctx.body = null;
    return res.end();
  }
  // method为HEAD时增加ctx.length
  if ('HEAD' == ctx.method) {
    if (!res.headersSent && isJSON(body)) {
      ctx.length = Buffer.byteLength(JSON.stringify(body));
    }
    return res.end();
  }

  // status body
  // body为空时的处理逻辑
  if (null == body) {
    body = ctx.message || String(code);
    if (!res.headersSent) {
      ctx.type = 'text';
      ctx.length = Buffer.byteLength(body);
    }
    return res.end(body);
  }

  // responses
  if (Buffer.isBuffer(body)) return res.end(body);
  if ('string' == typeof body) return res.end(body);
  if (body instanceof Stream) return body.pipe(res);

  // body: json
  body = JSON.stringify(body);
  if (!res.headersSent) {
    ctx.length = Buffer.byteLength(body);
  }
  res.end(body);
}
