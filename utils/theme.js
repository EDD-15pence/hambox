/**
 * 深色模式统一开关（A-08 / A-09）
 *
 * 口径（2026-11-12 拍板）：
 * - **冷启动按系统切一次**：每次进小程序读一次 `theme`，深色就深色；
 * - **手动切换只在本次会话有效**：不写 storage、不跨会话记忆；
 * - **重进自动回到跟随系统**，手动值清零——所以这里没有任何持久化。
 *
 * 两个内存变量就能表达全部状态：
 *   systemDark = 启动时读一次系统主题
 *   override   = null（跟系统）| 'light' | 'dark'（本次手动）
 *
 * 为什么不存 wx.storage：存了就会变成「上次手动盖住了系统」，
 * 与「每次进入自动根据系统切换一次」直接矛盾。旧 key `darkMode` 一律不读。
 *
 * ⚠️ 禁止用 `@media (prefers-color-scheme: dark)` 做深色：它不受 `darkmode`
 * 开关也不受这里的 override 控制，手动切回浅色会被系统主题劫持。
 * 本项目只走 `.container.dark` + CSS 变量覆盖（见 styles/tokens.wxss）。
 */

var override = null; // null | 'light' | 'dark'，仅内存
var systemDark = false;
var inited = false;

/**
 * 读系统主题。基础库 2.11.0+ 才有 `theme`，取不到按浅色处理（不崩）。
 * 优先用 `wx.getAppBaseInfo`（`getSystemInfoSync` 已废弃但仍是兜底）。
 */
function detectSystemDark() {
  try {
    if (typeof wx.getAppBaseInfo === 'function') {
      var base = wx.getAppBaseInfo();
      if (base && (base.theme === 'dark' || base.theme === 'light')) {
        return base.theme === 'dark';
      }
    }
  } catch (e) {
    // 继续走兜底
  }
  try {
    var info = wx.getSystemInfoSync();
    return !!info && info.theme === 'dark';
  } catch (e) {
    return false;
  }
}

/** app.onLaunch 调一次。手动值一并清零——这就是「重进回系统」。 */
function initFromSystem() {
  systemDark = detectSystemDark();
  override = null;
  inited = true;
  return systemDark;
}

/** 任何地方临时取主题，都不该拿到「还没 init 就默认浅色」的错值。 */
function ensureInit() {
  if (!inited) initFromSystem();
}

/** @returns {boolean} 当前实际是否深色 */
function getTheme() {
  ensureInit();
  return override ? override === 'dark' : systemDark;
}

/**
 * 直接设成某个模式。**只写内存**，不落盘。
 * 保留这个函数是因为 6 个页面在调；语义已从「持久化偏好」变成「本次覆盖」。
 */
function setTheme(dark) {
  ensureInit();
  override = dark ? 'dark' : 'light';
}

/** 按当前实际深浅反转，写入本次 override @returns {boolean} 切换后的值 */
function toggleTheme() {
  ensureInit();
  override = getTheme() ? 'light' : 'dark';
  return override === 'dark';
}

/** 本次会话内放弃手动值、回到跟随系统 @returns {boolean} 恢复后的值 */
function resetToSystem() {
  ensureInit();
  override = null;
  return systemDark;
}

/** 是否处于手动覆盖态（真机排障 / 首页长按提示用） */
function isOverridden() {
  return override !== null;
}

module.exports = {
  initFromSystem: initFromSystem,
  getTheme: getTheme,
  setTheme: setTheme,
  toggleTheme: toggleTheme,
  resetToSystem: resetToSystem,
  isOverridden: isOverridden
};
