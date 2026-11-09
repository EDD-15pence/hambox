/**
 * 智能仓储 - 物品列表页
 * 数据来自 storage-server 接口（局域网），本地只做筛选 / 排序 / 展示
 */
var api = require('../../../utils/api');
var storageUtils = require('../../../utils/storage-utils');
var nav = require('../../../utils/nav');
var theme = require('../../../utils/theme');

Page({
  data: {
    isDark: false,
    items: [],
    displayItems: [],
    categories: [],
    defaultCategories: [],
    categoryMap: {},
    selectedCategory: 'all',
    statusFilter: 'all',
    keyword: '',
    sortBy: 'expiry',
    showSearch: false,
    banner: { show: false, expiredCount: 0, warningCount: 0 },
    // 顶部三个统计块
    stats: { expired: 0, warning: 0, fresh: 0, none: 0, total: 0 },
    // 删除弹窗
    showDeleteModal: false,
    deleteTargetId: null,
    deleteTargetName: '',
    // 分类管理弹窗
    showCategoryModal: false,
    customCategories: [],
    newCategoryName: '',
    newCategoryIcon: '📦',
    iconOptions: ['📦', '🍔', '🥤', '🧴', '💊', '💄', '🧂', '❄️', '🥬', '🍪', '🧊', '🎯', '📚', '🧹', '👕', '🔧', '🐱', '🎮']
  },

  onLoad: function () {
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT
    });
    this.loadAll();
  },

  onShow: function () {
    this.loadAll();
  },

  onBack: function () {
    wx.navigateBack({
      delta: 1,
      fail: function () { wx.reLaunch({ url: '/pages/index/index' }); }
    });
  },

  // ==============================
  // 加载数据
  // ==============================
  loadAll: function () {
    var self = this;
    var sortBy = storageUtils.loadSortPreference();
    return Promise.all([api.listItems(), api.listCategories()])
      .then(function (results) {
        self.render(results[0], results[1], sortBy);
      })
      .catch(function (err) {
        wx.showToast({ title: err.message, icon: 'none', duration: 2500 });
      });
  },

  /**
   * @param {Array} items 服务端物品
   * @param {Array} categories 服务端分类
   * @param {string} sortBy 排序偏好
   */
  render: function (items, categories, sortBy) {
    var categoryMap = {};
    categories.forEach(function (c) {
      categoryMap[c.id] = c;
    });

    var tabs = [{ id: 'all', name: '全部', icon: '🗂️', count: items.length }];
    categories.forEach(function (cat) {
      var count = 0;
      items.forEach(function (item) {
        if (item.category === cat.id) count++;
      });
      tabs.push({ id: cat.id, name: cat.name, icon: cat.icon, count: count });
    });

    var stats = { expired: 0, warning: 0, fresh: 0, none: 0, total: items.length };
    items.forEach(function (it) {
      var key = it.status || 'none';
      if (stats[key] === undefined) stats[key] = 0;
      stats[key]++;
    });

    this.setData({
      items: items,
      categories: tabs,
      categoryMap: categoryMap,
      defaultCategories: categories.filter(function (c) { return c.isDefault; }),
      customCategories: categories.filter(function (c) { return !c.isDefault; }),
      banner: storageUtils.getStatusBanner(items),
      stats: stats,
      sortBy: sortBy
    });
    this.applyFilters();
  },

  // ==============================
  // 搜索
  // ==============================
  onToggleSearch: function () {
    var show = !this.data.showSearch;
    this.setData({ showSearch: show });
    if (!show) {
      this.setData({ keyword: '' });
      this.applyFilters();
    }
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilters();
  },

  onClearSearch: function () {
    this.setData({ keyword: '' });
    this.applyFilters();
  },

  // ==============================
  // 分类
  // ==============================
  onSelectCategory: function (e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ selectedCategory: id });
    this.applyFilters();
  },

  // ==============================
  // 排序
  // ==============================
  onToggleSort: function (e) {
    var sortBy = e.currentTarget.dataset.sort;
    if (sortBy === this.data.sortBy) return;
    this.setData({ sortBy: sortBy });
    storageUtils.saveSortPreference(sortBy);
    this.applyFilters();
  },

  // ==============================
  // 过滤 & 排序应用
  // ==============================
  applyFilters: function () {
    var statusFilter = this.data.statusFilter;
    var filtered = storageUtils.filterItems(
      this.data.items,
      this.data.keyword,
      this.data.selectedCategory
    );
    if (statusFilter !== 'all') {
      filtered = filtered.filter(function (it) {
        return (it.status || 'none') === statusFilter;
      });
    }
    var sorted = storageUtils.sortItems(filtered, this.data.sortBy);
    this.setData({ displayItems: sorted });
  },

  // 点顶部统计块筛选状态，再点一次取消
  onSelectStatus: function (e) {
    var status = e.currentTarget.dataset.status;
    if (this.data.stats[status] === 0) return;
    this.setData({
      statusFilter: this.data.statusFilter === status ? 'all' : status
    });
    this.applyFilters();
  },

  onClearStatus: function () {
    this.setData({ statusFilter: 'all' });
    this.applyFilters();
  },

  // ==============================
  // 导航
  // ==============================
  onTapItem: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/storage/detail/detail?id=' + encodeURIComponent(id)
    });
  },

  onAddItem: function () {
    wx.navigateTo({
      url: '/pages/storage/edit/edit'
    });
  },

  // 一句话快速记录
  onQuickAdd: function () {
    wx.navigateTo({
      url: '/pages/storage/quick/quick'
    });
  },

  /** 语音面板保存成功：重新拉一遍，让新物品立刻出现在列表里 */
  onVoiceSaved: function () {
    this.loadAll();
  },

  // ==============================
  // 长按删除
  // ==============================
  onLongPressItem: function (e) {
    var id = e.currentTarget.dataset.id;
    var name = e.currentTarget.dataset.name || '';
    this.setData({
      showDeleteModal: true,
      deleteTargetId: id,
      deleteTargetName: name
    });
  },

  onConfirmDelete: function () {
    var self = this;
    var id = this.data.deleteTargetId;
    wx.showLoading({ title: '删除中', mask: true });
    api.deleteItem(id)
      .then(function () {
        wx.hideLoading();
        self.setData({ showDeleteModal: false, deleteTargetId: null, deleteTargetName: '' });
        wx.showToast({ title: '已删除', icon: 'success' });
        return self.loadAll();
      })
      .catch(function (err) {
        wx.hideLoading();
        wx.showToast({ title: err.message, icon: 'none' });
      });
  },

  onCancelDelete: function () {
    this.setData({ showDeleteModal: false, deleteTargetId: null, deleteTargetName: '' });
  },

  // ==============================
  // 分类管理弹窗
  // ==============================
  onOpenCategoryModal: function () {
    this.setData({
      showCategoryModal: true,
      newCategoryName: '',
      newCategoryIcon: '📦'
    });
  },

  onCloseCategoryModal: function () {
    this.setData({ showCategoryModal: false });
  },

  onNewCategoryNameInput: function (e) {
    this.setData({ newCategoryName: e.detail.value });
  },

  onNewCategoryIconChange: function (e) {
    var idx = e.detail.value;
    this.setData({ newCategoryIcon: this.data.iconOptions[idx] });
  },

  onAddCustomCategory: function () {
    var self = this;
    var name = (this.data.newCategoryName || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入分类名称', icon: 'none' });
      return;
    }

    var exists = this.data.categories.some(function (c) {
      return c.id !== 'all' && c.name === name;
    });
    if (exists) {
      wx.showToast({ title: '分类名已存在', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '添加中', mask: true });
    api.createCategory(name, this.data.newCategoryIcon)
      .then(function () {
        wx.hideLoading();
        self.setData({ newCategoryName: '', newCategoryIcon: '📦' });
        wx.showToast({ title: '分类已添加', icon: 'success' });
        return self.loadAll();
      })
      .catch(function (err) {
        wx.hideLoading();
        wx.showToast({ title: err.message, icon: 'none' });
      });
  },

  onDeleteCustomCategory: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var cat = null;
    this.data.customCategories.forEach(function (c) {
      if (c.id === id) cat = c;
    });
    if (!cat) return;

    wx.showModal({
      title: '确认删除分类',
      content: '删除「' + cat.name + '」后，该分类下的物品将移至「其他」。确定删除？',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        api.deleteCategory(id)
          .then(function () {
            wx.hideLoading();
            wx.showToast({ title: '分类已删除', icon: 'success' });
            return self.loadAll();
          })
          .catch(function (err) {
            wx.hideLoading();
            wx.showToast({ title: err.message, icon: 'none' });
          });
      }
    });
  },

  // ==============================
  // 主题
  // ==============================
  onToggleTheme: function () {
    this.setData({ isDark: theme.toggleTheme() });
  },

  stopPropagation: function () { }
});
