const nav = require('./utils/nav');
const theme = require('./utils/theme');
const api = require('./utils/api');

App({
  globalData: {
    // 自绘导航栏需要让出的状态栏高度（px）
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    // 当前深色模式（页面各自 setData，这里只做启动时的初始值）
    darkMode: theme.getTheme(),
    // 当前连的是内网还是外网（探路结果，诊断用）
    apiRoute: '',
  },

  onLaunch() {
    this.globalData.statusBarHeight = nav.STATUS_BAR_HEIGHT;
    this.globalData.darkMode = theme.getTheme();
    // 后台探一次路：内网不通就自动切外网，省得首页第一个请求白等 8 秒
    api.probe().then((route) => {
      this.globalData.apiRoute = route;
    });
  },
});
