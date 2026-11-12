/**
 * 时间文案单测（纯 node，不需要微信环境）
 *
 * 跑法： node utils/time-text.test.js
 *
 * 重点只有一条：后端存的是**不带时区的 UTC**，
 * 不能当成本地时间解析，否则晚上提的反馈会显示成早上。
 */

var T = require('./time-text');

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

// 服务端 UTC 04:31 = 北京时间 12:31
var base = new Date(2026, 10, 12, 12, 31, 0); // 2026-11-12 12:31 本地

check('UTC 补 Z 后按本地显示', T.full('2026-11-12T04:31:37'), '2026-11-12 12:31');
check('空格分隔的时间也认', T.full('2026-11-12 04:31:37'), '2026-11-12 12:31');
check('带 Z 的不重复加', T.full('2026-11-12T04:31:37Z'), '2026-11-12 12:31');
check('空值返回空串', T.full(''), '');
check('脏值返回空串', T.full('not-a-date'), '');

check('今天', T.relative('2026-11-12T02:05:00', base), '今天 10:05');
check('昨天', T.relative('2026-11-11T04:31:00', base), '昨天 12:31');
check('今年省略年份', T.relative('2026-11-03T04:31:00', base), '11-03 12:31');
check('跨年写全', T.relative('2025-12-31T04:31:00', base), '2025-12-31 12:31');

// 跨零点：UTC 的「前一天 16:00」其实是本地今天 00:00
check('跨零点是今天', T.relative('2026-11-11T16:00:00', base), '今天 00:00');

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' 项失败');
process.exit(failures === 0 ? 0 : 1);
