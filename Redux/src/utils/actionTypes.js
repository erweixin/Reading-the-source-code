/**
 * These are private action types reserved by Redux.
 * For any unknown actions, you must return the current state.
 * If the current state is undefined, you must return the initial state.
 * Do not reference these action types directly in your code.
 * redux内置的三个action,不要直接在代码中引用这些action。
 * INIT:
 *    createStore时Redux会disptach该action,用于将reducer初始设置的state赋值给store。
 *    初始化时获得一个随机字符串`@@redux/INIT${randomString()}`。该字符串初始化以后就不会再改变。
 * REPLACE:
 *    使用createStore暴露出的replaceReducer API时会disptach该action,用于将nextReducer初始设置的state赋值给store。
 *    初始化时获得一个随机字符串`@@redux/REPLACE${randomString()}`。该字符串初始化以后就不会再改变。
 * PROBE_UNKNOWN_ACTION:
 *    combineReducers中会disptach该action,测试每个reducer是否均设置了初始state。
 *    该action与前两者有一个很大的不同点，前两个初始化时获得一个随机字符串，该字符串不再改变，
 *    而PROBE_UNKNOWN_ACTION为一个函数，每次运行该函数均能获取一个随机字符串。
 * 
 */

const randomString = () =>
  Math.random()
    .toString(36)
    .substring(7)
    .split('')
    .join('.')

const ActionTypes = {
  INIT: `@@redux/INIT${randomString()}`,
  REPLACE: `@@redux/REPLACE${randomString()}`,
  PROBE_UNKNOWN_ACTION: () => `@@redux/PROBE_UNKNOWN_ACTION${randomString()}`
}

export default ActionTypes
