/**
 * 随机打卡 · 详情（§19 / H-07 统计的展示侧）
 *
 * 一屏回答四个问题：今天答了几次 / 守住了几次 / 最近七天怎么样 / 都什么时间犯。
 * 统计口径全部由后端聚合（`checks` 是唯一事实来源），页面不再自己算 ——
 * 前端再算一遍迟早和后端对不上（§10-24 的老教训）。
 *
 * 「跳过」在页面上明确标注「不算进无犯率」，否则用户会以为 3 次里 1 次跳过 =
 * 33% 做错了。
 */

var nav = require('../../utils/nav');
var theme = require('../../utils/theme');
var api = require('../../utils/api');
var auth = require('../../utils/auth');
var correction = require('../../utils/correction');

var DOT_TONE = {
  doing: 'warn',
  clean: 'ok',
  skipped: 'mute',
  planned: 'idle',
  shown: 'idle',
  missed: 'idle'
};

Page({
  data: {
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    isDark: false,
    id: 0,
    loading: true,
    error: '',
    item: null,
    stats: null,
    rateText: '—',
    // 最近 7 天的圆点矩阵：[{ key, label, dots: [{ i, tone, text }] }]
    days: [],
    // 时段分布横条：在 load 里算好，wxml 不能调方法
    hourly: [],
    suggestions: [],
    // 默认只露前 6 条（内置就 22 条，全铺开会把页面撑得很长）
    visibleSuggestions: [],
    showAllSuggestions: false,
    newSuggestion: '',
    addingSuggestion: false,
    kb: 0,
    formVisible: false,
    formValue: null,
    saving: false
  },

  onLoad(query) {
    if (!auth.guard('correction')) return;
    var id = Number((query && query.id) || 0);
    this.setData({
      id: id,
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT
    });
    this.load();
  },

  onShow() {
    var isDark = theme.getTheme();
    if (isDark !== this.data.isDark) this.setData({ isDark });
  },

  load() {
    var id = this.data.id;
    if (!id) {
      this.setData({ loading: false, error: '没带矫正项 id' });
      return Promise.resolve();
    }
    this.setData({ error: '' });
    return Promise.all([
      api.correctionGet(id),
      api.correctionStats(id, 7),
      api.correctionChecks(id, 7),
      api.suggestionList(id)
    ])
      .then((results) => {
        var item = results[0];
        var stats = results[1];
        var checks = results[2].items || [];
        var suggestions = results[3].items || [];
        var base = stats.clean + stats.doing;
        item.scheduleText = correction.scheduleText(item);
        this.setData({
          loading: false,
          item: item,
          stats: stats,
          rateText: correction.rateText(stats.cleanRate, base),
          days: this.groupDays(checks, stats.items),
          hourly: this.hourlyRows(stats),
          suggestions: suggestions,
          visibleSuggestions: suggestions.slice(0, 6),
          showAllSuggestions: suggestions.length <= 6
        });
      })
      .catch((err) => {
        this.setData({ loading: false, error: (err && err.message) || '没拉到数据' });
      });
  },

  /**
   * 把记录按天分组画圆点。**空日也要出现**（用 stats.items 的日期列表），
   * 否则「昨天没答」会直接从图上消失，看起来像天天都做到了。
   */
  groupDays(checks, statDays) {
    var byDay = {};
    (checks || []).forEach((check) => {
      var key = check.planDate;
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(check);
    });

    var days = (statDays || []).map((row) => {
      var key = row.day;
      var list = (byDay[key] || []).slice().sort(function (a, b) {
        return a.plannedAt < b.plannedAt ? -1 : 1;
      });
      var dots = list.map(function (check, index) {
        return {
          i: index,
          tone: DOT_TONE[check.answer || check.status] || 'idle',
          text: correction.ANSWERS[check.answer] ? correction.ANSWERS[check.answer].label : '未答'
        };
      });
      return {
        key: key,
        label: key.slice(5),
        dots: dots,
        planned: row.planned || 0,
        answered: row.answered || 0
      };
    });

    // 后端按日期升序返回，这里倒过来：最近的在上
    return days.reverse();
  },

  /** 时段分布：把后端给的 { '14': 3 } 变成可画横条的比例 */
  hourlyRows(stats) {
    var hourly = (stats && stats.hourly) || {};
    var keys = Object.keys(hourly).sort();
    if (!keys.length) return [];
    var max = keys.reduce(function (top, key) {
      return Math.max(top, hourly[key]);
    }, 1);
    return keys.map(function (key) {
      return {
        key: key,
        label: correction.hourText(key),
        count: hourly[key],
        percent: Math.round((hourly[key] / max) * 100)
      };
    });
  },

  /** 详情页也能补答：不自动弹，用户点「现在问一次」才弹 */
  onAskNow() {
    var ask = this.selectComponent('#ask');
    if (!ask) return;
    ask.ask({ force: true }).then((check) => {
      if (!check) wx.showToast({ title: '现在没有要答的抽查', icon: 'none' });
    });
  },

  onAsked() {
    this.load();
  },

  onToggleSuggestions() {
    var open = !this.data.showAllSuggestions;
    this.setData({
      showAllSuggestions: open,
      visibleSuggestions: open ? this.data.suggestions : this.data.suggestions.slice(0, 6)
    });
  },

  onSuggestionInput(e) {
    this.setData({ newSuggestion: e.detail.value });
  },

  onKeyboardHeight(e) {
    var height = (e.detail && e.detail.height) || 0;
    if (height !== this.data.kb) this.setData({ kb: height });
  },

  onAddSuggestion() {
    var text = (this.data.newSuggestion || '').trim();
    if (!text || this.data.addingSuggestion) {
      if (!text) wx.showToast({ title: '先写一句建议', icon: 'none' });
      return;
    }
    this.setData({ addingSuggestion: true });
    api
      .suggestionCreate({ correctionId: this.data.id, text: text })
      .then(() => {
        this.setData({ addingSuggestion: false, newSuggestion: '', kb: 0 });
        wx.showToast({ title: '加好了', icon: 'none' });
        this.load();
      })
      .catch((err) => {
        this.setData({ addingSuggestion: false });
        wx.showToast({ title: (err && err.message) || '没加上', icon: 'none' });
      });
  },

  onDeleteSuggestion(e) {
    var id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    wx.showModal({
      title: '删掉这条建议？',
      content: '只是不再出现，以后想恢复还能改回来。',
      confirmText: '删掉',
      success: (res) => {
        if (!res.confirm) return;
        api
          .suggestionDelete(id)
          .then(() => {
            wx.showToast({ title: '删了', icon: 'none' });
            this.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '没删掉', icon: 'none' });
          });
      }
    });
  },

  onOpenEdit() {
    if (!this.data.item) return;
    this.setData({ formVisible: true, formValue: this.data.item });
  },

  onFormClose() {
    this.setData({ formVisible: false, formValue: null, saving: false });
  },

  onFormSave(e) {
    var detail = e.detail || {};
    if (!detail.id) return;
    this.setData({ saving: true });
    api
      .correctionUpdate(detail.id, detail.payload || {})
      .then(() => {
        this.setData({ saving: false, formVisible: false, formValue: null });
        wx.showToast({ title: '改好了', icon: 'none' });
        this.load();
      })
      .catch((err) => {
        this.setData({ saving: false });
        wx.showToast({ title: (err && err.message) || '没存上', icon: 'none' });
      });
  },

  onDisable() {
    if (!this.data.item || !this.data.item.enabled) return;
    wx.showModal({
      title: '停掉这一项？',
      content: '停掉后不再抽查，但历史记录和无犯率都还在。',
      confirmText: '停掉',
      success: (res) => {
        if (!res.confirm) return;
        api
          .correctionDisable(this.data.id)
          .then(() => {
            wx.showToast({ title: '已停用', icon: 'none' });
            this.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '没停掉', icon: 'none' });
          });
      }
    });
  },

  onRestore() {
    if (!this.data.item || this.data.item.enabled) return;
    api
      .correctionUpdate(this.data.id, { enabled: true })
      .then(() => {
        wx.showToast({ title: '恢复了', icon: 'none' });
        this.load();
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '没恢复', icon: 'none' });
      });
  },

  onRetry() {
    this.setData({ loading: true });
    this.load();
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' })
    });
  }
});
