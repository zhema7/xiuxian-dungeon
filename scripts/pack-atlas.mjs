import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const distDir = path.join(process.cwd(), 'dist-minitool')
const spritesDir = path.join(distDir, 'sprites')
const MAX_SIZE = 2048
const PADDING = 2

const EXCLUDE_ROOT = new Set([
  'fairy_spritesheet.png', 'fairy_atlas.json', 'fairy_anims.json',
  'sword_spritesheet.png', 'sword_atlas.json', 'sword_anims.json',
])

function getFrameName(dir, filename) {
  const base = filename.replace(/\.png$/, '')
  if (dir === 'v4') return `v4/${base}`
  if (dir === 'terrain') return `terrain_${base}`
  return base
}

function readPngs(dir) {
  const fullDir = path.join(spritesDir, dir)
  if (!fs.existsSync(fullDir)) return []
  return fs.readdirSync(fullDir)
    .filter(f => f.endsWith('.png') && (dir !== '' || !EXCLUDE_ROOT.has(f)))
    .map(f => ({ file: f, path: path.join(fullDir, f) }))
}

async function getPngSizes(files) {
  const result = []
  for (const f of files) {
    const meta = await sharp(f.path).metadata()
    result.push({ ...f, w: meta.width, h: meta.height })
  }
  return result
}

function shelfPack(sprites, maxW, maxH) {
  const sheets = []
  let current = { x: 0, y: 0, rowH: 0, sprites: [], w: 0, h: 0 }

  for (const s of sprites) {
    if (current.x + s.w > maxW) {
      current.x = 0
      current.y += current.rowH
      current.rowH = 0
    }
    if (current.y + s.h > maxH) {
      sheets.push(current)
      current = { x: 0, y: 0, rowH: 0, sprites: [], w: 0, h: 0 }
    }
    current.sprites.push({ ...s, x: current.x, y: current.y })
    current.x += s.w + PADDING
    current.rowH = Math.max(current.rowH, s.h)
    current.w = Math.max(current.w, current.x)
    current.h = Math.max(current.h, current.y + s.h)
  }
  if (current.sprites.length > 0) sheets.push(current)
  return sheets
}

async function buildAtlas(sheets, atlasName, dir) {
  const results = []
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i]
    const idx = sheets.length > 1 ? `_${i + 1}` : ''
    const pngName = `${atlasName}${idx}.png`
    const jsonName = `${atlasName}${idx}.json`
    const pngPath = path.join(spritesDir, pngName)
    const jsonPath = path.join(spritesDir, jsonName)

    const sheetW = Math.min(MAX_SIZE, Math.ceil(sheet.w / 64) * 64)
    const sheetH = Math.min(MAX_SIZE, Math.ceil(sheet.h / 64) * 64)

    const composites = []
    for (const s of sheet.sprites) {
      composites.push({ input: s.path, left: s.x, top: s.y })
    }

    await sharp({
      create: { width: sheetW, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).composite(composites).png({ compressionLevel: 9 }).toFile(pngPath)

    const frames = {}
    for (const s of sheet.sprites) {
      const frameName = getFrameName(dir, s.file)
      frames[frameName] = {
        frame: { x: s.x, y: s.y, w: s.w, h: s.h },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: s.w, h: s.h },
        sourceSize: { w: s.w, h: s.h }
      }
    }

    const json = {
      frames,
      meta: { image: pngName, size: { w: sheetW, h: sheetH }, scale: 1 }
    }
    fs.writeFileSync(jsonPath, JSON.stringify(json))

    // Delete original PNGs
    for (const s of sheet.sprites) {
      fs.unlinkSync(s.path)
    }

    const pngSize = (fs.statSync(pngPath).size / 1024).toFixed(0)
    console.log(`  ${pngName}: ${sheet.sprites.length} sprites, ${pngSize} KB`)
    results.push({ pngName, jsonName, count: sheet.sprites.length })
  }
  return results
}

console.log('[pack-atlas] 开始打包精灵图集...')

// 1. Root sprites
const rootPngs = readPngs('')
if (rootPngs.length > 0) {
  const rootSprites = (await getPngSizes(rootPngs)).sort((a, b) => b.h - a.h)
  const rootSheets = shelfPack(rootSprites, MAX_SIZE, MAX_SIZE)
  console.log(`[pack-atlas] 根目录: ${rootSprites.length} 个 PNG → ${rootSheets.length} 个图集`)
  await buildAtlas(rootSheets, 'atlas_main', '')
}

// 2. v4 sprites
const v4Pngs = readPngs('v4')
if (v4Pngs.length > 0) {
  const v4Sprites = (await getPngSizes(v4Pngs)).sort((a, b) => b.h - a.h)
  const v4Sheets = shelfPack(v4Sprites, MAX_SIZE, MAX_SIZE)
  console.log(`[pack-atlas] v4: ${v4Sprites.length} 个 PNG → ${v4Sheets.length} 个图集`)
  await buildAtlas(v4Sheets, 'atlas_v4', 'v4')
}

// 3. xian sprites
const xianPngs = readPngs('xian')
if (xianPngs.length > 0) {
  const xianSprites = (await getPngSizes(xianPngs)).sort((a, b) => b.h - a.h)
  const xianSheets = shelfPack(xianSprites, MAX_SIZE, MAX_SIZE)
  console.log(`[pack-atlas] xian: ${xianSprites.length} 个 PNG → ${xianSheets.length} 个图集`)
  await buildAtlas(xianSheets, 'atlas_xian', 'xian')
}

// 4. terrain sprites
const terrainPngs = readPngs('terrain')
if (terrainPngs.length > 0) {
  const terrainSprites = (await getPngSizes(terrainPngs)).sort((a, b) => b.h - a.h)
  const terrainSheets = shelfPack(terrainSprites, MAX_SIZE, MAX_SIZE)
  console.log(`[pack-atlas] terrain: ${terrainSprites.length} 个 PNG → ${terrainSheets.length} 个图集`)
  await buildAtlas(terrainSheets, 'atlas_terrain', 'terrain')
}

// Clean up empty directories
for (const d of ['v4', 'xian', 'terrain']) {
  const dirPath = path.join(spritesDir, d)
  if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length === 0) {
    fs.rmdirSync(dirPath)
    console.log(`[pack-atlas] 已清理空目录: ${d}/`)
  }
}

// Count remaining files
const remaining = []
function walkDir(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) walkDir(full)
    else remaining.push(full)
  }
}
walkDir(spritesDir)
console.log(`[pack-atlas] sprites 目录剩余文件: ${remaining.length} 个`)
console.log('[pack-atlas] 打包完成。')
