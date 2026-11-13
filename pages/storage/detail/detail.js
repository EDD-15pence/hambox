/**
 * 智能仓储 - 物品详情页（数据来自 storage-server 接口）
 */
var auth = require('../../../utils/auth');
var api = require('../../../utils/api');
var nav = require('../../../utils/nav');
var theme = require('../../../utils/theme');

Page({
  data: {
    isDark: false,
    item: {},
    statusText: '',
    categoryName: '',
    categoryIcon: '',
    // 倒计时大数字（拆成三块，避免模板里做字符串拼接）
    daysNum: '',
    daysPrefix: '',
    hasDays: false,
    // 保质期进度条：只有同时有生产日期和过期日才算得出比例
    progress: { show: false, percent: 0, text: '' },
    // 备注就地编辑
    noteEditing: false,
    noteDraft: '',
    savingNote: false,
    // 三态：加载中 / 连不上后端 / 正常
    loading: true,
    retrying: false,
    loadError: '',
    baseUrl: ''
  },

  onLoad: function (query) {
    if (!auth.guard('storage')) return;
    var self = this;
    self.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT,
      baseUrl: api.getBaseUrl()
    });

    if (!query || !query.id) {
      wx.showToast({ title: '物品不存在', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 1500);
      return;
    }

    self.itemId = query.id;
    self.loadItem();
  },

  /**
   * 拉物品详情 + 分类。
   * 以前失败直接 navigateBack，网络一抖就被弹出页面、还看不到任何原因；
   * 现在留在原地给连接引导，网络回来点重试就行。
   */
  loadItem: function () {
    var self = this;
    this.setData({ loading: !this.data.loadError, retrying: !!this.data.loadError });
    return Promise.all([api.getItem(this.itemId), api.listCategories()])
      .then(function (results) {
        self.setData({ loading: false, retrying: false, loadError: '' });
        self.renderItem(results[0], results[1]);
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
    this.loadItem();
  },

  renderItem: function (item, categories) {
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

    item.createdAt_display = this.formatTimestamp(item.createdAt);
    item.updatedAt_display = this.formatTimestamp(item.updatedAt);

    var hasDays = item.daysLeft !== null && item.daysLeft !== undefined;
    var daysNum = '';
    var daysPrefix = '';
    if (hasDays) {
      daysNum = String(item.status === 'expired' ? -item.daysLeft : item.daysLeft);
      daysPrefix = item.status === 'expired' ? '已过期' : '还剩';
    }

    this.setData({
      item: item,
      statusText: statusText,
      categoryName: cat ? cat.name : (item.category || '未分类'),
      categoryIcon: cat ? cat.icon : '📦',
      daysNum: daysNum,
      daysPrefix: daysPrefix,
      hasDays: hasDays,
      progress: this.buildProgress(item)
    });
  },

  /**
   * 保质期进度。
   * 「还剩 30 天」和「90 天里已过 60 天」是两回事，进度条补的是后半句。
   * 只有过期日、没有生产日期时算不出比例，宁可不显示也不猜。
   */
  buildProgress: function (item) {
    if (!item.produceDate || !item.expireDate) {
      return { show: false, percent: 0, text: '' };
    }
    var day = 86400000;
    var start = new Date(item.produceDate + 'T00:00:00');
    var end = new Date(item.expireDate + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { show: false, percent: 0, text: '' };
    }

    var total = Math.round((end - start) / day);
    if (total <= 0) return { show: false, percent: 0, text: '' };

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var used = Math.round((today - start) / day);
    if (used < 0) used = 0;

    var percent = Math.round(Math.max(0, Math.min(1, used / total)) * 100);
    var usedText = used > total ? total : used;
    return {
      show: true,
      percent: percent,
      text: '保质期 ' + total + ' 天，已过 ' + usedText + ' 天'
    };
  },

  formatTimestamp: function (isoStr) {
    if (!isoStr) return '未知';
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return '未知';
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hour = String(d.getHours()).padStart(2, '0');
    var minute = String(d.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
  },

  onPreviewImage: function () {
    var src = this.data.item.imageSrc;
    if (src) {
      wx.previewImage({ urls: [src], current: src });
    }
  },

  /** 名称一键复制：常用在多设备之间对账、发给家人让帮忙找 */
  onCopyName: function () {
    var name = this.data.item.name;
    if (!name) return;
    wx.setClipboardData({
      data: name,
      success: function () {
        wx.showToast({ title: '名称已复制', icon: 'none' });
      }
    });
  },

  // ==============================
  // 备注就地编辑
  // ==============================
  onEditNote: function () {
    this.setData({
      noteEditing: true,
      noteDraft: this.data.item.note || ''
    });
  },

  onNoteInput: function (e) {
    this.setData({ noteDraft: e.detail.value });
  },

  onCancelNote: function () {
    this.setData({ noteEditing: false, noteDraft: '' });
  },

  /** 只改备注，走 PUT 全量提交（其它字段原样带回，不会被覆盖成空） */
  onSaveNote: function () {
    var self = this;
    if (this.data.savingNote) return;
    var note = (this.data.noteDraft || '').trim();
    if (note === (this.data.item.note || '')) {
      this.setData({ noteEditing: false });
      return;
    }

    this.setData({ savingNote: true });
    api.updateItem(this.data.item.id, Object.assign({}, this.data.item, { note: note }))
      .then(function (fresh) {
        self.setData({
          savingNote: false,
          noteEditing: false,
          'item.note': note,
          'item.updatedAt_display': self.formatTimestamp(fresh.updatedAt)
        });
        wx.showToast({ title: note ? '备注已保存' : '备注已清空', icon: 'success' });
      })
      .catch(function (err) {
        self.setData({ savingNote: false });
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none', duration: 2400 });
      });
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
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        api.deleteItem(self.data.item.id)
          .then(function () {
            wx.hideLoading();
            wx.navigateBack();
            wx.showToast({ title: '已删除', icon: 'success' });
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
    this.setData({ isDark: theme.toggleTheme() });
  }
});
