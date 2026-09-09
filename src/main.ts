import './style.css'
import Phaser from 'phaser'
import { GAME_W, GAME_H, isWideScreen } from './constants'
import { input } from './input'
import { BootScene } from './scenes/BootScene'
import { TitleScene } from './scenes/TitleScene'
import { TownScene } from './scenes/TownScene'
import { CityScene } from './scenes/CityScene'
import { WorldScene } from './scenes/WorldScene'
import { SectScene } from './scenes/SectScene'
import { SectWarScene } from './scenes/SectWarScene'
import { saveGame } from './state'
import { DungeonScene } from './scenes/DungeonScene'
import { TribulationScene } from './scenes/TribulationScene'
import { registerV4KitBases } from './v4/kit-data'

registerV4KitBases()

// ---------- 全局错误捕获：把未处理异常显示为红色横幅，便于反馈 ----------
const errBox = document.createElement('div')
errBox.style.cssText =
  'display:none;position:fixed;left:0;right:0;top:0;z-index:9999;padding:6px 10px;' +
  'background:#7b1f1f;color:#ffd7d7;font:12px/1.4 monospace;white-space:pre-wrap;pointer-events:none'
document.body.appendChild(errBox)
const showErr = (msg: string) => {
  errBox.textContent = `⚠ 运行异常（请截图反馈）：\n${msg}`.slice(0, 600)
  errBox.style.display = 'block'
}
window.addEventListener('error', (e) => {
  const stack = e.error?.stack || ''
  showErr(`${e.message}\n@ ${e.filename}:${e.lineno}\n${stack.slice(0, 500)}`)
})
window.addEventListener('unhandledrejection', (e) => {
  const stack = e.reason?.stack || ''
  showErr(`Promise: ${String(e.reason?.message || e.reason)}\n${stack.slice(0, 500)}`)
})

// ---------- 平台检测：PC / 移动 ----------
const wide = isWideScreen()
// 在 body 上添加模式类，CSS 据此切换布局
document.body.classList.add(wide ? 'mode-wide' : 'mode-portrait')
// 宽屏下启用鼠标瞄准
input.useMouseAim = wide

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  pixelArt: true,
  transparent: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: [BootScene, TitleScene, TownScene, CityScene, WorldScene, SectScene, SectWarScene, DungeonScene, TribulationScene],
}

const game = new Phaser.Game(config)
;(window as unknown as { __game: Phaser.Game }).__game = game  // 调试钩子（测试脚本用）

/** 当前是否为宽屏模式 */
export function isWideMode(): boolean { return wide }

// ---------- Webview 稳健性：内嵌容器初始化时可视区可能未就绪 ----------
// FIT 缩放只在 resize 时重算；容器晚布局会导致画布停在初始尺寸。
const refreshScale = () => { try { game.scale.refresh() } catch { /* 忽略 */ } }
window.addEventListener('resize', refreshScale)
window.addEventListener('orientationchange', refreshScale)
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshScale() })
window.visualViewport?.addEventListener('resize', refreshScale)
for (const ms of [100, 300, 800, 1500, 3000]) setTimeout(refreshScale, ms)

// 退出游戏时自动存档
const autoSave = () => {
  try {
    const state = game.registry.get('state')
    if (state) saveGame(state)
  } catch { /* 忽略 */ }
}
window.addEventListener('pagehide', autoSave)
document.addEventListener('visibilitychange', () => { if (document.hidden) autoSave() })
