const nav = require('../../utils/nav');
const theme = require('../../utils/theme');
const api = require('../../utils/api');
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
    this.refreshStorageBadge();
  },

  /**
   * 拉一次过期概览给「智能仓储」卡片挂角标。
   * 首页是唯一不依赖后端的页面，所以失败一律静默：连不上后端不该让首页变红。
   * 后端不可达时最长要等「外网 8s + 内网 3s」，反正是异步的，不挡渲染。
   */
  refreshStorageBadge() {
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

  onShareAppMessage() {
    return { title: '汉堡盒 · 找东西、随手记、查称呼', path: '/pages/index/index' };
  },

  onShareTimeline() {
    return { title: '汉堡盒 · 找东西、随手记、查称呼', query: '' };
  },
});
