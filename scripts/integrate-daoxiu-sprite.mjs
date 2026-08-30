// 将道修新贴图集成到游戏：缩放图片 + 生成 atlas JSON + 生成 anims JSON
import sharp from 'sharp'
import { writeFileSync, unlinkSync } from 'node:fs'

const SRC = 'public/sprites/sword_new_src.png'
const DST = 'public/sprites/sword_new_spritesheet.png'
const ATLAS = 'public/sprites/sword_new_atlas.json'
const ANIMS = 'public/sprites/sword_new_anims.json'

const COLS = 6
const ROWS = 5
const FRAME = 64

const ROW_MAP = ['idle', 'walk', 'attack', 'cast', 'hit']
const DIRS = ['down', 'left', 'right', 'up']

async function main() {
  const meta = await sharp(SRC).metadata()
  const srcFW = Math.floor(meta.width / COLS)
  const srcFH = Math.floor(meta.height / ROWS)
  console.log(`source: ${meta.width}x${meta.height}, frame: ${srcFW}x${srcFH}`)

  // 提取每帧并缩放到 64x64，再合成
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

  // 生成 atlas JSON：每个方向都映射到相同的源帧
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
          filename: `sword_new_${dir}_${action}_${String(i).padStart(2, '0')}`,
        })
      }
    }
  }
  writeFileSync(ATLAS, JSON.stringify({
    textures: [{
      imageName: 'sword_new_spritesheet.png',
      width: COLS * FRAME,
      height: ROWS * FRAME,
      frames: atlasFrames,
    }],
  }))
  console.log(`atlas: ${atlasFrames.length} frames -> ${ATLAS}`)

  // 生成 anims JSON
  const anims = {}
  for (const dir of DIRS) {
    // idle: 6帧循环，慢速
    anims[`sword_new_${dir}_idle`] = {
      key: `sword_new_${dir}_idle`,
      frames: Array.from({ length: COLS }, (_, i) => ({ key: 'sword_new_atlas', frame: `sword_new_${dir}_idle_${String(i).padStart(2, '0')}` })),
      frameRate: 6,
      repeat: -1,
    }
    // walk: 6帧循环
    anims[`sword_new_${dir}_walk`] = {
      key: `sword_new_${dir}_walk`,
      frames: Array.from({ length: COLS }, (_, i) => ({ key: 'sword_new_atlas', frame: `sword_new_${dir}_walk_${String(i).padStart(2, '0')}` })),
      frameRate: 10,
      repeat: -1,
    }
    // attack: 6帧单次
    anims[`sword_new_${dir}_attack`] = {
      key: `sword_new_${dir}_attack`,
      frames: Array.from({ length: COLS }, (_, i) => ({ key: 'sword_new_atlas', frame: `sword_new_${dir}_attack_${String(i).padStart(2, '0')}` })),
      frameRate: 12,
      repeat: 0,
    }
    // cast: 6帧单次
    anims[`sword_new_${dir}_cast`] = {
      key: `sword_new_${dir}_cast`,
      frames: Array.from({ length: COLS }, (_, i) => ({ key: 'sword_new_atlas', frame: `sword_new_${dir}_cast_${String(i).padStart(2, '0')}` })),
      frameRate: 12,
      repeat: 0,
    }
    // hit: 6帧单次
    anims[`sword_new_${dir}_hit`] = {
      key: `sword_new_${dir}_hit`,
      frames: Array.from({ length: COLS }, (_, i) => ({ key: 'sword_new_atlas', frame: `sword_new_${dir}_hit_${String(i).padStart(2, '0')}` })),
      frameRate: 10,
      repeat: 0,
    }
  }
  writeFileSync(ANIMS, JSON.stringify(anims, null, 2))
  console.log(`anims: ${Object.keys(anims).length} animations -> ${ANIMS}`)

  // 清理临时文件
  unlinkSync(SRC)
  console.log('cleaned up temp file')
}

main().catch(e => { console.error(e); process.exit(1) })
