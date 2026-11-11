/**
 * 智能仓储 · 容器可视化（S-01）
 *
 * 思路：把家里的收纳空间当成一个个「看得见的东西」——冰箱就是冰箱的样子，
 * 点开它，里面一层层隔板上摆着东西（emoji 或照片）。不做背包格子、不设容量，
 * 全部自动排布：东西多就多摊一层，少就一层空着。
 *
 * 关键取舍（见 AGENTS.md §12.2）：**不建容器表、不加接口、不改 items 表**。
 * 容器只是「同一份物品数据的另一种视图」，靠 location 文本归位；
 * 归不进去的统一进「未归位」，不丢数据、也不逼用户改老记录。
 *
 * 为什么不用 utils/lexicon.js 的位置词频当清单：那是快速记录的纠错词库，
 * 会随口语漂移，不是权威容器列表。
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
  keys: []
};

/**
 * 容器清单（固定几个，先不做自定义，避免又多一套维护界面）
 *
 * - `keys` 是归位关键字，匹配 location 里的子串，**最长优先**；
 * - `skin` 决定墙上画成什么样：fridge 双门冰箱 / door2 对开柜 /
 *   glass 玻璃门柜 / medical 药箱 / rack 开放置物架 / carton 纸箱；
 * - `cols` 是容器内部每层摆几个，也影响每层高度；
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
    keys: ['厨房', '橱柜', '灶台', '调料', '碗柜']
  },
  {
    id: 'snack',
    name: '零食柜',
    icon: '🍪',
    skin: 'glass',
    desc: '零食 / 茶几 / 电视柜',
    cols: 4,
    keys: ['零食', '茶几', '电视柜', '边几']
  },
  {
    id: 'medicine',
    name: '药箱',
    icon: '💊',
    skin: 'medical',
    desc: '药箱 / 药柜',
    cols: 3,
    keys: ['药箱', '药柜', '药品', '急救']
  },
  {
    id: 'cabinet',
    name: '储物柜',
    icon: '🗄️',
    skin: 'door2',
    desc: '储物柜 / 收纳箱',
    cols: 3,
    keys: ['储物柜', '储物间', '收纳', '柜子', '抽屉']
  },
  {
    id: 'bath',
    name: '卫浴阳台',
    icon: '🧴',
    skin: 'rack',
    desc: '卫生间 / 洗手台 / 阳台',
    cols: 3,
    keys: ['卫生间', '浴室', '洗手台', '洗漱', '阳台', '洗衣']
  },
  {
    id: 'bedroom',
    name: '卧室',
    icon: '🛏️',
    skin: 'door2',
    desc: '床头 / 衣柜',
    cols: 3,
    keys: ['卧室', '床头', '衣柜']
  }
];

/** 「最长关键字优先」的查找表，模块加载时算一次 */
var KEY_INDEX = (function () {
  var pairs = [];
  CONTAINERS.forEach(function (c) {
    c.keys.forEach(function (k) {
      pairs.push({ key: k, id: c.id });
    });
  });
  pairs.sort(function (a, b) { return b.key.length - a.key.length; });
  return pairs;
})();

function getContainer(id) {
  if (!id || id === UNPLACED.id) return UNPLACED;
  for (var i = 0; i < CONTAINERS.length; i++) {
    if (CONTAINERS[i].id === id) return CONTAINERS[i];
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
 * 空容器不显示，避免一面墙上大半是空盒子；
 * 「未归位」只在真有东西没写位置时出现，并且固定排在最后。
 *
 * @param {Array} items 物品数组
 * @returns {{ wall: Array, byId: Object, total: number, warning: number, expired: number }}
 */
function groupByContainer(items) {
  var list = items || [];
  var buckets = {};
  var byId = {};

  CONTAINERS.forEach(function (c) {
    buckets[c.id] = [];
    byId[c.id] = c;
  });
  buckets[UNPLACED.id] = [];
  byId[UNPLACED.id] = UNPLACED;

  list.forEach(function (item) {
    var id = resolve(item.location);
    buckets[id].push(item);
  });

  var wall = [];
  CONTAINERS.forEach(function (c) {
    var own = buckets[c.id];
    if (!own.length) return;
    wall.push(buildCard(c, own));
  });
  // 全部归好位时不显示空盒子；一旦有东西没写位置，它固定排最后
  if (buckets[UNPLACED.id].length) {
    wall.push(buildCard(UNPLACED, buckets[UNPLACED.id]));
  }

  return {
    wall: wall,
    byId: byId,
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

function buildCard(container, items) {
  var cols = container.cols || 4;
  var tiles = sortTiles(items.map(toTile));

  return {
    id: container.id,
    name: container.name,
    icon: container.icon,
    skin: container.skin || 'door2',
    desc: container.desc,
    cols: cols,
    count: items.length,
    warning: countStatus(items, 'warning'),
    expired: countStatus(items, 'expired'),
    // 墙上那张卡片露几个 emoji，隔着柜门也能看出里面大概有什么
    // 带 k 是为了 wx:key —— emoji 会重复（两瓶可乐），不能拿 emoji 当 key
    preview: tiles.slice(0, 3).map(function (t, i) { return { k: i, e: t.emoji }; }),
    // 容器里先摆「要过期的」，一眼看到的是最该处理的
    tiles: tiles,
    zones: buildZones(container, tiles, cols)
  };
}

/**
 * 分区 + 分层。
 *
 * 冰箱有冷冻室/冷藏室两个区（`match` 匹配 location），其他容器只有一个区，
 * 区名留空、不画区标题。区内每 `cols` 件一层，层就是冰箱里那块玻璃隔板。
 */
function buildZones(container, tiles, cols) {
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
    // 空的区不画：冰箱里没有冻货，就不该出现一块空隔板
    if (!g.items.length) return;
    zones.push({
      key: g.def.key,
      name: g.def.name,
      count: g.items.length,
      warning: countStatus(g.items, 'warning'),
      expired: countStatus(g.items, 'expired'),
      tiles: g.items,
      shelves: chunk(g.items, cols)
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

/** 按每层容量切段，每层带个序号（wx:key 用） */
function chunk(list, size) {
  var out = [];
  var step = size > 0 ? size : 4;
  for (var i = 0; i < list.length; i += step) {
    out.push({ k: out.length, items: list.slice(i, i + step) });
  }
  return out;
}

function sortTiles(tiles) {
  return tiles.slice().sort(function (a, b) {
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
  getContainer: getContainer,
  resolve: resolve,
  presetLocation: presetLocation,
  toTile: toTile,
  groupByContainer: groupByContainer,
  applyKeyword: applyKeyword,
  statusClass: statusClass
};
