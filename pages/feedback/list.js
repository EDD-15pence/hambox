/**
 * 反馈记录（F-03）
 *
 * 入口：任何页面**长按**右下角气泡。按提交时间倒序，最新的在最上面。
 * 只读：不提供删除/回复/改状态（见 AGENTS.md §16.8）。
 */
var nav = require('../../utils/nav');
var theme = require('../../utils/theme');
var api = require('../../utils/api');
var timeText = require('../../utils/time-text');

Page({
  data: {
    isDark: false,
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    items: [],
    total: 0,
    loading: true,
    error: ''
  },

  onLoad: function () {
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT
    });
    this.load();
  },

  load: function () {
    var self = this;
    this.setData({ loading: true, error: '' });
    api.listFeedbacks(100, 0).then(function (data) {
      self.setData({
        loading: false,
        total: data.total,
        items: data.items.map(function (row) {
          return Object.assign({}, row, { timeText: timeText.relative(row.createdAt) });
        })
      });
    }).catch(function (err) {
      self.setData({
        loading: false,
        error: (err && err.message) || '没拉到反馈记录'
      });
    });
  },

  onRefresh: function () {
    this.load();
  },

  onBack: function () {
    wx.navigateBack();
  },

  /** 长按一条把内容复制走，方便发给别人 */
  onCopy: function (e) {
    var text = e.currentTarget.dataset.text;
    if (!text) return;
    wx.setClipboardData({ data: text });
  }
});
