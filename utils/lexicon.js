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
 * 位置词的来源（RM-05 / AGENTS.md §21.7）：
 *   历史 item.location ∪ 容器名 ∪ 容器 keys ∪ 房间名 ∪「房间+容器」拼接词。
 * 在这之前词库只统计物品文本，于是出现了自相矛盾的现状 —— **归位认容器名、
 * 解析不认容器名**：用户新建的「阳台柜」在墙上是真实存在的，但语音说
 * 「阳台柜 两盒药」（没有「放」字）永远解析不出位置。
 *
 * 两套词表，别混：
 *   - `locations`（纠错用，长度 ≥ 3）：容器名、keys、拼接词都进，
 *     ASR 把「阳台柜」听成「杨台柜」时能纠回来；
 *   - `parseLocations`（解析用，长度 ≥ 2）：「厨房 / 卧室 / 书房」这类 2 字房间名
 *     **只进这一套**。`MIN_LEN` 不能降到 2（牛奶/牛肉、可乐/可口 会大面积误纠）。
 *
 * 纯函数 + Storage 缓存，不依赖页面。
 */
var api = require('./api');

// v2：词库结构变了（多了 parseLocations、locations 收了容器词）。
// 旧缓存直接不认，不做兼容 —— 结构不同的缓存混用只会更难查
var STORAGE_KEY = 'storage_lexicon_v2';
var TTL = 24 * 60 * 60 * 1000;
// 纠错词表门槛，**不许降**（降到 2 会让 2 字词大面积误纠，见文件头）
var MIN_LEN = 3;
// 解析词表门槛：房间名全是 2 字，只能靠这一套收
var PARSE_MIN_LEN = 2;
var MAX_LEN = 12;
// 解析词表硬上限（§21.7 坑 3）：20 个容器 × 3~5 个 keys + 房间拼接能到 200 词
var MAX_PARSE_WORDS = 200;
// 结构词（容器名 / keys / 房间拼接）的权重：比历史文本高，保证 200 上限截断时
// 先丢冷门历史词、而不是把刚建好的柜子名丢掉
var STRUCT_WEIGHT = 3;

var EMPTY_LEXICON = { names: [], locations: [], parseLocations: [], builtAt: 0 };

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

/**
 * 物品 + 容器 + 房间 → 词表。
 *
 * @param {Array} items      GET /api/items 的行（name / location）
 * @param {Array} containers GET /api/containers 的行（name / keys / room_id）
 * @param {Array} rooms      GET /api/rooms 的行（id / name）
 * @returns {{names:Array, locations:Array, parseLocations:Array, builtAt:number}}
 */
function buildLexicon(items, containers, rooms) {
  var nameMap = {};
  var locMap = {};
  var parseMap = {};

  function add(map, word, weight, minLen) {
    var w = String(word || '').trim();
    if (!w || w.length < minLen || w.length > MAX_LEN) return;
    map[w] = (map[w] || 0) + (weight || 1);
  }

  (items || []).forEach(function (it) {
    if (!it) return;
    add(nameMap, it.name, 1, MIN_LEN);
    add(locMap, it.location, 1, MIN_LEN);
    add(parseMap, it.location, 1, PARSE_MIN_LEN);
  });

  var roomById = {};
  (rooms || []).forEach(function (room) {
    if (!room || !room.id) return;
    roomById[room.id] = room;
    // 房间名只进解析词表：厨房 / 卧室 / 书房 全是 2 字
    add(parseMap, room.name, STRUCT_WEIGHT, PARSE_MIN_LEN);
  });

  (containers || []).forEach(function (row) {
    if (!row) return;
    var name = String(row.name || '').trim();
    add(locMap, name, STRUCT_WEIGHT, MIN_LEN);
    add(parseMap, name, STRUCT_WEIGHT, PARSE_MIN_LEN);
    (row.keys || []).forEach(function (k) {
      add(locMap, k, STRUCT_WEIGHT, MIN_LEN);
      add(parseMap, k, STRUCT_WEIGHT, PARSE_MIN_LEN);
    });
    // 「卧室衣柜」这种拼接词：两个房间各有一个「衣柜」时靠它区分（§21.7 坑 2）。
    // 容器名里已经带房间名的（阳台 + 阳台柜）不再拼，否则会长出「阳台阳台柜」
    var room = roomById[row.room_id];
    var roomName = room ? String(room.name || '').trim() : '';
    if (roomName && name && name.indexOf(roomName) === -1) {
      var joined = roomName + name;
      add(locMap, joined, STRUCT_WEIGHT, MIN_LEN);
      add(parseMap, joined, STRUCT_WEIGHT, PARSE_MIN_LEN);
    }
  });

  return {
    names: toList(nameMap),
    locations: toList(locMap),
    parseLocations: toList(parseMap).slice(0, MAX_PARSE_WORDS),
    builtAt: Date.now()
  };
}

/** { 词: 次数 } → [{ word, count }]，按次数降序 */
function toList(map) {
  return Object.keys(map)
    .map(function (w) { return { word: w, count: map[w] }; })
    .sort(function (a, b) { return b.count - a.count; });
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
 * 取词库：优先用缓存，过期后重新拉 items + containers + rooms。
 *
 * 三路并发（§21.7）。失败策略要分清楚：
 * - **items 拉不到**通常意味着后端整体不可达，此时**不要**用空数组重建，
 *   否则会把历史词库整个清掉、纠错能力一夜归零 → 退回旧缓存；
 * - containers / rooms 拉不到只是少几组结构词，用空数组降级即可。
 *
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<{names:Array, locations:Array, parseLocations:Array, builtAt:number}>}
 */
function load(opts) {
  var force = !!(opts && opts.force);
  var cached = readCache();
  var fresh = cached && (Date.now() - (cached.builtAt || 0) < TTL);

  if (cached && fresh && !force) {
    return Promise.resolve(cached);
  }

  return Promise.all([
    api.listItems().catch(function () { return null; }),
    api.listContainers().catch(function () { return []; }),
    api.listRooms().catch(function () { return []; })
  ])
    .then(function (res) {
      if (!res[0]) return cached || EMPTY_LEXICON;
      var lex = buildLexicon(res[0], res[1] || [], res[2] || []);
      writeCache(lex);
      return lex;
    })
    .catch(function () {
      return cached || EMPTY_LEXICON;
    });
}

/**
 * 把用户刚确认保存的名称/位置增量写进缓存，
 * 让它下一次录同一句话时就能被纠对，不用等 24 小时刷新。
 *
 * **容器感知**（§21.7）：位置正好等于某个已存在的容器词组时，这一组的次数 +1
 * 而不是新增一条 —— 下次排序它更靠前，200 词上限截断时不会被丢掉。
 */
function remember(lex, name, location) {
  if (!lex) return lex;
  if (!lex.parseLocations) lex.parseLocations = [];

  function bump(list, word, minLen) {
    var w = String(word || '').trim();
    if (!w || w.length < minLen || w.length > MAX_LEN) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i].word === w) {
        list[i].count += 1;
        return;
      }
    }
    list.push({ word: w, count: 1 });
  }

  bump(lex.names, name, MIN_LEN);
  bump(lex.locations, location, MIN_LEN);
  bump(lex.parseLocations, location, PARSE_MIN_LEN);

  lex.parseLocations.sort(function (a, b) { return b.count - a.count; });
  if (lex.parseLocations.length > MAX_PARSE_WORDS) {
    lex.parseLocations.length = MAX_PARSE_WORDS;
  }

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
  PARSE_MIN_LEN: PARSE_MIN_LEN,
  MAX_PARSE_WORDS: MAX_PARSE_WORDS,
  STORAGE_KEY: STORAGE_KEY
};
