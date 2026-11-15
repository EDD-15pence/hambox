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

check('预设 8 个房间', R.PRESET_ROOMS.length, 8);
check('预设房间 id 不重复',
  R.PRESET_ROOMS.map(function (r) { return r.id; }).length,
  Object.keys(R.PRESET_ROOMS.reduce(function (m, r) { m[r.id] = 1; return m; }, {})).length);
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

console.log(failures === 0 ? '\n全部通过' : '\n失败 ' + failures + ' 项');
process.exit(failures === 0 ? 0 : 1);
