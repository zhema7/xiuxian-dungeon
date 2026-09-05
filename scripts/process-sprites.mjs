// 精灵图后处理脚本
// JPG → PNG（透明背景）+ 序列帧生成
// 用法: node scripts/process-sprites.mjs

import sharp from 'sharp'
import { readdir, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, basename, dirname } from 'path'

const ROOT = 'public/sprites'
const FRAME_SIZE = 64 // 目标帧尺寸 64x64
const WHITE_THRESHOLD = 235 // 白色阈值：RGB均>此值视为背景
const EDGE_FEATHER = 2 // 边缘羽化像素数

// ===== 白色背景抠除 =====
async function removeWhiteBackground(inputPath, outputPath, size = FRAME_SIZE) {
  // 1. 加载并缩放到目标尺寸
  const { data, info } = await sharp(inputPath)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .removeAlpha()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const channels = info.channels
  const width = info.width
  const height = info.height

  // 2. 遍历像素，抠除白色背景
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    // 判断是否为背景（接近白色）
    if (r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD) {
      data[i + 3] = 0 // 完全透明
    } else if (r > WHITE_THRESHOLD - 20 && g > WHITE_THRESHOLD - 20 && b > WHITE_THRESHOLD - 20) {
      // 边缘羽化：半透明
      const factor = (r + g + b) / 3
      const distFromWhite = 255 - factor
      if (distFromWhite < EDGE_FEATHER * 10) {
        data[i + 3] = Math.min(255, Math.floor(distFromWhite * 12))
      }
    }
  }

  // 3. 保存为PNG
  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(outputPath)

  console.log(`  ✓ ${basename(outputPath)} (${size}x${size}, transparent)`)
  return { data, width, height, channels }
}

// ===== 生成序列帧 =====
async function generateSequenceFrames(baseImage, outputPath, frameCount = 4, type = 'idle') {
  const { data, width, height, channels } = baseImage
  const frames = []

  for (let f = 0; f < frameCount; f++) {
    // 创建帧缓冲
    const frameBuf = Buffer.alloc(data.length)

    // 根据类型应用不同动画效果
    let offsetY = 0
    let offsetX = 0

    if (type === 'idle') {
      // idle: 上下浮动
      offsetY = Math.round(Math.sin(f / frameCount * Math.PI * 2) * 2)
    } else if (type === 'gallop') {
      // gallop: 上下颠簸
      offsetY = f % 2 === 0 ? 0 : -2
    }

    // 复制像素到新帧，应用偏移
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcY = y - offsetY
        const srcX = x - offsetX

        const dstIdx = (y * width + x) * channels
        const srcIdx = (srcY * width + srcX) * channels

        if (srcY >= 0 && srcY < height && srcX >= 0 && srcX < width) {
          // 复制源像素
          for (let c = 0; c < channels; c++) {
            frameBuf[dstIdx + c] = data[srcIdx + c]
          }
        } else {
          // 越界部分设为透明
          frameBuf[dstIdx + 3] = 0
        }
      }
    }

    const framePath = outputPath.replace('.png', `_${f + 1}.png`)
    await sharp(frameBuf, { raw: { width, height, channels } })
      .png()
      .toFile(framePath)

    frames.push(framePath)
    console.log(`    ✓ frame ${f + 1}/${frameCount}: ${basename(framePath)}`)
  }

  // 创建精灵表（横排排列）
  const sheetWidth = width * frameCount
  const sheetBuf = Buffer.alloc(sheetWidth * height * channels)

  for (let f = 0; f < frameCount; f++) {
    const framePath = frames[f]
    const frameData = await sharp(framePath).raw().toBuffer({ resolveWithObject: true })
    const fd = frameData.data

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * channels
        const dstIdx = (y * sheetWidth + (f * width + x)) * channels
        for (let c = 0; c < channels; c++) {
          sheetBuf[dstIdx + c] = fd[srcIdx + c]
        }
      }
    }
  }

  const sheetPath = outputPath.replace('.png', '_sheet.png')
  await sharp(sheetBuf, { raw: { width: sheetWidth, height, channels } })
    .png()
    .toFile(sheetPath)
  console.log(`    ✓ sprite sheet: ${basename(sheetPath)}`)

  return frames
}

// ===== 主处理流程 =====
async function main() {
  console.log('=== 精灵图后处理 ===\n')

  // --- 1. 剧情 NPC 立绘（静态，无动画）---
  console.log('[1/3] 剧情 NPC 立绘 (5张, 静态)')
  const storyDir = join(ROOT, 'story')
  const storyFiles = (await readdir(storyDir)).filter(f => f.endsWith('.jpg'))
  for (const file of storyFiles) {
    const inputPath = join(storyDir, file)
    const outputName = file.replace('.jpg', '.png')
    const outputPath = join(storyDir, outputName)
    await removeWhiteBackground(inputPath, outputPath, 64)
    // 删除原始JPG
    await sharp(inputPath).toFormat('jpeg').toBuffer() // 确认可访问后删除
  }
  console.log()

  // --- 2. 坐骑灵驹（4帧奔跑动画）---
  console.log('[2/3] 坐骑灵驹 (1张基础图 → 4帧序列)')
  const mountInput = join(ROOT, 'mount_spirit_horse.jpg')
  const mountOutput = join(ROOT, 'mount_spirit_horse.png')
  const mountBase = await removeWhiteBackground(mountInput, mountOutput, 64)
  await generateSequenceFrames(mountBase, mountOutput, 4, 'gallop')
  console.log()

  // --- 3. 部落精灵（4帧待机动画）---
  console.log('[3/3] 秘境部落精灵 (5张基础图 → 各4帧序列)')
  const tribeDir = join(ROOT, 'tribes')
  const tribeFiles = (await readdir(tribeDir)).filter(f => f.endsWith('.jpg'))
  for (const file of tribeFiles) {
    const inputPath = join(tribeDir, file)
    const outputName = file.replace('.jpg', '.png')
    const outputPath = join(tribeDir, outputName)
    const baseImg = await removeWhiteBackground(inputPath, outputPath, 64)
    await generateSequenceFrames(baseImg, outputPath, 4, 'idle')
  }

  // --- 清理原始 JPG ---
  console.log('\n[清理] 删除原始 JPG 文件')
  for (const f of storyFiles) {
    await import('fs/promises').then(m => m.unlink(join(storyDir, f)))
    console.log(`  ✗ ${f}`)
  }
  await import('fs/promises').then(m => m.unlink(mountInput))
  console.log('  ✗ mount_spirit_horse.jpg')
  for (const f of tribeFiles) {
    await import('fs/promises').then(m => m.unlink(join(tribeDir, f)))
    console.log(`  ✗ ${f}`)
  }

  console.log('\n=== 完成！===')
  console.log('生成文件:')
  console.log('  - 5 张剧情 NPC PNG (64x64, 透明背景)')
  console.log('  - 1 张灵驹 PNG + 4帧序列 + 精灵表')
  console.log('  - 5 张部落 PNG + 各4帧序列 + 精灵表')
}

main().catch(err => {
  console.error('处理失败:', err)
  process.exit(1)
})
