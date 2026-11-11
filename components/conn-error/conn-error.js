/**
 * 连不上后端时的引导卡片
 *
 * 以前断网只弹一条 toast，两秒就消失，用户既不知道找什么也不知道怎么查。
 * 这里把「哪条线路失败、请求打到了哪、下一步点哪里」摊开成一张可操作卡片。
 *
 * 三条排查是按本项目真实的失败顺序写的：
 *   1) 后端进程没起 —— 最常见，家里台式机重启后忘了拉起来；
 *   2) 走错网络 —— 内网要同一 WiFi，外网要 8443 端口；
 *   3) 域名没放行 —— 真机只认 HTTPS 域名，mp 后台改完还得退出小程序重进。
 */
Component({
  properties: {
    /** api 层给的人话错误，例如「两条线路都不通（外网 超时，内网 域名不在白名单）」 */
    message: { type: String, value: '' },
    /** 当前要请求的地址，展示出来方便对着查 */
    baseUrl: { type: String, value: '' },
    /** 重试中，按钮转态并禁用 */
    retrying: { type: Boolean, value: false },
    /** 紧凑模式：嵌在已有内容上方时用，减少留白 */
    compact: { type: Boolean, value: false }
  },

  data: {
    showDetail: false
  },

  methods: {
    onRetry: function () {
      if (this.data.retrying) return;
      this.triggerEvent('retry');
    },

    onToggleDetail: function () {
      this.setData({ showDetail: !this.data.showDetail });
    }
  }
});
