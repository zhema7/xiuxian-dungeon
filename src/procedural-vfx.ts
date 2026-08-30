// ---------- 程序随机套装 VFX：有限 recipe 白名单 + 可组合模块步骤 ----------

import type Phaser from 'phaser'
import type { ArtMode, AttackMode, ProceduralVfxRecipe } from './data'
import { modularAnimationKey, type ModularKind } from './fx/modularFx'
import { hasRegisteredSequenceAnimationPlayback } from './fx/sequence-contract'
import { paletteV1Tint, safePaletteV1Overlay, type PaletteV1 } from './palette-v1'

export type ProceduralVfxPhase = 'attack' | 'art'

/**
 * 只描述已由 BootScene 注册的 modularFx 动画，永不接受存档提供的纹理/动画 key。
 * 坐标是相对施法点的局部空间；渲染时随玩家朝向旋转。
 */
export interface ProceduralVfxStep {
  readonly kind: ModularKind
  readonly dx?: number
  readonly dy?: number
  readonly depth?: number
  readonly scale?: number
  readonly alpha?: number
  readonly tint?: number
  readonly rotation?: number
}

interface ProceduralVfxRecipeDef {
  readonly attackModes: readonly AttackMode[]
  readonly artModes: readonly ArtMode[]
  readonly attack: readonly ProceduralVfxStep[]
  readonly art: readonly ProceduralVfxStep[]
}

const PROCEDURAL_VFX_RECIPES: Record<ProceduralVfxRecipe, ProceduralVfxRecipeDef> = {
  'sword-comet': {
    attackModes: ['flying_sword_burst'],
    artModes: ['sword_fan', 'dageng'],
    attack: [
      { kind: 'blade', dx: 18, scale: 0.56, alpha: 0.86, tint: 0xbfe9ff, depth: 15 },
      { kind: 'charge', dx: -5, scale: 0.34, alpha: 0.72, tint: 0x8ed7ff, depth: 14 },
    ],
    art: [
      { kind: 'rune', scale: 0.64, alpha: 0.82, tint: 0xd7f4ff, depth: 14 },
      { kind: 'burst', dx: 14, scale: 0.76, alpha: 0.85, tint: 0x8ed7ff, depth: 16 },
    ],
  },
  'frost-bloom': {
    attackModes: ['frost_nova_burst'],
    artModes: ['thunder_strike', 'dageng'],
    attack: [
      { kind: 'charge', scale: 0.72, alpha: 0.76, tint: 0x9fd8ff, depth: 13 },
      { kind: 'burst', scale: 0.58, alpha: 0.88, tint: 0xe0f7ff, depth: 16 },
    ],
    art: [
      { kind: 'rune', scale: 0.68, alpha: 0.7, tint: 0xc4ecff, depth: 14 },
      { kind: 'charge', scale: 0.58, alpha: 0.88, tint: 0x80d8ff, depth: 16 },
      { kind: 'burst', scale: 0.8, alpha: 0.78, tint: 0xd7f4ff, depth: 17 },
    ],
  },
  'thunder-sigil': {
    attackModes: ['thunder_chain'],
    artModes: ['thunder_strike', 'dageng'],
    attack: [
      { kind: 'rune', dx: 10, scale: 0.48, alpha: 0.86, tint: 0xb39dff, depth: 14 },
      { kind: 'charge', dx: 21, scale: 0.46, alpha: 0.92, tint: 0xd7c8ff, depth: 16 },
    ],
    art: [
      { kind: 'rune', scale: 0.7, alpha: 0.78, tint: 0xb39dff, depth: 14 },
      { kind: 'charge', scale: 0.66, alpha: 0.9, tint: 0xe7ddff, depth: 16 },
      { kind: 'hit', dx: 18, scale: 0.68, alpha: 0.82, tint: 0xb39dff, depth: 17 },
    ],
  },
  'giant-crest': {
    attackModes: ['giant_sword'],
    artModes: ['fire_rain', 'dageng'],
    attack: [
      { kind: 'rune', dx: -8, scale: 0.54, alpha: 0.76, tint: 0xffcf78, depth: 14 },
      { kind: 'blade', dx: 24, scale: 0.82, alpha: 0.9, tint: 0xffe3a1, depth: 16 },
    ],
    art: [
      { kind: 'charge', scale: 0.76, alpha: 0.68, tint: 0xffb562, depth: 13 },
      { kind: 'burst', dx: 20, scale: 0.9, alpha: 0.86, tint: 0xffcf78, depth: 16 },
    ],
  },
}

export function isProceduralVfxRecipe(value: unknown): value is ProceduralVfxRecipe {
  return typeof value === 'string' && value in PROCEDURAL_VFX_RECIPES
}

/**
 * Phase-scoped recipe validation. Attack and art are independent channels:
 * an attack recipe only needs the winning attack mode, and an art recipe only
 * needs the winning art mode. The recipe itself is still a closed whitelist.
 */
export function isProceduralVfxCompatibleForPhase(
  recipe: unknown,
  phase: ProceduralVfxPhase,
  mode: unknown,
): recipe is ProceduralVfxRecipe {
  if (!isProceduralVfxRecipe(recipe) || typeof mode !== 'string') return false
  const def = PROCEDURAL_VFX_RECIPES[recipe]
  return phase === 'attack'
    ? def.attackModes.includes(mode as AttackMode)
    : def.artModes.includes(mode as ArtMode)
}

/** 防止一条完整 profile 的 recipe 被错误套到另一种未实现的战斗行为。 */
export function isProceduralVfxCompatible(
  recipe: unknown,
  attackMode: unknown,
  artMode: unknown,
): recipe is ProceduralVfxRecipe {
  return isProceduralVfxCompatibleForPhase(recipe, 'attack', attackMode)
    && isProceduralVfxCompatibleForPhase(recipe, 'art', artMode)
}

/** 安全取得组合步骤；未知 recipe 或阶段永远返回空数组。 */
export function proceduralVfxSteps(recipe: unknown, phase: ProceduralVfxPhase): readonly ProceduralVfxStep[] {
  if (!isProceduralVfxRecipe(recipe)) return []
  return PROCEDURAL_VFX_RECIPES[recipe][phase]
}

/**
 * 运行时薄渲染器。各模块在动画/贴图缺失时由 playModularOnce 安全跳过，
 * 所以 VFX 不会影响攻击或神通的伤害结算。
 */
export function playProceduralVfx(
  scene: Phaser.Scene,
  recipe: unknown,
  phase: ProceduralVfxPhase,
  x: number,
  y: number,
  angle = 0,
  palette?: PaletteV1,
) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  for (const step of proceduralVfxSteps(recipe, phase)) {
    const localX = step.dx ?? 0
    const localY = step.dy ?? 0
    const anim = modularAnimationKey(step.kind)
    const texture = `${anim}_1`
    // Never let the animation key be treated as resource proof. A partial
    // module sequence skips its animated layer; the optional compact overlay
    // remains visual-only and does not affect combat resolution.
    const framesReady = hasRegisteredSequenceAnimationPlayback(anim, {
      animationRegistered: scene.anims.exists(anim),
      textureExists: (key) => scene.textures.exists(key),
    })
    const sx = x + localX * cos - localY * sin
    const sy = y + localX * sin + localY * cos
    if (!framesReady) {
      const overlay = safePaletteV1Overlay(palette, 'cast')
      if (overlay) {
        const g = scene.add.graphics().setDepth(step.depth ?? 14)
        g.lineStyle(1.2, overlay.stroke, Math.min(0.48, overlay.alpha))
        g.strokeCircle(sx, sy, Math.max(4, overlay.radius * 0.55))
        g.lineStyle(1, overlay.highlight, 0.34)
        g.strokeCircle(sx, sy, Math.max(2, overlay.radius * 0.3))
        scene.tweens.add({ targets: g, alpha: 0, duration: 120, onComplete: () => g.destroy() })
      }
      continue
    }
    const spr = scene.add.sprite(sx, sy, texture)
    if (step.depth !== undefined) spr.setDepth(step.depth)
    if (step.scale !== undefined) spr.setScale(step.scale)
    if (step.alpha !== undefined) spr.setAlpha(step.alpha)
    const tint = paletteV1Tint(palette, step.kind === 'hit' || step.kind === 'burst' ? 'highlight' : 'primary') ?? step.tint
    if (tint !== undefined) spr.setTint(tint)
    spr.setRotation(angle + (step.rotation ?? 0))
    spr.once('animationcomplete', () => spr.destroy())
    spr.play(anim)
  }
}
