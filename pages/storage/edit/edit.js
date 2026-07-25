/**
 * 智能仓储 - 添加/编辑物品页
 */
var storageUtils = require('../../../utils/storage-utils');

Page({
  data: {
    isDark: false,
    isEdit: false,
    editId: null,
    item: {
      name: '',
      category: 'food',
      quantity: 1,
      unit: '个',
      location: '',
      produceDate: '',
      expireDate: '',
      note: '',
      image: ''
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
    var isDark = wx.getStorageSync('darkMode') || false;
    var categories = storageUtils.loadCategories();
    var categoryNames = categories.map(function (c) {
      return c.icon + ' ' + c.name;
    });

    this.setData({
      isDark: isDark,
      categories: categories,
      categoryNames: categoryNames
    });

    // 编辑模式
    if (query && query.id) {
      var items = storageUtils.loadItems();
      var item = storageUtils.getItemById(items, query.id);
      if (item) {
        wx.setNavigationBarTitle({ title: '编辑物品' });
        // 设置选中分类名
        var cat = null;
        for (var i = 0; i < categories.length; i++) {
          if (categories[i].id === item.category) { cat = categories[i]; break; }
        }
        self.setData({
          isEdit: true,
          editId: query.id,
          item: item,
          selectedCategoryName: cat ? cat.icon + ' ' + cat.name : '其他'
        });
      }
    }
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
  // 照片
  // ==============================
  onChoosePhoto: function () {
    var self = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        self.setData({ 'item.image': res.tempFilePaths[0] });
      }
    });
  },

  // ==============================
  // 保存
  // ==============================
  onSave: function () {
    var item = this.data.item;
    if (!item.name || !item.name.trim()) {
      wx.showToast({ title: '请输入物品名称', icon: 'none' });
      return;
    }
    item.name = item.name.trim();

    var items = storageUtils.loadItems();
    if (this.data.isEdit) {
      var updated = storageUtils.updateItem(items, this.data.editId, item);
      storageUtils.saveItems(updated);
    } else {
      var newItem = storageUtils.createItem(item);
      items.push(newItem);
      storageUtils.saveItems(items);
    }

    wx.navigateBack();
    wx.showToast({
      title: this.data.isEdit ? '已更新' : '已添加',
      icon: 'success'
    });
  },

  // ==============================
  // 删除（仅编辑模式）
  // ==============================
  onDelete: function () {
    var self = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除「' + this.data.item.name + '」吗？此操作不可恢复。',
      success: function (res) {
        if (res.confirm) {
          var items = storageUtils.loadItems();
          var updated = storageUtils.deleteItem(items, self.data.editId);
          storageUtils.saveItems(updated);
          wx.navigateBack();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
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
