/**
 * 身份与权限（U-02）
 *
 * 这一层只做三件事：**存会话、判权限、生成调试身份**。发请求的事全在
 * `utils/api.js`，不然两边互相 require 会成环。
 *
 * ## 会话从哪来
 *
 * `app.js` 启动时调一次 `api.createSession(...)`：真机上是 `wx.login` 的 code
 * 换真 openid；后端没配 appsecret 时用本地生成的 `dev_openid` 顶上。
 * 拿到 token 存 Storage，之后每个请求带 `X-Session`。
 *
 * ## 为什么 ACL 也要缓存
 *
 * 后端下发 ACL 是为了「改权限不用重新上传开发版」（§18.8-4），但后端一挂
 * 就什么都拉不到。缓存到 Storage 后：断网时按上次拿到的权限走，不至于首页
 * 变成空白。
 *
 * ## 没拿到身份时为什么放行而不是拒绝
 *
 * 首次安装、后端还没起来的那几秒，`getAllow()` 是空的。此时若按「默认拒绝」
 * 处理，首页会一张卡都没有 —— 用户看到的是一个空壳，比放行更糟（真隔离靠
 * 后端接口，不靠这道 UI）。所以**未登录时 `can()` 返回 true**，注释里标了
 * `unknown` 状态，U-04 接 `TOOLS` 过滤时再决定要不要收紧。
 */

var KEY_SESSION = 'hambox_session_v1';
var KEY_DEV_OPENID = 'hambox_dev_openid';

/**
 * 卡片 key → 工具组 key。
 *
 * `quick`（一句话记买的东西）写的就是 `items` 表，和 `storage` 是同一份数据 ——
 * 只藏 `storage` 那张卡，妹妹照样能从快捷录入进去看和改（§18.9.3 的四个易漏点之一）。
 * 所以判断权限时先归组。
 */
var GROUP_OF = {
  quick: 'storage'
};

function readStorage(key) {
  try {
    return wx.getStorageSync(key);
  } catch (e) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    // 存储满了或被禁用：不影响本次使用，只是下次要重新登录
  }
}

/** 当前会话；没有或格式坏了返回 null */
function getSession() {
  var raw = readStorage(KEY_SESSION);
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.token) return null;
  return raw;
}

/**
 * 存会话。`expires_at` 后端给的是 UTC ISO 串，转成本地时间戳方便比较。
 */
function setSession(data) {
  if (!data || !data.token) return null;
  var expiresAt = 0;
  if (data.expires_at) {
    // 后端给的是 naive UTC（'2026-11-19T12:00:00'）。iOS 只认标准 ISO，
    // 所以补 Z；但已经带时区后缀的不能再补，否则 '...+00:00Z' 解析失败、
    // expiresAt 变 0，会话就永远不刷新了。
    var text = String(data.expires_at).replace(' ', 'T');
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(text)) text += 'Z';
    var parsed = Date.parse(text);
    expiresAt = isNaN(parsed) ? 0 : parsed;
  }
  var session = {
    token: data.token,
    openid: data.openid || '',
    role: data.role || 'guest',
    note: data.note || '',
    allow: data.allow === '*' ? '*' : (data.allow || []),
    source: data.source || 'wechat',
    expiresAt: expiresAt,
    at: Date.now()
  };
  writeStorage(KEY_SESSION, session);
  return session;
}

function clear() {
  try {
    wx.removeStorageSync(KEY_SESSION);
  } catch (e) {
    // ignore
  }
}

function getToken() {
  var session = getSession();
  return session ? session.token : '';
}

function getRole() {
  var session = getSession();
  return session ? session.role : '';
}

/** ACL：'*' 表示全放行，数组表示只给这几组，null 表示还不知道 */
function getAllow() {
  var session = getSession();
  if (!session) return null;
  return session.allow;
}

/**
 * 要不要重新登录。
 *
 * 提前 2 小时刷新：会话过期那一刻正好在用的人，不该看到一个失败的请求。
 * 从没登录过（没有 session）也返回 true。
 */
function needsRefresh() {
  var session = getSession();
  if (!session) return true;
  // 解析不出到期时间就当作要刷新：宁可多登录一次，也不要抱着一个
  // 不知道何时失效的 token 等到它 401
  if (!session.expiresAt) return true;
  return session.expiresAt - Date.now() < 2 * 60 * 60 * 1000;
}

/**
 * 能不能看到 / 进入某个工具。
 *
 * @param {string} key 卡片 key（也可以直接传工具组 key）
 * @returns {boolean} 未知身份时返回 true，见文件头说明
 */
function can(key) {
  var allow = getAllow();
  if (allow === null) return true;
  if (allow === '*') return true;
  if (!allow || !allow.length) return false;
  var group = GROUP_OF[key] || key;
  return allow.indexOf(group) !== -1;
}

/** 是不是还没拿到过身份（UI 想提示「未连接」时用） */
function isUnknown() {
  return getAllow() === null;
}

/**
 * 页面级守卫：没权限就退回首页，返回 `false` 让调用方直接 return。
 *
 * 只挡「直接跳转 / 分享路径 / 旧缓存」，**不是权限本身** —— 真隔离在后端
 * 接口（§18.2 三层）。用法：`onLoad() { if (!auth.guard('storage')) return; ... }`
 */
function guard(key) {
  if (can(key)) return true;
  wx.redirectTo({
    url: '/pages/index/index',
    fail: function () {
      wx.reLaunch({ url: '/pages/index/index' });
    }
  });
  return false;
}

/**
 * 调试身份的稳定 id。
 *
 * **必须稳定**：如果每次随机，后端每次都会建一个新用户、权限永远重置。
 * 后端配了 appsecret 之后，这个值会被忽略（走真 openid）。
 */
function getDevOpenid() {
  var id = readStorage(KEY_DEV_OPENID);
  if (id && typeof id === 'string') return id;
  id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  writeStorage(KEY_DEV_OPENID, id);
  return id;
}

module.exports = {
  getSession: getSession,
  setSession: setSession,
  clear: clear,
  getToken: getToken,
  getRole: getRole,
  getAllow: getAllow,
  needsRefresh: needsRefresh,
  can: can,
  guard: guard,
  isUnknown: isUnknown,
  getDevOpenid: getDevOpenid,
  GROUP_OF: GROUP_OF
};
