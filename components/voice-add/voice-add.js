/**
 * 首页「快速记一笔」：悬浮麦克风 → 说一句 → 面板内确认 → 直接入库
 *
 * 交互定死为「点一下开始，再点一下结束」，不做按住说话。
 * 原因：按住要靠 touchstart/touchend 配对，用户轻轻一点就会被当成
 * 「按下又松开」，录音时长只有几十毫秒，插件拿不到结果；
 * 手指滑动、页面滚动也会把 touchend 吃掉。点击切换没有这些边界。
 *
 * 会话生命周期：每次打开面板新建 session，关闭时 dispose，
 * 避免插件单例回调打到已经关掉的面板。
 */
var api = require('../../utils/api');
var speech = require('../../utils/speech');
var lexicon = require('../../utils/lexicon');
var quickParse = require('../../utils/quick-parse');
var storageUtils = require('../../utils/storage-utils');
var voiceLog = require('../../utils/voice-log');

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

var MISSING_NAMES = {
  produceDate: '生产日期',
  shelfLife: '保质期',
  location: '位置'
};

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    /* 悬浮按钮距底部的额外偏移（rpx）。列表页已有"添加"按钮，传 128 抬上去 */
    fabOffset: {
      type: Number,
      value: 0
    }
  },

  data: {
    visible: false,
    recording: false,
    recognizing: false,
    saving: false,
    raw: '',
    parsed: false,
    bars: [0, 1, 2, 3, 4],
    // 键盘高度补偿（§5.5 弹层键盘避让硬规则 2）
    kb: 0,

    draft: Object.assign({}, EMPTY_DRAFT),
    categories: [],
    categoryNames: [],
    categoryIndex: 0,
    units: storageUtils.PRESET_UNITS,
    unitIndex: 0,

    todayText: '',
    daysLeft: null,
    statusText: '',
    missing: [],
    missingText: ''
  },

  lifetimes: {
    attached: function () {
      var self = this;
      this.setData({ todayText: storageUtils.todayDate() });
      lexicon.load()
        .then(function (lex) { self._lexicon = lex; })
        .catch(function () { self._lexicon = { names: [], locations: [] }; });
      this.loadCategories();
    },

    detached: function () {
      if (this._openTimer) clearTimeout(this._openTimer);
      if (this._session) {
        try { this._session.stop(); } catch (e) { /* 没在录音会抛错 */ }
      }
      this.destroySession();
    }
  },

  methods: {
    /* 面板里点空白处不关闭，只有点遮罩才关 */
    noop: function () {},

    loadCategories: function () {
      var self = this;
      return api.listCategories()
        .then(function (categories) {
          self.setData({
            categories: categories,
            categoryNames: categories.map(function (c) { return c.icon + ' ' + c.name; })
          });
          self.syncPickers();
        })
        .catch(function () {
          // 分类拉不到不阻塞记录，保存时用默认值
        });
    },

    // ==============================
    // 开关面板
    // ==============================
    onOpen: function () {
      var self = this;
      // 长按进日志页后抬手可能还补一个 tap，这里吞掉
      if (this._skipTap) {
        this._skipTap = false;
        return;
      }
      if (this.data.visible) return;
      if (!speech.isAvailable()) {
        wx.showToast({ title: '语音未启用，可去列表页手动添加', icon: 'none', duration: 2500 });
        return;
      }
      this.setData({ visible: true });
      this.buildSession();
      // 等面板升起再开录，否则用户还没看到界面就已经在听了
      this._openTimer = setTimeout(function () {
        self._openTimer = null;
        if (self.data.visible && !self.data.parsed && !self.data.recording) {
          self.startVoice();
        }
      }, 240);
    },

    /** 长按悬浮按钮：看识别日志（自用排错入口，不做显式按钮） */
    onOpenLog: function () {
      this._skipTap = true;
      wx.navigateTo({
        url: '/pages/voice-log/voice-log',
        fail: function () { wx.showToast({ title: '日志页打开失败', icon: 'none' }); }
      });
    },

    onMaskTap: function () {
      this.onClose();
    },

    onKbFocus: function (e) {
      this.setData({ kb: (e.detail && e.detail.height) || 0 });
    },

    onKbBlur: function () {
      this.setData({ kb: 0 });
    },

    onClose: function () {
      if (this._openTimer) {
        clearTimeout(this._openTimer);
        this._openTimer = null;
      }
      // 录音中直接关：先让插件停止，再摘回调丢弃结果
      if (this.data.recording && this._session) {
        try { this._session.stop(); } catch (e) { /* 未在录音时 stop 会抛错 */ }
      }
      // 已经解析出来却关掉，说明结果不能用，这类最值得记
      if (this.data.parsed) this.logVoice(false);
      this.destroySession();
      this.reset();
    },

    buildSession: function () {
      var self = this;
      this.destroySession();
      this._session = speech.createSession({
        onStart: function () {
          self.setData({ recording: true });
        },

        onPartial: function (text) {
          if (!text) return;
          self.setData({ raw: text, recognizing: false });
        },

        onFinal: function (text) {
          self.finishVoice(text);
        },

        onError: function (err) {
          self.setData({ recording: false, recognizing: false });
          wx.showToast({
            title: (err && err.msg) || '语音识别失败，再说一次',
            icon: 'none',
            duration: 2500
          });
        }
      });
    },

    destroySession: function () {
      if (this._session) {
        this._session.dispose();
        this._session = null;
      }
    },

    // ==============================
    // 录音
    // ==============================
    onMicTap: function () {
      if (this.data.recognizing) return;
      if (this.data.recording) {
        this._session && this._session.stop();
        return;
      }
      this.startVoice();
    },

    startVoice: function () {
      var self = this;
      if (!this._session) this.buildSession();
      if (!this._session) return;

      speech.ensurePermission()
        .then(function () {
          self.setData({
            recording: true,
            recognizing: false,
            raw: '',
            parsed: false,
            missing: [],
            missingText: ''
          });
          wx.vibrateShort({ type: 'light', fail: function () {} });
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

    /** 说完：先按历史词库纠错，再解析成字段 */
    finishVoice: function (text) {
      if (!text) {
        this.setData({ recording: false, recognizing: false });
        wx.showToast({ title: '没听清，再说一次', icon: 'none' });
        return;
      }

      var fixed = lexicon.correct(text, this._lexicon);
      var result = quickParse.parseQuickInput(fixed.text, { today: this.data.todayText });

      // 日志要对比"插件原文 / 纠错后 / 解析值 / 用户最终保存值"，先把前三个留住
      this._rawText = text;
      this._fixes = fixed.fixes;
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

      this.setData({
        recording: false,
        recognizing: false,
        raw: fixed.text,
        parsed: true,
        draft: draft,
        missing: result.missing,
        missingText: this.missingTextOf(result.missing)
      });

      this.syncPickers();
      this.syncStatus();
    },

    missingTextOf: function (missing) {
      return (missing || []).map(function (k) {
        return MISSING_NAMES[k] || k;
      }).join('、');
    },

    /** 当前面板里的字段值（就是用户最终会保存的内容） */
    currentFields: function () {
      var d = this.data.draft;
      return {
        name: (d.name || '').trim(),
        quantity: Number(d.quantity) || 1,
        unit: d.unit,
        location: (d.location || '').trim(),
        expireDate: d.expireDate,
        category: d.category
      };
    },

    /**
     * 写一条识别日志。
     * saved=false 走的是"识别出来但用户取消了"，这类比成功保存更能暴露规则问题。
     */
    logVoice: function (saved) {
      if (!this._parsedSnapshot) return;
      voiceLog.append({
        raw: this._rawText || '',
        fixed: this.data.raw || '',
        fixes: this._fixes || [],
        parsed: this._parsedSnapshot,
        final: saved ? this.currentFields() : null,
        saved: saved
      });
    },

    /** 重说：清掉结果，回到收音并立刻开录 */
    onRetry: function () {
      this.setData({
        parsed: false,
        raw: '',
        missing: [],
        missingText: '',
        statusText: '',
        daysLeft: null
      });
      this.startVoice();
    },

    // ==============================
    // 字段修改
    // ==============================
    onFieldInput: function (e) {
      var field = e.currentTarget.dataset.field;
      var value = e.detail.value;
      var patch = {};
      // 数量保留输入框里的原样字符串，否则清空时会被立刻改回 1，删不掉
      patch['draft.' + field] = value;
      this.setData(patch);
      if (field === 'location') this.recheckMissing();
    },

    onUnitChange: function (e) {
      var idx = Number(e.detail.value);
      this.setData({
        'draft.unit': this.data.units[idx] || '个',
        unitIndex: idx
      });
    },

    onCategoryChange: function (e) {
      var idx = Number(e.detail.value);
      var cat = this.data.categories[idx];
      if (!cat) return;
      this.setData({ 'draft.category': cat.id, categoryIndex: idx });
    },

    onExpireChange: function (e) {
      this.setData({ 'draft.expireDate': e.detail.value });
      this.syncStatus();
      this.recheckMissing();
    },

    /** 补了字段就把对应提示撤掉，别一直挂着 */
    recheckMissing: function () {
      var d = this.data.draft;
      var missing = this.data.missing.filter(function (k) {
        if (k === 'location') return !d.location;
        if (k === 'produceDate') return !d.produceDate;
        if (k === 'shelfLife') return !d.shelfLifeMonths && !d.shelfLifeDays;
        return true;
      });
      this.setData({ missing: missing, missingText: this.missingTextOf(missing) });
    },

    syncPickers: function () {
      var draft = this.data.draft;
      var categories = this.data.categories;
      var categoryIndex = 0;
      for (var i = 0; i < categories.length; i++) {
        if (categories[i].id === draft.category) { categoryIndex = i; break; }
      }
      var unitIndex = this.data.units.indexOf(draft.unit);
      if (unitIndex < 0) unitIndex = 0;
      this.setData({ categoryIndex: categoryIndex, unitIndex: unitIndex });
    },

    syncStatus: function () {
      var expireDate = this.data.draft.expireDate;
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
    // 保存
    // ==============================
    onConfirm: function () {
      var self = this;
      var draft = this.data.draft;
      if (this.data.saving) return;

      var name = (draft.name || '').trim();
      if (!name) {
        wx.showToast({ title: '补个名称再存', icon: 'none' });
        return;
      }

      this.setData({ saving: true });

      api.createItem({
        name: name,
        category: draft.category,
        quantity: Number(draft.quantity) || 1,
        unit: draft.unit,
        location: (draft.location || '').trim(),
        produceDate: draft.produceDate,
        expireDate: draft.expireDate,
        note: this.data.raw
      })
        .then(function (item) {
          lexicon.remember(self._lexicon, name, draft.location);
          self.logVoice(true);
          self.setData({ saving: false });
          self.triggerEvent('saved', { item: item });
          wx.showToast({ title: '已记录', icon: 'success', duration: 900 });
          self.destroySession();
          self.reset();
        })
        .catch(function (err) {
          self.setData({ saving: false });
          wx.showToast({ title: err.message, icon: 'none', duration: 2500 });
        });
    },

    reset: function () {
      if (this._openTimer) {
        clearTimeout(this._openTimer);
        this._openTimer = null;
      }
      this._parsedSnapshot = null;
      this._rawText = '';
      this._fixes = [];
      this.setData({
        visible: false,
        kb: 0,
        recording: false,
        recognizing: false,
        saving: false,
        raw: '',
        parsed: false,
        draft: Object.assign({}, EMPTY_DRAFT),
        categoryIndex: 0,
        unitIndex: 0,
        daysLeft: null,
        statusText: '',
        missing: [],
        missingText: ''
      });
    }
  }
});
