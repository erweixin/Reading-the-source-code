import { join } from 'path';
import { addSideEffect, addDefault, addNamed } from '@babel/helper-module-imports';

function camel2Dash(_str) {
  const str = _str[0].toLowerCase() + _str.substr(1);
  return str.replace(/([A-Z])/g, ($1) => `-${$1.toLowerCase()}`);
}

function camel2Underline(_str) {
  const str = _str[0].toLowerCase() + _str.substr(1);
  return str.replace(/([A-Z])/g, ($1) => `_${$1.toLowerCase()}`);
}

function winPath(path) {
  return path.replace(/\\/g, '/');
}

export default class Plugin {
  constructor(
    libraryName,
    libraryDirectory,
    style,
    camel2DashComponentName,
    camel2UnderlineComponentName,
    fileName,
    customName,
    transformToDefaultImport,
    types,
    index = 0
  ) {
    this.libraryName = libraryName;
    this.libraryDirectory = typeof libraryDirectory === 'undefined'
      ? 'lib'
      : libraryDirectory;
    this.camel2DashComponentName = typeof camel2DashComponentName === 'undefined'
      ? true
      : camel2DashComponentName;
    this.camel2UnderlineComponentName = camel2UnderlineComponentName;
    this.style = style || false;
    this.fileName = fileName || '';
    this.customName = customName;
    this.transformToDefaultImport = typeof transformToDefaultImport === 'undefined'
      ? true
      : transformToDefaultImport;
    this.types = types;
    this.pluginStateKey = `importPluginState${index}`;
  }

  // 获取一个 state[this.pluginStateKey] 对象，利用state可以传递的特性，该对象用来存储一些信息。state属性包含了插件的options和其他数据。
  getPluginState(state) {
    if (!state[this.pluginStateKey]) {
      state[this.pluginStateKey] = {};  // eslint-disable-line
    }
    return state[this.pluginStateKey];
  }

  isInGlobalScope(path, name, pluginState) {
    const parentPath = path.findParent((_path) =>
    _path.scope.hasOwnBinding(pluginState.specified[name]));
    return !!parentPath && parentPath.isProgram();
  }

  /**
   * 
   * @param {*} methodName import { Button as _button } from 'antd' 中的 Button
   * @param {*} file 
   * @param {*} pluginState 
   */
  importMethod(methodName, file, pluginState) {
    if (!pluginState.selectedMethods[methodName]) {
      const libraryDirectory = this.libraryDirectory;
      const style = this.style;
      // 转换后的 methodName，ButtonGroup 根据配置为 button-group 或 button_group
      const transformedMethodName = this.camel2UnderlineComponentName  // eslint-disable-line
        ? camel2Underline(methodName)
        : this.camel2DashComponentName
          ? camel2Dash(methodName)
          : methodName;
      // 到组件的 path
      // 例如： "antd/es/button"
      const path = winPath(
        this.customName ? this.customName(transformedMethodName) : join(this.libraryName, libraryDirectory, transformedMethodName, this.fileName) // eslint-disable-line
      );
      /**
       * addNamed:  addNamed(path, 'named', 'source');   ===> import { named } from "source"
       * addDefault(path, 'source', { nameHint: "hintedName" }); ===> import hintedName from "source"
       * addSideEffect(path, 'source'); ===> import "source"
       */
      pluginState.selectedMethods[methodName] = this.transformToDefaultImport  // eslint-disable-line
        ? addDefault(file.path, path, { nameHint: methodName })
        : addNamed(file.path, methodName, path);
      if (style === true) {
        addSideEffect(file.path, `${path}/style`);
      } else if (style === 'css') {
        addSideEffect(file.path, `${path}/style/css`);
      } else if (typeof style === 'function') {
        const stylePath = style(path, file);
        if (stylePath) {
          addSideEffect(file.path, stylePath);
        }
      }
    }
    return Object.assign({}, pluginState.selectedMethods[methodName]);
  }

  buildExpressionHandler(node, props, path, state) {
    const file = (path && path.hub && path.hub.file) || (state && state.file);
    const types = this.types;
    const pluginState = this.getPluginState(state);
    props.forEach(prop => {
      if (!types.isIdentifier(node[prop])) return;
      if (pluginState.specified[node[prop].name]) {
        node[prop] = this.importMethod(pluginState.specified[node[prop].name], file, pluginState);  // eslint-disable-line
      }
    });
  }

  buildDeclaratorHandler(node, prop, path, state) {
    const file = (path && path.hub && path.hub.file) || (state && state.file);
    const types = this.types;
    const pluginState = this.getPluginState(state);
    if (!types.isIdentifier(node[prop])) return;
    if (pluginState.specified[node[prop].name] &&
      path.scope.hasBinding(node[prop].name) &&
      path.scope.getBinding(node[prop].name).path.type === 'ImportSpecifier') {
      node[prop] = this.importMethod(node[prop].name, file, pluginState);  // eslint-disable-line
    }
  }

  // program enter 时触发该函数
  ProgramEnter(path, state) {
    const pluginState = this.getPluginState(state);
    // 从 libraryName 引用的函数组成的对象
    pluginState.specified = Object.create(null);
    // import * as another from 'antd' 时的别称组成的对象。
    pluginState.libraryObjs = Object.create(null);
    pluginState.selectedMethods = Object.create(null);
    pluginState.pathsToRemove = [];
  }

  // program exit 时触发该函数
  ProgramExit(path, state) {
    // program exit 时删除 pathsToRemove 中的所有 path
    // 参考 https://github.com/jamiebuilds/babel-handbook/blob/master/translations/zh-Hans/plugin-handbook.md#%E5%88%A0%E9%99%A4%E4%B8%80%E4%B8%AA%E8%8A%82%E7%82%B9
    this.getPluginState(state).pathsToRemove.forEach(p => !p.removed && p.remove());
  }


  // import 语句
  // import { Button } form 'antd'
  // 生成的 AST json表示如下：
  body = [{
    "type": "ImportDeclaration",
    "start": 0,
    "end": 29,
    "loc": {
      "start": {
        "line": 1,
        "column": 0
      },
      "end": {
        "line": 1,
        "column": 29
      }
    },
    "specifiers": [
      {
        "type": "ImportSpecifier",
        "start": 9,
        "end": 15,
        "loc": {
          "start": {
            "line": 1,
            "column": 9
          },
          "end": {
            "line": 1,
            "column": 15
          }
        },
        "imported": {
          "type": "Identifier",
          "start": 9,
          "end": 15,
          "loc": {
            "start": {
              "line": 1,
              "column": 9
            },
            "end": {
              "line": 1,
              "column": 15
            },
            "identifierName": "Button"
          },
          "name": "Button"
        },
        "importKind": null,
        "local": {
          "type": "Identifier",
          "start": 9,
          "end": 15,
          "loc": {
            "start": {
              "line": 1,
              "column": 9
            },
            "end": {
              "line": 1,
              "column": 15
            },
            "identifierName": "Button"
          },
          "name": "Button"
        }
      }
    ],
    "importKind": "value",
    "source": {
      "type": "StringLiteral",
      "start": 23,
      "end": 29,
      "loc": {
        "start": {
          "line": 1,
          "column": 23
        },
        "end": {
          "line": 1,
          "column": 29
        }
      },
      "extra": {
        "rawValue": "antd",
        "raw": "'antd'"
      },
      "value": "antd"
    }
  }]

  // import 语句。例如：import { Button } form 'antd'
  ImportDeclaration(path, state) {
    const { node } = path;

    // path maybe removed by prev instances.
    if (!node) return;

    const { value } = node.source;
    const libraryName = this.libraryName;
    const types = this.types;
    const pluginState = this.getPluginState(state);
    if (value === libraryName) {
      node.specifiers.forEach(spec => {
        if (types.isImportSpecifier(spec)) {
          /**
           * import { Button } form 'antd' 写法下：
           * spec.local.name、spec.imported.name 均为 Button 
           * import { Button as _button } from 'antd' 写法下：
           * spec.local.name 为 _button、spec.imported.name 为 Button
           */
          pluginState.specified[spec.local.name] = spec.imported.name;
        } else {
          // 例如： import * as anotherName from 'antd'
          // spec 的types 为 ImportNamespaceSpecifier
          // 此时 spec.local.name 为 anotherName
          pluginState.libraryObjs[spec.local.name] = true;
        }
      });
      pluginState.pathsToRemove.push(path);
    }
  }

  // 函数调用，例如： Button()
  body = {
    "type": "ExpressionStatement",
    "start": 57,
    "end": 65,
    "loc": {
      "start": {
        "line": 4,
        "column": 0
      },
      "end": {
        "line": 4,
        "column": 8
      }
    },
    "expression": {
      "type": "CallExpression",
      "start": 57,
      "end": 65,
      "loc": {
        "start": {
          "line": 4,
          "column": 0
        },
        "end": {
          "line": 4,
          "column": 8
        }
      },
      "callee": {
        "type": "Identifier",
        "start": 57,
        "end": 63,
        "loc": {
          "start": {
            "line": 4,
            "column": 0
          },
          "end": {
            "line": 4,
            "column": 6
          },
          "identifierName": "Button"
        },
        "name": "Button"
      },
      "arguments": []
    }
  }
  CallExpression(path, state) {
    const { node } = path;
    const file = (path && path.hub && path.hub.file) || (state && state.file);
    const { name } = node.callee;
    const types = this.types;
    const pluginState = this.getPluginState(state);

    // Button() AST 如下：
    if (types.isIdentifier(node.callee)) {
      // pluginState.specified[name] 即为调用了 从 libraryName 引入的函数。
      // 注意 import 语句中的 spec.local.name 为 _button、spec.imported.name 为 Button 
      // 这样就保证了 import { Button as _button } from 'antd' 时， 仍能监控到 _button() 的调用。 
      // 此时：pluginState.specified[name] 的值为 Button
      if (pluginState.specified[name]) {
        // 重写callee
        node.callee = this.importMethod(pluginState.specified[name], file, pluginState);
      }
    }

    // Button 作为函数参数时。
    node.arguments = node.arguments.map(arg => {
      const { name: argName } = arg;
      // 这里判断作用域是为了防止以下情况：
      // import { message } from 'antd';
      
      // function App() {
      //   const message = 'xxx';
      //   return <div>{message}</div>;
      // }
      // message 会作为参数传递给 react.createElement 函数。
      // 当 message 作为参数时，作用域所在 type 不是 importSpecifier 证明存在重新赋值。此时不能改变 node.arguments 。

      // 作用域相关可查看 https://github.com/jamiebuilds/babel-handbook/blob/master/translations/zh-Hans/plugin-handbook.md#scope%E4%BD%9C%E7%94%A8%E5%9F%9F
      
      // 理解可参考该commit https://github.com/ant-design/babel-plugin-import/commit/773715b6eb46e8e89b055bdce4f875e14d361d2d
      if (pluginState.specified[argName] &&
        path.scope.hasBinding(argName) &&
        path.scope.getBinding(argName).path.type === 'ImportSpecifier') {
        return this.importMethod(pluginState.specified[argName], file, pluginState);
      }
      return arg;
    });
  }

  // .符号属性调用。例如： antd.Button
  MemberExpression(path, state) {
    const { node } = path;
    const file = (path && path.hub && path.hub.file) || (state && state.file);
    const pluginState = this.getPluginState(state);

    // multiple instance check.
    if (!node.object || !node.object.name) return;

    /**
     * pluginState.libraryObjs 为 import * as tt from 'antd' 中 tt 组成的对象
     * antd.Button 调用的情况下。
     * node.object.name ===> antd
     * node.property.name ===> button
     */
    if (pluginState.libraryObjs[node.object.name]) {
      // antd.Button -> _Button
      path.replaceWith(this.importMethod(node.property.name, file, pluginState));
    } else if (pluginState.specified[node.object.name]) {
      // button.xxx 时。node.object.name ===> button
      node.object = this.importMethod(pluginState.specified[node.object.name], file, pluginState);
    }
  }

  Property(path, state) {
    const { node } = path;
    this.buildDeclaratorHandler(node, 'value', path, state);
  }

  VariableDeclarator(path, state) {
    const { node } = path;
    this.buildDeclaratorHandler(node, 'init', path, state);
  }

  ArrayExpression(path, state) {
    const { node } = path;
    const props = node.elements.map((_, index) => index);
    this.buildExpressionHandler(node.elements, props, path, state);
  }

  LogicalExpression(path, state) {
    const { node } = path;
    this.buildExpressionHandler(node, ['left', 'right'], path, state);
  }

  ConditionalExpression(path, state) {
    const { node } = path;
    this.buildExpressionHandler(node, ['test', 'consequent', 'alternate'], path, state);
  }

  IfStatement(path, state) {
    const { node } = path;
    this.buildExpressionHandler(node, ['test'], path, state);
    this.buildExpressionHandler(node.test, ['left', 'right'], path, state);
  }

  ExpressionStatement(path, state) {
    const { node } = path;
    const { types } = this;
    if (types.isAssignmentExpression(node.expression)) {
      this.buildExpressionHandler(node.expression, ['right'], path, state);
    }
  }

  ReturnStatement(path, state) {
    const types = this.types;
    const file = (path && path.hub && path.hub.file) || (state && state.file);
    const { node } = path;
    const pluginState = this.getPluginState(state);

    if (node.argument && types.isIdentifier(node.argument) &&
    pluginState.specified[node.argument.name] &&
    this.isInGlobalScope(path, node.argument.name, pluginState)) {
      node.argument = this.importMethod(node.argument.name, file, pluginState);
    }
  }

  ExportDefaultDeclaration(path, state) {
    const { node } = path;
    this.buildExpressionHandler(node, ['declaration'], path, state);
  }

  BinaryExpression(path, state) {
    const { node } = path;
    this.buildExpressionHandler(node, ['left', 'right'], path, state);
  }

  NewExpression(path, state) {
    const { node } = path;
    this.buildExpressionHandler(node, ['callee', 'arguments'], path, state);
  }
}
