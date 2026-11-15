/**
 * 房间分组 / 关键字预填单测（纯 node，不需要微信环境）
 *
 * 跑法： node utils/rooms.test.js
 */

var R = require('./rooms');

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

// ---------- 预设 ----------

// RM-09：「卧室」拆成「主卧 + 次卧」，共 9 个（§21.12 四）
check('预设 9 个房间', R.PRESET_ROOMS.length, 9);
check('预设房间 id 不重复',
  R.PRESET_ROOMS.map(function (r) { return r.id; }).length,
  Object.keys(R.PRESET_ROOMS.reduce(function (m, r) { m[r.id] = 1; return m; }, {})).length);
check('含 bedroom2（次卧）',
  R.PRESET_ROOMS.map(function (r) { return r.id; }).indexOf('bedroom2') !== -1, true);
check('bedroom 改名为主卧',
  R.PRESET_ROOMS.filter(function (r) { return r.id === 'bedroom'; })[0].name, '主卧');
check('没有残留「卧室」这档',
  R.PRESET_ROOMS.some(function (r) { return r.name === '卧室'; }), false);
check('预设容器 8 种', R.PRESET_CONTAINERS.length, 8);
check('每个预设房都有图标',
  R.PRESET_ROOMS.every(function (r) { return !!r.icon; }), true);

// ---------- 关键字预填 ----------

check('拼接房间名', R.suggestKey('卧室', '衣柜'), '卧室衣柜');
check('容器名已含房间名不重复拼', R.suggestKey('阳台', '阳台柜'), '阳台柜');
check('未分组只留容器名', R.suggestKey('', '储物柜'), '储物柜');
check('空容器名返回空', R.suggestKey('厨房', '  '), '');

// ---------- 分组 ----------

var rooms = [
  { id: 'bedroom', name: '卧室', icon: '🛏️', sortOrder: 20 },
  { id: 'kitchen', name: '厨房', icon: '🍳', sortOrder: 10 }
];
var containers = [
  { id: 'fridge', name: '冰箱', roomId: 'kitchen', sortOrder: 10 },
  { id: 'c_a', name: '衣柜', roomId: 'bedroom', sortOrder: 20 },
  { id: 'c_b', name: '衣柜', roomId: 'bedroom', sortOrder: 30 },
  { id: 'c_c', name: '纸箱', roomId: '', sortOrder: 40 },
  { id: 'unplaced', name: '未归位', roomId: '', sortOrder: 999 }
];

var g = R.groupContainers(containers, rooms);
check('房间按 sortOrder 排', g.groups.map(function (x) { return x.name; }), ['厨房', '卧室']);
check('厨房一个容器', g.groups[0].count, 1);
check('卧室两个容器', g.groups[1].count, 2);
check('未分组不含未归位', g.ungroupedCount, 1);
check('未分组是纸箱', g.ungrouped[0].name, '纸箱');
check('未归位不参与整理', g.total, 5);

// 同房间重名（卧室两个「衣柜」）要能被提示出来
check('同房间重名检测', g.groups[1].dupNames, ['衣柜']);
check('不同房间同名不算重名', g.groups[0].dupNames, []);

// room_id 指向已删房间：当未分组处理，不能从界面上消失
var orphan = R.groupContainers(
  [{ id: 'c_x', name: '旧柜', roomId: 'r_deleted', sortOrder: 1 }],
  rooms
);
check('孤儿房间归未分组', orphan.ungroupedCount, 1);
check('孤儿房间计数', orphan.orphanCount, 1);

// ---------- 件数统计 ----------

var items = [
  { location: '冰箱冷藏' },
  { location: '卧室衣柜' },
  { location: '' },
  { location: '厨房' }
];
function fakeResolve(location) {
  var text = String(location || '');
  if (text.indexOf('冰箱') !== -1) return 'fridge';
  if (text.indexOf('卧室衣柜') !== -1) return 'c_a';
  if (text.indexOf('厨房') !== -1) return 'fridge';
  return 'unplaced';
}
var counts = R.countByContainer(items, fakeResolve);
check('冰箱 2 件', counts.fridge, 2);
check('衣柜 1 件', counts.c_a, 1);
check('未归位 1 件', counts.unplaced, 1);

// ---------- 上下移 ----------

var list = [
  { id: 'a', sortOrder: 10 },
  { id: 'b', sortOrder: 20 },
  { id: 'c', sortOrder: 30 }
];
check('上移换位置', R.moveShift(list, 1, -1), [
  { id: 'b', sort_order: 10 },
  { id: 'a', sort_order: 20 }
]);
check('第一位不能再上移', R.moveShift(list, 0, -1), null);
check('最后一位不能再下移', R.moveShift(list, 2, 1), null);

// 两条 sort_order 相同时也要能换（老数据都是默认值 100）
var same = [{ id: 'x', sortOrder: 100 }, { id: 'y', sortOrder: 100 }];
var shifted = R.moveShift(same, 1, -1);
check('相同 sortOrder 也能换', shifted !== null, true);
check('相同 sortOrder 换完不再相等', shifted[0].sort_order === shifted[1].sort_order, false);

// ============================================================
// RM-07 墙面分区（§21.12 二）
// ============================================================

// 卡片只需要 id / name / roomId，和 buildCard 产出的那份同形
function card(id, roomId) {
  return { id: id, name: id, roomId: roomId };
}
var wallCards = [
  card('fridge', 'kitchen'),
  card('cab2', 'bedroom'),
  card('loose', ''),
  card('unplaced', '')
];
var sec = R.wallSections(wallCards, rooms);

check('分区按 sortOrder：厨房在前', sec.sections[0].name, '厨房');
check('分区只装自己房间的柜子', sec.sections[0].cards.length, 1);
check('未分组殿后（在未归位之前）',
  sec.sections[sec.sections.length - 1].key, 'unplaced');
check('未归位前一段是未分组',
  sec.sections[sec.sections.length - 2].name, R.UNGROUPED_TITLE);
check('未分组只放没房间的柜子',
  sec.sections[sec.sections.length - 2].cards.map(function (c) { return c.id; }), ['loose']);
check('未归位单独一段', sec.sections[sec.sections.length - 1].cards.length, 1);

// 空房间不能藏起来：刚建完房间的人要看到「柜子没进去」
var emptyRoom = R.wallSections([], [{ id: 'study', name: '书房', icon: '📚', sortOrder: 10 }]);
check('空房间也出一段', emptyRoom.sections.length, 1);
check('空房间标记 empty', emptyRoom.sections[0].empty, true);
check('空房间带 ＋柜子 落点', emptyRoom.sections[0].addRoomId, 'study');

// 搜索中不分房间：一段平铺、没有分区头
var searching = R.wallSections(wallCards, rooms, { bare: true });
check('搜索时只有一段', searching.sections.length, 1);
check('搜索段没有标题', searching.sections[0].bare, true);
check('搜索段装全部卡片', searching.sections[0].cards.length, 4);

// 没房间也没卡片：一段都不出（页面自己给空态）
check('全空时不出段', R.wallSections([], []).sections.length, 0);

// ============================================================
// RM-08 向导（§21.12 三）
// ============================================================

// --- 步 1：预勾与去重 ---
var existingRooms = [
  { id: 'kitchen', name: '厨房', icon: '🍳', sortOrder: 10 },
  { id: 'r_x', name: '玄关', icon: '🚪', sortOrder: 20 }
];
var chips = R.wizardRoomChips(R.PRESET_ROOMS, existingRooms);
check('chips = 9 预设 + 1 自建', chips.length, 10);
check('已建预设房默认打勾', chips[0].checked, true);
check('已建预设房带 existingId', chips[0].existingId, 'kitchen');
check('没建过的预设房不打勾', chips[1].checked, false);
check('自建房间追加在最后', chips[9].name, '玄关');
check('自建房间也默认打勾', chips[9].checked, true);
check('自建房间标记 custom', chips[9].custom, true);
check('房间不重复（id 唯一）',
  chips.map(function (c) { return c.id; }).filter(function (id) { return !!id; }).length,
  Object.keys(chips.reduce(function (m, c) { if (c.id) m[c.id] = 1; return m; }, {})).length);

// 已建「卧室」（旧名）的库：预设里现在是「主卧」，按名字匹配不上，
// 但按 id 能匹配上 → 仍算已有，不会被改名（§21.12 四 约束 2）
var legacy = R.wizardRoomChips(R.PRESET_ROOMS, [
  { id: 'bedroom', name: '卧室', icon: '🛏️', sortOrder: 20 }
]);
check('旧「卧室」按 id 认作已有', legacy[1].existing, true);
check('旧「卧室」的显示名沿用库里的', legacy[1].name, '卧室');

// --- 步 2：柜子预勾 ---
var existingCabs = [
  { id: 'fridge', name: '冰箱', room_id: 'kitchen', rows: 2, is_builtin: true, keys: ['冰箱'] },
  { id: 'c_k1', name: '厨房储物柜', room_id: 'kitchen', rows: 0, is_builtin: false, keys: [] },
  { id: 'c_b1', name: '衣柜', room_id: 'bedroom', rows: 0, is_builtin: false, keys: [] }
];
var kOpts = R.wizardCabOptions(R.PRESET_CONTAINERS, '厨房', existingCabs, 'kitchen');
var fridgeOpt = kOpts.filter(function (o) { return o.label === '冰箱'; })[0];
var cangOpt = kOpts.filter(function (o) { return o.label === '储物柜'; })[0];
check('已有冰箱默认勾上', fridgeOpt.on, true);
check('已有冰箱带 existingId', fridgeOpt.existingId, 'fridge');
check('已有冰箱带原层数', fridgeOpt.originRows, 2);
check('「厨房储物柜」按拼接名认出已有', cangOpt.existing, true);
check('别房间的柜子不算在本房间', cangOpt.existingId, 'c_k1');

// 但 bedroom 的衣柜不能出现在厨房的选项里
check('其他房间的柜子不进本房间',
  kOpts.some(function (o) { return o.existingId === 'c_b1'; }), false);

// 房间还没建（roomId 空）：只给预设、全部不勾
var fresh = R.wizardCabOptions(R.PRESET_CONTAINERS, '书房', existingCabs, '');
check('新房间柜子全不勾', fresh.every(function (o) { return !o.on; }), true);
check('新房间选项 = 预设 8 种', fresh.length, 8);

// 预设之外的自定义柜子也要列出来（否则「向导里没有 = 不存在」）
var extras = R.wizardCabOptions(R.PRESET_CONTAINERS, '厨房', existingCabs.concat([
  { id: 'c_k9', name: '米缸', room_id: 'kitchen', rows: 0, is_builtin: false, keys: [] }
]), 'kitchen');
check('自定义柜子追加成一项', extras.length, 9);
check('自定义柜子默认勾上', extras[8].on, true);
check('自定义柜子标记 extra', extras[8].extra, true);

// --- 个数命名：第 2 个起加后缀（不引入 count 字段） ---
check('第 1 个用原名', R.cabNameAt('储物柜', 1), '储物柜');
check('第 2 个加后缀', R.cabNameAt('储物柜', 2), '储物柜 2');

console.log(failures === 0 ? '\n全部通过' : '\n失败 ' + failures + ' 项');
process.exit(failures === 0 ? 0 : 1);
