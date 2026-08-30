// ---------- 配置数据加载层（JSON 配置表 + 类型定义，构建期经 validate-data.mjs 校验） ----------

import classesJson from './data/classes.json'
import monstersJson from './data/monsters.json'
import floorsJson from './data/floors.json'
import itemsJson from './data/items.json'
import affixesJson from './data/affixes.json'
import setsJson from './data/sets.json'
import skillsJson from './data/skills.json'
import talentsJson from './data/talents.json'
import v4KitsJson from './data/v4-kits.json'

export type Quality = 0 | 1 | 2 | 3 // 凡品/灵品/宝品/玄品
export type ItemSlot = 'weapon' | 'head' | 'armor' | 'boots' | 'charm'
/** 装备槽位 key（charm 有两个佩戴位） */
export type SlotKey = 'weapon' | 'head' | 'armor' | 'boots' | 'charm1' | 'charm2'

export const QUALITY_NAMES = ['凡品', '灵品', '宝品', '玄品']
export const QUALITY_COLORS = [0xcfd3da, 0x58d68d, 0x5dade2, 0xaf7ac5]
export const SLOT_NAMES: Record<SlotKey, string> = {
  weapon: '武器', head: '头部', armor: '衣甲', boots: '靴子', charm1: '饰品一', charm2: '饰品二',
}
export const SLOT_KEYS: SlotKey[] = ['weapon', 'head', 'armor', 'boots', 'charm1', 'charm2']

// ---------- 统一修饰（Effect DSL v1：所有来源共用） ----------
export interface Mods {
  atk: number; def: number; speed: number; crit: number; maxHp: number
  atkPct: number; defPct: number; hpPct: number
  aspd: number; lifesteal: number; skillPct: number; cdPct: number
}
export type ModKey = keyof Mods

export const MOD_LABELS: Record<ModKey, (v: number) => string> = {
  atk: (v) => `攻击+${v}`,
  def: (v) => `防御+${v}`,
  speed: (v) => `速度+${v}`,
  crit: (v) => `会心+${(v * 100).toFixed(0)}%`,
  maxHp: (v) => `气血+${v}`,
  atkPct: (v) => `攻击+${(v * 100).toFixed(0)}%`,
  defPct: (v) => `防御+${(v * 100).toFixed(0)}%`,
  hpPct: (v) => `气血+${(v * 100).toFixed(0)}%`,
  aspd: (v) => `攻速+${(v * 100).toFixed(0)}%`,
  lifesteal: (v) => `吸血+${(v * 100).toFixed(0)}%`,
  skillPct: (v) => `技伤+${(v * 100).toFixed(0)}%`,
  cdPct: (v) => `冷却-${(v * 100).toFixed(0)}%`,
}

export function emptyMods(): Mods {
  return { atk: 0, def: 0, speed: 0, crit: 0, maxHp: 0, atkPct: 0, defPct: 0, hpPct: 0, aspd: 0, lifesteal: 0, skillPct: 0, cdPct: 0 }
}

// ---------- 类型 ----------
export type Direction = 'down' | 'left' | 'right' | 'up'

export interface ClassDef {
  id: string
  name: string
  base: { hp: number; atk: number; def: number; speed: number; crit: number }
  growth: { hp: number; atk: number; def: number }
  defaultStyle: string
  tint: number | null
  /** 素材帧朝向修正（规范素材无需此字段） */
  dirRemap?: Partial<Record<Direction, Direction>>
}

export type AiKind = 'melee' | 'ranged' | 'boss'
export interface MonsterDef {
  id: string; name: string; tex: string
  hp: number; atk: number; def: number; speed: number
  exp: number; gold: [number, number]
  ai: AiKind; range?: number; cd?: number; scale?: number
}

export interface ItemBase {
  id: string; name: string; slot: ItemSlot
  atk?: number; def?: number; speed?: number; crit?: number; maxHp?: number
  set?: string
}

export interface AffixDef { id: string; name: string; stat: ModKey; min: number; max: number }

export type AttackMode = 'melee_arc' | 'whirlwind' | 'flying_sword' | 'flying_sword_burst' | 'magic_bolt' | 'frost_nova' | 'frost_nova_burst' | 'thunder_chain' | 'sword_array' | 'giant_sword' | 'slash_pierce' | 'bolt_fire' | 'slash_heavy' | 'bolt_needle' | 'slash_ice' | 'bolt_dart' | 'thunder_net' | 'flying_sword_split' | 'flame_slash' | 'shadow_blade' | 'spirit_chain' | 'wind_slash' | 'stone_spike' | 'blood_scythe' | 'star_barrage' | 'venom_claw' | 'light_beam' | 'soul_flame' | 'crystal_shard'
export type ArtMode = 'sword_fan' | 'fire_rain' | 'thunder_strike' | 'dageng' | 'sword_storm' | 'fire_phoenix' | 'mountain_seal' | 'shadow_swarm' | 'ice_thunder' | 'thunder_prison' | 'meteor_storm' | 'void_rift' | 'blood_domain' | 'light_pillar' | 'frozen_domain' | 'spirit_vortex' | 'blade_orbit' | 'poison_cloud' | 'gravity_crush' | 'phoenix_rebirth'

/**
 * 程序随机套装可使用的正式模块化视觉处方。
 * 这是白名单 id，不是资源路径；运行时只映射到已有 modularFx 动画。
 */
export type ProceduralVfxRecipe = 'sword-comet' | 'frost-bloom' | 'thunder-sigil' | 'giant-crest'

/** 神通模式的统一展示名；套装覆写不得回退显示玩家已装配的神通名称。 */
export const ART_MODE_NAMES: Record<ArtMode, string> = {
  sword_fan: '剑气纵横',
  fire_rain: '流星火雨',
  thunder_strike: '九天神雷',
  dageng: '大庚剑阵',
  sword_storm: '千剑归宗',
  fire_phoenix: '浴火重生',
  mountain_seal: '五岳镇域',
  shadow_swarm: '百魅夜行',
  ice_thunder: '冰雷双生',
  thunder_prison: '万雷天牢',
  meteor_storm: '陨石天降',
  void_rift: '虚空裂隙',
  blood_domain: '血域降临',
  light_pillar: '圣光审判',
  frozen_domain: '冰封领域',
  spirit_vortex: '元神风暴',
  blade_orbit: '剑环万象',
  poison_cloud: '万毒瘴气',
  gravity_crush: '重力深渊',
  phoenix_rebirth: '凤凰涅槃',
}

export type SetEffectTag = 'sword_split' | 'fire_burst' | 'delayed_burst' | 'array_mine' | 'procedural_vfx' | 'test_sword_visual' | 'test_frost_visual' | 'test_thunder_visual' | 'test_giant_visual'

/**
 * Explicit, data-only first-hit mechanics. These are a closed whitelist rather
 * than a save-driven effect DSL: an untrusted record can only name one of the
 * two implemented runtime behaviours below.
 */
export type ControlledHitLinkageRecipeId = 'flying_sword_first_hit_split' | 'giant_sword_first_hit_fire_bolt'
export interface FlyingSwordFirstHitLinkage {
  recipeId: 'flying_sword_first_hit_split'
  parameters: { childCount: 2; damageMultiplier: 0.4; cooldownMs: 800; nonRecursive: true }
}
export interface GiantSwordFirstHitLinkage {
  recipeId: 'giant_sword_first_hit_fire_bolt'
  parameters: { projectileCount: 1; damageMultiplier: 0.4; cooldownMs: 1200; nonRecursive: true }
}
export type ControlledHitLinkage = FlyingSwordFirstHitLinkage | GiantSwordFirstHitLinkage

export const CONTROLLED_HIT_LINKAGE_RECIPES: Record<ControlledHitLinkageRecipeId, ControlledHitLinkage> = {
  flying_sword_first_hit_split: {
    recipeId: 'flying_sword_first_hit_split',
    parameters: { childCount: 2, damageMultiplier: 0.4, cooldownMs: 800, nonRecursive: true },
  },
  giant_sword_first_hit_fire_bolt: {
    recipeId: 'giant_sword_first_hit_fire_bolt',
    parameters: { projectileCount: 1, damageMultiplier: 0.4, cooldownMs: 1200, nonRecursive: true },
  },
}

/** Return a fresh snapshot so generated/save records never share mutable recipe data. */
export function controlledHitLinkageById(recipeId: ControlledHitLinkageRecipeId): ControlledHitLinkage {
  if (recipeId === 'flying_sword_first_hit_split') {
    return {
      recipeId,
      parameters: { childCount: 2, damageMultiplier: 0.4, cooldownMs: 800, nonRecursive: true },
    }
  }
  return {
    recipeId,
    parameters: { projectileCount: 1, damageMultiplier: 0.4, cooldownMs: 1200, nonRecursive: true },
  }
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

/** Strict structural guard used at the dynamic-save boundary. */
export function isControlledHitLinkage(value: unknown): value is ControlledHitLinkage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const raw = value as Record<string, unknown>
  if (!hasExactKeys(raw, ['recipeId', 'parameters']) || !raw.parameters || typeof raw.parameters !== 'object' || Array.isArray(raw.parameters)) return false
  const parameters = raw.parameters as Record<string, unknown>
  if (raw.recipeId === 'flying_sword_first_hit_split') {
    return hasExactKeys(parameters, ['childCount', 'damageMultiplier', 'cooldownMs', 'nonRecursive'])
      && parameters.childCount === 2
      && parameters.damageMultiplier === 0.4
      && parameters.cooldownMs === 800
      && parameters.nonRecursive === true
  }
  if (raw.recipeId === 'giant_sword_first_hit_fire_bolt') {
    return hasExactKeys(parameters, ['projectileCount', 'damageMultiplier', 'cooldownMs', 'nonRecursive'])
      && parameters.projectileCount === 1
      && parameters.damageMultiplier === 0.4
      && parameters.cooldownMs === 1200
      && parameters.nonRecursive === true
  }
  return false
}

/** A linkage can be structurally owned by an attack source before art is resolved. */
export function isControlledHitLinkageAttackCompatible(
  linkage: unknown,
  attackMode: unknown,
): linkage is ControlledHitLinkage {
  if (!isControlledHitLinkage(linkage)) return false
  return (linkage.recipeId === 'flying_sword_first_hit_split' && attackMode === 'flying_sword_burst')
    || (linkage.recipeId === 'giant_sword_first_hit_fire_bolt' && attackMode === 'giant_sword')
}

/** A controlled linkage belongs to its attack source and never applies to 大庚剑阵. */
export function isControlledHitLinkageCompatible(
  linkage: unknown,
  attackMode: unknown,
  artMode: unknown,
): linkage is ControlledHitLinkage {
  return artMode !== 'dageng' && isControlledHitLinkageAttackCompatible(linkage, attackMode)
}

export interface SetBonus {
  count: number
  mods?: Partial<Mods>
  attackMode?: AttackMode
  artMode?: ArtMode
  /** 稳定的动态套装变身档案 id；静态套装可省略。 */
  transformId?: string
  /** 套装神通的直接伤害倍率；缺失时由现有静态套装兼容默认值补齐。 */
  artPower?: number
  /** 套装神通的基础冷却（毫秒）；最终仍受 cdPct 影响。 */
  artCooldownMs?: number
  /** 程序生成的招式显示名；缺失时沿用攻击模式的既有表现。 */
  attackName?: string
  /** 程序生成的神通显示名；缺失时回退 ART_MODE_NAMES。 */
  artName?: string
  /** v4 原语作为普攻表现（动态套装可选招式路线）；与 attackMode 互斥。 */
  normalPrimitive?: KitPrimitive
  /** v4 原语作为神通表现（动态套装可选神通路线）；与 artMode 互斥。 */
  artPrimitive?: KitPrimitive
  /** 程序随机套装的正式模块化 VFX 处方；不接受任意纹理或动画 key。 */
  vfxRecipe?: ProceduralVfxRecipe
  /** v3 受控首中联动；只能使用固定白名单参数，且仅可出现在完整 4/6 件能力条目。 */
  hitLinkage?: ControlledHitLinkage
  fxTags?: SetEffectTag[]
  desc: string
}
export interface SetDef { id: string; name: string; pieces: string[]; bonuses: SetBonus[] }

export type SkillType = 'style' | 'mind' | 'art'
export type SkillClass = 'sword' | 'fairy' | 'sword_new' | 'fairy_new' | 'mage' | 'any'
export const SKILL_TYPE_NAMES: Record<SkillType, string> = { style: '招式', mind: '心法', art: '神通' }
export interface SkillDef {
  id: string; name: string; type: SkillType; class: SkillClass
  attackMode?: AttackMode; power?: number; cd?: number; artMode?: ArtMode
  mods?: Partial<Mods>; desc: string
}

export interface TalentNode { id: string; name: string; max: number; per: Partial<Mods>; desc: string }
export interface TalentBranch { id: string; name: string; nodes: TalentNode[] }

// ---------- v4 三十套独立 Kit 类型（不并入 AttackMode/ArtMode 联合，ADR D8） ----------
export type KitPrimitive =
  | 'roundtrip' | 'refract' | 'mark' | 'fixedpoint'
  | 'thundernet' | 'thunderstake' | 'charge' | 'boomerang'

export type KitId = `k${string}`

/** v4 Kit 能力档案（固定，非随机）。数值参数由 typed executor 读取。 */
export interface KitAbility {
  readonly kitId: KitId
  readonly name: string
  readonly normalPrimitive: KitPrimitive
  readonly artPrimitive: KitPrimitive
  readonly element: string
  readonly theme: string
  readonly artPower: number
  readonly artCooldownMs: number
}

/** v4 资源 Manifest（每 Kit 独占帧，no-tint，不跨 Kit 借用） */
export interface KitResourceManifest {
  readonly kitId: KitId
  readonly icons: readonly string[]
  readonly normalFrames: { readonly start: readonly string[]; readonly main: readonly string[]; readonly mid: readonly string[] }
  readonly artFrames: { readonly start: readonly string[]; readonly main: readonly string[]; readonly mid: readonly string[] }
  readonly tintPolicy: 'no-tint'
}

/** v4 Kit setId 前缀，用于运行时识别 v4 装备 */
export const V4_KIT_SET_ID_PREFIX = 'set_v4_'

/** 30 Kit 白名单；非白名单 id 一律拒绝进 v4 路由 */
export const V4_KIT_WHITELIST: readonly KitId[] = Array.from({ length: 30 }, (_, i) =>
  `k${String(i + 1).padStart(2, '0')}`,
) as KitId[]

/** v4 Kit 原语参数（art 侧默认值，可由 generator3 覆写） */
export const V4_KIT_PRIMITIVE_PARAMS: Readonly<Record<KitPrimitive, { artPower: number; artCooldownMs: number }>> = {
  roundtrip: { artPower: 1.5, artCooldownMs: 7000 },
  refract: { artPower: 1.0, artCooldownMs: 8000 },
  mark: { artPower: 0.8, artCooldownMs: 6000 },
  fixedpoint: { artPower: 1.4, artCooldownMs: 9000 },
  thundernet: { artPower: 0.6, artCooldownMs: 12000 },
  thunderstake: { artPower: 0.7, artCooldownMs: 10000 },
  charge: { artPower: 2.0, artCooldownMs: 10000 },
  boomerang: { artPower: 1.2, artCooldownMs: 6000 },
}

/** v4 Kit 静态定义行（v4-kits.json 原始结构） */
interface V4KitJsonRow {
  kitId: string
  name: string
  normalPrimitive: string
  artPrimitive: string
  element: string
  theme: string
}

/** 从 v4-kits.json 构建 KitAbility[]，注入 artPower/artCooldownMs */
export const V4_KIT_ABILITIES: readonly KitAbility[] = (v4KitsJson as V4KitJsonRow[]).map((row) => {
  const params = V4_KIT_PRIMITIVE_PARAMS[row.artPrimitive as KitPrimitive]
  return {
    kitId: row.kitId as KitId,
    name: row.name,
    normalPrimitive: row.normalPrimitive as KitPrimitive,
    artPrimitive: row.artPrimitive as KitPrimitive,
    element: row.element,
    theme: row.theme,
    artPower: params?.artPower ?? 1.0,
    artCooldownMs: params?.artCooldownMs ?? 8000,
  }
})

/** kitId → KitAbility 查找表 */
export const V4_KIT_ABILITY_MAP: ReadonlyMap<KitId, KitAbility> = new Map(
  V4_KIT_ABILITIES.map((a) => [a.kitId, a]),
)

/** setId → kitId 反查（set_v4_k01 → k01） */
export function kitIdFromSetId(setId: string): KitId | null {
  if (!setId.startsWith(V4_KIT_SET_ID_PREFIX)) return null
  const kid = setId.slice(V4_KIT_SET_ID_PREFIX.length)
  return V4_KIT_WHITELIST.includes(kid as KitId) ? kid as KitId : null
}

// ---------- 导出 ----------
export const CLASSES = classesJson as unknown as Record<string, ClassDef>
export const MONSTERS = monstersJson as unknown as Record<string, MonsterDef>
export const FLOOR_SPAWNS = floorsJson.floors as unknown as Record<number, Array<[string, number, number]>>
export const MAX_FLOOR = floorsJson.max
export const ITEM_BASES = itemsJson as unknown as ItemBase[]
export const ITEM_BASE_MAP = new Map(ITEM_BASES.map((b) => [b.id, b]))
export const AFFIXES = affixesJson as unknown as AffixDef[]
export const SETS = setsJson as unknown as Record<string, SetDef>
export const SKILLS = new Map((skillsJson as unknown as SkillDef[]).map((s) => [s.id, s]))
export const TALENT_BRANCHES = (talentsJson as { branches: TalentBranch[] }).branches
export const TALENT_NODES = new Map(TALENT_BRANCHES.flatMap((b) => b.nodes).map((n) => [n.id, n]))

// 品质 → 数值倍率 & 出现权重
export const QUALITY_MULT = [1, 1.35, 1.75, 2.2]
export const QUALITY_WEIGHT = [58, 27, 12, 3]
// 各品质词缀条数
export const QUALITY_AFFIX_COUNT = [0, 1, 2, 3]

// ---------- 境界 ----------
export interface RealmDef { name: string; level: number; stones: number }
export const REALMS: RealmDef[] = [
  { name: '炼气', level: 1, stones: 0 },
  { name: '筑基', level: 10, stones: 1 },
  { name: '金丹', level: 20, stones: 2 },
  { name: '元婴', level: 30, stones: 3 },
  { name: '化神', level: 45, stones: 6 },
  { name: '炼虚', level: 60, stones: 10 },
  { name: '合体', level: 80, stones: 15 },
]
/** 每突破一重境界，基础属性 +12% */
export const REALM_STAT_BONUS = 0.12

// ---------- 地区 ----------
export interface RegionDef {
  id: string
  name: string
  floors: [number, number]  // 全局楼层范围 [起, 止]
  setId: string
  floorTex: string
  wallTex: string
  bg: number
  decos: string[]           // 地面装饰贴图 key（旧版，保留兼容）
  terrainPrefix: string     // v2 地形瓷砖集前缀：terrain/{prefix}_xxx
}

export const REGIONS: RegionDef[] = [
  { id: 'qm', name: '青冥山脉', floors: [1, 3], setId: 'set_qm', floorTex: 'floor', wallTex: 'wall', bg: 0x141821, decos: ['deco_qm1', 'deco_qm2', 'deco_qm3'], terrainPrefix: 'qm' },
  { id: 'ym', name: '幽冥沼泽', floors: [4, 6], setId: 'set_xm', floorTex: 'floor2', wallTex: 'wall2', bg: 0x1b1226, decos: ['deco_ym1', 'deco_ym2', 'deco_ym3'], terrainPrefix: 'ym' },
  { id: 'sy', name: '无尽妖域', floors: [7, 9999], setId: 'set_qm', floorTex: 'floor2', wallTex: 'wall', bg: 0x0e1420, decos: ['deco_sy1', 'deco_sy2', 'deco_sy3'], terrainPrefix: 'sy' },
  { id: 'xj', name: '破碎仙宫', floors: [10000, 99999], setId: 'set_qm', floorTex: 'floor', wallTex: 'wall', bg: 0x0a1628, decos: ['deco_qm1', 'deco_qm2', 'deco_qm3'], terrainPrefix: 'xj' },
  // 各域特色秘境（floor 范围不参与 regionOfFloor 查找，通过 regionOverride 使用）
  { id: 'wanyao', name: '万妖谷', floors: [200001, 200003], setId: 'set_qm', floorTex: 'floor2', wallTex: 'wall2', bg: 0x2a1a0e, decos: ['deco_ym1', 'deco_ym2', 'deco_ym3'], terrainPrefix: 'ym' },
  { id: 'tianjian', name: '天剑冢', floors: [200004, 200006], setId: 'set_qm', floorTex: 'floor', wallTex: 'wall', bg: 0x1a1a2a, decos: ['deco_qm1', 'deco_qm2', 'deco_qm3'], terrainPrefix: 'qm' },
  { id: 'haishi', name: '海市蜃楼', floors: [200007, 200009], setId: 'set_qm', floorTex: 'floor2', wallTex: 'wall', bg: 0x0e2a2a, decos: ['deco_sy1', 'deco_sy2', 'deco_sy3'], terrainPrefix: 'sy' },
  { id: 'jiaolong', name: '蛟龙渊', floors: [200010, 200012], setId: 'set_qm', floorTex: 'floor', wallTex: 'wall2', bg: 0x0a1a2a, decos: ['deco_qm1', 'deco_qm2', 'deco_qm3'], terrainPrefix: 'xj' },
  { id: 'guzhan', name: '古战场', floors: [200013, 200015], setId: 'set_qm', floorTex: 'floor2', wallTex: 'wall', bg: 0x2a2a0e, decos: ['deco_ym1', 'deco_ym2', 'deco_ym3'], terrainPrefix: 'ym' },
  { id: 'loulan', name: '楼兰秘境', floors: [200016, 200018], setId: 'set_qm', floorTex: 'floor', wallTex: 'wall2', bg: 0x1a0e2a, decos: ['deco_qm1', 'deco_qm2', 'deco_qm3'], terrainPrefix: 'qm' },
  { id: 'bingyuan', name: '冰原秘境', floors: [200019, 200021], setId: 'set_qm', floorTex: 'floor2', wallTex: 'wall', bg: 0x0e1a2a, decos: ['deco_sy1', 'deco_sy2', 'deco_sy3'], terrainPrefix: 'sy' },
  { id: 'shenyuan', name: '深渊秘境', floors: [200022, 200024], setId: 'set_qm', floorTex: 'floor', wallTex: 'wall2', bg: 0x0a0e2a, decos: ['deco_qm1', 'deco_qm2', 'deco_qm3'], terrainPrefix: 'xj' },
]

export function regionOfFloor(floor: number): RegionDef {
  return REGIONS.find((r) => floor >= r.floors[0] && floor <= r.floors[1]) ?? REGIONS[0]
}

/** 按 ID 查找域（用于域特色秘境的 regionOverride） */
export function getRegionById(id: string): RegionDef | undefined {
  return REGIONS.find((r) => r.id === id)
}

export type SpawnEntry = [string, number, number]

/** 楼层刷怪表：1~6 层读配置；7 层起为无尽妖域动态生成（每 3 层一位 Boss，轮换出场） */
export function spawnTableFor(floor: number): SpawnEntry[] {
  const fixed = FLOOR_SPAWNS[floor]
  if (fixed) return fixed
  const depth = floor - 6
  if (depth % 3 === 0) {
    const bossId = ['boss', 'boss2', 'boss3'][Math.floor(depth / 3) % 3]
    return [[bossId, 1, 1], ['eagle', 1, 2], ['wraith', 1, 2], ['moth', 0, 1]]
  }
  const extra = Math.min(3, Math.floor(depth / 2))
  const table: SpawnEntry[] = [
    ['slime', 1, 2], ['bat', 1, 2 + extra], ['spitter', 1, 2],
    ['wraith', 1 + extra, 2 + extra], ['flower', 0, 1 + Math.min(2, extra)], ['tortoise', 1, 1 + extra],
  ]
  if (depth >= 2) table.push(['skeleton', 1, 1 + Math.min(2, extra)])
  if (depth >= 3) table.push(['eagle', 1, 1 + extra])
  if (depth >= 4) table.push(['phantom', 1, 1 + Math.min(2, extra)])
  if (depth >= 5) table.push(['moth', 1, 1 + Math.min(2, extra)])
  if (depth >= 6) table.push(['brute', 0, 1 + Math.min(1, extra)])
  if (depth >= 7) table.push(['golem', 1, 1])
  if (depth >= 3) table.push(['spirit_fox', 1, 1 + Math.min(2, extra)])
  if (depth >= 5) table.push(['stone_guardian', 0, 1 + Math.min(1, extra)])
  return table
}

/** 域特色秘境刷怪表：按区域 ID 和相对楼层（1-based）生成 */
export function spawnTableForRegion(regionId: string, relFloor: number): SpawnEntry[] {
  const depth = relFloor
  const isBoss = depth % 3 === 0
  const extra = Math.min(3, Math.floor(depth / 2))

  // 通用基础怪
  const base: SpawnEntry[] = [
    ['slime', 1, 2], ['bat', 1, 2 + extra], ['spitter', 1, 2],
    ['wraith', 1 + extra, 2 + extra],
  ]

  // 各域特色怪组合
  const regionExtras: Record<string, SpawnEntry[]> = {
    wanyao: [['flower', 0, 1 + extra], ['tortoise', 1, 1 + extra], ['spirit_fox', 1, 1 + extra], ['phantom', 1, 1 + extra]],
    tianjian: [['skeleton', 1 + extra, 2 + extra], ['eagle', 1, 1 + extra], ['golem', 1, 1]],
    haishi: [['flower', 0, 1 + extra], ['phantom', 1, 1 + extra], ['moth', 1, 1 + extra], ['spirit_fox', 1, 1 + extra]],
    jiaolong: [['tortoise', 1, 1 + extra], ['golem', 1, 1], ['brute', 0, 1 + extra], ['stone_guardian', 0, 1]],
    guzhan: [['skeleton', 1 + extra, 2 + extra], ['brute', 0, 1 + extra], ['eagle', 1, 1 + extra], ['stone_guardian', 0, 1]],
    loulan: [['phantom', 1 + extra, 2 + extra], ['moth', 1, 1 + extra], ['golem', 1, 1], ['spirit_fox', 1, 1 + extra]],
    bingyuan: [['tortoise', 1, 1 + extra], ['phantom', 1 + extra, 2 + extra], ['stone_guardian', 0, 1 + extra], ['brute', 0, 1]],
    shenyuan: [['wraith', 1 + extra, 2 + extra], ['golem', 1, 1], ['brute', 0, 1 + extra], ['moth', 1, 1 + extra], ['stone_guardian', 0, 1]],
  }

  const extras = regionExtras[regionId] || regionExtras.wanyao
  const table = [...base, ...extras]

  // Boss 层
  if (isBoss) {
    const bossId = ['boss', 'boss2', 'boss3'][Math.floor(depth / 3) % 3]
    return [[bossId, 1, 1], ...extras.slice(0, 2)]
  }

  return table
}

// ---------- 关卡难度 ----------
export interface DifficultyDef {
  id: string
  name: string
  desc: string
  hp: number        // 怪物气血倍率
  atk: number       // 怪物攻击倍率
  exp: number       // 经验倍率
  gold: number      // 灵石倍率
  luck: number      // 高品质掉落权重加成
  floorBonus: number // 装备等效楼层加成（数值强度）
  eliteBonus: number // 精英出现率加成
}

export const DIFFICULTIES: DifficultyDef[] = [
  { id: 'normal', name: '普通', desc: '标准历练，按部就班', hp: 1, atk: 1, exp: 1, gold: 1, luck: 0, floorBonus: 0, eliteBonus: 0 },
  { id: 'hard', name: '困难', desc: '妖魔气血×1.6 攻击×1.3｜经验×1.4，高品质掉率提升', hp: 1.6, atk: 1.3, exp: 1.4, gold: 1.5, luck: 12, floorBonus: 2, eliteBonus: 0.1 },
  { id: 'hell', name: '炼狱', desc: '妖魔气血×2.5 攻击×1.7｜经验×2，玄品掉率大增', hp: 2.5, atk: 1.7, exp: 2, gold: 2.2, luck: 30, floorBonus: 4, eliteBonus: 0.2 },
]

export function difficultyById(id?: string): DifficultyDef {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[0]
}
