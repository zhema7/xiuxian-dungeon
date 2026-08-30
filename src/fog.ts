// ---------- 地图迷雾（Fog of War）：无尽妖域第 7 层起生效 ----------

import Phaser from 'phaser'
import { TILE, OX, OY, T_ROCK, T_PILLAR } from './levelgen'

export const FOG_HIDDEN = 0
export const FOG_EXPLORED = 1
export const FOG_VISIBLE = 2

const DEFAULT_VISION_RADIUS = 5
const EXPLORED_ALPHA = 0.6
const FOG_DEPTH = 2 // 地形(0~1)之上，实体(9+)与 UI 之下

export class FogSystem {
  private gfx: Phaser.GameObjects.Graphics
  private fog: Uint8Array       // 持久记忆：HIDDEN 或 EXPLORED（不回退）
  private visible: Uint8Array  // 当前帧可见性（0/1）
  private tiles: Uint8Array | null = null
  private enabled = true
  private dirty = true
  private lastCx = -1
  private lastCy = -1

  constructor(
    scene: Phaser.Scene,
    private cols: number,
    private rows: number,
  ) {
    this.fog = new Uint8Array(cols * rows)
    this.visible = new Uint8Array(cols * rows)
    this.gfx = scene.add.graphics().setDepth(FOG_DEPTH)
  }

  setMap(tiles: Uint8Array): void {
    this.tiles = tiles
  }

  reset(): void {
    this.fog.fill(0)
    this.visible.fill(0)
    this.lastCx = -1
    this.lastCy = -1
    this.dirty = true
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.gfx.setVisible(enabled)
    if (enabled) this.dirty = true
  }

  private solid(cx: number, cy: number): boolean {
    if (!this.tiles || cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return true
    const t = this.tiles[cy * this.cols + cx]
    return t === T_ROCK || t === T_PILLAR
  }

  // Bresenham 射线：路径中间无实心格则可见（目标格本身可以是墙壁）
  private los(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = Math.abs(x1 - x0)
    const dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    let x = x0
    let y = y0
    while (!(x === x1 && y === y1)) {
      const e2 = 2 * err
      if (e2 > -dy) { err -= dy; x += sx }
      if (e2 < dx) { err += dx; y += sy }
      if (x === x1 && y === y1) break
      if (this.solid(x, y)) return false
    }
    return true
  }

  updateVisibility(playerX: number, playerY: number, visionRadius: number = DEFAULT_VISION_RADIUS): void {
    if (!this.enabled) return
    const pcx = Math.floor((playerX - OX) / TILE)
    const pcy = Math.floor((playerY - OY) / TILE)
    if (pcx === this.lastCx && pcy === this.lastCy) return
    this.lastCx = pcx
    this.lastCy = pcy

    this.visible.fill(0)
    const r = visionRadius
    const r2 = r * r
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue
        const tx = pcx + dx
        const ty = pcy + dy
        if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) continue
        const idx = ty * this.cols + tx
        if ((dx === 0 && dy === 0) || this.los(pcx, pcy, tx, ty)) {
          this.visible[idx] = 1
          this.fog[idx] = FOG_EXPLORED
        }
      }
    }
    this.dirty = true
  }

  isVisible(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return false
    return this.visible[cy * this.cols + cx] === 1
  }

  isExplored(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return false
    return this.fog[cy * this.cols + cx] !== FOG_HIDDEN
  }

  render(): void {
    if (!this.enabled || !this.dirty) return
    this.dirty = false
    const g = this.gfx
    g.clear()
    // 逐行合并连续同 alpha 格子为单次 fillRect，减少绘制调用
    for (let cy = 0; cy < this.rows; cy++) {
      let runStart = -1
      let runAlpha = -1
      const rowBase = cy * this.cols
      for (let cx = 0; cx <= this.cols; cx++) {
        let alpha: number
        if (cx < this.cols) {
          const idx = rowBase + cx
          if (this.visible[idx]) {
            alpha = 0
          } else {
            alpha = this.fog[idx] !== FOG_HIDDEN ? EXPLORED_ALPHA : 1
          }
        } else {
          alpha = -1 // 哨兵：刷出行末残段
        }
        if (alpha !== runAlpha) {
          if (runStart >= 0 && runAlpha > 0) {
            g.fillStyle(0x000000, runAlpha)
            g.fillRect(OX + runStart * TILE, OY + cy * TILE, (cx - runStart) * TILE, TILE)
          }
          runStart = alpha > 0 ? cx : -1
          runAlpha = alpha
        }
      }
    }
  }

  destroy(): void {
    this.gfx.destroy()
    this.tiles = null
  }
}
