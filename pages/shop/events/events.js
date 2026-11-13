/**
 * 店铺记 · 流水与补录（§17 / SH-05）
 *
 * 这一页解决「点错了 / 忘了点 / 时间是昨天」三件事：
 * - 按天看流水，每条都能改数量、改成交价、改发生时间、撤销；
 * - 「补录」可以指定过去的任意时刻，方向与数量都自己填；
 * - 补录与点击产生的流水进同一张表，日报一视同仁（后端 `source` 只做标注）。
 *
 * 改时间要注意：**改的是「它属于哪一天」**，不只是显示。所以保存后必须重拉
 * 当前这一天的列表与日报，否则刚改走的那条还挂在屏幕上。
 */

const nav = require('../../../utils/nav');
const theme = require('../../../utils/theme');
const api = require('../../../utils/api');
const money = require('../../../utils/money');
const timeText = require('../../../utils/time-text');

function pad(n) {
  return String(n).padStart(2, '0');
}

function dayOf(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function todayDay() {
  return dayOf(new Date());
}

function nowTime() {
  const now = new Date();
  return pad(now.getHours()) + ':' + pad(now.getMinutes());
}

/**
 * 「本地日期 + 本地时刻」→ 带时区的 ISO。
 * 用 `toISOString()` 而不是手拼字符串：它会带上真实时区偏移，
 * 后端按 UTC 存，展示再换回本地，晚上 8 点的账不会跑到白天。
 */
function isoOf(day, clock) {
  const datePart = String(day || '').split('-').map(Number);
  const timePart = String(clock || '00:00').split(':').map(Number);
  const date = new Date(
    datePart[0],
    (datePart[1] || 1) - 1,
    datePart[2] || 1,
    timePart[0] || 0,
    timePart[1] || 0,
    0
  );
  return date.toISOString();
}

function clockOf(iso) {
  const date = timeText.toLocal(iso);
  if (!date) return '00:00';
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function dayLabel(day) {
  const target = dayOf(new Date(String(day).replace(/-/g, '/')));
  const today = todayDay();
  if (target === today) return '今天';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (target === dayOf(yesterday)) return '昨天';
  return target.slice(5).replace('-', '月') + '日';
}

Page({
  data: {
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    isDark: false,
    day: todayDay(),
    dayText: '今天',
    loading: true,
    error: '',
    items: [],
    summary: { inQty: 0, inAmount: '0', outQty: 0, outAmount: '0', gross: '0', grossNegative: false },
    sheet: null,
    // 键盘避让（§5.5）：本页弹层不自动聚焦，只做高度补偿
    kb: 0,
    saving: false
  },

  onLoad() {
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT,
      dayText: dayLabel(todayDay())
    });
    // 不在这里拉：onLoad 之后紧跟 onShow，两处都拉会把接口打两遍
  },

  onShow() {
    const isDark = theme.getTheme();
    if (isDark !== this.data.isDark) this.setData({ isDark });
    this.loadList(this.data.day);
  },

  onPullDownRefresh() {
    this.loadList(this.data.day).then(() => wx.stopPullDownRefresh());
  },

  // ==============================
  // 拉数据
  // ==============================

  loadList(day) {
    this.setData({ loading: true, error: '' });
    return api
      .shopEvents(day)
      .then((data) => {
        this.setData({
          loading: false,
          day,
          dayText: dayLabel(day),
          items: data.items.map((event) => this.toRow(event)),
          summary: this.toSummary(data.summary)
        });
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message || '拉不到流水' });
      });
  },

  toSummary(raw) {
    return {
      inQty: raw.inQty,
      inAmount: money.text(raw.inAmountFen),
      outQty: raw.outQty,
      outAmount: money.text(raw.outAmountFen),
      gross: money.text(raw.grossFen),
      grossNegative: raw.grossFen < 0
    };
  },

  toRow(event) {
    const isIn = event.direction === 'in';
    return {
      id: event.id,
      skuId: event.skuId,
      isIn,
      clock: clockOf(event.happenedAt),
      happenedAt: event.happenedAt,
      title: (event.brandName ? event.brandName + ' · ' : '') + (event.model || '未知机型'),
      category: event.category,
      qty: event.qty,
      // 进货看成本、售卖看成交价，前端不再自己判方向拼字符串
      priceText: money.text(isIn ? event.unitCostFen : event.unitPriceFen),
      amountText: money.text(event.amountFen),
      manual: event.source === 'manual'
    };
  },

  onPickDay(e) {
    const day = e.detail.value;
    this.loadList(day);
  },

  onRetry() {
    this.loadList(this.data.day);
  },

  // ==============================
  // 补录
  // ==============================

  onOpenAdd() {
    api
      .listShopSkus('', false)
      .then((skus) => {
        if (!skus.length) {
          this.toast('还没有任何机型，先去货架加一个');
          return;
        }
        const options = skus.map((sku) => ({
          id: sku.id,
          label: (sku.brandName ? sku.brandName + ' · ' : '') + sku.model,
          quantity: sku.quantity,
          costFen: sku.costFen,
          lastSaleFen: sku.lastSaleFen
        }));
        this.setData({
          sheet: {
            type: 'add',
            direction: 'in',
            skuIndex: 0,
            options,
            qty: '1',
            price: money.text(options[0].costFen),
            day: this.data.day,
            clock: nowTime()
          }
        });
      })
      .catch((err) => this.toast(err.message));
  },

  onPickSku(e) {
    const index = Number(e.detail.value);
    const option = this.data.sheet.options[index];
    // 换机型就把价格预填换掉：预填的是「这个机型」的上次价，不是上一个机型的
    const price =
      this.data.sheet.direction === 'out'
        ? option.lastSaleFen
          ? money.text(option.lastSaleFen)
          : ''
        : money.text(option.costFen);
    this.setData({ 'sheet.skuIndex': index, 'sheet.price': price });
  },

  onPickDirection(e) {
    const direction = e.currentTarget.dataset.direction;
    const option = this.data.sheet.options[this.data.sheet.skuIndex];
    const price =
      direction === 'out'
        ? option.lastSaleFen
          ? money.text(option.lastSaleFen)
          : ''
        : money.text(option.costFen);
    this.setData({ 'sheet.direction': direction, 'sheet.price': price });
  },

  onSheetField(e) {
    const patch = {};
    patch['sheet.' + e.currentTarget.dataset.field] = e.detail.value;
    this.setData(patch);
  },

  onSheetDay(e) {
    this.setData({ 'sheet.day': e.detail.value });
  },

  onSheetClock(e) {
    this.setData({ 'sheet.clock': e.detail.value });
  },

  onSheetClose() {
    if (this.data.saving) return;
    wx.hideKeyboard();
    this.setData({ sheet: null, kb: 0 });
  },

  onFieldFocus(e) {
    this.setData({ kb: (e.detail && e.detail.height) || 0 });
  },

  onFieldBlur() {
    this.setData({ kb: 0 });
  },

  /** 增强路径：键盘高度以 `bindkeyboardheightchange` 为准（含 safe-area 差异） */
  onKeyboardHeight(e) {
    const height = (e.detail && e.detail.height) || 0;
    if (height !== this.data.kb) this.setData({ kb: height });
  },

  onNoop() {},

  onSaveAdd() {
    const sheet = this.data.sheet;
    if (!sheet || sheet.type !== 'add' || this.data.saving) return;
    const option = sheet.options[sheet.skuIndex];
    const qty = parseInt(sheet.qty, 10);
    if (!qty || qty < 1) {
      this.toast('数量至少 1 件');
      return;
    }
    const fen = money.toFen(sheet.price);
    if (sheet.direction === 'out' && fen === null) {
      this.toast('售卖要填成交价');
      return;
    }
    this.setData({ saving: true });
    api
      .createShopEvent({
        skuId: option.id,
        direction: sheet.direction,
        qty,
        unitPriceFen: sheet.direction === 'out' ? fen : undefined,
        unitCostFen: sheet.direction === 'in' && fen !== null ? fen : undefined,
        happenedAt: isoOf(sheet.day, sheet.clock),
        source: 'manual'
      })
      .then(() => {
        this.setData({ saving: false, sheet: null });
        this.toast('补上了');
        this.loadList(sheet.day);
      })
      .catch((err) => {
        this.setData({ saving: false });
        this.toast(err.message);
      });
  },

  // ==============================
  // 改一条 / 撤销
  // ==============================

  onRowLongPress(e) {
    const id = Number(e.currentTarget.dataset.id);
    const row = this.data.items.find((item) => item.id === id);
    if (!row) return;
    wx.vibrateShort({ type: 'medium' });
    this.setData({
      sheet: {
        type: 'edit',
        id: row.id,
        title: row.title,
        isIn: row.isIn,
        qty: String(row.qty),
        price: row.priceText,
        day: dayOf(timeText.toLocal(row.happenedAt) || new Date()),
        clock: row.clock
      }
    });
  },

  onSaveEdit() {
    const sheet = this.data.sheet;
    if (!sheet || sheet.type !== 'edit' || this.data.saving) return;
    const qty = parseInt(sheet.qty, 10);
    if (!qty || qty < 1) {
      this.toast('数量至少 1 件');
      return;
    }
    const fen = money.toFen(sheet.price);
    if (!sheet.isIn && fen === null) {
      this.toast('售卖要填成交价');
      return;
    }
    const patch = {
      qty,
      happenedAt: isoOf(sheet.day, sheet.clock)
    };
    // 进货改的是「这次进价」，售卖改的是「成交价」；两者都落在同一条流水的快照上
    if (fen !== null) {
      if (sheet.isIn) patch.unitCostFen = fen;
      else patch.unitPriceFen = fen;
    }
    this.setData({ saving: true });
    api
      .updateShopEvent(sheet.id, patch)
      .then(() => {
        this.setData({ saving: false, sheet: null });
        this.toast('改好了');
        this.loadList(this.data.day);
      })
      .catch((err) => {
        this.setData({ saving: false });
        this.toast(err.message);
      });
  },

  onDeleteEvent() {
    const sheet = this.data.sheet;
    if (!sheet || sheet.type !== 'edit' || this.data.saving) return;
    wx.showModal({
      title: '撤销这一条？',
      content: '撤销后库存会跟着回退，这条流水不再计入日报。',
      confirmText: '撤销',
      confirmColor: '#B42318',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ saving: true });
        api
          .deleteShopEvent(sheet.id)
          .then(() => {
            this.setData({ saving: false, sheet: null });
            this.toast('已撤销');
            this.loadList(this.data.day);
          })
          .catch((err) => {
            this.setData({ saving: false });
            this.toast(err.message);
          });
      }
    });
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' })
    });
  },

  toast(title) {
    wx.showToast({ title: title || '操作失败', icon: 'none' });
  }
});
