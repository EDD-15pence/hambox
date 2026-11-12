/**
 * 记录录入的极简拆分（R-02）
 *
 * 用户习惯写成一行：
 *   `10.29 肉肉大米（虽然很饱 但是都是米饭）`
 *   `寿司郎（还不错 但是不会想吃第二次）`
 *
 * 拆成三块：括号前 = `title`，括号里 = `comment`，括号后 = `content`。
 * **刻意不写解析引擎**：没有品类、没有评分、没有正则规则库，也不复用
 * `quick-parse.js`（那是仓储专用的口语解析）。拆不出来就整段当标题，
 * 用户可以在详情里再改。
 *
 * 开头的日期（`10.29` / `10-29` / `10月29日`）会被剥掉：日历里已经选过日期，
 * 保留它只会让「10.29 肉肉大米」这样的标题看着像两天。
 */

/**
 * M.D / M-D / M月D日 后面至少跟一个空格才算日期前缀。
 *
 * 末尾那个负向前瞻是必须的：`3.5 折的啤酒` 和 `10.29 肉肉大米` 结构一样，
 * 只有靠「折/元/块/斤…」这些量词才能分辨出前者不是日期。宁可少剥一次
 * （标题里留个日期，用户自己删），也不要把菜名吃掉一半。
 */
var DATE_PREFIX = /^\d{1,2}\s*[.\-/月]\s*\d{1,2}\s*日?\s+(?![折扣元块斤个分秒])/;

/** 整行只有一个日期（`10.29 `）时，剥完就什么都不剩了 */
var DATE_ONLY = /^\d{1,2}\s*[.\-/月]\s*\d{1,2}\s*日?$/;

/**
 * @param {string} raw 用户输入的一整行
 * @returns {{title: string, comment: string, content: string}|null} 空输入返回 null
 */
function split(raw) {
  var text = String(raw == null ? '' : raw).trim();
  if (!text) return null;

  // 只打了个日期就提交：没有标题，别造一条空记录
  if (DATE_ONLY.test(text)) return null;

  text = text.replace(DATE_PREFIX, '').trim();
  if (!text) return null;

  // 第一对括号：中文全角或英文半角都认，括号内容可空
  var matched = text.match(/^([^（(]*)[（(]([^）)]*)[）)]\s*([\s\S]*)$/);
  if (matched) {
    var title = matched[1].trim();
    var comment = matched[2].trim();
    var rest = matched[3].trim();
    if (!title && !comment) return null;
    // 整行只有括号内容（如「（好吃）」）时，把它当标题，别留一条空标题
    if (!title) return { title: comment, comment: '', content: rest };
    return { title: title, comment: comment, content: rest };
  }

  return { title: text, comment: '', content: '' };
}

/** 反向：列表里想显示成一行时用，不参与存储 */
function join(entry) {
  var title = (entry && entry.title) || '';
  var comment = (entry && entry.comment) || '';
  return comment ? title + '（' + comment + '）' : title;
}

module.exports = {
  split: split,
  join: join
};
