// 原始切割NPC精灵图集：仅避开网格线，保留全部内容（含黑框），用户手工去除黑框
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const INPUT = 'npc_spritesheet_new.png'
const CELL = 480
const INSET = 2  // 仅2px避开网格线，保留全部cell内容

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

  for (const npc of NPC_MAP) {
    const x = npc.col * CELL + INSET
    const y = npc.row * CELL + INSET
    const w = CELL - INSET * 2
    const h = CELL - INSET * 2

    const outBuf = await sharp(srcBuf)
      .extract({ left: x, top: y, width: w, height: h })
      .png({ compressionLevel: 9 })
      .toBuffer()

    writeFileSync(join(spritesDir, `${npc.name}.png`), outBuf)
    console.log(`  ✓ ${npc.name}.png (${w}×${h})`)
  }

  console.log('\n[RAW] Done! Full cell output with border intact for manual editing.')
}

await main()
