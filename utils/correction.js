/**
 * 随机打卡的纯逻辑（§19）
 *
 * 这里只放**能单测的换算与文案**，发请求在 `utils/api.js`、交互在页面里。
 *
 * ## 唯一的坑：周一 = 0
 *
 * 后端 `datetime.weekday()` 是 0 = 周一，前端 JS `getDay()` 是 0 = 周日。
 * 两边混用会让「自定义选周三」变成「选周二」，而且极难发现。所以换算只在
 * `fromJsDay()` / `toJsDay()` 这两个函数里做，页面里一律用**周一 = 0**。
 */

/** 新建矫正项的预设（内置建议库按 topic 关联，见后端 BUILTIN_SUGGESTIONS） */
var PRESETS = [
  { key: 'legs', name: '翘二郎腿', icon: '🦵', topic: 'legs', desc: '腿一放松就翘上去' },
  { key: 'posture', name: '驼背', icon: '🧍', topic: 'posture', desc: '坐着坐着就塌下去' },
  { key: 'sitting', name: '久坐不起', icon: '🪑', topic: 'sitting', desc: '一坐两小时不动' },
  { key: 'nail', name: '咬指甲', icon: '💅', topic: 'nail', desc: '一紧张就上手' },
  { key: 'phone', name: '睡前刷手机', icon: '📱', topic: 'phone', desc: '躺下了还划屏幕' },
  { key: 'custom', name: '自定义', icon: '🙅', topic: '', desc: '自己起个名字' }
];

/** 图标候选。数量克制，够区分就行 */
var ICONS = ['🙅', '🦵', '🧍', '🪑', '💅', '📱', '🍬', '☕', '😤', '🕐'];

/** 周一 = 0 的中文短名 */
var WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/** JS `getDay()`（0 = 周日）→ 项目口径（0 = 周一） */
function fromJsDay(jsDay) {
  return (Number(jsDay) + 6) % 7;
}

/** 项目口径（0 = 周一）→ JS `getDay()` */
function toJsDay(monDay) {
  return (Number(monDay) + 1) % 7;
}

/**
 * 勾选的星期 → 「一、三、五」
 * @param {number[]} days 0 = 周一
 */
function daysText(days) {
  var list = (days || []).slice().sort(function (a, b) { return a - b; });
  if (!list.length) return '未选';
  if (list.length === 7) return '每天';
  if (list.join(',') === '0,1,2,3,4') return '工作日';
  return list.map(function (day) { return WEEK_LABELS[day] || '?'; }).join('、');
}

/**
 * 重复规则的一句话描述：`工作日 09:00–18:00`
 */
function scheduleText(row) {
  if (!row) return '';
  var mode = row.scheduleMode || row.schedule_mode || 'weekdays';
  var head = mode === 'daily'
    ? '每天'
    : mode === 'weekdays'
      ? '工作日'
      : daysText(row.activeDays || row.active_days);
  var start = row.windowStart || row.window_start || '';
  var end = row.windowEnd || row.window_end || '';
  return head + ' ' + start + '–' + end;
}

/** 无犯率 → 「75%」。分母是 0 时返回「—」，不要假装 0% */
function rateText(rate, total) {
  if (total !== undefined && total <= 0) return '—';
  var value = Number(rate) || 0;
  return Math.round(value * 100) + '%';
}

/** 今日进度：`2/3`。计划为 0（今天不抽查）时返回「今天不抽查」 */
function todayText(today) {
  if (!today || !today.planned) return '今天不抽查';
  return '今天 ' + today.answered + '/' + today.planned;
}

/** 时段分布里的小时 → 「14 点」 */
function hourText(hour) {
  return String(hour).replace(/^0/, '') + ' 点';
}

/** 三态的中文与配色（页面与组件共用一份，别各写一套） */
var ANSWERS = {
  doing: { label: '正在', tone: 'warn' },
  clean: { label: '没有', tone: 'ok' },
  skipped: { label: '跳过', tone: 'mute' }
};

/** 编辑表单的初始值；新建时传空 */
function formOf(row) {
  if (!row) {
    return {
      name: '',
      icon: '🙅',
      topic: '',
      scheduleMode: 'weekdays',
      activeDays: [0, 1, 2, 3, 4],
      windowStart: '09:00',
      windowEnd: '18:00',
      checksPerDay: 3
    };
  }
  return {
    name: row.name,
    icon: row.icon,
    topic: row.topic || '',
    scheduleMode: row.scheduleMode,
    activeDays: (row.activeDays || []).slice(),
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    checksPerDay: row.checksPerDay
  };
}

function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

/** 当前时间 `HH:mm`，新建表单的默认时段用它往后推 */
function nowHm() {
  var now = new Date();
  return pad2(now.getHours()) + ':' + pad2(now.getMinutes());
}

module.exports = {
  PRESETS: PRESETS,
  ICONS: ICONS,
  WEEK_LABELS: WEEK_LABELS,
  ANSWERS: ANSWERS,
  fromJsDay: fromJsDay,
  toJsDay: toJsDay,
  daysText: daysText,
  scheduleText: scheduleText,
  rateText: rateText,
  todayText: todayText,
  hourText: hourText,
  formOf: formOf,
  nowHm: nowHm
};
