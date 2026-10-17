// ---------- 宗门系统数据定义 ----------

import type { WorldTime } from './world-time'
import type { Disciple, DiscipleEvent, DiscipleEventType } from './disciple-data'
import type { CropSlot } from './sect-production'

/** 宗门建筑 ID */
export type BuildingId =
  | 'main_hall'       // 主殿
  | 'spirit_vein'     // 灵脉阵
  | 'disciple_room'   // 弟子房
  | 'alchemy_room'    // 炼丹房
  | 'forge_pavilion'  // 炼器阁
  | 'library'         // 藏经阁
  | 'training_ground' // 演武场
  | 'guard_array'     // 护山大阵
  | 'quest_hall'      // 任务殿
  | 'spirit_farm'     // 灵田
  | 'ore_mine'        // 矿脉
  | 'wood_pavilion'   // 灵木林
  | 'beast_park'      // 灵兽园
  | 'realm_gate'      // 秘境入口

export interface BuildingDef {
  id: BuildingId
  name: string
  desc: string
  maxLevel: number
  /** 建造/升级消耗基数（level → 资源） */
  baseCost: { stone: number; wood: number; ore: number }
  /** 建筑在场景中的网格位置 */
  gridX: number
  gridY: number
  /** 建筑图标颜色 */
  color: number
  /** 解锁条件：需要主殿等级 */
  requireHall?: number
}

/** 宗门资源 */
export interface SectResources {
  stone: number    // 宗门灵石
  herb: number     // 灵草
  ore: number      // 矿石
  wood: number     // 木材
  insight: number  // 悟道点
  prestige: number // 声望
}

/** 宗门存档数据 */
export interface SectData {
  name: string
  level: number                        // 宗门等级 = 主殿等级
  buildings: Record<string, number>    // buildingId → level (0 = 未建造)
  resources: SectResources
  foundedTime: WorldTime               // 创立时间
  /** 累积产出计时器（ms） */
  productionTimer: number
  /** 宗门在地图上的位置 */
  mapX: number
  mapY: number
  /** 招募冷却（ms 时间戳） */
  recruitCooldown: number
  /** 宗门科技等级 */
  techs: Record<string, number>
  /** 灵田种植槽 */
  farmSlots: (CropSlot | null)[]
  /** 宗门圣物槽（法宝装配，3个槽位） */
  relics: (import('./artifact-data').ArtifactInstance | null)[]
  /** 随机事件计时器（ms，累积计时） */
  eventTimer: number
  /** 待招募候补弟子（游方修士/招募生成的候选） */
  recruitCandidate: Disciple | null
  /** 弟子事件日志（最近50条） */
  discipleEvents: import('./disciple-data').DiscipleEvent[]
  /** 在外执行任务的弟子是否遇到事件（袭击等）的冷却计时 */
  discipleEventCooldown: number
  /** 待报仇列表（弟子遇袭/遇害后记录的仇人） */
  revengeTargets: RevengeTarget[]
}

/** 仇人目标 */
export interface RevengeTarget {
  id: string
  attackerName: string
  attackerType: 'bandit' | 'demon' | 'beast' | 'rogue_cultivator'
  attackerRealm: number
  attackerPower: number
  /** 受害弟子名 */
  victimName: string
  /** 受害弟子UID（如已遇害则为空） */
  victimUid: string
  /** 事件类型：attacked=受伤 killed=遇害 */
  eventType: 'attacked' | 'killed'
  /** 记录时间 */
  timestamp: number
  /** 是否已报仇 */
  resolved: boolean
}

/** 建筑配置表 */
export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  main_hall: {
    id: 'main_hall', name: '主殿', desc: '宗门核心，决定宗门等级上限与建筑解锁',
    maxLevel: 10, baseCost: { stone: 500, wood: 200, ore: 100 },
    gridX: 4, gridY: 11, color: 0xfbbf24,
  },
  spirit_vein: {
    id: 'spirit_vein', name: '灵脉阵', desc: '持续产出宗门灵石',
    maxLevel: 10, baseCost: { stone: 300, wood: 100, ore: 50 },
    gridX: 2, gridY: 9, color: 0x34d399, requireHall: 1,
  },
  disciple_room: {
    id: 'disciple_room', name: '弟子房', desc: '容纳弟子修炼，增加弟子容量与修炼速度',
    maxLevel: 10, baseCost: { stone: 200, wood: 300, ore: 50 },
    gridX: 6, gridY: 9, color: 0x60a5fa, requireHall: 1,
  },
  alchemy_room: {
    id: 'alchemy_room', name: '炼丹房', desc: '炼制丹药，解锁更高阶丹方',
    maxLevel: 10, baseCost: { stone: 300, wood: 200, ore: 100 },
    gridX: 2, gridY: 13, color: 0xf472b6, requireHall: 2,
  },
  forge_pavilion: {
    id: 'forge_pavilion', name: '炼器阁', desc: '锻造装备，提升品质率',
    maxLevel: 10, baseCost: { stone: 300, wood: 150, ore: 200 },
    gridX: 6, gridY: 13, color: 0xfb923c, requireHall: 2,
  },
  library: {
    id: 'library', name: '藏经阁', desc: '存储功法供弟子学习，提升领悟速度',
    maxLevel: 10, baseCost: { stone: 400, wood: 200, ore: 100 },
    gridX: 4, gridY: 13, color: 0xa78bfa, requireHall: 3,
  },
  training_ground: {
    id: 'training_ground', name: '演武场', desc: '弟子切磋，提升攻防成长率',
    maxLevel: 10, baseCost: { stone: 200, wood: 200, ore: 100 },
    gridX: 1, gridY: 11, color: 0xef4444, requireHall: 2,
  },
  guard_array: {
    id: 'guard_array', name: '护山大阵', desc: '防御敌宗袭击，提供防护罩',
    maxLevel: 10, baseCost: { stone: 500, wood: 100, ore: 300 },
    gridX: 7, gridY: 11, color: 0x14b8a6, requireHall: 3,
  },
  quest_hall: {
    id: 'quest_hall', name: '任务殿', desc: '发布宗门任务，弟子领取执行',
    maxLevel: 10, baseCost: { stone: 300, wood: 300, ore: 50 },
    gridX: 1, gridY: 15, color: 0xfacc15, requireHall: 2,
  },
  spirit_farm: {
    id: 'spirit_farm', name: '灵田', desc: '种植灵草，炼丹材料来源',
    maxLevel: 10, baseCost: { stone: 100, wood: 200, ore: 50 },
    gridX: 7, gridY: 15, color: 0x84cc16, requireHall: 1,
  },
  ore_mine: {
    id: 'ore_mine', name: '矿脉', desc: '持续产出矿石，炼器材料来源',
    maxLevel: 10, baseCost: { stone: 200, wood: 100, ore: 50 },
    gridX: 1, gridY: 17, color: 0xa8a29e, requireHall: 1,
  },
  wood_pavilion: {
    id: 'wood_pavilion', name: '灵木林', desc: '持续产出木材，建筑升级材料',
    maxLevel: 10, baseCost: { stone: 200, wood: 50, ore: 50 },
    gridX: 7, gridY: 17, color: 0x65a30d, requireHall: 1,
  },
  beast_park: {
    id: 'beast_park', name: '灵兽园', desc: '驯养灵兽，可战斗或代步',
    maxLevel: 10, baseCost: { stone: 400, wood: 200, ore: 200 },
    gridX: 3, gridY: 16, color: 0xc084fc, requireHall: 4,
  },
  realm_gate: {
    id: 'realm_gate', name: '秘境入口', desc: '宗门专属秘境，定期刷新资源',
    maxLevel: 5, baseCost: { stone: 1000, wood: 500, ore: 500 },
    gridX: 5, gridY: 16, color: 0x6366f1, requireHall: 5,
  },
}

/** 所有建筑 ID 列表（有序） */
export const BUILDING_IDS: BuildingId[] = [
  'main_hall', 'spirit_vein', 'disciple_room', 'alchemy_room', 'forge_pavilion',
  'library', 'training_ground', 'guard_array', 'quest_hall', 'spirit_farm',
  'ore_mine', 'wood_pavilion', 'beast_park', 'realm_gate',
]

/** 初始宗门数据 */
export function createNewSect(name: string, foundedTime: WorldTime, mapX: number, mapY: number): SectData {
  return {
    name,
    level: 1,
    buildings: { main_hall: 1 },
    resources: { stone: 2000, herb: 50, ore: 100, wood: 200, insight: 20, prestige: 10 },
    foundedTime,
    productionTimer: 0,
    mapX,
    mapY,
    recruitCooldown: 0,
    techs: {},
    farmSlots: [null, null, null],
    relics: [null, null, null],
    eventTimer: 0,
    recruitCandidate: null,
    discipleEvents: [],
    discipleEventCooldown: 0,
    revengeTargets: [],
  }
}

/**
 * 计算建筑升级费用（纯成本表）。
 *
 * 注意：运行时实际升级请使用 `../sect-building-v2` 的
 * `getBuildingUpgradeCost` / `canUpgradeBuilding` / `upgradeBuilding`，
 * 那一套还含解锁条件校验、检 gold 资源、状态同步。
 * 本函数仅保留给 sect-system 单测验证成本表。
 */
export function buildingUpgradeCost(id: BuildingId, currentLevel: number): SectResources {
  const def = BUILDINGS[id]
  const lv = currentLevel + 1
  const mult = lv * lv
  return {
    stone: Math.floor(def.baseCost.stone * mult * 0.5),
    wood: Math.floor(def.baseCost.wood * mult * 0.5),
    ore: Math.floor(def.baseCost.ore * mult * 0.5),
    insight: 0,
    prestige: 0,
    herb: 0,
  }
}

/**
 * 判断建筑是否可建造/升级（粗筛：仅检查主殿门槛与封顶）。
 *
 * 运行时实际升级请使用 `../sect-building-v2.canUpgradeBuilding(state, id)`，
 * 那一套还查资源 / 解锁。本函数是单测用的精简版。
 */
export function canUpgradeBuilding(sect: SectData, id: BuildingId): boolean {
  const def = BUILDINGS[id]
  const currentLv = sect.buildings[id] ?? 0
  if (currentLv >= def.maxLevel) return false
  if (def.requireHall && (sect.buildings.main_hall ?? 0) < def.requireHall) return false
  return true
}

/** 灵脉阵每分钟灵石产出 */
export function spiritVeinProduction(level: number): number {
  return level > 0 ? 20 + level * 15 : 0
}

/** 弟子房弟子容量 */
export function discipleCapacity(level: number): number {
  return level > 0 ? 2 + level * 2 : 0
}

/** 记录弟子事件（保留最近50条） */
export function addDiscipleEvent(
  sect: SectData,
  disciple: Disciple,
  type: DiscipleEventType,
  description: string,
  data?: Record<string, any>,
): void {
  const event: DiscipleEvent = {
    id: 'evt_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1000).toString(36),
    type,
    discipleUid: disciple.uid,
    discipleName: disciple.name,
    timestamp: Date.now(),
    description,
    data,
  }
  sect.discipleEvents.unshift(event)
  if (sect.discipleEvents.length > 50) sect.discipleEvents.length = 50
}

/** 灵田每分钟灵草产出 */
export function spiritFarmProduction(level: number): number {
  return level > 0 ? 2 + level : 0
}

/** 矿脉每分钟矿石产出 */
export function oreMineProduction(level: number): number {
  return level > 0 ? 3 + level * 2 : 0
}

/** 灵木林每分钟木材产出 */
export function woodPavilionProduction(level: number): number {
  return level > 0 ? 3 + level * 2 : 0
}

/** 开宗条件 */
export const SECT_FOUND_COST = 10000  // 灵石
export const SECT_FOUND_REALM = 2     // 金丹期（realm 索引 2）
