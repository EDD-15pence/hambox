/**
 * 设计令牌自检（配合 A-07 / 1.3.10）
 *
 * 真机验收做不了「155 处色值替换有没有换错」，但这个脚本能抓住三类
 * **静默失效** —— 它们全都不报错，只会让某个元素在某个模式下忽然看不清：
 *
 * 1. `var(--x)` 引用了不存在的令牌。CSS 变量拼错不会报错，只会让这一条
 *    声明失效、颜色退回继承值。改了 155 处，这是最可能出问题的地方。
 * 2. 同一条规则里 `color` 与 `background` 的对比度不足。深色下「深字压深底」
 *    是纯视觉改动最容易踩的坑，而编译器完全看不出来。
 * 3. 页面 wxss 里还有硬编码 `#xxxxxx`。A-07 的目标是这种写法归零。
 *
 * 跑法：node scripts/check-tokens.js [--verbose]
 * 退出码：0 = 通过（可能有警告），1 = 有错误
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var VERBOSE = process.argv.indexOf('--verbose') !== -1;

// 材质类令牌（冰箱漆面 / 木纹 / 玻璃 / 状态点）自带深色配套，
// 按 BACKLOG 的约定不算硬编码色违规
var MATERIAL_PREFIXES = ['--mat-', '--cavity-', '--ln-', '--sh-', '--dot-'];

var errors = [];
var warnings = [];

function error(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

// ---------------------------------------------------------------- 文件遍历

function walk(dir, out) {
  out = out || [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'prototypes') return;
      walk(full, out);
    } else if (/\.wxss$/.test(entry.name)) {
      out.push(full);
    }
  });
  return out;
}

// ---------------------------------------------------------------- CSS 解析

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 极简规则拆分。项目里没有嵌套 @media（明令禁止 prefers-color-scheme），够用 */
function parseRules(css) {
  var rules = [];
  var re = /([^{}]+)\{([^{}]*)\}/g;
  var m;
  while ((m = re.exec(css))) {
    var selector = m[1].trim();
    if (!selector) continue;
    rules.push({ selector: selector, body: m[2], decls: parseDecls(m[2]) });
  }
  return rules;
}

function parseDecls(body) {
  var out = [];
  body.split(';').forEach(function (chunk) {
    var text = chunk.trim();
    if (!text) return;
    var idx = text.indexOf(':');
    if (idx <= 0) return;
    out.push({ prop: text.slice(0, idx).trim(), value: text.slice(idx + 1).trim() });
  });
  return out;
}

/** 收集所有 `--x: value` 定义，记录它出现在哪个文件、哪个选择器下 */
function collectTokens(files) {
  var tokens = {};
  files.forEach(function (file) {
    var rules = parseRules(stripComments(fs.readFileSync(file, 'utf8')));
    rules.forEach(function (rule) {
      rule.decls.forEach(function (d) {
        if (d.prop.indexOf('--') !== 0) return;
        var name = d.prop;
        // 先定义的赢：tokens.wxss 排在最前面（下面会排好序）
        if (!tokens[name]) {
          tokens[name] = { value: d.value, file: rel(file), selector: rule.selector };
        }
        // 但暗色覆盖要单独记下来，用于双套检查
        if (rule.selector.indexOf('.dark') !== -1) {
          tokens[name].dark = d.value;
        } else if (!tokens[name].light) {
          tokens[name].light = d.value;
        }
      });
    });
  });
  return tokens;
}

// ---------------------------------------------------------------- 颜色

function parseColor(text) {
  if (!text) return null;
  var value = text.trim().toLowerCase();

  var hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    var h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = h.split('').map(function (c) { return c + c; }).join('');
    }
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    };
  }

  var rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    var parts = rgb[1].split(',').map(function (s) { return s.trim(); });
    if (parts.length < 3) return null;
    return {
      r: parseFloat(parts[0]),
      g: parseFloat(parts[1]),
      b: parseFloat(parts[2]),
      a: parts.length > 3 ? parseFloat(parts[3]) : 1
    };
  }

  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  return null;
}

/** 把半透明前景叠到背景上，得到实际看到的颜色 */
function blend(fg, bg) {
  if (!fg) return null;
  if (!bg || fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1
  };
}

function channel(v) {
  var s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(c) {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

function contrast(a, b) {
  var l1 = luminance(a);
  var l2 = luminance(b);
  var hi = Math.max(l1, l2);
  var lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------- var() 展开

function resolveVars(value, tokens, mode, seen) {
  seen = seen || {};
  var depth = 0;
  var out = value;
  while (out.indexOf('var(') !== -1 && depth < 10) {
    out = out.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([^)]*))?\)/g, function (whole, name, fallback) {
      if (seen[name]) return fallback || whole;
      // 关键：按模式取值。只读 tokens[name].value 的话，深色算出来会等于亮色，
      // 那越检查越安心、其实什么都没验到。
      var resolved = tokenValue(tokens, name, mode);
      if (resolved === null) return fallback || whole;
      seen[name] = true;
      return resolved;
    });
    depth += 1;
  }
  return out;
}

/** 取一组令牌（亮或暗）在该属性上的最终颜色 */
function colorOf(value, tokens, mode) {
  if (!value) return null;
  var resolved = resolveVars(value, tokens, mode);
  if (resolved.indexOf('var(') !== -1) return null; // 还有没解开的，放弃
  var direct = parseColor(resolved);
  if (direct) return direct;
  return null;
}

/** 该令牌在指定模式下实际生效的值（暗色未覆盖时继承亮色） */
function tokenValue(tokens, name, mode) {
  var token = tokens[name];
  if (!token) return null;
  if (mode === 'dark' && token.dark) return token.dark;
  return token.light || token.value;
}

// ---------------------------------------------------------------- 主流程

var tokenFile = path.join(ROOT, 'styles', 'tokens.wxss');
var pageFiles = walk(path.join(ROOT, 'pages'));
var compFiles = walk(path.join(ROOT, 'components'));
var appWxss = path.join(ROOT, 'app.wxss');

var allFiles = (fs.existsSync(appWxss) ? [appWxss] : [])
  .concat(fs.existsSync(tokenFile) ? [tokenFile] : [])
  .concat(compFiles)
  .concat(pageFiles);

if (!fs.existsSync(tokenFile)) {
  console.error('找不到 styles/tokens.wxss');
  process.exit(1);
}

var tokens = collectTokens(allFiles);

// ---- 1. var() 引用是否存在 ----

var srcFiles = (fs.existsSync(appWxss) ? [appWxss] : []).concat(compFiles).concat(pageFiles);

srcFiles.forEach(function (file) {
  var css = stripComments(fs.readFileSync(file, 'utf8'));
  var re = /var\(\s*(--[a-zA-Z0-9-]+)/g;
  var m;
  var reported = {};
  while ((m = re.exec(css))) {
    var name = m[1];
    if (reported[name]) continue;
    if (tokens[name]) continue;
    reported[name] = true;
    // 变量可能定义在别的页面里，先只当警告：真正危险的是「全项目都没定义」
    var definedAnywhere = Object.prototype.hasOwnProperty.call(tokens, name);
    if (!definedAnywhere) {
      error(rel(file) + ' 引用了未定义的令牌 ' + name + '（该声明会静默失效）');
    }
  }
});

// ---- 2. 同规则内 color / background 对比度 ----

srcFiles.forEach(function (file) {
  var rules = parseRules(stripComments(fs.readFileSync(file, 'utf8')));
  rules.forEach(function (rule) {
    var colorDecl = rule.decls.filter(function (d) { return d.prop === 'color'; })[0];
    if (!colorDecl) return;
    var bgDecl = rule.decls.filter(function (d) {
      return d.prop === 'background' || d.prop === 'background-color';
    })[0];

    // 没写背景时，只有「压在色块上的字」不敢假设底色。
    //
    // `--on-primary` / `--text-invert` 是「压在有色块上」的语义，底色可能来自
    // 父级、也可能由 js 内联给出（品牌 logo、勾选圆圈）。硬套页面底色会算出
    // 「白字压浅灰 = 1.19:1」的假警报 —— 一个总报假警的检查没人看。
    //
    // 其余（正文色、品牌色当文字）默认压在页面底色上，这是新拟物的常态：
    // 元素与页面同色，文字不落在别的色块里。这一条必须查 —— 深色下
    // 「深蓝字压深灰底」正是最容易漏的地方。
    var onBlock = /var\(\s*(--on-primary|--text-invert)\s*\)/.test(colorDecl.value);
    if (!bgDecl && onBlock) return;

    ['light', 'dark'].forEach(function (mode) {
      var bg = bgDecl
        ? colorOf(bgDecl.value, tokens, mode)
        : colorOf('var(--bg-page)', tokens, mode);
      if (!bg) return;
      if (bg.a !== 1) return; // 背景本身半透明，算出来也不准

      var fgRaw = colorOf(colorDecl.value, tokens, mode);
      if (!fgRaw) return;
      var fg = blend(fgRaw, bg);
      if (!fg) return;

      var ratio = contrast(fg, bg);
      var tag = rel(file) + '  ' + rule.selector + '  [' + mode + ']';
      if (ratio < 3) {
        error('对比度 ' + ratio.toFixed(2) + ':1  ' + tag + '  color=' + colorDecl.value);
      } else if (ratio < 4.5) {
        warn('对比度 ' + ratio.toFixed(2) + ':1  ' + tag + '  color=' + colorDecl.value);
      }
    });
  });
});

// ---- 3. 硬编码色值 ----

pageFiles.concat(compFiles).forEach(function (file) {
  var css = stripComments(fs.readFileSync(file, 'utf8'));
  var rules = parseRules(css);
  rules.forEach(function (rule) {
    var isMaterial = rule.decls.some(function (d) {
      return MATERIAL_PREFIXES.some(function (p) { return d.prop.indexOf(p) === 0; });
    });
    rule.decls.forEach(function (d) {
      if (d.prop.indexOf('--') === 0) {
        // 材质令牌的取值本身是十六进制，属于例外
        if (isMaterial || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(d.value)) return;
      }
      if (d.prop.indexOf('--') === 0) return;
      if (/#[0-9a-fA-F]{3,8}\b/.test(d.value)) {
        error(rel(file) + '  ' + rule.selector + '  ' + d.prop + ': ' + d.value + '  （硬编码色值，应改用令牌）');
      }
    });
  });
});

// ---- 4. 暗色未覆盖的颜色令牌（信息性） ----

var colorTokenNames = Object.keys(tokens).filter(function (name) {
  if (MATERIAL_PREFIXES.some(function (p) { return name.indexOf(p) === 0; })) return false;
  if (/^--(sp|r|fs|dur|nav|hit|page)-?/.test(name)) return false;
  if (/^--(shadow|highlight|shade)/.test(name)) return false;
  var value = tokens[name].light || tokens[name].value;
  return !!parseColor(resolveVars(value, tokens));
});

var uncovered = colorTokenNames.filter(function (name) {
  return !tokens[name].dark;
});

if (VERBOSE) {
  console.log('令牌共 ' + Object.keys(tokens).length + ' 个，颜色类 ' + colorTokenNames.length + ' 个');
  console.log('暗色未单独覆盖（继承亮色值）：');
  uncovered.forEach(function (name) {
    console.log('  ' + name + ' = ' + (tokens[name].light || tokens[name].value));
  });
  console.log('');
}

// ---------------------------------------------------------------- 输出

var uniqErrors = errors.filter(function (v, i) { return errors.indexOf(v) === i; });
var uniqWarnings = warnings.filter(function (v, i) { return warnings.indexOf(v) === i; });

if (uniqWarnings.length) {
  console.log('\n警告（' + uniqWarnings.length + '）：对比度 3:1 ~ 4.5:1，小字需确认');
  uniqWarnings.forEach(function (w) { console.log('  ' + w); });
}

if (uniqErrors.length) {
  console.log('\n错误（' + uniqErrors.length + '）：');
  uniqErrors.forEach(function (e) { console.log('  ' + e); });
  console.log('\n检查未通过');
  process.exit(1);
}

console.log('\n通过：' + srcFiles.length + ' 个 wxss，令牌 ' + Object.keys(tokens).length +
  ' 个，无未定义引用、无硬编码色值、对比度无低于 3:1');
if (uncovered.length) {
  console.log('提示：' + uncovered.length + ' 个颜色令牌暗色下继承亮色值（加 --verbose 看清单）');
}
