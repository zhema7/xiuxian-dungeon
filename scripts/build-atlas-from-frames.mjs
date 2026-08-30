// 从独立帧 PNG 构建精灵图集（自动绿色色键抠图）
// 输入: public/sprites/frames/{classId}/{action}_{frame}.png (绿色背景)
// 输出: {classId}_spritesheet.png + {classId}_atlas.json + {classId}_anims.json
// 图集布局: 6列 × 20行 = 384×1280 (4方向 × 5动作 × 6帧)
// 动作: idle, walk, attack, hit, cast

import sharp from 'sharp'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const spritesDir = join(root, 'public', 'sprites')
const framesDir = join(spritesDir, 'frames')

const FRAME = 64
const COLS = 6
const DIRECTIONS = ['down', 'left', 'right', 'up']
const ACTIONS = ['idle', 'walk', 'attack', 'hit', 'cast']
const ACTION_FRAMES = { idle: 6, walk: 6, attack: 6, hit: 6, cast: 6 }
const ACTION_FPS = { idle: 6, walk: 8, attack: 12, hit: 10, cast: 8 }
const ACTION_REPEAT = { idle: -1, walk: -1, attack: 0, hit: 0, cast: 0 }

const CLASSES = [
  { id: 'sword',     name: '剑修' },
  { id: 'fairy',     name: '仙子' },
  { id: 'mage',      name: '法修' },
  { id: 'sword_new', name: '道修' },
  { id: 'fairy_new', name: '合欢' },
]

// 自动检测背景色并抠图（支持任意纯色背景和已透明图片）
function chromaKeyAuto(data, width, height, channels) {
  // 采样四角像素判断背景色
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ]

  let bgR = 0, bgG = 0, bgB = 0, bgA = 0, opaqueCount = 0
  for (const [cx, cy] of corners) {
    const idx = (cy * width + cx) * channels
    const r = data[idx]
    const g = channels > 1 ? data[idx + 1] : r
    const b = channels > 2 ? data[idx + 2] : r
    const a = channels > 3 ? data[idx + 3] : 255
    if (a > 10) {
      bgR += r; bgG += g; bgB += b; bgA += a; opaqueCount++
    }
  }

  // 如果角像素已透明 → 图片已抠好，直接返回
  if (opaqueCount === 0) {
    const result = Buffer.alloc(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      const srcIdx = i * channels
      const dstIdx = i * 4
      result[dstIdx] = data[srcIdx]
      result[dstIdx + 1] = channels > 1 ? data[srcIdx + 1] : data[srcIdx]
      result[dstIdx + 2] = channels > 2 ? data[srcIdx + 2] : data[srcIdx]
      result[dstIdx + 3] = channels > 3 ? data[srcIdx + 3] : 255
    }
    return { data: result, alreadyTransparent: true }
  }

  // 计算背景色平均值
  bgR = Math.round(bgR / opaqueCount)
  bgG = Math.round(bgG / opaqueCount)
  bgB = Math.round(bgB / opaqueCount)

  const result = Buffer.alloc(width * height * 4)
  const bgThreshold = 80     // 与背景色距离 < 80 → 纯背景
  const edgeThreshold = 130   // 距离 < 130 → 边缘羽化

  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * channels
    const dstIdx = i * 4
    const r = data[srcIdx]
    const g = channels > 1 ? data[srcIdx + 1] : r
    const b = channels > 2 ? data[srcIdx + 2] : r
    const a = channels > 3 ? data[srcIdx + 3] : 255

    // 计算与背景色的颜色距离
    const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2)

    if (dist < bgThreshold) {
      // 纯背景 → 透明
      result[dstIdx] = 0
      result[dstIdx + 1] = 0
      result[dstIdx + 2] = 0
      result[dstIdx + 3] = 0
    } else if (dist < edgeThreshold) {
      // 边缘羽化
      const fadeAlpha = Math.round((dist - bgThreshold) / (edgeThreshold - bgThreshold) * a)
      result[dstIdx] = r
      result[dstIdx + 1] = g
      result[dstIdx + 2] = b
      result[dstIdx + 3] = Math.min(fadeAlpha, a)
    } else {
      // 角色像素 → 不透明
      result[dstIdx] = r
      result[dstIdx + 1] = g
      result[dstIdx + 2] = b
      result[dstIdx + 3] = a
    }
  }
  return { data: result, alreadyTransparent: false, bgColor: { r: bgR, g: bgG, b: bgB } }
}

// 检测非透明像素的 bounding box
function getBoundingBox(data, width, height) {
  let minX = width, minY = height, maxX = 0, maxY = 0
  let found = false

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4 + 3
      if (data[idx] > 10) {
        found = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (!found) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

// 读取帧并应用自动色键抠图，返回 RGBA buffer
async function loadAndChromaKey(pngPath) {
  if (!existsSync(pngPath)) return null

  const { data: rawData, info } = await sharp(pngPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const result = chromaKeyAuto(rawData, info.width, info.height, info.channels)
  return { data: result.data, width: info.width, height: info.height, alreadyTransparent: result.alreadyTransparent }
}

async function buildAtlas(cls) {
  const classId = cls.id
  const classFramesDir = join(framesDir, classId)

  if (!existsSync(classFramesDir)) {
    console.warn(`[skip] ${classId}: frames directory not found`)
    return
  }

  console.log(`\n[build] ${cls.name} (${classId})`)

  const rows = DIRECTIONS.length * ACTIONS.length // 4×5 = 20
  const atlasW = COLS * FRAME // 384
  const atlasH = rows * FRAME  // 1280
  const atlas = Buffer.alloc(atlasW * atlasH * 4, 0)

  const atlasFrames = {}

  // 第1步：加载所有帧 + 色键抠图
  const allFrames = {}
  let unionBox = { x: Infinity, y: Infinity, x2: 0, y2: 0 }

  for (const action of ACTIONS) {
    allFrames[action] = []
    for (let f = 0; f < ACTION_FRAMES[action]; f++) {
      const framePath = join(classFramesDir, `${action}_${f}.png`)
      const cleaned = await loadAndChromaKey(framePath)

      if (!cleaned) {
        console.warn(`  [missing] ${action}_${f}.png`)
        allFrames[action].push(null)
        continue
      }

      const bbox = getBoundingBox(cleaned.data, cleaned.width, cleaned.height)
      if (bbox) {
        unionBox.x = Math.min(unionBox.x, bbox.x)
        unionBox.y = Math.min(unionBox.y, bbox.y)
        unionBox.x2 = Math.max(unionBox.x2, bbox.x + bbox.w)
        unionBox.y2 = Math.max(unionBox.y2, bbox.y + bbox.h)
      }
      allFrames[action].push({ cleaned, bbox })
    }
  }

  // 第2步：统一裁剪区域（确保所有帧角色大小一致）
  const unionW = unionBox.x2 - unionBox.x
  const unionH = unionBox.y2 - unionBox.y
  const side = Math.max(unionW, unionH)
  const cx = unionBox.x + unionW / 2
  const cy = unionBox.y + unionH / 2
  const cropX = Math.max(0, Math.round(cx - side / 2))
  const cropY = Math.max(0, Math.round(cy - side / 2))
  const cropW = Math.min(Math.round(side), 448 - cropX)
  const cropH = Math.min(Math.round(side), 448 - cropY)

  console.log(`  Union bbox: ${unionW}×${unionH}, crop: ${cropX},${cropY} ${cropW}×${cropH}`)

  // 第3步：从抠图后的 RGBA buffer 裁剪 + 缩放到 64×64，放入图集
  for (let d = 0; d < DIRECTIONS.length; d++) {
    const dir = DIRECTIONS[d]

    for (let a = 0; a < ACTIONS.length; a++) {
      const action = ACTIONS[a]
      const atlasRow = d * ACTIONS.length + a

      for (let f = 0; f < ACTION_FRAMES[action]; f++) {
        const frameInfo = allFrames[action][f]
        if (!frameInfo || !frameInfo.cleaned) continue

        // 从 cleaned RGBA buffer 裁剪
        const { data: cleanedData, width: srcW } = frameInfo.cleaned
        const cropped = Buffer.alloc(cropW * cropH * 4, 0)

        for (let py = 0; py < cropH; py++) {
          const srcOff = ((py + cropY) * srcW + cropX) * 4
          const dstOff = py * cropW * 4
          if (srcOff + cropW * 4 <= cleanedData.length) {
            cleanedData.copy(cropped, dstOff, srcOff, srcOff + cropW * 4)
          }
        }

        // 缩放到 64×64
        const resized = await sharp(cropped, {
          raw: { width: cropW, height: cropH, channels: 4 }
        })
          .resize(FRAME, FRAME, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .raw()
          .toBuffer({ resolveWithObject: true })

        // 复制到图集
        const atlasCol = f
        const dx = atlasCol * FRAME
        const dy = atlasRow * FRAME

        for (let py = 0; py < FRAME; py++) {
          const srcOff = py * FRAME * 4
          const dstOff = (dy + py) * atlasW * 4 + dx * 4
          resized.data.copy(atlas, dstOff, srcOff, srcOff + FRAME * 4)
        }

        // 记录帧坐标
        const frameKey = `${classId}_${dir}_${action}_${String(f).padStart(2, '0')}`
        atlasFrames[frameKey] = {
          frame: { x: dx, y: dy, w: FRAME, h: FRAME },
          sourceSize: { w: FRAME, h: FRAME },
          spriteSourceSize: { x: 0, y: 0, w: FRAME, h: FRAME }
        }

        // 帧像素统计
        let pixelCount = 0
        for (let i = 3; i < resized.data.length; i += 4) {
          if (resized.data[i] > 10) pixelCount++
        }
        if (f === 0 || f === 2) {
          console.log(`  ${dir}_${action}_${f}: ${pixelCount}px`)
        }
      }
    }
  }

  // 第4步：写入图集文件
  const sheetPath = join(spritesDir, `${classId}_spritesheet.png`)
  await sharp(atlas, { raw: { width: atlasW, height: atlasH, channels: 4 } })
    .png()
    .toFile(sheetPath)
  console.log(`  -> ${classId}_spritesheet.png (${atlasW}x${atlasH})`)

  // atlas JSON
  const atlasJson = {
    frames: atlasFrames,
    meta: {
      app: 'build-atlas-from-frames',
      version: '2.0',
      image: `${classId}_spritesheet.png`,
      format: 'RGBA8888',
      size: { w: atlasW, h: atlasH },
      scale: 1
    }
  }
  writeFileSync(join(spritesDir, `${classId}_atlas.json`), JSON.stringify(atlasJson, null, 2))
  console.log(`  -> ${classId}_atlas.json`)

  // anims JSON
  const anims = {}
  for (const dir of DIRECTIONS) {
    for (const action of ACTIONS) {
      const key = `${classId}_${dir}_${action}`
      const frames = []
      for (let f = 0; f < ACTION_FRAMES[action]; f++) {
        frames.push({ key: `${classId}_atlas`, frame: `${classId}_${dir}_${action}_${String(f).padStart(2, '0')}` })
      }
      anims[key] = {
        key,
        defaultTextureKey: `${classId}_atlas`,
        frames,
        frameRate: ACTION_FPS[action],
        repeat: ACTION_REPEAT[action]
      }
    }
  }
  writeFileSync(join(spritesDir, `${classId}_anims.json`), JSON.stringify(anims, null, 2))
  console.log(`  -> ${classId}_anims.json`)
}

// Main
console.log('=== Building sprite atlases (auto chroma key green) ===')
for (const cls of CLASSES) {
  await buildAtlas(cls)
}
console.log('\n[done] All atlases built with auto chroma keying.')
