// 从 NPC 精灵图集切割为独立 NPC PNG 文件（自动色键抠图）
// 输入: public/sprites/npc_spritesheet.jpg (1920x1920, 4x4 grid, 480x480 per cell)
// 输出: public/sprites/npc_{name}.png (透明背景)

import sharp from 'sharp'
import { existsSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const spritesDir = join(root, 'public', 'sprites')

const CELL = 480
const COLS = 4

// NPC 映射：grid位置 → 文件名
const NPC_MAP = [
  { row: 0, col: 0, name: 'npc_auctioneer' },      // 坊市拍卖师
  { row: 0, col: 1, name: 'npc_arena' },            // 擂台裁判
  { row: 0, col: 2, name: 'npc_honor' },           // 荣誉商人
  { row: 0, col: 3, name: 'npc_quest1' },           // 悬赏长老
  { row: 1, col: 0, name: 'npc_quest2' },           // 游历散人
  { row: 1, col: 1, name: 'npc_quest3' },           // 宗门执事
  { row: 1, col: 2, name: 'npc_city_lord' },        // 天枢城主
  { row: 1, col: 3, name: 'npc_arena_champion' },  // 擂台霸主
  { row: 2, col: 0, name: 'npc_merchant' },         // 坊市商人
  { row: 2, col: 1, name: 'npc_elder' },            // 守山老者
  { row: 2, col: 2, name: 'npc_blacksmith' },       // 锻造师
]

// 自动检测背景色并抠图
function chromaKeyAuto(data, width, height) {
  // 采样边框像素（跳过角落3像素，避免网格线）
  const inset = 4
  const samples = []
  for (let x = inset; x < width - inset; x += 8) {
    samples.push([x, inset])            // 上边
    samples.push([x, height - inset - 1]) // 下边
  }
  for (let y = inset; y < height - inset; y += 8) {
    samples.push([inset, y])             // 左边
    samples.push([width - inset - 1, y]) // 右边
  }

  let bgR = 0, bgG = 0, bgB = 0, count = 0
  for (const [cx, cy] of samples) {
    const idx = (cy * width + cx) * 4
    bgR += data[idx]
    bgG += data[idx + 1]
    bgB += data[idx + 2]
    count++
  }
  bgR = Math.round(bgR / count)
  bgG = Math.round(bgG / count)
  bgB = Math.round(bgB / count)

  console.log(`    bg color: ${bgR},${bgG},${bgB}`)

  const result = Buffer.alloc(width * height * 4)
  const bgThreshold = 60
  const edgeThreshold = 110

  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * 4
    const dstIdx = i * 4
    const r = data[srcIdx]
    const g = data[srcIdx + 1]
    const b = data[srcIdx + 2]
    const a = data[srcIdx + 3]

    const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2)

    if (dist < bgThreshold) {
      result[dstIdx] = 0
      result[dstIdx + 1] = 0
      result[dstIdx + 2] = 0
      result[dstIdx + 3] = 0
    } else if (dist < edgeThreshold) {
      const fadeAlpha = Math.round((dist - bgThreshold) / (edgeThreshold - bgThreshold) * a)
      result[dstIdx] = r
      result[dstIdx + 1] = g
      result[dstIdx + 2] = b
      result[dstIdx + 3] = Math.min(fadeAlpha, a)
    } else {
      result[dstIdx] = r
      result[dstIdx + 1] = g
      result[dstIdx + 2] = b
      result[dstIdx + 3] = a
    }
  }
  return result
}

async function splitNpcSheet() {
  const sheetPath = join(spritesDir, 'npc_spritesheet.jpg')
  if (!existsSync(sheetPath)) {
    console.error('npc_spritesheet.jpg not found')
    return
  }

  console.log('=== Splitting NPC sprite sheet ===')

  for (const npc of NPC_MAP) {
    const cellX = npc.col * CELL
    const cellY = npc.row * CELL

    // 提取 cell
    const { data: rawData, info } = await sharp(sheetPath)
      .ensureAlpha()
      .extract({ left: cellX, top: cellY, width: CELL, height: CELL })
      .raw()
      .toBuffer({ resolveWithObject: true })

    // 自动色键抠图
    const cleaned = chromaKeyAuto(rawData, info.width, info.height)

    // 统一裁剪到角色区域
    let minX = CELL, minY = CELL, maxX = 0, maxY = 0
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const idx = (y * CELL + x) * 4 + 3
        if (cleaned[idx] > 10) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    const cropW = maxX - minX + 1
    const cropH = maxY - minY + 1
    const side = Math.max(cropW, cropH)
    const cx = minX + cropW / 2
    const cy = minY + cropH / 2
    const cropX = Math.max(0, Math.round(cx - side / 2))
    const cropY = Math.max(0, Math.round(cy - side / 2))
    const cropSize = Math.min(Math.round(side), CELL - cropX, CELL - cropY)

    // 裁剪并缩放到 128x128
    const cropped = Buffer.alloc(cropSize * cropSize * 4, 0)
    for (let py = 0; py < cropSize; py++) {
      const srcOff = ((py + cropY) * CELL + cropX) * 4
      const dstOff = py * cropSize * 4
      if (srcOff + cropSize * 4 <= cleaned.length) {
        cleaned.copy(cropped, dstOff, srcOff, srcOff + cropSize * 4)
      }
    }

    const outPath = join(spritesDir, `${npc.name}.png`)
    await sharp(cropped, {
      raw: { width: cropSize, height: cropSize, channels: 4 }
    })
      .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath)

    // 统计像素
    let pixelCount = 0
    for (let i = 3; i < 128 * 128 * 4; i += 4) {
      if (cleaned[i] > 10) pixelCount++
    }

    console.log(`  ${npc.name}.png (${npc.row},${npc.col}) -> ${pixelCount}px`)
  }

  console.log('\n[done] All NPC sprites extracted with chroma keying.')
}

splitNpcSheet().catch(console.error)
