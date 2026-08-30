// ---------- 宗门系统数据定义 ----------

import type { WorldTime } from './world-time'
import type { Disciple } from './disciple-data'
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
  /** 弟子列表 */
  disciples: Disciple[]
  /** 招募冷却（ms 时间戳） */
  recruitCooldown: number
  /** 宗门科技等级 */
  techs: Record<string, number>
  /** 灵田种植槽 */
  farmSlots: (CropSlot | null)[]
}

/** 建筑配置表 */
export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  main_hall: {
    id: 'main_hall', name: '主殿', desc: '宗门核心，决定宗门等级上限与建筑解锁',
    maxLevel: 10, baseCost: { stone: 500, wood: 200, ore: 100 },
    gridX: 4, gridY: 3, color: 0xfbbf24,
  },
  spirit_vein: {
    id: 'spirit_vein', name: '灵脉阵', desc: '持续产出宗门灵石',
    maxLevel: 10, baseCost: { stone: 300, wood: 100, ore: 50 },
    gridX: 2, gridY: 2, color: 0x34d399, requireHall: 1,
  },
  disciple_room: {
    id: 'disciple_room', name: '弟子房', desc: '容纳弟子修炼，增加弟子容量与修炼速度',
    maxLevel: 10, baseCost: { stone: 200, wood: 300, ore: 50 },
    gridX: 6, gridY: 2, color: 0x60a5fa, requireHall: 1,
  },
  alchemy_room: {
    id: 'alchemy_room', name: '炼丹房', desc: '炼制丹药，解锁更高阶丹方',
    maxLevel: 10, baseCost: { stone: 300, wood: 200, ore: 100 },
    gridX: 2, gridY: 4, color: 0xf472b6, requireHall: 2,
  },
  forge_pavilion: {
    id: 'forge_pavilion', name: '炼器阁', desc: '锻造装备，提升品质率',
    maxLevel: 10, baseCost: { stone: 300, wood: 150, ore: 200 },
    gridX: 6, gridY: 4, color: 0xfb923c, requireHall: 2,
  },
  library: {
    id: 'library', name: '藏经阁', desc: '存储功法供弟子学习，提升领悟速度',
    maxLevel: 10, baseCost: { stone: 400, wood: 200, ore: 100 },
    gridX: 4, gridY: 5, color: 0xa78bfa, requireHall: 3,
  },
  training_ground: {
    id: 'training_ground', name: '演武场', desc: '弟子切磋，提升攻防成长率',
    maxLevel: 10, baseCost: { stone: 200, wood: 200, ore: 100 },
    gridX: 1, gridY: 3, color: 0xef4444, requireHall: 2,
  },
  guard_array: {
    id: 'guard_array', name: '护山大阵', desc: '防御敌宗袭击，提供防护罩',
    maxLevel: 10, baseCost: { stone: 500, wood: 100, ore: 300 },
    gridX: 7, gridY: 3, color: 0x14b8a6, requireHall: 3,
  },
  quest_hall: {
    id: 'quest_hall', name: '任务殿', desc: '发布宗门任务，弟子领取执行',
    maxLevel: 10, baseCost: { stone: 300, wood: 300, ore: 50 },
    gridX: 1, gridY: 5, color: 0xfacc15, requireHall: 2,
  },
  spirit_farm: {
    id: 'spirit_farm', name: '灵田', desc: '种植灵草，炼丹材料来源',
    maxLevel: 10, baseCost: { stone: 100, wood: 200, ore: 50 },
    gridX: 7, gridY: 5, color: 0x84cc16, requireHall: 1,
  },
  ore_mine: {
    id: 'ore_mine', name: '矿脉', desc: '持续产出矿石，炼器材料来源',
    maxLevel: 10, baseCost: { stone: 200, wood: 100, ore: 50 },
    gridX: 1, gridY: 6, color: 0xa8a29e, requireHall: 1,
  },
  wood_pavilion: {
    id: 'wood_pavilion', name: '灵木林', desc: '持续产出木材，建筑升级材料',
    maxLevel: 10, baseCost: { stone: 200, wood: 50, ore: 50 },
    gridX: 7, gridY: 6, color: 0x65a30d, requireHall: 1,
  },
  beast_park: {
    id: 'beast_park', name: '灵兽园', desc: '驯养灵兽，可战斗或代步',
    maxLevel: 10, baseCost: { stone: 400, wood: 200, ore: 200 },
    gridX: 3, gridY: 6, color: 0xc084fc, requireHall: 4,
  },
  realm_gate: {
    id: 'realm_gate', name: '秘境入口', desc: '宗门专属秘境，定期刷新资源',
    maxLevel: 5, baseCost: { stone: 1000, wood: 500, ore: 500 },
    gridX: 5, gridY: 6, color: 0x6366f1, requireHall: 5,
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
    disciples: [],
    recruitCooldown: 0,
    techs: {},
    farmSlots: [null, null, null],
  }
}

/** 计算建筑升级费用 */
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

/** 判断建筑是否可建造/升级 */
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
export const SECT_FOUND_REALM = 3     // 金丹期（第三大境界，realm >= 3）
