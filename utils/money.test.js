/**
 * money 单测（node utils/money.test.js）
 *
 * 这层出错的后果都很具体：`12.5` 变 `12.05`、`12.50` 变 `1250 分` 的十倍偏差，
 * 或者负数毛利显示成 `¥-3`。所以边界值全部钉死。
 */

var assert = require('assert');
var money = require('./money');

var cases = [];

function test(name, fn) {
  cases.push({ name: name, fn: fn });
}

// ---------- 元 → 分 ----------

test('整数元', function () {
  assert.strictEqual(money.toFen('12'), 1200);
});

test('一位小数', function () {
  assert.strictEqual(money.toFen('12.5'), 1250);
});

test('两位小数', function () {
  assert.strictEqual(money.toFen('12.55'), 1255);
});

test('前导零与空格', function () {
  assert.strictEqual(money.toFen(' 0.05 '), 5);
});

test('带货币符号', function () {
  assert.strictEqual(money.toFen('¥18'), 1800);
});

test('空值给 null（不是 0，0 元是合法价格）', function () {
  assert.strictEqual(money.toFen(''), null);
  assert.strictEqual(money.toFen('   '), null);
  assert.strictEqual(money.toFen(null), null);
});

test('三位小数直接拒绝，不静默截断', function () {
  assert.strictEqual(money.toFen('12.345'), null);
});

test('负数与字母拒绝', function () {
  assert.strictEqual(money.toFen('-5'), null);
  assert.strictEqual(money.toFen('abc'), null);
  assert.strictEqual(money.toFen('1e3'), null);
});

test('浮点误差不残留', function () {
  // 0.1 + 0.2 那类问题：字符串转分必须走整数
  assert.strictEqual(money.toFen('0.29'), 29);
  assert.strictEqual(money.toFen('19.99'), 1999);
});

// ---------- 分 → 元 ----------

test('整数元不带小数点', function () {
  assert.strictEqual(money.text(1200), '12');
});

test('整十角只留一位', function () {
  assert.strictEqual(money.text(1250), '12.5');
});

test('个位分补零', function () {
  assert.strictEqual(money.text(1205), '12.05');
});

test('零', function () {
  assert.strictEqual(money.text(0), '0');
});

test('负数毛利', function () {
  assert.strictEqual(money.text(-350), '-3.5');
  assert.strictEqual(money.money(-350), '-¥3.5');
});

test('货币符号在前', function () {
  assert.strictEqual(money.money(1800), '¥18');
  assert.strictEqual(money.money(0), '¥0');
});

test('定宽两位', function () {
  assert.strictEqual(money.fixed(1200), '12.00');
  assert.strictEqual(money.fixed(5), '0.05');
});

test('脏数据不抛错', function () {
  assert.strictEqual(money.text(undefined), '0');
  assert.strictEqual(money.text('abc'), '0');
});

// ---------- 往返 ----------

test('元 → 分 → 元 回到原值', function () {
  ['0', '1', '12.5', '12.05', '199.99', '1000'].forEach(function (raw) {
    assert.strictEqual(money.text(money.toFen(raw)), raw);
  });
});

var failed = 0;
cases.forEach(function (item) {
  try {
    item.fn();
    console.log('  ok  ' + item.name);
  } catch (error) {
    failed += 1;
    console.error('  FAIL ' + item.name + '\n       ' + error.message);
  }
});

console.log('\n' + (cases.length - failed) + '/' + cases.length + ' 通过');
if (failed) process.exit(1);
