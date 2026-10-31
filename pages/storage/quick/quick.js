/**
 * 智能仓储 - 快速记录页
 *
 * 一句话（尽量口语）→ 自动拆出 名称/分类/数量/生产日期/保质期/过期日/位置 → 一条记录。
 * 语音：用系统键盘自带的听写（点输入框 → 键盘麦克风 → 说完点「解析」），不依赖微信同声传译插件。
 */
var api = require('../../../utils/api');
var storageUtils = require('../../../utils/storage-utils');
var quickParse = require('../../../utils/quick-parse');

var EMPTY_DRAFT = {
  name: '',
  category: 'food',
  quantity: 1,
  unit: '个',
  location: '',
  produceDate: '',
  expireDate: '',
  shelfLifeMonths: '',
  shelfLifeDays: ''
};

Page({
  data: {
    isDark: false,
    raw: '',
    draft: Object.assign({}, EMPTY_DRAFT),
    categories: [],
    categoryNames: [],
    categoryIndex: 0,
    unitIndex: 0,
    presetUnits: storageUtils.PRESET_UNITS,
    missing: [],
    parsed: false,
    saving: false,
    savedCount: 0,
    statusText: '',
    daysLeft: null,
    todayText: ''
  },

  onLoad: function () {
    var todayText = storageUtils.todayDate();
    this.setData({
      isDark: wx.getStorageSync('darkMode') || false,
      todayText: todayText
    });
    this.loadCategories();
  },

  onShow: function () {
    if (!this.data.categories.length) this.loadCategories();
  },

  loadCategories: function () {
    var self = this;
    return api.listCategories()
      .then(function (categories) {
        self.setData({
          categories: categories,
          categoryNames: categories.map(function (c) { return c.icon + ' ' + c.name; })
        });
      })
      .catch(function (err) {
        wx.showToast({ title: err.message, icon: 'none', duration: 2500 });
      });
  },

  // ==============================
  // 输入 → 解析
  // ==============================
  onRawInput: function (e) {
    var value = e.detail.value;
    this.setData({ raw: value });
    this.scheduleParse();
  },

  scheduleParse: function () {
    var self = this;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(function () {
      self.parse();
    }, 260);
  },

  onParseTap: function () {
    this.parse();
  },

  parse: function () {
    var raw = (this.data.raw || '').trim();
    if (!raw) {
      this.setData({ parsed: false, missing: [], statusText: '', daysLeft: null });
      return;
    }
    var result = quickParse.parseQuickInput(raw, { today: this.data.todayText });
    var draft = {
      name: result.name,
      category: result.categoryId,
      quantity: result.quantity,
      unit: result.unit || '个',
      location: result.location,
      produceDate: result.produceDate,
      expireDate: result.expireDate,
      shelfLifeMonths: result.shelfLifeMonths || '',
      shelfLifeDays: result.shelfLifeDays || ''
    };
    this.setData({ draft: draft, parsed: true, missing: result.missing });
    this.syncPickers();
    this.refreshStatus(draft.expireDate);
  },

  /** 下拉选择器要的是下标，把 draft 里的 id/单位换算成 index */
  syncPickers: function () {
    var draft = this.data.draft;
    var categories = this.data.categories;
    var categoryIndex = 0;
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].id === draft.category) { categoryIndex = i; break; }
    }
    var unitIndex = this.data.presetUnits.indexOf(draft.unit);
    if (unitIndex < 0) unitIndex = 0;
    this.setData({ categoryIndex: categoryIndex, unitIndex: unitIndex });
  },

  refreshStatus: function (expireDate) {
    if (!expireDate) {
      this.setData({ statusText: '', daysLeft: null });
      return;
    }
    var daysLeft = storageUtils.calcDaysLeft(expireDate);
    var status = storageUtils.calcStatus(daysLeft);
    var text = '';
    if (status === 'expired') text = '已过期 ' + Math.abs(daysLeft) + ' 天';
    else if (status === 'warning') text = '还剩 ' + daysLeft + ' 天（临期）';
    else if (status === 'fresh') text = '还剩 ' + daysLeft + ' 天';
    this.setData({ daysLeft: daysLeft, statusText: text });
  },

  // ==============================
  // 预览里的就地修改
  // ==============================
  onFieldInput: function (e) {
    var field = e.currentTarget.dataset.field;
    var value = e.detail.value;
    var patch = {};
    patch['draft.' + field] = value;
    this.setData(patch);
    if (field === 'quantity') {
      this.setData({ 'draft.quantity': Number(value) || 1 });
    }
  },

  onCategoryChange: function (e) {
    var idx = Number(e.detail.value);
    var cat = this.data.categories[idx];
    if (!cat) return;
    this.setData({ 'draft.category': cat.id, categoryIndex: idx });
  },

  onUnitChange: function (e) {
    var idx = Number(e.detail.value);
    this.setData({ 'draft.unit': this.data.presetUnits[idx] || '个', unitIndex: idx });
  },

  onProduceDateChange: function (e) {
    this.setData({ 'draft.produceDate': e.detail.value });
    this.recalcExpire();
  },

  onExpireDateChange: function (e) {
    this.setData({ 'draft.expireDate': e.detail.value });
    this.refreshStatus(e.detail.value);
  },

  onShelfMonthsInput: function (e) {
    this.setData({ 'draft.shelfLifeMonths': e.detail.value, 'draft.shelfLifeDays': '' });
    this.recalcExpire();
  },

  onShelfDaysInput: function (e) {
    this.setData({ 'draft.shelfLifeDays': e.detail.value, 'draft.shelfLifeMonths': '' });
    this.recalcExpire();
  },

  recalcExpire: function () {
    var draft = this.data.draft;
    var expire = '';
    if (draft.produceDate) {
      var months = parseInt(draft.shelfLifeMonths, 10);
      var days = parseInt(draft.shelfLifeDays, 10);
      if (months > 0) expire = quickParse.addMonths(draft.produceDate, months);
      else if (days > 0) expire = quickParse.addDays(draft.produceDate, days);
    }
    this.setData({ 'draft.expireDate': expire });
    this.refreshStatus(expire);
  },

  // ==============================
  // 保存
  // ==============================
  onSave: function () {
    var self = this;
    if (this.data.saving) return;

    var draft = this.data.draft;
    if (!draft.name || !draft.name.trim()) {
      wx.showToast({ title: '还没识别出名称，补一下或换个说法', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });

    var payload = {
      name: draft.name.trim(),
      category: draft.category,
      quantity: draft.quantity,
      unit: draft.unit,
      location: draft.location,
      produceDate: draft.produceDate,
      expireDate: draft.expireDate,
      note: this.data.raw
    };

    api.createItem(payload)
      .then(function () {
        wx.hideLoading();
        self.setData({
          saving: false,
          savedCount: self.data.savedCount + 1,
          raw: '',
          draft: Object.assign({}, EMPTY_DRAFT),
          categoryIndex: 0,
          unitIndex: 0,
          missing: [],
          parsed: false,
          statusText: '',
          daysLeft: null
        });
        wx.showToast({ title: '已记录', icon: 'success', duration: 800 });
      })
      .catch(function (err) {
        wx.hideLoading();
        self.setData({ saving: false });
        wx.showToast({ title: err.message, icon: 'none', duration: 2500 });
      });
  },

  onSaveAndDetail: function () {
    var self = this;
    if (this.data.saving) return;
    var draft = this.data.draft;
    if (!draft.name || !draft.name.trim()) {
      wx.showToast({ title: '还没识别出名称', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });
    api.createItem({
      name: draft.name.trim(),
      category: draft.category,
      quantity: draft.quantity,
      unit: draft.unit,
      location: draft.location,
      produceDate: draft.produceDate,
      expireDate: draft.expireDate,
      note: this.data.raw
    })
      .then(function (item) {
        wx.hideLoading();
        self.setData({ saving: false, savedCount: self.data.savedCount + 1 });
        wx.navigateTo({ url: '/pages/storage/detail/detail?id=' + item.id });
      })
      .catch(function (err) {
        wx.hideLoading();
        self.setData({ saving: false });
        wx.showToast({ title: err.message, icon: 'none', duration: 2500 });
      });
  },

  // 去「完整表单」补充照片/备注等
  onOpenForm: function () {
    var draft = this.data.draft;
    var prefill = encodeURIComponent(JSON.stringify(draft));
    wx.navigateTo({ url: '/pages/storage/edit/edit?prefill=' + prefill });
  },

  onBack: function () {
    wx.navigateBack();
  },

  onGoList: function () {
    wx.navigateTo({ url: '/pages/storage/list/list' });
  },

  // ==============================
  // 主题
  // ==============================
  onToggleTheme: function () {
    var isDark = !this.data.isDark;
    wx.setStorageSync('darkMode', isDark);
    this.setData({ isDark: isDark });
  }
});
