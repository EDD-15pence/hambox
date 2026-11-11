/**
 * 智能仓储的两种视图模式（S-06）
 *
 * 同一份物品数据有两种看法：
 *   - containers：按地方看（冰箱 / 药箱 / 储物柜…），默认
 *   - list：按清单看（搜索、分类、排序）
 *
 * 两页是平级的，切换用 redirectTo 互相替换，**不要 navigateTo**——
 * 来回切三次会堆六层页面栈，返回键要按六下才能回首页。
 *
 * 这里统一管三件事：上次用的模式、切换前停在哪个容器、清单页的筛选状态。
 */

var MODE_KEY = 'storage_view_mode';
var ACTIVE_KEY = 'storage_active_container';
var LIST_KEY = 'storage_list_state';

var URL_CONTAINERS = '/pages/storage/containers/containers';
var URL_LIST = '/pages/storage/list/list';

function read(key, fallback) {
  try {
    var v = wx.getStorageSync(key);
    return v === '' || v === undefined || v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {}
}

function remove(key) {
  try {
    wx.removeStorageSync(key);
  } catch (e) {}
}

/** 'containers' | 'list'，默认按容器看 */
function getMode() {
  return read(MODE_KEY, 'containers') === 'list' ? 'list' : 'containers';
}

function setMode(mode) {
  write(MODE_KEY, mode === 'list' ? 'list' : 'containers');
}

/** 首页点「智能仓储」时该进哪一页 */
function entryUrl() {
  return getMode() === 'list' ? URL_LIST : URL_CONTAINERS;
}

function urlForMode(mode) {
  return mode === 'list' ? URL_LIST : URL_CONTAINERS;
}

/** 切换前停在哪个容器里：切去清单再切回来，还回到这个柜子 */
function saveActiveContainer(id) {
  if (id) write(ACTIVE_KEY, id);
  else remove(ACTIVE_KEY);
}

function loadActiveContainer() {
  return read(ACTIVE_KEY, '');
}

/** 清单页的搜索词 / 分类 / 状态筛选 / 搜索框展开态 */
function saveListState(state) {
  write(LIST_KEY, {
    keyword: state.keyword || '',
    selectedCategory: state.selectedCategory || 'all',
    statusFilter: state.statusFilter || 'all',
    showSearch: !!state.showSearch
  });
}

function loadListState() {
  var s = read(LIST_KEY, null);
  if (!s || typeof s !== 'object') return null;
  return {
    keyword: s.keyword || '',
    selectedCategory: s.selectedCategory || 'all',
    statusFilter: s.statusFilter || 'all',
    showSearch: !!s.showSearch
  };
}

module.exports = {
  getMode: getMode,
  setMode: setMode,
  entryUrl: entryUrl,
  urlForMode: urlForMode,
  saveActiveContainer: saveActiveContainer,
  loadActiveContainer: loadActiveContainer,
  saveListState: saveListState,
  loadListState: loadListState
};
