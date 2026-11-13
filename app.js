const nav = require('./utils/nav');
const theme = require('./utils/theme');
const api = require('./utils/api');
const auth = require('./utils/auth');

App({
  globalData: {
    // 自绘导航栏需要让出的状态栏高度（px）
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    // 当前深色模式。**必须在 onLaunch 里赋值**：App() 定义时就求值的话
    // 系统主题还没读，永远是浅色（A-08 的坑）
    darkMode: false,
    // 当前连的是内网还是外网（探路结果，诊断用）
    apiRoute: '',
    // 身份（U-02）：角色与 ACL，由 ensureSession 填上
    role: '',
    aclReady: false,
  },

  onLaunch() {
    this.globalData.statusBarHeight = nav.STATUS_BAR_HEIGHT;
    // 冷启动读一次系统主题，手动值清零（手动只活本次，见 utils/theme.js）
    theme.initFromSystem();
    this.globalData.darkMode = theme.getTheme();
    // 后台探一次路：内网不通就自动切外网，省得首页第一个请求白等 8 秒
    api.probe().then((route) => {
      this.globalData.apiRoute = route;
      // 探到路再登录：登录本身也是请求，路线没定下来会白等一轮
      this.sessionPromise = this.ensureSession();
    });
  },

  /**
   * 确保有可用会话（U-02）。
   *
   * 三个原则：
   * 1. **静默**：失败不弹任何提示，不阻塞首页 —— 身份层这一版还没挂守卫，
   *    登录失败不该让人连仓储都打不开；
   * 2. **不重复**：会话没过期就不重新登录，冷启动只有一次网络往返；
   * 3. **每次启动都试着刷一次**（过期前 2 小时），因为后端重启会让旧 token 失效。
   *
   * @returns {Promise<object|null>} 会话对象，失败给 null
   */
  ensureSession() {
    if (!auth.needsRefresh()) {
      this.applySession(auth.getSession());
      return Promise.resolve(auth.getSession());
    }
    return api.loginWithWechat()
      .then((data) => {
        const session = auth.setSession(data);
        this.applySession(session);
        return session;
      })
      .catch(() => {
        // 后端还没升级到 U-02（没有 /api/auth/session）、或压根连不上，
        // 都走这里。保留已有会话，别把上一份还能用的 token 清掉。
        this.applySession(auth.getSession());
        return null;
      });
  },

  applySession(session) {
    this.globalData.role = session ? session.role : '';
    this.globalData.aclReady = !!session;
  },
});
