// 将序列帧网格图切割为独立帧 PNG
// 网格: 6列 × 5行 = 30帧 (idle/walk/attack/hit/cast)
// 每格 448×448px, 总尺寸 2688×2240

import sharp from 'sharp'
import { mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const spritesDir = join(root, 'public', 'sprites')
const framesDir = join(spritesDir, 'frames')

const GRID_COLS = 6
const GRID_ROWS = 5
const CELL = 448

const ACTIONS = ['idle', 'walk', 'attack', 'hit', 'cast']
const CLASSES = [
  { id: 'sword',      grid: '_sword_anim_grid.png' },
  { id: 'fairy',      grid: '_fairy_anim_grid.jpg' },
  { id: 'mage',       grid: '_mage_anim_grid.png' },
  { id: 'sword_new',  grid: '_dao_anim_grid.jpg' },
  { id: 'fairy_new',  grid: '_huan_anim_grid.png' },
]

async function splitGrid(cls) {
  const gridPath = join(spritesDir, cls.grid)
  if (!existsSync(gridPath)) {
    console.warn(`[skip] ${cls.grid} not found`)
    return
  }

  const outDir = join(framesDir, cls.id)
  mkdirSync(outDir, { recursive: true })

  const img = sharp(gridPath)
  const meta = await img.metadata()
  console.log(`\n[split] ${cls.id} <- ${cls.grid} (${meta.width}x${meta.height})`)

  for (let row = 0; row < GRID_ROWS; row++) {
    const action = ACTIONS[row]
    for (let col = 0; col < GRID_COLS; col++) {
      const cellX = col * CELL
      const cellY = row * CELL
      const outName = `${action}_${col}.png`
      const outPath = join(outDir, outName)

      await sharp(gridPath)
        .extract({ left: cellX, top: cellY, width: CELL, height: CELL })
        .png()
        .toFile(outPath)

      console.log(`  ${action}_${col}.png  (${cellX},${cellY})`)
    }
  }
  console.log(`[done] ${cls.id}: 30 frames -> ${outDir}`)
}

console.log('=== Splitting animation grids into individual frames ===')
for (const cls of CLASSES) {
  await splitGrid(cls)
}
console.log('\n[all done] Frames saved to public/sprites/frames/{classId}/')
console.log('Next: manually remove green background from each PNG,')
console.log('      then run: node scripts/build-atlas-from-frames.mjs')
