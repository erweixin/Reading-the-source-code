import warning from '../utils/warning'

function verify(selector, methodName, displayName) {
  if (!selector) {
    throw new Error(`Unexpected value for ${methodName} in ${displayName}.`)
  } else if (
    methodName === 'mapStateToProps' ||
    methodName === 'mapDispatchToProps'
  ) {
    if (!selector.hasOwnProperty('dependsOnOwnProps')) {
      warning(
        `The selector for ${methodName} of ${displayName} did not specify a value for dependsOnOwnProps.`
      )
    }
  }
}
// 判断mapStateToProps、mapDispatchToProps、mergeProps均有且前两者均含有dependsOnOwnProps属性。
export default function verifySubselectors(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  displayName
) {
  verify(mapStateToProps, 'mapStateToProps', displayName)
  verify(mapDispatchToProps, 'mapDispatchToProps', displayName)
  verify(mergeProps, 'mergeProps', displayName)
}
