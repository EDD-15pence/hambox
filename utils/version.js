/**
 * 开发版号常量（人工同步）
 *
 * 小程序**没有**运行时读取自身版本号的可靠接口：`wx.getAccountInfoSync()`
 * 只给 envVersion（develop / trial / release），开发版拿不到 `1.3.4` 这种号。
 * 所以每次 `cli.bat upload -v x.y.z` 之后要顺手改这一行，
 * 反馈记录带的 app_version 才是准的（见 AGENTS.md §16.5）。
 */
var APP_VERSION = '1.3.13';

function envLabel() {
  try {
    var info = wx.getAccountInfoSync();
    var env = info && info.miniProgram && info.miniProgram.envVersion;
    if (env === 'trial') return '体验版';
    if (env === 'release') return '正式版';
    return '开发版';
  } catch (e) {
    return '';
  }
}

/** '1.3.4 开发版' —— 反馈列表里一行看得懂 */
function describe() {
  var env = envLabel();
  return env ? APP_VERSION + ' ' + env : APP_VERSION;
}

module.exports = {
  APP_VERSION: APP_VERSION,
  describe: describe
};
