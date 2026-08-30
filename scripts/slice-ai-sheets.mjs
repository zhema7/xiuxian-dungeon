// ---------- AI 精灵表切片 + 背景去除 + 降采样 ----------
// 将 1920x1920 AI 精灵表切为 48x48 或 32x32 独立帧 PNG

import sharp from 'sharp'
import { mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// 源素材统一目录见 docs/art/asset-directory-spec.md：AI 原始精灵表 → assets/source/ai-sheets
const aiDir = join(here, '..', 'assets', 'source', 'ai-sheets')
const spritesDir = join(here, '..', 'public', 'sprites')

// ========== 配置 ==========

const ENEMY_TARGET = 48   // 敌人每帧目标尺寸
const EFFECT_TARGET = 48  // 特效每帧目标尺寸
const TERRAIN_TARGET = 32 // 地形每块目标尺寸
const CELL_SIZE = 480     // AI 图 4x4 网格每格 480px
const BIG_CELL = 960      // 2x2 网格每格 960px

// 背景去除参数
function chromaKey(raw, width, height, bgType) {
  const out = Buffer.alloc(width * height * 4)
  let bgR, bgG, bgB, thresh, edgeWidth
  if (bgType === 'navy') {
    bgR = 10; bgG = 22; bgB = 40; thresh = 55; edgeWidth = 35
  } else if (bgType === 'black') {
    bgR = 0; bgG = 0; bgB = 0; thresh = 28; edgeWidth = 25
  } else {
    bgR = 0; bgG = 0; bgB = 0; thresh = 28; edgeWidth = 25
  }

  for (let i = 0, j = 0; i < raw.length; i += 3, j += 4) {
    const r = raw[i], g = raw[i + 1], b = raw[i + 2]
    const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2)
    let alpha = 255
    if (dist < thresh) {
      alpha = 0
    } else if (dist < thresh + edgeWidth) {
      alpha = Math.round(255 * (dist - thresh) / edgeWidth)
    }
    // 也检测纯暗色像素（低亮度）
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    if (bgType === 'black' && lum < 12) alpha = 0
    if (bgType === 'navy' && lum < 18 && dist < 45) alpha = Math.min(alpha, 0)

    out[j] = r
    out[j + 1] = g
    out[j + 2] = b
    out[j + 3] = alpha
  }
  return out
}

// 色彩量化（减少颜色数，增强像素风）
function posterize(raw, levels = 5) {
  const step = 255 / (levels - 1)
  for (let i = 0; i < raw.length; i += 4) {
    if (raw[i + 3] === 0) continue
    raw[i] = Math.round(Math.round(raw[i] / step) * step)
    raw[i + 1] = Math.round(Math.round(raw[i + 1] / step) * step)
    raw[i + 2] = Math.round(Math.round(raw[i + 2] / step) * step)
  }
  return raw
}

// 处理单个 cell：切片 → 降采样 → 去背景 → 量化
async function processCell(imgBuf, left, top, cellW, cellH, target, bgType, posterizeFlag = true) {
  // 1. 提取区域
  let extracted = await sharp(imgBuf)
    .extract({ left: Math.round(left), top: Math.round(top), width: Math.round(cellW), height: Math.round(cellH) })
    .resize(target, target, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer()

  // 2. 色度键去除背景
  const rgba = chromaKey(extracted, target, target, bgType)

  // 3. 色彩量化（增强像素风）
  const final = posterizeFlag ? posterize(rgba, 6) : rgba

  // 4. 编码 PNG
  const png = await sharp(final, { raw: { width: target, height: target, channels: 4 } })
    .png({ palette: false, compressionLevel: 9 })
    .toBuffer()

  return png
}

// 处理整张精灵表
async function processSheet(fileName, gridN, cellSize, target, bgType, outDir, namePrefix, posterizeFlag = true) {
  const imgPath = join(aiDir, fileName + '.jpg')
  if (!existsSync(imgPath)) {
    console.log(`  跳过（文件不存在）: ${fileName}`)
    return []
  }

  const imgBuf = await sharp(imgPath).jpeg().toBuffer()
  const results = []
  let count = 0

  for (let row = 0; row < gridN; row++) {
    for (let col = 0; col < gridN; col++) {
      const left = col * cellSize
      const top = row * cellSize
      const frameNum = row * gridN + col + 1
      const outName = `${namePrefix}_${frameNum}.png`
      const outPath = join(outDir, outName)

      const png = await processCell(imgBuf, left, top, cellSize, cellSize, target, bgType, posterizeFlag)
      const fs = await import('node:fs')
      fs.writeFileSync(outPath, png)
      count++
      results.push(outName)
    }
  }

  console.log(`  ${fileName}: ${count} 帧已切片`)
  return results
}

// 生成单帧精灵表（从 2x2 网格提取）
async function processBigSheet(fileName, target, bgType, outDir, namePrefixes) {
  const imgPath = join(aiDir, fileName + '.jpg')
  if (!existsSync(imgPath)) {
    console.log(`  跳过（文件不存在）: ${fileName}`)
    return
  }

  const imgBuf = await sharp(imgPath).jpeg().toBuffer()
  const cellSize = BIG_CELL

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const idx = row * 2 + col
      if (idx >= namePrefixes.length) continue
      const left = col * cellSize
      const top = row * cellSize
      const outPath = join(outDir, namePrefixes[idx] + '.png')

      const png = await processCell(imgBuf, left, top, cellSize, cellSize, target, bgType, true)
      const fs = await import('node:fs')
      fs.writeFileSync(outPath, png)
      console.log(`  ${namePrefixes[idx]} 已生成`)
    }
  }
}

// ========== 主流程 ==========

async function main() {
  console.log('=== AI 精灵表切片处理 ===\n')

  // 创建输出目录
  const dirs = [
    join(spritesDir, 'xian'),
    join(spritesDir, 'terrain'),
  ]
  for (const d of dirs) mkdirSync(d, { recursive: true })

  // ---- 1. 仙界敌人精灵表 (4x4 grid, navy bg, 48x48 target) ----
  console.log('--- 仙界敌人 ---')
  const enemySheets = [
    { file: 'xian_sanxian_m_sheet', prefix: 'xian_sanxian_m' },
    { file: 'xian_sanxian_f_sheet', prefix: 'xian_sanxian_f' },
    { file: 'xian_zhenxian_m_sheet', prefix: 'xian_zhenxian_m' },
    { file: 'xian_zhenxian_f_sheet', prefix: 'xian_zhenxian_f' },
    { file: 'xian_jinxian_m_sheet', prefix: 'xian_jinxian_m' },
    { file: 'xian_jinxian_f_sheet', prefix: 'xian_jinxian_f' },
    { file: 'xian_tong_nan_sheet', prefix: 'xian_tong_nan' },
    { file: 'xian_tong_nv_sheet', prefix: 'xian_tong_nv' },
    { file: 'beast_crane_sheet', prefix: 'beast_crane' },
    { file: 'beast_deer_sheet', prefix: 'beast_deer' },
    { file: 'beast_pixiu_sheet', prefix: 'beast_pixiu' },
    { file: 'beast_phoenix_sheet', prefix: 'beast_phoenix' },
    { file: 'boss_xianzun_sheet', prefix: 'boss_xianzun' },
  ]
  for (const s of enemySheets) {
    await processSheet(s.file, 4, CELL_SIZE, ENEMY_TARGET, 'navy', join(spritesDir, 'xian'), s.prefix, true)
  }

  // ---- 2. 攻击特效精灵表 (4x4 grid, black bg, 48x48 target) ----
  console.log('\n--- 攻击特效 ---')
  const effectSheets = [
    { file: 'slash_sheet', prefix: 'ai_slash', outSub: '' },
    { file: 'sword_proj_sheet', prefix: 'ai_sword_proj', outSub: '' },
    { file: 'bolt_fly_sheet', prefix: 'ai_bolt_fly', outSub: '' },
    { file: 'proj_fx_sheet', prefix: 'ai_proj_fx', outSub: '' },
    { file: 'mod_effects_sheet', prefix: 'ai_mod', outSub: '' },
    { file: 'burst_rune_sheet', prefix: 'ai_burst', outSub: '' },
  ]
  for (const s of effectSheets) {
    await processSheet(s.file, 4, CELL_SIZE, EFFECT_TARGET, 'black', spritesDir, s.prefix, false)
  }

  // ---- 3. 仙界地形瓷砖 (4x4 grid, black bg, 32x32 target) ----
  console.log('\n--- 仙界地形 ---')
  const xianTerrainNames = [
    'xj_floor_base', 'xj_floor_var1', 'xj_floor_var2', 'xj_floor_var3',
    'xj_wall_top', 'xj_wall_side', 'xj_wall_corner_tl', 'xj_wall_pillar',
    'xj_water_1', 'xj_water_2', 'xj_water_3', 'xj_water_4',
    'xj_floor_deco_1', 'xj_floor_deco_2', 'xj_floor_deco_3', 'xj_floor_deco_4',
  ]
  await processSheet('xian_terrain_sheet', 4, CELL_SIZE, TERRAIN_TARGET, 'black', join(spritesDir, 'terrain'), 'xj_ai', false)

  // 重命名地形帧为正式名称
  const fs = await import('node:fs')
  for (let i = 0; i < 16; i++) {
    const oldName = join(spritesDir, 'terrain', `xj_ai_${i + 1}.png`)
    const newName = join(spritesDir, 'terrain', `${xianTerrainNames[i]}.png`)
    if (fs.existsSync(oldName)) {
      // 备份旧文件
      if (fs.existsSync(newName)) {
        fs.renameSync(newName, newName + '.bak')
      }
      fs.renameSync(oldName, newName)
    }
  }
  console.log('  仙界地形瓷砖已重命名')

  // ---- 4. 仙界传送门和背景 (2x2 grid, black bg) ----
  console.log('\n--- 仙界传送门和背景 ---')
  await processBigSheet('xian_portal_bg_sheet', 96, 'black', spritesDir, [
    'portal_xian',       // 传送门
    'cave_bg_xian',      // 背景
    'chest_xian',        // 宝箱
    'altar_xian',        // 祭坛
  ])

  console.log('\n=== 全部切片完成 ===')
}

main().catch(e => { console.error(e); process.exit(1) })
