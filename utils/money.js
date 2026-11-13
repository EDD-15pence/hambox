/**
 * 钱：元 ↔ 分（§17 / SH-01 的配套）。
 *
 * 后端全程用**分**（整数）存，理由写在 `storage-server/app/models/shop.py`：
 * SQLite 的 REAL 累加会漂，一块钱的毛利算成 0.9999999 时日报就废了。
 * 所以这一层是前端唯一允许出现「元」的地方，也只负责两件事：
 *   1. 输入框里的字符串 → 分（`toFen`）
 *   2. 分 → 给人看的字符串（`text` / `money`）
 *
 * 别在页面里写 `fen / 100`：除出来的是浮点数，四舍五入几次就多一位小数。
 */

/** 把任何输入压成一个非负整数分。非法 / 空 → null（区别于 0 元） */
function toFen(input) {
  if (input === null || input === undefined) return null;
  var text = String(input).trim().replace(/[¥￥,\s]/g, '');
  if (!text) return null;
  // 只接受「整数或一位/两位小数」，避免把 12.345 静默截成 12.34
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  var value = Math.round(parseFloat(text) * 100);
  if (!isFinite(value) || value < 0) return null;
  return value;
}

/** 分 → 不带符号的元字符串：1250 → '12.5'，1200 → '12'，0 → '0' */
function text(fen) {
  var value = Number(fen);
  if (!isFinite(value)) return '0';
  var negative = value < 0;
  var abs = Math.abs(Math.round(value));
  var yuan = Math.floor(abs / 100);
  var cent = abs % 100;
  var body = String(yuan);
  if (cent) {
    body += '.' + (cent % 10 === 0 ? String(cent / 10) : (cent < 10 ? '0' : '') + cent);
  }
  return (negative ? '-' : '') + body;
}

/** 分 → '¥12.5' / '-¥3'（负号在货币符号前面，中文习惯） */
function money(fen) {
  var body = text(fen);
  return body.charAt(0) === '-' ? '-¥' + body.slice(1) : '¥' + body;
}

/** 分 → 只要两位小数的定宽串（日报大数字用，1220 → '12.20'） */
function fixed(fen) {
  var value = Number(fen);
  if (!isFinite(value)) return '0.00';
  return (Math.round(value) / 100).toFixed(2);
}

module.exports = {
  toFen: toFen,
  text: text,
  money: money,
  fixed: fixed
};
