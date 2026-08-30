// ---------- 弟子系统数据定义 ----------

import type { WorldTime } from './world-time'
import type { EquipItem } from './core'

/** 灵根类型 */
export type SpiritRoot =
  | 'gold'    // 金灵根
  | 'wood'    // 木灵根
  | 'water'   // 水灵根
  | 'fire'    // 火灵根
  | 'earth'   // 土灵根
  | 'thunder' // 雷灵根（变异）
  | 'ice'     // 冰灵根（变异）
  | 'wind'    // 风灵根（变异）

/** 灵根品质 */
export type RootTier = 'common' | 'uncommon' | 'rare' | 'epic'

/** 弟子境界（复用玩家境界体系） */
export type DiscipleRealm = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** 天赋 ID */
export type TalentId =
  | 'body_tempering'  // 铁骨 - 气血+
  | 'sword_affinity'  // 剑心 - 攻击+
  | 'swift_mind'      // 悟性 - 修炼速度+
  | 'thick_skin'      // 厚皮 - 防御+
  | 'spirit_eye'      // 灵眼 - 暴击+
  | 'stone_skin'      // 石肤 - 减伤+
  | 'merciless'       // 无情 - 暴伤+
  | 'frail'           // 体弱 - 气血-（负面）
  | 'dull'            // 愚钝 - 修炼速度-（负面）
  | 'heavenly_root'   // 天灵根 - 修炼速度大幅+（稀有）

/** 天赋定义 */
export interface TalentDef {
  id: TalentId
  name: string
  desc: string
  positive: boolean
  rarity: 'common' | 'rare'
}

/** 弟子状态 */
export type DiscipleStatus = 'idle' | 'cultivating' | 'retreating' | 'dispatched'

/** 宗门任务类型 */
export type SectQuestType = 'gather' | 'patrol' | 'subdue' | 'explore'

/** 宗门任务定义 */
export interface SectQuest {
  id: string
  type: SectQuestType
  name: string
  desc: string
  /** 时长（秒） */
  duration: number
  /** 需要弟子最低境界 */
  minRealm: DiscipleRealm
  /** 奖励 */
  rewards: { stone: number; herb: number; ore: number; wood: number; insight: number; prestige: number; exp: number }
  /** 成功率基础值（0~1） */
  baseSuccess: number
}

/** 弟子数据 */
export interface Disciple {
  uid: string
  name: string
  root: SpiritRoot
  rootTier: RootTier
  realm: DiscipleRealm
  exp: number
  /** 升级所需经验 */
  expToNext: number
  talents: TalentId[]
  loyalty: number      // 忠诚 0-100
  affection: number    // 好感 0-100
  /** 已学功法 ID 列表 */
  skills: string[]
  status: DiscipleStatus
  /** 派遣任务 ID（如有） */
  questId: string | null
  /** 派遣开始时间（ms 时间戳） */
  questStartTime: number
  /** 闭关结束时间（ms 时间戳），0 = 未闭关 */
  retreatEndTime: number
  /** 指点冷却（ms 时间戳） */
  guidanceCooldown: number
  /** 切磋冷却（ms 时间戳） */
  sparCooldown: number
  /** 战斗属性（用于派遣计算） */
  atk: number
  def: number
  maxHp: number
  crit: number
  /** 装备的法器（按槽位） */
  equipment: { weapon: EquipItem | null; head: EquipItem | null; armor: EquipItem | null; boots: EquipItem | null; charm: EquipItem | null }
  /** 职位等级 0=外门弟子 1=内门弟子 2=执事 3=长老 4=大长老 */
  rank: number
  /** 管理职能 */
  role: string | null
}

/** 灵根配置 */
export const SPIRIT_ROOTS: Record<SpiritRoot, { name: string; color: string; tier: RootTier }> = {
  gold: { name: '金灵根', color: '#fbbf24', tier: 'common' },
  wood: { name: '木灵根', color: '#84cc16', tier: 'common' },
  water: { name: '水灵根', color: '#38bdf8', tier: 'common' },
  fire: { name: '火灵根', color: '#f87171', tier: 'common' },
  earth: { name: '土灵根', color: '#a78bfa', tier: 'common' },
  thunder: { name: '雷灵根', color: '#facc15', tier: 'epic' },
  ice: { name: '冰灵根', color: '#7dd3fc', tier: 'rare' },
  wind: { name: '风灵根', color: '#86efac', tier: 'rare' },
}

/** 天赋配置 */
export const TALENTS: Record<TalentId, TalentDef> = {
  body_tempering: { id: 'body_tempering', name: '铁骨', desc: '气血 +20%', positive: true, rarity: 'common' },
  sword_affinity: { id: 'sword_affinity', name: '剑心', desc: '攻击 +15%', positive: true, rarity: 'common' },
  swift_mind: { id: 'swift_mind', name: '悟性', desc: '修炼速度 +30%', positive: true, rarity: 'common' },
  thick_skin: { id: 'thick_skin', name: '厚皮', desc: '防御 +15%', positive: true, rarity: 'common' },
  spirit_eye: { id: 'spirit_eye', name: '灵眼', desc: '暴击 +10%', positive: true, rarity: 'common' },
  stone_skin: { id: 'stone_skin', name: '石肤', desc: '受到伤害 -10%', positive: true, rarity: 'common' },
  merciless: { id: 'merciless', name: '无情', desc: '暴击伤害 +50%', positive: true, rarity: 'rare' },
  frail: { id: 'frail', name: '体弱', desc: '气血 -15%', positive: false, rarity: 'common' },
  dull: { id: 'dull', name: '愚钝', desc: '修炼速度 -20%', positive: false, rarity: 'common' },
  heavenly_root: { id: 'heavenly_root', name: '天灵根', desc: '修炼速度 +60%', positive: true, rarity: 'rare' },
}

/** 境界名称 */
export const REALM_NAMES: string[] = [
  '炼气', '筑基', '金丹', '元婴', '化神', '合体', '大乘',
]

/** 生成随机弟子名 */
const SURNAMES = ['李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗']
const GIVEN_NAMES = ['青阳', '玄明', '素心', '若虚', '云裳', '苍梧', '明月', '清风', '含光', '望舒', '北辰', '南星', '紫丹', '凌尘', '念空', '守一', '道生', '无为', '幻真', '澄心']

function randomName(rng: () => number): string {
  const s = SURNAMES[Math.floor(rng() * SURNAMES.length)]
  const g = GIVEN_NAMES[Math.floor(rng() * GIVEN_NAMES.length)]
  return s + g
}

/** 灵根品质权重 */
const ROOT_TIERS: { tier: RootTier; roots: SpiritRoot[]; weight: number }[] = [
  { tier: 'common', roots: ['gold', 'wood', 'water', 'fire', 'earth'], weight: 70 },
  { tier: 'rare', roots: ['ice', 'wind'], weight: 25 },
  { tier: 'epic', roots: ['thunder'], weight: 5 },
]

/** 随机生成灵根 */
function randomRoot(rng: () => number): { root: SpiritRoot; tier: RootTier } {
  const r = rng() * 100
  let acc = 0
  for (const rt of ROOT_TIERS) {
    acc += rt.weight
    if (r < acc) {
      return { root: rt.roots[Math.floor(rng() * rt.roots.length)], tier: rt.tier }
    }
  }
  return { root: 'gold', tier: 'common' }
}

/** 随机生成天赋 */
function randomTalents(rng: () => number): TalentId[] {
  const count = 2 + Math.floor(rng() * 2) // 2-3个
  const positive: TalentId[] = ['body_tempering', 'sword_affinity', 'swift_mind', 'thick_skin', 'spirit_eye', 'stone_skin']
  const rare: TalentId[] = ['merciless', 'heavenly_root']
  const negative: TalentId[] = ['frail', 'dull']
  const result: TalentId[] = []

  // 70% 无负面，25% 一个负面，5% 两个负面
  const negCount = rng() < 0.7 ? 0 : rng() < 0.85 ? 1 : 2
  const posCount = count - negCount

  for (let i = 0; i < posCount; i++) {
    const pool = rng() < 0.15 ? rare : positive
    const pick = pool[Math.floor(rng() * pool.length)]
    if (!result.includes(pick)) result.push(pick)
  }
  for (let i = 0; i < negCount; i++) {
    const pick = negative[Math.floor(rng() * negative.length)]
    if (!result.includes(pick)) result.push(pick)
  }
  return result
}

/** 计算弟子基础属性（根据境界和天赋） */
function calcStats(realm: DiscipleRealm, root: SpiritRoot, rootTier: RootTier, talents: TalentId[]): { atk: number; def: number; maxHp: number; crit: number } {
  const tierMult = rootTier === 'epic' ? 1.3 : rootTier === 'rare' ? 1.15 : 1.0
  let atk = Math.floor((30 + realm * 25) * tierMult)
  let def = Math.floor((15 + realm * 12) * tierMult)
  let maxHp = Math.floor((200 + realm * 150) * tierMult)
  let crit = 5 + realm * 2

  for (const t of talents) {
    switch (t) {
      case 'body_tempering': maxHp = Math.floor(maxHp * 1.2); break
      case 'sword_affinity': atk = Math.floor(atk * 1.15); break
      case 'thick_skin': def = Math.floor(def * 1.15); break
      case 'spirit_eye': crit += 10; break
      case 'frail': maxHp = Math.floor(maxHp * 0.85); break
    }
  }
  return { atk, def, maxHp, crit }
}

/** 修炼速度系数（根据灵根和天赋） */
export function cultivationSpeed(root: SpiritRoot, rootTier: RootTier, talents: TalentId[]): number {
  let speed = rootTier === 'epic' ? 1.6 : rootTier === 'rare' ? 1.3 : 1.0
  for (const t of talents) {
    if (t === 'swift_mind') speed *= 1.3
    if (t === 'heavenly_root') speed *= 1.6
    if (t === 'dull') speed *= 0.8
  }
  return speed
}

/** 弟子升级所需经验 */
export function expToNextRealm(realm: DiscipleRealm): number {
  return 100 + realm * 80 + realm * realm * 20
}

/** 生成新弟子 */
export function generateDisciple(rng: () => number, sectLevel: number): Disciple {
  const { root, tier } = randomRoot(rng)
  const talents = randomTalents(rng)
  const stats = calcStats(0, root, tier, talents)

  return {
    uid: 'd_' + Date.now().toString(36) + '_' + Math.floor(rng() * 9999).toString(36),
    name: randomName(rng),
    root,
    rootTier: tier,
    realm: 0,
    exp: 0,
    expToNext: expToNextRealm(0),
    talents,
    loyalty: 60 + Math.floor(rng() * 20),
    affection: 30 + Math.floor(rng() * 15),
    skills: [],
    status: 'idle',
    questId: null,
    questStartTime: 0,
    retreatEndTime: 0,
    guidanceCooldown: 0,
    sparCooldown: 0,
    rank: 0,
    role: null,
    ...stats,
    equipment: { weapon: null, head: null, armor: null, boots: null, charm: null },
  }
}

/** 宗门任务模板 */
export const SECT_QUESTS: SectQuest[] = [
  {
    id: 'q_gather_herb', type: 'gather', name: '采集灵草',
    desc: '派遣弟子前往灵药谷采集灵草', duration: 120, minRealm: 0,
    rewards: { stone: 0, herb: 15, ore: 0, wood: 0, insight: 2, prestige: 1, exp: 30 },
    baseSuccess: 0.9,
  },
  {
    id: 'q_gather_ore', type: 'gather', name: '挖掘矿石',
    desc: '派遣弟子前往矿脉挖掘矿石', duration: 180, minRealm: 1,
    rewards: { stone: 0, herb: 0, ore: 20, wood: 0, insight: 2, prestige: 1, exp: 40 },
    baseSuccess: 0.85,
  },
  {
    id: 'q_patrol', type: 'patrol', name: '宗门巡逻',
    desc: '派遣弟子巡视宗门周边，防范妖兽', duration: 90, minRealm: 0,
    rewards: { stone: 50, herb: 0, ore: 0, wood: 10, insight: 1, prestige: 3, exp: 25 },
    baseSuccess: 0.95,
  },
  {
    id: 'q_subdue_beast', type: 'subdue', name: '镇压妖兽',
    desc: '附近发现妖兽踪迹，派遣弟子镇压', duration: 240, minRealm: 2,
    rewards: { stone: 200, herb: 10, ore: 10, wood: 20, insight: 5, prestige: 8, exp: 80 },
    baseSuccess: 0.65,
  },
  {
    id: 'q_explore_ruins', type: 'explore', name: '探索遗迹',
    desc: '发现远古修士洞府，派遣弟子探索', duration: 300, minRealm: 3,
    rewards: { stone: 500, herb: 30, ore: 30, wood: 30, insight: 15, prestige: 15, exp: 150 },
    baseSuccess: 0.5,
  },
]

/** 计算弟子任务成功率 */
export function questSuccessRate(quest: SectQuest, disciple: Disciple): number {
  const realmBonus = (disciple.realm - quest.minRealm) * 0.1
  const eff = effectiveStats(disciple)
  const atkBonus = eff.atk / 200
  let rate = quest.baseSuccess + realmBonus + atkBonus
  if (disciple.loyalty < 40) rate -= 0.1
  return Math.min(0.99, Math.max(0.1, rate))
}

/** 计算弟子有效属性（基础 + 装备加成） */
export function effectiveStats(d: Disciple): { atk: number; def: number; maxHp: number; crit: number } {
  let atk = d.atk
  let def = d.def
  let maxHp = d.maxHp
  let crit = d.crit
  const slots: (keyof Disciple['equipment'])[] = ['weapon', 'head', 'armor', 'boots', 'charm']
  for (const slot of slots) {
    const item = d.equipment[slot]
    if (!item) continue
    atk += item.atk ?? 0
    def += item.def ?? 0
    maxHp += item.maxHp ?? 0
    crit += item.crit ?? 0
    if (item.speed) atk += Math.floor(item.speed * 0.5)
  }
  return { atk, def, maxHp, crit }
}

/** 计算弟子综合战力（用于切磋和排序） */
export function disciplePower(d: Disciple): number {
  const eff = effectiveStats(d)
  return Math.floor(eff.atk * 3 + eff.def * 2 + eff.maxHp * 0.5 + eff.crit * 10 + d.realm * 100)
}

/** 切磋结果 */
export interface SparResult {
  winner: Disciple
  loser: Disciple
  winnerExp: number
  loserExp: number
  d1Power: number
  d2Power: number
  rounds: string[]
}

/** 模拟一场弟子切磋 */
export function sparDisciples(d1: Disciple, d2: Disciple, rng: () => number): SparResult {
  const eff1 = effectiveStats(d1)
  const eff2 = effectiveStats(d2)
  const p1 = disciplePower(d1)
  const p2 = disciplePower(d2)

  const rounds: string[] = []
  let hp1 = eff1.maxHp
  let hp2 = eff2.maxHp
  let turn = 0

  while (hp1 > 0 && hp2 > 0 && turn < 20) {
    turn++
    const attacker = turn % 2 === 1 ? d1 : d2
    const defender = turn % 2 === 1 ? d2 : d1
    const atkEff = turn % 2 === 1 ? eff1 : eff2
    const defEff = turn % 2 === 1 ? eff2 : eff1

    const isCrit = rng() < atkEff.crit / 100
    const rawDmg = Math.max(1, atkEff.atk - Math.floor(defEff.def * 0.5))
    const dmg = isCrit ? Math.floor(rawDmg * 1.5) : rawDmg

    if (turn % 2 === 1) {
      hp2 -= dmg
    } else {
      hp1 -= dmg
    }
    rounds.push(`第${turn}回合 ${attacker.name} ${isCrit ? '暴击' : '攻击'}造成 ${dmg} 伤害`)
  }

  const d1Wins = hp1 >= hp2
  const winner = d1Wins ? d1 : d2
  const loser = d1Wins ? d2 : d1

  const loserPower = d1Wins ? p2 : p1
  const winnerExp = 30 + loser.realm * 12 + Math.floor(loserPower * 0.01)
  const loserExp = 10 + winner.realm * 6

  return { winner, loser, winnerExp, loserExp, d1Power: p1, d2Power: p2, rounds }
}

/** 切磋冷却（秒） */
export const SPAR_COOLDOWN = 120

// ===== 弟子晋升体系 =====

export interface DiscipleRankDef {
  level: number
  name: string
  minRealm: DiscipleRealm
  minLoyalty: number
  desc: string
}

export const DISCIPLE_RANKS: DiscipleRankDef[] = [
  { level: 0, name: '外门弟子', minRealm: 0, minLoyalty: 0, desc: '新入门弟子，修炼基础功法' },
  { level: 1, name: '内门弟子', minRealm: 1, minLoyalty: 50, desc: '修炼速度+20%' },
  { level: 2, name: '执事', minRealm: 2, minLoyalty: 60, desc: '管理资源产出，灵石产出+15%' },
  { level: 3, name: '长老', minRealm: 4, minLoyalty: 75, desc: '指导弟子修炼，修炼速度+30%' },
  { level: 4, name: '大长老', minRealm: 5, minLoyalty: 85, desc: '全宗修炼速度+15%，防御力+10%' },
]

export const DISCIPLE_ROLES = [
  { id: 'quartermaster', name: '掌库执事', desc: '灵石产出+15%', effect: { type: 'stone', mult: 0.15 } },
  { id: 'herbalist', name: '灵药执事', desc: '灵草产出+15%', effect: { type: 'herb', mult: 0.15 } },
  { id: 'forge_master', name: '炼器执事', desc: '矿石产出+15%', effect: { type: 'ore', mult: 0.15 } },
  { id: 'wood_master', name: '灵木执事', desc: '木材产出+15%', effect: { type: 'wood', mult: 0.15 } },
  { id: 'instructor', name: '传功长老', desc: '弟子修炼速度+30%', effect: { type: 'cult_speed', mult: 0.30 } },
  { id: 'array_master', name: '阵法长老', desc: '宗门防御力+15%', effect: { type: 'defense', mult: 0.15 } },
] as const

export function canPromote(d: Disciple): boolean {
  const nextRank = DISCIPLE_RANKS[d.rank + 1]
  if (!nextRank) return false
  if (d.realm < nextRank.minRealm) return false
  if (d.loyalty < nextRank.minLoyalty) return false
  return true
}

export function promoteDisciple(d: Disciple): boolean {
  if (!canPromote(d)) return false
  d.rank++
  return true
}

export function rankName(d: Disciple): string {
  return DISCIPLE_RANKS[d.rank]?.name ?? '外门弟子'
}

/** 弟子闭关消耗（灵石） */
export function retreatCost(realm: DiscipleRealm): number {
  return 100 + realm * 50
}

/** 闭关时长（秒） */
export const RETREAT_DURATION = 180

/** 指点冷却（秒） */
export const GUIDANCE_COOLDOWN = 600

/** 指点经验加成 */
export const GUIDANCE_EXP = 50
