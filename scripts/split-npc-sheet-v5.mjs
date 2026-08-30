// 切割NPC精灵图集 v5：固定内缩移除边框+底部文字标签 + 脏alpha清理 + 精确裁切
// 边框在cell边缘30px内，底部名称标签在y>380区域
// 处理：1.固定内缩 2.清理透明像素RGB 3.按alpha裁切角色区域
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const INPUT = 'npc_spritesheet_new.png'
const CELL = 480

// 内缩量：左/右/上 35px移除边框，底部90px移除名称标签
const INSET_LR = 35
const INSET_TOP = 35
const INSET_BOTTOM = 90

const NPC_MAP = [
  { row: 0, col: 0, name: 'npc_auctioneer' },
  { row: 0, col: 1, name: 'npc_arena' },
  { row: 0, col: 2, name: 'npc_honor' },
  { row: 0, col: 3, name: 'npc_quest1' },
  { row: 1, col: 0, name: 'npc_quest2' },
  { row: 1, col: 1, name: 'npc_quest3' },
  { row: 1, col: 2, name: 'npc_city_lord' },
  { row: 1, col: 3, name: 'npc_arena_champion' },
  { row: 2, col: 0, name: 'npc_merchant' },
  { row: 2, col: 1, name: 'npc_elder' },
  { row: 2, col: 2, name: 'npc_blacksmith' },
]

async function main() {
  const srcBuf = readFileSync(join(spritesDir, INPUT))
  const meta = await sharp(srcBuf).metadata()
  const W = meta.width
  const rawBuf = await sharp(srcBuf).ensureAlpha().raw().toBuffer()
  console.log(`Source: ${meta.width}×${meta.height}`)

  // 内缩后的有效区域
  const validX0 = INSET_LR           // 35
  const validY0 = INSET_TOP          // 35
  const validX1 = CELL - INSET_LR    // 445
  const validY1 = CELL - INSET_BOTTOM // 390
  const validW = validX1 - validX0   // 410
  const validH = validY1 - validY0  // 355

  for (const npc of NPC_MAP) {
    const cellX = npc.col * CELL
    const cellY = npc.row * CELL

    // 提取内缩后的cell区域到独立buffer
    const cellBuf = Buffer.alloc(validW * validH * 4, 0)
    for (let y = 0; y < validH; y++) {
      for (let x = 0; x < validW; x++) {
        const srcIdx = ((cellY + validY0 + y) * W + (cellX + validX0 + x)) * 4
        const dstIdx = (y * validW + x) * 4
        const a = rawBuf[srcIdx + 3]
        if (a === 0) {
          // 透明像素：RGB置零，消除脏alpha
          cellBuf[dstIdx] = 0
          cellBuf[dstIdx + 1] = 0
          cellBuf[dstIdx + 2] = 0
          cellBuf[dstIdx + 3] = 0
        } else {
          cellBuf[dstIdx] = rawBuf[srcIdx]
          cellBuf[dstIdx + 1] = rawBuf[srcIdx + 1]
          cellBuf[dstIdx + 2] = rawBuf[srcIdx + 2]
          cellBuf[dstIdx + 3] = a
        }
      }
    }

    // 在内缩区域内按alpha找角色bounding box
    let minX = validW, minY = validH, maxX = -1, maxY = -1
    let pixelCount = 0
    for (let y = 0; y < validH; y++) {
      for (let x = 0; x < validW; x++) {
        const idx = (y * validW + x) * 4 + 3
        if (cellBuf[idx] > 10) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
          pixelCount++
        }
      }
    }

    if (maxX < 0) {
      console.log(`  [warn] ${npc.name}: no content after inset, using full inset area`)
      // fallback: use the full inset area
      const outBuf = await sharp(cellBuf, { raw: { width: validW, height: validH, channels: 4 } })
        .png({ compressionLevel: 9 }).toBuffer()
      writeFileSync(join(spritesDir, `${npc.name}.png`), outBuf)
      continue
    }

    // 加2px边距
    const PAD = 2
    const cropX = Math.max(0, minX - PAD)
    const cropY = Math.max(0, minY - PAD)
    const cropEndX = Math.min(validW, maxX + 1 + PAD)
    const cropEndY = Math.min(validH, maxY + 1 + PAD)
    const cropW = cropEndX - cropX
    const cropH = cropEndY - cropY

    const outBuf = await sharp(cellBuf, { raw: { width: validW, height: validH, channels: 4 } })
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .png({ compressionLevel: 9 })
      .toBuffer()

    writeFileSync(join(spritesDir, `${npc.name}.png`), outBuf)
    console.log(`  ✓ ${npc.name}.png (${cropW}×${cropH}), ${pixelCount}px content`)
  }

  console.log('\n[NPC v5] Done! Borders removed, labels removed, all character pixels preserved.')
}

await main()
