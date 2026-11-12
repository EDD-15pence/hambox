/**
 * image 单测（node 直接跑：node utils/image.test.js）
 *
 * 只测能脱离 wx 跑的部分：要不要压、压几档、体积文案。
 * 真正的压缩效果只能在真机上看（见 BACKLOG §8.5）。
 */

var assert = require('assert');
var image = require('./image');

var cases = [];

function test(name, fn) {
  cases.push({ name: name, fn: fn });
}

test('小于限制：不压', function () {
  assert.deepStrictEqual(image.planQualities(300 * 1024), []);
});

test('刚好等于限制：不压', function () {
  assert.deepStrictEqual(image.planQualities(500 * 1024), []);
});

test('超过限制：四档依次压', function () {
  assert.deepStrictEqual(image.planQualities(3 * 1024 * 1024), [80, 60, 40, 20]);
});

test('量不出体积（0）：不压，别卡住上传', function () {
  assert.deepStrictEqual(image.planQualities(0), []);
});

test('自定义限制生效', function () {
  assert.deepStrictEqual(image.planQualities(200 * 1024, 100 * 1024), [80, 60, 40, 20]);
  assert.deepStrictEqual(image.planQualities(80 * 1024, 100 * 1024), []);
});

test('体积文案：B / KB / MB 三档', function () {
  assert.strictEqual(image.readableSize(0), '');
  assert.strictEqual(image.readableSize(800), '800 B');
  assert.strictEqual(image.readableSize(472 * 1024), '472 KB');
  assert.strictEqual(image.readableSize(3 * 1024 * 1024), '3.0 MB');
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
