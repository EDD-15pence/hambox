/**
 * 全局反馈按钮（F-02）
 *
 * 为什么是「12 页各挂一行」而不是改一处配置：小程序**没有**「自动出现在
 * 所有页面」的组件机制。`app.json` 的 `usingComponents` 只能让页面免声明标签，
 * 标签本身仍要在各页 wxml 写一行（见 AGENTS.md §16.3）。
 *
 * 位置自动取 `getCurrentPages()` 的末页 route，**页面不传参、不改各页 js**；
 * 页面标题走内置映射表 —— 各页是自绘导航，标题不在 data 里，读不到。
 * 用户只打字就能提交，`spot` 是可选补充。
 */
var api = require('../../utils/api');
var version = require('../../utils/version');

// route -> 页面名。取不到的（新页面忘了登记）退回 route 末段，不至于留空。
var PAGE_TITLES = {
  'pages/index/index': '首页',
  'pages/relationship/relationship': '亲属称呼换算',
  'pages/punchin/punchin': '打卡',
  'pages/storage/list/list': '智能仓储',
  'pages/storage/detail/detail': '物品详情',
  'pages/storage/edit/edit': '添加物品',
  'pages/storage/quick/quick': '快速记录',
  'pages/storage/containers/containers': '按容器看',
  'pages/voice-log/voice-log': '识别日志',
  'pages/prompt/index/index': 'Prompt 模板库',
  'pages/prompt/detail/index': 'Prompt 模板详情',
  'pages/flight/flight': '机票比价',
  'pages/feedback/list': '反馈记录'
};

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    /* 距底部的额外偏移（rpx）。页面上已有悬浮按钮时传值抬上去，避免叠在一起 */
    offset: {
      type: Number,
      value: 0
    },

    /* 贴哪一边。右下角被语音麦克风占了的两页（首页 / 清单）传 left */
    side: {
      type: String,
      value: 'right'
    }
  },

  data: {
    visible: false,
    content: '',
    spot: '',
    saving: false,
    error: '',
    // 键盘高度：面板整体抬到键盘上方，否则输入框被挡住
    kb: 0,
    pageRoute: '',
    pageTitleText: ''
  },

  lifetimes: {
    detached: function () {
      if (this._skipTapTimer) clearTimeout(this._skipTapTimer);
    }
  },

  methods: {
    noop: function () {},

    /** 当前页面：路径 + 标题。组件自己取，页面不用管 */
    resolvePage: function () {
      var pages = getCurrentPages();
      var page = pages.length ? pages[pages.length - 1] : null;
      var route = (page && page.route) || '';
      var title = PAGE_TITLES[route] || '';
      if (!title) {
        var seg = route.split('/').filter(Boolean);
        title = seg.length ? seg[seg.length - 1] : '未知页面';
      }
      return { route: route, title: title };
    },

    onOpen: function () {
      // 长按进列表后抬手可能还补一个 tap，这里吞掉
      if (this._skipTap) {
        this._skipTap = false;
        return;
      }
      var ctx = this.resolvePage();
      this.setData({
        visible: true,
        pageRoute: ctx.route,
        pageTitleText: ctx.title,
        error: ''
      });
    },

    onOpenList: function () {
      this._skipTap = true;
      if (this._skipTapTimer) clearTimeout(this._skipTapTimer);
      var self = this;
      this._skipTapTimer = setTimeout(function () { self._skipTap = false; }, 600);
      wx.navigateTo({ url: '/pages/feedback/list' });
    },

    onClose: function () {
      if (this.data.saving) return;
      this.setData({ visible: false, kb: 0 });
    },

    /* 点遮罩关闭；点面板本身不关 */
    onMaskTap: function () {
      this.onClose();
    },

    onContentInput: function (e) {
      this.setData({ content: e.detail.value, error: '' });
    },

    onSpotInput: function (e) {
      this.setData({ spot: e.detail.value });
    },

    onFocus: function (e) {
      this.setData({ kb: (e.detail && e.detail.height) || 0 });
    },

    onBlur: function () {
      this.setData({ kb: 0 });
    },

    onSubmit: function () {
      if (this.data.saving) return;
      var content = (this.data.content || '').trim();
      if (!content) {
        this.setData({ error: '写一句再提交' });
        return;
      }

      var self = this;
      this.setData({ saving: true, error: '' });

      api.createFeedback({
        content: content,
        pageRoute: this.data.pageRoute,
        pageTitle: this.data.pageTitleText,
        spot: this.data.spot,
        appVersion: version.describe()
      }).then(function () {
        self.setData({
          saving: false,
          visible: false,
          kb: 0,
          content: '',
          spot: '',
          error: ''
        });
        wx.showToast({ title: '已记下', icon: 'success', duration: 1200 });
      }).catch(function (err) {
        // 失败绝不清空输入：用户写的那段话比什么都金贵
        self.setData({
          saving: false,
          error: (err && err.message) || '没发出去，检查网络后重试'
        });
      });
    }
  }
});
