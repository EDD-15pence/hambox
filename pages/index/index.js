Page({
  data: {
    isDark: false,
  },

  onLoad() {
    // 显示分享菜单
    wx.showShareMenu({
      withShareTicket: true,
      menus: ["shareAppMessage", "shareTimeline"],
    });
  },

  onToggleTheme() {
    this.setData({ isDark: !this.data.isDark });
  },

  // 导航到工具页面
  navigateToTool(e) {
    const toolName = e.currentTarget.dataset.tool;
    
    const toolMap = {
      relationship: '/pages/relationship/relationship',
      punchin: '/pages/punchin/punchin',
      storage: '/pages/storage/list/list',
      prompt: '/pages/prompt/index/index'
    };

    const targetPath = toolMap[toolName];
    if (targetPath) {
      wx.navigateTo({
        url: targetPath,
        fail: (err) => {
          console.error('导航失败:', err);
          wx.showToast({
            title: '打开工具失败，请重试',
            icon: 'none',
          });
        },
      });
    }
  },

  // 分享给朋友
  onShareAppMessage() {
    return {
      title: '多功能工具箱',
      path: '/pages/index/index',
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '多功能工具箱',
      query: '',
    };
  },
});
