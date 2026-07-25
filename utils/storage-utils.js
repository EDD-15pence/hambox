/**
 * 智能仓储 - 数据层工具库
 * 纯函数，负责物品数据的 CRUD、分类管理、过期计算、搜索过滤
 */

// ==============================
// 常量
// ==============================

const STORAGE_ITEMS_KEY = 'storage_items';
const STORAGE_CATEGORIES_KEY = 'storage_custom_categories';
const STORAGE_SORT_KEY = 'storage_sort';

/** 预设分类（不可删除） */
const DEFAULT_CATEGORIES = [
  { id: 'food', name: '食品', icon: '🍔' },
  { id: 'beverage', name: '饮品', icon: '🥤' },
  { id: 'daily', name: '日用品', icon: '🧴' },
  { id: 'medicine', name: '药品', icon: '💊' },
  { id: 'cosmetic', name: '化妆品', icon: '💄' },
  { id: 'seasoning', name: '调味品', icon: '🧂' },
  { id: 'frozen', name: '冷冻食品', icon: '❄️' },
  { id: 'other', name: '其他', icon: '📦' }
];

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
// 数据存取
// ==============================

/** 加载所有物品，自动重算 daysLeft 和 status */
function loadItems() {
  var raw = wx.getStorageSync(STORAGE_ITEMS_KEY) || '[]';
  var items = [];
  try {
    items = JSON.parse(raw);
  } catch (e) {
    items = [];
  }
  // 重算动态字段
  items.forEach(function (item) {
    if (item.expireDate) {
      item.daysLeft = calcDaysLeft(item.expireDate);
      item.status = calcStatus(item.daysLeft);
    } else {
      item.daysLeft = null;
      item.status = null;
    }
  });
  return items;
}

/** 保存物品列表 */
function saveItems(items) {
  try {
    wx.setStorageSync(STORAGE_ITEMS_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('保存物品失败', e);
  }
}

/** 加载分类列表（合并默认 + 自定义） */
function loadCategories() {
  var raw = wx.getStorageSync(STORAGE_CATEGORIES_KEY) || '[]';
  var customs = [];
  try {
    customs = JSON.parse(raw);
  } catch (e) {
    customs = [];
  }
  return DEFAULT_CATEGORIES.concat(customs);
}

/** 只获取自定义分类（用于管理弹窗） */
function loadCustomCategories() {
  var raw = wx.getStorageSync(STORAGE_CATEGORIES_KEY) || '[]';
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

/** 保存自定义分类 */
function saveCustomCategories(customs) {
  try {
    wx.setStorageSync(STORAGE_CATEGORIES_KEY, JSON.stringify(customs));
  } catch (e) {
    console.warn('保存分类失败', e);
  }
}

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
// CRUD 辅助
// ==============================

/** 按 ID 查找物品 */
function getItemById(items, id) {
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === id) return items[i];
  }
  return null;
}

/**
 * 创建新物品对象
 * @param {Object} data - 表单数据
 */
function createItem(data) {
  var now = new Date().toISOString();
  var item = {
    id: Date.now().toString(),
    name: data.name || '',
    category: data.category || 'other',
    quantity: Number(data.quantity) || 1,
    unit: data.unit || '个',
    location: data.location || '',
    produceDate: data.produceDate || '',
    expireDate: data.expireDate || '',
    daysLeft: null,
    status: null,
    note: data.note || '',
    image: data.image || '',
    createdAt: now,
    updatedAt: now
  };
  // 计算过期状态
  if (item.expireDate) {
    item.daysLeft = calcDaysLeft(item.expireDate);
    item.status = calcStatus(item.daysLeft);
  }
  return item;
}

/**
 * 更新物品
 * @param {Array} items - 现有物品列表
 * @param {string} id
 * @param {Object} data - 新数据
 */
function updateItem(items, id, data) {
  var updated = items.slice();
  for (var i = 0; i < updated.length; i++) {
    if (updated[i].id === id) {
      updated[i] = Object.assign({}, updated[i], {
        name: data.name !== undefined ? data.name : updated[i].name,
        category: data.category !== undefined ? data.category : updated[i].category,
        quantity: data.quantity !== undefined ? Number(data.quantity) || 1 : updated[i].quantity,
        unit: data.unit !== undefined ? data.unit : updated[i].unit,
        location: data.location !== undefined ? data.location : updated[i].location,
        produceDate: data.produceDate !== undefined ? data.produceDate : updated[i].produceDate,
        expireDate: data.expireDate !== undefined ? data.expireDate : updated[i].expireDate,
        note: data.note !== undefined ? data.note : updated[i].note,
        image: data.image !== undefined ? data.image : updated[i].image,
        updatedAt: new Date().toISOString()
      });
      // 重算过期状态
      if (updated[i].expireDate) {
        updated[i].daysLeft = calcDaysLeft(updated[i].expireDate);
        updated[i].status = calcStatus(updated[i].daysLeft);
      } else {
        updated[i].daysLeft = null;
        updated[i].status = null;
      }
      break;
    }
  }
  return updated;
}

/** 删除物品 */
function deleteItem(items, id) {
  return items.filter(function (item) {
    return item.id !== id;
  });
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
  DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
  PRESET_UNITS: PRESET_UNITS,
  STORAGE_ITEMS_KEY: STORAGE_ITEMS_KEY,
  STORAGE_CATEGORIES_KEY: STORAGE_CATEGORIES_KEY,
  STORAGE_SORT_KEY: STORAGE_SORT_KEY,

  // 日期工具
  formatDate: formatDate,
  todayDate: todayDate,
  calcDaysLeft: calcDaysLeft,
  calcStatus: calcStatus,
  calcExpireFromMonths: calcExpireFromMonths,

  // 存取
  loadItems: loadItems,
  saveItems: saveItems,
  loadCategories: loadCategories,
  loadCustomCategories: loadCustomCategories,
  saveCustomCategories: saveCustomCategories,
  loadSortPreference: loadSortPreference,
  saveSortPreference: saveSortPreference,

  // 筛选排序
  filterItems: filterItems,
  sortItems: sortItems,

  // CRUD
  getItemById: getItemById,
  createItem: createItem,
  updateItem: updateItem,
  deleteItem: deleteItem,

  // Banner
  getStatusBanner: getStatusBanner
};
