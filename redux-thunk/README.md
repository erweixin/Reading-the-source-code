# Redux-Thunk(2.3.0)源码解读
理解Redux-Thunk首先需要理解redux 中间件的基本结构,可参考[redux中文文档](https://cn.redux.js.org/docs/advanced/Middleware.html)
```js
function createThunkMiddleware(extraArgument) {
  return ({ dispatch, getState }) => next => action => {
    if (typeof action === 'function') {
      return action(dispatch, getState, extraArgument);
    }

    return next(action);
  };
}
```
源码很好理解，当dispatch的action为一个函数时，thunk会将(dispatch, getState, extraArgument)作为该函数的参数调用该函数。在该函数内部就可异步操作，最终再dispatch另一个action。
可参考[以下代码](https://github.com/reduxjs/redux-thunk)：
```js
import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import rootReducer from './reducers';

// Note: this API requires redux@>=3.1.0
const store = createStore(
  rootReducer,
  applyMiddleware(thunk)
);

function fetchSecretSauce() {
  return fetch('https://www.google.com/search?q=secret+sauce');
}

// These are the normal action creators you have seen so far.
// The actions they return can be dispatched without any middleware.
// However, they only express “facts” and not the “async flow”.

function makeASandwich(forPerson, secretSauce) {
  return {
    type: 'MAKE_SANDWICH',
    forPerson,
    secretSauce
  };
}

function apologize(fromPerson, toPerson, error) {
  return {
    type: 'APOLOGIZE',
    fromPerson,
    toPerson,
    error
  };
}

function withdrawMoney(amount) {
  return {
    type: 'WITHDRAW',
    amount
  };
}

// Even without middleware, you can dispatch an action:
store.dispatch(withdrawMoney(100));

// But what do you do when you need to start an asynchronous action,
// such as an API call, or a router transition?

// Meet thunks.
// A thunk is a function that returns a function.
// This is a thunk.

function makeASandwichWithSecretSauce(forPerson) {

  // Invert control!
  // Return a function that accepts `dispatch` so we can dispatch later.
  // Thunk middleware knows how to turn thunk async actions into actions.

  return function (dispatch) {
    return fetchSecretSauce().then(
      sauce => dispatch(makeASandwich(forPerson, sauce)),
      error => dispatch(apologize('The Sandwich Shop', forPerson, error))
    );
  };
}

// Thunk middleware lets me dispatch thunk async actions
// as if they were actions!

store.dispatch(
  makeASandwichWithSecretSauce('Me')
);

// It even takes care to return the thunk’s return value
// from the dispatch, so I can chain Promises as long as I return them.

store.dispatch(
  makeASandwichWithSecretSauce('My wife')
).then(() => {
  console.log('Done!');
});

// In fact I can write action creators that dispatch
// actions and async actions from other action creators,
// and I can build my control flow with Promises.

function makeSandwichesForEverybody() {
  return function (dispatch, getState) {
    if (!getState().sandwiches.isShopOpen) {

      // You don’t have to return Promises, but it’s a handy convention
      // so the caller can always call .then() on async dispatch result.

      return Promise.resolve();
    }

    // We can dispatch both plain object actions and other thunks,
    // which lets us compose the asynchronous actions in a single flow.
    // 此处如有疑问，可参考 es6 promise 链式的then:http://es6.ruanyifeng.com/#docs/promise#Promise-prototype-then

    return dispatch(
      makeASandwichWithSecretSauce('My Grandma')
    ).then(() =>
      Promise.all([
        dispatch(makeASandwichWithSecretSauce('Me')),
        dispatch(makeASandwichWithSecretSauce('My wife'))
      ])
    ).then(() =>
      dispatch(makeASandwichWithSecretSauce('Our kids'))
    ).then(() =>
      dispatch(getState().myMoney > 42 ?
        withdrawMoney(42) :
        apologize('Me', 'The Sandwich Shop')
      )
    );
  };
}

// This is very useful for server side rendering, because I can wait
// until data is available, then synchronously render the app.

store.dispatch(
  makeSandwichesForEverybody()
).then(() =>
  response.send(ReactDOMServer.renderToString(<MyApp store={store} />))
);

// I can also dispatch a thunk async action from a component
// any time its props change to load the missing data.

import { connect } from 'react-redux';
import { Component } from 'react';

class SandwichShop extends Component {
  componentDidMount() {
    this.props.dispatch(
      makeASandwichWithSecretSauce(this.props.forPerson)
    );
  }

  componentDidUpdate(prevProps) {
    if (prevProps.forPerson !== this.props.forPerson) {
      this.props.dispatch(
        makeASandwichWithSecretSauce(this.props.forPerson)
      );
    }
  }

  render() {
    return <p>{this.props.sandwiches.join('mustard')}</p>
  }
}

export default connect(
  state => ({
    sandwiches: state.sandwiches
  })
)(SandwichShop);
```