const nav = require('../../utils/nav');
const theme = require('../../utils/theme');

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
    path: '/pages/storage/list/list',
  },
  {
    key: 'quick',
    icon: '🎙️',
    name: '快速记录',
    desc: '一句话记下买的东西',
    path: '/pages/storage/quick/quick',
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
    isDark: false,
    todayText: todayText(),
    tools: TOOLS,
  },

  onLoad() {
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
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
  },

  onToggleTheme() {
    this.setData({ isDark: theme.toggleTheme() });
  },

  /** 语音面板保存成功（提示由组件负责，这里只留扩展点） */
  onVoiceSaved() {
    // 首页没有列表要刷新；将来若加「今日已记 N 件」在这里更新
  },

  navigateToTool(e) {
    const key = e.currentTarget.dataset.tool;
    const tool = TOOLS.find((t) => t.key === key);
    if (!tool) return;
    wx.navigateTo({
      url: tool.path,
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
