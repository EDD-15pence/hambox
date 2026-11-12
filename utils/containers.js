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
      if (k) pairs.push({ key: k, id: c.id, byName: 0 });
    });
    // 柜子名本身也算归位词。
    // 自建容器常常只填名字、不填关键字，只认 keys 的话「阳台箱」永远落不进它自己，
    // 拖进去的东西会绕一圈回到「未归位」。同长度时关键字优先，名字靠后。
    if (c.name && c.id !== UNPLACED.id) pairs.push({ key: c.name, id: c.id, byName: 1 });
  });
  pairs.sort(function (a, b) {
    if (b.key.length !== a.key.length) return b.key.length - a.key.length;
    return a.byName - b.byName;
  });
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
 * @param {{order?: Object, slots?: Object, showEmpty?: boolean}} opts
 *        order: { 物品 id: 位次 }，拖拽排过序的按位次排，没排过的跟在后面
 *        slots: { 物品 id: {zone, row, pos} }，来自 item_slots；
 *               zone_key 里编了层号（第 2 层起 `区:层`），决定东西钉在哪一层
 * @returns {{ wall: Array, total: number, warning: number, expired: number }}
 */
function groupByContainer(items, opts) {
  var options = opts || {};
  var order = options.order || {};
  var slots = options.slots || {};
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
    wall.push(buildCard(c, own, order, slots));
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

function buildCard(container, items, order, slots) {
  var cols = container.cols || 4;
  var rows = container.rows || 0;
  var tiles = sortTiles(items.map(toTile), order);

  // 把「这件钉在哪层」附到块上：层号来自 item_slots 的 zone_key
  if (slots && Object.keys(slots).length) {
    tiles = tiles.map(function (t) {
      var slot = slots[String(t.id)];
      return slot ? Object.assign({}, t, { row: slot.row, pos: slot.pos }) : t;
    });
  }

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
  // 多个分区的容器（目前只有冰箱）即使某个区空了也照样画出来 ——
  // 否则「把青菜从冷冻拖到冷藏」时，空的那一区没有落点，只能先点「＋」记一件再挪
  var multiZone = defs.length > 1;
  groups.forEach(function (g) {
    var minRows = rows > 0 ? rows : 0;
    // 空的区不画（冰箱没有冻货就不该出现一块空隔板），
    // 但容器整体定了层数时，最后一个区要撑满，否则「4 层」看不出效果
    if (!g.items.length && !minRows && !multiZone) return;
    var shelves = layoutShelves(g.items, cols, minRows).map(function (s) {
      // 落点 key 在模板里拼不出来，先算好；rowKey 同时挂到块上
      var rowKey = 'shelf:' + g.def.key + ':' + s.no;
      var items = s.items.map(function (t) {
        // 用**实际**层号（装不下会顺延），拖拽时据此判断是不是换了层
        return Object.assign({}, t, { row: s.no, rowKey: rowKey });
      });
      return { k: s.k, no: s.no, items: items, dropKey: rowKey };
    });
    // 摊平后的顺序才是真实视觉顺序（层 → 层内位次），
    // 拖拽找「这件前后是谁」必须按它算，不能再用 sortTiles 的顺序
    var flat = [];
    shelves.forEach(function (s) { flat = flat.concat(s.items); });
    zones.push({
      key: g.def.key,
      name: g.def.name,
      // 拖拽落点用的 key：模板里没法拼字符串，先算好
      dropKey: 'zone:' + g.def.key,
      count: g.items.length,
      warning: countStatus(g.items, 'warning'),
      expired: countStatus(g.items, 'expired'),
      tiles: flat,
      shelves: shelves
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
 * 位次的 zone_key 怎么编码层号（S-12）。
 *
 * `item_slots.zone_key` 是自由字符串，后端不校验格式，所以层号直接编进去：
 * - 第 1 层沿用**纯区 key**（`chill`）—— 1.3.0 / 1.3.1 手动排过的旧位次读出来
 *   还是第 1 层，零迁移、不弹位；
 * - 第 2 层起写 `chill:2`。
 *
 * @param {string} zone 分区 key
 * @param {number} row 1 起的层号
 * @returns {string}
 */
function zoneKeyOf(zone, row) {
  var key = zone || 'main';
  return row > 1 ? key + ':' + row : key;
}

/**
 * 反解 zone_key。
 * @param {string} zoneKey `chill` / `chill:2`
 * @returns {{ zone: string, row: number }}
 */
function parseZoneKey(zoneKey) {
  var raw = String(zoneKey || 'main');
  var at = raw.indexOf(':');
  if (at < 0) return { zone: raw, row: 1 };
  var row = parseInt(raw.slice(at + 1), 10);
  return { zone: raw.slice(0, at), row: row > 0 ? row : 1 };
}

/**
 * 把一区的物品摊成层。
 *
 * 和以前「按顺序每 cols 件切一段」的区别：现在**层是物品的属性**。
 * 拖到第 2 层的东西必须留在第 2 层，不能再被顺序切段冲走 ——
 * 否则「冷藏 2 层拖到冷冻 2 层」松手后又会被自动排到别处。
 *
 * 三种情况：
 * 1. 钉了层（`t.row > 0`，来自 item_slots 的 zone_key）→ 放那一层，层内按位次排；
 * 2. 没钉层的（新记的、老数据没排过的）→ 从第 1 层起找空位，排满往下开层；
 * 3. 一层装不下（每层件数被改小）→ 顺延到下一层，宁可多画一层也不丢东西。
 *
 * @param {Array} list 已按 sortTiles 排好的块
 * @param {number} size 每层几件
 * @param {number} minRows 至少画几层（空的补占位层）
 */
function layoutShelves(list, size, minRows) {
  var step = size > 0 ? size : 4;
  var buckets = [];

  function bucketAt(row) {
    while (buckets.length < row) buckets.push([]);
    return buckets[row - 1];
  }

  function push(fromRow, tile) {
    var row = fromRow > 0 ? fromRow : 1;
    var bucket = bucketAt(row);
    while (bucket.length >= step) {
      row += 1;
      bucket = bucketAt(row);
    }
    bucket.push(tile);
  }

  var pinned = [];
  var free = [];
  (list || []).forEach(function (t) {
    if (t && t.row > 0) pinned.push(t);
    else free.push(t);
  });

  // 钉住先放：层号小的先，同层按层内位次
  pinned.sort(function (a, b) {
    if (a.row !== b.row) return a.row - b.row;
    var pa = a.pos === null || a.pos === undefined ? Number.MAX_SAFE_INTEGER : a.pos;
    var pb = b.pos === null || b.pos === undefined ? Number.MAX_SAFE_INTEGER : b.pos;
    return pa - pb;
  });
  pinned.forEach(function (t) { push(t.row, t); });

  // 自由的从第 1 层起补空位，补满才往下开层
  free.forEach(function (t) { push(1, t); });

  var want = minRows || 0;
  while (buckets.length < want) buckets.push([]);
  if (!buckets.length) buckets.push([]);

  return buckets.map(function (items, i) {
    // no 是 1 起的层号，模板里当落点标识用；k 仍给 wx:key
    return { k: i, no: i + 1, items: items };
  });
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
        // no / dropKey 要一起带过去，否则搜索状态下拖拽找不到层落点
        return Object.assign({}, shelf, { items: items });
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
  zoneKeyOf: zoneKeyOf,
  parseZoneKey: parseZoneKey,
  toTile: toTile,
  groupByContainer: groupByContainer,
  applyKeyword: applyKeyword,
  statusClass: statusClass
};
