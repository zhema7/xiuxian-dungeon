// ---------- v4 Generator3（ADR §3：确定性 Kit 选择 + schema4 记录） ----------
// 从 32-bit 显式 seed + 序列号派生 Kit 选择，不引入 Math.random/Date.now
// 生成结果为 v4 schema 记录（schemaVersion=4, generatorVersion=3）
// 不写 attackMode/artMode/fxTags（D8），不进共享 SETS（S7）
// P3 裁定：雷网/雷桩持久实体不持久化，进本重建——本生成器不存阵实体状态

import { seededRng } from '../lore'
import {
  V4_KIT_ABILITY_MAP, V4_KIT_WHITELIST,
  type ItemBase, type KitId, type Mods, type SetDef,
} from '../data'
import { V4_KIT_BASES, V4_KIT_SETS, v4SetId } from './kit-data'

export const V4_KIT_SCHEMA_VERSION = 4
export const V4_KIT_GENERATOR_VERSION = 3

/** schema4 生成元数据 */
export interface V4KitGeneration {
  generatorVersion: 3
  seed: number
  sequence: number
  kitId: KitId
}

/** v4 Kit 生成记录（schema4，独立于 DynamicSetRecord，不走 normalizeDynamicSetRecords） */
export interface V4KitRecord {
  schemaVersion: 4
  generation: V4KitGeneration
  kitId: KitId
  set: SetDef
  bases: ItemBase[]
}

function ri(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

/** 确定性 Kit 选择：seed + sequence → 白名单 KitId */
function selectKit(seed: number, sequence: number): KitId {
  const rng = seededRng(seed ^ 0x9e3779b9)
  for (let i = 0; i < sequence; i++) rng()
  const idx = ri(rng, 0, V4_KIT_WHITELIST.length - 1)
  return V4_KIT_WHITELIST[idx]
}

/** 确定性数值微调：在静态基座上加 ±10% 浮动（仅影响基座数值，不影响 Kit 能力身份） */
function jitterBase(base: ItemBase, rng: () => number): ItemBase {
  const out: ItemBase = { ...base }
  if (out.atk) out.atk = Math.round(out.atk * (0.9 + rng() * 0.2))
  if (out.def) out.def = Math.round(out.def * (0.9 + rng() * 0.2))
  if (out.maxHp) out.maxHp = Math.round(out.maxHp * (0.9 + rng() * 0.2))
  if (out.speed) out.speed = Math.round(out.speed * (0.9 + rng() * 0.2))
  if (out.crit) out.crit = round3(out.crit * (0.9 + rng() * 0.2))
  return out
}

/** 确定性 mods 微调：在静态 mods 上加 ±15% 浮动 */
function jitterMods(mods: Partial<Mods>, rng: () => number, scale = 0.15): Partial<Mods> {
  const out: Partial<Mods> = {}
  for (const [k, v] of Object.entries(mods)) {
    out[k as keyof typeof out] = round3((v as number) * (1 - scale + rng() * 2 * scale))
  }
  return out
}

/**
 * 生成 v4 Kit 记录（确定性）。
 * seed + sequence → 白名单 KitId → 静态 KitAbility → 抖动后的 SetDef + bases。
 * 同 seed+sequence 永远返回同一记录（D10：Kit 生成确定性）。
 */
export function generateV4Kit(seed: number, sequence: number): V4KitRecord {
  const resolvedSeed = (seed >>> 0) || 1
  const normalizedSeq = Math.max(1, Math.trunc(sequence) || 1)
  const kitId = selectKit(resolvedSeed, normalizedSeq)
  const ability = V4_KIT_ABILITY_MAP.get(kitId)!

  const rng = seededRng(resolvedSeed ^ (normalizedSeq * 0x85ebca6b))

  const setId = v4SetId(kitId)
  const staticSet = V4_KIT_SETS.get(setId)!
  const staticBases = V4_KIT_BASES.filter((b) => b.set === setId)
  const jitteredBases = staticBases.map((b) => jitterBase(b, rng))

  // 抖动 mods
  const bonuses = staticSet.bonuses.map((bonus) => {
    if (bonus.mods) {
      return { ...bonus, mods: jitterMods(bonus.mods, rng) }
    }
    return bonus
  })

  return {
    schemaVersion: V4_KIT_SCHEMA_VERSION,
    generation: {
      generatorVersion: V4_KIT_GENERATOR_VERSION,
      seed: resolvedSeed,
      sequence: normalizedSeq,
      kitId,
    },
    kitId,
    set: { ...staticSet, bonuses },
    bases: jitteredBases,
  }
}

// ---------- S8 旁路：schema4 独立 normalize 门 ----------
// 不走 normalizeDynamicSetRecords（仅 legacy/v2/v3），v4 记录用独立 schema 版本门

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * schema4 存档边界验证（S8 旁路）。
 * 仅接受 schemaVersion=4，校验 kitId 白名单 + 生成元数据完整性。
 * 不接受任何其他 schema 版本，绝不以删字段方式降级。
 */
export function normalizeV4KitRecord(input: unknown): V4KitRecord | null {
  if (!isPlainRecord(input)) return null
  if (input.schemaVersion !== V4_KIT_SCHEMA_VERSION) return null
  if (!isPlainRecord(input.generation)) return null
  const gen = input.generation
  if (gen.generatorVersion !== V4_KIT_GENERATOR_VERSION) return null
  if (typeof gen.seed !== 'number' || typeof gen.sequence !== 'number') return null
  if (typeof gen.kitId !== 'string') return null
  if (!V4_KIT_WHITELIST.includes(gen.kitId as KitId)) return null
  if (!isPlainRecord(input.set) || typeof input.set.id !== 'string') return null
  if (!Array.isArray(input.bases)) return null

  const kitId = gen.kitId as KitId
  const ability = V4_KIT_ABILITY_MAP.get(kitId)
  if (!ability) return null

  const setId = v4SetId(kitId)
  if (input.set.id !== setId) return null

  const staticDef = V4_KIT_SETS.get(setId)
  if (!staticDef) return null

  return {
    schemaVersion: V4_KIT_SCHEMA_VERSION,
    generation: {
      generatorVersion: V4_KIT_GENERATOR_VERSION,
      seed: gen.seed >>> 0,
      sequence: Math.max(1, Math.trunc(gen.sequence) || 1),
      kitId,
    },
    kitId,
    set: staticDef,
    bases: V4_KIT_BASES.filter((b) => b.set === setId),
  }
}

/** 批量 normalize（用于存档数组） */
export function normalizeV4KitRecords(input: unknown): V4KitRecord[] {
  if (!Array.isArray(input)) return []
  const accepted: V4KitRecord[] = []
  const seenKitIds = new Set<string>()
  for (const raw of input) {
    const rec = normalizeV4KitRecord(raw)
    if (!rec || seenKitIds.has(rec.kitId)) continue
    seenKitIds.add(rec.kitId)
    accepted.push(rec)
  }
  return accepted
}
