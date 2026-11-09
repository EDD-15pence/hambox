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

console.log(failures === 0 ? '\n全部通过' : '\n失败 ' + failures + ' 项');
process.exit(failures === 0 ? 0 : 1);
