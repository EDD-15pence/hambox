/**
 * 记录 · 当天详情（R-02）
 *
 * 一天可以有很多条，日历只做索引，这里负责干活：记一条、改一条、删一条。
 *
 * 录入路径压到最短：**一行文本 → 记下**。拆分交给 utils/entry-text.js
 * （括号前是标题、括号里是评价、括号后进正文），拆不出来就整段当标题，
 * 详情里还能改。不做品类、评分、结构化表单 —— 那是记账软件，不是日记。
 */
var nav = require('../../utils/nav');
var theme = require('../../utils/theme');
var api = require('../../utils/api');
var entryText = require('../../utils/entry-text');

var WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad2(value) {
  return value < 10 ? '0' + value : '' + value;
}

function labelOf(dateStr) {
  var parts = String(dateStr || '').split('-');
  if (parts.length !== 3) return dateStr || '';
  var day = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return Number(parts[1]) + ' 月 ' + Number(parts[2]) + ' 日 ' + WEEKDAY[day.getDay()];
}

function clockOf(iso) {
  if (!iso) return '';
  var date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

Page({
  data: {
    isDark: false,
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    date: '',
    dateLabel: '',
    items: [],
    draft: '',
    focusDraft: false,
    loading: true,
    error: '',
    saving: false,
    // 编辑面板：null 表示关着
    editing: null
  },

  onLoad: function (options) {
    var date = (options && options.date) || '';
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT,
      date: date,
      dateLabel: labelOf(date)
    });
    this.load();
  },

  onShow: function () {
    // onLoad 之后必然紧跟一次 onShow，首次别再发一遍；之后每次回来都刷新
    if (!this.data.date) return;
    if (!this._loadedOnce) {
      this._loadedOnce = true;
      return;
    }
    this.load();
  },

  load: function () {
    var self = this;
    this.setData({ loading: this.data.items.length === 0, error: '' });
    api.listEntriesByDate(this.data.date)
      .then(function (data) {
        self.setData({
          loading: false,
          items: data.items.map(function (row) {
            return Object.assign({}, row, { clock: clockOf(row.createdAt) });
          })
        });
      })
      .catch(function (err) {
        self.setData({
          loading: false,
          error: (err && err.message) || '没拉到这一天的记录'
        });
      });
  },

  onRetry: function () {
    this.load();
  },

  onDraftInput: function (e) {
    this.setData({ draft: e.detail.value });
  },

  /** 一行文 → 一条记录。空输入直接忽略，不发请求也不报错。 */
  onSaveDraft: function () {
    var self = this;
    if (this.data.saving) return;
    var parsed = entryText.split(this.data.draft);
    if (!parsed) {
      wx.showToast({ title: '写一句再记', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    api.createEntry({
      entryDate: this.data.date,
      type: 'day',
      title: parsed.title,
      comment: parsed.comment,
      content: parsed.content
    }).then(function () {
      self.setData({ saving: false, draft: '', focusDraft: false });
      self.load();
    }).catch(function (err) {
      self.setData({ saving: false });
      wx.showToast({ title: (err && err.message) || '没记上', icon: 'none' });
    });
  },

  onOpenItem: function (e) {
    var id = e.currentTarget.dataset.id;
    var picked = null;
    this.data.items.forEach(function (item) {
      if (item.id === id) picked = item;
    });
    if (!picked) return;
    this.setData({
      editing: {
        id: picked.id,
        title: picked.title,
        comment: picked.comment,
        content: picked.content
      }
    });
  },

  onCloseEdit: function () {
    this.setData({ editing: null });
  },

  /** 面板内部点击不该关面板（冒泡到遮罩会关） */
  onNoop: function () {},

  onEditField: function (e) {
    var field = e.currentTarget.dataset.field;
    if (!field) return;
    var patch = {};
    patch['editing.' + field] = e.detail.value;
    this.setData(patch);
  },

  onSaveEdit: function () {
    var self = this;
    var editing = this.data.editing;
    if (!editing || this.data.saving) return;
    if (!String(editing.title || '').trim()) {
      wx.showToast({ title: '标题不能空着', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    api.updateEntry(editing.id, {
      title: String(editing.title).trim(),
      comment: String(editing.comment || '').trim(),
      content: String(editing.content || '').trim()
    }).then(function () {
      self.setData({ saving: false, editing: null });
      self.load();
    }).catch(function (err) {
      self.setData({ saving: false });
      wx.showToast({ title: (err && err.message) || '没保存上', icon: 'none' });
    });
  },

  onDeleteEntry: function () {
    var self = this;
    var editing = this.data.editing;
    if (!editing) return;
    wx.showModal({
      title: '删掉这条？',
      content: '删了就找不回来了',
      confirmText: '删掉',
      confirmColor: '#B42318',
      success: function (res) {
        if (!res.confirm) return;
        api.deleteEntry(editing.id).then(function () {
          self.setData({ editing: null });
          self.load();
          wx.showToast({ title: '已删掉', icon: 'none' });
        }).catch(function (err) {
          wx.showToast({ title: (err && err.message) || '没删掉', icon: 'none' });
        });
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
