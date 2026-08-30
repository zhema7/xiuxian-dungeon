// ---------- 地形瓷砖资产生成器（v1：多层渐变 + 抗锯齿 + 像素风） ----------
// 为三大区域各生成一套完整瓷砖集
//  - 地面：base / var1 / var2 / var3 / edge（墙边阴影）
//  - 墙面：top / side / corner_tl / corner_tr / corner_bl / corner_br / pillar
//  - 水域：frame_1 ~ frame_4（4 帧循环动画）+ shore
//  - 装饰：floor_deco_1~4 / wall_deco_1~3
// 使用纯 Node.js（zlib 编码），不依赖外部库
// 命名：terrain/{region}_{type}_{variant}.png

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'sprites', 'terrain')
mkdirSync(outDir, { recursive: true })

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.allocUnsafe(4)
  lenBuf.writeUInt32BE(data.length)
  const crcBuf = Buffer.allocUnsafe(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function writePng(path, w, h, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const raw = Buffer.allocUnsafe(h * (1 + w * 4))
  let off = 0
  for (let y = 0; y < h; y++) {
    raw[off++] = 0
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      raw[off++] = pixels[idx]
      raw[off++] = pixels[idx + 1]
      raw[off++] = pixels[idx + 2]
      raw[off++] = pixels[idx + 3]
    }
  }
  const idat = deflateSync(raw)
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.allocUnsafe(0))])
  writeFileSync(path, png)
}

// ---------- 像素画布工具 ----------
function createCanvas(w, h) {
  const px = new Uint8ClampedArray(w * h * 4)

  function blendPixel(x, y, r, g, b, a) {
    if (a <= 0) return
    if (x < 0 || x >= w || y < 0 || y >= h) return
    const i = (y * w + x) * 4
    if (a >= 255) { px[i] = r; px[i+1] = g; px[i+2] = b; px[i+3] = 255; return }
    const srcA = a / 255
    const dstA = px[i+3] / 255
    const outA = srcA + dstA * (1 - srcA)
    if (outA <= 0) return
    px[i]   = Math.round((r * srcA + px[i]   * dstA * (1 - srcA)) / outA)
    px[i+1] = Math.round((g * srcA + px[i+1] * dstA * (1 - srcA)) / outA)
    px[i+2] = Math.round((b * srcA + px[i+2] * dstA * (1 - srcA)) / outA)
    px[i+3] = Math.round(outA * 255)
  }

  // 填充矩形
  function fillRect(x, y, rw, rh, r, g, b, a = 255) {
    for (let yy = y; yy < y + rh; yy++)
      for (let xx = x; xx < x + rw; xx++)
        blendPixel(xx, yy, r, g, b, a)
  }

  // 抗锯齿点（子像素精度）
  function aaDot(fx, fy, radius, r, g, b, alpha = 255) {
    const x0 = Math.max(0, Math.floor(fx - radius - 1))
    const x1 = Math.min(w - 1, Math.ceil(fx + radius + 1))
    const y0 = Math.max(0, Math.floor(fy - radius - 1))
    const y1 = Math.min(h - 1, Math.ceil(fy + radius + 1))
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const d = Math.hypot(xx + 0.5 - fx, yy + 0.5 - fy)
        if (d > radius + 1) continue
        const t = Math.max(0, Math.min(1, radius + 1 - d))
        blendPixel(xx, yy, r, g, b, Math.round(alpha * t * t))
      }
    }
  }

  // 像素化噪点（确定性伪随机）
  function noise(seed) {
    let s = seed >>> 0
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
  }

  // 径向渐变填充
  function radialGradient(cx, cy, radius, r1, g1, b1, r2, g2, b2, alpha = 255) {
    const x0 = Math.max(0, Math.floor(cx - radius))
    const x1 = Math.min(w - 1, Math.ceil(cx + radius))
    const y0 = Math.max(0, Math.floor(cy - radius))
    const y1 = Math.min(h - 1, Math.ceil(cy + radius))
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const d = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
        if (d > radius) continue
        const t = d / radius
        const tt = t * t
        const r = Math.round(r1 + (r2 - r1) * tt)
        const g = Math.round(g1 + (g2 - g1) * tt)
        const b = Math.round(b1 + (b2 - b1) * tt)
        blendPixel(xx, yy, r, g, b, alpha)
      }
    }
  }

  // 线性渐变（垂直）
  function verticalGradient(x, y, gw, gh, r1, g1, b1, r2, g2, b2, alpha = 255) {
    for (let yy = y; yy < y + gh; yy++) {
      const t = (yy - y) / (gh - 1)
      const r = Math.round(r1 + (r2 - r1) * t)
      const g = Math.round(g1 + (g2 - g1) * t)
      const b = Math.round(b1 + (b2 - b1) * t)
      for (let xx = x; xx < x + gw; xx++) {
        blendPixel(xx, yy, r, g, b, alpha)
      }
    }
  }

  return { px, w, h, blendPixel, fillRect, aaDot, noise, radialGradient, verticalGradient }
}

// ---------- 区域调色板定义 ----------
const REGION_PALETTES = {
  qm: {
    name: '青冥山脉',
    // 地面：青灰色岩地
    floor: {
      base:   [70, 78, 95],     // 基底
      mid:    [58, 65, 82],     // 中间色
      dark:   [42, 48, 65],     // 暗部
      light:  [95, 105, 125],   // 亮部
      accent: [110, 140, 170],  // 青光点缀
      edge:   [30, 35, 48],     // 墙边阴影
    },
    // 墙面：灰蓝岩石
    wall: {
      top:    [85, 95, 115],    // 顶面（亮）
      topHi:  [115, 125, 145],  // 顶面高光
      side:   [50, 58, 75],     // 侧面（暗）
      sideLo: [32, 38, 52],     // 侧面阴影
      edge:   [100, 115, 140],  // 边缘亮线
      crack:  [35, 40, 55],     // 裂缝
    },
    // 水域：冷蓝清泉
    water: {
      deep:   [30, 60, 100],
      mid:    [50, 100, 150],
      light:  [90, 150, 190],
      foam:   [180, 210, 230],
    },
    // 装饰色
    deco: {
      stone:  [120, 125, 140],
      moss:   [80, 130, 90],
      crystal:[130, 180, 220],
      rune:   [100, 160, 200],
    }
  },
  ym: {
    name: '幽冥沼泽',
    floor: {
      base:   [65, 50, 75],
      mid:    [52, 40, 62],
      dark:   [38, 28, 48],
      light:  [90, 70, 100],
      accent: [120, 80, 140],   // 紫瘴气
      edge:   [25, 18, 35],
    },
    wall: {
      top:    [75, 55, 90],
      topHi:  [105, 80, 125],
      side:   [45, 32, 58],
      sideLo: [28, 20, 38],
      edge:   [120, 85, 150],
      crack:  [30, 20, 40],
    },
    water: {
      deep:   [40, 25, 60],
      mid:    [70, 45, 95],
      light:  [110, 70, 140],
      foam:   [170, 130, 190],
    },
    deco: {
      stone:  [100, 80, 110],
      moss:   [70, 100, 60],
      crystal:[150, 90, 180],
      rune:   [130, 70, 160],
    }
  },
  sy: {
    name: '无尽妖域',
    floor: {
      base:   [55, 50, 80],
      mid:   [42, 38, 65],
      dark:  [30, 26, 48],
      light: [80, 72, 110],
      accent: [160, 80, 180],   // 妖异紫
      edge:  [20, 16, 35],
    },
    wall: {
      top:    [70, 60, 100],
      topHi:  [100, 85, 140],
      side:   [40, 34, 65],
      sideLo: [24, 20, 42],
      edge:   [140, 90, 180],
      crack:  [25, 20, 40],
    },
    water: {
      deep:   [25, 15, 50],
      mid:    [55, 30, 100],
      light:  [100, 50, 160],
      foam:   [180, 110, 210],
    },
    deco: {
      stone:  [95, 85, 120],
      moss:   [60, 110, 80],
      crystal:[190, 90, 210],
      rune:   [170, 70, 200],
    }
  },
  xj: {
    name: '云上仙界',
    floor: {
      base:   [200, 210, 230],   // 仙云白
      mid:    [180, 195, 220],
      dark:   [140, 160, 195],
      light:  [230, 238, 250],
      accent: [255, 215, 120],   // 仙光金
      edge:   [100, 120, 160],
    },
    wall: {
      top:    [220, 225, 240],   // 玉阶白
      topHi:  [245, 248, 255],
      side:   [170, 180, 210],
      sideLo: [130, 145, 180],
      edge:   [255, 225, 140],   // 金边
      crack:  [150, 165, 195],
    },
    water: {
      deep:   [80, 120, 180],    // 瑶池碧
      mid:    [120, 170, 220],
      light:  [180, 210, 240],
      foam:   [240, 248, 255],
    },
    deco: {
      stone:  [200, 205, 220],   // 仙石
      moss:   [140, 190, 160],   // 灵草
      crystal:[255, 200, 100],   // 金丹/仙晶
      rune:   [255, 180, 80],    // 符文金光
    }
  }
}

const TS = 16  // tile size

// ---------- 地面瓷砖生成 ----------
function genFloorTile(palette, variant, seed) {
  const { px, w, h, fillRect, aaDot, noise, verticalGradient } = createCanvas(TS, TS)
  const f = palette.floor
  const rand = noise(seed)

  // 基底色（带微渐变）
  verticalGradient(0, 0, TS, TS, f.mid[0], f.mid[1], f.mid[2], f.base[0], f.base[1], f.base[2])

  // 基底噪点纹理
  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      const n = rand()
      if (n < 0.15) {
        // 暗斑
        const da = Math.round(30 + rand() * 40)
        fillRect(x, y, 1, 1, f.dark[0], f.dark[1], f.dark[2], da)
      } else if (n > 0.88) {
        // 亮点
        const la = Math.round(20 + rand() * 30)
        fillRect(x, y, 1, 1, f.light[0], f.light[1], f.light[2], la)
      }
    }
  }

  if (variant === 'var1') {
    // 小石块点缀
    for (let i = 0; i < 3; i++) {
      const sx = 2 + Math.floor(rand() * 12)
      const sy = 2 + Math.floor(rand() * 12)
      const sr = 0.8 + rand() * 1.2
      aaDot(sx + 0.5, sy + 0.5, sr, f.light[0], f.light[1], f.light[2], 120)
      aaDot(sx + 0.3, sy + 0.3, sr * 0.5, f.base[0], f.base[1], f.base[2], 80)
    }
  } else if (variant === 'var2') {
    // 裂纹
    for (let i = 0; i < 2; i++) {
      const sx = Math.floor(rand() * TS)
      const sy = Math.floor(rand() * TS)
      const len = 3 + Math.floor(rand() * 6)
      const dir = rand() < 0.5 ? 0 : 1
      for (let j = 0; j < len; j++) {
        const px2 = sx + (dir === 0 ? j : Math.floor(rand() * 2 - 1))
        const py2 = sy + (dir === 1 ? j : Math.floor(rand() * 2 - 1))
        if (px2 >= 0 && px2 < TS && py2 >= 0 && py2 < TS) {
          fillRect(px2, py2, 1, 1, f.dark[0], f.dark[1], f.dark[2], 100 + Math.floor(rand() * 60))
        }
      }
    }
  } else if (variant === 'var3') {
    // 色斑/苔藓（区域特色）
    for (let i = 0; i < 5; i++) {
      const sx = 1 + Math.floor(rand() * (TS - 2))
      const sy = 1 + Math.floor(rand() * (TS - 2))
      aaDot(sx + 0.5, sy + 0.5, 1.2 + rand() * 1.5,
        f.accent[0], f.accent[1], f.accent[2], 50 + Math.floor(rand() * 50))
    }
  } else if (variant === 'edge') {
    // 墙边阴影：顶部和底部加深
    for (let y = 0; y < 3; y++) {
      const a = Math.round((3 - y) * 50)
      for (let x = 0; x < TS; x++) {
        fillRect(x, y, 1, 1, f.edge[0], f.edge[1], f.edge[2], a)
      }
    }
    // 底部也稍暗
    for (let y = TS - 2; y < TS; y++) {
      const a = Math.round((y - TS + 3) * 30)
      for (let x = 0; x < TS; x++) {
        fillRect(x, y, 1, 1, f.edge[0], f.edge[1], f.edge[2], a)
      }
    }
  }

  // 顶部微亮边（模拟顶部光照）
  for (let x = 0; x < TS; x++) {
    fillRect(x, 0, 1, 1, f.light[0], f.light[1], f.light[2], 15)
  }

  return px
}

// ---------- 墙面瓷砖生成 ----------
function genWallTile(palette, kind, seed) {
  const { px, w, h, fillRect, aaDot, noise, verticalGradient } = createCanvas(TS, TS)
  const wa = palette.wall
  const rand = noise(seed)

  if (kind === 'top') {
    // 墙面顶面（从上方看，较亮）
    verticalGradient(0, 0, TS, TS, wa.topHi[0], wa.topHi[1], wa.topHi[2], wa.top[0], wa.top[1], wa.top[2])

    // 石块纹理
    // 上沿高光
    for (let x = 0; x < TS; x++) {
      fillRect(x, 0, 1, 1, wa.topHi[0], wa.topHi[1], wa.topHi[2], 100)
    }
    // 砖缝横线
    fillRect(0, 5, TS, 1, wa.crack[0], wa.crack[1], wa.crack[2], 120)
    fillRect(0, 11, TS, 1, wa.crack[0], wa.crack[1], wa.crack[2], 100)
    // 砖缝竖线（错开）
    fillRect(6, 0, 1, 5, wa.crack[0], wa.crack[1], wa.crack[2], 100)
    fillRect(11, 6, 1, 5, wa.crack[0], wa.crack[1], wa.crack[2], 90)
    fillRect(3, 11, 1, 5, wa.crack[0], wa.crack[1], wa.crack[2], 100)

    // 表面噪点
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(rand() * TS)
      const y = Math.floor(rand() * TS)
      const a = 20 + Math.floor(rand() * 30)
      fillRect(x, y, 1, 1, rand() < 0.5 ? wa.topHi[0] : wa.side[0],
                              rand() < 0.5 ? wa.topHi[1] : wa.side[1],
                              rand() < 0.5 ? wa.topHi[2] : wa.side[2], a)
    }
  } else if (kind === 'side') {
    // 墙面侧面（立面，较暗，带顶部亮边）
    verticalGradient(0, 0, TS, TS, wa.side[0], wa.side[1], wa.side[2], wa.sideLo[0], wa.sideLo[1], wa.sideLo[2])

    // 顶部亮边（光照效果）
    for (let x = 0; x < TS; x++) {
      fillRect(x, 0, 1, 1, wa.edge[0], wa.edge[1], wa.edge[2], 140)
      fillRect(x, 1, 1, 1, wa.top[0], wa.top[1], wa.top[2], 60)
    }

    // 砖缝（竖砖纹）
    fillRect(0, 7, TS, 1, wa.crack[0], wa.crack[1], wa.crack[2], 80)
    fillRect(5, 0, 1, 7, wa.crack[0], wa.crack[1], wa.crack[2], 70)
    fillRect(11, 7, 1, 9, wa.crack[0], wa.crack[1], wa.crack[2], 60)

    // 底部阴影
    for (let y = TS - 2; y < TS; y++) {
      const a = Math.round((y - TS + 3) * 50)
      for (let x = 0; x < TS; x++) {
        fillRect(x, y, 1, 1, wa.sideLo[0], wa.sideLo[1], wa.sideLo[2], a)
      }
    }

    // 表面细节
    for (let i = 0; i < 15; i++) {
      const x = Math.floor(rand() * TS)
      const y = 2 + Math.floor(rand() * (TS - 3))
      fillRect(x, y, 1, 1, wa.sideLo[0], wa.sideLo[1], wa.sideLo[2], 20 + Math.floor(rand() * 30))
    }
  } else if (kind.startsWith('corner_')) {
    // 墙角：顶部 + 侧面拼接
    const pos = kind.split('_')[1] // tl, tr, bl, br
    // 先画顶面
    verticalGradient(0, 0, TS, TS, wa.topHi[0], wa.topHi[1], wa.topHi[2], wa.top[0], wa.top[1], wa.top[2])
    // 砖缝
    fillRect(0, 5, TS, 1, wa.crack[0], wa.crack[1], wa.crack[2], 100)
    fillRect(0, 11, TS, 1, wa.crack[0], wa.crack[1], wa.crack[2], 80)

    // 侧面部分（根据角的位置）
    if (pos === 'tl' || pos === 'bl') {
      // 左侧面
      const sideW = 5
      verticalGradient(0, 0, sideW, TS, wa.side[0], wa.side[1], wa.side[2], wa.sideLo[0], wa.sideLo[1], wa.sideLo[2])
      // 顶部亮边
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < sideW; x++) {
          fillRect(x, y, 1, 1, wa.edge[0], wa.edge[1], wa.edge[2], y === 0 ? 120 : 50)
        }
      }
      // 右边缘线（墙角线）
      for (let y = 0; y < TS; y++) {
        fillRect(sideW - 1, y, 1, 1, wa.edge[0], wa.edge[1], wa.edge[2], 60)
      }
    }
    if (pos === 'tr' || pos === 'br') {
      // 右侧面
      const sideW = 5
      const sx = TS - sideW
      verticalGradient(sx, 0, sideW, TS, wa.side[0], wa.side[1], wa.side[2], wa.sideLo[0], wa.sideLo[1], wa.sideLo[2])
      for (let y = 0; y < 2; y++) {
        for (let x = sx; x < TS; x++) {
          fillRect(x, y, 1, 1, wa.edge[0], wa.edge[1], wa.edge[2], y === 0 ? 120 : 50)
        }
      }
      for (let y = 0; y < TS; y++) {
        fillRect(sx, y, 1, 1, wa.edge[0], wa.edge[1], wa.edge[2], 60)
      }
    }
  } else if (kind === 'pillar') {
    // 石柱俯视图
    verticalGradient(0, 0, TS, TS, wa.top[0], wa.top[1], wa.top[2], wa.side[0], wa.side[1], wa.side[2])

    // 柱体顶面（圆形）
    aaDot(TS/2, TS/2, 5.5, wa.topHi[0], wa.topHi[1], wa.topHi[2], 200)
    aaDot(TS/2 - 1, TS/2 - 1, 4, wa.edge[0], wa.edge[1], wa.edge[2], 100)

    // 柱身阴影（右下侧）
    for (let y = 6; y < TS - 2; y++) {
      for (let x = 6; x < TS - 2; x++) {
        const dx = x - TS/2, dy = y - TS/2
        if (dx*dx + dy*dy < 25 && dx + dy > 2) {
          fillRect(x, y, 1, 1, wa.sideLo[0], wa.sideLo[1], wa.sideLo[2], 80)
        }
      }
    }

    // 底部阴影
    for (let y = TS - 3; y < TS; y++) {
      for (let x = 3; x < TS - 3; x++) {
        fillRect(x, y, 1, 1, wa.sideLo[0], wa.sideLo[1], wa.sideLo[2], 60)
      }
    }
  }

  return px
}

// ---------- 水域瓷砖生成 ----------
function genWaterTile(palette, frame, seed) {
  const { px, w, h, fillRect, aaDot, noise, verticalGradient } = createCanvas(TS, TS)
  const wt = palette.water
  const rand = noise(seed + frame * 137)

  // 深水基底
  verticalGradient(0, 0, TS, TS, wt.mid[0], wt.mid[1], wt.mid[2], wt.deep[0], wt.deep[1], wt.deep[2])

  // 波纹（根据帧号偏移）
  const waveOffset = (frame * 3) % 8
  for (let y = 0; y < TS; y++) {
    const wave = Math.sin((y + waveOffset) * 0.8) * 1.5
    for (let x = 0; x < TS; x++) {
      const wx = x + wave
      if (Math.abs(wx - Math.round(wx)) < 0.3) {
        const a = 30 + Math.floor(rand() * 20)
        fillRect(x, y, 1, 1, wt.light[0], wt.light[1], wt.light[2], a)
      }
    }
  }

  // 泡沫亮点
  const bubbleCount = 2 + frame % 3
  for (let i = 0; i < bubbleCount; i++) {
    const bx = 1 + Math.floor(rand() * (TS - 2))
    const by = 1 + Math.floor(rand() * (TS - 2))
    aaDot(bx + 0.5, by + 0.5, 1 + rand() * 0.8, wt.foam[0], wt.foam[1], wt.foam[2], 40 + Math.floor(rand() * 40))
  }

  // 水面高光带
  const hiY = 2 + frame % 4
  for (let x = 0; x < TS; x++) {
    const a = 15 + Math.floor(rand() * 15)
    fillRect(x, hiY, 1, 1, wt.light[0], wt.light[1], wt.light[2], a)
  }

  return px
}

// ---------- 装饰生成 ----------
function genFloorDeco(palette, kind, seed) {
  const { px, fillRect, aaDot, noise } = createCanvas(16, 16)
  const dc = palette.deco
  const rand = noise(seed)

  if (kind === 1) {
    // 小碎石堆
    aaDot(6, 9, 2.5, dc.stone[0], dc.stone[1], dc.stone[2], 200)
    aaDot(9, 10, 2, dc.stone[0] - 15, dc.stone[1] - 15, dc.stone[2] - 15, 180)
    aaDot(7, 7, 1.5, dc.stone[0] + 20, dc.stone[1] + 20, dc.stone[2] + 20, 150)
    // 阴影
    for (let x = 4; x < 12; x++) {
      fillRect(x, 12, 1, 1, 0, 0, 0, 40)
    }
  } else if (kind === 2) {
    // 小草/苔藓丛
    for (let i = 0; i < 5; i++) {
      const bx = 4 + i * 2 + Math.floor(rand() * 2)
      const bh = 3 + Math.floor(rand() * 3)
      for (let j = 0; j < bh; j++) {
        fillRect(bx, 12 - j, 1, 1, dc.moss[0] + j * 5, dc.moss[1] + j * 8, dc.moss[2] + j * 3, 140 + j * 20)
      }
    }
    // 地面阴影
    for (let x = 3; x < 13; x++) {
      fillRect(x, 13, 1, 1, 0, 0, 0, 30)
    }
  } else if (kind === 3) {
    // 水晶/宝石
    const cx = 8, cy = 7
    // 主体菱形
    for (let y = 0; y < 7; y++) {
      const w = y < 4 ? y + 1 : 7 - y
      const sx = cx - Math.floor(w / 2)
      for (let x = 0; x < w; x++) {
        const a = 180 + (y < 4 ? y * 10 : (6 - y) * 10)
        fillRect(sx + x, cy - 3 + y, 1, 1,
          dc.crystal[0] + (x < w/2 ? 20 : -10),
          dc.crystal[1] + (x < w/2 ? 20 : -10),
          dc.crystal[2] + (x < w/2 ? 20 : -10), a)
      }
    }
    // 高光
    fillRect(cx - 1, cy - 2, 1, 2, 255, 255, 255, 120)
    // 底座阴影
    for (let x = 5; x < 12; x++) {
      fillRect(x, 11, 1, 1, 0, 0, 0, 50)
    }
  } else if (kind === 4) {
    // 符文印记
    const cx = 8, cy = 8
    // 圆形底
    aaDot(cx, cy, 4, dc.rune[0], dc.rune[1], dc.rune[2], 60)
    // 符文线条
    fillRect(cx - 1, cy - 3, 3, 1, dc.rune[0], dc.rune[1], dc.rune[2], 180)
    fillRect(cx - 3, cy - 1, 7, 1, dc.rune[0], dc.rune[1], dc.rune[2], 160)
    fillRect(cx - 1, cy + 2, 3, 1, dc.rune[0], dc.rune[1], dc.rune[2], 180)
    fillRect(cx - 2, cy - 2, 1, 5, dc.rune[0], dc.rune[1], dc.rune[2], 140)
    fillRect(cx + 2, cy - 2, 1, 5, dc.rune[0], dc.rune[1], dc.rune[2], 140)
    // 中心亮点
    aaDot(cx, cy, 1, 255, 255, 255, 80)
  }

  return px
}

function genWallDeco(palette, kind, seed) {
  const { px, fillRect, aaDot, noise, verticalGradient } = createCanvas(16, 16)
  const dc = palette.deco
  const wa = palette.wall
  const rand = noise(seed)

  if (kind === 1) {
    // 火把
    // 支架
    fillRect(7, 8, 2, 6, 80, 55, 35, 200)
    fillRect(6, 7, 4, 2, 100, 70, 45, 180)
    // 火焰
    const flameColors = [
      [255, 200, 80],
      [255, 150, 50],
      [255, 100, 30],
    ]
    // 底部火焰
    aaDot(8, 5, 2.5, flameColors[1][0], flameColors[1][1], flameColors[1][2], 200)
    aaDot(8, 4, 1.8, flameColors[0][0], flameColors[0][1], flameColors[0][2], 180)
    aaDot(8, 3, 1.2, flameColors[0][0], flameColors[0][2], flameColors[0][2], 140)
    // 火焰核心
    aaDot(8, 5, 1, 255, 240, 180, 200)
  } else if (kind === 2) {
    // 藤蔓
    const startX = 2
    // 主藤
    for (let y = 0; y < 14; y++) {
      const sway = Math.sin(y * 0.5) * 2
      const x = Math.round(startX + sway)
      fillRect(x, y + 1, 1, 1, 60, 100, 50, 200)
      // 叶子
      if (y % 3 === 0) {
        const leafDir = y % 6 === 0 ? 1 : -1
        aaDot(x + leafDir, y + 1, 1.5, 80, 130, 60, 160)
      }
    }
  } else if (kind === 3) {
    // 墙上水晶簇
    const baseY = 10
    // 大水晶
    for (let y = 0; y < 6; y++) {
      const w = y < 3 ? y + 1 : 6 - y
      for (let x = 0; x < w; x++) {
        fillRect(9 - Math.floor(w/2) + x, baseY - 5 + y, 1, 1,
          dc.crystal[0] + 10, dc.crystal[1] + 10, dc.crystal[2] + 10, 200)
      }
    }
    // 小水晶
    for (let y = 0; y < 4; y++) {
      const w = y < 2 ? y + 1 : 4 - y
      for (let x = 0; x < w; x++) {
        fillRect(4 - Math.floor(w/2) + x, baseY - 3 + y, 1, 1,
          dc.crystal[0] - 20, dc.crystal[1] - 20, dc.crystal[2], 170)
      }
    }
    // 高光
    fillRect(9, baseY - 4, 1, 2, 255, 255, 255, 100)
  }

  return px
}

// ---------- 批量生成 ----------
let totalFiles = 0

function saveTile(region, name, pixels) {
  const path = join(outDir, `${region}_${name}.png`)
  writePng(path, TS, TS, pixels)
  totalFiles++
}

for (const [regionId, palette] of Object.entries(REGION_PALETTES)) {
  // 地面
  saveTile(regionId, 'floor_base', genFloorTile(palette, 'base', 1001))
  saveTile(regionId, 'floor_var1', genFloorTile(palette, 'var1', 1002))
  saveTile(regionId, 'floor_var2', genFloorTile(palette, 'var2', 1003))
  saveTile(regionId, 'floor_var3', genFloorTile(palette, 'var3', 1004))
  saveTile(regionId, 'floor_edge', genFloorTile(palette, 'edge', 1005))

  // 墙面
  saveTile(regionId, 'wall_top', genWallTile(palette, 'top', 2001))
  saveTile(regionId, 'wall_side', genWallTile(palette, 'side', 2002))
  saveTile(regionId, 'wall_corner_tl', genWallTile(palette, 'corner_tl', 2003))
  saveTile(regionId, 'wall_corner_tr', genWallTile(palette, 'corner_tr', 2004))
  saveTile(regionId, 'wall_corner_bl', genWallTile(palette, 'corner_bl', 2005))
  saveTile(regionId, 'wall_corner_br', genWallTile(palette, 'corner_br', 2006))
  saveTile(regionId, 'wall_pillar', genWallTile(palette, 'pillar', 2007))

  // 水域（4 帧动画）
  for (let f = 1; f <= 4; f++) {
    saveTile(regionId, `water_${f}`, genWaterTile(palette, f, 3000 + f))
  }

  // 地面装饰
  for (let d = 1; d <= 4; d++) {
    saveTile(regionId, `floor_deco_${d}`, genFloorDeco(palette, d, 4000 + d))
  }

  // 墙面装饰
  for (let d = 1; d <= 3; d++) {
    saveTile(regionId, `wall_deco_${d}`, genWallDeco(palette, d, 5000 + d))
  }
}

console.log(`地形瓷砖生成完成：${totalFiles} 个 PNG 文件 → ${outDir}`)
