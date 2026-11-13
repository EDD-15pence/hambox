const nav = require('../../utils/nav');
const theme = require('../../utils/theme');
const api = require('../../utils/api');
const auth = require('../../utils/auth');
const storageView = require('../../utils/storage-view');
const version = require('../../utils/version');
const hold = require('../../utils/hold');

/** 角标不用每次都拉：一分钟内的切页面/返回都复用上次结果 */
const BADGE_TTL = 60 * 1000;

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function todayText() {
  const now = new Date();
  return `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAY[now.getDay()]}`;
}

/** 工具清单：新增工具只改这个数组，不用动 wxml；下架只改 `utils/hold.js` */
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
    key: 'correction',
    icon: '🎯',
    name: '随机打卡',
    desc: '随机问一句，戒掉坏习惯',
    tag: '新',
    path: '/pages/correction/index',
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
    // 按 HOLD → ACL 过滤后的可见卡片（§20.3）。初始值也要过一遍 HOLD，
    // 否则登录前那一帧会闪出已下架的卡
    tools: TOOLS.filter((tool) => !hold.isHeld(tool.key)),
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
    this.askCorrection();
  },

  /**
   * 随机打卡的 A 线（§19.4）：打开小程序就走这条，不消耗服务通知授权。
   * 组件内部记了「本次会话弹过哪一条」，所以从别的页面返回首页不会反复弹。
   * 拉不到 / 没有配额都静默 —— 首页不该因为抽查失败而弹错误。
   */
  askCorrection() {
    // 没有这个工具的身份别去撞 403（妹妹 `shop` 档看不到随机打卡，也不该收通知）
    if (!auth.can('correction')) return;
    const ask = this.selectComponent('#ask');
    if (ask) ask.ask();
  },

  /**
   * 按 HOLD → ACL 过滤首页卡片（§20.3 / U-04）。
   *
   * 顺序不能反：HOLD 是产品下架（与身份无关），ACL 是按角色隔离。先剔 HOLD，
   * 再判 `auth.can()`，以后想「恢复某个工具但只对 admin 开放」才不用改结构。
   *
   * 白名单语义：不在 allowlist 里的工具默认不显示，所以以后新增工具
   * 不会自动出现在妹妹的首页上（§18.9.4）。`quick` 与 `storage` 是同一组，
   * 归组逻辑在 `utils/auth.js` 的 `GROUP_OF`。
   */
  applyTools() {
    const tools = TOOLS
      .filter((tool) => !hold.isHeld(tool.key))
      .filter((tool) => auth.can(tool.key));
    // 比 key 不比长度：从「guest 空表」换成「shop 一张卡」时两者可能都是
    // 1 张但内容不同，比长度会漏掉整次更新
    const before = this.data.tools.map((tool) => tool.key).join(',');
    const after = tools.map((tool) => tool.key).join(',');
    if (before === after) return;
    this.setData({ tools });
  },

  /**
   * 首页兜底：一张卡都看不见时的出口（2026-11-13 真机踩过）。
   *
   * 以前这里就是一片空白，用户完全不知道自己被当成访客了。现在给一个
   * 身份状态 + 「重新登录」，改完权限点一下就好，不用知道设置页藏在哪。
   */
  onRefreshIdentity() {
    if (this._refreshing) return;
    this._refreshing = true;
    wx.showLoading({ title: '重连中', mask: true });
    const app = getApp();
    const done = (session) => {
      this._refreshing = false;
      wx.hideLoading();
      this.applyTools();
      this.refreshStorageBadge();
      if (!session) {
        wx.showToast({ title: '重连失败，检查线路与后端', icon: 'none' });
        return;
      }
      wx.showToast({
        title: session.role === 'admin' ? '已是管理员' : '身份已刷新',
        icon: 'none',
      });
    };
    if (app && app.refreshSession) app.refreshSession().then(done);
    else done(null);
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
    // 已下架的卡：`data` 可能还是登录前的旧值，分享带参数也可能绕过过滤（§20.4-2）
    if (hold.isHeld(key)) {
      wx.showToast({ title: '这个工具暂时下架了', icon: 'none' });
      return;
    }
    // 再校验一次权限：同理，data 可能还是登录前的旧值（U-04）
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
   * 露出她根本看不到的能力。admin 档 16:02 定稿为「找东西、随手记、记库存」
   * —— 不再提已 HOLD 的「查称呼」（§20.8-2）。
   */
  shareTitle() {
    return auth.can('storage') ? '汉堡盒 · 找东西、随手记、记库存' : '汉堡盒 · 店铺记';
  },

  onShareAppMessage() {
    return { title: this.shareTitle(), path: '/pages/index/index' };
  },

  onShareTimeline() {
    return { title: this.shareTitle(), query: '' };
  },
});
