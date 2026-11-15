/**
 * 智能仓储 · 首启引导（RM-02 / AGENTS.md §21.5）
 *
 * 两步：① 勾房间 ② 每个房间勾柜子。以前新用户一进仓储就看到写死的 8 个内置
 * 容器（冰箱 / 厨房柜 / 零食柜 / 药箱 / 储物柜 / 卫浴阳台 / 卧室 / 未归位），
 * 那不是「他家」。这里让他先说自己家有什么。
 *
 * 四条硬规则（都是踩过的坑，别改）：
 *
 * 1. **能跳过**：右上「跳过」写 `setup_done = skipped`，保持现有 8 个内置容器、
 *    不再主动弹。跳过不是「已完成」，`rooms` 仍然为空，日后从整理页补建。
 * 2. **后端不可达不进引导**：拉容器失败直接 `conn-error`，`setup_done` 不置位，
 *    下次连上再问。绝不允许「引导页开着但后端 500」的半状态（§21.9 第 5 项）。
 * 3. **「个数 = 建几个独立容器」**：不引入 `count` 字段。两个储物柜就是两条记录，
 *    各自层数、各自命名，归位和可视化才区分得开（§21.4）。
 * 4. **提交幂等**：中途失败重来一次不能报错。房间用固定 id（预设房），
 *    容器重名返回 409 视为「已经建过」，跳过继续。
 */
var nav = require('../../../utils/nav');
var theme = require('../../../utils/theme');
var api = require('../../../utils/api');
var auth = require('../../../utils/auth');
var storageUtils = require('../../../utils/storage-utils');
var roomUtil = require('../../../utils/rooms');

/** 串行跑一组返回 Promise 的任务：并发写 SQLite 容易撞锁，一条一条来 */
function runSerial(tasks) {
  var index = 0;
  function next() {
    if (index >= tasks.length) return Promise.resolve();
    var task = tasks[index++];
    return Promise.resolve()
      .then(task)
      .catch(function (err) {
        // 409 = 这条已经建过了（失败重试、或用户点两次）→ 当成功跳过
        if (err && err.statusCode === 409) return null;
        throw err;
      })
      .then(next);
  }
  return next();
}

Page({
  data: {
    statusBarHeight: nav.STATUS_BAR_HEIGHT,
    navRight: nav.SAFE_RIGHT,
    isDark: false,
    baseUrl: '',

    step: 1,
    loading: true,
    retrying: false,
    error: '',
    saving: false,
    progressText: '',

    // 步 1：候选房间（8 个预设 + 自定义），checked 表示勾上
    presets: [],
    customName: '',

    // 步 2：已勾选的房间，各自带一排容器选项
    rooms: []
  },

  onLoad: function () {
    if (!auth.guard('storage')) return;
    this.setData({
      isDark: theme.getTheme(),
      statusBarHeight: nav.STATUS_BAR_HEIGHT,
      navRight: nav.SAFE_RIGHT,
      baseUrl: api.getBaseUrl()
    });
    this.check();
  },

  /**
   * 进来先确认「该不该引导」。
   * 条件不满足（已经建过房间 / 改过容器 / 问过了）就直接去容器墙，
   * 免得用户从别处误入看到一个已经被跳过很多次的引导。
   */
  check: function () {
    var self = this;
    this.setData({ retrying: !!this.data.error });

    return Promise.all([api.listContainers(), api.listRooms()])
      .then(function (res) {
        if (!storageUtils.needsSetup(res[0], res[1])) {
          self.goWall();
          return;
        }
        // 记住现有容器：内置那 8 个名字是固定的（冰箱 / 储物柜 …），
        // 用户勾同名柜子时**不该新建**（后端会 409），而是把它认领到房间
        self._existing = res[0] || [];
        self.setData({
          loading: false,
          retrying: false,
          error: '',
          presets: roomUtil.PRESET_ROOMS.map(function (r) {
            return { id: r.id, name: r.name, icon: r.icon, checked: false, custom: false };
          })
        });
      })
      .catch(function (err) {
        // 后端不可达：不进引导、不置位，交给 conn-error 卡片（§21.9 第 5 项）
        self.setData({
          loading: false,
          retrying: false,
          error: (err && err.message) || '请求失败'
        });
      });
  },

  onRetry: function () {
    this.check();
  },

  goWall: function () {
    wx.redirectTo({ url: '/pages/storage/containers/containers' });
  },

  onBack: function () {
    if (this.data.step === 2) {
      this.setData({ step: 1 });
      return;
    }
    this.onSkip();
  },

  onToggleTheme: function () {
    this.setData({ isDark: theme.toggleTheme() });
  },

  // ==============================
  // 步 1：勾房间
  // ==============================

  onToggleRoom: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    var patch = {};
    patch['presets[' + index + '].checked'] = !this.data.presets[index].checked;
    this.setData(patch);
  },

  onCustomInput: function (e) {
    this.setData({ customName: e.detail.value });
  },

  onAddCustom: function () {
    var name = (this.data.customName || '').trim();
    if (!name) {
      wx.showToast({ title: '先写个房间名', icon: 'none' });
      return;
    }
    var presets = this.data.presets.slice();
    var exists = presets.some(function (p) { return p.name === name; });
    if (exists) {
      wx.showToast({ title: '已经有这个房间了', icon: 'none' });
      return;
    }
    // 自定义房间不传 id：后端生成 r_ 开头的；预设房才有固定 id
    presets.push({ id: '', name: name, icon: roomUtil.DEFAULT_ROOM_ICON, checked: true, custom: true });
    this.setData({ presets: presets, customName: '' });
  },

  onRemoveCustom: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    var presets = this.data.presets.slice();
    presets.splice(index, 1);
    this.setData({ presets: presets });
  },

  onNext: function () {
    var picked = this.data.presets.filter(function (p) { return p.checked; });
    if (!picked.length) {
      wx.showToast({ title: '先勾一个房间', icon: 'none' });
      return;
    }
    this.setData({
      step: 2,
      rooms: picked.map(function (room) {
        return {
          id: room.id,
          name: room.name,
          icon: room.icon,
          // 每个房间都给同一排候选，用户按需点。默认全不选 ——
          // 预勾会让「我只想建个厨房」的人莫名多出 8 个柜子
          containers: roomUtil.PRESET_CONTAINERS.map(function (c, i) {
            return {
              key: i,
              label: c.name,
              icon: c.icon,
              skin: c.skin,
              cols: c.cols,
              rows: c.rows,
              name: roomUtil.suggestKey(room.name, c.name),
              count: 1,
              on: false
            };
          })
        };
      })
    });
  },

  // ==============================
  // 步 2：勾柜子
  // ==============================

  onToggleCab: function (e) {
    var ri = Number(e.currentTarget.dataset.ri);
    var ci = Number(e.currentTarget.dataset.ci);
    var path = 'rooms[' + ri + '].containers[' + ci + '].on';
    var patch = {};
    patch[path] = !this.data.rooms[ri].containers[ci].on;
    this.setData(patch);
  },

  /** 个数 / 层数的加减：data-field=count|rows，data-delta=±1 */
  onStep: function (e) {
    var ri = Number(e.currentTarget.dataset.ri);
    var ci = Number(e.currentTarget.dataset.ci);
    var field = e.currentTarget.dataset.field;
    var delta = Number(e.currentTarget.dataset.delta);
    var cab = this.data.rooms[ri].containers[ci];
    var value = Number(cab[field] || 0) + delta;
    value = field === 'count'
      ? Math.min(Math.max(value, 1), 6)   // 同一房间最多一次建 6 个，再多就该去整理页慢慢加
      : Math.min(Math.max(value, 0), 12); // 0 = 自动分层
    var patch = {};
    patch['rooms[' + ri + '].containers[' + ci + '].' + field] = value;
    this.setData(patch);
  },

  onCabName: function (e) {
    var ri = Number(e.currentTarget.dataset.ri);
    var ci = Number(e.currentTarget.dataset.ci);
    var patch = {};
    patch['rooms[' + ri + '].containers[' + ci + '].name'] = e.detail.value;
    this.setData(patch);
  },

  onPrev: function () {
    this.setData({ step: 1 });
  },

  // ==============================
  // 提交 / 跳过
  // ==============================

  onFinish: function () {
    if (this.data.saving) return;

    var picked = this.data.rooms.map(function (room) {
      return {
        id: room.id,
        name: room.name,
        icon: room.icon,
        containers: room.containers.filter(function (c) { return c.on; })
      };
    }).filter(function (room) { return room.containers.length > 0; });

    if (!picked.length) {
      wx.showToast({ title: '至少给一个房间挑个柜子', icon: 'none' });
      return;
    }

    var total = 0;
    picked.forEach(function (room) {
      room.containers.forEach(function (c) { total += Number(c.count) || 1; });
    });

    var self = this;
    this.setData({ saving: true, progressText: '正在建 0/' + total });

    // 先把所有房间建出来，拿到 id（自定义房的 id 只有后端知道）
    var roomTasks = picked.map(function (room) {
      var payload = { name: room.name, icon: room.icon };
      if (room.id) payload.id = room.id;
      return function () {
        return api.createRoom(payload);
      };
    });

    var roomIds = [];
    runSerial(roomTasks.map(function (task, i) {
      return function () {
        return task().then(function (row) {
          roomIds[i] = row.id;
          return row;
        });
      };
    }))
      .then(function () {
        var done = 0;
        var cabTasks = [];

        /** 名字相同、还没分到房间的内置容器：可以认领 */
        function claimable(name) {
          var list = self._existing || [];
          for (var i = 0; i < list.length; i++) {
            var row = list[i];
            if (row && row.is_builtin && row.name === name && !row.room_id) return row;
          }
          return null;
        }

        /**
         * 一个柜子的提交任务。`n` 从 1 起：第 2 个起名字加后缀，
         * 「个数 = 几个独立容器」才落得实（§21.4 明确不引入 count 字段）。
         */
        function buildCabTask(c, n, room, roomId) {
          var name = n === 1 ? c.name : c.name + ' ' + n;

          // 同名内置容器还空着（room_id 为空）→ 认领它，而不是新建。
          // 否则用户在「厨房」勾「冰箱」会被后端 409，厨房里反而没有冰箱
          var claimed = claimable(name);
          if (claimed) {
            // 内置柜子原本的关键字保留，末尾补一个「房间+柜子」——
            // 这样语音说「厨房冰箱」也能落到它身上（§21.7 坑 2）
            var claimedKeys = (claimed.keys || []).slice();
            var joined = roomUtil.suggestKey(room.name, claimed.name);
            if (joined && claimedKeys.indexOf(joined) === -1) claimedKeys.push(joined);
            return function () {
              return api.updateContainer(claimed.id, {
                room_id: roomId || '',
                keys: claimedKeys
              }).then(function () {
                done += 1;
                self.setData({ progressText: '正在建 ' + done + '/' + total });
              });
            };
          }

          var payload = {
            name: name,
            icon: c.icon,
            skin: c.skin,
            cols: c.cols,
            rows: c.rows,
            // 关键字预填「房间 + 柜子」：两个房间都有衣柜时靠它区分（§21.7 坑 2）
            keys: [roomUtil.suggestKey(room.name, name)],
            room_id: roomId || ''
          };
          return function () {
            return api.createContainer(payload).then(function () {
              done += 1;
              self.setData({ progressText: '正在建 ' + done + '/' + total });
            });
          };
        }
        picked.forEach(function (room, i) {
          var roomId = roomIds[i] || room.id;
          room.containers.forEach(function (c) {
            var count = Number(c.count) || 1;
            for (var n = 1; n <= count; n++) {
              // 必须靠工厂函数把这一轮的 payload 关住：for + var 的话所有闭包
              // 捕获的是同一个变量，最后会连建 N 个同名容器
              cabTasks.push(buildCabTask(c, n, room, roomId));
            }
          });
        });
        return runSerial(cabTasks);
      })
      .then(function () {
        // 走完引导才置 done：中途失败保持 unset，下次进来还能继续
        storageUtils.setSetupState('done');
        wx.showToast({ title: '收拾好了', icon: 'success' });
        setTimeout(function () { self.goWall(); }, 600);
      })
      .catch(function (err) {
        self.setData({ saving: false, progressText: '' });
        wx.showModal({
          title: '没建完',
          content: ((err && err.message) || '请求失败') + '\n已经建好的会保留，回头再点一次「完成」就行。',
          showCancel: false
        });
      });
  },

  onSkip: function () {
    if (this.data.saving) return;
    storageUtils.setSetupState('skipped');
    this.goWall();
  }
});
