// TapTap H5 打包脚本（标准 vite 构建，保留全部原始资源）：
// 1. 运行 npx vite build → dist/
// 2. 将 dist/ 全部内容放入 xiuxian-dungeon/ 单根文件夹
// 3. tar -caf 创建标准 .zip（正斜杠路径）
// 结构：xiuxian-dungeon/index.html + xiuxian-dungeon/assets/ + xiuxian-dungeon/sprites/ + xiuxian-dungeon/audio/
import { readdirSync, statSync, mkdirSync, copyFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const srcDir = join(process.cwd(), 'dist')
const outDir = join(process.cwd(), 'dist-taptap')
const gameDir = join(outDir, 'xiuxian-dungeon')

console.log('[taptap] === TapTap H5 标准构建打包 ===')

// 0. 先运行标准 vite build
console.log('[taptap] 执行 vite build...')
try {
  execSync('npx vite build', { cwd: process.cwd(), stdio: 'inherit' })
} catch {
  console.error('[taptap] ✗ vite build 失败')
  process.exit(1)
}

// 1. 检查 dist 产物
if (!existsSync(join(srcDir, 'index.html'))) {
  console.error('[taptap] ✗ dist/index.html 不存在')
  process.exit(1)
}
console.log('[taptap] ✓ vite build 完成')

// 2. 清理输出目录
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
mkdirSync(gameDir, { recursive: true })

// 3. 将 dist/ 全部内容复制到 game/
function copyDir(src, dest) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true })
      copyDir(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}
copyDir(srcDir, gameDir)
console.log('[taptap] ✓ 资源已复制到 xiuxian-dungeon/')

// 4. 验证结构
const gameEntries = readdirSync(gameDir)
console.log(`[taptap] xiuxian-dungeon/ 内容：${gameEntries.join(', ')}`)
if (!gameEntries.includes('index.html')) {
  console.error('[taptap] ✗ xiuxian-dungeon/ 内缺少 index.html')
  process.exit(1)
}
console.log('[taptap] ✓ xiuxian-dungeon/ 包含 index.html')

// 5. 验证 title_bg.mp4 保留
const videoPath = join(gameDir, 'sprites', 'title_bg.mp4')
if (existsSync(videoPath)) {
  const size = statSync(videoPath).size
  console.log(`[taptap] ✓ title_bg.mp4 保留 (${(size / 1024 / 1024).toFixed(2)} MB)`)
} else {
  console.log('[taptap] 警告：title_bg.mp4 未找到（游戏会降级到 PNG 背景）')
}

// 6. 验证作者水印
const html = readFileSync(join(gameDir, 'index.html'), 'utf-8')
if (html.includes('哲码游戏')) {
  console.log('[taptap] ✓ 作者水印保留：哲码游戏 出品')
} else {
  console.log('[taptap] 警告：未找到作者水印')
}

// 7. 统计文件数和大小
function walkDir(dir, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) walkDir(fullPath, results)
    else results.push(fullPath)
  }
  return results
}
const allFiles = walkDir(gameDir)
let totalSize = 0
for (const f of allFiles) totalSize += statSync(f).size
console.log(`[taptap] 文件数量：${allFiles.length}`)
console.log(`[taptap] 总体积：${(totalSize / 1024 / 1024).toFixed(2)} MB（未压缩）`)

// 8. 路径安全校验
let hasUnsafe = false
for (const f of allFiles) {
  const rel = f.replace(outDir, '').replace(/^[\\/]/, '').replace(/\\/g, '/')
  if (rel.includes('..') || rel.startsWith('/')) {
    console.log(`  ✗ ${rel}`)
    hasUnsafe = true
  }
}
if (!hasUnsafe) console.log('[taptap] ✓ 路径安全校验通过')

// 9. 打包 zip
const zipPath = join(process.cwd(), 'dist-taptap.zip')
if (existsSync(zipPath)) rmSync(zipPath, { force: true })
try {
  execSync('tar -caf "../dist-taptap.zip" xiuxian-dungeon', { cwd: outDir, stdio: 'pipe' })
  const zipSize = statSync(zipPath).size
  console.log(`[taptap] ✓ 已创建 dist-taptap.zip (${(zipSize / 1024 / 1024).toFixed(2)} MB)`)
} catch {
  console.error('[taptap] ✗ zip 打包失败')
  process.exit(1)
}

console.log('[taptap] === 打包完成 ===')
