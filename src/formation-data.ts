// ---------- 阵法部署系统数据定义 ----------

export type FormationType = 'attack' | 'defense' | 'trap'

export interface FormationDef {
  id: string
  name: string
  type: FormationType
  desc: string
  /** 学习消耗悟道点 */
  insightCost: number
  /** 学习消耗声望 */
  prestigeCost: number
  /** 需要藏经阁等级 */
  requireLibrary: number
  /** 攻击阵：玩家伤害加成 */
  atkBonus?: number
  /** 防御阵：玩家减伤 */
  dmgReduce?: number
  /** 陷阱阵：敌人接触伤害 */
  trapDamage?: number
  /** 持续时间（秒） */
  duration: number
  /** 冷却时间（秒） */
  cooldown: number
}

export const FORMATIONS: FormationDef[] = [
  // 攻击阵
  { id: 'f_sword_array', name: '万剑阵', type: 'attack', desc: '提升玩家攻击伤害 15%', insightCost: 20, prestigeCost: 10, requireLibrary: 1, atkBonus: 0.15, duration: 60, cooldown: 120 },
  { id: 'f_flame_array', name: '烈焰阵', type: 'attack', desc: '提升玩家攻击伤害 25%', insightCost: 40, prestigeCost: 20, requireLibrary: 3, atkBonus: 0.25, duration: 60, cooldown: 120 },
  { id: 'f_thunder_array', name: '雷霆阵', type: 'attack', desc: '提升玩家攻击伤害 40%', insightCost: 80, prestigeCost: 40, requireLibrary: 5, atkBonus: 0.40, duration: 45, cooldown: 150 },
  // 防御阵
  { id: 'f_shield_array', name: '护体阵', type: 'defense', desc: '减少受到伤害 15%', insightCost: 20, prestigeCost: 10, requireLibrary: 1, dmgReduce: 0.15, duration: 60, cooldown: 120 },
  { id: 'f_ice_wall', name: '冰壁阵', type: 'defense', desc: '减少受到伤害 25%', insightCost: 40, prestigeCost: 20, requireLibrary: 3, dmgReduce: 0.25, duration: 60, cooldown: 120 },
  { id: 'f_golden_bell', name: '金钟罩', type: 'defense', desc: '减少受到伤害 40%', insightCost: 80, prestigeCost: 40, requireLibrary: 5, dmgReduce: 0.40, duration: 45, cooldown: 150 },
  // 陷阱阵
  { id: 'f_fire_trap', name: '火雷阵', type: 'trap', desc: '敌人靠近时受到火焰伤害', insightCost: 20, prestigeCost: 10, requireLibrary: 1, trapDamage: 50, duration: 90, cooldown: 120 },
  { id: 'f_poison_trap', name: '毒雾阵', type: 'trap', desc: '敌人靠近时受到持续伤害', insightCost: 40, prestigeCost: 20, requireLibrary: 3, trapDamage: 80, duration: 90, cooldown: 120 },
  { id: 'f_soul_trap', name: '摄魂阵', type: 'trap', desc: '敌人靠近时受到大量伤害', insightCost: 80, prestigeCost: 40, requireLibrary: 5, trapDamage: 150, duration: 60, cooldown: 150 },
]

export const FORMATION_MAP = new Map(FORMATIONS.map(f => [f.id, f]))

export const FORMATION_TYPE_NAMES: Record<FormationType, string> = {
  attack: '攻击阵', defense: '防御阵', trap: '陷阱阵',
}

export const FORMATION_TYPE_COLORS: Record<FormationType, string> = {
  attack: '#f87171', defense: '#60a5fa', trap: '#a78bfa',
}

/** 阵法效果快照（运行时使用） */
export interface FormationEffect {
  formationId: string
  atkBonus: number
  dmgReduce: number
  trapDamage: number
  endTime: number
}

/** 创建阵法效果 */
export function createFormationEffect(formationId: string): FormationEffect | null {
  const f = FORMATION_MAP.get(formationId)
  if (!f) return null
  return {
    formationId: f.id,
    atkBonus: f.atkBonus ?? 0,
    dmgReduce: f.dmgReduce ?? 0,
    trapDamage: f.trapDamage ?? 0,
    endTime: Date.now() + f.duration * 1000,
  }
}

/** 阵法是否可用（冷却结束） */
export function isFormationReady(lastUseTime: number, formationId: string): boolean {
  const f = FORMATION_MAP.get(formationId)
  if (!f) return false
  return Date.now() >= lastUseTime + f.cooldown * 1000
}
