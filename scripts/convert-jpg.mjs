// 将剩余JPG转换为PNG，并清理未使用的JPG文件
import sharp from 'sharp'
import { unlink, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

const ROOT = 'public/sprites'
const WHITE_THRESHOLD = 235

async function convertWithTransparency(input, output, size) {
  const { data, info } = await sharp(input)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .removeAlpha()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const channels = info.channels
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD) {
      data[i + 3] = 0
    } else if (r > WHITE_THRESHOLD - 20 && g > WHITE_THRESHOLD - 20 && b > WHITE_THRESHOLD - 20) {
      const dist = 255 - (r + g + b) / 3
      if (dist < 20) data[i + 3] = Math.min(255, Math.floor(dist * 12))
    }
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels } })
    .png()
    .toFile(output)
  console.log(`  ✓ ${output.split('/').pop()} (transparent, ${info.width}x${info.height})`)
}

async function convertFormatOnly(input, output) {
  await sharp(input).png().toFile(output)
  const m = await sharp(output).metadata()
  console.log(`  ✓ ${output.split('/').pop()} (${m.width}x${m.height})`)
}

async function main() {
  console.log('=== JPG → PNG 转换 ===\n')

  // 1. talisman_save.jpg → talisman_save.png (图标，需透明背景)
  console.log('[1] talisman_save (图标，抠除白底)')
  await convertWithTransparency(`${ROOT}/talisman_save.jpg`, `${ROOT}/talisman_save.png`, 1920)

  // 2. talisman_grey.jpg → talisman_grey.png (UI图标，需透明背景)
  console.log('[2] talisman_grey (UI图标，抠除白底)')
  await convertWithTransparency(`${ROOT}/talisman_grey.jpg`, `${ROOT}/talisman_grey.png`, 1920)

  // 3. sect_bg.jpg → sect_bg.png (背景，仅转格式)
  console.log('[3] sect_bg (背景，仅转格式)')
  await convertFormatOnly(`${ROOT}/sect_bg.jpg`, `${ROOT}/sect_bg.png`)

  // 4. city_map_large.jpg → city_map_large.png (背景，仅转格式)
  console.log('[4] city_map_large (背景，仅转格式)')
  await convertFormatOnly(`${ROOT}/city_map_large.jpg`, `${ROOT}/city_map_large.png`)

  // 5. 删除所有JPG文件（包括刚转换的源文件和未使用的JPG）
  console.log('\n[清理] 删除所有JPG文件')
  const files = await readdir(ROOT)
  const jpgFiles = files.filter(f => f.endsWith('.jpg'))
  for (const f of jpgFiles) {
    await unlink(join(ROOT, f))
    console.log(`  ✗ ${f}`)
  }

  // 6. 删除tribes目录中的JPG（如果有）
  const tribeDir = join(ROOT, 'tribes')
  if (existsSync(tribeDir)) {
    const tribeFiles = await readdir(tribeDir)
    const tribeJpgs = tribeFiles.filter(f => f.endsWith('.jpg'))
    for (const f of tribeJpgs) {
      await unlink(join(tribeDir, f))
      console.log(`  ✗ tribes/${f}`)
    }
  }

  // 7. 删除story目录中的JPG（如果有）
  const storyDir = join(ROOT, 'story')
  if (existsSync(storyDir)) {
    const storyFiles = await readdir(storyDir)
    const storyJpgs = storyFiles.filter(f => f.endsWith('.jpg'))
    for (const f of storyJpgs) {
      await unlink(join(storyDir, f))
      console.log(`  ✗ story/${f}`)
    }
  }

  console.log('\n=== 完成！===')
}

main().catch(err => {
  console.error('转换失败:', err)
  process.exit(1)
})
