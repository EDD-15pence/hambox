/**
 * This file follows:
 * docs/prompt-tool-design.md
 * docs/prompt-tool-folder-structure.md
 */
const templates = require('../../../data/prompt-templates');
const nav = require('../../../utils/nav');

Page({
  data: {
    templates: [],
    statusBarHeight: nav.STATUS_BAR_HEIGHT
  },
  onLoad() {
    // 加载本地模板数据
    this.setData({ templates, statusBarHeight: nav.STATUS_BAR_HEIGHT });
  },
  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.reLaunch({ url: '/pages/index/index' }) });
  },
  onSelectTemplate(e) {
    // try multiple places for dataset (target vs currentTarget)
    const id = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id
      ? e.currentTarget.dataset.id
      : (e.target && e.target.dataset && e.target.dataset.id) || '';
    console.log('selected template id:', id, 'event:', e);
    if (!id) {
      wx.showToast({ title: '未取得模板 id', icon: 'none' });
      return;
    }

    const url = `/pages/prompt/detail/index?id=${encodeURIComponent(id)}`;
    wx.navigateTo({
      url,
      success: () => console.log('navigate success', url),
      fail: (err) => {
        console.error('navigate fail', err);
        wx.showModal({ title: '导航失败', content: JSON.stringify(err), showCancel: false });
      }
    });
  }
});
