/**
 * 智能仓储的视图记忆与入口（S-06）
 *
 * 1.3.19 起入口结构（用户拍板：「进入仓储应该是房间页，展示每个房间的容器」）：
 *   - **房间页（rooms）是默认入口**：按房间分组展示所有柜子，点柜子看里面
 *   - 容器墙（containers）与清单（list）从房间页导航进，两者仍是平级 segment
 *
 * 这里统一管三件事：上次用的模式（list 模式直接进清单页）、切换前停在哪个容器、
 * 清单页的筛选状态。容器墙与清单互切用 redirectTo，不要 navigateTo——
 * 来回切三次会堆六层页面栈。
 */

var MODE_KEY = 'storage_view_mode';
var ACTIVE_KEY = 'storage_active_container';
var LIST_KEY = 'storage_list_state';

var URL_ROOMS = '/pages/storage/rooms/rooms';
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

/** 'list' | 其他。1.3.19 起「按地方看」的默认页是房间页，不再是容器墙 */
function getMode() {
  return read(MODE_KEY, 'containers') === 'list' ? 'list' : 'containers';
}

function setMode(mode) {
  write(MODE_KEY, mode === 'list' ? 'list' : 'containers');
}

/** 首页点「智能仓储」时该进哪一页：清单模式进清单页，否则进房间页 */
function entryUrl() {
  return getMode() === 'list' ? URL_LIST : URL_ROOMS;
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
  URL_ROOMS: URL_ROOMS,
  getMode: getMode,
  setMode: setMode,
  entryUrl: entryUrl,
  urlForMode: urlForMode,
  saveActiveContainer: saveActiveContainer,
  loadActiveContainer: loadActiveContainer,
  saveListState: saveListState,
  loadListState: loadListState
};
