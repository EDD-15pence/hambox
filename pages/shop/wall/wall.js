/**
 * 店铺记 · 仓库墙（§17 / SH-02~SH-04）
 *
 * 这一页的形态是「一个货架」，不是表单：按品牌分区，一格一个机型，
 * 格子上两个小按钮 —— `+` 进货、`−` 售卖。「不用自己一笔一笔记」的实现
 * 就在这两个按钮里：点一下后端就落一条带时间的流水，日报由流水聚合出来。
 *
 * 三条容易写错的地方：
 * 1. **没有固定售价**（§17.10-7）：点 `−` 先弹价格框、预填上次成交价，
 *    讲价了就改，确认才落库 —— 价格必须是一个确定的数，营收才算得出来。
 * 2. **写入不重试**：`api.js` 只给 GET 换线路重试，POST 超时可能已经写进去了，
 *    重发会多一条账。所以这里失败就提示「再点一次」，绝不自动重发。
 * 3. **连点走串行队列**：SQLite 并发写会 `database is locked`（T-03b），
 *    而且两条请求的返回值顺序不确定，串起来才不会把库存算乱。
 */

const nav = require('../../../utils/nav');
const theme = require('../../../utils/theme');
const api = require('../../../utils/api');
const money = require('../../../utils/money');

// 品牌色块（真实 logo 还没到位时兜底）。品牌色属于「内容色」，不是主题色，
// 所以留在页面里，不进 tokens。
const BRAND_COLORS = ['#0A84FF', '#2E9E5B', '#E08B00', '#C2410C', '#7B61FF', '#0E8C9E', '#8E8E93', '#C2387A'];

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function todayText() {
  const now = new Date();
  return `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAY[now.getDay()]}`;
}

function initialOf(name) {
  const text = String(name || '').trim();
  return text ? text.charAt(0).toUpperCase() : '?';
}

function colorOf(brand) {
  if (brand.tint) return brand.tint;
  const text = String(brand.name || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 9973;
  return BRAND_COLORS[hash % BRAND_COLORS.length];
}

Page({
  data: {
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    isDark: false,
    todayText: todayText(),
    loading: true,
    error: '',
    categories: [],
    category: '手机壳',
    brands: [],
    summary: { inQty: 0, inAmount: '0', outQty: 0, outAmount: '0', gross: '0', grossNegative: false },
    sheet: null,
    // 键盘避让（§5.5）：kb 是键盘高度补偿，sheetFocus 控制「入场动画结束后再聚焦」
    kb: 0,
    sheetFocus: false,
    saving: false
  },

  onLoad() {
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT
    });
    this._chain = Promise.resolve();
  },

  onShow() {
    const isDark = theme.getTheme();
    if (isDark !== this.data.isDark) this.setData({ isDark });
    // 从流水页/补录回来要重拉：那边改过的库存与日报这里得跟上
    this.loadWall(this.data.category);
  },

  onPullDownRefresh() {
    this.loadWall(this.data.category).then(() => wx.stopPullDownRefresh());
  },

  onUnload() {
    if (this._focusTimer) {
      clearTimeout(this._focusTimer);
      this._focusTimer = null;
    }
  },

  onRetry() {
    this.setData({ loading: true, error: '' });
    this.loadWall(this.data.category);
  },

  // ==============================
  // 拉数据
  // ==============================

  loadWall(category) {
    const target = category === undefined ? this.data.category : category;
    return api.shopWall(target)
      .then((wall) => {
        this.setData({
          loading: false,
          error: '',
          categories: wall.categories,
          category: target && wall.categories.indexOf(target) !== -1 ? target : wall.categories[0] || '手机壳',
          brands: this.toBrandGroups(wall.brands),
          summary: this.toSummary(wall.summary)
        });
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message || '拉不到数据' });
      });
  },

  /** 每次只刷日报，不动格子（点一下之后库存已经本地更新过了，别闪一下） */
  refreshSummary() {
    if (this._summaryTimer) clearTimeout(this._summaryTimer);
    this._summaryTimer = setTimeout(() => {
      api.shopSummary()
        .then((summary) => this.setData({ summary: this.toSummary(summary) }))
        .catch(() => {});
    }, 240);
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

  toBrandGroups(groups) {
    return groups.map((group) => {
      const brand = group.brand;
      return {
        id: brand.id,
        name: brand.name,
        logo: brand.logo,
        // 有路径就尝试加载；加载成功才盖住下面的首字色块（见 wxml 的层叠写法）
        logoOk: !!brand.logo,
        logoLoaded: false,
        initial: initialOf(brand.name),
        color: colorOf(brand),
        skus: group.skus.map((sku) => this.toCell(sku))
      };
    });
  },

  toCell(sku) {
    return {
      id: sku.id,
      brandId: sku.brandId,
      model: sku.model,
      category: sku.category,
      quantity: sku.quantity,
      costText: money.text(sku.costFen),
      lastSaleText: sku.lastSaleFen ? money.text(sku.lastSaleFen) : '',
      // 没货时 `−` 置灰：点了也只会被后端拒，不如别让人点
      soldOut: sku.quantity <= 0
    };
  },

  // ==============================
  // 品类 / 品牌 logo
  // ==============================

  onPickCategory(e) {
    const category = e.currentTarget.dataset.category;
    if (category === this.data.category) return;
    wx.vibrateShort({ type: 'light' });
    this.setData({ category, loading: true });
    this.loadWall(category);
  },

  /** 品牌 logo 加载失败 → 只关掉尝试，底下的首字色块仍在。素材没给齐也不会破图 */
  onLogoError(e) {
    const brandId = Number(e.currentTarget.dataset.brand);
    this.patchBrand(brandId, { logoOk: false });
  },

  /** logo 真的画出来了才藏掉首字层：不依赖 error 事件也能保证不会白框 */
  onLogoLoad(e) {
    const brandId = Number(e.currentTarget.dataset.brand);
    this.patchBrand(brandId, { logoLoaded: true });
  },

  patchBrand(brandId, patch) {
    this.setData({
      brands: this.data.brands.map((group) =>
        group.id === brandId ? Object.assign({}, group, patch) : group
      )
    });
  },

  // ==============================
  // 点击：进货 / 售卖
  // ==============================

  /** 串行队列：上一笔没回来不发下一笔，避免连点把库存算乱 */
  enqueue(task) {
    const run = () => task();
    this._chain = (this._chain || Promise.resolve()).then(run, run);
    return this._chain;
  },

  findCell(skuId) {
    for (const group of this.data.brands) {
      const cell = group.skus.find((item) => item.id === skuId);
      if (cell) return cell;
    }
    return null;
  },

  /** 本地改一格库存（乐观更新）。失败时反向调一次就是回滚 */
  bumpCell(skuId, delta) {
    const brands = this.data.brands.map((group) => {
      if (!group.skus.some((item) => item.id === skuId)) return group;
      return Object.assign({}, group, {
        skus: group.skus.map((item) => {
          if (item.id !== skuId) return item;
          const quantity = Math.max(item.quantity + delta, 0);
          return Object.assign({}, item, { quantity, soldOut: quantity <= 0 });
        })
      });
    });
    this.setData({ brands });
  },

  applySku(sku) {
    if (!sku) return;
    const cell = this.toCell(sku);
    const brands = this.data.brands.map((group) => {
      if (!group.skus.some((item) => item.id === cell.id)) return group;
      return Object.assign({}, group, {
        skus: group.skus.map((item) => (item.id === cell.id ? cell : item))
      });
    });
    this.setData({ brands });
  },

  /** `+` 进货 +1：不弹框，进价沿用格子当前成本（想改就长按格子） */
  onBuy(e) {
    const skuId = Number(e.currentTarget.dataset.id);
    wx.vibrateShort({ type: 'light' });
    this.bumpCell(skuId, 1);
    this.refreshSummary();
    this.enqueue(() =>
      api
        .createShopEvent({ skuId, direction: 'in', qty: 1 })
        .then((result) => {
          this.applySku(result.sku);
          this.refreshSummary();
        })
        .catch((err) => {
          this.bumpCell(skuId, -1);
          this.refreshSummary();
          this.toast(err.message);
        })
    );
  },

  /** `−` 售卖：先要一个成交价（§17.10-7 的唯一例外） */
  onSellTap(e) {
    const skuId = Number(e.currentTarget.dataset.id);
    const cell = this.findCell(skuId);
    if (!cell) return;
    if (cell.quantity <= 0) {
      this.toast('这件没货了，先点 + 进货');
      return;
    }
    const group = this.data.brands.find((item) => item.id === cell.brandId);
    wx.vibrateShort({ type: 'light' });
    this.setData({
      sheetFocus: false,
      sheet: {
        type: 'sell',
        skuId,
        title: `${group ? group.name + ' · ' : ''}${cell.model}`,
        price: cell.lastSaleText,
        // 上次卖过就说明这是默认价，改价要主动清空再输
        hint: cell.lastSaleText ? '上次成交价，讲价了直接改' : '填这次成交价'
      }
    });
    this.focusAfterEnter();
  },

  /**
   * 入场动画（`.ui-sheet` 的 `ui-sheet-in` 220ms）跑完再聚焦。
   *
   * 弹层还在 `translateY(100%)` 时拉起键盘，微信按此刻坐标算上推量，
   * 输入框就落在键盘下面 —— 这就是「关掉键盘再打开才出现」的成因（§10-23）。
   * 取 240ms 留一点余量；`onSheetClose` 会把定时器清掉，快速开关不会残留。
   */
  focusAfterEnter() {
    if (this._focusTimer) clearTimeout(this._focusTimer);
    this._focusTimer = setTimeout(() => {
      this._focusTimer = null;
      if (this.data.sheet) this.setData({ sheetFocus: true });
    }, 240);
  },

  onFieldFocus(e) {
    this.setData({ kb: (e.detail && e.detail.height) || 0 });
  },

  onFieldBlur() {
    this.setData({ kb: 0 });
  },

  /** 增强路径：部分机型 `bindfocus` 给的高度不含 safe-area，这里以键盘回调为准 */
  onKeyboardHeight(e) {
    const height = (e.detail && e.detail.height) || 0;
    if (height !== this.data.kb) this.setData({ kb: height });
  },

  onSheetClose() {
    if (this.data.saving) return;
    if (this._focusTimer) {
      clearTimeout(this._focusTimer);
      this._focusTimer = null;
    }
    wx.hideKeyboard();
    this.setData({ sheet: null, sheetFocus: false, kb: 0 });
  },

  onNoop() {},

  onPriceInput(e) {
    this.setData({ 'sheet.price': e.detail.value });
  },

  onConfirmSell() {
    const sheet = this.data.sheet;
    if (!sheet || sheet.type !== 'sell' || this.data.saving) return;
    const fen = money.toFen(sheet.price);
    if (fen === null) {
      this.toast('成交价填个数字');
      return;
    }
    const skuId = sheet.skuId;
    this.setData({ saving: true, sheet: null });
    this.bumpCell(skuId, -1);
    this.refreshSummary();
    this.enqueue(() =>
      api
        .createShopEvent({ skuId, direction: 'out', qty: 1, unitPriceFen: fen })
        .then((result) => {
          this.setData({ saving: false });
          this.applySku(result.sku);
          this.refreshSummary();
          this.toast(`卖出 ¥${money.text(fen)}`);
        })
        .catch((err) => {
          this.setData({ saving: false });
          this.bumpCell(skuId, 1);
          this.refreshSummary();
          this.toast(err.message);
        })
    );
  },

  // ==============================
  // 长按：改成本价 / 改机型 / 删除
  // ==============================

  onCellLongPress(e) {
    const skuId = Number(e.currentTarget.dataset.id);
    const cell = this.findCell(skuId);
    if (!cell) return;
    const group = this.data.brands.find((item) => item.id === cell.brandId);
    wx.vibrateShort({ type: 'medium' });
    this.setData({
      sheet: {
        type: 'manage',
        skuId,
        title: `${group ? group.name + ' · ' : ''}${cell.model}`,
        brandName: group ? group.name : '',
        model: cell.model,
        category: cell.category,
        cost: cell.costText,
        quantity: cell.quantity
      }
    });
  },

  onManageField(e) {
    const field = e.currentTarget.dataset.field;
    const patch = {};
    patch['sheet.' + field] = e.detail.value;
    this.setData(patch);
  },

  onPickManageCategory(e) {
    this.setData({ 'sheet.category': e.currentTarget.dataset.category });
  },

  onSaveManage() {
    const sheet = this.data.sheet;
    if (!sheet || sheet.type !== 'manage' || this.data.saving) return;
    const fen = money.toFen(sheet.cost);
    if (fen === null) {
      this.toast('成本价填个数字');
      return;
    }
    const model = String(sheet.model || '').trim();
    if (!model) {
      this.toast('机型名不能空着');
      return;
    }
    this.setData({ saving: true });
    api
      .updateShopSku(sheet.skuId, { model, category: sheet.category, costFen: fen })
      .then((sku) => {
        this.setData({ saving: false, sheet: null });
        this.applySku(sku);
        this.toast('改好了');
      })
      .catch((err) => {
        this.setData({ saving: false });
        this.toast(err.message);
      });
  },

  onDeleteSku() {
    const sheet = this.data.sheet;
    if (!sheet || this.data.saving) return;
    wx.showModal({
      title: '删掉这个格子？',
      content: '记过账的格子会下架，历史流水保留；没记过账的直接删除。',
      confirmText: '删掉',
      confirmColor: '#B42318',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ saving: true });
        api
          .deleteShopSku(sheet.skuId)
          .then((result) => {
            this.setData({ saving: false, sheet: null });
            this.removeCell(sheet.skuId);
            this.toast(result && result.disabled ? '已下架，流水还在' : '已删除');
          })
          .catch((err) => {
            this.setData({ saving: false });
            this.toast(err.message);
          });
      }
    });
  },

  removeCell(skuId) {
    const brands = this.data.brands
      .map((group) =>
        Object.assign({}, group, { skus: group.skus.filter((item) => item.id !== skuId) })
      )
      .filter((group) => group.skus.length);
    this.setData({ brands });
  },

  // ==============================
  // 新增格子
  // ==============================

  onOpenAdd() {
    const firstBrand = this.data.brands[0];
    this.setData({
      sheet: {
        type: 'add',
        title: '新增一个机型',
        brandId: firstBrand ? firstBrand.id : 0,
        model: '',
        category: this.data.category,
        cost: '',
        brands: this.data.brands.map((group) => ({
          id: group.id,
          name: group.name,
          initial: group.initial,
          color: group.color,
          logo: group.logo,
          logoOk: group.logoOk
        }))
      }
    });
  },

  onPickAddBrand(e) {
    this.setData({ 'sheet.brandId': Number(e.currentTarget.dataset.brand) });
  },

  onPickAddCategory(e) {
    this.setData({ 'sheet.category': e.currentTarget.dataset.category });
  },

  /** 新品牌：素材没给也能建，墙上先显示首字色块 */
  onAddBrand() {
    wx.showModal({
      title: '新品牌',
      editable: true,
      placeholderText: '品牌名，如 一加',
      success: (res) => {
        const name = String((res && res.content) || '').trim();
        if (!res.confirm || !name) return;
        api
          .createShopBrand({ name })
          .then((brand) => {
            const brands = this.data.brands.concat([
              {
                id: brand.id,
                name: brand.name,
                logo: brand.logo,
                logoOk: !!brand.logo,
                logoLoaded: false,
                initial: initialOf(brand.name),
                color: colorOf(brand),
                skus: []
              }
            ]);
            this.setData({
              brands,
              'sheet.brands': brands.map((group) => ({
                id: group.id,
                name: group.name,
                initial: group.initial,
                color: group.color,
                logo: group.logo,
                logoOk: group.logoOk
              })),
              'sheet.brandId': brand.id
            });
          })
          .catch((err) => this.toast(err.message));
      }
    });
  },

  onSaveAdd() {
    const sheet = this.data.sheet;
    if (!sheet || sheet.type !== 'add' || this.data.saving) return;
    const model = String(sheet.model || '').trim();
    if (!model) {
      this.toast('机型名不能空着');
      return;
    }
    const fen = money.toFen(sheet.cost);
    this.setData({ saving: true });
    api
      .createShopSku({
        brandId: sheet.brandId,
        model,
        category: sheet.category,
        costFen: fen === null ? 0 : fen
      })
      .then(() => {
        this.setData({ saving: false, sheet: null, category: sheet.category });
        this.toast('加好了');
        this.loadWall(sheet.category);
      })
      .catch((err) => {
        this.setData({ saving: false });
        this.toast(err.message);
      });
  },

  // ==============================

  onOpenEvents() {
    wx.navigateTo({ url: '/pages/shop/events/events' });
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
