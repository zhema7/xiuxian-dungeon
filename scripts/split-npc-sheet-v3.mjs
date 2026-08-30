// 切割NPC精灵图集 v3：自动清除边框 + 精确裁切角色区域
// 输入: npc_spritesheet_new.png (1920×1920, 4×4网格, 480×480/格)
// 处理: 1.提取每格 2.清除深色边框像素 3.按alpha裁切角色区域 4.输出透明PNG
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const INPUT = 'npc_spritesheet_new.png'
const SHEET_SIZE = 1920
const CELL = 480
const INSET = 6  // 初始内缩，避开最外层网格线

const NPC_MAP = [
  { row: 0, col: 0, name: 'npc_auctioneer' },
  { row: 0, col: 1, name: 'npc_arena' },
  { row: 0, col: 2, name: 'npc_honor' },
  { row: 0, col: 3, name: 'npc_quest1' },
  { row: 1, col: 0, name: 'npc_quest2' },
  { row: 1, col: 1, name: 'npc_quest3' },
  { row: 1, col: 2, name: 'npc_city_lord' },
  { row: 1, col: 3, name: 'npc_arena_champion' },
  { row: 2, col: 0, name: 'npc_merchant' },
  { row: 2, col: 1, name: 'npc_elder' },
  { row: 2, col: 2, name: 'npc_blacksmith' },
]

async function main() {
  const srcPath = join(spritesDir, INPUT)
  const srcBuf = readFileSync(srcPath)
  const meta = await sharp(srcBuf).metadata()
  const W = meta.width, H = meta.height
  console.log(`Source: ${W}×${H}, channels: ${meta.channels}`)

  // 读取整张图的原始像素
  const rawBuf = await sharp(srcBuf).ensureAlpha().raw().toBuffer()

  for (const npc of NPC_MAP) {
    const cellX = npc.col * CELL + INSET
    const cellY = npc.row * CELL + INSET
    const cellW = CELL - INSET * 2
    const cellH = CELL - INSET * 2

    // 提取cell像素到独立buffer
    const cellBuf = Buffer.alloc(cellW * cellH * 4, 0)
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        const srcIdx = ((cellY + y) * W + (cellX + x)) * 4
        const dstIdx = (y * cellW + x) * 4
        cellBuf[dstIdx] = rawBuf[srcIdx]
        cellBuf[dstIdx + 1] = rawBuf[srcIdx + 1]
        cellBuf[dstIdx + 2] = rawBuf[srcIdx + 2]
        cellBuf[dstIdx + 3] = rawBuf[srcIdx + 3]
      }
    }

    // 清除深色边框：扫描边缘区域，将深色像素设为透明
    // 边框特征：R,G,B都较低（深灰/黑色），且出现在边缘
    const BORDER_DEPTH = 100  // RGB平均值低于此值视为深色
    const SCAN_WIDTH = 30     // 从边缘向内扫描30px

    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        const idx = (y * cellW + x) * 4
        const a = cellBuf[idx + 3]
        if (a === 0) continue

        const r = cellBuf[idx]
        const g = cellBuf[idx + 1]
        const b = cellBuf[idx + 2]
        const brightness = (r + g + b) / 3

        // 判断是否在边缘区域
        const nearEdge = x < SCAN_WIDTH || x >= cellW - SCAN_WIDTH ||
                         y < SCAN_WIDTH || y >= cellH - SCAN_WIDTH

        if (nearEdge && brightness < BORDER_DEPTH && a > 0) {
          // 深色边缘像素 → 设为透明
          cellBuf[idx + 3] = 0
        }
      }
    }

    // 再次清除：连通的深色像素（从已清除的边缘向内flood fill）
    // 简化版：再扫描一轮，清除与边缘相邻的深色像素
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 1; y < cellH - 1; y++) {
        for (let x = 1; x < cellW - 1; x++) {
          const idx = (y * cellW + x) * 4
          const a = cellBuf[idx + 3]
          if (a === 0) continue

          const r = cellBuf[idx]
          const g = cellBuf[idx + 1]
          const b = cellBuf[idx + 2]
          const brightness = (r + g + b) / 3

          if (brightness < BORDER_DEPTH) {
            // 检查4邻是否有透明像素
            const neighbors = [
              (y * cellW + (x - 1)) * 4 + 3,
              (y * cellW + (x + 1)) * 4 + 3,
              ((y - 1) * cellW + x) * 4 + 3,
              ((y + 1) * cellW + x) * 4 + 3,
            ]
            if (neighbors.some(nIdx => cellBuf[nIdx] === 0)) {
              cellBuf[idx + 3] = 0
            }
          }
        }
      }
    }

    // 按alpha通道找角色bounding box
    let minX = cellW, minY = cellH, maxX = -1, maxY = -1
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        const idx = (y * cellW + x) * 4 + 3
        if (cellBuf[idx] > 10) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    if (maxX < 0) {
      console.log(`  [warn] ${npc.name}: no content found, using blank`)
      const outBuf = await sharp(Buffer.alloc(64 * 64 * 4, 0), { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer()
      writeFileSync(join(spritesDir, `${npc.name}.png`), outBuf)
      continue
    }

    const charW = maxX - minX + 1
    const charH = maxY - minY + 1

    // 裁切角色区域 + 保存
    const outBuf = await sharp(cellBuf, { raw: { width: cellW, height: cellH, channels: 4 } })
      .extract({ left: minX, top: minY, width: charW, height: charH })
      .png({ compressionLevel: 9 })
      .toBuffer()

    writeFileSync(join(spritesDir, `${npc.name}.png`), outBuf)
    console.log(`  ✓ ${npc.name}.png (${charW}×${charH})`)
  }

  console.log('\n[NPC v3] Done! 11 sprites extracted with border removal.')
}

await main()
