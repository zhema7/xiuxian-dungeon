// ---------- 游戏核心常量 ----------
// 竖屏（移动端）基准分辨率 — 游戏逻辑分辨率始终基于此
// PC 宽屏下使用 FIT 模式等比缩放，左右两侧留空（可用于显示快捷键/装饰）
export const GAME_W = 360
export const GAME_H = 640

// 横屏（PC/宽屏）基准分辨率 — 预留：未来 DungeonScene 等战斗场景可切换到此分辨率
export const GAME_W_WIDE = 960
export const GAME_H_WIDE = 540

/** 检测当前是否为 PC/宽屏环境（有鼠标/键盘，屏幕宽高比 > 1） */
export function isWideScreen(): boolean {
  if (typeof window === 'undefined') return false
  // 有鼠标/精确指针设备视为PC
  if (window.matchMedia?.('(pointer: fine)').matches) return true
  // 窗口宽高比 > 1.2 也视为PC（横屏显示器）
  const w = window.innerWidth
  const h = window.innerHeight
  if (h > 0 && w / h > 1.2) return true
  return false
}

/** 获取当前平台下的游戏逻辑分辨率
 *  注：当前版本统一使用竖屏分辨率，PC模式通过FIT模式等比缩放 + 键鼠操作增强
 *  未来可根据场景动态切换宽屏分辨率
 */
export function getGameSize(): { w: number; h: number } {
  return { w: GAME_W, h: GAME_H }
}
