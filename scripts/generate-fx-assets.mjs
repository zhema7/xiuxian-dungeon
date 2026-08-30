// ---------- 20种新招式/神通贴图动画生成器 ----------
// 每组效果：48x48 PNG 透明序列帧
// 10个新AttackMode贴图 + 10个新ArtMode贴图 = 20组动画
// 命名：sprites/fx_{name}_{n}.png

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'sprites')
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
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.allocUnsafe(4); lenBuf.writeUInt32BE(data.length)
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}
function writePng(path, w, h, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const raw = Buffer.allocUnsafe(h * (1 + w * 4))
  let off = 0
  for (let y = 0; y < h; y++) {
    raw[off++] = 0
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      raw[off++] = pixels[idx]; raw[off++] = pixels[idx+1]; raw[off++] = pixels[idx+2]; raw[off++] = pixels[idx+3]
    }
  }
  const idat = deflateSync(raw)
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.allocUnsafe(0))])
  writeFileSync(path, png)
}

// ---------- 像素画布 ----------
function createCanvas(w, h) {
  const px = new Uint8ClampedArray(w * h * 4)
  function set(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= w || y < 0 || y >= h) return
    if (a <= 0) return
    const i = (y * w + x) * 4
    if (a >= 255) { px[i] = r; px[i+1] = g; px[i+2] = b; px[i+3] = 255; return }
    const srcA = a / 255, dstA = px[i+3] / 255
    const outA = srcA + dstA * (1 - srcA)
    if (outA <= 0) return
    px[i]   = Math.round((r * srcA + px[i]   * dstA * (1 - srcA)) / outA)
    px[i+1] = Math.round((g * srcA + px[i+1] * dstA * (1 - srcA)) / outA)
    px[i+2] = Math.round((b * srcA + px[i+2] * dstA * (1 - srcA)) / outA)
    px[i+3] = Math.round(outA * 255)
  }
  function rect(x, y, rw, rh, r, g, b, a = 255) {
    for (let yy = y; yy < y + rh; yy++)
      for (let xx = x; xx < x + rw; xx++)
        set(xx, yy, r, g, b, a)
  }
  function circle(cx, cy, radius, r, g, b, a = 255) {
    for (let y = -radius; y <= radius; y++)
      for (let x = -radius; x <= radius; x++)
        if (x*x + y*y <= radius*radius) set(cx + x, cy + y, r, g, b, a)
  }
  function ring(cx, cy, radius, thickness, r, g, b, a = 255) {
    const r2 = radius * radius, ri2 = (radius - thickness) * (radius - thickness)
    for (let y = -radius; y <= radius; y++)
      for (let x = -radius; x <= radius; x++) {
        const d2 = x*x + y*y
        if (d2 <= r2 && d2 >= ri2) set(cx + x, cy + y, r, g, b, a)
      }
  }
  function line(x0, y0, x1, y1, r, g, b, a = 255) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    while (true) {
      set(x0, y0, r, g, b, a)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 > -dy) { err -= dy; x0 += sx }
      if (e2 < dx) { err += dx; y0 += sy }
    }
  }
  function arc(cx, cy, radius, startA, endA, r, g, b, a = 255) {
    for (let y = -radius; y <= radius; y++)
      for (let x = -radius; x <= radius; x++) {
        const d2 = x*x + y*y
        if (d2 > radius * radius || d2 < (radius-2) * (radius-2)) continue
        const ang = Math.atan2(y, x)
        let na = ang
        while (na < startA) na += Math.PI * 2
        if (na <= endA) set(cx + x, cy + y, r, g, b, a)
      }
  }
  function tri(x0, y0, x1, y1, x2, y2, r, g, b, a = 255) {
    const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2)
    for (let y = minY; y <= maxY; y++) {
      const xs = []
      const edges = [[x0,y0,x1,y1],[x1,y1,x2,y2],[x2,y2,x0,y0]]
      for (const [ex0,ey0,ex1,ey1] of edges) {
        if ((ey0 <= y && ey1 > y) || (ey1 <= y && ey0 > y)) {
          xs.push(ex0 + (ex1-ex0) * (y-ey0) / (ey1-ey0))
        }
      }
      xs.sort((a,b) => a - b)
      for (let x = Math.ceil(xs[0]); x <= Math.floor(xs[1]); x++) set(x, y, r, g, b, a)
    }
  }
  return { px: () => px, set, rect, circle, ring, line, arc, tri }
}

const W = 48, H = 48
const CX = 24, CY = 24

// ---------- 20种效果帧绘制 ----------

// 1. fx_shadow: 暗影刃 - 暗紫月牙刃 6帧
function drawShadow(c, frame, total) {
  const t = frame / total
  const r = 8 + t * 16
  const a = (1 - t * 0.7) * 255
  const ang = t * Math.PI * 0.5
  for (let i = 0; i < 5; i++) {
    const off = (i - 2) * 3
    c.arc(CX + Math.cos(ang) * off, CY + Math.sin(ang) * off, Math.round(r), -Math.PI*0.7, -Math.PI*0.3, 50, 15, 70, a * (1 - i*0.15))
  }
  c.circle(CX, CY, Math.round(3 + t*4), 30, 10, 50, a * 0.6)
}

// 2. fx_chain: 灵锁链 - 金属锁链延伸 6帧
function drawChain(c, frame, total) {
  const t = frame / total
  const len = 6 + t * 18
  const a = (1 - t * 0.4) * 255
  for (let i = 0; i < len; i += 4) {
    const x = CX + i
    const isLink = (i / 4) % 2 === 0
    if (isLink) c.rect(x, CY - 2, 3, 4, 160, 160, 180, a)
    else c.rect(x + 1, CY - 1, 2, 2, 120, 120, 140, a)
  }
  c.circle(CX + Math.round(len), CY, 3, 200, 200, 220, a)
}

// 3. fx_wind: 风刃连 - 青绿风刃 6帧
function drawWind(c, frame, total) {
  const t = frame / total
  const r = 6 + t * 14
  const a = (1 - t * 0.6) * 255
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 5
    c.arc(CX, CY + off, Math.round(r + i*2), Math.PI*0.2, Math.PI*0.8, 180, 255, 200, a * (1 - i*0.2))
  }
  c.circle(CX, CY, Math.round(2 + t*3), 200, 255, 220, a * 0.5)
}

// 4. fx_spike: 地刺术 - 岩刺上突 6帧
function drawSpike(c, frame, total) {
  const t = frame / total
  const h = Math.round(4 + t * 20)
  const a = (1 - t * 0.3) * 255
  // 底座
  c.rect(CX - 6, CY + 8, 12, 4, 120, 90, 60, a)
  // 刺身
  c.tri(CX - 3, CY + 8, CX + 3, CY + 8, CX, CY + 8 - h, 150, 120, 80, a)
  // 高光
  c.line(CX, CY + 8 - h + 2, CX, CY + 6, 200, 180, 120, a * 0.7)
  // 碎石
  if (t > 0.3) {
    c.set(CX - 5, CY + 7, 100, 80, 50, a)
    c.set(CX + 5, CY + 7, 100, 80, 50, a)
  }
}

// 5. fx_scythe: 血镰斩 - 血红镰刀弧 6帧
function drawScythe(c, frame, total) {
  const t = frame / total
  const r = 8 + t * 16
  const a = (1 - t * 0.5) * 255
  const startA = -Math.PI * 0.8 + t * 0.3
  const endA = -Math.PI * 0.2 + t * 0.3
  for (let i = 0; i < 4; i++) {
    c.arc(CX, CY, Math.round(r + i), startA, endA, 180 - i*20, 30 - i*5, 40, a * (1 - i*0.15))
  }
  c.circle(CX, CY, Math.round(2 + t*3), 120, 20, 30, a * 0.6)
}

// 6. fx_star: 星雨弩 - 金色星刃 6帧
function drawStar(c, frame, total) {
  const t = frame / total
  const r = 5 + t * 8
  const a = (1 - t * 0.4) * 255
  const rot = t * Math.PI
  for (let i = 0; i < 5; i++) {
    const ang = rot + (i / 5) * Math.PI * 2
    const x1 = CX + Math.cos(ang) * r
    const y1 = CY + Math.sin(ang) * r
    const x2 = CX + Math.cos(ang + 2.5) * r * 0.4
    const y2 = CY + Math.sin(ang + 2.5) * r * 0.4
    c.line(CX, CY, Math.round(x1), Math.round(y1), 255, 220, 100, a)
    c.line(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), 255, 200, 80, a * 0.8)
    c.line(Math.round(x2), Math.round(y2), CX, CY, 255, 220, 100, a)
  }
  c.circle(CX, CY, 2, 255, 240, 150, a)
}

// 7. fx_claw: 毒爪裂 - 毒绿爪痕 6帧
function drawClaw(c, frame, total) {
  const t = frame / total
  const len = 4 + t * 16
  const a = (1 - t * 0.5) * 255
  for (let i = -1; i <= 1; i++) {
    const off = i * 5
    c.line(CX - Math.round(len/2), CY + off, CX + Math.round(len/2), CY + off - 3, 100, 200, 80, a)
    // 爪尖
    c.set(CX + Math.round(len/2), CY + off - 3, 80, 220, 60, a)
    // 毒滴
    if (t > 0.3) c.set(CX + off, CY + 6, 60, 160, 40, a * 0.7)
  }
}

// 8. fx_light: 圣光束 - 白金光柱 4帧
function drawLight(c, frame, total) {
  const t = frame / total
  const w = Math.round(2 + t * 8)
  const a = (1 - t * 0.4) * 255
  c.rect(CX - w, 0, w * 2, H, 255, 250, 200, a * 0.3)
  c.rect(CX - Math.round(w/2), 0, w, H, 255, 250, 220, a * 0.7)
  c.rect(CX - 1, 0, 2, H, 255, 255, 240, a)
  // 光芒散射
  for (let y = 0; y < H; y += 6) {
    c.set(CX - w - 1, y, 255, 240, 180, a * 0.4)
    c.set(CX + w, y, 255, 240, 180, a * 0.4)
  }
}

// 9. fx_soul: 魂火弹 - 幽青魂焰 6帧
function drawSoul(c, frame, total) {
  const t = frame / total
  const a = (1 - t * 0.4) * 255
  const flicker = Math.sin(frame * 2.5) * 2
  // 焰身
  c.circle(CX, CY + Math.round(flicker), Math.round(4 + t*3), 100, 255, 220, a * 0.8)
  c.circle(CX, CY + Math.round(flicker), Math.round(2 + t*2), 150, 255, 240, a)
  // 拖尾
  for (let i = 0; i < 4; i++) {
    const ty = CY + 4 + i * 3
    c.circle(CX - Math.round(i * 0.5), ty, Math.max(1, 3 - i), 80, 200, 200, a * (1 - i*0.25))
  }
  // 魂火粒子
  c.set(CX + 3, CY - 2, 120, 255, 200, a * 0.6)
  c.set(CX - 3, CY - 1, 120, 255, 200, a * 0.6)
}

// 10. fx_crystal: 晶碎刃 - 蓝晶碎片 6帧
function drawCrystal(c, frame, total) {
  const t = frame / total
  const r = 4 + t * 10
  const a = (1 - t * 0.4) * 255
  const rot = t * Math.PI * 0.3
  for (let i = 0; i < 3; i++) {
    const ang = rot + i * 2.094
    const x = CX + Math.round(Math.cos(ang) * r)
    const y = CY + Math.round(Math.sin(ang) * r)
    c.tri(x, y - 3, x + 2, y + 1, x - 2, y + 1, 150, 220, 255, a)
    c.tri(x, y - 2, x + 1, y, x - 1, y, 200, 240, 255, a * 0.7)
  }
  c.circle(CX, CY, Math.round(2 + t*2), 180, 230, 255, a * 0.5)
}

// 11. fx_meteor: 陨石天降 - 火陨坠落爆裂 8帧
function drawMeteor(c, frame, total) {
  const t = frame / total
  if (t < 0.5) {
    // 坠落阶段
    const y = Math.round(4 + t * 32)
    const a = 255
    // 陨石
    c.circle(CX, y, 4, 255, 140, 50, a)
    c.circle(CX, y, 2, 255, 200, 100, a)
    // 拖尾
    for (let i = 1; i < 6; i++) {
      c.circle(CX, y - i * 4, Math.max(1, 4 - i), 255, 100, 30, a * (1 - i*0.15))
    }
  } else {
    // 爆裂阶段
    const ex = (t - 0.5) * 2
    const r = Math.round(ex * 20)
    const a = (1 - ex * 0.5) * 255
    c.circle(CX, CY, r, 255, 140, 50, a * 0.5)
    c.ring(CX, CY, r, 3, 255, 200, 80, a * 0.8)
    // 飞溅
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2
      const fx = CX + Math.round(Math.cos(ang) * r * 0.8)
      const fy = CY + Math.round(Math.sin(ang) * r * 0.8)
      c.circle(fx, fy, 2, 255, 180, 60, a)
    }
  }
}

// 12. fx_void: 虚空裂 - 暗紫裂隙 6帧
function drawVoid(c, frame, total) {
  const t = frame / total
  const a = (1 - t * 0.3) * 255
  const w = 2 + t * 14
  // 裂隙
  c.rect(CX - Math.round(w), CY - 2, Math.round(w * 2), 4, 60, 0, 80, a)
  c.rect(CX - Math.round(w/2), CY - 1, Math.round(w), 2, 20, 0, 40, a)
  // 触手
  for (let i = 0; i < 4; i++) {
    const off = (i - 1.5) * (w / 3)
    c.line(CX + Math.round(off), CY, CX + Math.round(off * 1.5), CY + Math.round((i%2?1:-1) * (4 + t*6)), 80, 20, 100, a * 0.7)
  }
  // 中心暗点
  c.circle(CX, CY, Math.round(2 + t*3), 0, 0, 10, a * 0.8)
}

// 13. fx_blood: 血域降 - 深红血域 6帧
function drawBlood(c, frame, total) {
  const t = frame / total
  const r = 4 + t * 20
  const a = (1 - t * 0.3) * 255
  c.circle(CX, CY, Math.round(r), 160, 20, 40, a * 0.3)
  c.ring(CX, CY, Math.round(r), 2, 200, 40, 60, a * 0.8)
  // 血纹
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + t
    const x1 = CX + Math.round(Math.cos(ang) * r * 0.5)
    const y1 = CY + Math.round(Math.sin(ang) * r * 0.5)
    const x2 = CX + Math.round(Math.cos(ang) * r * 0.9)
    const y2 = CY + Math.round(Math.sin(ang) * r * 0.9)
    c.line(x1, y1, x2, y2, 180, 30, 50, a * 0.6)
  }
  // 血滴
  c.circle(CX, CY, 2, 220, 40, 60, a)
}

// 14. fx_pillar: 圣光柱 - 金色光柱 6帧
function drawPillar(c, frame, total) {
  const t = frame / total
  const w = Math.round(3 + t * 10)
  const a = (1 - t * 0.3) * 255
  // 外光晕
  c.rect(CX - w - 2, 0, (w + 2) * 2, H, 255, 230, 120, a * 0.2)
  // 光柱
  c.rect(CX - w, 0, w * 2, H, 255, 230, 140, a * 0.5)
  c.rect(CX - Math.round(w/2), 0, w, H, 255, 240, 180, a * 0.8)
  c.rect(CX - 1, 0, 2, H, 255, 255, 220, a)
  // 底部光圈
  c.ring(CX, H - 4, Math.round(w + 2), 2, 255, 240, 160, a * 0.7)
  // 顶部光圈
  c.ring(CX, 4, Math.round(w + 2), 2, 255, 240, 160, a * 0.7)
}

// 15. fx_frozen: 冰封域 - 冰蓝冻结域 6帧
function drawFrozen(c, frame, total) {
  const t = frame / total
  const r = 4 + t * 18
  const a = (1 - t * 0.3) * 255
  // 冰域底色
  c.circle(CX, CY, Math.round(r), 150, 220, 255, a * 0.2)
  // 冰晶
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2
    const x = CX + Math.round(Math.cos(ang) * r * 0.7)
    const y = CY + Math.round(Math.sin(ang) * r * 0.7)
    c.tri(x, y - 3, x + 2, y + 1, x - 2, y + 1, 200, 240, 255, a * 0.8)
  }
  // 边缘环
  c.ring(CX, CY, Math.round(r), 2, 180, 230, 255, a * 0.6)
  // 中心冰
  c.circle(CX, CY, Math.round(2 + t*2), 220, 250, 255, a * 0.5)
}

// 16. fx_vortex: 元神旋 - 紫白灵力旋涡 8帧
function drawVortex(c, frame, total) {
  const t = frame / total
  const a = (1 - t * 0.2) * 255
  const rot = t * Math.PI * 2
  for (let i = 0; i < 5; i++) {
    const r = 4 + i * 4
    const ang = rot + i * 0.4
    for (let j = 0; j < 8; j++) {
      const a2 = ang + (j / 8) * Math.PI * 2
      const x = CX + Math.round(Math.cos(a2) * r)
      const y = CY + Math.round(Math.sin(a2) * r)
      c.set(x, y, 200, 180, 255, a * (1 - i*0.15))
    }
  }
  // 中心
  c.circle(CX, CY, Math.round(3 + t*4), 230, 220, 255, a * 0.7)
  c.circle(CX, CY, 2, 255, 255, 255, a)
}

// 17. fx_orbit: 剑环舞 - 钢蓝飞剑环绕 8帧
function drawOrbit(c, frame, total) {
  const t = frame / total
  const a = (1 - t * 0.15) * 255
  const rot = t * Math.PI * 2
  const r = 14
  for (let i = 0; i < 4; i++) {
    const ang = rot + (i / 4) * Math.PI * 2
    const x = CX + Math.round(Math.cos(ang) * r)
    const y = CY + Math.round(Math.sin(ang) * r)
    // 小剑
    c.line(x - 2, y - 2, x + 2, y + 2, 160, 200, 255, a)
    c.line(x - 2, y + 2, x + 2, y - 2, 200, 230, 255, a * 0.8)
    c.set(x, y, 255, 255, 255, a)
  }
  // 环形轨迹
  c.ring(CX, CY, r, 1, 100, 160, 220, a * 0.3)
  // 中心
  c.circle(CX, CY, 2, 180, 220, 255, a * 0.5)
}

// 18. fx_poison: 万毒瘴 - 毒绿瘴气 6帧
function drawPoison(c, frame, total) {
  const t = frame / total
  const r = 4 + t * 16
  const a = (1 - t * 0.3) * 255
  // 瘴气云
  for (let i = 0; i < 5; i++) {
    const off = (i - 2) * 4
    c.circle(CX + off, CY + Math.round(Math.sin(i + frame) * 2), Math.round(r * 0.6), 80, 160, 60, a * 0.3)
  }
  // 毒粒子
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + frame
    const x = CX + Math.round(Math.cos(ang) * r * 0.8)
    const y = CY + Math.round(Math.sin(ang) * r * 0.8)
    c.set(x, y, 100, 200, 50, a * 0.8)
  }
  // 边缘
  c.ring(CX, CY, Math.round(r), 1, 60, 140, 40, a * 0.4)
}

// 19. fx_gravity: 重力渊 - 暗紫引力 6帧
function drawGravity(c, frame, total) {
  const t = frame / total
  const r = 4 + t * 16
  const a = (1 - t * 0.3) * 255
  // 引力旋臂
  for (let i = 0; i < 4; i++) {
    const ang = t * Math.PI * 2 + i * Math.PI / 2
    for (let j = 0; j < 5; j++) {
      const rj = r * (1 - j * 0.15)
      const x = CX + Math.round(Math.cos(ang + j * 0.3) * rj)
      const y = CY + Math.round(Math.sin(ang + j * 0.3) * rj)
      c.set(x, y, 80, 40, 120, a * (1 - j * 0.15))
    }
  }
  // 黑洞中心
  c.circle(CX, CY, Math.round(2 + t*3), 0, 0, 20, a * 0.8)
  c.circle(CX, CY, Math.round(1 + t*2), 0, 0, 0, a)
  // 吸引线
  c.ring(CX, CY, Math.round(r), 1, 60, 30, 100, a * 0.3)
}

// 20. fx_phoenix: 凤凰涅 - 火凤重生 8帧
function drawPhoenix(c, frame, total) {
  const t = frame / total
  const a = (1 - t * 0.2) * 255
  if (t < 0.4) {
    // 凤凰展开
    const ex = t / 0.4
    const r = 2 + ex * 12
    // 身体
    c.circle(CX, CY, Math.round(r), 255, 100, 30, a * 0.7)
    c.circle(CX, CY, Math.round(r * 0.6), 255, 160, 50, a)
    // 翅膀
    for (let i = 0; i < 5; i++) {
      const ang = -0.6 + i * 0.3
      const wx = CX + Math.round(Math.cos(ang) * r * 1.2)
      const wy = CY + Math.round(Math.sin(ang) * r * 1.2)
      c.line(CX, CY, wx, wy, 255, 140, 40, a * 0.8)
    }
  } else {
    // 爆发
    const ex = (t - 0.4) / 0.6
    const r = Math.round(ex * 22)
    c.circle(CX, CY, r, 255, 100, 30, a * 0.3)
    c.ring(CX, CY, r, 3, 255, 160, 50, a * 0.6)
    // 火焰散射
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2
      const fx = CX + Math.round(Math.cos(ang) * r * 0.7)
      const fy = CY + Math.round(Math.sin(ang) * r * 0.7)
      c.circle(fx, fy, 2, 255, 200, 80, a * 0.8)
    }
    // 凤凰中心
    c.circle(CX, CY, Math.round(3 + (1-ex) * 4), 255, 200, 80, a)
  }
}

// ---------- 生成注册表 ----------
const EFFECTS = [
  { prefix: 'fx_shadow',   frames: 6, draw: drawShadow,   attackMode: 'shadow_blade',   artMode: null },
  { prefix: 'fx_chain',    frames: 6, draw: drawChain,    attackMode: 'spirit_chain',    artMode: null },
  { prefix: 'fx_wind',      frames: 6, draw: drawWind,     attackMode: 'wind_slash',      artMode: null },
  { prefix: 'fx_spike',     frames: 6, draw: drawSpike,    attackMode: 'stone_spike',     artMode: null },
  { prefix: 'fx_scythe',   frames: 6, draw: drawScythe,   attackMode: 'blood_scythe',    artMode: null },
  { prefix: 'fx_star',     frames: 6, draw: drawStar,     attackMode: 'star_barrage',    artMode: null },
  { prefix: 'fx_claw',      frames: 6, draw: drawClaw,     attackMode: 'venom_claw',      artMode: null },
  { prefix: 'fx_light',    frames: 4, draw: drawLight,    attackMode: 'light_beam',      artMode: null },
  { prefix: 'fx_soul',     frames: 6, draw: drawSoul,     attackMode: 'soul_flame',      artMode: null },
  { prefix: 'fx_crystal',   frames: 6, draw: drawCrystal,  attackMode: 'crystal_shard',  artMode: null },
  { prefix: 'fx_meteor',   frames: 8, draw: drawMeteor,   attackMode: null, artMode: 'meteor_storm' },
  { prefix: 'fx_void',     frames: 6, draw: drawVoid,     attackMode: null, artMode: 'void_rift' },
  { prefix: 'fx_blood',    frames: 6, draw: drawBlood,    attackMode: null, artMode: 'blood_domain' },
  { prefix: 'fx_pillar',   frames: 6, draw: drawPillar,   attackMode: null, artMode: 'light_pillar' },
  { prefix: 'fx_frozen',   frames: 6, draw: drawFrozen,   attackMode: null, artMode: 'frozen_domain' },
  { prefix: 'fx_vortex',   frames: 8, draw: drawVortex,   attackMode: null, artMode: 'spirit_vortex' },
  { prefix: 'fx_orbit',    frames: 8, draw: drawOrbit,    attackMode: null, artMode: 'blade_orbit' },
  { prefix: 'fx_poison',  frames: 6, draw: drawPoison,    attackMode: null, artMode: 'poison_cloud' },
  { prefix: 'fx_gravity', frames: 6, draw: drawGravity,   attackMode: null, artMode: 'gravity_crush' },
  { prefix: 'fx_phoenix', frames: 8, draw: drawPhoenix,   attackMode: null, artMode: 'phoenix_rebirth' },
]

// ---------- 生成 ----------
let total = 0
for (const fx of EFFECTS) {
  for (let i = 1; i <= fx.frames; i++) {
    const c = createCanvas(W, H)
    fx.draw(c, i - 1, fx.frames)
    const path = join(outDir, `${fx.prefix}_${i}.png`)
    writePng(path, W, H, c.px())
    total++
  }
  console.log(`  ✓ ${fx.prefix}: ${fx.frames} frames`)
}

console.log(`\nTotal: ${total} PNG files generated`)

// Export effect metadata for downstream use
export { EFFECTS }
