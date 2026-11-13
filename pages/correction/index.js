/**
 * 随机打卡 · 列表页（§19 / H-02 / H-06）
 *
 * 一进来先做两件事：拉列表（拿到今天的进度）+ 问一次「现在该不该弹」。
 * 后者就是 A 线触达 —— **打开小程序直接弹，不消耗服务通知授权**（§19.4）。
 *
 * 卡片点进去是详情（统计 / 历史 / 建议库），长按直接改规则。
 */

var nav = require('../../utils/nav');
var theme = require('../../utils/theme');
var api = require('../../utils/api');
var auth = require('../../utils/auth');
var correction = require('../../utils/correction');

var WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function todayText() {
  var now = new Date();
  return `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAY[now.getDay()]}`;
}

Page({
  data: {
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    isDark: false,
    todayText: todayText(),
    loading: true,
    error: '',
    items: [],
    activeCount: 0,
    // 今天合计：已答 / 计划
    doneCount: 0,
    planCount: 0,
    cleanCount: 0,
    doingCount: 0,
    todayRateText: '—',
    formVisible: false,
    formValue: null,
    saving: false
  },

  onLoad() {
    // 页面守卫（§18）：没权限就直接退回首页，别渲染一个空壳
    if (!auth.guard('correction')) return;
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT
    });
  },

  onShow() {
    const isDark = theme.getTheme();
    if (isDark !== this.data.isDark) this.setData({ isDark });
    this.load();
    // 每次进页面都问一次：A 线的触发条件就是「打开了」
    const ask = this.selectComponent('#ask');
    if (ask) ask.ask();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ error: '' });
    return api
      .correctionList(true)
      .then((data) => {
        const items = (data.items || []).map((row) => this.decorate(row));
        const active = items.filter((row) => row.enabled);
        const done = active.reduce((sum, row) => sum + row.today.answered, 0);
        const plan = active.reduce((sum, row) => sum + row.today.planned, 0);
        const clean = active.reduce((sum, row) => sum + row.today.clean, 0);
        const doing = active.reduce((sum, row) => sum + row.today.doing, 0);
        this.setData({
          loading: false,
          items: items,
          activeCount: active.length,
          doneCount: done,
          planCount: plan,
          cleanCount: clean,
          doingCount: doing,
          todayRateText: correction.rateText(clean / (clean + doing || 1), clean + doing)
        });
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: (err && err.message) || '没拉到数据'
        });
      });
  },

  /** 给卡片补上只看一眼就懂的派生字段，wxml 里不写逻辑 */
  decorate(row) {
    const today = row.today || {};
    const dots = [];
    for (let index = 0; index < today.planned; index += 1) {
      // 带 i 是为了 wx:key 有稳定值：纯布尔数组在 wxml 里没有可用的 key
      dots.push({ i: index, on: index < today.answered });
    }
    return Object.assign({}, row, {
      scheduleText: correction.scheduleText(row),
      todayText: correction.todayText(today),
      dots: dots,
      // 今天还剩几次没答（停用的项不提示）
      remaining: row.enabled ? today.remaining : 0
    });
  },

  /** A 线弹层答完 / 关掉后刷新进度 */
  onAskChanged() {
    this.load();
  },

  /**
   * 手动再问一次。自动弹过的同一条不会自动再弹（不然返回首页会反复弹），
   * 所以留这个入口：用户想现在补答就点它。
   */
  onAskNow() {
    const ask = this.selectComponent('#ask');
    if (!ask) return;
    ask.ask({ force: true }).then((check) => {
      if (!check) wx.showToast({ title: '现在没有要答的抽查', icon: 'none' });
    });
  },

  onOpenCreate() {
    this.setData({ formVisible: true, formValue: null });
  },

  onOpenEdit(e) {
    const id = Number(e.currentTarget.dataset.id);
    const row = this.data.items.filter((item) => item.id === id)[0];
    if (!row) return;
    wx.vibrateShort({ type: 'light' });
    this.setData({ formVisible: true, formValue: row });
  },

  onFormClose() {
    this.setData({ formVisible: false, formValue: null, saving: false });
  },

  /** 组件只负责表单，落库在这里做：新建还是编辑由有没有 id 决定 */
  onFormSave(e) {
    const detail = e.detail || {};
    const payload = detail.payload || {};
    this.setData({ saving: true });
    const task = detail.id
      ? api.correctionUpdate(detail.id, payload)
      : api.correctionCreate(payload);
    task
      .then(() => {
        this.setData({ saving: false, formVisible: false, formValue: null });
        wx.showToast({ title: detail.id ? '改好了' : '建好了', icon: 'none' });
        this.load();
      })
      .catch((err) => {
        this.setData({ saving: false });
        wx.showToast({ title: (err && err.message) || '没存上，再试一次', icon: 'none' });
      });
  },

  onOpenDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/correction/detail?id=' + encodeURIComponent(id) });
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
