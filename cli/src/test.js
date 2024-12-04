const jp = require('jsonpath');
const json = {
  dev: {
    test: 'value'
  }
}
console.log(jp.query(json, 'dev.test'));
