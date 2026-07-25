/**
 * 智能仓储 - 物品详情页
 */
var storageUtils = require('../../../utils/storage-utils');

Page({
  data: {
    isDark: false,
    item: {},
    statusText: '',
    categoryName: '',
    categoryIcon: ''
  },

  onLoad: function (query) {
    var self = this;
    self.setData({ isDark: wx.getStorageSync('darkMode') || false });

    if (!query || !query.id) {
      wx.showToast({ title: '物品不存在', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 1500);
      return;
    }

    var items = storageUtils.loadItems();
    var item = storageUtils.getItemById(items, query.id);

    if (!item) {
      wx.showToast({ title: '物品不存在', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 1500);
      return;
    }

    // 重算动态字段
    if (item.expireDate) {
      item.daysLeft = storageUtils.calcDaysLeft(item.expireDate);
      item.status = storageUtils.calcStatus(item.daysLeft);
    } else {
      item.daysLeft = null;
      item.status = null;
    }

    // 格式化时间戳
    item.createdAt_display = self.formatTimestamp(item.createdAt);
    item.updatedAt_display = self.formatTimestamp(item.updatedAt);

    // 获取分类信息
    var categories = storageUtils.loadCategories();
    var cat = null;
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].id === item.category) { cat = categories[i]; break; }
    }

    var statusText = '';
    if (item.status === 'expired') {
      statusText = '已过期';
    } else if (item.status === 'warning') {
      statusText = '即将过期';
    } else if (item.status === 'fresh') {
      statusText = '新鲜';
    }

    self.setData({
      item: item,
      statusText: statusText,
      categoryName: cat ? cat.name : (item.category || '未分类'),
      categoryIcon: cat ? cat.icon : '📦'
    });
  },

  formatTimestamp: function (isoStr) {
    if (!isoStr) return '未知';
    var d = new Date(isoStr);
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hour = String(d.getHours()).padStart(2, '0');
    var minute = String(d.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
  },

  onPreviewImage: function () {
    if (this.data.item.image) {
      wx.previewImage({
        urls: [this.data.item.image],
        current: this.data.item.image
      });
    }
  },

  onEdit: function () {
    wx.navigateTo({
      url: '/pages/storage/edit/edit?id=' + encodeURIComponent(this.data.item.id)
    });
  },

  onDelete: function () {
    var self = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除「' + self.data.item.name + '」吗？此操作不可恢复。',
      success: function (res) {
        if (res.confirm) {
          var items = storageUtils.loadItems();
          var updated = storageUtils.deleteItem(items, self.data.item.id);
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
