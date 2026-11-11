/**
 * 智能仓储 · 容器可视化（S-01）
 *
 * 只借《背包乱斗》的观感：容器是个可见的框，物品是框里一块块积木。
 * 不借玩法 —— 不拼形状、不设容量、不强制摆格子，全部自动排布。
 *
 * 关键取舍（见 AGENTS.md §12.2）：**不建容器表、不加接口、不改 items 表**。
 * 容器只是「同一份物品数据的另一种视图」，靠 location 文本归位；
 * 归不进去的统一进「未归位」，不丢数据、也不逼用户改老记录。
 *
 * 为什么不用 utils/lexicon.js 的位置词频当清单：那是快速记录的纠错词库，
 * 会随口语漂移，不是权威容器列表。
 */

/** 未归位兜底容器：任何 location 都归得进去，保证「一件都不丢」 */
var UNPLACED = {
  id: 'unplaced',
  name: '未归位',
  icon: '📦',
  desc: '没写位置或认不出位置的东西',
  cols: 4,
  keys: []
};

/**
 * 容器清单（固定几个，先不做自定义，避免又多一套维护界面）
 *
 * - `keys` 是归位关键字，匹配 location 里的子串；
 * - 匹配时按关键字**长度降序**，所以「冷冻室」不会被「冰箱」抢先；
 * - `cols` 只影响容器内网格列数：冰箱 / 零食柜这种小件多的用 4 列，
 *   药箱 / 厨房这种包装大的用 3 列，块更宽、字更好读。
 */
var CONTAINERS = [
  {
    id: 'fridge',
    name: '冰箱',
    icon: '❄️',
    desc: '冷藏 + 冷冻都算',
    cols: 4,
    keys: ['冰箱', '冷藏', '冷冻', '冰柜', '保鲜']
  },
  {
    id: 'kitchen',
    name: '厨房柜',
    icon: '🧂',
    desc: '橱柜 / 灶台 / 调料',
    cols: 3,
    keys: ['厨房', '橱柜', '灶台', '调料', '碗柜']
  },
  {
    id: 'snack',
    name: '零食柜',
    icon: '🍪',
    desc: '零食 / 茶几 / 电视柜',
    cols: 4,
    keys: ['零食', '茶几', '电视柜', '边几']
  },
  {
    id: 'medicine',
    name: '药箱',
    icon: '💊',
    desc: '药箱 / 药柜',
    cols: 3,
    keys: ['药箱', '药柜', '药品', '急救']
  },
  {
    id: 'cabinet',
    name: '储物柜',
    icon: '🗄️',
    desc: '储物柜 / 收纳箱',
    cols: 3,
    keys: ['储物柜', '储物间', '收纳', '柜子', '抽屉']
  },
  {
    id: 'bath',
    name: '卫浴阳台',
    icon: '🧴',
    desc: '卫生间 / 洗手台 / 阳台',
    cols: 3,
    keys: ['卫生间', '浴室', '洗手台', '洗漱', '阳台', '洗衣']
  },
  {
    id: 'bedroom',
    name: '卧室',
    icon: '🛏️',
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

/** 一件物品的块要显示什么：首字、状态、数量角标文案 */
function toTile(item) {
  var name = (item.name || '').trim();
  var status = item.status || '';
  return {
    id: item.id,
    name: name,
    initial: name ? name.charAt(0) : '?',
    imageSrc: item.imageSrc || '',
    quantity: item.quantity,
    unit: item.unit || '',
    // 数量为 1 时不显示角标，角标只用来提示"还有几个"
    qtyText: item.quantity > 1 ? '×' + item.quantity : '',
    status: status,
    // 模板里不写三元：描边类名在这里定好
    cls: statusClass(status),
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
  var tiles = items.map(toTile);
  return {
    id: container.id,
    name: container.name,
    icon: container.icon,
    desc: container.desc,
    cols: container.cols,
    count: items.length,
    warning: countStatus(items, 'warning'),
    expired: countStatus(items, 'expired'),
    // 容器里先摆"要过期的"，一眼看到的是最该处理的
    tiles: sortTiles(tiles)
  };
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

/** 状态 -> 块描边用的类名，避免模板里连写三元 */
function statusClass(status) {
  if (status === 'expired') return 'is-expired';
  if (status === 'warning') return 'is-warning';
  return '';
}

module.exports = {
  CONTAINERS: CONTAINERS,
  UNPLACED: UNPLACED,
  getContainer: getContainer,
  resolve: resolve,
  toTile: toTile,
  groupByContainer: groupByContainer,
  statusClass: statusClass
};
