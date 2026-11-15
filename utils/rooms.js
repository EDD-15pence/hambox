/**
 * 房间与「房间下的容器」分组（RM-01~RM-03 / AGENTS.md §21）
 *
 * 背景：`containers` 一直是一层平铺——家里有几个柜子全摊在墙上，
 * 没有「这是卧室的柜子」这一层。房间只是**分组 + 关键字来源**，
 * 不是物品的归属：物品仍然只认 `location` 文本（§21.3 ①），
 * 所以删房间、换房间、改房间名，一件东西都不会丢。
 *
 * 这个文件只做三件事，不碰网络、不碰 wx：
 *   1. 预设房间 / 预设容器（引导页的候选，用户勾选后才落库）；
 *   2. 后端行 → 页面对象；
 *   3. 容器按房间分组 + 同名容器检测（§21.7 坑 2）。
 *
 * 纯函数，可直接 node 跑单测。
 */

/**
 * 引导页预置的 8 个房间（§21.9 第 4 项：预置供勾选，不是空白表单）。
 * `id` 与后端 `app/constants.py` 的 `PRESET_ROOMS` 一一对应，固定不变 ——
 * 这样「勾了厨房」在库里有确定标识，不靠名字猜。
 */
var PRESET_ROOMS = [
  { id: 'kitchen', name: '厨房', icon: '🍳' },
  { id: 'bedroom', name: '卧室', icon: '🛏️' },
  { id: 'study', name: '书房', icon: '📚' },
  { id: 'bathroom', name: '卫生间', icon: '🚿' },
  { id: 'living', name: '客厅', icon: '🛋️' },
  { id: 'dining', name: '餐厅', icon: '🍽️' },
  { id: 'balcony', name: '阳台', icon: '🪴' },
  { id: 'storage', name: '储物间', icon: '🧺' }
];

/**
 * 引导页的预设容器候选（每个房间都给同一排，用户按需勾）。
 *
 * `keys` 是给新容器预填的归位关键字：**只有房间 + 容器**（「卧室衣柜」），
 * 这样两个房间各有一个衣柜时，语音说「卧室衣柜」能落到对的那个（§21.7 坑 2）。
 * `skin` 决定墙上画成什么样，和容器页的六种外观一致。
 */
var PRESET_CONTAINERS = [
  { name: '冰箱', icon: '❄️', skin: 'fridge', cols: 4, rows: 0 },
  { name: '衣柜', icon: '👕', skin: 'door2', cols: 3, rows: 0 },
  { name: '储物柜', icon: '🗄️', skin: 'door2', cols: 3, rows: 0 },
  { name: '书柜', icon: '📚', skin: 'glass', cols: 4, rows: 0 },
  { name: '药箱', icon: '💊', skin: 'medical', cols: 3, rows: 0 },
  { name: '抽屉柜', icon: '🗃️', skin: 'door2', cols: 3, rows: 0 },
  { name: '置物架', icon: '🧺', skin: 'rack', cols: 3, rows: 0 },
  { name: '纸箱', icon: '📦', skin: 'carton', cols: 4, rows: 0 }
];

// 默认图标：自建房间没挑图标时用它，别留空把界面画出个洞
var DEFAULT_ROOM_ICON = '🚪';

/** 自建房间的图标候选：够用就好，不做表情面板 */
var ROOM_ICONS = ['🚪', '🍳', '🛏️', '📚', '🚿', '🛋️', '🍽️', '🪴', '🧺', '🧸', '🧹', '🪟'];

/** 未分组的展示名：房间被删之后容器会回到这里 */
var UNGROUPED_TITLE = '未分组';

/** 后端一行 → 页面用的房间对象 */
function fromServer(row) {
  return {
    id: row.id,
    name: row.name || '未命名',
    icon: row.icon || DEFAULT_ROOM_ICON,
    sortOrder: row.sort_order || 0,
    isBuiltin: !!row.is_builtin,
    containerCount: row.container_count || 0
  };
}

/**
 * 新容器的默认关键字：房间 + 容器。
 *
 * 为什么要预填：两个房间都有「衣柜」时，`location = 衣柜` 只能落到其中一个
 * （谁 sort_order 靠前是谁）。写成「卧室衣柜」才能确定归到卧室那个。
 * 容器名里已经带房间名（阳台 + 阳台柜）时不重复拼。
 *
 * @param {string} roomName 房间名，可为空（未分组）
 * @param {string} containerName 容器名
 * @returns {string}
 */
function suggestKey(roomName, containerName) {
  var room = String(roomName || '').trim();
  var name = String(containerName || '').trim();
  if (!name) return '';
  if (!room || name.indexOf(room) !== -1) return name;
  return room + name;
}

/**
 * 容器按房间分组，返回给整理页直接渲染。
 *
 * - 房间顺序按 `sortOrder`；
 * - 容器顺序沿用传入顺序（后端已按 sort_order 排好）；
 * - 没有房间的容器收进最后的「未分组」，**空了就不画**；
 * - 每个房间附带 `dupNames`：同房间内重名的容器名（§21.7 坑 2 的提示来源）。
 *
 * @param {Array} containers 页面用的容器对象（`utils/containers.js` 的 getDefs()）
 * @param {Array} rooms 页面用的房间对象
 * @returns {{groups: Array, ungrouped: Array, total: number}}
 */
function groupContainers(containers, rooms) {
  var list = containers || [];
  var roomList = (rooms || []).slice().sort(function (a, b) {
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });

  var buckets = {};
  roomList.forEach(function (room) { buckets[room.id] = []; });

  var ungrouped = [];
  var orphans = {}; // room_id 指向已删房间的容器：当未分组处理，别让它从界面上消失
  list.forEach(function (c) {
    if (!c || c.id === 'unplaced') return;
    var roomId = c.roomId || '';
    if (roomId && buckets[roomId]) buckets[roomId].push(c);
    else {
      if (roomId) orphans[roomId] = true;
      ungrouped.push(c);
    }
  });

  var groups = roomList.map(function (room) {
    var own = buckets[room.id] || [];
    return {
      id: room.id,
      name: room.name,
      icon: room.icon,
      isBuiltin: !!room.isBuiltin,
      containers: own,
      count: own.length,
      dupNames: duplicateNames(own),
      isUngrouped: false
    };
  });

  return {
    groups: groups,
    ungrouped: ungrouped,
    ungroupedCount: ungrouped.length,
    // 有容器指向不存在的房间：提示用户（正常流程不会出现，除非手动改库）
    orphanCount: Object.keys(orphans).length,
    total: list.length
  };
}

/** 同一组里出现两次以上的名字（用于「两个房间都有衣柜」之外的**同房间**重名） */
function duplicateNames(containers) {
  var seen = {};
  var dup = {};
  (containers || []).forEach(function (c) {
    var name = String(c && c.name || '').trim();
    if (!name) return;
    if (seen[name]) dup[name] = true;
    seen[name] = true;
  });
  return Object.keys(dup);
}

/**
 * 每个容器里放了几件：`location` 归位到容器的规则与墙上一致（最长关键字优先）。
 *
 * 不重复实现归位逻辑 —— 直接用 `utils/containers.js` 的 `resolve()`，
 * 保证「墙上显示 3 件」和「整理页显示 3 件」永远一样。
 *
 * @param {Array} items 物品数组（含 location）
 * @param {Function} resolve location → 容器 id
 * @returns {Object} { 容器 id: 件数 }
 */
function countByContainer(items, resolve) {
  var map = {};
  (items || []).forEach(function (item) {
    var id = resolve(item && item.location);
    map[id] = (map[id] || 0) + 1;
  });
  return map;
}

/**
 * 上移 / 下移之后的新顺序：返回要提交的两条 `{ id, sort_order }`。
 *
 * 只交换相邻两项的 sort_order，不重排整张表 —— 少写一半数据，
 * 也避免「手滑点了上移，全表顺序都变了」。
 *
 * @param {Array} list 当前顺序（元素需有 id / sortOrder）
 * @param {number} index 被移动项的下标
 * @param {number} delta -1 上移 / +1 下移
 * @returns {Array<{id:string, sort_order:number}>|null} 到头了就返回 null
 */
function moveShift(list, index, delta) {
  var target = index + delta;
  if (!list || index < 0 || index >= list.length) return null;
  if (target < 0 || target >= list.length) return null;

  var a = list[index];
  var b = list[target];
  var sa = a.sortOrder;
  var sb = b.sortOrder;
  // 两个 sort_order 相同时（老数据都是默认值），换成稳定的步长绕开相等
  if (sa === sb) {
    sa = index * 10 + 10;
    sb = target * 10 + 10;
  }
  return [
    { id: a.id, sort_order: sb },
    { id: b.id, sort_order: sa }
  ];
}

module.exports = {
  PRESET_ROOMS: PRESET_ROOMS,
  PRESET_CONTAINERS: PRESET_CONTAINERS,
  DEFAULT_ROOM_ICON: DEFAULT_ROOM_ICON,
  ROOM_ICONS: ROOM_ICONS,
  UNGROUPED_TITLE: UNGROUPED_TITLE,
  fromServer: fromServer,
  suggestKey: suggestKey,
  groupContainers: groupContainers,
  duplicateNames: duplicateNames,
  countByContainer: countByContainer,
  moveShift: moveShift
};
