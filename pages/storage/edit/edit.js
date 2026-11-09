/**
 * 智能仓储 - 添加/编辑物品页（数据来自 storage-server 接口）
 */
var api = require('../../../utils/api');
var storageUtils = require('../../../utils/storage-utils');
var nav = require('../../../utils/nav');
var theme = require('../../../utils/theme');

Page({
  data: {
    isDark: false,
    isEdit: false,
    editId: null,
    saving: false,
    uploading: false,
    item: {
      name: '',
      category: 'food',
      quantity: 1,
      unit: '个',
      location: '',
      produceDate: '',
      expireDate: '',
      note: '',
      image: '',
      imageSrc: ''
    },
    categories: [],
    categoryNames: [],
    selectedCategoryName: '',
    presetUnits: storageUtils.PRESET_UNITS,
    expiryMode: 'date',
    expiryMonths: '',
    calculatedExpire: '',
    calculatedStatus: '',
    calculatedStatusText: ''
  },

  onLoad: function (query) {
    var self = this;
    this.setData({ isDark: theme.getTheme(), statusBarHeight: nav.STATUS_BAR_HEIGHT });

    api.listCategories()
      .then(function (categories) {
        self.setData({
          categories: categories,
          categoryNames: categories.map(function (c) { return c.icon + ' ' + c.name; })
        });
        if (query && query.id) {
          return self.loadForEdit(query.id);
        }
        if (query && query.prefill) {
          self.applyPrefill(query.prefill);
          return;
        }
        self.setData({ selectedCategoryName: self.categoryLabel(categories, self.data.item.category) });
      })
      .catch(function (err) {
        wx.showToast({ title: err.message, icon: 'none' });
      });
  },

  categoryLabel: function (categories, categoryId) {
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].id === categoryId) return categories[i].icon + ' ' + categories[i].name;
    }
    return '其他';
  },

  /** 从「快速记录」页带过来的草稿 */
  applyPrefill: function (encoded) {
    var draft;
    try {
      draft = JSON.parse(decodeURIComponent(encoded));
    } catch (e) {
      return;
    }
    if (!draft) return;
    var item = Object.assign({}, this.data.item, {
      name: draft.name || '',
      category: draft.category || 'other',
      quantity: draft.quantity || 1,
      unit: draft.unit || '个',
      location: draft.location || '',
      produceDate: draft.produceDate || '',
      expireDate: draft.expireDate || '',
      note: draft.note || ''
    });
    var months = draft.shelfLifeMonths;
    this.setData({
      item: item,
      selectedCategoryName: this.categoryLabel(this.data.categories, item.category),
      expiryMode: months ? 'months' : 'date',
      expiryMonths: months ? String(months) : '',
      calculatedExpire: item.expireDate || ''
    });
  },

  loadForEdit: function (id) {
    var self = this;
    return api.getItem(id)
      .then(function (item) {
        wx.setNavigationBarTitle({ title: '编辑物品' });
        self.setData({
          isEdit: true,
          editId: item.id,
          item: item,
          selectedCategoryName: self.categoryLabel(self.data.categories, item.category),
          calculatedExpire: item.expireDate || ''
        });
      })
      .catch(function (err) {
        wx.showToast({ title: err.message, icon: 'none' });
        setTimeout(function () { wx.navigateBack(); }, 1500);
      });
  },

  // ==============================
  // 表单绑定
  // ==============================
  onFieldInput: function (e) {
    var field = e.currentTarget.dataset.field;
    var value = e.detail.value;
    var data = {};
    data['item.' + field] = value;
    this.setData(data);
  },

  // 分类选择
  onCategoryChange: function (e) {
    var idx = e.detail.value;
    var categories = this.data.categories;
    var selectedName = this.data.categoryNames[idx];
    var categoryId = categories[idx] ? categories[idx].id : 'other';
    this.setData({
      selectedCategoryName: selectedName,
      'item.category': categoryId
    });
  },

  // 单位选择
  onUnitChange: function (e) {
    var idx = e.detail.value;
    this.setData({ 'item.unit': this.data.presetUnits[idx] });
  },

  // 生产日期
  onProduceDateChange: function (e) {
    this.setData({ 'item.produceDate': e.detail.value });
    this.recalcExpire();
  },

  // ==============================
  // 保质期模式
  // ==============================
  onSelectExpiryMode: function (e) {
    this.setData({ expiryMode: e.currentTarget.dataset.mode });
  },

  onMonthsInput: function (e) {
    this.setData({ expiryMonths: e.detail.value });
    this.recalcExpire();
  },

  onExpireDateChange: function (e) {
    this.setData({ 'item.expireDate': e.detail.value });
  },

  // 按月自动计算过期日
  recalcExpire: function () {
    if (this.data.expiryMode !== 'months') return;
    var produceDate = this.data.item.produceDate;
    var months = parseInt(this.data.expiryMonths);
    if (!produceDate || !months || months <= 0) {
      this.setData({ calculatedExpire: '', calculatedStatus: '', calculatedStatusText: '' });
      return;
    }
    var expireDate = storageUtils.calcExpireFromMonths(produceDate, months);
    var daysLeft = storageUtils.calcDaysLeft(expireDate);
    var status = storageUtils.calcStatus(daysLeft);
    var statusText = '';
    if (status === 'fresh') statusText = '（新鲜）';
    else if (status === 'warning') statusText = '（即将过期）';
    else if (status === 'expired') statusText = '（已过期）';

    this.setData({
      calculatedExpire: expireDate,
      'item.expireDate': expireDate,
      calculatedStatus: status || '',
      calculatedStatusText: statusText
    });
  },

  // ==============================
  // 照片：选完立即上传，只把相对路径存进表单
  // ==============================
  onChoosePhoto: function () {
    var self = this;
    if (this.data.uploading) return;

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var filePath = res.tempFilePaths[0];
        if (!filePath) return;
        self.setData({ uploading: true });
        wx.showLoading({ title: '上传中', mask: true });
        api.uploadImage(filePath)
          .then(function (url) {
            wx.hideLoading();
            self.setData({
              uploading: false,
              'item.image': url,
              'item.imageSrc': api.getBaseUrl() + url
            });
          })
          .catch(function (err) {
            wx.hideLoading();
            self.setData({ uploading: false });
            wx.showToast({ title: err.message, icon: 'none' });
          });
      }
    });
  },

  // ==============================
  // 保存
  // ==============================
  onSave: function () {
    var self = this;
    if (this.data.saving) return;

    var item = this.data.item;
    if (!item.name || !item.name.trim()) {
      wx.showToast({ title: '请输入物品名称', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });

    var task = this.data.isEdit
      ? api.updateItem(this.data.editId, item)
      : api.createItem(item);

    task
      .then(function () {
        wx.hideLoading();
        self.setData({ saving: false });
        wx.showToast({ title: self.data.isEdit ? '已更新' : '已添加', icon: 'success' });
        setTimeout(function () { wx.navigateBack(); }, 400);
      })
      .catch(function (err) {
        wx.hideLoading();
        self.setData({ saving: false });
        wx.showToast({ title: err.message, icon: 'none', duration: 2500 });
      });
  },

  // ==============================
  // 删除（仅编辑模式）
  // ==============================
  onDelete: function () {
    var self = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除「' + self.data.item.name + '」吗？此操作不可恢复。',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        api.deleteItem(self.data.editId)
          .then(function () {
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(function () { wx.navigateBack(); }, 400);
          })
          .catch(function (err) {
            wx.hideLoading();
            wx.showToast({ title: err.message, icon: 'none' });
          });
      }
    });
  },

  onBack: function () {
    wx.navigateBack();
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
