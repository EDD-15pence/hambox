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

/** 带动态位置词表（RM-05）：模拟后端容器 / 房间结构 */
function parseWith(text, locations) {
  return P.parseQuickInput(text, { today: TODAY, locations: locations });
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

// 27. 真实翻车句复现：「年糕半袋，在冰箱冷藏7天，过期」
//     语音插件输出的是半角逗号，name 曾变成「年糕半袋 在」、location 变成「冰箱冷藏 ,过期」
r = parse('年糕半袋，在冰箱冷藏7天，过期');
check('半角逗号·名称', r.name, '年糕');
check('半角逗号·分类', r.categoryId, 'food');
check('半袋=0.5', r.quantity, 0.5);
check('半袋·单位', r.unit, '袋');
check('半角逗号·位置', r.location, '冰箱冷藏');

// 28. 「半」在任何单位前都是 0.5
r = parse('半瓶可乐放在了冷藏室');
check('半瓶·数量', r.quantity, 0.5);
check('放在了·位置不吃「了」', r.location, '冷藏室');

// 29. 位置只切自己那一段：「的」后面是物品名，不能被位置吞掉
r = parse('提醒我冰箱冷藏的牛奶快过期了');
check('定语位置·名称', r.name, '牛奶');
check('定语位置·位置', r.location, '冰箱冷藏');

// 30. 分类按名称判，位置里的「茶几」不能把薯片判成饮品
r = parse('三袋薯片 保质期半年 放在客厅茶几');
check('茶几不误判·分类', r.categoryId, 'food');
check('茶几·位置', r.location, '客厅茶几');


// ==============================
// 31. 动态位置词（RM-05 / AGENTS.md §21.7）
// ==============================
// 这组用例存在的理由：容器和房间都是用户自己建的，写死的 30 个静态词
// 永远认不出「阳台柜」「卧室衣柜」。以前只有说了「放」才解析得对，
// 现在没有「放」也要认出来。

var DYN = ['阳台柜', '卧室衣柜', '书房书柜', '储物间的纸箱', '厨房'];

// 位置在前、名称在后，且**没有「放」**——这是以前必然失败的那一类
r = parseWith('阳台柜 两盒药', DYN);
check('动态词·位置', r.location, '阳台柜');
check('动态词·名称不含位置', r.name, '药');  // 数量已单独抽进 quantity
check('动态词·不缺位置', r.missing.indexOf('location'), -1);

// 拼接词优先：两个房间都有「衣柜」时靠它区分
r = parseWith('卧室衣柜 三件毛衣 保质期一年', DYN);
check('拼接词·位置', r.location, '卧室衣柜');
check('拼接词·名称', r.name, '三件毛衣');

// 4 字容器名（比静态词长，合并扫描时最长优先）
r = parseWith('书房书柜 一套教材', DYN);
check('长容器名·位置', r.location, '书房书柜');
check('长容器名·名称', r.name, '一套教材');

// 静态兜底还在：没有动态词表时老行为不变（首次使用 / 后端不可达）
r = parse('三袋薯片 保质期半年 放在客厅茶几');
check('静态兜底·位置', r.location, '客厅茶几');

// 动态词表里有 2 字房间名：厨房不是「放」也能认
r = parseWith('厨房 两瓶酱油 保质期一年半', DYN);
check('房间名·位置', r.location, '厨房');
check('房间名·名称', r.name, '酱油');

// 有关键词时动态词表不参与：位置以「放」后面为准
r = parseWith('两盒感冒药 放阳台柜', DYN);
check('关键词优先·位置', r.location, '阳台柜');
check('关键词优先·名称', r.name, '感冒药');

// 位置在句尾、后面紧跟标点：整段都是位置
r = parseWith('两盒药 阳台柜', DYN);
check('句尾动态词·位置', r.location, '阳台柜');
check('句尾动态词·名称', r.name, '药');

// 单字容器名不许进词表：否则「药」「柜」会把任意文本切开
check('单字被过滤', P.locationWordsOf(['药', '柜', '阳台柜']), ['阳台柜']);

// lexicon 的 {word,count} 结构也收（调用方不用先 map）
check('对象结构也收', P.locationWordsOf([{ word: '卧室衣柜', count: 3 }]), ['卧室衣柜']);

// 定语结构仍然只切位置本身（老用例 29 的等价场景，动态词版本）
r = parseWith('提醒我卧室衣柜的毛衣快过期了', DYN);
check('动态定语·位置', r.location, '卧室衣柜');
check('动态定语·名称', r.name, '毛衣');

// ============================================================
// 批量：一句话说多件
// ============================================================

function batch(text, locations) {
  return P.parseQuickBatch(text, { today: TODAY, locations: locations || [] });
}

// 1. 共享尾部：两句都放冰箱冷藏
var b = batch('牛奶两瓶、鸡蛋一盒，都放冰箱冷藏');
check('批量·件数', b.count, 2);
check('批量·名称1', b.items[0].name, '牛奶');
check('批量·数量1', b.items[0].quantity, 2);
check('批量·名称2', b.items[1].name, '鸡蛋');
check('批量·共享位置1', b.items[0].location, '冰箱冷藏');
check('批量·共享位置2', b.items[1].location, '冰箱冷藏');

// 2. 各自带日期和位置（硬分隔「，」+ 位置）
b = batch('可乐 生产日期9月1日 保质期9个月 放厨房柜子，薯片三袋放客厅茶几');
check('批量·各自位置', b.count, 2);
check('批量·可乐位置', b.items[0].location, '厨房柜子');
check('批量·可乐过期日', b.items[0].expireDate, '2027-06-01');
check('批量·薯片名称', b.items[1].name, '薯片');
check('批量·薯片数量', b.items[1].quantity, 3);
check('批量·薯片位置', b.items[1].location, '客厅茶几');

// 3. 分号 + 「还有」开头，各自保质期
b = batch('今天买了两瓶牛奶，保质期7天，放冰箱；还有一盒鸡蛋，保质期30天，放冰箱');
check('批量·分号件数', b.count, 2);
check('批量·牛奶', b.items[0].name, '牛奶');
check('批量·牛奶过期', b.items[0].expireDate, '2026-11-05');
check('批量·鸡蛋', b.items[1].name, '鸡蛋');
check('批量·鸡蛋过期', b.items[1].expireDate, '2026-11-28');

// 4. 一键回归：只有一件时不许被拆
b = batch('可乐 生产日期9月1日 保质期9个月 放厨房柜子');
check('批量·单件件数', b.count, 1);
check('批量·单件名称', b.items[0].name, '可乐');
check('批量·单件位置', b.items[0].location, '厨房柜子');

// 5. 后一件没说位置 → 继承上一件
b = batch('牛奶两瓶放冰箱冷藏，鸡蛋一盒');
check('批量·继承件数', b.count, 2);
check('批量·继承位置', b.items[1].location, '冰箱冷藏');

// 6. 纯名称并列（后一件没有数量词）
b = batch('牛奶两瓶、鸡蛋');
check('批量·无数量件数', b.count, 2);
check('批量·无数量名称', b.items[1].name, '鸡蛋');

// 7. 动态词表：没有「放」也能按容器切开
b = batch('阳台柜 两盒药，厨房柜 三袋米', ['阳台柜', '厨房柜']);
check('批量·动态词件数', b.count, 2);
check('批量·动态词位置1', b.items[0].location, '阳台柜');
check('批量·动态词位置2', b.items[1].location, '厨房柜');

// 8. 一句话里只有一个物品、一段共享尾巴 —— 不许拆成两件
b = batch('牛奶两瓶 都放冰箱冷藏');
check('批量·共享不拆件', b.count, 1);
check('批量·共享不拆名称', b.items[0].name, '牛奶');
check('批量·共享不拆位置', b.items[0].location, '冰箱冷藏');

// 9. 「都是酸奶」里的「都」不是共享位置，别把名称切掉
b = batch('两瓶牛奶、一盒酸奶，都是冷藏的');
check('批量·都字不误拆', b.items[1].name, '酸奶');

// 10. 语音转写没标点，一句连说两件：按第 2 个量词切
b = batch('牛奶两瓶鸡蛋一盒都放冰箱冷藏');
check('无标点·件数', b.count, 2);
check('无标点·名称1', b.items[0].name, '牛奶');
check('无标点·名称2', b.items[1].name, '鸡蛋');
check('无标点·位置', b.items[1].location, '冰箱冷藏');

// 11. 数量在前的语序（两瓶牛奶 | 两盒鸡蛋），切点不能落到名称后面
b = batch('两瓶牛奶两盒鸡蛋');
check('数量前置·件数', b.count, 2);
check('数量前置·名称1', b.items[0].name, '牛奶');
check('数量前置·数量1', b.items[0].quantity, 2);
check('数量前置·名称2', b.items[1].name, '鸡蛋');
check('数量前置·单位2', b.items[1].unit, '盒');

// 12. 「位置+名称+数量」：位置到方位词为止，别把名称吃进位置
r = parse('冰箱里牛奶两瓶');
check('方位词·位置', r.location, '冰箱里');
check('方位词·名称', r.name, '牛奶');

// 13. 口头语单独成段时不许留空件
b = batch('帮我记一下：冰箱里牛奶两瓶、鸡蛋一盒');
check('口头语·件数', b.count, 2);
check('口头语·名称1', b.items[0].name, '牛奶');

// 14. 量词「把」
r = parse('香蕉一把 放餐桌');
check('把·数量', r.quantity, 1);
check('把·单位', r.unit, '把');
check('把·名称', r.name, '香蕉');

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' 项失败');
process.exit(failures === 0 ? 0 : 1);
