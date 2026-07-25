/**
 * 智能仓储 - 物品列表页
 */
var storageUtils = require('../../../utils/storage-utils');

Page({
  data: {
    isDark: false,
    items: [],
    displayItems: [],
    categories: [],
    defaultCategories: storageUtils.DEFAULT_CATEGORIES,
    categoryMap: {},
    selectedCategory: 'all',
    keyword: '',
    sortBy: 'expiry',
    showSearch: false,
    banner: { show: false, expiredCount: 0, warningCount: 0 },
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
    this.setData({ isDark: wx.getStorageSync('darkMode') || false });
    this.loadAll();
  },

  onShow: function () {
    this.loadAll();
  },

  loadAll: function () {
    var self = this;
    var isDark = wx.getStorageSync('darkMode') || false;
    var sortBy = storageUtils.loadSortPreference();
    var items = storageUtils.loadItems();
    var categories = storageUtils.loadCategories();
    var customCategories = storageUtils.loadCustomCategories();

    // 构建分类字典
    var categoryMap = {};
    categories.forEach(function (c) {
      categoryMap[c.id] = c;
    });

    // 计算每个分类的物品数量
    var categoriesWithCount = [];
    // "全部" tab
    categoriesWithCount.push({
      id: 'all',
      name: '全部',
      icon: '🗂️',
      count: items.length
    });
    // 各个分类
    categories.forEach(function (cat) {
      var count = 0;
      items.forEach(function (item) {
        if (item.category === cat.id) count++;
      });
      categoriesWithCount.push({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        count: count
      });
    });

    // Banner
    var banner = storageUtils.getStatusBanner(items);

    // 初始过滤
    var filtered = storageUtils.filterItems(items, self.data.keyword, self.data.selectedCategory);
    var sorted = storageUtils.sortItems(filtered, sortBy);

    self.setData({
      isDark: isDark,
      items: items,
      displayItems: sorted,
      categories: categoriesWithCount,
      categoryMap: categoryMap,
      sortBy: sortBy,
      banner: banner,
      customCategories: customCategories
    });
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
    var filtered = storageUtils.filterItems(
      this.data.items,
      this.data.keyword,
      this.data.selectedCategory
    );
    var sorted = storageUtils.sortItems(filtered, this.data.sortBy);
    // 更新分类计数
    var categories = this.data.categories.slice();
    // "全部" count
    categories[0].count = this.data.items.length;
    // 各分类
    for (var i = 1; i < categories.length; i++) {
      var count = 0;
      for (var j = 0; j < this.data.items.length; j++) {
        if (this.data.items[j].category === categories[i].id) count++;
      }
      categories[i].count = count;
    }
    this.setData({ displayItems: sorted, categories: categories });
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
    var updated = storageUtils.deleteItem(this.data.items, this.data.deleteTargetId);
    storageUtils.saveItems(updated);
    this.setData({ showDeleteModal: false, deleteTargetId: null, deleteTargetName: '' });
    this.loadAll();
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  onCancelDelete: function () {
    this.setData({ showDeleteModal: false, deleteTargetId: null, deleteTargetName: '' });
  },

  // ==============================
  // 分类管理弹窗
  // ==============================
  onOpenCategoryModal: function () {
    var customs = storageUtils.loadCustomCategories();
    this.setData({
      showCategoryModal: true,
      customCategories: customs,
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
    var name = this.data.newCategoryName.trim();
    if (!name) {
      wx.showToast({ title: '请输入分类名称', icon: 'none' });
      return;
    }

    // 检查与预设分类重名
    var defaults = storageUtils.DEFAULT_CATEGORIES;
    for (var i = 0; i < defaults.length; i++) {
      if (defaults[i].name === name) {
        wx.showToast({ title: '该分类名已被预设占用', icon: 'none' });
        return;
      }
    }

    // 检查与自定义分类重名
    var customs = this.data.customCategories;
    for (var j = 0; j < customs.length; j++) {
      if (customs[j].name === name) {
        wx.showToast({ title: '分类名已存在', icon: 'none' });
        return;
      }
    }

    var newCat = {
      id: 'custom_' + Date.now().toString(),
      name: name,
      icon: this.data.newCategoryIcon
    };
    customs.push(newCat);
    storageUtils.saveCustomCategories(customs);

    this.setData({
      customCategories: customs,
      newCategoryName: '',
      newCategoryIcon: '📦'
    });

    // 刷新分类列表
    var categories = storageUtils.loadCategories();
    var categoryMap = {};
    categories.forEach(function (c) { categoryMap[c.id] = c; });
    this.setData({ categoryMap: categoryMap });
    this.loadAll();
    wx.showToast({ title: '分类已添加', icon: 'success' });
  },

  onDeleteCustomCategory: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var cat = null;
    var customs = this.data.customCategories;
    for (var i = 0; i < customs.length; i++) {
      if (customs[i].id === id) { cat = customs[i]; break; }
    }
    if (!cat) return;

    wx.showModal({
      title: '确认删除分类',
      content: '删除「' + cat.name + '」后，该分类下的物品将移至「其他」。确定删除？',
      success: function (res) {
        if (res.confirm) {
          // 将该分类下的物品移到 "other"
          var items = storageUtils.loadItems();
          var changed = false;
          items.forEach(function (item) {
            if (item.category === id) {
              item.category = 'other';
              changed = true;
            }
          });
          if (changed) {
            storageUtils.saveItems(items);
          }

          // 删除自定义分类
          var updatedCustoms = customs.filter(function (c) { return c.id !== id; });
          storageUtils.saveCustomCategories(updatedCustoms);

          self.setData({ customCategories: updatedCustoms });
          self.loadAll();
          wx.showToast({ title: '分类已删除', icon: 'success' });
        }
      }
    });
  },

  // ==============================
  // 主题
  // ==============================
  onToggleTheme: function () {
    var isDark = !this.data.isDark;
    wx.setStorageSync('darkMode', isDark);
    this.setData({ isDark: isDark });
  },

  stopPropagation: function () { }
});
