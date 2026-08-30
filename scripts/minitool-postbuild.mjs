// 小红书小工具后处理脚本：
// 1. 移除 index.html 中的 type="module" / crossorigin（容器 CSP 不支持模块脚本）
// 2. 校验 JS 为经典脚本（无 import/export）
// 3. 清理禁止的文件类型
// 4. 优化大体积资源（删除 mp4、压缩大 PNG）
// 5. 打包 zip
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, rmdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import sharp from 'sharp'

const distDir = join(process.cwd(), 'dist-minitool')
const htmlPath = join(distDir, 'index.html')

console.log('[minitool] 后处理开始...')

// 1. 修复 index.html：移除 type="module" 和 crossorigin，修正脚本路径，注入 minitool 标记
let html = readFileSync(htmlPath, 'utf-8')
html = html.replace(/\s+type="module"/g, '')
html = html.replace(/\s+crossorigin(="[^"]*")?/g, '')
html = html.replace(/\.\/assets\//g, './')
// 注入 minitool 全局标记（BootScene 检测此标记切换 Atlas 加载模式）
if (!html.includes('__MINITOOL__')) {
  html = html.replace(/<script src="\.\//, '<script>window.__MINITOOL__=true</script>\n<script src="./')
}
writeFileSync(htmlPath, html)
console.log('[minitool] 已修复 index.html：移除 type="module" / crossorigin，修正脚本路径，注入 minitool 标记')

// 2. 校验 JS 为经典脚本（检查顶部和底部特征）
const jsPath = join(distDir, 'game.js')
const js = readFileSync(jsPath, 'utf-8')

// 检查 IIFE 特征
const isIIFE = js.trimStart().startsWith('(function(') || js.includes('var Phaser = ')
console.log(`[minitool] JS 格式检测：${isIIFE ? 'IIFE 经典脚本 ✓' : '需要确认 ✗'}`)

// 检查是否残留 import/export 关键字（排除字符串中的 import）
const importMatch = js.match(/\nimport\s/)
const exportMatch = js.match(/\nexport\s/)
if (importMatch) console.log('[minitool] 警告：JS 中存在 import 语句')
if (exportMatch) console.log('[minitool] 警告：JS 中存在 export 语句')

// 检查禁止的 API
const forbiddenPatterns = [
  { pattern: /fetch\s*\(/, name: 'fetch()' },
  { pattern: /eval\s*\(/, name: 'eval()' },
  { pattern: /new\s+Function\s*\(/, name: 'new Function()' },
  { pattern: /new\s+Worker\s*\(/, name: 'new Worker()' },
  { pattern: /navigator\.geolocation/, name: 'navigator.geolocation' },
  { pattern: /WebSocket\s*\(/, name: 'WebSocket()' },
  { pattern: /window\.open\s*\(/, name: 'window.open()' },
  { pattern: /XMLHttpRequest/, name: 'XMLHttpRequest' },
  { pattern: /navigator\.clipboard/, name: 'navigator.clipboard' },
]

console.log('[minitool] 禁止 API 扫描：')
let hasForbidden = false
for (const { pattern, name } of forbiddenPatterns) {
  if (pattern.test(js)) {
    console.log(`  ✗ ${name} 存在`)
    hasForbidden = true
  }
}
if (!hasForbidden) console.log('  ✓ 无禁止 API')

// 3. 检查文件类型合规性
function walkDir(dir, results = []) {
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      walkDir(fullPath, results)
    } else {
      results.push(fullPath)
    }
  }
  return results
}

// 路径安全校验：规范化后路径不能包含 ".."、不能以 "/" 开头
// Windows 文件系统使用 "\"，打 zip 时会统一转为 "/"，这里先规范化再检查
function checkPathSafety(filePath, baseDir) {
  const relPath = filePath.replace(baseDir, '').replace(/^[\\/]/, '').replace(/\\/g, '/')
  const issues = []
  if (relPath.includes('..')) issues.push('包含 ".."')
  if (relPath.startsWith('/')) issues.push('以 "/" 开头')
  return issues
}

const allowedExts = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json', '.mp3', '.mp4', '.webm', '.ogg', '.wav'])
const allFiles = walkDir(distDir)
const disallowedFiles = allFiles.filter(f => {
  const ext = f.slice(f.lastIndexOf('.')).toLowerCase()
  // 开发垃圾文件
  if (f.endsWith('.map') || f.endsWith('.DS_Store')) return true
  if (f.includes('node_modules')) return true
  if (f.endsWith('.md') || f.endsWith('.txt')) return true
  if (!allowedExts.has(ext)) return true
  return false
})

// 自动删除不合规文件
for (const f of disallowedFiles) {
  try { unlinkSync(f); console.log(`  🗑 已删除 ${f.replace(distDir, '')}`) } catch {}
}

// 重新扫描
const allFilesFinal = walkDir(distDir)

if (disallowedFiles.length > 0) {
  console.log(`[minitool] 已清理 ${disallowedFiles.length} 个不合规文件`)
} else {
  console.log('[minitool] ✓ 所有文件类型合规')
}

// 3.5 资源优化：删除 mp4 + 压缩大 PNG
console.log('[minitool] 资源优化：')
// 删除 title_bg.mp4（游戏有 PNG 和程序化背景降级，mp4 在容器 CSP 中可能不支持）
const mp4Files = allFilesFinal.filter(f => f.endsWith('.mp4'))
for (const f of mp4Files) {
  unlinkSync(f)
  console.log(`  🗑 已删除 ${f.replace(distDir, '')}`)
}

// 批量压缩大 PNG（>30KB），使用调色板模式
const largePngs = allFilesFinal.filter(f => f.endsWith('.png') && statSync(f).size > 30 * 1024)
console.log(`  发现 ${largePngs.length} 个大 PNG 需要优化`)
let pngSaved = 0
for (const file of largePngs) {
  const before = statSync(file).size
  const tmpFile = file + '.opt.tmp'
  await sharp(file)
    .png({ quality: 80, compressionLevel: 9, palette: true, effort: 10 })
    .toFile(tmpFile)
  const after = statSync(tmpFile).size
  if (after < before) {
    copyFileSync(tmpFile, file)
    unlinkSync(tmpFile)
    pngSaved += before - after
  } else {
    unlinkSync(tmpFile)
  }
}
if (pngSaved > 0) {
  console.log(`  ✓ PNG 优化完成，节省 ${(pngSaved / 1024 / 1024).toFixed(2)} MB`)
}

// 3.6 精灵图集打包：将散装 PNG 合并为 Atlas，减少文件数至 200 以内
console.log('[minitool] 精灵图集打包：')
try {
  execSync('node scripts/pack-atlas.mjs', { cwd: process.cwd(), stdio: 'inherit' })
} catch (e) {
  console.log('[minitool] 警告：图集打包失败')
}

// 重新扫描（打包后文件列表大幅变化）
const allFilesOptimized = walkDir(distDir)

// 路径安全校验
console.log('[minitool] 路径安全校验：')
let hasUnsafePath = false
for (const f of allFilesOptimized) {
  const issues = checkPathSafety(f, distDir)
  if (issues.length > 0) {
    const relPath = f.replace(distDir, '').replace(/^[\\/]/, '').replace(/\\/g, '/')
    console.log(`  ✗ ${relPath} → ${issues.join('、')}`)
    hasUnsafePath = true
  }
}
if (!hasUnsafePath) console.log('  ✓ 所有文件路径安全（无 ".."、无前导 "/"）')

// 4. 统计 zip 大小（估算）
let totalSize = 0
for (const f of allFilesOptimized) totalSize += statSync(f).size
const fileCount = allFilesOptimized.length
console.log(`[minitool] 文件数量：${fileCount}`)
console.log(`[minitool] 总包体积：${(totalSize / 1024 / 1024).toFixed(2)} MB（未压缩）`)
if (fileCount > 200) {
  console.log(`[minitool] 警告：文件数量 ${fileCount} 超过 200 上限`)
}
if (totalSize > 10 * 1024 * 1024) {
  console.log('[minitool] 警告：未压缩体积超过 10MB，zip 后可能超限')
}

// 5. 打包 zip（使用 tar 确保 zip 内路径使用 "/" 分隔符，不含 "\" 或 ".."）
const zipPath = join(process.cwd(), 'dist-minitool.zip')
try {
  execSync(`tar -caf "${zipPath}" *`, { cwd: distDir, stdio: 'pipe' })
  const zipSize = statSync(zipPath).size
  console.log(`[minitool] ✓ 已创建 dist-minitool.zip (${(zipSize / 1024 / 1024).toFixed(2)} MB)`)
  console.log('[minitool]   zip 内路径使用 "/" 分隔符，无 "\\" 或 ".."')
} catch (e) {
  console.log('[minitool] 警告：tar 打包失败，请手动创建 zip 并确保路径使用 "/" 分隔符')
}

console.log('[minitool] 后处理完成。')
