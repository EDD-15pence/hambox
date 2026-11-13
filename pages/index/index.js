const nav = require('../../utils/nav');
const theme = require('../../utils/theme');
const api = require('../../utils/api');
const auth = require('../../utils/auth');
const storageView = require('../../utils/storage-view');
const version = require('../../utils/version');

/** 角标不用每次都拉：一分钟内的切页面/返回都复用上次结果 */
const BADGE_TTL = 60 * 1000;

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function todayText() {
  const now = new Date();
  return `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAY[now.getDay()]}`;
}

/** 工具清单：新增工具只改这个数组，不用动 wxml */
const TOOLS = [
  {
    key: 'relationship',
    icon: '👨‍👩‍👧‍👦',
    name: '亲属称呼换算',
    desc: '算出该叫对方什么',
    path: '/pages/relationship/relationship',
  },
  {
    key: 'storage',
    icon: '📦',
    name: '智能仓储',
    desc: '管住家里的保质期',
    // 默认落到「家里的收纳」：先看见冰箱柜子，点开才是东西，比先看一列名单直观
    path: '/pages/storage/containers/containers',
  },
  {
    key: 'quick',
    icon: '🎙️',
    name: '快速记录',
    desc: '一句话记下买的东西',
    path: '/pages/storage/quick/quick',
  },
  {
    key: 'record',
    icon: '🗓️',
    name: '记录',
    desc: '按天记吃了什么、去了哪',
    tag: '新',
    path: '/pages/record/calendar',
  },
  {
    key: 'shop',
    icon: '🏪',
    name: '店铺记',
    desc: '点一下就记进货售卖',
    tag: '新',
    path: '/pages/shop/wall/wall',
  },
  {
    key: 'answer',
    icon: '🔍',
    name: '版本答案',
    desc: '问一句，下次该选哪个',
    tag: '新',
    path: '/pages/answer/index',
  },
  {
    key: 'punchin',
    icon: '📅',
    name: '习惯打卡',
    desc: '连续天数看得见',
    path: '/pages/punchin/punchin',
  },
  {
    key: 'prompt',
    icon: '📝',
    name: 'Prompt 模板',
    desc: '填几个空，出提示词',
    tag: 'MVP',
    path: '/pages/prompt/index/index',
  },
  {
    key: 'flight',
    icon: '✈️',
    name: '机票比价',
    desc: '生成各平台搜索词',
    tag: '原型',
    path: '/pages/flight/flight',
  },
];

Page({
  data: {
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    isDark: false,
    todayText: todayText(),
    // 按 ACL 过滤后的可见卡片（U-04）。没拿到身份前先全给，见 utils/auth.js 头部
    tools: TOOLS,
    // 智能仓储卡片右上角：几件要提醒的（已过期 + 临期）
    storageBadge: 0,
    storageBadgeType: 'warning',
  },

  onLoad() {
    this.setData({
      isDark: theme.getTheme(),
      versionText: version.describe(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT,
    });
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  },

  onShow() {
    // 从其他页面切回来时同步主题，避免状态不一致
    const isDark = theme.getTheme();
    if (isDark !== this.data.isDark) this.setData({ isDark });
    // 身份是异步拿到的：登录完成后重算一遍可见卡片（U-04）
    const app = getApp();
    const ready = (app && app.sessionPromise) || Promise.resolve(null);
    ready.then(() => this.applyTools());
    this.refreshStorageBadge();
  },

  /**
   * 按 ACL 过滤首页卡片（U-04）。
   *
   * 白名单语义：不在 allowlist 里的工具默认不显示，所以以后新增工具
   * 不会自动出现在妹妹的首页上（§18.9.4）。`quick` 与 `storage` 是同一组，
   * 归组逻辑在 `utils/auth.js` 的 `GROUP_OF`。
   */
  applyTools() {
    const tools = TOOLS.filter((tool) => auth.can(tool.key));
    if (tools.length === this.data.tools.length) return;
    this.setData({ tools });
  },

  /**
   * 拉一次过期概览给「智能仓储」卡片挂角标。
   * 首页是唯一不依赖后端的页面，所以失败一律静默：连不上后端不该让首页变红。
   * 后端不可达时最长要等「外网 8s + 内网 3s」，反正是异步的，不挡渲染。
   */
  refreshStorageBadge() {
    // 卡片都看不见了就别偷偷拉数据：角标数字本身就会暴露「家里有几件临期」（§18.9.2）
    if (!auth.can('storage')) {
      if (this.data.storageBadge !== 0) this.setData({ storageBadge: 0 });
      return;
    }
    if (this._badgeAt && Date.now() - this._badgeAt < BADGE_TTL) return;
    api.getOverview()
      .then((o) => {
        this._badgeAt = Date.now();
        const count = o.expired + o.warning;
        this.setData({
          storageBadge: count,
          storageBadgeType: o.expired > 0 ? 'danger' : 'warning',
        });
      })
      .catch(() => {
        // 拉不到就保持现状；已经有过角标也不清空，避免网络一抖数字消失
      });
  },

  onToggleTheme() {
    this.setData({ isDark: theme.toggleTheme() });
  },

  /**
   * 长按主题按钮 = 本次会话内放弃手动值、回到跟随系统。
   * 不给它单独一个按钮/开关：手动值本来就不跨会话，这个入口只是省得杀掉重进。
   */
  onResetTheme() {
    const isDark = theme.resetToSystem();
    this.setData({ isDark });
    wx.showToast({ title: '已跟随系统', icon: 'none' });
  },

  /** 长按页脚版本号 → 连接设置（债-1）。刻意不做成按钮：这是运维入口，不是功能 */
  onOpenSettings() {
    wx.vibrateShort({ type: 'light' });
    wx.navigateTo({ url: '/pages/settings/index' });
  },

  /** 语音面板保存成功（提示由组件负责，这里刷新一下角标） */
  onVoiceSaved() {
    this._badgeAt = 0;
    this.refreshStorageBadge();
  },

  navigateToTool(e) {
    const key = e.currentTarget.dataset.tool;
    const tool = TOOLS.find((t) => t.key === key);
    if (!tool) return;
    // 再校验一次：data 可能还是登录前的旧值，分享带参数也可能绕过过滤（U-04）
    if (!auth.can(key)) {
      wx.showToast({ title: '当前身份没有这个工具', icon: 'none' });
      return;
    }
    // 智能仓储有「容器 / 清单」两种模式，进上次停留的那一种
    const url = key === 'storage' ? storageView.entryUrl() : tool.path;
    wx.navigateTo({
      url,
      fail: (err) => {
        console.error('导航失败:', err);
        wx.showToast({ title: '打开工具失败，请重试', icon: 'none' });
      },
    });
  },

  /**
   * 分享标题也按角色走（§18.9.8「一起遮」）：妹妹这一档不该在分享里
   * 露出「找东西、查称呼」这些她根本看不到的能力。
   */
  shareTitle() {
    return auth.can('storage') ? '汉堡盒 · 找东西、随手记、查称呼' : '汉堡盒 · 店铺记';
  },

  onShareAppMessage() {
    return { title: this.shareTitle(), path: '/pages/index/index' };
  },

  onShareTimeline() {
    return { title: this.shareTitle(), query: '' };
  },
});
