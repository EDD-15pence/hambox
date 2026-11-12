/**
 * 时间文案：把后端返回的 ISO 时间（UTC）压成一眼能懂的短句。
 *
 * 后端存的是**不带时区的 UTC**（见 app/utils/timeutil.py），
 * `new Date('2026-11-12T04:31:37')` 会被 JS 当成当地时间解析，
 * 于是晚上提的反馈会显示成早上。所以这里强制补 Z 再转本地。
 */

/** 补时区后缀：已有 Z 或 +08:00 的原样返回 */
function toLocal(value) {
  if (!value) return null;
  var text = String(value);
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    text = text.replace(' ', 'T') + 'Z';
  }
  var date = new Date(text);
  return isNaN(date.getTime()) ? null : date;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** '2026-11-12 12:31' */
function full(value) {
  var date = toLocal(value);
  if (!date) return '';
  return (
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  );
}

/**
 * 相对说法：今天 / 昨天 / 今年省略年份。
 * 反馈列表按时间倒序看，绝大多数是「今天」「昨天」，写全日期反而难扫。
 */
function relative(value, base) {
  var date = toLocal(value);
  if (!date) return '';
  var now = base ? new Date(base) : new Date();
  var hm = pad(date.getHours()) + ':' + pad(date.getMinutes());

  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  var diffDays = Math.round((todayStart - dayStart) / 86400000);

  if (diffDays === 0) return '今天 ' + hm;
  if (diffDays === 1) return '昨天 ' + hm;
  if (date.getFullYear() === now.getFullYear()) {
    return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + hm;
  }
  return full(value);
}

module.exports = {
  toLocal: toLocal,
  full: full,
  relative: relative
};
