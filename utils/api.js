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
var auth = require('./auth');

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
  // 身份层（U-02）：没登录时不带，后端会按「没身份」处理。
  // 与 X-Api-Token 是两道独立的关，互不替代。
  var session = auth.getToken();
  if (session) header['X-Session'] = session;
  return header;
}

/**
 * 把 wx 的原始 errMsg 压成一句人话。
 * 只在「两条线路都失败」时用来展示，所以宁可短，不能糊。
 */
function shortReason(errMsg) {
  var m = errMsg || '';
  if (m.indexOf('domain list') !== -1) return '域名不在白名单';
  if (m.indexOf('timeout') !== -1) return '超时';
  if (m.indexOf('ERR_NAME_NOT_RESOLVED') !== -1) return 'DNS 解析失败';
  if (m.indexOf('ERR_CONNECTION_REFUSED') !== -1) return '连接被拒（没人监听或防火墙拦）';
  if (m.indexOf('ERR_CONNECTION_RESET') !== -1) return '连接被重置';
  if (m.indexOf('ERR_CONNECTION_TIMED_OUT') !== -1) return '连接超时（常见于入站被防火墙丢包）';
  if (m.indexOf('ssl') !== -1 || m.indexOf('certificate') !== -1) return 'TLS/证书错误';
  var rest = m.replace(/^request:fail\s*/, '').trim();
  return rest ? rest.slice(0, 36) : '未知错误';
}

function networkMessage(err, triedAll, ep) {
  var raw = (err && err.errMsg) || '';
  var base = ep && ep.base ? ep.base : '后端地址';
  if (raw.indexOf('domain list') !== -1) {
    // 开发者工具能勾「不校验合法域名」，真机只能靠后台白名单，两者提示不能混
    if (env.isDevtools()) {
      return '域名未放行：开发者工具「详情 → 本地设置」勾上「不校验合法域名」';
    }
    if (ep && ep.key === 'lan') {
      return '内网线路被拦：真机只认 HTTPS 域名，' + base + ' 不可能进白名单';
    }
    return '域名未放行：' + base + ' 不在 mp 后台 request 合法域名里，或改完没退出小程序重进';
  }
  if (raw.indexOf('timeout') !== -1) {
    return triedAll ? '连接超时：局域网和外网都没通' : '连接超时，请确认后端已启动';
  }
  if (triedAll) return '连不上后端：局域网和外网都试过了，检查 WiFi 与 lucky 是否正常';
  // 外网线路不谈「同一 WiFi」，那会把 5G 用户带偏
  if (ep && ep.key === 'wan') {
    return '连不上外网后端（' + base + '），检查手机网络或域名是否可访问';
  }
  return '连接不上后端，请确认服务已启动且与电脑处于同一局域网（' + base + '）';
}

/**
 * 全部线路都失败时的提示。
 *
 * 踩过的坑：真机顺序是 wan -> lan，5G 下内网那条必然失败，
 * 以前只报「最后一条」的错误，于是把外网的真实原因盖住了，
 * 看起来像是内网 IP 的锅。这里把每条线路的原因都列出来。
 */
function exhaustedMessage(errors) {
  var parts = errors.map(function (item) {
    return (item.key === 'wan' ? '外网 ' : '内网 ') + shortReason(item.errMsg);
  });
  var detail = parts.join('，');
  var allDomain = errors.every(function (item) {
    return (item.errMsg || '').indexOf('domain list') !== -1;
  });
  if (allDomain) {
    // 两条都是域名校验：说明根本没走网络，IPv6 / WiFi 都无关
    return '两条线路都被域名校验拦下（' + detail +
      '）：去 mp 后台「开发管理 → 服务器域名」确认 request 合法域名真的保存成功（每月修改次数有上限，超限不报错）';
  }
  return '两条线路都不通（' + detail + '）';
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
    var errors = [];

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
          errors.push({ key: ep.key, errMsg: (err && err.errMsg) || '' });
          index += 1;
          var exhausted = index >= list.length;
          if (retryable && !exhausted) {
            go();
            return;
          }
          // 写操作不重试，但可以告诉用户"再点一次"就够了——下次请求已换到另一条线路
          var message = exhausted
            ? exhaustedMessage(errors)
            : networkMessage(err, false, ep);
          if (!retryable && !exhausted) {
            message = '连接不稳定，再点一次会自动换线路（上一次：' + shortReason(err.errMsg) + '）';
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
// 身份（U-02）
// ==============================

/**
 * 换会话。
 *
 * `code` 来自 `wx.login`，后端有 appsecret 时会拿它换真 openid；
 * 没有时用 `dev_openid` 顶上（后端 `auth_dev_mode`）。两个都传，
 * 由后端决定用哪个 —— 前端不必知道自己有没有配钥匙。
 *
 * 成败都在 `app.js` 里静默处理：登录不该阻塞首页，也不该弹错误。
 */
function createSession(body) {
  return request('/api/auth/session', 'POST', {
    code: (body && body.code) || '',
    dev_openid: (body && body.dev_openid) || ''
  });
}

/** 当前身份 + 这份 ACL（会话无效时后端返 401） */
function fetchMe() {
  return request('/api/auth/me');
}

/** `wx.login` 拿 code 后再换会话；拿不到 code 也继续（调试身份不需要它） */
function loginWithWechat() {
  return new Promise(function (resolve) {
    wx.login({
      success: function (res) {
        resolve((res && res.code) || '');
      },
      fail: function () {
        resolve('');
      }
    });
  }).then(function (code) {
    return createSession({ code: code, dev_openid: auth.getDevOpenid() });
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
  // 空着或填了负数按 1 件；0 要留着 —— 那是「用完了」的标记
  if (isNaN(quantity) || quantity < 0) quantity = 1;
  return {
    name: (item.name || '').trim(),
    category_id: item.category || 'other',
    quantity: quantity,
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
// 顶部统计
// ==============================

/**
 * 全库过期概览，首页卡片角标用。
 * 只关心「有几件要提醒」，所以把已过期和临期合成一个数，并把更严重的单独标出来。
 */
function getOverview() {
  return request('/api/items/overview').then(function (data) {
    return {
      total: data.total || 0,
      expired: data.expired_count || 0,
      warning: data.warning_count || 0,
      fresh: data.fresh_count || 0,
      noExpiry: data.no_expiry_count || 0,
      showBanner: !!data.show_banner
    };
  });
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
        reject(new Error(networkMessage(err, false, list[0])));
      }
    });
  });
}

// ==============================
// 容器（S-08）
// ==============================

/**
 * 全部容器定义。**原样返回服务端的行**（snake_case），
 * 由 `utils/containers.js` 的 `setDefs()` 统一映射成页面用的对象 ——
 * 多一层 camelCase 转换只会让「容器字段」有两套叫法。
 */
function listContainers() {
  return request('/api/containers').then(function (data) {
    return data.items || [];
  });
}

function createContainer(payload) {
  return request('/api/containers', 'POST', payload);
}

function updateContainer(id, patch) {
  return request('/api/containers/' + encodeURIComponent(id), 'PATCH', patch);
}

function deleteContainer(id) {
  return request('/api/containers/' + encodeURIComponent(id), 'DELETE');
}

/**
 * 提交某个分区拖拽后的完整顺序（不是增量）。
 * @param {string} containerId
 * @param {string} zoneKey 无分区的容器传空串
 * @param {Array<string|number>} itemIds 从上到下、从左到右的顺序
 */
function saveSlots(containerId, zoneKey, itemIds) {
  return request('/api/containers/' + encodeURIComponent(containerId) + '/slots', 'POST', {
    zone_key: zoneKey || '',
    item_ids: (itemIds || []).map(function (id) { return Number(id); })
  });
}

// ==============================
// 在途（T-01）
// ==============================

function toViewPending(row) {
  var image = row.image_url || '';
  return {
    id: String(row.id),
    name: row.name,
    category: row.category_id,
    quantity: row.quantity,
    unit: row.unit,
    note: row.note || '',
    image: image,
    imageSrc: image ? env.getBaseUrl() + image : '',
    daysWaiting: row.days_waiting || 0,
    // 在途不给 emoji 之外的图形，靠名称猜一个，和容器里的块保持一致
    createdAt: normalizeTimestamp(row.created_at)
  };
}

function listPending() {
  return request('/api/pending').then(function (data) {
    return (data.items || []).map(toViewPending);
  });
}

function createPending(item) {
  return request('/api/pending', 'POST', {
    name: (item.name || '').trim(),
    category_id: item.category || 'other',
    quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
    unit: item.unit || '个',
    note: item.note || '',
    image_url: item.image || null
  }).then(toViewPending);
}

function updatePending(id, patch) {
  return request('/api/pending/' + encodeURIComponent(id), 'PATCH', patch).then(toViewPending);
}

function deletePending(id) {
  return request('/api/pending/' + encodeURIComponent(id), 'DELETE');
}

/**
 * 到了 → 放进某个容器，一步生成正式物品。
 * location 不传由服务端按容器关键字拼（保证落回这个柜子）。
 */
function placePending(id, containerId, zoneKey) {
  return request('/api/pending/' + encodeURIComponent(id) + '/place', 'POST', {
    container_id: containerId,
    zone_key: zoneKey || ''
  }).then(function (data) {
    return { item: toViewItem(data.item), pendingDeleted: data.pending_deleted };
  });
}

// ==============================
// 反馈（F-01）
// ==============================

/**
 * 提一条反馈。位置三件套由组件自动采集，用户只打字也能提交。
 * POST 不走线路重试（见 request 的 retryable）：宁可让人点一次重试，
 * 也不要静默写进两条重复记录。
 */
/** 服务端反馈 -> 列表用的对象（时间补时区，见 normalizeTimestamp） */
function toViewFeedback(row) {
  return {
    id: row.id,
    content: row.content || '',
    pageTitle: row.page_title || '',
    pageRoute: row.page_route || '',
    spot: row.spot || '',
    appVersion: row.app_version || '',
    createdAt: normalizeTimestamp(row.created_at),
    deletedAt: normalizeTimestamp(row.deleted_at)
  };
}

function createFeedback(feedback) {
  return request('/api/feedbacks', 'POST', {
    content: (feedback.content || '').trim(),
    page_route: feedback.pageRoute || '',
    page_title: feedback.pageTitle || '',
    spot: (feedback.spot || '').trim(),
    app_version: feedback.appVersion || ''
  }).then(toViewFeedback);
}

function listFeedbacks(limit, offset) {
  var q = '/api/feedbacks?limit=' + (limit || 50) + '&offset=' + (offset || 0);
  return request(q).then(function (data) {
    return {
      items: (data.items || []).map(toViewFeedback),
      total: data.total || 0,
      hasMore: !!data.has_more
    };
  });
}

/**
 * 软删除。前端只用批量这个（勾 1 条也是 1 个元素的数组）：
 * 一个接口覆盖单条和批量，免得两套逻辑各错各的。
 * 后端只盖 deleted_at，不真删，所以「撤销」是恢复同一行，不是重新插一条。
 */
function deleteFeedbacks(ids) {
  return request('/api/feedbacks/delete-batch', 'POST', { ids: ids || [] });
}

function restoreFeedbacks(ids) {
  return request('/api/feedbacks/restore-batch', 'POST', { ids: ids || [] });
}

// ==============================
// 记录（R-01）
// ==============================

function toViewEntry(row) {
  return {
    id: row.id,
    entryDate: row.entry_date || '',
    type: row.type || 'day',
    title: row.title || '',
    comment: row.comment || '',
    content: row.content || '',
    meta: row.meta || '',
    imageUrl: row.image_url || '',
    createdAt: normalizeTimestamp(row.created_at)
  };
}

/** 日历按月拉：返回的 days 已按天聚合好（后端算的，前端直接用） */
function listEntriesByMonth(month) {
  return request('/api/entries?month=' + encodeURIComponent(month || '')).then(function (data) {
    return {
      items: (data.items || []).map(toViewEntry),
      total: data.total || 0,
      days: data.days || []
    };
  });
}

/** 当天详情：这一天全部条目，按写入时间升序 */
function listEntriesByDate(date) {
  return request('/api/entries?date=' + encodeURIComponent(date || '')).then(function (data) {
    return {
      items: (data.items || []).map(toViewEntry),
      total: data.total || 0
    };
  });
}

/** 单条：答案页「来自记录」回跳要先拿到它属于哪天 */
function getEntry(id) {
  return request('/api/entries/' + encodeURIComponent(id)).then(toViewEntry);
}

function createEntry(entry) {
  return request('/api/entries', 'POST', {
    entry_date: entry.entryDate,
    type: entry.type || 'day',
    title: (entry.title || '').trim(),
    comment: (entry.comment || '').trim(),
    content: (entry.content || '').trim(),
    meta: entry.meta || '',
    image_url: entry.imageUrl || ''
  }).then(toViewEntry);
}

function updateEntry(id, patch) {
  var body = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.comment !== undefined) body.comment = patch.comment;
  if (patch.content !== undefined) body.content = patch.content;
  if (patch.entryDate !== undefined) body.entry_date = patch.entryDate;
  if (patch.type !== undefined) body.type = patch.type;
  if (patch.meta !== undefined) body.meta = patch.meta;
  if (patch.imageUrl !== undefined) body.image_url = patch.imageUrl;
  return request('/api/entries/' + encodeURIComponent(id), 'PATCH', body).then(toViewEntry);
}

function deleteEntry(id) {
  return request('/api/entries/' + encodeURIComponent(id), 'DELETE');
}

// ==============================
// 版本答案（R-01）
// ==============================

function toViewAnswer(row) {
  return {
    id: row.id,
    keyword: row.keyword || '',
    answer: row.answer || '',
    who: row.who || '',
    verdict: row.verdict || '',
    star: row.star || 0,
    sourceEntryId: row.source_entry_id || null,
    imageUrl: row.image_url || '',
    updatedAt: normalizeTimestamp(row.updated_at)
  };
}

function listAnswers(q) {
  return request('/api/answers?q=' + encodeURIComponent(q || '')).then(function (data) {
    return {
      items: (data.items || []).map(toViewAnswer),
      total: data.total || 0
    };
  });
}

/** 同关键词覆盖更新，`created` 告诉调用方是新增还是更新 */
function createAnswer(answer) {
  return request('/api/answers', 'POST', {
    keyword: (answer.keyword || '').trim(),
    answer: (answer.answer || '').trim(),
    who: (answer.who || '').trim(),
    verdict: (answer.verdict || '').trim(),
    star: answer.star || 0,
    source_entry_id: answer.sourceEntryId || null,
    image_url: answer.imageUrl || ''
  }).then(function (data) {
    return { item: toViewAnswer(data.item), created: !!data.created };
  });
}

function updateAnswer(id, patch) {
  var body = {};
  if (patch.keyword !== undefined) body.keyword = patch.keyword;
  if (patch.answer !== undefined) body.answer = patch.answer;
  if (patch.who !== undefined) body.who = patch.who;
  if (patch.verdict !== undefined) body.verdict = patch.verdict;
  if (patch.star !== undefined) body.star = patch.star;
  return request('/api/answers/' + encodeURIComponent(id), 'PATCH', body).then(toViewAnswer);
}

function deleteAnswer(id) {
  return request('/api/answers/' + encodeURIComponent(id), 'DELETE');
}

// ==============================
// 店铺记（§17）
// ==============================

/**
 * 钱一律用「分」在这一层进出，只在渲染前才换算成元。
 * 后端存的就是分（整数），所以别在这一层偷偷转成元——转两次就少两个 0。
 */
function toViewShopBrand(row) {
  return {
    id: row.id,
    name: row.name || '',
    logo: row.logo || '',
    tint: row.tint || '',
    sort: row.sort || 0
  };
}

function toViewShopSku(row) {
  return {
    id: row.id,
    brandId: row.brand_id,
    brandName: row.brand_name || '',
    brandLogo: row.brand_logo || '',
    brandTint: row.brand_tint || '',
    model: row.model || '',
    category: row.category || '',
    costFen: row.cost_fen || 0,
    lastSaleFen: row.last_sale_fen || 0,
    quantity: row.quantity || 0,
    lowStockAt: row.low_stock_at || 0,
    enabled: row.enabled !== false
  };
}

function toViewShopEvent(row) {
  return {
    id: row.id,
    skuId: row.sku_id,
    brandName: row.brand_name || '',
    model: row.model || '',
    category: row.category || '',
    direction: row.direction,
    qty: row.qty || 0,
    unitCostFen: row.unit_cost_fen || 0,
    unitPriceFen: row.unit_price_fen || 0,
    amountFen: row.amount_fen || 0,
    // 后端已经补了 Z（见 shop_service._iso_z），这里再兜一次没坏处
    happenedAt: normalizeTimestamp(row.happened_at),
    source: row.source || 'click',
    note: row.note || ''
  };
}

function toViewShopSummary(row) {
  return {
    day: row.day || '',
    inQty: row.in_qty || 0,
    inAmountFen: row.in_amount_fen || 0,
    outQty: row.out_qty || 0,
    outAmountFen: row.out_amount_fen || 0,
    grossFen: row.gross_fen || 0,
    eventCount: row.event_count || 0
  };
}

/** 仓库墙：品类 tab + 品牌分组的格子 + 当天日报，一次拉齐 */
function shopWall(category) {
  var q = category ? '?category=' + encodeURIComponent(category) : '';
  return request('/api/shop/wall' + q).then(function (data) {
    return {
      categories: data.categories || [],
      brands: (data.brands || []).map(function (group) {
        return {
          brand: toViewShopBrand(group.brand),
          skus: (group.skus || []).map(toViewShopSku)
        };
      }),
      summary: toViewShopSummary(data.summary || {})
    };
  });
}

function shopSummary(day) {
  var q = day ? '?day=' + encodeURIComponent(day) : '';
  return request('/api/shop/summary' + q).then(toViewShopSummary);
}

function shopEvents(day) {
  var q = day ? '?day=' + encodeURIComponent(day) : '';
  return request('/api/shop/events' + q).then(function (data) {
    return {
      day: data.day || '',
      items: (data.items || []).map(toViewShopEvent),
      summary: toViewShopSummary(data.summary || {})
    };
  });
}

/**
 * 一次点击 = 一条流水。**必须带 sku_id 与方向**，售卖还要带成交价。
 * 走 POST 不重试（见 request 的 retryable）：超时可能已经写进去了。
 */
function createShopEvent(payload) {
  var body = {
    sku_id: payload.skuId,
    direction: payload.direction,
    qty: payload.qty || 1,
    source: payload.source || 'click'
  };
  if (payload.unitPriceFen !== undefined && payload.unitPriceFen !== null) {
    body.unit_price_fen = payload.unitPriceFen;
  }
  if (payload.unitCostFen !== undefined && payload.unitCostFen !== null) {
    body.unit_cost_fen = payload.unitCostFen;
  }
  // 补录才传；不传就是「现在」，交给后端打时间
  if (payload.happenedAt) body.happened_at = payload.happenedAt;
  if (payload.note) body.note = payload.note;
  return request('/api/shop/events', 'POST', body).then(function (data) {
    return {
      event: toViewShopEvent(data.event || {}),
      sku: toViewShopSku(data.sku || {})
    };
  });
}

function updateShopEvent(id, patch) {
  var body = {};
  if (patch.qty !== undefined) body.qty = patch.qty;
  if (patch.unitPriceFen !== undefined) body.unit_price_fen = patch.unitPriceFen;
  if (patch.unitCostFen !== undefined) body.unit_cost_fen = patch.unitCostFen;
  if (patch.happenedAt !== undefined) body.happened_at = patch.happenedAt;
  if (patch.note !== undefined) body.note = patch.note;
  if (patch.deleted !== undefined) body.deleted = patch.deleted;
  return request('/api/shop/events/' + encodeURIComponent(id), 'PATCH', body).then(function (data) {
    return {
      event: toViewShopEvent(data.event || {}),
      sku: data.sku ? toViewShopSku(data.sku) : null
    };
  });
}

function deleteShopEvent(id) {
  return request('/api/shop/events/' + encodeURIComponent(id), 'DELETE');
}

/** 全部格子（补录要跨品类选机型，不能用墙那种按品类过滤的接口） */
function listShopSkus(category, includeDisabled) {
  var q = '?include_disabled=' + (includeDisabled ? 'true' : 'false');
  if (category) q += '&category=' + encodeURIComponent(category);
  return request('/api/shop/skus' + q).then(function (data) {
    return (data.items || []).map(toViewShopSku);
  });
}

function createShopSku(payload) {  return request('/api/shop/skus', 'POST', {
    brand_id: payload.brandId,
    model: (payload.model || '').trim(),
    category: payload.category || '手机壳',
    cost_fen: payload.costFen || 0,
    low_stock_at: payload.lowStockAt || 0
  }).then(toViewShopSku);
}

function updateShopSku(id, patch) {
  var body = {};
  if (patch.model !== undefined) body.model = patch.model;
  if (patch.category !== undefined) body.category = patch.category;
  if (patch.costFen !== undefined) body.cost_fen = patch.costFen;
  if (patch.lastSaleFen !== undefined) body.last_sale_fen = patch.lastSaleFen;
  if (patch.enabled !== undefined) body.enabled = patch.enabled;
  return request('/api/shop/skus/' + encodeURIComponent(id), 'PATCH', body).then(toViewShopSku);
}

function deleteShopSku(id) {
  return request('/api/shop/skus/' + encodeURIComponent(id), 'DELETE');
}

function createShopBrand(payload) {
  return request('/api/shop/brands', 'POST', {
    name: (payload.name || '').trim(),
    logo: payload.logo || '',
    tint: payload.tint || ''
  }).then(toViewShopBrand);
}

module.exports = {
  getBaseUrl: env.getBaseUrl,
  probe: probe,
  request: request,
  createSession: createSession,
  fetchMe: fetchMe,
  loginWithWechat: loginWithWechat,
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
  getOverview: getOverview,
  uploadImage: uploadImage,
  listContainers: listContainers,
  createContainer: createContainer,
  updateContainer: updateContainer,
  deleteContainer: deleteContainer,
  saveSlots: saveSlots,
  listPending: listPending,
  createPending: createPending,
  updatePending: updatePending,
  deletePending: deletePending,
  placePending: placePending,
  createFeedback: createFeedback,
  listFeedbacks: listFeedbacks,
  deleteFeedbacks: deleteFeedbacks,
  restoreFeedbacks: restoreFeedbacks,
  listEntriesByMonth: listEntriesByMonth,
  listEntriesByDate: listEntriesByDate,
  getEntry: getEntry,
  createEntry: createEntry,
  updateEntry: updateEntry,
  deleteEntry: deleteEntry,
  listAnswers: listAnswers,
  createAnswer: createAnswer,
  updateAnswer: updateAnswer,
  deleteAnswer: deleteAnswer,
  shopWall: shopWall,
  shopSummary: shopSummary,
  shopEvents: shopEvents,
  createShopEvent: createShopEvent,
  updateShopEvent: updateShopEvent,
  deleteShopEvent: deleteShopEvent,
  listShopSkus: listShopSkus,
  createShopSku: createShopSku,
  updateShopSku: updateShopSku,
  deleteShopSku: deleteShopSku,
  createShopBrand: createShopBrand
};
