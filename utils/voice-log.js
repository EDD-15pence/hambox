/**
 * 语音识别日志 —— 只为事后排错，不参与业务逻辑
 *
 * 每条记下整条链路：插件原文 → 词库纠错后 → 解析出的字段 → 用户最终保存的字段。
 * 对比「解析」和「保存」的差异，就知道规则该往哪改：
 *   原文里有哪些语气词没洗掉、词库纠错改对了没有、名称是否带进了"过期"这类残留。
 *
 * 只存本地（Storage），最多 200 条，超出丢最旧的。不做上报，避免把家里物品名发到网上。
 */
var KEY = 'voice_log_v1';
var MAX = 200;

function list() {
  try {
    var arr = wx.getStorageSync(KEY);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function save(arr) {
  try {
    wx.setStorageSync(KEY, arr);
  } catch (e) { /* 存不下不影响记账 */ }
}

/**
 * @param {{raw:string, fixed:string, fixes:Array, parsed:Object, final:Object}} entry
 */
function append(entry) {
  var arr = list();
  var parsed = entry.parsed || {};
  var final = entry.final || {};

  // 只记录用户真的改过的字段，便于看出规则在哪一项上不准
  var changed = [];
  ['name', 'quantity', 'unit', 'location', 'expireDate'].forEach(function (k) {
    if (String(parsed[k] == null ? '' : parsed[k]) !== String(final[k] == null ? '' : final[k])) {
      changed.push(k);
    }
  });

  arr.unshift({
    t: Date.now(),
    raw: entry.raw || '',
    fixed: entry.fixed || '',
    fixes: (entry.fixes || []).map(function (f) { return f.from + '→' + f.to; }),
    parsed: parsed,
    final: final,
    changed: changed,
    saved: entry.saved !== false
  });

  if (arr.length > MAX) arr.length = MAX;
  save(arr);
  return arr.length;
}

function clear() {
  try {
    wx.removeStorageSync(KEY);
  } catch (e) { /* 忽略 */ }
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function timeText(ts) {
  var d = new Date(ts);
  return (d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
    pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function fieldText(o) {
  if (!o) return '';
  var parts = [];
  if (o.name) parts.push(o.name);
  if (o.quantity != null && o.quantity !== '') parts.push(o.quantity + (o.unit || ''));
  if (o.location) parts.push('放' + o.location);
  if (o.expireDate) parts.push('过期' + o.expireDate);
  if (o.category) parts.push(o.category);
  return parts.join(' / ');
}

/** 拼成可整段复制的纯文本，方便直接发出去分析 */
function exportText() {
  var arr = list();
  if (!arr.length) return '暂无识别记录';
  var lines = ['语音识别日志（共 ' + arr.length + ' 条，最新在上）', ''];
  arr.forEach(function (e, i) {
    lines.push('#' + (i + 1) + '  ' + timeText(e.t));
    lines.push('  原始：' + (e.raw || '（空）'));
    lines.push('  纠错：' + (e.fixed || '（空）') + (e.fixes && e.fixes.length ? '  [' + e.fixes.join('，') + ']' : ''));
    lines.push('  解析：' + (fieldText(e.parsed) || '（空）'));
    lines.push('  保存：' + (e.saved === false ? '（未保存，用户取消）' : (fieldText(e.final) || '（空）')));
    if (e.changed && e.changed.length) lines.push('  改动：' + e.changed.join('、'));
    lines.push('');
  });
  return lines.join('\n');
}

module.exports = {
  list: list,
  append: append,
  clear: clear,
  exportText: exportText,
  timeText: timeText,
  fieldText: fieldText,
  KEY: KEY,
  MAX: MAX
};
