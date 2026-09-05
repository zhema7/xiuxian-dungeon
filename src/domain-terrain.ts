// 各域地形特征生成器：山脉、水域、冰山、岩柱、绿洲、沙丘等
// 分层 depth：L1 地形特征(0.5) / L2 水域(1) / L3 道路(2)
import Phaser from 'phaser'
import type { DomainId } from './world-map'

const TEX = 48

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
  return Math.min(255, Math.floor((c >> 16 & 0xff) * f)) << 16 | Math.min(255, Math.floor((c >> 8 & 0xff) * f)) << 8 | Math.min(255, Math.floor((c & 0xff) * f))
}

// ============================================================
// 地形纹理生成
// ============================================================

export function generateDomainTerrain(scene: Phaser.Scene, domain: DomainId): void {
  const makeTex = (type: string, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const key = `terrain_${type}_${domain}`
    if (scene.textures.exists(key)) return
    const cv = document.createElement('canvas')
    cv.width = TEX; cv.height = TEX
    const ctx = cv.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    draw(ctx)
    scene.textures.addCanvas(key, cv)
  }

  // --- 山脉（南域/北域/中域通用，颜色按域变化） ---
  const pal = DOMAIN_TERRAIN_PAL[domain]
  makeTex('mountain_l', ctx => {
    const mc = toHex(pal.mountain), md = toHex(darken(pal.mountain, 0.6)), ml = toHex(lighten(pal.mountain, 1.3))
    const sn = toHex(pal.snow)
    for (let y = 0; y < 44; y++) {
      const hw = Math.max(2, Math.floor(22 - y * 0.45))
      const xs = 24 - hw
      for (let x = 0; x < hw * 2; x++) {
        const cx = xs + x, cy = 4 + y
        const edge = x < 2 || x >= hw * 2 - 2 || y > 38
        const lit = x < hw * 0.4 && y < 20
        if (y < 6 + hw * 0.15) px(ctx, cx, cy, sn)
        else if (lit) px(ctx, cx, cy, ml)
        else if (edge) px(ctx, cx, cy, md)
        else px(ctx, cx, cy, mc)
      }
    }
    // 阴影面
    for (let y = 8; y < 44; y++) {
      const hw = Math.max(2, Math.floor(22 - y * 0.45))
      for (let x = hw; x < hw * 2; x++) {
        const cx = 24 - hw + x
        if (y > 6 + hw * 0.15) px(ctx, cx, 4 + y, md, 0.4)
      }
    }
  })

  makeTex('mountain_m', ctx => {
    const mc = toHex(pal.mountain), md = toHex(darken(pal.mountain, 0.6)), ml = toHex(lighten(pal.mountain, 1.3))
    const sn = toHex(pal.snow)
    for (let y = 0; y < 36; y++) {
      const hw = Math.max(2, Math.floor(18 - y * 0.4))
      const xs = 24 - hw
      for (let x = 0; x < hw * 2; x++) {
        const cx = xs + x, cy = 8 + y
        if (y < 4) px(ctx, cx, cy, sn)
        else if (x < hw * 0.35) px(ctx, cx, cy, ml)
        else px(ctx, cx, cy, x > hw * 1.65 ? md : mc)
      }
    }
  })

  makeTex('mountain_s', ctx => {
    const mc = toHex(pal.mountain), md = toHex(darken(pal.mountain, 0.6)), ml = toHex(lighten(pal.mountain, 1.3))
    for (let y = 0; y < 30; y++) {
      const hw = Math.max(2, Math.floor(14 - y * 0.4))
      const xs = 24 - hw
      for (let x = 0; x < hw * 2; x++) {
        const cx = xs + x, cy = 14 + y
        if (x < hw * 0.3) px(ctx, cx, cy, ml)
        else px(ctx, cx, cy, x > hw * 1.7 ? md : mc)
      }
    }
  })

  // --- 风蚀岩柱（西域专用） ---
  makeTex('rock_pillar', ctx => {
    const rc = toHex(pal.rock), rd = toHex(darken(pal.rock, 0.55)), rl = toHex(lighten(pal.rock, 1.3))
    // 柱身（上窄下宽）
    for (let y = 0; y < 44; y++) {
      const hw = 6 + Math.floor(y * 0.18)
      const xs = 24 - hw
      for (let x = 0; x < hw * 2; x++) {
        const cx = xs + x, cy = 2 + y
        const lit = x < hw * 0.3
        const edge = x < 1 || x >= hw * 2 - 1
        if (lit) px(ctx, cx, cy, rl)
        else if (edge) px(ctx, cx, cy, rd)
        else px(ctx, cx, cy, rc)
      }
      // 风蚀纹
      if (y % 6 === 3) {
        const hw2 = 6 + Math.floor(y * 0.18)
        rect(ctx, 24 - hw2, 2 + y, hw2 * 2, 1, rd, 0.5)
      }
    }
    // 顶帽（风蚀蘑菇头）
    rect(ctx, 14, 0, 20, 4, rc)
    rect(ctx, 14, 0, 20, 1, rl)
    rect(ctx, 14, 3, 20, 1, rd)
  })

  // --- 沙丘（西域专用） ---
  makeTex('sand_dune', ctx => {
    const sc = toHex(pal.sand), sd = toHex(darken(pal.sand, 0.7)), sl = toHex(lighten(pal.sand, 1.2))
    for (let y = 20; y < 48; y++) {
      const hw = Math.floor(24 - (y - 20) * 0.5)
      if (hw < 1) break
      const xs = 24 - hw
      for (let x = 0; x < hw * 2; x++) {
        const cx = xs + x
        const lit = x < hw * 0.4
        px(ctx, cx, y, lit ? sl : (x > hw * 1.6 ? sd : sc))
      }
    }
    // 沙纹
    for (let i = 0; i < 5; i++) {
      const y = 28 + i * 4
      const hw = Math.floor(24 - (y - 20) * 0.5)
      rect(ctx, 24 - hw + 2, y, hw * 2 - 4, 1, sd, 0.3)
    }
  })

  // --- 冰墙（北域专用） ---
  makeTex('ice_wall', ctx => {
    const ic = toHex(pal.ice), id = toHex(darken(pal.ice, 0.55)), il = toHex(lighten(pal.ice, 1.4))
    const sn = '#e8f4ff'
    rect(ctx, 0, 0, 48, 48, ic)
    // 冰面裂纹
    for (let i = 0; i < 8; i++) {
      const x1 = Math.floor(Math.random() * 48)
      const y1 = Math.floor(Math.random() * 48)
      const len = 4 + Math.floor(Math.random() * 8)
      const dir = Math.random() * Math.PI * 2
      for (let j = 0; j < len; j++) {
        const x = Math.floor(x1 + Math.cos(dir) * j)
        const y = Math.floor(y1 + Math.sin(dir) * j)
        if (x >= 0 && x < 48 && y >= 0 && y < 48) px(ctx, x, y, id, 0.4)
      }
    }
    // 高光面
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(Math.random() * 48)
      const y = Math.floor(Math.random() * 48)
      px(ctx, x, y, il, 0.5)
    }
    // 雪覆盖顶部
    rect(ctx, 0, 0, 48, 4, sn)
    rect(ctx, 0, 4, 48, 2, il, 0.5)
    // 冰柱
    for (let i = 0; i < 4; i++) {
      const x = 8 + i * 12
      const h = 4 + Math.floor(Math.random() * 4)
      rect(ctx, x, 4, 3, h, il, 0.6)
      px(ctx, x, 4 + h, id)
    }
  })

  // --- 雪地斑块（北域专用） ---
  makeTex('snow_patch', ctx => {
    const sn = '#e8f4ff', sh = '#c4d4e4'
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        const dx = x - 24, dy = y - 24
        if (dx * dx + dy * dy < 400 + Math.sin(x * 0.3) * 30) {
          px(ctx, x, y, Math.random() > 0.15 ? sn : sh)
        }
      }
    }
    // 闪光点
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(Math.random() * 48)
      const y = Math.floor(Math.random() * 48)
      px(ctx, x, y, '#ffffff')
    }
  })

  // --- 冰晶簇（北域专用） ---
  makeTex('ice_crystal', ctx => {
    const ic = '#7dd3fc', id = '#0c7a9a', il = '#e0f4ff'
    for (let i = 0; i < 5; i++) {
      const cx = 10 + i * 8
      const h = 8 + Math.floor(Math.random() * 12)
      const w = 4 + Math.floor(Math.random() * 4)
      for (let y = 0; y < h; y++) {
        const cw = Math.max(1, w - Math.floor(y * 0.3))
        const xs = cx - Math.floor(cw / 2)
        rect(ctx, xs, 44 - y - h + 8, cw, 1, y < 3 ? il : (y > h - 3 ? id : ic))
      }
      px(ctx, cx, 44 - h + 8, il)
    }
    // 底部光晕
    rect(ctx, 4, 42, 40, 2, ic, 0.2)
  })

  // --- 仙人掌（西域专用） ---
  makeTex('cactus', ctx => {
    const cc = toHex(pal.plant), cd = toHex(darken(pal.plant, 0.6)), cl = toHex(lighten(pal.plant, 1.3))
    // 主干
    rect(ctx, 22, 8, 4, 36, cc)
    rect(ctx, 22, 8, 1, 36, cl)
    rect(ctx, 25, 8, 1, 36, cd)
    // 分枝
    rect(ctx, 12, 20, 4, 3, cc)
    rect(ctx, 16, 20, 6, 4, cc)
    rect(ctx, 16, 20, 1, 4, cl)
    rect(ctx, 16, 23, 6, 1, cd)
    rect(ctx, 12, 17, 4, 3, cc)
    rect(ctx, 12, 17, 1, 3, cd)
    rect(ctx, 30, 24, 4, 3, cc)
    rect(ctx, 26, 24, 4, 4, cc)
    rect(ctx, 26, 24, 1, 4, cl)
    rect(ctx, 26, 28, 4, 1, cd)
    rect(ctx, 30, 21, 4, 3, cc)
    rect(ctx, 33, 21, 1, 3, cd)
    // 刺
    for (let y = 10; y < 42; y += 4) {
      px(ctx, 21, y, '#fbbf24')
      px(ctx, 26, y + 2, '#fbbf24')
    }
    // 花
    px(ctx, 23, 7, '#ef4444')
    px(ctx, 24, 6, '#fbbf24')
    px(ctx, 22, 6, '#fbbf24')
  })

  // --- 枯木残骸（西域/北域通用） ---
  makeTex('wreck', ctx => {
    const wc = toHex(pal.rock), wd = toHex(darken(pal.rock, 0.5))
    rect(ctx, 8, 30, 32, 4, wc)
    rect(ctx, 8, 30, 32, 1, toHex(lighten(pal.rock, 1.2)))
    rect(ctx, 8, 33, 32, 1, wd)
    // 断裂面
    rect(ctx, 12, 28, 4, 6, wd)
    rect(ctx, 30, 28, 4, 6, wd)
    // 木纹
    for (let i = 0; i < 5; i++) {
      const x = 14 + i * 5
      rect(ctx, x, 31, 3, 2, wd, 0.3)
    }
    // 骨头（散落）
    rect(ctx, 6, 38, 8, 2, '#e8d8c0')
    rect(ctx, 4, 40, 4, 2, '#e8d8c0')
    rect(ctx, 36, 40, 6, 2, '#e8d8c0')
    rect(ctx, 42, 38, 3, 2, '#e8d8c0')
  })

  // --- 烽火台残骸（西域专用） ---
  makeTex('beacon', ctx => {
    const sc = toHex(pal.rock), sd = toHex(darken(pal.rock, 0.55)), sl = toHex(lighten(pal.rock, 1.3))
    // 底座废墟
    rect(ctx, 8, 36, 32, 8, sd)
    rect(ctx, 8, 36, 32, 2, sl)
    // 残柱
    rect(ctx, 14, 18, 8, 20, sc)
    rect(ctx, 14, 18, 8, 1, sl)
    rect(ctx, 14, 18, 1, 20, sl)
    rect(ctx, 21, 18, 1, 20, sd)
    rect(ctx, 26, 24, 6, 14, sc)
    rect(ctx, 26, 24, 6, 1, sl)
    rect(ctx, 26, 24, 1, 14, sd)
    // 破碎砖块
    rect(ctx, 34, 32, 6, 4, sd)
    rect(ctx, 34, 32, 6, 1, sl)
    rect(ctx, 6, 34, 4, 4, sc)
    // 残旗
    px(ctx, 18, 14, '#8b2c2c', 0.5)
    rect(ctx, 18, 14, 1, 6, '#4a3520')
  })

  // --- 椰树（东域专用） ---
  makeTex('palm', ctx => {
    const tc = toHex(pal.rock), td = toHex(darken(pal.rock, 0.6))
    const lc = toHex(pal.plant), ld = toHex(darken(pal.plant, 0.6)), ll = toHex(lighten(pal.plant, 1.3))
    // 弯曲树干
    for (let y = 0; y < 30; y++) {
      const bend = Math.sin(y * 0.15) * 3
      const x = 24 + Math.round(bend)
      px(ctx, x, 14 + y, tc)
      px(ctx, x + 1, 14 + y, td)
      px(ctx, x - 1, 14 + y, tc)
    }
    // 椰叶（放射状）
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2
      const len = 10 + Math.floor(Math.random() * 4)
      for (let j = 0; j < len; j++) {
        const lx = Math.round(24 + Math.cos(angle) * j)
        const ly = Math.round(14 + Math.sin(angle) * j * 0.7)
        px(ctx, lx, ly, j < 3 ? ll : (j > len - 3 ? ld : lc))
        if (j < len - 2) px(ctx, lx + (Math.cos(angle) > 0 ? 1 : -1), ly, lc)
      }
      // 叶尖
      const tx = Math.round(24 + Math.cos(angle) * len)
      const ty = Math.round(14 + Math.sin(angle) * len * 0.7)
      px(ctx, tx, ty, ld)
    }
    // 椰子
    px(ctx, 22, 16, td)
    px(ctx, 23, 17, tc)
    px(ctx, 26, 16, td)
    px(ctx, 25, 17, tc)
  })

  // --- 珊瑚（东域专用） ---
  makeTex('coral', ctx => {
    const cc = toHex(pal.plant), cd = toHex(darken(pal.plant, 0.6)), cl = toHex(lighten(pal.plant, 1.3))
    // 珊瑚枝
    for (let i = 0; i < 5; i++) {
      const bx = 14 + i * 5
      const h = 12 + Math.floor(Math.random() * 16)
      for (let y = 0; y < h; y++) {
        const w = Math.max(1, 3 - Math.floor(y * 0.08))
        const xs = bx - Math.floor(w / 2)
        rect(ctx, xs, 44 - y, w, 1, y < 4 ? cl : (y > h - 4 ? cd : cc))
      }
      // 分枝
      if (h > 18) {
        const by = 44 - h + 6
        rect(ctx, bx, by, 4, 2, cc)
        rect(ctx, bx, by, 4, 1, cl)
        rect(ctx, bx + 3, by, 1, 4, cd)
      }
    }
    // 底部
    rect(ctx, 10, 42, 28, 4, cd)
    rect(ctx, 10, 42, 28, 1, cc)
    // 气泡
    px(ctx, 16, 30, cl, 0.4)
    px(ctx, 28, 22, cl, 0.3)
    px(ctx, 22, 16, cl, 0.3)
  })

  // --- 栈桥（东域专用） ---
  makeTex('bridge_h', ctx => {
    const wc = '#8a6a4a', wd = '#5a3a20', wl = '#aa8a6a'
    // 桥板
    rect(ctx, 0, 20, 48, 8, wc)
    rect(ctx, 0, 20, 48, 1, wl)
    rect(ctx, 0, 27, 48, 1, wd)
    // 木板缝
    for (let i = 0; i < 6; i++) {
      rect(ctx, i * 8, 20, 1, 8, wd)
    }
    // 桥桩
    rect(ctx, 4, 28, 4, 12, wd)
    rect(ctx, 40, 28, 4, 12, wd)
    rect(ctx, 20, 28, 4, 12, wd)
    // 水面倒影
    rect(ctx, 4, 40, 4, 4, wc, 0.15)
    rect(ctx, 20, 40, 4, 4, wc, 0.15)
    rect(ctx, 40, 40, 4, 4, wc, 0.15)
  })

  makeTex('bridge_v', ctx => {
    const wc = '#8a6a4a', wd = '#5a3a20', wl = '#aa8a6a'
    rect(ctx, 20, 0, 8, 48, wc)
    rect(ctx, 20, 0, 1, 48, wl)
    rect(ctx, 27, 0, 1, 48, wd)
    for (let i = 0; i < 6; i++) {
      rect(ctx, 20, i * 8, 8, 1, wd)
    }
    rect(ctx, 28, 4, 12, 4, wd)
    rect(ctx, 28, 40, 12, 4, wd)
  })

  // --- 冰封古兽石（北域专用） ---
  makeTex('frozen_beast', ctx => {
    const ic = '#9ac4e4', id = '#5a8aaa', il = '#d4e8f4'
    const sn = '#e8f4ff'
    // 大致轮廓（伏卧形态）
    for (let y = 0; y < 24; y++) {
      const hw = Math.max(4, 20 - Math.floor(y * 0.3))
      const xs = 24 - hw
      for (let x = 0; x < hw * 2; x++) {
        const cx = xs + x, cy = 18 + y
        const lit = x < hw * 0.35
        const edge = x < 1 || x >= hw * 2 - 1
        if (lit) px(ctx, cx, cy, il)
        else if (edge) px(ctx, cx, cy, id)
        else px(ctx, cx, cy, ic)
      }
    }
    // 头部凸起
    for (let y = 0; y < 10; y++) {
      const hw = Math.max(2, 6 - Math.floor(y * 0.3))
      const xs = 38 - hw
      for (let x = 0; x < hw * 2; x++) {
        px(ctx, xs + x, 26 + y, x < 2 ? il : ic)
      }
    }
    // 冰覆盖
    rect(ctx, 8, 18, 32, 4, sn, 0.5)
    rect(ctx, 10, 22, 28, 3, il, 0.3)
    // 冰棱
    px(ctx, 12, 42, il)
    px(ctx, 36, 42, il)
    px(ctx, 24, 42, il)
  })

  // --- 古战场碑（西域专用） ---
  makeTex('war_monument', ctx => {
    const sc = '#6a5a4a', sd = '#3a2a1a', sl = '#8a7a6a'
    // 碑身
    rect(ctx, 16, 8, 16, 36, sc)
    rect(ctx, 16, 8, 16, 2, sl)
    rect(ctx, 16, 8, 2, 36, sl)
    rect(ctx, 30, 8, 2, 36, sd)
    rect(ctx, 16, 42, 16, 2, sd)
    // 碑顶
    rect(ctx, 14, 4, 20, 4, sd)
    rect(ctx, 14, 4, 20, 1, sl)
    // 刻痕（剑痕）
    rect(ctx, 20, 14, 1, 12, sd)
    rect(ctx, 22, 16, 1, 10, sd)
    rect(ctx, 26, 14, 1, 14, sd)
    rect(ctx, 28, 18, 1, 8, sd)
    // 暗红血迹
    px(ctx, 21, 20, '#5a1a1a', 0.5)
    px(ctx, 27, 24, '#5a1a1a', 0.4)
    px(ctx, 23, 28, '#5a1a1a', 0.3)
    // 底座
    rect(ctx, 10, 42, 28, 4, sd)
    rect(ctx, 10, 42, 28, 1, sl)
    // 散落碎石
    rect(ctx, 4, 44, 6, 2, sd)
    rect(ctx, 38, 44, 6, 2, sd)
  })
}

// ============================================================
// 地形配色表
// ============================================================

const DOMAIN_TERRAIN_PAL: Record<DomainId, {
  mountain: number; rock: number; sand: number; ice: number; snow: number; plant: number
}> = {
  south:  { mountain: 0x4a6a3a, rock: 0x5a6a4a, sand: 0x6a5a3a, ice: 0x6a8a7a, snow: 0x9ab4a4, plant: 0x2a5a3a },
  central:{ mountain: 0x5a5a6a, rock: 0x6a6a7a, sand: 0x7a7a6a, ice: 0x6a7a8a, snow: 0x9aaab4, plant: 0x4a4a6a },
  east:   { mountain: 0x3a5a6a, rock: 0x4a6a5a, sand: 0x5a6a4a, ice: 0x5a8a9a, snow: 0x8ac4e4, plant: 0x3a7a5a },
  west:   { mountain: 0x6a5a3a, rock: 0x8a7a4a, sand: 0xca9a4a, ice: 0x8a8a6a, snow: 0xcab4a4, plant: 0x6a8a3a },
  north:  { mountain: 0x6a8a9a, rock: 0x7a8a9a, sand: 0x8a9aaa, ice: 0x9ac4e4, snow: 0xe8f4ff, plant: 0x4a7a8a },
}

export function getTerrainKey(type: string, domain: DomainId): string {
  return `terrain_${type}_${domain}`
}

// ============================================================
// 水域路径定义（各域河流/海/护城河）
// ============================================================

export interface WaterPath {
  points: number[][]  // 多边形顶点
  type: 'river' | 'sea' | 'ice_river' | 'moat' | 'oasis'
}

export const DOMAIN_WATER: Record<DomainId, WaterPath[]> = {
  south: [
    // 蜿蜒溪流：东北→西南
    { type: 'river', points: [
      [920, 150], [880, 280], [850, 420], [820, 560],
      [780, 700], [720, 840], [650, 980], [580, 1120],
      [500, 1260], [420, 1400], [350, 1560], [280, 1680],
    ]},
  ],
  central: [
    // 环城护城河（方形）
    { type: 'moat', points: [
      [440, 780], [760, 780], [760, 920], [440, 920], [440, 780],
    ]},
  ],
  east: [
    // 东半海域
    { type: 'sea', points: [
      [620, 0], [1200, 0], [1200, 1700],
      [680, 1700], [640, 1400], [620, 1000], [640, 600], [620, 0],
    ]},
    // 小岛周围水
    { type: 'sea', points: [
      [900, 400], [1100, 400], [1100, 500], [900, 500], [900, 400],
    ]},
  ],
  west: [
    // 绿洲
    { type: 'oasis', points: [
      [820, 1280], [980, 1280], [980, 1380], [820, 1380], [820, 1280],
    ]},
  ],
  north: [
    // 冰河：横贯东西
    { type: 'ice_river', points: [
      [0, 820], [200, 840], [400, 830], [600, 850],
      [800, 840], [1000, 860], [1200, 850], [1200, 890],
      [1000, 900], [800, 890], [600, 910],
      [400, 900], [200, 890], [0, 880],
    ]},
  ],
}

// ============================================================
// 地形放置点（山脉/岩柱/冰墙等固定位置）
// ============================================================

export interface TerrainPlacement {
  type: string
  x: number
  y: number
  scale: number
}

export const DOMAIN_TERRAIN_PLACEMENTS: Record<DomainId, TerrainPlacement[]> = {
  south: [
    // 东南青冥山余脉
    { type: 'mountain_l', x: 1000, y: 1450, scale: 2.5 },
    { type: 'mountain_m', x: 1050, y: 1390, scale: 2.0 },
    { type: 'mountain_m', x: 950, y: 1490, scale: 1.8 },
    { type: 'mountain_s', x: 1080, y: 1430, scale: 1.5 },
    { type: 'mountain_s', x: 920, y: 1420, scale: 1.3 },
    // 西北小丘
    { type: 'mountain_s', x: 180, y: 300, scale: 1.4 },
    { type: 'mountain_s', x: 250, y: 350, scale: 1.2 },
  ],
  central: [
    // 四角点缀小山
    { type: 'mountain_s', x: 150, y: 200, scale: 1.3 },
    { type: 'mountain_s', x: 1050, y: 200, scale: 1.3 },
    { type: 'mountain_s', x: 150, y: 1500, scale: 1.2 },
    { type: 'mountain_s', x: 1050, y: 1500, scale: 1.2 },
  ],
  east: [
    // 海中孤岛山峰
    { type: 'mountain_m', x: 850, y: 300, scale: 1.8 },
    { type: 'mountain_s', x: 1000, y: 500, scale: 1.3 },
    { type: 'mountain_s', x: 900, y: 700, scale: 1.2 },
    { type: 'mountain_m', x: 950, y: 1200, scale: 1.6 },
    { type: 'mountain_s', x: 1050, y: 1400, scale: 1.4 },
    { type: 'mountain_s', x: 820, y: 1500, scale: 1.2 },
  ],
  west: [
    // 西北风蚀岩柱群
    { type: 'rock_pillar', x: 150, y: 300, scale: 2.5 },
    { type: 'rock_pillar', x: 200, y: 350, scale: 2.0 },
    { type: 'rock_pillar', x: 120, y: 380, scale: 1.8 },
    { type: 'rock_pillar', x: 250, y: 280, scale: 1.6 },
    { type: 'rock_pillar', x: 180, y: 420, scale: 1.5 },
    // 沙丘
    { type: 'sand_dune', x: 400, y: 1600, scale: 2.0 },
    { type: 'sand_dune', x: 500, y: 1580, scale: 1.8 },
    { type: 'sand_dune', x: 700, y: 1620, scale: 1.5 },
    { type: 'sand_dune', x: 300, y: 1550, scale: 1.6 },
    { type: 'sand_dune', x: 900, y: 1550, scale: 1.7 },
    // 烽火台
    { type: 'beacon', x: 350, y: 600, scale: 1.5 },
    { type: 'beacon', x: 850, y: 1100, scale: 1.3 },
    { type: 'war_monument', x: 600, y: 300, scale: 1.4 },
  ],
  north: [
    // 北部冰山屏障
    { type: 'ice_wall', x: 100, y: 80, scale: 2.5 },
    { type: 'ice_wall', x: 250, y: 60, scale: 2.2 },
    { type: 'ice_wall', x: 400, y: 90, scale: 2.8 },
    { type: 'ice_wall', x: 550, y: 70, scale: 2.4 },
    { type: 'ice_wall', x: 700, y: 85, scale: 2.6 },
    { type: 'ice_wall', x: 850, y: 60, scale: 2.3 },
    { type: 'ice_wall', x: 1000, y: 90, scale: 2.7 },
    { type: 'ice_wall', x: 1150, y: 75, scale: 2.5 },
    // 雪地斑块
    { type: 'snow_patch', x: 200, y: 1100, scale: 1.5 },
    { type: 'snow_patch', x: 500, y: 1300, scale: 1.8 },
    { type: 'snow_patch', x: 800, y: 1100, scale: 1.6 },
    { type: 'snow_patch', x: 1000, y: 1300, scale: 1.4 },
    { type: 'snow_patch', x: 300, y: 1500, scale: 1.7 },
    { type: 'snow_patch', x: 700, y: 1500, scale: 1.5 },
    // 冰晶簇
    { type: 'ice_crystal', x: 350, y: 600, scale: 1.4 },
    { type: 'ice_crystal', x: 650, y: 650, scale: 1.3 },
    { type: 'ice_crystal', x: 850, y: 1200, scale: 1.2 },
    { type: 'ice_crystal', x: 250, y: 1350, scale: 1.5 },
    // 冰封古兽
    { type: 'frozen_beast', x: 500, y: 500, scale: 1.8 },
    { type: 'frozen_beast', x: 800, y: 1400, scale: 1.6 },
  ],
}

// ============================================================
// 域特有植被装饰权重（覆盖默认权重）
// ============================================================

export const DOMAIN_VEG_WEIGHTS: Record<DomainId, { type: string; weight: number }[]> = {
  south: [
    { type: 'willow', weight: 5 },
    { type: 'bamboo', weight: 3 },
    { type: 'round_tree', weight: 2 },
    { type: 'lotus_pond', weight: 1 },
    { type: 'lantern_post', weight: 1 },
    { type: 'bush_s', weight: 2 },
    { type: 'grass_1', weight: 2 },
    { type: 'flower_r', weight: 1.5 },
    { type: 'flower_y', weight: 1 },
    { type: 'rock_m', weight: 1 },
  ],
  central: [
    { type: 'pine', weight: 4 },
    { type: 'pagoda', weight: 1.5 },
    { type: 'spirit_gate', weight: 1 },
    { type: 'lantern_post', weight: 2 },
    { type: 'round_tree', weight: 2 },
    { type: 'bush_s', weight: 1.5 },
    { type: 'grass_1', weight: 1.5 },
    { type: 'crystal', weight: 1.2 },
  ],
  east: [
    { type: 'palm', weight: 5 },
    { type: 'coral', weight: 3 },
    { type: 'lotus_pond', weight: 2 },
    { type: 'bamboo', weight: 2 },
    { type: 'rock_s', weight: 1 },
    { type: 'grass_1', weight: 1.5 },
    { type: 'bush_s', weight: 1 },
  ],
  west: [
    { type: 'cactus', weight: 5 },
    { type: 'dead_tree', weight: 4 },
    { type: 'wreck', weight: 3 },
    { type: 'beacon', weight: 1 },
    { type: 'rock_l', weight: 2 },
    { type: 'rock_m', weight: 2 },
    { type: 'sand_dune', weight: 2 },
    { type: 'grass_2', weight: 0.8 },
    { type: 'war_monument', weight: 0.5 },
  ],
  north: [
    { type: 'dead_tree', weight: 5 },
    { type: 'ice_crystal', weight: 4 },
    { type: 'snow_patch', weight: 3 },
    { type: 'frozen_beast', weight: 1 },
    { type: 'pine', weight: 2 },
    { type: 'rock_l', weight: 1.5 },
    { type: 'rock_m', weight: 1 },
    { type: 'grass_2', weight: 0.5 },
  ],
}
