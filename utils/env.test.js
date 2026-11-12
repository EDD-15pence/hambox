/**
 * utils/env.js 本地覆盖层的单测（债-1）
 *
 * env.js 直接摸 wx.*，所以要先把 wx mock 掉再 require。
 * 只测纯逻辑：覆盖优先级、空值回落、地址归一化 —— 网络请求不在这一层。
 */

var store = {};

global.wx = {
  getStorageSync: function (key) {
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : '';
  },
  setStorageSync: function (key, value) {
    store[key] = value;
  },
  removeStorageSync: function (key) {
    delete store[key];
  },
  getDeviceInfo: function () {
    return { platform: 'devtools' };
  }
};

var env = require('./env');

var pass = 0;
var fail = 0;

function check(name, actual, expected) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
    console.log('  ok   ' + name);
  } else {
    fail += 1;
    console.log('  FAIL ' + name + '\n       期望 ' + e + '\n       实际 ' + a);
  }
}

var defaults = env.getDefaults();

console.log('默认值');
check('令牌取代码包常量', env.getToken(), defaults.token);
check('局域网取代码包常量', env.effectiveBase('lan'), defaults.lan);
check('未改过时 isCustom 为 false', env.isCustom('lan'), false);
check('未改过时 override 两项都是空串', env.getOverride(), { lan: '', wan: '', token: '' });

console.log('覆盖生效');
env.setOverride({ token: 'NEWTOKEN' });
check('令牌用覆盖值', env.getToken(), 'NEWTOKEN');
check('令牌标记为已改', env.getOverride().token, 'NEWTOKEN');

env.setOverride({ lan: 'http://10.0.0.9:8010/' });
check('地址用覆盖值且去掉尾斜杠', env.effectiveBase('lan'), 'http://10.0.0.9:8010');
check('地址标记为已改', env.isCustom('lan'), true);
check('外网仍未改', env.isCustom('wan'), false);

env.setOverride({ wan: 'https://new.example.com:8443' });
check('外网同样生效', env.effectiveBase('wan'), 'https://new.example.com:8443');
check('改一项不影响另一项', env.effectiveBase('lan'), 'http://10.0.0.9:8010');

console.log('部分回退');
env.setOverride({ lan: '' });
check('传空串等于该项恢复默认', env.effectiveBase('lan'), defaults.lan);
check('恢复后 isCustom 回到 false', env.isCustom('lan'), false);
check('令牌不受影响', env.getToken(), 'NEWTOKEN');

console.log('全部恢复');
env.clearOverride();
check('令牌回到常量', env.getToken(), defaults.token);
check('外网回到常量', env.effectiveBase('wan'), defaults.wan);
check('覆盖值清空', env.getOverride(), { lan: '', wan: '', token: '' });

console.log('线路候选');
var list = env.candidates();
check('两条线路都在', list.length, 2);
check('候选顺序按代码包设定', list.map(function (x) { return x.key; }), ['lan', 'wan']);

env.setOverride({ wan: '' });
check('清空后仍回落到默认地址', env.candidates().length, 2);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
