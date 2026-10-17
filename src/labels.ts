// ---------- 玩家可见文案的中文标签 ----------
// 内部 key / id（stone、wood、tupo、ai_sect_3、spirit_vein…）一律不得直接进入玩家可见文案，
// 需要展示时统一走这里；查不到时返回中文兜底词，避免日志/提示里冒出英文或原始 id。

import type { GameState } from './state'
import { BUILDINGS, type BuildingId } from './sect-data'

/** 宗门资源（SectResources / ResourceNode.production 的键） */
export const RESOURCE_LABELS: Record<string, string> = {
  stone: '灵石',
  herb: '灵草',
  ore: '矿石',
  wood: '木材',
  insight: '悟道点',
  prestige: '声望',
}

/** 材料 / 行囊（state.materials 的键） */
export const MATERIAL_LABELS: Record<string, string> = {
  gold: '灵石',
  stone: '灵石',
  wood: '木材',
  tupo: '突破石',
  lingcao: '灵草',
  herb: '灵草',
  herb_grass: '青灵草',
  herb_lotus: '九叶莲',
  herb_mushroom: '灵芝菇',
  ore: '矿石',
  ore_iron: '精铁矿',
  ore_silver: '玄银矿',
  beast_core: '妖兽内丹',
  shadow_essence: '暗影精魄',
  poison_herb: '毒煞草',
  crystal_ore: '晶石矿',
  refined_crystal: '凝晶',
}

/** 资源 key → 中文（用于宗门资源结算文案） */
export function resourceLabel(key: string): string {
  return RESOURCE_LABELS[key] ?? MATERIAL_LABELS[key] ?? '资源'
}

/** 材料 key → 中文（用于战利品/奖励文案） */
export function materialLabel(key: string): string {
  return MATERIAL_LABELS[key] ?? RESOURCE_LABELS[key] ?? '材料'
}

/** 宗门建筑 id → 中文名 */
export function buildingLabel(id: string): string {
  return BUILDINGS[id as BuildingId]?.name ?? '宗门建筑'
}

/** 势力显示名：'player' → 你方；AI 宗门 → 宗门名；查不到 → 未知宗门 */
export function sectLabel(state: GameState, id: string): string {
  if (id === 'player') return '你方'
  const ai = (state.aiSects ?? []).find(s => s.id === id)
  return ai?.name ?? '未知宗门'
}

/**
 * v4 套装战斗原语（KitPrimitive）→ 中文。
 * 八原语是英文 key（roundtrip / refract / boomerang…），曾直接插值进套装 4 件描述，
 * 导致玩家看到「招式化为【环斩·boomerang】」。一律走本函数再显示。
 */
export const PRIMITIVE_LABELS: Record<string, string> = {
  roundtrip: '往返',
  refract: '折射',
  mark: '标记',
  fixedpoint: '定点',
  thundernet: '雷网',
  thunderstake: '雷桩',
  charge: '蓄力',
  boomerang: '回旋',
}

/** 战斗原语 key → 中文（用于 v4 套装描述） */
export function primitiveLabel(key: string | null | undefined): string {
  if (!key) return '未知招式'
  return PRIMITIVE_LABELS[key] ?? '未知招式'
}
