/**
 * 容器归位规则单测（纯 node，不需要微信环境）
 *
 * 跑法： node utils/containers.test.js
 */

var C = require('./containers');

var failures = 0;

function check(label, actual, expected) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a === e) {
    console.log('PASS  ' + label);
  } else {
    failures++;
    console.log('FAIL  ' + label + '\n      期望 ' + e + '\n      实际 ' + a);
  }
}

/** 按 key 取分区。冰箱现在永远画出冷冻 + 冷藏两段，
    空的那段也在（拖拽要落点），所以不能再用 zones[0] 当下标 */
function zoneOf(card, key) {
  var zones = (card && card.zones) || [];
  for (var i = 0; i < zones.length; i++) {
    if (zones[i].key === key) return zones[i];
  }
  return { shelves: [], tiles: [] };
}

// ---------- 归位 ----------
check('冰箱冷藏', C.resolve('冰箱冷藏'), 'fridge');check('路径式位置', C.resolve('冰箱/冷藏第二层'), 'fridge');
check('冷冻室归冰箱', C.resolve('冷冻室'), 'fridge');
check('保鲜层归冰箱', C.resolve('保鲜抽屉'), 'fridge');
check('药箱', C.resolve('药箱'), 'medicine');
check('药品柜', C.resolve('药品柜上层'), 'medicine');
check('客厅茶几归零食柜', C.resolve('客厅茶几'), 'snack');
check('厨房柜子', C.resolve('厨房柜子'), 'kitchen');
check('卧室', C.resolve('卧室床头'), 'bedroom');
check('卫生间', C.resolve('卫生间洗手台'), 'bath');

// 最长关键字优先：不能因为先匹配到「阳台」就把储物柜算进卫浴
check('最长优先·储物柜', C.resolve('阳台储物柜'), 'cabinet');

check('空位置进未归位', C.resolve(''), 'unplaced');
check('null 位置进未归位', C.resolve(null), 'unplaced');
check('认不出的位置进未归位', C.resolve('楼下'), 'unplaced');

// ---------- 容器墙 ----------
var items = [
  { id: '1', name: '牛奶', quantity: 2, unit: '瓶', location: '冰箱冷藏', status: 'warning', daysLeft: 3 },
  { id: '2', name: '酸奶', quantity: 1, unit: '盒', location: '冰箱冷藏', status: 'expired', daysLeft: -2 },
  { id: '3', name: '可乐', quantity: 1, unit: '瓶', location: '冰箱门', status: 'fresh', daysLeft: 200 },
  { id: '4', name: '布洛芬', quantity: 1, unit: '盒', location: '药箱', status: null, daysLeft: null },
  { id: '5', name: '薯片', quantity: 3, unit: '袋', location: '', status: 'fresh', daysLeft: 90 }
];

var g = C.groupByContainer(items);
var ids = g.wall.map(function (c) { return c.id; });

check('墙上有冰箱和药箱', ids.indexOf('fridge') !== -1 && ids.indexOf('medicine') !== -1, true);
check('空容器不出现', ids.indexOf('bedroom'), -1);
check('未归位永远在最后', ids[ids.length - 1], 'unplaced');
check('总数', g.total, 5);
check('临期数', g.warning, 1);
check('过期数', g.expired, 1);

var fridge = g.wall.filter(function (c) { return c.id === 'fridge'; })[0];
check('冰箱件数（含冰箱门）', fridge.count, 3);
check('冰箱临期数', fridge.warning, 1);
check('冰箱过期数', fridge.expired, 1);
// 容器内先摆要处理的：过期 -> 临期 -> 正常
check('块按紧急度排序', fridge.tiles.map(function (t) { return t.id; }), ['2', '1', '3']);

var unplaced = g.wall[g.wall.length - 1];
check('未归位件数', unplaced.count, 1);

// ---------- 块 ----------
var tile = C.toTile({ name: '牛奶', quantity: 2, unit: '瓶', status: 'warning', daysLeft: 3, imageSrc: '' });
check('块有 emoji', tile.emoji, '🥛');
check('数量角标', tile.qtyText, '×2');
check('状态类名', tile.cls, 'is-warning');
check('临期有状态点', tile.dot, true);

check('单件不出角标', C.toTile({ name: '可乐', quantity: 1 }).qtyText, '');
check('过期类名', C.toTile({ name: '酸奶', quantity: 1, status: 'expired' }).cls, 'is-expired');
check('正常无状态点', C.toTile({ name: '可乐', quantity: 1, status: 'fresh' }).dot, false);

// 名称缺失也不能把渲染搞崩，emoji 按分类兜底
check('空名称兜底 emoji', C.toTile({ quantity: 1 }).emoji, '📦');
check('空名称按分类兜底', C.toTile({ quantity: 1, category: 'medicine' }).emoji, '💊');

// ---------- 分层 / 分区 ----------
check('冰箱一层放得下 3 件', zoneOf(fridge, 'chill').shelves.length, 1);
// 冷冻室空着也画：不然「把东西从冷藏拖到冷冻」时那一区没有落点
check('空冷冻室照样画出来', fridge.zones.map(function (z) { return z.name; }), ['冷冻室', '冷藏室']);
check('空冷冻室没有东西', zoneOf(fridge, 'freeze').count, 0);
check('空冷冻室留了一层空隔板', zoneOf(fridge, 'freeze').shelves.length, 1);

var twin = C.groupByContainer([
  { id: 'a', name: '速冻水饺', quantity: 1, unit: '袋', location: '冰箱冷冻室', status: 'fresh', daysLeft: 90 },
  { id: 'b', name: '牛奶', quantity: 1, unit: '盒', location: '冰箱冷藏', status: 'fresh', daysLeft: 5 },
  { id: 'c', name: '雪糕', quantity: 1, unit: '支', location: '冰箱', status: 'fresh', daysLeft: 200 }
]).wall[0];
check('冰箱分冷冻/冷藏两区', twin.zones.map(function (z) { return z.name; }), ['冷冻室', '冷藏室']);
check('冷冻区只收速冻', zoneOf(twin, 'freeze').count, 1);
check('认不出子区域进冷藏', zoneOf(twin, 'chill').tiles.map(function (t) { return t.id; }), ['b', 'c']);

// 超过一层要摊到下一层
var many = C.groupByContainer([1, 2, 3, 4, 5, 6].map(function (n) {
  return { id: 'x' + n, name: '可乐' + n, quantity: 1, unit: '瓶', location: '冰箱', status: 'fresh', daysLeft: 9 };
})).wall[0];
check('6 件摊成两层', zoneOf(many, 'chill').shelves.map(function (s) { return s.items.length; }), [4, 2]);

var medicine = C.groupByContainer([
  { id: 'm', name: '布洛芬', quantity: 1, unit: '盒', location: '药箱', status: null, daysLeft: null }
]).wall[0];
check('非冰箱容器只有一个区', medicine.zones.length, 1);
check('单区不显示区名', medicine.zones[0].name, '');

// 全部归好位时不该出现空空的「未归位」盒子
var allPlaced = C.groupByContainer([
  { id: '9', name: '牛奶', quantity: 1, unit: '盒', location: '冰箱冷藏', status: 'fresh', daysLeft: 5 }
]);
check('全归位时无未归位盒', allPlaced.wall.map(function (c) { return c.id; }), ['fridge']);

// ---------- 搜索命中（S-04） ----------
var searchWall = C.groupByContainer([
  { id: 'a', name: '可乐', quantity: 2, unit: '瓶', location: '冰箱冷藏', status: 'fresh', daysLeft: 90 },
  { id: 'b', name: '年糕', quantity: 1, unit: '袋', location: '冰箱冷藏', status: 'warning', daysLeft: 3 },
  { id: 'c', name: '布洛芬', quantity: 1, unit: '盒', location: '药箱', status: null, daysLeft: null }
]).wall;

var hit = C.applyKeyword(searchWall, '可乐');
check('只留命中的柜子', hit.wall.map(function (c) { return c.id; }), ['fridge']);
check('命中数', hit.hitTotal, 1);
check('柜上标命中件数', hit.wall[0].hitCount, 1);
var hitChill = zoneOf(hit.wall[0], 'chill');
check('命中的块亮着', hitChill.shelves[0].items.filter(function (t) { return t.hit; }).map(function (t) { return t.id; }), ['a']);
check('同柜其他块变暗', hitChill.shelves[0].items.filter(function (t) { return t.dim; }).map(function (t) { return t.id; }), ['b']);
check('柜门预览换成命中的 emoji', hit.wall[0].preview.length, 1);

// 按位置也能搜到：问「冰箱里有什么」
var byLoc = C.applyKeyword(searchWall, '冰箱');
check('按位置命中两件', byLoc.hitTotal, 2);
check('按位置只留冰箱', byLoc.wall.map(function (c) { return c.id; }), ['fridge']);

// 空关键词不能改动任何东西，否则清空搜索后墙上会少东西
var blank = C.applyKeyword(searchWall, '   ');
check('空关键词原样返回', blank.wall === searchWall, true);
check('空关键词无命中数', blank.hitTotal, 0);

// 搜不到时墙是空的，页面据此显示「没找到」
check('搜不到返回空墙', C.applyKeyword(searchWall, '西瓜').wall.length, 0);

// ==========================================================
// S-08 / S-09 / S-10：容器定义可换、层数占位、拖拽位次
// ==========================================================

// ---------- 后端定义覆盖 ----------

check(
  '默认用内置定义',
  C.getDefs().length,
  8
);

C.setDefs([
  {
    id: 'fridge',
    name: '大冰箱',
    icon: '❄️',
    skin: 'fridge',
    cols: 2,
    rows: 3,
    keys: ['冰箱', '冷藏'],
    zones: [],
    sort_order: 10,
    is_builtin: true,
    deletable: true
  },
  {
    id: 'c_lunch',
    name: '便当柜',
    icon: '🍱',
    skin: 'glass',
    cols: 3,
    rows: 0,
    keys: ['便当', '饭盒'],
    zones: [],
    sort_order: 20,
    is_builtin: false,
    deletable: true
  },
  {
    id: 'unplaced',
    name: '未归位',
    icon: '📦',
    skin: 'carton',
    cols: 4,
    rows: 0,
    keys: [],
    zones: [],
    sort_order: 999,
    is_builtin: true,
    deletable: false
  }
]);

check('后端定义生效', C.source(), 'server');
check('自建容器能被认出来', C.resolve('便当柜第二层'), 'c_lunch');
check('名字改了按新名字', C.getContainer('fridge').name, '大冰箱');
check('自建容器不可删标记', C.getContainer('unplaced').deletable, false);

// 后端漏发 unplaced 时前端要自己补，否则认不出的东西没地方放
C.setDefs([
  { id: 'fridge', name: '冰箱', skin: 'fridge', cols: 4, rows: 0, keys: ['冰箱'], sort_order: 10 }
]);
check('缺 unplaced 自动补', C.resolve('不认识的地方'), 'unplaced');

// ---------- 层数占位 ----------

C.resetDefs();
check('重置回内置', C.source(), 'builtin');

// 层数占位：给零食柜定 4 层、每层 4 格
C.setDefs([
  {
    id: 'snack',
    name: '零食柜',
    icon: '🍪',
    skin: 'glass',
    cols: 4,
    rows: 4,
    keys: ['零食'],
    zones: [],
    sort_order: 10
  }
]);

var tall = C.groupByContainer(
  [
    { id: '1', name: '可乐', location: '零食柜', status: 'fresh', daysLeft: 100, quantity: 1 },
    { id: '2', name: '薯片', location: '零食柜', status: 'fresh', daysLeft: 90, quantity: 1 }
  ],
  { showEmpty: true }
);
var snackCard = null;
tall.wall.forEach(function (c) { if (c.id === 'snack') snackCard = c; });
check('定层数的柜子画满层数', snackCard.zones[0].shelves.length, 4);
check('定层数的柜子只有首层有东西', snackCard.zones[0].shelves[1].items.length, 0);

C.resetDefs();

// 空容器默认不画，showEmpty 才画
var noEmpty = C.groupByContainer([], {});
check('默认不画空容器', noEmpty.wall.length, 0);
var withEmpty = C.groupByContainer([], { showEmpty: true });
check('showEmpty 画出空盒子', withEmpty.wall.length, 7);
check('未归位没东西就不出现', withEmpty.wall.some(function (c) { return c.id === 'unplaced'; }), false);

// ---------- 拖拽位次 ----------

var ordered = C.groupByContainer(
  [
    { id: 'a', name: '牛奶', location: '冰箱冷藏', status: 'expired', daysLeft: -3, quantity: 1 },
    { id: 'b', name: '鸡蛋', location: '冰箱冷藏', status: 'fresh', daysLeft: 30, quantity: 1 },
    { id: 'c', name: '青菜', location: '冰箱冷藏', status: 'fresh', daysLeft: 5, quantity: 1 }
  ],
  { order: { a: 2, c: 0 } }
);
var fridgeCard = null;
ordered.wall.forEach(function (c) { if (c.id === 'fridge') fridgeCard = c; });
var fridgeTiles = zoneOf(fridgeCard, 'chill').tiles.map(function (t) { return t.id; });
check('手动位次优先且按位次排', fridgeTiles, ['c', 'a', 'b']);

// 拖到 0 号位的那件必须在最前，即使它快过期了
check('位次压过紧急度', fridgeTiles[0], 'c');

// ---------- 跨柜 / 跨区拖拽的归位文本 ----------
// 拖拽的实质是改 location，所以「改完还能不能认回来」必须由这几条兜住，
// 否则东西拖过去以后刷新一下又跑回原处（或掉进未归位）。
C.setDefs([
  { id: 'balcony', name: '阳台箱', icon: '📦', skin: 'carton', cols: 3, rows: 2, keys: [], zones: [], sort_order: 10, is_builtin: false, deletable: true },
  { id: 'fridge', name: '冰箱', icon: '❄️', skin: 'fridge', cols: 4, rows: 0,
    keys: ['冰箱', '冷藏', '冷冻'], sort_order: 20, is_builtin: true, deletable: true,
    zones: [
      { key: 'freeze', name: '冷冻室', match: ['冷冻', '冰柜'] },
      { key: 'chill', name: '冷藏室', match: [] }
    ] },
  { id: 'unplaced', name: '未归位', icon: '📦', skin: 'carton', cols: 4, rows: 0, keys: [], sort_order: 999, deletable: false }
]);

// 只填名字、没填关键字的自建容器，靠名字也得能归位
check('柜子名也能归位', C.resolve('阳台箱'), 'balcony');
check('自建容器预填位置', C.presetLocation('balcony', ''), '阳台箱');
check('预填的位置认得回来', C.resolve(C.presetLocation('balcony', '')), 'balcony');
check('跨区预填·冷冻', C.presetLocation('fridge', 'freeze'), '冰箱冷冻');
check('跨区预填·冷藏', C.presetLocation('fridge', 'chill'), '冰箱冷藏');
check('跨区预填认回冰箱', C.resolve(C.presetLocation('fridge', 'freeze')), 'fridge');

// 跨区搬完，物品要出现在目标区，而不是留在 fallback 区
var moved = C.groupByContainer([
  { id: 'k', name: '青菜', quantity: 1, location: C.presetLocation('fridge', 'freeze'), status: 'fresh', daysLeft: 3 }
]).wall[0];
check('预填冷冻就进冷冻区', zoneOf(moved, 'freeze').tiles.map(function (t) { return t.id; }), ['k']);

// ---------- 以层为单位（S-12） ----------
// 层号编码在 item_slots.zone_key 里：第 1 层沿用纯区 key，第 2 层起 '区:层'。
// 这几条兜住「拖到第 2 层就留在第 2 层」以及「旧位次不弹位」。

check('第 1 层不带层号', C.zoneKeyOf('chill', 1), 'chill');
check('第 2 层编层号', C.zoneKeyOf('chill', 2), 'chill:2');
check('第 1 层反解', C.parseZoneKey('chill'), { zone: 'chill', row: 1 });
check('带层号反解', C.parseZoneKey('freeze:2'), { zone: 'freeze', row: 2 });
check('空分区当 main', C.parseZoneKey(''), { zone: 'main', row: 1 });

C.setDefs([
  { id: 'box', name: '测试柜', icon: '📦', skin: 'door2', cols: 2, rows: 2, keys: ['测试柜'], zones: [], sort_order: 10, deletable: true },
  { id: 'unplaced', name: '未归位', icon: '📦', skin: 'carton', cols: 4, rows: 0, keys: [], sort_order: 999, deletable: false }
]);

function rowsOf(card) {
  var zone = (card && card.zones && card.zones[0]) || { shelves: [] };
  return zone.shelves.map(function (s) {
    return s.items.map(function (t) { return t.id; });
  });
}

var pinned = C.groupByContainer(
  [
    { id: 'a', name: 'A', location: '测试柜', status: 'fresh', daysLeft: 10, quantity: 1 },
    { id: 'b', name: 'B', location: '测试柜', status: 'fresh', daysLeft: 30, quantity: 1 },
    { id: 'c', name: 'C', location: '测试柜', status: 'fresh', daysLeft: 20, quantity: 1 }
  ],
  {
    slots: {
      b: { zone: 'main', row: 1, pos: 0 },
      c: { zone: 'main', row: 1, pos: 1 },
      a: { zone: 'main', row: 2, pos: 0 }
    }
  }
).wall[0];
check('钉在第 2 层的留在第 2 层', rowsOf(pinned)[1], ['a']);
check('第 1 层按位次', rowsOf(pinned)[0], ['b', 'c']);
check('层落点 key 带层号', pinned.zones[0].shelves[1].dropKey, 'shelf:main:2');
check('块上带实际层号', pinned.zones[0].shelves[1].items[0].row, 2);
check('区里的顺序也是层优先', pinned.zones[0].tiles.map(function (t) { return t.id; }), ['b', 'c', 'a']);

// 旧数据：slots 里只有纯区 key（等于第 1 层），读出来还在第 1 层
var legacy = C.groupByContainer(
  [
    { id: 'b', name: 'B', location: '测试柜', status: 'fresh', daysLeft: 30, quantity: 1 },
    { id: 'c', name: 'C', location: '测试柜', status: 'fresh', daysLeft: 20, quantity: 1 },
    { id: 'd', name: 'D', location: '测试柜', status: 'fresh', daysLeft: 40, quantity: 1 }
  ],
  {
    slots: {
      c: { zone: 'main', row: 1, pos: 0 },
      b: { zone: 'main', row: 1, pos: 1 }
    }
  }
).wall[0];
check('旧位次仍在第 1 层且不弹位', rowsOf(legacy)[0], ['c', 'b']);
check('没位次的顺在已有的层后面', rowsOf(legacy)[1], ['d']);

// 一层装不下：钉在同一层的三件不能丢，顺延到下一层
var overflow = C.groupByContainer(
  [
    { id: 'p', name: 'P', location: '测试柜', status: 'fresh', daysLeft: 5, quantity: 1 },
    { id: 'q', name: 'Q', location: '测试柜', status: 'fresh', daysLeft: 6, quantity: 1 },
    { id: 'r', name: 'R', location: '测试柜', status: 'fresh', daysLeft: 7, quantity: 1 }
  ],
  {
    slots: {
      p: { zone: 'main', row: 1, pos: 0 },
      q: { zone: 'main', row: 1, pos: 1 },
      r: { zone: 'main', row: 1, pos: 2 }
    }
  }
).wall[0];
check('装不下顺延', rowsOf(overflow), [['p', 'q'], ['r']]);

// 多分区：冷藏第 2 层 → 冷冻第 2 层，各在各的层
C.setDefs([
  { id: 'fridge', name: '冰箱', icon: '❄️', skin: 'fridge', cols: 4, rows: 0,
    keys: ['冰箱', '冷藏', '冷冻'], sort_order: 20, is_builtin: true, deletable: true,
    zones: [
      { key: 'freeze', name: '冷冻室', match: ['冷冻', '冰柜'] },
      { key: 'chill', name: '冷藏室', match: [] }
    ] },
  { id: 'unplaced', name: '未归位', icon: '📦', skin: 'carton', cols: 4, rows: 0, keys: [], sort_order: 999, deletable: false }
]);
var crossRow = C.groupByContainer(
  [
    { id: 'x', name: '青菜', location: '冰箱冷藏', status: 'fresh', daysLeft: 3, quantity: 1 },
    { id: 'y', name: '水饺', location: '冰箱冷冻', status: 'fresh', daysLeft: 90, quantity: 1 }
  ],
  {
    slots: {
      x: { zone: 'chill', row: 2, pos: 0 },
      y: { zone: 'freeze', row: 2, pos: 0 }
    }
  }
).wall[0];
check('冷藏第 2 层', zoneOf(crossRow, 'chill').shelves[1].items.map(function (t) { return t.id; }), ['x']);
check('冷冻第 2 层', zoneOf(crossRow, 'freeze').shelves[1].items.map(function (t) { return t.id; }), ['y']);
check('冷藏第 1 层是空的', zoneOf(crossRow, 'chill').shelves[0].items.length, 0);

C.resetDefs();
check('重置回内置', C.source(), 'builtin');
check('内置仍认得柜子名', C.resolve('储物柜'), 'cabinet');

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' 项失败');
process.exit(failures === 0 ? 0 : 1);
