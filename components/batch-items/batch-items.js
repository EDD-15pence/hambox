/**
 * 批量解析结果卡片列表
 *
 * 一句话说了多件东西时，quick-parse.parseQuickBatch 拆出 N 条草稿，
 * 这里负责把每条渲染成一张可编辑的小卡：名称 / 数量+单位 / 过期日 / 位置。
 *
 * 只吐事件，不改数据 —— 数据永远由调用方（面板 / 页面）持有：
 *   edit   { index, field, value }  某一项改了
 *   remove { index }                删掉这一条
 *
 * 为什么不在这里维护副本：调用方保存前要拿最新值拼 payload，
 * 两处各存一份迟早不一致（1.3.13 权限守卫批量改漏一级就是这类问题）。
 */
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    /* 解析结果数组，每项含 name / quantity / unit / location / expireDate / categoryName */
    items: {
      type: Array,
      value: []
    },
    /* 单位下拉用的列表 */
    units: {
      type: Array,
      value: []
    }
  },

  methods: {
    noop: function () {},

    onInput: function (e) {
      this.triggerEvent('edit', {
        index: Number(e.currentTarget.dataset.index),
        field: e.currentTarget.dataset.field,
        value: e.detail.value
      });
    },

    onUnit: function (e) {
      var index = Number(e.currentTarget.dataset.index);
      var unit = this.data.units[Number(e.detail.value)] || '个';
      this.triggerEvent('edit', { index: index, field: 'unit', value: unit });
    },

    onExpire: function (e) {
      this.triggerEvent('edit', {
        index: Number(e.currentTarget.dataset.index),
        field: 'expireDate',
        value: e.detail.value
      });
    },

    onRemove: function (e) {
      this.triggerEvent('remove', {
        index: Number(e.currentTarget.dataset.index)
      });
    }
  }
});
