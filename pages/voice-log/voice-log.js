/**
 * 语音识别日志：看清"听成了什么 → 拆成了什么 → 最后存了什么"
 * 入口：长按首页悬浮麦克风。
 */
var nav = require('../../utils/nav');
var theme = require('../../utils/theme');
var voiceLog = require('../../utils/voice-log');
var env = require('../../utils/env');

var FIELD_NAMES = {
  name: '名称',
  quantity: '数量',
  unit: '单位',
  location: '位置',
  expireDate: '过期日'
};

Page({
  data: {
    isDark: false,
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    routeLabel: '',
    baseUrl: '',
    logs: [],
    count: 0
  },

  onLoad: function () {
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT,
      routeLabel: env.getRouteLabel(),
      baseUrl: env.getBaseUrl()
    });
    this.loadLogs();
  },

  loadLogs: function () {
    var logs = voiceLog.list().map(function (e) {
      return {
        t: e.t,
        timeText: voiceLog.timeText(e.t),
        raw: e.raw,
        fixed: e.fixed,
        saved: e.saved !== false,
        parsedText: voiceLog.fieldText(e.parsed),
        finalText: voiceLog.fieldText(e.final),
        changedText: (e.changed || []).map(function (k) {
          return FIELD_NAMES[k] || k;
        }).join('、')
      };
    });
    this.setData({ logs: logs, count: logs.length });
  },

  onCopyAll: function () {
    if (!this.data.count) {
      wx.showToast({ title: '没有可复制的记录', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: voiceLog.exportText(),
      success: function () {
        wx.showToast({ title: '已复制，可直接发给开发者', icon: 'none', duration: 2000 });
      }
    });
  },

  onClear: function () {
    var self = this;
    wx.showModal({
      title: '清空识别日志',
      content: '清掉后就看不到之前的识别问题了，确定吗？',
      confirmText: '清空',
      confirmColor: '#B42318',
      success: function (r) {
        if (!r.confirm) return;
        voiceLog.clear();
        self.loadLogs();
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  },

  onBack: function () {
    wx.navigateBack({
      delta: 1,
      fail: function () { wx.reLaunch({ url: '/pages/index/index' }); }
    });
  }
});
