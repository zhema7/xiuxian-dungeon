// ---------- 程序化像素形象生成 v2（高精度版） ----------
// 48×48 像素，7 层色阶（shadow/deepDark/dark/base/light/highlight/peak）
// 仿照职业角色精灵图风格：颜色分层 + DaoPath 差异化外观 + 丰富细节
// 运行时合成 Phaser Texture，LRU 缓存

import Phaser from 'phaser'
import type { Gender, DaoPath } from './procedural-npc'

export interface NpcSpriteInput {
  id: string
  appearanceSeed: number
  gender: Gender
  daoPath: DaoPath
  realm: number
}

const SPRITE_SIZE = 48
const CX = 24 // 中心 x
const CACHE_MAX = 80

// ===== 颜色工具 =====

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function darken(color: number, f: number): number {
  const r = clamp255(((color >> 16) & 0xff) * f)
  const g = clamp255(((color >> 8) & 0xff) * f)
  const b = clamp255((color & 0xff) * f)
  return (r << 16) | (g << 8) | b
}

function lighten(color: number, f: number): number {
  const r = clamp255(((color >> 16) & 0xff) * f)
  const g = clamp255(((color >> 8) & 0xff) * f)
  const b = clamp255((color & 0xff) * f)
  return (r << 16) | (g << 8) | b
}

function toHex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0')
}

// 7 层色阶系统
interface ColorLayer {
  shadow: number    // 描边/最暗
  deepDark: number  // 深阴影
  dark: number      // 暗部
  base: number      // 基色
  light: number     // 亮部
  highlight: number // 高光
  peak: number      // 最亮
}

function colorLayers(base: number): ColorLayer {
  return {
    shadow: darken(base, 0.25),
    deepDark: darken(base, 0.45),
    dark: darken(base, 0.65),
    base,
    light: lighten(base, 1.35),
    highlight: lighten(base, 1.7),
    peak: lighten(base, 2.0),
  }
}

// ===== 绘制原语 =====

function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: number, a = 1): void {
  if (x < 0 || x >= SPRITE_SIZE || y < 0 || y >= SPRITE_SIZE) return
  ctx.fillStyle = toHex(c)
  ctx.globalAlpha = a
  ctx.fillRect(x, y, 1, 1)
  ctx.globalAlpha = 1
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: number, a = 1): void {
  ctx.fillStyle = toHex(c)
  ctx.globalAlpha = a
  ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 1
}

function shadedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  L: ColorLayer,
): void {
  rect(ctx, x, y, w, h, L.base)
  if (w >= 2) rect(ctx, x, y, 1, h, L.dark)
  if (w >= 3) rect(ctx, x + 1, y, 1, h, L.deepDark)
  if (w >= 3) rect(ctx, x + w - 1, y, 1, h, L.light)
  if (h >= 3) rect(ctx, x, y, w, 1, L.highlight)
  rect(ctx, x, y + h - 1, w, 1, L.dark)
  if (h >= 4) rect(ctx, x + 1, y + h - 2, w - 2, 1, L.deepDark)
  if (w >= 4 && h >= 4) {
    px(ctx, x, y, L.peak)
    px(ctx, x + w - 1, y + h - 1, L.shadow)
  }
}

function diagLine(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  c: number, a = 1,
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

function fillEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rw: number, rh: number, c: number, a = 1): void {
  for (let y = -rh; y <= rh; y++) {
    for (let x = -rw; x <= rw; x++) {
      if ((x * x) / (rw * rw) + (y * y) / (rh * rh) <= 1) {
        px(ctx, cx + x, cy + y, c, a)
      }
    }
  }
}

// ===== 调色板（扩充版） =====

const ROBE_COLORS = [
  0x4a5568, 0x2d3748, 0x1a365d, 0x2a4365, 0x2c5282,
  0x2f855a, 0x276749, 0x553c9a, 0x44337a, 0x97266d,
  0x9b2c2c, 0x744210, 0x5b2c6f, 0x1e3a5f, 0x4a1d96,
  0x742a2a, 0x3730a3, 0x1e6f5c, 0x5c2a0d, 0x2e2d4a,
  0x1a5276, 0x148f77, 0x7d3c98, 0xa04000, 0x4a2c2a,
  0x16213e, 0x3c6e71, 0x6c3483, 0x922b21, 0x1e8449,
  0x4a2c5a, 0x2a4a3a, 0x5a2a3a, 0x1a3a4a, 0x3a1a3a,
  0x2a3a5a, 0x4a3a1a, 0x1a4a3a, 0x3a2a4a, 0x5a3a2a,
]

const HAIR_COLORS = [
  0x1a1a1a, 0x2d2018, 0x4a3520, 0x6b4423, 0x8b6914,
  0xa0aec0, 0x718096, 0x4a5568, 0x2d3748, 0x1a1a2e,
  0x5c3d2e, 0x3c2a1a, 0xd4a574, 0xc8a064,
  0xb8a090, 0x9e8c7a, 0x7a5c3a, 0x5a3a1a,
  0xe8d0a0, 0xc0a070, 0x8a4a2a, 0x5a2a0a,
  0xd0c0b0, 0xa89888, 0x6a5a4a,
]

const SKIN_COLORS = [
  0xf5dab4, 0xe8c39e, 0xd4a76a, 0xb8860b, 0x8b7355,
  0xcd853f, 0xbc8f8f, 0xf0c8a0, 0xddc0a0, 0xc8956a,
  0xe8b890, 0xd0a080, 0xc89060, 0xf8d8b0,
  0xe0b896, 0xcc9a78, 0xb88860, 0xf0d0a8,
]

const ACCENT_COLORS = [
  0xfbbf24, 0xf59e0b, 0x3b82f6, 0x10b981, 0xef4444,
  0x8b5cf6, 0xec4899, 0x14b8a6, 0xe2e8f0, 0xa78bfa,
  0x06b6d4, 0xf97316, 0x84cc16, 0xfacc15,
  0xd4a574, 0xa78bfa, 0xf472b6, 0x34d399,
]

const EYE_COLORS = [
  0x1a1a1a, 0x2d2018, 0x1a3a5a, 0x5a3a1a, 0x1a5a3a,
]

const REALM_AURA_COLORS = [
  0x000000, 0x000000, 0x000000, 0xa78bfa, 0x38bdf8,
  0xfbbf24, 0x4ade80, 0xf472b6, 0xfb923c,
]

// ===== DaoPath 视觉配置 =====

interface DaoPathStyle {
  weaponType: 'sword' | 'staff' | 'hammer' | 'none'
  hasBareArms: boolean
  robeWidthDelta: number
  accessory: 'pouch' | 'talisman' | 'none'
}

const DAO_STYLES: Record<DaoPath, DaoPathStyle> = {
  '剑道': { weaponType: 'sword', hasBareArms: false, robeWidthDelta: 0, accessory: 'none' },
  '丹道': { weaponType: 'none', hasBareArms: false, robeWidthDelta: 0, accessory: 'pouch' },
  '器道': { weaponType: 'hammer', hasBareArms: false, robeWidthDelta: 0, accessory: 'none' },
  '符道': { weaponType: 'none', hasBareArms: false, robeWidthDelta: 0, accessory: 'talisman' },
  '体修': { weaponType: 'none', hasBareArms: true, robeWidthDelta: 2, accessory: 'none' },
  '法修': { weaponType: 'staff', hasBareArms: false, robeWidthDelta: 0, accessory: 'none' },
}

// ===== 确定性随机 =====

function seededRng(seed: number): () => number {
  let s = seed
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507)
    s = Math.imul(s ^ (s >>> 13), 3266489909)
    s = (s ^ (s >>> 16)) >>> 0
    return s / 4294967296
  }
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

// ===== LRU 缓存 =====

const textureCache = new Map<string, Phaser.Textures.Texture>()
const cacheOrder: string[] = []

function evictCache(): void {
  while (cacheOrder.length > CACHE_MAX) {
    const key = cacheOrder.shift()!
    const tex = textureCache.get(key)
    if (tex) {
      tex.destroy()
      textureCache.delete(key)
    }
  }
}

// ===== 地面阴影（椭圆 + 模糊） =====

function drawGroundShadow(ctx: CanvasRenderingContext2D): void {
  fillEllipse(ctx, CX, 43, 10, 2, 0x000000, 0.4)
  fillEllipse(ctx, CX, 43, 8, 1, 0x000000, 0.25)
  px(ctx, CX - 11, 43, 0x000000, 0.15)
  px(ctx, CX + 10, 43, 0x000000, 0.15)
}

// ===== 道袍身体（详细版） =====

function drawRobe(
  ctx: CanvasRenderingContext2D,
  robe: ColorLayer,
  accent: number,
  gender: Gender,
  widthDelta: number,
  rng: () => number,
): void {
  const bodyW = 16 + widthDelta
  const bodyX = CX - Math.floor(bodyW / 2)
  const bodyTop = 22
  const bodyH = 18

  // 道袍主体
  shadedRect(ctx, bodyX, bodyTop, bodyW, bodyH, robe)

  // 下摆梯形扩展
  rect(ctx, bodyX - 1, bodyTop + 6, 1, bodyH - 6, robe.deepDark)
  rect(ctx, bodyX + bodyW, bodyTop + 6, 1, bodyH - 6, robe.deepDark)
  rect(ctx, bodyX - 2, bodyTop + 10, 1, bodyH - 10, robe.shadow)
  rect(ctx, bodyX + bodyW + 1, bodyTop + 10, 1, bodyH - 10, robe.shadow)

  // 下摆底部加深
  rect(ctx, bodyX - 1, bodyTop + bodyH - 3, bodyW + 2, 3, robe.deepDark)
  rect(ctx, bodyX - 2, bodyTop + bodyH - 1, bodyW + 4, 1, robe.shadow)

  // 道袍镶边（底部和袖口边饰）
  const trimColor = lighten(robe.base, 1.5)
  rect(ctx, bodyX - 1, bodyTop + bodyH - 4, bodyW + 2, 1, trimColor)
  px(ctx, CX, bodyTop + bodyH - 4, robe.peak)

  // 胸前刺绣纹样（7 种）
  const pattern = Math.floor(rng() * 7)
  if (pattern === 0) {
    // 菱形纹
    px(ctx, CX, bodyTop + 3, robe.highlight)
    px(ctx, CX - 1, bodyTop + 4, robe.light)
    px(ctx, CX + 1, bodyTop + 4, robe.light)
    px(ctx, CX, bodyTop + 5, robe.highlight)
    px(ctx, CX - 1, bodyTop + 4, robe.peak)
    px(ctx, CX + 1, bodyTop + 4, robe.peak)
  } else if (pattern === 1) {
    // 云纹
    px(ctx, CX - 2, bodyTop + 4, robe.light)
    px(ctx, CX, bodyTop + 3, robe.highlight)
    px(ctx, CX + 2, bodyTop + 4, robe.light)
    px(ctx, CX - 1, bodyTop + 5, robe.light)
    px(ctx, CX + 1, bodyTop + 5, robe.light)
    px(ctx, CX - 3, bodyTop + 5, robe.dark)
    px(ctx, CX + 3, bodyTop + 5, robe.dark)
  } else if (pattern === 2) {
    // 竖条纹
    rect(ctx, CX - 2, bodyTop + 2, 1, 6, robe.light)
    rect(ctx, CX + 1, bodyTop + 2, 1, 6, robe.light)
    px(ctx, CX - 2, bodyTop + 2, robe.highlight)
    px(ctx, CX + 1, bodyTop + 2, robe.highlight)
    px(ctx, CX - 2, bodyTop + 7, robe.deepDark)
    px(ctx, CX + 1, bodyTop + 7, robe.deepDark)
  } else if (pattern === 3) {
    // 龙鳞纹
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const sx = CX - 2 + c * 2
        const sy = bodyTop + 3 + r * 2
        px(ctx, sx, sy, robe.light)
        px(ctx, sx + 1, sy, robe.highlight)
        px(ctx, sx, sy + 1, robe.dark)
      }
    }
  } else if (pattern === 4) {
    // 莲花纹
    px(ctx, CX, bodyTop + 3, robe.highlight)
    px(ctx, CX - 1, bodyTop + 4, robe.light)
    px(ctx, CX + 1, bodyTop + 4, robe.light)
    px(ctx, CX - 2, bodyTop + 5, robe.light)
    px(ctx, CX + 2, bodyTop + 5, robe.light)
    px(ctx, CX, bodyTop + 5, robe.peak)
    px(ctx, CX, bodyTop + 6, robe.highlight)
    px(ctx, CX - 1, bodyTop + 6, robe.dark)
    px(ctx, CX + 1, bodyTop + 6, robe.dark)
  } else if (pattern === 5) {
    // 星辰纹
    px(ctx, CX - 2, bodyTop + 3, robe.highlight)
    px(ctx, CX + 2, bodyTop + 3, robe.highlight)
    px(ctx, CX, bodyTop + 5, robe.peak)
    px(ctx, CX - 3, bodyTop + 6, robe.light)
    px(ctx, CX + 3, bodyTop + 6, robe.light)
    px(ctx, CX - 1, bodyTop + 7, robe.light)
    px(ctx, CX + 1, bodyTop + 7, robe.light)
    px(ctx, CX - 2, bodyTop + 4, robe.dark)
    px(ctx, CX + 2, bodyTop + 4, robe.dark)
  } else {
    // 雷纹
    diagLine(ctx, CX - 2, bodyTop + 3, CX - 1, bodyTop + 4, robe.highlight)
    diagLine(ctx, CX - 1, bodyTop + 4, CX, bodyTop + 3, robe.highlight)
    diagLine(ctx, CX, bodyTop + 3, CX + 1, bodyTop + 4, robe.highlight)
    diagLine(ctx, CX + 1, bodyTop + 4, CX + 2, bodyTop + 3, robe.highlight)
    px(ctx, CX - 2, bodyTop + 5, robe.light)
    px(ctx, CX + 2, bodyTop + 5, robe.light)
    px(ctx, CX, bodyTop + 6, robe.peak)
    px(ctx, CX - 1, bodyTop + 7, robe.dark)
    px(ctx, CX + 1, bodyTop + 7, robe.dark)
  }

  // 交领 V 字领口
  const collarW = gender === 'female' ? 7 : 8
  const collarX = CX - Math.floor(collarW / 2)
  rect(ctx, collarX, bodyTop, collarW, 6, robe.base)
  rect(ctx, collarX, bodyTop, collarW, 1, robe.highlight)
  rect(ctx, collarX, bodyTop + 5, collarW, 1, robe.deepDark)

  // 白色内衬
  rect(ctx, collarX + 2, bodyTop + 1, collarW - 4, 4, 0xf5f5f0)
  rect(ctx, collarX + 2, bodyTop + 1, collarW - 4, 1, 0xffffff)
  // V 字领口线
  diagLine(ctx, collarX, bodyTop, CX, bodyTop + 5, robe.light)
  diagLine(ctx, collarX + collarW - 1, bodyTop, CX, bodyTop + 5, robe.light)

  // 腰带
  const beltY = bodyTop + 7
  const beltLayers = colorLayers(accent)
  rect(ctx, bodyX, beltY, bodyW, 3, beltLayers.base)
  rect(ctx, bodyX, beltY, bodyW, 1, beltLayers.highlight)
  rect(ctx, bodyX, beltY + 2, bodyW, 1, beltLayers.deepDark)

  // 腰带扣
  rect(ctx, CX - 2, beltY, 4, 3, beltLayers.highlight)
  px(ctx, CX - 2, beltY, beltLayers.peak)
  px(ctx, CX + 1, beltY, beltLayers.peak)
  px(ctx, CX, beltY + 1, beltLayers.dark)
  rect(ctx, CX - 1, beltY + 2, 2, 1, beltLayers.dark)

  // 腰带下垂穗子
  rect(ctx, CX - 1, beltY + 3, 1, 4, beltLayers.dark)
  px(ctx, CX - 1, beltY + 7, beltLayers.shadow)
  rect(ctx, CX + 1, beltY + 3, 1, 3, beltLayers.dark)
  px(ctx, CX + 1, beltY + 6, beltLayers.shadow)
}

// ===== 手臂 =====

function drawArms(
  ctx: CanvasRenderingContext2D,
  robe: ColorLayer,
  skin: ColorLayer,
  bareArms: boolean,
  widthDelta: number,
): void {
  const bodyW = 16 + widthDelta
  const bodyX = CX - Math.floor(bodyW / 2)
  const armTop = 23
  const armH = 10

  if (bareArms) {
    // 体修：裸露手臂
    shadedRect(ctx, bodyX - 5, armTop, 5, armH, skin)
    shadedRect(ctx, bodyX + bodyW, armTop, 5, armH, skin)
    // 手
    rect(ctx, bodyX - 5, armTop + armH, 5, 2, skin.dark)
    rect(ctx, bodyX + bodyW, armTop + armH, 5, 2, skin.dark)
    px(ctx, bodyX - 4, armTop + armH, skin.deepDark)
    px(ctx, bodyX + bodyW + 3, armTop + armH, skin.deepDark)
    // 肌肉线条
    rect(ctx, bodyX - 3, armTop + 2, 1, armH - 3, skin.shadow)
    rect(ctx, bodyX + bodyW + 2, armTop + 2, 1, armH - 3, skin.shadow)
    // 护腕
    rect(ctx, bodyX - 5, armTop + armH - 2, 5, 2, robe.base)
    rect(ctx, bodyX + bodyW, armTop + armH - 2, 5, 2, robe.base)
    px(ctx, bodyX - 4, armTop + armH - 2, robe.highlight)
    px(ctx, bodyX + bodyW + 1, armTop + armH - 2, robe.highlight)
  } else {
    // 道袍袖子
    shadedRect(ctx, bodyX - 5, armTop, 5, armH, robe)
    shadedRect(ctx, bodyX + bodyW, armTop, 5, armH, robe)
    // 袖口暗色
    rect(ctx, bodyX - 5, armTop + armH, 5, 2, robe.deepDark)
    rect(ctx, bodyX + bodyW, armTop + armH, 5, 2, robe.deepDark)
    // 袖口镶边
    rect(ctx, bodyX - 5, armTop + armH, 5, 1, lighten(robe.base, 1.5))
    rect(ctx, bodyX + bodyW, armTop + armH, 5, 1, lighten(robe.base, 1.5))
    // 手（肤色露出袖口）
    rect(ctx, bodyX - 4, armTop + armH + 1, 4, 2, skin.base)
    rect(ctx, bodyX + bodyW + 1, armTop + armH + 1, 4, 2, skin.base)
    rect(ctx, bodyX - 4, armTop + armH + 2, 4, 1, skin.dark)
    rect(ctx, bodyX + bodyW + 1, armTop + armH + 2, 4, 1, skin.dark)
    // 指缝
    px(ctx, bodyX - 2, armTop + armH + 2, skin.deepDark)
    px(ctx, bodyX + bodyW + 3, armTop + armH + 2, skin.deepDark)
  }
}

// ===== 头部 =====

function drawHead(ctx: CanvasRenderingContext2D, skin: ColorLayer, gender: Gender): void {
  // 头部主体（14×13）
  shadedRect(ctx, CX - 6, 8, 12, 13, skin)
  // 下巴收窄
  rect(ctx, CX - 5, 20, 10, 1, skin.dark)
  rect(ctx, CX - 4, 21, 8, 1, skin.dark)
  px(ctx, CX - 6, 20, skin.deepDark)
  px(ctx, CX + 5, 20, skin.deepDark)
  // 脖子
  rect(ctx, CX - 3, 19, 6, 3, skin.base)
  rect(ctx, CX - 3, 19, 1, 3, skin.dark)
  rect(ctx, CX + 2, 19, 1, 3, skin.dark)
  rect(ctx, CX - 2, 21, 4, 1, skin.deepDark)

  // 耳朵
  px(ctx, CX - 6, 14, skin.dark)
  px(ctx, CX - 6, 15, skin.deepDark)
  px(ctx, CX + 5, 14, skin.dark)
  px(ctx, CX + 5, 15, skin.deepDark)

  // 女性腮红
  if (gender === 'female') {
    px(ctx, CX - 4, 16, 0xf0a0a0, 0.3)
    px(ctx, CX + 3, 16, 0xf0a0a0, 0.3)
  }
}

// ===== 发型（12 种详细版） =====

function drawHair(
  ctx: CanvasRenderingContext2D,
  hair: ColorLayer,
  rng: () => number,
  gender: Gender,
): void {
  const style = Math.floor(rng() * 12)

  switch (style) {
    case 0: // 短发
      rect(ctx, CX - 6, 6, 12, 5, hair.base)
      rect(ctx, CX - 6, 6, 12, 1, hair.highlight)
      rect(ctx, CX - 6, 10, 12, 1, hair.dark)
      // 鬓角
      rect(ctx, CX - 6, 11, 1, 3, hair.dark)
      rect(ctx, CX + 5, 11, 1, 3, hair.dark)
      // 刘海
      rect(ctx, CX - 5, 7, 10, 2, hair.base)
      rect(ctx, CX - 5, 8, 10, 1, hair.deepDark)
      px(ctx, CX - 5, 7, hair.light)
      px(ctx, CX + 4, 7, hair.light)
      break

    case 1: // 长发（披肩）
      rect(ctx, CX - 6, 6, 12, 5, hair.base)
      rect(ctx, CX - 6, 6, 12, 1, hair.highlight)
      rect(ctx, CX - 6, 10, 12, 1, hair.dark)
      // 两侧长发
      rect(ctx, CX - 7, 8, 2, 13, hair.base)
      rect(ctx, CX + 5, 8, 2, 13, hair.base)
      rect(ctx, CX - 7, 8, 1, 13, hair.dark)
      rect(ctx, CX + 6, 8, 1, 13, hair.dark)
      rect(ctx, CX - 7, 20, 2, 1, hair.shadow)
      rect(ctx, CX + 5, 20, 2, 1, hair.shadow)
      // 刘海
      rect(ctx, CX - 5, 7, 10, 2, hair.base)
      px(ctx, CX - 5, 7, hair.light)
      px(ctx, CX + 4, 7, hair.light)
      px(ctx, CX - 5, 8, hair.deepDark)
      px(ctx, CX + 4, 8, hair.deepDark)
      break

    case 2: // 道髻
      rect(ctx, CX - 6, 6, 12, 5, hair.base)
      rect(ctx, CX - 6, 6, 12, 1, hair.highlight)
      rect(ctx, CX - 6, 10, 12, 1, hair.dark)
      // 发髻
      fillEllipse(ctx, CX, 3, 3, 3, hair.base)
      px(ctx, CX - 2, 2, hair.highlight)
      px(ctx, CX, 2, hair.highlight)
      px(ctx, CX - 3, 4, hair.dark)
      px(ctx, CX + 2, 4, hair.dark)
      // 发簪
      rect(ctx, CX + 2, 3, 3, 1, 0xfbbf24)
      px(ctx, CX + 4, 3, 0xf59e0b)
      break

    case 3: // 半束发
      rect(ctx, CX - 6, 6, 12, 5, hair.base)
      rect(ctx, CX - 6, 6, 12, 1, hair.highlight)
      rect(ctx, CX - 6, 10, 12, 1, hair.dark)
      // 小发髻偏左
      fillEllipse(ctx, CX - 5, 4, 2, 2, hair.base)
      px(ctx, CX - 6, 3, hair.highlight)
      // 散落发丝
      rect(ctx, CX + 4, 7, 3, 9, hair.dark)
      rect(ctx, CX + 5, 7, 1, 9, hair.deepDark)
      px(ctx, CX + 6, 15, hair.shadow)
      break

    case 4: // 高马尾
      rect(ctx, CX - 6, 6, 12, 4, hair.base)
      rect(ctx, CX - 6, 6, 12, 1, hair.highlight)
      rect(ctx, CX - 6, 9, 12, 1, hair.dark)
      // 马尾束起
      rect(ctx, CX + 3, 2, 4, 5, hair.base)
      px(ctx, CX + 3, 2, hair.highlight)
      px(ctx, CX + 6, 2, hair.highlight)
      // 马尾下垂
      rect(ctx, CX + 4, 7, 3, 12, hair.base)
      rect(ctx, CX + 5, 7, 1, 12, hair.light)
      rect(ctx, CX + 4, 18, 3, 1, hair.shadow)
      rect(ctx, CX + 6, 7, 1, 12, hair.dark)
      // 发绳
      rect(ctx, CX + 3, 6, 2, 1, 0xef4444)
      break

    case 5: // 双髻（女）
      rect(ctx, CX - 6, 6, 12, 4, hair.base)
      rect(ctx, CX - 6, 6, 12, 1, hair.highlight)
      // 左右发髻
      fillEllipse(ctx, CX - 8, 4, 3, 3, hair.base)
      fillEllipse(ctx, CX + 8, 4, 3, 3, hair.base)
      px(ctx, CX - 9, 3, hair.highlight)
      px(ctx, CX + 7, 3, hair.highlight)
      px(ctx, CX - 7, 4, hair.dark)
      px(ctx, CX + 6, 4, hair.dark)
      // 垂坠
      rect(ctx, CX - 9, 6, 1, 5, hair.dark)
      rect(ctx, CX + 8, 6, 1, 5, hair.dark)
      break

    case 6: // 披散发
      rect(ctx, CX - 6, 6, 12, 5, hair.base)
      rect(ctx, CX - 6, 6, 12, 1, hair.highlight)
      rect(ctx, CX - 8, 7, 16, 14, hair.base)
      rect(ctx, CX - 8, 7, 1, 14, hair.dark)
      rect(ctx, CX + 7, 7, 1, 14, hair.dark)
      // 露出脸部
      fillEllipse(ctx, CX, 14, 5, 5, 0x000000, 0)
      // 重画脸部肤色
      fillEllipse(ctx, CX, 14, 5, 5, 0xf5dab4)
      // 前刘海
      rect(ctx, CX - 6, 6, 12, 3, hair.base)
      rect(ctx, CX - 6, 8, 12, 1, hair.dark)
      px(ctx, CX - 5, 6, hair.light)
      px(ctx, CX + 4, 6, hair.light)
      break

    case 7: // 冠发（高境界专用）
      rect(ctx, CX - 6, 6, 12, 5, hair.base)
      rect(ctx, CX - 6, 6, 12, 1, hair.highlight)
      rect(ctx, CX - 6, 10, 12, 1, hair.dark)
      // 玉冠
      rect(ctx, CX - 4, 2, 8, 4, 0x2a3a4a)
      rect(ctx, CX - 4, 2, 8, 1, 0x4a6a8a)
      rect(ctx, CX - 4, 5, 8, 1, 0x1a2a3a)
      // 冠饰宝石
      px(ctx, CX, 3, 0xfbbf24)
      px(ctx, CX, 4, 0xf59e0b)
      break

    case 8: // 流水长发（女）
      rect(ctx, CX - 6, 6, 12, 5, hair.base)
      rect(ctx, CX - 6, 6, 12, 1, hair.highlight)
      rect(ctx, CX - 6, 10, 12, 1, hair.dark)
      // 长发飘逸
      for (let i = 0; i < 5; i++) {
        const x = CX - 7 + i * 3
        rect(ctx, x, 8, 2, 15, hair.base)
        px(ctx, x, 8, hair.light)
        px(ctx, x + 1, 22, hair.shadow)
      }
      rect(ctx, CX - 7, 8, 1, 15, hair.dark)
      rect(ctx, CX + 6, 8, 1, 15, hair.dark)
      // 刘海
      rect(ctx, CX - 5, 7, 10, 2, hair.base)
      px(ctx, CX - 5, 7, hair.highlight)
      px(ctx, CX + 4, 7, hair.highlight)
      break

    case 9: // 编辫
      rect(ctx, CX - 6, 6, 12, 5, hair.base)
      rect(ctx, CX - 6, 6, 12, 1, hair.highlight)
      rect(ctx, CX - 6, 10, 12, 1, hair.dark)
      // 辫子
      for (let i = 0; i < 8; i++) {
        const y = 11 + i * 2
        const offset = i % 2 === 0 ? -1 : 1
        rect(ctx, CX - 1 + offset, y, 3, 1, hair.base)
        px(ctx, CX - 1 + offset, y, hair.dark)
        px(ctx, CX + 1 + offset, y, hair.deepDark)
      }
      // 辫尾
      px(ctx, CX, 27, hair.shadow)
      px(ctx, CX, 28, hair.shadow)
      // 发绳
      rect(ctx, CX - 1, 10, 3, 1, 0xef4444)
      break

    case 10: // 乱发/刺猬
      rect(ctx, CX - 6, 6, 12, 5, hair.base)
      rect(ctx, CX - 6, 6, 12, 1, hair.highlight)
      // 竖起的发丝
      for (let i = 0; i < 6; i++) {
        const x = CX - 5 + i * 2
        rect(ctx, x, 4, 1, 2, hair.base)
        px(ctx, x, 4, hair.light)
      }
      // 鬓角
      rect(ctx, CX - 6, 11, 1, 3, hair.dark)
      rect(ctx, CX + 5, 11, 1, 3, hair.dark)
      break

    case 11: // 光头/戒疤（体修专用感）
      // 头皮色
      rect(ctx, CX - 5, 6, 10, 3, 0xd4a76a)
      rect(ctx, CX - 5, 6, 10, 1, 0xe8c39e)
      rect(ctx, CX - 5, 8, 10, 1, 0xb8860b)
      // 戒疤点
      px(ctx, CX - 2, 7, 0x8b4513)
      px(ctx, CX, 7, 0x8b4513)
      px(ctx, CX + 2, 7, 0x8b4513)
      break
  }
}

// ===== 面部（5 眼 + 4 眉 + 3 嘴） =====

function drawFace(ctx: CanvasRenderingContext2D, rng: () => number, skin: ColorLayer, gender: Gender): void {
  const browColor = darken(0x2d2018, 0.7)
  const eyeColor = pick(EYE_COLORS, rng)

  // 眉毛（4 种）
  const browStyle = Math.floor(rng() * 4)
  if (browStyle === 0) {
    // 平眉
    rect(ctx, CX - 5, 13, 4, 1, browColor)
    rect(ctx, CX + 1, 13, 4, 1, browColor)
    px(ctx, CX - 5, 13, lighten(browColor, 1.3))
    px(ctx, CX + 1, 13, lighten(browColor, 1.3))
  } else if (browStyle === 1) {
    // 剑眉（上扬）
    rect(ctx, CX - 5, 13, 4, 1, browColor)
    rect(ctx, CX + 1, 13, 4, 1, browColor)
    px(ctx, CX - 5, 12, browColor)
    px(ctx, CX + 4, 12, browColor)
    px(ctx, CX - 5, 13, lighten(browColor, 1.3))
  } else if (browStyle === 2) {
    // 弯眉（女）
    rect(ctx, CX - 5, 13, 4, 1, browColor)
    rect(ctx, CX + 1, 13, 4, 1, browColor)
    px(ctx, CX - 4, 12, browColor)
    px(ctx, CX + 2, 12, browColor)
    px(ctx, CX - 3, 12, darken(browColor, 0.8))
    px(ctx, CX + 3, 12, darken(browColor, 0.8))
  } else {
    // 无眉（淡）
    rect(ctx, CX - 5, 13, 4, 1, skin.dark)
    rect(ctx, CX + 1, 13, 4, 1, skin.dark)
  }

  // 眼睛（5 种）
  const eyeStyle = Math.floor(rng() * 5)
  if (eyeStyle === 0) {
    // 圆眼
    rect(ctx, CX - 4, 15, 3, 3, eyeColor)
    rect(ctx, CX + 2, 15, 3, 3, eyeColor)
    px(ctx, CX - 3, 15, 0xffffff)
    px(ctx, CX + 3, 15, 0xffffff)
    px(ctx, CX - 2, 17, 0xffffff, 0.5)
    px(ctx, CX + 3, 17, 0xffffff, 0.5)
  } else if (eyeStyle === 1) {
    // 细眼
    rect(ctx, CX - 4, 15, 3, 1, eyeColor)
    rect(ctx, CX + 2, 15, 3, 1, eyeColor)
    px(ctx, CX - 3, 16, eyeColor)
    px(ctx, CX + 3, 16, eyeColor)
  } else if (eyeStyle === 2) {
    // 丹凤眼
    px(ctx, CX - 4, 15, eyeColor)
    px(ctx, CX - 3, 16, eyeColor)
    px(ctx, CX - 2, 17, eyeColor)
    px(ctx, CX + 2, 15, eyeColor)
    px(ctx, CX + 3, 16, eyeColor)
    px(ctx, CX + 4, 17, eyeColor)
    px(ctx, CX - 4, 14, eyeColor)
    px(ctx, CX + 4, 14, eyeColor)
  } else if (eyeStyle === 3) {
    // 闭眼/微笑
    rect(ctx, CX - 4, 16, 3, 1, eyeColor)
    rect(ctx, CX + 2, 16, 3, 1, eyeColor)
    px(ctx, CX - 4, 15, darken(eyeColor, 0.7))
    px(ctx, CX + 4, 15, darken(eyeColor, 0.7))
  } else {
    // 笑眼（弯月）
    rect(ctx, CX - 4, 16, 3, 1, eyeColor)
    rect(ctx, CX + 2, 16, 3, 1, eyeColor)
    px(ctx, CX - 4, 15, eyeColor)
    px(ctx, CX - 2, 15, eyeColor)
    px(ctx, CX + 2, 15, eyeColor)
    px(ctx, CX + 4, 15, eyeColor)
  }

  // 鼻子
  px(ctx, CX, 18, skin.deepDark)
  px(ctx, CX, 19, skin.dark)

  // 嘴（3 种）
  const mouthColor = 0x8b4040
  const mouthStyle = Math.floor(rng() * 3)
  if (mouthStyle === 0) {
    // 平嘴
    rect(ctx, CX - 1, 20, 3, 1, mouthColor)
  } else if (mouthStyle === 1) {
    // 微笑
    px(ctx, CX - 2, 20, mouthColor)
    rect(ctx, CX - 1, 20, 3, 1, mouthColor)
    px(ctx, CX + 2, 20, mouthColor)
    px(ctx, CX, 21, darken(mouthColor, 0.7))
  } else {
    // 抿嘴
    px(ctx, CX - 1, 20, mouthColor)
    px(ctx, CX, 20, mouthColor)
    px(ctx, CX + 1, 20, mouthColor)
  }
}

// ===== DaoPath 武器/配饰（详细版） =====

function drawSwordOnBack(ctx: CanvasRenderingContext2D): void {
  // 剑鞘
  diagLine(ctx, 8, 6, 20, 22, 0x4a3520)
  diagLine(ctx, 9, 5, 21, 21, 0x6b4423)
  diagLine(ctx, 10, 6, 22, 22, 0x8b6914)
  diagLine(ctx, 7, 7, 19, 23, 0x3c2a1a)
  // 剑柄露出
  diagLine(ctx, 20, 22, 24, 26, 0x8b6914)
  diagLine(ctx, 21, 23, 25, 27, 0x6b4423)
  // 剑格
  rect(ctx, 19, 21, 3, 2, 0xfbbf24)
  rect(ctx, 19, 21, 3, 1, 0xf59e0b)
  px(ctx, 21, 21, 0xfff5d0)
  // 剑穗
  rect(ctx, 24, 26, 2, 4, 0xef4444)
  px(ctx, 24, 30, 0xef4444)
  px(ctx, 25, 29, 0xef4444)
  // 鞘上纹饰
  px(ctx, 14, 14, 0xfbbf24)
  px(ctx, 15, 15, 0xfbbf24)
}

function drawStaff(ctx: CanvasRenderingContext2D): void {
  // 杖身
  rect(ctx, 36, 12, 3, 24, 0x6b4423)
  rect(ctx, 36, 12, 1, 24, 0x8b6914)
  rect(ctx, 38, 12, 1, 24, 0x4a3520)
  // 杖节
  rect(ctx, 35, 18, 5, 1, 0x4a3520)
  rect(ctx, 35, 26, 5, 1, 0x4a3520)
  // 杖顶宝石座
  rect(ctx, 34, 8, 7, 4, 0xfbbf24)
  rect(ctx, 34, 8, 7, 1, 0xfff5d0)
  rect(ctx, 34, 11, 7, 1, 0xf59e0b)
  // 宝石
  fillEllipse(ctx, 37, 6, 3, 3, 0x38bdf8)
  px(ctx, 36, 5, 0x7dd3fc)
  px(ctx, 37, 5, 0x7dd3fc)
  px(ctx, 36, 7, 0x0ea5e9)
  px(ctx, 38, 7, 0x0ea5e9)
  // 宝石光晕
  px(ctx, 34, 5, 0x38bdf8, 0.3)
  px(ctx, 40, 6, 0x38bdf8, 0.3)
  px(ctx, 35, 8, 0x38bdf8, 0.2)
  px(ctx, 39, 8, 0x38bdf8, 0.2)
}

function drawHammer(ctx: CanvasRenderingContext2D): void {
  // 锤头
  rect(ctx, 6, 20, 8, 7, 0x4a5568)
  rect(ctx, 6, 20, 8, 1, 0x718096)
  rect(ctx, 6, 26, 8, 1, 0x2d3748)
  rect(ctx, 6, 20, 1, 7, 0x2d3748)
  rect(ctx, 13, 20, 1, 7, 0x2d3748)
  // 高光
  rect(ctx, 7, 21, 3, 1, 0xa0aec0)
  px(ctx, 7, 21, 0xe2e8f0)
  // 锤面纹饰
  px(ctx, 9, 23, 0xfbbf24)
  px(ctx, 10, 23, 0xfbbf24)
  // 锤柄
  rect(ctx, 11, 23, 3, 15, 0x6b4423)
  rect(ctx, 11, 23, 1, 15, 0x8b6914)
  rect(ctx, 13, 23, 1, 15, 0x4a3520)
  // 绑绳
  rect(ctx, 11, 27, 3, 2, 0x9b2c2c)
  rect(ctx, 11, 27, 3, 1, 0xef4444)
  // 锤柄底环
  rect(ctx, 11, 36, 3, 2, 0x4a5568)
}

function drawAlchemyPouch(ctx: CanvasRenderingContext2D): void {
  // 袋身
  rect(ctx, 30, 34, 7, 8, 0x5c2a0d)
  rect(ctx, 30, 34, 7, 1, 0x8b6914)
  rect(ctx, 30, 41, 7, 1, 0x3c1a05)
  rect(ctx, 30, 34, 1, 8, 0x3c1a05)
  rect(ctx, 36, 34, 1, 8, 0x4a2a15)
  // 袋口绳
  rect(ctx, 31, 33, 5, 1, 0x8b6914)
  px(ctx, 31, 32, 0x8b6914)
  px(ctx, 35, 32, 0x8b6914)
  // 丹药瓶
  rect(ctx, 32, 36, 2, 3, 0x4ade80)
  px(ctx, 32, 36, 0x86efac)
  px(ctx, 33, 38, 0x22c55e)
  // 第二瓶
  px(ctx, 35, 36, 0x60a5fa)
  px(ctx, 35, 37, 0x60a5fa)
  px(ctx, 35, 38, 0x3b82f6)
  // 装饰流苏
  px(ctx, 32, 42, 0xfbbf24)
  px(ctx, 35, 42, 0xfbbf24)
}

function drawTalisman(ctx: CanvasRenderingContext2D): void {
  // 符箓纸
  rect(ctx, 29, 31, 4, 9, 0xf5f5e8)
  rect(ctx, 29, 31, 4, 1, 0xd4d4c0)
  rect(ctx, 29, 39, 4, 1, 0xa0a090)
  rect(ctx, 29, 31, 1, 9, 0xd4d4c0)
  rect(ctx, 32, 31, 1, 9, 0xe0e0d0)
  // 符文（朱砂红）
  px(ctx, 30, 33, 0x9b2c2c)
  rect(ctx, 30, 34, 2, 1, 0x9b2c2c)
  px(ctx, 31, 35, 0x9b2c2c)
  px(ctx, 30, 36, 0x9b2c2c)
  rect(ctx, 31, 37, 1, 1, 0x9b2c2c)
  // 红绳
  rect(ctx, 29, 30, 4, 1, 0x9b2c2c)
  px(ctx, 30, 29, 0x9b2c2c)
  px(ctx, 32, 29, 0x9b2c2c)
}

function drawDaoAccessory(
  ctx: CanvasRenderingContext2D,
  style: DaoPathStyle,
): void {
  switch (style.weaponType) {
    case 'sword': drawSwordOnBack(ctx); break
    case 'staff': drawStaff(ctx); break
    case 'hammer': drawHammer(ctx); break
  }
  switch (style.accessory) {
    case 'pouch': drawAlchemyPouch(ctx); break
    case 'talisman': drawTalisman(ctx); break
  }
}

// ===== 装饰 =====

function drawHeadCrown(ctx: CanvasRenderingContext2D, realm: number): void {
  const crownColor = realm >= 4 ? 0xfbbf24 : 0xa0aec0
  const L = colorLayers(crownColor)
  rect(ctx, CX - 5, 5, 10, 2, L.base)
  rect(ctx, CX - 5, 5, 10, 1, L.highlight)
  rect(ctx, CX - 5, 6, 10, 1, L.dark)
  // 中央宝石
  rect(ctx, CX - 1, 3, 3, 3, L.highlight)
  px(ctx, CX, 3, L.peak)
  px(ctx, CX - 1, 4, L.highlight)
  px(ctx, CX + 1, 4, L.highlight)
  // 两侧尖角
  px(ctx, CX - 5, 4, L.dark)
  px(ctx, CX + 4, 4, L.dark)
  px(ctx, CX - 6, 5, L.shadow)
  px(ctx, CX + 5, 5, L.shadow)
}

function drawJadePendant(ctx: CanvasRenderingContext2D): void {
  // 挂绳
  rect(ctx, 14, 34, 1, 4, 0x8b6914)
  // 玉佩
  fillEllipse(ctx, 14, 38, 2, 2, 0x4ade80)
  px(ctx, 13, 37, 0x86efac)
  px(ctx, 14, 37, 0x86efac)
  px(ctx, 13, 39, 0x22c55e)
  px(ctx, 15, 39, 0x22c55e)
  // 玉佩纹饰
  px(ctx, 14, 38, 0xa7f3d0)
  // 穗子
  rect(ctx, 13, 40, 1, 3, 0x10b981)
  rect(ctx, 15, 40, 1, 3, 0x10b981)
  px(ctx, 13, 43, 0x059669)
  px(ctx, 15, 43, 0x059669)
}

function drawHairPin(ctx: CanvasRenderingContext2D, rng: () => number): void {
  const pinColor = pick([0xfbbf24, 0xef4444, 0x38bdf8, 0xa78bfa], rng)
  const L = colorLayers(pinColor)
  diagLine(ctx, CX - 4, 5, CX + 4, 5, L.base)
  diagLine(ctx, CX - 4, 5, CX + 2, 5, L.highlight)
  px(ctx, CX + 4, 5, L.dark)
  // 花饰
  fillEllipse(ctx, CX + 3, 4, 2, 2, L.base)
  px(ctx, CX + 3, 3, L.highlight)
  px(ctx, CX + 2, 4, L.light)
  px(ctx, CX + 4, 4, L.light)
}

function drawBeltOrnament(ctx: CanvasRenderingContext2D): void {
  const L = colorLayers(0xfbbf24)
  rect(ctx, CX + 5, 31, 3, 3, L.base)
  rect(ctx, CX + 5, 31, 3, 1, L.highlight)
  rect(ctx, CX + 5, 33, 3, 1, L.dark)
  px(ctx, CX + 6, 32, L.peak)
  px(ctx, CX + 7, 32, L.light)
}

// ===== 披风（高境界专用） =====

function drawCape(ctx: CanvasRenderingContext2D, robe: ColorLayer, rng: () => number): void {
  const capeColor = pick([robe.base, darken(robe.base, 0.7), 0x1a1a2e, 0x2a1a3a], rng)
  const L = colorLayers(capeColor)
  // 披风主体（从肩到脚）
  const capeTop = 21
  const capeH = 22
  // 左侧
  for (let i = 0; i < capeH; i++) {
    const w = Math.max(2, 6 - Math.floor(i / 5))
    rect(ctx, CX - 10 - i / 3, capeTop + i, w, 1, i < 2 ? L.highlight : (i > capeH - 4 ? L.deepDark : L.base))
    px(ctx, CX - 10 - i / 3, capeTop + i, L.dark)
  }
  // 右侧
  for (let i = 0; i < capeH; i++) {
    const w = Math.max(2, 6 - Math.floor(i / 5))
    rect(ctx, CX + 5 + i / 3, capeTop + i, w, 1, i < 2 ? L.highlight : (i > capeH - 4 ? L.deepDark : L.base))
    px(ctx, CX + 5 + i / 3 + w - 1, capeTop + i, L.dark)
  }
  // 披风领口
  rect(ctx, CX - 8, capeTop, 16, 2, L.base)
  rect(ctx, CX - 8, capeTop, 16, 1, L.highlight)
  // 飘动褶皱
  px(ctx, CX - 7, capeTop + 5, L.deepDark)
  px(ctx, CX + 6, capeTop + 8, L.deepDark)
  px(ctx, CX - 8, capeTop + 12, L.shadow)
  px(ctx, CX + 7, capeTop + 16, L.shadow)
  // 金边
  rect(ctx, CX - 8, capeTop, 1, capeH, L.highlight)
  rect(ctx, CX + 7, capeTop, 1, capeH, L.highlight)
  px(ctx, CX - 8, capeTop + capeH - 1, L.peak)
  px(ctx, CX + 7, capeTop + capeH - 1, L.peak)
}

// ===== 佛珠/念珠 =====

function drawPrayerBeads(ctx: CanvasRenderingContext2D, rng: () => number): void {
  const beadColor = pick([0x6b4423, 0x4a3520, 0x8b6914, 0x2a2a2a], rng)
  const L = colorLayers(beadColor)
  // 胸前斜挂念珠
  const beads = 8
  for (let i = 0; i < beads; i++) {
    const t = i / (beads - 1)
    const x = Math.round(CX - 6 + t * 12)
    const y = 23 + Math.round(t * 8)
    px(ctx, x, y, L.base)
    px(ctx, x - 1, y, L.dark)
    px(ctx, x, y - 1, L.highlight)
    px(ctx, x, y, L.peak)
  }
  // 中心大珠
  const cx2 = CX + Math.round(rng() * 4 - 2)
  fillEllipse(ctx, cx2, 30, 2, 2, L.base)
  px(ctx, cx2 - 1, 29, L.highlight)
  px(ctx, cx2, 29, L.peak)
  px(ctx, cx2 + 1, 31, L.dark)
  // 垂坠
  rect(ctx, cx2, 32, 1, 5, L.dark)
  px(ctx, cx2 - 1, 36, L.deepDark)
  px(ctx, cx2 + 1, 36, L.deepDark)
  // 流苏
  rect(ctx, cx2 - 1, 37, 1, 3, 0x9b2c2c)
  rect(ctx, cx2 + 1, 37, 1, 3, 0x9b2c2c)
  px(ctx, cx2 - 1, 40, 0xef4444)
  px(ctx, cx2 + 1, 40, 0xef4444)
}

// ===== 折扇 =====

function drawFan(ctx: CanvasRenderingContext2D, rng: () => number): void {
  const fanColor = pick([0xfbbf24, 0xe2e8f0, 0xa78bfa, 0xf97316], rng)
  const L = colorLayers(fanColor)
  // 扇骨
  const fanX = 34
  const fanY = 30
  // 扇面（弧形）
  for (let i = 0; i < 5; i++) {
    const angle = -1.2 + i * 0.3
    const ex = fanX + Math.round(Math.cos(angle) * 8)
    const ey = fanY + Math.round(Math.sin(angle) * 8)
    diagLine(ctx, fanX, fanY, ex, ey, L.dark)
    diagLine(ctx, fanX, fanY + 1, ex, ey + 1, L.base)
  }
  // 扇面填充
  for (let r = 1; r <= 7; r++) {
    for (let i = 0; i < 5; i++) {
      const angle = -1.2 + i * 0.3
      const x = fanX + Math.round(Math.cos(angle) * r)
      const y = fanY + Math.round(Math.sin(angle) * r)
      px(ctx, x, y, r < 3 ? L.highlight : L.base)
    }
  }
  // 扇骨高光
  diagLine(ctx, fanX, fanY, fanX - 2, fanY - 7, L.highlight)
  diagLine(ctx, fanX, fanY, fanX + 6, fanY - 5, L.highlight)
  // 扇柄
  rect(ctx, fanX, fanY, 2, 5, 0x6b4423)
  rect(ctx, fanX, fanY, 1, 5, 0x8b6914)
  px(ctx, fanX, fanY + 5, 0x4a3520)
  // 扇坠
  rect(ctx, fanX + 2, fanY + 3, 1, 3, 0xef4444)
  px(ctx, fanX + 2, fanY + 6, 0xef4444)
}

// ===== 肩甲（体修专用） =====

function drawShoulderGuard(ctx: CanvasRenderingContext2D, robe: ColorLayer): void {
  const guardColor = darken(robe.base, 0.5)
  const L = colorLayers(guardColor)
  // 左肩
  fillEllipse(ctx, CX - 9, 23, 4, 3, L.base)
  px(ctx, CX - 11, 22, L.highlight)
  px(ctx, CX - 10, 21, L.peak)
  px(ctx, CX - 12, 23, L.dark)
  px(ctx, CX - 11, 25, L.deepDark)
  // 肩甲尖角
  px(ctx, CX - 12, 21, L.shadow)
  px(ctx, CX - 13, 22, L.shadow)
  // 右肩
  fillEllipse(ctx, CX + 8, 23, 4, 3, L.base)
  px(ctx, CX + 6, 22, L.highlight)
  px(ctx, CX + 7, 21, L.peak)
  px(ctx, CX + 9, 25, L.deepDark)
  px(ctx, CX + 10, 22, L.dark)
  // 尖角
  px(ctx, CX + 11, 21, L.shadow)
  px(ctx, CX + 12, 22, L.shadow)
  // 铆钉
  px(ctx, CX - 9, 22, 0xfbbf24)
  px(ctx, CX + 8, 22, 0xfbbf24)
  px(ctx, CX - 9, 24, 0xf59e0b)
  px(ctx, CX + 8, 24, 0xf59e0b)
}

// ===== 面部印记/法印 =====

function drawFaceMarking(ctx: CanvasRenderingContext2D, rng: () => number, realm: number): void {
  const markType = Math.floor(rng() * 4)
  const markColor = realm >= 4 ? 0xfbbf24 : 0x9b2c2c

  if (markType === 0) {
    // 额头朱砂痣
    px(ctx, CX, 10, markColor)
    px(ctx, CX - 1, 10, markColor, 0.7)
    px(ctx, CX + 1, 10, markColor, 0.7)
  } else if (markType === 1) {
    // 额头法印（竖线）
    rect(ctx, CX, 8, 1, 4, markColor)
    px(ctx, CX - 1, 9, markColor, 0.5)
    px(ctx, CX + 1, 9, markColor, 0.5)
    px(ctx, CX, 7, markColor)
  } else if (markType === 2) {
    // 脸颊花钿
    px(ctx, CX - 4, 16, markColor)
    px(ctx, CX - 3, 16, markColor, 0.7)
    px(ctx, CX + 3, 16, markColor)
    px(ctx, CX + 4, 16, markColor, 0.7)
  } else {
    // 眉心莲印
    px(ctx, CX, 9, markColor)
    px(ctx, CX - 1, 10, markColor, 0.6)
    px(ctx, CX + 1, 10, markColor, 0.6)
    px(ctx, CX, 11, markColor, 0.4)
  }
}

// ===== 境界光环（增强版） =====

function drawRealmAura(ctx: CanvasRenderingContext2D, realm: number): void {
  const auraColor = REALM_AURA_COLORS[Math.min(realm, REALM_AURA_COLORS.length - 1)]
  if (auraColor === 0) return

  const L = colorLayers(auraColor)

  // 四角光点
  px(ctx, 1, 1, L.highlight, 0.6)
  px(ctx, SPRITE_SIZE - 2, 1, L.highlight, 0.6)
  px(ctx, 1, SPRITE_SIZE - 2, L.highlight, 0.6)
  px(ctx, SPRITE_SIZE - 2, SPRITE_SIZE - 2, L.highlight, 0.6)

  // 边缘散点
  px(ctx, 1, 8, L.highlight, 0.3)
  px(ctx, 1, 16, L.highlight, 0.3)
  px(ctx, 1, 24, L.highlight, 0.3)
  px(ctx, SPRITE_SIZE - 2, 8, L.highlight, 0.3)
  px(ctx, SPRITE_SIZE - 2, 16, L.highlight, 0.3)
  px(ctx, SPRITE_SIZE - 2, 24, L.highlight, 0.3)

  if (realm >= 4) {
    // 顶部光柱
    for (let i = 0; i < 4; i++) {
      px(ctx, CX - 1, i, L.highlight, 0.35 - i * 0.08)
      px(ctx, CX, i, L.highlight, 0.35 - i * 0.08)
      px(ctx, CX + 1, i, L.light, 0.25 - i * 0.06)
    }
  }

  if (realm >= 5) {
    // 脚下光环
    fillEllipse(ctx, CX, 44, 14, 2, L.base, 0.15)
    fillEllipse(ctx, CX, 44, 10, 1, L.highlight, 0.2)
  }

  if (realm >= 6) {
    // 全身光点
    px(ctx, 8, 14, L.highlight, 0.45)
    px(ctx, 39, 14, L.highlight, 0.45)
    px(ctx, 10, 22, L.highlight, 0.4)
    px(ctx, 37, 22, L.highlight, 0.4)
    px(ctx, 12, 30, L.highlight, 0.35)
    px(ctx, 35, 30, L.highlight, 0.35)
  }

  if (realm >= 7) {
    // 顶冠光弧
    for (let i = 0; i < 5; i++) {
      px(ctx, CX - 3 + i, 1, L.peak, 0.5)
      px(ctx, CX - 4 + i, 2, L.highlight, 0.3)
    }
  }
}

// ===== 主入口 =====

export function getOrCreateNpcTexture(
  scene: Phaser.Scene,
  npc: NpcSpriteInput,
): Phaser.Textures.Texture | null {
  const cacheKey = `npc_sprite_${npc.appearanceSeed}`
  if (textureCache.has(cacheKey)) {
    const idx = cacheOrder.indexOf(cacheKey)
    if (idx >= 0) cacheOrder.splice(idx, 1)
    cacheOrder.push(cacheKey)
    return textureCache.get(cacheKey)!
  }

  const rng = seededRng(npc.appearanceSeed)
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_SIZE
  canvas.height = SPRITE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.imageSmoothingEnabled = false

  // 选色
  const skinBase = pick(SKIN_COLORS, rng)
  const robeBase = pick(ROBE_COLORS, rng)
  const hairBase = pick(HAIR_COLORS, rng)
  const accent = pick(ACCENT_COLORS, rng)

  const skin = colorLayers(skinBase)
  const robe = colorLayers(robeBase)
  const hair = colorLayers(hairBase)

  const daoStyle = DAO_STYLES[npc.daoPath] ?? DAO_STYLES['法修']

  // 绘制顺序（从后到前）
  drawGroundShadow(ctx)
  if (npc.realm >= 3 && rng() < 0.3) drawCape(ctx, robe, rng)
  if (daoStyle.weaponType === 'sword') drawSwordOnBack(ctx)
  drawRobe(ctx, robe, accent, npc.gender, daoStyle.robeWidthDelta, rng)
  drawArms(ctx, robe, skin, daoStyle.hasBareArms, daoStyle.robeWidthDelta)
  if (daoStyle.hasBareArms && rng() < 0.5) drawShoulderGuard(ctx, robe)
  drawHead(ctx, skin, npc.gender)
  drawHair(ctx, hair, rng, npc.gender)
  drawFace(ctx, rng, skin, npc.gender)
  if (rng() < 0.25) drawFaceMarking(ctx, rng, npc.realm)
  if (daoStyle.weaponType === 'staff') drawStaff(ctx)
  if (daoStyle.weaponType === 'hammer') drawHammer(ctx)
  if (daoStyle.accessory === 'pouch') drawAlchemyPouch(ctx)
  if (daoStyle.accessory === 'talisman') drawTalisman(ctx)
  if ((npc.daoPath === '法修' || npc.daoPath === '丹道') && rng() < 0.35) drawPrayerBeads(ctx, rng)
  if (npc.daoPath === '剑道' && rng() < 0.25) drawFan(ctx, rng)
  // 装饰
  if (npc.realm >= 2 && rng() < 0.5) drawHeadCrown(ctx, npc.realm)
  if (rng() < 0.3) drawJadePendant(ctx)
  if (npc.gender === 'female' && rng() < 0.35) drawHairPin(ctx, rng)
  if (rng() < 0.2) drawBeltOrnament(ctx)
  if (npc.realm >= 3) drawRealmAura(ctx, npc.realm)

  if (scene.textures.exists(cacheKey)) {
    scene.textures.remove(cacheKey)
  }
  scene.textures.addCanvas(cacheKey, canvas)
  const tex = scene.textures.get(cacheKey)

  textureCache.set(cacheKey, tex)
  cacheOrder.push(cacheKey)
  evictCache()

  return tex
}

export function clearNpcSpriteCache(): void {
  for (const [, tex] of textureCache) {
    tex.destroy()
  }
  textureCache.clear()
  cacheOrder.length = 0
}
