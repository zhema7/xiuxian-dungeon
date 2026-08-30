// 切割NPC精灵图集 v4：清理脏alpha + 精确裁切，不损失任何角色像素
// 问题：原PNG透明区域有非零RGB残留值，渲染时显示为黑色边框
// 修复：1.对alpha=0的像素，RGB设为0  2.按alpha裁切角色区域  3.不做任何颜色移除
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const INPUT = 'npc_spritesheet_new.png'
const CELL = 480

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
  console.log(`Source: ${meta.width}×${meta.height}, channels: ${meta.channels}`)

  for (const npc of NPC_MAP) {
    const cellX = npc.col * CELL
    const cellY = npc.row * CELL

    // 提取480×480 cell到独立buffer
    const cellBuf = Buffer.alloc(CELL * CELL * 4, 0)
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const srcIdx = ((cellY + y) * W + (cellX + x)) * 4
        const dstIdx = (y * CELL + x) * 4
        const a = rawBuf[srcIdx + 3]
        if (a === 0) {
          // 透明像素：RGB全部置零，消除脏alpha残留
          cellBuf[dstIdx] = 0
          cellBuf[dstIdx + 1] = 0
          cellBuf[dstIdx + 2] = 0
          cellBuf[dstIdx + 3] = 0
        } else {
          // 非透明像素：完整保留（包括所有深色角色像素）
          cellBuf[dstIdx] = rawBuf[srcIdx]
          cellBuf[dstIdx + 1] = rawBuf[srcIdx + 1]
          cellBuf[dstIdx + 2] = rawBuf[srcIdx + 2]
          cellBuf[dstIdx + 3] = a
        }
      }
    }

    // 按alpha通道找角色bounding box（alpha > 10算有内容）
    let minX = CELL, minY = CELL, maxX = -1, maxY = -1
    let pixelCount = 0
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const idx = (y * CELL + x) * 4 + 3
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
      console.log(`  [warn] ${npc.name}: no content, blank output`)
      continue
    }

    // 加2px边距防止裁切过紧，同时clamp到cell范围内
    const PAD = 2
    const cropX = Math.max(0, minX - PAD)
    const cropY = Math.max(0, minY - PAD)
    const cropEndX = Math.min(CELL, maxX + 1 + PAD)
    const cropEndY = Math.min(CELL, maxY + 1 + PAD)
    const cropW = cropEndX - cropX
    const cropH = cropEndY - cropY

    const outBuf = await sharp(cellBuf, { raw: { width: CELL, height: CELL, channels: 4 } })
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .png({ compressionLevel: 9 })
      .toBuffer()

    writeFileSync(join(spritesDir, `${npc.name}.png`), outBuf)
    console.log(`  ✓ ${npc.name}.png (${cropW}×${cropH}), content ${pixelCount}px, bbox [${minX},${minY}]-[${maxX},${maxY}]`)
  }

  console.log('\n[NPC v4] Done! All character pixels preserved, dirty alpha cleaned.')
}

await main()
