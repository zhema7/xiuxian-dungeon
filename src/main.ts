import './style.css'
import Phaser from 'phaser'
import { GAME_W, GAME_H } from './constants'
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

// ---------- 全局错误捕获：把未处理异常显示为红色横幅，便于手机端反馈 ----------
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

// ---------- Webview 稳健性：内嵌容器（TapTap 等）初始化时可视区可能未就绪 ----------
// FIT 缩放只在 resize 时重算；容器晚布局会导致画布停在初始尺寸，地图看起来被裁掉一块。
// 因此在多种时机强制刷新缩放管理器。
const refreshScale = () => { try { game.scale.refresh() } catch { /* 忽略 */ } }
window.addEventListener('resize', refreshScale)
window.addEventListener('orientationchange', refreshScale)
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshScale() })
window.visualViewport?.addEventListener('resize', refreshScale)
// 启动后多次兜底刷新，覆盖 webview 延迟上报真实尺寸的情况
for (const ms of [100, 300, 800, 1500, 3000]) setTimeout(refreshScale, ms)

// 退出游戏时自动存档（pagehide 兼容移动端 WebView，visibilitychange 覆盖后台切换）
const autoSave = () => {
  try {
    const state = game.registry.get('state')
    if (state) saveGame(state)
  } catch { /* 忽略 */ }
}
window.addEventListener('pagehide', autoSave)
document.addEventListener('visibilitychange', () => { if (document.hidden) autoSave() })
