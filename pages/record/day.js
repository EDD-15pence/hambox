/**
 * 记录 · 当天详情（R-02 / R-04 / R-05）
 *
 * 一天可以有很多条，日历只做索引，这里负责干活：记一条、改一条、删一条。
 *
 * 录入路径压到最短：**一行文本 → 记下**。拆分交给 utils/entry-text.js
 * （括号前是标题、括号里是评价、括号后进正文），拆不出来就整段当标题。
 *
 * 三种条目（R-04）：
 *   - `day`  一句话，走上面那个输入框，最快；
 *   - `work` 单个作品、`item` 单个物品，多一张主图和若干自定义字段。
 *     两者表单完全一样 —— 字段不预设，因为「作品」该记平台还是用时、
 *     「物品」该记规格还是价格，只有记的人自己知道。
 */

var auth = require('../../utils/auth');
var nav = require('../../utils/nav');
var theme = require('../../utils/theme');
var api = require('../../utils/api');
var entryText = require('../../utils/entry-text');
var entryMeta = require('../../utils/entry-meta');
var image = require('../../utils/image');

var WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
var TYPE_LABEL = { day: '', work: '作品', item: '物品' };

/**
 * 字段行要一个稳定 key。用下标当 key 的话，删掉中间一行时
 * 后面几行的 input 会「继承」前一行的已渲染状态，值就串到别处去了。
 */
var rowSeq = 0;

function withIds(rows) {
  return (rows || []).map(function (row) {
    rowSeq += 1;
    return { id: 'r' + rowSeq, k: row.k, v: row.v };
  });
}

function blankRow() {
  rowSeq += 1;
  return { id: 'r' + rowSeq, k: '', v: '' };
}

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

function emptyForm(type) {
  return {
    type: type || 'work',
    title: '',
    comment: '',
    content: '',
    imageUrl: '',
    imageSrc: '',
    // 先给一行空的，让「字段」这件事一眼看得见，而不是只挂一个「+ 加一行」的链接
    metaRows: [blankRow()]
  };
}

Page({
  data: {
    isDark: false,
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    // 键盘高度补偿（§5.5 弹层键盘避让硬规则 2）
    kb: 0,
    date: '',
    dateLabel: '',
    items: [],
    draft: '',
    focusDraft: false,
    loading: true,
    error: '',
    saving: false,
    uploading: false,
    // 新建作品 / 物品的表单：null 表示关着
    creating: null,
    // 编辑面板：null 表示关着
    editing: null,
    // 「记为版本答案」面板：null 表示关着
    answering: null
  },

  onLoad: function (options) {
    if (!auth.guard('record')) return;
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
            var metaRows = entryMeta.parse(row.meta);
            return Object.assign({}, row, {
              clock: clockOf(row.createdAt),
              typeLabel: TYPE_LABEL[row.type] || '',
              // 列表里只露前 3 个字段，再多就把卡片撑爆了
              metaChips: metaRows.slice(0, 3),
              metaMore: Math.max(0, metaRows.length - 3),
              imageSrc: row.imageUrl ? api.getBaseUrl() + row.imageUrl : ''
            });
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

  // ==============================
  // 新建作品 / 物品（R-04）
  // ==============================

  onOpenCreate: function (e) {
    var type = e.currentTarget.dataset.type || 'work';
    this.setData({ creating: emptyForm(type) });
  },

  onCloseCreate: function () {
    wx.hideKeyboard();
    this.setData({ creating: null, kb: 0 });
  },

  onCreateField: function (e) {
    var field = e.currentTarget.dataset.field;
    if (!field) return;
    var patch = {};
    patch['creating.' + field] = e.detail.value;
    this.setData(patch);
  },

  onCreateMetaInput: function (e) {
    var index = e.currentTarget.dataset.index;
    var part = e.currentTarget.dataset.part;
    if (index === undefined || !part) return;
    var patch = {};
    patch['creating.metaRows[' + index + '].' + part] = e.detail.value;
    this.setData(patch);
  },

  onAddMetaRow: function () {
    var rows = (this.data.creating && this.data.creating.metaRows) || [];
    this.setData({ 'creating.metaRows': rows.concat([blankRow()]) });
  },

  onRemoveMetaRow: function (e) {
    var index = e.currentTarget.dataset.index;
    var rows = (this.data.creating && this.data.creating.metaRows) || [];
    if (index === undefined || index < 0 || index >= rows.length) return;
    var next = rows.slice();
    next.splice(index, 1);
    this.setData({ 'creating.metaRows': next });
  },

  onCreateImage: function () {
    var self = this;
    if (this.data.uploading) return;
    image.pickAndCompress()
      .then(function (picked) {
        self.setData({ uploading: true });
        wx.showLoading({ title: '上传中', mask: true });
        return api.uploadImage(picked.path);
      })
      .then(function (url) {
        wx.hideLoading();
        self.setData({
          uploading: false,
          'creating.imageUrl': url,
          'creating.imageSrc': api.getBaseUrl() + url
        });
      })
      .catch(function (err) {
        wx.hideLoading();
        self.setData({ uploading: false });
        wx.showToast({ title: (err && err.message) || '没选到图片', icon: 'none' });
      });
  },

  onClearCreateImage: function () {
    this.setData({ 'creating.imageUrl': '', 'creating.imageSrc': '' });
  },

  onSaveCreate: function () {
    var self = this;
    var form = this.data.creating;
    if (!form || this.data.saving) return;
    var title = String(form.title || '').trim();
    if (!title) {
      wx.showToast({ title: '写个名字', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    api.createEntry({
      entryDate: this.data.date,
      type: form.type,
      title: title,
      comment: String(form.comment || '').trim(),
      content: String(form.content || '').trim(),
      meta: entryMeta.serialize(form.metaRows),
      imageUrl: form.imageUrl || ''
    }).then(function () {
      self.setData({ saving: false, creating: null });
      self.load();
    }).catch(function (err) {
      self.setData({ saving: false });
      wx.showToast({ title: (err && err.message) || '没记上', icon: 'none' });
    });
  },

  // ==============================
  // 编辑（三种类型共用）
  // ==============================

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
        type: picked.type || 'day',
        typeLabel: TYPE_LABEL[picked.type] || '',
        title: picked.title,
        comment: picked.comment,
        content: picked.content,
        imageUrl: picked.imageUrl || '',
        imageSrc: picked.imageSrc || '',
        metaRows: withIds(entryMeta.parse(picked.meta))
      }
    });
  },

  onCloseEdit: function () {
    wx.hideKeyboard();
    this.setData({ editing: null, kb: 0 });
  },

  /** 面板内部点击不该关面板（冒泡到遮罩会关） */
  onNoop: function () {},

  /** 键盘避让：输入框拿不到高度时（部分安卓机型）就保持 0，不白屏也不挡死 */
  onKbFocus: function (e) {
    this.setData({ kb: (e.detail && e.detail.height) || 0 });
  },

  onKbBlur: function () {
    this.setData({ kb: 0 });
  },

  onEditField: function (e) {
    var field = e.currentTarget.dataset.field;
    if (!field) return;
    var patch = {};
    patch['editing.' + field] = e.detail.value;
    this.setData(patch);
  },

  onEditMetaInput: function (e) {
    var index = e.currentTarget.dataset.index;
    var part = e.currentTarget.dataset.part;
    if (index === undefined || !part) return;
    var patch = {};
    patch['editing.metaRows[' + index + '].' + part] = e.detail.value;
    this.setData(patch);
  },

  onEditAddMeta: function () {
    var rows = (this.data.editing && this.data.editing.metaRows) || [];
    this.setData({ 'editing.metaRows': rows.concat([blankRow()]) });
  },

  onEditRemoveMeta: function (e) {
    var index = e.currentTarget.dataset.index;
    var rows = (this.data.editing && this.data.editing.metaRows) || [];
    if (index === undefined || index < 0 || index >= rows.length) return;
    var next = rows.slice();
    next.splice(index, 1);
    this.setData({ 'editing.metaRows': next });
  },

  onEditImage: function () {
    var self = this;
    if (this.data.uploading) return;
    image.pickAndCompress()
      .then(function (picked) {
        self.setData({ uploading: true });
        wx.showLoading({ title: '上传中', mask: true });
        return api.uploadImage(picked.path);
      })
      .then(function (url) {
        wx.hideLoading();
        self.setData({
          uploading: false,
          'editing.imageUrl': url,
          'editing.imageSrc': api.getBaseUrl() + url
        });
      })
      .catch(function (err) {
        wx.hideLoading();
        self.setData({ uploading: false });
        wx.showToast({ title: (err && err.message) || '没选到图片', icon: 'none' });
      });
  },

  onEditClearImage: function () {
    this.setData({ 'editing.imageUrl': '', 'editing.imageSrc': '' });
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
      content: String(editing.content || '').trim(),
      meta: entryMeta.serialize(editing.metaRows),
      imageUrl: editing.imageUrl || ''
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

  // ==============================
  // 记为版本答案（R-05）
  // ==============================

  /**
   * 预填规则：关键词用标题，答案用评价（没有评价就用正文）。
   * 都空就只填标题 —— 让人自己补一句，总比替他编一句强。
   */
  onOpenAnswer: function () {
    var editing = this.data.editing;
    if (!editing) return;
    var fallback = String(editing.comment || '').trim() || String(editing.content || '').trim();
    this.setData({
      editing: null,
      answering: {
        entryId: editing.id,
        keyword: editing.title,
        answer: fallback || editing.title
      }
    });
  },

  onCloseAnswer: function () {
    wx.hideKeyboard();
    this.setData({ answering: null, kb: 0 });
  },

  onAnswerField: function (e) {
    var field = e.currentTarget.dataset.field;
    if (!field) return;
    var patch = {};
    patch['answering.' + field] = e.detail.value;
    this.setData(patch);
  },

  onSaveAnswer: function () {
    var self = this;
    var form = this.data.answering;
    if (!form || this.data.saving) return;
    var keyword = String(form.keyword || '').trim();
    var answer = String(form.answer || '').trim();
    if (!keyword || !answer) {
      wx.showToast({ title: '关键词和答案都要填', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    api.createAnswer({
      keyword: keyword,
      answer: answer,
      sourceEntryId: form.entryId
    }).then(function (res) {
      self.setData({ saving: false, answering: null });
      wx.showToast({
        title: res.created ? '记成答案了' : '同名答案已更新',
        icon: 'none'
      });
    }).catch(function (err) {
      self.setData({ saving: false });
      wx.showToast({ title: (err && err.message) || '没记上', icon: 'none' });
    });
  },

  onBack: function () {
    wx.navigateBack({
      delta: 1,
      fail: function () { wx.reLaunch({ url: '/pages/index/index' }); }
    });
  }
});
