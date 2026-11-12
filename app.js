const nav = require('./utils/nav');
const theme = require('./utils/theme');
const api = require('./utils/api');

App({
  globalData: {
    // 自绘导航栏需要让出的状态栏高度（px）
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    // 当前深色模式。**必须在 onLaunch 里赋值**：App() 定义时就求值的话
    // 系统主题还没读，永远是浅色（A-08 的坑）
    darkMode: false,
    // 当前连的是内网还是外网（探路结果，诊断用）
    apiRoute: '',
  },

  onLaunch() {
    this.globalData.statusBarHeight = nav.STATUS_BAR_HEIGHT;
    // 冷启动读一次系统主题，手动值清零（手动只活本次，见 utils/theme.js）
    theme.initFromSystem();
    this.globalData.darkMode = theme.getTheme();
    // 后台探一次路：内网不通就自动切外网，省得首页第一个请求白等 8 秒
    api.probe().then((route) => {
      this.globalData.apiRoute = route;
    });
  },
});
