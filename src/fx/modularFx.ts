import type Phaser from 'phaser'

export type ModularKind = 'rune' | 'blade' | 'burst' | 'charge' | 'field' | 'hit'
/** Retained metadata for existing callers; runtime availability now uses playback contracts. */
export const MODULAR_FRAMES: Record<ModularKind, number> = { rune: 4, blade: 6, burst: 6, charge: 4, field: 6, hit: 4 }
import type { ControlledHitLinkage } from '../data'
import { hasRegisteredSequenceAnimationPlayback, type SequenceAnimationKey } from './sequence-contract'

export const SWORD_SPLIT_ANGLE = 0.42
export const SWORD_SPLIT_DAMAGE = 0.4
export const FIRE_BURST_TINT = 0xe67e22
export const FIRE_BURST_RADIUS = 42
export function fireBurstParams(enabled = true) {
  return { enabled, tint: FIRE_BURST_TINT, radius: FIRE_BURST_RADIUS, once: true, recursive: false as const }
}

export const DELAYED_BURST_DELAY = 380
export const DELAYED_BURST_TINT = 0x9b59b6
export const DELAYED_BURST_RADIUS = 42

export const ARRAY_MINE_MAX = 3
export const ARRAY_MINE_LIFETIME = 2000
export const ARRAY_MINE_TRIGGER_RADIUS = 34
export interface ArrayMineParams { enabled: boolean; maxMines: number; lifetime: number; triggerRadius: number }
export function arrayMineParams(enabled = false): ArrayMineParams {
  return { enabled, maxMines: ARRAY_MINE_MAX, lifetime: ARRAY_MINE_LIFETIME, triggerRadius: ARRAY_MINE_TRIGGER_RADIUS }
}
export interface ArrayMineEye { x: number; y: number; triggered: boolean }
export function createArrayMineEyes(enabled: boolean, points: ReadonlyArray<{ x: number; y: number }>): ArrayMineEye[] {
  if (!enabled) return []
  return points.slice(0, ARRAY_MINE_MAX).map((p) => ({ x: p.x, y: p.y, triggered: false }))
}
export function arrayMineExpired(startedAt: number, now: number): boolean {
  return now - startedAt >= ARRAY_MINE_LIFETIME
}
export function triggerArrayMineEye(eye: ArrayMineEye, enemyX: number, enemyY: number, radius = ARRAY_MINE_TRIGGER_RADIUS): boolean {
  if (eye.triggered) return false
  const dx = enemyX - eye.x, dy = enemyY - eye.y
  if (dx * dx + dy * dy > radius * radius) return false
  eye.triggered = true
  return true
}
export function delayedBurstParams(enabled = true) {
  return { enabled, delay: DELAYED_BURST_DELAY, tint: DELAYED_BURST_TINT, radius: DELAYED_BURST_RADIUS, once: true, recursive: false as const }
}

export interface SwordSplit { angle: number; power: number; recursive: false }
export function swordSplitParams(angle: number, power: number, enabled = true): SwordSplit[] {
  if (!enabled) return []
  return [-SWORD_SPLIT_ANGLE, SWORD_SPLIT_ANGLE].map((offset) => ({ angle: angle + offset, power: power * SWORD_SPLIT_DAMAGE, recursive: false as const }))
}

export type ControlledHitLinkageAction =
  | { kind: 'split_swords'; childCount: 2; damageMultiplier: 0.4 }
  | { kind: 'fire_bolt'; projectileCount: 1; damageMultiplier: 0.4 }

export interface ControlledHitLinkageTrigger {
  recipeId: ControlledHitLinkage['recipeId']
  nextReadyAt: number
  action: ControlledHitLinkageAction
}

/** Cooldown ownership is explicit: each emitted set source owns each approved recipe. */
export function controlledHitLinkageCooldownKey(
  sourceSetId: string | undefined,
  recipeId: ControlledHitLinkage['recipeId'],
): string {
  return `${sourceSetId ?? 'unknown'}:${recipeId}`
}

/** Immutable authorization captured by an emitted parent projectile. */
export interface ControlledHitLinkageAuthorizationSnapshot {
  readonly epoch: number
  readonly sourceSetId: string
  readonly recipeId: ControlledHitLinkage['recipeId']
}

/**
 * Scene-local authority for controlled linkage parents. Equipment or winning
 * source changes advance the epoch and clear source cooldowns atomically, so
 * already-emitted parents cannot later act on an obsolete set source.
 */
export interface ControlledHitLinkageAuthorization {
  readonly epoch: number
  capture(sourceSetId: string, recipeId: ControlledHitLinkage['recipeId']): ControlledHitLinkageAuthorizationSnapshot
  isCurrent(snapshot: ControlledHitLinkageAuthorizationSnapshot | undefined): boolean
  readyAt(key: string): number
  setReadyAt(key: string, readyAt: number): void
  advanceEpoch(): number
}

export function createControlledHitLinkageAuthorization(): ControlledHitLinkageAuthorization {
  let epoch = 0
  const readyAt = new Map<string, number>()
  return {
    get epoch() { return epoch },
    capture(sourceSetId, recipeId) { return { epoch, sourceSetId, recipeId } },
    isCurrent(snapshot) { return !!snapshot && snapshot.epoch === epoch },
    readyAt(key) { return readyAt.get(key) ?? 0 },
    setReadyAt(key, at) { readyAt.set(key, at) },
    advanceEpoch() { epoch++; readyAt.clear(); return epoch },
  }
}

/** Small named helper keeps equipment-change call sites auditable in tests. */
export function advanceControlledHitLinkageEpoch(authorization: ControlledHitLinkageAuthorization): number {
  return authorization.advanceEpoch()
}

/**
 * Stable same-frame arbitration: parent projectiles are evaluated by ascending
 * creation order, independent of their storage array or reverse cleanup loop.
 */
export function orderedControlledHitCandidates<T extends { creationOrder: number }>(candidates: readonly T[]): T[] {
  return [...candidates].sort((a, b) => a.creationOrder - b.creationOrder)
}

/** Player projectile kinds accepted by the first-hit gate. */
export type ControlledHitLinkageProjectileKind = 'sword' | 'bolt' | 'giant'

/**
 * Linkages are bound to their parent attack channel. This check runs before a
 * cooldown can be consumed, so a bolt or unrelated sword can never spend a
 * flying-sword/giant-sword linkage cooldown.
 */
export function matchesControlledHitLinkageProjectileKind(
  linkage: ControlledHitLinkage | null | undefined,
  kind: ControlledHitLinkageProjectileKind,
): boolean {
  return (linkage?.recipeId === 'flying_sword_first_hit_split' && kind === 'sword')
    || (linkage?.recipeId === 'giant_sword_first_hit_fire_bolt' && kind === 'giant')
}

/**
 * Pure first-hit gate used by the scene. `isDerivedProjectile` enforces the
 * non-recursive contract; `isFirstHit` prevents a parent whose first collision
 * fell inside the shared cooldown from retrying on a later collision. The
 * supplied ready time keeps cooldown state owned by the source set recipe.
 */
export function tryTriggerControlledHitLinkage(
  linkage: ControlledHitLinkage | null | undefined,
  now: number,
  readyAt: number,
  isDerivedProjectile: boolean,
  isFirstHit = true,
): ControlledHitLinkageTrigger | null {
  if (!linkage || isDerivedProjectile || !isFirstHit || now < readyAt) return null
  if (linkage.recipeId === 'flying_sword_first_hit_split') {
    return {
      recipeId: linkage.recipeId,
      nextReadyAt: now + linkage.parameters.cooldownMs,
      action: {
        kind: 'split_swords',
        childCount: linkage.parameters.childCount,
        damageMultiplier: linkage.parameters.damageMultiplier,
      },
    }
  }
  return {
    recipeId: linkage.recipeId,
    nextReadyAt: now + linkage.parameters.cooldownMs,
    action: {
      kind: 'fire_bolt',
      projectileCount: linkage.parameters.projectileCount,
      damageMultiplier: linkage.parameters.damageMultiplier,
    },
  }
}

export function modularAnimationKey(kind: ModularKind): Extract<SequenceAnimationKey, `mod_${string}`> {
  return `mod_${kind}`
}

export interface ModularOnceOptions { depth?: number; scale?: number; alpha?: number; tint?: number; rotation?: number }
export function playModularOnce(scene: Phaser.Scene, kind: ModularKind, x: number, y: number, opts: ModularOnceOptions = {}) {
  const key = modularAnimationKey(kind)
  const anim = key
  if (!hasRegisteredSequenceAnimationPlayback(key, {
    animationRegistered: scene.anims.exists(anim),
    textureExists: (textureKey) => scene.textures.exists(textureKey),
  })) return undefined
  const first = `${key}_1`
  const spr = scene.add.sprite(x, y, first)
  if (opts.depth !== undefined) spr.setDepth(opts.depth)
  if (opts.scale !== undefined) spr.setScale(opts.scale)
  if (opts.alpha !== undefined) spr.setAlpha(opts.alpha)
  if (opts.tint !== undefined) spr.setTint(opts.tint)
  if (opts.rotation !== undefined) spr.setRotation(opts.rotation)
  // Use the stable event name rather than importing Phaser at runtime; this keeps pure logic tests Node-safe.
  spr.once('animationcomplete', () => spr.destroy())
  spr.play(anim)
  return spr
}
