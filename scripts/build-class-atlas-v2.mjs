// 构建道修/合欢 atlas（透明背景版，5行×6列网格）
// 输入: fairy_new_anim_grid.png / sword_new_anim_grid.png (2688×2240, 5×6=30帧, 448×448/帧)
// 输出: {class}_spritesheet.png + {class}_atlas.json + {class}_anims.json
//
// 网格行映射（取前4行）:
//   Row 0 = idle (6帧), Row 1 = walk (6帧)
//   Row 2 = attack (6帧), Row 3 = cast (6帧)
//   Row 4 = ultimate/special (跳过)
//
// Atlas 布局（与 sword/fairy 一致，768×512）:
//   Row 0,2,4,6: idle(0-5) + walk(6-11)
//   Row 1,3,5,7: attack(0-5) + cast(6-11)

import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const spritesDir = join(process.cwd(), 'public', 'sprites')
const GRID_W = 2688
const GRID_H = 2240
const CELL = 448
const GRID_COLS = 6
const GRID_ROWS = 5  // 新网格5行
const FRAME = 64
const ATLAS_W = 768
const ATLAS_H = 512
const ATLAS_COLS = 12
const ATLAS_ROWS = 8

const directions = ['down', 'left', 'right', 'up']
const actions = ['idle', 'walk', 'attack', 'cast']

async function extractFrames(gridFile) {
  const srcBuf = readFileSync(join(spritesDir, gridFile))
  const meta = await sharp(srcBuf).metadata()
  const W = meta.width, H = meta.height
  console.log(`  Grid: ${W}×${H}, channels: ${meta.channels}`)
  const rawBuf = await sharp(srcBuf).ensureAlpha().raw().toBuffer()
  const frames = []

  for (let gr = 0; gr < GRID_ROWS; gr++) {
    for (let gc = 0; gc < GRID_COLS; gc++) {
      const cellX = gc * CELL
      const cellY = gr * CELL

      // 直接用 alpha 通道判断透明区域（无需 chroma key）
      const cellBuf = Buffer.alloc(CELL * CELL * 4, 0)
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const srcIdx = ((cellY + y) * W + (cellX + x)) * 4
          const dstIdx = (y * CELL + x) * 4
          cellBuf[dstIdx] = rawBuf[srcIdx]
          cellBuf[dstIdx + 1] = rawBuf[srcIdx + 1]
          cellBuf[dstIdx + 2] = rawBuf[srcIdx + 2]
          cellBuf[dstIdx + 3] = rawBuf[srcIdx + 3]
        }
      }

      // 用 alpha 通道找角色 bounding box
      let minX = CELL, minY = CELL, maxX = -1, maxY = -1
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const idx = (y * CELL + x) * 4 + 3
          if (cellBuf[idx] > 10) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }

      if (maxX < 0) {
        console.log(`  [warn] Cell(${gr},${gc}) empty, using blank frame`)
        frames.push(Buffer.alloc(FRAME * FRAME * 4, 0))
        continue
      }

      const charW = maxX - minX + 1
      const charH = maxY - minY + 1

      const resized = await sharp(cellBuf, { raw: { width: CELL, height: CELL, channels: 4 } })
        .extract({ left: minX, top: minY, width: charW, height: charH })
        .resize(FRAME, FRAME, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .raw()
        .toBuffer()

      frames.push(resized)
    }
  }

  return frames
}

async function buildAtlas(classId, gridFile) {
  console.log(`\n[atlas] Building ${classId} from ${gridFile}`)
  const frames = await extractFrames(gridFile)

  const atlasBuf = Buffer.alloc(ATLAS_W * ATLAS_H * 4, 0)
  const frameData = []

  for (let d = 0; d < 4; d++) {
    const dir = directions[d]
    for (let a = 0; a < 4; a++) {
      const action = actions[a]
      const gridRow = a  // idle=0, walk=1, attack=2, cast=3
      const atlasRow = d * 2 + (a >= 2 ? 1 : 0)
      const atlasColStart = (a % 2) * 6

      for (let f = 0; f < 6; f++) {
        const frameIdx = gridRow * GRID_COLS + f
        const frame = frames[frameIdx]
        const atlasX = (atlasColStart + f) * FRAME
        const atlasY = atlasRow * FRAME

        for (let y = 0; y < FRAME; y++) {
          for (let x = 0; x < FRAME; x++) {
            const srcIdx = (y * FRAME + x) * 4
            const dstIdx = ((atlasY + y) * ATLAS_W + (atlasX + x)) * 4
            atlasBuf[dstIdx] = frame[srcIdx]
            atlasBuf[dstIdx + 1] = frame[srcIdx + 1]
            atlasBuf[dstIdx + 2] = frame[srcIdx + 2]
            atlasBuf[dstIdx + 3] = frame[srcIdx + 3]
          }
        }

        const frameName = `${classId}_${dir}_${action}_${String(f).padStart(2, '0')}`
        frameData.push({ name: frameName, x: atlasX, y: atlasY })
      }
    }
  }

  const atlasPng = await sharp(atlasBuf, { raw: { width: ATLAS_W, height: ATLAS_H, channels: 4 } })
    .png({ compressionLevel: 9 }).toBuffer()
  writeFileSync(join(spritesDir, `${classId}_spritesheet.png`), atlasPng)

  // Verify frame differences
  const samples = [
    { name: 'idle_0', x: 0, y: 0 }, { name: 'idle_2', x: 128, y: 0 },
    { name: 'walk_0', x: 384, y: 0 }, { name: 'walk_2', x: 512, y: 0 },
    { name: 'atk_0', x: 0, y: 64 }, { name: 'atk_3', x: 192, y: 64 },
    { name: 'cast_0', x: 384, y: 64 }, { name: 'cast_3', x: 576, y: 64 },
  ]
  const counts = samples.map(f => {
    let cnt = 0
    for (let y = 0; y < FRAME; y++)
      for (let x = 0; x < FRAME; x++)
        if (atlasBuf[((f.y + y) * ATLAS_W + (f.x + x)) * 4 + 3] > 10) cnt++
    return `${f.name}=${cnt}`
  })
  console.log(`  Frame verify: ${counts.join(', ')}`)

  // Atlas JSON
  const atlasJson = {
    textures: [{
      imageName: `${classId}_spritesheet.png`,
      width: ATLAS_W, height: ATLAS_H,
      frames: frameData.map(f => ({
        frame: { x: f.x, y: f.y, w: FRAME, h: FRAME },
        spriteSourceSize: { x: 0, y: 0, w: FRAME, h: FRAME },
        sourceSize: { w: FRAME, h: FRAME },
        rotated: false, trimmed: false,
        filename: f.name,
      })),
    }],
  }
  writeFileSync(join(spritesDir, `${classId}_atlas.json`), JSON.stringify(atlasJson))

  // Anims JSON
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
        frameRate: action === 'idle' ? 6 : action === 'walk' ? 10 : 12,
        repeat: action === 'idle' || action === 'walk' ? -1 : 0,
      }
    }
  }
  writeFileSync(join(spritesDir, `${classId}_anims.json`), JSON.stringify(animsJson, null, 2))

  console.log(`  ✓ ${classId}: ${frameData.length} frames, atlas ${ATLAS_W}x${ATLAS_H}`)
}

await buildAtlas('sword_new', 'sword_new_anim_grid.png')
await buildAtlas('fairy_new', 'fairy_new_anim_grid.png')
console.log('\n[atlas] Done!')
