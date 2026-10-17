// ---------- 程序化 NPC 生成系统 ----------
// 基于确定性种子生成完整 NPC：属性/背景/性格/故事/背包/装备/关系网
//
// 属性 / 装备 / 功法统一由 npc-progression 的「修为档案」驱动：
// 修为（境界·等级·突破）× 经历（体质·道途·出身·职业·心性·隐秘）× 时间（道行年数·在世历练）

import type { GameState } from './state'
import { SKILLS } from './data'
import {
  buildNpcLoadout, buildNpcStats, forgeNpcGear, npcEquippedSkillIds,
  type NpcGear, type NpcLoadout, type NpcSkillLevels,
} from './npc-progression'

// ===== 类型定义 =====

export type Gender = 'male' | 'female'
export type PersonalityTrait =
  | '刚正' | '狡诈' | '孤僻' | '热情' | '贪婪' | '淡泊' | '好战' | '谨慎'
export type Background =
  | '寒门子弟' | '世家嫡子' | '宗门遗孤' | '魔修遗脉' | '商贾之家'
  | '散修传承' | '猎户出身' | '书香门第' | '武将之后' | '妖族混血'
export type DaoPath =
  | '剑道' | '丹道' | '器道' | '符道' | '体修' | '法修'
export type LifeGoal =
  | '飞升长生' | '报仇雪恨' | '扬名立万' | '守护宗门' | '逍遥自在'
  | '寻访亲人' | '光复宗门' | '追求大道' | '富甲天下' | '名垂青史'
export type Profession =
  | '散修' | '宗门弟子' | '丹师' | '器师' | '符师' | '商人' | '镖师' | '游侠'
export type Physique = '普通' | '单灵根' | '双灵根' | '天灵根' | '异灵根'

export interface NpcRelation {
  targetId: string
  type: RelationType
  level: number  // -100 ~ 100
}

export type RelationType =
  | 'master' | 'disciple' | 'partner' | 'friend' | 'enemy'
  | 'rival' | 'family' | 'benefactor' | 'trade' | 'acquaintance'

export interface NpcRelationEntry {
  sourceId: string
  targetId: string
  type: RelationType
  level: number
}

export interface PlayerNpcRelation {
  npcId: string
  favor: number       // 好感度
  trust: number       // 信任度
  fear: number        // 畏惧度
  saved: boolean      // 是否救过对方
  killedKnown: string[] // 对方知道你杀过的人
  metCount: number    // 相遇次数
  lastInteract: number // 上次互动时间
}

export interface ProceduralNpc {
  id: string
  seed: number
  name: string
  alias?: string
  gender: Gender
  age: number
  realm: number
  level: number
  physique: Physique
  profession: Profession
  personality: PersonalityTrait[]
  background: Background
  daoPath: DaoPath
  lifeGoal: LifeGoal
  currentPurpose: string
  secret: string
  story: { surface: string; middle: string; deep: string }
  inventory: Record<string, number>
  /** 旧展示字段（v12 前为占位 id 串，现由 gear 派生为真实装备名；保留仅为兼容旧读点） */
  equipment: { weapon?: string; armor?: string; accessory?: string }
  /** 旧展示字段：已装配功法 id（由 loadout 派生） */
  skills: string[]
  // ---- 修为档案（v12 起）----
  /** 已物化的真实装备（四槽） */
  gear: NpcGear
  /** 已装配功法（招式 / 心法×2 / 神通） */
  loadout: NpcLoadout
  /** 功法 id → 修炼等级 1~5 */
  skillLevels: NpcSkillLevels
  /** 累积历练值（升级消耗） */
  cultivation: number
  /** 在世历练天数（游戏内天） */
  cultivationDays: number
  /** 上次成长结算（世界时间戳，毫秒） */
  lastGrowthAt: number
  /** 突破次数 */
  breakthroughs: number
  /** 综合战力评分（buildNpcStats 缓存） */
  power: number
  morality: number  // NPC自身道德倾向
  location: { domain: string; x: number; y: number }
  schedule: NpcSchedule | null
  relations: NpcRelation[]
  appearanceSeed: number
  isActive: boolean
  alive: boolean
  hp: number
  maxHp: number
  atk: number
  def: number
  spd: number
  // 运行时
  eventLog: string[]
  spawnTime: number
}

export interface NpcSchedule {
  morning: string   // 辰时~午时
  afternoon: string // 未时~申时
  night: string     // 酉时~寅时
}

// ===== 词库 =====

const SURNAMES_M = ['李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴',
  '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗',
  '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧',
  '程', '曹', '袁', '邓', '许', '傅', '沈', '曾', '彭', '吕',
  '苏', '蒋', '贾', '丁', '魏', '薛', '叶', '阎', '余', '潘',
  '慕容', '司马', '欧阳', '上官', '南宫', '独孤', '东方', '公孙', '令狐', '皇甫']

const GIVEN_NAMES_M = ['逸风', '玄清', '天行', '云起', '星河', '剑心', '道尘', '元浩',
  '长风', '无极', '青松', '玉书', '凌霄', '破晓', '寒霜', '墨白',
  '渊明', '飞鸿', '正气', '忘机', '若虚', '一鸣', '千山', '万壑',
  '听雨', '观澜', '止戈', '藏锋', '问天', '求真', '归元', '知命',
  '踏雪', '寻梅', '听风', '揽月', '乘风', '破云', '斩尘', '了尘',
  '清虚', '玄微', '明远', '致远', '怀仁', '守正', '思齐', '见素',
  '天任', '乐山', '勇义', '智渊', '仁达', '信诚', '义薄', '礼文',
  '灵均', '正则', '修远', '九思', '三省', '博衍', '怀瑾', '若兰',
  '青尘', '墨渊', '素简', '安期', '长生', '道成', '法自然', '玄机']

const GIVEN_NAMES_F = ['若兰', '清漪', '月华', '素素', '瑶光', '凝霜', '雪琪', '碧落',
  '绛雪', '青鸾', '凤鸣', '芷若', '灵犀', '梦蝶', '听竹', '含烟',
  '落霞', '飞燕', '惊鸿', '照影', '冰心', '玉洁', '霜华', '露白',
  '婉清', '静姝', '慧心', '灵萱', '芷兰', '雨桐', '夏荷', '秋月',
  '冬梅', '春樱', '若曦', '长歌', '踏歌', '忘忧', '无忧', '清欢',
  '凌波', '洛神', '瑶池', '琼华', '倾城', '绝代', '风华', '无双',
  '青鸢', '墨莲', '素心', '安雅', '正音', '采薇', '蔓草', '零露',
  '巧倩', '美盼', '淑慎', '徽音', '德音', '静好', '静嘉', '其华']

// 故事模板
interface StoryTemplate {
  background: Background
  turning: string
  goal: LifeGoal
  surface: string
  middle: string
  deep: string
  compatible: PersonalityTrait[]  // 适配性格
  incompatible: LifeGoal[]        // 不兼容目标
}

const PERSONALITIES: PersonalityTrait[] = [
  '刚正', '狡诈', '孤僻', '热情', '贪婪', '淡泊', '好战', '谨慎'
]

const BACKGROUNDS: Background[] = [
  '寒门子弟', '世家嫡子', '宗门遗孤', '魔修遗脉', '商贾之家',
  '散修传承', '猎户出身', '书香门第', '武将之后', '妖族混血'
]

const DAO_PATHS: DaoPath[] = ['剑道', '丹道', '器道', '符道', '体修', '法修']

const LIFE_GOALS: LifeGoal[] = [
  '飞升长生', '报仇雪恨', '扬名立万', '守护宗门', '逍遥自在',
  '寻访亲人', '光复宗门', '追求大道', '富甲天下', '名垂青史'
]

const PROFESSIONS: Profession[] = [
  '散修', '宗门弟子', '丹师', '器师', '符师', '商人', '镖师', '游侠'
]

const PHYSIQUES: Physique[] = ['普通', '普通', '普通', '单灵根', '单灵根', '双灵根', '天灵根', '异灵根']

const CURRENT_PURPOSES = [
  '采药', '炼器材料', '寻找秘境', '护送商队', '追杀仇敌', '寻访故人',
  '闭关突破', '出售丹药', '购买法宝', '探索遗迹', '追查线索', '闲逛散心'
]

const SECRETS = [
  '隐藏身份：实为魔修后裔',
  '身怀重宝：储物戒中有传承玉简',
  '暗伤隐患：修炼过急留有暗伤',
  '魔种附身：偶尔被魔念控制',
  '双重身份：明面散修，暗为宗门暗探',
  '窃取功法：所学功法并非正途所得',
  '身负血誓：对某人立下血誓必须完成',
  '假名行走：真名若被揭穿会引发追杀',
  '灵根隐患：天灵根实为后天移植',
  '前尘记忆：偶尔涌现前世记忆碎片',
]

// ===== 简易 PRNG =====

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function seededRng(seed: number): () => number {
  let s = seed
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507)
    s = Math.imul(s ^ (s >>> 13), 3266489909)
    s = (s ^ (s >>> 16)) >>> 0
    return s / 4294967296
  }
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

function pickN<T>(arr: T[], n: number, rng: () => number): T[] {
  const copy = [...arr]
  const result: T[] = []
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length)
    result.push(copy[idx])
    copy.splice(idx, 1)
  }
  return result
}

function rangeR(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

// ===== 境界相关 =====

const REALM_NAMES = ['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫']

function ageForRealm(realm: number, rng: () => number): number {
  if (realm === 0) return rangeR(16, 35, rng)
  if (realm === 1) return rangeR(25, 60, rng)
  if (realm === 2) return rangeR(50, 200, rng)
  if (realm === 3) return rangeR(100, 500, rng)
  if (realm === 4) return rangeR(200, 1000, rng)
  return rangeR(500, 2000, rng)
}

// 属性公式已上移至 npc-progression.buildNpcStats（三维度驱动），此处不再保留旧的单参数公式。

// ===== 域权重 =====

const DOMAIN_REALM_WEIGHTS: Record<string, number[]> = {
  south: [50, 30, 15, 4, 1, 0, 0, 0],   // 南域低阶多
  central: [25, 30, 25, 15, 4, 1, 0, 0],
  east: [20, 25, 25, 20, 8, 2, 0, 0],
  west: [15, 20, 25, 20, 12, 5, 2, 1],
  north: [10, 15, 20, 20, 15, 10, 7, 3], // 北域高阶多
}

function pickRealm(domain: string, rng: () => number): number {
  const weights = DOMAIN_REALM_WEIGHTS[domain] ?? DOMAIN_REALM_WEIGHTS.south
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return 0
}

// ===== 生成函数 =====

let npcIdCounter = 0

export function generateProceduralNpc(
  domain: string,
  worldTimeMs: number,
  forcedRealm?: number,
  forcedLocation?: { x: number; y: number },
): ProceduralNpc {
  const seed = (Date.now() + npcIdCounter++) & 0x7fffffff
  const rng = seededRng(seed)
  const id = `pnpc_${seed.toString(36)}`

  const gender: Gender = rng() < 0.5 ? 'male' : 'female'
  const surname = pick(SURNAMES_M, rng)
  const givenName = gender === 'male' ? pick(GIVEN_NAMES_M, rng) : pick(GIVEN_NAMES_F, rng)
  const name = surname + givenName

  const realm = forcedRealm !== undefined ? forcedRealm : pickRealm(domain, rng)
  const age = ageForRealm(realm, rng)
  const physique = pick(PHYSIQUES, rng)
  const profession = pick(PROFESSIONS, rng)
  const personality = pickN(PERSONALITIES, rangeR(2, 3, rng), rng)
  const background = pick(BACKGROUNDS, rng)
  const daoPath = pick(DAO_PATHS, rng)
  const lifeGoal = pick(LIFE_GOALS, rng)
  const currentPurpose = pick(CURRENT_PURPOSES, rng)
  const secret = pick(SECRETS, rng)

  // 故事生成
  const story = generateStory(background, lifeGoal, personality, rng, { name, surname })

  // 等级（装备品质与功法数量均依赖修为，故先于装备/功法计算）
  const level = realm * 10 + rangeR(0, 9, rng)
  const inventory = generateNpcInventory(realm, profession, rng)

  // 修为档案：装备物化 → 功法装配 → 属性合成
  const draft = {
    id, seed, realm, level, age, physique, profession, daoPath, background,
    personality, secret, breakthroughs: 0, cultivationDays: 0,
  }
  const gear = forgeNpcGear(draft, rng)
  const { loadout, levels: skillLevels } = buildNpcLoadout(draft, rng)
  const stats = buildNpcStats({ ...draft, gear, loadout, skillLevels })
  // 旧展示字段由新档案派生（getNpcEquipName / getNpcSkillName 均可直接显示）
  const equipment = {
    weapon: gear.weapon ? gear.weapon.name : undefined,
    armor: gear.armor ? gear.armor.name : undefined,
  }
  const skills = npcEquippedSkillIds(loadout)

  // 道德倾向
  let morality = rangeR(-30, 30, rng)
  if (personality.includes('刚正')) morality += 20
  if (personality.includes('狡诈')) morality -= 15
  if (personality.includes('贪婪')) morality -= 10
  if (background === '魔修遗脉') morality -= 30
  if (background === '宗门遗孤') morality += 10

  // 日程
  const schedule = generateSchedule(profession, rng)

  // 位置
  const location = forcedLocation
    ? { domain, x: forcedLocation.x, y: forcedLocation.y }
    : {
        domain,
        x: rangeR(100, 1800, rng),
        y: rangeR(100, 2700, rng),
      }

  return {
    id,
    seed,
    name,
    gender,
    age,
    realm,
    level,
    physique,
    profession,
    personality,
    background,
    daoPath,
    lifeGoal,
    currentPurpose,
    secret,
    story,
    inventory,
    equipment,
    skills,
    gear,
    loadout,
    skillLevels,
    cultivation: 0,
    cultivationDays: 0,
    lastGrowthAt: worldTimeMs,
    breakthroughs: 0,
    power: stats.power,
    morality: Math.max(-100, Math.min(100, morality)),
    location,
    schedule,
    relations: [],
    appearanceSeed: seed,
    isActive: true,
    alive: true,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    atk: stats.atk,
    def: stats.def,
    spd: stats.spd,
    eventLog: [],
    spawnTime: worldTimeMs,
  }
}

// ===== 故事生成 =====

interface StoryContext {
  name: string
  surname: string
}

function generateStory(
  background: Background,
  goal: LifeGoal,
  personality: PersonalityTrait[],
  rng: () => number,
  ctx: StoryContext,
): { surface: string; middle: string; deep: string } {
  // 表层故事：公开身份
  const surfaceTemplates = [
    `${ctx.name}，${background}出身，修炼${rng() < 0.5 ? '剑道' : '法修'}，目前在世间历练。`,
    `此人自称${ctx.name}，行走江湖已有数年，修为平平。`,
    `${ctx.name}，${background}，因机缘踏入修仙之途，正在寻找机缘。`,
  ]
  const surface = pick(surfaceTemplates, rng)

  // 中层故事：较深的经历
  const middleTemplates = [
    `${ctx.name}本是${background}，因${pick(['家族变故', '师门遇难', '意外奇缘', '被人追杀'], rng)}而流落于此。其心中所图，乃是${goal}。`,
    `据闻${ctx.name}曾拜入某门下学艺，后因${pick(['理念不合', '门派衰落', '师傅陨落', '自行离去'], rng)}而离开。`,
    `${ctx.name}身上似有隐情——其修行功法与${background}常见路数不同，来历可疑。`,
  ]
  const middle = pick(middleTemplates, rng)

  // 深层秘密
  const deepTemplates = [
    `${ctx.name}的真实身份远比表面复杂。${pick(SECRETS, rng)}。若被揭穿，必将引发巨变。`,
    `此人心底藏着一个不为人知的秘密——${pick(SECRETS, rng)}。这或许是它${goal}的真正原因。`,
    `深入探查可见，${ctx.name}的过往中有一段被刻意抹去的记忆，与${pick(['上古传承', '魔道功法', '血海深仇', '天大机缘'], rng)}有关。`,
  ]
  const deep = pick(deepTemplates, rng)

  return { surface, middle, deep }
}

// 功法装配与装备物化已上移至 npc-progression（buildNpcLoadout / forgeNpcGear）。

function generateNpcInventory(realm: number, profession: Profession, rng: () => number): Record<string, number> {
  const inv: Record<string, number> = {}
  // 灵石
  inv.gold = rangeR(10, 100, rng) * (realm + 1)
  // 丹药
  if (rng() < 0.6) inv.hp_pill = rangeR(1, 5, rng)
  // 材料
  if (profession === '丹师' || rng() < 0.3) {
    inv['herb_' + realm] = rangeR(1, 5, rng)
  }
  if (profession === '器师' || rng() < 0.2) {
    inv['ore_' + realm] = rangeR(1, 3, rng)
  }
  // 突破石
  if (rng() < 0.3) inv.tupo = rangeR(1, 3, rng)
  return inv
}

function generateSchedule(profession: Profession, rng: () => number): NpcSchedule {
  const morningOptions = ['修炼', '采药', '巡山', '讲道', '看店', '打坐']
  const afternoonOptions = ['修炼', '交易', '切磋', '闭关', '访友', '炼丹']
  const nightOptions = ['修炼', '闭关', '休息', '巡夜', '悟道', '外出']

  return {
    morning: pick(morningOptions, rng),
    afternoon: pick(afternoonOptions, rng),
    night: rng() < 0.7 ? '修炼' : pick(nightOptions, rng),
  }
}

// ===== NPC 刷新与管理 =====

const MAX_ACTIVE_NPCS = 25
const NPC_REFRESH_DISTANCE = 600

export function refreshNpcsAroundPlayer(
  state: GameState,
  playerX: number,
  playerY: number,
  domain: string,
): ProceduralNpc[] {
  // 清理远离玩家的NPC（休眠而非删除，保留事件记录）
  for (const n of state.proceduralNpcs) {
    if (!n.alive) continue
    const dx = n.location.x - playerX
    const dy = n.location.y - playerY
    const dist = Math.sqrt(dx * dx + dy * dy)
    n.isActive = dist <= NPC_REFRESH_DISTANCE * 2
  }

  // 保留所有活着的NPC（含休眠），但只激活附近25个
  const aliveNpcs = state.proceduralNpcs.filter(n => n.alive)
  // 按距离排序，只激活最近的MAX_ACTIVE_NPCS个
  const nearby = aliveNpcs
    .map(n => ({ n, d: Math.hypot(n.location.x - playerX, n.location.y - playerY) }))
    .sort((a, b) => a.d - b.d)

  for (let i = 0; i < nearby.length; i++) {
    nearby[i].n.isActive = i < MAX_ACTIVE_NPCS && nearby[i].d <= NPC_REFRESH_DISTANCE * 2
  }

  // 如果附近活跃NPC不足，生成新的
  const activeCount = nearby.filter(x => x.n.isActive).length
  const toSpawn = Math.min(2, MAX_ACTIVE_NPCS - activeCount)
  for (let i = 0; i < toSpawn; i++) {
    const angle = Math.random() * Math.PI * 2
    const dist = 200 + Math.random() * 350
    const x = Math.max(50, Math.min(1900, playerX + Math.cos(angle) * dist))
    const y = Math.max(50, Math.min(2750, playerY + Math.sin(angle) * dist))
    const npc = generateProceduralNpc(domain, Date.now())
    npc.location.x = Math.floor(x)
    npc.location.y = Math.floor(y)
    npc.isActive = true
    state.proceduralNpcs.push(npc)
  }

  return state.proceduralNpcs.filter(n => n.isActive)
}

// ===== NPC 移动 =====

export function moveNpc(npc: ProceduralNpc, deltaMs: number): void {
  if (!npc.alive) return
  const moveSpeed = 20 + npc.spd * 2
  const moveDist = (moveSpeed * deltaMs) / 1000
  // 活跃NPC正常移动，离屏NPC以更低频率移动（模拟仍在活动）
  const moveChance = npc.isActive ? 0.3 : 0.05
  if (Math.random() < moveChance) {
    const angle = Math.random() * Math.PI * 2
    const scale = npc.isActive ? 5 : 12
    npc.location.x = Math.max(50, Math.min(1900, npc.location.x + Math.cos(angle) * moveDist * scale))
    npc.location.y = Math.max(50, Math.min(2750, npc.location.y + Math.sin(angle) * moveDist * scale))
  }
}

// ===== 查找NPC =====

export function findNpcById(state: GameState, id: string): ProceduralNpc | undefined {
  return state.proceduralNpcs.find(n => n.id === id)
}

export function findNearbyNpcs(
  state: GameState,
  x: number,
  y: number,
  radius: number = 80,
): ProceduralNpc[] {
  return state.proceduralNpcs.filter(n => {
    if (!n.alive || !n.isActive) return false
    const dx = n.location.x - x
    const dy = n.location.y - y
    return Math.sqrt(dx * dx + dy * dy) <= radius
  })
}

// ===== 神念等级 =====

export function calculateDivineSense(realm: number): number {
  return Math.floor(realm / 2) + 1
}

export function getRealmDiff(playerRealm: number, npcRealm: number): number {
  return playerRealm - npcRealm
}

// ===== NPC 显示名称中文化 =====

/** 获取境界中文名称 */
export function getRealmName(realm: number): string {
  return REALM_NAMES[realm] ?? '未知'
}

/** NPC武器中文名称（按境界） */
const NPC_WEAPON_NAMES = [
  '铁剑', '精钢长剑', '玄铁重剑', '灵剑', '金丹法剑', '元婴魂剑', '化神剑罡', '合体天刃',
]

/** NPC护甲中文名称（按境界） */
const NPC_ARMOR_NAMES = [
  '布衣', '皮甲', '锁子甲', '玄铁甲', '金丹法袍', '元婴灵甲', '化神宝衣', '合体天蚕甲',
]

/** NPC饰品中文名称（按境界） */
const NPC_ACCESSORY_NAMES = [
  '木牌', '玉佩', '铜铃', '灵珠', '金丹戒', '元婴链', '化神簪', '合体环',
]

/** 获取NPC装备中文名称 */
export function getNpcEquipName(eqId: string): string {
  if (eqId.startsWith('npc_w_')) {
    const realm = parseInt(eqId.slice(6)) || 0
    return NPC_WEAPON_NAMES[realm] ?? `法器（${realm}品）`
  }
  if (eqId.startsWith('npc_a_')) {
    const realm = parseInt(eqId.slice(6)) || 0
    return NPC_ARMOR_NAMES[realm] ?? `护甲（${realm}品）`
  }
  if (eqId.startsWith('npc_acc_')) {
    const realm = parseInt(eqId.slice(8)) || 0
    return NPC_ACCESSORY_NAMES[realm] ?? `饰品（${realm}品）`
  }
  return eqId
}

/** 获取NPC功法中文名称 */
const NPC_SKILL_FALLBACK: Record<string, string> = {
  sk_chuancheng: '传承秘法',
  sk_shanbi: '闪避身法',
  sk_liehuo: '烈火诀',
}
export function getNpcSkillName(skillId: string): string {
  return SKILLS.get(skillId)?.name ?? NPC_SKILL_FALLBACK[skillId] ?? skillId
}

/** 获取NPC物品中文名称 */
const ITEM_NAME_MAP: Record<string, string> = {
  gold: '灵石',
  hp_pill: '回气丹',
  tupo: '突破石',
}

const HERB_NAMES = ['凝气草', '筑基花', '金丹丹', '元婴果', '化神莲', '合体叶', '大乘花', '渡劫藤']
const ORE_NAMES = ['铁精矿', '玄铁矿', '金精矿', '灵玉矿', '天罡石', '混元矿', '太初晶', '混沌矿']

export function getNpcItemName(key: string): string {
  if (ITEM_NAME_MAP[key]) return ITEM_NAME_MAP[key]
  if (key.startsWith('herb_')) {
    const idx = parseInt(key.slice(5)) || 0
    return HERB_NAMES[idx % HERB_NAMES.length]
  }
  if (key.startsWith('ore_')) {
    const idx = parseInt(key.slice(4)) || 0
    return ORE_NAMES[idx % ORE_NAMES.length]
  }
  return key
}
