/**
 * 运行时资源存在性校验 —— 资产目录治理的防回归闸门
 * ============================================================
 *
 * 为什么需要它（事故复盘）
 *   灵兽/阵法/NPC/宗门建筑的 atlas + anims 曾被生成到 `dist/sprites/` 而不是 `public/sprites/`：
 *   - dev：Vite 只服务 `public/`，请求 `sprites/xxx.json` 命中 SPA fallback 拿到 index.html
 *   - prod：`vite build` 默认 emptyOutDir 清空 dist/，资源直接消失
 *   两种情况下 Phaser 的 `load.json` 都会把 HTML 当 JSON 解析，抛 `Unexpected token '<'`
 *   并冒泡到 window.onerror → 首屏红色错误横幅。
 *
 *   本脚本在 `predev` / `prebuild` / `npm test` 三个阶段把这类问题拦在命令行里。
 *
 * 单一权威源原则
 *   `public/` 是**唯一**的运行时资源源。dev 直接服务 public/，build 把 public/ 复制进 dist/。
 *   因此「dev 能跑 build 挂」或「build 能跑 dev 挂」在结构上不可能发生——只要资源在 public/。
 *   任何脚本**不得**直接写 `dist/`（本脚本第 6 节会自动拦截）。
 *
 * 防漂移
 *   资源清单**不硬编码**：ID 数组从源码里解析（BootScene.ts / audio.ts / textures.ts /
 *   data.ts / fx/sequence-contract.ts / v4/manifest.ts），命名模板必须原样出现在
 *   BootScene.ts 中，否则报「清单漂移」错误。解析不出来 = 报错，绝不静默跳过。
 *
 * 用法
 *   node scripts/validate-assets.mjs [--strict] [--quiet]
 *     --strict  把「有程序化兜底的可选资源缺失」也当作失败
 *     --quiet   只打印汇总与错误
 *
 * 退出码：0 通过 / 1 存在必需资源缺失（或 --strict 下的可选缺失）
 *
 * 导出（供 tests/asset-manifest.test.ts 复用，保证 CLI 与测试永不漂移）：
 *   buildAssetManifest(rootDir) -> 从源码解析出的资源清单
 *   validateAssetTree(rootDir)  -> { errors, warnings, stats, groups }
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
export const DEFAULT_ROOT = resolve(here, '..')

// ---------------------------------------------------------------- 0. 源码扫描工具

/** 跳过字符串/模板字面量，返回字面量结束后的下标 */
function skipLiteral(src, i) {
  const quote = src[i]
  i++
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\\') { i += 2; continue }
    if (quote === '`' && ch === '$' && src[i + 1] === '{') {
      let depth = 0
      let j = i + 1
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++
        else if (src[j] === '}') { depth--; if (depth === 0) break }
      }
      i = j + 1
      continue
    }
    if (ch === quote) return i + 1
    i++
  }
  return i
}

/**
 * 从 openIdx（指向 '[' 或 '{'）扫描到配对的闭合括号。
 * 扫描过程中正确跳过字符串/模板字面量与注释，避免注释里的括号造成误判。
 */
function scanToMatch(src, openIdx) {
  const open = src[openIdx]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let i = openIdx
  while (i < src.length) {
    const ch = src[i]
    if (ch === '"' || ch === "'" || ch === '`') { i = skipLiteral(src, i); continue }
    if (ch === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i)
      if (nl === -1) return -1
      i = nl + 1
      continue
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      if (end === -1) return -1
      i = end + 2
      continue
    }
    if (ch === open) { depth++; i++; continue }
    if (ch === close) { depth--; if (depth === 0) return i; i++; continue }
    i++
  }
  return -1
}

/** 从 fromIdx 起找到赋值运算符 `=`（跳过字面量与 `==` / `=>` / `<=` / `>=` / `!=`） */
function findAssignmentOp(src, fromIdx) {
  let i = fromIdx
  while (i < src.length) {
    const ch = src[i]
    if (ch === '"' || ch === "'" || ch === '`') { i = skipLiteral(src, i); continue }
    if (ch === '=') {
      const prev = src[i - 1]
      const next = src[i + 1]
      if (prev !== '=' && prev !== '!' && prev !== '<' && prev !== '>' && next !== '=' && next !== '>') return i
    }
    // `readonly FxAnimDef[]` 这类数组类型标注里的 `[]` 不是取值符，跳过
    if (ch === '[' && src[i + 1] === ']') { i += 2; continue }
    if (ch === '[' || ch === '{') return -1 // 遇到括号说明结构不符合预期
    i++
  }
  return -1
}

/** 定位 `const NAME` 声明（允许前置 export），返回常量名起始下标 */
function findConstDecl(src, name) {
  const re = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:const|let)\\s+${name}\\b`)
  const m = re.exec(src)
  return m ? m.index : -1
}

/** 抽取 `const NAME = [...]` 的数组体文本 */
function extractArrayBody(src, name) {
  const decl = findConstDecl(src, name)
  if (decl === -1) return null
  const eq = findAssignmentOp(src, decl + name.length)
  if (eq === -1) return null
  const open = src.indexOf('[', eq)
  if (open === -1) return null
  const close = scanToMatch(src, open)
  if (close === -1) return null
  return src.slice(open + 1, close)
}

/** 抽取 `const NAME = { ... }` 的对象体文本 */
function extractObjectBody(src, name) {
  const decl = findConstDecl(src, name)
  if (decl === -1) return null
  const eq = findAssignmentOp(src, decl + name.length)
  if (eq === -1) return null
  const open = src.indexOf('{', eq)
  if (open === -1) return null
  const close = scanToMatch(src, open)
  if (close === -1) return null
  return src.slice(open + 1, close)
}

/** 收集文件里所有 `const NAME = 'literal'`（用于把 AUDIO_KEYS 里的标识符解析成字符串） */
function extractStringConsts(src) {
  const out = new Map()
  for (const m of src.matchAll(/(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"]*)\2/g)) {
    out.set(m[1], m[3])
  }
  return out
}

/** 从数组体里取出全部单/双引号字符串，并把裸标识符按同文件常量表解析 */
function parseStringList(body, src) {
  const consts = extractStringConsts(src)
  const out = []
  for (const m of body.matchAll(/(['"])([^'"]*)\1/g)) out.push(m[2])
  // 裸标识符（如 AUDIO_KEYS 里的 BGM_TITLE）
  const stripped = body.replace(/(['"])[^'"]*\1/g, '')
  for (const m of stripped.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
    if (consts.has(m[1])) out.push(consts.get(m[1]))
  }
  return out
}

/** `const NAME = ['a','b']` -> ['a','b'] */
function extractStringArray(src, name) {
  const body = extractArrayBody(src, name)
  return body === null ? null : parseStringList(body, src)
}

/** `const NAME = { a: 'b' }` -> { a: 'b' } */
function extractStringMap(src, name) {
  const body = extractObjectBody(src, name)
  if (body === null) return null
  const out = {}
  for (const m of body.matchAll(/([A-Za-z0-9_$]+)\s*:\s*(['"])([^'"]*)\2/g)) out[m[1]] = m[3]
  return out
}

/** `const NAME = [{ key: 'x' }, ...]` -> ['x', ...] */
function extractObjectKeyList(src, name) {
  const body = extractArrayBody(src, name)
  if (body === null) return null
  return [...body.matchAll(/\bkey\s*:\s*(['"])([^'"]*)\1/g)].map((m) => m[2])
}

/** 抽取对象字面量里某字段的全部取值，如 `terrainPrefix: 'qm'` -> ['qm'] */
function extractFieldValues(src, fieldName) {
  const out = []
  for (const m of src.matchAll(new RegExp(`\\b${fieldName}\\s*:\\s*(['"])([^'"]*)\\1`, 'g'))) {
    out.push(m[2])
  }
  return [...new Set(out)]
}

/** 抽取所有 `fnName('prefix', a, b)` 调用 -> ['prefix_1', ...] */
function extractNumberedCalls(src, fnName) {
  const out = []
  const re = new RegExp(`${fnName}\\(\\s*(['"])([^'"]+)\\1\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)`, 'g')
  for (const m of src.matchAll(re)) {
    const prefix = m[2]
    const first = Number(m[3])
    const last = Number(m[4])
    for (let n = first; n <= last; n++) out.push(`${prefix}_${n}`)
  }
  return out
}

/**
 * 抽取 `Array.from({ length: N }, (_, i) => \`k${...padStart(2,'0')}...\`)` 形式的 Kit id 列表。
 * 形状一旦改变就返回 null，由调用方报「清单漂移」错误，不做静默降级。
 */
function extractPaddedKitIds(src, name) {
  const decl = findConstDecl(src, name)
  if (decl === -1) return null
  const window = src.slice(decl, decl + 400)
  const len = /Array\.from\(\s*\{\s*length\s*:\s*(\d+)\s*\}/.exec(window)
  if (!len) return null
  const tpl = /`([A-Za-z0-9_]*)\$\{String\(i\s*\+\s*1\)\.padStart\((\d+),\s*['"]0['"]\)\}([A-Za-z0-9_]*)`/.exec(window)
  if (!tpl) return null
  const count = Number(len[1])
  const width = Number(tpl[2])
  return Array.from({ length: count }, (_, i) =>
    `${tpl[1]}${String(i + 1).padStart(width, '0')}${tpl[3]}`,
  )
}

/** 从 marker 位置往前找最近的 `i <= N` 循环上界 */
function extractLoopBoundNear(src, marker, fallback) {
  const at = src.indexOf(marker)
  if (at === -1) return fallback
  const before = src.slice(Math.max(0, at - 260), at)
  const matches = [...before.matchAll(/i\s*<=\s*(\d+)/g)]
  if (matches.length === 0) return fallback
  return Number(matches[matches.length - 1][1])
}

/**
 * 从 src/v4/manifest.ts 解析出 v4 资源轨的形状（帧预算 / 通道映射 / 命名模板）。
 * 目的是让本校验器与 buildKitManifest 永不漂移：一旦 manifest.ts 的结构变了，
 * 这里返回 null，由调用方报「清单漂移」错误，而不是悄悄少校验几百个文件。
 */
function parseV4ManifestShape(src) {
  const budget =
    /FRAME_BUDGET\s*=\s*\{\s*normal\s*:\s*\{\s*start\s*:\s*(\d+)\s*,\s*main\s*:\s*(\d+)\s*,\s*mid\s*:\s*(\d+)\s*\}\s*,\s*art\s*:\s*\{\s*start\s*:\s*(\d+)\s*,\s*main\s*:\s*(\d+)\s*,\s*mid\s*:\s*(\d+)\s*\}/
      .exec(src)
  if (!budget) return null
  const shape = {
    normal: { start: +budget[1], main: +budget[2], mid: +budget[3] },
    art: { start: +budget[4], main: +budget[5], mid: +budget[6] },
  }

  // 通道名 / 阶段名：从 phaseKeys / frameKeys 的参数联合类型解析，不写死
  const phaseSig = /function\s+frameKeys\s*\([^)]*phase\s*:\s*'([A-Za-z0-9_]+)'\s*\|\s*'([A-Za-z0-9_]+)'\s*\|\s*'([A-Za-z0-9_]+)'/.exec(src)
  const chanSig = /function\s+phaseKeys\s*\([^)]*channel\s*:\s*'([A-Za-z0-9_]+)'\s*\|\s*'([A-Za-z0-9_]+)'/.exec(src)
  // 通道 → FRAME_BUDGET 字段的映射
  const chanBudget = /channel\s*===\s*'[A-Za-z0-9_]+'\s*\?\s*FRAME_BUDGET\.([A-Za-z0-9_]+)\s*:\s*FRAME_BUDGET\.([A-Za-z0-9_]+)/.exec(src)
  if (!phaseSig || !chanSig || !chanBudget) return null
  const phases = [phaseSig[1], phaseSig[2], phaseSig[3]]
  const channels = [chanSig[1], chanSig[2]]
  const budgetKeys = [chanBudget[1], chanBudget[2]]

  // 命名模板：抓出所有含 ${kitId} 的模板字面量
  const templates = [...src.matchAll(/`([^`]*\$\{kitId\}[^`]*)`/g)].map((m) => m[1])
  const frameTpl = templates.find((t) => t.includes('${channel}'))
  const iconTpl = templates.find((t) => t.includes('icon'))
  if (!frameTpl || !iconTpl) return null

  // 图标数量：iconKeys 里 Array.from({ length: N })
  const iconLen = /iconKeys[\s\S]{0,200}?Array\.from\(\s*\{\s*length\s*:\s*(\d+)\s*\}/.exec(src)
  if (!iconLen) return null

  return { shape, phases, channels, budgetKeys, frameTpl, iconTpl, iconCount: +iconLen[1] }
}

/** 把 manifest.ts 的模板字面量按变量表展开（如 `${i + 1}` → 5） */
function expandV4Template(tpl, vars) {
  return tpl.replace(/\$\{([^}]+)\}/g, (whole, expr) => {
    const key = expr.replace(/\s+/g, '')
    const v = vars[key]
    return v === undefined ? whole : String(v)
  })
}

function uniq(list) {
  return [...new Set(list)]
}

function readSource(abs, label) {
  if (!existsSync(abs)) return { src: null, error: `找不到源码文件 ${label}（${abs}）` }
  try {
    return { src: readFileSync(abs, 'utf8'), error: null }
  } catch (e) {
    return { src: null, error: `读取失败 ${label}：${e.message}` }
  }
}

// ---------------------------------------------------------------- 1. 解析源码常量

export function buildAssetManifest(rootDir = DEFAULT_ROOT) {
  const errors = []
  const warnings = []

  const bootPath = join(rootDir, 'src', 'scenes', 'BootScene.ts')
  const audioPath = join(rootDir, 'src', 'audio.ts')
  const texturesPath = join(rootDir, 'src', 'textures.ts')
  const dataPath = join(rootDir, 'src', 'data.ts')
  const seqPath = join(rootDir, 'src', 'fx', 'sequence-contract.ts')
  const v4ManifestPath = join(rootDir, 'src', 'v4', 'manifest.ts')

  const boot = readSource(bootPath, 'src/scenes/BootScene.ts')
  const audio = readSource(audioPath, 'src/audio.ts')
  const textures = readSource(texturesPath, 'src/textures.ts')
  const data = readSource(dataPath, 'src/data.ts')
  const seq = readSource(seqPath, 'src/fx/sequence-contract.ts')
  const v4Manifest = readSource(v4ManifestPath, 'src/v4/manifest.ts')

  for (const r of [boot, audio, textures, data, seq, v4Manifest]) if (r.error) errors.push(r.error)
  if (boot.src === null) return { errors, warnings, groups: [], sources: {} }

  const bootSrc = boot.src
  const audioSrc = audio.src ?? ''
  const texturesSrc = textures.src ?? ''
  const dataSrc = data.src ?? ''
  const seqSrc = seq.src ?? ''

  // v4 Kit 帧预算 / 通道映射 / 命名模板：全部从 src/v4/manifest.ts 解析，不在本脚本抄一份
  const v4Src = v4Manifest.src ?? ''
  const v4Shape = parseV4ManifestShape(v4Src)

  // --- BootScene 内的 ID 清单 ---
  const ANIM_CLASSES = extractStringArray(bootSrc, 'ANIM_CLASSES')
  const BEAST_ANIM_IDS = extractStringArray(bootSrc, 'BEAST_ANIM_IDS')
  const FORMATION_ANIM_TYPES = extractStringArray(bootSrc, 'FORMATION_ANIM_TYPES')
  const NPC_ANIM_IDS = extractStringArray(bootSrc, 'NPC_ANIM_IDS')
  const BUILDING_IDS = extractStringArray(bootSrc, 'BUILDING_IDS')
  const BUILDING_SHEET_MAP = extractStringMap(bootSrc, 'BUILDING_SHEET_MAP')
  const BUILDING_SHEET_FILES = extractStringArray(bootSrc, 'BUILDING_SHEET_FILES')
  const FX_ANIMS_KEYS = extractObjectKeyList(bootSrc, 'FX_ANIMS')
  const terrainTiles = extractStringArray(bootSrc, 'terrainTiles')
  const xianEnemies = extractStringArray(bootSrc, 'xianEnemies')
  const aiEffectSheets = extractStringArray(bootSrc, 'aiEffectSheets')

  // --- 跨模块清单 ---
  const AUDIO_KEYS = audioSrc ? extractStringArray(audioSrc, 'AUDIO_KEYS') : null
  const SPRITE_KEYS = texturesSrc ? extractStringArray(texturesSrc, 'SPRITE_KEYS') : null
  const terrainPrefixes = dataSrc ? extractFieldValues(dataSrc, 'terrainPrefix') : null
  const seqNumberedKeys = seqSrc ? extractNumberedCalls(seqSrc, 'numberedTextureKeys') : null
  const v4KitIds = dataSrc ? extractPaddedKitIds(dataSrc, 'V4_KIT_WHITELIST') : null

  const required = [
    ['ANIM_CLASSES', ANIM_CLASSES],
    ['BEAST_ANIM_IDS', BEAST_ANIM_IDS],
    ['FORMATION_ANIM_TYPES', FORMATION_ANIM_TYPES],
    ['NPC_ANIM_IDS', NPC_ANIM_IDS],
    ['BUILDING_IDS', BUILDING_IDS],
    ['BUILDING_SHEET_MAP', BUILDING_SHEET_MAP && Object.keys(BUILDING_SHEET_MAP).length ? BUILDING_SHEET_MAP : null],
    ['FX_ANIMS', FX_ANIMS_KEYS],
    ['terrainTiles', terrainTiles],
    ['xianEnemies', xianEnemies],
    ['aiEffectSheets', aiEffectSheets],
    ['AUDIO_KEYS (src/audio.ts)', AUDIO_KEYS],
    ['SPRITE_KEYS (src/textures.ts)', SPRITE_KEYS],
    ['terrainPrefix (src/data.ts)', terrainPrefixes],
    ['numberedTextureKeys (src/fx/sequence-contract.ts)', seqNumberedKeys],
    ['V4_KIT_WHITELIST (src/data.ts)', v4KitIds],
  ]
  for (const [name, value] of required) {
    if (!value || value.length === 0) {
      errors.push(`无法从源码解析清单 ${name}（清单漂移：常量被改名/改结构，请同步 scripts/validate-assets.mjs）`)
    }
  }

  const sprite = (rel) => ({ publicPath: `sprites/${rel}`, rel })

  // ---------------------------------------------------------------- 2. 资源分组
  /** severity: 'required' = 缺失即失败；'warn' = 有程序化兜底，缺失仅告警 */
  const groups = []

  // --- 2.1 职业帧动画（atlas + anims）---
  groups.push({
    id: 'class-anim',
    label: '职业帧动画',
    severity: 'required',
    source: 'BootScene.ts#ANIM_CLASSES',
    template: 'sprites/${cls}_spritesheet.png',
    entries: (ANIM_CLASSES ?? []).map((cls) => ({
      id: cls,
      files: [sprite(`${cls}_spritesheet.png`), sprite(`${cls}_atlas.json`), sprite(`${cls}_anims.json`)],
      bundle: { atlasKey: `${cls}_atlas`, sheet: `${cls}_spritesheet.png`, atlas: `${cls}_atlas.json`, anims: `${cls}_anims.json` },
    })),
  })

  // --- 2.2 灵兽帧动画 ---
  groups.push({
    id: 'beast-anim',
    label: '灵兽帧动画',
    severity: 'required',
    source: 'BootScene.ts#BEAST_ANIM_IDS',
    template: 'sprites/beast_${id}_sheet.png',
    entries: (BEAST_ANIM_IDS ?? []).map((id) => ({
      id,
      files: [sprite(`beast_${id}_sheet.png`), sprite(`beast_${id}_atlas.json`), sprite(`beast_${id}_anims.json`)],
      bundle: { atlasKey: `beast_${id}_atlas`, sheet: `beast_${id}_sheet.png`, atlas: `beast_${id}_atlas.json`, anims: `beast_${id}_anims.json` },
    })),
  })

  // --- 2.3 阵法帧动画 ---
  groups.push({
    id: 'formation-anim',
    label: '阵法帧动画',
    severity: 'required',
    source: 'BootScene.ts#FORMATION_ANIM_TYPES',
    template: 'sprites/formation_${t}_spin.png',
    entries: (FORMATION_ANIM_TYPES ?? []).map((t) => ({
      id: t,
      files: [sprite(`formation_${t}_spin.png`), sprite(`formation_${t}_atlas.json`), sprite(`formation_${t}_anims.json`)],
      bundle: { atlasKey: `formation_${t}_atlas`, sheet: `formation_${t}_spin.png`, atlas: `formation_${t}_atlas.json`, anims: `formation_${t}_anims.json` },
    })),
  })

  // --- 2.4 NPC/弟子动画 ---
  groups.push({
    id: 'npc-anim',
    label: 'NPC/弟子动画',
    severity: 'required',
    source: 'BootScene.ts#NPC_ANIM_IDS',
    template: 'sprites/npc_${nid}_sheet.png',
    entries: (NPC_ANIM_IDS ?? []).map((nid) => ({
      id: nid,
      files: [sprite(`npc_${nid}_sheet.png`), sprite(`npc_${nid}_atlas.json`), sprite(`npc_${nid}_anims.json`)],
      bundle: { atlasKey: `npc_${nid}_atlas`, sheet: `npc_${nid}_sheet.png`, atlas: `npc_${nid}_atlas.json`, anims: `npc_${nid}_anims.json` },
    })),
  })

  // --- 2.5 宗门建筑（单帧 atlas，无 anims）---
  groups.push({
    id: 'sect-building',
    label: '宗门建筑',
    severity: 'required',
    source: 'BootScene.ts#BUILDING_IDS + BUILDING_SHEET_MAP',
    template: 'sprites/${sheet}.png',
    entries: (BUILDING_IDS ?? []).map((bid) => {
      const sheet = BUILDING_SHEET_MAP?.[bid]
      if (!sheet) {
        errors.push(`BUILDING_SHEET_MAP 缺少建筑 ${bid} 的精灵表映射`)
        return { id: bid, files: [], bundle: null }
      }
      return {
        id: bid,
        files: [sprite(`${sheet}.png`), sprite(`building_${bid}.json`)],
        bundle: { atlasKey: `building_${bid}`, sheet: `${sheet}.png`, atlas: `building_${bid}.json`, anims: null },
      }
    }),
  })
  // 建筑精灵表本体：BootScene 里没有独立加载语句（经 BUILDING_SHEET_MAP 间接引用），
  // 因此不用命名模板防漂移，改为与 BUILDING_SHEET_MAP 的取值集合做交叉校验。
  if (BUILDING_SHEET_FILES && BUILDING_SHEET_MAP) {
    // BUILDING_SHEET_FILES 存的是后缀（core），MAP 存的是完整表名（sect_buildings_core）
    const fromMap = uniq(Object.values(BUILDING_SHEET_MAP)).sort()
    const fromList = uniq(BUILDING_SHEET_FILES).map((s) => `sect_buildings_${s}`).sort()
    if (fromMap.join('|') !== fromList.join('|')) {
      errors.push(
        `BUILDING_SHEET_FILES 与 BUILDING_SHEET_MAP 的取值集合不一致：FILES=[${fromList.join(', ')}] / MAP=[${fromMap.join(', ')}]`,
      )
    }
  }
  groups.push({
    id: 'sect-building-sheet',
    label: '宗门建筑精灵表',
    severity: 'required',
    source: 'BootScene.ts#BUILDING_SHEET_FILES',
    template: null,
    entries: (BUILDING_SHEET_FILES ?? []).map((s) => ({
      id: s,
      files: [sprite(`sect_buildings_${s}.png`)],
      bundle: null,
    })),
  })

  // --- 2.6 音频（代码内 loaderror 静音兜底 → 缺失不阻塞，但必须可见）---
  groups.push({
    id: 'audio',
    label: '音频',
    severity: 'required',
    source: 'src/audio.ts#AUDIO_KEYS',
    template: 'audio/${key}.mp3',
    entries: (AUDIO_KEYS ?? []).map((key) => ({
      id: key,
      files: [{ publicPath: `audio/${key}.mp3`, rel: `${key}.mp3` }],
      bundle: null,
    })),
  })

  // --- 2.7 序列帧特效（FX_ANIMS ∩ sequence-contract 注册包）---
  const fxSet = new Set(FX_ANIMS_KEYS ?? [])
  const fxBundles = new Map()
  if (seqSrc) {
    for (const m of seqSrc.matchAll(
      /^\s{2}([A-Za-z0-9_]+)\s*:\s*\{\s*\r?\n\s*requiredTextureKeysForRegistration\s*:\s*numberedTextureKeys\(\s*(['"])([^'"]+)\2\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/gm,
    )) {
      const [, bundleKey, , prefix, a, b] = m
      if (!fxSet.has(bundleKey)) continue
      const first = Number(a)
      const last = Number(b)
      const keys = []
      for (let n = first; n <= last; n++) keys.push(`${prefix}_${n}`)
      fxBundles.set(bundleKey, keys)
    }
  }
  if (fxSet.size > 0 && fxBundles.size !== fxSet.size) {
    const missing = [...fxSet].filter((k) => !fxBundles.has(k))
    errors.push(
      `sequence-contract.ts 中找不到 FX_ANIMS 条目对应的注册包：${missing.join(', ')}` +
        `（清单漂移：契约结构变了，请同步 scripts/validate-assets.mjs）`,
    )
  }
  groups.push({
    id: 'fx-sequence',
    label: '序列帧特效',
    severity: 'required',
    source: 'BootScene.ts#FX_ANIMS + fx/sequence-contract.ts',
    template: 'sprites/${textureKey}.png',
    entries: [...fxBundles.entries()].map(([bundleKey, keys]) => ({
      id: bundleKey,
      files: keys.map((k) => sprite(`${k}.png`)),
      bundle: null,
    })),
  })

  // --- 2.8 静态贴图（程序化兜底 generateMissing → warn）---
  groups.push({
    id: 'sprite-keys',
    label: '静态贴图 SPRITE_KEYS',
    severity: 'warn',
    source: 'src/textures.ts#SPRITE_KEYS',
    template: 'sprites/${key}.png',
    entries: (SPRITE_KEYS ?? []).map((key) => ({ id: key, files: [sprite(`${key}.png`)], bundle: null })),
  })

  // --- 2.9 地形瓷砖 ---
  const terrainPrefixList = terrainPrefixes ?? []
  groups.push({
    id: 'terrain',
    label: '地形瓷砖集',
    severity: 'warn',
    source: 'BootScene.ts#terrainTiles + src/data.ts#REGIONS.terrainPrefix',
    template: 'sprites/terrain/${r.terrainPrefix}_${tile}.png',
    entries: terrainPrefixList.map((p) => ({
      id: p,
      files: (terrainTiles ?? []).map((t) => sprite(`terrain/${p}_${t}.png`)),
      bundle: null,
    })),
  })

  // --- 2.10 仙界敌人（13 × 16 帧）---
  groups.push({
    id: 'xian-enemy',
    label: '仙界敌人帧',
    severity: 'warn',
    source: 'BootScene.ts#xianEnemies',
    template: 'sprites/xian/${e}_${i}.png',
    entries: (xianEnemies ?? []).map((e) => ({
      id: e,
      files: Array.from({ length: 16 }, (_, i) => sprite(`xian/${e}_${i + 1}.png`)),
      bundle: null,
    })),
  })

  // --- 2.11 AI 特效帧（6 × 16）---
  const aiLoopBound = extractLoopBoundNear(bootSrc, 'sprites/${prefix}_${i}.png', 16)
  groups.push({
    id: 'ai-effect',
    label: 'AI 生成特效帧',
    severity: 'warn',
    source: 'BootScene.ts#aiEffectSheets',
    template: 'sprites/${prefix}_${i}.png',
    entries: (aiEffectSheets ?? []).map((p) => ({
      id: p,
      files: Array.from({ length: aiLoopBound }, (_, i) => sprite(`${p}_${i + 1}.png`)),
      bundle: null,
    })),
  })

  // --- 2.12 thunder_prison ---
  const thunderBound = extractLoopBoundNear(bootSrc, 'sprites/thunder_prison_${i}.png', 4)
  groups.push({
    id: 'thunder-prison',
    label: 'thunder_prison 神通帧',
    severity: 'warn',
    source: 'BootScene.ts#thunder_prison',
    template: 'sprites/thunder_prison_${i}.png',
    entries: [
      {
        id: 'thunder_prison',
        files: Array.from({ length: thunderBound }, (_, i) => sprite(`thunder_prison_${i + 1}.png`)),
        bundle: null,
      },
    ],
  })

  // --- 2.13 具名单张贴图（从 BootScene 字面量里抓，模板串一律跳过）---
  const literalStatic = new Set()
  for (const m of bootSrc.matchAll(/this\.load\.(?:image|audio|atlas|json|svg)\([^)]*?,\s*(['"])((?:sprites|audio)\/[^'"]+)\1/g)) {
    literalStatic.add(m[2])
  }
  for (const m of bootSrc.matchAll(/this\.load\.image\([^)]*?,\s*(['"])(sprites\/[^'"]+)\1/g)) {
    literalStatic.add(m[2])
  }
  groups.push({
    id: 'named-static',
    label: '具名静态资源',
    severity: 'warn',
    source: 'BootScene.ts 字面量',
    template: null,
    entries: [...literalStatic].map((p) => ({ id: p, files: [{ publicPath: p, rel: p }], bundle: null })),
  })

  // --- 2.14 v4 Kit 资源轨（Graphics 兜底 → warn；键名/帧预算全部来自 manifest.ts）---
  if (!v4Src) {
    errors.push('无法解析 src/v4/manifest.ts（清单漂移：帧预算/命名模板结构变了，请同步 scripts/validate-assets.mjs）')
  } else if (!v4Shape) {
    errors.push(
      '无法从 src/v4/manifest.ts 解析 v4 资源轨形状（FRAME_BUDGET / 通道映射 / 命名模板 / 图标数量），' +
        '请同步 scripts/validate-assets.mjs',
    )
  } else if (v4KitIds && v4KitIds.length > 0) {
    const kitKeys = (kitId) => {
      const out = []
      for (let i = 0; i < v4Shape.iconCount; i++) {
        out.push(expandV4Template(v4Shape.iconTpl, { kitId, i }))
      }
      v4Shape.channels.forEach((channel, idx) => {
        const budget = v4Shape.shape[v4Shape.budgetKeys[idx]]
        if (!budget) return
        for (const phase of v4Shape.phases) {
          for (let n = 1; n <= budget[phase]; n++) {
            out.push(expandV4Template(v4Shape.frameTpl, { kitId, channel, phase, 'i+1': n, i: n - 1 }))
          }
        }
      })
      return out
    }
    groups.push({
      id: 'v4-kit',
      label: 'v4 Kit 资源轨',
      severity: 'warn',
      source: 'src/data.ts#V4_KIT_WHITELIST + src/v4/manifest.ts#buildKitManifest',
      template: null,
      entries: v4KitIds.map((k) => ({
        id: k,
        files: kitKeys(k).map((key) => sprite(`${key}.png`)),
        bundle: null,
      })),
    })
  }

  // ---------------------------------------------------------------- 3. 命名模板防漂移
  for (const g of groups) {
    if (!g.template) continue
    if (!bootSrc.includes(g.template)) {
      errors.push(
        `[${g.label}] 命名模板漂移：校验器使用 \`${g.template}\`，但 BootScene.ts 中已找不到该字面量。请同步 scripts/validate-assets.mjs`,
      )
    }
  }

  return {
    errors,
    warnings,
    groups,
    sources: {
      ANIM_CLASSES,
      BEAST_ANIM_IDS,
      FORMATION_ANIM_TYPES,
      NPC_ANIM_IDS,
      BUILDING_IDS,
      BUILDING_SHEET_MAP,
      BUILDING_SHEET_FILES,
      FX_ANIMS: FX_ANIMS_KEYS,
      AUDIO_KEYS,
      SPRITE_KEYS,
      terrainPrefixes,
      terrainTiles,
      xianEnemies,
      aiEffectSheets,
      v4KitIds,
    },
  }
}

// ---------------------------------------------------------------- 4. atlas / anims 一致性

/** 同时支持 TexturePacker JSON-Array（textures[0]）与 JSON-Hash（frames{}+meta.image） */
function readAtlas(spritesDir, atlasFile) {
  let raw
  try {
    raw = JSON.parse(readFileSync(join(spritesDir, atlasFile), 'utf8'))
  } catch (e) {
    return { error: `${atlasFile} 不是合法 JSON：${e.message}` }
  }
  if (Array.isArray(raw?.textures) && raw.textures[0]) {
    const tex = raw.textures[0]
    return {
      image: tex.imageName ?? null,
      frames: (tex.frames ?? []).map((f) => f.filename),
    }
  }
  if (raw?.frames && typeof raw.frames === 'object') {
    return {
      image: raw.meta?.image ?? null,
      frames: Object.keys(raw.frames),
    }
  }
  return { error: `${atlasFile} 既不是 TexturePacker JSON-Array 也不是 JSON-Hash（缺少 textures[0] / frames）` }
}

function checkBundles(spritesDir, groups, errors) {
  let checked = 0
  for (const g of groups) {
    for (const entry of g.entries) {
      const b = entry.bundle
      if (!b) continue
      checked++
      const atlasPath = join(spritesDir, b.atlas)
      const animsPath = b.anims ? join(spritesDir, b.anims) : null
      if (!existsSync(atlasPath)) continue // 缺失已由存在性检查报告

      const atlas = readAtlas(spritesDir, b.atlas)
      if (atlas.error) { errors.push(`[一致性] ${atlas.error}`); continue }

      // atlas 引用的图片必须存在，且必须与 BootScene 加载的 sheet 一致
      if (atlas.image && atlas.image !== b.sheet) {
        errors.push(`[一致性] ${b.atlas} 引用图片 ${atlas.image}，但 BootScene 加载的是 ${b.sheet}`)
      }
      if (atlas.image && !existsSync(join(spritesDir, atlas.image))) {
        errors.push(`[一致性] ${b.atlas} 引用图片 ${atlas.image}，但 public/sprites/${atlas.image} 不存在`)
      }

      if (!animsPath || !existsSync(animsPath)) continue
      let anims
      try {
        anims = JSON.parse(readFileSync(animsPath, 'utf8'))
      } catch (e) {
        errors.push(`[一致性] ${b.anims} 不是合法 JSON：${e.message}`)
        continue
      }
      const frameNames = new Set(atlas.frames)
      const problems = []
      for (const [animKey, def] of Object.entries(anims)) {
        for (const fr of def?.frames ?? []) {
          if (fr.key !== b.atlasKey) {
            problems.push(`${animKey}: 帧 key "${fr.key}" 与 atlas key "${b.atlasKey}" 不匹配`)
          } else if (!frameNames.has(fr.frame)) {
            problems.push(`${animKey}: 帧 "${fr.frame}" 不在 ${b.atlas} 中`)
          }
        }
      }
      if (problems.length > 0) {
        errors.push(`[一致性] ${b.anims} 与 ${b.atlas} 不匹配 → ${uniq(problems).slice(0, 5).join('; ')}`)
      }
    }
  }
  return checked
}

// ---------------------------------------------------------------- 5. 存在性检查

function checkExistence(publicDir, groups) {
  const seen = new Set()
  const result = []
  let requiredTotal = 0
  let requiredMissing = 0
  let warnTotal = 0
  let warnMissing = 0

  for (const g of groups) {
    const missing = []
    let total = 0
    for (const entry of g.entries) {
      for (const f of entry.files) {
        if (seen.has(f.publicPath)) continue
        seen.add(f.publicPath)
        total++
        if (!existsSync(join(publicDir, f.publicPath))) missing.push(f.publicPath)
      }
    }
    if (g.severity === 'required') {
      requiredTotal += total
      requiredMissing += missing.length
    } else {
      warnTotal += total
      warnMissing += missing.length
    }
    result.push({ group: g, total, missing })
  }
  return { result, requiredTotal, requiredMissing, warnTotal, warnMissing }
}

// ---------------------------------------------------------------- 5b. dist 纯度：构建产物不得含 public 之外的资源

/**
 * dist/sprites 必须是 public/sprites 的纯拷贝。
 * 一旦有生成器把资源直接写进 dist，这里就会抓到——那正是本次事故的原始成因。
 * dist/ 不存在时（尚未构建）跳过。
 */
function checkDistPurity(rootDir, errors) {
  const distSprites = join(rootDir, 'dist', 'sprites')
  const publicSprites = join(rootDir, 'public', 'sprites')
  if (!existsSync(distSprites) || !existsSync(publicSprites)) return { checked: false, extra: 0 }

  const walk = (dir, base, out = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, base, out)
      else out.push(p.slice(base.length + 1).replace(/\\/g, '/'))
    }
    return out
  }
  const pub = new Set(walk(publicSprites, publicSprites))
  const extra = walk(distSprites, distSprites).filter((f) => !pub.has(f))
  if (extra.length > 0) {
    const preview = extra.slice(0, 10).join(', ')
    errors.push(
      `[dist 纯度] dist/sprites 中有 ${extra.length} 个文件不在 public/sprites 里（${preview}${extra.length > 10 ? ' …' : ''}）。` +
        `这说明有脚本把运行时资源写进了构建产物目录——下次 vite build 会清空 dist，资源将彻底丢失。请改用 public/ 作为输出。`,
    )
  }
  return { checked: true, extra: extra.length }
}

// ---------------------------------------------------------------- 6. 脚本卫生：禁止写构建产物目录

/**
 * 允许引用 dist/ 类路径的脚本白名单（都必须在文件内注明理由）：
 *  - 打包/后处理脚本：读写的是 minitool 的 outDir，属发布链路，不是运行时资源源
 *  - 一次性迁移脚本：从 dist 读、往 public 写
 *  - 本校验器自身
 */
const DIST_PATH_ALLOWLIST = new Set([
  'migrate-dist-assets-to-public.mjs', // 一次性迁移：自 dist 读 → 写 public
  'validate-assets.mjs', // 本校验器（含说明文字）
  'build-taptap.mjs', // 发布打包：自 dist 复制进发布包
  'minitool-postbuild.mjs', // minitool 后处理：读写 dist-minitool（其 outDir）
  'optimize-minitool-assets.mjs', // minitool 资源优化：读写 dist-minitool
  'pack-atlas.mjs', // minitool atlas 打包：读写 dist-minitool
  'check-png-sizes.mjs', // 只读诊断
])

/** 命中「dist 路径字面量」的检测：'dist/...' / 'dist-xxx/...' */
const DIST_PATH_LITERAL = /(?:^|[/\\])(dist|dist-[A-Za-z0-9_-]+)[/\\]/

function checkScriptHygiene(rootDir, errors, warnings) {
  const dirs = ['scripts', 'tools']
  let scanned = 0
  for (const dir of dirs) {
    const absDir = join(rootDir, dir)
    if (!existsSync(absDir)) continue
    for (const name of readdirSync(absDir)) {
      if (!/\.(mjs|js|py)$/.test(name)) continue
      if (name.startsWith('_') || name.startsWith('.')) continue
      scanned++
      const abs = join(absDir, name)
      let src
      try { src = readFileSync(abs, 'utf8') } catch { continue }
      if (DIST_PATH_ALLOWLIST.has(name)) continue
      const hits = new Set()
      for (const m of src.matchAll(/(['"`])((?:[^'"``\\\n]|\\.)*)\1/g)) {
        if (DIST_PATH_LITERAL.test(m[2])) hits.add(m[2])
      }
      if (hits.size > 0) {
        errors.push(
          `[脚本卫生] ${dir}/${name} 引用了构建产物目录路径（${[...hits].slice(0, 5).join(', ')}）。` +
            `运行时资源只能生成到 public/；dist/ 由 vite build 生成。确属发布链路需求的，请在 DIST_PATH_ALLOWLIST 中登记并注明理由。`,
        )
      }
    }
  }
  return scanned
}

// ---------------------------------------------------------------- 7. public/ 结构体检（信息）

function inspectPublicTree(publicDir, warnings) {
  const spritesDir = join(publicDir, 'sprites')
  if (!existsSync(spritesDir)) return []
  const rows = []
  for (const name of readdirSync(spritesDir)) {
    const abs = join(spritesDir, name)
    if (!statSync(abs).isDirectory()) continue
    let count = 0
    let bytes = 0
    const walk = (d) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        const st = statSync(p)
        if (st.isDirectory()) walk(p)
        else { count++; bytes += st.size }
      }
    }
    walk(abs)
    rows.push({ name, count, mb: +(bytes / 1024 / 1024).toFixed(1) })
  }
  return rows.sort((a, b) => b.mb - a.mb)
}

// ---------------------------------------------------------------- 8. 主校验

export function validateAssetTree(rootDir = DEFAULT_ROOT, opts = {}) {
  const strict = Boolean(opts.strict)
  const publicDir = join(rootDir, 'public')
  const spritesDir = join(publicDir, 'sprites')

  const manifest = buildAssetManifest(rootDir)
  const errors = [...manifest.errors]
  const warnings = [...manifest.warnings]

  if (!existsSync(publicDir)) {
    errors.push(`缺少 public/ 目录（${publicDir}）——dev 与 build 的唯一运行时资源源`)
    return { errors, warnings, stats: { requiredTotal: 0, requiredMissing: 0, warnTotal: 0, warnMissing: 0, scriptsScanned: 0 }, groups: [] }
  }

  const ex = checkExistence(publicDir, manifest.groups)
  for (const row of ex.result) {
    if (row.missing.length === 0) continue
    const preview = row.missing.slice(0, 8).join(', ')
    const more = row.missing.length > 8 ? ` …等 ${row.missing.length} 个` : ''
    const msg = `[${row.group.label}] 缺失 ${row.missing.length}/${row.total} → ${preview}${more}`
    if (row.group.severity === 'required' || strict) errors.push(msg)
    else warnings.push(`${msg}（severity=warn，有程序化兜底）`)
  }

  const bundlesChecked = existsSync(spritesDir) ? checkBundles(spritesDir, manifest.groups, errors) : 0
  const distPurity = checkDistPurity(rootDir, errors)
  const scriptsScanned = checkScriptHygiene(rootDir, errors, warnings)
  const publicTree = inspectPublicTree(publicDir, warnings)

  return {
    errors,
    warnings,
    stats: {
      requiredTotal: ex.requiredTotal,
      requiredMissing: ex.requiredMissing,
      warnTotal: ex.warnTotal,
      warnMissing: ex.warnMissing,
      bundlesChecked,
      distPurityChecked: distPurity.checked,
      distPurityExtra: distPurity.extra,
      scriptsScanned,
    },
    groups: ex.result,
    publicTree,
  }
}

// ---------------------------------------------------------------- 9. CLI

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(entry).href
  } catch {
    return false
  }
}

if (isMain()) {
  const strict = process.argv.includes('--strict')
  const quiet = process.argv.includes('--quiet')
  const report = validateAssetTree(DEFAULT_ROOT, { strict })
  const s = report.stats

  console.log('════════ 运行时资源校验（单一权威源：public/）════════')
  console.log(`必需资源：${s.requiredTotal - s.requiredMissing}/${s.requiredTotal} 存在` +
    (s.requiredMissing > 0 ? `，缺失 ${s.requiredMissing}` : ''))
  console.log(`可选资源（有程序化兜底）：${s.warnTotal - s.warnMissing}/${s.warnTotal} 存在` +
    (s.warnMissing > 0 ? `，缺失 ${s.warnMissing}` : ''))
  console.log(`atlas/anims 一致性：${s.bundlesChecked} 个资源包`)
  console.log(
    s.distPurityChecked
      ? `dist 纯度：dist/sprites 与 public/sprites 的差异文件 ${s.distPurityExtra} 个（应为 0）`
      : 'dist 纯度：dist/sprites 不存在，跳过',
  )
  console.log(`脚本卫生：扫描 ${s.scriptsScanned} 个脚本`)

  if (report.publicTree?.length && !quiet) {
    console.log('\npublic/sprites/ 子目录（会被整包打进 dist）：')
    for (const r of report.publicTree) console.log(`  - ${r.name}/：${r.count} 文件，${r.mb} MB`)
  }

  if (report.warnings.length > 0) {
    console.log(`\n⚠ 告警 ${report.warnings.length} 条${quiet ? '（--quiet 仅显示前 10 条）' : ''}：`)
    for (const w of (quiet ? report.warnings.slice(0, 10) : report.warnings)) console.log(`  - ${w}`)
    if (quiet && report.warnings.length > 10) console.log(`  …另有 ${report.warnings.length - 10} 条`)
  }

  if (report.errors.length > 0) {
    console.error(`\n✗ 资源校验失败（${report.errors.length} 项）：`)
    for (const e of report.errors) console.error(`  - ${e}`)
    console.error(
      '\n修复指引：\n' +
        '  1. 运行时资源必须落在 public/（Vite dev 只服务 public/，build 才会复制到 dist/）。\n' +
        '  2. 若资源被生成到了 dist/sprites/，用 node scripts/migrate-dist-assets-to-public.mjs 迁移。\n' +
        '  3. 切勿用 emptyOutDir:false 绕过——那只是把问题推迟到下一次清理。\n' +
        '  4. 新增资源清单后同步更新源码常量；校验器从源码读清单，不要把列表抄一份到脚本里。',
    )
    process.exit(1)
  }

  console.log('\n✓ 资源校验通过（dev 与 build 现在共享同一份 public/ 资源树）')
}
