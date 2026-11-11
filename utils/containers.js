/**
 * 智能仓储 · 容器可视化（S-01 / S-08）
 *
 * 把家里的收纳空间当成一个个「看得见的东西」——冰箱就是冰箱的样子，
 * 点开它，里面一层层隔板上摆着东西（emoji 或照片）。不做背包格子、不设容量，
 * 默认自动排布：东西多就多摊一层；用户给容器定了层数（rows）就按格占位。
 *
 * 两条数据来源，**后端优先**：
 * 1. `setDefs()` 用 `GET /api/containers` 的结果覆盖（用户自己增删改的那份）；
 * 2. 拉不到时退回下面写死的 8 个内置常量，页面照常能看，只是不能改。
 *
 * 为什么容器定义可以落库、而物体归位仍然只认 `location` 文本：
 * 位置是用户随口说的（"冰箱冷冻""阳台那个箱子"），不该逼他先建好容器再记东西。
 * 所以容器只负责「怎么画、哪些词算我」，归不进去的统一进「未归位」，一件都不丢。
 */
var itemEmoji = require('./item-emoji');

/** 未归位兜底容器：任何 location 都归得进去，保证「一件都不丢」 */
var UNPLACED = {
  id: 'unplaced',
  name: '未归位',
  icon: '📦',
  skin: 'carton',
  desc: '没写位置或认不出位置的东西',
  cols: 4,
  rows: 0,
  keys: []
};

/**
 * 内置容器（离线兜底 + 首次启动的默认样子）
 *
 * - `keys` 是归位关键字，匹配 location 里的子串，**最长优先**；
 * - `skin` 决定墙上画成什么样：fridge 双门冰箱 / door2 对开柜 /
 *   glass 玻璃门柜 / medical 药箱 / rack 开放置物架 / carton 纸箱；
 * - `cols` 是每层摆几个，`rows` 是固定层数（0 = 自动摊）；
 * - `zones` 只有冰箱有：冷冻室、冷藏室分开画，别把雪糕和青菜混在一层。
 */
var CONTAINERS = [
  {
    id: 'fridge',
    name: '冰箱',
    icon: '❄️',
    skin: 'fridge',
    desc: '冷藏 + 冷冻都算',
    cols: 4,
    rows: 0,
    keys: ['冰箱', '冷藏', '冷冻', '冰柜', '保鲜'],
    zones: [
      { key: 'freeze', name: '冷冻室', match: ['冷冻', '冰柜', '雪糕', '冰淇淋', '速冻', '棒冰'] },
      { key: 'chill', name: '冷藏室', match: [] }
    ]
  },
  {
    id: 'kitchen',
    name: '厨房柜',
    icon: '🧂',
    skin: 'door2',
    desc: '橱柜 / 灶台 / 调料',
    cols: 3,
    rows: 0,
    keys: ['厨房', '橱柜', '灶台', '调料', '碗柜']
  },
  {
    id: 'snack',
    name: '零食柜',
    icon: '🍪',
    skin: 'glass',
    desc: '零食 / 茶几 / 电视柜',
    cols: 4,
    rows: 0,
    keys: ['零食', '茶几', '电视柜', '边几']
  },
  {
    id: 'medicine',
    name: '药箱',
    icon: '💊',
    skin: 'medical',
    desc: '药箱 / 药柜',
    cols: 3,
    rows: 0,
    keys: ['药箱', '药柜', '药品', '急救']
  },
  {
    id: 'cabinet',
    name: '储物柜',
    icon: '🗄️',
    skin: 'door2',
    desc: '储物柜 / 收纳箱',
    cols: 3,
    rows: 0,
    keys: ['储物柜', '储物间', '收纳', '柜子', '抽屉']
  },
  {
    id: 'bath',
    name: '卫浴阳台',
    icon: '🧴',
    skin: 'rack',
    desc: '卫生间 / 洗手台 / 阳台',
    cols: 3,
    rows: 0,
    keys: ['卫生间', '浴室', '洗手台', '洗漱', '阳台', '洗衣']
  },
  {
    id: 'bedroom',
    name: '卧室',
    icon: '🛏️',
    skin: 'door2',
    desc: '床头 / 衣柜',
    cols: 3,
    rows: 0,
    keys: ['卧室', '床头', '衣柜']
  }
];

/** 内置容器的副标题：后端不存这个，纯装饰文案，按 id 取 */
var DESCS = {};
CONTAINERS.forEach(function (c) { DESCS[c.id] = c.desc; });
DESCS.unplaced = UNPLACED.desc;

/** 当前生效的定义（setDefs 之后换成后端那份） */
var DEFS = CONTAINERS.concat([UNPLACED]);
var SOURCE = 'builtin';

/** 「最长关键字优先」的查找表，定义一变就重建 */
var KEY_INDEX = [];

function buildIndex(defs) {
  var pairs = [];
  defs.forEach(function (c) {
    (c.keys || []).forEach(function (k) {
      if (k) pairs.push({ key: k, id: c.id });
    });
  });
  pairs.sort(function (a, b) { return b.key.length - a.key.length; });
  return pairs;
}

KEY_INDEX = buildIndex(DEFS);

/** 后端一行 -> 页面用的容器对象。字段缺失时全部给安全默认值。 */
function fromServer(row) {
  var zones = (row.zones || []).map(function (z) {
    return { key: z.key || 'main', name: z.name || '', match: z.match || [] };
  });
  var keys = (row.keys || []).filter(function (k) { return !!k; });
  var id = row.id;
  return {
    id: id,
    name: row.name || '未命名',
    icon: row.icon || '📦',
    skin: row.skin || 'door2',
    // 后端没有 desc：内置的沿用文案，自建的用关键字拼，比空着好
    desc: DESCS[id] || (keys.length ? keys.join(' / ') : '没有关键字，靠名字认不出位置'),
    cols: row.cols || 4,
    rows: row.rows || 0,
    keys: keys,
    zones: zones,
    sortOrder: row.sort_order || 0,
    isBuiltin: !!row.is_builtin,
    deletable: row.deletable !== false,
    isServer: true
  };
}

/**
 * 用后端返回的容器列表覆盖内置定义。
 * @param {Array} rows GET /api/containers 的 items
 * @returns {boolean} 是否真的换掉了（空数组视为失败，保留兜底）
 */
function setDefs(rows) {
  if (!rows || !rows.length) return false;
  var defs = rows.map(fromServer);
  var hasUnplaced = defs.some(function (c) { return c.id === UNPLACED.id; });
  if (!hasUnplaced) defs.push(fromServer(Object.assign({}, UNPLACED, { sort_order: 999, is_builtin: true })));
  // 后端按 sort_order 排好序了，这里再兜一次，防止服务端顺序被改乱
  defs.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
  DEFS = defs;
  KEY_INDEX = buildIndex(defs);
  SOURCE = 'server';
  return true;
}

/** 离线 / 拉取失败时退回内置那份 */
function resetDefs() {
  DEFS = CONTAINERS.concat([UNPLACED]);
  KEY_INDEX = buildIndex(DEFS);
  SOURCE = 'builtin';
}

function getDefs() {
  return DEFS;
}

function source() {
  return SOURCE;
}

function getContainer(id) {
  if (!id || id === UNPLACED.id) return findUnplaced();
  for (var i = 0; i < DEFS.length; i++) {
    if (DEFS[i].id === id) return DEFS[i];
  }
  return findUnplaced();
}

function findUnplaced() {
  for (var i = 0; i < DEFS.length; i++) {
    if (DEFS[i].id === UNPLACED.id) return DEFS[i];
  }
  return UNPLACED;
}

/**
 * 一个 location 归到哪个容器。
 * @param {string} location 自由文本位置，可能为空或很怪
 * @returns {string} 容器 id，认不出返回 'unplaced'
 */
function resolve(location) {
  var text = (location || '').trim();
  if (!text) return UNPLACED.id;
  for (var i = 0; i < KEY_INDEX.length; i++) {
    if (text.indexOf(KEY_INDEX[i].key) !== -1) return KEY_INDEX[i].id;
  }
  return UNPLACED.id;
}

/** 一件物品在格子里要显示什么：emoji、名称、状态、数量角标 */
function toTile(item) {
  var name = (item.name || '').trim();
  var status = item.status || '';
  return {
    id: item.id,
    name: name,
    // 有照片用照片，没有就用 emoji —— emoji 靠名称猜，猜不出按分类兜底
    emoji: itemEmoji.emojiFor(name, item.category),
    imageSrc: item.imageSrc || '',
    quantity: item.quantity,
    unit: item.unit || '',
    // 数量为 1 时不显示角标，角标只用来提示「还有几个」
    qtyText: item.quantity > 1 ? '×' + item.quantity : '',
    status: status,
    // 模板里不写三元：状态类名在这里定好
    cls: statusClass(status),
    // 临期/过期在格子上打一个小圆点，比给整块描边更像「贴了标签」
    dot: status === 'warning' || status === 'expired',
    daysLeft: item.daysLeft === null || item.daysLeft === undefined ? null : item.daysLeft,
    location: item.location || ''
  };
}

/**
 * 把所有物品摊成容器墙。
 *
 * 「未归位」只在真有东西没写位置时出现，并且固定排在最后。
 * 其他容器默认也遵守「空了就不画」，但两种情况要画空盒子：
 * 1. 有在途物品待归位 —— 不然没地方可拖；
 * 2. 用户按了「整理」，得能点开每个柜子改它。
 * 由调用方传 `opts.showEmpty` 决定。
 *
 * @param {Array} items 物品数组
 * @param {{order?: Object, showEmpty?: boolean}} opts
 *        order: { 物品 id: 位次 }，拖拽排过序的按位次排，没排过的跟在后面
 * @returns {{ wall: Array, total: number, warning: number, expired: number }}
 */
function groupByContainer(items, opts) {
  var options = opts || {};
  var order = options.order || {};
  var showEmpty = !!options.showEmpty;
  var list = items || [];
  var buckets = {};

  DEFS.forEach(function (c) { buckets[c.id] = []; });

  list.forEach(function (item) {
    var id = resolve(item.location);
    if (!buckets[id]) buckets[id] = [];
    buckets[id].push(item);
  });

  var wall = [];
  DEFS.forEach(function (c) {
    var own = buckets[c.id] || [];
    var isUnplaced = c.id === UNPLACED.id;
    // 未归位没有东西就彻底不画；其他容器看 showEmpty
    if (!own.length && (isUnplaced || !showEmpty)) return;
    wall.push(buildCard(c, own, order));
  });

  return {
    wall: wall,
    total: list.length,
    warning: countStatus(list, 'warning'),
    expired: countStatus(list, 'expired')
  };
}

function countStatus(items, status) {
  var n = 0;
  items.forEach(function (it) {
    if (it.status === status) n++;
  });
  return n;
}

function buildCard(container, items, order) {
  var cols = container.cols || 4;
  var rows = container.rows || 0;
  var tiles = sortTiles(items.map(toTile), order);

  return {
    id: container.id,
    name: container.name,
    icon: container.icon,
    skin: container.skin || 'door2',
    desc: container.desc,
    cols: cols,
    rows: rows,
    keys: container.keys || [],
    // 分区定义（编辑容器时要原样带回）与画出来的分区是两份东西，别混
    zoneDefs: container.zones || [],
    isBuiltin: !!container.isBuiltin,
    deletable: container.deletable !== false,
    count: items.length,
    empty: !items.length,
    warning: countStatus(items, 'warning'),
    expired: countStatus(items, 'expired'),
    // 墙上那张卡片露几个 emoji，隔着柜门也能看出里面大概有什么
    // 带 k 是为了 wx:key —— emoji 会重复（两瓶可乐），不能拿 emoji 当 key
    preview: tiles.slice(0, 3).map(function (t, i) { return { k: i, e: t.emoji }; }),
    // 容器里先摆「要过期的」，一眼看到的是最该处理的
    tiles: tiles,
    zones: buildZones(container, tiles, cols, rows)
  };
}

/**
 * 分区 + 分层。
 *
 * 冰箱有冷冻室/冷藏室两个区（`match` 匹配 location），其他容器只有一个区，
 * 区名留空、不画区标题。区内每 `cols` 件一层，层就是冰箱里那块玻璃隔板。
 *
 * 容器定了层数（rows > 0）就按格子占位：空着的层画一块空隔板，
 * 这样「我这是四层柜」在界面上一眼能看出来，也给拖拽留出落点。
 */
function buildZones(container, tiles, cols, rows) {
  var defs = container.zones && container.zones.length
    ? container.zones
    : [{ key: 'main', name: '', match: [] }];

  var groups = defs.map(function (def) {
    return { def: def, items: [] };
  });
  var fallback = groups[groups.length - 1];

  if (groups.length === 1) {
    fallback.items = tiles;
  } else {
    tiles.forEach(function (tile) {
      var hit = null;
      for (var i = 0; i < defs.length; i++) {
        if (matchesAny(tile.location, defs[i].match)) { hit = i; break; }
      }
      // 认不出子区域的，默认进最后一个区（冰箱就是冷藏室）
      groups[hit === null ? groups.length - 1 : hit].items.push(tile);
    });
  }

  var zones = [];
  groups.forEach(function (g) {
    var minRows = rows > 0 ? rows : 0;
    // 空的区不画（冰箱没有冻货就不该出现一块空隔板），
    // 但容器整体定了层数时，最后一个区要撑满，否则「4 层」看不出效果
    if (!g.items.length && !minRows) return;
    zones.push({
      key: g.def.key,
      name: g.def.name,
      count: g.items.length,
      warning: countStatus(g.items, 'warning'),
      expired: countStatus(g.items, 'expired'),
      tiles: g.items,
      shelves: chunk(g.items, cols, minRows)
    });
  });
  return zones;
}

function matchesAny(text, keys) {
  if (!keys || !keys.length) return false;
  for (var i = 0; i < keys.length; i++) {
    if (text && text.indexOf(keys[i]) !== -1) return true;
  }
  return false;
}

/**
 * 按每层容量切段。
 * @param {Array} list
 * @param {number} size 每层几件
 * @param {number} minRows 至少画几层（空的补占位层）
 */
function chunk(list, size, minRows) {
  var out = [];
  var step = size > 0 ? size : 4;
  for (var i = 0; i < list.length; i += step) {
    out.push({ k: out.length, items: list.slice(i, i + step) });
  }
  var want = minRows || 0;
  while (out.length < want) {
    out.push({ k: out.length, items: [] });
  }
  if (!out.length) out.push({ k: 0, items: [] });
  return out;
}

/**
 * 排序：先按手动位次（拖拽过的那批），再按紧急度。
 *
 * 为什么手动位次要整体排在自动排序之前，而不是「插在哪就排哪」：
 * 手动位次是一个整体序列，中间夹着若干没有位次的物品会让顺序变得不可预测。
 * 新记的东西永远排在最后，符合「刚放进去的还在最外面」的直觉。
 */
function sortTiles(tiles, order) {
  var map = order || {};
  return tiles.slice().sort(function (a, b) {
    var pa = map[a.id];
    var pb = map[b.id];
    var ha = pa !== undefined && pa !== null;
    var hb = pb !== undefined && pb !== null;
    if (ha && hb) return pa - pb;
    if (ha) return -1;
    if (hb) return 1;

    var ra = rank(a);
    var rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (a.daysLeft === null && b.daysLeft === null) return 0;
    if (a.daysLeft === null) return 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft;
  });
}

/** 已过期 0 < 临期 1 < 正常 2 < 无过期日 3 */
function rank(tile) {
  if (tile.status === 'expired') return 0;
  if (tile.status === 'warning') return 1;
  if (tile.status === 'fresh') return 2;
  return 3;
}

/** 状态 -> 类名，避免模板里连写三元 */
function statusClass(status) {
  if (status === 'expired') return 'is-expired';
  if (status === 'warning') return 'is-warning';
  return '';
}

/**
 * 在某个容器里「记一件」时，location 该预填什么
 *
 * 取容器自己的归位关键字（keys[0]）：它一定能被 resolve() 认回来，
 * 所以存完确实会落在这个容器里，不会因为预填了一个认不出的名字跑进「未归位」。
 * 分区容器（目前只有冰箱）拼上区名：「冰箱」+「冷冻」= 冰箱冷冻。
 *
 * @param {string} containerId 容器 id
 * @param {string} zoneKey 分区 key，可不传（不传就落到 fallback 区）
 * @returns {string} 预填位置，未归位返回空串
 */
function presetLocation(containerId, zoneKey) {
  var c = getContainer(containerId);
  if (!c || c.id === UNPLACED.id) return '';
  var base = (c.keys && c.keys[0]) || c.name || '';
  if (!c.zones || !c.zones.length) return base;

  var zone = null;
  for (var i = 0; i < c.zones.length; i++) {
    if (c.zones[i].key === zoneKey) { zone = c.zones[i]; break; }
  }
  if (!zone) return base;
  var zoneWord = (zone.match && zone.match.length)
    ? zone.match[0]
    : (zone.name || '').replace(/室$/, '');
  return zoneWord ? base + zoneWord : base;
}

/**
 * 关键词命中标记（S-04）
 *
 * 搜索时**不删掉整个柜子**：命中的柜子留在墙上，柜内命中的那块亮着、
 * 其余变暗。这样既知道东西在哪，也还看得见那个柜子里另外装了什么 ——
 * 只留命中项的话，冰箱看起来就只剩一罐可乐，失去了「在冰箱里」的空间感。
 *
 * 命中范围是「名称 + 位置」，和列表页搜索保持一致。
 *
 * @param {Array} wall groupByContainer 产出的容器墙
 * @param {string} keyword 关键词，空串则原样返回
 * @returns {{ wall: Array, hitTotal: number }}
 */
function applyKeyword(wall, keyword) {
  var kw = (keyword || '').trim().toLowerCase();
  if (!kw) return { wall: wall, hitTotal: 0 };

  var hitTotal = 0;
  var out = [];

  wall.forEach(function (card) {
    var hits = 0;

    var zones = card.zones.map(function (zone) {
      var shelves = zone.shelves.map(function (shelf) {
        var items = shelf.items.map(function (t) {
          var hit = ((t.name || '') + ' ' + (t.location || '')).toLowerCase().indexOf(kw) !== -1;
          if (hit) hits++;
          return Object.assign({}, t, { hit: hit, dim: !hit });
        });
        return { k: shelf.k, items: items };
      });
      return Object.assign({}, zone, { shelves: shelves });
    });

    if (!hits) return;
    hitTotal += hits;

    // 柜门上露的 emoji 也换成命中的那几件，一眼看出是哪一罐
    var hitTiles = [];
    zones.forEach(function (z) {
      z.shelves.forEach(function (s) {
        s.items.forEach(function (t) { if (t.hit) hitTiles.push(t); });
      });
    });

    out.push(Object.assign({}, card, {
      zones: zones,
      hitCount: hits,
      preview: hitTiles.slice(0, 3).map(function (t, i) { return { k: i, e: t.emoji }; })
    }));
  });

  return { wall: out, hitTotal: hitTotal };
}

module.exports = {
  CONTAINERS: CONTAINERS,
  UNPLACED: UNPLACED,
  getDefs: getDefs,
  getContainer: getContainer,
  setDefs: setDefs,
  resetDefs: resetDefs,
  source: source,
  resolve: resolve,
  presetLocation: presetLocation,
  toTile: toTile,
  groupByContainer: groupByContainer,
  applyKeyword: applyKeyword,
  statusClass: statusClass
};
