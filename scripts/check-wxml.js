#!/usr/bin/env node
/**
 * WXML 静态自检：找出那些「编译只报 `错误 undefined (code 10)`、不给行号」的问题。
 *
 * 为什么需要它：2026-11-15 加整理页时，注释结尾把 `-->` 误打成了星号斜杠，
 * 开发者工具只回一句 `compile_start / 错误 undefined (code 10)`，
 * 没有文件名也没有行号。靠肉眼和一个文件一个文件地二分，花了十几分钟才定位。
 * 这类错误**全部是纯文本层面能查出来的**，那就让脚本查。
 *
 * 查四件事：
 *   1. 注释写错：wxml 里出现星号斜杠（应该是 `<!--` / `-->`）；
 *   2. 属性表达式里有裸 `<`：`wx:if="{{n < 3}}"` 会被当成标签起始，
 *      要改成 `!==` / `>` / 或写成 `&lt;`；
 *   3. 标签配对：常见容器标签的开闭数量（自闭合不算）；
 *   4. 空 wxml / 只有注释的 wxml（页面注册了但内容忘了写）。
 *
 * 退出码非 0 表示有问题。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'scripts', 'images', 'prototypes', 'docs']);

// 只查这些标签的配对：避免把 <image> 之类的自闭合规则搞复杂
const PAIRED_TAGS = ['view', 'block', 'text', 'button', 'scroll-view', 'swiper', 'picker'];

const errors = [];
const stats = { files: 0, tags: 0 };

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.name.endsWith('.wxml')) {
      out.push(full);
    }
  }
  return out;
}

function checkFile(file) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  stats.files++;

  // 1. 注释笔误
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (/\*\//.test(line) && !/\/\*/.test(line)) {
      errors.push(rel + ':' + (i + 1) + ' 注释以 */ 结尾，wxml 里要写 -->');
    }
  });

  // 2. 表达式里的裸 <
  lines.forEach((line, i) => {
    const matches = line.match(/\{\{[^}]*\}\}/g) || [];
    for (const expr of matches) {
      // {{a < b}} / {{a <= b}} 都不合法：`<` 会被当成标签起始
      if (/<(?!\/)/.test(expr)) {
        errors.push(rel + ':' + (i + 1) + ' 表达式里有裸 < ：' + expr.trim());
      }
    }
  });

  // 3. 标签配对
  for (const tag of PAIRED_TAGS) {
    const openAll = src.match(new RegExp('<' + tag + '(?=[\\s>])', 'g')) || [];
    const selfClosed = src.match(new RegExp('<' + tag + '(?=[\\s>])[^>]*?/>', 'g')) || [];
    const closes = src.match(new RegExp('</' + tag + '>', 'g')) || [];
    stats.tags += openAll.length;
    if (openAll.length - selfClosed.length !== closes.length) {
      errors.push(
        `${rel} <${tag}> 开闭不匹配：${openAll.length} 个开标签` +
          `（自闭合 ${selfClosed.length}）、${closes.length} 个闭标签`
      );
    }
  }

  // 4. 空文件
  if (!src.replace(/<!--[\s\S]*?-->/g, '').trim()) {
    errors.push(`${rel} 是空文件（或只有注释）`);
  }
}

const files = walk(ROOT, []);
files.forEach(checkFile);

if (errors.length) {
  console.log(`\n发现问题（${errors.length}）：`);
  for (const line of errors) console.log('  ' + line);
  console.log(`\n检查了 ${stats.files} 个 wxml、${stats.tags} 个成对标签`);
  process.exit(1);
}

console.log(`通过：${stats.files} 个 wxml，${stats.tags} 个成对标签，注释与表达式均合法`);
