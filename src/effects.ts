// ---------- Effect 聚合层：装备/词缀/套装/心法/天赋 → 统一修饰与最终属性 ----------

import { CLASSES, REALM_STAT_BONUS, SETS, SKILLS, SLOT_KEYS, V4_KIT_SET_ID_PREFIX, emptyMods, type ArtMode, type AttackMode, type ControlledHitLinkage, type ModKey, type Mods, type ProceduralVfxRecipe, type SetBonus, type SetEffectTag, isControlledHitLinkageAttackCompatible } from './data'
import { V4_KIT_SETS } from './v4/kit-data'
import { isProceduralVfxCompatibleForPhase } from './procedural-vfx'
import { derivePaletteV1, type PaletteV1, type PaletteV1Source } from './palette-v1'
import type { DynamicSetRecord } from './lore'
import { mindModsAt } from './skills'
import { talentMods } from './talents'
import { totalEnhMult, starMult } from './core'
import type { GameState } from './state'
import { ascensionBonus } from './tribulation-data'
import { totalArtifactStats, getArtifactBuff, refineBuffMult, type ArtifactInstance } from './artifact-data'

export interface Stats {
  maxHp: number; atk: number; def: number; speed: number; crit: number
  aspd: number; lifesteal: number; skillPct: number; cdPct: number
}

function addMod(mods: Mods, key: ModKey, v: number) { mods[key] += v }

// ---------- 后天灵窍系统 ----------
export interface OrificeDef {
  name: string
  cost: number
  successBase: number
  atk: number; def: number; maxHp: number; crit: number; speed: number
}

export const SPIRIT_ORIFICES: OrificeDef[] = [
  { name: '灵海', cost: 2000,   successBase: 0.95, atk: 15,  def: 8,   maxHp: 80,   crit: 0.01, speed: 2 },
  { name: '气关', cost: 5000,   successBase: 0.87, atk: 25,  def: 12,  maxHp: 120,  crit: 0.01, speed: 3 },
  { name: '神庭', cost: 10000,  successBase: 0.79, atk: 35,  def: 16,  maxHp: 160,  crit: 0.02, speed: 3 },
  { name: '天灵', cost: 20000,  successBase: 0.71, atk: 50,  def: 22,  maxHp: 220,  crit: 0.02, speed: 4 },
  { name: '玄关', cost: 40000,  successBase: 0.63, atk: 70,  def: 30,  maxHp: 300,  crit: 0.03, speed: 5 },
  { name: '百会', cost: 80000,  successBase: 0.55, atk: 95,  def: 40,  maxHp: 400,  crit: 0.03, speed: 6 },
  { name: '紫府', cost: 150000, successBase: 0.47, atk: 130, def: 55,  maxHp: 550,  crit: 0.04, speed: 7 },
  { name: '玉枕', cost: 300000, successBase: 0.39, atk: 180, def: 75,  maxHp: 750,  crit: 0.05, speed: 8 },
  { name: '泥丸', cost: 600000, successBase: 0.31, atk: 250, def: 100, maxHp: 1000, crit: 0.06, speed: 10 },
]

/** 计算灵窍成功率（境界越高略加成） */
export function orificeSuccessRate(s: GameState, idx: number): number {
  const o = SPIRIT_ORIFICES[idx]
  if (!o) return 0
  const realmBonus = Math.max(0, s.realm - 2) * 0.03
  return Math.min(0.99, o.successBase + realmBonus)
}

/** 灵窍提供的属性加成 */
export function orificeBonuses(s: GameState): { atk: number; def: number; maxHp: number; crit: number; speed: number } {
  let atk = 0, def = 0, maxHp = 0, crit = 0, speed = 0
  for (let i = 0; i < s.spiritOrifices && i < SPIRIT_ORIFICES.length; i++) {
    const o = SPIRIT_ORIFICES[i]
    atk += o.atk; def += o.def; maxHp += o.maxHp; crit += o.crit; speed += o.speed
  }
  return { atk, def, maxHp, crit, speed }
}

/** 汇总所有来源的修饰 */
export function aggregateMods(s: GameState): Mods {
  const mods = emptyMods()

  // 装备基座数值（含强化+精炼+升星）+ 词缀（升星乘以全属性）
  for (const key of SLOT_KEYS) {
    const it = s.equipment[key]
    if (!it) continue
    const mult = totalEnhMult(it)
    const starM = starMult(it)
    addMod(mods, 'atk', Math.round(it.atk * mult))
    addMod(mods, 'def', Math.round(it.def * mult))
    addMod(mods, 'speed', Math.round(it.speed * mult))
    addMod(mods, 'crit', (it.crit + 0.005 * (it.enh ?? 0)) * starM)
    addMod(mods, 'maxHp', Math.round(it.maxHp * mult))
    // 精炼解锁的额外词条已并入 it.affixes，升星对词缀同样生效
    for (const af of it.affixes) addMod(mods, af.stat, af.value * starM)
  }

  // 套装数值阶梯：每个 setId 独立计件，所有满足自身门槛的 Mods 均可叠加。
  // 表现/变身字段从不参与此路径，见 isSetPresentationBonusActive 与下方解析器。
  for (const setId of equippedSetIds(s)) {
    const def = SETS[setId]
    if (!def) continue
    const count = setPieceCount(s, setId)
    for (const bonus of def.bonuses) {
      if (isSetNumericBonusActive(count, bonus) && bonus.mods) {
        for (const [key, value] of Object.entries(bonus.mods)) addMod(mods, key as ModKey, value as number)
      }
    }
  }

  // v4 旁路（S1）：v4 Kit 数值阶梯走独立注册器 V4_KIT_SETS，不进共享 SETS。
  // 纯加法循环，不改既有 v2/v3 路径；v4 setId 在 SETS 中查不到，上方的循环自然跳过。
  for (const setId of equippedSetIds(s)) {
    if (!setId.startsWith(V4_KIT_SET_ID_PREFIX)) continue
    const v4Def = V4_KIT_SETS.get(setId)
    if (!v4Def) continue
    const count = setPieceCount(s, setId)
    for (const bonus of v4Def.bonuses) {
      if (isSetNumericBonusActive(count, bonus) && bonus.mods) {
        for (const [key, value] of Object.entries(bonus.mods)) addMod(mods, key as ModKey, value as number)
      }
    }
  }

  // 心法（按功法等级缩放）
  for (const id of s.skillSlots.minds) {
    if (!id) continue
    const m = mindModsAt(id, s.skills[id] ?? 1)
    for (const [k, v] of Object.entries(m)) addMod(mods, k as ModKey, v as number)
  }

  // 天赋
  const tm = talentMods(s)
  for (const [k, v] of Object.entries(tm)) addMod(mods, k as ModKey, v as number)

  return mods
}

export function calcStats(s: GameState): Stats {
  const c = CLASSES[s.classId]
  const lv = s.level - 1
  const m = aggregateMods(s)
  const realmMult = 1 + REALM_STAT_BONUS * s.realm
  const ascMult = ascensionBonus(s.ascensionCount).statMult
  const orb = orificeBonuses(s)
  const art = totalArtifactStats(s.artifacts ?? [])
  const relicArts = (s.sect?.relics ?? []).filter(Boolean) as ArtifactInstance[]
  const allArts = [...(s.artifacts ?? []), ...relicArts]
  const buff = getArtifactBuff(allArts, s.classId)
  // 法宝 stat 级 buff
  const atkPctBonus = buff?.type === 'atk_pct' ? buff.value : 0
  const allStatsBonus = buff?.type === 'all_stats' ? buff.value : 0
  const lifestealBonus = buff?.type === 'lifesteal' ? buff.value : 0
  // 移速衰减：边际收益递减，防止高装备时移速失控
  const speedBonusCap = 60
  const rawSpeed = m.speed + orb.speed + art.speed
  const speedBonus = rawSpeed > 0
    ? speedBonusCap * (1 - 1 / (1 + rawSpeed / speedBonusCap))
    : rawSpeed
  return {
    maxHp: Math.round((c.base.hp + c.growth.hp * lv + m.maxHp + orb.maxHp + art.maxHp) * (1 + m.hpPct + allStatsBonus) * realmMult * ascMult),
    atk: Math.round((c.base.atk + c.growth.atk * lv + m.atk + orb.atk + art.atk) * (1 + m.atkPct + atkPctBonus + allStatsBonus) * realmMult * ascMult),
    def: Math.round((c.base.def + c.growth.def * lv + m.def + orb.def + art.def) * (1 + m.defPct + allStatsBonus) * realmMult * ascMult),
    speed: Math.round(c.base.speed + speedBonus),
    crit: Math.min(1, c.base.crit + m.crit + orb.crit + art.crit),
    aspd: Math.min(0.4, m.aspd),
    lifesteal: Math.min(0.35, m.lifesteal + lifestealBonus),
    skillPct: m.skillPct,
    cdPct: Math.min(0.5, m.cdPct),
  }
}

export function currentHp(s: GameState): number {
  const max = calcStats(s).maxHp
  return s.hp < 0 || s.hp > max ? max : s.hp
}

// ---------- 套装 ----------
/**
 * Only actual, declared equipment slots participate in all set calculations.
 * Save data can contain arbitrary object keys; treating those as equipment would
 * let malformed saves inject stats, set pieces, tags, or ability sources.
 */
export function equippedSetIds(s: GameState): string[] {
  const ids = new Set<string>()
  for (const key of SLOT_KEYS) {
    const sid = s.equipment[key]?.setId
    if (sid) ids.add(sid)
  }
  return [...ids]
}

export function setPieceCount(s: GameState, setId: string): number {
  let n = 0
  for (const key of SLOT_KEYS) {
    if (s.equipment[key]?.setId === setId) n++
  }
  return n
}

/**
 * 仅数值 Mods 的阶梯门禁：同一 setId 自身达到该条目 count 即生效。
 * 这允许 2/4/6 件数值层与其他 setId 的独立数值层同时叠加。
 */
export function isSetNumericBonusActive(pieceCount: number, bonus: Pick<SetBonus, 'count'>): boolean {
  return pieceCount >= bonus.count
}

/**
 * 变身/名称/视觉等表现能力只能由 4 或 6 件条目提供，且必须满足该条目的自身门槛。
 * 运行时即使收到错误的 2 件能力字段也会拒绝，数据校验器再在构建期阻断该配置。
 */
export function isSetPresentationBonusActive(pieceCount: number, bonus: Pick<SetBonus, 'count'>): boolean {
  return (bonus.count === 4 || bonus.count === 6) && pieceCount >= bonus.count
}

type SetPresentationField = 'attackMode' | 'artMode' | 'transformId' | 'attackName' | 'artName' | 'vfxRecipe' | 'hitLinkage' | 'fxTags' | 'artPower' | 'artCooldownMs' | 'normalPrimitive' | 'artPrimitive'
type SetBonusGate = Pick<SetBonus, 'count' | 'mods' | SetPresentationField>
const SET_PRESENTATION_FIELDS: readonly SetPresentationField[] = [
  'attackMode', 'artMode', 'transformId', 'attackName', 'artName', 'vfxRecipe', 'hitLinkage', 'fxTags', 'artPower', 'artCooldownMs', 'normalPrimitive', 'artPrimitive',
]

/** True when a bonus carries any attack/art/transform/VFX capability rather than numeric Mods alone. */
export function hasSetPresentationFields(bonus: SetBonusGate): boolean {
  return SET_PRESENTATION_FIELDS.some((field) => bonus[field] !== undefined)
}

/**
 * UI/backward-compatible aggregate gate: numeric-only rows use their own count;
 * rows carrying presentation fields must meet the stricter independent 4/6 gate.
 * Core numeric aggregation and presentation resolvers use their explicit helpers above.
 */
export const SET_BONUS_MIN_PIECES = 4
export function isSetBonusActive(pieceCount: number, bonus: SetBonusGate): boolean {
  return hasSetPresentationFields(bonus)
    ? isSetPresentationBonusActive(pieceCount, bonus)
    : isSetNumericBonusActive(pieceCount, bonus)
}

export interface SetEffectRuntime {
  swordSplit: boolean
  fireBurst: boolean
  delayedBurst: boolean
  arrayMine: boolean
  testSwordVisual: boolean
  testFrostVisual: boolean
  testThunderVisual: boolean
  testGiantVisual: boolean
}

export interface SetEffectTagSource {
  readonly setId: string
  readonly count: number
  readonly bonus: SetBonus
}

export interface ResolvedSetEffectTag {
  readonly tag: SetEffectTag
  readonly sources: readonly SetEffectTagSource[]
}

const KNOWN_SET_EFFECT_TAGS: readonly SetEffectTag[] = [
  'sword_split', 'fire_burst', 'delayed_burst', 'array_mine', 'procedural_vfx',
  'test_sword_visual', 'test_frost_visual', 'test_thunder_visual', 'test_giant_visual',
]

/**
 * Non-conflicting fxTags merge across every independently qualified 4/6-piece set.
 * The result is stable: tags use the registry order, and duplicate tag sources are
 * deduplicated by setId then ordered by setId. `procedural_vfx` stays a recipe marker,
 * not a gameplay flag.
 */
export function resolveSetEffectTagSources(s: GameState): ResolvedSetEffectTag[] {
  return mergeSetEffectTagSources(activeSetBonuses(s))
}

/**
 * Existing gameplay consumers use booleans, while provenance remains available from
 * resolveSetEffectTagSources for diagnostics and future source-specific effects.
 */
export function resolveSetEffectRuntime(s: GameState): SetEffectRuntime {
  const out: SetEffectRuntime = { swordSplit: false, fireBurst: false, delayedBurst: false, arrayMine: false, testSwordVisual: false, testFrostVisual: false, testThunderVisual: false, testGiantVisual: false }
  for (const { tag } of resolveSetEffectTagSources(s)) {
    if (tag === 'sword_split') out.swordSplit = true
    else if (tag === 'fire_burst') out.fireBurst = true
    else if (tag === 'delayed_burst') out.delayedBurst = true
    else if (tag === 'array_mine') out.arrayMine = true
    else if (tag === 'test_sword_visual') out.testSwordVisual = true
    else if (tag === 'test_frost_visual') out.testFrostVisual = true
    else if (tag === 'test_thunder_visual') out.testThunderVisual = true
    else if (tag === 'test_giant_visual') out.testGiantVisual = true
  }
  return out
}

// ---------- 攻击模式解析：套装 > 主修招式（需职业匹配） > 职业默认 ----------
function classDefaultMode(s: GameState): AttackMode {
  const def = SKILLS.get(CLASSES[s.classId].defaultStyle)
  return def?.attackMode ?? 'melee_arc'
}

/** 当前装配招式是否与职业匹配 */
function styleMatchesClass(s: GameState): boolean {
  const id = s.skillSlots.style
  if (!id) return false
  const def = SKILLS.get(id)
  return !!def && (def.class === 'any' || def.class === s.classId)
}

export interface SetAbilitySource {
  readonly setId: string
  readonly count: number
  readonly bonus: SetBonus
}

/**
 * Palette V1 is a derived presentation-only view of a validated persisted v3
 * record. It intentionally has no fallback for static, v2, or legacy sources:
 * undefined means every existing fixed-color render route stays intact.
 */
function paletteV1SourceFor(source: SetAbilitySource | null): PaletteV1Source | undefined {
  if (!source?.bonus.transformId) return undefined
  return { setId: source.setId, transformId: source.bonus.transformId }
}

function dynamicRecordForPalette(
  records: readonly DynamicSetRecord[],
  source: PaletteV1Source | undefined,
): DynamicSetRecord | undefined {
  return source ? records.find((record) => record.set.id === source.setId) : undefined
}

export function resolveSetAbilityPaletteV1(
  records: readonly DynamicSetRecord[] | undefined,
  source: SetAbilitySource | null,
): PaletteV1 | undefined {
  const paletteSource = paletteV1SourceFor(source)
  const record = dynamicRecordForPalette(records ?? [], paletteSource)
  return record && paletteSource ? derivePaletteV1(record, paletteSource) : undefined
}

/** Attack palette follows only the independently selected attack winner. */
export function resolveAttackPaletteV1FromSources(
  records: readonly DynamicSetRecord[] | undefined,
  entries: readonly SetAbilitySource[],
): PaletteV1 | undefined {
  return resolveSetAbilityPaletteV1(records, selectSetAttackSource(entries))
}

/** Art palette follows only the independently selected art winner. */
export function resolveArtPaletteV1FromSources(
  records: readonly DynamicSetRecord[] | undefined,
  entries: readonly SetAbilitySource[],
): PaletteV1 | undefined {
  return resolveSetAbilityPaletteV1(records, selectSetArtSource(entries))
}

/** Runtime convenience: preserve undefined for static/v2/legacy sets. */
export function resolveAttackPaletteV1(s: GameState): PaletteV1 | undefined {
  return resolveSetAbilityPaletteV1(s.dynamicSets, resolveSetAttackSource(s))
}

/** Runtime convenience: preserve undefined for static/v2/legacy sets. */
export function resolveArtPaletteV1(s: GameState): PaletteV1 | undefined {
  return resolveSetAbilityPaletteV1(s.dynamicSets, resolveSetArtSource(s))
}

export function sortSetAbilitySources(entries: readonly SetAbilitySource[]): SetAbilitySource[] {
  return [...entries].sort((a, b) => b.bonus.count - a.bonus.count || a.setId.localeCompare(b.setId))
}

/**
 * 统一收集当前激活的套装表现/变身条目：每个 setId 独立按自身 4/6 件门槛判定。
 * 排序将高 bonus.count 优先、再以 setId 词典序打破平局，不依赖 equipment 的对象遍历顺序。
 */
function activeSetBonuses(s: GameState): SetAbilitySource[] {
  const entries: SetAbilitySource[] = []
  for (const setId of equippedSetIds(s).sort((a, b) => a.localeCompare(b))) {
    // Static/registered definitions remain the primary route. The persisted
    // dynamic record is a safe fallback when a test/runtime module graph has
    // not yet shared its registration side effect; it is already the loaded
    // authority for dynamic set identity and cannot override a static entry.
    const def = SETS[setId] ?? V4_KIT_SETS.get(setId) ?? s.dynamicSets.find((record) => record.set.id === setId)?.set
    if (!def) continue
    const count = setPieceCount(s, setId)
    for (const bonus of def.bonuses ?? []) {
      if (isSetPresentationBonusActive(count, bonus) && hasSetPresentationFields(bonus)) entries.push({ setId, count, bonus })
    }
  }
  return sortSetAbilitySources(entries)
}

/** Pure provenance merger for runtime and isolated mixed-set regression tests. */
export function mergeSetEffectTagSources(entries: readonly SetAbilitySource[]): ResolvedSetEffectTag[] {
  const grouped = new Map<SetEffectTag, SetEffectTagSource[]>()
  for (const entry of sortSetAbilitySources(entries)) {
    for (const tag of entry.bonus.fxTags ?? []) {
      if (!KNOWN_SET_EFFECT_TAGS.includes(tag)) continue
      const sources = grouped.get(tag) ?? []
      if (!sources.some((source) => source.setId === entry.setId)) {
        sources.push({ setId: entry.setId, count: entry.count, bonus: entry.bonus })
        grouped.set(tag, sources)
      }
    }
  }
  return KNOWN_SET_EFFECT_TAGS.flatMap((tag) => {
    const sources = grouped.get(tag)
    return sources ? [{ tag, sources: [...sources].sort((a, b) => a.setId.localeCompare(b.setId)) }] : []
  })
}

/**
 * Complete sources are deliberately selected per ability channel. A transform-only,
 * tag-only, or art-only entry cannot consume the attack channel; the symmetrical
 * rule applies to art. Ordering is deterministic: highest qualified tier then setId.
 */
export function selectSetAttackSource(entries: readonly SetAbilitySource[]): SetAbilitySource | null {
  return sortSetAbilitySources(entries).find((entry) => !!entry.bonus.attackMode || !!entry.bonus.normalPrimitive) ?? null
}

export function selectSetArtSource(entries: readonly SetAbilitySource[]): SetAbilitySource | null {
  return sortSetAbilitySources(entries).find((entry) => !!entry.bonus.artMode || !!entry.bonus.artPrimitive) ?? null
}

export function resolveSetAttackSource(s: GameState): SetAbilitySource | null {
  return selectSetAttackSource(activeSetBonuses(s))
}

export function resolveSetArtSource(s: GameState): SetAbilitySource | null {
  return selectSetArtSource(activeSetBonuses(s))
}

export function resolveAttackMode(s: GameState): AttackMode {
  const source = resolveSetAttackSource(s)
  if (source?.bonus.attackMode) return source.bonus.attackMode
  if (styleMatchesClass(s)) {
    const def = SKILLS.get(s.skillSlots.style!)
    if (def?.attackMode) return def.attackMode
  }
  return classDefaultMode(s)
}

/**
 * Attack VFX is phase-scoped and must stay on the winning attack source.
 * A complete VFX profile is not required here: art ownership is resolved independently.
 */
export function resolveProceduralAttackVfxFromSources(entries: readonly SetAbilitySource[]): ProceduralVfxRecipe | null {
  const source = selectSetAttackSource(entries)
  return source && isProceduralVfxCompatibleForPhase(source.bonus.vfxRecipe, 'attack', source.bonus.attackMode)
    ? source.bonus.vfxRecipe
    : null
}

export function resolveProceduralAttackVfx(s: GameState): ProceduralVfxRecipe | null {
  const source = resolveSetAttackSource(s)
  return source && source.bonus.attackMode === resolveAttackMode(s)
    && isProceduralVfxCompatibleForPhase(source.bonus.vfxRecipe, 'attack', source.bonus.attackMode)
    ? source.bonus.vfxRecipe
    : null
}

export interface ResolvedSetHitLinkage {
  readonly linkage: ControlledHitLinkage
  readonly source: SetAbilitySource
  /** The independently winning art source that authorized this linkage. */
  readonly artSource: SetAbilitySource
}

/**
 * Stable, explicit identity for a winning ability row. This is intentionally a
 * compact schema rather than JSON.stringify(bonus): only route-relevant fields
 * participate, `undefined` is explicit, and linkage parameters have a fixed
 * whitelist order. Add a new ability field here when it can change linkage
 * ownership or authorization semantics.
 */
function setAbilitySourceIdentity(channel: 'attack' | 'art', source: SetAbilitySource): string {
  const bonus = source.bonus
  const linkage = bonus.hitLinkage
  const linkageIdentity = linkage?.recipeId === 'flying_sword_first_hit_split'
    ? `${linkage.recipeId}:2:0.4:800:true`
    : linkage?.recipeId === 'giant_sword_first_hit_fire_bolt'
      ? `${linkage.recipeId}:1:0.4:1200:true`
      : 'none'
  const modsIdentity = Object.entries(bonus.mods ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(',') || 'none'
  const tagsIdentity = [...new Set(bonus.fxTags ?? [])].sort((left, right) => left.localeCompare(right)).join(',') || 'none'
  return [
    channel,
    `set=${source.setId}`,
    `equipped=${source.count}`,
    `tier=${bonus.count}`,
    `mods=${modsIdentity}`,
    `attack=${bonus.attackMode ?? 'none'}`,
    `art=${bonus.artMode ?? 'none'}`,
    `transform=${bonus.transformId ?? 'none'}`,
    `recipe=${bonus.vfxRecipe ?? 'none'}`,
    `linkage=${linkageIdentity}`,
    `fxTags=${tagsIdentity}`,
    `attackName=${bonus.attackName ?? 'none'}`,
    `artName=${bonus.artName ?? 'none'}`,
    `artPower=${bonus.artPower ?? 'none'}`,
    `artCooldownMs=${bonus.artCooldownMs ?? 'none'}`,
  ].join(';')
}

/**
 * Source-pair identity consumed by the scene's linkage authorization epoch.
 * A legal 4→6 change within the same setId must change this value even when
 * modes and linkage recipe IDs stay the same.
 */
export function controlledHitLinkageSourceFingerprint(resolved: ResolvedSetHitLinkage | null): string {
  if (!resolved) return ''
  return `${setAbilitySourceIdentity('attack', resolved.source)}|${setAbilitySourceIdentity('art', resolved.artSource)}`
}

/**
 * The linkage belongs to the winning attack source, but 大庚 hard-disable is
 * evaluated against the independently winning art source. This avoids reading
 * a stale or unrelated artMode from the attack source in mixed builds.
 */
export function resolveSetHitLinkageSourceFromSources(entries: readonly SetAbilitySource[]): ResolvedSetHitLinkage | null {
  const source = selectSetAttackSource(entries)
  const artSource = selectSetArtSource(entries)
  if (!source || !artSource || artSource.bonus.artMode === 'dageng') return null
  return isControlledHitLinkageAttackCompatible(source.bonus.hitLinkage, source.bonus.attackMode)
    ? { linkage: source.bonus.hitLinkage, source, artSource }
    : null
}

export function resolveSetHitLinkageSource(s: GameState): ResolvedSetHitLinkage | null {
  return resolveSetHitLinkageSourceFromSources(activeSetBonuses(s))
}

/** Convenience shape for the scene; use resolveSetHitLinkageSource when provenance is required. */
export function resolveSetHitLinkage(s: GameState): ControlledHitLinkage | null {
  return resolveSetHitLinkageSource(s)?.linkage ?? null
}

export interface SetArtOverride {
  mode: ArtMode
  power: number
  cooldownMs: number
  transformId?: string
  /** 动态套装自创的神通中文名；旧套装缺失时由调用方回退模式名。 */
  displayName?: string
  /** 仅动态套装使用的正式模块化 VFX 处方。 */
  vfxRecipe?: ProceduralVfxRecipe
}

/** 旧凡人套未声明数值时保持历史大庚剑阵的 0.45 倍率 / 15 秒基础 CD。 */
const SET_ART_DEFAULTS: Record<ArtMode, Omit<SetArtOverride, 'mode' | 'transformId'>> = {
  sword_fan: { power: 1, cooldownMs: 5000 },
  fire_rain: { power: 1, cooldownMs: 5000 },
  thunder_strike: { power: 1, cooldownMs: 5000 },
  dageng: { power: 0.45, cooldownMs: 15000 },
  sword_storm: { power: 1.2, cooldownMs: 9000 },
  fire_phoenix: { power: 1.5, cooldownMs: 12000 },
  mountain_seal: { power: 1.3, cooldownMs: 10000 },
  shadow_swarm: { power: 1.1, cooldownMs: 8000 },
  ice_thunder: { power: 1.4, cooldownMs: 11000 },
  thunder_prison: { power: 1.4, cooldownMs: 12000 },
  meteor_storm: { power: 1.3, cooldownMs: 10000 },
  void_rift: { power: 1.5, cooldownMs: 11000 },
  blood_domain: { power: 1.2, cooldownMs: 9000 },
  light_pillar: { power: 1.6, cooldownMs: 12000 },
  frozen_domain: { power: 1.3, cooldownMs: 10000 },
  spirit_vortex: { power: 1.1, cooldownMs: 8000 },
  blade_orbit: { power: 1.0, cooldownMs: 7000 },
  poison_cloud: { power: 1.0, cooldownMs: 8000 },
  gravity_crush: { power: 1.4, cooldownMs: 11000 },
  phoenix_rebirth: { power: 1.8, cooldownMs: 14000 },
}

/**
 * 当前满足条件的套装神通覆写；高件数优先，平手按 setId 词典序。
 * 动态记录缺字段、旧存档或静态 set_fr 都能通过兼容默认值安全工作。
 */
export function resolveSetArtOverride(s: GameState): SetArtOverride | null {
  const entry = resolveSetArtSource(s)
  if (!entry?.bonus.artMode) return null
  const { artMode, artPower, artCooldownMs, transformId } = entry.bonus
  const defaults = SET_ART_DEFAULTS[artMode]
  return {
    mode: artMode,
    power: artPower && artPower > 0 ? artPower : defaults.power,
    cooldownMs: artCooldownMs && artCooldownMs > 0 ? artCooldownMs : defaults.cooldownMs,
    ...(transformId ? { transformId } : {}),
    ...(entry.bonus.artName ? { displayName: entry.bonus.artName } : {}),
    // Art VFX is phase-local: it follows the winning art source and only
    // validates this source's art mode, never a separate attack source.
    ...(isProceduralVfxCompatibleForPhase(entry.bonus.vfxRecipe, 'art', artMode)
      ? { vfxRecipe: entry.bonus.vfxRecipe }
      : {}),
  }
}

/** 套装赋予的神通形态兼容入口；新调用方应使用 resolveSetArtOverride 获取数值。 */
export function resolveSetArtMode(s: GameState): ArtMode | null {
  return resolveSetArtOverride(s)?.mode ?? null
}

/** Art VFX is phase-scoped to the independently winning art source. */
export function resolveProceduralArtVfxFromSources(entries: readonly SetAbilitySource[]): ProceduralVfxRecipe | null {
  const source = selectSetArtSource(entries)
  return source && isProceduralVfxCompatibleForPhase(source.bonus.vfxRecipe, 'art', source.bonus.artMode)
    ? source.bonus.vfxRecipe
    : null
}

/** 当前胜出的套装神通是否带程序随机套装的正式 VFX 处方。 */
export function resolveProceduralArtVfx(s: GameState): ProceduralVfxRecipe | null {
  return resolveProceduralArtVfxFromSources(activeSetBonuses(s))
}

/** 当前招式功法威力（含等级成长）；职业不匹配时按默认招式 1.0 */
export function stylePower(s: GameState): number {
  if (!styleMatchesClass(s)) return 1
  const id = s.skillSlots.style!
  const def = SKILLS.get(id)
  if (!def) return 1
  return (def.power ?? 1) * (1 + 0.12 * ((s.skills[id] ?? 1) - 1))
}
