// ---------- 仙界敌人形象生成器 ----------
// 生成仙人/妖兽/灵兽/仙尊Boss的像素风形象
// 每个角色：32x32 PNG，朝下 idle 姿势
// 命名：xian/{id}.png

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'sprites', 'xian')
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
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x*x + y*y <= radius*radius) set(cx + x, cy + y, r, g, b, a)
      }
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
  return { px, w, h, set, rect, circle, line }
}

const S = 32 // sprite size

// ========== 仙人系列 ==========

// 男仙人（道士风格：发髻+道袍+拂尘）
function drawMaleImmortal(palette) {
  const { px, set, rect, circle } = createCanvas(S, S)
  const { skin, robe, robeDark, hair, accent, glow } = palette

  // 身体阴影（地面）
  rect(10, 28, 12, 2, 0, 0, 0, 50)

  // 道袍下摆
  rect(10, 18, 12, 10, robe[0], robe[1], robe[2])
  rect(10, 24, 12, 4, robeDark[0], robeDark[1], robeDark[2])

  // 道袍交领
  rect(13, 14, 6, 6, robe[0], robe[1], robe[2])
  // 白色内衬
  rect(14, 15, 4, 3, 245, 245, 240)

  // 腰带
  rect(10, 17, 12, 2, accent[0], accent[1], accent[2])

  // 袖子
  rect(7, 15, 4, 8, robe[0], robe[1], robe[2])
  rect(21, 15, 4, 8, robe[0], robe[1], robe[2])

  // 手
  rect(7, 21, 3, 2, skin[0], skin[1], skin[2])
  rect(22, 21, 3, 2, skin[0], skin[1], skin[2])

  // 脖子
  rect(14, 12, 4, 2, skin[0], skin[1], skin[2])

  // 脸
  rect(12, 7, 8, 6, skin[0], skin[1], skin[2])
  // 眼睛
  set(14, 9, 40, 40, 60)
  set(17, 9, 40, 40, 60)
  // 眉毛
  set(13, 8, 60, 50, 40)
  set(14, 8, 60, 50, 40)
  set(17, 8, 60, 50, 40)
  set(18, 8, 60, 50, 40)

  // 头发（发髻）
  rect(11, 4, 10, 4, hair[0], hair[1], hair[2])
  rect(13, 2, 6, 3, hair[0], hair[1], hair[2])
  // 发簪
  rect(15, 1, 2, 2, accent[0], accent[1], accent[2])
  // 刘海
  rect(12, 6, 8, 1, hair[0], hair[1], hair[2])

  // 拂尘（右手）
  rect(4, 16, 3, 2, 120, 80, 40) // 柄
  // 拂尘毛
  for (let i = 0; i < 6; i++) {
    set(1 + (i % 3), 14 + Math.floor(i / 3), 240, 240, 230, 200)
    set(2 + (i % 2), 15 + Math.floor(i / 2), 240, 240, 230, 180)
  }

  // 仙气光晕（头部周围）
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const gx = Math.round(16 + Math.cos(angle) * 9)
    const gy = Math.round(8 + Math.sin(angle) * 7)
    set(gx, gy, glow[0], glow[1], glow[2], 80)
  }

  return { px }
}

// 女仙人（仙女风格：长裙+发簪+丝带）
function drawFemaleImmortal(palette) {
  const { px, set, rect, circle } = createCanvas(S, S)
  const { skin, robe, robeDark, hair, accent, glow } = palette

  // 阴影
  rect(10, 28, 12, 2, 0, 0, 0, 50)

  // 长裙下摆（飘逸感）
  rect(9, 19, 14, 9, robe[0], robe[1], robe[2])
  rect(9, 25, 14, 3, robeDark[0], robeDark[1], robeDark[2])
  // 裙摆飘带
  rect(7, 22, 3, 5, robe[0], robe[1], robe[2], 200)
  rect(22, 22, 3, 5, robe[0], robe[1], robe[2], 200)

  // 上衣
  rect(11, 13, 10, 7, robe[0], robe[1], robe[2])
  // 领口
  rect(14, 14, 4, 3, 245, 240, 235)

  // 腰带（宫绦）
  rect(11, 18, 10, 2, accent[0], accent[1], accent[2])
  // 玉佩
  rect(15, 20, 2, 2, accent[0], accent[1], accent[2])

  // 袖子（广袖）
  rect(6, 14, 5, 7, robe[0], robe[1], robe[2])
  rect(21, 14, 5, 7, robe[0], robe[1], robe[2])
  // 袖飘带
  rect(4, 16, 3, 4, robe[0], robe[1], robe[2], 150)
  rect(25, 16, 3, 4, robe[0], robe[1], robe[2], 150)

  // 手
  rect(7, 19, 3, 2, skin[0], skin[1], skin[2])
  rect(22, 19, 3, 2, skin[0], skin[1], skin[2])

  // 脖子
  rect(14, 11, 4, 2, skin[0], skin[1], skin[2])

  // 脸
  rect(12, 6, 8, 6, skin[0], skin[1], skin[2])
  // 眼睛（杏眼）
  set(14, 8, 50, 40, 70)
  set(15, 9, 40, 40, 60)
  set(17, 8, 50, 40, 70)
  set(16, 9, 40, 40, 60)
  // 小嘴
  set(15, 11, 180, 100, 100, 150)
  set(16, 11, 180, 100, 100, 150)

  // 头发（长发）
  rect(11, 3, 10, 4, hair[0], hair[1], hair[2])
  rect(10, 5, 12, 3, hair[0], hair[1], hair[2])
  // 长发垂肩
  rect(9, 7, 2, 8, hair[0], hair[1], hair[2])
  rect(21, 7, 2, 8, hair[0], hair[1], hair[2])
  // 刘海
  rect(12, 5, 8, 1, hair[0], hair[1], hair[2])

  // 发簪
  rect(12, 2, 2, 2, accent[0], accent[1], accent[2])
  rect(18, 2, 2, 2, accent[0], accent[1], accent[2])
  // 头花
  circle(11, 3, 1, accent[0], accent[1], accent[2])
  circle(21, 3, 1, accent[0], accent[1], accent[2])

  // 仙气光晕
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2
    const gx = Math.round(16 + Math.cos(angle) * 10)
    const gy = Math.round(7 + Math.sin(angle) * 8)
    set(gx, gy, glow[0], glow[1], glow[2], 70)
  }

  return { px }
}

// 仙翁（老年男仙：长胡须+龙头杖）
function drawElderImmortal(palette) {
  const { px, set, rect, circle } = createCanvas(S, S)
  const { skin, robe, robeDark, hair, accent, glow } = palette

  rect(10, 28, 12, 2, 0, 0, 0, 50)

  // 道袍（更宽大）
  rect(9, 17, 14, 11, robe[0], robe[1], robe[2])
  rect(9, 25, 14, 3, robeDark[0], robeDark[1], robeDark[2])

  // 宽袖
  rect(6, 16, 4, 9, robe[0], robe[1], robe[2])
  rect(22, 16, 4, 9, robe[0], robe[1], robe[2])

  // 手（拄拐杖）
  rect(6, 22, 3, 2, skin[0], skin[1], skin[2])
  rect(23, 22, 3, 2, skin[0], skin[1], skin[2])

  // 龙头杖
  rect(3, 10, 2, 18, 120, 70, 30) // 杖身
  // 龙头
  rect(2, 7, 4, 4, 180, 150, 60)
  set(2, 6, 180, 150, 60)
  set(5, 6, 180, 150, 60)
  // 龙眼
  set(3, 8, 255, 50, 50)
  set(4, 8, 255, 50, 50)

  // 脖子
  rect(14, 14, 4, 2, skin[0], skin[1], skin[2])

  // 脸（更圆润年长）
  rect(11, 7, 10, 7, skin[0], skin[1], skin[2])
  // 眼睛（眯着笑眼）
  set(13, 10, 60, 50, 40)
  set(14, 10, 60, 50, 40)
  set(17, 10, 60, 50, 40)
  set(18, 10, 60, 50, 40)
  // 皱纹
  set(13, 12, skin[0] - 30, skin[1] - 30, skin[2] - 30, 150)
  set(18, 12, skin[0] - 30, skin[1] - 30, skin[2] - 30, 150)

  // 白头发/胡子
  rect(11, 4, 10, 4, 240, 240, 235)
  rect(13, 2, 6, 3, 240, 240, 235)
  // 长白胡须
  rect(13, 13, 6, 6, 240, 240, 235)
  rect(14, 19, 4, 2, 240, 240, 235, 200)
  // 眉毛
  rect(11, 6, 3, 1, 240, 240, 235)
  rect(18, 6, 3, 1, 240, 240, 235)

  // 发冠
  rect(14, 1, 4, 2, accent[0], accent[1], accent[2])

  // 仙气光晕
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const gx = Math.round(16 + Math.cos(angle) * 11)
    const gy = Math.round(9 + Math.sin(angle) * 9)
    set(gx, gy, glow[0], glow[1], glow[2], 60)
  }

  return { px }
}

// 仙童（少年/女童）
function drawChildImmortal(palette, isGirl = false) {
  const { px, set, rect, circle } = createCanvas(S, S)
  const { skin, robe, robeDark, hair, accent, glow } = palette

  rect(11, 28, 10, 2, 0, 0, 0, 50)

  // 短袍（儿童身形更小）
  rect(11, 17, 10, 10, robe[0], robe[1], robe[2])
  rect(11, 24, 10, 3, robeDark[0], robeDark[1], robeDark[2])

  // 肚兜/领口
  rect(14, 17, 4, 3, 245, 240, 230)

  // 小袖子
  rect(8, 17, 3, 6, robe[0], robe[1], robe[2])
  rect(21, 17, 3, 6, robe[0], robe[1], robe[2])

  // 小手
  rect(8, 21, 2, 2, skin[0], skin[1], skin[2])
  rect(22, 21, 2, 2, skin[0], skin[1], skin[2])

  // 脖子
  rect(14, 14, 4, 2, skin[0], skin[1], skin[2])

  // 脸（圆脸大眼）
  rect(11, 7, 10, 7, skin[0], skin[1], skin[2])
  // 大眼睛
  rect(13, 9, 2, 2, 40, 40, 70)
  rect(17, 9, 2, 2, 40, 40, 70)
  // 眼睛高光
  set(13, 9, 255, 255, 255, 200)
  set(17, 9, 255, 255, 255, 200)
  // 腮红
  set(12, 11, 255, 150, 150, 100)
  set(19, 11, 255, 150, 150, 100)
  // 小嘴
  set(15, 12, 200, 100, 100, 120)

  // 头发
  rect(10, 4, 12, 4, hair[0], hair[1], hair[2])
  rect(11, 3, 10, 2, hair[0], hair[1], hair[2])

  if (isGirl) {
    // 女童：双丫髻
    rect(9, 2, 3, 3, hair[0], hair[1], hair[2])
    rect(20, 2, 3, 3, hair[0], hair[1], hair[2])
    // 红头绳
    rect(9, 4, 2, 1, accent[0], accent[1], accent[2])
    rect(21, 4, 2, 1, accent[0], accent[1], accent[2])
  } else {
    // 男童：总角
    rect(13, 1, 3, 3, hair[0], hair[1], hair[2])
    rect(16, 1, 3, 3, hair[0], hair[1], hair[2])
    // 发带
    rect(13, 3, 6, 1, accent[0], accent[1], accent[2])
  }

  // 刘海
  rect(11, 6, 10, 1, hair[0], hair[1], hair[2])

  // 仙气光晕
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const gx = Math.round(16 + Math.cos(angle) * 9)
    const gy = Math.round(8 + Math.sin(angle) * 7)
    set(gx, gy, glow[0], glow[1], glow[2], 60)
  }

  return { px }
}

// ========== 妖兽/灵兽系列 ==========

// 仙鹤
function drawCraneBeast(palette) {
  const { px, set, rect, circle } = createCanvas(S, S)
  const { skin, robe, robeDark, hair, accent, glow } = palette

  rect(9, 28, 14, 2, 0, 0, 0, 50)

  // 身体（白色羽毛）
  rect(10, 14, 12, 12, 245, 245, 240)
  rect(10, 22, 12, 4, 220, 220, 215)

  // 翅膀（收起状态）
  rect(8, 15, 3, 9, 235, 235, 230)
  rect(21, 15, 3, 9, 235, 235, 230)
  // 翅膀尖黑羽
  rect(7, 20, 2, 4, 50, 50, 55)
  rect(23, 20, 2, 4, 50, 50, 55)

  // 尾羽
  rect(14, 25, 4, 3, 240, 240, 235)
  rect(13, 27, 6, 1, 220, 220, 215, 150)

  // 长腿
  rect(12, 26, 2, 3, 180, 140, 80)
  rect(18, 26, 2, 3, 180, 140, 80)

  // 脖子（S型）
  rect(15, 9, 2, 6, 240, 240, 235)
  rect(14, 7, 3, 3, 240, 240, 235)

  // 头
  rect(13, 4, 5, 4, 245, 245, 240)
  // 丹顶（红冠）
  rect(14, 3, 3, 2, 220, 50, 50)
  // 眼睛
  set(14, 5, 30, 30, 40)
  set(16, 5, 30, 30, 40)
  // 长喙
  rect(11, 5, 3, 1, 200, 150, 60)
  rect(10, 6, 2, 1, 180, 130, 50)

  // 仙光环绕
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + 0.3
    const gx = Math.round(16 + Math.cos(angle) * 11)
    const gy = Math.round(14 + Math.sin(angle) * 10)
    set(gx, gy, glow[0], glow[1], glow[2], 50)
  }

  return { px }
}

// 灵鹿（仙鹿，带鹿角和灵光）
function drawDeerBeast(palette) {
  const { px, set, rect, circle } = createCanvas(S, S)
  const { accent, glow } = palette

  rect(8, 28, 16, 2, 0, 0, 0, 50)

  // 身体（鹿毛色：米黄带仙光）
  rect(10, 15, 12, 10, 210, 185, 140)
  rect(10, 22, 12, 3, 185, 160, 115)
  // 白色腹毛
  rect(12, 21, 8, 3, 240, 235, 220)

  // 梅花斑点
  set(12, 17, 255, 250, 230, 200)
  set(15, 16, 255, 250, 230, 200)
  set(18, 17, 255, 250, 230, 200)
  set(13, 19, 255, 250, 230, 180)
  set(17, 19, 255, 250, 230, 180)

  // 四条腿
  rect(11, 24, 2, 4, 180, 155, 115)
  rect(15, 24, 2, 4, 180, 155, 115)
  rect(18, 24, 2, 4, 180, 155, 115)
  rect(21, 24, 2, 4, 180, 155, 115)

  // 尾巴
  rect(22, 16, 2, 3, 240, 235, 220)

  // 脖子
  rect(8, 10, 4, 7, 210, 185, 140)

  // 头
  rect(5, 6, 6, 5, 210, 185, 140)
  // 口鼻
  rect(4, 8, 2, 2, 190, 165, 120)
  // 眼睛
  set(6, 7, 40, 30, 20)

  // 鹿角（珊瑚状，带灵光）
  // 左角
  rect(6, 2, 1, 4, accent[0], accent[1], accent[2])
  rect(5, 1, 1, 2, accent[0], accent[1], accent[2])
  rect(7, 3, 1, 1, accent[0], accent[1], accent[2])
  // 右角
  rect(9, 2, 1, 4, accent[0], accent[1], accent[2])
  rect(10, 1, 1, 2, accent[0], accent[1], accent[2])
  rect(8, 3, 1, 1, accent[0], accent[1], accent[2])

  // 耳朵
  rect(6, 4, 1, 2, 190, 165, 120)
  rect(9, 4, 1, 2, 190, 165, 120)

  // 灵光粒子（围绕鹿角）
  for (let i = 0; i < 6; i++) {
    const gx = 5 + (i % 3) * 3
    const gy = 0 + Math.floor(i / 3)
    set(gx, gy, glow[0], glow[1], glow[2], 100)
    set(gx + 5, gy, glow[0], glow[1], glow[2], 100)
  }

  return { px }
}

// 貔貅（瑞兽，狮虎身+独角）
function drawPixiuBeast(palette) {
  const { px, set, rect, circle } = createCanvas(S, S)
  const { accent, glow } = palette

  rect(8, 28, 16, 2, 0, 0, 0, 50)

  // 身体（金红色）
  rect(9, 15, 14, 11, 200, 90, 60)
  rect(9, 23, 14, 3, 160, 60, 40)

  // 鳞片纹理
  for (let y = 16; y < 24; y += 2) {
    for (let x = 10; x < 22; x += 3) {
      set(x + (y % 3), y, 230, 130, 80, 100)
    }
  }

  // 四条腿（粗壮）
  rect(10, 25, 3, 3, 170, 70, 45)
  rect(15, 25, 3, 3, 170, 70, 45)
  rect(19, 25, 3, 3, 170, 70, 45)
  rect(22, 25, 2, 3, 170, 70, 45)
  // 爪子
  set(10, 27, 80, 40, 20)
  set(12, 27, 80, 40, 20)
  set(15, 27, 80, 40, 20)
  set(17, 27, 80, 40, 20)
  set(19, 27, 80, 40, 20)
  set(21, 27, 80, 40, 20)

  // 尾巴（狮尾）
  rect(22, 16, 3, 2, 200, 90, 60)
  rect(24, 14, 2, 4, 180, 70, 50)
  // 尾尖毛
  set(25, 13, 240, 200, 100, 200)
  set(25, 17, 240, 200, 100, 200)

  // 头（正面）
  rect(8, 8, 10, 8, 210, 100, 70)
  // 鬃毛
  rect(7, 9, 2, 6, 170, 60, 40)
  rect(17, 9, 2, 6, 170, 60, 40)
  rect(8, 7, 10, 2, 170, 60, 40)

  // 独角（额头中间）
  rect(12, 3, 2, 4, accent[0], accent[1], accent[2])
  rect(11, 2, 4, 2, accent[0], accent[1], accent[2])
  // 角尖发光
  set(12, 1, glow[0], glow[1], glow[2], 200)
  set(13, 1, glow[0], glow[1], glow[2], 200)

  // 眼睛（金色，威严）
  rect(9, 10, 2, 2, 255, 200, 50)
  rect(15, 10, 2, 2, 255, 200, 50)
  set(10, 10, 255, 255, 150, 200)
  set(16, 10, 255, 255, 150, 200)

  // 鼻子/嘴
  rect(11, 13, 6, 2, 150, 50, 30)
  // 獠牙
  set(11, 14, 240, 240, 230, 200)
  set(16, 14, 240, 240, 230, 200)

  // 耳朵
  rect(8, 6, 2, 2, 170, 60, 40)
  rect(16, 6, 2, 2, 170, 60, 40)

  // 灵光
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const gx = Math.round(13 + Math.cos(angle) * 6)
    const gy = Math.round(5 + Math.sin(angle) * 5)
    set(gx, gy, glow[0], glow[1], glow[2], 70)
  }

  return { px }
}

// 凤凰/朱雀（灵鸟，火焰羽毛）
function drawPhoenixBeast(palette) {
  const { px, set, rect, circle } = createCanvas(S, S)
  const { accent, glow } = palette

  rect(9, 28, 14, 2, 0, 0, 0, 50)

  // 身体（朱红色）
  rect(12, 15, 8, 10, 220, 70, 40)
  rect(12, 22, 8, 3, 180, 45, 25)

  // 腹部羽毛（金色）
  rect(13, 18, 6, 4, 255, 180, 60)

  // 翅膀（展开，火焰羽毛）
  // 左翅
  rect(5, 13, 7, 8, 240, 100, 40)
  rect(3, 15, 3, 5, 255, 140, 50, 200)
  rect(2, 17, 2, 3, 255, 180, 80, 150)
  // 右翅
  rect(20, 13, 7, 8, 240, 100, 40)
  rect(26, 15, 3, 5, 255, 140, 50, 200)
  rect(28, 17, 2, 3, 255, 180, 80, 150)

  // 翅膀羽毛纹理
  for (let i = 0; i < 4; i++) {
    rect(5 + i, 14 + i * 2, 1, 2, 255, 200, 80, 120)
    rect(26 - i, 14 + i * 2, 1, 2, 255, 200, 80, 120)
  }

  // 尾羽（长而华丽）
  rect(13, 24, 6, 3, 240, 100, 40)
  rect(11, 26, 2, 2, 255, 150, 60, 180)
  rect(15, 26, 2, 2, 255, 200, 80, 200)
  rect(19, 26, 2, 2, 255, 150, 60, 180)
  rect(10, 27, 1, 1, accent[0], accent[1], accent[2], 150)
  rect(21, 27, 1, 1, accent[0], accent[1], accent[2], 150)

  // 爪子
  rect(13, 25, 2, 2, 180, 120, 40)
  rect(17, 25, 2, 2, 180, 120, 40)

  // 脖子
  rect(14, 11, 4, 5, 230, 80, 50)

  // 头
  rect(13, 6, 6, 6, 240, 90, 50)
  // 羽冠
  rect(14, 3, 4, 3, 255, 180, 60)
  rect(15, 1, 2, 3, 255, 200, 80)
  // 眼睛（金色锐利）
  rect(14, 8, 2, 2, 255, 220, 50)
  set(15, 8, 255, 255, 150, 200)
  // 喙
  rect(18, 8, 3, 2, 255, 160, 40)
  rect(20, 9, 2, 1, 220, 130, 30)

  // 火焰尾迹/灵光
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const gx = Math.round(16 + Math.cos(angle) * 12)
    const gy = Math.round(14 + Math.sin(angle) * 10)
    set(gx, gy, glow[0], glow[1], glow[2], 50)
  }

  return { px }
}

// ========== Boss 系列 ==========

// 仙尊（高级Boss，更华丽的仙人）
function drawImmortalLord(palette) {
  const { px, set, rect, circle } = createCanvas(S, S)
  const { skin, robe, robeDark, hair, accent, glow } = palette

  rect(8, 29, 16, 2, 0, 0, 0, 60)

  // 光环（脑后圆光）
  for (let r = 8; r >= 5; r--) {
    const alpha = r === 5 ? 120 : 40
    for (let a = 0; a < 360; a += 15) {
      const rad = a * Math.PI / 180
      const x = Math.round(16 + Math.cos(rad) * r)
      const y = Math.round(6 + Math.sin(rad) * r * 0.8)
      set(x, y, glow[0], glow[1], glow[2], alpha)
    }
  }

  // 长袍（更华丽，多层）
  rect(8, 16, 16, 13, robe[0], robe[1], robe[2])
  rect(8, 25, 16, 4, robeDark[0], robeDark[1], robeDark[2])

  // 外袍纹饰（金边）
  rect(8, 16, 16, 1, accent[0], accent[1], accent[2], 180)
  rect(8, 24, 16, 1, accent[0], accent[1], accent[2], 180)
  // 胸前符文
  rect(15, 19, 2, 2, accent[0], accent[1], accent[2], 200)
  set(16, 18, accent[0], accent[1], accent[2], 150)
  set(16, 21, accent[0], accent[1], accent[2], 150)

  // 广袖
  rect(4, 16, 5, 10, robe[0], robe[1], robe[2])
  rect(23, 16, 5, 10, robe[0], robe[1], robe[2])
  // 袖边金纹
  rect(4, 16, 1, 10, accent[0], accent[1], accent[2], 150)
  rect(27, 16, 1, 10, accent[0], accent[1], accent[2], 150)

  // 手（结印）
  rect(13, 22, 3, 2, skin[0], skin[1], skin[2])
  rect(16, 22, 3, 2, skin[0], skin[1], skin[2])

  // 脖子
  rect(14, 13, 4, 2, skin[0], skin[1], skin[2])

  // 脸（更威严）
  rect(11, 6, 10, 7, skin[0], skin[1], skin[2])
  // 眼睛（微闭，道骨仙风）
  set(13, 9, 50, 40, 60)
  set(14, 9, 50, 40, 60)
  set(17, 9, 50, 40, 60)
  set(18, 9, 50, 40, 60)
  // 眉间朱砂
  set(15, 7, 220, 50, 50, 180)
  set(16, 7, 220, 50, 50, 180)

  // 头发/冠冕
  rect(10, 3, 12, 4, hair[0], hair[1], hair[2])
  // 帝冠/玉冠
  rect(12, 1, 8, 3, accent[0], accent[1], accent[2])
  rect(13, 0, 6, 2, 255, 240, 180, 200)
  // 冠上宝珠
  circle(16, 1, 1, glow[0], glow[1], glow[2])

  // 胡须
  rect(13, 12, 6, 2, hair[0], hair[1], hair[2], 180)

  // 拂尘（左手持）
  rect(2, 18, 3, 2, 120, 80, 40)
  for (let i = 0; i < 8; i++) {
    set(Math.floor(i / 3), 15 + (i % 3), 250, 250, 240, 150 + i * 10)
  }

  return { px }
}

// ========== 调色板 ==========
const PALETTES = {
  // 散仙（蓝白道袍）
  sanxian: {
    skin: [240, 215, 200],
    robe: [140, 160, 200],
    robeDark: [100, 120, 165],
    hair: [60, 55, 70],
    accent: [255, 215, 100],
    glow: [180, 200, 255],
  },
  // 真仙（金红锦袍）
  zhenxian: {
    skin: [240, 215, 200],
    robe: [200, 70, 60],
    robeDark: [150, 40, 35],
    hair: [55, 45, 60],
    accent: [255, 200, 50],
    glow: [255, 200, 100],
  },
  // 金仙（紫白金纹）
  jinxian: {
    skin: [240, 215, 200],
    robe: [140, 100, 190],
    robeDark: [100, 65, 150],
    hair: [240, 240, 230], // 白发
    accent: [255, 220, 100],
    glow: [220, 180, 255],
  },
  // 女仙（粉白衣裙）
  nvxian: {
    skin: [245, 220, 205],
    robe: [230, 170, 190],
    robeDark: [190, 130, 155],
    hair: [50, 40, 55],
    accent: [255, 200, 220],
    glow: [255, 200, 230],
  },
  // 仙尊（玄金帝袍）
  xianzun: {
    skin: [235, 210, 195],
    robe: [40, 45, 80],
    robeDark: [25, 28, 55],
    hair: [240, 240, 230],
    accent: [255, 200, 50],
    glow: [255, 220, 100],
  },
}

// ========== 批量生成 ==========
const characters = [
  // 仙人系列
  { id: 'xian_sanxian_m', draw: (p) => drawMaleImmortal(p), palette: PALETTES.sanxian, name: '散仙（男）' },
  { id: 'xian_sanxian_f', draw: (p) => drawFemaleImmortal(p), palette: PALETTES.nvxian, name: '散仙（女）' },
  { id: 'xian_zhenxian_m', draw: (p) => drawMaleImmortal(p), palette: PALETTES.zhenxian, name: '真仙（男）' },
  { id: 'xian_zhenxian_f', draw: (p) => drawFemaleImmortal(p), palette: PALETTES.zhenxian, name: '真仙（女）' },
  { id: 'xian_jinxian_m', draw: (p) => drawElderImmortal(p), palette: PALETTES.jinxian, name: '金仙（翁）' },
  { id: 'xian_jinxian_f', draw: (p) => drawFemaleImmortal(p), palette: PALETTES.jinxian, name: '金仙（女）' },
  { id: 'xian_tong_nan', draw: (p) => drawChildImmortal(p, false), palette: PALETTES.sanxian, name: '仙童（男）' },
  { id: 'xian_tong_nv', draw: (p) => drawChildImmortal(p, true), palette: PALETTES.nvxian, name: '仙童（女）' },
  // 妖兽/灵兽系列
  { id: 'beast_crane', draw: (p) => drawCraneBeast(p), palette: PALETTES.sanxian, name: '仙鹤' },
  { id: 'beast_deer', draw: (p) => drawDeerBeast(p), palette: PALETTES.zhenxian, name: '灵鹿' },
  { id: 'beast_pixiu', draw: (p) => drawPixiuBeast(p), palette: PALETTES.zhenxian, name: '貔貅' },
  { id: 'beast_phoenix', draw: (p) => drawPhoenixBeast(p), palette: PALETTES.zhenxian, name: '朱雀' },
  // Boss
  { id: 'boss_xianzun', draw: (p) => drawImmortalLord(p), palette: PALETTES.xianzun, name: '仙尊' },
]

let count = 0
for (const c of characters) {
  const { px } = c.draw(c.palette)
  writePng(join(outDir, `${c.id}.png`), S, S, px)
  count++
}

console.log(`仙界敌人形象生成完成：${count} 个 PNG → ${outDir}`)
