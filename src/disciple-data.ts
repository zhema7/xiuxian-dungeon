// ---------- 弟子系统数据定义 ----------

import type { WorldTime } from './world-time'
import type { EquipItem } from './core'
import type { DaoPath, Background, LifeGoal, Profession, PersonalityTrait, Physique, Gender } from './procedural-npc'
import { initDiscipleGear, initDiscipleSkills, skillPowerAt } from './npc-progression'
import { SKILLS } from './data'

// ---------- 弟子 uid 生成（修复 B19：原用 Date.now() 同毫秒会撞号） ----------
// 同一进程内由模块级自增 + 短随机保证唯一，不依赖墙钟毫秒，
// 便于存档回放 + 批量招募不互相覆盖。
let discipleUidSeq = 0

function nextDiscipleUid(rng: () => number): string {
  const seq = (discipleUidSeq++).toString(36).padStart(3, '0')
  const tail = Math.floor(rng() * 0xffff).toString(36).padStart(3, '0')
  return `d_${seq}_${tail}`
}

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

/** 培养特长（决定产出倾向与贡献系数） */
export type DiscipleSpecialty =
  | 'combat' | 'alchemy' | 'crafting' | 'talisman' | 'management' | 'intelligence'

/** 培养侧重（决定修炼速度与成长方向） */
export type TrainingFocus =
  | 'cultivation' | 'combat' | 'alchemy' | 'crafting' | 'talisman' | 'balanced'

export const SPECIALTY_NAMES: Record<DiscipleSpecialty, string> = {
  combat: '战斗型',
  alchemy: '丹道型',
  crafting: '器道型',
  talisman: '符道型',
  management: '管理型',
  intelligence: '情报型',
}

export const SPECIALTY_DESC: Record<DiscipleSpecialty, string> = {
  combat: '擅长战斗，可随师出战秘境',
  alchemy: '擅长炼丹，管理药园，提供丹药',
  crafting: '擅长炼器，管理矿场，打造装备',
  talisman: '擅长画符，提供符箓支援',
  management: '擅长经营，管理产业，打理灵石',
  intelligence: '擅长搜集情报，打探消息',
}

export const TRAINING_FOCUS_NAMES: Record<TrainingFocus, string> = {
  cultivation: '闭关修炼',
  combat: '战斗训练',
  alchemy: '丹道研习',
  crafting: '器道研习',
  talisman: '符道研习',
  balanced: '均衡培养',
}

/** 弟子数据 */
export interface Disciple {
  uid: string
  name: string
  /** 性别（用于程序化贴图） */
  gender: Gender
  /** 道途（用于程序化贴图和功法倾向） */
  daoPath: DaoPath
  /** 出身背景 */
  background: Background
  /** 体质 */
  physique: Physique
  /** 人生目标 */
  lifeGoal: LifeGoal
  /** 当前职业身份 */
  profession: Profession
  /** 性格特征 */
  personality: PersonalityTrait[]
  /** 程序化贴图种子 */
  appearanceSeed: number
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
  /** 修炼开始时间（ms 时间戳），0 = 未修炼 */
  cultivateStartTime: number
  /** 疲劳值 0-100，修炼增加，休息减少 */
  fatigue: number
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
  /** 宗门经营 buff（按职务生效） */
  sectBuffs?: {
    stoneBonus?: number    // 灵石产出加成（%）
    herbBonus?: number     // 灵草产出加成（%）
    oreBonus?: number      // 矿石产出加成（%）
    woodBonus?: number    // 木材产出加成（%）
    cultBonus?: number    // 全宗修炼效率加成（%）
    alchemyBonus?: number // 炼丹效率加成（%）
    forgeBonus?: number   // 炼器效率加成（%）
    defenseBonus?: number // 宗门防御加成（固定值）
    prestigeBonus?: number // 声望产出加成（%）
  }
  /** 弟子所在宗门内坐标（用于显示位置） */
  sectX?: number
  sectY?: number
  /** 弟子目标位置（游荡用） */
  targetX?: number
  targetY?: number
  /** 弟子当前活动描述（显示用） */
  currentActivity?: string
  // ---------- 培养线字段（原 DiscipleData 独有，合轨后并入本实体）----------
  /** 来源世界 NPC ID；宗门自行招录的弟子为空串 */
  npcId?: string
  /** 境界内细分等级（0~9，满 10 触发突破判定） */
  level?: number
  /** 培养特长 */
  specialty?: DiscipleSpecialty
  /** 培养侧重 */
  trainingFocus?: TrainingFocus
  /** 已投入的培养资源 */
  resourcesAllocated?: { gold: number; pills: number; materials: number }
  /** 心情 0-100，影响忠诚变化与贡献系数 */
  mood?: number
  /** 派遣历练中的任务（培养线，区别于宗门任务 questId） */
  onMission?: string | null
  /** 派遣结束时间（ms 时间戳） */
  missionEndTime?: number
  /** 每周上交贡献（灵石） */
  weeklyContribution?: number
  /** 上次结算贡献的时间 */
  lastContributionTime?: number
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
export function generateDisciple(rng: () => number, sectLevel: number): Disciple {  const { root, tier } = randomRoot(rng)
  const talents = randomTalents(rng)
  const stats = calcStats(0, root, tier, talents)
  const sectBuffs = generateSectBuffs(rng, talents)

  // 生成 NPC 级别的丰富信息
  const gender: Gender = rng() < 0.5 ? 'male' : 'female'
  const daoPaths: DaoPath[] = ['剑道', '丹道', '器道', '符道', '体修', '法修']
  const daoPath = daoPaths[Math.floor(rng() * daoPaths.length)]
  const backgrounds: Background[] = ['寒门子弟', '世家嫡子', '宗门遗孤', '魔修遗脉', '商贾之家', '散修传承', '猎户出身', '书香门第', '武将之后', '妖族混血']
  const background = backgrounds[Math.floor(rng() * backgrounds.length)]
  const physiques: Physique[] = ['普通', '普通', '普通', '单灵根', '单灵根', '双灵根', '天灵根', '异灵根']
  const physique = physiques[Math.floor(rng() * physiques.length)]
  const lifeGoals: LifeGoal[] = ['飞升长生', '报仇雪恨', '扬名立万', '守护宗门', '逍遥自在', '寻访亲人', '光复宗门', '追求大道', '富甲天下', '名垂青史']
  const lifeGoal = lifeGoals[Math.floor(rng() * lifeGoals.length)]
  const professions: Profession[] = ['散修', '宗门弟子', '丹师', '器师', '符师', '商人', '镖师', '游侠']
  const profession = professions[Math.floor(rng() * professions.length)]
  const personalityTraits: PersonalityTrait[] = ['刚正', '狡诈', '孤僻', '热情', '贪婪', '淡泊', '好战', '谨慎']
  const pCount = 1 + Math.floor(rng() * 2)
  const personality: PersonalityTrait[] = []
  for (let i = 0; i < pCount; i++) {
    const t = personalityTraits[Math.floor(rng() * personalityTraits.length)]
    if (!personality.includes(t)) personality.push(t)
  }
  const appearanceSeed = Math.floor(rng() * 0xffffffff)

  const disciple: Disciple = {
    uid: nextDiscipleUid(rng),
    name: randomName(rng),
    gender,
    daoPath,
    background,
    physique,
    lifeGoal,
    profession,
    personality,
    appearanceSeed,
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
    cultivateStartTime: 0,
    fatigue: 0,
    rank: 0,
    role: null,
    ...stats,
    equipment: { weapon: null, head: null, armor: null, boots: null, charm: null },
    sectBuffs,
    npcId: '',
    level: 0,
    specialty: 'combat',
    trainingFocus: 'balanced',
    resourcesAllocated: { gold: 0, pills: 0, materials: 0 },
    mood: 70,
    onMission: null,
    missionEndTime: 0,
    weeklyContribution: 0,
    lastContributionTime: Date.now(),
  }

  // 修为档案下沉：装备四件与功法按「修为 + 出身 + 职业 + 道途」生成，不再是空白
  initDiscipleGear(disciple)
  initDiscipleSkills(disciple)
  return disciple
}

/** 根据天赋生成宗门经营 buff */
function generateSectBuffs(rng: () => number, talents: TalentId[]): Disciple['sectBuffs'] {
  const buffs: NonNullable<Disciple['sectBuffs']> = {}
  // 基础 buff 随天赋生效
  for (const t of talents) {
    switch (t) {
      case 'heavenly_root':
        buffs.cultBonus = (buffs.cultBonus ?? 0) + 10
        buffs.prestigeBonus = (buffs.prestigeBonus ?? 0) + 5
        break
      case 'body_tempering':
        buffs.defenseBonus = (buffs.defenseBonus ?? 0) + 50
        break
      case 'spirit_eye':
        buffs.alchemyBonus = (buffs.alchemyBonus ?? 0) + 8
        buffs.forgeBonus = (buffs.forgeBonus ?? 0) + 8
        break
      case 'thick_skin':
        buffs.stoneBonus = (buffs.stoneBonus ?? 0) + 5
        buffs.woodBonus = (buffs.woodBonus ?? 0) + 5
        break
      case 'stone_skin':
        buffs.oreBonus = (buffs.oreBonus ?? 0) + 8
        buffs.defenseBonus = (buffs.defenseBonus ?? 0) + 30
        break
      case 'merciless':
        buffs.defenseBonus = (buffs.defenseBonus ?? 0) + 40
        buffs.prestigeBonus = (buffs.prestigeBonus ?? 0) + 3
        break
    }
  }
  // 随机额外 buff（50% 几率获得一项随机经营 buff）
  if (rng() < 0.5) {
    const randomBuffs: (keyof NonNullable<Disciple['sectBuffs']>)[] = [
      'stoneBonus', 'herbBonus', 'oreBonus', 'woodBonus', 'cultBonus', 'prestigeBonus'
    ]
    const key = randomBuffs[Math.floor(rng() * randomBuffs.length)]
    ;(buffs as Record<string, number>)[key] = ((buffs as Record<string, number>)[key] ?? 0) + Math.floor(3 + rng() * 7)
  }
  return Object.keys(buffs).length > 0 ? buffs : undefined
}

function numOf(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/**
 * 就地补齐弟子实体的必填字段。
 * 用于：旧档迁移（v13 弟子合轨）、以及各处精简构造的弟子（如宗门战里的玩家角色）。
 * 只补不覆盖已存在的值，幂等。
 */
export function healDiscipleShape(input: unknown): void {
  const d = input as Partial<Disciple> & Record<string, unknown>
  const now = Date.now()
  const realm = Math.max(0, Math.min(6, Math.trunc(numOf(d.realm)))) as DiscipleRealm
  if (typeof d.uid !== 'string' || !d.uid) {
    d.uid = 'd_' + now.toString(36) + '_' + Math.floor(Math.random() * 9999).toString(36)
  }
  if (typeof d.name !== 'string' || !d.name) d.name = '无名'
  if (d.gender !== 'male' && d.gender !== 'female') d.gender = 'male'
  if (!d.daoPath) d.daoPath = '剑道'
  if (!d.background) d.background = '寒门子弟'
  if (!d.physique) d.physique = '普通'
  if (!d.lifeGoal) d.lifeGoal = '飞升长生'
  if (!d.profession) d.profession = '宗门弟子'
  if (!Array.isArray(d.personality) || d.personality.length === 0) d.personality = ['淡泊']
  if (typeof d.appearanceSeed !== 'number') d.appearanceSeed = Math.floor(Math.random() * 0xffffffff)
  if (!d.root) d.root = 'gold'
  if (!d.rootTier) d.rootTier = 'common'
  d.realm = realm
  d.exp = numOf(d.exp)
  d.expToNext = numOf(d.expToNext) || expToNextRealm(realm)
  if (!Array.isArray(d.talents)) d.talents = []
  d.loyalty = numOf(d.loyalty, 60)
  d.affection = numOf(d.affection, 30)
  if (!Array.isArray(d.skills)) d.skills = []
  if (!d.status) d.status = 'idle'
  if (d.questId === undefined) d.questId = null
  d.questStartTime = numOf(d.questStartTime)
  d.retreatEndTime = numOf(d.retreatEndTime)
  d.guidanceCooldown = numOf(d.guidanceCooldown)
  d.sparCooldown = numOf(d.sparCooldown)
  d.cultivateStartTime = numOf(d.cultivateStartTime)
  d.fatigue = numOf(d.fatigue)
  d.atk = numOf(d.atk) || Math.floor(30 + realm * 25)
  d.def = numOf(d.def) || Math.floor(15 + realm * 12)
  d.maxHp = numOf(d.maxHp) || Math.floor(200 + realm * 150)
  d.crit = numOf(d.crit, 5)
  const eq = (d.equipment ?? {}) as Partial<Disciple['equipment']>
  d.equipment = {
    weapon: eq.weapon ?? null,
    head: eq.head ?? null,
    armor: eq.armor ?? null,
    boots: eq.boots ?? null,
    charm: eq.charm ?? null,
  }
  d.rank = numOf(d.rank)
  if (d.role === undefined) d.role = null
}

/**
 * 培养线字段补齐后的弟子类型。
 * `Disciple` 上这些字段是可选的（宗门战里有精简构造的玩家角色），
 * 经 `ensureCultivation()` 后即满足本类型，后续逻辑可安全直取。
 */
export type CultivatedDisciple = Disciple & Required<Pick<Disciple,
  'npcId' | 'level' | 'specialty' | 'trainingFocus' | 'resourcesAllocated' |
  'mood' | 'onMission' | 'missionEndTime' | 'weeklyContribution' | 'lastContributionTime'>>

/** 补齐培养线字段默认值（旧档与精简构造的弟子缺少这些字段）；幂等 */
export function ensureCultivation(d: Disciple): asserts d is CultivatedDisciple {
  if (typeof d.npcId !== 'string') d.npcId = ''
  if (typeof d.level !== 'number') d.level = 0
  if (!d.specialty) d.specialty = 'combat'
  if (!d.trainingFocus) d.trainingFocus = 'balanced'
  if (!d.resourcesAllocated) d.resourcesAllocated = { gold: 0, pills: 0, materials: 0 }
  if (typeof d.mood !== 'number') d.mood = 70
  if (d.onMission === undefined) d.onMission = null
  if (typeof d.missionEndTime !== 'number') d.missionEndTime = 0
  if (typeof d.weeklyContribution !== 'number') d.weeklyContribution = 0
  if (typeof d.lastContributionTime !== 'number') d.lastContributionTime = Date.now()
}

/**
 * 弟子战力折算系数。
 * 修为档案给出的是绝对战力（练气约 600、化神约 12000），而宗门评估原本按
 * 「等级×10」量级（约 30/人）。乘此系数后回到同一量级，避免宗门战力暴涨破坏平衡。
 */
export const DISCIPLE_POWER_SCALE = 0.03

/**
 * 宗门评估用的弟子战力贡献 —— 全项目唯一口径。
 * 各处（宗门战 / 年度大典 / 外交 / 成就）都调它，杜绝「一边数人数、一边算战力」。
 */
export function sectDisciplePower(disciples: Disciple[]): number {
  let sum = 0
  for (const d of disciples) sum += disciplePower(d)
  return Math.floor(sum * DISCIPLE_POWER_SCALE)
}

/** 汇总弟子宗门经营 buff */
export function aggregateSectBuffs(disciples: Disciple[]): NonNullable<Disciple['sectBuffs']> {
  const total: NonNullable<Disciple['sectBuffs']> = {}
  for (const d of disciples) {
    if (!d.sectBuffs) continue
    for (const [key, val] of Object.entries(d.sectBuffs)) {
      ;(total as Record<string, number>)[key] = ((total as Record<string, number>)[key] ?? 0) + (val as number)
    }
  }
  return total
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

/**
 * 计算弟子综合战力（切磋、排序与宗门评估共用同一口径）。
 * 修为档案下沉后：属性含真实装备加成，功法按威力计入（与 NPC 修为档案同口径）。
 */
export function disciplePower(d: Disciple): number {
  const eff = effectiveStats(d)
  let power = eff.atk * 3 + eff.def * 2 + eff.maxHp * 0.5 + eff.crit * 10 + d.realm * 100
  for (const id of d.skills ?? []) {
    const def = SKILLS.get(id)
    if (def) power += skillPowerAt(def, 1) * 90
  }
  return Math.floor(power)
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

// ===== 弟子事件日志 =====

export type DiscipleEventType =
  | 'recruit'       // 招募入宗
  | 'cultivate'     // 修炼提升
  | 'breakthrough'  // 境界突破
  | 'quest_start'   // 开始任务
  | 'quest_success' // 任务成功
  | 'quest_fail'    // 任务失败
  | 'attacked'      // 在外被袭击
  | 'killed'        // 在外遇害
  | 'rescued'       // 被救回
  | 'promote'       // 晋升
  | 'retreat_start' // 开始闭关
  | 'retreat_end'   // 闭关结束
  | 'spar_win'      // 切磋获胜
  | 'spar_lose'     // 切磋失败
  | 'guidance'      // 受指点

export interface DiscipleEvent {
  id: string
  type: DiscipleEventType
  discipleUid: string
  discipleName: string
  timestamp: number   // ms 时间戳
  description: string
  /** 相关数据（如任务名、敌人名、奖励等） */
  data?: Record<string, any>
}

// ===== 灵石提升修为 =====

/** 灵石直接提升弟子修为的消耗（每级递增） */
export function stoneCultivateCost(realm: DiscipleRealm, currentExp: number, expToNext: number): number {
  const remainExp = expToNext - currentExp
  // 每10点经验消耗5灵石，境界越高越贵
  const perExpCost = 0.5 + realm * 0.3
  return Math.ceil(remainExp * perExpCost)
}

/** 使用灵石提升修为，返回获得的经验和是否突破 */
export function stoneCultivate(d: Disciple, stoneAmount: number): { expGained: number; breakthrough: boolean; cost: number } {
  const perExpCost = 0.5 + d.realm * 0.3
  const expGained = Math.floor(stoneAmount / perExpCost)
  let breakthrough = false
  let cost = stoneAmount

  d.exp += expGained
  // 检查是否突破
  while (d.exp >= d.expToNext && d.realm < 6) {
    d.exp -= d.expToNext
    d.realm = (d.realm + 1) as DiscipleRealm
    d.expToNext = expToNextRealm(d.realm)
    breakthrough = true
    // 更新属性
    const stats = calcStats(d.realm, d.root, d.rootTier, d.talents)
    d.atk = stats.atk
    d.def = stats.def
    d.maxHp = stats.maxHp
    d.crit = stats.crit
  }
  // 如果突破了，重新计算实际消耗（可能有多的）
  if (breakthrough) {
    // 简化处理：按实际获得经验重算消耗
    const actualExp = expGained
    cost = Math.ceil(actualExp * perExpCost)
  }
  return { expGained, breakthrough, cost }
}

// ===== 弟子宗门内位置 =====

/** 宗门内弟子活动区域定义 */
export const SECT_ACTIVITY_AREAS = {
  training_ground: { name: '演武场', x: 120, y: 200, w: 80, h: 60, status: 'cultivating' as DiscipleStatus },
  meditation_hall: { name: '悟道殿', x: 200, y: 120, w: 60, h: 50, status: 'cultivating' as DiscipleStatus },
  herb_garden: { name: '灵药园', x: 60, y: 280, w: 70, h: 50, status: 'idle' as DiscipleStatus },
  main_hall: { name: '主殿', x: 160, y: 60, w: 80, h: 50, status: 'idle' as DiscipleStatus },
  dormitory: { name: '弟子房', x: 260, y: 200, w: 60, h: 70, status: 'idle' as DiscipleStatus },
}

/** 为空闲弟子分配宗门内游荡位置 */
export function assignIdleSectPosition(d: Disciple, rng: () => number): { x: number; y: number; activity: string } {
  const areas = Object.values(SECT_ACTIVITY_AREAS)
  const area = areas[Math.floor(rng() * areas.length)]
  const x = area.x + Math.floor(rng() * area.w)
  const y = area.y + Math.floor(rng() * area.h)
  return { x, y, activity: area.name }
}

// ===== 弟子在外遇袭事件 =====

/** 遇袭结果类型 */
export type AmbushResult = 'victory' | 'injured' | 'killed' | 'fled'

/** 遇袭事件数据 */
export interface AmbushEvent {
  attackerName: string
  attackerType: 'bandit' | 'demon' | 'beast' | 'rogue_cultivator'
  attackerRealm: number
  attackerPower: number
  result: AmbushResult
  damage: number
  lootLost: { stone?: number; herb?: number; ore?: number }
}

/** 敌人名称库 */
const AMBUSH_ENEMIES = {
  bandit: [
    { name: '黑风寨盗匪', realm: 0, power: 80 },
    { name: '黄沙岭劫匪', realm: 1, power: 150 },
    { name: '血刀门残党', realm: 2, power: 280 },
    { name: '幽冥盗圣', realm: 3, power: 500 },
  ],
  demon: [
    { name: '嗜血魔修', realm: 1, power: 180 },
    { name: '蚀骨魔将', realm: 2, power: 320 },
    { name: '炼魂鬼修', realm: 3, power: 550 },
    { name: '血河魔尊', realm: 4, power: 900 },
  ],
  beast: [
    { name: '赤眼狼群', realm: 0, power: 60 },
    { name: '铁甲巨蟒', realm: 1, power: 140 },
    { name: '玄铁背熊', realm: 2, power: 260 },
    { name: '三尾妖狐', realm: 3, power: 480 },
  ],
  rogue_cultivator: [
    { name: '邪修散人', realm: 1, power: 200 },
    { name: '逐出师门叛徒', realm: 2, power: 350 },
    { name: '魔道卧底', realm: 3, power: 600 },
    { name: '化神老怪', realm: 4, power: 950 },
  ],
}

/**
 * 检查派遣中的弟子是否遭遇袭击
 * @param d 弟子
 * @param questType 任务类型
 * @param rng 随机数生成器
 * @returns 遇袭事件（如发生），否则 null
 */
export function checkAmbush(
  d: Disciple,
  questType: SectQuestType,
  rng: () => number,
): AmbushEvent | null {
  // 不同任务类型的遇袭概率
  const ambushRates: Record<SectQuestType, number> = {
    gather: 0.08,    // 采集：较低
    patrol: 0.15,    // 巡逻：中等
    subdue: 0.25,    // 征讨：较高
    explore: 0.20,   // 探索：中高
  }

  const baseRate = ambushRates[questType] ?? 0.1

  // 高境界弟子降低遇袭概率（敌人不敢惹）
  const realmFactor = Math.max(0.4, 1 - d.realm * 0.1)
  const rate = baseRate * realmFactor

  if (rng() > rate) return null

  // 确定敌人类型（根据任务类型加权）
  const typeWeights: Record<SectQuestType, Record<string, number>> = {
    gather: { beast: 4, bandit: 3, rogue_cultivator: 2, demon: 1 },
    patrol: { bandit: 4, rogue_cultivator: 3, demon: 2, beast: 1 },
    subdue: { demon: 4, rogue_cultivator: 3, bandit: 2, beast: 1 },
    explore: { beast: 3, demon: 3, rogue_cultivator: 2, bandit: 2 },
  }
  const weights = typeWeights[questType] ?? { beast: 1, bandit: 1, demon: 1, rogue_cultivator: 1 }
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)
  let roll = rng() * totalWeight
  let attackerType: keyof typeof AMBUSH_ENEMIES = 'bandit'
  for (const [type, w] of Object.entries(weights)) {
    roll -= w
    if (roll <= 0) {
      attackerType = type as keyof typeof AMBUSH_ENEMIES
      break
    }
  }

  // 选择敌人（境界接近弟子）
  const enemies = AMBUSH_ENEMIES[attackerType]
  const targetRealm = Math.max(0, Math.min(enemies.length - 1, d.realm + (rng() < 0.3 ? 1 : 0)))
  const enemy = enemies[targetRealm]

  // 计算弟子战力
  const discPower = disciplePower(d)

  // 战斗判定
  const powerRatio = discPower / enemy.power
  let result: AmbushResult
  let damage = 0
  let lootLost: { stone?: number; herb?: number; ore?: number } = {}

  if (powerRatio >= 1.5) {
    // 碾压：轻松获胜
    result = 'victory'
    damage = Math.floor(enemy.power * 0.1)
  } else if (powerRatio >= 1.0) {
    // 险胜：获胜但受伤
    result = rng() < 0.6 ? 'victory' : 'injured'
    damage = Math.floor(enemy.power * 0.3)
  } else if (powerRatio >= 0.7) {
    // 劣势：可能受伤或逃跑
    result = rng() < 0.5 ? 'injured' : 'fled'
    damage = Math.floor(enemy.power * 0.5)
    // 逃跑会丢失部分物资
    if (result === 'fled') {
      lootLost = { stone: Math.floor(20 + rng() * 30) }
    }
  } else if (powerRatio >= 0.4) {
    // 大劣势：重伤
    result = 'injured'
    damage = Math.floor(enemy.power * 0.7)
    lootLost = { stone: Math.floor(30 + rng() * 50), herb: Math.floor(rng() * 10) }
  } else {
    // 极度劣势：有概率遇害
    if (rng() < 0.35) {
      result = 'killed'
      damage = 9999
      lootLost = { stone: Math.floor(50 + rng() * 100) }
    } else {
      result = 'injured'
      damage = Math.floor(enemy.power * 0.8)
      lootLost = { stone: Math.floor(40 + rng() * 60), ore: Math.floor(rng() * 10) }
    }
  }

  return {
    attackerName: enemy.name,
    attackerType,
    attackerRealm: enemy.realm,
    attackerPower: enemy.power,
    result,
    damage,
    lootLost,
  }
}

/** 遇袭结果描述 */
export function ambushResultName(result: AmbushResult): string {
  switch (result) {
    case 'victory': return '击退来敌'
    case 'injured': return '负伤而归'
    case 'fled': return '侥幸逃脱'
    case 'killed': return '不幸遇害'
  }
}
