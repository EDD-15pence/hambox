/**
 * 智能仓储 · 房间 / 容器整理（RM-03 / RM-04 / RM-08 / AGENTS.md §21.6 / §21.12）
 *
 * 家里的收纳从「一层平铺的柜子」变成「房间 → 柜子」两层。这一页有两种状态：
 *
 * - **向导态（默认）**：进页先走两步 —— 勾房间 → 按顺序给每个房间勾柜子。
 *   1.3.17 只有「管理视图」，第一次用的人不知道该从哪下手；向导则被锁在首启引导里，
 *   过了那一次就再也进不去（§21.12 一）。现在向导随时可走，逻辑与首启引导**同一份**
 *   （`components/room-wizard`）。
 * - **管理态**：房间卡片 + 上下移 + 改 + 删 + 柜子卡片，也就是 1.3.17 那套原样保留。
 *   向导点「跳过」或走完就落到这里；再点导航的「管理」也能直接来。
 *
 * 三条刻意的设计：
 *
 * 1. **删房间不删东西**：容器回到「未分组」，物品靠 `location` 文本归位，
 *    一件都不会丢 —— 和「删容器 → 东西进未归位」同一套原则（§21.3 ①）。
 * 2. **改容器不重写面板**：点柜子跳到容器墙并直接打开 S-09 的编辑面板，
 *    那里已经有名称/外观/层数/关键字/所属房间（RM-04 取「替换」而非并存）。
 * 3. **不做拖拽**：容器墙的拖拽已经因为抢滚动手势要临时关 `scroll-y`（§10-20），
 *    这一页再叠一层拖拽会打架，房间排序先用上下移按钮。
 */
var nav = require('../../../utils/nav');
var theme = require('../../../utils/theme');
var api = require('../../../utils/api');
var auth = require('../../../utils/auth');
var containers = require('../../../utils/containers');
var roomUtil = require('../../../utils/rooms');

Page({
  data: {
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    isDark: false,
    baseUrl: '',

    // 'wizard' 向导态（每次进入默认）| 'manage' 管理态
    mode: 'wizard',
    step: 1,
    wizardRooms: [],
    wizardContainers: [],

    loading: true,
    retrying: false,
    error: '',

    groups: [],
    ungrouped: [],
    ungroupedCount: 0,
    total: 0,

    // 房间编辑面板：null = 关着
    editor: null,
    saving: false,
    icons: roomUtil.ROOM_ICONS
  },

  onLoad: function (options) {
    // 页面守卫（§18）：仓储组之外的角色直接退回首页
    if (!auth.guard('storage')) return;
    var query = options || {};
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT,
      baseUrl: api.getBaseUrl(),
      // 从别处带 `?mode=manage` 进来直接看管理态（目前只有调试/未来入口用）
      mode: query.mode === 'manage' ? 'manage' : 'wizard'
    });
  },

  onShow: function () {
    var isDark = theme.getTheme();
    if (isDark !== this.data.isDark) this.setData({ isDark: isDark });
    // 从容器编辑面板回来要重新拉：柜子可能换了房间、改了名字
    this.load();
  },

  onBack: function () {
    wx.navigateBack({ delta: 1 });
  },

  onToggleTheme: function () {
    this.setData({ isDark: theme.toggleTheme() });
  },

  // ==============================
  // 向导态（RM-08）
  // ==============================

  onWizardStep: function (e) {
    this.setData({ step: (e.detail && e.detail.step) || 1 });
  },

  /** 走完向导 → 落管理态（不是跳走，用户刚建完想看看结果） */
  onWizardDone: function () {
    wx.showToast({ title: '收拾好了', icon: 'none' });
    this.setData({ mode: 'manage' });
    this.load();
  },

  /** 跳过向导只切视图，**不动 `setup_done`**（那是首启页的事） */
  onWizardSkip: function () {
    this.setData({ mode: 'manage' });
  },

  /** 管理态里点「整理」回到向导，可以随时再过一遍 */
  onReopenWizard: function () {
    this.setData({ mode: 'wizard', step: 1 });
  },

  // ==============================
  // 数据
  // ==============================

  load: function () {
    var self = this;
    this.setData({ retrying: !!this.data.error });

    return Promise.all([
      api.listRooms(),
      api.listContainers(),
      api.listItems()
    ])
      .then(function (res) {
        var rooms = res[0];
        var defs = res[1];
        var items = res[2];

        // 容器定义写进共享单例：这一页的 resolve() 与墙上必须用同一套关键字
        containers.setDefs(defs);
        var counts = roomUtil.countByContainer(items, containers.resolve);

        var roomObjs = (rooms || []).map(roomUtil.fromServer);
        var grouped = roomUtil.groupContainers(containers.getDefs(), roomObjs);

        self.setData({
          loading: false,
          retrying: false,
          error: '',
          wizardContainers: defs || [],
          wizardRooms: roomObjs,
          groups: grouped.groups.map(function (g) { return self.decorateGroup(g, counts); }),
          ungrouped: self.decorateCabs(grouped.ungrouped, counts),
          ungroupedCount: grouped.ungroupedCount,
          total: grouped.total
        });
      })
      .catch(function (err) {
        self.setData({
          loading: false,
          retrying: false,
          error: (err && err.message) || '请求失败'
        });
      });
  },

  /** 给一组容器补上「几层 / 几件」，模板里不写三元 */
  decorateGroup: function (group, counts) {
    return Object.assign({}, group, {
      containers: this.decorateCabs(group.containers, counts)
    });
  },

  decorateCabs: function (list, counts) {
    return (list || []).map(function (c) {
      return Object.assign({}, c, {
        rowsText: c.rows > 0 ? c.rows + ' 层' : '自动分层',
        countText: (counts[c.id] || 0) + ' 件'
      });
    });
  },

  onRetry: function () {
    this.load();
  },

  // ==============================
  // 容器：点开 = 编辑（复用 S-09 面板）
  // ==============================

  onOpenContainer: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/storage/containers/containers?edit=' + encodeURIComponent(id)
    });
  },

  onAddContainer: function (e) {
    var roomId = e.currentTarget.dataset.room || '';
    wx.navigateTo({
      url: '/pages/storage/containers/containers?create=1&room=' + encodeURIComponent(roomId)
    });
  },

  // ==============================
  // 房间：增 / 改 / 删 / 排序
  // ==============================

  onCreateRoom: function () {
    this.setData({
      editor: {
        mode: 'create',
        id: '',
        name: '',
        icon: roomUtil.DEFAULT_ROOM_ICON
      }
    });
  },

  onEditRoom: function (e) {
    var id = e.currentTarget.dataset.id;
    var group = null;
    this.data.groups.forEach(function (g) {
      if (g.id === id) group = g;
    });
    if (!group) return;
    this.setData({
      editor: { mode: 'edit', id: group.id, name: group.name, icon: group.icon }
    });
  },

  onCloseEditor: function () {
    if (this.data.saving) return;
    this.setData({ editor: null });
  },

  /** 阻止面板内部点击冒泡到遮罩 */
  noop: function () {},

  onEditorName: function (e) {
    this.setData({ 'editor.name': e.detail.value });
  },

  onPickIcon: function (e) {
    this.setData({ 'editor.icon': e.currentTarget.dataset.icon });
  },

  onSaveRoom: function () {
    var editor = this.data.editor;
    if (!editor || this.data.saving) return;
    var name = (editor.name || '').trim();
    if (!name) {
      wx.showToast({ title: '给它起个名字', icon: 'none' });
      return;
    }

    var self = this;
    this.setData({ saving: true });
    var task = editor.mode === 'create'
      ? api.createRoom({ name: name, icon: editor.icon })
      : api.updateRoom(editor.id, { name: name, icon: editor.icon });

    task.then(function () {
      self.setData({ saving: false, editor: null });
      wx.showToast({ title: '已保存', icon: 'none' });
      self.load();
    }).catch(function (err) {
      self.setData({ saving: false });
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    });
  },

  onDeleteRoom: function (e) {
    var dataset = e.currentTarget.dataset;
    var id = dataset.id;
    var name = dataset.name;
    var count = Number(dataset.count) || 0;
    var self = this;

    wx.showModal({
      title: '删除「' + name + '」',
      content: count
        ? '里面的 ' + count + ' 个柜子会回到「未分组」，东西一件都不会丢。'
        : '这个房间还空着，删掉不影响任何东西。',
      confirmText: '删除',
      confirmColor: '#d9534f',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        api.deleteRoom(id).then(function () {
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'none' });
          self.load();
        }).catch(function (err) {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        });
      }
    });
  },

  /** 房间上下移：只交换相邻两项的 sort_order，不重排整张表 */
  onMoveRoom: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    var delta = Number(e.currentTarget.dataset.delta);
    var list = this.data.groups;
    var pairs = roomUtil.moveShift(list, index, delta);
    if (!pairs) return;

    var self = this;
    // 两条 PATCH 并发：都是绝对值赋值，先后顺序不影响结果
    Promise.all(pairs.map(function (p) {
      return api.updateRoom(p.id, { sort_order: p.sort_order });
    }))
      .then(function () { self.load(); })
      .catch(function (err) {
        wx.showToast({ title: (err && err.message) || '排序失败', icon: 'none' });
      });
  }
});
