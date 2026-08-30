// 切割新NPC精灵图集（透明背景版）
// 输入: npc_spritesheet_new.png (1920×1920, 4×4网格, 每格480×480, 透明背景)
// 输出: 11个独立NPC PNG文件
// 关键: 内缩裁切避开网格线，消除黑框

import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const INPUT = 'npc_spritesheet_new.png'
const SHEET_W = 1920
const SHEET_H = 1920
const CELL = 480  // 1920 / 4 = 480
const INSET = 10  // 内缩10px避开网格线和外边框

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
  const srcPath = join(spritesDir, INPUT)
  const srcBuf = readFileSync(srcPath)
  const meta = await sharp(srcBuf).metadata()
  console.log(`Source: ${meta.width}×${meta.height}, channels: ${meta.channels}`)

  for (const npc of NPC_MAP) {
    const cellX = npc.col * CELL + INSET
    const cellY = npc.row * CELL + INSET
    const cellW = CELL - INSET * 2
    const cellH = CELL - INSET * 2

    const outBuf = await sharp(srcBuf)
      .extract({ left: cellX, top: cellY, width: cellW, height: cellH })
      .png({ compressionLevel: 9 })
      .toBuffer()

    writeFileSync(join(spritesDir, `${npc.name}.png`), outBuf)
    console.log(`  ✓ ${npc.name}.png (${cellW}×${cellH})`)
  }

  console.log('\n[NPC] Done! 11 sprites extracted.')
}

await main()
