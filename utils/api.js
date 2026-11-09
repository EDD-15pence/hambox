/**
 * 智能仓储 - 接口层（后端：storage-server，FastAPI + SQLite）
 *
 * 部署形态：家里走局域网直连台式机，在外面走 lucky 反代的 HTTPS 域名。
 * 地址与令牌都配在 utils/env.js，这里只管发请求。
 * - 开发者工具需在「详情 → 本地设置」勾选「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」；
 * - 真机（开发版 / 体验版）在右上角「···」→「开发调试」里打开调试，同样可绕过域名校验；
 * - 正式版必须 HTTPS + 已备案域名 + mp 后台 request 合法域名（只能用 443）。
 */

var env = require('./env');

var TIMEOUT = 8000;
// 内网不通时没必要等满 8 秒：同一 WiFi 下 3 秒还没响应基本就是不在家
var LAN_TIMEOUT = 3000;

// ==============================
// 基础请求
// ==============================

function authHeader() {
  var header = { 'content-type': 'application/json' };
  var token = env.getToken();
  if (token) header['X-Api-Token'] = token;
  return header;
}

function networkMessage(err, triedAll) {
  var raw = (err && err.errMsg) || '';
  if (raw.indexOf('domain list') !== -1) {
    return '域名未放行：请勾选「不校验合法域名」';
  }
  if (raw.indexOf('timeout') !== -1) {
    return triedAll ? '连接超时：内网和外网都没通' : '连接超时，请确认后端已启动';
  }
  return triedAll
    ? '连不上后端：内网和外网都试过了，检查 WiFi 与 lucky 是否正常'
    : '连接不上后端，请确认服务已启动且与电脑同一 WiFi';
}

/**
 * 统一请求：后端信封 { code, data, message }，code === 0 视为成功
 *
 * 只有 GET 会在网络失败时换线路重试。写操作重试有风险——超时并不代表
 * 服务端没收到，重发可能多出一条记录，所以宁可报错让用户自己再点一次。
 *
 * @returns {Promise<any>} resolve 为 data 字段
 */
function request(path, method, data) {
  method = method || 'GET';
  var list = env.candidates();
  if (!list.length) {
    return Promise.reject(new Error('后端地址还没配置，请填 utils/env.js 的 ENDPOINTS'));
  }
  var retryable = method === 'GET';

  return new Promise(function (resolve, reject) {
    var index = 0;

    function go() {
      var ep = list[index];
      wx.request({
        url: ep.base + path,
        method: method,
        data: data || {},
        timeout: ep.key === 'lan' ? LAN_TIMEOUT : TIMEOUT,
        header: authHeader(),
        success: function (res) {
          // 能拿到响应就说明这条线路通，先记下来再判业务结果
          env.markOk(ep.key);
          var body = res.data || {};
          if (res.statusCode === 401) {
            reject(new Error('访问令牌不对：请核对后端 .env 的 API_TOKEN 与 utils/env.js'));
            return;
          }
          if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) {
            resolve(body.data);
            return;
          }
          reject(new Error(body.message || ('请求失败（' + res.statusCode + '）')));
        },
        fail: function (err) {
          env.markFail(ep.key);
          index += 1;
          var exhausted = index >= list.length;
          if (retryable && !exhausted) {
            go();
            return;
          }
          // 写操作不重试，但可以告诉用户"再点一次"就够了——下次请求已换到另一条线路
          var message = networkMessage(err, exhausted);
          if (!retryable && !exhausted) {
            message = '连接不稳定，再点一次会自动换线路';
          }
          reject(new Error(message));
        }
      });
    }

    go();
  });
}

/**
 * 启动时探一次路：命中哪条就把它写进缓存，省得首页第一次请求白等超时
 */
function probe() {
  var list = env.candidates();
  if (!list.length) return Promise.resolve('');
  return request('/api/health').then(function () {
    return env.getRouteLabel();
  }).catch(function () {
    return '';
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
    imageSrc: image ? env.getBaseUrl() + image : '',
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
  var list = env.candidates();
  var base = list.length ? list[0].base : '';
  if (!base) {
    return Promise.reject(new Error('后端地址还没配置，请填 utils/env.js 的 ENDPOINTS'));
  }
  return new Promise(function (resolve, reject) {
    wx.uploadFile({
      url: base + '/api/uploads',
      filePath: filePath,
      name: 'file',
      timeout: 20000,
      header: authHeader(),
      success: function (res) {
        var body = {};
        try {
          body = JSON.parse(res.data);
        } catch (e) {
          body = {};
        }
        if (res.statusCode === 401) {
          reject(new Error('访问令牌不对：请核对后端 .env 的 API_TOKEN 与 utils/env.js'));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) {
          resolve(body.data.url);
          return;
        }
        reject(new Error(body.message || '图片上传失败'));
      },
      fail: function (err) {
        reject(new Error(networkMessage(err, false)));
      }
    });
  });
}

module.exports = {
  getBaseUrl: env.getBaseUrl,
  probe: probe,
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
