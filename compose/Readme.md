# 如何更好的理解compose源码(4.1.0)？
compose将由中间件组成的数组，转换成由这些中间件串联组成的一个中间件。

## dispatch函数
理解compose就必须深入理解dispatch函数，虽然该函数仅有十几行，却通过递归实现了中间件串联执行。解析逻辑如下：
```javascript
function dispatch (0) {
  if (i <= index) return Promise.reject(new Error('next() called multiple times'))
  index = 0
  let fn = middleware[0]
  if (i === middleware.length) fn = next
  if (!fn) return Promise.resolve()
  try {
    return Promise.resolve(fn(context, dispatch.bind(null, 1)));
  } catch (err) {
    return Promise.reject(err)
  }
}
```
dispatch()参数为0时，取middleware数组中的第一个中间件：
假设该中间件如下：
```javascript
  async function middleware1(content, next) {
    middleware1do1();
    await next();
    middleware1do2();
  }
```
dispatch(0)返回值即为：
```js
  Promise.resolve(
    middleware1(content, dispatch(1)) {
      middleware1do1();
      await dispatch(1)
      middleware1do2();
    }
  )
```
按照相同格式类推：
dispatch(1)返回值为：
```js
Promise.resolve(
  middleware2(content, dispatch(2)) {
    middleware2do1();
    await dispatch(2)
    middleware2do2();
  }
)
```
dispatch(0)返回值即为：
```js
Promise.resolve(
  middleware1(content, dispatch(1)) {
    middleware1do1();
    await Promise.resolve(
            middleware2(content, dispatch(2)) {
              middleware2do1();
              await dispatch(2)
              middleware2do2();
            }
          )
    middleware1do2();
  }
)
```
以此类推，由此实现洋葱圈模型。
## 为什么 `if (i <= index)`可以推断出next()调用多次？
dispatch(0)返回值：
```js
Promise.resolve(
  middleware1(content, dispatch(1)) {
    middleware1do1();
    await Promise.resolve(
            middleware2(content, dispatch(2)) {
              middleware2do1();
              await dispatch(2)
              middleware2do2();
            }
          )
    middleware1do2();
  }
)
```
假设仅有两个中间件，第一个中间件调用两次next()，如：
```js
Promise.resolve(
  middleware1(content, dispatch(1)) {
    middleware1do1();
    // await next(); 等同于 await dispatch(1); 等同于下面的await ...; 第一次调用next()即第一次dispatch(1)时，index = 1,将index由原本的0变为1;
    await Promise.resolve(
            middleware2(content) {
              middleware2do();
            }
          )
    middleware1do2();
    await next();         // 即 await dispatch(1); 第二次调用next()即第二次dispatch(2)时，由于第一次dispatch(1)时，index已经等于1了，i = index，所以会throw error。
    middleware1do3();
  }
)
```
多于两个中间件时，某个中间件第一次调用next()（dispath(n)）时，index就会被赋值为n,下一个中间件会将index赋值为 n + 1，依次 + 1,
再次在同一个中间件调用next()（dispath(n)）时，n 就会小于 index,就会侦测到next()被调用两次。

## 另外一个理解的难点为最后一个中间件的逻辑。
```js
function (context, next) {
  // last called middleware #
  let index = -1
  return dispatch(0)
  function dispatch (i) {
    if (i <= index) return Promise.reject(new Error('next() called multiple times'))
    index = i
    let fn = middleware[i]
    if (i === middleware.length) fn = next
    if (!fn) return Promise.resolve()
    try {
      return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
    } catch (err) {
      return Promise.reject(err)
    }
  }
}
```
### 假设使用compose处理后的中间件未传next参数，即compose处理后的中间件直接调用，不再加到另外一个由中间件组成的数组中以待compose再次处理。如koa中的使用:
```js
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
```

为方便理解，假设compose处理的数组仅有两个中间件：
dispatch(0)返回值：
```js
  Promise.resolve(
    middleware1(content, dispatch(1)) {
      middleware1do1();
      await Promise.resolve(
              middleware2(content, dispatch(2)) {
                middleware2do1();
                await dispatch(2)
                middleware2do2();
              }
            )
      middleware1do2();
    }
  )
```
则dispatch(2)的值为: 
middleware.length = 2;
```js
dispatch (2) {
  if (i <= index) return Promise.reject(new Error('next() called multiple times'))
  index = i
  let fn = middleware[i]                   // fn = middleware[2],因该数组仅有两项，故fn = undefined
  if (i === middleware.length) fn = next   // 2 === 2, fn = undefined
  if (!fn) return Promise.resolve()        // 直接返回Promise.resolve()
  try {
    return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
  } catch (err) {
    return Promise.reject(err)
  }
}
```
则dispatch(0)返回值：
```js
  Promise.resolve(
    middleware1(content, dispatch(1)) {
      middleware1do1();
      await Promise.resolve(
              middleware2(content, dispatch(2)) {
                middleware2do1();
                await Promise.resolve()  // dispatch(2)即为Promise.resolve()
                middleware2do2();
              }
            )
      middleware1do2();
    }
  )
```
该种情况下的逻辑比较好理解。

### 假设使用compose处理后的中间件传了next参数，主要出现在由compose处理后得到的中间件加入另一个中间件数组，再由compose处理。如koa-router:
```js
  return compose(layerChain)(ctx, next);
```

着重分析该种情况，因为此种情况实现了compose处理后得到的middleware可加入另一个middleware数组中重新被compose处理：
因next有值，假设仅有两个中间件：
dispatch(2)的值为：
```js
dispatch (2) {
  if (i <= index) return Promise.reject(new Error('next() called multiple times'))
  index = i
  let fn = middleware[i]                   // fn = middleware[2],因该数组仅有两项，故fn = undefined
  if (i === middleware.length) fn = next   // 2 === 2; fn = next
  if (!fn) return Promise.resolve()        
  try {
    return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));  // 返回该项：Promise.resolve(fn(context, dispatch.bind(null, 3)));
  } catch (err) {
    return Promise.reject(err)
  }
}
```

dispatch(3)的值为：
```js
dispatch (3) {
  if (i <= index) return Promise.reject(new Error('next() called multiple times'))
  index = i
  let fn = middleware[i]                   // fn = middleware[3],因该数组仅有两项，故fn = undefined
  if (i === middleware.length) fn = next   // 2 === 3不成立;
  if (!fn) return Promise.resolve()        // 返回该项
  try {
    return Promise.resolve(fn(context, dispatch.bind(null, i + 1))); 
  } catch (err) {
    return Promise.reject(err)
  }
}
```
compose处理后得到的中间件如下：
```js
function (context, next) {
  Promise.resolve(
    middleware1(content, dispatch(1)) {
      middleware1do1();
      await Promise.resolve(
              middleware2(content, dispatch(2)) {
                middleware2do1();
                await Promise.resolve(next(context, Promise.resolve()));
                middleware2do2();
              }
            )
      middleware1do2();
    }
  )
}
```
可将该中间件理解成以下逻辑：
```js
function (context, next) {
  Promise.resolve(
    dosomething();
    await Promise.resolve(next(context, dispatch.bind(null, i + 1)));
    dootherthing();
    }
  )
}
```
因为`await next()`中`next()`调用时的参数对调用下一个中间件（dispatch(n)）无任何影响。故以上代码可易理解为：
```js
function (context, next) {
  Promise.resolve(
    dosomething();
    await next();
    dootherthing();
    }
  )
}
```
故compose处理后的中间件可作为普通中间件加入中间件数组，必要时可再被compose处理。

**需要着重理解的一点为，中间件中next函数本身有无参数对该中间件实现的逻辑无影响**

`await next()`仅用来调用下个中间件（dispatch(n)），但该next函数的参数对下一个中间件的参数（）无任何影响。
实现原理：通过`dispatch.bind(null, i+1)`控制`next`的参数。导致`await next()`中`next`是否传参对`dispatch(n)`无半点影响。故compose处理后的中间件中`await Promise.resolve(next(context, Promise.resolve()))`等同于``await Promise.resolve(next())``等同于`await next()`。
可以尝试一下例子加深理解：
```js
function dispatch(i) {
  console.log(i);
}
function middleware(next) {
  // 我想决定dispatch的参数
  next(2);
}
middleware(dispatch) // 2
middleware(dispatch.bind(null, '这种写法下，我才是dispatch真正的参数')) // 这种写法下，我才是dispatch真正的参数
```
