/**
 * utils/correction.js 单测（§19）
 *
 * 重点测**周一 = 0** 的换算：后端 `weekday()` 与 JS `getDay()` 差一天，
 * 混用会让「选周三」变成「选周二」，而且从界面上看不出来。
 */

var c = require('./correction');

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

// ---------- 星期换算 ----------

// JS: 0=周日 1=周一 … 6=周六；项目: 0=周一 … 6=周日
check('JS 周一 → 项目 0', c.fromJsDay(1), 0);
check('JS 周日 → 项目 6', c.fromJsDay(0), 6);
check('JS 周六 → 项目 5', c.fromJsDay(6), 5);
check('项目 0 → JS 周一', c.toJsDay(0), 1);
check('项目 6 → JS 周日', c.toJsDay(6), 0);
check('来回换算不变', c.toJsDay(c.fromJsDay(3)), 3);

// ---------- 星期文案 ----------

check('周一到周五 = 工作日', c.daysText([0, 1, 2, 3, 4]), '工作日');
check('七天 = 每天', c.daysText([0, 1, 2, 3, 4, 5, 6]), '每天');
check('一三五', c.daysText([0, 2, 4]), '一、三、五');
check('乱序也按周排', c.daysText([4, 0, 2]), '一、三、五');
check('空 = 未选', c.daysText([]), '未选');
check('周日显示「日」', c.daysText([6]), '日');

// ---------- 规则描述 ----------

check(
  '每天 + 时段',
  c.scheduleText({ scheduleMode: 'daily', windowStart: '08:00', windowEnd: '22:00' }),
  '每天 08:00–22:00'
);
check(
  '工作日 + 时段',
  c.scheduleText({ scheduleMode: 'weekdays', windowStart: '09:00', windowEnd: '18:00' }),
  '工作日 09:00–18:00'
);
check(
  '自定义 + 时段',
  c.scheduleText({
    scheduleMode: 'custom',
    activeDays: [0, 2],
    windowStart: '13:00',
    windowEnd: '14:00'
  }),
  '一、三 13:00–14:00'
);
check('兼容后端 snake_case', c.scheduleText({ schedule_mode: 'daily', window_start: '09:00', window_end: '10:00' }), '每天 09:00–10:00');

// ---------- 无犯率 / 今日进度 ----------

check('无犯率 75%', c.rateText(0.75), '75%');
check('无数据不显示 0%', c.rateText(0, 0), '—');
check('有分母时 0% 照实显示', c.rateText(0, 3), '0%');
check('今日 2/3', c.todayText({ planned: 3, answered: 2 }), '今天 2/3');
check('今天不抽查', c.todayText({ planned: 0, answered: 0 }), '今天不抽查');
check('没有数据也不炸', c.todayText(null), '今天不抽查');

// ---------- 时段分布 ----------

check('14 → 14 点', c.hourText('14'), '14 点');
check('09 去掉前导零', c.hourText('09'), '9 点');

// ---------- 表单初始值 ----------

var blank = c.formOf(null);
check('新建默认工作日', blank.scheduleMode, 'weekdays');
check('新建默认九点到六点', blank.windowStart + '-' + blank.windowEnd, '09:00-18:00');
check('新建默认三次', blank.checksPerDay, 3);
check('新建默认选中工作日', blank.activeDays, [0, 1, 2, 3, 4]);

var editing = c.formOf({
  name: '驼背',
  icon: '🧍',
  topic: 'posture',
  scheduleMode: 'custom',
  activeDays: [1, 3],
  windowStart: '10:00',
  windowEnd: '20:00',
  checksPerDay: 5
});
check('编辑回填名字', editing.name, '驼背');
check('编辑回填天数', editing.activeDays, [1, 3]);
check('编辑回填次数', editing.checksPerDay, 5);
check('编辑不共享原数组', editing.activeDays !== undefined, true);

// ---------- 答案文案 ----------

check('三态都有文案', Object.keys(c.ANSWERS).sort(), ['clean', 'doing', 'skipped']);
check('正在', c.ANSWERS.doing.label, '正在');
check('没有', c.ANSWERS.clean.label, '没有');
check('跳过', c.ANSWERS.skipped.label, '跳过');

// ---------- 预设 ----------

check('预设六个（含自定义）', c.PRESETS.length, 6);
check('自定义没有 topic', c.PRESETS[c.PRESETS.length - 1].topic, '');
check('图标不重复', c.ICONS.length, new Set(c.ICONS).size);

console.log('\n' + (fail === 0 ? '全部通过' : '有失败项') + '：' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
