/**
 * 作品 / 物品条目的扩展字段（R-04）
 *
 * 存的是 `[{"k": "平台", "v": "B站"}]` 这种 JSON 文本。**不预设字段名**：
 * 「作品」可能是平台 / 用时 / 评分，「物品」可能是品牌 / 规格 / 价格，
 * 写死一套模板等于替用户决定他该记什么。所以做成可增删的键值行，
 * 两边都够用，也不用为了新类型再改代码。
 */

/**
 * JSON 文本 → 键值行数组。解析失败一律当空数组：
 * 一条记录的好坏不该被一段坏 meta 拖垮（后端已挡非法 JSON，
 * 这里是给「历史脏数据 / 手改过库」兜底）。
 * @param {string} text
 * @returns {Array<{k: string, v: string}>}
 */
function parse(text) {
  if (!text) return [];
  var raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(raw)) {
    // 兼容将来可能的对象写法：{"平台": "B站"}
    if (raw && typeof raw === 'object') {
      return Object.keys(raw).map(function (key) {
        return { k: key, v: String(raw[key] == null ? '' : raw[key]) };
      });
    }
    return [];
  }
  return raw
    .map(function (row) {
      if (!row || typeof row !== 'object') return null;
      var key = String(row.k == null ? '' : row.k).trim();
      var value = String(row.v == null ? '' : row.v).trim();
      return key ? { k: key, v: value } : null;
    })
    .filter(Boolean);
}

/**
 * 键值行 → JSON 文本。丢掉空字段名的行（用户点了「加一行」又没填），
 * 全空就返回空串 —— 后端把空串当「没有 meta」，而不是存一个 `[]`。
 * @param {Array<{k: string, v: string}>} rows
 * @returns {string}
 */
function serialize(rows) {
  var clean = (rows || [])
    .map(function (row) {
      var key = String((row && row.k) || '').trim();
      var value = String((row && row.v) || '').trim();
      return key ? { k: key, v: value } : null;
    })
    .filter(Boolean);
  return clean.length ? JSON.stringify(clean) : '';
}

module.exports = {
  parse: parse,
  serialize: serialize
};
