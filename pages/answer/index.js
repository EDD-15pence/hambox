/**
 * 版本答案（R-03）
 *
 * 输入关键词 → 直接看到「下次该选哪个」。结果全列（不做「最佳答案」取舍），
 * 按 star + 更新时间排。点一张卡就是复制整句答案 —— 主操作只有这一个。
 *
 * 同关键词再记是**覆盖**（后端 `keyword` 唯一），所以三个月后搜「奶茶」
 * 只有一条最新结论，不会翻出八条旧尝试。要翻历史去记录模块。
 */
var nav = require('../../utils/nav');
var theme = require('../../utils/theme');
var api = require('../../utils/api');

var SEARCH_DEBOUNCE = 250;

Page({
  data: {
    isDark: false,
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    query: '',
    items: [],
    total: 0,
    loading: true,
    error: '',
    // 录入 / 编辑面板：null 表示关着
    form: null,
    saving: false,
    verdicts: ['', '推荐', '踩雷'],
    whos: ['', '我', '她', '一起']
  },

  onLoad: function () {
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT
    });
    this.load();
  },

  onShow: function () {
    if (!this._loadedOnce) {
      this._loadedOnce = true;
      return;
    }
    this.load();
  },

  onUnload: function () {
    if (this._timer) clearTimeout(this._timer);
  },

  load: function () {
    var self = this;
    this.setData({ loading: this.data.items.length === 0, error: '' });
    api.listAnswers(this.data.query)
      .then(function (data) {
        self.setData({ loading: false, items: data.items, total: data.total });
      })
      .catch(function (err) {
        self.setData({
          loading: false,
          error: (err && err.message) || '没拉到答案'
        });
      });
  },

  onRetry: function () {
    this.load();
  },

  /** 输入即筛：250ms 防抖，打字过程中不打后端 */
  onQueryInput: function (e) {
    var self = this;
    var value = e.detail.value;
    this.setData({ query: value });
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(function () {
      self.load();
    }, SEARCH_DEBOUNCE);
  },

  onClearQuery: function () {
    this.setData({ query: '' });
    this.load();
  },

  /** 点卡片 = 复制答案，这是这一页最常做的事 */
  onCopyAnswer: function (e) {
    var text = e.currentTarget.dataset.answer;
    if (!text) return;
    wx.setClipboardData({ data: text });
  },

  /** 长按 = 改 / 删 */
  onEditAnswer: function (e) {
    var id = e.currentTarget.dataset.id;
    var picked = null;
    this.data.items.forEach(function (item) {
      if (item.id === id) picked = item;
    });
    if (!picked) return;
    this.setData({
      form: {
        id: picked.id,
        keyword: picked.keyword,
        answer: picked.answer,
        verdict: picked.verdict,
        who: picked.who
      }
    });
  },

  onOpenCreate: function () {
    this.setData({ form: { id: null, keyword: '', answer: '', verdict: '', who: '' } });
  },

  onCloseForm: function () {
    this.setData({ form: null });
  },

  onNoop: function () {},

  onFormField: function (e) {
    var field = e.currentTarget.dataset.field;
    if (!field) return;
    var patch = {};
    patch['form.' + field] = e.detail.value;
    this.setData(patch);
  },

  onPickVerdict: function (e) {
    this.setData({ 'form.verdict': e.currentTarget.dataset.value || '' });
  },

  onPickWho: function (e) {
    this.setData({ 'form.who': e.currentTarget.dataset.value || '' });
  },

  onSaveForm: function () {
    var self = this;
    var form = this.data.form;
    if (!form || this.data.saving) return;

    var keyword = String(form.keyword || '').trim();
    var answer = String(form.answer || '').trim();
    if (!keyword || !answer) {
      wx.showToast({ title: '关键词和答案都要写', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    var task = form.id
      ? api.updateAnswer(form.id, { keyword: keyword, answer: answer, verdict: form.verdict, who: form.who })
      : api.createAnswer({ keyword: keyword, answer: answer, verdict: form.verdict, who: form.who });

    task.then(function (result) {
      self.setData({ saving: false, form: null });
      self.load();
      // 新建时后端可能把同名答案覆盖了，明确告诉用户，免得以为多了一条
      if (result && result.created === false) {
        wx.showToast({ title: '同名答案已更新', icon: 'none' });
      }
    }).catch(function (err) {
      self.setData({ saving: false });
      wx.showToast({ title: (err && err.message) || '没保存上', icon: 'none' });
    });
  },

  onDeleteAnswer: function () {
    var self = this;
    var form = this.data.form;
    if (!form || !form.id) return;
    wx.showModal({
      title: '删掉这条答案？',
      content: '「' + form.keyword + '」',
      confirmText: '删掉',
      confirmColor: '#B42318',
      success: function (res) {
        if (!res.confirm) return;
        api.deleteAnswer(form.id).then(function () {
          self.setData({ form: null });
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
