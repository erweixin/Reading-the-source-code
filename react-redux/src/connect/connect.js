import connectAdvanced from '../components/connectAdvanced'
import shallowEqual from '../utils/shallowEqual'
import defaultMapDispatchToPropsFactories from './mapDispatchToProps'
import defaultMapStateToPropsFactories from './mapStateToProps'
import defaultMergePropsFactories from './mergeProps'
import defaultSelectorFactory from './selectorFactory'

/*
  connect is a facade over connectAdvanced. It turns its args into a compatible
  selectorFactory, which has the signature:

    (dispatch, options) => (nextState, nextOwnProps) => nextFinalProps
  
  connect passes its args to connectAdvanced as options, which will in turn pass them to
  selectorFactory each time a Connect component instance is instantiated or hot reloaded.

  selectorFactory returns a final props selector from its mapStateToProps,
  mapStateToPropsFactories, mapDispatchToProps, mapDispatchToPropsFactories, mergeProps,
  mergePropsFactories, and pure args.

  The resulting final props selector is called by the Connect component instance whenever
  it receives new props or store state.
 */

function match(arg, factories, name) {
  for (let i = factories.length - 1; i >= 0; i--) {
    const result = factories[i](arg)
    if (result) return result
  }

  return (dispatch, options) => {
    throw new Error(
      `Invalid value of type ${typeof arg} for ${name} argument when connecting component ${
        options.wrappedComponentName
      }.`
    )
  }
}

function strictEqual(a, b) {
  return a === b
}

// createConnect with default args builds the 'official' connect behavior. Calling it with
// different options opens up some testing and extensibility scenarios
export function createConnect({
  connectHOC = connectAdvanced,
  mapStateToPropsFactories = defaultMapStateToPropsFactories,
  mapDispatchToPropsFactories = defaultMapDispatchToPropsFactories,
  mergePropsFactories = defaultMergePropsFactories,
  selectorFactory = defaultSelectorFactory
} = {}) {
  return function connect(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    {
      pure = true,
      areStatesEqual = strictEqual,
      areOwnPropsEqual = shallowEqual,
      areStatePropsEqual = shallowEqual,
      areMergedPropsEqual = shallowEqual,
      ...extraOptions
    } = {}
  ) {
    /** 
     * 通过mapStateToProps(暴露出的connect函数的参数)来判断采用哪个init函数生成最终的mapStateToProps
     * mapStateToProps为空时 initMapStateToProps函数为：
     * wrapMapToPropsConstant(() => ({}))的返回值
     * mapStateToProps为函数时，initMapStateToProps函数为：
     * wrapMapToPropsFunc(mapStateToProps, 'mapStateToProps')的返回值;
     */
    const initMapStateToProps = match(
      mapStateToProps,
      mapStateToPropsFactories,
      'mapStateToProps'
    )
    /** 
     * 通过mapDispatchToProps(暴露出的connect函数的参数)来判断采用哪个init函数生成最终的mapDispatchToProps
     * mapDispatchToProps为空时 initmapDispatchToProps函数为：
     *  wrapMapToPropsConstant(dispatch => ({ dispatch }))的返回值
     * mapDispatchToProps为函数时，initmapDispatchToProps函数为：
     * wrapMapToPropsFunc(mapDispatchToProps, 'mapDispatchToProps')的返回值;
     * mapDispatchToProps为对象时，initmapDispatchToProps函数为：
     * wrapMapToPropsConstant(dispatch =>
     *    bindActionCreators(mapDispatchToProps, dispatch)
     * )的返回值
     */
    const initMapDispatchToProps = match(
      mapDispatchToProps,
      mapDispatchToPropsFactories,
      'mapDispatchToProps'
    )
    /**
     * 通过initMergeProps(暴露出的connect函数的参数)来判断采用哪个init函数生成最终的initMergeProps
     * mergeProps为空时，initMergeProps为：
     * () => defaultMergeProps
     * mergeProps为函数时，initMergeProps为：
     * wrapMergePropsFunc(mergeProps)的返回值
     * 
     */
    const initMergeProps = match(mergeProps, mergePropsFactories, 'mergeProps')

    return connectHOC(selectorFactory, {
      // used in error messages
      methodName: 'connect',

      // used to compute Connect's displayName from the wrapped component's displayName.
      getDisplayName: name => `Connect(${name})`,

      // if mapStateToProps is falsy, the Connect component doesn't subscribe to store state changes
      shouldHandleStateChanges: Boolean(mapStateToProps),

      // passed through to selectorFactory
      initMapStateToProps,
      initMapDispatchToProps,
      initMergeProps,
      pure,
      areStatesEqual,
      areOwnPropsEqual,
      areStatePropsEqual,
      areMergedPropsEqual,

      // any extra options args can override defaults of connect or connectAdvanced
      ...extraOptions
    })
  }
}

export default createConnect()
