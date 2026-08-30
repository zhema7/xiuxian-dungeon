import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const distDir = path.join(process.cwd(), 'dist-minitool')

// 1. 删除 title_bg.mp4（游戏有 PNG 和程序化背景降级）
const mp4Path = path.join(distDir, 'sprites', 'title_bg.mp4')
if (fs.existsSync(mp4Path)) {
  fs.unlinkSync(mp4Path)
  console.log('[optimize] 已删除 title_bg.mp4')
}

// 2. 批量优化大 PNG（>30KB），使用调色板模式压缩
const spritesDir = path.join(distDir, 'sprites')
const largePngs = []

function walkDir(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walkDir(full)
    else if (entry.endsWith('.png') && stat.size > 30 * 1024) {
      largePngs.push(full)
    }
  }
}
walkDir(spritesDir)

console.log(`[optimize] 发现 ${largePngs.length} 个大 PNG 需要优化`)

let savedTotal = 0
for (const file of largePngs) {
  const before = fs.statSync(file).size
  const tmpFile = file + '.opt.tmp'
  await sharp(file)
    .png({ quality: 80, compressionLevel: 9, palette: true, effort: 10 })
    .toFile(tmpFile)
  const after = fs.statSync(tmpFile).size
  if (after < before) {
    fs.copyFileSync(tmpFile, file)
    fs.unlinkSync(tmpFile)
    const saved = before - after
    savedTotal += saved
    console.log(`  ${path.relative(distDir, file)}: ${(before/1024).toFixed(1)} → ${(after/1024).toFixed(1)} KB (-${(saved/1024).toFixed(1)} KB)`)
  } else {
    fs.unlinkSync(tmpFile)
    console.log(`  ${path.relative(distDir, file)}: 已最优，跳过`)
  }
}

console.log(`[optimize] PNG 优化完成，共节省 ${(savedTotal/1024/1024).toFixed(2)} MB`)
