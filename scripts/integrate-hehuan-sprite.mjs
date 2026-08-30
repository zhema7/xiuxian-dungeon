// 将合欢新贴图集成到游戏：缩放图片 + 生成 atlas JSON
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const SRC = 'public/sprites/fairy_new_spritesheet_new.png'
const DST = 'public/sprites/fairy_new_spritesheet.png'
const ATLAS = 'public/sprites/fairy_new_atlas.json'

const COLS = 6
const ROWS = 5
const FRAME = 64

const ROW_MAP = ['idle', 'walk', 'attack', 'cast', 'hit']
const DIRS = ['down', 'left', 'right', 'up']

async function main() {
  const meta = await sharp(SRC).metadata()
  const srcFW = Math.floor(meta.width / COLS)   // 448
  const srcFH = Math.floor(meta.height / ROWS)  // 448
  console.log(`source: ${meta.width}x${meta.height}, frame: ${srcFW}x${srcFH}`)

  // 提取每帧并缩放到 64x64，再合成到 384x320 精灵图
  const frames = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const buf = await sharp(SRC)
        .extract({ left: c * srcFW, top: r * srcFH, width: srcFW, height: srcFH })
        .resize(FRAME, FRAME, { fit: 'fill' })
        .png()
        .toBuffer()
      frames.push({ buf, r, c })
    }
  }

  // 合成
  const composites = frames.map(f => ({
    input: f.buf,
    left: f.c * FRAME,
    top: f.r * FRAME,
  }))
  await sharp({
    create: { width: COLS * FRAME, height: ROWS * FRAME, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toFile(DST)
  console.log(`spritesheet: ${COLS * FRAME}x${ROWS * FRAME} -> ${DST}`)

  // 生成 atlas JSON
  const atlasFrames = []
  for (const dir of DIRS) {
    for (const action of ROW_MAP) {
      for (let i = 0; i < COLS; i++) {
        const rowIdx = ROW_MAP.indexOf(action)
        atlasFrames.push({
          frame: { x: i * FRAME, y: rowIdx * FRAME, w: FRAME, h: FRAME },
          spriteSourceSize: { x: 0, y: 0, w: FRAME, h: FRAME },
          sourceSize: { w: FRAME, h: FRAME },
          rotated: false,
          trimmed: false,
          filename: `fairy_new_${dir}_${action}_${String(i).padStart(2, '0')}`,
        })
      }
    }
  }

  const atlas = {
    textures: [{
      imageName: 'fairy_new_spritesheet.png',
      width: COLS * FRAME,
      height: ROWS * FRAME,
      frames: atlasFrames,
    }],
  }
  writeFileSync(ATLAS, JSON.stringify(atlas))
  console.log(`atlas: ${atlasFrames.length} frames -> ${ATLAS}`)
}

main().catch(e => { console.error(e); process.exit(1) })
