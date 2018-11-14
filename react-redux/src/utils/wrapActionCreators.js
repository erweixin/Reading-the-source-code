import { bindActionCreators } from 'redux'
// wrap actionCreators
export default function wrapActionCreators(actionCreators) {
  return dispatch => bindActionCreators(actionCreators, dispatch)
}
