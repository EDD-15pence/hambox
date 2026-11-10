/**
 * 后端地址与访问令牌 —— 模板文件
 *
 * 用法：复制本文件为同目录的 env.js，再按自己的环境填写。
 *   Windows:  copy utils\env.example.js utils\env.js
 *   macOS/Linux:  cp utils/env.example.js utils/env.js
 *
 * env.js 已被 .gitignore 排除（里面有访问令牌），不要提交它。
 *
 * 两条线路：
 *   lan —— 在家/同一 WiFi，直连台式机内网 IP，最快，不依赖公网
 *   wan —— 在外面，走 lucky 反向代理的 HTTPS 域名
 *
 * 请求策略（见 utils/api.js）：
 * - 读请求失败会自动换另一条重试，并记住能用的那条（缓存 30 分钟）；
 * - 写请求不自动重试——超时后服务端可能已经写入了，重发会多出一条记录。
 *
 * 关于令牌：小程序包可以被反编译，这个令牌防的是"扫到端口的陌生人"，
 * 不是防定向破解。真要更强就在 lucky 上再加 IP 频率限制。
 */

var ENDPOINTS = {
  lan: {
    label: '局域网',
    base: 'http://192.168.31.137:8010'
  },
  wan: {
    label: '外网',
    // 留空表示还没配，会自动跳过；配好后例如 https://storage.你的域名:8443
    //
    // ⚠ 端口别想当然写 443：家宽的 80 / 443 常被运营商直接封掉（外部多节点实测全超时），
    //   只有自己挑的高位端口（如 8443）才是通的。域名后面带端口时，
    //   mp 后台「服务器域名」里的 request 与 uploadFile 都要写成带端口的形式。
    base: ''
  }
};

// 与后端 .env 的 API_TOKEN 一致；后端留空则不校验，这里也可以留空
var API_TOKEN = '';

var ORDER_DEVTOOLS = ['lan', 'wan'];
// 真机上 http + IP 地址不可能进合法域名白名单，排第一位等于每次都先撞一次墙
var ORDER_DEVICE = ['wan', 'lan'];

var STORAGE_KEY = 'api_route_v1';
var TTL = 30 * 60 * 1000;

var _devtools = null;

/** 是否跑在微信开发者工具里：只有工具内能靠「不校验合法域名」直连内网 IP */
function isDevtools() {
  if (_devtools !== null) return _devtools;
  var platform = '';
  try {
    var info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    platform = (info && info.platform) || '';
  } catch (e) {
    platform = '';
  }
  _devtools = platform === 'devtools';
  return _devtools;
}

function orderKeys() {
  return isDevtools() ? ORDER_DEVTOOLS : ORDER_DEVICE;
}

// 内存镜像：列表页一次渲染要拼 20 条图片地址，不能每条都读一次 Storage
var _route = null;
var _loaded = false;

function normalize(base) {
  return String(base || '').replace(/\/+$/, '');
}

function readCache() {
  if (!_loaded) {
    _loaded = true;
    try {
      _route = wx.getStorageSync(STORAGE_KEY) || null;
    } catch (e) {
      _route = null;
    }
  }
  if (!_route || !_route.key) return '';
  if (!_route.at || Date.now() - _route.at > TTL) return '';
  return _route.key;
}

/** 按"缓存命中优先"返回可用地址列表 */
function candidates() {
  var all = [];
  orderKeys().forEach(function (key) {
    var ep = ENDPOINTS[key];
    if (!ep || !ep.base) return;
    all.push({ key: key, label: ep.label, base: normalize(ep.base) });
  });

  var cached = readCache();
  // 真机上内网这条基本不通（域名校验会拦 IP），别让工具里留下的旧缓存把它顶到第一位
  if (cached === 'lan' && !isDevtools()) cached = '';
  if (!cached) return all;

  var head = [];
  var tail = [];
  all.forEach(function (item) {
    (item.key === cached ? head : tail).push(item);
  });
  return head.concat(tail);
}

function markOk(key) {
  _loaded = true;
  _route = { key: key, at: Date.now() };
  try {
    wx.setStorageSync(STORAGE_KEY, _route);
  } catch (e) {
    /* 存储写失败不影响本次请求 */
  }
}

/** 这条线路不通，清掉缓存，下次请求重新按顺序试 */
function markFail(key) {
  if (readCache() === key) {
    _loaded = true;
    _route = null;
    try {
      wx.removeStorageSync(STORAGE_KEY);
    } catch (e) {
      /* 忽略 */
    }
  }
}

function getBaseUrl() {
  var list = candidates();
  return list.length ? list[0].base : '';
}

function getToken() {
  return String(API_TOKEN || '').trim();
}

/** 当前走的线路名，给诊断界面用 */
function getRouteLabel() {
  var list = candidates();
  return list.length ? list[0].label : '未配置';
}

module.exports = {
  candidates: candidates,
  markOk: markOk,
  markFail: markFail,
  getBaseUrl: getBaseUrl,
  getToken: getToken,
  getRouteLabel: getRouteLabel,
  isDevtools: isDevtools
};
