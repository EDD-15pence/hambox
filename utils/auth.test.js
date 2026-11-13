/**
 * utils/auth.js 单测（U-02）
 *
 * auth.js 直接摸 wx.*，先 mock 再 require。只测纯逻辑：
 * 存取、过期判断、ACL 判定、调试身份的稳定性 —— 网络请求在 api.js 那层。
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
  redirectTo: function (opt) {
    store.__redirect = opt && opt.url;
  }
};

var auth = require('./auth');

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

function reset() {
  Object.keys(store).forEach(function (k) {
    delete store[k];
  });
}

function futureIso(hours) {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString().replace('Z', '');
}

// ---------- 空状态 ----------

reset();
check('没登录时 getSession 为 null', auth.getSession(), null);
check('没登录时 getToken 为空串', auth.getToken(), '');
check('没登录时 isUnknown', auth.isUnknown(), true);
check('没登录时要刷新', auth.needsRefresh(), true);
// 未知身份放行，避免首次安装时首页空白（真隔离靠后端接口）
check('未知身份默认放行', auth.can('storage'), true);

// ---------- 存取 ----------

reset();
var session = auth.setSession({
  token: 'abc.def',
  openid: 'dev-1',
  role: 'admin',
  note: '我',
  allow: '*',
  source: 'dev',
  expires_at: futureIso(24)
});

check('存完能读回 role', auth.getRole(), 'admin');
check('存完能读回 token', auth.getToken(), 'abc.def');
check('存完 isUnknown 为 false', auth.isUnknown(), false);
check('expires_at 被解析成时间戳', typeof session.expiresAt === 'number' && session.expiresAt > Date.now(), true);

auth.clear();
check('clear 后 getSession 为 null', auth.getSession(), null);

// ---------- ACL 判定 ----------

reset();
auth.setSession({ token: 't', allow: '*', role: 'admin', expires_at: futureIso(24) });
check('全放行时 storage 可见', auth.can('storage'), true);
check('全放行时随便什么 key 都可见', auth.can('correction'), true);

reset();
auth.setSession({ token: 't', allow: ['shop', 'feedback-submit'], role: 'shop', expires_at: futureIso(24) });
check('shop 档可见 shop', auth.can('shop'), true);
check('shop 档看不到 storage', auth.can('storage'), false);
check('shop 档看不到 record', auth.can('record'), false);

// 关键：quick 写的就是 items 表，必须和 storage 同组
reset();
auth.setSession({ token: 't', allow: ['storage'], role: 'admin', expires_at: futureIso(24) });
check('storage 放行时 quick 也放行', auth.can('quick'), true);
check('quick 归组映射正确', auth.GROUP_OF.quick, 'storage');

reset();
auth.setSession({ token: 't', allow: [], role: 'guest', expires_at: futureIso(24) });
check('空 allowlist 全部拒绝', auth.can('storage'), false);
check('空 allowlist 连 shop 也拒绝', auth.can('shop'), false);
check('已登录但无权限时 isUnknown 为 false', auth.isUnknown(), false);

// ---------- 过期判断 ----------

reset();
auth.setSession({ token: 't', allow: '*', expires_at: futureIso(48) });
check('48 小时后到期 → 不用刷', auth.needsRefresh(), false);

reset();
auth.setSession({ token: 't', allow: '*', expires_at: futureIso(1) });
check('1 小时后到期 → 要刷（提前 2 小时）', auth.needsRefresh(), true);

reset();
auth.setSession({ token: 't', allow: '*', expires_at: futureIso(-1) });
check('已过期 → 要刷', auth.needsRefresh(), true);

// 带时区后缀的不能补 Z，否则解析失败、永远不刷新
reset();
var tz = auth.setSession({ token: 't', allow: '*', expires_at: '2030-01-01T00:00:00+00:00' });
check('带时区后缀能解析', tz.expiresAt > 0, true);

// 解析不出来时当作要刷新，不能抱着一颗不知道何时失效的 token
reset();
var broken = auth.setSession({ token: 't', allow: '*', expires_at: '不是时间' });
check('时间格式坏时 expiresAt 为 0', broken.expiresAt, 0);
check('时间格式坏时要刷新', auth.needsRefresh(), true);

// ---------- 调试身份 ----------

reset();
var first = auth.getDevOpenid();
var second = auth.getDevOpenid();
check('调试身份首次有值', typeof first === 'string' && first.length > 4, true);
// 不稳定就会每次登录新建一个用户、权限永远重置
check('调试身份两次一致', first, second);
check('调试身份带 dev- 前缀', first.indexOf('dev-'), 0);

reset();
auth.setSession({ token: 't', allow: '*', expires_at: futureIso(24) });
check('clear 不清调试身份', (auth.clear(), auth.getDevOpenid().indexOf('dev-')), 0);


reset();
auth.setSession({ token: 't', role: 'shop', allow: ['shop', 'feedback-submit'], expires_at: futureIso(24) });
check('shop 能进店铺记', auth.can('shop'), true);
check('shop 进不了仓储', auth.can('storage'), false);
// quick 与 storage 是同一组数据，只藏 storage 等于没藏（§18.9.2）
check('quick 跟随 storage 一起挡住', auth.can('quick'), false);
check('shop 看不到反馈列表', auth.can('feedback'), false);
check('shop 能提交反馈', auth.can('feedback-submit'), true);
check('shop 进不了记录', auth.can('record'), false);
check('shop 进不了设置页', auth.can('settings'), false);

reset();
auth.setSession({ token: 't', role: 'guest', allow: [], expires_at: futureIso(24) });
check('guest 全挡：店铺记', auth.can('shop'), false);
check('guest 全挡：亲属称呼', auth.can('relationship'), false);

reset();
auth.setSession({ token: 't', role: 'shop', allow: ['shop', 'feedback-submit'], expires_at: futureIso(24) });
check('有权限时 guard 放行', auth.guard('shop'), true);
check('没权限时 guard 拦住', auth.guard('storage'), false);
check('拦住会退回首页', store.__redirect, '/pages/index/index');

reset();
check('没有身份时 guard 放行（真隔离在后端）', auth.guard('storage'), true);

// 会话刷新口径：ACL 为空必须重登，否则「后台已授权、手机永远白屏」
reset();
auth.setSession({ token: 't', role: 'admin', allow: '*', expires_at: futureIso(24) });
check('新鲜的全权会话不重登', auth.needsRefresh(), false);

reset();
auth.setSession({ token: 't', role: 'shop', allow: ['shop'], expires_at: futureIso(24) });
check('新鲜的分权会话不重登', auth.needsRefresh(), false);

reset();
auth.setSession({ token: 't', role: 'guest', allow: [], expires_at: futureIso(24) });
check('ACL 为空的会话每次都重登', auth.needsRefresh(), true);

reset();
auth.setSession({ token: 't', role: 'admin', allow: '*', expires_at: futureIso(1) });
check('快过期的会话提前重登', auth.needsRefresh(), true);

console.log(pass + ' ok, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
