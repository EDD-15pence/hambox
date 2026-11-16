/**
 * 仓储本地缓存单测（§10-2，纯 node）
 *
 * 跑法： node utils/api-cache.test.js
 *
 * 重点守三条，任何一条破了都别发布：
 * 1. 业务错误（带 statusCode）**不许**拿缓存盖 —— 权限被拒却显示旧数据比报错更糟
 * 2. 网络错误才退回缓存，且必须能被认出来（`__cachedAt`）
 * 3. 兜底标记不参与序列化 / Object.keys，别污染业务数据
 */

// 微信 storage 的最小替身：本模块只用到同步读写三个方法
var store = {};
global.wx = {
  setStorageSync: function (k, v) { store[k] = v; },
  getStorageSync: function (k) { return store[k] === undefined ? '' : store[k]; },
  removeStorageSync: function (k) { delete store[k]; }
};

var C = require('./api-cache');

var failures = 0;

function check(label, actual, expected) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a === e) {
    console.log('PASS  ' + label);
  } else {
    failures++;
    console.log('FAIL  ' + label + '\n      期望 ' + e + '\n      实际 ' + a);
  }
}

function reset() {
  store = {};
}

function netError(msg) {
  // request 的网络失败只带 message，不带 statusCode（业务错误才挂状态码）
  return new Error(msg || '连接超时');
}

function bizError(code) {
  var e = new Error('没有权限');
  e.statusCode = code;
  return e;
}

// ---------- 存取往返 ----------

reset();
C.save('rooms', [{ id: 'kitchen', name: '厨房' }]);
check('存进去能取出来', C.load('rooms').data, [{ id: 'kitchen', name: '厨房' }]);
check('带写入时间戳', typeof C.load('rooms').at, 'number');

reset();
check('没存过就是 null', C.load('items'), null);

reset();
C.save('items', []);
check('空数组也能缓存（不是「没数据」）', C.load('items').data, []);

// 一周前的缓存直接当过期：不建议拿一周前的库存在手机上看
reset();
store['api_cache:items'] = { at: Date.now() - 8 * 24 * 3600 * 1000, data: [1, 2] };
check('超过一周算过期', C.load('items'), null);

// ---------- withCache：成功写、失败退 ----------

reset();
var ok = C.withCache('rooms', function () {
  return Promise.resolve([{ id: 'kitchen' }]);
});
ok.then(function (data) {
  check('成功时原样返回', data, [{ id: 'kitchen' }]);
  check('成功时顺手写了缓存', C.load('rooms').data, [{ id: 'kitchen' }]);
  check('成功的数据不带兜底标记', C.cachedAt(data), 0);
  return 'next';
}).then(function () {
  // 网络失败 → 退回缓存
  return C.withCache('rooms', function () {
    return Promise.reject(netError());
  }).then(function (data) {
    check('网络失败退回缓存', data, [{ id: 'kitchen' }]);
    check('退回的数据带兜底标记', C.cachedAt(data) > 0, true);
  });
}).then(function () {
  // 业务错误 → 必须原样抛出，不许用缓存糊过去
  return C.withCache('rooms', function () {
    return Promise.reject(bizError(403));
  }).then(function () {
    check('业务错误不该被缓存兜住', 'resolved', 'rejected');
  }, function (err) {
    check('业务错误原样抛出', err.statusCode, 403);
  });
}).then(function () {
  // 没缓存时，网络失败仍然抛错（不能凭空造数据）
  reset();
  return C.withCache('items', function () {
    return Promise.reject(netError());
  }).then(function () {
    check('没缓存就不该 resolve', 'resolved', 'rejected');
  }, function (err) {
    check('没缓存时抛出原错误', !!err.message, true);
  });
}).then(function () {
  // ---------- 兜底标记不能污染数据 ----------

  reset();
  C.save('rooms', [{ id: 'a' }]);
  return C.withCache('rooms', function () {
    return Promise.reject(netError());
  }).then(function (data) {
    check('Object.keys 看不到标记', Object.keys(data), ['0']);
    check('JSON 里也没有', JSON.stringify(data), '[{"id":"a"}]');
    check('数组长度不受影响', data.length, 1);
  });
}).then(function () {
  // ---------- 页面提示文案 ----------

  check('全新鲜 → 不提示', C.offlineTextOf([[], []]), '');

  reset();
  C.save('items', []);
  return C.withCache('items', function () {
    return Promise.reject(netError());
  }).then(function (data) {
    check('有兜底 → 出提示', C.offlineTextOf([data]).indexOf('离线数据') === 0, true);
    check('刚刚更新写成「刚刚」', C.offlineTextOf([data]), '离线数据 · 刚刚更新');
  });
}).then(function () {
  // ---------- 相对时间 ----------

  check('agoText 空值', C.agoText(0), '');
  check('agoText 30 秒', C.agoText(Date.now() - 30 * 1000), '刚刚');
  check('agoText 5 分钟', C.agoText(Date.now() - 5 * 60 * 1000), '5 分钟前');
  check('agoText 3 小时', C.agoText(Date.now() - 3 * 3600 * 1000), '3 小时前');
  check('agoText 2 天', C.agoText(Date.now() - 2 * 24 * 3600 * 1000), '2 天前');
}).then(function () {
  console.log(failures === 0 ? '\n全部通过' : '\n失败 ' + failures + ' 项');
  process.exit(failures === 0 ? 0 : 1);
}).catch(function (err) {
  console.log('FAIL  用例执行出错：' + (err && err.message));
  process.exit(1);
});
