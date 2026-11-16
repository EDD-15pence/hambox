/**
 * 仓储数据的本地缓存（§10-2 技术债）
 *
 * 为什么要它：后端跑在家里的台式机上，人不在家 / 电脑睡了 / 换网段，
 * 手机上「智能仓储」就只剩一张红叉卡，历史物品一件看不到。房间、柜子、
 * 物品这些**读多写少**的数据，完全可以在每次成功请求后留一份。
 *
 * 三条约定（照这个用，别自己发明）：
 *
 * 1. **只缓存读接口**（`/api/items`、`/api/containers`、`/api/rooms`、`/api/pending`）。
 *    写操作不缓存——写完页面会重新拉一遍，缓存自然跟着刷新。
 * 2. **只在「网络不通」时兜底**，业务错误（403 / 404 / 409）原样抛出。
 *    拿旧数据糊住权限错误，比报错更糟。
 * 3. **兜底数据必须能被认出来**：数组上挂 `__cachedAt`，页面据此显示
 *    「离线数据 · X 前更新」。悄悄拿旧数据当新数据用，是这里最不能犯的错。
 */
var PREFIX = 'api_cache:';
// 一周没连上后端就别再显示了，太旧的数据没有参考价值
var MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function save(key, data) {
  try {
    wx.setStorageSync(PREFIX + key, { at: Date.now(), data: data });
  } catch (e) {
    // 存储满了 / 序列化失败：缓存是附加能力，绝不能因此让请求失败
  }
}

/** @returns {{at:number, data:any}|null} */
function load(key) {
  try {
    var hit = wx.getStorageSync(PREFIX + key);
    if (!hit || !hit.data) return null;
    if (Date.now() - (hit.at || 0) > MAX_AGE_MS) return null;
    return hit;
  } catch (e) {
    return null;
  }
}

function clear(key) {
  try {
    wx.removeStorageSync(PREFIX + key);
  } catch (e) {}
}

/** 给兜底数据打标。数组是对象，挂一个属性不影响遍历与 JSON 结构 */
function markCached(data, at) {
  if (data && typeof data === 'object') {
    try {
      Object.defineProperty(data, '__cachedAt', {
        value: at,
        enumerable: false,   // 不参与 JSON.stringify / Object.keys，页面里 for-in 也看不到
        configurable: true
      });
    } catch (e) {}
  }
  return data;
}

/** 这份数据是不是缓存兜底来的（是的话返回时间戳，否则 0） */
function cachedAt(data) {
  return (data && data.__cachedAt) || 0;
}

/** '刚刚' / '12 分钟前' / '3 小时前' / '2 天前' */
function agoText(at) {
  if (!at) return '';
  var diff = Date.now() - at;
  if (diff < 0) diff = 0;
  var min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  var hour = Math.floor(min / 60);
  if (hour < 24) return hour + ' 小时前';
  return Math.floor(hour / 24) + ' 天前';
}

/**
 * 包一层读请求：成功写缓存；网络失败退回缓存并打标。
 *
 * @param {string} key   缓存键（`items` / `containers` / `rooms` / `pending`）
 * @param {Function} task 返回 Promise 的取数函数
 */
function withCache(key, task) {
  return task().then(function (data) {
    save(key, data);
    return data;
  }).catch(function (err) {
    // 带 statusCode = 后端明确回了业务错误，别拿旧数据盖掉
    var hit = (err && err.statusCode) ? null : load(key);
    if (!hit) throw err;
    return markCached(hit.data, hit.at);
  });
}

/**
 * 一次页面加载往往拼好几份数据，挑其中最新的缓存时间给提示条用。
 * 全都不是兜底来的 → 返回空串，页面不显示提示。
 */
function offlineTextOf(list) {
  var at = 0;
  (list || []).forEach(function (data) {
    var t = cachedAt(data);
    if (t > at) at = t;
  });
  return at ? '离线数据 · ' + agoText(at) + '更新' : '';
}

module.exports = {
  save: save,
  load: load,
  clear: clear,
  cachedAt: cachedAt,
  agoText: agoText,
  offlineTextOf: offlineTextOf,
  withCache: withCache
};
