// ---------- 功法系统运行时 ----------

import { SKILLS, type Mods, type SkillDef, emptyMods } from './data'
import { recordCodexSkill, type GameState } from './state'

export const SKILL_MAX_LEVEL = 5

export function skillDef(id: string): SkillDef | undefined { return SKILLS.get(id) }

export function skillLevel(s: GameState, id: string): number { return s.skills[id] ?? 0 }

/** 升级消耗悟道点：当前等级 × 2 */
export function upgradeCost(level: number): number { return level * 2 }

export function canUpgrade(s: GameState, id: string): boolean {
  const lv = skillLevel(s, id)
  return lv >= 1 && lv < SKILL_MAX_LEVEL && s.insight >= upgradeCost(lv)
}

export function upgradeSkill(s: GameState, id: string): boolean {
  if (!canUpgrade(s, id)) return false
  s.insight -= upgradeCost(s.skills[id])
  s.skills[id]++
  return true
}

/** 招式/神通威力（含等级成长 +12%/级） */
export function skillPowerAt(s: GameState, id: string): number {
  const def = SKILLS.get(id)
  if (!def) return 1
  return (def.power ?? 1) * (1 + 0.12 * (skillLevel(s, id) - 1))
}

/** 心法修饰（含等级成长 +20%/级） */
export function mindModsAt(id: string, level: number): Partial<Mods> {
  const def = SKILLS.get(id)
  if (!def?.mods) return {}
  const scale = 1 + 0.2 * (level - 1)
  const out: Partial<Mods> = {}
  for (const [k, v] of Object.entries(def.mods)) {
    ;(out as Record<string, number>)[k] = Math.round((v as number) * scale * 1000) / 1000
  }
  return out
}

/** 神通冷却（含天赋冷却缩减） */
export function artCooldown(s: GameState, id: string, cdPct: number): number {
  const def = SKILLS.get(id)
  if (!def?.cd) return 5000
  return def.cd * (1 - cdPct)
}

export type EquipSkillResult = 'ok' | 'full' | 'bad_type' | 'not_learned'

/** 装配功法到对应槽位（职业不匹配的招式/神通不可装配） */
export function equipSkill(s: GameState, id: string): EquipSkillResult {
  const def = SKILLS.get(id)
  if (!def || skillLevel(s, id) < 1) return 'not_learned'
  if (def.type !== 'mind' && def.class !== 'any' && def.class !== s.classId) return 'bad_type'
  if (def.type === 'style') { s.skillSlots.style = id; return 'ok' }
  if (def.type === 'art') { s.skillSlots.art = id; return 'ok' }
  // 心法：先填空位
  if (s.skillSlots.minds.includes(id)) return 'ok'
  const empty = s.skillSlots.minds.indexOf(null)
  if (empty === -1) return 'full'
  s.skillSlots.minds[empty] = id
  return 'ok'
}

export function unequipSkill(s: GameState, id: string): void {
  if (s.skillSlots.style === id) s.skillSlots.style = null
  if (s.skillSlots.art === id) s.skillSlots.art = null
  const i = s.skillSlots.minds.indexOf(id)
  if (i >= 0) s.skillSlots.minds[i] = null
}

export function isSkillEquipped(s: GameState, id: string): boolean {
  return s.skillSlots.style === id || s.skillSlots.art === id || s.skillSlots.minds.includes(id)
}

/** 未习得且当前职业可用的功法 id 列表（用于掉落/商店） */
export function unlearnedSkills(s: GameState): string[] {
  return [...SKILLS.values()]
    .filter((d) => !(d.id in s.skills) && (d.class === 'any' || d.class === s.classId))
    .map((d) => d.id)
}

export function learnSkill(s: GameState, id: string): void {
  if (!(id in s.skills)) s.skills[id] = 1
  recordCodexSkill(s, id)
}

export { emptyMods }
