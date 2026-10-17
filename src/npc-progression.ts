// ---------- NPC 修为档案：属性 / 装备 / 功法 / 时间成长 ----------
// 设计依据：docs/architecture/npc-progression.md
//
// 三维度驱动，取代原先「只按境界套公式 + 装备占位字符串 + 功法写死四个 id」的旧口径：
//   1. 修为：境界 / 等级 / 突破次数（主驱动，每重境界 +18%）
//   2. 经历：体质 · 道途 · 出身 · 职业 · 心性 · 隐秘（乘性微调 + 装备/功法加权）
//   3. 时间：道行年数（年岁 + 突破 + 在世历练天数），随时间自行修行进境
//
// 依赖约束：本模块只 type-import procedural-npc（编译期擦除），
// 由 procedural-npc 单向依赖本模块，避免循环 import。

import {
  ITEM_BASES, QUALITY_MULT, SKILLS,
  type ItemBase, type Mods, type Quality, type SkillClass, type SkillDef, type SkillType,
} from './data'
import { ENH_MAX, makeRng, normalizeItem, type EquipItem } from './core'
import type { MemberEquipment, MemberSkillSlots } from './party'
import type { ProceduralNpc } from './procedural-npc'

// ---------- 类型 ----------

export const NPC_GEAR_SLOTS = ['weapon', 'head', 'armor', 'boots'] as const
export type NpcGearSlot = (typeof NPC_GEAR_SLOTS)[number]

/** NPC 已物化的真实装备（四槽，与队员装备槽同构） */
export type NpcGear = MemberEquipment
/** NPC 装配功法（真实技能 id，与队员功法槽同构） */
export type NpcLoadout = MemberSkillSlots
/** 功法 id → 修炼等级（1~5） */
export type NpcSkillLevels = Record<string, number>

export interface NpcCombatStats {
  maxHp: number
  atk: number
  def: number
  spd: number
  /** 会心率 0~1 */
  crit: number
  /** 神通威力（无神通为 0） */
  artPower: number
  /** 招式威力（无招式为 1） */
  stylePower: number
  /** 综合战力评分 */
  power: number
}

/** 一次成长结算的结果 */
export interface NpcGrowthResult {
  levels: number
  breakthroughs: number
  /** 突破后是否重铸了装备 / 补录了功法 */
  reforged: boolean
}

// ---------- 小工具 ----------

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

/** 确定性取数：同一 NPC 每次重算结果一致（存档读回不跳变） */
function rngFor(npc: Pick<ProceduralNpc, 'seed'>, salt: number): () => number {
  const seed = (Math.trunc(num(npc.seed, 0)) ^ Math.imul(salt + 1, 2654435761)) >>> 0
  return makeRng(seed)
}

// ---------- 经历加成 ----------

export interface NpcTraitMods {
  /** 乘性：气血 / 攻击 / 防御 / 身法 / 修行速度 */
  hp: number
  atk: number
  def: number
  spd: number
  growth: number
  /** 加性：会心率 / 装备品质 / 装备强化 / 功法槽位 / 功法等级 */
  crit: number
  gearQuality: number
  gearEnh: number
  skillSlots: number
  skillLevel: number
}

const BASE_TRAIT: NpcTraitMods = {
  hp: 1, atk: 1, def: 1, spd: 1, growth: 1,
  crit: 0, gearQuality: 0, gearEnh: 0, skillSlots: 0, skillLevel: 0,
}

function trait(o: Partial<NpcTraitMods>): NpcTraitMods {
  return { ...BASE_TRAIT, ...o }
}

/** 乘性项相乘、加性项相加、growth 相乘 */
function combineTraits(list: NpcTraitMods[]): NpcTraitMods {
  return list.reduce((acc, t) => ({
    hp: acc.hp * t.hp,
    atk: acc.atk * t.atk,
    def: acc.def * t.def,
    spd: acc.spd * t.spd,
    growth: acc.growth * t.growth,
    crit: acc.crit + t.crit,
    gearQuality: acc.gearQuality + t.gearQuality,
    gearEnh: acc.gearEnh + t.gearEnh,
    skillSlots: acc.skillSlots + t.skillSlots,
    skillLevel: acc.skillLevel + t.skillLevel,
  }), { ...BASE_TRAIT })
}

/** 体质：决定修行资质上限 */
const PHYSIQUE_TRAITS: Record<string, NpcTraitMods> = {
  '普通': trait({ growth: 1.0 }),
  '单灵根': trait({ hp: 1.05, atk: 1.08, growth: 1.2 }),
  '双灵根': trait({ hp: 1.08, atk: 1.12, crit: 0.02, growth: 1.35 }),
  '天灵根': trait({ hp: 1.1, atk: 1.16, def: 1.05, crit: 0.02, gearQuality: 0.4, growth: 1.6 }),
  '异灵根': trait({ hp: 1.15, atk: 1.26, crit: 0.03, gearQuality: 0.6, skillLevel: 0.5, growth: 1.8 }),
}

/** 道途：决定战斗倾向与功法取向 */
const DAO_PATH_TRAITS: Record<string, NpcTraitMods> = {
  '剑道': trait({ atk: 1.16, spd: 1.05, crit: 0.01 }),
  '法修': trait({ atk: 1.12, crit: 0.04, def: 0.96 }),
  '体修': trait({ hp: 1.28, def: 1.16, spd: 0.95, atk: 1.02 }),
  '丹道': trait({ hp: 1.14, def: 1.06, growth: 1.2, atk: 0.95 }),
  '器道': trait({ def: 1.12, gearQuality: 0.8, gearEnh: 1, atk: 1.02 }),
  '符道': trait({ atk: 1.06, crit: 0.03, skillSlots: 0.6 }),
}

/** 出身：决定资源与功法传承 */
const BACKGROUND_TRAITS: Record<string, NpcTraitMods> = {
  '寒门子弟': trait({ growth: 1.3, gearQuality: -0.5, hp: 0.97 }),
  '世家嫡子': trait({ gearQuality: 1.0, gearEnh: 1, growth: 1.05, skillLevel: 0.3 }),
  '宗门遗孤': trait({ skillSlots: 1, skillLevel: 0.6, atk: 1.05 }),
  '魔修遗脉': trait({ atk: 1.2, crit: 0.02, hp: 0.92, def: 0.95 }),
  '商贾之家': trait({ gearQuality: 0.7, gearEnh: 0.5, growth: 0.9 }),
  '散修传承': trait({ skillSlots: 0.5, skillLevel: 0.5, spd: 1.04 }),
  '猎户出身': trait({ spd: 1.12, crit: 0.03, hp: 1.03 }),
  '书香门第': trait({ skillLevel: 1, skillSlots: 0.5, growth: 1.1 }),
  '武将之后': trait({ def: 1.15, hp: 1.08, atk: 1.05 }),
  '妖族混血': trait({ spd: 1.18, hp: 1.06, crit: 0.02 }),
}

/** 职业：决定谋生手段带来的偏科 */
const PROFESSION_TRAITS: Record<string, NpcTraitMods> = {
  '散修': trait({ growth: 1.12, spd: 1.03 }),
  '宗门弟子': trait({ skillSlots: 0.5, skillLevel: 0.5, growth: 1.1 }),
  '丹师': trait({ hp: 1.1, growth: 1.15, atk: 0.96 }),
  '器师': trait({ def: 1.1, gearQuality: 0.8, gearEnh: 1 }),
  '符师': trait({ crit: 0.03, skillSlots: 0.5, atk: 1.03 }),
  '商人': trait({ gearQuality: 0.6, growth: 0.85, def: 0.97 }),
  '镖师': trait({ def: 1.12, hp: 1.1 }),
  '游侠': trait({ spd: 1.1, crit: 0.02, def: 0.96 }),
}

/** 心性：小幅偏科，不改修行速度太多 */
const PERSONALITY_TRAITS: Record<string, NpcTraitMods> = {
  '刚正': trait({ def: 1.05, hp: 1.02 }),
  '狡诈': trait({ crit: 0.03, spd: 1.03, def: 0.97 }),
  '孤僻': trait({ growth: 1.2, skillLevel: 0.4 }),
  '热情': trait({ skillSlots: 0.3, growth: 0.98 }),
  '贪婪': trait({ gearQuality: 0.6, growth: 0.95 }),
  '淡泊': trait({ growth: 1.25, skillLevel: 0.6, atk: 0.98 }),
  '好战': trait({ atk: 1.1, crit: 0.01, def: 0.94 }),
  '谨慎': trait({ def: 1.08, atk: 0.95, hp: 1.03 }),
}

/** 隐秘：机缘与代价并存 */
const SECRET_TRAITS: Record<string, NpcTraitMods> = {
  '隐藏身份：实为魔修后裔': trait({ atk: 1.08, def: 0.97 }),
  '身怀重宝：储物戒中有传承玉简': trait({ gearQuality: 1, skillLevel: 0.6 }),
  '暗伤隐患：修炼过急留有暗伤': trait({ hp: 0.9, growth: 1.1 }),
  '魔种附身：偶尔被魔念控制': trait({ atk: 1.14, def: 0.95, crit: 0.02 }),
  '双重身份：明面散修，暗为宗门暗探': trait({ spd: 1.08, skillSlots: 0.4 }),
  '窃取功法：所学功法并非正途所得': trait({ skillSlots: 1, skillLevel: 0.3 }),
  '身负血誓：对某人立下血誓必须完成': trait({ growth: 1.2, atk: 1.03 }),
  '假名行走：真名若被揭穿会引发追杀': trait({ def: 1.05, spd: 1.03 }),
  '灵根隐患：天灵根实为后天移植': trait({ growth: 1.3, hp: 0.95 }),
  '前尘记忆：偶尔涌现前世记忆碎片': trait({ skillLevel: 1, skillSlots: 0.3 }),
}

/** 汇总一名 NPC 的全部经历加成（确定性，不依赖随机数） */
export function npcTraitMods(npc: Pick<ProceduralNpc, 'physique' | 'daoPath' | 'background' | 'profession' | 'personality' | 'secret'>): NpcTraitMods {
  const list: NpcTraitMods[] = []
  const push = (table: Record<string, NpcTraitMods>, key: unknown) => {
    const t = typeof key === 'string' ? table[key] : undefined
    if (t) list.push(t)
  }
  push(PHYSIQUE_TRAITS, npc.physique)
  push(DAO_PATH_TRAITS, npc.daoPath)
  push(BACKGROUND_TRAITS, npc.background)
  push(PROFESSION_TRAITS, npc.profession)
  const traits = Array.isArray(npc.personality) ? npc.personality : []
  for (const p of traits) push(PERSONALITY_TRAITS, p)
  push(SECRET_TRAITS, npc.secret)
  return combineTraits(list)
}

// ---------- 时间：道行 ----------

/** 道行年数 = 年岁沉淀 + 突破积累 + 在世历练天数（封顶 900 年，防止老怪数值失控） */
export function daoYearsOf(npc: Pick<ProceduralNpc, 'age' | 'breakthroughs' | 'cultivationDays'>): number {
  const age = Math.max(0, num(npc.age))
  const bt = Math.max(0, num(npc.breakthroughs))
  const days = Math.max(0, num(npc.cultivationDays))
  return Math.round(Math.min(900, age * 0.55 + bt * 2 + days * 0.03))
}

/** 道行对属性的乘性加成：每 100 年 +40%，封顶 +60% */
export function daoBonus(daoYears: number): number {
  return 1 + clamp(daoYears * 0.004, 0, 0.6)
}

// ---------- 装备物化 ----------

/** 排除测试件与测试套装件后的合法基座池（按强度升序） */
function gearPoolFor(slot: NpcGearSlot): ItemBase[] {
  return ITEM_BASES
    .filter(b => b.slot === slot && !b.id.startsWith('test_') && !String(b.set ?? '').startsWith('set_test'))
    .sort((a, b) => basePower(a) - basePower(b))
}

function basePower(b: ItemBase): number {
  return (b.atk ?? 0) * 2 + (b.def ?? 0) * 1.5 + (b.maxHp ?? 0) * 0.2 + (b.speed ?? 0) * 0.8 + (b.crit ?? 0) * 40
}

/**
 * 为 NPC 物化四件真实装备。品质与强化由「修为 + 经历」共同决定：
 * 世家嫡子、器师、身怀重宝者同一境界下装备明显更好；寒门子弟更容易缺件。
 */
export function forgeNpcGear(npc: Pick<ProceduralNpc, 'id' | 'seed' | 'realm' | 'level' | 'physique' | 'daoPath' | 'background' | 'profession' | 'personality' | 'secret'>, rng?: () => number, uidPrefix = 'npcgear_'): NpcGear {
  const t = npcTraitMods(npc)
  const realm = Math.max(0, Math.trunc(num(npc.realm)))
  const level = Math.max(1, Math.trunc(num(npc.level, 1)))
  const roll = rng ?? rngFor(npc, 17)
  const gear = { weapon: null, head: null, armor: null, boots: null } as NpcGear

  // 缺件率：境界越低、出身越寒微越容易缺件
  const missingChance = clamp(0.32 - realm * 0.045 - t.gearQuality * 0.06, 0.02, 0.5)

  NPC_GEAR_SLOTS.forEach((slot, i) => {
    if (roll() < missingChance) return
    const pool = gearPoolFor(slot)
    if (pool.length === 0) return
    // 档位：境界决定取强取弱，经历（出身/职业/隐秘）再往上顶
    const tier = clamp(
      Math.round((realm / 7) * (pool.length - 1) + t.gearQuality * 0.45 + (roll() - 0.5) * 1.4),
      0,
      pool.length - 1,
    )
    const base = pool[tier]
    const quality = clamp(Math.round(realm * 0.5 + t.gearQuality * 0.7 + (roll() < 0.25 ? 1 : 0)), 0, 3) as Quality
    const enh = clamp(Math.round(realm * 0.6 + t.gearEnh), 0, ENH_MAX)
    // 数值：品质倍率 × 修为成长（境界每重 +55%，等级每级 +1.2%）
    const mult = QUALITY_MULT[quality] * (1 + realm * 0.55 + level * 0.012)
    gear[slot] = normalizeItem({
      uid: `${uidPrefix}${npc.id}_${slot}_${i}`,
      baseId: base.id,
      name: base.name,
      slot: base.slot,
      quality,
      itemLevel: Math.max(1, Math.round(4 + realm * 10 + level * 0.4)),
      setId: base.set,
      atk: Math.round((base.atk ?? 0) * mult),
      def: Math.round((base.def ?? 0) * mult),
      speed: Math.round((base.speed ?? 0) * mult),
      crit: (base.crit ?? 0) + quality * 0.01,
      maxHp: Math.round((base.maxHp ?? 0) * mult),
      affixes: [],
      price: Math.round(8 * mult * (quality + 1)),
      enh,
    })
  })
  return gear
}

/** 装备合计加成（强化按 +2/级 折算，与 party.ts itemBonus 同口径） */
export function npcGearBonus(gear: NpcGear | null | undefined): { atk: number; def: number; speed: number; crit: number; maxHp: number } {
  const out = { atk: 0, def: 0, speed: 0, crit: 0, maxHp: 0 }
  if (!gear) return out
  for (const slot of NPC_GEAR_SLOTS) {
    const it = (gear as Record<string, EquipItem | null>)[slot]
    if (!it) continue
    const enh = (it.enh ?? 0) * 2
    out.atk += num(it.atk) + enh
    out.def += num(it.def) + enh
    out.speed += num(it.speed)
    out.crit += num(it.crit)
    out.maxHp += num(it.maxHp)
  }
  return out
}

// ---------- 功法装配 ----------

interface SkillLevelRow { level: number; power?: number; mods?: Partial<Mods>; desc?: string }
interface SkillDefEx extends SkillDef { upgrades?: SkillLevelRow[] }

function skillRow(def: SkillDef, level: number): SkillLevelRow | undefined {
  const ex = def as SkillDefEx
  return ex.upgrades?.[Math.max(1, Math.min(5, level)) - 1]
}

/** 功法在指定修炼等级下的属性加成 */
export function skillModsAt(def: SkillDef, level: number): Partial<Mods> {
  return (skillRow(def, level)?.mods ?? def.mods ?? {}) as Partial<Mods>
}

/** 功法在指定修炼等级下的威力（style/art 用） */
export function skillPowerAt(def: SkillDef, level: number): number {
  const row = skillRow(def, level)
  return num(row?.power ?? def.power, def.power ?? 1)
}

/** 道途 → 技能流派（决定可学功法池） */
const DAO_SKILL_CLASS: Record<string, SkillClass> = {
  '剑道': 'sword',
  '体修': 'sword',
  '法修': 'mage',
  '符道': 'mage',
  '丹道': 'fairy',
  '器道': 'fairy',
}

function skillPool(type: SkillType, cls: SkillClass): SkillDef[] {
  const all = [...SKILLS.values()]
  const strict = all.filter(s => s.type === type && (s.class === cls || s.class === 'any'))
  if (strict.length > 0) return strict
  return all.filter(s => s.type === type)
}

/**
 * 按「道途 + 出身 + 职业 + 境界 + 道行」装配功法。
 * 数量随境界递增（练气 1~2 门 → 金丹起配齐招式/心法/神通），修炼等级随境界与道行提升。
 */
export function buildNpcLoadout(
  npc: Pick<ProceduralNpc, 'seed' | 'realm' | 'level' | 'age' | 'breakthroughs' | 'cultivationDays' | 'daoPath' | 'profession' | 'background' | 'personality' | 'secret' | 'physique'>,
  rng?: () => number,
): { loadout: NpcLoadout; levels: NpcSkillLevels } {
  const t = npcTraitMods(npc)
  const realm = Math.max(0, Math.trunc(num(npc.realm)))
  const dao = daoYearsOf(npc)
  const roll = rng ?? rngFor(npc, 29)
  const cls = DAO_SKILL_CLASS[String(npc.daoPath)] ?? 'sword'

  // 槽位总数：1 + 境界 * 0.9 + 经历加权，封顶 4（招式/心法×2/神通）
  const slots = clamp(Math.round(1 + realm * 0.9 + t.skillSlots), 1, 4)
  const lvlBase = Math.round(realm * 0.75 + t.skillLevel + dao * 0.01)
  const levelOf = () => clamp(lvlBase + (roll() < 0.3 ? 1 : 0), 1, 5)

  const loadout: NpcLoadout = { style: null, minds: [null, null], art: null }
  const levels: NpcSkillLevels = {}

  const take = (type: SkillType): string | null => {
    const pool = skillPool(type, cls)
    if (pool.length === 0) return null
    const def = pool[Math.floor(roll() * pool.length) % pool.length]
    levels[def.id] = levelOf()
    return def.id
  }

  // 第 1 门固定招式（战斗表现），其后按 心法 → 神通 → 心法二 的顺序补
  loadout.style = take('style')
  const order: Array<'mind0' | 'art' | 'mind1'> = ['mind0', 'art', 'mind1']
  let used = 1
  for (const key of order) {
    if (used >= slots) break
    const id = key === 'art' ? take('art') : take('mind')
    if (!id) continue
    if (key === 'art') loadout.art = id
    else if (key === 'mind0') loadout.minds[0] = id
    else loadout.minds[1] = id
    used++
  }
  return { loadout, levels }
}

/** 已装配功法 id 列表 */
export function npcEquippedSkillIds(loadout: NpcLoadout | null | undefined): string[] {
  if (!loadout) return []
  return [loadout.style, loadout.minds?.[0] ?? null, loadout.minds?.[1] ?? null, loadout.art]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
}

// ---------- 属性合成 ----------

/**
 * 合成 NPC 全部战斗属性。
 * 顺序：基础（境界+等级） → 经历乘性 → 道行乘性 → 装备加值 → 功法百分比 → 钳制。
 */
export function buildNpcStats(npc: Pick<ProceduralNpc, 'realm' | 'level' | 'age' | 'breakthroughs' | 'cultivationDays' | 'physique' | 'daoPath' | 'background' | 'profession' | 'personality' | 'secret' | 'gear' | 'loadout' | 'skillLevels'>): NpcCombatStats {
  const t = npcTraitMods(npc)
  const realm = Math.max(0, Math.trunc(num(npc.realm)))
  const level = Math.max(1, Math.trunc(num(npc.level, 1)))
  const dao = daoBonus(daoYearsOf(npc))
  // 每重境界 +18%（玩家为 +12%，NPC 历练更久，故略高）
  const realmMult = 1 + realm * 0.18

  let maxHp = (90 + realm * 140 + level * 22) * t.hp * dao * realmMult
  // 攻击基础刻意贴近玩家曲线（含装备估算），强度差由经历/道行/装备/功法拉开
  let atk = (12 + realm * 15 + level * 3.2) * t.atk * dao * realmMult
  let def = (9 + realm * 12 + level * 2.2) * t.def * dao * realmMult
  let spd = (8 + realm * 2.2 + level * 0.15) * t.spd
  let crit = 0.03 + t.crit

  const gb = npcGearBonus(npc.gear)
  maxHp += gb.maxHp
  atk += gb.atk
  def += gb.def
  spd += gb.speed
  crit += gb.crit

  // 功法：心法按 mods 加成，招式/神通记威力
  let stylePower = 1
  let artPower = 0
  const pct = { atkPct: 0, defPct: 0, hpPct: 0, aspd: 0 }
  for (const id of npcEquippedSkillIds(npc.loadout)) {
    const def2 = SKILLS.get(id)
    if (!def2) continue
    const lv = clamp(Math.trunc(num((npc.skillLevels as Record<string, number> | undefined)?.[id], 1)), 1, 5)
    const mods = skillModsAt(def2, lv)
    pct.atkPct += num(mods.atkPct)
    pct.defPct += num(mods.defPct)
    pct.hpPct += num(mods.hpPct)
    pct.aspd += num(mods.aspd)
    crit += num(mods.crit)
    maxHp += num(mods.maxHp)
    if (def2.type === 'style') stylePower = Math.max(stylePower, skillPowerAt(def2, lv))
    if (def2.type === 'art') artPower = Math.max(artPower, skillPowerAt(def2, lv))
  }

  atk *= 1 + pct.atkPct
  def *= 1 + pct.defPct
  maxHp *= 1 + pct.hpPct
  spd *= 1 + pct.aspd * 0.5

  maxHp = Math.max(1, Math.round(maxHp))
  atk = Math.max(1, Math.round(atk))
  def = Math.max(0, Math.round(def))
  spd = Math.max(1, Math.round(spd))
  crit = clamp(crit, 0, 0.6)

  const power = Math.round(maxHp * 0.35 + atk * 6 + def * 4 + spd * 2 + crit * 300 + artPower * 90)
  return { maxHp, atk, def, spd, crit, artPower, stylePower, power }
}

// ---------- 相对玩家的战力换算 ----------

/** 属性快照（与 effects.Stats 结构兼容，避免本模块反向依赖 effects） */
export interface PowerStatSnapshot {
  maxHp: number
  atk: number
  def: number
  speed: number
  crit: number
}

/** 由属性快照算战力评分（与 buildNpcStats 同口径） */
export function powerFromStats(s: PowerStatSnapshot): number {
  return Math.round(
    Math.max(0, num(s.maxHp)) * 0.35
    + Math.max(0, num(s.atk)) * 6
    + Math.max(0, num(s.def)) * 4
    + Math.max(0, num(s.speed)) * 2
    + clamp(num(s.crit), 0, 1) * 300,
  )
}

/**
 * 玩家战力基准曲线（无真实属性时的兜底）。
 * 二次项模拟装备/心法/天赋随进度的复利积累 —— 线性曲线会严重低估中后期玩家，
 * 导致 NPC 倍率系统性虚高。
 */
export function estimatePlayerPower(level: number): number {
  const lv = Math.max(1, Math.trunc(num(level, 1)))
  return powerFromStats({
    maxHp: 120 + lv * 20 + lv * lv * 0.5,
    atk: 12 + lv * 4.8 + lv * lv * 0.16,
    def: 6 + lv * 2 + lv * lv * 0.06,
    speed: 100 + lv * 1.2,
    crit: Math.min(0.3, 0.05 + lv * 0.003),
  })
}

/**
 * NPC 相对玩家的伤害倍率。
 * 旧口径只按等级比插值（0.5~1.2），新口径按战力评分比值开 0.75 次幂压缩：
 * 战力 3 倍于玩家的元婴老怪约 1.53 倍，同级同行约 0.95~1.1 倍，练气散修约 0.7 倍。
 * 传入真实玩家属性（calcStats）时更精确，未传则用等级曲线兜底。
 */
export function npcPowerMult(power: number, playerLevel: number, playerStats?: PowerStatSnapshot | null): number {
  const base = playerStats ? powerFromStats(playerStats) : estimatePlayerPower(playerLevel)
  const ratio = num(power) / Math.max(1, base)
  return clamp(0.5 + 0.45 * Math.pow(Math.max(0, ratio), 0.75), 0.45, 2.2)
}

// ---------- 时间成长 ----------

/** 一次修行所需的历练值（NPC 比玩家快，取玩家曲线的 0.8 倍） */
function npcExpNeed(level: number): number {
  return Math.round(32 * Math.pow(Math.max(1, level), 1.45))
}

/** 境界门槛（与 data.ts REALMS 对齐：1/10/20/30/45/60/80） */
const REALM_LEVEL_GATES = [1, 10, 20, 30, 45, 60, 80]

/**
 * 推进 NPC 修行。gameDays = 经过的游戏内天数。
 * 历练值累积 → 升级；达到下一境界门槛且道行足够 → 突破并重铸装备、补录功法。
 */
export function advanceNpcCultivation(
  npc: ProceduralNpc,
  gameDays: number,
  rng: () => number = Math.random,
): NpcGrowthResult {
  const out: NpcGrowthResult = { levels: 0, breakthroughs: 0, reforged: false }
  if (!npc || !npc.alive || gameDays <= 0) return out

  const t = npcTraitMods(npc)
  npc.cultivationDays = Math.max(0, num(npc.cultivationDays)) + gameDays
  // 历练积累：每游戏日 40 + 境界×12 点，再乘资质/心性/隐秘的修行速度
  npc.cultivation = Math.max(0, num(npc.cultivation)) + gameDays * (40 + npc.realm * 12) * t.growth

  // 升级（单帧最多 20 级，防止长离线一次性爆发）
  let guard = 20
  while (guard-- > 0) {
    const need = npcExpNeed(npc.level)
    if (npc.cultivation < need) break
    npc.cultivation -= need
    npc.level = Math.min(200, npc.level + 1)
    out.levels++
  }

  // 突破：达到门槛且道行足够（年岁/突破次数累积）时按资质判定
  const nextGate = REALM_LEVEL_GATES[npc.realm + 1]
  if (nextGate !== undefined && npc.level >= nextGate && rng() < clamp(0.35 * t.growth, 0.05, 0.9)) {
    npc.realm = Math.min(REALM_LEVEL_GATES.length - 1, npc.realm + 1)
    npc.breakthroughs = Math.max(0, num(npc.breakthroughs)) + 1
    out.breakthroughs++
    // 突破后换装 + 补功法（保留原有功法等级，只补缺）
    npc.gear = forgeNpcGear(npc, rng)
    const { loadout, levels } = buildNpcLoadout(npc, rng)
    npc.loadout = loadout
    npc.skillLevels = { ...(npc.skillLevels ?? {}), ...levels }
    out.reforged = true
    npc.eventLog = [...(npc.eventLog ?? []), `突破至${['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体'][npc.realm] ?? '新高'}`].slice(-20)
  }

  if (out.levels > 0 || out.breakthroughs > 0) npc.power = buildNpcStats(npc).power
  return out
}

/** 批量推进（宿主为大世界：只推进存活 NPC，休眠者以半速积累） */
export function tickNpcCultivation(host: { proceduralNpcs: ProceduralNpc[] }, gameDays: number): number {
  if (!host || !Array.isArray(host.proceduralNpcs) || gameDays <= 0) return 0
  const rng = Math.random
  let touched = 0
  for (const n of host.proceduralNpcs) {
    if (!n || !n.alive) continue
    const r = advanceNpcCultivation(n, n.isActive ? gameDays : gameDays * 0.5, rng)
    if (r.levels > 0 || r.breakthroughs > 0) touched++
  }
  return touched
}

// ---------- 旧档回填 ----------

/**
 * 为缺失档案字段的 NPC 补齐装备/功法/战力（幂等）。
 * 用于载入 v12 之前的存档：旧 NPC 只带 equipment 占位串与 skills 数组。
 */
export function ensureNpcProgression(npc: ProceduralNpc): ProceduralNpc {
  if (!npc || typeof npc !== 'object') return npc
  npc.cultivation = Math.max(0, num(npc.cultivation))
  npc.cultivationDays = Math.max(0, num(npc.cultivationDays))
  npc.breakthroughs = Math.max(0, Math.trunc(num(npc.breakthroughs)))
  const hasGear = npc.gear && typeof npc.gear === 'object'
  const hasLoadout = npc.loadout && typeof npc.loadout === 'object'
  if (!hasGear) npc.gear = forgeNpcGear(npc)
  if (!hasLoadout) {
    const { loadout, levels } = buildNpcLoadout(npc)
    npc.loadout = loadout
    npc.skillLevels = { ...(npc.skillLevels ?? {}), ...levels }
  }
  if (!npc.skillLevels || typeof npc.skillLevels !== 'object') npc.skillLevels = {}
  const stats = buildNpcStats(npc)
  npc.power = stats.power
  npc.maxHp = stats.maxHp
  npc.atk = stats.atk
  npc.def = stats.def
  npc.spd = stats.spd
  if (!(npc.hp > 0)) npc.hp = stats.maxHp
  else npc.hp = Math.min(npc.hp, stats.maxHp)
  // 旧展示字段同步为新档案（保证 UI 不再显示占位串）
  npc.skills = npcEquippedSkillIds(npc.loadout)
  return npc
}

// ---------- 宗门 / 城镇 NPC 的派生档案 ----------

/**
 * 角色 → 职业与出身（宗门 NPC 没有背景/心性字段，用角色身份代替）。
 * 这样擂台冠军、炼丹大师、铁匠各自拿到的装备与功法会明显不同。
 */
const SECT_ROLE_TRAITS: Record<string, { profession: string; background: string; secret: string }> = {
  elder: { profession: '宗门弟子', background: '世家嫡子', secret: '身怀重宝：储物戒中有传承玉简' },
  sect_elder: { profession: '宗门弟子', background: '宗门遗孤', secret: '前尘记忆：偶尔涌现前世记忆碎片' },
  wanderer: { profession: '散修', background: '散修传承', secret: '假名行走：真名若被揭穿会引发追杀' },
  merchant: { profession: '商人', background: '商贾之家', secret: '身怀重宝：储物戒中有传承玉简' },
  innkeeper: { profession: '商人', background: '寒门子弟', secret: '暗伤隐患：修炼过急留有暗伤' },
  healer: { profession: '丹师', background: '书香门第', secret: '身负血誓：对某人立下血誓必须完成' },
  alchemist: { profession: '丹师', background: '散修传承', secret: '窃取功法：所学功法并非正途所得' },
  blacksmith: { profession: '器师', background: '寒门子弟', secret: '身怀重宝：储物戒中有传承玉简' },
  city_lord: { profession: '宗门弟子', background: '世家嫡子', secret: '双重身份：明面散修，暗为宗门暗探' },
  arena_master: { profession: '游侠', background: '武将之后', secret: '暗伤隐患：修炼过急留有暗伤' },
  champion: { profession: '游侠', background: '猎户出身', secret: '魔种附身：偶尔被魔念控制' },
}

export interface SectNpcInput {
  id: string
  /** 境界序号 */
  realm: number
  /** 境界内细分等级 0~9（宗门 NPC 口径） */
  level: number
  physique?: string | null
  daoPath?: string | null
  role?: string | null
}

export interface SectNpcProfile {
  stats: NpcCombatStats
  gear: NpcGear
  loadout: NpcLoadout
  skillLevels: NpcSkillLevels
  gearSummary: string[]
  skillSummary: string[]
}

function hashId(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 按「角色 + 道途 + 体质 + 境界」派生宗门/城镇 NPC 的装备、功法与属性。
 * 不写入存档（纯派生），由 id 哈希保证同一 NPC 每次看到的法器一致。
 */
export function sectNpcProfile(input: SectNpcInput): SectNpcProfile {
  const seed = hashId(input.id)
  const role = SECT_ROLE_TRAITS[String(input.role ?? '')] ?? SECT_ROLE_TRAITS.wanderer
  const realm = Math.max(0, Math.trunc(num(input.realm)))
  // 宗门 level 是境界内 0~9，换算到与程序化 NPC 一致的绝对等级
  const level = realm * 10 + Math.max(0, Math.trunc(num(input.level)))
  const npc = {
    id: input.id,
    seed,
    age: 30 + realm * 45,
    realm,
    level,
    physique: input.physique ?? '单灵根',
    daoPath: input.daoPath ?? '剑道',
    profession: role.profession,
    background: role.background,
    personality: [] as string[],
    secret: role.secret,
    breakthroughs: 0,
    cultivationDays: 0,
  } as unknown as ProceduralNpc
  const gear = forgeNpcGear(npc)
  const { loadout, levels } = buildNpcLoadout(npc)
  Object.assign(npc, { gear, loadout, skillLevels: levels })
  const stats = buildNpcStats(npc)
  return {
    stats,
    gear,
    loadout,
    skillLevels: levels,
    gearSummary: npcGearSummary(npc),
    skillSummary: npcSkillSummary(npc),
  }
}

// ---------- 弟子适配（修为档案下沉到弟子） ----------

/**
 * 弟子侧只需提供这些字段即可复用修为档案。
 * 用结构化类型而非直接 import `Disciple`，保证本模块不被 disciple-data 反向依赖。
 */
export interface DiscipleProgressionInput {
  uid: string
  realm: number
  level?: number
  appearanceSeed?: number
  physique?: string
  daoPath?: string
  background?: string
  profession?: string
  personality?: string[]
  atk?: number
  def?: number
  maxHp?: number
  crit?: number
  equipment?: Partial<Record<NpcGearSlot | 'charm', EquipItem | null>>
  skills?: string[]
}

/** 弟子装备 uid 前缀（与 npcgear_ 区分，便于归属判定） */
export const DISCIPLE_GEAR_PREFIX = 'discgear_'

/** 弟子 → 档案输入：补齐 NPC 侧独有字段（隐秘 / 年岁 / 突破 / 在世天数） */
function discipleAsNpc(d: DiscipleProgressionInput) {
  const realm = Math.max(0, Math.trunc(num(d.realm)))
  const level = Math.max(0, Math.trunc(num(d.level)))
  return {
    id: d.uid,
    seed: Math.trunc(num(d.appearanceSeed, 1)) || 1,
    realm,
    level,
    age: 18 + realm * 35,
    breakthroughs: realm,
    cultivationDays: level * 30,
    physique: (d.physique ?? '普通') as never,
    daoPath: (d.daoPath ?? '剑道') as never,
    background: (d.background ?? '寒门子弟') as never,
    profession: (d.profession ?? '宗门弟子') as never,
    personality: (Array.isArray(d.personality) ? d.personality : []) as never,
    secret: '无' as never,
  }
}

/** 为弟子铸造初始装备：写入 equipment 四槽（weapon/head/armor/boots），保留 charm */
export function initDiscipleGear(d: DiscipleProgressionInput): void {
  if (!d.equipment) {
    (d as { equipment?: Partial<Record<NpcGearSlot | 'charm', EquipItem | null>> }).equipment =
      { weapon: null, head: null, armor: null, boots: null, charm: null }
  }
  const gear = forgeNpcGear(discipleAsNpc(d), undefined, DISCIPLE_GEAR_PREFIX)
  const eq = d.equipment as Record<string, EquipItem | null>
  for (const slot of NPC_GEAR_SLOTS) eq[slot] = gear[slot]
}

/** 为弟子装配初始功法：门数随境界 1→4，按道途选池 */
export function initDiscipleSkills(d: DiscipleProgressionInput): void {
  const { loadout } = buildNpcLoadout(discipleAsNpc(d))
  const ids = npcEquippedSkillIds(loadout)
  if (ids.length > 0) d.skills = ids.slice(0, 4)
}

// ---------- 展示辅助 ----------

const QUALITY_LABELS = ['凡品', '灵品', '宝品', '玄品']

/**
 * 是否 NPC 随身法器。这类装备不入玩家行囊：
 * 队员换装时替换下来的 NPC 装备直接归还，避免 NPC 生成物污染玩家经济与掉落池。
 */
export function isNpcOwnedItem(it: EquipItem | null | undefined): boolean {
  return typeof it?.uid === 'string' && it.uid.startsWith('npcgear_')
}

/** 装备摘要：`青锋剑·灵品+2` */
export function npcGearSummary(npc: ProceduralNpc): string[] {
  const out: string[] = []
  const gear = (npc?.gear ?? {}) as Record<string, EquipItem | null>
  for (const slot of NPC_GEAR_SLOTS) {
    const it = gear[slot]
    if (!it) continue
    const q = QUALITY_LABELS[clamp(Math.trunc(num(it.quality)), 0, 3)] ?? '凡品'
    const enh = Math.trunc(num(it.enh)) > 0 ? `+${Math.trunc(num(it.enh))}` : ''
    out.push(`${it.name}·${q}${enh}`)
  }
  return out
}

/** 功法摘要：`御剑术 Lv3` */
export function npcSkillSummary(npc: ProceduralNpc): string[] {
  const out: string[] = []
  for (const id of npcEquippedSkillIds(npc?.loadout)) {
    const def = SKILLS.get(id)
    if (!def) continue
    const lv = clamp(Math.trunc(num((npc.skillLevels as Record<string, number> | undefined)?.[id], 1)), 1, 5)
    out.push(`${def.name} Lv${lv}`)
  }
  return out
}
