/**
 * 深色模式统一开关
 *
 * 存储 key 固定为 `darkMode`（boolean），兼容打卡 / 仓储页的历史数据。
 * 页面只做两件事：onLoad 时 getTheme()，点击时 toggleTheme() 并 setData。
 */

var KEY = 'darkMode';

/** @returns {boolean} 当前是否为深色 */
function getTheme() {
  try {
    return !!wx.getStorageSync(KEY);
  } catch (e) {
    return false;
  }
}

/** @param {boolean} dark */
function setTheme(dark) {
  try {
    wx.setStorageSync(KEY, !!dark);
  } catch (e) {
    // storage 写失败不影响本次会话的显示
  }
}

/** 切换并落盘 @returns {boolean} 切换后的值 */
function toggleTheme() {
  var next = !getTheme();
  setTheme(next);
  return next;
}

module.exports = {
  getTheme: getTheme,
  setTheme: setTheme,
  toggleTheme: toggleTheme,
};
