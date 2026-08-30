// ---------- Palette V1：仅由已落盘 v3 身份派生的玩家表现色板 ----------
// 该模块不写入存档、不消费场景 RNG，也不从当前词库或 profile catalog 推导颜色。

import type { DynamicSetRecord } from './lore'

/** Palette eligibility is intentionally pinned to persisted PRS v3 / generator v2. */
const PALETTE_V1_REQUIRED_SCHEMA_VERSION = 3
const PALETTE_V1_REQUIRED_GENERATOR_VERSION = 2

/** Bump this only with an explicit compatibility decision; persisted identities stay the input. */
export const PALETTE_V1_ALGORITHM_VERSION = 'palette-v1' as const

export interface PaletteV1Identity {
  readonly setId: string
  readonly profileId: string
  readonly transformId: string
  readonly theme: string
}

export interface PaletteV1 {
  readonly algorithmVersion: typeof PALETTE_V1_ALGORITHM_VERSION
  readonly identity: PaletteV1Identity
  /** Stable audit/debug key. It never uses live RNG, catalog order, or current word pools. */
  readonly identityKey: string
  /** Muted player-facing main color. Never applied to enemies. */
  readonly primary: number
  /** Deliberately off-white highlight; avoids a full-white flash path. */
  readonly highlight: number
  /** Dark stroke/readability anchor with a material luminance gap from highlight. */
  readonly darkOutline: number
}

/** Projectile and transient VFX carriers copy this immutable context only. */
export interface PaletteV1VisualContext {
  readonly palette: PaletteV1
}

/** Narrow source shape so resolver callers cannot accidentally borrow another channel's color. */
export interface PaletteV1Source {
  readonly setId: string
  readonly transformId: string
}

export interface PaletteV1Overlay {
  readonly stroke: number
  readonly fill: number
  readonly highlight: number
  readonly alpha: number
  readonly radius: number
}

/**
 * Fixed muted families make the output readable on dark dungeon floors without
 * treating color as the only gameplay signal. No family contains pure white or
 * an unbounded/high-saturation screen-filling color.
 */
const PALETTE_V1_FAMILIES: readonly Readonly<Pick<PaletteV1, 'primary' | 'highlight' | 'darkOutline'>>[] = [
  { primary: 0x2d7f9d, highlight: 0x9ad7e6, darkOutline: 0x153f52 },
  { primary: 0x3c70bd, highlight: 0xa9c9f5, darkOutline: 0x1c3a70 },
  { primary: 0x6b5eb4, highlight: 0xc7bdf0, darkOutline: 0x342d68 },
  { primary: 0x8a6098, highlight: 0xd8bfdc, darkOutline: 0x482c54 },
  { primary: 0xa0684d, highlight: 0xe5bf9c, darkOutline: 0x5b3426 },
  { primary: 0x8c7a3e, highlight: 0xded397, darkOutline: 0x4a401f },
  { primary: 0x397d6a, highlight: 0x9bd9c4, darkOutline: 0x1b4539 },
  { primary: 0x547b98, highlight: 0xb5d1e4, darkOutline: 0x29465c },
] as const

/** Small FNV-1a implementation: stable across JS runtimes and independent of game RNG. */
function fnv1a32(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function v3IdentityForPalette(record: DynamicSetRecord, source: PaletteV1Source): PaletteV1Identity | undefined {
  const generation = record.generation
  if (record.schemaVersion !== PALETTE_V1_REQUIRED_SCHEMA_VERSION
    || !generation
    || generation.generatorVersion !== PALETTE_V1_REQUIRED_GENERATOR_VERSION
    || !('identity' in generation)) return undefined

  const identity = generation.identity
  if (!identity
    || typeof identity.setId !== 'string'
    || typeof identity.profileId !== 'string'
    || typeof identity.transformId !== 'string'
    || typeof generation.theme !== 'string'
    || !identity.setId
    || !identity.profileId
    || !identity.transformId
    || !generation.theme
    || identity.setId !== record.set.id
    || identity.profileId !== generation.profileId
    || source.setId !== identity.setId
    || source.transformId !== identity.transformId
  ) return undefined

  // A source must point at the persisted v3 transform itself, not merely reuse
  // its set id. This keeps a future 6-piece row or a mixed source from borrowing
  // another ability row's palette by accident.
  const transform = record.set.bonuses.find((bonus) => bonus.count === 4 && bonus.transformId === identity.transformId)
  if (!transform) return undefined

  return {
    setId: identity.setId,
    profileId: identity.profileId,
    transformId: identity.transformId,
    theme: generation.theme,
  }
}

/**
 * Pure, v3-only color derivation. Inputs are exclusively persisted identity
 * fields: identity.setId/profileId/transformId and generation.theme.
 */
export function derivePaletteV1(record: DynamicSetRecord, source: PaletteV1Source): PaletteV1 | undefined {
  const identity = v3IdentityForPalette(record, source)
  if (!identity) return undefined

  const identityKey = [
    PALETTE_V1_ALGORITHM_VERSION,
    identity.setId,
    identity.profileId,
    identity.transformId,
    identity.theme,
  ].join('|')
  const family = PALETTE_V1_FAMILIES[fnv1a32(identityKey) % PALETTE_V1_FAMILIES.length]

  return Object.freeze({
    algorithmVersion: PALETTE_V1_ALGORITHM_VERSION,
    identity: Object.freeze(identity),
    identityKey,
    primary: family.primary,
    highlight: family.highlight,
    darkOutline: family.darkOutline,
  })
}

export function makePaletteV1VisualContext(palette: PaletteV1 | undefined): PaletteV1VisualContext | undefined {
  return palette ? Object.freeze({ palette }) : undefined
}

/** Derived children retain only visual identity; gameplay/linkage fields stay outside this module. */
export function inheritPaletteV1VisualContext(
  parent: PaletteV1VisualContext | undefined,
): PaletteV1VisualContext | undefined {
  return parent
}

/** Palette-aware line colors for Graphics-based lightning; undefined preserves the legacy fixed path. */
export function paletteV1LightningColors(palette: PaletteV1 | undefined): { outer: number; inner: number } | undefined {
  return palette ? { outer: palette.primary, inner: palette.highlight } : undefined
}

/** Controlled surface mapping for VFX modules; old callers keep their existing recipe tint. */
export function paletteV1Tint(
  palette: PaletteV1 | undefined,
  surface: 'primary' | 'highlight' | 'outline' = 'primary',
): number | undefined {
  if (!palette) return undefined
  if (surface === 'highlight') return palette.highlight
  if (surface === 'outline') return palette.darkOutline
  return palette.primary
}

/**
 * A small, non-obscuring Graphics fallback for baked/non-tintable projectile
 * art. It is visual-only and intentionally never becomes a full-screen flash.
 */
export function safePaletteV1Overlay(
  palette: PaletteV1 | undefined,
  kind: 'projectile' | 'impact' | 'cast',
): PaletteV1Overlay | undefined {
  if (!palette) return undefined
  const radius = kind === 'projectile' ? 6 : kind === 'impact' ? 10 : 14
  return {
    stroke: palette.darkOutline,
    fill: palette.primary,
    highlight: palette.highlight,
    alpha: kind === 'projectile' ? 0.45 : 0.38,
    radius,
  }
}

