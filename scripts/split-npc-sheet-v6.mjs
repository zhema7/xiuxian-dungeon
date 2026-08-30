// 切割NPC精灵图集 v6：精确边框移除 + 完整角色保留
// 边框：半透明像素(alpha=2~23)在cell边缘x=27~29处
// 修复v5的90px底部裁切导致角色镂空问题
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const INPUT = 'npc_spritesheet_new.png'
const CELL = 480

// 左右上 30px移除半透明边框，底部0px保留全部角色内容
const INSET_LR = 30
const INSET_TOP = 30
const INSET_BOTTOM = 0

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

  const validX0 = INSET_LR
  const validY0 = INSET_TOP
  const validX1 = CELL - INSET_LR
  const validY1 = CELL - INSET_BOTTOM
  const validW = validX1 - validX0
  const validH = validY1 - validY0

  for (const npc of NPC_MAP) {
    const cellX = npc.col * CELL
    const cellY = npc.row * CELL

    const cellBuf = Buffer.alloc(validW * validH * 4, 0)
    for (let y = 0; y < validH; y++) {
      for (let x = 0; x < validW; x++) {
        const srcIdx = ((cellY + validY0 + y) * W + (cellX + validX0 + x)) * 4
        const dstIdx = (y * validW + x) * 4
        const a = rawBuf[srcIdx + 3]
        if (a === 0) {
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

    // alpha bounding box裁切
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
      console.log(`  [warn] ${npc.name}: no content`)
      continue
    }

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
    console.log(`  ✓ ${npc.name}.png (${cropW}×${cropH}), ${pixelCount}px`)
  }

  console.log('\n[NPC v6] Done! Borders removed (30px LR/T), full character preserved (0px bottom).')
}

await main()
