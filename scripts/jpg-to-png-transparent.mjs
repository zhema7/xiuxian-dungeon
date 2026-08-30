// 将 AI 生成 .jpg 图片转为 .png，并对角色/怪物图片做背景抠除（chroma key → 透明）
// 背景图（city_bg, arena_bg）仅转格式不抠图
import sharp from 'sharp'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const tmpDir = join(spritesDir, '_tmp_png')
mkdirSync(tmpDir, { recursive: true })

// 角色图：需要抠除背景
const charFiles = [
  'npc_auctioneer.jpg', 'npc_arena.jpg', 'npc_honor.jpg',
  'npc_quest1.jpg', 'npc_quest2.jpg', 'npc_city_lord.jpg', 'npc_arena_champion.jpg',
  'e_dark_sword.jpg', 'e_fire_mage.jpg', 'e_beast_tamer.jpg', 'e_shadow_assassin.jpg',
  'm_spirit_fox.jpg', 'm_demon_general.jpg', 'm_stone_guardian.jpg',
]
// 背景图：仅转格式，不抠图
const bgFiles = ['city_bg.jpg', 'arena_bg.jpg']

console.log('[png] 开始 JPG → PNG 转换 + 背景抠除...')

let processed = 0

// 1. 角色图：chroma key 去背景
for (const file of charFiles) {
  const srcPath = join(spritesDir, file)
  const pngName = file.replace('.jpg', '.png')
  const tmpPath = join(tmpDir, pngName)

  try {
    const srcBuf = readFileSync(srcPath)
    const meta = await sharp(srcBuf).metadata()
    const w = meta.width
    const h = meta.height

    // 采样四角背景色（各取 8x8 区域求平均）
    const cornerSize = 8
    const corners = [
      { left: 0, top: 0 },
      { left: w - cornerSize, top: 0 },
      { left: 0, top: h - cornerSize },
      { left: w - cornerSize, top: h - cornerSize },
    ]
    let bgR = 0, bgG = 0, bgB = 0, bgCount = 0
    for (const c of corners) {
      const buf = await sharp(srcBuf).extract({ ...c, width: cornerSize, height: cornerSize }).raw().toBuffer()
      for (let i = 0; i < buf.length; i += meta.channels) {
        bgR += buf[i]
        bgG += buf[i + 1]
        bgB += buf[i + 2]
        bgCount++
      }
    }
    bgR = Math.round(bgR / bgCount)
    bgG = Math.round(bgG / bgCount)
    bgB = Math.round(bgB / bgCount)

    // 获取全图 RGBA 原始数据
    const rawBuf = await sharp(srcBuf)
      .ensureAlpha()
      .raw()
      .toBuffer()

    // chroma key：距离背景色 < threshold 的像素设为透明
    const threshold = 35  // RGB 空间欧氏距离阈值
    let transparentCount = 0
    for (let i = 0; i < rawBuf.length; i += 4) {
      const r = rawBuf[i]
      const g = rawBuf[i + 1]
      const b = rawBuf[i + 2]
      const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2)
      if (dist < threshold) {
        rawBuf[i + 3] = 0  // 透明
        transparentCount++
      } else if (dist < threshold + 15) {
        // 边缘半透明过渡（抗锯齿）
        rawBuf[i + 3] = Math.round(255 * (dist - threshold) / 15)
      }
    }
    const pct = ((transparentCount / (rawBuf.length / 4)) * 100).toFixed(1)

    // 保存为 PNG
    await sharp(rawBuf, { raw: { width: w, height: h, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(tmpPath)

    processed++
    console.log(`  ✓ ${pngName} (${w}x${h}, bg=#${bgR.toString(16).padStart(2,'0')}${bgG.toString(16).padStart(2,'0')}${bgB.toString(16).padStart(2,'0')}, 透明 ${pct}%)`)
  } catch (e) {
    console.error(`  ✗ ${file}: ${e.message}`)
  }
}

// 2. 背景图：仅转格式
for (const file of bgFiles) {
  const srcPath = join(spritesDir, file)
  const pngName = file.replace('.jpg', '.png')
  const tmpPath = join(tmpDir, pngName)

  try {
    const srcBuf = readFileSync(srcPath)
    await sharp(srcBuf).png({ compressionLevel: 9 }).toFile(tmpPath)
    processed++
    console.log(`  ✓ ${pngName} (背景图，仅转格式)`)
  } catch (e) {
    console.error(`  ✗ ${file}: ${e.message}`)
  }
}

// 3. 替换：删除旧 .jpg，移入新 .png
console.log('[png] 替换文件...')
for (const file of [...charFiles, ...bgFiles]) {
  const pngName = file.replace('.jpg', '.png')
  const tmpPath = join(tmpDir, pngName)
  const origJpg = join(spritesDir, file)
  const origPng = join(spritesDir, pngName)

  if (existsSync(tmpPath)) {
    // 删除旧 jpg
    if (existsSync(origJpg)) unlinkSync(origJpg)
    // 移入新 png
    try {
      renameSync(tmpPath, origPng)
    } catch {
      const buf = readFileSync(tmpPath)
      writeFileSync(origPng, buf)
      unlinkSync(tmpPath)
    }
  }
}
console.log(`[png] 完成：${processed} 张图片已转换并抠除背景`)
