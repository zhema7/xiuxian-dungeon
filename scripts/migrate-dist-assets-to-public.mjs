/**
 * 一次性迁移工具：把运行时资源从 dist/sprites 迁移到 public/sprites
 *
 * 背景（P0 发布阻塞）：
 *   灵兽/阵法/NPC/宗门建筑的 atlas+anims JSON 与 sheet PNG 曾被生成到 `dist/sprites/`，
 *   而 Vite dev 只服务 `public/`，生产构建又会在 build 前 emptyOutDir 清空 `dist/`。
 *   结果：dev 下这些请求命中 SPA fallback 拿到 index.html，Phaser 做 JSON.parse 抛异常。
 *
 * 本脚本做的事：
 *   1. 把 dist/sprites 下属于运行时资源清单的文件**备份**到 backup 目录
 *   2. **复制**（不移动、不删除）到 public/sprites
 *
 * 用法：
 *   node scripts/migrate-dist-assets-to-public.mjs            # 执行迁移
 *   node scripts/migrate-dist-assets-to-public.mjs --dry-run  # 只打印计划
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = join(here, '..')
const srcDir = join(root, 'dist', 'sprites')
const dstDir = join(root, 'public', 'sprites')
const backupDir = join(root, 'backup', '20260830-asset-pipeline', 'dist-sprites-migrated')

const dryRun = process.argv.includes('--dry-run')

/** 运行时资源前缀（与 src/scenes/BootScene.ts 的加载清单一致） */
const PREFIXES = ['beast_', 'formation_', 'npc_', 'building_', 'sect_buildings_']
/** 只迁移清单内的文件，避免把 dist/sprites 里与 public 同名的旧副本也一并搬走 */
const PATTERNS = [
  /^beast_.+_(sheet\.png|atlas\.json|anims\.json)$/,
  /^formation_.+_(spin\.png|atlas\.json|anims\.json)$/,
  /^npc_.+_(sheet\.png|atlas\.json|anims\.json)$/,
  /^building_.+\.json$/,
  /^sect_buildings_.+\.png$/,
]

const files = existsSync(srcDir)
  ? readdirSync(srcDir)
      .filter((f) => PREFIXES.some((p) => f.startsWith(p)) && PATTERNS.some((r) => r.test(f)))
      .sort()
  : []

if (files.length === 0) {
  console.error(`[migrate] 未在 ${srcDir} 找到待迁移资源，跳过。`)
  process.exit(0)
}

// ---------- 1. 备份源端（dist 侧）副本，绝不删除 ----------
if (!dryRun) mkdirSync(backupDir, { recursive: true })

let backedUp = 0
let copied = 0
let overwritten = 0
let bytes = 0

for (const f of files) {
  const src = join(srcDir, f)
  const size = statSync(src).size

  if (!dryRun) {
    copyFileSync(src, join(backupDir, f))
    backedUp++
  }

  const dst = join(dstDir, f)
  if (existsSync(dst)) {
    if (statSync(dst).size === size) {
      console.log(`  = 跳过（已存在且大小一致） ${f}`)
      continue
    }
    overwritten++
    console.log(`  ! 覆盖（大小不一致）     ${f}  dist=${size} public=${statSync(dst).size}`)
  }

  bytes += size
  if (!dryRun) {
    copyFileSync(src, dst)
    copied++
  }
  console.log(`  + 迁移 ${f.padEnd(32)} ${(size / 1024).toFixed(0)}KB`)
}

const action = dryRun ? '计划' : '完成'
console.log(
  `\n[migrate] ${action}：待处理 ${files.length} 个文件 → public/sprites` +
    `\n  备份(dist侧) ${backedUp}  新复制 ${copied}  覆盖 ${overwritten}  总计 ${(bytes / 1024 / 1024).toFixed(1)}MB`,
)
if (!dryRun) {
  console.log(`  备份目录：${backupDir}`)
  console.log('  注意：dist/sprites 下的原文件保持原样（未删除）。')
}
