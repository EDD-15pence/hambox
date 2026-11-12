/**
 * entry-text 单测（node 直接跑：node utils/entry-text.test.js）
 *
 * 这层拆分是「录入快不快」的关键：拆错一次，用户下次就不想用一句话录入了。
 */

var assert = require('assert');
var entryText = require('./entry-text');

var cases = [];

function test(name, fn) {
  cases.push({ name: name, fn: fn });
}

test('剥掉日期前缀，标题是菜名', function () {
  var r = entryText.split('10.29 肉肉大米（虽然很饱 但是都是米饭）');
  assert.strictEqual(r.title, '肉肉大米');
  assert.strictEqual(r.comment, '虽然很饱 但是都是米饭');
  assert.strictEqual(r.content, '');
});

test('没有日期前缀也能拆', function () {
  var r = entryText.split('寿司郎（还不错 但是不会想吃第二次）');
  assert.strictEqual(r.title, '寿司郎');
  assert.strictEqual(r.comment, '还不错 但是不会想吃第二次');
});

test('没有括号：整段当标题', function () {
  var r = entryText.split('去看了场电影');
  assert.strictEqual(r.title, '去看了场电影');
  assert.strictEqual(r.comment, '');
});

test('英文半角括号也认', function () {
  var r = entryText.split('拉面(太咸了)');
  assert.strictEqual(r.title, '拉面');
  assert.strictEqual(r.comment, '太咸了');
});

test('括号后的内容进正文', function () {
  var r = entryText.split('火锅（好吃）下次带爸妈去');
  assert.strictEqual(r.title, '火锅');
  assert.strictEqual(r.comment, '好吃');
  assert.strictEqual(r.content, '下次带爸妈去');
});

test('整行只有括号内容：当标题', function () {
  var r = entryText.split('（好吃）');
  assert.strictEqual(r.title, '好吃');
  assert.strictEqual(r.comment, '');
});

test('空输入返回 null', function () {
  assert.strictEqual(entryText.split(''), null);
  assert.strictEqual(entryText.split('   '), null);
  assert.strictEqual(entryText.split('10.29 '), null);
});

test('「3.5 折的啤酒」不会被当成日期剥掉', function () {
  var r = entryText.split('3.5 折的啤酒（划算）');
  assert.strictEqual(r.title, '3.5 折的啤酒');
  assert.strictEqual(r.comment, '划算');
});

test('「10月29日」中文日期前缀也剥', function () {
  var r = entryText.split('10月29日 烤肉（撑）');
  assert.strictEqual(r.title, '烤肉');
});

test('join 拼回一行', function () {
  assert.strictEqual(entryText.join({ title: '火锅', comment: '好吃' }), '火锅（好吃）');
  assert.strictEqual(entryText.join({ title: '火锅', comment: '' }), '火锅');
});

var passed = 0;
cases.forEach(function (item) {
  try {
    item.fn();
    passed += 1;
  } catch (err) {
    console.error('FAIL: ' + item.name);
    console.error('  ' + err.message);
    process.exitCode = 1;
  }
});

console.log(passed + '/' + cases.length + ' 项通过');
