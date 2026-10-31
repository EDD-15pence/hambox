/**
 * 一句话记录解析器
 *
 * 输入一句中文（或中英混排）口语，尽量猜出：
 *   名称 / 数量+单位 / 分类 / 生产日期 / 保质期 / 过期日期 / 存放位置
 *
 * 例：
 *   '可乐 生产日期9月1日 保质期9个月 放厨房柜子'
 *   '在超市买了一瓶牛奶 生产日期2026-10-20 保质期7天 放冰箱'
 *   '感冒药 有效期至12月31日 放药箱'
 *
 * 纯函数，不依赖 wx；日期一律用 YYYY-MM-DD 字符串，避免时区问题。
 */

var CATEGORY_NAMES = {
  food: '食品',
  beverage: '饮品',
  daily: '日用品',
  medicine: '药品',
  cosmetic: '化妆品',
  seasoning: '调味品',
  frozen: '冷冻食品',
  other: '其他'
};

/** 分类关键词（按顺序匹配，命中即返回；越具体的放越前） */
var CATEGORY_KEYWORDS = [
  ['frozen', ['冷冻', '速冻', '冰淇淋', '雪糕', '冰棍', '汤圆']],
  ['medicine', ['药', '维生素', '维c', '维C', '胶囊', '感冒', '退烧', '消炎', '创可贴', '膏药']],
  ['cosmetic', ['化妆', '口红', '面膜', '乳液', '面霜', '香水', '防晒', '粉底', '精华', '卸妆']],
  ['seasoning', ['酱油', '生抽', '老抽', '蚝油', '醋', '盐', '调料', '胡椒', '味精', '料酒', '豆瓣', '香油', '花椒', '八角']],
  ['daily', ['纸巾', '洗衣', '洗发', '沐浴', '牙膏', '牙刷', '垃圾袋', '洗洁精', '肥皂', '卫生纸', '湿巾', '洗手液', '沐浴露']],
  ['beverage', ['可乐', '牛奶', '酸奶', '矿泉水', '纯净水', '饮料', '果汁', '奶茶', '咖啡', '啤酒', '红酒', '白酒', '豆奶', '汽水', '苏打水', '气泡水', '茶']],
  ['food', ['薯片', '面包', '火腿', '鸡蛋', '饼干', '巧克力', '糖', '水果', '苹果', '香蕉', '泡面', '方便面', '零食', '肉', '米', '面']]
];

/** 无明确单位时按分类给个默认单位 */
var DEFAULT_UNIT_BY_CATEGORY = {
  beverage: '瓶',
  food: '袋',
  frozen: '袋',
  seasoning: '瓶',
  daily: '包',
  cosmetic: '瓶',
  medicine: '盒',
  other: ''
};

var UNITS = [
  '瓶', '袋', '盒', '包', '罐', '听', '个', '支', '条', '块', '桶', '提', '箱',
  '斤', '公斤', 'kg', 'KG', 'Kg', '克', 'g', '升', 'L', 'l', '毫升', 'ml', '片', '粒', '颗'
];

var LOCATION_WORDS = [
  '冰箱冷藏', '冰箱冷冻', '冷藏室', '冷冻室', '冰箱上层', '冰箱下层', '冰箱',
  '冰柜', '橱柜', '柜子', '储物柜', '药箱', '抽屉', '阳台', '茶几', '餐桌',
  '厨房', '客厅', '卧室', '书架', '鞋柜', '卫生间', '桌面', '桌上', '门后',
  '床头', '衣柜', '储物间', '收纳箱', '地下室', '办公室', '车里', '上层', '下层'
];

/** 全角数字/标点 → 半角，常见分隔符统一成空格 */
function normalize(text) {
  var s = String(text == null ? '' : text);
  s = s.replace(/[\uFF01-\uFF5E]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  });
  s = s.replace(/\u3000/g, ' ');
  s = s.replace(/[，、；;]/g, ' ');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

var CN_NUM = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };

/** '三' → 3，'十二' → 12，'3' → 3，失败返回 NaN */
function toNumber(raw) {
  if (raw == null) return NaN;
  var s = String(raw).replace(/\s/g, '');
  if (!s) return NaN;
  if (/^[0-9]+(\.[0-9]+)?$/.test(s)) return Number(s);
  if (/^[零〇一二两三四五六七八九十半]+$/.test(s)) {
    if (s === '半') return 0.5;
    var ten = s.indexOf('十');
    if (ten === -1) {
      var sum = 0;
      for (var i = 0; i < s.length; i++) sum = sum * 10 + CN_NUM[s.charAt(i)];
      return sum;
    }
    var left = ten === 0 ? 1 : CN_NUM[s.charAt(ten - 1)];
    var rightStr = s.slice(ten + 1);
    var right = 0;
    if (rightStr) right = CN_NUM[rightStr.charAt(rightStr.length - 1)];
    return left * 10 + right;
  }
  return NaN;
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function parseYmd(text) {
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(text || '').trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toDateString(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** 加 N 个月：目标月没有这一天时收敛到月末（1月31日 + 1 月 → 2月28/29日） */
function addMonths(dateText, months) {
  var base = parseYmd(dateText);
  if (!base) return '';
  var total = base.m - 1 + months;
  var y = base.y + Math.floor(total / 12);
  var m = (total % 12 + 12) % 12;
  var lastDay = new Date(y, m + 1, 0).getDate();
  var d = Math.min(base.d, lastDay);
  return y + '-' + pad2(m + 1) + '-' + pad2(d);
}

function addDays(dateText, days) {
  var base = parseYmd(dateText);
  if (!base) return '';
  var d = new Date(base.y, base.m - 1, base.d);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** 在 s 里按优先级找日期，返回 { index, y, m, d, hasYear, text } */
function findDate(s) {
  var text = String(s || '');
  var patterns = [
    [/(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/, true, 0],
    [/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/, true, 0],
    [/()((19|20)\d{2})(\d{2})(\d{2})(?!\d)/, true, 1],
    [/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/, false, 0]
  ];

  for (var i = 0; i < patterns.length; i++) {
    var m = patterns[i][0].exec(text);
    if (!m) continue;
    var hasYear = patterns[i][1];
    var y, mo, d;
    if (patterns[i][2] === 1) {
      y = Number(m[2]);
      mo = Number(m[3]);
      d = Number(m[4]);
    } else if (hasYear) {
      y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]);
    } else {
      y = 0; mo = Number(m[1]); d = Number(m[2]);
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    return { index: m.index, y: y, m: mo, d: d, hasYear: hasYear, text: m[0] };
  }
  return null;
}

/** 把解析出的年月日收敛成 YYYY-MM-DD；缺年份时猜年份（生产日期不能晚于今天，过期日可以） */
function resolveDate(info, todayText, allowFuture) {
  var t = parseYmd(todayText) || parseYmd(toDateString(new Date()));
  var y = info.hasYear ? info.y : t.y;
  var d = new Date(y, info.m - 1, info.d);
  if (!info.hasYear && !allowFuture) {
    var today = new Date(t.y, t.m - 1, t.d);
    if (d.getTime() > today.getTime()) {
      d = new Date(y - 1, info.m - 1, info.d);
    }
  }
  return toDateString(d);
}

/** 从 rest 里切掉 [start, start+len)，剩下的接起来 */
function cut(rest, start, len) {
  return (rest.slice(0, start) + ' ' + rest.slice(start + len)).replace(/\s+/g, ' ').trim();
}

/** 结尾（含“到/至”等）显式过期日：保质期到 2027-03-01 / 有效期至 12月31日 */
function extractExpireDate(rest, todayText) {
  var KW = /(保质期|保质|有效期|保鲜期|到期|过期|截止)\s*(?:到|至|是|为)?\s*/;
  var kw = KW.exec(rest);
  if (!kw) return { date: '', rest: rest };

  var start = kw.index + kw[0].length;
  var info = findDate(rest.slice(start));
  if (!info || info.index > 3) return { date: '', rest: rest };

  var consumed = kw[0].length + info.index + info.text.length;
  return {
    date: resolveDate(info, todayText, true),
    rest: cut(rest, kw.index, consumed)
  };
}

/** 保质期 N 个月 / 天 / 年（含“半年”“一年半”），会跳过日期里的“9月”“20日” */
function extractShelfLife(rest) {
  var re = /(保质期|保质|有效期|保鲜期|贮存期|存放期)?\s*([0-9]+(?:\.[0-9]+)?|[零〇一二两三四五六七八九十半]+)\s*(个月|个星期|月|天|日|周|星期|年)/g;
  var m;
  while ((m = re.exec(rest)) !== null) {
    var unit = m[3];
    var num = toNumber(m[2]);
    var prevChar = m.index > 0 ? rest.charAt(m.index - 1) : '';

    // 没有“保质期”这类关键词时，“N月”多半是日期（9月1日）
    if (isNaN(num) || (!m[1] && unit === '月')) {
      re.lastIndex = m.index + m[0].length;
      continue;
    }

    // “2026年9月30日”里的“2026年”不是保质期
    if (!m[1] && unit === '年' && num >= 100) {
      re.lastIndex = m.index + m[0].length;
      continue;
    }

    // “12月20日”“9月1日”里的“20日/1日”是日期的一部分
    if ((unit === '日' || unit === '天') && (prevChar === '月' || prevChar === '年')) {
      re.lastIndex = m.index + m[0].length;
      continue;
    }

    var end = m.index + m[0].length;
    var after = rest.slice(end);
    var months = null;
    var days = null;

    if (unit === '个月' || unit === '月') {
      months = num;
      if (after.charAt(0) === '半') { months += 0.5; end += 1; }
    } else if (unit === '年') {
      months = num * 12;
      if (after.charAt(0) === '半') { months += 6; end += 1; }
    } else if (unit === '周' || unit === '星期' || unit === '个星期') {
      days = num * 7;
    } else {
      days = num;
    }

    var text;
    if (months !== null) {
      if (months % 1 !== 0) {
        days = Math.round(months * 30);
        months = null;
        text = days + '天';
      } else {
        text = months + '个月';
      }
    } else {
      text = days + '天';
    }

    return {
      months: months,
      days: days,
      text: text,
      rest: cut(rest, m.index, end - m.index)
    };
  }

  return { months: null, days: null, text: '', rest: rest };
}

/** 生产日期：关键词 + 日期，或 今天/昨天/前天，或裸的“9月1日” */
function extractProduceDate(rest, todayText) {
  var KW = /(生产日期|生产日|生产|制造日期|制造|出厂日期|出厂|购买日期|购入)\s*(?:是|为)?\s*/;
  var kw = KW.exec(rest);
  if (kw) {
    var start = kw.index + kw[0].length;
    var info = findDate(rest.slice(start));
    if (info && info.index <= 2) {
      return {
        date: resolveDate(info, todayText, false),
        rest: cut(rest, kw.index, kw[0].length + info.index + info.text.length)
      };
    }
  }

  var rel = /(大前天|前天|今天|今日|昨天|昨日)/.exec(rest);
  if (rel) {
    var offset = { 大前天: 3, 前天: 2, 今天: 0, 今日: 0, 昨天: 1, 昨日: 1 }[rel[1]];
    return {
      date: addDays(todayText, -offset),
      rest: cut(rest, rel.index, rel[0].length)
    };
  }

  // 没关键词也允许“9月1日”这种带 日/号 的写法
  var md = findDate(rest);
  if (md && /[日号]/.test(md.text)) {
    return {
      date: resolveDate(md, todayText, false),
      rest: cut(rest, md.index, md.text.length)
    };
  }

  return { date: '', rest: rest };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 数量 + 单位；'12瓶'、'三袋'、'一瓶' 都能认 */
function extractQuantity(rest) {
  var unitAlt = UNITS.slice().sort(function (a, b) { return b.length - a.length; }).map(escapeRegExp).join('|');
  var re = new RegExp('([0-9]+(?:\\.[0-9]+)?|[零〇一二两三四五六七八九十]+)\\s*(' + unitAlt + ')', 'g');
  var m;
  while ((m = re.exec(rest)) !== null) {
    var num = toNumber(m[1]);
    var unit = m[2];
    if (isNaN(num)) {
      re.lastIndex = m.index + m[0].length;
      continue;
    }
    // “6个月”里的“个”不是单位
    if (unit === '个' && rest.charAt(m.index + m[0].length) === '月') {
      re.lastIndex = m.index + m[0].length;
      continue;
    }
    return {
      quantity: num,
      unit: unit,
      rest: cut(rest, m.index, m[0].length)
    };
  }
  return { quantity: null, unit: '', rest: rest };
}

/** 存放位置：'放/放在/存入' 之后的一段；没有关键词就扫位置词表 */
function extractLocation(rest) {
  var KW = /(放在|放到|放进|放入|存入|收纳在|收纳于|存放于|收在|置于|搁在|放|存)\s*/;
  var kw = KW.exec(rest);
  if (kw) {
    var tail = rest.slice(kw.index + kw[0].length).trim();
    tail = tail.replace(/[。！!，,.]$/, '').trim();
    if (tail) {
      return {
        location: tail,
        rest: cut(rest, kw.index, rest.length - kw.index).trim()
      };
    }
  }

  // 无关键词：找位置词，允许相邻词合并（冰箱 + 冷藏 → 冰箱冷藏）
  var ranges = [];
  for (var i = 0; i < LOCATION_WORDS.length; i++) {
    var w = LOCATION_WORDS[i];
    var idx = rest.indexOf(w);
    while (idx !== -1) {
      ranges.push({ start: idx, end: idx + w.length });
      idx = rest.indexOf(w, idx + 1);
    }
  }
  if (!ranges.length) return { location: '', rest: rest };

  ranges.sort(function (a, b) { return a.start - b.start; });
  var merged = [];
  for (var j = 0; j < ranges.length; j++) {
    var cur = ranges[j];
    var last = merged[merged.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ start: cur.start, end: cur.end });
    }
  }

  var span = merged[merged.length - 1];
  var tailText = rest.slice(span.start).replace(/[。！!，,.]$/, '').trim();
  if (!tailText) return { location: '', rest: rest };

  return {
    location: tailText,
    rest: cut(rest, span.start, rest.length - span.start).trim()
  };
}

/** 清掉口语、量词、残留关键词，得到干净的名称 */
function cleanupName(rest) {
  var s = String(rest || '');
  s = s.replace(/(在)?(超市|商场|商店|便利店|小卖部|网上|京东|淘宝|拼多多|药店)(里|买了|买的|买|购)?/g, ' ');
  s = s.replace(/(买了|买的|买|购入|采购|新买)/g, ' ');
  s = s.replace(/(生产日期|生产|制造日期|制造|出厂|购买日期|保质期|保质|有效期|保鲜期|贮存期|存放期|到期|过期|截止|放在|放到|放进|放入|存入|收纳在|存放于|收在|置于|搁在|放|存)/g, ' ');
  s = s.replace(/(上午|下午|早上|晚上|中午|夜里|昨天|今天|今日|昨日|前天|大前天|生产的)/g, ' ');
  s = s.replace(/[。！!，,.:：、;；"'“”]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[的了和与及我]\s*/, '');
  s = s.replace(/\s*[的了和与及]$/, '');
  return s.trim();
}

function guessCategory(text) {
  var s = String(text || '');
  for (var i = 0; i < CATEGORY_KEYWORDS.length; i++) {
    var id = CATEGORY_KEYWORDS[i][0];
    var words = CATEGORY_KEYWORDS[i][1];
    for (var j = 0; j < words.length; j++) {
      if (s.indexOf(words[j]) !== -1) return id;
    }
  }
  return 'other';
}

function todayOf(opts) {
  var raw = (opts && opts.today) || '';
  if (parseYmd(raw)) return raw;
  return toDateString(new Date());
}

/**
 * 解析一句话
 * @param {string} text
 * @param {{today?: string}} [opts]
 */
function parseQuickInput(text, opts) {
  var raw = normalize(text);
  var today = todayOf(opts);
  var rest = raw;

  var expire = extractExpireDate(rest, today);
  rest = expire.rest;

  var shelf = extractShelfLife(rest);
  rest = shelf.rest;

  var produce = extractProduceDate(rest, today);
  rest = produce.rest;

  var qty = extractQuantity(rest);
  rest = qty.rest;

  var loc = extractLocation(rest);
  rest = loc.rest;

  var name = cleanupName(rest);
  var categoryId = guessCategory(raw);
  var categoryName = CATEGORY_NAMES[categoryId] || CATEGORY_NAMES.other;

  var quantity = qty.quantity == null ? 1 : qty.quantity;
  var unit = qty.unit || DEFAULT_UNIT_BY_CATEGORY[categoryId] || '';

  var shelfLifeMonths = shelf.months;
  var shelfLifeDays = shelf.days;
  var shelfLifeText = shelf.text;

  var expireDate = expire.date;
  if (!expireDate && produce.date) {
    if (shelfLifeMonths) expireDate = addMonths(produce.date, shelfLifeMonths);
    else if (shelfLifeDays) expireDate = addDays(produce.date, shelfLifeDays);
  }
  if (!expireDate && (shelfLifeMonths || shelfLifeDays)) {
    if (shelfLifeMonths) expireDate = addMonths(today, shelfLifeMonths);
    else expireDate = addDays(today, shelfLifeDays);
  }

  var missing = [];
  if (!produce.date) missing.push('produceDate');
  if (!shelfLifeMonths && !shelfLifeDays) missing.push('shelfLife');
  if (!loc.location) missing.push('location');

  return {
    raw: raw,
    name: name,
    categoryId: categoryId,
    categoryName: categoryName,
    quantity: quantity,
    unit: unit,
    location: loc.location,
    produceDate: produce.date,
    shelfLifeMonths: shelfLifeMonths,
    shelfLifeDays: shelfLifeDays,
    shelfLifeText: shelfLifeText,
    expireDate: expireDate,
    missing: missing
  };
}

module.exports = {
  parseQuickInput: parseQuickInput,
  normalize: normalize,
  guessCategory: guessCategory,
  toNumber: toNumber,
  addMonths: addMonths,
  addDays: addDays,
  findDate: findDate,
  extractExpireDate: extractExpireDate,
  extractShelfLife: extractShelfLife,
  extractProduceDate: extractProduceDate,
  extractQuantity: extractQuantity,
  extractLocation: extractLocation,
  cleanupName: cleanupName,
  CATEGORY_KEYWORDS: CATEGORY_KEYWORDS,
  CATEGORY_NAMES: CATEGORY_NAMES,
  LOCATION_WORDS: LOCATION_WORDS
};
