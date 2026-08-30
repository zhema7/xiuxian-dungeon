// 缩小过大的敌人贴图：1660×1748 → 128×128
// 保持 > 100px 以触发 Enemy 类的 isLargeTex 缩放逻辑
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const TARGET = 128

const textures = [
  'm_demon_general',
  'm_spirit_fox',
  'm_stone_guardian',
  'e_dark_sword',
  'e_fire_mage',
  'e_beast_tamer',
  'e_shadow_assassin',
]

async function main() {
  let totalBefore = 0
  let totalAfter = 0

  for (const name of textures) {
    const path = join(spritesDir, `${name}.png`)
    const src = readFileSync(path)
    const meta = await sharp(src).metadata()
    const beforeKB = (src.length / 1024).toFixed(1)
    totalBefore += src.length

    const outBuf = await sharp(src)
      .resize(TARGET, TARGET, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer()

    writeFileSync(path, outBuf)
    const afterKB = (outBuf.length / 1024).toFixed(1)
    totalAfter += outBuf.length

    console.log(`  ${name}.png: ${meta.width}×${meta.height} ${beforeKB}KB → ${TARGET}×${TARGET} ${afterKB}KB`)
  }

  console.log(`\nTotal: ${(totalBefore / 1024 / 1024).toFixed(1)}MB → ${(totalAfter / 1024).toFixed(1)}KB`)
}

await main()
