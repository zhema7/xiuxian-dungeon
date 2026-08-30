// ---------- 全局游戏状态 + 存档（v8，含迁移链 + 大地图 + 主线剧情） ----------

import { expNeed, normalizeItem, type EquipItem } from './core'
import { normalizeDynamicSetRecords, registerDynamicContent, type DynamicSetRecord } from './lore'
import { updateRecords } from './records'
import { SKILLS, SLOT_KEYS, type SkillDef, type SlotKey } from './data'
import { newWorldTime, type WorldTime } from './world-time'
import { type SectData } from './sect-data'
import { type NpcState } from './npc-data'
import { type AiSect, type ResourceNode } from './ai-sect-data'
import { type DailyQuest } from './daily-quest'
import { type Beast } from './beast-data'
import { type MerchantData } from './merchant-system'
export interface SkillSlots {
  style: string | null
  minds: [string | null, string | null]
  art: string | null
}

/** 配装方案：装备 + 功法装配 + 天赋分配 */
export interface BuildPreset {
  equipment: Record<SlotKey, EquipItem | null>
  skillSlots: SkillSlots
  talents: Record<string, number>
}

export const PRESET_COUNT = 5

export interface GameState {
  version: number
  classId: string
  heroName: string
  level: number
  exp: number
  gold: number
  potions: number
  consumables: Record<string, number>  // 类型化消耗品（hp_pill/breakthrough_pill/exp_pill/body_pill）
  insight: number          // 悟道点
  hp: number               // 当前气血（-1 = 满血）
  realm: number            // 境界索引（REALMS）
  materials: Record<string, number>  // 突破石等材料
  companion: boolean       // 道友是否入队
  progress: { qmCleared: boolean; ymCleared: boolean }   // 地区进度：青冥/幽冥已通关
  favor: Record<string, number>      // NPC 好感度
  quests: Record<string, 'active' | 'done'>  // 任务状态
  totalKills: number                 // 累计击杀（任务用）
  equipment: Record<SlotKey, EquipItem | null>
  inventory: EquipItem[]
  skills: Record<string, number>   // 已习得功法 id → 等级
  skillSlots: SkillSlots
  talents: Record<string, number>  // 天赋节点 id → 点数
  presets: Array<BuildPreset | null>  // 配装方案 ×5
  activePreset: number             // 当前启用的方案（-1 = 未启用）
  syCheckpoint: number             // 无尽妖域存档点：下次进入的起始层（默认 7）
  syMaxDepth: number               // 无尽妖域历史最深层（榜单用）
  xianMaxDepth: number             // 破碎仙宫历史最深层（用于存档点计算）
  dynamicSets: DynamicSetRecord[]  // 机缘套装（程序生成，运行时注册进 SETS）
  dynamicSkills: SkillDef[]        // 无名古卷功法（程序生成，运行时注册进 SKILLS）
  codex: { items: string[]; skills: string[]; sets: string[] }  // 万象图鉴：已收集条目
  honor: number                   // 荣誉点：擂台奖励，用于兑换特殊套装
  arenaRank: number               // 擂台段位（0=初入, 1=铜牌, 2=银牌, 3=金牌, 4=王者）
  arenaWins: number               // 擂台累计胜场
  arena1v1Wins: number            // 1v1 累计胜场
  arena1vNWins: number            // 1vN 累计胜场
  cityUnlocked: boolean            // 大城池是否已解锁
  // 大地图系统
  worldUnlocked: boolean            // 大地图是否已解锁
  worldTime: WorldTime              // 苍玄历时间
  worldPlayerX: number              // 大地图玩家坐标 X
  worldPlayerY: number              // 大地图玩家坐标 Y
  worldDomain: string               // 当前所在域（south/central/east/west/north）
  discoveredPoints: string[]        // 已发现的地图点位 ID
  worldEventCooldown: number        // 随机事件冷却（移动距离累积）
  // 宗门系统
  sectUnlocked: boolean             // 宗门是否已建立
  sect: SectData | null             // 宗门数据
  // NPC 成长系统
  npcStates: Record<string, NpcState>  // NPC 运行时状态
  // AI 宗门势力 + 外交
  aiSects: AiSect[]                     // AI 宗门列表
  resourceNodes: ResourceNode[]          // 资源点列表
  diplomacyTickTimer: number             // 外交系统 tick 计时器
  // 主线剧情系统
  mainQuestId: string | null             // 当前进行中的主线任务 ID
  mainQuestProgress: number              // 当前任务进度计数（用于 collect_kills / win_arena 等）
  mainQuestCompleted: string[]            // 已完成的主线任务 ID 列表
  // 成就与统计系统
  achievementsUnlocked: string[]          // 已解锁成就 ID 列表
  totalGoldEarned: number                 // 累计获得灵石
  totalDungeonClears: number              // 累计通关秘境次数
  totalSectWarsWon: number                // 累计宗门战争胜利次数
  skillPoints: number                     // 可用技能点
  // 日常任务系统
  dailyQuests: DailyQuest[]               // 当前日常任务列表
  dailyQuestDate: string                  // 日常任务日期（YYYY-MM-DD）
  // 灵兽驯养系统
  beasts: Beast[]                         // 灵兽列表
  activePetUid: string | null             // 出战灵兽 UID
  activeMountUid: string | null           // 坐骑灵兽 UID
  // 阵法部署系统
  formations: string[]                   // 已学阵法 ID 列表
  formationLastUse: number               // 阵法上次使用时间（ms 时间戳）
  activeFormation: string | null         // 当前部署的阵法 ID
  // 商会交易系统
  merchants: MerchantData[]               // 商人数据列表
  sectTradeCooldown: number               // 宗门通商冷却
}

const SAVE_KEY = 'xiuxian_save_v1'
export const SAVE_VERSION = 8

// ---------- 多角色存档系统 ----------
const SAVE_SLOTS_META_KEY = 'xiuxian_save_slots_meta'
const SAVE_SLOT_KEY_PREFIX = 'xiuxian_save_slot_'
export const MAX_SAVE_SLOTS = 4

let activeSlot = -1

export interface SaveSlotMeta {
  index: number
  heroName: string
  classId: string
  level: number
  realm: number
  updatedAt: number
}

function slotKey(index: number): string {
  return `${SAVE_SLOT_KEY_PREFIX}${index}`
}

/** 列出所有存档槽的元信息 */
export function listSaveSlots(): SaveSlotMeta[] {
  try {
    const raw = localStorage.getItem(SAVE_SLOTS_META_KEY)
    if (raw) {
      const list = JSON.parse(raw) as SaveSlotMeta[]
      if (list.length > 0) return list
    }
    // 向后兼容：如果旧存档存在，迁移到槽 0
    const oldRaw = localStorage.getItem(SAVE_KEY)
    if (oldRaw) {
      const parsed = JSON.parse(oldRaw) as Record<string, unknown>
      const meta: SaveSlotMeta = {
        index: 0,
        heroName: String(parsed.heroName ?? '无名散修'),
        classId: String(parsed.classId ?? 'sword'),
        level: Number(parsed.level ?? 1),
        realm: Number(parsed.realm ?? 0),
        updatedAt: Date.now(),
      }
      localStorage.setItem(slotKey(0), oldRaw)
      localStorage.setItem(SAVE_SLOTS_META_KEY, JSON.stringify([meta]))
      return [meta]
    }
  } catch { /* ignore */ }
  return []
}

/** 从指定槽位加载存档 */
export function loadSaveSlot(index: number): GameState | null {
  try {
    const raw = localStorage.getItem(slotKey(index))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const s = normalizeGameState(parsed)
    activeSlot = index
    return s
  } catch { return null }
}

/** 保存到指定槽位 */
export function saveToSlot(index: number, s: GameState) {
  try {
    s.version = SAVE_VERSION
    localStorage.setItem(slotKey(index), JSON.stringify(s))
    const slots = listSaveSlots()
    const meta: SaveSlotMeta = {
      index,
      heroName: s.heroName,
      classId: s.classId,
      level: s.level,
      realm: s.realm,
      updatedAt: Date.now(),
    }
    const existingIdx = slots.findIndex(m => m.index === index)
    if (existingIdx >= 0) slots[existingIdx] = meta
    else slots.push(meta)
    slots.sort((a, b) => a.index - b.index)
    localStorage.setItem(SAVE_SLOTS_META_KEY, JSON.stringify(slots))
    activeSlot = index
    updateRecords(s)
  } catch { /* ignore */ }
}

/** 删除指定槽位存档 */
export function deleteSaveSlot(index: number) {
  try {
    localStorage.removeItem(slotKey(index))
    const slots = listSaveSlots().filter(m => m.index !== index)
    localStorage.setItem(SAVE_SLOTS_META_KEY, JSON.stringify(slots))
    if (activeSlot === index) activeSlot = -1
  } catch { /* ignore */ }
}

/** 检查指定槽位是否有存档 */
export function hasSaveSlot(index: number): boolean {
  try { return !!localStorage.getItem(slotKey(index)) } catch { return false }
}

export function getActiveSlot(): number { return activeSlot }
export function setActiveSlot(index: number) { activeSlot = index }

function isCodex(value: unknown): value is GameState['codex'] {
  if (!value || typeof value !== 'object') return false
  const raw = value as Record<string, unknown>
  return Array.isArray(raw.items) && Array.isArray(raw.skills) && Array.isArray(raw.sets)
}

export function newGame(): GameState {
  return {
    version: SAVE_VERSION,
    classId: 'sword',
    heroName: '无名散修',
    level: 1,
    exp: 0,
    gold: 0,
    potions: 3,
    consumables: {},
    insight: 0,
    hp: -1,
    realm: 0,
    materials: { tupo: 0 },
    companion: false,
    progress: { qmCleared: false, ymCleared: false },
    favor: {},
    quests: {},
    totalKills: 0,
    equipment: { weapon: null, head: null, armor: null, boots: null, charm1: null, charm2: null },
    inventory: [],
    skills: { sk_sanlian: 1 },
    skillSlots: { style: 'sk_sanlian', minds: [null, null], art: null },
    talents: {},
    presets: [null, null, null, null, null],
    activePreset: -1,
    syCheckpoint: 7,
    syMaxDepth: 0,
    xianMaxDepth: 0,
    dynamicSets: [],
    dynamicSkills: [],
    codex: { items: [], skills: [], sets: [] },
    honor: 0,
    arenaRank: 0,
    arenaWins: 0,
    arena1v1Wins: 0,
    arena1vNWins: 0,
    cityUnlocked: false,
    worldUnlocked: false,
    worldTime: newWorldTime(),
    worldPlayerX: 600,
    worldPlayerY: 1350,
    worldDomain: 'south',
    discoveredPoints: ['home', 'sect_entrance'],
    worldEventCooldown: 0,
    sectUnlocked: false,
    sect: null,
    npcStates: {},
    aiSects: [],
    resourceNodes: [],
    diplomacyTickTimer: 0,
    mainQuestId: 'mq_1_1',
    mainQuestProgress: 0,
    mainQuestCompleted: [],
    achievementsUnlocked: [],
    totalGoldEarned: 0,
    totalDungeonClears: 0,
    totalSectWarsWon: 0,
    skillPoints: 0,
    dailyQuests: [],
    dailyQuestDate: '',
    beasts: [],
    activePetUid: null,
    activeMountUid: null,
    formations: [],
    formationLastUse: 0,
    activeFormation: null,
    merchants: [],
    sectTradeCooldown: 0,
  }
}

/** 是否存在旧存档 */
export function hasSave(): boolean {
  try {
    if (localStorage.getItem(SAVE_SLOTS_META_KEY)) {
      const slots = listSaveSlots()
      if (slots.length > 0) return true
    }
    return !!localStorage.getItem(SAVE_KEY)
  } catch { return false }
}

/** 快照当前配装（装备+功法装配+天赋） */
export function snapshotPreset(s: GameState): BuildPreset {
  const snapshot = JSON.parse(JSON.stringify({
    equipment: s.equipment,
    skillSlots: s.skillSlots,
    talents: s.talents,
  })) as BuildPreset
  // Snapshots are a persistence boundary too: retain only declared slots even
  // if hostile runtime code added arbitrary object keys to equipment.
  snapshot.equipment = Object.fromEntries(SLOT_KEYS.map((key) => [
    key,
    snapshot.equipment[key] ?? null,
  ])) as Record<SlotKey, EquipItem | null>
  return snapshot
}

/** 应用配装方案 */
export function applyPreset(s: GameState, p: BuildPreset) {
  const rawEquipment = JSON.parse(JSON.stringify(p.equipment)) as Partial<Record<SlotKey, EquipItem | null>>
  const equipment = Object.fromEntries(SLOT_KEYS.map((key) => [
    key,
    rawEquipment[key] ? normalizeItem(rawEquipment[key]!) : null,
  ])) as Record<SlotKey, EquipItem | null>
  s.equipment = equipment
  s.skillSlots = { ...p.skillSlots, minds: [...p.skillSlots.minds] }
  s.talents = { ...p.talents }
}

/** 旧版本迁移至当前存档格式（包含 v2/v3 程序随机套装规范化，不重掷已落盘结果）。 */
function migrate(raw: Record<string, unknown>): GameState {
  const s = newGame()
  s.level = Number(raw.level) || 1
  s.exp = Number(raw.exp) || 0
  s.gold = Number(raw.gold) || 0
  s.potions = Number(raw.potions ?? 3)
  s.consumables = typeof raw.consumables === 'object' && raw.consumables ? { ...raw.consumables } : {}
  // 迁移旧 potions 到 consumables.hp_pill
  if (s.potions > 0 && !(s.consumables.hp_pill > 0)) {
    s.consumables.hp_pill = s.potions
  }
  s.insight = Number(raw.insight ?? (s.level - 1) * 3)
  s.hp = typeof raw.hp === 'number' ? raw.hp : -1
  s.classId = String(raw.classId ?? 'sword')
  s.heroName = String(raw.heroName ?? s.heroName)
  s.realm = Number(raw.realm ?? 0) || 0
  s.companion = Boolean(raw.companion)
  const eq = (raw.equipment ?? {}) as Record<string, EquipItem | null>
  // Only declared slot keys may enter the runtime equipment record. Preserve the
  // historical singular charm migration for charm1, but discard all other unknown keys.
  s.equipment.weapon = eq.weapon ? normalizeItem(eq.weapon) : null
  s.equipment.head = eq.head ? normalizeItem(eq.head) : null
  s.equipment.armor = eq.armor ? normalizeItem(eq.armor) : null
  s.equipment.boots = eq.boots ? normalizeItem(eq.boots) : null
  s.equipment.charm1 = (eq.charm1 ?? eq.charm) ? normalizeItem((eq.charm1 ?? eq.charm)!) : null
  s.equipment.charm2 = eq.charm2 ? normalizeItem(eq.charm2) : null
  if (Array.isArray(raw.inventory)) s.inventory = (raw.inventory as EquipItem[]).map(normalizeItem)
  const sk = (raw.skills ?? {}) as Record<string, number>
  if (Object.keys(sk).length > 0) s.skills = { ...sk }
  const slots = raw.skillSlots as SkillSlots | undefined
  if (slots) s.skillSlots = { style: slots.style ?? null, minds: slots.minds ?? [null, null], art: slots.art ?? null }
  s.talents = { ...((raw.talents ?? {}) as Record<string, number>) }
  s.progress = {
    qmCleared: Boolean((raw.progress as { qmCleared?: boolean } | undefined)?.qmCleared),
    ymCleared: Boolean((raw.progress as { ymCleared?: boolean } | undefined)?.ymCleared),
  }
  s.favor = { ...((raw.favor ?? {}) as Record<string, number>) }
  s.quests = { ...((raw.quests ?? {}) as Record<string, 'active' | 'done'>) }
  s.totalKills = Number(raw.totalKills ?? 0) || 0
  if (Array.isArray(raw.presets)) {
    s.presets = (raw.presets as Array<BuildPreset | null>).slice(0, PRESET_COUNT)
    while (s.presets.length < PRESET_COUNT) s.presets.push(null)
  }
  s.activePreset = typeof raw.activePreset === 'number' ? raw.activePreset : -1
  s.syCheckpoint = Number(raw.syCheckpoint ?? 7) || 7
  s.syMaxDepth = Number(raw.syMaxDepth ?? 0) || 0
  s.xianMaxDepth = Number(raw.xianMaxDepth ?? 0) || 0
  s.dynamicSets = normalizeDynamicSetRecords(raw.dynamicSets)
  s.dynamicSkills = Array.isArray(raw.dynamicSkills) ? raw.dynamicSkills as SkillDef[] : []
  s.codex = isCodex(raw.codex) ? raw.codex : { items: [], skills: [], sets: [] }
  s.honor = Number(raw.honor ?? 0) || 0
  s.arenaRank = Number(raw.arenaRank ?? 0) || 0
  s.arenaWins = Number(raw.arenaWins ?? 0) || 0
  s.arena1v1Wins = Number(raw.arena1v1Wins ?? 0) || 0
  s.arena1vNWins = Number(raw.arena1vNWins ?? 0) || 0
  s.cityUnlocked = Boolean(raw.cityUnlocked)
  s.worldUnlocked = Boolean(raw.worldUnlocked ?? false)
  s.worldTime = (raw.worldTime as WorldTime | undefined) ?? newWorldTime()
  s.worldPlayerX = Number(raw.worldPlayerX ?? 600) || 600
  s.worldPlayerY = Number(raw.worldPlayerY ?? 1350) || 1350
  s.worldDomain = typeof raw.worldDomain === 'string' ? raw.worldDomain : 'south'
  s.discoveredPoints = Array.isArray(raw.discoveredPoints) ? raw.discoveredPoints as string[] : ['home', 'sect_entrance']
  s.worldEventCooldown = Number(raw.worldEventCooldown ?? 0) || 0
  s.sectUnlocked = Boolean(raw.sectUnlocked ?? false)
  s.sect = (raw.sect as SectData | undefined) ?? null
  s.npcStates = (raw.npcStates as Record<string, NpcState>) ?? {}
  s.aiSects = Array.isArray(raw.aiSects) ? raw.aiSects as AiSect[] : []
  s.resourceNodes = Array.isArray(raw.resourceNodes) ? raw.resourceNodes as ResourceNode[] : []
  s.diplomacyTickTimer = Number(raw.diplomacyTickTimer ?? 0) || 0
  s.mainQuestId = typeof raw.mainQuestId === 'string' ? raw.mainQuestId : 'mq_1_1'
  s.mainQuestProgress = Number(raw.mainQuestProgress ?? 0) || 0
  s.mainQuestCompleted = Array.isArray(raw.mainQuestCompleted) ? raw.mainQuestCompleted as string[] : []
  s.achievementsUnlocked = Array.isArray(raw.achievementsUnlocked) ? raw.achievementsUnlocked as string[] : []
  s.totalGoldEarned = Number(raw.totalGoldEarned ?? 0) || 0
  s.totalDungeonClears = Number(raw.totalDungeonClears ?? 0) || 0
  s.totalSectWarsWon = Number(raw.totalSectWarsWon ?? 0) || 0
  s.skillPoints = Number(raw.skillPoints ?? 0) || 0
  s.dailyQuests = Array.isArray(raw.dailyQuests) ? raw.dailyQuests as DailyQuest[] : []
  s.dailyQuestDate = typeof raw.dailyQuestDate === 'string' ? raw.dailyQuestDate : ''
  s.beasts = Array.isArray(raw.beasts) ? raw.beasts as Beast[] : []
  s.activePetUid = typeof raw.activePetUid === 'string' ? raw.activePetUid : null
  s.activeMountUid = typeof raw.activeMountUid === 'string' ? raw.activeMountUid : null
  s.formations = Array.isArray(raw.formations) ? raw.formations as string[] : []
  s.formationLastUse = Number(raw.formationLastUse ?? 0) || 0
  s.activeFormation = typeof raw.activeFormation === 'string' ? raw.activeFormation : null
  s.merchants = Array.isArray(raw.merchants) ? raw.merchants as MerchantData[] : []
  s.sectTradeCooldown = Number(raw.sectTradeCooldown ?? 0) || 0
  registerDynamicContent(s.dynamicSets, s.dynamicSkills)
  return s
}

/** 从解析后的 JSON 对象规范化为 GameState（loadGame 和 loadSaveSlot 共用） */
function normalizeGameState(parsed: Record<string, unknown>): GameState {
  if (parsed.version === SAVE_VERSION) {
    const s = parsed as unknown as GameState
    s.equipment = s.equipment ?? { weapon: null, head: null, armor: null, boots: null, charm1: null, charm2: null }
    const loadedEquipment = s.equipment as Partial<Record<SlotKey, EquipItem | null>>
    s.equipment = Object.fromEntries(SLOT_KEYS.map((key) => [
      key,
      loadedEquipment[key] ? normalizeItem(loadedEquipment[key]!) : null,
    ])) as Record<SlotKey, EquipItem | null>
    s.inventory = (s.inventory ?? []).map(normalizeItem)
    s.progress = { qmCleared: s.progress?.qmCleared ?? false, ymCleared: s.progress?.ymCleared ?? false }
    s.materials = s.materials ?? { tupo: 0 }
    s.consumables = s.consumables ?? {}
    if (s.potions > 0 && !(s.consumables.hp_pill > 0)) {
      s.consumables.hp_pill = s.potions
    }
    s.favor = s.favor ?? {}
    s.quests = s.quests ?? {}
    s.totalKills = s.totalKills ?? 0
    if (!Array.isArray(s.presets)) s.presets = [null, null, null, null, null]
    while (s.presets.length < PRESET_COUNT) s.presets.push(null)
    s.activePreset = s.activePreset ?? -1
    s.skills = s.skills ?? { sk_sanlian: 1 }
    s.skillSlots = s.skillSlots ?? { style: null, minds: [null, null], art: null }
    s.skillSlots.minds = s.skillSlots.minds ?? [null, null]
    s.talents = s.talents ?? {}
    s.syCheckpoint = s.syCheckpoint ?? 7
    s.syMaxDepth = s.syMaxDepth ?? 0
    s.xianMaxDepth = s.xianMaxDepth ?? 0
    s.dynamicSets = normalizeDynamicSetRecords(s.dynamicSets)
    s.dynamicSkills = Array.isArray(s.dynamicSkills) ? s.dynamicSkills : []
    s.codex = isCodex(s.codex) ? s.codex : { items: [], skills: [], sets: [] }
    s.codex.items = s.codex.items ?? []
    s.codex.skills = s.codex.skills ?? []
    s.codex.sets = s.codex.sets ?? []
    s.honor = s.honor ?? 0
    s.arenaRank = s.arenaRank ?? 0
    s.arenaWins = s.arenaWins ?? 0
    s.arena1v1Wins = s.arena1v1Wins ?? 0
    s.arena1vNWins = s.arena1vNWins ?? 0
    s.cityUnlocked = s.cityUnlocked ?? false
    s.worldUnlocked = s.worldUnlocked ?? false
    s.worldTime = s.worldTime ?? newWorldTime()
    s.worldPlayerX = s.worldPlayerX ?? 600
    s.worldPlayerY = s.worldPlayerY ?? 1350
    s.worldDomain = typeof s.worldDomain === 'string' ? s.worldDomain : 'south'
    s.discoveredPoints = Array.isArray(s.discoveredPoints) ? s.discoveredPoints : ['home', 'sect_entrance']
    s.worldEventCooldown = s.worldEventCooldown ?? 0
    s.sectUnlocked = s.sectUnlocked ?? false
    s.sect = s.sect ?? null
    if (s.sect && Array.isArray(s.sect.disciples)) {
      for (const d of s.sect.disciples) {
        if (!d.equipment) {
          d.equipment = { weapon: null, head: null, armor: null, boots: null, charm: null }
        }
        if (d.sparCooldown === undefined) d.sparCooldown = 0
        if (d.rank === undefined) d.rank = 0
        if (d.role === undefined) d.role = null
      }
    }
    s.npcStates = s.npcStates ?? {}
    s.aiSects = Array.isArray(s.aiSects) ? s.aiSects : []
    for (const ai of s.aiSects) {
      if (ai.attackTimer === undefined) ai.attackTimer = 0
      if (ai.vassalOf === undefined) ai.vassalOf = null
      if (ai.tributeRate === undefined) ai.tributeRate = 0
      if (ai.rebellionChance === undefined) ai.rebellionChance = 0
      if (ai.originalPower === undefined) ai.originalPower = ai.power
    }
    s.resourceNodes = Array.isArray(s.resourceNodes) ? s.resourceNodes : []
    s.diplomacyTickTimer = s.diplomacyTickTimer ?? 0
    s.mainQuestId = typeof s.mainQuestId === 'string' ? s.mainQuestId : 'mq_1_1'
    s.mainQuestProgress = s.mainQuestProgress ?? 0
    s.mainQuestCompleted = Array.isArray(s.mainQuestCompleted) ? s.mainQuestCompleted : []
    s.achievementsUnlocked = Array.isArray(s.achievementsUnlocked) ? s.achievementsUnlocked : []
    s.totalGoldEarned = s.totalGoldEarned ?? 0
    s.totalDungeonClears = s.totalDungeonClears ?? 0
    s.totalSectWarsWon = s.totalSectWarsWon ?? 0
    s.skillPoints = s.skillPoints ?? 0
    s.dailyQuests = Array.isArray(s.dailyQuests) ? s.dailyQuests : []
    s.dailyQuestDate = typeof s.dailyQuestDate === 'string' ? s.dailyQuestDate : ''
    s.beasts = Array.isArray(s.beasts) ? s.beasts : []
    s.activePetUid = typeof s.activePetUid === 'string' ? s.activePetUid : null
    s.activeMountUid = typeof s.activeMountUid === 'string' ? s.activeMountUid : null
    s.formations = Array.isArray(s.formations) ? s.formations : []
    s.formationLastUse = s.formationLastUse ?? 0
    s.activeFormation = typeof s.activeFormation === 'string' ? s.activeFormation : null
    s.merchants = Array.isArray(s.merchants) ? s.merchants : []
    s.sectTradeCooldown = s.sectTradeCooldown ?? 0
    registerDynamicContent(s.dynamicSets, s.dynamicSkills)
    return s
  }
  if (typeof parsed.version === 'number' && parsed.version < SAVE_VERSION) return migrate(parsed)
  return newGame()
}

export function loadGame(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return newGame()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return normalizeGameState(parsed)
  } catch {
    return newGame()
  }
}

/** 转职：清空装配与旧职业专属技能，习得并装备新职业默认招式 */
export function switchClass(s: GameState, classId: string, defaultStyle: string) {
  s.classId = classId
  s.skillSlots = { style: null, minds: [null, null], art: null }
  // 清除旧职业专属技能（保留通用技能）
  for (const id of Object.keys(s.skills)) {
    const def = SKILLS.get(id)
    if (def && def.class !== 'any' && def.class !== classId) {
      delete s.skills[id]
    }
  }
  if (!(defaultStyle in s.skills)) s.skills[defaultStyle] = 1
  s.skillSlots.style = defaultStyle
}

export function saveGame(s: GameState) {
  try {
    // 如果有活跃槽位，保存到槽位；否则保存到旧 key（向后兼容）
    if (activeSlot >= 0) {
      saveToSlot(activeSlot, s)
    } else {
      localStorage.setItem(SAVE_KEY, JSON.stringify(s))
      updateRecords(s)
    }
  } catch { /* 忽略 */ }
}

/** 加经验，返回升了几级（悟道点由调用方发放） */
export function gainExp(s: GameState, amount: number): number {
  s.exp += amount
  let ups = 0
  while (s.exp >= expNeed(s.level)) {
    s.exp -= expNeed(s.level)
    s.level++
    ups++
  }
  return ups
}

// ---------- 万象图鉴记录 ----------
function codexPush(arr: string[] | undefined, key: string): string[] {
  const a = arr ?? []
  if (!a.includes(key)) a.push(key)
  return a
}

/** 记录装备入图鉴（名器记名，套装件同时记录套装） */
export function recordCodexItem(s: GameState, it: EquipItem) {
  if (!s.codex) s.codex = { items: [], skills: [], sets: [] }
  s.codex.items = codexPush(s.codex.items, it.name)
  if (it.setId) s.codex.sets = codexPush(s.codex.sets, it.setId)
}

/** 记录功法入图鉴 */
export function recordCodexSkill(s: GameState, skillId: string) {
  if (!s.codex) s.codex = { items: [], skills: [], sets: [] }
  s.codex.skills = codexPush(s.codex.skills, skillId)
}

export { expNeed }
