/**
 * 智能仓储 - 容器墙 / 容器内部（S-02 / S-03）
 *
 * 同一份物品数据的另一种视图：按 location 把东西归到冰箱、药箱、储物柜这些具体容器里。
 * 零后端改动 —— 数据还是 GET /api/items 那一份，归位规则全在 utils/containers.js。
 *
 * 一个页面两种视图（wall / inside）：数据只拉一次，进来出去都不重新请求。
 */
var api = require('../../../utils/api');
var nav = require('../../../utils/nav');
var theme = require('../../../utils/theme');
var containers = require('../../../utils/containers');

Page({
  data: {
    isDark: false,
    // 'wall' 容器墙 | 'inside' 某个容器内部
    view: 'wall',
    wall: [],
    active: null,
    total: 0,
    warning: 0,
    expired: 0,
    loading: true,
    retrying: false,
    loadError: '',
    baseUrl: ''
  },

  onLoad: function () {
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      baseUrl: api.getBaseUrl()
    });
    // 首次拉取交给 onShow（onLoad 之后必然触发），避免进页面连发两轮
  },

  /** 从详情页改完位置回来，容器归属可能变了，重新摊一次 */
  onShow: function () {
    this.loadWall();
  },

  loadWall: function () {
    var self = this;
    this.setData({ loading: !this.data.loadError, retrying: !!this.data.loadError });
    return api.listItems()
      .then(function (items) {
        var grouped = containers.groupByContainer(items);
        self.setData({
          loading: false,
          retrying: false,
          loadError: '',
          wall: grouped.wall,
          total: grouped.total,
          warning: grouped.warning,
          expired: grouped.expired
        });
        // 停在某个容器里时刷新：这一格的东西可能已经被改过
        if (self.data.active) {
          var card = null;
          for (var i = 0; i < grouped.wall.length; i++) {
            if (grouped.wall[i].id === self.data.active.id) { card = grouped.wall[i]; break; }
          }
          if (card) {
            self.setData({ active: card });
          } else {
            // 容器已经被清空，退回墙上
            self.setData({ view: 'wall', active: null });
          }
        }
      })
      .catch(function (err) {
        self.setData({
          loading: false,
          retrying: false,
          loadError: (err && err.message) || '请求失败'
        });
      });
  },

  onRetry: function () {
    this.loadWall();
  },

  onOpenContainer: function (e) {
    var id = e.currentTarget.dataset.id;
    var card = null;
    for (var i = 0; i < this.data.wall.length; i++) {
      if (this.data.wall[i].id === id) { card = this.data.wall[i]; break; }
    }
    if (!card) return;
    this.setData({ view: 'inside', active: card });
  },

  /** 容器内返回墙；墙上返回仓储列表 */
  onBack: function () {
    if (this.data.view === 'inside') {
      this.setData({ view: 'wall', active: null });
      return;
    }
    wx.navigateBack({
      delta: 1,
      fail: function () { wx.reLaunch({ url: '/pages/index/index' }); }
    });
  },

  onTapTile: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/storage/detail/detail?id=' + encodeURIComponent(id)
    });
  },

  onGoList: function () {
    wx.navigateTo({ url: '/pages/storage/list/list' });
  },

  onToggleTheme: function () {
    this.setData({ isDark: theme.toggleTheme() });
  }
});
