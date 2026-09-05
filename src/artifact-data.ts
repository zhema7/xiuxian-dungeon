// ---------- 法宝系统数据定义 ----------

/** 法宝品质 */
export type ArtifactTier = 'rare' | 'epic' | 'legendary' | 'mythic'

/** 战斗buff类型 */
export type ArtifactBuffType =
  | 'flying_sword'      // 额外召唤飞剑（剑修）
  | 'spell_amplify'     // 法术增幅（法修）
  | 'heal_boost'        // 治疗增强（仙子）
  | 'atk_pct'           // 攻击百分比加成
  | 'def_pct'           // 领域减伤
  | 'crit_boost'        // 暴击增强
  | 'lifesteal'         // 吸血
  | 'all_stats'         // 全属性加成

/** 法宝静态定义 */
export interface ArtifactDef {
  id: string
  name: string
  desc: string
  tier: ArtifactTier
  /** 适用职业（null=全职业） */
  classId: string | null
  /** 基础属性 */
  stats: { atk: number; def: number; maxHp: number; crit: number; speed: number }
  /** 战斗buff类型 */
  buffType: ArtifactBuffType
  /** buff强度（如飞剑数量、增伤百分比等） */
  buffValue: number
  /** 炼制所需灵石 */
  craftCost: number
  /** 炼制所需境界索引 */
  craftRealm: number
  /** 精炼所需灵石基数（×(精炼等级+1)²） */
  refineCostBase: number
}

/** 法宝实例 */
export interface ArtifactInstance {
  defId: string
  /** 精炼等级 0-9 */
  refineLevel: number
}

export const ARTIFACTS: Record<string, ArtifactDef> = {
  tian_di_jian_xin: {
    id: 'tian_di_jian_xin',
    name: '天地剑心',
    desc: '剑修专用·招式释放时额外召唤飞剑进行攻击',
    tier: 'legendary',
    classId: 'sword',
    stats: { atk: 80, def: 30, maxHp: 500, crit: 0.03, speed: 5 },
    buffType: 'flying_sword',
    buffValue: 1,            // 额外飞剑数量
    craftCost: 50000,
    craftRealm: 2,           // 金丹期
    refineCostBase: 20000,
  },
  wan_xiang_bao_jing: {
    id: 'wan_xiang_bao_jing',
    name: '万象宝镜',
    desc: '法修专用·法术伤害增幅',
    tier: 'legendary',
    classId: 'mage',
    stats: { atk: 60, def: 40, maxHp: 400, crit: 0.02, speed: 3 },
    buffType: 'spell_amplify',
    buffValue: 0.15,          // 法术伤害+15%
    craftCost: 50000,
    craftRealm: 2,
    refineCostBase: 20000,
  },
  jing_shi_lian_hua: {
    id: 'jing_shi_lian_hua',
    name: '净世莲华',
    desc: '仙子专用·治疗与护盾增强',
    tier: 'legendary',
    classId: 'fairy',
    stats: { atk: 50, def: 50, maxHp: 600, crit: 0.02, speed: 3 },
    buffType: 'heal_boost',
    buffValue: 0.25,          // 治疗效果+25%
    craftCost: 50000,
    craftRealm: 2,
    refineCostBase: 20000,
  },
  jiu_long_shen_huo: {
    id: 'jiu_long_shen_huo',
    name: '九龙神火罩',
    desc: '全职业·攻击力百分比加成',
    tier: 'epic',
    classId: null,
    stats: { atk: 100, def: 20, maxHp: 300, crit: 0.02, speed: 4 },
    buffType: 'atk_pct',
    buffValue: 0.10,          // 攻击力+10%
    craftCost: 30000,
    craftRealm: 2,
    refineCostBase: 15000,
  },
  hun_yuan_yi_qi_tower: {
    id: 'hun_yuan_yi_qi_tower',
    name: '混元一气塔',
    desc: '全职业·减伤护盾',
    tier: 'epic',
    classId: null,
    stats: { atk: 30, def: 120, maxHp: 800, crit: 0.01, speed: 2 },
    buffType: 'def_pct',
    buffValue: 0.10,          // 减伤10%
    craftCost: 30000,
    craftRealm: 2,
    refineCostBase: 15000,
  },
  qian_kun_ding: {
    id: 'qian_kun_ding',
    name: '乾坤鼎',
    desc: '全职业·全属性加成与吸血',
    tier: 'mythic',
    classId: null,
    stats: { atk: 120, def: 80, maxHp: 1000, crit: 0.04, speed: 8 },
    buffType: 'all_stats',
    buffValue: 0.08,          // 全属性+8%
    craftCost: 100000,
    craftRealm: 3,            // 元婴期
    refineCostBase: 40000,
  },
}

/** 精炼属性倍率：每级+15%基础属性，buffValue+5% */
export function refineStatMult(refineLevel: number): number {
  return 1 + 0.15 * refineLevel
}

export function refineBuffMult(refineLevel: number): number {
  return 1 + 0.05 * refineLevel
}

/** 精炼费用 = base × (level+1)² */
export function refineCost(base: number, currentLevel: number): number {
  return Math.floor(base * Math.pow(currentLevel + 1, 2))
}

/** 计算法宝实例的实际属性加成 */
export function artifactStats(a: ArtifactInstance): { atk: number; def: number; maxHp: number; crit: number; speed: number } {
  const def = ARTIFACTS[a.defId]
  if (!def) return { atk: 0, def: 0, maxHp: 0, crit: 0, speed: 0 }
  const mult = refineStatMult(a.refineLevel)
  return {
    atk: Math.round(def.stats.atk * mult),
    def: Math.round(def.stats.def * mult),
    maxHp: Math.round(def.stats.maxHp * mult),
    crit: def.stats.crit * mult,
    speed: Math.round(def.stats.speed * mult),
  }
}

/** 计算法宝实例的实际buff值 */
export function artifactBuffValue(a: ArtifactInstance): number {
  const def = ARTIFACTS[a.defId]
  if (!def) return 0
  return def.buffValue * refineBuffMult(a.refineLevel)
}

/** 获取玩家已装备法宝的buff（取第一个匹配的） */
export function getArtifactBuff(artifacts: ArtifactInstance[], classId: string): { type: ArtifactBuffType; value: number } | null {
  for (const a of artifacts) {
    const def = ARTIFACTS[a.defId]
    if (!def) continue
    if (def.classId && def.classId !== classId) continue
    return { type: def.buffType, value: artifactBuffValue(a) }
  }
  return null
}

/** 计算所有法宝的属性总加成 */
export function totalArtifactStats(artifacts: ArtifactInstance[]): { atk: number; def: number; maxHp: number; crit: number; speed: number } {
  let atk = 0, def = 0, maxHp = 0, crit = 0, speed = 0
  for (const a of artifacts) {
    const s = artifactStats(a)
    atk += s.atk; def += s.def; maxHp += s.maxHp; crit += s.crit; speed += s.speed
  }
  return { atk, def, maxHp, crit, speed }
}

/** 宗门圣物槽位（宗门界面装配） */
export const SECT_RELIC_SLOTS = 3
