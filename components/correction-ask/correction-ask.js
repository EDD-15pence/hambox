/**
 * 随机打卡「一步抽查」面板（§19.4 A 线 / H-04）
 *
 * **打开小程序就走 A**：页面 `onShow` 里调 `this.selectComponent('#ask').ask()`，
 * 有配额就直接弹，不消耗服务通知授权。B 线（订阅消息，H-08）是另一条独立的
 * 使用状态，不在这里判断「有没有打开过」。
 *
 * 面板刻意**不做输入框**：只有三个大按钮。有输入框就得处理键盘遮挡（§5.5），
 * 而「一步点选」本来就是这功能存在的理由。
 *
 * 弹过没答（用户划走了）不记答案，下次打开还弹同一条 —— 配额只按「已答」算。
 */

var api = require('../../utils/api');
var correction = require('../../utils/correction');

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  data: {
    visible: false,
    loading: false,
    saving: false,
    check: null,
    item: null,
    // 答题结果：'doing' / 'clean' / 'skipped'，非空即为「已答，正在展示反馈」
    answered: '',
    message: '',
    suggestion: null,
    answers: correction.ANSWERS,
    timeText: ''
  },

  methods: {
    /**
     * 问后端「现在该不该弹」。页面 `onShow` 调用；
     * 失败静默（首页不该因为拉不到抽查就弹错误）。
     *
     * `opts.force` = 用户主动点的「现在问一次」：同一条也再弹。
     * 自动模式（不传）**同一条只弹一次** —— 否则从别的页面返回首页会一直弹
     * 那条没答的，很烦；用户在列表页点一下才重新弹。
     */
    ask(opts) {
      var force = !!(opts && opts.force);
      if (this.data.visible || this._asking) return Promise.resolve(null);
      this._asking = true;
      return api.correctionAsk()
        .then((data) => {
          this._asking = false;
          if (!data || !data.check) return null;
          if (!force && this._shownId === data.check.id) return null;
          this._shownId = data.check.id;
          this.setData({
            visible: true,
            check: data.check,
            item: data.correction,
            answered: '',
            message: '',
            suggestion: null,
            timeText: this._clock()
          });
          return data.check;
        })
        .catch(() => {
          this._asking = false;
          return null;
        });
    },

    _clock() {
      var now = new Date();
      var hh = now.getHours();
      var mm = now.getMinutes();
      return (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
    },

    /** 三态点选：点完立刻落库，成功才展示反馈 */
    onAnswer(e) {
      var answer = e.currentTarget.dataset.answer;
      if (!answer || this.data.saving || this.data.answered) return;
      var check = this.data.check;
      if (!check) return;
      this.setData({ saving: true });
      api.correctionAnswer(check.id, answer)
        .then((res) => {
          this.setData({
            saving: false,
            answered: answer,
            message: res.message || '',
            suggestion: res.suggestion || null,
            check: res.check
          });
        })
        .catch((err) => {
          this.setData({ saving: false });
          wx.showToast({ title: (err && err.message) || '没记上，再点一次', icon: 'none' });
        });
    },

    /** 关面板。答过就直接关；没答也是关 —— 下次打开还弹这条，不额外扣配额 */
    onClose() {
      this.setData({
        visible: false,
        check: null,
        item: null,
        answered: '',
        message: '',
        suggestion: null
      });
      // 页面据此刷新今日进度（答题后列表上的 2/3 要跟着变）
      this.triggerEvent('changed');
    },

    onNoop() {}
  }
});
