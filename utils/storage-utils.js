/**
 * 智能仓储 - 本地工具库
 * 数据本身存在 storage-server（见 utils/api.js），这里只保留纯函数：
 * 日期/过期计算、筛选、排序、顶部提醒统计、排序偏好。
 */

// ==============================
// 常量
// ==============================

const STORAGE_SORT_KEY = 'storage_sort';

/** 预设单位 */
const PRESET_UNITS = ['瓶', '袋', '箱', '个', '盒', '包', '罐', '斤', 'kg', 'L'];

// ==============================
// 日期工具
// ==============================

/** 格式化日期对象 -> 'YYYY-MM-DD' */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

/** 今天的日期字符串 */
function todayDate() {
  return formatDate(new Date());
}

/**
 * 计算剩余天数（过期日期 - 今天）
 * @param {string} expireDate - 'YYYY-MM-DD' 或空
 * @returns {number|null} 正数为剩余天数，负数为已过期天数，null 表示无过期日
 */
function calcDaysLeft(expireDate) {
  if (!expireDate) return null;
  var today = new Date(todayDate());
  var expire = new Date(expireDate);
  return Math.floor((expire.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 根据剩余天数计算状态
 * @param {number|null} daysLeft
 * @returns {string|null} 'fresh' | 'warning' | 'expired' | null
 */
function calcStatus(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return null;
  if (daysLeft > 30) return 'fresh';
  if (daysLeft > 0) return 'warning';
  return 'expired';
}

/**
 * 根据生产日期和月数计算过期日期
 * @param {string} produceDate - 'YYYY-MM-DD'
 * @param {number} months
 * @returns {string} 'YYYY-MM-DD'
 */
function calcExpireFromMonths(produceDate, months) {
  if (!produceDate || !months) return '';
  var date = new Date(produceDate);
  date.setMonth(date.getMonth() + months);
  return formatDate(date);
}

// ==============================
// 本地偏好
// ==============================

/** 加载排序偏好 */
function loadSortPreference() {
  return wx.getStorageSync(STORAGE_SORT_KEY) || 'expiry';
}

/** 保存排序偏好 */
function saveSortPreference(pref) {
  wx.setStorageSync(STORAGE_SORT_KEY, pref);
}

// ==============================
// 筛选与排序
// ==============================

/**
 * 按关键字和分类筛选物品
 * @param {Array} items
 * @param {string} keyword - 搜索关键字（匹配名称/位置/备注）
 * @param {string} categoryId - 分类ID，'all' 表示全部
 */
function filterItems(items, keyword, categoryId) {
  var filtered = items;
  if (categoryId && categoryId !== 'all') {
    filtered = filtered.filter(function (item) {
      return item.category === categoryId;
    });
  }
  if (keyword && keyword.trim()) {
    var kw = keyword.trim().toLowerCase();
    filtered = filtered.filter(function (item) {
      return (item.name && item.name.toLowerCase().indexOf(kw) !== -1) ||
        (item.location && item.location.toLowerCase().indexOf(kw) !== -1) ||
        (item.note && item.note.toLowerCase().indexOf(kw) !== -1);
    });
  }
  return filtered;
}

/**
 * 排序物品
 * @param {Array} items
 * @param {string} sortBy - 'expiry' (快过期优先) | 'created' (最近添加)
 */
function sortItems(items, sortBy) {
  var sorted = items.slice();
  if (sortBy === 'expiry') {
    sorted.sort(function (a, b) {
      // 无过期日的排最后
      if (a.daysLeft === null && b.daysLeft === null) return 0;
      if (a.daysLeft === null) return 1;
      if (b.daysLeft === null) return -1;
      return a.daysLeft - b.daysLeft;
    });
  } else {
    sorted.sort(function (a, b) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }
  return sorted;
}

// ==============================
// Banner 状态
// ==============================

/**
 * 获取顶部提醒条数据
 * @returns {{ show: boolean, expiredCount: number, warningCount: number }}
 */
function getStatusBanner(items) {
  var expiredCount = 0;
  var warningCount = 0;
  items.forEach(function (item) {
    if (item.status === 'expired') expiredCount++;
    else if (item.status === 'warning') warningCount++;
  });
  return {
    show: expiredCount > 0 || warningCount > 0,
    expiredCount: expiredCount,
    warningCount: warningCount
  };
}

// ==============================
// 导出
// ==============================
module.exports = {
  // 常量
  PRESET_UNITS: PRESET_UNITS,
  STORAGE_SORT_KEY: STORAGE_SORT_KEY,

  // 日期工具
  formatDate: formatDate,
  todayDate: todayDate,
  calcDaysLeft: calcDaysLeft,
  calcStatus: calcStatus,
  calcExpireFromMonths: calcExpireFromMonths,

  // 本地偏好
  loadSortPreference: loadSortPreference,
  saveSortPreference: saveSortPreference,

  // 筛选排序
  filterItems: filterItems,
  sortItems: sortItems,

  // Banner
  getStatusBanner: getStatusBanner
};
