/**
 * 智能仓储 - 容器墙 / 容器内部（S-02 / S-03 / S-08 / S-09 / S-10 / T-02 / T-03）
 *
 * 一个页面三种状态：
 * - `wall`   容器墙，看家里有几个地方、各装了多少；
 * - `inside` 打开某个容器，一层层隔板上摆着东西；
 * - 两个浮层：容器编辑面板（名称/外观/层数/关键字）、在途录入。
 *
 * 数据来自三处，一次并发拉：
 * - `GET /api/containers` 容器定义（含拖拽位次 slots），覆盖本地兜底常量；
 * - `GET /api/items` 全部物品，容器里的东西靠 location 归位；
 * - `GET /api/pending` 在途物品，墙上单独一块区域，能拖进容器。
 *
 * 拖拽全部走原生 touch：`longpress` 进入拖拽 → `touchmove` 跟手并实时高亮落点
 * → `touchend` 算最近的格子并落库。拖拽期间把 scroll-view 的 scroll-y 关掉，
 * 否则手势会被滚动吃掉（这是小程序里做拖拽最容易踩的坑）。
 */
var api = require('../../../utils/api');
var nav = require('../../../utils/nav');
var theme = require('../../../utils/theme');
var containers = require('../../../utils/containers');
var storageView = require('../../../utils/storage-view');
var itemEmoji = require('../../../utils/item-emoji');

/** 容器外观可选的样子；加新皮肤要同时改 wxml 里的画法 */
var SKINS = [
  { key: 'fridge', label: '冰箱' },
  { key: 'door2', label: '柜子' },
  { key: 'glass', label: '玻璃柜' },
  { key: 'medical', label: '药箱' },
  { key: 'rack', label: '置物架' },
  { key: 'carton', label: '纸箱' }
];

/** 图标候选：够用就好，不做表情面板 */
var ICONS = ['📦', '❄️', '🧊', '🧂', '🍪', '💊', '🗄️', '🧴', '🛏️', '🧺', '🍱', '🗃️'];

/** 把后端 slots 摊成 { 物品 id: 位次 } —— 同一物品只会出现在一个分区里 */
function collectOrder(defs) {
  var map = {};
  (defs || []).forEach(function (c) {
    (c.slots || []).forEach(function (s) {
      map[String(s.item_id)] = s.position;
    });
  });
  return map;
}

Page({
  data: {
    isDark: false,
    // 'wall' 容器墙 | 'inside' 某个容器内部
    view: 'wall',
    wall: [],
    active: null,
    total: 0,
    warning: 0,
    expired: 0,
    loading: true,
    retrying: false,
    loadError: '',
    baseUrl: '',
    // 搜索：命中的柜子留在墙上，柜内命中的块亮着、其余变暗
    showSearch: false,
    keyword: '',
    hitTotal: 0,
    // 整理态：画出空容器、卡片上出现「编辑」
    organizing: false,
    // 在途
    pending: [],
    pendingCount: 0,
    pendingName: '',
    showPendingAdd: false,
    // 挑选态：非空表示「这件在途要放哪儿」，此时点柜子即归位
    picking: null,
    pickingName: '',
    // 容器编辑面板：null 表示关着
    editor: null,
    skins: SKINS,
    icons: ICONS,
    // 拖拽进行中（用来关滚动 + 画跟随块）
    drag: null,
    pdrag: null,
    dragOver: ''
  },

  onLoad: function () {
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT,
      baseUrl: api.getBaseUrl()
    });
    // 从清单模式切回来时，回到切换前停留的那个柜子（只恢复一次）
    this._restoreActiveId = storageView.loadActiveContainer();
    // 在清单页搜了「可乐」再切过来，墙上直接把可乐所在的柜子点亮
    var listState = storageView.loadListState();
    if (listState && listState.keyword) {
      this.setData({ keyword: listState.keyword, showSearch: true });
    }
    // 首次拉取交给 onShow（onLoad 之后必然触发），避免进页面连发两轮
  },

  /** 从详情页改完位置回来，容器归属可能变了，重新拉一遍 */
  onShow: function () {
    this.loadAll();
  },

  // ==============================
  // 数据
  // ==============================

  loadAll: function () {
    var self = this;
    this.setData({ loading: !this.data.loadError, retrying: !!this.data.loadError });

    return Promise.all([api.listContainers(), api.listItems(), api.listPending()])
      .then(function (result) {
        var defs = result[0];
        var items = result[1];
        var pending = result[2];

        // 容器定义用后端那份；万一后端还是旧的（没这个接口）就用内置兜底
        containers.setDefs(defs);
        self._defs = defs;
        self._items = items;
        self._pending = pending;
        self._order = collectOrder(defs);

        self.setData({ loading: false, retrying: false, loadError: '' });
        self.render();
      })
      .catch(function (err) {
        self.setData({
          loading: false,
          retrying: false,
          loadError: (err && err.message) || '请求失败'
        });
      });
  },

  /** 只重算视图，不发请求。搜索、拖拽、整理态切换都走这里 */
  render: function () {
    var pending = this._pending || [];
    var inOrganize = this.data.organizing;
    // 有在途要归位、或者在整理，就把空容器也画出来 —— 否则没地方可以拖/可以点
    var grouped = containers.groupByContainer(this._items || [], {
      order: this._order || {},
      showEmpty: inOrganize || pending.length > 0 || !!this.data.picking
    });

    // 留一份没被搜索过滤的墙，改关键词时不用重新请求
    this._rawWall = grouped.wall;
    var search = containers.applyKeyword(grouped.wall, this.data.keyword);

    // 要停在哪个容器里：切换模式带过来的优先，其次是当前已经打开的那个。
    // 容器被清空（或搜索后没命中）就退回墙上，不留一个空壳 detail。
    var wantId = this._restoreActiveId || (this.data.active && this.data.active.id) || '';
    this._restoreActiveId = '';
    var card = null;
    if (wantId) {
      for (var i = 0; i < search.wall.length; i++) {
        if (search.wall[i].id === wantId) { card = search.wall[i]; break; }
      }
    }

    this.setData({
      wall: search.wall,
      hitTotal: search.hitTotal,
      total: grouped.total,
      warning: grouped.warning,
      expired: grouped.expired,
      active: card,
      view: card ? 'inside' : 'wall',
      pending: this.decoratePending(pending),
      pendingCount: pending.length
    });
  },

  /** 在途物品借一下 emoji 映射，和容器里的块长得一样 */
  decoratePending: function (list) {
    return (list || []).map(function (p) {
      return {
        id: p.id,
        name: p.name,
        emoji: itemEmoji.emojiFor(p.name, p.category),
        imageSrc: p.imageSrc,
        qtyText: p.quantity > 1 ? '×' + p.quantity : '',
        daysWaiting: p.daysWaiting,
        waitText: p.daysWaiting > 0 ? p.daysWaiting + ' 天' : '今天'
      };
    });
  },

  onRetry: function () {
    this.loadAll();
  },

  // ==============================
  // 搜索（S-04）：命中的柜子留在墙上，柜里那几件亮着
  // ==============================
  onToggleSearch: function () {
    var show = !this.data.showSearch;
    this.setData({ showSearch: show });
    if (!show) this.applyKeyword('');
  },

  onSearchInput: function (e) {
    this.applyKeyword(e.detail.value);
  },

  onClearSearch: function () {
    this.applyKeyword('');
  },

  /** 只在内存里重算，不再请求接口 */
  applyKeyword: function (keyword) {
    var search = containers.applyKeyword(this._rawWall || [], keyword);
    var patch = { keyword: keyword, wall: search.wall, hitTotal: search.hitTotal };

    // 正停在某个柜子里：同步换成带命中标记的那一份（否则点进去看不到高亮）
    if (this.data.active) {
      var card = null;
      for (var i = 0; i < search.wall.length; i++) {
        if (search.wall[i].id === this.data.active.id) { card = search.wall[i]; break; }
      }
      patch.active = card;
      if (!card) patch.view = 'wall';
    }
    this.setData(patch);
  },

  // ==============================
  // 进出容器
  // ==============================

  onOpenContainer: function (e) {
    var id = e.currentTarget.dataset.id;
    // 挑选态：点哪个柜子就把这件在途放进去
    if (this.data.picking) {
      if (id === containers.UNPLACED.id) {
        wx.showToast({ title: '挑一个具体的柜子', icon: 'none' });
        return;
      }
      var pendingId = this.data.picking;
      this.setData({ picking: null, pickingName: '' });
      this.placePending(pendingId, id, '');
      return;
    }
    // 整理态点卡片是「编辑这个容器」，不是进去
    if (this.data.organizing) {
      this.openEditor('edit', id);
      return;
    }
    var card = null;
    for (var i = 0; i < this.data.wall.length; i++) {
      if (this.data.wall[i].id === id) { card = this.data.wall[i]; break; }
    }
    if (!card) return;
    this.setData({ view: 'inside', active: card });
  },

  /** 容器内返回墙；墙上返回仓储列表 */
  onBack: function () {
    if (this.data.drag || this.data.pdrag) return;
    if (this.data.picking) {
      this.onCancelPicking();
      return;
    }
    if (this.data.organizing) {
      this.setData({ organizing: false });
      this.render();
      return;
    }
    if (this.data.view === 'inside') {
      this.setData({ view: 'wall', active: null });
      return;
    }
    wx.navigateBack({
      delta: 1,
      fail: function () { wx.reLaunch({ url: '/pages/index/index' }); }
    });
  },

  onTapTile: function (e) {
    // 拖拽刚结束的那一下不要跳详情
    if (this._justDragged) return;
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/storage/detail/detail?id=' + encodeURIComponent(id)
    });
  },

  // ==============================
  // 整理态 / 容器编辑（S-09）
  // ==============================

  onToggleOrganize: function () {
    var next = !this.data.organizing;
    this.setData({ organizing: next });
    this.render();
    if (next) {
      wx.showToast({ title: '点柜子改名字和层数', icon: 'none' });
    }
  },

  /**
   * 打开编辑面板
   * @param {string} mode 'create' | 'edit'
   * @param {string} id 编辑时的容器 id
   */
  openEditor: function (mode, id) {
    if (mode === 'create') {
      this.setData({
        editor: {
          mode: 'create',
          id: '',
          name: '',
          icon: '📦',
          skin: 'door2',
          cols: 3,
          rows: 0,
          keysText: '',
          deletable: false,
          builtin: false
        }
      });
      return;
    }
    var c = containers.getContainer(id);
    this.setData({
      editor: {
        mode: 'edit',
        id: c.id,
        name: c.name,
        icon: c.icon,
        skin: c.skin,
        cols: c.cols || 4,
        rows: c.rows || 0,
        keysText: (c.keys || []).join('、'),
        deletable: c.deletable !== false,
        builtin: !!c.isBuiltin
      }
    });
  },

  onAddContainer: function () {
    this.openEditor('create');
  },

  onEditActive: function () {
    if (this.data.active) this.openEditor('edit', this.data.active.id);
  },

  onCloseEditor: function () {
    this.setData({ editor: null });
  },

  /** 阻止面板内部的点击冒泡到遮罩 */
  noop: function () {},

  onEditorName: function (e) {
    this.setData({ 'editor.name': e.detail.value });
  },

  onEditorKeys: function (e) {
    this.setData({ 'editor.keysText': e.detail.value });
  },

  onPickSkin: function (e) {
    this.setData({ 'editor.skin': e.currentTarget.dataset.skin });
  },

  onPickIcon: function (e) {
    this.setData({ 'editor.icon': e.currentTarget.dataset.icon });
  },

  /** 层数 / 每层几件 的加减：0 层 = 自动 */
  onStep: function (e) {
    var field = e.currentTarget.dataset.field;
    var delta = Number(e.currentTarget.dataset.delta);
    var editor = this.data.editor;
    if (!editor) return;
    var value = Number(editor[field] || 0) + delta;
    if (field === 'cols') value = Math.min(Math.max(value, 1), 6);
    else value = Math.min(Math.max(value, 0), 12);
    var patch = {};
    patch['editor.' + field] = value;
    this.setData(patch);
  },

  onSaveEditor: function () {
    var editor = this.data.editor;
    if (!editor) return;
    var name = (editor.name || '').trim();
    if (!name) {
      wx.showToast({ title: '给它起个名字', icon: 'none' });
      return;
    }
    // 「、」「,」「，」都算分隔符：手机上打逗号比顿号顺手
    var keys = (editor.keysText || '')
      .split(/[、,，\s]+/)
      .map(function (k) { return k.trim(); })
      .filter(function (k) { return !!k; });

    var payload = {
      name: name,
      icon: editor.icon,
      skin: editor.skin,
      cols: Number(editor.cols) || 1,
      rows: Number(editor.rows) || 0,
      keys: keys
    };

    var self = this;
    wx.showLoading({ title: '保存中', mask: true });
    var task = editor.mode === 'create'
      ? api.createContainer(payload)
      : api.updateContainer(editor.id, payload);

    task.then(function () {
      wx.hideLoading();
      self.setData({ editor: null });
      wx.showToast({ title: '已保存', icon: 'none' });
      self.loadAll();
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    });
  },

  onDeleteContainer: function () {
    var editor = this.data.editor;
    if (!editor || !editor.id) return;
    var self = this;
    wx.showModal({
      title: '删除容器',
      content: '只删掉「' + editor.name + '」这个柜子，里面的东西不会丢，会进「未归位」。',
      confirmText: '删除',
      confirmColor: '#d9534f',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        api.deleteContainer(editor.id).then(function () {
          wx.hideLoading();
          self.setData({ editor: null, active: null, view: 'wall' });
          wx.showToast({ title: '已删除', icon: 'none' });
          self.loadAll();
        }).catch(function (err) {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        });
      }
    });
  },

  // ==============================
  // 在途（T-02）
  // ==============================

  onTogglePendingAdd: function () {
    this.setData({ showPendingAdd: !this.data.showPendingAdd, pendingName: '' });
  },

  onPendingName: function (e) {
    this.setData({ pendingName: e.detail.value });
  },

  /**
   * 记一条在途：只要求名称，其它都能后补。
   * 不做「预计到货日」—— 用户明确不要（2026-11-11）。
   */
  onSavePending: function () {
    var self = this;
    var name = (this.data.pendingName || '').trim();
    if (!name) {
      wx.showToast({ title: '买了什么？写个名字', icon: 'none' });
      return;
    }
    api.createPending({ name: name }).then(function () {
      self.setData({ pendingName: '', showPendingAdd: false });
      self.loadAll();
      wx.showToast({ title: '记下了', icon: 'none' });
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '记录失败', icon: 'none' });
    });
  },

  onDeletePending: function (e) {
    var id = e.currentTarget.dataset.id;
    var self = this;
    wx.showModal({
      title: '不记了？',
      content: '这条在途记录会被删掉，不影响库存。',
      success: function (res) {
        if (!res.confirm) return;
        api.deletePending(id).then(function () { self.loadAll(); })
          .catch(function (err) {
            wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
          });
      }
    });
  },

  /**
   * 到了，放起来。
   *
   * 点一下不是弹 ActionSheet —— 微信的 ActionSheet 最多 6 项，容器一多就不够用。
   * 改成「进入挑选态」：墙上的柜子全部可点（空柜子也画出来），点哪个放哪个。
   */
  onPlacePending: function (e) {
    // 刚拖完的那一下不要顺手进入挑选态
    if (this._justDragged) return;
    var id = e.currentTarget.dataset.id;
    this.setData({ picking: id, pickingName: e.currentTarget.dataset.name || '' });
    this.render();
  },

  onCancelPicking: function () {
    this.setData({ picking: null, pickingName: '' });
    this.render();
  },

  placePending: function (pendingId, containerId, zoneKey) {
    var self = this;
    wx.showLoading({ title: '放进去了', mask: true });
    api.placePending(pendingId, containerId, zoneKey).then(function () {
      wx.hideLoading();
      self.loadAll();
      wx.showToast({ title: '已放进柜子', icon: 'none' });
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '放进去失败', icon: 'none' });
    });
  },

  // ==============================
  // 拖拽：容器内物品换位（S-10）
  // ==============================

  /** 量一遍所有格子的位置，拖拽时靠它算落点 */
  measureTiles: function (callback) {
    var query = wx.createSelectorQuery().in(this);
    query.selectAll('.thing').boundingClientRect();
    query.exec(function (res) {
      var rects = (res && res[0]) || [];
      callback(rects);
    });
  },

  onTileLongPress: function (e) {
    var ds = e.currentTarget.dataset;
    if (!ds.id) return;
    var touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    var self = this;
    this._dragTile = {
      id: String(ds.id),
      zone: ds.zone || '',
      name: ds.name || '',
      emoji: ds.emoji || ''
    };
    this.measureTiles(function (rects) {
      self._rects = rects;
      self.setData({
        drag: {
          name: self._dragTile.name,
          emoji: self._dragTile.emoji,
          x: touch ? touch.clientX : 0,
          y: touch ? touch.clientY : 0
        }
      });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    });
  },

  /** 找离手指最近、且在阈值内的格子 */
  nearestRect: function (x, y) {
    var rects = this._rects || [];
    var best = null;
    var bestDist = 0;
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (!r || !r.width) continue;
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      // 阈值放宽到一格半，手指粗一点也能拖准
      if (dist > r.width) continue;
      if (!best || dist < bestDist) { best = r; bestDist = dist; }
    }
    return best;
  },

  onDragMove: function (e) {
    if (!this.data.drag) return;
    var touch = e.touches && e.touches[0];
    if (!touch) return;
    var target = this.nearestRect(touch.clientX, touch.clientY);
    var id = target && target.dataset ? String(target.dataset.id || '') : '';
    var patch = {
      'drag.x': touch.clientX,
      'drag.y': touch.clientY
    };
    if (id !== this.data.dragOver) patch.dragOver = id;
    this.setData(patch);
  },

  /**
   * 松手：把被拖的那件插到目标格的位置，整段顺序落库。
   *
   * 落库的是**整个分区的完整顺序**，不是「A 和 B 交换」——
   * 交换语义在多件物品下会越换越乱，整份覆盖才可复现。
   */
  onDragEnd: function () {
    var drag = this.data.drag;
    var overId = this.data.dragOver;
    if (!drag) return;

    var self = this;
    var tile = this._dragTile;
    this._justDragged = true;
    setTimeout(function () { self._justDragged = false; }, 300);

    if (!overId || overId === tile.id) {
      this.setData({ drag: null, dragOver: '' });
      return;
    }

    var zone = this.findZone(tile.zone);
    if (!zone) {
      this.setData({ drag: null, dragOver: '' });
      return;
    }

    var ids = zone.tiles.map(function (t) { return String(t.id); });
    var from = ids.indexOf(tile.id);
    var to = ids.indexOf(String(overId));
    if (from === -1 || to === -1 || from === to) {
      this.setData({ drag: null, dragOver: '' });
      return;
    }
    ids.splice(from, 1);
    ids.splice(to, 0, tile.id);

    // 乐观更新：先把界面上的顺序改掉，请求失败再回滚
    var before = Object.assign({}, this._order);
    ids.forEach(function (id, index) { self._order[id] = index; });
    this.setData({ drag: null, dragOver: '' });
    this.render();

    var containerId = this.data.active ? this.data.active.id : '';
    api.saveSlots(containerId, tile.zone, ids).catch(function (err) {
      self._order = before;
      self.render();
      wx.showToast({ title: (err && err.message) || '顺序没存上', icon: 'none' });
    });
  },

  findZone: function (zoneKey) {
    var active = this.data.active;
    if (!active || !active.zones) return null;
    for (var i = 0; i < active.zones.length; i++) {
      if (active.zones[i].key === (zoneKey || 'main')) return active.zones[i];
    }
    return active.zones[0] || null;
  },

  // ==============================
  // 拖拽：在途物品拖进容器（T-03）
  // ==============================

  measureCabs: function (callback) {
    var query = wx.createSelectorQuery().in(this);
    query.selectAll('.cab').boundingClientRect();
    query.exec(function (res) {
      callback((res && res[0]) || []);
    });
  },

  onPendingLongPress: function (e) {
    var ds = e.currentTarget.dataset;
    var touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    var self = this;
    this._pdragId = String(ds.id);
    this.measureCabs(function (rects) {
      self._cabRects = rects;
      self.setData({
        pdrag: {
          name: ds.name || '',
          emoji: ds.emoji || '📦',
          x: touch ? touch.clientX : 0,
          y: touch ? touch.clientY : 0
        }
      });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    });
  },

  onPendingDragMove: function (e) {
    if (!this.data.pdrag) return;
    var touch = e.touches && e.touches[0];
    if (!touch) return;
    var hit = null;
    var rects = this._cabRects || [];
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (touch.clientX >= r.left && touch.clientX <= r.right &&
          touch.clientY >= r.top && touch.clientY <= r.bottom) {
        hit = r.dataset ? String(r.dataset.id || '') : '';
        break;
      }
    }
    var patch = { 'pdrag.x': touch.clientX, 'pdrag.y': touch.clientY };
    if (hit !== this.data.dragOver) patch.dragOver = hit || '';
    this.setData(patch);
  },

  onPendingDragEnd: function () {
    var pdrag = this.data.pdrag;
    var overId = this.data.dragOver;
    var self = this;
    if (!pdrag) return;
    this._justDragged = true;
    setTimeout(function () { self._justDragged = false; }, 300);

    this.setData({ pdrag: null, dragOver: '' });
    if (!overId) return;

    // 拖到「未归位」上是没有意义的：那等于没放
    if (overId === containers.UNPLACED.id) {
      wx.showToast({ title: '拖到具体的柜子上才算放好', icon: 'none' });
      return;
    }
    this.placePending(this._pdragId, overId, '');
  },

  // ==============================
  // 其他
  // ==============================

  /**
   * 容器 / 清单切换
   *
   * 用 redirectTo 替换当前页而不是 navigateTo：来回切几次不会堆一串页面栈，
   * 返回键一下就回首页。停在柜子里时把柜子记下来，切回来还停在那儿。
   */
  onSwitchMode: function (e) {
    var mode = e.currentTarget.dataset.mode;
    if (!mode || mode === 'containers') return;
    storageView.saveActiveContainer(
      this.data.view === 'inside' && this.data.active ? this.data.active.id : ''
    );
    storageView.setMode('list');
    wx.redirectTo({ url: storageView.urlForMode('list') });
  },

  onGoQuick: function () {
    wx.navigateTo({ url: '/pages/storage/quick/quick' });
  },

  /**
   * 容器内「＋ 记一件」：把当前位置带过去预填
   *
   * 只预填，不锁死 —— 口语里说了「放阳台」就以口语为准，
   * 解析仍走 quick-parse 那一套，不为容器页写第二套规则。
   * 保存后自动返回，这一页 onShow 会重拉并把新块显示在当前柜子里。
   */
  onAddHere: function (e) {
    var containerId = e.currentTarget.dataset.container;
    var zoneKey = e.currentTarget.dataset.zone || '';
    if (!containerId) return;
    var url = '/pages/storage/quick/quick?container=' + encodeURIComponent(containerId);
    if (zoneKey) url += '&zone=' + encodeURIComponent(zoneKey);
    wx.navigateTo({ url: url });
  },

  onToggleTheme: function () {
    this.setData({ isDark: theme.toggleTheme() });
  }
});
