/**
 * 连接设置（债-1 隐藏页）
 *
 * 入口：首页页脚长按版本号。刻意不做成一级菜单 —— 它服务的是「换网段 / 换令牌」
 * 这种一年一次的运维动作，摆在明面上只会让人误点。
 *
 * 改完立刻写进 Storage（utils/env.js 的覆盖层），下一次请求就按新地址走，
 * 不用改代码再上传一版。恢复默认就把覆盖整个删掉，回落到代码包里的常量。
 */
var env = require('../../utils/env');
var nav = require('../../utils/nav');
var theme = require('../../utils/theme');
var version = require('../../utils/version');

/** 把 wx 的 errMsg 压成一句人话，跟 utils/api.js 保持同一套说法 */
function briefErr(errMsg) {
  var m = String(errMsg || '').replace(/^request:fail\s*/, '');
  if (m.indexOf('domain list') !== -1) return '域名没放行（真机只认 HTTPS 白名单）';
  if (m.indexOf('timeout') !== -1) return '超时';
  if (m.indexOf('ERR_NAME_NOT_RESOLVED') !== -1) return '域名解析失败';
  if (m.indexOf('ERR_CONNECTION_REFUSED') !== -1) return '连接被拒（服务没起或防火墙拦）';
  if (m.indexOf('ERR_CONNECTION_RESET') !== -1) return '连接被重置';
  if (m.indexOf('ssl') !== -1 || m.indexOf('certificate') !== -1) return '证书错误';
  return m.slice(0, 30) || '连不上';
}

/** 手填容易漏协议：补一个 http:// 比报错更好用 */
function normalizeInput(value) {
  var v = String(value || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v.replace(/\/+$/, '');
  return 'http://' + v.replace(/\/+$/, '');
}

/** 打一次 /api/health。这个接口不带令牌也能通，正好用来验地址 */
function probe(base, token) {
  return new Promise(function (resolve) {
    wx.request({
      url: base + '/api/health',
      method: 'GET',
      timeout: 4000,
      header: token ? { 'X-Api-Token': token } : {},
      success: function (res) {
        var body = res.data || {};
        if (res.statusCode === 401) {
          resolve({ ok: false, text: '令牌不对（401）' });
          return;
        }
        if (res.statusCode === 200 && body.code === 0) {
          var d = body.data || {};
          var tail = d.auth_required ? '' : ' · 后端没设令牌';
          resolve({ ok: true, text: '通 · ' + (d.item_count || 0) + ' 件' + tail });
          return;
        }
        resolve({ ok: false, text: '返回 ' + res.statusCode });
      },
      fail: function (err) {
        resolve({ ok: false, text: briefErr(err && err.errMsg) });
      }
    });
  });
}

Page({
  data: {
    isDark: false,
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    versionText: '',
    lan: '',
    wan: '',
    token: '',
    defaults: { lan: '', wan: '', token: '' },
    custom: { lan: false, wan: false, token: false },
    routeLabel: '',
    dirtyText: '未改',
    maskToken: true,
    testing: false,
    testRows: []
  },

  onLoad() {
    this.setData({
      isDark: theme.getTheme(),
      versionText: version.describe(),
      defaults: env.getDefaults()
    });
    this.refresh();
  },

  onShow() {
    var isDark = theme.getTheme();
    if (isDark !== this.data.isDark) this.setData({ isDark });
    // 从别处改过配置再回来，这里要跟上
    this.refresh();
  },

  /** 把「已保存的值」重新读进输入框（不含未保存的编辑） */
  refresh() {
    var ov = env.getOverride();
    var custom = {
      lan: env.isCustom('lan'),
      wan: env.isCustom('wan'),
      token: !!ov.token
    };
    var count = (custom.lan ? 1 : 0) + (custom.wan ? 1 : 0) + (custom.token ? 1 : 0);
    this.setData({
      lan: ov.lan,
      wan: ov.wan,
      token: ov.token,
      custom: custom,
      routeLabel: env.getRouteLabel(),
      dirtyText: count ? count + ' 项已改' : '未改'
    });
  },

  onInput(e) {
    var field = e.currentTarget.dataset.field;
    if (!field) return;
    var patch = {};
    patch[field] = e.detail.value;
    this.setData(patch);
  },

  /** 令牌默认打码：截图发群里不该把令牌带出去 */
  onToggleMask() {
    this.setData({ maskToken: !this.data.maskToken });
  },

  onSave() {
    var lan = normalizeInput(this.data.lan);
    var wan = normalizeInput(this.data.wan);
    if (lan && !/^https?:\/\/[^\s]+$/i.test(lan)) {
      wx.showToast({ title: '局域网地址格式不对', icon: 'none' });
      return;
    }
    if (wan && !/^https?:\/\/[^\s]+$/i.test(wan)) {
      wx.showToast({ title: '外网地址格式不对', icon: 'none' });
      return;
    }
    if (!lan && !wan) {
      wx.showToast({ title: '至少留一条线路', icon: 'none' });
      return;
    }
    env.setOverride({ lan: lan, wan: wan, token: this.data.token });
    this.refresh();
    wx.showToast({ title: '已保存', icon: 'none' });
  },

  /** 用输入框里的值测（没保存也能测），逐条列出结果 */
  onTest() {
    var self = this;
    if (this.data.testing) return;
    var list = [];
    var lan = normalizeInput(this.data.lan);
    var wan = normalizeInput(this.data.wan);
    if (lan) list.push({ key: 'lan', label: '局域网', base: lan });
    if (wan) list.push({ key: 'wan', label: '外网', base: wan });
    if (!list.length) {
      wx.showToast({ title: '先填一个地址', icon: 'none' });
      return;
    }

    this.setData({ testing: true, testRows: [] });
    var token = String(this.data.token || '').trim();

    // 串行：内网那条在真机上必然失败，并发只是让两个 4 秒超时叠着等
    var rows = [];
    function step() {
      if (!list.length) {
        self.setData({ testing: false, testRows: rows });
        return;
      }
      var item = list.shift();
      probe(item.base, token).then(function (r) {
        rows.push({ label: item.label, base: item.base, ok: r.ok, text: r.text });
        self.setData({ testRows: rows.slice() });
        step();
      });
    }
    step();
  },

  onReset() {
    var self = this;
    wx.showModal({
      title: '恢复默认',
      content: '会清掉这台手机上的地址与令牌改动，回到代码包里的值。',
      confirmText: '恢复',
      success: function (res) {
        if (!res.confirm) return;
        env.clearOverride();
        self.refresh();
        wx.showToast({ title: '已恢复默认', icon: 'none' });
      }
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1, fail: function () { wx.reLaunch({ url: '/pages/index/index' }); } });
  }
});
