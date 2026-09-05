// ---------- v2 地形纹理程序化生成器 ----------
// 为 4 个区域前缀（qm/ym/sy/xj）生成完整的 16×16 瓦片集
// 纹理键格式：terrain_{prefix}_{type}

import Phaser from 'phaser'

interface RegionPalette {
  floorBase: [number, number, number]
  floorDark: [number, number, number]
  floorLight: [number, number, number]
  wallBase: [number, number, number]
  wallDark: [number, number, number]
  wallLight: [number, number, number]
  water: [number, number, number]
  waterHighlight: [number, number, number]
  accent: [number, number, number]   // 装饰强调色
  decoColor: [number, number, number] // 地面装饰色
}

const PALETTES: Record<string, RegionPalette> = {
  qm: {
    floorBase: [58, 52, 42],
    floorDark: [38, 34, 28],
    floorLight: [72, 64, 50],
    wallBase: [48, 42, 36],
    wallDark: [28, 24, 20],
    wallLight: [68, 60, 50],
    water: [42, 68, 78],
    waterHighlight: [62, 98, 110],
    accent: [120, 100, 60],
    decoColor: [80, 70, 45],
  },
  ym: {
    floorBase: [42, 32, 48],
    floorDark: [28, 20, 34],
    floorLight: [55, 42, 62],
    wallBase: [38, 28, 44],
    wallDark: [22, 16, 28],
    wallLight: [52, 40, 58],
    water: [48, 30, 60],
    waterHighlight: [72, 48, 88],
    accent: [140, 80, 120],
    decoColor: [60, 45, 50],
  },
  sy: {
    floorBase: [35, 42, 48],
    floorDark: [22, 28, 34],
    floorLight: [48, 58, 65],
    wallBase: [30, 38, 42],
    wallDark: [18, 24, 28],
    wallLight: [42, 52, 58],
    water: [30, 52, 62],
    waterHighlight: [50, 82, 95],
    accent: [100, 140, 130],
    decoColor: [45, 55, 50],
  },
  xj: {
    floorBase: [50, 55, 68],
    floorDark: [32, 38, 48],
    floorLight: [68, 75, 90],
    wallBase: [42, 48, 62],
    wallDark: [26, 32, 42],
    wallLight: [58, 65, 80],
    water: [55, 75, 95],
    waterHighlight: [85, 115, 140],
    accent: [180, 190, 220],
    decoColor: [70, 75, 85],
  },
}

const SIZE = 16

function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function shade(c: [number, number, number], delta: number): [number, number, number] {
  return [
    Math.max(0, Math.min(255, c[0] + delta)),
    Math.max(0, Math.min(255, c[1] + delta)),
    Math.max(0, Math.min(255, c[2] + delta)),
  ]
}

function noisePixel(ctx: CanvasRenderingContext2D, x: number, y: number, base: [number, number, number], intensity: number) {
  const n = (Math.sin(x * 7.3 + y * 3.1) + Math.cos(x * 2.7 + y * 5.9)) * 0.5
  const delta = Math.round(n * intensity)
  const c = shade(base, delta)
  ctx.fillStyle = rgb(c)
  ctx.fillRect(x, y, 1, 1)
}

function fillNoisy(ctx: CanvasRenderingContext2D, base: [number, number, number], intensity: number = 8) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      noisePixel(ctx, x, y, base, intensity)
    }
  }
}

// ---------- 各类瓦片绘制函数 ----------

function drawFloor(ctx: CanvasRenderingContext2D, p: RegionPalette, variant: number) {
  const base = variant === 0 ? p.floorBase : variant === 1 ? p.floorDark : variant === 2 ? p.floorLight : p.floorBase
  fillNoisy(ctx, base, 6)
  // 变体添加不同细节
  if (variant === 1) {
    // 裂纹
    ctx.fillStyle = rgb(shade(base, -15))
    ctx.fillRect(3, 5, 1, 6)
    ctx.fillRect(3, 10, 4, 1)
    ctx.fillRect(10, 3, 1, 5)
  } else if (variant === 2) {
    // 小石子
    ctx.fillStyle = rgb(shade(base, 12))
    ctx.fillRect(5, 4, 2, 2)
    ctx.fillRect(11, 9, 2, 2)
    ctx.fillRect(2, 12, 1, 1)
  } else if (variant === 3) {
    // 苔藓/暗痕
    ctx.fillStyle = rgb(shade(base, -8))
    ctx.fillRect(0, 0, 3, 2)
    ctx.fillRect(13, 14, 3, 2)
    ctx.fillRect(7, 6, 2, 1)
  }
  // 通用边缘暗化
  ctx.fillStyle = `rgba(0,0,0,0.15)`
  ctx.fillRect(0, 15, SIZE, 1)
  ctx.fillRect(15, 0, 1, SIZE)
}

function drawWater(ctx: CanvasRenderingContext2D, p: RegionPalette, frame: number) {
  fillNoisy(ctx, p.water, 4)
  // 波纹（4 帧动画）
  const offset = frame * 4
  ctx.fillStyle = rgb(p.waterHighlight)
  for (let y = 2; y < SIZE; y += 4) {
    for (let x = 0; x < SIZE; x++) {
      const wave = Math.sin((x + offset) * 0.5 + y * 0.3)
      if (wave > 0.5) {
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }
  // 第二层波纹
  ctx.fillStyle = `rgba(${p.waterHighlight[0]},${p.waterHighlight[1]},${p.waterHighlight[2]},0.4)`
  for (let y = 6; y < SIZE; y += 5) {
    for (let x = 0; x < SIZE; x++) {
      const wave = Math.sin((x - offset * 1.5) * 0.4 + y * 0.5)
      if (wave > 0.7) {
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }
  // 顶部高光
  ctx.fillStyle = `rgba(${p.waterHighlight[0]},${p.waterHighlight[1]},${p.waterHighlight[2]},0.3)`
  ctx.fillRect(0, 0, SIZE, 1)
}

function drawWallTop(ctx: CanvasRenderingContext2D, p: RegionPalette) {
  fillNoisy(ctx, p.wallBase, 5)
  // 顶部高光
  ctx.fillStyle = rgb(p.wallLight)
  ctx.fillRect(0, 0, SIZE, 2)
  // 底部阴影
  ctx.fillStyle = rgb(p.wallDark)
  ctx.fillRect(0, 14, SIZE, 2)
}

function drawWallSide(ctx: CanvasRenderingContext2D, p: RegionPalette) {
  fillNoisy(ctx, shade(p.wallBase, -10), 5)
  // 侧面纹理
  ctx.fillStyle = rgb(p.wallDark)
  ctx.fillRect(0, 0, 1, SIZE)
  ctx.fillRect(15, 0, 1, SIZE)
  // 竖向裂纹
  ctx.fillStyle = rgb(shade(p.wallBase, -18))
  ctx.fillRect(4, 2, 1, 8)
  ctx.fillRect(11, 5, 1, 10)
}

function drawWallCorner(ctx: CanvasRenderingContext2D, p: RegionPalette, corner: 'tl' | 'tr' | 'bl' | 'br') {
  fillNoisy(ctx, p.wallBase, 5)
  ctx.fillStyle = rgb(p.wallLight)
  ctx.fillRect(0, 0, SIZE, 1)
  ctx.fillStyle = rgb(p.wallDark)
  ctx.fillRect(0, 15, SIZE, 1)

  // 角落阴影
  ctx.fillStyle = `rgba(0,0,0,0.25)`
  if (corner === 'tl') {
    ctx.fillRect(0, 0, 4, 4)
  } else if (corner === 'tr') {
    ctx.fillRect(12, 0, 4, 4)
  } else if (corner === 'bl') {
    ctx.fillRect(0, 12, 4, 4)
  } else {
    ctx.fillRect(12, 12, 4, 4)
  }
}

function drawPillar(ctx: CanvasRenderingContext2D, p: RegionPalette) {
  // 底部地面
  fillNoisy(ctx, p.floorBase, 4)
  // 柱体
  ctx.fillStyle = rgb(p.wallBase)
  ctx.fillRect(2, 1, 12, 14)
  // 柱顶
  ctx.fillStyle = rgb(p.wallLight)
  ctx.fillRect(2, 1, 12, 2)
  // 柱底
  ctx.fillStyle = rgb(p.wallDark)
  ctx.fillRect(2, 13, 12, 2)
  // 竖纹
  ctx.fillStyle = rgb(shade(p.wallBase, -12))
  ctx.fillRect(5, 3, 1, 10)
  ctx.fillRect(10, 3, 1, 10)
}

function drawFloorDeco(ctx: CanvasRenderingContext2D, p: RegionPalette, type: number) {
  // 透明背景
  ctx.clearRect(0, 0, SIZE, SIZE)
  // 底部地面色
  ctx.fillStyle = rgb(p.floorBase)
  ctx.fillRect(0, 0, SIZE, SIZE)

  if (type === 1) {
    // 裂纹
    ctx.fillStyle = rgb(shade(p.floorBase, -20))
    ctx.fillRect(4, 2, 1, 5)
    ctx.fillRect(4, 6, 5, 1)
    ctx.fillRect(8, 6, 1, 4)
    ctx.fillRect(2, 11, 3, 1)
    ctx.fillStyle = rgb(shade(p.floorBase, -10))
    ctx.fillRect(5, 3, 1, 3)
  } else if (type === 2) {
    // 小草/苔藓
    ctx.fillStyle = rgb(shade(p.decoColor, 20))
    ctx.fillRect(3, 12, 1, 3)
    ctx.fillRect(4, 11, 1, 4)
    ctx.fillRect(6, 12, 1, 3)
    ctx.fillRect(10, 13, 1, 2)
    ctx.fillRect(12, 11, 1, 4)
    ctx.fillStyle = rgb(shade(p.decoColor, 40))
    ctx.fillRect(4, 11, 1, 1)
    ctx.fillRect(12, 11, 1, 1)
  } else if (type === 3) {
    // 小石子
    ctx.fillStyle = rgb(shade(p.floorBase, 15))
    ctx.fillRect(5, 5, 2, 2)
    ctx.fillRect(10, 9, 2, 2)
    ctx.fillStyle = rgb(shade(p.floorBase, -5))
    ctx.fillRect(6, 6, 1, 1)
    ctx.fillRect(11, 10, 1, 1)
  } else {
    // 暗痕/污渍
    ctx.fillStyle = `rgba(0,0,0,0.2)`
    ctx.fillRect(2, 3, 4, 2)
    ctx.fillRect(9, 8, 5, 3)
    ctx.fillStyle = `rgba(0,0,0,0.12)`
    ctx.fillRect(6, 11, 4, 2)
  }
}

function drawWallDeco(ctx: CanvasRenderingContext2D, p: RegionPalette, type: number) {
  // 透明背景
  ctx.clearRect(0, 0, SIZE, SIZE)

  if (type === 1) {
    // 火把
    ctx.fillStyle = rgb([100, 70, 40])   // 木柄
    ctx.fillRect(7, 6, 2, 9)
    ctx.fillStyle = rgb([140, 100, 50])  // 木柄高光
    ctx.fillRect(7, 6, 1, 9)
    // 火焰
    ctx.fillStyle = rgb([255, 180, 40])
    ctx.fillRect(6, 3, 4, 4)
    ctx.fillStyle = rgb([255, 220, 80])
    ctx.fillRect(7, 2, 2, 3)
    ctx.fillStyle = rgb([255, 140, 30])
    ctx.fillRect(6, 5, 4, 2)
    ctx.fillStyle = `rgba(255,100,20,0.6)`
    ctx.fillRect(5, 4, 1, 2)
    ctx.fillRect(10, 4, 1, 2)
  } else if (type === 2) {
    // 藤蔓
    ctx.fillStyle = rgb([40, 70, 35])
    ctx.fillRect(3, 0, 1, 8)
    ctx.fillRect(3, 7, 3, 1)
    ctx.fillRect(5, 8, 1, 6)
    ctx.fillStyle = rgb([55, 90, 45])
    ctx.fillRect(3, 2, 1, 3)
    ctx.fillRect(5, 10, 1, 3)
    // 叶片
    ctx.fillStyle = rgb([70, 110, 50])
    ctx.fillRect(2, 4, 1, 1)
    ctx.fillRect(6, 11, 1, 1)
    ctx.fillRect(4, 6, 1, 1)
    // 第二条藤蔓
    ctx.fillStyle = rgb([40, 70, 35])
    ctx.fillRect(11, 0, 1, 5)
    ctx.fillRect(11, 4, 2, 1)
    ctx.fillRect(12, 5, 1, 7)
    ctx.fillStyle = rgb([70, 110, 50])
    ctx.fillRect(10, 2, 1, 1)
    ctx.fillRect(13, 8, 1, 1)
  } else {
    // 水晶
    ctx.fillStyle = rgb(p.accent)
    ctx.fillRect(6, 4, 4, 10)
    ctx.fillStyle = rgb(shade(p.accent, 30))
    ctx.fillRect(7, 5, 2, 8)
    ctx.fillStyle = rgb(shade(p.accent, -20))
    ctx.fillRect(6, 12, 4, 2)
    // 高光
    ctx.fillStyle = `rgba(255,255,255,0.4)`
    ctx.fillRect(7, 5, 1, 4)
    // 尖端
    ctx.fillStyle = rgb(shade(p.accent, 20))
    ctx.fillRect(7, 3, 2, 1)
    ctx.fillRect(8, 2, 1, 1)
  }
}

// ---------- 主生成函数 ----------

const PREFIXES = ['qm', 'ym', 'sy', 'xj']

export function generateTerrainTextures(scene: Phaser.Scene): void {
  for (const prefix of PREFIXES) {
    const p = PALETTES[prefix]
    if (!p) continue

    const make = (suffix: string, draw: (ctx: CanvasRenderingContext2D) => void) => {
      const key = `terrain_${prefix}_${suffix}`
      if (scene.textures.exists(key)) return
      const canvas = scene.textures.createCanvas(key, SIZE, SIZE)
      if (!canvas) return
      const ctx = canvas.getContext()
      ctx.clearRect(0, 0, SIZE, SIZE)
      draw(ctx)
      canvas.refresh()
    }

    // 地面（4 变体）
    make('floor_base', ctx => drawFloor(ctx, p, 0))
    make('floor_var1', ctx => drawFloor(ctx, p, 1))
    make('floor_var2', ctx => drawFloor(ctx, p, 2))
    make('floor_var3', ctx => drawFloor(ctx, p, 3))

    // 水面（4 帧动画）
    make('water_1', ctx => drawWater(ctx, p, 0))
    make('water_2', ctx => drawWater(ctx, p, 1))
    make('water_3', ctx => drawWater(ctx, p, 2))
    make('water_4', ctx => drawWater(ctx, p, 3))

    // 墙面
    make('wall_top', ctx => drawWallTop(ctx, p))
    make('wall_side', ctx => drawWallSide(ctx, p))
    make('wall_corner_tl', ctx => drawWallCorner(ctx, p, 'tl'))
    make('wall_corner_tr', ctx => drawWallCorner(ctx, p, 'tr'))
    make('wall_corner_bl', ctx => drawWallCorner(ctx, p, 'bl'))
    make('wall_corner_br', ctx => drawWallCorner(ctx, p, 'br'))
    make('wall_pillar', ctx => drawPillar(ctx, p))

    // 地面装饰（4 种）
    for (let i = 1; i <= 4; i++) {
      make(`floor_deco_${i}`, ctx => drawFloorDeco(ctx, p, i))
    }

    // 墙面装饰（3 种：火把/藤蔓/水晶）
    for (let i = 1; i <= 3; i++) {
      make(`wall_deco_${i}`, ctx => drawWallDeco(ctx, p, i))
    }
  }
}
