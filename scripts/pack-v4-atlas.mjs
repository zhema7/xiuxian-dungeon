// ---------- v4 Atlas 打包脚本 ----------
// 从 public/sprites/v4/ 读取 270 张目标帧（30 icon + 240 art_main）
// 合成为 30 个 per-kit atlas（192×192, 每套 1 icon + 8 art_main = 9 帧）
// 输出到 public/sprites/v4-atlas/{kitId}_atlas.png + {kitId}_atlas.json
// 请求数 1140 → 30

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', 'public', 'sprites', 'v4')
const outDir = join(here, '..', 'public', 'sprites', 'v4-atlas')
mkdirSync(outDir, { recursive: true })

const ATLAS_SIZE = 192
const FRAME_SIZE = 64
const ICON_SIZE = 32

// ---------- PNG 解码 ----------
function readPng(path) {
  const buf = readFileSync(path)
  if (buf[0] !== 137 || buf[1] !== 80 || buf[2] !== 78 || buf[3] !== 71)
    throw new Error(`Not PNG: ${path}`)

  let w = 0, h = 0, bitDepth = 0, colorType = 0
  const idatChunks = []

  let pos = 8
  while (pos < buf.length) {
    const chunkLen = buf.readUInt32BE(pos)
    const chunkType = buf.toString('ascii', pos + 4, pos + 8)
    const dataStart = pos + 8

    if (chunkType === 'IHDR') {
      w = buf.readUInt32BE(dataStart)
      h = buf.readUInt32BE(dataStart + 4)
      bitDepth = buf[dataStart + 8]
      colorType = buf[dataStart + 9]
    } else if (chunkType === 'IDAT') {
      idatChunks.push(buf.subarray(dataStart, dataStart + chunkLen))
    } else if (chunkType === 'IEND') {
      break
    }
    pos += 12 + chunkLen
  }

  const inflated = inflateSync(Buffer.concat(idatChunks))
  const channels = 4 // RGBA
  const stride = w * channels
  const pixels = new Uint8ClampedArray(w * h * channels)
  let inPos = 0
  const prevRow = new Uint8ClampedArray(stride)

  for (let y = 0; y < h; y++) {
    const filterType = inflated[inPos++]
    const row = new Uint8ClampedArray(stride)

    for (let x = 0; x < stride; x++) {
      const byte = inflated[inPos + x]
      const left = x >= channels ? row[x - channels] : 0
      const up = prevRow[x]
      const upLeft = x >= channels ? prevRow[x - channels] : 0

      switch (filterType) {
        case 0: row[x] = byte; break
        case 1: row[x] = (byte + left) & 0xFF; break
        case 2: row[x] = (byte + up) & 0xFF; break
        case 3: row[x] = (byte + ((left + up) >> 1)) & 0xFF; break
        case 4: {
          const p = left + up - upLeft
          const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft)
          let paeth
          if (pa <= pb && pa <= pc) paeth = left
          else if (pb <= pc) paeth = up
          else paeth = upLeft
          row[x] = (byte + paeth) & 0xFF
          break
        }
      }
    }
    inPos += stride
    pixels.set(row, y * stride)
    prevRow.set(row)
  }

  return { w, h, pixels }
}

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
      raw[off++] = pixels[idx]; raw[off++] = pixels[idx + 1]
      raw[off++] = pixels[idx + 2]; raw[off++] = pixels[idx + 3]
    }
  }
  const idat = deflateSync(raw)
  writeFileSync(path, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.allocUnsafe(0))]))
}

// ---------- 像素拷贝 ----------
function copyPixels(dst, dstW, dstX, dstY, src, srcW, srcH) {
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const si = (y * srcW + x) * 4
      const di = ((dstY + y) * dstW + (dstX + x)) * 4
      dst[di] = src[si]; dst[di + 1] = src[si + 1]
      dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3]
    }
  }
}

// ---------- Atlas JSON 生成 ----------
function buildAtlasJson(kitId, frames) {
  const result = {
    frames: {},
    meta: {
      image: `${kitId}_atlas.png`,
      format: 'RGBA8888',
      size: { w: ATLAS_SIZE, h: ATLAS_SIZE },
      scale: 1,
    },
  }
  for (const f of frames) {
    result.frames[f.name] = {
      frame: { x: f.x, y: f.y, w: f.w, h: f.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
      sourceSize: { w: f.w, h: f.h },
    }
  }
  return result
}

// ---------- 主逻辑 ----------
const KIT_COUNT = 30
let successCount = 0
let skipCount = 0

for (let i = 1; i <= KIT_COUNT; i++) {
  const kitId = `k${String(i).padStart(2, '0')}`

  // 9 帧布局（3×3 网格，64px 单元格）
  // (0,0)=icon[32×32] (64,0)=art_main_1 (128,0)=art_main_2
  // (0,64)=art_main_3 (64,64)=art_main_4 (128,64)=art_main_5
  // (0,128)=art_main_6 (64,128)=art_main_7 (128,128)=art_main_8
  const layout = [
    { name: `${kitId}_icon_0`, file: `${kitId}_icon_0.png`, x: 0, y: 0, w: ICON_SIZE, h: ICON_SIZE },
  ]
  for (let f = 1; f <= 8; f++) {
    const col = f % 3
    const row = Math.floor(f / 3)
    layout.push({
      name: `${kitId}_art_main_${f}`,
      file: `${kitId}_art_main_${f}.png`,
      x: col * FRAME_SIZE,
      y: row * FRAME_SIZE,
      w: FRAME_SIZE,
      h: FRAME_SIZE,
    })
  }

  // 检查源文件是否全部存在
  const allExist = layout.every(f => existsSync(join(srcDir, f.file)))
  if (!allExist) {
    console.warn(`  ⚠ ${kitId}: 源文件缺失，跳过`)
    skipCount++
    continue
  }

  // 创建 atlas 像素缓冲区
  const atlasPx = new Uint8ClampedArray(ATLAS_SIZE * ATLAS_SIZE * 4)

  // 读取每帧并拷贝到 atlas
  for (const f of layout) {
    const { w, h, pixels } = readPng(join(srcDir, f.file))
    copyPixels(atlasPx, ATLAS_SIZE, f.x, f.y, pixels, w, h)
  }

  // 写入 atlas PNG
  const pngPath = join(outDir, `${kitId}_atlas.png`)
  writePng(pngPath, ATLAS_SIZE, ATLAS_SIZE, atlasPx)

  // 写入 atlas JSON
  const jsonPath = join(outDir, `${kitId}_atlas.json`)
  const atlasJson = buildAtlasJson(kitId, layout)
  writeFileSync(jsonPath, JSON.stringify(atlasJson, null, 2))

  successCount++
}

console.log(`Atlas 打包完成：${successCount} 个 atlas（${skipCount} 跳过）`)
console.log(`  输出目录: ${outDir}`)
console.log(`  每 atlas: ${ATLAS_SIZE}×${ATLAS_SIZE}，9 帧（1 icon + 8 art_main）`)
console.log(`  总帧数: ${successCount * 9} = ${successCount} icon + ${successCount * 8} art_main`)
