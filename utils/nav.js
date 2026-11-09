/**
 * 状态栏高度（px）
 *
 * app.json 已启用 `navigationStyle: custom`，系统导航栏不再渲染，
 * 每个页面的自绘导航栏需要自己让出状态栏高度，否则会被刘海/状态栏压住。
 *
 * 用法：
 *   const nav = require('../../utils/nav');
 *   onLoad() { this.setData({ statusBarHeight: nav.STATUS_BAR_HEIGHT }); }
 *   wxml: <view class="app-nav" style="padding-top:{{statusBarHeight}}px">
 */

function readStatusBarHeight() {
  try {
    if (wx.getWindowInfo) {
      return wx.getWindowInfo().statusBarHeight || 20;
    }
    return wx.getSystemInfoSync().statusBarHeight || 20;
  } catch (e) {
    return 20;
  }
}

module.exports = {
  STATUS_BAR_HEIGHT: readStatusBarHeight(),
};
