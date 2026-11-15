/**
 * 历史词库纠错单测（纯 node，不需要微信环境）
 *
 * 跑法： node utils/lexicon.test.js
 */

// lexicon 依赖 api.js，api 里用到 wx 的地方都在函数体内；这里给个最小桩
global.wx = global.wx || {
  getStorageSync: function () { return null; },
  setStorageSync: function () {}
};

var L = require('./lexicon');

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

function lex(names, locations) {
  return L.buildLexicon(
    (names || []).map(function (n) { return { name: n, location: '' }; })
      .concat((locations || []).map(function (l) { return { name: '', location: l }; }))
  );
}

// 1. 编辑距离
check('完全相同', L.editDistance('布洛芬', '布洛芬'), 0);
check('差一个字', L.editDistance('布洛分', '布洛芬'), 1);
check('差两个字', L.editDistance('布洛分', '布洛芬胶囊'), 3);
check('空串', L.editDistance('', 'abc'), 3);

// 2. 精确命中不动
var lx = lex(['伊利纯牛奶'], ['冰箱冷藏']);
check(
  '已正确的词原样保留',
  L.correct('伊利纯牛奶 保质期6个月 放冰箱冷藏', lx).text,
  '伊利纯牛奶 保质期6个月 放冰箱冷藏'
);

// 3. 同形错一个字：纠正
check(
  '布洛分 → 布洛芬',
  L.correct('布洛分缓释胶囊 放药箱', lex(['布洛芬缓释胶囊'], ['药箱'])).text,
  '布洛芬缓释胶囊 放药箱'
);
check(
  '纯牛乃 → 纯牛奶',
  L.correct('两盒伊利纯牛乃', lex(['伊利纯牛奶'])).text,
  '两盒伊利纯牛奶'
);

// 4. 安全阀：两字词不纠（牛奶/牛肉 只差一字，纠了更容易错）
check(
  '两字词不纠错',
  L.correct('一袋牛肉干', lex(['牛奶干'])).text,
  '一袋牛肉干'
);

// 5. 安全阀：首字不同不纠
check(
  '首字不同不纠',
  L.correct('猪肉脯 放冰箱', lex(['牛肉脯'])).text,
  '猪肉脯 放冰箱'
);

// 6. 安全阀：候选有歧义时放弃
check(
  '等距多候选不猜',
  L.correct('维生素C瓶 放药箱', lex(['维生素C片', '维生素C丸'])).text,
  '维生素C瓶 放药箱'
);

// 7. 一句话里多处纠正
var multi = L.correct('伊利纯牛乃 放冰箱冷臧', lex(['伊利纯牛奶'], ['冰箱冷藏']));
check('多处同时纠正', multi.text, '伊利纯牛奶 放冰箱冷藏');
check('纠正明细条数', multi.fixes.length, 2);

// 8. 词库为空时原样返回
check('空词库不改动', L.correct('随便说一句', { names: [], locations: [] }).text, '随便说一句');

// 9. 精确命中优先：已经含正确词前缀时，不删掉后面多出来的字
check(
  '精确命中不被延长窗口覆盖',
  L.correct('伊利纯牛奶奶 放冰箱', lex(['伊利纯牛奶'])).text,
  '伊利纯牛奶奶 放冰箱'
);

// 10. 3 字词反复存过（count>=2）才允许纠
var repeated = L.buildLexicon([
  { name: '布洛芬', location: '' },
  { name: '布洛芬', location: '' }
]);
check(
  '3 字词出现两次才纠',
  L.correct('布洛分 放药箱', repeated).text,
  '布洛芬 放药箱'
);
check(
  '3 字词只出现一次不纠',
  L.correct('布洛分 放药箱', lex(['布洛芬'])).text,
  '布洛分 放药箱'
);

// 11. remember 增量入词库
var lx2 = lex(['可口可乐']);
L.remember(lx2, '无糖可乐饮料', '冰箱下层');
var hasName = lx2.names.some(function (e) { return e.word === '无糖可乐饮料'; });
var hasLoc = lx2.locations.some(function (e) { return e.word === '冰箱下层'; });
check('remember 收录名称', hasName, true);
check('remember 收录位置', hasLoc, true);


// 12. 位置词四路来源（RM-05 / AGENTS.md §21.7）
// 以前词库只统计 item 文本，于是「归位认容器名、解析不认容器名」——
// 用户新建的「阳台柜」在墙上是真的，语音却永远解析不出来。
var containers = [
  { id: 'c_1', name: '阳台柜', keys: ['阳台柜', '杂物柜'], room_id: 'balcony' },
  { id: 'c_2', name: '衣柜', keys: ['衣柜'], room_id: 'bedroom' },
  { id: 'c_3', name: '衣柜', keys: [], room_id: 'study' }
];
var rooms = [
  { id: 'balcony', name: '阳台' },
  { id: 'bedroom', name: '卧室' },
  { id: 'study', name: '书房' }
];
var struct = L.buildLexicon([{ name: '布洛芬', location: '药箱上层' }], containers, rooms);

function words(list) {
  return list.map(function (e) { return e.word; });
}
var locWords = words(struct.locations);
var parseWords = words(struct.parseLocations);

check('容器名进纠错词表', locWords.indexOf('阳台柜') !== -1, true);
check('容器 keys 进纠错词表', locWords.indexOf('杂物柜') !== -1, true);
check('房间+容器拼接进纠错词表', locWords.indexOf('卧室衣柜') !== -1, true);
check('房间名只进解析词表', parseWords.indexOf('厨房') === -1 && parseWords.indexOf('卧室') !== -1, true);
check('房间名不进纠错词表', locWords.indexOf('卧室'), -1);
check('2 字容器名只在解析词表', parseWords.indexOf('衣柜') !== -1 && locWords.indexOf('衣柜'), -1);

// 容器名已含房间名时不再拼（否则长出「阳台阳台柜」）
check('不拼重复房间名', locWords.indexOf('阳台阳台柜'), -1);

// 3. 硬上限 200：结构词权重更高，截断时先丢冷门历史词
var manyItems = [];
for (var q = 0; q < 400; q++) {
  manyItems.push({ name: '物品' + q, location: '历史位置' + q });
}
var big = L.buildLexicon(manyItems, containers, rooms);
check('解析词表上限 200', big.parseLocations.length, L.MAX_PARSE_WORDS);
check('截断后结构词还在', words(big.parseLocations).indexOf('卧室衣柜') !== -1, true);

// 4. remember 容器感知：位置命中已有词组时只涨次数、不新增一条
var beforeList = struct.parseLocations.filter(function (e) { return e.word === '卧室衣柜'; });
check('拼接词初始只有一条', beforeList.length, 1);
// before 里拿到的是**同一个对象引用**，remember 会原地改 count，所以先把数字记住
var beforeCount = beforeList[0].count;
L.remember(struct, '毛衣', '卧室衣柜');
var after = struct.parseLocations.filter(function (e) { return e.word === '卧室衣柜'; });
check('remember 不重复新增', after.length, 1);
check('remember 次数 +1', after[0].count, beforeCount + 1);

// 5. 纠错真的能用上容器词：只差一个字且首字相同（「柜」→「桂」）
check(
  '容器词参与纠错',
  L.correct('阳台桂 两盒药', struct).text,
  '阳台柜 两盒药'
);
// 首字不同（杨 / 阳）仍然不纠 —— 这是 correct() 最重要的一道安全阀，
// 宁可漏纠也不能把「牛奶」改成「牛肉」。词典扩充只解决「首字相同差一字」
check(
  '首字不同不纠（安全阀保留）',
  L.correct('杨台柜 两盒药', struct).text,
  '杨台柜 两盒药'
);

// 6. 缓存 key 升到 v2（结构变了，旧缓存不能混用）
check('缓存 key', L.STORAGE_KEY, 'storage_lexicon_v2');

console.log(failures === 0 ? '\n全部通过' : '\n失败 ' + failures + ' 项');
process.exit(failures === 0 ? 0 : 1);
