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
var storageView = require('../../../utils/storage-view');

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
    baseUrl: '',
    // 搜索：命中的柜子留在墙上，柜内命中的块亮着、其余变暗
    showSearch: false,
    keyword: '',
    hitTotal: 0
  },

  onLoad: function () {
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT,
      baseUrl: api.getBaseUrl()
    });
    // 从清单模式切回来时，回到切换前停留的那个柜子（只恢复一次）
    this._restoreActiveId = storageView.loadActiveContainer();
    // 在清单页搜了「可乐」再切过来，墙上直接把可乐所在的柜子点亮
    var listState = storageView.loadListState();
    if (listState && listState.keyword) {
      this.setData({ keyword: listState.keyword, showSearch: true });
    }
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
        // 留一份没被搜索过滤的墙，改关键词时不用重新请求
        self._rawWall = grouped.wall;
        var search = containers.applyKeyword(grouped.wall, self.data.keyword);

        // 要停在哪个容器里：切换模式带过来的优先，其次是当前已经打开的那个。
        // 容器被清空（或搜索后没命中）就退回墙上，不留一个空壳 detail。
        var wantId = self._restoreActiveId || (self.data.active && self.data.active.id) || '';
        self._restoreActiveId = '';
        var card = null;
        if (wantId) {
          for (var i = 0; i < search.wall.length; i++) {
            if (search.wall[i].id === wantId) { card = search.wall[i]; break; }
          }
        }

        self.setData({
          loading: false,
          retrying: false,
          loadError: '',
          wall: search.wall,
          hitTotal: search.hitTotal,
          total: grouped.total,
          warning: grouped.warning,
          expired: grouped.expired,
          active: card,
          view: card ? 'inside' : 'wall'
        });
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

  // ==============================
  // 搜索（S-04）：命中的柜子留在墙上，柜里那几件亮着
  // ==============================
  onToggleSearch: function () {
    var show = !this.data.showSearch;
    this.setData({ showSearch: show });
    if (!show) this.applyKeyword('');
  },

  onSearchInput: function (e) {
    this.applyKeyword(e.detail.value);
  },

  onClearSearch: function () {
    this.applyKeyword('');
  },

  /** 只在内存里重算，不再请求接口 */
  applyKeyword: function (keyword) {
    var search = containers.applyKeyword(this._rawWall || [], keyword);
    var patch = { keyword: keyword, wall: search.wall, hitTotal: search.hitTotal };

    // 正停在某个柜子里：同步换成带命中标记的那一份（否则点进去看不到高亮）
    if (this.data.active) {
      var card = null;
      for (var i = 0; i < search.wall.length; i++) {
        if (search.wall[i].id === this.data.active.id) { card = search.wall[i]; break; }
      }
      patch.active = card;
      if (!card) patch.view = 'wall';
    }
    this.setData(patch);
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

  /**
   * 容器 / 清单切换
   *
   * 用 redirectTo 替换当前页而不是 navigateTo：来回切几次不会堆一串页面栈，
   * 返回键一下就回首页。停在柜子里时把柜子记下来，切回来还停在那儿。
   */
  onSwitchMode: function (e) {
    var mode = e.currentTarget.dataset.mode;
    if (!mode || mode === 'containers') return;
    storageView.saveActiveContainer(
      this.data.view === 'inside' && this.data.active ? this.data.active.id : ''
    );
    storageView.setMode('list');
    wx.redirectTo({ url: storageView.urlForMode('list') });
  },

  onGoQuick: function () {
    wx.navigateTo({ url: '/pages/storage/quick/quick' });
  },

  /**
   * 容器内「＋ 记一件」：把当前位置带过去预填
   *
   * 只预填，不锁死 —— 口语里说了「放阳台」就以口语为准，
   * 解析仍走 quick-parse 那一套，不为容器页写第二套规则。
   * 保存后自动返回，这一页 onShow 会重拉并把新块显示在当前柜子里。
   */
  onAddHere: function (e) {
    var containerId = e.currentTarget.dataset.container;
    var zoneKey = e.currentTarget.dataset.zone || '';
    if (!containerId) return;
    var url = '/pages/storage/quick/quick?container=' + encodeURIComponent(containerId);
    if (zoneKey) url += '&zone=' + encodeURIComponent(zoneKey);
    wx.navigateTo({ url: url });
  },

  onToggleTheme: function () {
    this.setData({ isDark: theme.toggleTheme() });
  }
});
