/**
 * 物品 emoji 映射单测（纯 node）
 *
 * 跑法： node utils/item-emoji.test.js
 */
var E = require('./item-emoji');

var failures = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log('PASS  ' + label);
  } else {
    failures++;
    console.log('FAIL  ' + label + '\n      期望 ' + expected + '\n      实际 ' + actual);
  }
}

// ---------- 认得出的 ----------
check('牛奶', E.emojiFor('牛奶'), '🥛');
check('可乐', E.emojiFor('可乐'), '🥤');
check('薯片', E.emojiFor('薯片'), '🍟');
check('年糕', E.emojiFor('年糕'), '🍡');
check('鸡蛋', E.emojiFor('鸡蛋'), '🥚');
check('布洛芬', E.emojiFor('布洛芬'), '💊');
check('抽纸', E.emojiFor('抽纸'), '🧻');
check('猫粮', E.emojiFor('猫粮'), '🐱');

// 长关键字优先：不能被更短的字抢先
check('蛋挞不被「蛋」抢', E.emojiFor('蛋挞'), '🥧');
check('牛奶巧克力不被「牛奶」抢', E.emojiFor('牛奶巧克力'), '🍫');
check('速冻水饺按饺子算', E.emojiFor('速冻水饺'), '🥟');
check('西红柿不被「柿」影响', E.emojiFor('西红柿'), '🍅');

// ---------- 调味品不能和洗护用品共用一个图标（B-11）---------- 
// 🧴 是 lotion bottle，真机上生抽显示成它会被当成洗洁精
check('生抽按调味算', E.emojiFor('生抽'), '🧂');
check('食用油按调味算', E.emojiFor('食用油'), '🧂');
check('蚝油按调味算', E.emojiFor('蚝油'), '🧂');
check('洗发水仍按洗护算', E.emojiFor('洗发水'), '🧴');
check('面霜仍按洗护算', E.emojiFor('面霜'), '🧴');

// ---------- 认不出的 ----------
check('没词表按分类兜底', E.emojiFor('张三送的礼盒', 'medicine'), '💊');
check('日用品兜底不是奶瓶', E.emojiFor('张三送的礼盒', 'daily'), '🧺');
check('调味分类兜底', E.emojiFor('张三送的礼盒', 'seasoning'), '🧂');
check('分类也没有就给箱子', E.emojiFor('张三送的礼盒'), '📦');
check('未知分类给箱子', E.emojiFor('张三送的礼盒', 'weird'), '📦');
check('空名称按分类兜底', E.emojiFor('', 'beverage'), '🥤');
check('null 名称不崩', E.emojiFor(null), '📦');

// 返回值必须是「一个字符」级别的非空串，否则页面上会露出半个 emoji
check('永远有值', typeof E.emojiFor('随便什么') === 'string' && E.emojiFor('随便什么').length > 0, true);

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' 项失败');
process.exit(failures === 0 ? 0 : 1);
