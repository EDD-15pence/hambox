/**
 * 反馈记录（F-03 / F-05）
 *
 * 入口：任何页面**长按**右下角气泡。按提交时间倒序，最新的在最上面。
 *
 * 两种手势，互不抢：
 * - **点一条** = 勾选（左侧圆圈）。勾住后底部浮出「删除 N 条」。
 * - **长按一条** = 复制正文，方便发给别人。长按触发后微信不会再补一个 tap。
 *
 * 删除是软删除：后端只盖 deleted_at，行还在库里。所以删完给 5 秒「撤销」，
 * 撤销是把同一行的 deleted_at 清回 NULL——时间、内容、位置全是原来的，
 * 不会变成一条新记录。
 *
 * 仍然不做：回复 / 工单状态 / 谁提的（没有账号）。见 AGENTS.md §16.8。
 */
var nav = require('../../utils/nav');
var theme = require('../../utils/theme');
var api = require('../../utils/api');
var timeText = require('../../utils/time-text');

var UNDO_SECONDS = 5;

Page({
  data: {
    isDark: false,
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    items: [],
    total: 0,
    loading: true,
    error: '',
    selectedCount: 0,
    allChecked: false,
    busy: false,
    undoVisible: false,
    undoCount: 0,
    undoSeconds: UNDO_SECONDS
  },

  onLoad: function () {
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT
    });
    this._undoIds = [];
    this._undoEntries = [];
    this.load();
  },

  onUnload: function () {
    this.clearUndoTimer();
  },

  load: function () {
    var self = this;
    this.clearUndoTimer();
    this.setData({
      loading: true,
      error: '',
      selectedCount: 0,
      allChecked: false,
      undoVisible: false
    });
    api.listFeedbacks(100, 0).then(function (data) {
      self.setData({
        loading: false,
        total: data.total,
        items: data.items.map(function (row) {
          return Object.assign({}, row, {
            checked: false,
            timeText: timeText.relative(row.createdAt)
          });
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

  /** 重算选中数量与「全选」态。选中是本地状态，不落库、不跨页面。 */
  syncSelection: function (items) {
    var count = 0;
    items.forEach(function (item) {
      if (item.checked) count += 1;
    });
    this.setData({
      items: items,
      selectedCount: count,
      allChecked: count > 0 && count === items.length
    });
  },

  onToggle: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === undefined || id === null) return;
    this.syncSelection(this.data.items.map(function (item) {
      return item.id === id ? Object.assign({}, item, { checked: !item.checked }) : item;
    }));
  },

  onToggleAll: function () {
    var next = !this.data.allChecked;
    this.syncSelection(this.data.items.map(function (item) {
      return Object.assign({}, item, { checked: next });
    }));
  },

  onClearSelect: function () {
    this.syncSelection(this.data.items.map(function (item) {
      return Object.assign({}, item, { checked: false });
    }));
  },

  /**
   * 删掉勾中的几条。
   *
   * 先记下每条的**原下标**，撤销时按升序插回去——不重新拉列表，
   * 这样滚动位置和下面的内容都不跳。
   */
  onDeleteSelected: function () {
    var self = this;
    if (this.data.busy || !this.data.selectedCount) return;

    var picked = [];
    this.data.items.forEach(function (item, index) {
      if (item.checked) picked.push({ index: index, item: item });
    });
    var ids = picked.map(function (entry) {
      return entry.item.id;
    });

    this.setData({ busy: true });
    api.deleteFeedbacks(ids).then(function (res) {
      var gone = {};
      picked.forEach(function (entry) {
        gone[entry.item.id] = true;
      });
      var remain = self.data.items.filter(function (item) {
        return !gone[item.id];
      });
      var deleted = (res && res.deleted_count) || ids.length;

      self._undoIds = ids;
      self._undoEntries = picked;
      self.setData({
        busy: false,
        items: remain,
        total: Math.max(0, self.data.total - deleted),
        selectedCount: 0,
        allChecked: false,
        undoVisible: true,
        undoCount: ids.length,
        undoSeconds: UNDO_SECONDS
      });
      self.startUndoTimer();
    }).catch(function (err) {
      self.setData({ busy: false });
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
    });
  },

  onUndo: function () {
    var self = this;
    if (this.data.busy) return;
    var ids = this._undoIds || [];
    if (!ids.length) {
      this.hideUndo();
      return;
    }

    this.setData({ busy: true });
    api.restoreFeedbacks(ids).then(function () {
      var items = self.data.items.slice();
      // 按原下标升序插回，先插前面的，后面那条的位置才对得上
      (self._undoEntries || []).slice().sort(function (a, b) {
        return a.index - b.index;
      }).forEach(function (entry) {
        var restored = Object.assign({}, entry.item, { checked: false });
        var at = Math.min(entry.index, items.length);
        items.splice(at, 0, restored);
      });

      self.setData({
        busy: false,
        items: items,
        total: self.data.total + ids.length,
        selectedCount: 0,
        allChecked: false
      });
      self.hideUndo();
      wx.showToast({ title: '已恢复', icon: 'none' });
    }).catch(function (err) {
      self.setData({ busy: false });
      wx.showToast({ title: (err && err.message) || '撤销失败', icon: 'none' });
    });
  },

  startUndoTimer: function () {
    var self = this;
    this.clearUndoTimer();
    this._undoTimer = setInterval(function () {
      var left = self.data.undoSeconds - 1;
      if (left <= 0) {
        self.hideUndo();
        return;
      }
      self.setData({ undoSeconds: left });
    }, 1000);
  },

  clearUndoTimer: function () {
    if (this._undoTimer) {
      clearInterval(this._undoTimer);
      this._undoTimer = null;
    }
  },

  /** 收掉撤销条。超过 5 秒就再也撤不回来了，但数据仍在库里。 */
  hideUndo: function () {
    this.clearUndoTimer();
    this._undoIds = [];
    this._undoEntries = [];
    if (this.data.undoVisible) {
      this.setData({ undoVisible: false, undoCount: 0, undoSeconds: UNDO_SECONDS });
    }
  },

  /** 长按一条把内容复制走，方便发给别人 */
  onCopy: function (e) {
    var text = e.currentTarget.dataset.text;
    if (!text) return;
    wx.setClipboardData({ data: text });
  }
});
