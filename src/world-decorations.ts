// ---------- 大地图 HD-2D 装饰物程序化生成 ----------
// 在 2D Canvas 上绘制像素风装饰物纹理，注册为 Phaser 纹理
// 包括：树木(3种)、灌木(2种)、岩石(3种)、花朵(3种)、草丛(2种)、道路(3种)、建筑(5种)

import Phaser from 'phaser'
import type { DomainId } from './world-map'
import { DOMAIN_VEG_WEIGHTS, type WaterPath, type TerrainPlacement } from './domain-terrain'
import { getRegionVegType, getRegionDensity } from './region-plan'

export interface ScatterContext {
  waterPaths?: WaterPath[]
  terrainPlacements?: TerrainPlacement[]
  worldPoints?: { x: number; y: number; type: string }[]
}

const TEX_SIZE = 48

function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: string, a = 1): void {
  ctx.fillStyle = c
  ctx.globalAlpha = a
  ctx.fillRect(x, y, 1, 1)
  ctx.globalAlpha = 1
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string, a = 1): void {
  ctx.fillStyle = c
  ctx.globalAlpha = a
  ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 1
}

function toHex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0')
}

function darken(c: number, f: number): number {
  return Math.floor(((c >> 16 & 0xff) * f) << 16) | Math.floor(((c >> 8 & 0xff) * f) << 8) | Math.floor((c & 0xff) * f)
}

function lighten(c: number, f: number): number {
  const r = Math.min(255, Math.floor((c >> 16 & 0xff) * f))
  const g = Math.min(255, Math.floor((c >> 8 & 0xff) * f))
  const b = Math.min(255, Math.floor((c & 0xff) * f))
  return (r << 16) | (g << 8) | b
}

function diagLine(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  c: string, a = 1,
): void {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let cx = x0, cy = y0
  while (true) {
    px(ctx, cx, cy, c, a)
    if (cx === x1 && cy === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; cx += sx }
    if (e2 < dx) { err += dx; cy += sy }
  }
}

function fillEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rw: number, rh: number, c: string, a = 1): void {
  for (let y = -rh; y <= rh; y++) {
    for (let x = -rw; x <= rw; x++) {
      if ((x * x) / (rw * rw) + (y * y) / (rh * rh) <= 1) {
        px(ctx, cx + x, cy + y, c, a)
      }
    }
  }
}

type DecoType = 'pine' | 'round_tree' | 'willow' | 'bush_s' | 'bush_l' | 'rock_s' | 'rock_m' | 'rock_l' | 'flower_r' | 'flower_y' | 'flower_b' | 'grass_1' | 'grass_2' | 'path_h' | 'path_v' | 'path_cross' | 'bldg_home' | 'bldg_city' | 'bldg_sect' | 'bldg_dungeon' | 'bldg_landmark' | 'bamboo' | 'lotus_pond' | 'lantern_post' | 'mushroom' | 'crystal' | 'dead_tree' | 'pagoda' | 'spirit_gate' | 'cobblestone' | 'torch_post' | 'snow_pine' | 'alpine_bush'

const DOMAIN_PLANT: Record<DomainId, { tree: number; treeAlt: number; bush: number; rock: number }> = {
  south:  { tree: 0x2a5a3a, treeAlt: 0x3a6a4a, bush: 0x2a4a2a, rock: 0x4a4540 },
  central: { tree: 0x3a5a2a, treeAlt: 0x4a6a3a, bush: 0x3a4a1a, rock: 0x5a5045 },
  east:   { tree: 0x2a4a4a, treeAlt: 0x3a5a5a, bush: 0x2a3a3a, rock: 0x4a5055 },
  west:   { tree: 0x4a3a2a, treeAlt: 0x5a4a3a, bush: 0x3a2a1a, rock: 0x5a4035 },
  north:  { tree: 0x2a3a4a, treeAlt: 0x3a4a5a, bush: 0x1a2a3a, rock: 0x3a4050 },
}

export function generateWorldDecorations(scene: Phaser.Scene, domain: DomainId): void {
  const pal = DOMAIN_PLANT[domain] ?? DOMAIN_PLANT.south
  const trunkColor = 0x4a3520
  const trunkDark = darken(trunkColor, 0.6)
  const rockDark = darken(pal.rock, 0.5)
  const rockLight = lighten(pal.rock, 1.3)

  const makeTexture = (type: DecoType, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const key = `world_deco_${type}_${domain}`
    if (scene.textures.exists(key)) return
    const canvas = document.createElement('canvas')
    canvas.width = TEX_SIZE
    canvas.height = TEX_SIZE
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    draw(ctx)
    scene.textures.addCanvas(key, canvas)
  }

  // === 松树（增强版：树皮纹、叶丛层次、苔藓） ===
  makeTexture('pine', ctx => {
    // 树干 + 树皮纹
    rect(ctx, 22, 36, 4, 10, toHex(trunkColor))
    rect(ctx, 22, 36, 1, 10, toHex(trunkDark))
    px(ctx, 23, 38, toHex(trunkDark))
    px(ctx, 24, 40, toHex(trunkDark))
    px(ctx, 23, 42, toHex(trunkDark))
    // 树根隆起
    rect(ctx, 21, 44, 6, 2, toHex(trunkDark))
    // 树冠（三角形层叠 + 逐层高光/暗纹）
    const tiers = [
      { y: 30, w: 16, h: 8 },
      { y: 22, w: 14, h: 8 },
      { y: 14, w: 12, h: 8 },
      { y: 8, w: 8, h: 6 },
    ]
    for (const t of tiers) {
      const x = 24 - Math.floor(t.w / 2)
      const c = toHex(pal.tree)
      const cd = toHex(darken(pal.tree, 0.6))
      const cl = toHex(lighten(pal.tree, 1.3))
      for (let dy = 0; dy < t.h; dy++) {
        const tw = Math.max(1, Math.floor(t.w * (1 - dy / t.h)))
        const tx = 24 - Math.floor(tw / 2)
        rect(ctx, tx, t.y + dy, tw, 1, c)
        if (dy === 0) rect(ctx, tx, t.y, tw, 1, cl)
        // 叶丛散点高光
        if (dy === 2 && tw > 4) {
          px(ctx, tx + 1, t.y + dy, cl)
          px(ctx, tx + tw - 2, t.y + dy, cl)
        }
      }
      rect(ctx, x, t.y + t.h - 1, t.w, 1, cd)
      // 暗纹底部
      if (t.w > 6) {
        px(ctx, x + 2, t.y + t.h - 2, cd)
        px(ctx, x + t.w - 3, t.y + t.h - 2, cd)
      }
    }
    // 顶端高光
    px(ctx, 24, 7, toHex(lighten(pal.tree, 1.5)))
    // 苔藓点缀
    px(ctx, 22, 36, toHex(pal.bush))
    px(ctx, 25, 38, toHex(pal.bush))
  })

  // === 圆头树（增强版：叶簇分层、枝条、零散叶） ===
  makeTexture('round_tree', ctx => {
    rect(ctx, 22, 36, 4, 10, toHex(trunkColor))
    rect(ctx, 22, 36, 1, 10, toHex(trunkDark))
    // 树根
    rect(ctx, 21, 44, 6, 2, toHex(trunkDark))
    // 枝条
    diagLine(ctx, 22, 34, 16, 28, toHex(trunkDark))
    diagLine(ctx, 26, 34, 32, 28, toHex(trunkDark))
    // 圆形树冠 + 叶簇纹理
    const cx = 24, cy = 22, r = 14
    const c = toHex(pal.treeAlt)
    const cd = toHex(darken(pal.treeAlt, 0.6))
    const cl = toHex(lighten(pal.treeAlt, 1.3))
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) {
          const lx = cx + x, ly = cy + y
          if (lx >= 0 && lx < TEX_SIZE && ly >= 0 && ly < TEX_SIZE) {
            if (x * x + y * y < (r - 4) * (r - 4) && x < 0 && y < 0) {
              px(ctx, lx, ly, cl)
            } else if (x * x + y * y > (r - 3) * (r - 3) || (x > r - 4 && y > r - 4)) {
              px(ctx, lx, ly, cd)
            } else {
              px(ctx, lx, ly, c)
            }
          }
        }
      }
    }
    // 叶簇高光斑点
    px(ctx, 18, 14, cl)
    px(ctx, 30, 18, cl)
    px(ctx, 20, 20, cl)
    px(ctx, 28, 14, cl)
    px(ctx, 24, 12, cl)
    // 暗纹叶簇
    px(ctx, 16, 24, cd)
    px(ctx, 32, 22, cd)
    px(ctx, 14, 18, cd)
  })

  // === 柳树（增强版：更多下垂枝、叶尖渐变） ===
  makeTexture('willow', ctx => {
    rect(ctx, 22, 30, 4, 14, toHex(trunkColor))
    rect(ctx, 22, 30, 1, 14, toHex(trunkDark))
    rect(ctx, 21, 42, 6, 2, toHex(trunkDark))
    const c = toHex(pal.tree)
    const cd = toHex(darken(pal.tree, 0.6))
    const cl = toHex(lighten(pal.tree, 1.3))
    // 顶部蓬松 + 叶簇纹理
    for (let y = 0; y < 10; y++) {
      const w = 20 - y * 2
      const sx = 24 - Math.floor(w / 2)
      rect(ctx, sx, 8 + y, w, 1, y === 0 ? cl : c)
      if (y < 6 && w > 4) {
        px(ctx, sx + 1, 8 + y, cl)
        px(ctx, sx + w - 2, 8 + y, cl)
      }
    }
    // 下垂柳条（加密 + 渐变叶尖）
    for (let i = 0; i < 11; i++) {
      const sx = 10 + i * 3
      const len = 8 + Math.floor(Math.random() * 8)
      for (let j = 0; j < len; j++) {
        const a = 1 - j / len * 0.6
        px(ctx, sx, 18 + j, c, a)
        if (j === len - 1) px(ctx, sx, 18 + j, cl, a)
      }
    }
    // 零散叶
    px(ctx, 14, 16, cl)
    px(ctx, 34, 14, cl)
    px(ctx, 24, 6, cl)
  })

  // === 小灌木（增强版：叶簇高光、浆果） ===
  makeTexture('bush_s', ctx => {
    const c = toHex(pal.bush)
    const cd = toHex(darken(pal.bush, 0.6))
    const cl = toHex(lighten(pal.bush, 1.3))
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 20; x++) {
        const dx = x - 10, dy = y - 6
        if (dx * dx + dy * dy * 1.5 <= 60) {
          const lx = 14 + x, ly = 30 + y
          if (dx * dx + dy * dy < 30 && dx < 0 && dy < 0) {
            px(ctx, lx, ly, cl)
          } else if (dx * dx + dy * dy > 45) {
            px(ctx, lx, ly, cd)
          } else {
            px(ctx, lx, ly, c)
          }
        }
      }
    }
    // 浆果点缀
    px(ctx, 20, 34, '#e74c3c')
    px(ctx, 21, 34, '#c0392b')
    px(ctx, 25, 36, '#e74c3c')
    px(ctx, 26, 36, '#c0392b')
    // 接地阴影
    rect(ctx, 14, 42, 20, 2, '#000000', 0.15)
  })

  // === 大灌木（增强版：叶簇层次、浆果、枝干） ===
  makeTexture('bush_l', ctx => {
    const c = toHex(pal.bush)
    const cd = toHex(darken(pal.bush, 0.6))
    const cl = toHex(lighten(pal.bush, 1.3))
    // 枝干
    rect(ctx, 22, 38, 4, 6, toHex(trunkColor))
    rect(ctx, 22, 38, 1, 6, toHex(trunkDark))
    for (let y = 0; y < 18; y++) {
      for (let x = 0; x < 28; x++) {
        const dx = x - 14, dy = y - 9
        if (dx * dx + dy * dy * 1.3 <= 120) {
          const lx = 10 + x, ly = 26 + y
          if (dx * dx + dy * dy < 60 && dx < 0 && dy < 0) {
            px(ctx, lx, ly, cl)
          } else if (dx * dx + dy * dy > 90) {
            px(ctx, lx, ly, cd)
          } else {
            px(ctx, lx, ly, c)
          }
        }
      }
    }
    // 浆果
    px(ctx, 16, 30, '#e74c3c')
    px(ctx, 17, 30, '#c0392b')
    px(ctx, 28, 32, '#f39c12')
    px(ctx, 29, 32, '#d68910')
    px(ctx, 22, 28, '#e74c3c')
    px(ctx, 23, 28, '#c0392b')
    // 接地阴影
    rect(ctx, 10, 44, 28, 2, '#000000', 0.15)
  })

  // === 小石头 ===
  makeTexture('rock_s', ctx => {
    const c = toHex(pal.rock)
    const cd = toHex(rockDark)
    const cl = toHex(rockLight)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 14; x++) {
        const dx = x - 7, dy = y - 5
        if (dx * dx / 49 + dy * dy / 25 <= 1) {
          const lx = 17 + x, ly = 32 + y
          if (dx * dx / 36 + dy * dy / 16 < 1 && dx < 0 && dy < 0) {
            px(ctx, lx, ly, cl)
          } else if (dx * dx / 49 + dy * dy / 25 > 0.7) {
            px(ctx, lx, ly, cd)
          } else {
            px(ctx, lx, ly, c)
          }
        }
      }
    }
  })

  // === 中石头 ===
  makeTexture('rock_m', ctx => {
    const c = toHex(pal.rock)
    const cd = toHex(rockDark)
    const cl = toHex(rockLight)
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 22; x++) {
        const dx = x - 11, dy = y - 8
        if (dx * dx / 121 + dy * dy / 64 <= 1) {
          const lx = 13 + x, ly = 28 + y
          if (dx * dx / 81 + dy * dy / 36 < 1 && dx < 0 && dy < 0) {
            px(ctx, lx, ly, cl)
          } else if (dx * dx / 121 + dy * dy / 64 > 0.7) {
            px(ctx, lx, ly, cd)
          } else {
            px(ctx, lx, ly, c)
          }
        }
      }
    }
    // 裂纹
    px(ctx, 20, 32, cd)
    px(ctx, 21, 33, cd)
    px(ctx, 22, 34, cd)
  })

  // === 大石头 ===
  makeTexture('rock_l', ctx => {
    const c = toHex(pal.rock)
    const cd = toHex(rockDark)
    const cl = toHex(rockLight)
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 32; x++) {
        const dx = x - 16, dy = y - 12
        if (dx * dx / 256 + dy * dy / 144 <= 1) {
          const lx = 8 + x, ly = 20 + y
          if (dx * dx / 196 + dy * dy / 100 < 1 && dx < 0 && dy < 0) {
            px(ctx, lx, ly, cl)
          } else if (dx * dx / 256 + dy * dy / 144 > 0.7) {
            px(ctx, lx, ly, cd)
          } else {
            px(ctx, lx, ly, c)
          }
        }
      }
    }
    // 裂纹
    for (let i = 0; i < 5; i++) px(ctx, 14 + i, 30 + i, cd)
    for (let i = 0; i < 4; i++) px(ctx, 22 + i, 34 - i, cd)
  })

  // === 花朵（增强版：多瓣、花蕊、叶细节） ===
  const flowers: [DecoType, number][] = [['flower_r', 0xef4444], ['flower_y', 0xfbbf24], ['flower_b', 0x3b82f6]]
  for (const [ftype, fcolor] of flowers) {
    makeTexture(ftype, ctx => {
      const c = toHex(fcolor)
      const cd = toHex(darken(fcolor, 0.5))
      const cl = toHex(lighten(fcolor, 1.4))
      const stem = toHex(0x2a5a2a)
      const stemL = toHex(lighten(0x2a5a2a, 1.3))
      // 茎 + 茎高光
      rect(ctx, 23, 34, 2, 10, stem)
      px(ctx, 23, 34, stemL)
      // 叶子（带尖）
      diagLine(ctx, 23, 38, 19, 36, stem)
      diagLine(ctx, 19, 36, 17, 37, stem)
      diagLine(ctx, 25, 40, 29, 38, stem)
      diagLine(ctx, 29, 38, 31, 39, stem)
      // 花瓣（5瓣放射状）
      px(ctx, 24, 26, c)
      rect(ctx, 22, 27, 5, 3, c)
      rect(ctx, 21, 28, 7, 2, c)
      rect(ctx, 20, 29, 9, 1, c)
      rect(ctx, 21, 30, 7, 2, c)
      rect(ctx, 22, 31, 5, 1, cd)
      // 花蕊
      px(ctx, 24, 29, '#fbbf24')
      px(ctx, 24, 28, '#fde047')
      // 高光
      px(ctx, 22, 27, cl)
      px(ctx, 23, 27, cl)
      // 接地暗影
      rect(ctx, 21, 44, 6, 1, '#000000', 0.12)
    })
  }

  // === 草丛（增强版：叶尖高光、根部暗影、弯曲） ===
  makeTexture('grass_1', ctx => {
    const c = toHex(pal.tree)
    const cd = toHex(darken(pal.tree, 0.6))
    const cl = toHex(lighten(pal.tree, 1.3))
    for (let i = 0; i < 10; i++) {
      const x = 12 + i * 3 + Math.floor(Math.random() * 2)
      const h = 4 + Math.floor(Math.random() * 5)
      // 弯曲草叶
      const bend = i % 2 === 0 ? 1 : -1
      rect(ctx, x, 40 - h, 1, h, c)
      px(ctx, x + bend, 40 - h, c)
      px(ctx, x, 40 - h, cl)
      if (h > 6) px(ctx, x + bend, 40 - h + 1, cd)
    }
    // 根部暗影
    rect(ctx, 12, 42, 24, 2, '#000000', 0.1)
  })
  makeTexture('grass_2', ctx => {
    const c = toHex(pal.bush)
    const cd = toHex(darken(pal.bush, 0.6))
    const cl = toHex(lighten(pal.bush, 1.3))
    for (let i = 0; i < 8; i++) {
      const x = 14 + i * 3 + Math.floor(Math.random() * 2)
      const h = 6 + Math.floor(Math.random() * 6)
      const bend = i % 3 === 0 ? 2 : (i % 2 === 0 ? 1 : -1)
      rect(ctx, x, 40 - h, 1, h, c)
      px(ctx, x + bend, 40 - h, c)
      px(ctx, x, 40 - h, cl)
    }
    // 些草叶
    for (let i = 0; i < 5; i++) {
      const x = 16 + i * 4
      rect(ctx, x, 36, 1, 4, c)
      px(ctx, x, 36, cl)
    }
    // 根部暗影
    rect(ctx, 14, 44, 20, 2, '#000000', 0.1)
  })

  // === 道路（增强版：石板纹、边缘磨损、裂纹、路旁碎石） ===
  const pathColor = 0x8a7a5a
  const pathDark = darken(pathColor, 0.7)
  const pathLight = lighten(pathColor, 1.2)
  const pathGap = toHex(0x3a3530)
  makeTexture('path_h', ctx => {
    rect(ctx, 0, 18, 48, 12, toHex(pathColor))
    rect(ctx, 0, 18, 48, 2, toHex(pathDark))
    rect(ctx, 0, 28, 48, 2, toHex(pathDark))
    // 石板分隔线
    for (let i = 0; i < 4; i++) {
      const x = i * 12 + 6
      rect(ctx, x, 19, 1, 10, pathGap)
    }
    // 石板高光/暗纹
    for (let s = 0; s < 4; s++) {
      const sx = s * 12 + 1
      rect(ctx, sx, 21, 10, 1, toHex(pathLight))
      px(ctx, sx + 2, 23, toHex(pathLight))
      px(ctx, sx + 5, 25, toHex(pathDark))
      px(ctx, sx + 8, 22, toHex(pathLight))
    }
    // 边缘磨损（草/碎石）
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(Math.random() * 48)
      px(ctx, x, 18, toHex(pal.bush))
      px(ctx, x + 1, 30, toHex(pathDark))
    }
    // 裂纹
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(Math.random() * 48)
      px(ctx, x, 22 + Math.floor(Math.random() * 4), pathGap)
    }
  })
  makeTexture('path_v', ctx => {
    rect(ctx, 18, 0, 12, 48, toHex(pathColor))
    rect(ctx, 18, 0, 2, 48, toHex(pathDark))
    rect(ctx, 28, 0, 2, 48, toHex(pathDark))
    // 石板分隔线
    for (let i = 0; i < 4; i++) {
      const y = i * 12 + 6
      rect(ctx, 19, y, 10, 1, pathGap)
    }
    // 石板高光/暗纹
    for (let s = 0; s < 4; s++) {
      const sy = s * 12 + 1
      rect(ctx, 20, sy, 1, 10, toHex(pathLight))
      px(ctx, 22, sy + 2, toHex(pathLight))
      px(ctx, 25, sy + 5, toHex(pathDark))
      px(ctx, 23, sy + 8, toHex(pathLight))
    }
    // 边缘磨损
    for (let i = 0; i < 6; i++) {
      const y = Math.floor(Math.random() * 48)
      px(ctx, 18, y, toHex(pal.bush))
      px(ctx, 30, y + 1, toHex(pathDark))
    }
    // 裂纹
    for (let i = 0; i < 3; i++) {
      const y = Math.floor(Math.random() * 48)
      px(ctx, 22 + Math.floor(Math.random() * 4), y, pathGap)
    }
  })
  makeTexture('path_cross', ctx => {
    rect(ctx, 0, 18, 48, 12, toHex(pathColor))
    rect(ctx, 18, 0, 12, 48, toHex(pathColor))
    rect(ctx, 0, 18, 48, 2, toHex(pathDark))
    rect(ctx, 0, 28, 48, 2, toHex(pathDark))
    rect(ctx, 18, 0, 2, 48, toHex(pathDark))
    rect(ctx, 28, 0, 2, 48, toHex(pathDark))
    // 中心石板
    rect(ctx, 20, 20, 8, 8, toHex(pathLight))
    rect(ctx, 20, 20, 8, 1, toHex(pathLight))
    rect(ctx, 20, 27, 8, 1, toHex(pathDark))
    // 石板纹理
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(Math.random() * 48)
      const y = Math.floor(Math.random() * 48)
      px(ctx, x, y, toHex(pathLight))
    }
    // 边缘碎石
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(Math.random() * 48)
      const y = Math.floor(Math.random() * 48)
      px(ctx, x, y, pathGap)
    }
    // 裂纹
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(Math.random() * 48)
      const y = Math.floor(Math.random() * 48)
      px(ctx, x, y, pathGap)
    }
  })

  // === 洞府入口 ===
  makeTexture('bldg_home', ctx => {
    // 山体
    const mt = toHex(pal.rock)
    const mtd = toHex(darken(pal.rock, 0.6))
    const mtl = toHex(lighten(pal.rock, 1.3))
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 48; x++) {
        const dx = x - 24, dy = y - 14
        if (dx * dx / 576 + dy * dy / 196 <= 1) {
          const cy = 10 + y
          if (dx * dx / 400 + dy * dy / 100 < 1 && dx < 0 && dy < 0) {
            px(ctx, x, cy, mtl)
          } else if (dx * dx / 576 + dy * dy / 196 > 0.7) {
            px(ctx, x, cy, mtd)
          } else {
            px(ctx, x, cy, mt)
          }
        }
      }
    }
    // 洞口
    rect(ctx, 19, 24, 10, 14, '#000000')
    rect(ctx, 19, 24, 10, 2, toHex(darken(0, 1)))
    // 门檐
    rect(ctx, 17, 22, 14, 3, toHex(trunkColor))
    rect(ctx, 17, 22, 14, 1, toHex(trunkDark))
    // 石阶
    rect(ctx, 17, 38, 14, 2, mtd)
    rect(ctx, 19, 40, 10, 2, mt)
  })

  // === 城市 ===
  makeTexture('bldg_city', ctx => {
    const wall = toHex(0x8a7a5a)
    const wallD = toHex(darken(0x8a7a5a, 0.6))
    const wallL = toHex(lighten(0x8a7a5a, 1.2))
    const roof = toHex(0x6a4a3a)
    // 城墙
    rect(ctx, 4, 24, 40, 18, wall)
    rect(ctx, 4, 24, 40, 2, wallL)
    rect(ctx, 4, 40, 40, 2, wallD)
    rect(ctx, 4, 24, 2, 18, wallD)
    rect(ctx, 42, 24, 2, 18, wallD)
    // 城垛
    for (let i = 0; i < 5; i++) {
      rect(ctx, 4 + i * 8, 20, 4, 4, wall)
      rect(ctx, 4 + i * 8, 20, 4, 1, wallL)
    }
    // 城门
    rect(ctx, 20, 28, 8, 14, '#2a1a0a')
    rect(ctx, 20, 28, 8, 2, wallD)
    // 门匾
    rect(ctx, 18, 26, 12, 3, roof)
    rect(ctx, 18, 26, 12, 1, toHex(lighten(0x6a4a3a, 1.3)))
    // 中央高塔
    rect(ctx, 20, 8, 8, 16, wall)
    rect(ctx, 20, 8, 8, 1, wallL)
    rect(ctx, 20, 8, 1, 16, wallD)
    rect(ctx, 27, 8, 1, 16, wallD)
    // 塔顶
    rect(ctx, 17, 4, 14, 5, roof)
    rect(ctx, 17, 4, 14, 1, toHex(lighten(0x6a4a3a, 1.3)))
    // 旗帜
    rect(ctx, 23, 0, 2, 5, '#4a3520')
    rect(ctx, 25, 0, 4, 3, '#ef4444')
  })

  // === 宗门 ===
  makeTexture('bldg_sect', ctx => {
    const wall = toHex(0x9a8a6a)
    const wallD = toHex(darken(0x9a8a6a, 0.6))
    const wallL = toHex(lighten(0x9a8a6a, 1.2))
    const roof = toHex(0x5a3a2a)
    const roofL = toHex(lighten(0x5a3a2a, 1.3))
    // 飞檐屋顶
    rect(ctx, 4, 8, 40, 6, roof)
    rect(ctx, 4, 8, 40, 1, roofL)
    rect(ctx, 2, 12, 44, 2, roof)
    rect(ctx, 0, 14, 48, 1, roof)
    // 屋脊
    rect(ctx, 20, 5, 8, 3, roof)
    rect(ctx, 20, 5, 8, 1, roofL)
    // 立柱
    rect(ctx, 6, 16, 4, 24, toHex(trunkColor))
    rect(ctx, 38, 16, 4, 24, toHex(trunkColor))
    rect(ctx, 6, 16, 1, 24, toHex(trunkDark))
    rect(ctx, 38, 16, 1, 24, toHex(trunkDark))
    // 门洞
    rect(ctx, 14, 20, 20, 20, '#2a1a0a')
    rect(ctx, 14, 20, 20, 2, wallD)
    // 匾额
    rect(ctx, 16, 16, 16, 4, wall)
    rect(ctx, 16, 16, 16, 1, wallL)
    // 灯笼
    rect(ctx, 8, 18, 4, 6, '#ef4444')
    px(ctx, 9, 20, '#fbbf24')
    rect(ctx, 36, 18, 4, 6, '#ef4444')
    px(ctx, 37, 20, '#fbbf24')
    // 台阶
    rect(ctx, 4, 40, 40, 2, wallD)
    rect(ctx, 6, 42, 36, 2, wall)
  })

  // === 秘境入口 ===
  makeTexture('bldg_dungeon', ctx => {
    const mt = toHex(darken(pal.rock, 0.7))
    const mtd = toHex(darken(pal.rock, 0.4))
    // 暗色山体
    for (let y = 0; y < 36; y++) {
      for (let x = 0; x < 48; x++) {
        const dx = x - 24, dy = y - 18
        if (dx * dx / 576 + dy * dy / 324 <= 1) {
          const cy = 6 + y
          if (dx * dx / 400 + dy * dy / 200 < 1 && dx < 0 && dy < 0) {
            px(ctx, x, cy, mt)
          } else if (dx * dx / 576 + dy * dy / 324 > 0.7) {
            px(ctx, x, cy, mtd)
          } else {
            px(ctx, x, cy, mt)
          }
        }
      }
    }
    // 裂隙洞口（发红光）
    rect(ctx, 18, 22, 12, 18, '#000000')
    rect(ctx, 18, 22, 12, 2, '#1a0a0a')
    // 红色光晕
    rect(ctx, 20, 34, 8, 4, '#ef4444', 0.3)
    px(ctx, 22, 36, '#fbbf24', 0.5)
    px(ctx, 25, 36, '#fbbf24', 0.5)
    // 苔藓
    px(ctx, 16, 28, toHex(pal.tree))
    px(ctx, 17, 30, toHex(pal.tree))
    px(ctx, 30, 26, toHex(pal.tree))
    px(ctx, 31, 28, toHex(pal.tree))
  })

  // === 地标 ===
  makeTexture('bldg_landmark', ctx => {
    const stone = toHex(0x6a6560)
    const stoneD = toHex(darken(0x6a6560, 0.6))
    const stoneL = toHex(lighten(0x6a6560, 1.3))
    // 石碑主体
    rect(ctx, 14, 8, 20, 36, stone)
    rect(ctx, 14, 8, 20, 2, stoneL)
    rect(ctx, 14, 8, 2, 36, stoneD)
    rect(ctx, 32, 8, 2, 36, stoneD)
    rect(ctx, 14, 42, 20, 2, stoneD)
    // 碑顶
    rect(ctx, 12, 6, 24, 3, stone)
    rect(ctx, 12, 6, 24, 1, stoneL)
    // 碑面刻纹
    rect(ctx, 18, 14, 12, 16, stoneD)
    rect(ctx, 20, 16, 8, 12, stone)
    // 金色符文
    const rune = '#fbbf24'
    px(ctx, 22, 18, rune)
    px(ctx, 23, 18, rune)
    px(ctx, 24, 20, rune)
    px(ctx, 22, 22, rune)
    px(ctx, 25, 22, rune)
    px(ctx, 23, 24, rune)
    px(ctx, 24, 26, rune)
    // 底座
    rect(ctx, 10, 42, 28, 4, stoneD)
    rect(ctx, 10, 42, 28, 1, stoneL)
  })

  // === 竹竹 ===
  makeTexture('bamboo', ctx => {
    const bamC = toHex(0x3a8a4a)
    const bamD = toHex(darken(0x3a8a4a, 0.6))
    const bamL = toHex(lighten(0x3a8a4a, 1.3))
    // 多根竹子
    for (let b = 0; b < 4; b++) {
      const bx = 10 + b * 9
      // 竹杆
      for (let y = 0; y < 36; y++) {
        const sway = Math.sin(y * 0.1 + b) * 0.5
        const x = Math.round(bx + sway)
        px(ctx, x, 6 + y, bamC)
        px(ctx, x + 1, 6 + y, bamD)
        if (y % 6 === 5 && y > 0) {
          rect(ctx, x - 1, 6 + y, 4, 1, bamD)
        }
      }
      // 竹叶
      for (let l = 0; l < 5; l++) {
        const ly = 4 + Math.floor(Math.random() * 8)
        const lx = bx + Math.floor(Math.random() * 6 - 3)
        rect(ctx, lx, ly, 3, 1, bamC)
        px(ctx, lx, ly, bamL)
        px(ctx, lx + 2, ly, bamD)
      }
    }
  })

  // === 莲池 ===
  makeTexture('lotus_pond', ctx => {
    const waterC = toHex(0x1a4a6a)
    const waterD = toHex(darken(0x1a4a6a, 0.6))
    const waterL = toHex(lighten(0x1a4a6a, 1.3))
    // 池水
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 44; x++) {
        const dx = x - 22, dy = y - 12
        if (dx * dx / 484 + dy * dy / 144 <= 1) {
          const lx = 2 + x
          const ly = 18 + y
          if (Math.sin(x * 0.5 + y * 0.3) > 0.7) {
            px(ctx, lx, ly, waterL)
          } else if (dx * dx / 400 + dy * dy / 100 > 0.8) {
            px(ctx, lx, ly, waterD)
          } else {
            px(ctx, lx, ly, waterC)
          }
        }
      }
    }
    // 莲叶
    const leafC = toHex(0x2a6a3a)
    const leafD = toHex(darken(0x2a6a3a, 0.6))
    const leafL = toHex(lighten(0x2a6a3a, 1.3))
    for (let i = 0; i < 3; i++) {
      const cx = 12 + i * 12
      const cy = 30
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          if (dx * dx / 16 + dy * dy / 9 <= 1) {
            px(ctx, cx + dx, cy + dy, dx < 0 && dy < 0 ? leafL : (dx * dx / 16 + dy * dy / 9 > 0.7 ? leafD : leafC))
          }
        }
      }
    }
    // 莲花
    const lotC = '#f0a0c0'
    const lotD = '#c0608a'
    const lotL = '#ffd0e0'
    px(ctx, 24, 26, lotL)
    rect(ctx, 22, 27, 5, 3, lotC)
    rect(ctx, 23, 28, 3, 1, lotD)
    px(ctx, 24, 27, lotL)
    px(ctx, 25, 27, lotL)
  })

  // === 灯笼柱 ===
  makeTexture('lantern_post', ctx => {
    const postC = toHex(0x4a3520)
    const postD = toHex(darken(0x4a3520, 0.6))
    const lanC = toHex(0xef4444)
    const lanD = toHex(darken(0xef4444, 0.6))
    const lanL = toHex(lighten(0xef4444, 1.3))
    // 灯柱
    rect(ctx, 22, 20, 4, 24, postC)
    rect(ctx, 22, 20, 1, 24, postD)
    rect(ctx, 25, 20, 1, 24, postD)
    // 底座
    rect(ctx, 20, 42, 8, 4, postD)
    rect(ctx, 22, 44, 4, 2, postC)
    // 横臂
    rect(ctx, 14, 18, 20, 2, postC)
    rect(ctx, 14, 18, 20, 1, toHex(lighten(0x4a3520, 1.3)))
    // 灯笼
    rect(ctx, 16, 20, 8, 10, lanC)
    rect(ctx, 16, 20, 8, 1, lanL)
    rect(ctx, 16, 29, 8, 1, lanD)
    rect(ctx, 16, 20, 1, 10, lanD)
    rect(ctx, 23, 20, 1, 10, lanD)
    // 灯笼纹
    rect(ctx, 18, 23, 4, 1, lanD)
    rect(ctx, 18, 26, 4, 1, lanD)
    // 灯笼顶
    rect(ctx, 15, 18, 10, 2, postC)
    rect(ctx, 15, 18, 10, 1, toHex(lighten(0x4a3520, 1.3)))
    // 灯穗
    rect(ctx, 19, 30, 2, 3, '#fbbf24')
    px(ctx, 20, 33, '#f59e0b')
    // 光晕
    px(ctx, 12, 24, '#fbbf24', 0.2)
    px(ctx, 28, 24, '#fbbf24', 0.2)
    px(ctx, 13, 28, '#fbbf24', 0.15)
    px(ctx, 27, 28, '#fbbf24', 0.15)
    // 右侧灯笼
    rect(ctx, 26, 20, 8, 10, lanC)
    rect(ctx, 26, 20, 8, 1, lanL)
    rect(ctx, 26, 29, 8, 1, lanD)
    rect(ctx, 26, 20, 1, 10, lanD)
    rect(ctx, 33, 20, 1, 10, lanD)
    rect(ctx, 28, 23, 4, 1, lanD)
    rect(ctx, 28, 26, 4, 1, lanD)
    rect(ctx, 25, 18, 10, 2, postC)
    rect(ctx, 25, 18, 10, 1, toHex(lighten(0x4a3520, 1.3)))
    rect(ctx, 29, 30, 2, 3, '#fbbf24')
  })

  // === 灵芝蘑菇 ===
  makeTexture('mushroom', ctx => {
    const stemC = toHex(0xe8d0a0)
    const stemD = toHex(darken(0xe8d0a0, 0.6))
    const capC = toHex(0x8b2c2c)
    const capD = toHex(darken(0x8b2c2c, 0.6))
    const capL = toHex(lighten(0x8b2c2c, 1.3))
    // 茎
    rect(ctx, 22, 32, 4, 10, stemC)
    rect(ctx, 22, 32, 1, 10, stemD)
    rect(ctx, 25, 32, 1, 10, stemD)
    // 菌盖
    for (let y = 0; y < 8; y++) {
      const w = 20 - y * 2
      const x = 24 - Math.floor(w / 2)
      rect(ctx, x, 24 + y, w, 1, y === 0 ? capL : (y > 5 ? capD : capC))
    }
    // 白点
    px(ctx, 18, 26, '#ffffff')
    px(ctx, 22, 26, '#ffffff')
    px(ctx, 26, 26, '#ffffff')
    px(ctx, 20, 28, '#ffffff')
    px(ctx, 25, 28, '#ffffff')
    // 底部暗影
    rect(ctx, 22, 42, 4, 2, stemD)
    // 小蘑菇
    rect(ctx, 10, 38, 2, 4, stemC)
    px(ctx, 9, 37, capC)
    px(ctx, 10, 37, capC)
    px(ctx, 11, 37, capC)
    px(ctx, 12, 37, capC)
    px(ctx, 13, 37, capL)
    // 第二个小蘑菇
    rect(ctx, 36, 40, 2, 3, stemC)
    px(ctx, 35, 39, capC)
    px(ctx, 36, 39, capC)
    px(ctx, 37, 39, capC)
  })

  // === 灵晶 ===
  makeTexture('crystal', ctx => {
    const cryC = toHex(0x38bdf8)
    const cryD = toHex(darken(0x38bdf8, 0.5))
    const cryL = toHex(lighten(0x38bdf8, 1.5))
    const cryP = toHex(lighten(0x38bdf8, 2.0))
    // 主水晶
    for (let y = 0; y < 20; y++) {
      const w = Math.max(1, 10 - y)
      const x = 24 - Math.floor(w / 2)
      const cy = 18 + y
      if (y < 10) {
        rect(ctx, x, cy, w, 1, y < 3 ? cryL : cryC)
      } else {
        rect(ctx, x + 1, cy, w - 2, 1, y > 15 ? cryD : cryC)
      }
      px(ctx, x, cy, cryD)
      if (w > 2) px(ctx, x + w - 1, cy, cryD)
    }
    // 高光面
    rect(ctx, 22, 20, 2, 12, cryL)
    px(ctx, 22, 20, cryP)
    px(ctx, 22, 22, cryP)
    // 暗面
    rect(ctx, 26, 24, 2, 10, cryD)
    // 基座
    rect(ctx, 18, 38, 12, 4, toHex(darken(0x4a4540, 0.7)))
    rect(ctx, 18, 38, 12, 1, toHex(0x6a6560))
    // 小水晶
    for (let i = 0; i < 3; i++) {
      const sx = 14 + i * 10
      for (let y = 0; y < 8; y++) {
        const w = Math.max(1, 4 - Math.floor(y / 2))
        const x = sx - Math.floor(w / 2)
        rect(ctx, x, 34 + y, w, 1, y < 3 ? cryL : cryC)
      }
    }
    // 光晕
    px(ctx, 20, 24, cryC, 0.3)
    px(ctx, 28, 28, cryC, 0.3)
    px(ctx, 24, 16, cryL, 0.2)
    px(ctx, 30, 22, cryC, 0.2)
  })

  // === 枯树 ===
  makeTexture('dead_tree', ctx => {
    const brC = toHex(0x4a3520)
    const brD = toHex(darken(0x4a3520, 0.5))
    // 树干
    rect(ctx, 22, 20, 4, 24, brC)
    rect(ctx, 22, 20, 1, 24, brD)
    rect(ctx, 25, 20, 1, 24, brD)
    // 分枝
    diagLine(ctx, 22, 22, 12, 14, brC)
    diagLine(ctx, 12, 14, 8, 8, brC)
    diagLine(ctx, 12, 14, 14, 6, brC)
    diagLine(ctx, 22, 20, 16, 12, brC)
    diagLine(ctx, 16, 12, 12, 6, brC)
    diagLine(ctx, 26, 22, 36, 14, brC)
    diagLine(ctx, 36, 14, 40, 8, brC)
    diagLine(ctx, 36, 14, 34, 6, brC)
    diagLine(ctx, 26, 20, 32, 12, brC)
    diagLine(ctx, 32, 12, 36, 6, brC)
    // 细枝
    diagLine(ctx, 14, 6, 10, 2, brD)
    diagLine(ctx, 34, 6, 38, 2, brD)
    diagLine(ctx, 22, 28, 14, 34, brD)
    diagLine(ctx, 26, 28, 34, 34, brD)
    // 零散叶
    px(ctx, 8, 7, toHex(pal.tree))
    px(ctx, 40, 7, toHex(pal.tree))
    px(ctx, 10, 3, toHex(lighten(pal.tree, 1.3)))
    px(ctx, 38, 3, toHex(lighten(pal.tree, 1.3)))
  })

  // === 小宝塔 ===
  makeTexture('pagoda', ctx => {
    const wallC = toHex(0x9a8a6a)
    const wallD = toHex(darken(0x9a8a6a, 0.6))
    const wallL = toHex(lighten(0x9a8a6a, 1.2))
    const roofC = toHex(0x5a3a2a)
    const roofL = toHex(lighten(0x5a3a2a, 1.3))
    // 顶层
    rect(ctx, 18, 4, 12, 6, wallC)
    rect(ctx, 18, 4, 12, 1, wallL)
    rect(ctx, 14, 10, 20, 3, roofC)
    rect(ctx, 14, 10, 20, 1, roofL)
    rect(ctx, 12, 10, 2, 3, roofC)
    rect(ctx, 34, 10, 2, 3, roofC)
    // 顶尖
    rect(ctx, 23, 0, 2, 4, roofC)
    px(ctx, 23, 0, '#fbbf24')
    // 中层
    rect(ctx, 16, 13, 16, 8, wallC)
    rect(ctx, 16, 13, 16, 1, wallL)
    rect(ctx, 16, 20, 16, 1, wallD)
    rect(ctx, 12, 21, 24, 3, roofC)
    rect(ctx, 12, 21, 24, 1, roofL)
    rect(ctx, 10, 21, 2, 3, roofC)
    rect(ctx, 36, 21, 2, 3, roofC)
    // 窗
    rect(ctx, 20, 15, 2, 4, '#2a1a0a')
    rect(ctx, 26, 15, 2, 4, '#2a1a0a')
    // 底层
    rect(ctx, 14, 24, 20, 10, wallC)
    rect(ctx, 14, 24, 20, 1, wallL)
    rect(ctx, 14, 33, 20, 1, wallD)
    rect(ctx, 10, 34, 28, 3, roofC)
    rect(ctx, 10, 34, 28, 1, roofL)
    // 门
    rect(ctx, 22, 27, 4, 7, '#2a1a0a')
    rect(ctx, 22, 27, 4, 1, wallD)
    // 灯笼
    rect(ctx, 14, 28, 2, 4, '#ef4444')
    rect(ctx, 32, 28, 2, 4, '#ef4444')
    // 台阶
    rect(ctx, 8, 37, 32, 2, wallD)
    rect(ctx, 10, 39, 28, 2, wallC)
  })

  // === 灵气门 ===
  makeTexture('spirit_gate', ctx => {
    const stoneC = toHex(0x6a6560)
    const stoneD = toHex(darken(0x6a6560, 0.6))
    const stoneL = toHex(lighten(0x6a6560, 1.3))
    // 左柱
    rect(ctx, 8, 14, 6, 30, stoneC)
    rect(ctx, 8, 14, 2, 30, stoneD)
    rect(ctx, 12, 14, 2, 30, stoneL)
    rect(ctx, 6, 42, 10, 4, stoneD)
    // 右柱
    rect(ctx, 34, 14, 6, 30, stoneC)
    rect(ctx, 34, 14, 2, 30, stoneD)
    rect(ctx, 38, 14, 2, 30, stoneL)
    rect(ctx, 32, 42, 10, 4, stoneD)
    // 横梁
    rect(ctx, 4, 8, 40, 6, stoneC)
    rect(ctx, 4, 8, 40, 2, stoneL)
    rect(ctx, 4, 12, 40, 2, stoneD)
    // 符文
    const rune = '#38bdf8'
    px(ctx, 14, 10, rune)
    px(ctx, 18, 10, rune)
    px(ctx, 24, 10, rune)
    px(ctx, 28, 10, rune)
    px(ctx, 20, 9, rune)
    // 门内光幕
    rect(ctx, 14, 14, 20, 28, '#38bdf8', 0.1)
    rect(ctx, 14, 14, 20, 1, '#7dd3fc', 0.3)
    // 符文光点
    px(ctx, 16, 20, '#7dd3fc', 0.5)
    px(ctx, 22, 25, '#7dd3fc', 0.4)
    px(ctx, 28, 30, '#7dd3fc', 0.5)
    px(ctx, 20, 35, '#7dd3fc', 0.3)
    // 顶角装饰
    px(ctx, 4, 8, '#fbbf24')
    px(ctx, 43, 8, '#fbbf24')
    // 底座
    rect(ctx, 2, 44, 12, 2, stoneD)
    rect(ctx, 34, 44, 12, 2, stoneD)
  })

  // === 石板路 ===
  makeTexture('cobblestone', ctx => {
    const stoneC = toHex(0x8a7a6a)
    const stoneD = toHex(darken(0x8a7a6a, 0.65))
    const stoneL = toHex(lighten(0x8a7a6a, 1.25))
    const gapC = toHex(0x3a3530)
    // 背景
    rect(ctx, 0, 0, 48, 48, stoneD)
    // 石块（不规则铺设）
    const stones = [
      [2, 2, 10, 8], [14, 2, 8, 6], [24, 2, 10, 8], [36, 2, 8, 10],
      [2, 12, 8, 10], [12, 10, 10, 8], [24, 12, 8, 10], [34, 14, 10, 8],
      [2, 24, 10, 8], [14, 20, 8, 10], [24, 24, 10, 8], [36, 24, 8, 10],
      [2, 34, 10, 10], [14, 32, 10, 8], [26, 34, 8, 10], [36, 36, 8, 8],
    ]
    for (const [sx, sy, sw, sh] of stones) {
      rect(ctx, sx, sy, sw, sh, stoneC)
      rect(ctx, sx, sy, sw, 1, stoneL)
      rect(ctx, sx, sy + sh - 1, sw, 1, stoneD)
      rect(ctx, sx, sy, 1, sh, stoneL)
      rect(ctx, sx + sw - 1, sy, 1, sh, stoneD)
      // 高光点
      px(ctx, sx + 1, sy + 1, stoneL)
      // 暗纹
      px(ctx, sx + Math.floor(sw / 2), sy + Math.floor(sh / 2), stoneD)
    }
    // 缝隙
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(Math.random() * 48)
      const y = Math.floor(Math.random() * 48)
      px(ctx, x, y, gapC)
    }
  })

  // === 火把柱 ===
  makeTexture('torch_post', ctx => {
    const postC = toHex(0x4a3520)
    const postD = toHex(darken(0x4a3520, 0.6))
    const fireC = toHex(0xfbbf24)
    const fireL = toHex(lighten(0xfbbf24, 1.3))
    const fireR = toHex(0xef4444)
    // 柱
    rect(ctx, 22, 16, 4, 30, postC)
    rect(ctx, 22, 16, 1, 30, postD)
    rect(ctx, 25, 16, 1, 30, postD)
    // 底座
    rect(ctx, 18, 44, 12, 2, postD)
    rect(ctx, 20, 42, 8, 2, postC)
    // 火碗
    rect(ctx, 18, 12, 12, 4, postC)
    rect(ctx, 18, 12, 12, 1, toHex(lighten(0x4a3520, 1.3)))
    rect(ctx, 16, 14, 16, 2, postD)
    // 火焰
    for (let i = 0; i < 6; i++) {
      const fx = 20 + i * 2
      const fh = 4 + Math.floor(Math.random() * 4)
      rect(ctx, fx, 12 - fh, 2, fh, i < 2 || i > 3 ? fireR : fireC)
      px(ctx, fx, 12 - fh, fireL)
    }
    // 火焰核心
    rect(ctx, 22, 4, 4, 6, fireC)
    rect(ctx, 23, 2, 2, 4, fireL)
    px(ctx, 23, 0, toHex(0xffffff))
    // 光晕
    px(ctx, 14, 10, fireC, 0.2)
    px(ctx, 34, 10, fireC, 0.2)
    px(ctx, 16, 6, fireC, 0.15)
    px(ctx, 32, 6, fireC, 0.15)
    px(ctx, 24, 8, fireL, 0.3)
  })

  // === 雪松（高山专用：深蓝绿针叶 + 白雪覆盖） ===
  makeTexture('snow_pine', ctx => {
    const trunkC = toHex(trunkColor)
    const trunkD = toHex(trunkDark)
    // 树干
    rect(ctx, 22, 38, 4, 8, trunkC)
    rect(ctx, 22, 38, 1, 8, trunkD)
    rect(ctx, 21, 44, 6, 2, trunkD)
    // 冷色调针叶
    const coldTree = darken(pal.tree, 0.7) & 0xff || 0x1a3a3a
    const foliage = toHex(0x1a4a3a)
    const foliageD = toHex(darken(0x1a4a3a, 0.55))
    const foliageL = toHex(lighten(0x1a4a3a, 1.35))
    const snowC = '#e8f0f8'
    const snowL = '#ffffff'
    const tiers = [
      { y: 32, w: 18, h: 8 },
      { y: 24, w: 15, h: 8 },
      { y: 16, w: 12, h: 8 },
      { y: 8, w: 9, h: 7 },
      { y: 3, w: 5, h: 4 },
    ]
    for (const t of tiers) {
      for (let dy = 0; dy < t.h; dy++) {
        const tw = Math.max(1, Math.floor(t.w * (1 - dy / t.h)))
        const tx = 24 - Math.floor(tw / 2)
        // 主体针叶
        rect(ctx, tx, t.y + dy, tw, 1, dy < 2 ? snowC : foliage)
        if (dy >= 2 && dy < t.h - 1) {
          // 底部暗纹
          if (dy === t.h - 2) rect(ctx, tx, t.y + dy, tw, 1, foliageD)
          // 侧高光
          if (tw > 4 && dy < t.h / 2) {
            px(ctx, tx, t.y + dy, foliageL)
            px(ctx, tx + tw - 1, t.y + dy, foliageL)
          }
        }
      }
      // 雪盖在每层顶部
      const topW = Math.max(2, Math.floor(t.w * 0.7))
      const topX = 24 - Math.floor(topW / 2)
      rect(ctx, topX, t.y, topW, 1, snowC)
      if (topW > 3) {
        px(ctx, topX, t.y, snowL)
        px(ctx, topX + topW - 1, t.y, snowL)
      }
    }
    // 顶端
    px(ctx, 24, 2, snowL)
    // 树枝上零星雪点
    px(ctx, 18, 30, snowC)
    px(ctx, 30, 26, snowC)
    px(ctx, 16, 22, snowC)
    px(ctx, 31, 18, snowC)
    // 苔藓
    px(ctx, 22, 38, toHex(pal.bush))
    px(ctx, 25, 40, toHex(pal.bush))
  })

  // === 高山灌木（紧凑型，耐寒，带岩石底座） ===
  makeTexture('alpine_bush', ctx => {
    const bushC = toHex(darken(pal.bush, 0.8))
    const bushD = toHex(darken(pal.bush, 0.5))
    const bushL = toHex(lighten(pal.bush, 1.3))
    const rockC = toHex(pal.rock)
    const rockD = toHex(darken(pal.rock, 0.6))
    const rockL = toHex(lighten(pal.rock, 1.25))
    const snowC = '#d4e4ec'
    // 岩石底座
    for (let y = 38; y < 46; y++) {
      const hw = Math.max(3, 8 - Math.floor((y - 38) * 0.3))
      const xs = 24 - hw
      for (let x = 0; x < hw * 2; x++) {
        const cx = xs + x, cy = y
        const lit = x < hw * 0.35
        const edge = x < 1 || x >= hw * 2 - 1
        if (lit) px(ctx, cx, cy, rockL)
        else if (edge) px(ctx, cx, cy, rockD)
        else px(ctx, cx, cy, rockC)
      }
    }
    // 苔藓覆盖在岩石上
    rect(ctx, 18, 38, 12, 2, bushC, 0.5)
    // 灌木主体（紧凑半球形）
    const cx = 24, cy = 30, r = 9
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r && y < 6) {
          const lx = cx + x, ly = cy + y
          if (lx >= 0 && lx < TEX_SIZE && ly >= 0 && ly < TEX_SIZE) {
            const dist = Math.sqrt(x * x + y * y)
            if (dist < r - 4 && x < -1 && y < -2) {
              px(ctx, lx, ly, bushL)
            } else if (dist > r - 3) {
              px(ctx, lx, ly, bushD)
            } else {
              px(ctx, lx, ly, bushC)
            }
          }
        }
      }
    }
    // 顶部雪点
    px(ctx, 22, 22, snowC)
    px(ctx, 26, 24, snowC)
    px(ctx, 20, 26, snowC, 0.7)
    // 小浆果
    px(ctx, 21, 28, '#4a2a3a')
    px(ctx, 28, 30, '#4a2a3a')
    px(ctx, 19, 32, '#4a2a3a')
  })
}

/** 获取装饰物纹理 key */
export function getDecoKey(type: string, domain: DomainId): string {
  return `world_deco_${type}_${domain}`
}

/** 在地图上散布装饰物（HD-2D 立体感增强版） */
export function scatterDecorations(
  scene: Phaser.Scene, domain: DomainId, mapW: number, mapH: number, sctx?: ScatterContext,
): Phaser.GameObjects.Container[] {
  const decos: Phaser.GameObjects.Container[] = []
  let seed = 13713
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }

  const vegWeights = DOMAIN_VEG_WEIGHTS[domain] ?? DOMAIN_VEG_WEIGHTS.south
  const totalW = vegWeights.reduce((s, d) => s + d.weight, 0)
  const pickFrom = (list: { type: string; weight: number }[]): string => {
    let r = rng() * list.reduce((s, d) => s + d.weight, 0)
    for (const d of list) { r -= d.weight; if (r <= 0) return d.type }
    return list[0].type
  }
  const pickGeneric = (): string => pickFrom(vegWeights)

  const SHADOW_MAP: Record<string, { w: number; h: number }> = {
    pine: { w: 28, h: 8 }, round_tree: { w: 32, h: 10 }, willow: { w: 26, h: 8 },
    bamboo: { w: 24, h: 7 }, dead_tree: { w: 24, h: 7 }, bush_s: { w: 18, h: 6 },
    bush_l: { w: 26, h: 8 }, rock_s: { w: 16, h: 6 }, rock_m: { w: 22, h: 8 },
    rock_l: { w: 34, h: 12 }, crystal: { w: 20, h: 6 }, mushroom: { w: 18, h: 5 },
    flower_r: { w: 10, h: 4 }, flower_y: { w: 10, h: 4 }, flower_b: { w: 10, h: 4 },
    grass_1: { w: 12, h: 4 }, grass_2: { w: 14, h: 5 }, lotus_pond: { w: 40, h: 10 },
    lantern_post: { w: 14, h: 5 }, torch_post: { w: 14, h: 5 }, pagoda: { w: 28, h: 8 },
    spirit_gate: { w: 40, h: 8 }, palm: { w: 26, h: 8 }, coral: { w: 28, h: 6 },
    cactus: { w: 14, h: 5 }, wreck: { w: 36, h: 6 }, beacon: { w: 24, h: 8 },
    war_monument: { w: 28, h: 6 }, ice_crystal: { w: 20, h: 5 }, snow_patch: { w: 40, h: 10 },
    frozen_beast: { w: 40, h: 12 }, sand_dune: { w: 40, h: 10 }, rock_pillar: { w: 20, h: 6 },
    ice_wall: { w: 40, h: 8 }, mountain_l: { w: 40, h: 12 }, mountain_m: { w: 32, h: 10 },
    mountain_s: { w: 24, h: 8 },
  }
  const VEG_TYPES = new Set([
    'pine', 'round_tree', 'willow', 'bamboo', 'dead_tree', 'bush_s', 'bush_l',
    'flower_r', 'flower_y', 'flower_b', 'grass_1', 'grass_2', 'mushroom',
    'palm', 'cactus', 'coral', 'ice_crystal',
  ])

  // --- 区域规划驱动：从区域规划获取植被类型和密度 ---
  const pickForZone = (x: number, y: number): string => {
    // 优先使用区域规划定义的植被
    const regionVeg = getRegionVegType(x, y, domain)
    if (regionVeg) return regionVeg
    // 退回到域权重表
    return pickGeneric()
  }

  // 区域密度阈值：决定该位置是否放置装饰物
  const shouldPlace = (x: number, y: number): boolean => {
    const density = getRegionDensity(x, y, domain)
    return rng() < density
  }

  // --- 集群放置 ---
  const placed: { x: number; y: number; type: string }[] = []
  const tooClose = (x: number, y: number, type: string, minDist: number): boolean => {
    for (const p of placed) {
      if (p.type === type && Math.hypot(x - p.x, y - p.y) < minDist) return true
    }
    return false
  }

  const createDeco = (x: number, y: number, type: string): Phaser.GameObjects.Container | null => {
    const key = getDecoKey(type, domain)
    if (!scene.textures.exists(key)) return null

    const yRatio = y / mapH
    const perspScale = 0.6 + yRatio * 0.6
    const atmAlpha = 0.55 + yRatio * 0.4
    const baseScale = (0.55 + rng() * 0.8) * perspScale
    const flipX = rng() > 0.5 ? 1 : -1

    const shDef = SHADOW_MAP[type] ?? { w: 20, h: 6 }
    const shadow = scene.add.ellipse(0, 2, shDef.w * baseScale, shDef.h * baseScale, 0x000000, 0.3 * atmAlpha)
    shadow.setDepth(1.0 + yRatio * 0.5)

    const img = scene.add.image(0, -2, key).setOrigin(0.5, 1)
    img.setScale(baseScale * flipX, baseScale)
    img.setAlpha(atmAlpha)
    img.setDepth(1.1 + yRatio * 0.5)

    const container = scene.add.container(x, y, [shadow, img])
    container.setDepth(1.0 + yRatio * 0.5)
    container.setData('decoType', type)
    container.setData('baseScale', baseScale)
    container.setData('flipX', flipX)
    if (VEG_TYPES.has(type)) {
      container.setData('isVegetation', true)
      container.setData('phase', rng() * Math.PI * 2)
    }
    placed.push({ x, y, type })
    return container
  }

  // 生成 55-70 个集群（增加密度，让地图更丰富）
  const numClusters = 55 + Math.floor(rng() * 15)
  for (let c = 0; c < numClusters; c++) {
    const cx = 40 + Math.floor(rng() * (mapW - 80))
    const cy = 40 + Math.floor(rng() * (mapH - 80))
    // 避开地图中心（城市区域）
    if (Math.hypot(cx - mapW / 2, cy - mapH / 2) < 60) continue
    // 区域密度检查：低密度区域减少集群
    if (!shouldPlace(cx, cy)) continue

    const clusterSize = 2 + Math.floor(rng() * 5) // 2-6 个
    const spread = 25 + rng() * 35 // 集群半径

    for (let i = 0; i < clusterSize; i++) {
      const angle = (i / clusterSize) * Math.PI * 2 + rng() * 0.5
      const dist = rng() * spread
      const x = Math.max(20, Math.min(mapW - 20, Math.round(cx + Math.cos(angle) * dist)))
      const y = Math.max(20, Math.min(mapH - 20, Math.round(cy + Math.sin(angle) * dist)))

      // 区域密度检查
      if (!shouldPlace(x, y)) continue

      // 每个位置独立选植被类型，让区域内有自然变化
      const type = pickForZone(x, y)
      // 避免同类型过近
      const minDist = ['grass_1', 'grass_2', 'flower_r', 'flower_y', 'flower_b', 'bush_s', 'rock_s'].includes(type) ? 12 : 28
      if (tooClose(x, y, type, minDist)) continue

      const deco = createDeco(x, y, type)
      if (deco) decos.push(deco)
    }
  }

  // 补充散布 35 个独立小型装饰物（填补空隙）
  for (let i = 0; i < 35; i++) {
    const x = 40 + Math.floor(rng() * (mapW - 80))
    const y = 40 + Math.floor(rng() * (mapH - 80))
    if (Math.hypot(x - mapW / 2, y - mapH / 2) < 50) continue
    if (!shouldPlace(x, y)) continue
    const type = pickForZone(x, y)
    if (tooClose(x, y, type, 20)) continue
    const deco = createDeco(x, y, type)
    if (deco) decos.push(deco)
  }

  return decos
}
