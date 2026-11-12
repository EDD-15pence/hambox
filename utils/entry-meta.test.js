/**
 * entry-meta 单测（node 直接跑：node utils/entry-meta.test.js）
 *
 * 这层只干两件事：JSON 文本 ↔ 键值行。出错的话表现是「编辑一条作品，
 * 字段全没了」或者「存进去一段坏 JSON」，都在用户侧很难解释。
 */

var assert = require('assert');
var entryMeta = require('./entry-meta');

var cases = [];

function test(name, fn) {
  cases.push({ name: name, fn: fn });
}

test('空输入给空数组', function () {
  assert.deepStrictEqual(entryMeta.parse(''), []);
  assert.deepStrictEqual(entryMeta.parse(null), []);
});

test('坏 JSON 不抛错，给空数组', function () {
  assert.deepStrictEqual(entryMeta.parse('{坏'), []);
});

test('数组原样解析', function () {
  var rows = entryMeta.parse('[{"k": "平台", "v": "B站"}, {"k": "用时", "v": "6h"}]');
  assert.deepStrictEqual(rows, [
    { k: '平台', v: 'B站' },
    { k: '用时', v: '6h' }
  ]);
});

test('对象写法也能解析（兼容）', function () {
  assert.deepStrictEqual(entryMeta.parse('{"规格": "256G"}'), [{ k: '规格', v: '256G' }]);
});

test('没有字段名的行被丢掉', function () {
  var rows = entryMeta.parse('[{"k": "", "v": "无主"}, {"k": "平台", "v": "B站"}]');
  assert.deepStrictEqual(rows, [{ k: '平台', v: 'B站' }]);
});

test('值可以缺省成空串', function () {
  assert.deepStrictEqual(entryMeta.parse('[{"k": "平台"}]'), [{ k: '平台', v: '' }]);
});

test('序列化会 trim 并丢掉空字段名', function () {
  var text = entryMeta.serialize([
    { k: ' 平台 ', v: ' B站 ' },
    { k: '  ', v: '没名字' }
  ]);
  assert.strictEqual(text, '[{"k":"平台","v":"B站"}]');
});

test('全空序列化成空串（不存 []）', function () {
  assert.strictEqual(entryMeta.serialize([]), '');
  assert.strictEqual(entryMeta.serialize([{ k: '', v: '' }]), '');
});

test('解析再序列化能往返', function () {
  var text = '[{"k":"平台","v":"B站"},{"k":"评分","v":"5"}]';
  assert.strictEqual(entryMeta.serialize(entryMeta.parse(text)), text);
});

var failed = 0;
cases.forEach(function (item) {
  try {
    item.fn();
    console.log('  ok  ' + item.name);
  } catch (err) {
    failed += 1;
    console.error('  FAIL ' + item.name + '\n       ' + err.message);
  }
});

console.log('\n' + (cases.length - failed) + '/' + cases.length + ' passed');
if (failed) process.exit(1);
