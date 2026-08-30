// ---------- v4 全量 PNG 资产生成器（v2：像素风特效升级版） ----------
// 从 v4-kits.json 读取全部 30 套定义
// 生成 4 图标 + 14 普攻帧 + 20 神通帧 = 38 PNG/Kit × 30 = 1140 PNG
// v2 特性：多层渐变 / 发光晕 / 抗锯齿 / 粒子特效 / 每原语专属视觉
// 使用纯 Node.js（zlib 编码），不依赖外部库
// 命名：v4/{kit}_{channel}_{phase}_{n}.png（channel: atk/art/icon）

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'sprites', 'v4')
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
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // color type RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const raw = Buffer.allocUnsafe(h * (1 + w * 4))
  let off = 0
  for (let y = 0; y < h; y++) {
    raw[off++] = 0 // filter: none
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

// ---------- 高级像素画布（抗锯齿 + alpha 混合 + 渐变） ----------

function createCanvas(w, h) {
  const px = new Uint8ClampedArray(w * h * 4)

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

  // 源 over 混合（标准 alpha 合成）
  function blendPixel(x, y, r, g, b, a) {
    if (a <= 0) return
    if (x < 0 || x >= w || y < 0 || y >= h) return
    const i = (y * w + x) * 4
    if (a >= 255) {
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
      return
    }
    const srcA = a / 255
    const dstA = px[i + 3] / 255
    const outA = srcA + dstA * (1 - srcA)
    if (outA <= 0) return
    px[i] = Math.round((r * srcA + px[i] * dstA * (1 - srcA)) / outA)
    px[i + 1] = Math.round((g * srcA + px[i + 1] * dstA * (1 - srcA)) / outA)
    px[i + 2] = Math.round((b * srcA + px[i + 2] * dstA * (1 - srcA)) / outA)
    px[i + 3] = Math.round(outA * 255)
  }

  // 抗锯齿圆（用距离场计算 alpha）
  function aaCircle(cx, cy, radius, r, g, b, alpha = 255) {
    const x0 = Math.max(0, Math.floor(cx - radius - 2))
    const x1 = Math.min(w - 1, Math.ceil(cx + radius + 2))
    const y0 = Math.max(0, Math.floor(cy - radius - 2))
    const y1 = Math.min(h - 1, Math.ceil(cy + radius + 2))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        // 边缘 1.5px 抗锯齿过渡
        const edgeWidth = 1.5
        let a
        if (dist <= radius - edgeWidth / 2) {
          a = alpha
        } else if (dist < radius + edgeWidth / 2) {
          const t = (dist - (radius - edgeWidth / 2)) / edgeWidth
          a = Math.round(alpha * (1 - t))
        } else {
          continue
        }
        blendPixel(x, y, r, g, b, a)
      }
    }
  }

  // 抗锯齿环（内外都有抗锯齿边缘）
  function aaRing(cx, cy, radOuter, radInner, r, g, b, alpha = 255) {
    const x0 = Math.max(0, Math.floor(cx - radOuter - 2))
    const x1 = Math.min(w - 1, Math.ceil(cx + radOuter + 2))
    const y0 = Math.max(0, Math.floor(cy - radOuter - 2))
    const y1 = Math.min(h - 1, Math.ceil(cy + radOuter + 2))
    const edgeW = 1.5
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        // 外边缘
        let outerA
        if (dist <= radOuter - edgeW / 2) outerA = 1
        else if (dist < radOuter + edgeW / 2) {
          const t = (dist - (radOuter - edgeW / 2)) / edgeW
          outerA = 1 - t
        } else continue
        // 内边缘（减去内圆）
        let innerA = 1
        if (dist <= radInner - edgeW / 2) innerA = 0
        else if (dist < radInner + edgeW / 2) {
          const t = (dist - (radInner - edgeW / 2)) / edgeW
          innerA = t
        }
        const a = Math.round(alpha * outerA * innerA)
        if (a > 0) blendPixel(x, y, r, g, b, a)
      }
    }
  }

  // 抗锯齿线段
  function aaLine(x0, y0, x1, y1, thickness, r, g, b, alpha = 255) {
    const dx = x1 - x0, dy = y1 - y0
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 0.001) return
    const steps = Math.ceil(len * 1.5)
    const halfT = thickness / 2
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const cx = x0 + dx * t
      const cy = y0 + dy * t
      aaCircle(cx, cy, halfT, r, g, b, alpha)
    }
  }

  // 径向渐变填充（中心亮 → 边缘暗）
  function radialGlow(cx, cy, radius, r, g, b, coreAlpha = 255, edgeAlpha = 0) {
    const x0 = Math.max(0, Math.floor(cx - radius))
    const x1 = Math.min(w - 1, Math.ceil(cx + radius))
    const y0 = Math.max(0, Math.floor(cy - radius))
    const y1 = Math.min(h - 1, Math.ceil(cy + radius))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > radius) continue
        const t = dist / radius
        // easeOutQuadratic 曲线，中心更亮
        const eased = 1 - t * t
        const a = Math.round(edgeAlpha + (coreAlpha - edgeAlpha) * eased)
        if (a > 0) blendPixel(x, y, r, g, b, a)
      }
    }
  }

  // 矩形（带抗锯齿边）
  function aaRect(x, y, rw, rh, r, g, b, alpha = 255) {
    const x0 = Math.floor(x - rw / 2)
    const x1 = Math.ceil(x + rw / 2)
    const y0 = Math.floor(y - rh / 2)
    const y1 = Math.ceil(y + rh / 2)
    for (let py = y0; py <= y1; py++) {
      for (let px2 = x0; px2 <= x1; px2++) {
        if (px2 < 0 || px2 >= w || py < 0 || py >= h) continue
        // 简单抗锯齿：边缘 1px 渐变
        let a = alpha
        const dx = Math.min(px2 - (x - rw / 2), (x + rw / 2) - px2)
        const dy = Math.min(py - (y - rh / 2), (y + rh / 2) - py)
        const edgeDist = Math.min(dx, dy)
        if (edgeDist < 0) continue
        if (edgeDist < 1) a = Math.round(alpha * edgeDist)
        if (a > 0) blendPixel(px2, py, r, g, b, a)
      }
    }
  }

  // 尖刺/能量爆发（从中心向外放射的尖刺）
  function energyBurst(cx, cy, radius, spikeCount, r, g, b, alpha = 255, rotation = 0) {
    for (let i = 0; i < spikeCount; i++) {
      const angle = rotation + (i / spikeCount) * Math.PI * 2
      const tipX = cx + Math.cos(angle) * radius
      const tipY = cy + Math.sin(angle) * radius
      const baseAngle = angle + Math.PI / 2
      const baseW = radius * 0.15
      const bx1 = cx + Math.cos(baseAngle) * baseW
      const by1 = cy + Math.sin(baseAngle) * baseW
      const bx2 = cx - Math.cos(baseAngle) * baseW
      const by2 = cy - Math.sin(baseAngle) * baseW
      // 用三条线模拟三角形尖刺
      aaLine(bx1, by1, tipX, tipY, 1.5, r, g, b, alpha)
      aaLine(bx2, by2, tipX, tipY, 1.5, r, g, b, alpha)
      aaLine(bx1, by1, bx2, by2, 1.5, r, g, b, Math.round(alpha * 0.5))
    }
  }

  // 粒子点
  function particles(cx, cy, count, radius, r, g, b, alpha = 200, seed = 0) {
    // 简单伪随机
    let s = seed * 9301 + 49297
    const rand = () => {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    }
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2
      const dist = rand() * radius
      const px2 = cx + Math.cos(angle) * dist
      const py2 = cy + Math.sin(angle) * dist
      const size = 1 + rand() * 1.5
      aaCircle(px2, py2, size, r, g, b, Math.round(alpha * (0.5 + rand() * 0.5)))
    }
  }

  // 旋转（绕中心旋转画布坐标，用变换后的坐标绘制）
  function rotatePoint(x, y, cx, cy, angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const dx = x - cx, dy = y - cy
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  }

  return {
    w, h, px,
    blendPixel,
    aaCircle,
    aaRing,
    aaLine,
    radialGlow,
    aaRect,
    energyBurst,
    particles,
    rotatePoint,
    clear(r = 0, g = 0, b = 0, a = 0) {
      for (let i = 0; i < px.length; i += 4) {
        px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a
      }
    },
    fillBg(r, g, b) {
      for (let i = 0; i < px.length; i += 4) {
        px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
      }
    },
  }
}

// ---------- 颜色工具 ----------

function lerpColor(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ]
}

function brighten([r, g, b], factor) {
  return [
    Math.min(255, Math.round(r * factor)),
    Math.min(255, Math.round(g * factor)),
    Math.min(255, Math.round(b * factor)),
  ]
}

function darken([r, g, b], factor) {
  return [
    Math.round(r * factor),
    Math.round(g * factor),
    Math.round(b * factor),
  ]
}

// 颜色分层：阴影色 / 基色 / 高光色 / 核心白
function colorLayers(baseColor) {
  return {
    shadow: darken(baseColor, 0.35),
    dark: darken(baseColor, 0.6),
    base: baseColor,
    light: brighten(baseColor, 1.3),
    highlight: brighten(baseColor, 1.6),
    core: [255, 255, 255],
  }
}

// ---------- 元素颜色 ----------

const ELEMENT_COLORS = {
  '雷': [79, 195, 247],
  '风': [129, 199, 132],
  '金': [255, 213, 79],
  '水': [100, 181, 246],
  '火': [255, 138, 101],
  '毒': [186, 104, 200],
  '土': [161, 136, 127],
}

// ---------- v4 Kit 数据 ----------

const v4KitsPath = join(here, '..', 'src', 'data', 'v4-kits.json')
const KITS = JSON.parse(readFileSync(v4KitsPath, 'utf8'))

const PHASE_BRIGHTNESS = { start: 0.55, main: 1.0, mid: 0.75 }

// ---------- 8 种原语的专属视觉绘制 ----------

function drawBoomerang(canvas, color, progress, intensity = 1) {
  const { w, h } = canvas
  const cx = w / 2, cy = h / 2
  const layers = colorLayers(color)
  const baseRadius = Math.min(w, h) * 0.32 * (0.6 + progress * 0.4) * intensity

  // 外层光晕
  canvas.radialGlow(cx, cy, baseRadius * 1.4, ...layers.dark, 0, Math.round(80 * intensity))

  // 外环（深色描边）
  canvas.aaRing(cx, cy, baseRadius + 2, baseRadius - 3, ...layers.shadow, Math.round(200 * intensity))
  // 中环（基色）
  canvas.aaRing(cx, cy, baseRadius, baseRadius - 5, ...layers.base, Math.round(230 * intensity))
  // 内环（高光）
  canvas.aaRing(cx, cy, baseRadius - 3, baseRadius - 6, ...layers.light, Math.round(180 * intensity))

  // 旋转的刃口（4 个突出的刀翼）
  const rotation = progress * Math.PI * 1.5
  const bladeCount = 4
  for (let i = 0; i < bladeCount; i++) {
    const angle = rotation + (i / bladeCount) * Math.PI * 2
    const innerR = baseRadius - 4
    const outerR = baseRadius + 6 + progress * 4
    const bx = cx + Math.cos(angle) * (innerR + outerR) / 2
    const by = cy + Math.sin(angle) * (innerR + outerR) / 2
    const perp = angle + Math.PI / 2
    canvas.aaLine(
      cx + Math.cos(perp) * 2 + Math.cos(angle) * innerR,
      cy + Math.sin(perp) * 2 + Math.sin(angle) * innerR,
      cx + Math.cos(angle) * outerR,
      cy + Math.sin(angle) * outerR,
      3, ...layers.light, Math.round(220 * intensity),
    )
    // 刃尖高光
    canvas.aaCircle(
      cx + Math.cos(angle) * outerR,
      cy + Math.sin(angle) * outerR,
      2, ...layers.highlight, Math.round(200 * intensity),
    )
  }

  // 能量粒子
  canvas.particles(cx, cy, 6 + Math.floor(progress * 6), baseRadius * 0.8, ...layers.highlight, Math.round(150 * intensity), progress * 100)
}

function drawRoundtrip(canvas, color, progress, intensity = 1) {
  const { w, h } = canvas
  const cx = w / 2, cy = h / 2
  const layers = colorLayers(color)
  const dist = progress * w * 0.35 * intensity

  // 去程弹体
  const outX = cx + dist
  // 外层光晕
  canvas.radialGlow(outX, cy, 14, ...layers.dark, 0, Math.round(100 * intensity))
  // 弹体核心
  canvas.aaCircle(outX, cy, 7, ...layers.base, Math.round(240 * intensity))
  canvas.aaCircle(outX, cy, 4, ...layers.light, Math.round(220 * intensity))
  canvas.aaCircle(outX, cy, 2, ...layers.core, Math.round(200 * intensity))

  // 尾迹
  for (let i = 0; i < 5; i++) {
    const t = i / 5
    const tx = outX - t * dist * 0.6
    const tr = 5 - t * 3
    const ta = Math.round(150 * (1 - t) * intensity)
    canvas.aaCircle(tx, cy, tr, ...layers.light, ta)
  }

  // 返程残影（后半段出现）
  if (progress > 0.4) {
    const returnProgress = (progress - 0.4) / 0.6
    const retX = cx - returnProgress * dist * 0.5
    canvas.radialGlow(retX, cy, 10, ...layers.dark, 0, Math.round(60 * intensity))
    canvas.aaCircle(retX, cy, 5, ...layers.base, Math.round(180 * intensity))
    canvas.aaCircle(retX, cy, 2.5, ...layers.highlight, Math.round(160 * intensity))
    // 返程尾迹
    for (let i = 0; i < 3; i++) {
      const t = i / 3
      const tx = retX + t * returnProgress * dist * 0.4
      const tr = 3.5 - t * 2
      const ta = Math.round(100 * (1 - t) * intensity)
      canvas.aaCircle(tx, cy, tr, ...layers.light, ta)
    }
  }

  // 中心爆发点（起始）
  if (progress < 0.3) {
    const burstAlpha = Math.round(200 * (1 - progress / 0.3) * intensity)
    canvas.energyBurst(cx, cy, 10 + progress * 5, 8, ...layers.highlight, burstAlpha, progress * 2)
  }
}

function drawRefract(canvas, color, progress, intensity = 1) {
  const { w, h } = canvas
  const cx = w / 2, cy = h / 2
  const layers = colorLayers(color)

  // 起点能量球
  canvas.radialGlow(cx, cy, 12, ...layers.dark, 0, Math.round(80 * intensity))
  canvas.aaCircle(cx, cy, 6, ...layers.base, Math.round(220 * intensity))
  canvas.aaCircle(cx, cy, 3, ...layers.core, Math.round(200 * intensity))

  // 折光线条数（随进度增加）
  const maxBounces = 4
  const activeBounces = Math.min(maxBounces, 1 + Math.floor(progress * maxBounces))
  const angleSpread = 0.6

  let prevX = cx, prevY = cy
  const segs = []
  for (let i = 0; i < activeBounces; i++) {
    const segLen = (w * 0.15 + Math.random() * w * 0.05) * intensity
    const baseAngle = (i === 0 ? -0.3 : (i % 2 === 0 ? -1 : 1) * angleSpread)
    const angle = baseAngle + (i * 0.15)
    const nextX = prevX + Math.cos(angle) * segLen
    const nextY = prevY + Math.sin(angle) * segLen
    segs.push({ x1: prevX, y1: prevY, x2: nextX, y2: nextY })
    prevX = nextX
    prevY = nextY
  }

  // 绘制折光线（外层粗暗 + 内层细亮）
  for (const seg of segs) {
    canvas.aaLine(seg.x1, seg.y1, seg.x2, seg.y2, 3.5, ...layers.shadow, Math.round(120 * intensity))
    canvas.aaLine(seg.x1, seg.y1, seg.x2, seg.y2, 2, ...layers.base, Math.round(220 * intensity))
    canvas.aaLine(seg.x1, seg.y1, seg.x2, seg.y2, 0.8, ...layers.core, Math.round(180 * intensity))
  }

  // 折光点（能量球）
  for (const seg of segs) {
    canvas.aaCircle(seg.x2, seg.y2, 4, ...layers.base, Math.round(200 * intensity))
    canvas.aaCircle(seg.x2, seg.y2, 2, ...layers.core, Math.round(180 * intensity))
  }

  // 电弧粒子
  canvas.particles(cx + w * 0.1, cy - h * 0.1, 8, w * 0.2, ...layers.highlight, Math.round(120 * intensity), progress * 200)
}

function drawMark(canvas, color, progress, intensity = 1) {
  const { w, h } = canvas
  const cx = w / 2, cy = h / 2
  const layers = colorLayers(color)
  const radius = Math.min(w, h) * 0.28 * intensity

  // 扩散环（标记生效时的扩散波）
  const ringProgress = progress % 1
  const ringR = radius * (0.3 + ringProgress * 0.8)
  const ringA = Math.round(180 * (1 - ringProgress) * intensity)
  canvas.aaRing(cx, cy, ringR, ringR - 2, ...layers.light, ringA)

  // 十字瞄准线
  const crossSize = radius * 0.6
  canvas.aaLine(cx - crossSize, cy, cx - crossSize * 0.3, cy, 2.5, ...layers.shadow, Math.round(200 * intensity))
  canvas.aaLine(cx + crossSize * 0.3, cy, cx + crossSize, cy, 2.5, ...layers.shadow, Math.round(200 * intensity))
  canvas.aaLine(cx, cy - crossSize, cx, cy - crossSize * 0.3, 2.5, ...layers.shadow, Math.round(200 * intensity))
  canvas.aaLine(cx, cy + crossSize * 0.3, cx, cy + crossSize, 2.5, ...layers.shadow, Math.round(200 * intensity))

  canvas.aaLine(cx - crossSize * 0.9, cy, cx - crossSize * 0.35, cy, 1.5, ...layers.base, Math.round(230 * intensity))
  canvas.aaLine(cx + crossSize * 0.35, cy, cx + crossSize * 0.9, cy, 1.5, ...layers.base, Math.round(230 * intensity))
  canvas.aaLine(cx, cy - crossSize * 0.9, cx, cy - crossSize * 0.35, 1.5, ...layers.base, Math.round(230 * intensity))
  canvas.aaLine(cx, cy + crossSize * 0.35, cx, cy + crossSize * 0.9, 1.5, ...layers.base, Math.round(230 * intensity))

  // 中心标记核心（脉动）
  const pulse = 0.8 + Math.sin(progress * Math.PI * 4) * 0.2
  canvas.radialGlow(cx, cy, radius * 0.35 * pulse, ...layers.dark, 0, Math.round(100 * intensity))
  canvas.aaCircle(cx, cy, 6 * pulse, ...layers.base, Math.round(240 * intensity))
  canvas.aaCircle(cx, cy, 3.5 * pulse, ...layers.light, Math.round(220 * intensity))
  canvas.aaCircle(cx, cy, 1.5 * pulse, ...layers.core, Math.round(200 * intensity))

  // 四角装饰点
  const cornerR = radius * 0.7
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const px2 = cx + Math.cos(angle) * cornerR
    const py2 = cy + Math.sin(angle) * cornerR
    canvas.aaCircle(px2, py2, 2, ...layers.highlight, Math.round(180 * intensity))
  }
}

function drawFixedpoint(canvas, color, progress, intensity = 1) {
  const { w, h } = canvas
  const cx = w / 2, cy = h / 2
  const layers = colorLayers(color)
  const radius = Math.min(w, h) * 0.3 * (0.4 + progress * 0.6) * intensity

  // 冲击爆发
  if (progress < 0.5) {
    // 上升阶段：从中心爆发
    const t = progress / 0.5
    // 放射光芒
    canvas.energyBurst(cx, cy, radius * 1.2, 12, ...layers.highlight, Math.round(200 * t * intensity), progress * 3)
    // 核心
    canvas.radialGlow(cx, cy, radius * 0.6, ...layers.light, Math.round(255 * intensity), Math.round(50 * intensity))
    canvas.aaCircle(cx, cy, radius * 0.3, ...layers.base, Math.round(240 * intensity))
    canvas.aaCircle(cx, cy, radius * 0.15, ...layers.core, Math.round(220 * intensity))
  } else {
    // 下降阶段：扩散冲击环
    const t = (progress - 0.5) / 0.5
    // 冲击环
    const ringR = radius * (0.5 + t * 0.8)
    const ringA = Math.round(200 * (1 - t) * intensity)
    canvas.aaRing(cx, cy, ringR, ringR - 3, ...layers.base, ringA)
    canvas.aaRing(cx, cy, ringR + 3, ringR + 1, ...layers.light, Math.round(ringA * 0.6))

    // 十字冲击
    const armLen = radius * (0.6 + t * 0.6)
    const armA = Math.round(180 * (1 - t * 0.7) * intensity)
    canvas.aaLine(cx - armLen, cy, cx + armLen, cy, 2, ...layers.base, armA)
    canvas.aaLine(cx, cy - armLen, cx, cy + armLen, 2, ...layers.base, armA)

    // 残留核心
    canvas.aaCircle(cx, cy, radius * 0.2 * (1 - t * 0.5), ...layers.base, Math.round(150 * (1 - t) * intensity))
  }

  // 飞溅粒子
  const particleCount = progress < 0.3 ? Math.floor(progress / 0.3 * 12) : Math.floor(12 * (1 - (progress - 0.3) / 0.7))
  canvas.particles(cx, cy, particleCount, radius * 0.9, ...layers.highlight, Math.round(140 * intensity), progress * 150)
}

function drawThundernet(canvas, color, progress, intensity = 1) {
  const { w, h } = canvas
  const cx = w / 2, cy = h / 2
  const layers = colorLayers(color)
  const radius = Math.min(w, h) * 0.38 * intensity

  // 电网范围（圆形域）
  canvas.radialGlow(cx, cy, radius, ...layers.dark, 0, Math.round(60 * intensity))

  // 网格线（横竖交错，带闪烁）
  const gridCount = 8
  const cellSize = (radius * 2) / gridCount
  const flicker = 0.7 + Math.sin(progress * Math.PI * 8) * 0.3

  for (let i = 0; i <= gridCount; i++) {
    const offset = -radius + i * cellSize
    // 横线
    const lineAlpha = Math.round(120 * flicker * intensity)
    canvas.aaLine(cx - radius, cy + offset, cx + radius, cy + offset, 0.8, ...layers.base, lineAlpha)
    // 竖线
    canvas.aaLine(cx + offset, cy - radius, cx + offset, cy + radius, 0.8, ...layers.base, lineAlpha)
  }

  // 网格节点电弧
  const nodeCount = 5
  for (let i = 0; i < nodeCount; i++) {
    const seed = i + Math.floor(progress * 10)
    let s = seed * 9301 + 49297
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
    const nx = cx + (rand() - 0.5) * radius * 1.6
    const ny = cy + (rand() - 0.5) * radius * 1.6
    // 只绘制在圆内的节点
    const dist = Math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2)
    if (dist < radius) {
      canvas.aaCircle(nx, ny, 1.5 + rand() * 1.5, ...layers.highlight, Math.round(180 * intensity))
    }
  }

  // 外边界环
  canvas.aaRing(cx, cy, radius, radius - 2, ...layers.base, Math.round(150 * flicker * intensity))
  canvas.aaRing(cx, cy, radius + 2, radius, ...layers.light, Math.round(80 * flicker * intensity))

  // 随机电弧
  if (progress > 0) {
    const arcCount = 2 + Math.floor(progress * 4)
    for (let i = 0; i < arcCount; i++) {
      const seed = i + Math.floor(progress * 20)
      let s = seed * 7919 + 104729
      const rand = () => { s = (s * 7919 + 104729) % 233280; return s / 233280 }
      const ax1 = cx + (rand() - 0.5) * radius * 1.2
      const ay1 = cy + (rand() - 0.5) * radius * 1.2
      const ax2 = cx + (rand() - 0.5) * radius * 1.2
      const ay2 = cy + (rand() - 0.5) * radius * 1.2
      const d1 = Math.sqrt((ax1 - cx) ** 2 + (ay1 - cy) ** 2)
      const d2 = Math.sqrt((ax2 - cx) ** 2 + (ay2 - cy) ** 2)
      if (d1 < radius && d2 < radius) {
        canvas.aaLine(ax1, ay1, ax2, ay2, 1, ...layers.highlight, Math.round(200 * intensity))
      }
    }
  }
}

function drawThunderstake(canvas, color, progress, intensity = 1) {
  const { w, h } = canvas
  const cx = w / 2, cy = h / 2
  const layers = colorLayers(color)
  const stakeHeight = h * 0.55 * (0.5 + progress * 0.5) * intensity
  const stakeWidth = 8 * intensity

  // 地面冲击圈
  const impactR = Math.min(w, h) * 0.35 * (0.3 + progress * 0.7) * intensity
  canvas.radialGlow(cx, cy + stakeHeight * 0.4, impactR, ...layers.dark, 0, Math.round(50 * intensity))
  canvas.aaRing(cx, cy + stakeHeight * 0.4, impactR, impactR - 3, ...layers.shadow, Math.round(120 * intensity))
  canvas.aaRing(cx, cy + stakeHeight * 0.4, impactR * 0.7, impactR * 0.7 - 2, ...layers.base, Math.round(100 * intensity))

  // 雷桩主体（从上方插入）
  const topY = cy - stakeHeight * 0.5
  const bottomY = cy + stakeHeight * 0.4

  // 外层光晕
  canvas.aaRect(cx, (topY + bottomY) / 2, stakeWidth + 8, bottomY - topY, ...layers.dark, Math.round(60 * intensity))
  // 桩身（深色描边 + 基色 + 高光）
  canvas.aaRect(cx, (topY + bottomY) / 2, stakeWidth, bottomY - topY, ...layers.shadow, Math.round(220 * intensity))
  canvas.aaRect(cx, (topY + bottomY) / 2, stakeWidth - 2, bottomY - topY, ...layers.base, Math.round(240 * intensity))
  canvas.aaRect(cx - 1, (topY + bottomY) / 2, stakeWidth * 0.3, bottomY - topY, ...layers.light, Math.round(200 * intensity))

  // 桩头（尖锐顶部）
  const tipW = stakeWidth * 0.8
  canvas.aaLine(cx - tipW / 2, topY + 4, cx, topY - 6, 2, ...layers.shadow, Math.round(220 * intensity))
  canvas.aaLine(cx + tipW / 2, topY + 4, cx, topY - 6, 2, ...layers.shadow, Math.round(220 * intensity))
  canvas.aaLine(cx - tipW / 2 + 1, topY + 4, cx, topY - 6, 1, ...layers.base, Math.round(240 * intensity))
  canvas.aaLine(cx + tipW / 2 - 1, topY + 4, cx, topY - 6, 1, ...layers.base, Math.round(240 * intensity))
  canvas.aaCircle(cx, topY - 6, 2, ...layers.highlight, Math.round(200 * intensity))

  // 横向能量环（3 道）
  for (let i = 0; i < 3; i++) {
    const ringY = topY + (bottomY - topY) * (0.25 + i * 0.25)
    const ringW = stakeWidth + 8 + Math.sin(progress * Math.PI * 2 + i) * 3
    canvas.aaRing(cx, ringY, ringW / 2, ringW / 2 - 1.5, ...layers.light, Math.round(150 * intensity))
  }

  // 底部电弧扩散
  const arcCount = 4 + Math.floor(progress * 4)
  for (let i = 0; i < arcCount; i++) {
    const angle = Math.PI * 0.3 + (i / (arcCount - 1)) * Math.PI * 0.4
    const arcLen = impactR * 0.6 + Math.sin(progress * Math.PI * 3 + i) * 5
    const ax = cx + Math.cos(angle) * arcLen * 0.5
    const ay = bottomY + Math.sin(angle) * arcLen * 0.3
    canvas.aaLine(cx, bottomY, ax, ay, 1, ...layers.highlight, Math.round(180 * intensity))
    canvas.aaCircle(ax, ay, 1.5, ...layers.core, Math.round(160 * intensity))
  }

  // 地面粒子飞溅
  canvas.particles(cx, bottomY + 2, 8, impactR * 0.5, ...layers.highlight, Math.round(130 * intensity), progress * 80)
}

function drawCharge(canvas, color, progress, intensity = 1) {
  const { w, h } = canvas
  const cx = w / 2, cy = h / 2
  const layers = colorLayers(color)
  const maxRadius = Math.min(w, h) * 0.38 * intensity
  const radius = maxRadius * (0.25 + progress * 0.75)

  // 外层能量场（多层环）
  for (let i = 3; i >= 0; i--) {
    const r = radius * (1 + i * 0.35)
    const a = Math.round((60 - i * 15) * intensity)
    canvas.aaRing(cx, cy, r, Math.max(1, r - 2 - i), ...layers.light, a)
  }

  // 旋转粒子环
  const particleRingR = radius * 1.2
  const particleCount = 8 + Math.floor(progress * 8)
  const rotation = progress * Math.PI * 3
  for (let i = 0; i < particleCount; i++) {
    const angle = rotation + (i / particleCount) * Math.PI * 2
    const px2 = cx + Math.cos(angle) * particleRingR
    const py2 = cy + Math.sin(angle) * particleRingR
    const size = 1.5 + (i % 3) * 0.8
    canvas.aaCircle(px2, py2, size, ...layers.highlight, Math.round(180 * intensity))
  }

  // 核心能量球（分层）
  canvas.radialGlow(cx, cy, radius, ...layers.dark, Math.round(120 * intensity), 0)
  canvas.aaCircle(cx, cy, radius * 0.7, ...layers.base, Math.round(200 * intensity))
  canvas.aaCircle(cx, cy, radius * 0.5, ...layers.light, Math.round(220 * intensity))
  canvas.aaCircle(cx, cy, radius * 0.3, ...layers.highlight, Math.round(240 * intensity))
  canvas.aaCircle(cx, cy, radius * 0.12, ...layers.core, Math.round(230 * intensity))

  // 内部能量流动（十字 + 旋转）
  const innerRotation = progress * Math.PI * 4
  const innerR = radius * 0.55
  for (let i = 0; i < 4; i++) {
    const angle = innerRotation + (i / 4) * Math.PI * 2
    const ex = cx + Math.cos(angle) * innerR * 0.6
    const ey = cy + Math.sin(angle) * innerR * 0.6
    canvas.aaLine(cx, cy, ex, ey, 1.5, ...layers.core, Math.round(150 * intensity))
  }

  // 外部放射光线（蓄力峰值时出现）
  if (progress > 0.6) {
    const rayIntensity = (progress - 0.6) / 0.4
    const rayCount = 6 + Math.floor(rayIntensity * 6)
    const rayRotation = progress * Math.PI * 1.5
    for (let i = 0; i < rayCount; i++) {
      const angle = rayRotation + (i / rayCount) * Math.PI * 2
      const innerR2 = radius * 0.9
      const outerR2 = radius * (1.3 + rayIntensity * 0.3)
      const x1 = cx + Math.cos(angle) * innerR2
      const y1 = cy + Math.sin(angle) * innerR2
      const x2 = cx + Math.cos(angle) * outerR2
      const y2 = cy + Math.sin(angle) * outerR2
      canvas.aaLine(x1, y1, x2, y2, 1.5, ...layers.highlight, Math.round(200 * rayIntensity * intensity))
    }
  }

  // 飘散能量粒子
  canvas.particles(cx, cy, 6 + Math.floor(progress * 8), radius * 1.4, ...layers.light, Math.round(120 * intensity), progress * 100)
}

// ---------- 原语分发 ----------

const PRIMITIVE_DRAWERS = {
  boomerang: drawBoomerang,
  roundtrip: drawRoundtrip,
  refract: drawRefract,
  mark: drawMark,
  fixedpoint: drawFixedpoint,
  thundernet: drawThundernet,
  thunderstake: drawThunderstake,
  charge: drawCharge,
}

// ---------- 图标绘制 ----------

function drawIcon(canvas, primitive, color) {
  const { w, h } = canvas
  const cx = w / 2, cy = h / 2
  const layers = colorLayers(color)

  // 深色背景 + 边框
  canvas.fillBg(11, 14, 20)

  // 边框（外暗内亮）
  canvas.aaRect(cx, cy, w - 2, h - 2, ...layers.shadow, 200)
  canvas.aaRect(cx, cy, w - 4, h - 4, ...layers.base, 120)

  // 原语图形（居中）
  const drawer = PRIMITIVE_DRAWERS[primitive] || drawBoomerang
  drawer(canvas, color, 0.5, 0.9)

  // 内边框高光
  canvas.aaRect(cx, cy, w - 4, h - 4, ...layers.highlight, 60)
}

// ---------- 动画帧绘制 ----------

function drawAnimFrame(canvas, primitive, color, phase, frameIdx, frameCount) {
  const progress = frameCount > 1 ? frameIdx / (frameCount - 1) : 0.5

  // 根据阶段调整亮度
  const phaseMult = PHASE_BRIGHTNESS[phase] ?? 1.0
  const adjustedColor = brighten(color, phaseMult * 0.8 + 0.2)

  // 动画进度：根据阶段有不同的曲线
  let animProgress
  if (phase === 'start') {
    // 起始阶段：0 → 0.4，渐入
    animProgress = progress * 0.4
  } else if (phase === 'main') {
    // 主要阶段：0.3 → 1.0，核心动作
    animProgress = 0.3 + progress * 0.7
  } else {
    // 收束阶段：1.0 → 0.5，渐隐
    animProgress = 1.0 - progress * 0.5
  }

  const drawer = PRIMITIVE_DRAWERS[primitive] || drawBoomerang
  drawer(canvas, adjustedColor, animProgress, 1.0)
}

// ---------- 生成 ----------

const ICON_SIZE = 32
const FRAME_SIZE = 64
const FRAME_BUDGET = {
  atk: { start: 4, main: 6, mid: 4 },
  art: { start: 4, main: 8, mid: 8 },
}

let count = 0

for (const kit of KITS) {
  const baseColor = ELEMENT_COLORS[kit.element] ?? [200, 200, 200]

  // Icons (4 × 32px)
  for (let i = 0; i < 4; i++) {
    const canvas = createCanvas(ICON_SIZE, ICON_SIZE)
    drawIcon(canvas, kit.normalPrimitive, baseColor)
    const path = join(outDir, `${kit.kitId}_icon_${i}.png`)
    writePng(path, ICON_SIZE, ICON_SIZE, canvas.px)
    count++
  }

  // Animation frames (atk + art)
  for (const channel of ['atk', 'art']) {
    const primitive = channel === 'atk' ? kit.normalPrimitive : kit.artPrimitive
    const budget = FRAME_BUDGET[channel]

    for (const phase of ['start', 'main', 'mid']) {
      const frameCount = budget[phase]

      for (let i = 0; i < frameCount; i++) {
        const canvas = createCanvas(FRAME_SIZE, FRAME_SIZE)
        drawAnimFrame(canvas, primitive, baseColor, phase, i, frameCount)
        const path = join(outDir, `${kit.kitId}_${channel}_${phase}_${i + 1}.png`)
        writePng(path, FRAME_SIZE, FRAME_SIZE, canvas.px)
        count++
      }
    }
  }
}

console.log(`生成完成：${count} 个 PNG 资产 → ${outDir}`)
console.log(`  图标: ${KITS.length * 4} 个 (${ICON_SIZE}×${ICON_SIZE})`)
console.log(`  动画帧: ${KITS.length * (14 + 20)} 个 (${FRAME_SIZE}×${FRAME_SIZE})`)
console.log(`  Kit: ${KITS.map((k) => k.kitId).join(', ')}`)
console.log(`  版本: v2（多层渐变 / 发光晕 / 抗锯齿 / 粒子特效 / 8 原语专属视觉）`)
