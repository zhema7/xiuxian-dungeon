import { ART_MODE_NAMES, type ArtMode } from './data'
import type { SetArtOverride } from './effects'

/** 场景执行前的纯神通选择结果，供套装覆写与玩家已装配神通共用。 */
export interface EffectiveArtCast {
  mode: ArtMode
  power: number
  cooldownMs: number
  source: 'set' | 'skill'
  displayName: string
}

/**
 * 纯选择函数：套装神通优先，且不需要玩家装备任一神通。
 * 函数只选择数据，不接触 Phaser，供单测直接验证四种真实 ArtMode 的分发入口。
 */
export function resolveEffectiveArtCast(
  setOverride: SetArtOverride | null,
  skill: { artMode?: ArtMode; power?: number; cd?: number; name?: string } | undefined,
  skillPower: number,
  skillCooldownMs: number,
): EffectiveArtCast | null {
  if (setOverride) {
    return {
      mode: setOverride.mode,
      power: setOverride.power,
      cooldownMs: setOverride.cooldownMs,
      source: 'set',
      displayName: setOverride.displayName ?? ART_MODE_NAMES[setOverride.mode],
    }
  }
  if (!skill?.artMode) return null
  return {
    mode: skill.artMode,
    power: skillPower,
    cooldownMs: skillCooldownMs,
    source: 'skill',
    displayName: skill.name ?? ART_MODE_NAMES[skill.artMode],
  }
}
