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

// ---------- 归位 ----------
check('冰箱冷藏', C.resolve('冰箱冷藏'), 'fridge');
check('路径式位置', C.resolve('冰箱/冷藏第二层'), 'fridge');
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
check('冰箱一层放得下 3 件', fridge.zones[0].shelves.length, 1);
check('只有一层时不出现冷冻区', fridge.zones.map(function (z) { return z.name; }), ['冷藏室']);

var twin = C.groupByContainer([
  { id: 'a', name: '速冻水饺', quantity: 1, unit: '袋', location: '冰箱冷冻室', status: 'fresh', daysLeft: 90 },
  { id: 'b', name: '牛奶', quantity: 1, unit: '盒', location: '冰箱冷藏', status: 'fresh', daysLeft: 5 },
  { id: 'c', name: '雪糕', quantity: 1, unit: '支', location: '冰箱', status: 'fresh', daysLeft: 200 }
]).wall[0];
check('冰箱分冷冻/冷藏两区', twin.zones.map(function (z) { return z.name; }), ['冷冻室', '冷藏室']);
check('冷冻区只收速冻', twin.zones[0].count, 1);
check('认不出子区域进冷藏', twin.zones[1].tiles.map(function (t) { return t.id; }), ['b', 'c']);

// 超过一层要摊到下一层
var many = C.groupByContainer([1, 2, 3, 4, 5, 6].map(function (n) {
  return { id: 'x' + n, name: '可乐' + n, quantity: 1, unit: '瓶', location: '冰箱', status: 'fresh', daysLeft: 9 };
})).wall[0];
check('6 件摊成两层', many.zones[0].shelves.map(function (s) { return s.items.length; }), [4, 2]);

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
check('命中的块亮着', hit.wall[0].zones[0].shelves[0].items.filter(function (t) { return t.hit; }).map(function (t) { return t.id; }), ['a']);
check('同柜其他块变暗', hit.wall[0].zones[0].shelves[0].items.filter(function (t) { return t.dim; }).map(function (t) { return t.id; }), ['b']);
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

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' 项失败');
process.exit(failures === 0 ? 0 : 1);
