/**
 * 智能仓储 · 首启引导（RM-02 / RM-08 / AGENTS.md §21.5）
 *
 * 以前新用户一进仓储就看到写死的 8 个内置容器（冰箱 / 厨房柜 / 零食柜 / 药箱 …），
 * 那不是「他家」。这里让他先说自己家有什么。
 *
 * **1.3.18 起这一页只剩壳**：两步流程全部搬进 `components/room-wizard`，
 * 因为整理页（`pages/storage/rooms`）要「随时再走一遍同一套向导」。
 * 两份 js 各写一遍（1.3.17 是 650 行重复）改一处必忘另一处，所以必须共用。
 *
 * 这一页只负责三件事，别的都别往这儿塞：
 *
 * 1. **首启三条件判断**：本地 `unset` + 后端容器全是内置 + `rooms` 为空，缺一不进。
 * 2. **后端不可达不进引导**：拉容器失败直接 `conn-error`、`setup_done` 不置位，
 *    下次连上再问。绝不允许「引导页开着但后端 500」的半状态（§21.9 第 5 项）。
 * 3. **走完 / 跳过之后**：写 `setup_done`，回容器墙。
 */
var nav = require('../../../utils/nav');
var theme = require('../../../utils/theme');
var api = require('../../../utils/api');
var auth = require('../../../utils/auth');
var storageUtils = require('../../../utils/storage-utils');

Page({
  data: {
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    isDark: false,
    baseUrl: '',

    step: 1,
    loading: true,
    retrying: false,
    error: '',

    // 交给向导组件的两份现状：房间（预勾用）与容器原始行（认领内置柜子用）
    existingRooms: [],
    existingContainers: []
  },

  onLoad: function () {
    if (!auth.guard('storage')) return;
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT,
      baseUrl: api.getBaseUrl()
    });
    this.check();
  },

  /**
   * 进来先确认「该不该引导」。
   * 条件不满足（已经建过房间 / 改过容器 / 问过了）就直接去容器墙，
   * 免得用户从别处误入看到一个已经被跳过很多次的引导。
   */
  check: function () {
    var self = this;
    this.setData({ retrying: !!this.data.error });

    return Promise.all([api.listContainers(), api.listRooms()])
      .then(function (res) {
        if (!storageUtils.needsSetup(res[0], res[1])) {
          self.goWall();
          return;
        }
        self.setData({
          loading: false,
          retrying: false,
          error: '',
          existingContainers: res[0] || [],
          existingRooms: (res[1] || []).map(function (row) {
            return {
              id: row.id,
              name: row.name,
              icon: row.icon,
              sortOrder: row.sort_order || 0,
              isBuiltin: !!row.is_builtin
            };
          })
        });
      })
      .catch(function (err) {
        // 后端不可达：不进引导、不置位，交给 conn-error 卡片（§21.9 第 5 项）
        self.setData({
          loading: false,
          retrying: false,
          error: (err && err.message) || '请求失败'
        });
      });
  },

  onRetry: function () {
    this.check();
  },

  goWall: function () {
    // 1.3.19 起仓储默认入口是房间页，走完引导落回那里（函数名保留，别顺手改调用处）
    wx.redirectTo({ url: '/pages/storage/rooms/rooms' });
  },

  onBack: function () {
    var wz = this.selectComponent('#wz');
    if (wz && wz.data.step === 2) {
      wz.onPrev();
      return;
    }
    this.onWizardSkip();
  },

  onToggleTheme: function () {
    this.setData({ isDark: theme.toggleTheme() });
  },

  // ==============================
  // 向导事件
  // ==============================

  onWizardStep: function (e) {
    this.setData({ step: (e.detail && e.detail.step) || 1 });
  },

  onWizardDone: function () {
    // 走完向导才置 done：中途失败保持 unset，下次进来还能继续
    storageUtils.setSetupState('done');
    wx.showToast({ title: '收拾好了', icon: 'success' });
    var self = this;
    setTimeout(function () { self.goWall(); }, 600);
  },

  onWizardSkip: function () {
    storageUtils.setSetupState('skipped');
    this.goWall();
  }
});
