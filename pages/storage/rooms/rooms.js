/**
 * 智能仓储 · 房间页（默认入口，1.3.19 起）
 *
 * 用户拍板（1.3.19）：「进入智能仓储应该是房间页，然后展示每个房间的容器」。
 * 这一页就是仓储的主页：按房间分组展示所有柜子，点柜子看里面。
 *
 * 1.3.18 曾在这页叠过「每次进入都先弹向导」（RM-08），用户真机反馈
 * 「向导出现的逻辑我不清楚」→ 1.3.19 收回：**向导只在首启引导（setup 页）出现**，
 * 这页不再有任何向导入口；`components/room-wizard` 归 setup 页专用。
 *
 * 三条刻意的设计：
 *
 * 1. **删房间不删东西**：容器回到「未分组」，物品靠 `location` 文本归位，
 *    一件都不会丢 —— 和「删容器 → 东西进未归位」同一套原则（§21.3 ①）。
 * 2. **点柜子 = 看里面**：跳容器墙并直接打开该柜子的内部视图（`?open=`）；
 *    改名 / 换肤 / 层数从容器内部页的「编辑」按钮进（S-09 面板只有一份）。
 * 3. **不做拖拽**：容器墙的拖拽已经因为抢滚动手势要临时关 `scroll-y`（§10-20），
 *    这一页再叠一层拖拽会打架，房间排序先用上下移按钮。
 *
 * 1.3.21 布局调整（用户真机反馈）：
 * - 导航只留「返回 + 标题 + 主题图标」：原来「容器 / ＋ 房间 / 夜间」三个文字按钮
 *   把标题挤成「家里…」。主题换成图标，新建房间挪到页面最下面。
 * - 去掉「容器」按钮，**搜索框常驻页面顶部**：找东西是这个页面最高频的动作，
 *   不该先点一次「搜索」才出现输入框。搜的是物品（名字 / 位置 / 备注），
 *   直接列结果、点一条就进它所在的柜子 —— 不经过容器墙。
 */
var nav = require('../../../utils/nav');
var theme = require('../../../utils/theme');
var api = require('../../../utils/api');
var auth = require('../../../utils/auth');
var containers = require('../../../utils/containers');
var roomUtil = require('../../../utils/rooms');
var storageUtils = require('../../../utils/storage-utils');

Page({
  data: {
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    isDark: false,
    baseUrl: '',

    loading: true,
    retrying: false,
    error: '',
    // 非空 = 这份数据来自本地缓存（后端没连上），顶部显示「离线数据 · X 前更新」
    offlineText: '',

    // 搜索（常驻顶部）：输入即搜物品，不经过容器墙
    keyword: '',
    results: [],
    resultCount: 0,
    resultMore: 0,

    groups: [],
    ungrouped: [],
    ungroupedCount: 0,
    total: 0,
    roomCount: 0,

    // 房间编辑面板：null = 关着
    editor: null,
    saving: false,
    icons: roomUtil.ROOM_ICONS
  },

  onLoad: function () {
    // 页面守卫（§18）：仓储组之外的角色直接退回首页
    if (!auth.guard('storage')) return;
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT,
      baseUrl: api.getBaseUrl()
    });
  },

  onShow: function () {
    var isDark = theme.getTheme();
    if (isDark !== this.data.isDark) this.setData({ isDark: isDark });
    // 从容器内部 / 编辑面板回来要重新拉：柜子可能换了房间、改了名字
    this.load();
  },

  onBack: function () {
    wx.navigateBack({
      delta: 1,
      fail: function () { wx.reLaunch({ url: '/pages/index/index' }); }
    });
  },

  onToggleTheme: function () {
    this.setData({ isDark: theme.toggleTheme() });
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

        // 首启引导（RM-02）：本页是默认入口，三条件判断放这里，只问一次（§21.5）。
        // 与 containers 页的判断并存：从分享链接等路径直接进容器墙时那边也守着。
        if (!self._setupChecked) {
          self._setupChecked = true;
          if (storageUtils.needsSetup(defs, rooms)) {
            wx.redirectTo({ url: '/pages/storage/setup/setup' });
            return;
          }
        }

        // 容器定义写进共享单例：这一页的 resolve() 与墙上必须用同一套关键字
        containers.setDefs(defs);
        var counts = roomUtil.countByContainer(items, containers.resolve);

        var roomObjs = (rooms || []).map(roomUtil.fromServer);
        var grouped = roomUtil.groupContainers(containers.getDefs(), roomObjs);

        // 搜索是本页的最高频动作（找东西），物品留一份在内存里，输入即筛不请求
        self._items = items || [];
        // 命中结果要写「厨房 · 冰箱」，柜子只带 roomId，房间名在这页才拼得出来
        var roomNames = {};
        grouped.groups.forEach(function (g) { roomNames[g.id] = g.name; });
        self._roomNames = roomNames;

        self.setData({
          loading: false,
          retrying: false,
          error: '',
          // 断网时三个列表会各自退回缓存（§10-2）：不能装作是最新数据
          offlineText: api.cache.offlineTextOf([rooms, defs, items]),
          groups: grouped.groups.map(function (g) { return self.decorateGroup(g, counts); }),
          ungrouped: self.decorateCabs(grouped.ungrouped, counts),
          ungroupedCount: grouped.ungroupedCount,
          total: grouped.total,
          roomCount: (rooms || []).length
        });

        // 从柜内返回时关键词还在：数据换了（可能刚改过名字）要把结果重算一遍
        if (self.data.keyword) self.applySearch(self.data.keyword);
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
  // 搜索（常驻顶部，输入即筛）
  // ==============================

  onSearchInput: function (e) {
    var value = (e.detail && e.detail.value) || '';
    // 输入框的 value 绑的是原始输入（别 trim 回写，否则打不出空格）
    this.setData({ keyword: value });
    this.applySearch(value);
  },

  onClearSearch: function () {
    this.setData({ keyword: '', results: [], resultCount: 0, resultMore: 0 });
  },

  /**
   * 在内存里的物品上过一遍。走 `storageUtils.filterItems` 而不是自己写 ——
   * 清单页搜的也是这个名字 / 位置 / 备注三路，两处口径必须一致。
   */
  applySearch: function (keyword) {
    var kw = String(keyword || '').trim();
    if (!kw) {
      this.setData({ results: [], resultCount: 0, resultMore: 0 });
      return;
    }

    var items = this._items || [];
    var roomNames = this._roomNames || {};
    var matched = storageUtils.filterItems(items, kw, 'all');

    // 名称直接命中的排前面：搜「牛奶」时叫「牛奶」的不该排在备注里提到牛奶的后面
    var lower = kw.toLowerCase();
    matched = matched.slice().sort(function (a, b) {
      var an = (a.name || '').toLowerCase().indexOf(lower) !== -1 ? 0 : 1;
      var bn = (b.name || '').toLowerCase().indexOf(lower) !== -1 ? 0 : 1;
      if (an !== bn) return an - bn;
      return (a.name || '').localeCompare(b.name || '');
    });

    var LIMIT = 40;
    var rows = matched.slice(0, LIMIT).map(function (it) {
      var cabId = containers.resolve(it.location);
      var cab = containers.getContainer(cabId) || {};
      var roomName = roomNames[cab.roomId] || '';
      return {
        id: it.id,
        name: it.name || '未命名',
        emoji: cab.icon || '📦',
        // 「厨房 · 冰箱」，没有房间就只写柜子；柜子都认不出就是「未归位」
        cabText: roomName ? roomName + ' · ' + (cab.name || '') : (cab.name || '未归位'),
        locationText: it.location || '没写位置',
        quantityText: (it.quantity === undefined || it.quantity === null ? 1 : it.quantity) + (it.unit || ''),
        cabId: cabId
      };
    });

    this.setData({
      results: rows,
      resultCount: matched.length,
      resultMore: Math.max(0, matched.length - rows.length)
    });
  },

  /** 清单页：排序 / 分类只有那边有，入口放在页面最下面，不占导航 */
  onOpenList: function () {
    wx.navigateTo({ url: '/pages/storage/list/list' });
  },

  /** 点搜索结果 = 进它所在的柜子（和点柜子同一条路，不经过容器墙） */
  onOpenResult: function (e) {
    var cabId = e.currentTarget.dataset.cab;
    if (!cabId) return;
    wx.navigateTo({
      url: '/pages/storage/containers/containers?open=' + encodeURIComponent(cabId)
    });
  },

  // ==============================
  // 容器：点开 = 看里面（编辑从容器内部页的「编辑」按钮进）
  // ==============================

  onOpenContainer: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/storage/containers/containers?open=' + encodeURIComponent(id)
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
