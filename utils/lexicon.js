/**
 * 历史词库 & 音近纠错
 *
 * 插件只保证「听成一句话」，不保证「听对字」：
 *   布洛芬 → 布洛分 / 伊利纯牛奶 → 伊利纯牛乃 / 生抽 → 生吃
 * 这类错字有一个共同点——只差一个字。所以不必上模型：
 * 拿用户自己存过的物品名、位置名当词库，做「编辑距离 ≤ 1」的近似匹配，
 * 命中且候选唯一就替换。用得越久，词库越贴合，纠错越准。
 *
 * 安全阀（防误伤，很重要）：
 *   1. 只纠长度 ≥ 3 的词。「牛奶/牛肉」「可乐/可口」都是差 1 字，
 *      2 字词纠错基本靠猜，宁可不纠。
 *   2. 必须首字相同。「头包」能纠成「头孢」，「猪肉干」不会被纠成「牛肉干」。
 *   3. 3 字词要求它在词库里出现过 ≥ 2 次。3 字只差 1 字太容易撞车
 *      （牛肉干 / 牛奶干），只有反复存过的词才算「确定存在」。
 *   4. 多个候选编辑距离相同时放弃，不能二选一时不猜。
 *   5. 原文已经精确命中的片段直接占用，不再参与纠错，也不会被删字。
 *
 * 纯函数 + Storage 缓存，不依赖页面。
 */
var api = require('./api');

var STORAGE_KEY = 'storage_lexicon_v1';
var TTL = 24 * 60 * 60 * 1000;
var MIN_LEN = 3;
var MAX_LEN = 12;

/** 编辑距离（只算 Levenshtein，词都很短，直接 DP） */
function editDistance(a, b) {
  var s = String(a || '');
  var t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  if (Math.abs(s.length - t.length) > 2) return 99;

  var prev = [];
  var cur = [];
  var i;
  var j;
  for (j = 0; j <= t.length; j++) prev[j] = j;

  for (i = 1; i <= s.length; i++) {
    cur[0] = i;
    for (j = 1; j <= t.length; j++) {
      var cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (j = 0; j <= t.length; j++) prev[j] = cur[j];
  }
  return prev[t.length];
}

/** items（name/location）→ 词表，按出现次数排序 */
function buildLexicon(items) {
  var nameMap = {};
  var locMap = {};

  function bump(map, word) {
    var w = String(word || '').trim();
    if (w.length < MIN_LEN || w.length > MAX_LEN) return;
    map[w] = (map[w] || 0) + 1;
  }

  (items || []).forEach(function (it) {
    bump(nameMap, it && it.name);
    bump(locMap, it && it.location);
  });

  function toList(map) {
    return Object.keys(map)
      .map(function (w) { return { word: w, count: map[w] }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  return {
    names: toList(nameMap),
    locations: toList(locMap),
    builtAt: Date.now()
  };
}

function readCache() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || null;
  } catch (e) {
    return null;
  }
}

function writeCache(lex) {
  try {
    wx.setStorageSync(STORAGE_KEY, lex);
  } catch (e) { /* 存不下就算了，不影响主流程 */ }
}

/**
 * 取词库：优先用缓存，过期后重新拉 items 统计。
 * 网络失败时退回旧缓存（哪怕是过期的），没有就返回空词库。
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<{names:Array, locations:Array, builtAt:number}>}
 */
function load(opts) {
  var force = !!(opts && opts.force);
  var cached = readCache();
  var fresh = cached && (Date.now() - (cached.builtAt || 0) < TTL);

  if (cached && fresh && !force) {
    return Promise.resolve(cached);
  }

  return api.listItems()
    .then(function (items) {
      var lex = buildLexicon(items);
      writeCache(lex);
      return lex;
    })
    .catch(function () {
      return cached || { names: [], locations: [], builtAt: 0 };
    });
}

/**
 * 把用户刚确认保存的名称/位置增量写进缓存，
 * 让它下一次录同一句话时就能被纠对，不用等 24 小时刷新。
 */
function remember(lex, name, location) {
  if (!lex) return lex;
  function add(list, word) {
    var w = String(word || '').trim();
    if (w.length < MIN_LEN || w.length > MAX_LEN) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i].word === w) {
        list[i].count += 1;
        return;
      }
    }
    list.push({ word: w, count: 1 });
  }
  add(lex.names, name);
  add(lex.locations, location);
  writeCache(lex);
  return lex;
}

/**
 * 纠正一句话里的错字
 * @param {string} text 识别出的原文
 * @param {{names?:Array, locations?:Array}} lexicon
 * @returns {{text: string, fixes: Array<{from:string,to:string}>}}
 */
function correct(text, lexicon) {
  var src = String(text || '');
  var lex = lexicon || {};
  var words = [];
  var seen = {};

  function collect(list) {
    (list || []).forEach(function (entry) {
      var w = entry && entry.word;
      if (!w || w.length < MIN_LEN || w.length > MAX_LEN) return;
      if (seen[w]) return;
      seen[w] = true;
      words.push({ word: w, count: entry.count || 1 });
    });
  }
  collect(lex.names);
  collect(lex.locations);

  if (!src || !words.length) return { text: src, fixes: [] };

  var occupied = [];
  var candidates = [];

  function isOccupied(start, end) {
    for (var i = 0; i < occupied.length; i++) {
      if (start < occupied[i].end && end > occupied[i].start) return true;
    }
    return false;
  }

  for (var i = 0; i < src.length; i++) {
    for (var k = 0; k < words.length; k++) {
      var w = words[k].word;
      // 3 字词只差 1 字太容易撞车（牛肉干 / 牛奶干），要求它反复出现过
      if (w.length === 3 && words[k].count < 2) continue;

      var minLen = Math.max(MIN_LEN, w.length - 1);
      var maxLen = w.length + 1;

      for (var len = minLen; len <= maxLen; len++) {
        var end = i + len;
        if (end > src.length) continue;
        var piece = src.slice(i, end);
        if (piece === w) {
          // 已经是对的，占住这段，后面别再改
          if (!isOccupied(i, end)) occupied.push({ start: i, end: end });
          continue;
        }
        // 首字不同直接放弃：这是最有效的降误伤手段
        if (piece.charAt(0) !== w.charAt(0)) continue;

        var d = editDistance(piece, w);
        if (d > 1) continue;
        candidates.push({ start: i, end: end, from: piece, to: w, d: d });
      }
    }
  }

  if (!candidates.length) return { text: src, fixes: [] };

  // 同一段被多个词命中：距离小的优先，距离相同取更长的；仍然持平就整段放弃
  candidates.sort(function (a, b) {
    if (a.d !== b.d) return a.d - b.d;
    return (b.end - b.start) - (a.end - a.start);
  });

  var chosen = [];
  candidates.forEach(function (c) {
    if (isOccupied(c.start, c.end)) return;
    var ambiguous = candidates.some(function (o) {
      return o !== c &&
        o.start === c.start && o.end === c.end &&
        o.d === c.d && o.to !== c.to;
    });
    if (ambiguous) return;
    occupied.push({ start: c.start, end: c.end });
    chosen.push(c);
  });

  if (!chosen.length) return { text: src, fixes: [] };

  chosen.sort(function (a, b) { return a.start - b.start; });

  var out = '';
  var cursor = 0;
  chosen.forEach(function (c) {
    out += src.slice(cursor, c.start) + c.to;
    cursor = c.end;
  });
  out += src.slice(cursor);

  return {
    text: out,
    fixes: chosen.map(function (c) { return { from: c.from, to: c.to }; })
  };
}

module.exports = {
  load: load,
  buildLexicon: buildLexicon,
  remember: remember,
  correct: correct,
  editDistance: editDistance,
  MIN_LEN: MIN_LEN,
  STORAGE_KEY: STORAGE_KEY
};
