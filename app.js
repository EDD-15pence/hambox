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
    // 后台探一次路：内网不通就自动切外网，省得首页第一个请求白等 8 秒。
    // **先赋值再等待**：首页 onShow 会读 `sessionPromise` 来重算可见卡片，
    // 如果等探路回来才赋值，那次 onShow 拿到的是 undefined，会按本地旧缓存
    // 渲染一版再也不更新（冷启动偶发「卡片数量不对」）
    this.sessionPromise = api.probe().then((route) => {
      this.globalData.apiRoute = route;
      // 探到路再登录：登录本身也是请求，路线没定下来会白等一轮
      return this.ensureSession();
    });
  },

  /**
   * 确保有可用会话（U-02）。
   *
   * 三个原则：
   * 1. **静默**：失败不弹任何提示，不阻塞首页；
   * 2. **不重复**：会话没过期就不重新登录，冷启动只有一次网络往返；
   * 3. **每次启动都试着刷一次**（过期前 2 小时 / ACL 为空），因为后端重启会让
   *    旧 token 失效，后台改了权限也不会通知前端。
   *
   * @param {boolean} force true = 无条件重登（401 之后、用户点「刷新身份」时用）
   * @returns {Promise<object|null>} 会话对象，失败给 null
   */
  ensureSession(force) {
    if (!force && !auth.needsRefresh()) {
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

  /**
   * 强制刷新身份（前台可见的「刷新身份」按钮走这里）。
   *
   * 和 `ensureSession()` 的区别只有一个：不看本地缓存，直接换一张新会话。
   * 后台改完 `users.role` 或 `ADMIN_OPENIDS` 之后，用户点一下就生效，
   * 不用杀进程重进。
   */
  refreshSession() {
    this.sessionPromise = this.ensureSession(true);
    return this.sessionPromise;
  },

  applySession(session) {
    this.globalData.role = session ? session.role : '';
    this.globalData.aclReady = !!session;
  },
});
