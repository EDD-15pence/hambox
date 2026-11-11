/**
 * 自绘导航栏的尺寸信息
 *
 * app.json 已启用 `navigationStyle: custom`，系统导航栏不再渲染，
 * 每个页面的自绘导航栏需要自己让出两样东西：
 *   1. 状态栏高度（刘海 / 状态栏）
 *   2. **右上角微信胶囊**（「···」和「⊙」）—— 它悬浮在页面最上层，
 *      自绘按钮只要摆到右侧就会被它压住、点不到。
 *
 * 胶囊的宽度和位置各机型都不一样（iPhone 与安卓差好几像素），
 * 写死 44px 之类的边距一定翻车，必须用
 * wx.getMenuButtonBoundingClientRect() 量出来。
 *
 * 用法：
 *   const nav = require('../../utils/nav');
 *   onLoad() {
 *     this.setData({
 *       statusBarHeight: nav.STATUS_BAR_HEIGHT,
 *       navRight: nav.SAFE_RIGHT
 *     });
 *   }
 *   wxml: <view class="app-nav"
 *            style="padding-top:{{statusBarHeight}}px;padding-right:{{navRight}}px">
 */

function readWindow() {
  try {
    if (wx.getWindowInfo) return wx.getWindowInfo() || {};
    return wx.getSystemInfoSync() || {};
  } catch (e) {
    return {};
  }
}

function readCapsule() {
  try {
    if (!wx.getMenuButtonBoundingClientRect) return null;
    var r = wx.getMenuButtonBoundingClientRect();
    // 个别机型会返回全 0，这种情况当作没量到
    if (r && r.width > 0 && r.left > 0) return r;
  } catch (e) {}
  return null;
}

var win = readWindow();
var STATUS_BAR_HEIGHT = win.statusBarHeight || 20;
var WINDOW_WIDTH = win.windowWidth || 375;

/**
 * 右侧要空出来的宽度（px）
 *
 * = 屏幕宽 − 胶囊左边缘 + 一点缝，让自绘按钮整体落在胶囊左边。
 * 每次读取都重新量一遍：模块加载有可能早于胶囊可用，
 * 页面 onLoad 里再取值时才能拿到准确位置。
 */
function safeRight() {
  var capsule = readCapsule();
  if (capsule) return Math.round(WINDOW_WIDTH - capsule.left + 8);
  // 量不到时按「87px 胶囊 + 7px 右边距 + 8px 缝」兜底
  return 102;
}

module.exports = {
  STATUS_BAR_HEIGHT: STATUS_BAR_HEIGHT,
  CAPSULE: readCapsule(),
};

// 用 getter 暴露，保证取用时是当前这一刻的真实值
Object.defineProperty(module.exports, 'SAFE_RIGHT', {
  enumerable: true,
  get: safeRight,
});
