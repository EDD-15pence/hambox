/**
 * 智能仓储 - 快速记录页
 *
 * 一句话（尽量口语）→ 自动拆出 名称/分类/数量/生产日期/保质期/过期日/位置 → 一条记录。
 * 语音：页面内「点一下说话」，走微信同声传译插件（utils/speech.js）流式识别，
 *       说完自动落成文字并解析，不依赖输入法的听写。
 */
var api = require('../../../utils/api');
var storageUtils = require('../../../utils/storage-utils');
var theme = require('../../../utils/theme');
var quickParse = require('../../../utils/quick-parse');
var nav = require('../../../utils/nav');
var speech = require('../../../utils/speech');
var lexicon = require('../../../utils/lexicon');
var voiceLog = require('../../../utils/voice-log');

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
    todayText: '',
    // 语音输入
    recording: false,
    voiceAvailable: false,
    inputFocus: true,
    // 语音识别后按历史词库纠正过的用词，给个轻提示，避免用户觉得「我明明没说错」
    fixNote: ''
  },

  onLoad: function () {
    var todayText = storageUtils.todayDate();
    var voiceAvailable = speech.isAvailable();
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      todayText: todayText,
      voiceAvailable: voiceAvailable
    });
    if (voiceAvailable) this.setupSpeech();
    this.loadCategories();
    this.loadLexicon();
  },

  onUnload: function () {
    if (this._timer) clearTimeout(this._timer);
    // 必须摘掉插件回调，否则录音中退出会把 setData 打到已销毁的页面
    if (this._session) this._session.dispose();
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
  // 语音输入（点一下开始，再点一下结束）
  // ==============================
  /**
   * 拉历史词库（物品名/位置名），用于纠正同音错字。
   * 缓存 24 小时；断网时退回旧缓存，失败也绝不阻塞页面。
   */
  loadLexicon: function () {
    var self = this;
    lexicon.load()
      .then(function (lex) { self._lexicon = lex; })
      .catch(function () { self._lexicon = { names: [], locations: [] }; });
  },

  /**
   * 只建一次会话；回调全部走 session，页面销毁时统一 dispose。
   * 中间结果只做回填，纠错放在最终结果上——半句话纠错会把词改坏。
   */
  setupSpeech: function () {
    var self = this;
    this._session = speech.createSession({
      onStart: function () {
        self.setData({ recording: true });
      },

      onPartial: function (text) {
        if (!text) return;
        self.setData({
          raw: (self._rawBefore || '') + text,
          parsed: false,
          missing: [],
          fixNote: ''
        });
      },

      onFinal: function (text) {
        self.finishVoice(text);
      },

      onError: function (err) {
        self.setData({ recording: false });
        wx.showToast({
          title: (err && err.msg) || '语音识别失败，可直接打字',
          icon: 'none',
          duration: 2500
        });
      }
    });
  },

  /** 语音结束：拼上录音前已有文字 → 词库纠错 → 解析 */
  finishVoice: function (text) {
    var before = this._rawBefore || '';
    if (!text) {
      this.setData({ recording: false });
      wx.showToast({ title: '没听清，再说一次', icon: 'none' });
      return;
    }

    var full = before + text;
    var fixed = lexicon.correct(full, this._lexicon);

    // 日志要用插件原文，这里留一份；raw 存的是纠错后的
    this._rawText = full;
    this._fixes = fixed.fixes;

    this.setData({
      recording: false,
      raw: fixed.text,
      fixNote: fixed.fixes.length ? '已按历史记录修正：' + fixed.fixes.map(function (f) {
        return f.from + '→' + f.to;
      }).join('、') : ''
    });

    this.parse();
  },

  onVoiceTap: function () {
    if (this.data.recording) {
      this.stopRecord();
      return;
    }
    this.startVoice();
  },

  startVoice: function () {
    var self = this;
    if (!this.data.voiceAvailable || !this._session) {
      wx.showToast({ title: '语音未启用，可直接打字', icon: 'none' });
      return;
    }

    speech.ensurePermission()
      .then(function () {
        var before = (self.data.raw || '').trim();
        self._rawBefore = before ? before + '，' : '';
        wx.hideKeyboard();
        // 录音期间放弃自动聚焦，否则键盘会抢回焦点、盖住语音条
        self.setData({ recording: true, inputFocus: false });
        self._session.start({ duration: 60000, lang: 'zh_CN' });
      })
      .catch(function () {
        wx.showModal({
          title: '需要麦克风权限',
          content: '语音记录要用麦克风，去设置里打开就可以用了。',
          confirmText: '去设置',
          success: function (r) { if (r.confirm) wx.openSetting(); }
        });
      });
  },

  stopRecord: function () {
    if (this._session) this._session.stop();
  },

  // ==============================
  // 输入 → 解析
  // ==============================
  onRawInput: function (e) {
    var value = e.detail.value;
    // 手动改过就不是语音原文了，日志里按手动文本记
    this._rawText = '';
    this.setData({ raw: value, fixNote: '' });
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
    // 留住"解析成了什么"，保存时和用户改后的值对比，写进识别日志
    this._parsedSnapshot = {
      name: result.name,
      quantity: result.quantity,
      unit: result.unit,
      location: result.location,
      expireDate: result.expireDate,
      category: result.categoryId
    };
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
  /** 记一条识别日志：原文 / 纠错后 / 解析值 / 最终保存值，便于回看规则哪里不准 */
  logVoice: function (finalFields) {
    if (!this._parsedSnapshot) return;
    voiceLog.append({
      raw: this._rawText || this.data.raw,
      fixed: this.data.raw,
      fixes: this._fixes || [],
      parsed: this._parsedSnapshot,
      final: finalFields,
      saved: true
    });
  },

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
        // 用户亲手确认过的名称/位置是最可信的词源，立刻进词库
        lexicon.remember(self._lexicon, payload.name, payload.location);
        self.logVoice(payload);
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
          daysLeft: null,
          fixNote: ''
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
        lexicon.remember(self._lexicon, draft.name.trim(), draft.location);
        self.logVoice({
          name: draft.name.trim(),
          quantity: draft.quantity,
          unit: draft.unit,
          location: draft.location,
          expireDate: draft.expireDate,
          category: draft.category
        });
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
    wx.navigateBack({
      delta: 1,
      fail: function () { wx.reLaunch({ url: '/pages/index/index' }); }
    });
  },

  onGoList: function () {
    wx.navigateTo({ url: '/pages/storage/list/list' });
  },

  // ==============================
  // 主题
  // ==============================
  onToggleTheme: function () {
    this.setData({ isDark: theme.toggleTheme() });
  }
});
