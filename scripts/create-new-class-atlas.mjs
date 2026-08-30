// 将 2240x1680 AI 生成精灵图裁切为 768x512 atlas 格式
// 提取 idle/walk/attack/cast 四个动作帧，resize 为 64x64
import sharp from 'sharp'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const tmpDir = join(spritesDir, '_tmp_atlas')
mkdirSync(tmpDir, { recursive: true })

const FRAME = 64
const ATLAS_W = 768  // 12 columns
const ATLAS_H = 512   // 8 rows
const COLS = 12
const ROWS = 8

// 原始精灵图布局：8 行，每行 210px
// Row 0: idle, Row 1: walk, Row 3: attack, Row 4: cast
const SRC_W = 2240
const SRC_H = 1680
const ROW_H = SRC_H / 8  // 210

// 从每行中心区域提取角色图像
function extractCenter(rowIdx) {
  const y = Math.round(rowIdx * ROW_H)
  const h = Math.round(ROW_H)
  // 中心区域宽度 400px，足够包含角色
  const x = Math.round((SRC_W - 400) / 2)
  const w = 400
  return { left: x, top: y, width: w, height: h }
}

async function processClass(classId, srcFile) {
  console.log(`[atlas] 处理 ${classId} from ${srcFile}...`)
  const srcBuf = readFileSync(join(spritesDir, srcFile))

  // 提取 4 个动作帧
  const poses = {}
  for (const [action, row] of [['idle', 0], ['walk', 1], ['attack', 3], ['cast', 4]]) {
    const region = extractCenter(row)
    const buf = await sharp(srcBuf)
      .extract(region)
      .resize(FRAME, FRAME, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer()
    poses[action] = buf
  }

  // 构建 768x512 atlas 图
  // 布局：4 个方向（down, left, right, up），每个方向 2 行（8帧）
  // Row 0-1: down (idle, walk, attack, cast 各重复)
  // Row 2-3: left
  // Row 4-5: right
  // Row 6-7: up
  const directions = ['down', 'left', 'right', 'up']
  const actions = ['idle', 'walk', 'attack', 'cast']
  const frames = []

  // 用 sharp composite 构建
  let composites = []
  for (let d = 0; d < 4; d++) {
    for (let a = 0; a < 4; a++) {
      // 每个方向有 2 行，每行 6 帧 = 12 帧per direction
      // idle: frames 0-5, walk: frames 6-11 (row 0)
      // attack: frames 0-5, cast: frames 6-11 (row 1)
      const dirIdx = d * 2  // 行偏移
      const pose = poses[actions[a]]

      // 行 0: idle (6帧) + walk (6帧)
      for (let f = 0; f < 6; f++) {
        const x = (f + (a >= 2 ? 6 : 0)) * FRAME
        const y = (dirIdx + (a % 2)) * FRAME
        composites.push({ input: pose, left: x, top: y })
      }
    }
  }

  // 创建底图并合成所有帧
  const atlas = await sharp({
    create: { width: ATLAS_W, height: ATLAS_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(composites).png({ compressionLevel: 9 }).toBuffer()

  const atlasPath = join(spritesDir, `${classId}_spritesheet.png`)
  writeFileSync(atlasPath, atlas)
  console.log(`  ✓ ${classId}_spritesheet.png (${ATLAS_W}x${ATLAS_H})`)

  // 生成 atlas JSON
  const atlasJson = { textures: [{ imageName: `${classId}_spritesheet.png`, width: ATLAS_W, height: ATLAS_H, frames: [] }] }
  for (const dir of directions) {
    for (const action of actions) {
      const actionRow = actions.indexOf(action)
      const dirRow = directions.indexOf(dir)
      for (let f = 0; f < 6; f++) {
        const frameCol = f + (actionRow >= 2 ? 6 : 0)
        const frameRow = dirRow * 2 + (actionRow % 2)
        atlasJson.textures[0].frames.push({
          frame: { x: frameCol * FRAME, y: frameRow * FRAME, w: FRAME, h: FRAME },
          spriteSourceSize: { x: 0, y: 0, w: FRAME, h: FRAME },
          sourceSize: { w: FRAME, h: FRAME },
          rotated: false, trimmed: false,
          filename: `${classId}_${dir}_${action}_${String(f).padStart(2, '0')}`,
        })
      }
    }
  }
  const atlasJsonPath = join(spritesDir, `${classId}_atlas.json`)
  writeFileSync(atlasJsonPath, JSON.stringify(atlasJson))
  console.log(`  ✓ ${classId}_atlas.json (${atlasJson.textures[0].frames.length} frames)`)

  // 生成 anims JSON
  const animsJson = {}
  for (const dir of directions) {
    for (const action of actions) {
      const key = `${classId}_${dir}_${action}`
      animsJson[key] = {
        key,
        frames: Array.from({ length: 6 }, (_, i) => ({
          key: `${classId}_atlas`,
          frame: `${classId}_${dir}_${action}_${String(i).padStart(2, '0')}`,
        })),
        frameRate: action === 'idle' ? 4 : action === 'walk' ? 8 : 10,
        repeat: action === 'idle' || action === 'walk' ? -1 : 0,
      }
    }
  }
  const animsJsonPath = join(spritesDir, `${classId}_anims.json`)
  writeFileSync(animsJsonPath, JSON.stringify(animsJson, null, 2))
  console.log(`  ✓ ${classId}_anims.json (${Object.keys(animsJson).length} animations)`)

  // 删除旧的独立精灵图（已被 atlas 替代）
  const oldFile = join(spritesDir, srcFile)
  if (existsSync(oldFile)) {
    try { require('node:fs').unlinkSync(oldFile) } catch {}
    console.log(`  ✓ 删除旧文件 ${srcFile}`)
  }
}

// 处理两个新职业
await processClass('sword_new', 'sword_new_spritesheet.png')
await processClass('fairy_new', 'fairy_new_spritesheet.png')

console.log('[atlas] 完成！')
