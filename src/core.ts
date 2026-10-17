// ---------- 纯函数核心：随机数、伤害、掉落、经验（不依赖 Phaser，可单测） ----------

import {
  AFFIXES, ITEM_BASES, QUALITY_AFFIX_COUNT, QUALITY_MULT, QUALITY_WEIGHT, SETS,
  type AffixDef, type ItemBase, type ModKey, type Quality, type SetDef,
} from './data'
import { genNamedName } from './lore'
import { V4_KIT_SETS } from './v4/kit-data'

/** 仙界起始楼层（与 xian-realm.ts 保持一致） */
const XIAN_START_FLOOR = 10000

// mulberry32 种子随机
export function makeRng(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randInt(rng: () => number, min: number, max: number) {
  return min + Math.floor(rng() * (max - min + 1))
}

export function pickWeighted<T>(rng: () => number, entries: Array<[T, number]>): T {
  const total = entries.reduce((s, e) => s + e[1], 0)
  let r = rng() * total
  for (const [v, w] of entries) { r -= w; if (r <= 0) return v }
  return entries[entries.length - 1][0]
}

// ---------- 伤害管线 v1 ----------
export interface DamageResult { dmg: number; crit: boolean }

export function calcDamage(
  atk: number, mult: number, critRate: number,
  def: number, rng: () => number, critDmg = 0,
): DamageResult {
  const crit = rng() < critRate
  let raw = atk * mult * (crit ? 1.6 + critDmg : 1)
  raw *= 0.9 + rng() * 0.2 // ±10% 浮动
  const dmg = Math.max(1, Math.round(raw - def))
  return { dmg, crit }
}

// ---------- 经验 / 等级 ----------
export function expNeed(level: number) {
  return Math.round(60 * Math.pow(level, 1.55))
}

// ---------- 装备实例 ----------
let itemSeq = 1
export interface Affix { id: string; name: string; stat: ModKey; value: number; lucky?: boolean }

export interface EquipItem {
  uid: string
  baseId: string
  name: string
  slot: 'weapon' | 'head' | 'armor' | 'boots' | 'charm'
  quality: Quality
  itemLevel: number   // 装备等级：由玩家等级+楼层动态决定，驱动数值与词条数
  setId?: string
  atk: number; def: number; speed: number; crit: number; maxHp: number
  affixes: Affix[]
  price: number
  enh?: number   // 强化等级 0~ENH_MAX
  refine?: number // 精炼等级 0~REFINE_MAX
  star?: number   // 升星等级 0~STAR_MAX
  named?: boolean // 名器：程序命名的稀有装备
}

export const ENH_MAX = 5
/** 强化费用（灵石）：高等级装备更贵 */
export function enhanceCost(it: EquipItem): number {
  const lv = it.itemLevel ?? 1
  return Math.round((25 + lv * 3) * ((it.enh ?? 0) + 1) + it.quality * 15)
}
/** 强化后基座数值倍率（每级 +10%） */
export function enhMult(it: EquipItem): number {
  return 1 + 0.1 * (it.enh ?? 0)
}

// ---------- 精炼 / 升星 ----------
export const REFINE_MAX = 3  // 精炼上限：每级 +15% 基座数值，解锁 1 条额外词条

/** 精炼费用（灵石） */
export function refineCost(it: EquipItem): number {
  const lv = it.itemLevel ?? 1
  const r = it.refine ?? 0
  return Math.round((100 + lv * 8) * (r + 1) * (it.quality + 1) * 1.5)
}

export const STAR_MAX = 5  // 升星上限：每级全属性 ×1.05（复利）

/** 升星费用（灵石） */
export function starUpCost(it: EquipItem): number {
  const lv = it.itemLevel ?? 1
  const s = it.star ?? 0
  return Math.round((200 + lv * 15) * (s + 1) * (it.quality + 1) * 2)
}

/** 升星全属性倍率（每星 +5%，复利） */
export function starMult(it: EquipItem): number {
  return Math.pow(1.05, it.star ?? 0)
}

/** 综合倍率：强化 × 精炼 × 升星 */
export function totalEnhMult(it: EquipItem): number {
  return enhMult(it) * (1 + 0.15 * (it.refine ?? 0)) * starMult(it)
}

export function normalizeItem(it: EquipItem): EquipItem {
  it.maxHp = it.maxHp ?? 0
  it.affixes = it.affixes ?? []
  it.enh = it.enh ?? 0
  it.refine = it.refine ?? 0
  it.star = it.star ?? 0
  it.itemLevel = it.itemLevel ?? 1
  return it
}

function roundAffixValue(stat: ModKey, v: number): number {
  const pctStats: ModKey[] = ['crit', 'atkPct', 'defPct', 'hpPct', 'aspd', 'lifesteal', 'skillPct', 'cdPct']
  return pctStats.includes(stat) ? Math.round(v * 1000) / 1000 : Math.round(v)
}

/** 高装备等级解锁的额外词条数 */
function bonusAffixCount(itemLevel: number): number {
  if (itemLevel >= 60) return 3
  if (itemLevel >= 40) return 2
  if (itemLevel >= 20) return 1
  return 0
}

function rollAffixes(rng: () => number, quality: Quality, itemLevel: number): Affix[] {
  const count = QUALITY_AFFIX_COUNT[quality] + bonusAffixCount(itemLevel)
  if (count === 0) return []
  const pool = [...AFFIXES]
  const out: Affix[] = []
  // 词缀缩放：对数增长，防止高等级时属性爆炸
  const scale = (1 + 2 * (1 - 1 / (1 + itemLevel * 0.04))) * (1 + quality * 0.1)
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = randInt(rng, 0, pool.length - 1)
    const def: AffixDef = pool.splice(idx, 1)[0]
    const raw = def.min + rng() * (def.max - def.min)
    out.push({ id: def.id, name: def.name, stat: def.stat, value: roundAffixValue(def.stat, raw * scale) })
  }
  return out
}

/** 机缘词缀：品质词缀之外按概率额外降临 1~2 条（数值更丰厚，UI 标金） */
function rollLuckyAffixes(rng: () => number, quality: Quality, itemLevel: number, luck: number, used: Affix[]): Affix[] {
  const chance = 0.3 + luck * 0.004
  const out: Affix[] = []
  const pool = AFFIXES.filter((a) => !used.some((u) => u.id === a.id))
  const scale = (1 + 2 * (1 - 1 / (1 + itemLevel * 0.04))) * (1 + quality * 0.1) * 1.25
  const count = rng() < chance ? (quality >= 2 && rng() < chance * 0.5 ? 2 : 1) : 0
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = randInt(rng, 0, pool.length - 1)
    const def: AffixDef = pool.splice(idx, 1)[0]
    const raw = def.min + rng() * (def.max - def.min)
    out.push({ id: def.id, name: def.name, stat: def.stat, value: roundAffixValue(def.stat, raw * scale), lucky: true })
  }
  return out
}

/** 精炼解锁的额外词条：随机一条不重复词缀（与原有词条不重叠） */
export function rollRefineAffix(it: EquipItem, rng: () => number): Affix | null {
  const pool = AFFIXES.filter((a) => !it.affixes.some((u) => u.id === a.id))
  if (pool.length === 0) return null
  const idx = randInt(rng, 0, pool.length - 1)
  const def = pool[idx]
  const scale = (1 + 2 * (1 - 1 / (1 + it.itemLevel * 0.04))) * (1 + it.quality * 0.1)
  const raw = def.min + rng() * (def.max - def.min)
  return { id: def.id, name: def.name, stat: def.stat, value: roundAffixValue(def.stat, raw * scale) }
}

function buildItem(base: ItemBase, quality: Quality, floor: number, rng: () => number, luck = 0, playerLevel = 1): EquipItem {
  // 仙界楼层压缩：破碎仙宫第 N 重 → 等效为 凡界第 20 + N*0.8 层
  // 防止 floor=10000+ 直接灌入导致装备等级爆炸
  const effFloor = floor >= XIAN_START_FLOOR
    ? 20 + Math.floor((floor - XIAN_START_FLOOR + 1) * 0.8)
    : floor
  // 装备等级：玩家等级 ± 波动 + 楼层贡献（对数曲线，高层增长放缓）
  const floorContrib = Math.floor(8 * Math.log2(1 + effFloor / 5))
  const itemLevel = Math.max(1, Math.min(100, playerLevel + randInt(rng, -2, 2) + floorContrib))
  // 等级倍率：对数增长，50级前较快，之后放缓，100级封顶约 4.5x
  const levelMult = 1 + 3.5 * (1 - 1 / (1 + itemLevel * 0.025))
  const mult = QUALITY_MULT[quality] * levelMult
  const affixes = rollAffixes(rng, quality, itemLevel)
  affixes.push(...rollLuckyAffixes(rng, quality, itemLevel, luck, affixes))
  return normalizeItem({
    uid: `${Date.now().toString(36)}-${itemSeq++}`,
    baseId: base.id,
    name: base.name,
    slot: base.slot,
    quality,
    itemLevel,
    setId: base.set,
    atk: Math.round((base.atk ?? 0) * mult),
    def: Math.round((base.def ?? 0) * mult),
    speed: Math.round((base.speed ?? 0) * mult),
    crit: (base.crit ?? 0) + quality * 0.01,
    maxHp: Math.round((base.maxHp ?? 0) * mult),
    affixes,
    price: Math.round(8 * mult * (quality + 1) * (1 + itemLevel * 0.05)),
  })
}

/** GM 工具：按基座 id 直接打造一件指定品质装备 */
export function makeItem(baseId: string, quality: Quality, floor: number, playerLevel?: number): EquipItem | null {
  const base = ITEM_BASES.find((b) => b.id === baseId)
  if (!base) return null
  return buildItem(base, quality, Math.max(1, floor), Math.random, 0, playerLevel ?? floor)
}

/** 按槽位锻造装备（用于宗门炼器），走 buildItem 管线获得词缀和品质 */
export function forgeBySlot(
  slot: 'weapon' | 'head' | 'armor' | 'boots' | 'charm',
  forgeLevel: number,
  playerLevel: number,
  rng: () => number,
): EquipItem {
  const pool = ITEM_BASES.filter(b => b.slot === slot && !b.set)
  const base = pool.length > 0
    ? pool[Math.floor(rng() * pool.length)]
    : ITEM_BASES.find(b => b.slot === slot) ?? ITEM_BASES[0]
  const qualityBonus = forgeLevel >= 5 ? 1 : 0
  const entries: Array<[Quality, number]> = ([0, 1, 2, 3] as Quality[]).map(q => [
    q,
    QUALITY_WEIGHT[q] + (q >= 1 ? qualityBonus * 10 : 0),
  ])
  const quality = pickWeighted(rng, entries)
  const item = buildItem(base, quality, Math.max(1, playerLevel), rng, 0, playerLevel)
  if (item.quality >= 1 && rng() < 0.05 + forgeLevel * 0.01) {
    return makeNamed(item, rng)
  }
  return item
}

/** 名器化：程序命名 + 基座数值提升 15%~30%（灵品以上才有缘得遇） */
function makeNamed(it: EquipItem, rng: () => number): EquipItem {
  it.name = genNamedName(rng, it.slot)
  it.named = true
  const boost = 1.15 + rng() * 0.15
  it.atk = Math.round(it.atk * boost)
  it.def = Math.round(it.def * boost)
  it.speed = Math.round(it.speed * boost)
  it.maxHp = Math.round(it.maxHp * boost)
  it.price = Math.round(it.price * 2)
  return it
}

/** 普通掉落装备（不含套装件） */
export function rollEquip(rng: () => number, floor: number, luckBonus = 0, playerLevel = 1): EquipItem {
  const pool = ITEM_BASES.filter((b) => !b.set)
  const poolSize = Math.min(pool.length, 6 + floor * 2)
  const base = pool[randInt(rng, 0, poolSize - 1)]
  const entries: Array<[Quality, number]> = ([0, 1, 2, 3] as Quality[]).map((q) => [
    q,
    QUALITY_WEIGHT[q] + (q >= 2 ? luckBonus : 0),
  ])
  const quality = pickWeighted(rng, entries)
  let item = buildItem(base, quality, floor, rng, luckBonus, playerLevel)
  if (item.quality >= 1 && rng() < 0.08 + luckBonus * 0.002) item = makeNamed(item, rng)
  return item
}

/** 套装部件（Boss 掉落），quality 灵品~玄品；luck 提高高品质权重 */
export function rollSetPiece(rng: () => number, setId: string, floor: number, luck = 0, playerLevel = 1): EquipItem | null {
  const set = SETS[setId] ?? V4_KIT_SETS.get(setId)
  if (!set) return null
  const baseId = set.pieces[randInt(rng, 0, set.pieces.length - 1)]
  const base = ITEM_BASES.find((b) => b.id === baseId)
  if (!base) return null
  const quality = pickWeighted(rng, [[1, Math.max(10, 45 - luck)], [2, 40 + Math.floor(luck / 2)], [3, 15 + luck]] as Array<[Quality, number]>)
  return buildItem(base, quality, floor, rng, luck, playerLevel)
}

export interface DropRoll {
  gold: number
  potion: boolean
  equip: EquipItem | null
}

export function rollDrop(rng: () => number, goldRange: [number, number], floor: number, isBoss: boolean, luck = 0, goldMult = 1, playerLevel = 1): DropRoll {
  const gold = Math.round(randInt(rng, goldRange[0], goldRange[1]) * (isBoss ? 2 : 1) * goldMult)
  const potion = rng() < (isBoss ? 0.9 : 0.14)
  let equip: EquipItem | null = null
  const equipChance = isBoss ? 1 : 0.13 + luck * 0.002  // 难度加成微幅提升装备掉率
  if (rng() < equipChance) equip = rollEquip(rng, floor, (isBoss ? 20 : 0) + luck, playerLevel)
  return { gold, potion, equip }
}
