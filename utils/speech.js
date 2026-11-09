/**
 * 语音识别封装 —— 微信同声传译插件（WechatSI）
 *
 * 为什么用它：小程序自己只有录音（wx.getRecorderManager），不做识别。
 * 同声传译插件提供流式识别，说完就有文字，不用经过输入法的听写。
 *
 * 插件需要两步才可用：
 *   1. mp 后台「设置 → 第三方设置 → 插件管理」添加插件，AppID: wx069ba97219f66d99
 *   2. app.json 的 plugins 里声明（已声明，version 0.3.5）
 * 任一步没做，requirePlugin 会抛错，这里吞掉并让上层降级成「只能打字」。
 *
 * 用法（推荐 createSession，页面销毁时 dispose）：
 *   var s = speech.createSession({
 *     onStart: fn, onPartial: fn, onFinal: fn, onError: fn
 *   });
 *   s.start();  s.stop();  s.dispose();
 *
 * 为什么不再直接操作 manager：插件 manager 是全局单例，回调只能挂一份。
 * 页面销毁后旧回调仍指向旧 Page，再 setData 会报错；包一层 session
 * 后由 dispose 统一摘掉回调，多次进出页面也不会串。
 */

var manager = null;
var tried = false;

/** 取单例识别器；插件不可用时返回 null，不抛错 */
function getManager() {
  if (tried) return manager;
  tried = true;
  try {
    /* global requirePlugin */
    var si = requirePlugin('WechatSI');
    manager = si.getRecordRecognitionManager();
  } catch (e) {
    manager = null;
  }
  return manager;
}

function isAvailable() {
  return !!getManager();
}

/** 申请麦克风权限；已授权直接 resolve，被拒则 reject（调用方引导去设置） */
function ensurePermission() {
  return new Promise(function (resolve, reject) {
    if (typeof wx.getSetting !== 'function') {
      resolve();
      return;
    }
    wx.getSetting({
      success: function (res) {
        if (res.authSetting && res.authSetting['scope.record']) {
          resolve();
          return;
        }
        wx.authorize({
          scope: 'scope.record',
          success: function () { resolve(); },
          fail: function () { reject(new Error('未获得麦克风权限')); }
        });
      },
      fail: function () { reject(new Error('无法读取授权状态')); }
    });
  });
}

function noop() {}

/** stop 之后迟迟等不到 onStop（插件偶发丢回调）时的兜底时长 */
var STOP_TIMEOUT = 4000;

/**
 * 建一次录音会话，把插件四个回调收敛成 start/stop/dispose 三个方法。
 * @param {{onStart?:Function, onPartial?:Function, onFinal?:Function, onError?:Function}} handlers
 */
function createSession(handlers) {
  var h = handlers || {};
  var mgr = getManager();
  var disposed = false;
  var stopped = false;
  var timer = null;

  function emit(name, payload) {
    if (disposed) return;
    var fn = h[name];
    if (typeof fn === 'function') fn(payload);
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  if (mgr) {
    mgr.onStart = function () {
      emit('onStart');
    };

    // 流式中间结果：只回传本次这一段的文字，拼接交给页面
    mgr.onRecognize = function (res) {
      emit('onPartial', ((res && res.result) || '').trim());
    };

    mgr.onStop = function (res) {
      clearTimer();
      stopped = true;
      emit('onFinal', ((res && res.result) || '').trim());
    };

    mgr.onError = function (res) {
      clearTimer();
      stopped = true;
      emit('onError', { msg: (res && res.msg) || '语音识别失败，可直接打字' });
    };
  }

  return {
    available: !!mgr,

    start: function (opts) {
      if (!mgr || disposed) return;
      stopped = false;
      clearTimer();
      try {
        mgr.start(opts || { duration: 60000, lang: 'zh_CN' });
      } catch (e) {
        emit('onError', { msg: '麦克风启动失败，可直接打字' });
      }
    },

    stop: function () {
      if (!mgr || disposed || stopped) return;
      try {
        mgr.stop();
      } catch (e) {
        // 未在录音时 stop 会抛错，忽略
      }
      clearTimer();
      // 兜底：插件偶尔不回调 onStop，别让「正在听」卡死
      timer = setTimeout(function () {
        if (stopped || disposed) return;
        stopped = true;
        emit('onError', { msg: '识别超时，可以直接打字' });
      }, STOP_TIMEOUT);
    },

    /** 页面 onUnload 必须调用：摘掉全局回调，避免打到已销毁的页面 */
    dispose: function () {
      disposed = true;
      clearTimer();
      if (!mgr) return;
      mgr.onStart = noop;
      mgr.onRecognize = noop;
      mgr.onStop = noop;
      mgr.onError = noop;
    }
  };
}

module.exports = {
  getManager: getManager,
  isAvailable: isAvailable,
  ensurePermission: ensurePermission,
  createSession: createSession
};
