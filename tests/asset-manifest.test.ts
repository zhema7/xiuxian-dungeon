// ---------- 运行时资源清单防回归测试 ----------
// 目的：即使有人绕过 `predev` / `prebuild` 直接跑 `npm test`，资源缺失也会在这里红掉。
//
// 设计要点：
//   1. 不复制一份资源清单 —— 直接复用 scripts/validate-assets.mjs 导出的解析结果，
//      保证 CLI 与测试用同一套逻辑，永不漂移。
//   2. 清单从源码解析（BootScene.ts / audio.ts / textures.ts / data.ts /
//      fx/sequence-contract.ts / v4/manifest.ts），不是手抄的常量表。
//   3. 除「真实项目必须全绿」外，还用合成的最小工程做正反两面验证：
//      资源齐全 → 0 错误；资源清空 → 必须报错（证明这道闸门真的会咬人）。

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildAssetManifest, validateAssetTree } from '../scripts/validate-assets.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(here, '..')

// ---------------------------------------------------------------- 1. 清单解析

const manifest = buildAssetManifest(PROJECT_ROOT)

describe('资源清单从源码解析（不硬编码）', () => {
  it('解析阶段无「清单漂移」错误', () => {
    expect(manifest.errors).toEqual([])
  })

  it('解析出的 ID 清单与源码一致', () => {
    const s = manifest.sources
    expect(s.ANIM_CLASSES).toEqual(['sword', 'fairy', 'mage', 'sword_new', 'fairy_new'])
    expect(s.BEAST_ANIM_IDS).toHaveLength(8)
    expect(s.BEAST_ANIM_IDS).toContain('qilin')
    expect(s.FORMATION_ANIM_TYPES).toEqual(['attack', 'defense', 'trap'])
    expect(s.NPC_ANIM_IDS).toEqual(['disciple_outer', 'disciple_inner', 'elder', 'deacon'])
    expect(s.BUILDING_IDS).toHaveLength(14)
    expect(s.BUILDING_SHEET_FILES).toHaveLength(4)
    expect(s.AUDIO_KEYS).toContain('bgm_title') // 由 BGM_TITLE 常量解析而来
    expect(s.AUDIO_KEYS).toContain('sfx_chest')
    expect(s.SPRITE_KEYS).toContain('player')
    expect(s.terrainPrefixes).toEqual(expect.arrayContaining(['qm', 'ym', 'sy', 'xj']))
    expect(s.v4KitIds).toHaveLength(30)
    expect(s.v4KitIds?.[0]).toBe('k01')
    expect(s.v4KitIds?.[29]).toBe('k30')
  })

  it('覆盖 BootScene 的全部资源分组', () => {
    const ids = manifest.groups.map((g) => g.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'class-anim',
        'beast-anim',
        'formation-anim',
        'npc-anim',
        'sect-building',
        'sect-building-sheet',
        'audio',
        'fx-sequence',
        'sprite-keys',
        'terrain',
        'xian-enemy',
        'ai-effect',
        'thunder-prison',
        'named-static',
        'v4-kit',
      ]),
    )
  })

  it('v4 Kit 帧键与 src/v4/manifest.ts 的 buildKitManifest 逐键一致（含 icon 从 0 开始）', () => {
    const v4 = manifest.groups.find((g) => g.id === 'v4-kit')
    expect(v4).toBeDefined()
    const k01 = v4!.entries[0].files.map((f) => f.rel)
    // manifest.ts: iconKeys → `v4/${kitId}_icon_${i}`（i 从 0 起）
    expect(k01.slice(0, 4)).toEqual([
      'v4/k01_icon_0.png',
      'v4/k01_icon_1.png',
      'v4/k01_icon_2.png',
      'v4/k01_icon_3.png',
    ])
    // FRAME_BUDGET.normal = { start:4, main:6, mid:4 }；art = { start:4, main:8, mid:8 }
    expect(k01).toContain('v4/k01_atk_main_6.png')
    expect(k01).toContain('v4/k01_art_main_8.png')
    expect(k01).not.toContain('v4/k01_atk_main_7.png')
    expect(k01).toHaveLength(38) // 4 图标 + 14 普攻帧 + 20 神通帧
  })
})

// ---------------------------------------------------------------- 2. 真实项目

const report = validateAssetTree(PROJECT_ROOT)

/**
 * 可选资源（severity=warn）的缺失基线。
 *
 * 这些资源有程序化兜底，缺了不影响可玩性，所以不阻塞 dev/build；
 * 但**清单必须显式登记并写明理由**——不能让缺失在告警里默默堆积。
 *
 * 两条硬约束：
 *   1. 出现未登记的缺失 → 测试失败（要么补资源，要么在这里登记理由）
 *   2. 已登记的缺失被补上了 → 测试也失败（基线过期，必须把条目删掉）
 */
const APPROVED_OPTIONAL_MISSING: Record<string, { files: string[]; reason: string }> = {
  'sprite-keys': {
    files: ['sprites/player.png', 'sprites/npc.png'],
    reason: 'src/textures.ts 的 generateMissing 程序化兜底，属预期设计',
  },
  'named-static': {
    files: ['sprites/sect_bg.jpg'],
    reason: '宗门背景：AI 源素材在 assets/scenes/sect_bg.jpg，尚未合成进 public/；SectScene 有 Graphics 兜底',
  },
}

describe('真实项目 public/ 资源树', () => {
  it('必需资源零缺失（缺失即阻塞 dev/build）', () => {
    expect(report.errors).toEqual([])
  })

  it('统计口径自洽', () => {
    expect(report.stats.requiredTotal).toBeGreaterThan(250)
    expect(report.stats.requiredMissing).toBe(0)
    expect(report.stats.bundlesChecked).toBeGreaterThanOrEqual(34)
    expect(report.stats.scriptsScanned).toBeGreaterThan(0)
  })

  it('无脚本绕过 public/ 直接写构建产物目录', () => {
    const hygiene = report.errors.filter((e) => e.includes('[脚本卫生]'))
    expect(hygiene).toEqual([])
  })

  // 每个分组单独成例，失败时能一眼看出是哪一类资源缺了
  const groups = report.groups ?? []

  it.each(groups.filter((g) => g.group.severity === 'required').map((g) => [g.group.id, g] as const))(
    '必需分组 %s 零缺失',
    (_id, g) => {
      expect(g.missing, `[${g.group.label}] 缺失：${g.missing.join(', ')}`).toEqual([])
    },
  )

  it.each(groups.filter((g) => g.group.severity === 'warn').map((g) => [g.group.id, g] as const))(
    '可选分组 %s 缺失不超出已登记基线',
    (_id, g) => {
      const approved = APPROVED_OPTIONAL_MISSING[g.group.id]?.files ?? []
      const unregistered = g.missing.filter((m) => !approved.includes(m))
      const stale = approved.filter((m) => !g.missing.includes(m))
      expect(
        unregistered,
        `[${g.group.label}] 出现未登记的可选资源缺失，请在测试里补资源或登记理由：${unregistered.join(', ')}`,
      ).toEqual([])
      expect(stale, `[${g.group.label}] 基线过期，这些资源已补齐，请把条目从 APPROVED_OPTIONAL_MISSING 删掉：${stale.join(', ')}`).toEqual([])
    },
  )

  it('可选资源缺失基线本身是有效的（不为空壳条目）', () => {
    for (const [groupId, entry] of Object.entries(APPROVED_OPTIONAL_MISSING)) {
      const g = groups.find((x) => x.group.id === groupId)
      expect(g, `基线登记了不存在的分组 ${groupId}`).toBeDefined()
      expect(entry.files.length, `分组 ${groupId} 的基线文件列表为空`).toBeGreaterThan(0)
      expect(entry.reason.length, `分组 ${groupId} 的基线缺少理由说明`).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------- 3. 合成工程：正反验证

const FIXTURE_BOOT = [
  "const ANIM_CLASSES = ['sword']",
  "const BEAST_ANIM_IDS = ['wolf']",
  "const FORMATION_ANIM_TYPES = ['attack']",
  "const NPC_ANIM_IDS = ['elder']",
  "const BUILDING_IDS = ['main_hall']",
  "const BUILDING_SHEET_MAP: Record<string, string> = { main_hall: 'sect_buildings_core' }",
  "const BUILDING_SHEET_FILES = ['core']",
  "type FxAnimDef = { key: string; frameSize: number }",
  "const FX_ANIMS: readonly FxAnimDef[] = [",
  "  { key: 'slash', frameSize: 48 },",
  ']',
  "const terrainTiles = ['floor_base']",
  "const xianEnemies = ['boss_xianzun']",
  "const aiEffectSheets = ['ai_slash']",
  'function preload() {',
  "  for (const cls of ANIM_CLASSES) {",
  '    this.load.atlas(`${cls}_atlas`, `sprites/${cls}_spritesheet.png`, `sprites/${cls}_atlas.json`)',
  '    this.load.json(`${cls}_anims`, `sprites/${cls}_anims.json`)',
  '  }',
  "  for (const id of BEAST_ANIM_IDS) {",
  '    this.load.atlas(`beast_${id}_atlas`, `sprites/beast_${id}_sheet.png`, `sprites/beast_${id}_atlas.json`)',
  '    this.load.json(`beast_${id}_anims`, `sprites/beast_${id}_anims.json`)',
  '  }',
  "  for (const t of FORMATION_ANIM_TYPES) {",
  '    this.load.atlas(`formation_${t}_atlas`, `sprites/formation_${t}_spin.png`, `sprites/formation_${t}_atlas.json`)',
  '    this.load.json(`formation_${t}_anims`, `sprites/formation_${t}_anims.json`)',
  '  }',
  "  for (const nid of NPC_ANIM_IDS) {",
  '    this.load.atlas(`npc_${nid}_atlas`, `sprites/npc_${nid}_sheet.png`, `sprites/npc_${nid}_atlas.json`)',
  '    this.load.json(`npc_${nid}_anims`, `sprites/npc_${nid}_anims.json`)',
  '  }',
  "  for (const bid of BUILDING_IDS) {",
  '    const sheet = BUILDING_SHEET_MAP[bid]',
  '    this.load.atlas(`building_${bid}`, `sprites/${sheet}.png`, `sprites/building_${bid}.json`)',
  '  }',
  "  for (const r of REGIONS) {",
  '    for (const tile of terrainTiles) {',
  '      this.load.image(`terrain_${r.terrainPrefix}_${tile}`, `sprites/terrain/${r.terrainPrefix}_${tile}.png`)',
  '    }',
  '  }',
  "  for (const e of xianEnemies) {",
  '    for (let i = 1; i <= 16; i++) {',
  '      this.load.image(`${e}_${i}`, `sprites/xian/${e}_${i}.png`)',
  '    }',
  '  }',
  "  for (const prefix of aiEffectSheets) {",
  '    for (let i = 1; i <= 16; i++) {',
  '      this.load.image(`${prefix}_${i}`, `sprites/${prefix}_${i}.png`)',
  '    }',
  '  }',
  '  for (let i = 1; i <= 4; i++) {',
  '    this.load.image(`thunder_prison_${i}`, `sprites/thunder_prison_${i}.png`)',
  '  }',
  "  for (const key of AUDIO_KEYS) {",
  '    this.load.audio(key, `audio/${key}.mp3`)',
  '  }',
  "  for (const key of SPRITE_KEYS) {",
  '    this.load.image(key, `sprites/${key}.png`)',
  '  }',
  '  for (const fx of FX_ANIMS) {',
  '    for (const textureKey of SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS[fx.key].requiredTextureKeysForRegistration) {',
  '      this.load.image(textureKey, `sprites/${textureKey}.png`)',
  '    }',
  '  }',
  "  this.load.image('sect_bg', 'sprites/sect_bg.jpg')",
  '}',
].join('\n')

const FIXTURE_AUDIO = ["export const AUDIO_KEYS = ['sfx_click'] as const"].join('\n')
const FIXTURE_TEXTURES = ["export const SPRITE_KEYS = ['player'] as const"].join('\n')
const FIXTURE_DATA = [
  "export type KitId = `k${string}`",
  "export const REGIONS = [{ id: 'qm', terrainPrefix: 'qm' }]",
  'export const V4_KIT_WHITELIST: readonly KitId[] = Array.from({ length: 1 }, (_, i) =>',
  '  `k${String(i + 1).padStart(2, "0")}`,',
  ') as KitId[]',
].join('\n')
const FIXTURE_SEQ = [
  'const numberedTextureKeys = (framePrefix: string, firstFrame: number, lastFrame: number): readonly string[] => []',
  'export const SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS = {',
  '  slash: {',
  "    requiredTextureKeysForRegistration: numberedTextureKeys('slash', 1, 6),",
  "    animationKeys: ['slash_anim'],",
  '  },',
  '}',
].join('\n')
const FIXTURE_V4_MANIFEST = [
  'import type { KitId } from "../data"',
  'const FRAME_BUDGET = {',
  '  normal: { start: 4, main: 6, mid: 4 },',
  '  art: { start: 4, main: 8, mid: 8 },',
  '} as const',
  "function frameKeys(kitId: KitId, channel: 'atk' | 'art', phase: 'start' | 'main' | 'mid', count: number): string[] {",
  '  return Array.from({ length: count }, (_, i) => `v4/${kitId}_${channel}_${phase}_${i + 1}`)',
  '}',
  "function phaseKeys(kitId: KitId, channel: 'atk' | 'art'): { start: string[]; main: string[]; mid: string[] } {",
  "  const budget = channel === 'atk' ? FRAME_BUDGET.normal : FRAME_BUDGET.art",
  '  return {',
  "    start: frameKeys(kitId, channel, 'start', budget.start),",
  "    main: frameKeys(kitId, channel, 'main', budget.main),",
  "    mid: frameKeys(kitId, channel, 'mid', budget.mid),",
  '  }',
  '}',
  'function iconKeys(kitId: KitId): string[] {',
  '  return Array.from({ length: 4 }, (_, i) => `v4/${kitId}_icon_${i}`)',
  '}',
].join('\n')

/**
 * 合成工程放在**项目内**的临时目录，而不是 os.tmpdir()。
 * 实测：从 vitest worker 线程往系统临时目录写文件，在 2 worker 并发下会卡住
 * （沙箱/杀软对非工作区路径写入的拦截），导致整个测试文件挂死。放项目内可避开。
 */
const FIXTURE_TMP_PARENT = join(PROJECT_ROOT, '.vitest-asset-gate-tmp')

/**
 * 每个用例用**固定的**目录名，而不是 mkdtemp + 删除。
 * 原因：本机环境用 safe-delete shim 拦截了 fs.rmSync（走回收站），在测试里调用会抛
 * `[safe-delete] 操作失败`。固定目录 + 每次重跑覆盖写入，等价幂等，且不需要任何删除。
 */
function makeFixtureRoot(caseName: string) {
  const root = join(FIXTURE_TMP_PARENT, caseName)
  mkdirSync(join(root, 'src', 'scenes'), { recursive: true })
  mkdirSync(join(root, 'src', 'fx'), { recursive: true })
  mkdirSync(join(root, 'src', 'v4'), { recursive: true })
  mkdirSync(join(root, 'public', 'sprites'), { recursive: true })
  mkdirSync(join(root, 'public', 'audio'), { recursive: true })
  writeFileSync(join(root, 'src', 'scenes', 'BootScene.ts'), FIXTURE_BOOT)
  writeFileSync(join(root, 'src', 'audio.ts'), FIXTURE_AUDIO)
  writeFileSync(join(root, 'src', 'textures.ts'), FIXTURE_TEXTURES)
  writeFileSync(join(root, 'src', 'data.ts'), FIXTURE_DATA)
  writeFileSync(join(root, 'src', 'fx', 'sequence-contract.ts'), FIXTURE_SEQ)
  writeFileSync(join(root, 'src', 'v4', 'manifest.ts'), FIXTURE_V4_MANIFEST)
  return root
}

/** 按清单把文件补齐；atlas/anims 生成合法且互相匹配的 JSON，一并验证一致性检查不会误报 */
function populateFixture(root: string, skip: readonly string[] = []) {
  const man = buildAssetManifest(root)
  for (const g of man.groups) {
    for (const entry of g.entries) {
      for (const f of entry.files) {
        if (skip.includes(f.publicPath)) continue
        const abs = join(root, 'public', f.publicPath)
        mkdirSync(dirname(abs), { recursive: true })
        if (f.publicPath.endsWith('_atlas.json') || /building_.*\.json$/.test(f.publicPath)) {
          const image = entry.bundle?.sheet ?? 'sheet.png'
          const frame = f.publicPath.replace(/.*\/(.+)_atlas\.json$/, '$1_00').replace(/building_(.+)\.json$/, 'building_$1')
          writeFileSync(
            abs,
            JSON.stringify({
              textures: [{ imageName: image, width: 64, height: 64, frames: [{ filename: frame }] }],
            }),
          )
        } else if (f.publicPath.endsWith('_anims.json')) {
          const atlasKey = entry.bundle?.atlasKey ?? 'atlas'
          const frame = f.publicPath.replace(/.*\/(.+)_anims\.json$/, '$1_00')
          writeFileSync(
            abs,
            JSON.stringify({ [`${atlasKey}_idle`]: { key: `${atlasKey}_idle`, frames: [{ key: atlasKey, frame }] } }),
          )
        } else {
          writeFileSync(abs, 'x')
        }
      }
    }
  }
}

describe('合成最小工程：闸门正反验证', () => {
  it('资源被清空时必须报错（证明闸门会咬人，不是摆设）', () => {
    // 这个用例目录永远不填充，天然保持「空」
    const root = makeFixtureRoot('case-empty')
    const r = validateAssetTree(root)
    expect(r.errors.length).toBeGreaterThan(0)
    const joined = r.errors.join('\n')
    expect(joined).toContain('sprites/sword_spritesheet.png')
    expect(joined).toContain('sprites/beast_wolf_sheet.png')
    expect(joined).toContain('sprites/formation_attack_spin.png')
    expect(joined).toContain('sprites/npc_elder_sheet.png')
    expect(joined).toContain('audio/sfx_click.mp3')
    expect(joined).toContain('sprites/slash_1.png') // FX 序列帧注册包
    expect(r.stats.requiredMissing).toBeGreaterThan(0)
  })

  it('资源齐全时零错误（证明一致性检查不会误报）', () => {
    const root = makeFixtureRoot('case-full')
    populateFixture(root)
    const r = validateAssetTree(root)
    expect(r.errors, r.errors.join('\n')).toEqual([])
    expect(r.stats.requiredMissing).toBe(0)
    expect(r.stats.bundlesChecked).toBeGreaterThan(0)
  })

  it('--strict 会把可选资源缺失也升级为失败', () => {
    // 单独一个用例目录：只缺一个「有程序化兜底」的可选资源（不生成它，不做删除）
    const root = makeFixtureRoot('case-strict-partial')
    populateFixture(root, ['sprites/player.png'])
    expect(validateAssetTree(root).errors).toEqual([])
    expect(validateAssetTree(root, { strict: true }).errors.length).toBeGreaterThan(0)
  })

  it('atlas 与 anims 不一致时报错（帧 key 对不上 atlas key）', () => {
    const root = makeFixtureRoot('case-atlas-mismatch')
    populateFixture(root)
    writeFileSync(
      join(root, 'public', 'sprites', 'sword_anims.json'),
      JSON.stringify({ sword_down_idle: { key: 'sword_down_idle', frames: [{ key: 'WRONG_KEY', frame: 'sword_00' }] } }),
    )
    const r = validateAssetTree(root)
    expect(r.errors.join('\n')).toContain('WRONG_KEY')
  })
})
