/**
 * 智能仓储 - 接口层（后端：storage-server，FastAPI + SQLite）
 *
 * 部署形态：局域网直连台式机。
 * - 开发者工具需在「详情 → 本地设置」勾选「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」；
 * - 真机（开发版 / 体验版）在右上角「···」→「开发调试」里打开调试，同样可绕过域名校验；
 * - 换成台式机的 IP / 端口时，只改下面的 BASE_URL 一处。
 */

var BASE_URL = 'http://192.168.31.137:8010';

var TIMEOUT = 8000;

// ==============================
// 基础请求
// ==============================

function networkMessage(err) {
  var raw = (err && err.errMsg) || '';
  if (raw.indexOf('domain list') !== -1) {
    return '域名未放行：请勾选「不校验合法域名」';
  }
  return '连接不上后端，请确认服务已启动且与电脑同一 WiFi';
}

/**
 * 统一请求：后端信封 { code, data, message }，code === 0 视为成功
 * @returns {Promise<any>} resolve 为 data 字段
 */
function request(path, method, data) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: BASE_URL + path,
      method: method || 'GET',
      data: data || {},
      timeout: TIMEOUT,
      header: { 'content-type': 'application/json' },
      success: function (res) {
        var body = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) {
          resolve(body.data);
          return;
        }
        reject(new Error(body.message || ('请求失败（' + res.statusCode + '）')));
      },
      fail: function (err) {
        reject(new Error(networkMessage(err)));
      }
    });
  });
}

// ==============================
// 字段映射：服务端 snake_case ↔ 小程序 camelCase
// ==============================

/** 服务端存的是 naive UTC，补 Z 让 JS 按 UTC 解析成本地时间 */
function normalizeTimestamp(value) {
  if (!value) return '';
  if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) return value;
  return value.replace(' ', 'T') + 'Z';
}

/** 服务端物品 -> 页面用的物品对象 */
function toViewItem(row) {
  var image = row.image_url || '';
  return {
    id: String(row.id),
    name: row.name,
    category: row.category_id,
    quantity: row.quantity,
    unit: row.unit,
    location: row.location || '',
    produceDate: row.produce_date || '',
    expireDate: row.expire_date || '',
    daysLeft: row.days_left === undefined || row.days_left === null ? null : row.days_left,
    status: row.status || null,
    note: row.note || '',
    // image 存相对路径（提交给后端），imageSrc 是可直接渲染的绝对地址
    image: image,
    imageSrc: image ? BASE_URL + image : '',
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at)
  };
}

/** 页面物品 -> 服务端请求体 */
function toPayload(item) {
  var quantity = Number(item.quantity);
  return {
    name: (item.name || '').trim(),
    category_id: item.category || 'other',
    quantity: isNaN(quantity) || quantity <= 0 ? 1 : quantity,
    unit: item.unit || '个',
    location: item.location || '',
    produce_date: item.produceDate || null,
    expire_date: item.expireDate || null,
    note: item.note || '',
    image_url: item.image || null
  };
}

function toViewCategory(row) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    isDefault: !!row.is_default,
    count: row.item_count || 0
  };
}

// ==============================
// 物品
// ==============================

/**
 * 拉取全部物品（自动翻页）。
 * 数据量是家庭仓储级别，一次全量拉到本地做筛选/排序，和原来的本地逻辑保持一致。
 */
function listItems() {
  var collected = [];

  function step(page) {
    var query = '?page=' + page + '&limit=100&sort=created';
    return request('/api/items' + query).then(function (data) {
      (data.items || []).forEach(function (row) {
        collected.push(toViewItem(row));
      });
      if (data.items && data.items.length > 0 && collected.length < data.total) {
        return step(page + 1);
      }
      return collected;
    });
  }

  return step(1);
}

function getItem(id) {
  return request('/api/items/' + encodeURIComponent(id)).then(toViewItem);
}

function createItem(item) {
  return request('/api/items', 'POST', toPayload(item)).then(toViewItem);
}

function updateItem(id, item) {
  return request('/api/items/' + encodeURIComponent(id), 'PUT', toPayload(item)).then(toViewItem);
}

function deleteItem(id) {
  return request('/api/items/' + encodeURIComponent(id), 'DELETE');
}

// ==============================
// 分类
// ==============================

function listCategories() {
  return request('/api/categories').then(function (data) {
    return (data.items || []).map(toViewCategory);
  });
}

function createCategory(name, icon) {
  return request('/api/categories', 'POST', { name: name, icon: icon }).then(toViewCategory);
}

function deleteCategory(id) {
  return request('/api/categories/' + encodeURIComponent(id), 'DELETE');
}

// ==============================
// 图片上传
// ==============================

/**
 * 上传物品照片，返回相对路径（如 /uploads/xxx.jpg），存库时只存这个
 * @param {string} filePath 本地临时文件路径
 */
function uploadImage(filePath) {
  return new Promise(function (resolve, reject) {
    wx.uploadFile({
      url: BASE_URL + '/api/uploads',
      filePath: filePath,
      name: 'file',
      timeout: 20000,
      success: function (res) {
        var body = {};
        try {
          body = JSON.parse(res.data);
        } catch (e) {
          body = {};
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) {
          resolve(body.data.url);
          return;
        }
        reject(new Error(body.message || '图片上传失败'));
      },
      fail: function (err) {
        reject(new Error(networkMessage(err)));
      }
    });
  });
}

module.exports = {
  BASE_URL: BASE_URL,
  request: request,
  toViewItem: toViewItem,
  toPayload: toPayload,
  listItems: listItems,
  getItem: getItem,
  createItem: createItem,
  updateItem: updateItem,
  deleteItem: deleteItem,
  listCategories: listCategories,
  createCategory: createCategory,
  deleteCategory: deleteCategory,
  uploadImage: uploadImage
};
