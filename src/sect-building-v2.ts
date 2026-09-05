// ---------- 宗门建设增强系统 ----------
// 建筑升级 + 资源产出计算 + 建筑效果

import type { GameState } from './state'
import type { SectData, BuildingId, SectResources } from './sect-data'
import { BUILDINGS } from './sect-data'

export type { BuildingId } from './sect-data'

// ===== 建筑升级 =====

export function getBuildingUpgradeCost(
  sect: SectData,
  buildingId: BuildingId,
): { stone: number; wood: number; ore: number; gold: number } | null {
  const def = BUILDINGS[buildingId]
  if (!def) return null

  const currentLevel = sect.buildings[buildingId] || 0
  if (currentLevel >= def.maxLevel) return null

  const nextLevel = currentLevel + 1
  const multiplier = 1 + nextLevel * 0.5

  return {
    stone: Math.floor(def.baseCost.stone * multiplier),
    wood: Math.floor(def.baseCost.wood * multiplier),
    ore: Math.floor(def.baseCost.ore * multiplier),
    gold: nextLevel * 50,
  }
}

export function canUpgradeBuilding(
  state: GameState,
  buildingId: BuildingId,
): { ok: boolean; reason: string; cost: ReturnType<typeof getBuildingUpgradeCost> } {
  if (!state.sect) return { ok: false, reason: '尚未建立宗门', cost: null }
  const sect = state.sect
  const def = BUILDINGS[buildingId]
  if (!def) return { ok: false, reason: '建筑不存在', cost: null }

  const currentLevel = sect.buildings[buildingId] || 0
  if (currentLevel >= def.maxLevel) return { ok: false, reason: '已达最高等级', cost: null }

  // 检查解锁条件
  if (def.requireHall && (sect.buildings['main_hall'] || 0) < def.requireHall) {
    return { ok: false, reason: `需主殿达到${def.requireHall}级`, cost: null }
  }

  const cost = getBuildingUpgradeCost(sect, buildingId)
  if (!cost) return { ok: false, reason: '无法升级', cost: null }

  // 检查资源
  if (sect.resources.stone < cost.stone) return { ok: false, reason: '灵石不足', cost }
  if (sect.resources.wood < cost.wood) return { ok: false, reason: '木材不足', cost }
  if (sect.resources.ore < cost.ore) return { ok: false, reason: '矿石不足', cost }
  if (state.gold < cost.gold) return { ok: false, reason: '灵石不足', cost }

  return { ok: true, reason: '', cost }
}

export function upgradeBuilding(state: GameState, buildingId: BuildingId): { ok: boolean; message: string } {
  const check = canUpgradeBuilding(state, buildingId)
  if (!check.ok || !check.cost) return { ok: false, message: check.reason }

  const sect = state.sect!
  const cost = check.cost
  sect.resources.stone -= cost.stone
  sect.resources.wood -= cost.wood
  sect.resources.ore -= cost.ore
  state.gold -= cost.gold

  const oldLevel = sect.buildings[buildingId] || 0
  sect.buildings[buildingId] = oldLevel + 1
  const newLevel = sect.buildings[buildingId]

  // 主殿升级 → 宗门等级同步
  if (buildingId === 'main_hall') {
    sect.level = newLevel
  }

  const def = BUILDINGS[buildingId]
  return { ok: true, message: `${def.name}升至${newLevel}级` }
}

// ===== 资源产出计算 =====

export function calculateSectProduction(sect: SectData): Partial<SectResources> {
  const production: Partial<SectResources> = {
    stone: 0, herb: 0, ore: 0, wood: 0, insight: 0, prestige: 0,
  }

  // 灵脉阵 → 灵石
  const veinLv = sect.buildings['spirit_vein'] || 0
  if (veinLv > 0) {
    production.stone = veinLv * 10
  }

  // 灵田 → 灵草
  const farmLv = sect.buildings['spirit_farm'] || 0
  if (farmLv > 0) {
    production.herb = farmLv * 5
  }

  // 矿脉 → 矿石
  const mineLv = sect.buildings['ore_mine'] || 0
  if (mineLv > 0) {
    production.ore = mineLv * 8
  }

  // 灵木林 → 木材
  const woodLv = sect.buildings['wood_pavilion'] || 0
  if (woodLv > 0) {
    production.wood = woodLv * 6
  }

  // 藏经阁 → 悟道点
  const libLv = sect.buildings['library'] || 0
  if (libLv > 0) {
    production.insight = libLv * 2
  }

  // 主殿 → 声望
  const hallLv = sect.buildings['main_hall'] || 0
  if (hallLv > 0) {
    production.prestige = hallLv * 1
  }

  return production
}

// ===== 宗门产出结算 =====

export function tickSectProduction(state: GameState, deltaMs: number): string[] {
  if (!state.sect) return []
  const sect = state.sect
  const messages: string[] = []

  // 每5分钟结算一次
  sect.productionTimer += deltaMs
  const PRODUCTION_INTERVAL = 5 * 60 * 1000
  if (sect.productionTimer < PRODUCTION_INTERVAL) return []

  const ticks = Math.floor(sect.productionTimer / PRODUCTION_INTERVAL)
  sect.productionTimer = sect.productionTimer % PRODUCTION_INTERVAL

  const production = calculateSectProduction(sect)
  const multiplier = ticks

  let totalStone = 0
  for (const [key, value] of Object.entries(production)) {
    const amount = (value || 0) * multiplier
    if (amount <= 0) continue
    switch (key) {
      case 'stone':
        sect.resources.stone += amount
        totalStone += amount
        break
      case 'herb':
        sect.resources.herb += amount
        break
      case 'ore':
        sect.resources.ore += amount
        break
      case 'wood':
        sect.resources.wood += amount
        break
      case 'insight':
        sect.resources.insight += amount
        state.insight = (state.insight || 0) + amount
        break
      case 'prestige':
        sect.resources.prestige += amount
        state.reputation = (state.reputation || 0) + amount
        break
    }
  }

  if (totalStone > 0) {
    // 灵石产出的一定比例转化为玩家灵石
    const playerShare = Math.floor(totalStone * 0.2)
    state.gold += playerShare
    messages.push(`宗门产出灵石${totalStone}，上缴${playerShare}`)
  }

  return messages
}

// ===== 建筑效果 =====

export interface BuildingEffect {
  maxDisciples: number      // 弟子房加成
  cultivationSpeed: number  // 修炼速度加成
  alchemyUnlock: number     // 炼丹房解锁丹方等级
  forgeUnlock: number       // 炼器阁解锁装备等级
  defensePower: number      // 护山大阵防御
  questSlots: number        // 任务殿同时任务数
}

export function getBuildingEffects(sect: SectData): BuildingEffect {
  return {
    maxDisciples: 3 + Math.floor((sect.buildings['disciple_room'] || 0) / 2),
    cultivationSpeed: 1 + (sect.buildings['spirit_vein'] || 0) * 0.05 + (sect.buildings['library'] || 0) * 0.03,
    alchemyUnlock: sect.buildings['alchemy_room'] || 0,
    forgeUnlock: sect.buildings['forge_pavilion'] || 0,
    defensePower: (sect.buildings['guard_array'] || 0) * 100,
    questSlots: 1 + Math.floor((sect.buildings['quest_hall'] || 0) / 3),
  }
}

// ===== 宗门资源提取 =====

export function withdrawSectResources(state: GameState, type: keyof SectResources, amount: number): { ok: boolean; message: string } {
  if (!state.sect) return { ok: false, message: '尚未建立宗门' }
  const sect = state.sect
  if (sect.resources[type] < amount) return { ok: false, message: '资源不足' }

  sect.resources[type] -= amount
  switch (type) {
    case 'stone':
      state.gold += amount
      break
    case 'insight':
      state.insight = (state.insight || 0) + amount
      break
    default:
      state.materials[type] = (state.materials[type] || 0) + amount
  }
  return { ok: true, message: `提取了${amount}单位${type}` }
}
