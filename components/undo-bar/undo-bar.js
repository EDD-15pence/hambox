/**
 * 撤销条（S-14）
 *
 * 删东西之后浮在底部的一条「撤销 · 5s」。为什么要组件化：清单页减到 0、
 * 容器页点「用完了」，两处是**同一个交互**，但页面结构差得远（一个列表一个柜子墙），
 * 各写一套必然长歪——一边 5 秒倒计时、一边干脆没有。
 *
 * 职责边界：
 * - 组件只管**倒计时和显隐**，不碰接口、不碰数据；
 * - 到点抛 `expire`（页面收条子，但数据仍在库里，删是真删了）；
 * - 点击抛 `undo`（页面自己调恢复接口）。
 *
 * 为什么还要 `token`：连着删两条时 `visible` 一直是 true，属性值没变就
 * 不会触发 observer，第二条的倒计时会接着第一条走。页面每次删除把 token +1，
 * 倒计时才会重新数。
 */
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    /* 每删一次 +1，用来重置倒计时 */
    token: {
      type: Number,
      value: 0
    },
    text: {
      type: String,
      value: '已删除'
    },
    seconds: {
      type: Number,
      value: 5
    },
    /* 距底部的距离（rpx）：页面底部有悬浮球时抬上去，别叠在一起 */
    bottom: {
      type: Number,
      value: 112
    }
  },

  data: {
    left: 5
  },

  observers: {
    'visible, token': function (visible) {
      if (visible) this.restart();
      else this.stop();
    }
  },

  lifetimes: {
    detached: function () {
      this.stop();
    }
  },

  methods: {
    restart: function () {
      var self = this;
      this.stop();
      this.setData({ left: this.data.seconds });
      this._timer = setInterval(function () {
        var left = self.data.left - 1;
        if (left <= 0) {
          self.stop();
          self.triggerEvent('expire');
          return;
        }
        self.setData({ left: left });
      }, 1000);
    },

    stop: function () {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    },

    onTap: function () {
      // 先停表：撤销请求在飞行中不该继续倒数，也不该再抛一次 expire
      this.stop();
      this.triggerEvent('undo');
    }
  }
});
