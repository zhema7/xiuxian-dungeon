// ---------- 灵兽驯养系统数据定义 ----------

import { makeRng, type EquipItem } from './core'

export type BeastRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type BeastRole = 'combat' | 'mount' | 'none'
export type BeastElement = 'fire' | 'ice' | 'thunder' | 'wind' | 'earth' | 'spirit'

export interface Beast {
  uid: string
  name: string
  species: string
  rarity: BeastRarity
  element: BeastElement
  level: number
  exp: number
  expToNext: number
  atk: number
  def: number
  maxHp: number
  speed: number
  /** 战斗中剩余血量 */
  hp: number
  role: BeastRole
  /** 是否出战中 */
  deployed: boolean
  /** 喂养冷却（ms 时间戳） */
  feedCooldown: number
}

export interface BeastSpeciesDef {
  id: string
  name: string
  rarity: BeastRarity
  element: BeastElement
  baseAtk: number
  baseDef: number
  baseHp: number
  baseSpeed: number
  /** 捕获基础成功率 */
  captureRate: number
  /** 可作为坐骑 */
  canMount: boolean
  desc: string
}

export const BEAST_SPECIES: BeastSpeciesDef[] = [
  { id: 'wolf', name: '幽冥狼', rarity: 'common', element: 'wind', baseAtk: 35, baseDef: 15, baseHp: 200, baseSpeed: 140, captureRate: 0.4, canMount: true, desc: '迅捷的风属性灵兽，适合坐骑' },
  { id: 'turtle', name: '玄甲龟', rarity: 'common', element: 'earth', baseAtk: 20, baseDef: 40, baseHp: 350, baseSpeed: 60, captureRate: 0.5, canMount: false, desc: '防御极高的土属性灵兽' },
  { id: 'fox', name: '灵狐', rarity: 'common', element: 'spirit', baseAtk: 30, baseDef: 20, baseHp: 220, baseSpeed: 120, captureRate: 0.35, canMount: false, desc: '灵巧的灵属性灵兽' },
  { id: 'bear', name: '烈焰熊', rarity: 'rare', element: 'fire', baseAtk: 55, baseDef: 35, baseHp: 400, baseSpeed: 80, captureRate: 0.25, canMount: true, desc: '强力的火属性灵兽，攻防兼备' },
  { id: 'eagle', name: '雷霆雕', rarity: 'rare', element: 'thunder', baseAtk: 50, baseDef: 18, baseHp: 180, baseSpeed: 200, captureRate: 0.2, canMount: true, desc: '极速的雷属性灵兽' },
  { id: 'serpent', name: '冰霜蟒', rarity: 'rare', element: 'ice', baseAtk: 45, baseDef: 30, baseHp: 300, baseSpeed: 100, captureRate: 0.22, canMount: false, desc: '冰属性灵兽，能冰冻敌人' },
  { id: 'qilin', name: '赤焰麒麟', rarity: 'epic', element: 'fire', baseAtk: 80, baseDef: 50, baseHp: 600, baseSpeed: 150, captureRate: 0.1, canMount: true, desc: '传说中的火属性瑞兽' },
  { id: 'dragon', name: '幼龙', rarity: 'legendary', element: 'thunder', baseAtk: 120, baseDef: 80, baseHp: 900, baseSpeed: 180, captureRate: 0.05, canMount: true, desc: '罕见的雷属性龙族幼崽' },
]

export const BEAST_SPECIES_MAP = new Map(BEAST_SPECIES.map(s => [s.id, s]))

export const RARITY_NAMES: Record<BeastRarity, string> = {
  common: '普通', rare: '稀有', epic: '史诗', legendary: '传说',
}

export const RARITY_COLORS: Record<BeastRarity, string> = {
  common: '#a3a3a3', rare: '#58d68d', epic: '#5dade2', legendary: '#af7ac5',
}

export const ELEMENT_NAMES: Record<BeastElement, string> = {
  fire: '火', ice: '冰', thunder: '雷', wind: '风', earth: '土', spirit: '灵',
}

/** 灵兽园容量 */
export function beastCapacity(parkLevel: number): number {
  return parkLevel > 0 ? 2 + parkLevel : 0
}

/** 灵兽升级所需经验 */
export function beastExpToNext(level: number): number {
  return 50 + level * 30 + level * level * 10
}

/** 生成灵兽 */
export function generateBeast(speciesId: string, rng: () => number): Beast {
  const sp = BEAST_SPECIES_MAP.get(speciesId) ?? BEAST_SPECIES[0]
  return {
    uid: 'b_' + Date.now().toString(36) + '_' + Math.floor(rng() * 9999).toString(36),
    name: sp.name,
    species: sp.id,
    rarity: sp.rarity,
    element: sp.element,
    level: 1,
    exp: 0,
    expToNext: beastExpToNext(1),
    atk: sp.baseAtk,
    def: sp.baseDef,
    maxHp: sp.baseHp,
    speed: sp.baseSpeed,
    hp: sp.baseHp,
    role: 'none',
    deployed: false,
    feedCooldown: 0,
  }
}

/** 随机遭遇灵兽（返回 species id） */
export function randomBeastEncounter(rng: () => number, floor: number): string {
  const weights: [string, number][] = BEAST_SPECIES.map(s => {
    const rarityWeight = s.rarity === 'common' ? 50 : s.rarity === 'rare' ? 20 : s.rarity === 'epic' ? 5 : 1
    const floorBonus = floor >= 20 && s.rarity === 'epic' ? 3 : floor >= 30 && s.rarity === 'legendary' ? 2 : 1
    return [s.id, rarityWeight * floorBonus]
  })
  const total = weights.reduce((s, w) => s + w[1], 0)
  let r = rng() * total
  for (const [id, w] of weights) {
    r -= w
    if (r <= 0) return id
  }
  return 'wolf'
}

/** 捕获成功率计算 */
export function captureRate(beast: Beast, parkLevel: number): number {
  const sp = BEAST_SPECIES_MAP.get(beast.species) ?? BEAST_SPECIES[0]
  const hpRatio = beast.hp / beast.maxHp
  const hpBonus = (1 - hpRatio) * 0.3
  const parkBonus = parkLevel * 0.03
  return Math.min(0.95, Math.max(0.05, sp.captureRate + hpBonus + parkBonus))
}

/** 喂养灵兽，返回是否成功 */
export function feedBeast(beast: Beast, herbCost: number): boolean {
  beast.exp += 30 + beast.level * 5
  while (beast.exp >= beast.expToNext && beast.level < 30) {
    beast.exp -= beast.expToNext
    beast.level++
    beast.expToNext = beastExpToNext(beast.level)
    const sp = BEAST_SPECIES_MAP.get(beast.species) ?? BEAST_SPECIES[0]
    const mult = 1 + beast.level * 0.08
    beast.atk = Math.floor(sp.baseAtk * mult)
    beast.def = Math.floor(sp.baseDef * mult)
    beast.maxHp = Math.floor(sp.baseHp * mult)
    beast.hp = beast.maxHp
    beast.speed = Math.floor(sp.baseSpeed * (1 + beast.level * 0.02))
  }
  beast.feedCooldown = Date.now() + 60000
  return true
}

/** 灵兽出战属性快照 */
export function beastCombatStats(beast: Beast): { atk: number; def: number; maxHp: number; speed: number } {
  return { atk: beast.atk, def: beast.def, maxHp: beast.maxHp, speed: beast.speed }
}

/** 坐骑速度加成百分比 */
export function mountSpeedBonus(beast: Beast): number {
  return 0.2 + beast.level * 0.01
}
