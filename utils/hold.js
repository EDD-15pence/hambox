/**
 * ⏸ HOLD 工具清单（§20）
 *
 * 用户 2026-11-13 15:41：「暂时把亲属换算，propmt模板，机票模块放入hold状态，
 * 就是小程序中隐藏展示，不纳入之后的开发范围」；17:12 又补了「一句话记录」
 * （首页「快速记录」卡，写入的仍是 `items` 表，功能本身保留、只下架入口）。
 *
 * ## 三层含义（缺一不算 HOLD，§20.1）
 *
 * ① 隐藏展示：**所有角色**（含 admin）首页都看不到这张卡；
 * ② 不再排期：不加功能 / 不修 bug / 不做真机验收；
 * ③ 可恢复：页面、`app.json` 注册、静态数据、音频仓库全部保留。
 *
 * ## 恢复某个工具
 *
 * 从这里删掉对应的 key 即可 —— 别去改 `pages/index/index.js` 的 `TOOLS` 结构，
 * 也别删页面文件，否则「暂时」就变成「不可逆」。
 *
 * ## 与 §18 ACL 是叠加两层
 *
 * HOLD 与身份无关（谁都看不到），ACL 按角色挡。过滤顺序固定
 * `HOLD → ACL`（§20.3）：先剔 HOLD，再判 `auth.can(key)`。
 */

/** 暂时下架的卡片 key。新增 HOLD 项只改这一行 */
var HOLD_KEYS = [
  'relationship', // 亲属称呼换算
  'prompt',       // Prompt 模板
  'flight',       // 机票比价
  'quick'         // 快速记录（一句话记买的东西）—— 2026-11-13 17:12 补
];

/**
 * 这张卡是不是已下架。
 *
 * @param {string} key 首页 `TOOLS` 里的 key
 * @returns {boolean}
 */
function isHeld(key) {
  return HOLD_KEYS.indexOf(key) !== -1;
}

module.exports = {
  HOLD_KEYS: HOLD_KEYS,
  isHeld: isHeld
};
