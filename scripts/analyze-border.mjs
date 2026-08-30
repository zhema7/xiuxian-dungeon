// 分析NPC精灵图集的边框位置
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const srcBuf = readFileSync(join(spritesDir, 'npc_spritesheet_new.png'))
const meta = await sharp(srcBuf).metadata()
const rawBuf = await sharp(srcBuf).ensureAlpha().raw().toBuffer()
const W = meta.width // 1920

// 检查第一个cell (row=0, col=0) 的边缘像素
const CELL = 480
const cellX = 0, cellY = 0

console.log('=== Cell(0,0) 边缘扫描 ===')
console.log('\n--- 顶部边缘 (y=0~30, x=240 中间) ---')
for (let y = 0; y < 30; y++) {
  const x = 240
  const idx = ((cellY + y) * W + (cellX + x)) * 4
  const r = rawBuf[idx], g = rawBuf[idx + 1], b = rawBuf[idx + 2], a = rawBuf[idx + 3]
  console.log(`  y=${y}: R=${r} G=${g} B=${b} A=${a}`)
}

console.log('\n--- 左侧边缘 (x=0~30, y=240 中间) ---')
for (let x = 0; x < 30; x++) {
  const y = 240
  const idx = ((cellY + y) * W + (cellX + x)) * 4
  const r = rawBuf[idx], g = rawBuf[idx + 1], b = rawBuf[idx + 2], a = rawBuf[idx + 3]
  console.log(`  x=${x}: R=${r} G=${g} B=${b} A=${a}`)
}

console.log('\n--- 角落区域 (x=0~15, y=0~15) ---')
for (let y = 0; y < 15; y++) {
  let line = `  y=${y}: `
  for (let x = 0; x < 15; x++) {
    const idx = ((cellY + y) * W + (cellX + x)) * 4
    const a = rawBuf[idx + 3]
    line += a > 0 ? 'X' : '.'
  }
  console.log(line)
}
