/**
 * utils/hold.js 单测（§20 HOLD 下架）
 *
 * 只测常量语义：哪些 key 被下架、未下架的不能被误判。真机行为（卡片不出现、
 * 登录前那一帧不闪）靠 §8.13 的验收条目，脚本测不了观感。
 */

var hold = require('./hold');

var pass = 0;
var fail = 0;

function check(name, actual, expected) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
    console.log('  ok   ' + name);
  } else {
    fail += 1;
    console.log('  FAIL ' + name + '\n       期望 ' + e + '\n       实际 ' + a);
  }
}

// ---------- 四个已下架 ----------

check('亲属换算被 HOLD', hold.isHeld('relationship'), true);
check('Prompt 模板被 HOLD', hold.isHeld('prompt'), true);
check('机票比价被 HOLD', hold.isHeld('flight'), true);
check('一句话记录（quick）被 HOLD', hold.isHeld('quick'), true);

// ---------- 仍在用的不能被误伤 ----------

var alive = ['storage', 'record', 'shop', 'answer', 'punchin', 'correction'];
alive.forEach(function (key) {
  check(key + ' 未下架', hold.isHeld(key), false);
});

// ---------- 边界 ----------

check('空 key 不算 HOLD', hold.isHeld(''), false);
check('未知 key 不算 HOLD', hold.isHeld('nope'), false);
check('大写不匹配（key 区分大小写）', hold.isHeld('Quick'), false);
check('HOLD_KEYS 是数组', Array.isArray(hold.HOLD_KEYS), true);
check('HOLD_KEYS 无重复', hold.HOLD_KEYS.length, new Set(hold.HOLD_KEYS).size);

console.log('\n' + (fail === 0 ? '全部通过' : '有失败项') + '：' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
