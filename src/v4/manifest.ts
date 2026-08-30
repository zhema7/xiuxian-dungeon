// ---------- v4 资源 Manifest（ADR §3：每 Kit 独占帧，no-tint，不跨 Kit 借用） ----------
// 帧命名：v4/{kit}_{channel}_{phase}_{n}（如 v4/k01_atk_main_1）
// 帧预算：普攻 4/6/4 + 神通 4/8/8 = 34 帧/Kit + 4 图标 = 38 资产/Kit
// 缺帧降级：缺帧→Graphics 兜底，不新增伤害/碰撞（GDD §5）

import type { KitId, KitResourceManifest } from '../data'

const FRAME_BUDGET = {
  normal: { start: 4, main: 6, mid: 4 },
  art: { start: 4, main: 8, mid: 8 },
} as const

function frameKeys(kitId: KitId, channel: 'atk' | 'art', phase: 'start' | 'main' | 'mid', count: number): string[] {
  return Array.from({ length: count }, (_, i) => `v4/${kitId}_${channel}_${phase}_${i + 1}`)
}

function phaseKeys(kitId: KitId, channel: 'atk' | 'art'): { start: string[]; main: string[]; mid: string[] } {
  const budget = channel === 'atk' ? FRAME_BUDGET.normal : FRAME_BUDGET.art
  return {
    start: frameKeys(kitId, channel, 'start', budget.start),
    main: frameKeys(kitId, channel, 'main', budget.main),
    mid: frameKeys(kitId, channel, 'mid', budget.mid),
  }
}

function iconKeys(kitId: KitId): string[] {
  return Array.from({ length: 4 }, (_, i) => `v4/${kitId}_icon_${i}`)
}

/** 构建 Kit 的资源 Manifest */
export function buildKitManifest(kitId: KitId): KitResourceManifest {
  return {
    kitId,
    icons: iconKeys(kitId),
    normalFrames: phaseKeys(kitId, 'atk'),
    artFrames: phaseKeys(kitId, 'art'),
    tintPolicy: 'no-tint',
  }
}

/** 检查纹理是否存在（由场景层注入 textureExists 回调） */
export function frameTextureExists(
  manifest: KitResourceManifest,
  channel: 'normal' | 'art',
  phase: 'start' | 'main' | 'mid',
  textureExists: (key: string) => boolean,
): boolean {
  const frames = channel === 'normal' ? manifest.normalFrames : manifest.artFrames
  return frames[phase].every(textureExists)
}

/** 返回某 Kit 某阶段实际可用的帧（缺帧时返回空数组，由调用方降级为 Graphics） */
export function availableFrames(
  manifest: KitResourceManifest,
  channel: 'normal' | 'art',
  phase: 'start' | 'main' | 'mid',
  textureExists: (key: string) => boolean,
): readonly string[] {
  const frames = channel === 'normal' ? manifest.normalFrames : manifest.artFrames
  const phaseFrames = frames[phase]
  if (phaseFrames.every(textureExists)) return phaseFrames
  const available = phaseFrames.filter(textureExists)
  return available.length > 0 ? available : []
}

/** 缺帧降级检查：返回缺失的帧 key 列表（用于诊断/日志） */
export function missingFrames(
  manifest: KitResourceManifest,
  textureExists: (key: string) => boolean,
): readonly string[] {
  const all = [
    ...manifest.icons,
    ...manifest.normalFrames.start,
    ...manifest.normalFrames.main,
    ...manifest.normalFrames.mid,
    ...manifest.artFrames.start,
    ...manifest.artFrames.main,
    ...manifest.artFrames.mid,
  ]
  return all.filter((key) => !textureExists(key))
}

/** 每 Kit 的总帧数（名义 34 动画帧 + 4 图标 = 38） */
export const KIT_FRAME_TOTAL = FRAME_BUDGET.normal.start + FRAME_BUDGET.normal.main + FRAME_BUDGET.normal.mid
  + FRAME_BUDGET.art.start + FRAME_BUDGET.art.main + FRAME_BUDGET.art.mid
export const KIT_ICON_COUNT = 4
export const KIT_ASSET_TOTAL = KIT_FRAME_TOTAL + KIT_ICON_COUNT

/** 已生成 PNG 资产的 Kit 列表（30 套全量，1140 PNG）。未列出的 Kit 走 Graphics 兜底。 */
export const V4_KIT_ASSET_READY: readonly KitId[] = Array.from(
  { length: 30 },
  (_, i) => `k${String(i + 1).padStart(2, '0')}` as KitId,
)
