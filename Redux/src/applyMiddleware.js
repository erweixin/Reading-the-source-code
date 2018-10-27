import compose from './compose'

/**
 * Creates a store enhancer that applies middleware to the dispatch method
 * of the Redux store. This is handy for a variety of tasks, such as expressing
 * asynchronous actions in a concise manner, or logging every action payload.
 *
 * See `redux-thunk` package as an example of the Redux middleware.
 *
 * Because middleware is potentially asynchronous, this should be the first
 * store enhancer in the composition chain.
 *
 * Note that each middleware will be given the `dispatch` and `getState` functions
 * as named arguments.
 *
 * @param {...Function} middlewares The middleware chain to be applied.
 * @returns {Function} A store enhancer applying the middleware.
 */
export default function applyMiddleware(...middlewares) {
  return createStore => (...args) => {
    const store = createStore(...args)
    // 理解的难点为middlewarrAPI作为参数传给middleware。
    // middlewareAPI有两个属性，getState属性为store.getState。
    // dispatch属性初始值为一个占位函数
    // 这样，middlewareAPI作为参数将middlewares数组转换成chain数组时，如果中间件调用dispatch，将运行该占位函数，throw一个错误。
    // 需要理解这里的逻辑，就先要了解中间件的具体结构如下：
    // const logger = store => next => action => {
    //    console.log('dispatching', action)
    //    let result = next(action)
    //    console.log('next state', store.getState())
    //    return result
    // }
    // middlewareAPI的结构决定了中间件store参数即有getState、dispatch两个方法。
    // 这里getState即store.getState，dispatch为之前的占位函数。
    // 经过const chain = middlewares.map(middleware => middleware(middlewareAPI))处理
    // chain是由以下结构函数组成的数组：
    // next => action => {
    //    console.log('dispatching', action)
    //    let result = next(action)
    //    console.log('next state', store.getState())
    //    return result
    // }
    // compose(...chain)得到的函数为(...args) => middlewareA(middlewareB(middlewareC(...args)));
    // 将store.dispatch作为参数传入该函数后的到的返回值即为一个参数为action的函数，
    // 该函数将先调用middlewareA，middlewareB做为middlewareA中的next函数，依次，store.dispatch做为最后一个中间件的next函数。
    // 将该函数赋值给起初middlewareAPI中的占位函数：dispatch = compose(...chain)(store.dispatch)。
    // 因为函数参数是按值传递，以对象做为参数时，
    // 函数参数在函数内外指向同一个内存地址，当在函数外改变函数参数的属性，即middlewareAPI.dispatch = newdispatch后。先前传递给中间件内部的占位函数即由该新的dispatch链替代。
    // 故在dispatch = compose(...chain)(store.dispatch)后。中间件内的dispatch会再次遍历包含当前middleware 在内的整个 middleware 链。
    // 
    /** 
     * 
     */
    let dispatch = () => {
      throw new Error(
        `Dispatching while constructing your middleware is not allowed. ` +
          `Other middleware would not be applied to this dispatch.`
      )
    }

    const middlewareAPI = {
      getState: store.getState,
      dispatch: (...args) => dispatch(...args)
    }
    const chain = middlewares.map(middleware => middleware(middlewareAPI))
    dispatch = compose(...chain)(store.dispatch)
    // 最终返回值仍为createStore（不再含有applyMiddleware参数）生成的store，不过dispatch已经由含有各个中间件处理的dispatch链替代。
    return {
      ...store,
      dispatch
    }
  }
}
