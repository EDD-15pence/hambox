#!/usr/bin/env node
/**
 * 静态引用自检：所有相对 require、页面注册、自定义组件路径是否真的存在。
 *
 * 为什么需要它：小程序里 `require` 的路径写错一级，编译照样通过，**运行时
 * 直接白屏**，控制台只有一行 `module "xxx" is not defined`，真机上还看不到。
 * 2026-11-13 就是这么把 `pages/storage/*` 五个页面写成白屏的（少写一个 `../`）。
 *
 * 只查「指得到文件吗」，不做语义分析。退出码非 0 表示有问题。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'scripts', 'images', 'prototypes', 'docs']);

const errors = [];
const stats = { files: 0, requires: 0, components: 0, pages: 0 };

/** 递归收集 .js / .json 文件 */
function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (/\.(js|json)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** 相对引用能不能落到一个真实文件上（允许省略 .js / /index.js） */
function resolveRequire(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, base + '.js', path.join(base, 'index.js')];
  return candidates.some((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch (e) {
      return false;
    }
  });
}

/**
 * 把注释抹掉但**保留换行**，这样报错行号还对得上。
 * 不抹的话，文档里写「用法：require('../../utils/nav')」会被当成真引用误报
 * —— `utils/nav.js` 头部就正好有这么一段。
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|\n)([ \t]*)\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, ' '));
}

const files = walk(ROOT, []);
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));

// ---------- 1. 相对 require ----------
for (const file of files.filter((f) => f.endsWith('.js'))) {
  stats.files += 1;
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    stats.requires += 1;
    const spec = m[1];
    if (!resolveRequire(file, spec)) {
      const line = text.slice(0, m.index).split('\n').length;
      errors.push(`${path.relative(ROOT, file)}:${line} 引用不存在：require('${spec}')`);
    }
  }
}

// ---------- 2. app.json 里注册的页面 ----------
for (const page of appJson.pages || []) {
  stats.pages += 1;
  for (const ext of ['.js', '.wxml']) {
    const target = path.join(ROOT, page + ext);
    if (!fs.existsSync(target)) {
      errors.push(`app.json 注册了 ${page}，但缺 ${page}${ext}`);
    }
  }
}

// ---------- 3. 各页面 / 组件 json 里的 usingComponents ----------
for (const file of files.filter((f) => f.endsWith('.json'))) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`${path.relative(ROOT, file)} 不是合法 JSON：${e.message}`);
    continue;
  }
  const using = json.usingComponents || {};
  for (const [name, spec] of Object.entries(using)) {
    stats.components += 1;
    const base = spec.startsWith('/')
      ? path.join(ROOT, spec)
      : path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(base + '.js') && !fs.existsSync(base + '.wxml')) {
      errors.push(`${path.relative(ROOT, file)} 的组件 ${name} 指向不存在的路径：${spec}`);
    }
  }
}

if (errors.length) {
  console.log(`\n发现问题（${errors.length}）：`);
  for (const line of errors) console.log('  ' + line);
  console.log(
    `\n检查了 ${stats.files} 个 js、${stats.requires} 处 require、` +
      `${stats.pages} 个页面、${stats.components} 处组件引用`
  );
  process.exit(1);
}

console.log(
  `通过：${stats.files} 个 js，${stats.requires} 处 require、` +
    `${stats.pages} 个页面注册、${stats.components} 处组件引用全部指得到文件`
);
