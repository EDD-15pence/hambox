/**
 * 记录 · 日历月视图（R-02）
 *
 * 一天一格，有记录的日子带小圆点，点进去看当天所有条目。
 * 聚合由后端算（`days`：日期 / 条数 / 第一条标题），这里只负责画格子 ——
 * 前端自己按 `entryDate` 分组会多一份「同一天」的定义，早晚和后端对不上。
 *
 * 格子只放日号 + 圆点：7 列在手机上每格不到 100rpx，塞标题会全变成省略号。
 * 标题留给详情页，日历只做索引（§11.2）。
 */
var auth = require('../../utils/auth');
var nav = require('../../utils/nav');
var theme = require('../../utils/theme');
var api = require('../../utils/api');

var WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function pad2(value) {
  return value < 10 ? '0' + value : '' + value;
}

function monthKey(year, month) {
  return year + '-' + pad2(month);
}

function dateKey(year, month, day) {
  return year + '-' + pad2(month) + '-' + pad2(day);
}

function todayKey() {
  var now = new Date();
  return dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

Page({
  data: {
    isDark: false,
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    year: 0,
    month: 0,
    monthLabel: '',
    weekLabels: WEEK_LABELS,
    cells: [],
    total: 0,
    loading: true,
    error: ''
  },

  onLoad: function () {
    if (!auth.guard('record')) return;
    var now = new Date();
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT,
      year: now.getFullYear(),
      month: now.getMonth() + 1
    });
    this.buildMonth([]);
    this.load();
  },

  onShow: function () {
    // 从详情页回来时当天可能多了/少了条目，重新拉一次
    if (this.data.year) this.load();
  },

  /** 按当前年月铺格子。6 行还是 5 行由「首日偏移 + 当月天数」算，不写死 */
  buildMonth: function (days) {
    var year = this.data.year;
    var month = this.data.month;
    if (!year || !month) return;

    var firstWeekday = new Date(year, month - 1, 1).getDay();
    var dayCount = new Date(year, month, 0).getDate();
    var rows = Math.ceil((firstWeekday + dayCount) / 7);
    var today = todayKey();

    var countByDate = {};
    (days || []).forEach(function (item) {
      countByDate[item.date] = item.count;
    });

    var cells = [];
    for (var i = 0; i < rows * 7; i += 1) {
      var day = i - firstWeekday + 1;
      var inMonth = day >= 1 && day <= dayCount;
      var cell = {
        key: 'c' + i,
        inMonth: inMonth,
        day: inMonth ? day : '',
        date: inMonth ? dateKey(year, month, day) : '',
        count: 0,
        isToday: false
      };
      if (inMonth) {
        cell.count = countByDate[cell.date] || 0;
        cell.isToday = cell.date === today;
      }
      cells.push(cell);
    }

    this.setData({
      cells: cells,
      monthLabel: year + ' 年 ' + month + ' 月'
    });
  },

  load: function () {
    var self = this;
    this.setData({ loading: true, error: '' });
    api.listEntriesByMonth(monthKey(this.data.year, this.data.month))
      .then(function (data) {
        self.setData({ loading: false, total: data.total });
        self.buildMonth(data.days);
      })
      .catch(function (err) {
        self.setData({
          loading: false,
          total: 0,
          error: (err && err.message) || '没拉到记录'
        });
        self.buildMonth([]);
      });
  },

  onRetry: function () {
    this.load();
  },

  onPrevMonth: function () {
    var year = this.data.year;
    var month = this.data.month - 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    this.setData({ year: year, month: month });
    this.buildMonth([]);
    this.load();
  },

  onNextMonth: function () {
    var year = this.data.year;
    var month = this.data.month + 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    this.setData({ year: year, month: month });
    this.buildMonth([]);
    this.load();
  },

  /** 空的格子也能点：选个日期直接开始记 */
  onPickDay: function (e) {
    var date = e.currentTarget.dataset.date;
    if (!date) return;
    wx.navigateTo({ url: '/pages/record/day?date=' + date });
  },

  onGoAnswer: function () {
    wx.navigateTo({ url: '/pages/answer/index' });
  },

  onBack: function () {
    wx.navigateBack({
      delta: 1,
      fail: function () { wx.reLaunch({ url: '/pages/index/index' }); }
    });
  }
});
