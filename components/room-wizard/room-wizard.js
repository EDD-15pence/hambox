/**
 * 房间 / 柜子两步向导（RM-08 / AGENTS.md §21.12 三）
 *
 * 抽成组件的原因：首启引导（`pages/storage/setup`）和整理页（`pages/storage/rooms`）
 * 都要「勾房间 → 勾柜子 → 串行建」这一套。1.3.17 是两份 js 各写一遍（加起来 650 行），
 * 改一处必忘另一处 —— 和 1.3.13 权限守卫批量改漏一级是同一类问题。
 *
 * **组件只负责「选什么 + 提交」**，不负责：
 * - 导航栏（各页自己的标题文案不同）；
 * - 首启三条件判断（`pages/storage/setup` 的事）；
 * - 建完之后去哪（`bind:done` / `bind:skip` 交给页面决定）。
 *
 * 四条硬规则（都是踩过的坑，别改）：
 *
 * 1. **向导不是「清空重建」**：房间按 `id`（预设）/ `name`（自定义）去重、柜子按
 *    `name + room_id` 去重，命中的只更新层数、不新建（否则二手进入会建出重复柜子）。
 * 2. **取消勾选 ≠ 删除**：勾掉一个已建房间只表示「这次不动它」，删除永远只在管理视图。
 * 3. **勾到内置同名柜子要「认领」**：8 个内置容器名固定，直接 POST 会 409，
 *    静默跳过就会出现「勾了冰箱但厨房里没冰箱」→ 改成 `PATCH room_id` + 补关键字。
 * 4. **提交可重入**：房间用固定 id（预设房）幂等，柜子重名 409 当「已建过」跳过。
 */

var api = require('../../utils/api');
var roomUtil = require('../../utils/rooms');

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

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    /* 已建房间（`roomUtil.fromServer()` 之后的），用来预勾 + 判重 */
    existingRooms: { type: Array, value: [] },
    /* 已建容器的**后端原始行**（要 `is_builtin` / `room_id` / `rows` / `keys`） */
    existingContainers: { type: Array, value: [] }
  },

  data: {
    step: 1,
    // 步 1：预设 9 个 + 已建的自建房间（已建默认打勾）
    chips: [],
    manualName: '',
    // 步 2：勾上的房间，各自带一排柜子选项
    rooms: [],
    saving: false,
    progressText: ''
  },

  observers: {
    'existingRooms, existingContainers': function (rooms) {
      // 正在提交时不要重建，否则把用户刚填的 cfg 冲掉
      if (this.data.saving) return;
      if (this.data.step !== 1) return;
      this.rebuild(rooms);
    }
  },

  lifetimes: {
    attached: function () {
      this.rebuild(this.data.existingRooms);
    }
  },

  methods: {
    /** 重建步 1 的 chips（已建项默认打勾） */
    rebuild: function (rooms) {
      this.setData({
        chips: roomUtil.wizardRoomChips(roomUtil.PRESET_ROOMS, rooms || [])
      });
    },

    // ==============================
    // 步 1：勾房间
    // ==============================

    onToggleRoom: function (e) {
      var index = Number(e.currentTarget.dataset.index);
      if (!this.data.chips[index]) return;
      var patch = {};
      patch['chips[' + index + '].checked'] = !this.data.chips[index].checked;
      this.setData(patch);
    },

    onManualInput: function (e) {
      this.setData({ manualName: e.detail.value });
    },

    onAddCustom: function () {
      var name = (this.data.manualName || '').trim();
      if (!name) {
        wx.showToast({ title: '先写个房间名', icon: 'none' });
        return;
      }

      var chips = this.data.chips.slice();
      var exists = chips.some(function (c) { return c.name === name; });
      if (exists) {
        wx.showToast({ title: '已经有这个房间了', icon: 'none' });
        return;
      }

      // 自定义房间不传 id：后端生成 r_ 开头的；预设房才有固定 id
      chips.push({
        id: '',
        presetId: '',
        name: name,
        icon: roomUtil.DEFAULT_ROOM_ICON,
        checked: true,
        existing: false,
        existingId: '',
        custom: true
      });
      this.setData({ chips: chips, manualName: '' });
    },

    /** 只能删「刚加的自定义房」；已建房间必须去管理视图删 */
    onRemoveCustom: function (e) {
      var index = Number(e.currentTarget.dataset.index);
      var chip = this.data.chips[index];
      if (!chip || !chip.custom || chip.existing) return;
      var chips = this.data.chips.slice();
      chips.splice(index, 1);
      this.setData({ chips: chips });
    },

    onNext: function () {
      var checked = this.data.chips.filter(function (c) { return c.checked; });
      if (!checked.length) {
        wx.showToast({ title: '先勾一个房间', icon: 'none' });
        return;
      }

      var cabs = this.data.existingContainers || [];
      var rooms = checked.map(function (chip) {
        // 已有房间拿它的真 id；还没建的预设房用固定 id（后端幂等）；自定义留空
        var roomId = chip.existingId || '';
        return {
          name: chip.name,
          icon: chip.icon,
          presetId: chip.presetId,
          existingId: chip.existingId,
          existing: chip.existing,
          containers: roomUtil.wizardCabOptions(roomUtil.PRESET_CONTAINERS, chip.name, cabs, roomId)
        };
      });

      this.setData({ step: 2, rooms: rooms });
      this.triggerEvent('stepchange', { step: 2 });
    },

    // ==============================
    // 步 2：勾柜子
    // ==============================

    onToggleCab: function (e) {
      var ri = Number(e.currentTarget.dataset.ri);
      var ci = Number(e.currentTarget.dataset.ci);
      if (!this.data.rooms[ri] || !this.data.rooms[ri].containers[ci]) return;
      var patch = {};
      patch['rooms[' + ri + '].containers[' + ci + '].on'] =
        !this.data.rooms[ri].containers[ci].on;
      this.setData(patch);
    },

    /** 个数 / 层数的加减：data-field=count|rows，data-delta=±1 */
    onStep: function (e) {
      var ri = Number(e.currentTarget.dataset.ri);
      var ci = Number(e.currentTarget.dataset.ci);
      var field = e.currentTarget.dataset.field;
      var delta = Number(e.currentTarget.dataset.delta);
      if (!this.data.rooms[ri] || !this.data.rooms[ri].containers[ci]) return;

      var cab = this.data.rooms[ri].containers[ci];
      var value = Number(cab[field] || 0) + delta;
      value = field === 'count'
        ? Math.min(Math.max(value, 1), 6)   // 同一房间一次最多建 6 个，再多去整理页加
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
      this.triggerEvent('stepchange', { step: 1 });
    },

    // ==============================
    // 提交
    // ==============================

    onFinish: function () {
      if (this.data.saving) return;

      // 只勾了房间、没勾柜子也算数：空房间是合法状态（墙上会给它一个「＋柜子」）
      var pickedRooms = this.data.rooms;

      var stepTotal = 0;
      pickedRooms.forEach(function (room) {
        if (room.existing) return;
        stepTotal += 1;
        room.containers.forEach(function (c) {
          if (c.on && !c.existing) stepTotal += Number(c.count) || 1;
        });
      });

      // 已经有柜子、只改了层数的，也算「有活要干」
      var rowPatches = 0;
      pickedRooms.forEach(function (room) {
        room.containers.forEach(function (c) {
          if (c.on && c.existing && c.originRows !== null && c.rows !== c.originRows) {
            rowPatches += 1;
          }
        });
      });
      stepTotal += rowPatches;

      if (!stepTotal) {
        // 没有任何改动（全是已有项、也没改层数）：直接算完成，别装模作样转圈
        this.triggerEvent('done', { rooms: 0, cabs: 0 });
        return;
      }

      var self = this;
      this.setData({ saving: true, progressText: '正在建 0/' + stepTotal });

      var done = 0;
      function tick() {
        done += 1;
        self.setData({ progressText: '正在建 ' + done + '/' + stepTotal });
      }

      // 先把没建过的房间建出来，拿到 id（自定义房的 id 只有后端知道）
      var roomIds = [];
      var roomTasks = pickedRooms.map(function (room, i) {
        if (room.existing) {
          roomIds[i] = room.existingId;
          return function () { return Promise.resolve(); };
        }
        var payload = { name: room.name, icon: room.icon };
        if (room.presetId) payload.id = room.presetId;
        return function () {
          return api.createRoom(payload).then(function (row) {
            roomIds[i] = row.id;
            tick();
            return row;
          });
        };
      });

      runSerial(roomTasks)
        .then(function () {
          var cabTasks = [];
          var existing = self.data.existingContainers || [];

          /** 名字相同、还没分到房间的内置容器：可以认领 */
          function claimable(name) {
            for (var i = 0; i < existing.length; i++) {
              var row = existing[i];
              if (row && row.is_builtin && row.name === name && !row.room_id) return row;
            }
            return null;
          }

          /**
           * 一个柜子的提交任务。`n` 从 1 起：第 2 个起名字加后缀，
           * 「个数 = 几个独立容器」才落得实（§21.4 明确不引入 count 字段）。
           */
          function buildCabTask(cab, n, room, roomId) {
            var name = roomUtil.cabNameAt(cab.name, n);

            // 同名内置容器还空着（room_id 为空）→ 认领它，而不是新建。
            // 否则用户在「厨房」勾「冰箱」会被后端 409，厨房里反而没有冰箱
            var claimed = claimable(name);
            if (claimed) {
              var claimedKeys = (claimed.keys || []).slice();
              var joined = roomUtil.suggestKey(room.name, claimed.name);
              if (joined && claimedKeys.indexOf(joined) === -1) claimedKeys.push(joined);
              return function () {
                return api.updateContainer(claimed.id, {
                  room_id: roomId || '',
                  keys: claimedKeys
                }).then(tick);
              };
            }

            var payload = {
              name: name,
              icon: cab.icon,
              skin: cab.skin,
              cols: cab.cols,
              rows: cab.rows,
              // 关键字预填「房间 + 柜子」：两个房间都有衣柜时靠它区分（§21.7 坑 2）
              keys: [roomUtil.suggestKey(room.name, name)],
              room_id: roomId || ''
            };
            return function () {
              return api.createContainer(payload).then(tick);
            };
          }

          pickedRooms.forEach(function (room, i) {
            var roomId = roomIds[i] || room.existingId || '';
            room.containers.forEach(function (cab) {
              if (!cab.on) return;

              // 已有柜子：只可能改层数。不新建、不改名（改名是管理视图的事）
              if (cab.existing) {
                if (cab.originRows !== null && cab.rows !== cab.originRows) {
                  cabTasks.push(function () {
                    return api.updateContainer(cab.existingId, { rows: cab.rows }).then(tick);
                  });
                }
                return;
              }

              var count = Number(cab.count) || 1;
              for (var n = 1; n <= count; n++) {
                // 必须靠工厂函数把这一轮的 payload 关住：for + var 的话所有闭包
                // 捕获的是同一个变量，最后会连建 N 个同名容器
                cabTasks.push(buildCabTask(cab, n, room, roomId));
              }
            });
          });

          return runSerial(cabTasks);
        })
        .then(function () {
          self.setData({ saving: false, progressText: '' });
          self.triggerEvent('done', { rooms: pickedRooms.length, cabs: done });
        })
        .catch(function (err) {
          self.setData({ saving: false, progressText: '' });
          wx.showModal({
            title: '没建完',
            content: ((err && err.message) || '请求失败') +
              '\n已经建好的会保留，回头再点一次「完成」就行。',
            showCancel: false
          });
        });
    },

    onSkip: function () {
      if (this.data.saving) return;
      this.triggerEvent('skip');
    }
  }
});
