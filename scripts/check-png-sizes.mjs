import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const samples = [
  'sprites/ai_bolt_fly_1.png',
  'sprites/v4/k01_art_main_1.png',
  'sprites/xian/beast_crane.png',
  'sprites/terrain/qm_floor_base.png',
]

for (const s of samples) {
  const p = path.join('dist-minitool', s)
  if (fs.existsSync(p)) {
    const meta = await sharp(p).metadata()
    const sz = (fs.statSync(p).size / 1024).toFixed(1)
    console.log(`${s}: ${meta.width}x${meta.height}, ${sz} KB, ${meta.format}`)
  } else {
    console.log(`${s}: not found`)
  }
}
