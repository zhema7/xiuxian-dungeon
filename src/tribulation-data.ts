// ---------- 渡劫飞升系统（Phase 9） ----------
// 境界突破时触发天劫考验：天雷轰炸，玩家需在限定时间内存活
// 飞升：满级（合体）后可重置境界，获得永久加成

export interface TribulationRecord {
  success: boolean
  timestamp: number
  attempts: number
}

export interface TribulationDef {
  realmIndex: number
  name: string
  durationMs: number
  warningMs: number
  strikeIntervalMs: number
  strikesPerWave: number
  damagePerStrike: number
  strikeRadius: number
  maxStrikesTotal: number
}

const STRIKE_BASE_DAMAGE = 80

function buildTribulation(realmIndex: number): TribulationDef {
  const tier = realmIndex - 1
  const name = ['筑基天劫', '金丹天劫', '元婴天劫', '化神天劫', '炼虚天劫', '合体天劫'][tier] ?? '天劫'
  return {
    realmIndex,
    name,
    durationMs: 12000 + tier * 3000,
    warningMs: Math.max(600, 1500 - tier * 150),
    strikeIntervalMs: Math.max(800, 2000 - tier * 200),
    strikesPerWave: 1 + Math.floor(tier / 2),
    damagePerStrike: STRIKE_BASE_DAMAGE + tier * 40,
    strikeRadius: 36 + tier * 4,
    maxStrikesTotal: 12 + tier * 6,
  }
}

export const TRIBULATIONS: TribulationDef[] = [
  buildTribulation(1),
  buildTribulation(2),
  buildTribulation(3),
  buildTribulation(4),
  buildTribulation(5),
  buildTribulation(6),
]

export function getTribulation(realmIndex: number): TribulationDef | null {
  return TRIBULATIONS.find(t => t.realmIndex === realmIndex) ?? null
}

export function needsTribulation(realmIndex: number): boolean {
  return realmIndex >= 1 && realmIndex <= 6
}

// ---------- 飞升系统 ----------

export interface AscensionBonus {
  statMult: number
  expMult: number
  extraSkillPoints: number
}

export function ascensionBonus(count: number): AscensionBonus {
  return {
    statMult: 1 + count * 0.05,
    expMult: 1 + count * 0.10,
    extraSkillPoints: count,
  }
}

export const ASCENSION_REQUIREMENTS = {
  minRealm: 6,
  minXianFloor: 50,
}

import { type GameState } from './state'

export function canAscend(state: GameState): boolean {
  return state.realm >= ASCENSION_REQUIREMENTS.minRealm
    && state.xianMaxDepth >= ASCENSION_REQUIREMENTS.minXianFloor
}

export function performAscension(state: GameState): void {
  state.ascensionCount++
  state.realm = 0
  state.hp = -1
  state.skillPoints += 1
  state.tribulationRecords = {}
}

// ---------- 天梯挑战 ----------

export interface LadderDef {
  baseDifficulty: number
  floorMult: number
  bossInterval: number
  rewardGoldBase: number
  rewardMaterialBase: number
}

export const LADDER: LadderDef = {
  baseDifficulty: 1.0,
  floorMult: 0.15,
  bossInterval: 10,
  rewardGoldBase: 200,
  rewardMaterialBase: 1,
}

export function ladderDifficulty(floor: number): number {
  return LADDER.baseDifficulty + floor * LADDER.floorMult
}

export function ladderReward(floor: number): { gold: number; materials: number } {
  return {
    gold: LADDER.rewardGoldBase * floor,
    materials: LADDER.rewardMaterialBase * Math.floor(floor / 5),
  }
}
