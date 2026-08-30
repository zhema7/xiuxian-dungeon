// 批量去除 AI 生成图片右下角"AI生成"水印
// 方法：从右下角裁剪掉水印区域，图片尺寸微调（不影响游戏渲染）
import sharp from 'sharp'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const tmpDir = join(spritesDir, '_tmp_fixed')
mkdirSync(tmpDir, { recursive: true })

const aiFiles = [
  'npc_auctioneer.jpg', 'npc_arena.jpg', 'npc_honor.jpg',
  'npc_quest1.jpg', 'npc_quest2.jpg', 'npc_city_lord.jpg', 'npc_arena_champion.jpg',
  'e_dark_sword.jpg', 'e_fire_mage.jpg', 'e_beast_tamer.jpg', 'e_shadow_assassin.jpg',
  'm_spirit_fox.jpg', 'm_demon_general.jpg', 'm_stone_guardian.jpg',
  'city_bg.jpg', 'arena_bg.jpg',
]

console.log('[watermark] 开始批量裁剪水印...')

let processed = 0
let failed = 0

for (const file of aiFiles) {
  const filePath = join(spritesDir, file)
  const tmpPath = join(tmpDir, file)
  try {
    const srcBuf = readFileSync(filePath)
    const meta = await sharp(srcBuf).metadata()
    const w = meta.width
    const h = meta.height

    // 裁剪掉右下角水印：从右切 260px，从底切 180px
    const cropW = Math.min(260, Math.floor(w * 0.14))
    const cropH = Math.min(180, Math.floor(h * 0.09))
    const newW = w - cropW
    const newH = h - cropH

    const result = await sharp(srcBuf)
      .extract({ left: 0, top: 0, width: newW, height: newH })
      .jpeg({ quality: 95 })
      .toBuffer()
    writeFileSync(tmpPath, result)

    processed++
    console.log(`  ✓ ${file} (${w}x${h} → ${newW}x${newH}, 裁掉右${cropW}底${cropH})`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${file}: ${e.message}`)
  }
}

// 替换原文件
console.log('[watermark] 替换原文件...')
let replaced = 0
for (const file of aiFiles) {
  const tmpPath = join(tmpDir, file)
  const origPath = join(spritesDir, file)
  if (existsSync(tmpPath)) {
    try {
      renameSync(tmpPath, origPath)
      replaced++
    } catch {
      try {
        const buf = readFileSync(tmpPath)
        writeFileSync(origPath, buf)
        unlinkSync(tmpPath)
        replaced++
      } catch (e2) {
        console.error(`  ✗ 替换失败 ${file}: ${e2.message}`)
      }
    }
  }
}
console.log(`[watermark] 替换：${replaced}/${processed}`)
console.log(`[watermark] 完成：成功 ${processed}，失败 ${failed}`)
