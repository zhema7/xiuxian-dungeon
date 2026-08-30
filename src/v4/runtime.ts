// ---------- v4 Runtime 旁路解析器（ADR §2 S1/S4-S6 旁路缝） ----------
// 不改动既有 resolveAttackMode/resolveSetArtOverride/resolveSetEffectRuntime
// 场景层先调用本模块的 v4 解析器，命中 v4 Kit 时走 v4 executor；否则回退旧路由

import {
  SET_BONUS_MIN_PIECES,
  equippedSetIds, setPieceCount,
  resolveSetAttackSource, resolveSetArtSource,
  type SetAbilitySource,
} from '../effects'
import {
  V4_KIT_SET_ID_PREFIX, V4_KIT_PRIMITIVE_PARAMS, kitIdFromSetId,
  type KitAbility, type KitId, type KitPrimitive,
} from '../data'
import { V4_KIT_SETS, v4KitForSetId } from './kit-data'
import type { GameState } from '../state'

/** v4 Kit 运行时 FX 旗标（独立于 SetEffectRuntime，S6 旁路） */
export interface KitFxRuntime {
  active: boolean
  kitId: KitId | null
  normalPrimitive: KitPrimitive | null
  artPrimitive: KitPrimitive | null
  artPower: number
  artCooldownMs: number
}

const INACTIVE_KIT_FX: KitFxRuntime = {
  active: false, kitId: null, normalPrimitive: null, artPrimitive: null,
  artPower: 0, artCooldownMs: 0,
}

/** 普攻侧 v4 解析（S4 旁路）：命中 v4 Kit 且 4 件集齐时返回 KitAbility */
export function resolveV4KitAbility(s: GameState): KitAbility | null {
  for (const setId of equippedSetIds(s)) {
    const kitId = kitIdFromSetId(setId)
    if (!kitId) continue
    const count = setPieceCount(s, setId)
    if (count >= SET_BONUS_MIN_PIECES) {
      const ability = v4KitForSetId(setId)
      if (ability) return ability
    }
  }
  return null
}

/** 神通侧 v4 解析（S5 旁路）：返回 v4 Kit 神通覆写 */
export interface V4KitArtOverride {
  kitId: KitId
  primitive: KitPrimitive
  power: number
  cooldownMs: number
}

export function resolveV4KitArtOverride(s: GameState): V4KitArtOverride | null {
  const ability = resolveV4KitAbility(s)
  if (!ability) return null
  return {
    kitId: ability.kitId,
    primitive: ability.artPrimitive,
    power: ability.artPower,
    cooldownMs: ability.artCooldownMs,
  }
}

/** FX 运行时解析（S6 旁路）：返回 v4 Kit 旗标，独立于 SetEffectRuntime */
export function resolveV4KitFxRuntime(s: GameState): KitFxRuntime {
  const ability = resolveV4KitAbility(s)
  if (!ability) return INACTIVE_KIT_FX
  return {
    active: true,
    kitId: ability.kitId,
    normalPrimitive: ability.normalPrimitive,
    artPrimitive: ability.artPrimitive,
    artPower: ability.artPower,
    artCooldownMs: ability.artCooldownMs,
  }
}

/** v4 Kit 数值 mods 解析（S1 旁路）：从 V4_KIT_SETS 收集 v4 Kit 的数值阶梯 */
export function v4KitNumericMods(s: GameState): Partial<import('../data').Mods> {
  const out: Partial<import('../data').Mods> = {}
  for (const setId of equippedSetIds(s)) {
    if (!setId.startsWith(V4_KIT_SET_ID_PREFIX)) continue
    const def = V4_KIT_SETS.get(setId)
    if (!def) continue
    const count = setPieceCount(s, setId)
    for (const bonus of def.bonuses) {
      if (count >= bonus.count && bonus.mods) {
        for (const [key, value] of Object.entries(bonus.mods)) {
          const k = key as keyof import('../data').Mods
          out[k] = (out[k] ?? 0) + (value as number)
        }
      }
    }
  }
  return out
}

/** v4 Kit 是否激活（便捷检查） */
export function isV4KitActive(s: GameState): boolean {
  return resolveV4KitAbility(s) !== null
}

// ---------- 动态套装 KitPrimitive 旁路（S4-dyn / S5-dyn）----------
// 动态套装的 SetBonus 可携带 normalPrimitive / artPrimitive（可选字段）。
// 这些旁路从常规套装（非 v4 Kit）的激活 4/6 件条目中提取原语，
// 合成 KitAbility 供现有 executor 管线使用，不改动既有 v4 三十套路由。

const DYNAMIC_KIT_ID = 'k_dyn' as KitId

function buildSyntheticKitAbility(
  source: SetAbilitySource,
  normalPrim: KitPrimitive | undefined,
  artPrim: KitPrimitive | undefined,
): KitAbility {
  const normal = normalPrim ?? artPrim ?? 'roundtrip'
  const art = artPrim ?? normalPrim ?? 'roundtrip'
  const params = V4_KIT_PRIMITIVE_PARAMS[art]
  return {
    kitId: DYNAMIC_KIT_ID,
    name: source.bonus.artName ?? source.bonus.attackName ?? '无名法术',
    normalPrimitive: normal,
    artPrimitive: art,
    element: '',
    theme: '',
    artPower: source.bonus.artPower ?? params?.artPower ?? 1.0,
    artCooldownMs: source.bonus.artCooldownMs ?? params?.artCooldownMs ?? 8000,
  }
}

/** 动态套装普攻侧 KitPrimitive 旁路（S4-dyn）：从常规套装 normalPrimitive 构建合成 KitAbility */
export function resolveDynamicKitNormalAbility(s: GameState): KitAbility | null {
  const source = resolveSetAttackSource(s)
  if (!source?.bonus.normalPrimitive) return null
  if (source.setId.startsWith(V4_KIT_SET_ID_PREFIX)) return null
  return buildSyntheticKitAbility(source, source.bonus.normalPrimitive, source.bonus.artPrimitive)
}

/** 动态套装神通侧 KitPrimitive 旁路（S5-dyn）：从常规套装 artPrimitive 构建合成 KitAbility */
export function resolveDynamicKitArtAbility(s: GameState): KitAbility | null {
  const source = resolveSetArtSource(s)
  if (!source?.bonus.artPrimitive) return null
  if (source.setId.startsWith(V4_KIT_SET_ID_PREFIX)) return null
  return buildSyntheticKitAbility(source, source.bonus.normalPrimitive, source.bonus.artPrimitive)
}

/** 动态套装神通覆写旁路（S5-dyn art）：返回动态套装的 art 覆写参数 */
export function resolveDynamicKitArtOverride(s: GameState): V4KitArtOverride | null {
  const source = resolveSetArtSource(s)
  if (!source?.bonus.artPrimitive) return null
  if (source.setId.startsWith(V4_KIT_SET_ID_PREFIX)) return null
  const primitive = source.bonus.artPrimitive
  const params = V4_KIT_PRIMITIVE_PARAMS[primitive]
  return {
    kitId: DYNAMIC_KIT_ID,
    primitive,
    power: source.bonus.artPower ?? params?.artPower ?? 1.0,
    cooldownMs: source.bonus.artCooldownMs ?? params?.artCooldownMs ?? 8000,
  }
}

/** 统一 KitAbility 普攻解析：v4 Kit 优先，然后动态套装 normal */
export function resolveAnyKitAbility(s: GameState): KitAbility | null {
  return resolveV4KitAbility(s) ?? resolveDynamicKitNormalAbility(s)
}

/** 统一 KitAbility 神通解析：v4 Kit 优先，然后动态套装 art */
export function resolveAnyKitArtAbility(s: GameState): KitAbility | null {
  return resolveV4KitAbility(s) ?? resolveDynamicKitArtAbility(s)
}

/** 统一神通覆写解析：v4 Kit 优先，然后动态套装 art */
export function resolveAnyKitArtOverride(s: GameState): V4KitArtOverride | null {
  return resolveV4KitArtOverride(s) ?? resolveDynamicKitArtOverride(s)
}
