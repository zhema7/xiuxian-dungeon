// 扫描NPC图集中每个cell的内容分布，找出底部名称标签的起始位置
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const srcBuf = readFileSync(join(spritesDir, 'npc_spritesheet_new.png'))
const meta = await sharp(srcBuf).metadata()
const W = meta.width
const rawBuf = await sharp(srcBuf).ensureAlpha().raw().toBuffer()
const CELL = 480

// 检查 npc_city_lord (row=1, col=2) 的底部内容
const cells = [
  { name: 'npc_city_lord', row: 1, col: 2 },
  { name: 'npc_auctioneer', row: 0, col: 0 },
  { name: 'npc_elder', row: 2, col: 1 },
  { name: 'npc_blacksmith', row: 2, col: 2 },
]

for (const cell of cells) {
  const cellX = cell.col * CELL
  const cellY = cell.row * CELL
  console.log(`\n=== ${cell.name} (row=${cell.row}, col=${cell.col}) ===`)

  // 扫描每行的非透明像素数（y=350~480，即底部130px）
  console.log('  y | pixelCount | (底部区域)')
  for (let y = 350; y < CELL; y += 5) {
    let count = 0
    for (let x = 0; x < CELL; x++) {
      const idx = ((cellY + y) * W + (cellX + x)) * 4 + 3
      if (rawBuf[idx] > 10) count++
    }
    const bar = '█'.repeat(Math.floor(count / 10))
    console.log(`  ${y} | ${count.toString().padStart(5)} | ${bar}`)
  }
}
