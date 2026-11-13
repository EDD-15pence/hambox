/**
 * 新建 / 编辑矫正项的表单弹层（H-02 / H-06）
 *
 * 抽成组件是因为列表页和详情页都要用：规则一改就得在两处同步，复制两份
 * 迟早只改一边（1.3.13 权限守卫批量改漏一级就是这么来的）。
 *
 * 组件只管**表单状态与本地校验**，发请求由页面做（`bind:save`），
 * 这样「保存成功后刷新哪份数据」留在页面手上。
 *
 * 键盘避让按 `AGENTS.md` §5.5 的硬规则：mask 补 `padding-bottom`，
 * 每个 input 都带 `cursor-spacing`，聚焦靠数据字段而不是写死 `focus="{{true}}"`。
 */

var correction = require('../../utils/correction');

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false },
    /* 编辑时传整行（含 id）；新建传 null */
    value: { type: Object, value: null },
    saving: { type: Boolean, value: false }
  },

  data: {
    form: correction.formOf(null),
    editing: false,
    /* WXML 里不能调用 indexOf，星期选中态另存一份布尔数组 */
    dayOn: [true, true, true, true, true, false, false],
    presets: correction.PRESETS,
    icons: correction.ICONS,
    weekLabels: correction.WEEK_LABELS,
    modeOptions: [
      { key: 'daily', label: '每天' },
      { key: 'weekdays', label: '工作日' },
      { key: 'custom', label: '自定义' }
    ],
    kb: 0,
    nameFocus: false,
    error: ''
  },

  observers: {
    visible(open) {
      if (!open) {
        this.setData({ kb: 0, nameFocus: false, error: '' });
        return;
      }
      var form = correction.formOf(this.data.value);
      this.setData({
        form: form,
        dayOn: this._dayFlags(form.activeDays),
        editing: !!(this.data.value && this.data.value.id),
        error: '',
        kb: 0,
        nameFocus: false
      });
    }
  },

  methods: {
    _dayFlags(days) {
      var list = days || [];
      return [0, 1, 2, 3, 4, 5, 6].map(function (day) {
        return list.indexOf(day) !== -1;
      });
    },
    /** 预设：填名字 + 图标 + topic；「自定义」只清名字，让人自己起 */
    onPickPreset(e) {
      var key = e.currentTarget.dataset.key;
      var preset = correction.PRESETS.filter(function (item) {
        return item.key === key;
      })[0];
      if (!preset) return;
      if (preset.key === 'custom') {
        this.setData({
          'form.name': '',
          'form.topic': '',
          nameFocus: true
        });
        return;
      }
      this.setData({
        'form.name': preset.name,
        'form.icon': preset.icon,
        'form.topic': preset.topic
      });
    },

    onPickIcon(e) {
      this.setData({ 'form.icon': e.currentTarget.dataset.icon });
    },

    onNameInput(e) {
      // 只改名字，不动 topic：改名不该把「腿 / 驼背」这类建议分类丢掉
      this.setData({ 'form.name': e.detail.value });
    },

    onPickMode(e) {
      var mode = e.currentTarget.dataset.mode;
      var patch = { 'form.scheduleMode': mode };
      // 从自定义切回 daily / weekdays 时保留已选天数，切回来不用重选
      if (mode === 'custom' && !(this.data.form.activeDays || []).length) {
        patch['form.activeDays'] = [0, 1, 2, 3, 4];
        patch.dayOn = this._dayFlags([0, 1, 2, 3, 4]);
      }
      this.setData(patch);
    },

    onToggleDay(e) {
      var day = Number(e.currentTarget.dataset.day);
      var days = (this.data.form.activeDays || []).slice();
      var index = days.indexOf(day);
      if (index === -1) days.push(day);
      else days.splice(index, 1);
      days.sort(function (a, b) {
        return a - b;
      });
      this.setData({ 'form.activeDays': days, dayOn: this._dayFlags(days) });
    },

    onPickStart(e) {
      this.setData({ 'form.windowStart': e.detail.value });
    },

    onPickEnd(e) {
      this.setData({ 'form.windowEnd': e.detail.value });
    },

    onStepCount(e) {
      var delta = Number(e.currentTarget.dataset.delta) || 0;
      var next = Math.max(1, Math.min(12, (this.data.form.checksPerDay || 3) + delta));
      this.setData({ 'form.checksPerDay': next });
    },

    onKeyboardHeight(e) {
      var height = (e.detail && e.detail.height) || 0;
      if (height !== this.data.kb) this.setData({ kb: height });
    },

    onFieldFocus() {
      // 兜底：部分安卓机不回调 keyboardheightchange，靠 focus 时也刷新一次
    },

    onFieldBlur() {
      this.setData({ kb: 0 });
    },

    onSubmit() {
      if (this.data.saving) return;
      var form = this.data.form;
      var name = (form.name || '').trim();
      if (!name) {
        this.setData({ error: '先给它起个名字', nameFocus: true });
        return;
      }
      if (form.scheduleMode === 'custom' && !(form.activeDays || []).length) {
        this.setData({ error: '自定义档至少要选一天' });
        return;
      }
      if (form.windowEnd <= form.windowStart) {
        this.setData({ error: '结束时间要晚于开始时间' });
        return;
      }
      this.setData({ error: '', nameFocus: false });
      this.triggerEvent('save', {
        id: this.data.value && this.data.value.id,
        payload: {
          name: name,
          icon: form.icon,
          topic: form.topic,
          scheduleMode: form.scheduleMode,
          // 三档都带着：切回「自定义」时不用重新勾
          activeDays: form.activeDays,
          windowStart: form.windowStart,
          windowEnd: form.windowEnd,
          checksPerDay: form.checksPerDay
        }
      });
    },

    onClose() {
      if (this.data.saving) return;
      this.triggerEvent('close');
    },

    onNoop() {}
  }
});
