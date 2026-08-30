// ---------- 宗门生产系统：炼丹 / 炼器 / 藏经阁 / 灵田 ----------

import { type EquipItem, forgeBySlot } from './core'
import { SKILLS, type Quality } from './data'
import type { Disciple } from './disciple-data'

/** 丹药 ID */
export type PillId = 'hp_pill' | 'breakthrough_pill' | 'exp_pill' | 'body_pill'

/** 丹药配方 */
export interface PillRecipe {
  id: PillId
  name: string
  desc: string
  herbCost: number
  /** 需要炼丹房等级 */
  requireLevel: number
  /** 每次炼制产出数量 */
  output: number
  /** 炼制成功率基础值 */
  baseSuccess: number
}

/** 丹药配方表 */
export const PILL_RECIPES: PillRecipe[] = [
  {
    id: 'hp_pill', name: '回春丹', desc: '恢复气血的丹药，存入个人丹药栏',
    herbCost: 5, requireLevel: 1, output: 3, baseSuccess: 0.9,
  },
  {
    id: 'exp_pill', name: '凝气丹', desc: '服用获得修炼经验',
    herbCost: 10, requireLevel: 2, output: 2, baseSuccess: 0.8,
  },
  {
    id: 'breakthrough_pill', name: '突破丹', desc: '服用后提升突破成功率',
    herbCost: 20, requireLevel: 3, output: 1, baseSuccess: 0.7,
  },
  {
    id: 'body_pill', name: '锻体丹', desc: '永久提升弟子气血上限',
    herbCost: 15, requireLevel: 4, output: 1, baseSuccess: 0.75,
  },
]

/** 炼丹成功率计算 */
export function alchemySuccess(recipe: PillRecipe, alchemyLevel: number): number {
  const bonus = (alchemyLevel - recipe.requireLevel) * 0.05
  return Math.min(0.99, Math.max(0.1, recipe.baseSuccess + bonus))
}

/** 炼器配置 */
export interface ForgeRecipe {
  name: string
  slot: 'weapon' | 'head' | 'armor' | 'boots' | 'charm'
  oreCost: number
  woodCost: number
  requireLevel: number
}

/** 炼器配方表 */
export const FORGE_RECIPES: ForgeRecipe[] = [
  { name: '锻造武器', slot: 'weapon', oreCost: 15, woodCost: 5, requireLevel: 1 },
  { name: '锻造头盔', slot: 'head', oreCost: 10, woodCost: 5, requireLevel: 1 },
  { name: '锻造护甲', slot: 'armor', oreCost: 12, woodCost: 8, requireLevel: 1 },
  { name: '锻造靴子', slot: 'boots', oreCost: 8, woodCost: 6, requireLevel: 1 },
  { name: '锻造饰品', slot: 'charm', oreCost: 10, woodCost: 10, requireLevel: 2 },
]

/** 宗门科技 ID */
export type TechId = 'spirit_gather' | 'body_temper' | 'mind_focus' | 'array_master'

/** 宗门科技定义 */
export interface TechDef {
  id: TechId
  name: string
  desc: string
  maxLevel: number
  insightCost: number  // 每级消耗悟道点基数
  prestigeCost: number // 每级消耗声望基数
  requireLibrary: number
}

/** 宗门科技表 */
export const TECHS: Record<TechId, TechDef> = {
  spirit_gather: {
    id: 'spirit_gather', name: '聚灵阵', desc: '全宗修炼速度 +5%/级',
    maxLevel: 10, insightCost: 10, prestigeCost: 5, requireLibrary: 1,
  },
  body_temper: {
    id: 'body_temper', name: '锻体诀', desc: '全宗弟子气血 +3%/级',
    maxLevel: 10, insightCost: 15, prestigeCost: 5, requireLibrary: 2,
  },
  mind_focus: {
    id: 'mind_focus', name: '凝神术', desc: '全宗弟子攻击 +3%/级',
    maxLevel: 10, insightCost: 15, prestigeCost: 10, requireLibrary: 3,
  },
  array_master: {
    id: 'array_master', name: '阵法宗师', desc: '护山大阵效果 +10%/级',
    maxLevel: 5, insightCost: 30, prestigeCost: 20, requireLibrary: 4,
  },
}

/** 科技 ID 列表 */
export const TECH_IDS: TechId[] = ['spirit_gather', 'body_temper', 'mind_focus', 'array_master']

/** 计算科技升级费用 */
export function techUpgradeCost(tech: TechDef, currentLevel: number): { insight: number; prestige: number } {
  const lv = currentLevel + 1
  return {
    insight: tech.insightCost * lv,
    prestige: tech.prestigeCost * lv,
  }
}

/** 灵田作物类型 */
export interface CropDef {
  id: string
  name: string
  seedCost: number  // 灵石种子费用
  growTime: number   // 生长时间（秒）
  herbYield: number  // 产出灵草
  requireFarm: number
}

/** 灵田作物表 */
export const CROPS: CropDef[] = [
  { id: 'ling_grass', name: '灵草', seedCost: 50, growTime: 60, herbYield: 8, requireFarm: 1 },
  { id: 'spirit_herb', name: '灵药', seedCost: 150, growTime: 120, herbYield: 20, requireFarm: 2 },
  { id: 'immortal_herb', name: '仙药', seedCost: 400, growTime: 240, herbYield: 50, requireFarm: 3 },
]

/** 灵田种植记录 */
export interface CropSlot {
  cropId: string
  plantTime: number  // ms 时间戳
  ready: boolean
}

/** 生成锻造装备（走 buildItem 管线，获得词缀和品质） */
export function generateForgedEquipment(
  slot: 'weapon' | 'head' | 'armor' | 'boots' | 'charm',
  forgeLevel: number,
  playerLevel: number,
  rng: () => number,
): EquipItem {
  return forgeBySlot(slot, forgeLevel, playerLevel, rng)
}

/** 可教学功法列表（从 SKILLS 中筛选） */
export function getTeachableSkills(discipleRealm: number): { id: string; name: string; desc: string; insightCost: number }[] {
  const teachable: { id: string; name: string; desc: string; insightCost: number }[] = []
  for (const [id, skill] of SKILLS) {
    const skillRealm = skill.type === 'art' ? 3 : 0
    if (discipleRealm < skillRealm) continue
    teachable.push({
      id,
      name: skill.name,
      desc: skill.desc,
      insightCost: 5 + skillRealm * 5,
    })
  }
  return teachable.slice(0, 12)
}

/** 弟子学习功法 */
export function canLearnSkill(d: Disciple, skillId: string): boolean {
  return !d.skills.includes(skillId) && d.skills.length < 3
}

/** 计算弟子科技加成后的属性倍率 */
export function getTechMultipliers(techs: Record<string, number>): { cultSpeed: number; hp: number; atk: number } {
  return {
    cultSpeed: 1 + (techs.spirit_gather ?? 0) * 0.05,
    hp: 1 + (techs.body_temper ?? 0) * 0.03,
    atk: 1 + (techs.mind_focus ?? 0) * 0.03,
  }
}
