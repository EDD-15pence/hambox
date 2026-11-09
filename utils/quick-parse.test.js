/**
 * 一句话解析器单测（纯 node，不需要微信环境）
 *
 * 跑法： node utils/quick-parse.test.js
 */

var P = require('./quick-parse');

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

var TODAY = '2026-10-29';

function parse(text) {
  return P.parseQuickInput(text, { today: TODAY });
}

// 1. 标准四要素
var r = parse('可乐 生产日期9月1日 保质期9个月 放厨房柜子');
check('名称', r.name, '可乐');
check('分类', r.categoryId, 'beverage');
check('单位默认按分类', r.unit, '瓶');
check('生产日期', r.produceDate, '2026-09-01');
check('保质期月数', r.shelfLifeMonths, 9);
check('过期日', r.expireDate, '2027-06-01');
check('位置', r.location, '厨房柜子');
check('无缺项', r.missing, []);

// 2. 口语 + 天数
r = parse('在超市买了一瓶牛奶 生产日期2026-10-20 保质期7天 放冰箱');
check('名称(去口语)', r.name, '牛奶');
check('数量', r.quantity, 1);
check('单位', r.unit, '瓶');
check('过期日=生产日+7天', r.expireDate, '2026-10-27');
check('位置', r.location, '冰箱');

// 3. 相对日期 + 位置词合并
r = parse('上午买的酸奶 昨天生产的 保质期21天 冰箱冷藏');
check('名称', r.name, '酸奶');
check('昨天', r.produceDate, '2026-10-28');
check('过期日', r.expireDate, '2026-11-18');
check('位置词合并', r.location, '冰箱冷藏');

// 4. 显式过期日
r = parse('维生素C 保质期到2027-03-01 放抽屉');
check('分类药品', r.categoryId, 'medicine');
check('显式过期日', r.expireDate, '2027-03-01');
check('没生产日期', r.produceDate, '');
check('位置', r.location, '抽屉');

// 5. 半年 + 中文数量
r = parse('三袋薯片 保质期半年 放在客厅茶几');
check('半年=6个月', r.shelfLifeMonths, 6);
check('数量3', r.quantity, 3);
check('单位袋', r.unit, '袋');
check('过期日', r.expireDate, '2027-04-29');
check('位置', r.location, '客厅茶几');

// 6. 一年半
r = parse('两瓶酱油 保质期一年半 放在橱柜');
check('一年半=18个月', r.shelfLifeMonths, 18);
check('数量2', r.quantity, 2);
check('分类调味品', r.categoryId, 'seasoning');
check('过期日', r.expireDate, '2028-04-29');

// 7. 今天 + 天数
r = parse('鸡蛋 今天 保质期30天 冰箱上层');
check('今天', r.produceDate, '2026-10-29');
check('过期日', r.expireDate, '2026-11-28');
check('位置', r.location, '冰箱上层');

// 8. 只有名字
r = parse('hello');
check('英文名', r.name, 'hello');
check('分类other', r.categoryId, 'other');
check('缺生产日期', r.missing.indexOf('produceDate') !== -1, true);
check('缺位置', r.missing.indexOf('location') !== -1, true);

// 9. 纯中文名
r = parse('牛奶');
check('名称', r.name, '牛奶');
check('分类', r.categoryId, 'beverage');

// 10. 数字数量
r = parse('12瓶矿泉水 保质期12个月 放阳台');
check('数量12', r.quantity, 12);
check('过期日', r.expireDate, '2027-10-29');

// 11. 斜杠日期
r = parse('面包 生产日期 2026/09/30 保质期5天 放餐桌');
check('斜杠日期', r.produceDate, '2026-09-30');
check('过期日', r.expireDate, '2026-10-05');

// 12. 有效期至 中文日期
r = parse('感冒药 有效期至12月31日 放药箱');
check('分类药品', r.categoryId, 'medicine');
check('中文月日', r.expireDate, '2026-12-31');
check('位置', r.location, '药箱');

// 13. 跨年：生产日期晚于今天 -> 去年
r = parse('火腿 生产日期12月20日 保质期6个月');
check('去年12月20', r.produceDate, '2025-12-20');
check('过期', r.expireDate, '2026-06-20');

// 14. 空输入
r = parse('   ');
check('空输入无名称', r.name, '');

// 15. 全角数字
r = parse('３瓶可乐 保质期６个月 放冰箱');
check('全角数量', r.quantity, 3);
check('全角月数', r.shelfLifeMonths, 6);

// 16. 周
r = parse('牛奶 保质期2周 放冰箱');
check('2周=14天', r.shelfLifeDays, 14);

// 17. 语音输入常见的全角逗号 + 年月日
r = parse('可乐，生产日期9月1日，保质期9个月，放厨房柜子');
check('全角逗号名称', r.name, '可乐');
check('全角逗号过期日', r.expireDate, '2027-06-01');

// 18. “2026年9月30日”不能被当成保质期
r = parse('面包 生产日期2026年9月30日 保质期5天 放餐桌');
check('年月日名称', r.name, '面包');
check('年月日生产日期', r.produceDate, '2026-09-30');
check('年月日保质期', r.shelfLifeDays, 5);
check('年月日过期日', r.expireDate, '2026-10-05');

// 19. 有效期至 年月日
r = parse('感冒药 有效期至2027年1月5日 放药箱');
check('年月日过期日', r.expireDate, '2027-01-05');

// 20. 月末收敛：1月31日 + 1个月 = 2月28日
check('月末收敛', P.addMonths('2026-01-31', 1), '2026-02-28');

// ============ 语音输入的语气词与残留（真实识别结果） ============

// 21. 句首语气词 + 口头禅
r = parse('嗯那个帮我记一下牛奶 保质期6个月 放冰箱');
check('语气词名称', r.name, '牛奶');
check('语气词数量', r.quantity, 1);
check('语气词位置', r.location, '冰箱');

// 22. "就过期了" 的"就"不能进名称
r = parse('呃这个布洛芬缓释胶囊 还有三个月就过期了 放药箱');
check('就过期名称', r.name, '布洛芬缓释胶囊');
check('就过期保质期', r.shelfLifeMonths, 3);

// 23. 模糊量词「几袋」「几个月」整体清掉
r = parse('记一下还有几袋薯片放零食柜');
check('几袋名称', r.name, '薯片');
check('几袋位置', r.location, '零食柜');

r = parse('牛奶还有几个月过期 放冰箱');
check('几个月名称', r.name, '牛奶');
check('几个月不产生保质期', r.shelfLifeMonths, null);

// 24. 「一瓶牛奶」丢了数字后不能剩「瓶牛奶」
r = parse('啊我买了瓶牛奶放冰箱冷藏');
check('孤立量词名称', r.name, '牛奶');

// 25. 安全阀：「额」只在句首删，「额温枪」不能被吃掉
r = parse('额温枪 放药箱');
check('额温枪不被误删', r.name, '额温枪');

// 26. 重复口头禅
r = parse('那个那个 就是 可乐 还有两个月过期');
check('重复口头禅名称', r.name, '可乐');
check('重复口头禅保质期', r.shelfLifeMonths, 2);

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' 项失败');
process.exit(failures === 0 ? 0 : 1);
