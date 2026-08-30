// ---------- 修仙词库 + 程序化生成：名器命名、机缘套装、无名古卷功法 ----------

import {
  ITEM_BASES, ITEM_BASE_MAP, MOD_LABELS, SETS, SKILLS, controlledHitLinkageById, isControlledHitLinkageAttackCompatible,
  type ArtMode, type AttackMode, type ControlledHitLinkage, type ControlledHitLinkageRecipeId, type ItemBase, type ItemSlot, type KitPrimitive, type ModKey, type Mods, type ProceduralVfxRecipe, type SetBonus, type SetDef, type SetEffectTag, type SkillDef,
} from './data'
import { isProceduralVfxCompatible, isProceduralVfxCompatibleForPhase, isProceduralVfxRecipe } from './procedural-vfx'

/** 模块加载时冻结官方内容边界；后续动态注册不应让读档被误判为静态碰撞。 */
const STATIC_SET_IDS = new Set(Object.keys(SETS))
const STATIC_BASE_IDS = new Set(ITEM_BASE_MAP.keys())

function ri(rng: () => number, min: number, max: number) {
  return min + Math.floor(rng() * (max - min + 1))
}
function pick<T>(rng: () => number, arr: T[]): T { return arr[ri(rng, 0, arr.length - 1)] }
function round3(v: number) { return Math.round(v * 1000) / 1000 }

// ---------- 词池（取材《凡人修仙传》及玄幻修仙小说风格） ----------

/** 名器前缀（材质/意象） */
const NAMED_PREFIX = [
  '青竹', '庚金', '紫电', '玄天', '血影', '九幽', '大衍', '梵圣', '太阴', '烈阳',
  '寒螭', '赤蛟', '星砂', '乌金', '墨玉', '霜鳞', '辟邪', '金雷', '噬魂', '洞玄',
  '天都', '璇玑', '离火', '玄冥', '青光', '赤霄', '寒月', '龙吟', '凤鸣', '玄武',
]

/** 槽位后缀 */
const SLOT_SUFFIX: Record<ItemSlot, string[]> = {
  weapon: ['剑', '刃', '环', '幡', '印', '梭', '戈', '轮'],
  head: ['冠', '簪', '巾', '箍', '盔'],
  armor: ['披风', '道袍', '法衣', '甲', '氅', '裳'],
  boots: ['靴', '履', '翅', '屐'],
  charm: ['佩', '坠', '铃', '符', '珠', '珏'],
}

/** 套装主题名 */
export const DYNAMIC_SET_THEMES = [
  '青元', '玄骨', '虚天', '魔银', '惊蛰', '曲魂', '啼魂', '六翼', '金阙', '苍坤',
  '逆星', '千竹', '黄枫', '掩月', '紫灵', '银月', '冰魄', '血焰', '天澜', '大衍',
  '青焰', '黑风', '白虹', '赤炎',
  '流云', '青冥', '玉辰', '丹朱', '阳燧', '紫府', '天罡', '太一', '玉衡',
  '天璇', '紫微', '九宫', '玄枢', '清光', '六仪', '太微', '钧天', '风雷', '神霄',
  '业火', '凰焰', '烬燃', '惊雷', '辟邪', '归元', '浩然', '庚金', '镇界', '天罗',
] as const
export type DynamicSetTheme = typeof DYNAMIC_SET_THEMES[number]

export type DynamicAttackMode = AttackMode

/**
 * 机缘套装的合法战斗组合。招式和神通均可选：缺失时该侧不提供变身能力。
 * 支持 AttackMode/ArtMode（标准路线）和 KitPrimitive（v4 原语路线）。
 */
export interface DynamicSetCombatProfile {
  readonly id: string
  readonly themes: readonly DynamicSetTheme[]
  readonly attackMode?: DynamicAttackMode
  readonly artMode?: ArtMode
  readonly normalPrimitive?: KitPrimitive
  readonly artPrimitive?: KitPrimitive
  readonly attackName?: string
  readonly attackBehavior?: string
  readonly artName?: string
  readonly artBehavior?: string
  readonly vfxRecipe?: ProceduralVfxRecipe
  readonly artPower?: number
  readonly artCooldownMs?: number
  readonly weight: number
  readonly enabled: boolean
}

/**
 * 固定的、主题语义自洽的招式 + 神通变身库。
 * 八条 profile 覆盖四种攻击模式与四种神通模式，每个 profile 的数值、行为描述、名称均不同。
 */
export const DYNAMIC_SET_COMBAT_PROFILES: readonly DynamicSetCombatProfile[] = [
  {
    id: 'jianchao-chuanyun', themes: ['青元', '千竹', '白虹'],
    attackMode: 'flying_sword_burst', artMode: 'sword_fan',
    attackName: '飞剑齐射', attackBehavior: '每次攻击同时放出三柄飞剑，沿途穿透妖敌',
    artName: '剑气纵横', artBehavior: '五道剑气扇形齐发，压制正前方敌群',
    vfxRecipe: 'sword-comet', artPower: 1.6, artCooldownMs: 7000, weight: 12, enabled: true,
  },
  {
    id: 'wanjian-guiliu', themes: ['大衍', '金阙', '苍坤'],
    attackMode: 'flying_sword_burst', artMode: 'dageng',
    attackName: '飞剑齐射', attackBehavior: '每次攻击同时放出三柄飞剑，沿途穿透妖敌',
    artName: '万剑归流', artBehavior: '三十六道庚金剑气盘旋索敌，覆盖全图',
    vfxRecipe: 'sword-comet', artPower: 0.55, artCooldownMs: 12000, weight: 10, enabled: true,
  },
  {
    id: 'shuanglei-zhenyu', themes: ['冰魄', '掩月', '银月'],
    attackMode: 'frost_nova_burst', artMode: 'thunder_strike',
    attackName: '玄冰爆发', attackBehavior: '以自身为心爆开大范围冰环，重创并强力迟缓周遭妖敌',
    artName: '九天神雷', artBehavior: '引五道天雷轰击周遭目标',
    vfxRecipe: 'frost-bloom', artPower: 1.4, artCooldownMs: 12000, weight: 9, enabled: true,
  },
  {
    id: 'xuanzhen-zhenpo', themes: ['玄骨', '虚天', '啼魂'],
    attackMode: 'frost_nova_burst', artMode: 'dageng',
    attackName: '玄冰爆发', attackBehavior: '以自身为心爆开大范围冰环，重创并强力迟缓周遭妖敌',
    artName: '玄金天罗', artBehavior: '二十四道剑气纵横交织，封锁全场',
    vfxRecipe: 'frost-bloom', artPower: 0.5, artCooldownMs: 14000, weight: 8, enabled: true,
  },
  {
    id: 'tianjie-chuanlei', themes: ['紫灵', '惊蛰', '天澜'],
    attackMode: 'thunder_chain', artMode: 'thunder_strike',
    attackName: '紫霄雷链', attackBehavior: '雷光命中首个目标后，最多向邻近妖敌跳传三次，总计最多命中四个目标，后续威力递减',
    artName: '九天神雷', artBehavior: '引五道天雷轰击周遭目标',
    vfxRecipe: 'thunder-sigil', artPower: 1.4, artCooldownMs: 12000, weight: 11, enabled: true,
  },
  {
    id: 'fenglei-xuntian', themes: ['六翼', '黄枫', '黑风'],
    attackMode: 'thunder_chain', artMode: 'thunder_strike',
    attackName: '紫霄雷链', attackBehavior: '雷光命中首个目标后，最多向邻近妖敌跳传三次，总计最多命中四个目标，后续威力递减',
    artName: '风雷天罚', artBehavior: '召唤密集雷暴轰击全场目标，连锁弹射',
    vfxRecipe: 'thunder-sigil', artPower: 1.1, artCooldownMs: 8000, weight: 8, enabled: true,
  },
  {
    id: 'fentian-kaihe', themes: ['赤炎', '青焰', '血焰'],
    attackMode: 'giant_sword', artMode: 'fire_rain',
    attackName: '巨剑术', attackBehavior: '凝成巨剑气贯穿前方路径，无视地形阻隔',
    artName: '流星火雨', artBehavior: '七枚火弹分散坠落，爆裂波及周边目标',
    vfxRecipe: 'giant-crest', artPower: 1.2, artCooldownMs: 9000, weight: 11, enabled: true,
  },
  {
    id: 'xingyun-pozhen', themes: ['魔银', '逆星', '曲魂'],
    attackMode: 'giant_sword', artMode: 'fire_rain',
    attackName: '巨剑术', attackBehavior: '凝成巨剑气贯穿前方路径，无视地形阻隔',
    artName: '星陨焚天', artBehavior: '九枚火弹呈环形坠落，覆盖全场并灼烧目标',
    vfxRecipe: 'giant-crest', artPower: 1.0, artCooldownMs: 7000, weight: 9, enabled: true,
  },
  // ---------- 招式-only profile：覆盖剩余 6 种 AttackMode ----------
  {
    id: 'jinfeng-huihuan', themes: ['青焰', '白虹', '千竹'],
    attackMode: 'melee_arc', attackName: '金风回环', attackBehavior: '近身圆弧横扫，连击递增',
    weight: 7, enabled: true,
  },
  {
    id: 'xuanfeng-liexue', themes: ['黑风', '六翼', '黄枫'],
    attackMode: 'whirlwind', attackName: '旋风裂血', attackBehavior: '以自身为心旋转斩击周遭妖敌',
    weight: 7, enabled: true,
  },
  {
    id: 'liuguang-feijian', themes: ['流云', '青冥', '玉辰'],
    attackMode: 'flying_sword', attackName: '流光飞剑', attackBehavior: '释放飞剑穿透前方目标',
    weight: 7, enabled: true,
  },
  {
    id: 'lingdan-fatan', themes: ['丹朱', '阳燧', '紫府'],
    attackMode: 'magic_bolt', attackName: '灵丹法弹', attackBehavior: '射出法术弹丸，可连发',
    weight: 7, enabled: true,
  },
  {
    id: 'hanjing-binghuan', themes: ['冰魄', '掩月', '银月'],
    attackMode: 'frost_nova', attackName: '寒晶冰环', attackBehavior: '爆开冰环，迟缓并重创近身妖敌',
    weight: 7, enabled: true,
  },
  {
    id: 'wanjian-guizong', themes: ['天罡', '太一', '玉衡'],
    attackMode: 'sword_array', attackName: '万剑归宗', attackBehavior: '开启剑阵，持续自动索敌飞剑',
    weight: 6, enabled: true,
  },
  // ---------- KitPrimitive 路线（v4 原语融入动态套装）----------
  {
    id: 'yuanfan-wanglai', themes: ['大衍', '天璇', '紫微'],
    normalPrimitive: 'roundtrip', artPrimitive: 'mark',
    attackName: '往返斩', attackBehavior: '飞剑去而复返，两段伤害',
    artName: '烙印术', artBehavior: '标记命中的妖敌，延迟引爆',
    artPower: 0.8, artCooldownMs: 6000, weight: 8, enabled: true,
  },
  {
    id: 'xuanren-huixuan', themes: ['苍坤', '九宫', '玄枢'],
    normalPrimitive: 'boomerang', artPrimitive: 'thundernet',
    attackName: '回旋斩', attackBehavior: '回旋飞刃，周身扫击',
    artName: '雷网术', artBehavior: '布下雷网，持续电击范围内妖敌',
    artPower: 0.6, artCooldownMs: 12000, weight: 8, enabled: true,
  },
  {
    id: 'zheguang-dingxue', themes: ['清光', '六仪', '太微'],
    normalPrimitive: 'refract', artPrimitive: 'charge',
    attackName: '折光斩', attackBehavior: '弹射光刃，连锁命中多个目标',
    artName: '蓄力术', artBehavior: '蓄力后爆发，按蓄力层数递增伤害',
    artPower: 2.0, artCooldownMs: 10000, weight: 7, enabled: true,
  },
  {
    id: 'wangjie-leizhuang', themes: ['钧天', '风雷', '神霄'],
    normalPrimitive: 'thunderstake', artPrimitive: 'fixedpoint',
    attackName: '桩斩', attackBehavior: '雷桩轰击，定点持续伤害',
    artName: '定点术', artBehavior: '在瞄准点爆开大范围伤害',
    artPower: 1.4, artCooldownMs: 9000, weight: 7, enabled: true,
  },
  // ---------- 神通-only profile（无招式变身）----------
  {
    id: 'tianhuo-xingyun', themes: ['业火', '凰焰', '烬燃'],
    artMode: 'fire_rain', artName: '天火星陨', artBehavior: '召唤天火流星雨覆盖全场',
    artPower: 1.1, artCooldownMs: 8000, weight: 6, enabled: true,
  },
  {
    id: 'shenlei-pixie', themes: ['惊雷', '辟邪', '玉辰'],
    artMode: 'thunder_strike', artName: '神雷辟邪', artBehavior: '五道天雷随机轰击全场目标',
    artPower: 1.3, artCooldownMs: 10000, weight: 6, enabled: true,
  },
  // ---------- Tier3 新贴图 profile（新招式+新神通组合）----------
  {
    id: 'anxiao-liekong', themes: ['玄骨', '虚天', '啼魂'],
    attackMode: 'shadow_blade', artMode: 'void_rift',
    attackName: '暗影刃斩', attackBehavior: '暗紫月牙刃飞射穿透前方敌阵',
    artName: '虚空裂隙', artBehavior: '撕裂虚空，暗紫裂隙在敌群中绽开',
    artPower: 1.5, artCooldownMs: 11000, weight: 6, enabled: true,
  },
  {
    id: 'fengxuan-lingxuan', themes: ['流云', '青冥', '玉辰'],
    attackMode: 'wind_slash', artMode: 'spirit_vortex',
    attackName: '风刃连斩', attackBehavior: '青绿风刃连绵不绝斩出',
    artName: '元神旋涡', artBehavior: '紫白灵力旋涡吞噬卷入之敌',
    artPower: 1.1, artCooldownMs: 8000, weight: 6, enabled: true,
  },
  {
    id: 'dizhen-bingyuan', themes: ['苍坤', '九宫', '玄枢'],
    attackMode: 'stone_spike', artMode: 'frozen_domain',
    attackName: '地刺术', attackBehavior: '岩刺从地面突刺而上',
    artName: '冰封领域', artBehavior: '冰蓝寒域笼罩全场，减速并冰封其中妖敌',
    artPower: 1.3, artCooldownMs: 10000, weight: 6, enabled: true,
  },
  {
    id: 'xueming-xueyu', themes: ['血焰', '烬燃', '业火'],
    attackMode: 'blood_scythe', artMode: 'blood_domain',
    attackName: '血镰斩', attackBehavior: '血红镰刀弧斩裂敌阵',
    artName: '血域降临', artBehavior: '深红血域铺开，持续侵蚀其中妖敌',
    artPower: 1.2, artCooldownMs: 9000, weight: 6, enabled: true,
  },
  {
    id: 'xingyu-jianhuan', themes: ['紫微', '天璇', '玉衡'],
    attackMode: 'star_barrage', artMode: 'blade_orbit',
    attackName: '星雨弩', attackBehavior: '金色星刃如雨倾泻',
    artName: '剑环舞', artBehavior: '钢蓝飞剑环绕周身持续绞杀',
    artPower: 1.0, artCooldownMs: 7000, weight: 6, enabled: true,
  },
  {
    id: 'duzhao-wanyun', themes: ['曲魂', '六翼', '黄枫'],
    attackMode: 'venom_claw', artMode: 'poison_cloud',
    attackName: '毒爪裂', attackBehavior: '毒绿爪痕撕裂前方目标',
    artName: '万毒瘴气', artBehavior: '毒绿瘴气弥漫全场，持续中毒',
    artPower: 1.0, artCooldownMs: 8000, weight: 6, enabled: true,
  },
  {
    id: 'shengguang-tianzhu', themes: ['太一', '天罡', '浩然'],
    attackMode: 'light_beam', artMode: 'light_pillar',
    attackName: '圣光束', attackBehavior: '白金光柱贯穿前方',
    artName: '圣光天柱', artBehavior: '金色光柱从天降下，净化全场',
    artPower: 1.6, artCooldownMs: 12000, weight: 6, enabled: true,
  },
  {
    id: 'hunyan-zhongyuan', themes: ['惊雷', '辟邪', '神霄'],
    attackMode: 'soul_flame', artMode: 'gravity_crush',
    attackName: '魂火弹', attackBehavior: '幽青魂焰灼烧目标',
    artName: '重力深渊', artBehavior: '暗紫引力场粉碎范围内一切',
    artPower: 1.4, artCooldownMs: 11000, weight: 6, enabled: true,
  },
  {
    id: 'jingsui-xingyun', themes: ['银月', '冰魄', '紫灵'],
    attackMode: 'crystal_shard', artMode: 'meteor_storm',
    attackName: '晶碎刃', attackBehavior: '蓝晶碎片飞射穿透敌阵',
    artName: '陨石天降', artBehavior: '火陨石密集坠落，全场爆裂',
    artPower: 1.3, artCooldownMs: 10000, weight: 6, enabled: true,
  },
  {
    id: 'lingsuo-fenghuang', themes: ['金阙', '镇界', '天罗'],
    attackMode: 'spirit_chain', artMode: 'phoenix_rebirth',
    attackName: '灵锁链', attackBehavior: '金属锁链延伸锁定并贯穿敌人',
    artName: '凤凰涅槃', artBehavior: '火凤展翅重生，烈焰爆发扫场',
    artPower: 1.8, artCooldownMs: 14000, weight: 5, enabled: true,
  },
  // ---------- 无能力 profile（纯数值套装）----------
  {
    id: 'hunyuan-baoti', themes: ['归元', '浩然', '太一'],
    weight: 5, enabled: true,
  },
  {
    id: 'xuantie-jianshan', themes: ['庚金', '镇界', '天罗'],
    weight: 5, enabled: true,
  },
] as const

/** 某主题被目录覆盖的 profile（含 disabled，供配置完整性检查与测试使用）。 */
export function combatProfilesForTheme(theme: DynamicSetTheme): DynamicSetCombatProfile[] {
  return DYNAMIC_SET_COMBAT_PROFILES.filter((profile) => profile.themes.includes(theme))
}

function boundedUnit(rng: () => number): number {
  return Math.max(0, Math.min(0.999999999, rng()))
}

function pickWeightedProfile(rng: () => number, profiles: readonly DynamicSetCombatProfile[]): DynamicSetCombatProfile {
  const total = profiles.reduce((sum, profile) => sum + profile.weight, 0)
  let needle = boundedUnit(rng) * total
  for (const profile of profiles) {
    needle -= profile.weight
    if (needle <= 0) return profile
  }
  return profiles[profiles.length - 1]
}

/**
 * 从仍可用主题对应的 enabled profile 中按权重选一条。候选为空说明目录配置失配，
 * 明确抛错而不是静默生成默认飞剑。
 */
export function chooseDynamicSetCombatProfile(rng: () => number, availableThemes: readonly string[]): DynamicSetCombatProfile {
  const available = new Set(availableThemes)
  const candidates = DYNAMIC_SET_COMBAT_PROFILES.filter((profile) => profile.enabled
    && profile.weight > 0
    && profile.themes.some((theme) => available.has(theme)))
  if (candidates.length === 0) throw new Error('动态套装主题没有可用战斗组合')
  return pickWeightedProfile(rng, candidates)
}

/** 保留旧导出供存档工具/外部调用兼容；主题参数不再用于关键词推断。 */
export function chooseDynamicAttackMode(rng: () => number, theme: string): DynamicAttackMode {
  return chooseDynamicSetCombatProfile(rng, [theme]).attackMode ?? 'flying_sword_burst'
}

/** 动态 4 件效果展示文案只使用中文设计语义，不泄露内部 runtime id。 */
export function formatDynamicSetBonusDesc(
  mods: Partial<Mods>,
  profile: Pick<Partial<DynamicSetCombatProfile>, 'attackName' | 'attackBehavior' | 'artName' | 'artBehavior'>,
  linkage: ControlledHitLinkage | null = null,
): string {
  const parts: string[] = [`4件：${modsDesc(mods)}`]
  if (profile.attackName) {
    parts.push(`招式化为【${profile.attackName}】${profile.attackBehavior ? '——' + profile.attackBehavior : ''}`)
  }
  if (profile.artName) {
    parts.push(`神通化为【${profile.artName}】${profile.artBehavior ? '——' + profile.artBehavior : ''}`)
  }
  if (linkage?.recipeId === 'flying_sword_first_hit_split') {
    parts.push('飞剑首次命中时分裂为两柄子剑，各承40%威力，0.8秒内至多触发一次')
  } else if (linkage?.recipeId === 'giant_sword_first_hit_fire_bolt') {
    parts.push('巨剑首次命中时追加一枚火弹，承40%威力，1.2秒内至多触发一次')
  }
  return parts.join('；') + '。'
}

/** 功法名前缀 / 后缀 */
const SKILL_PREFIX = [
  '青元', '大衍', '玄阴', '明王', '梵圣', '托天', '罗烟', '惊蛰', '百脉', '玉清',
  '太玄', '混元', '归一', '血炼', '化劫', '坐忘', '长春', '煞丹', '幻音', '葵水',
  '紫霄', '黄庭', '离尘', '忘情',
]
const SKILL_SUFFIX = ['诀', '经', '功', '典', '录', '章', '书', '心法']

// ---------- 名器命名 ----------

/** 生成名器名（如「庚金剑」「九幽披风」） */
export function genNamedName(rng: () => number, slot: ItemSlot): string {
  return pick(rng, NAMED_PREFIX) + pick(rng, SLOT_SUFFIX[slot])
}

// ---------- 机缘套装（程序生成） ----------

/** 当前程序随机套装落盘格式。旧记录没有该字段时按兼容路径保留。 */
/**
 * v3/generator-v2 is the only format emitted by new generation. v2 constants
 * and an explicit v2 generator remain for exact archival compatibility; loading
 * never re-rolls either version.
 */
export const DYNAMIC_SET_SCHEMA_VERSION = 3
export const DYNAMIC_SET_GENERATOR_VERSION = 2
export const DYNAMIC_SET_V2_SCHEMA_VERSION = 2
export const DYNAMIC_SET_V2_GENERATOR_VERSION = 1

export interface DynamicSetMoveSpec {
  id: string
  name: string
  mode?: DynamicAttackMode
  behavior?: string
}

export interface DynamicSetArtSpec {
  id: string
  name: string
  mode?: ArtMode
  behavior?: string
}

/** 生成审计元数据；最终的 set/bases 才是存档权威副本，seed 绝不用于读档重掷。 */
export interface DynamicSetGenerationIdentity {
  /** A complete generated identity is persisted for audit and source traceability. */
  setId: string
  profileId: string
  transformId: string
}

export interface DynamicSetGenerationV2 {
  generatorVersion: 1
  seed: number
  sequence: number
  theme: string
  profileId: string
  move: DynamicSetMoveSpec
  art: DynamicSetArtSpec
  vfxRecipe?: ProceduralVfxRecipe
}

export interface DynamicSetGenerationV3 {
  generatorVersion: 2
  seed: number
  sequence: number
  theme: string
  profileId: string
  move: DynamicSetMoveSpec
  art: DynamicSetArtSpec
  vfxRecipe?: ProceduralVfxRecipe
  identity: DynamicSetGenerationIdentity
  /** null is intentional for profiles that have no approved controlled linkage. */
  hitLinkage: ControlledHitLinkage | null
}

export type DynamicSetGeneration = DynamicSetGenerationV2 | DynamicSetGenerationV3

export interface DynamicSetRecord {
  schemaVersion?: number
  generation?: DynamicSetGeneration
  set: SetDef
  bases: ItemBase[]
}

/** v3 linkage selection is closed, reproducible, and intentionally excludes 大庚剑阵. */
function controlledHitLinkageForProfile(profile: DynamicSetCombatProfile): ControlledHitLinkage | null {
  if (!profile.attackMode || profile.normalPrimitive) return null
  if (profile.artMode === 'dageng' || profile.artPrimitive) return null
  const recipeId: ControlledHitLinkageRecipeId | null = profile.attackMode === 'flying_sword_burst'
    ? 'flying_sword_first_hit_split'
    : profile.attackMode === 'giant_sword'
      ? 'giant_sword_first_hit_fire_bolt'
      : null
  return recipeId ? controlledHitLinkageById(recipeId) : null
}

const SET_PIECE_SLOTS: ItemSlot[] = ['weapon', 'head', 'armor', 'boots']
const SET_PIECE_SUFFIX: Record<ItemSlot, string[]> = {
  weapon: ['剑', '刃', '环', '印'],
  head: ['冠', '簪', '巾'],
  armor: ['袍', '甲', '衣'],
  boots: ['靴', '履', '翅'],
  charm: ['佩'],
}

/** 套装阶梯修饰候选（min, max） */
const SET_MOD_POOL: Array<[ModKey, number, number]> = [
  ['atkPct', 0.10, 0.18], ['defPct', 0.12, 0.20], ['hpPct', 0.10, 0.18],
  ['crit', 0.03, 0.06], ['aspd', 0.05, 0.10], ['skillPct', 0.10, 0.18],
  ['lifesteal', 0.03, 0.06], ['speed', 6, 12], ['cdPct', 0.06, 0.12],
]

function rollSetMods(rng: () => number, count: number, scale: number): Partial<Mods> {
  const pool = [...SET_MOD_POOL]
  const out: Partial<Mods> = {}
  for (let i = 0; i < count && pool.length > 0; i++) {
    const [key, lo, hi] = pool.splice(ri(rng, 0, pool.length - 1), 1)[0]
    const v = (lo + rng() * (hi - lo)) * scale
    ;(out as Record<string, number>)[key] = key === 'speed' ? Math.round(v) : round3(v)
  }
  return out
}

function modsDesc(mods: Partial<Mods>): string {
  return (Object.entries(mods) as Array<[ModKey, number]>).map(([k, v]) => MOD_LABELS[k](v)).join('，')
}

const MOVE_LEADS: Record<DynamicAttackMode, readonly string[]> = {
  melee_arc: ['金风', '回环', '横扫', '裂空', '连斩'],
  whirlwind: ['旋风', '裂血', '狂斩', '席卷', '回旋'],
  flying_sword: ['流光', '飞虹', '穿云', '逐月', '鸣霄'],
  flying_sword_burst: ['流云', '穿空', '碎星', '逐月', '鸣霄'],
  magic_bolt: ['灵丹', '法弹', '玄光', '凝元', '弹雨'],
  frost_nova: ['寒晶', '冰环', '霜华', '玄潮', '冻尘'],
  frost_nova_burst: ['寒魄', '凝霜', '镜华', '玄潮', '碎月'],
  thunder_chain: ['惊鸿', '引霆', '裂空', '紫电', '震岳'],
  sword_array: ['万剑', '归宗', '天罡', '阵启', '剑临'],
  giant_sword: ['开山', '断岳', '横天', '镇河', '破云'],
  slash_pierce: ['破空', '穿云', '裂空', '贯虹', '截岳'],
  bolt_fire: ['焚阳', '烈焰', '赤弹', '炎珠', '离火'],
  slash_heavy: ['沉岳', '崩山', '重岳', '断岳', '镇峰'],
  bolt_needle: ['透骨', '穿心', '织星', '锋针', '寒芒'],
  slash_ice: ['霜刃', '冰裂', '寒锋', '凝霜', '雪断'],
  bolt_dart: ['飞影', '追魂', '穿心', '无影', '织星'],
  thunder_net: ['雷网', '电织', '霆缚', '紫络', '惊雷'],
  flying_sword_split: ['裂空', '分光', '穿虹', '碎星', '飞翎'],
  flame_slash: ['焚岳', '烈崩', '赤裂', '焰斩', '灼峰'],
  shadow_blade: ['暗影', '幽冥', '夜阑', '噬暗', '影裂'],
  spirit_chain: ['灵锁', '玄链', '缚魂', '锁灵', '穿链'],
  wind_slash: ['疾风', '青风', '朔风', '风翔', '飔斩'],
  stone_spike: ['地裂', '岩刺', '石穿', '岳突', '崩岩'],
  blood_scythe: ['血月', '赤镰', '血噬', '猩刃', '血锋'],
  star_barrage: ['星雨', '银芒', '飞星', '星落', '辰光'],
  venom_claw: ['毒爪', '蛇牙', '蝎钩', '毒裂', '瘴痕'],
  light_beam: ['圣光', '金辉', '天光', '皓辉', '明柱'],
  soul_flame: ['幽火', '魂焰', '鬼烧', '冥焰', '魄燃'],
  crystal_shard: ['晶碎', '霜晶', '蓝芒', '冰裂', '晶锋'],
}
const MOVE_TAILS: Record<DynamicAttackMode, readonly string[]> = {
  melee_arc: ['斩', '弧', '刃'],
  whirlwind: ['斩', '旋', '舞'],
  flying_sword: ['剑诀', '剑式', '剑歌'],
  flying_sword_burst: ['剑诀', '剑式', '剑歌'],
  magic_bolt: ['弹', '珠', '丸'],
  frost_nova: ['环', '印', '轮'],
  frost_nova_burst: ['寒环', '霜印', '冰轮'],
  thunder_chain: ['雷引', '雷链', '霆诀'],
  sword_array: ['阵', '环', '临'],
  giant_sword: ['剑罡', '剑印', '剑势'],
  slash_pierce: ['剑气', '剑罡', '剑势'],
  bolt_fire: ['焰弹', '火珠', '炎丸'],
  slash_heavy: ['重斩', '崩斩', '碎岳'],
  bolt_needle: ['针', '芒', '刺'],
  slash_ice: ['冰斩', '霜刃', '雪斩'],
  bolt_dart: ['镖', '针', '刺'],
  thunder_net: ['雷网', '电缚', '霆笼'],
  flying_sword_split: ['剑诀', '剑裂', '剑分'],
  flame_slash: ['焰斩', '焚斩', '灼裂'],
  shadow_blade: ['刃斩', '影斩', '刃裂'],
  spirit_chain: ['锁链', '链缚', '链穿'],
  wind_slash: ['风刃', '风斩', '飔裂'],
  stone_spike: ['地刺', '岩突', '石穿'],
  blood_scythe: ['镰斩', '血刃', '血镰'],
  star_barrage: ['星弩', '芒雨', '星射'],
  venom_claw: ['爪裂', '毒爪', '爪痕'],
  light_beam: ['光柱', '辉束', '光束'],
  soul_flame: ['魂弹', '焰弹', '魂烧'],
  crystal_shard: ['晶刃', '碎锋', '晶裂'],
}
const ART_LEADS: Record<ArtMode, readonly string[]> = {
  sword_fan: ['万象', '归元', '凌虚', '浩然', '天罡', '清光', '玉衡', '青冥', '流云', '太一'],
  fire_rain: ['焚星', '赤曜', '燎原', '离火', '炎陨', '业火', '丹朱', '阳燧', '烬燃', '凰焰'],
  thunder_strike: ['九霄', '惊雷', '天衡', '玄霆', '紫府', '钧天', '风雷', '神霄', '辟邪', '玉辰'],
  dageng: ['庚金', '天衍', '太微', '镇界', '玄枢', '六仪', '九宫', '天璇', '玉清', '紫微'],
  sword_storm: ['千剑', '万刃', '天罡', '星流', '凌云', '归宗', '浩天', '穹光', '无极', '玄锋'],
  fire_phoenix: ['浴火', '凰焰', '涅槃', '朱雀', '离魂', '炎帝', '丹凰', '赤灵', '焚羽', '火羽'],
  mountain_seal: ['五岳', '镇天', '玄印', '厚土', '地藏', '须弥', '天擎', '坤镇', '岳镇', '封疆'],
  shadow_swarm: ['百魅', '夜行', '幽冥', '暗影', '万幻', '魔相', '鬼影', '虚冥', '噬影', '暗域'],
  ice_thunder: ['冰雷', '霜霆', '寒霄', '玄冰', '冻雷', '雪霆', '寒电', '冰陨', '霜电', '寒劫'],
  thunder_prison: ['万雷', '天牢', '九霄', '雷狱', '霆罚', '紫府', '钧天', '神霄', '灭世', '天囚'],
  meteor_storm: ['陨石', '天降', '星落', '焰陨', '火雨', '流星', '天裂', '陨焰', '星焚', '天陨'],
  void_rift: ['虚空', '裂隙', '暗紫', '虚空裂', '冥裂', '吞噬', '深渊', '裂空', '虚冥', '空裂'],
  blood_domain: ['血域', '猩红', '赤血', '血祭', '噬血', '血海', '血纹', '绛域', '血蚀', '赤域'],
  light_pillar: ['圣光', '金柱', '天光', '审判', '皓辉', '神裁', '光罚', '天柱', '明罚', '净世'],
  frozen_domain: ['冰封', '寒域', '冻结', '霜寒', '玄冰', '冰域', '寒冰', '冻土', '冰封域', '霜域'],
  spirit_vortex: ['元神', '旋涡', '灵旋', '灵涡', '魂旋', '紫旋', '灵引', '魂涡', '旋灵', '灵引涡'],
  blade_orbit: ['剑环', '飞剑', '环舞', '剑旋', '钢蓝', '刃环', '飞刃', '剑绕', '旋剑', '环剑'],
  poison_cloud: ['万毒', '瘴气', '毒雾', '绿瘴', '毒云', '瘴云', '蚀雾', '毒域', '瘴域', '蚀域'],
  gravity_crush: ['重力', '深渊', '引力', '暗紫', '重渊', '碾压', '碎渊', '重压', '渊噬', '引渊'],
  phoenix_rebirth: ['凤凰', '涅槃', '火凤', '凰焰', '重生', '朱凰', '赤凤', '烈焰', '凰舞', '凤燃'],
}
const ART_TAILS: Record<ArtMode, readonly string[]> = {
  sword_fan: ['剑河', '天瀑', '剑域', '剑幕', '星河', '寒渊', '万剑', '长空'],
  fire_rain: ['天雨', '星坠', '炎界', '焚天', '烬域', '赤地', '火狱', '流星'],
  thunder_strike: ['诛邪', '雷狱', '天罚', '霆威', '惊蛰', '灭世', '雷域', '万钧'],
  dageng: ['剑阵', '金阙', '天罗', '剑网', '仙牢', '地网', '封元', '锁天'],
  sword_storm: ['归宗', '齐发', '天瀑', '剑雨', '剑幕', '剑域', '漫天', '长空'],
  fire_phoenix: ['重生', '涅槃', '焚天', '凰舞', '炎界', '火域', '展翅', '凰鸣'],
  mountain_seal: ['镇域', '镇天', '封疆', '压顶', '玄印', '地网', '岳镇', '天擎'],
  shadow_swarm: ['夜行', '噬魂', '暗潮', '鬼域', '幻影', '冥河', '吞噬', '暗幕'],
  ice_thunder: ['双生', '天劫', '冰域', '雷罚', '霜霆', '寒劫', '冻灭', '冰碎'],
  thunder_prison: ['天牢', '雷狱', '霆罚', '天囚', '雷笼', '灭世', '囚天', '锁雷'],
  meteor_storm: ['天降', '坠落', '爆裂', '焚天', '天陨', '陨焚', '星碎', '焰狱'],
  void_rift: ['裂隙', '吞噬', '绽开', '深渊', '裂空', '冥裂', '空碎', '虚域'],
  blood_domain: ['降临', '铺开', '侵蚀', '血海', '祭域', '赤域', '血纹', '血狱'],
  light_pillar: ['天柱', '审判', '降世', '净世', '金辉', '天罚', '光裁', '明域'],
  frozen_domain: ['领域', '冰封', '冻结', '冰域', '霜寒', '寒域', '冻域', '冰狱'],
  spirit_vortex: ['旋涡', '吞噬', '卷入', '灵涡', '风暴', '灵旋', '魂涡', '旋灵'],
  blade_orbit: ['环舞', '环绕', '绞杀', '剑环', '旋剑', '飞剑', '环剑', '刃旋'],
  poison_cloud: ['瘴气', '弥漫', '中毒', '毒雾', '瘴域', '蚀域', '毒域', '瘴狱'],
  gravity_crush: ['深渊', '粉碎', '碾压', '重压', '引渊', '碎渊', '渊噬', '重域'],
  phoenix_rebirth: ['涅槃', '重生', '展翅', '爆发', '凰舞', '焚天', '凤燃', '烈焰'],
}

function inventMoveName(rng: () => number, theme: string, mode: DynamicAttackMode): string {
  return `${theme}·${pick(rng, [...MOVE_LEADS[mode]])}${pick(rng, [...MOVE_TAILS[mode]])}`
}

function inventArtName(rng: () => number, theme: string, mode: ArtMode): string {
  return `${theme}·${pick(rng, [...ART_LEADS[mode]])}${pick(rng, [...ART_TAILS[mode]])}`
}

/** 稳定地从任意数值种子创建本地 PRNG；避免 0、NaN 或负数造成隐式随机。 */
export function seededRng(seed: number): () => number {
  let a = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Internal deterministic materializer used by every schema-v3 generation entry. */
function generateDynamicSetV3(
  rng: () => number,
  seq: number,
  existing: DynamicSetRecord[],
  resolvedSeed: number,
): DynamicSetRecord {
  const normalizedSeq = Math.max(1, Math.trunc(seq) || 1)
  const used = new Set(existing.map((r) => r.set.name.replace(/套$/, '')))
  const free = DYNAMIC_SET_THEMES.filter((t) => !used.has(t))
  // 未用主题耗尽后仍从完整目录选取，名称加序号保证套装名可区分。
  const availableThemes: readonly string[] = free.length > 0 ? free : DYNAMIC_SET_THEMES
  const profile = chooseDynamicSetCombatProfile(rng, availableThemes)
  const compatibleThemes = profile.themes.filter((theme) => availableThemes.includes(theme))
  const theme = pick(rng, [...compatibleThemes]) + (free.length > 0 ? '' : normalizedSeq)
  const setId = `set_dy${normalizedSeq}`
  const moveName = profile.attackMode
    ? inventMoveName(rng, theme, profile.attackMode)
    : (profile.attackName ?? '')
  const artName = profile.artMode
    ? inventArtName(rng, theme, profile.artMode)
    : (profile.artName ?? '')
  const move: DynamicSetMoveSpec = {
    id: `${setId}_move`, name: moveName, ...(profile.attackMode ? { mode: profile.attackMode } : {}), ...(profile.attackBehavior ? { behavior: profile.attackBehavior } : {}),
  }
  const art: DynamicSetArtSpec = {
    id: `${setId}_art`, name: artName, ...(profile.artMode ? { mode: profile.artMode } : {}), ...(profile.artBehavior ? { behavior: profile.artBehavior } : {}),
  }
  const tier = 1 + Math.min(0.5, seq * 0.06) // 越往后生成的套装基座越强
  const bases: ItemBase[] = SET_PIECE_SLOTS.map((slot) => {
    const id = `${slot[0]}_dy${seq}`
    const name = theme + pick(rng, SET_PIECE_SUFFIX[slot])
    const base: ItemBase = { id, name, slot, set: setId }
    if (slot === 'weapon') { base.atk = ri(rng, 19, 25); if (rng() < 0.6) base.crit = round3(0.03 + rng() * 0.03) }
    if (slot === 'head') { base.def = ri(rng, 5, 7); base.maxHp = ri(rng, 22, 34); if (rng() < 0.5) base.crit = 0.02 }
    if (slot === 'armor') { base.def = ri(rng, 11, 14); base.maxHp = ri(rng, 20, 32); if (rng() < 0.4) base.speed = ri(rng, 3, 5) }
    if (slot === 'boots') { base.speed = ri(rng, 12, 17); base.def = ri(rng, 3, 5) }
    if (base.atk) base.atk = Math.round(base.atk * tier)
    if (base.def) base.def = Math.round(base.def * tier)
    if (base.maxHp) base.maxHp = Math.round(base.maxHp * tier)
    if (base.speed) base.speed = Math.round(base.speed * tier)
    return base
  })
  const m2 = rollSetMods(rng, ri(rng, 1, 2), 1)
  const m4 = rollSetMods(rng, 2, 1.8)
  const hasAbility = !!(profile.attackMode || profile.artMode || profile.normalPrimitive || profile.artPrimitive)
  const transformId = hasAbility ? `${profile.id}-${seq}` : undefined
  const hitLinkage = controlledHitLinkageForProfile(profile)
  const set: SetDef = {
    id: setId,
    name: `${theme}套`,
    pieces: bases.map((b) => b.id),
    bonuses: [
      { count: 2, mods: m2, desc: `2件：${modsDesc(m2)}` },
      {
        count: 4,
        mods: m4,
        ...(transformId ? { transformId } : {}),
        ...(profile.attackMode ? { attackMode: profile.attackMode } : {}),
        ...(profile.artMode ? { artMode: profile.artMode } : {}),
        ...(profile.normalPrimitive ? { normalPrimitive: profile.normalPrimitive } : {}),
        ...(profile.artPrimitive ? { artPrimitive: profile.artPrimitive } : {}),
        ...(move.name ? { attackName: move.name } : {}),
        ...(art.name ? { artName: art.name } : {}),
        ...(profile.vfxRecipe ? { vfxRecipe: profile.vfxRecipe } : {}),
        ...(hitLinkage ? { hitLinkage } : {}),
        ...(profile.artPower != null ? { artPower: profile.artPower } : {}),
        ...(profile.artCooldownMs != null ? { artCooldownMs: profile.artCooldownMs } : {}),
        fxTags: ['procedural_vfx'],
        desc: formatDynamicSetBonusDesc(m4, { ...profile, ...(move.name ? { attackName: move.name } : {}), ...(art.name ? { artName: art.name } : {}) }, hitLinkage),
      },
    ],
  }
  return {
    schemaVersion: DYNAMIC_SET_SCHEMA_VERSION,
    generation: {
      generatorVersion: DYNAMIC_SET_GENERATOR_VERSION,
      seed: resolvedSeed,
      sequence: normalizedSeq,
      theme,
      profileId: profile.id,
      move,
      art,
      ...(profile.vfxRecipe ? { vfxRecipe: profile.vfxRecipe } : {}),
      identity: { setId, profileId: profile.id, transformId: transformId ?? 'none' },
      hitLinkage,
    },
    set,
    bases,
  }
}

/**
 * Exact archival v2 generator. It deliberately materialises the previous
 * schema/generator fields and omits v3 linkage metadata; callers use it only
 * for compatibility fixtures and never to replace already persisted v2 data.
 */
export function genDynamicSetV2FromSeed(seed: number, seq: number, existing: DynamicSetRecord[]): DynamicSetRecord {
  const v3 = genDynamicSetFromSeed(seed, seq, existing)
  const set = JSON.parse(JSON.stringify(v3.set)) as SetDef
  const transform = set.bonuses.find((bonus) => bonus.count === 4)
  if (transform) {
    delete transform.hitLinkage
    const generation = v3.generation!
    transform.desc = formatDynamicSetBonusDesc(
      transform.mods ?? {},
      { attackName: generation.move.name, attackBehavior: generation.move.behavior, artName: generation.art.name, artBehavior: generation.art.behavior },
    )
  }
  const generation = v3.generation!
  return {
    schemaVersion: DYNAMIC_SET_V2_SCHEMA_VERSION,
    generation: {
      generatorVersion: DYNAMIC_SET_V2_GENERATOR_VERSION,
      seed: generation.seed,
      sequence: generation.sequence,
      theme: generation.theme,
      profileId: generation.profileId,
      move: { ...generation.move },
      art: { ...generation.art },
      vfxRecipe: generation.vfxRecipe,
    },
    set,
    bases: JSON.parse(JSON.stringify(v3.bases)) as ItemBase[],
  }
}

/**
 * The only public dynamic-set creation entry: explicit seed gives each new v3
 * record a reproducible generation identity for production, GM tools and tests.
 */
export function genDynamicSetFromSeed(seed: number, seq: number, existing: DynamicSetRecord[]): DynamicSetRecord {
  const resolvedSeed = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0
  return generateDynamicSetV3(seededRng(resolvedSeed), seq, existing, resolvedSeed)
}

/**
 * Compatibility wrapper for callers that still provide an RNG. It derives one
 * explicit seed and delegates to the v3 creation entry, so the persisted seed
 * itself always replays the exact generated record.
 */
export function genDynamicSet(rng: () => number, seq: number, existing: DynamicSetRecord[]): DynamicSetRecord {
  return genDynamicSetFromSeed(Math.floor(rng() * 0x100000000) >>> 0, seq, existing)
}

/**
 * 生成新的动态套装时避免复用目录中的 sequence/id。
 * 这既保护正常掉落，也让用户导入含稀疏编号的旧档时继续生成而不覆盖内容。
 */
export function nextDynamicSetSequence(existing: readonly DynamicSetRecord[]): number {
  const taken = new Set<number>()
  for (const rec of existing) {
    const match = /^set_dy(\d+)$/.exec(rec.set?.id ?? '')
    if (match) taken.add(Number(match[1]))
  }
  let sequence = 1
  while (taken.has(sequence)) sequence++
  return sequence
}

// ---------- 无名古卷（程序生成心法） ----------

const MIND_MOD_POOL: Array<[ModKey, number, number]> = [
  ['atkPct', 0.08, 0.16], ['defPct', 0.10, 0.20], ['hpPct', 0.08, 0.16],
  ['crit', 0.03, 0.07], ['aspd', 0.04, 0.09], ['skillPct', 0.08, 0.16],
  ['cdPct', 0.06, 0.14], ['lifesteal', 0.02, 0.05], ['speed', 4, 10],
]

/** 生成一部无名古卷心法（纯数值，通用心法） */
export function genDynamicSkill(rng: () => number, seq: number): SkillDef {
  const name = pick(rng, SKILL_PREFIX) + pick(rng, SKILL_SUFFIX)
  const pool = [...MIND_MOD_POOL]
  const mods: Partial<Mods> = {}
  const n = ri(rng, 1, 2)
  for (let i = 0; i < n && pool.length > 0; i++) {
    const [key, lo, hi] = pool.splice(ri(rng, 0, pool.length - 1), 1)[0]
    const v = lo + rng() * (hi - lo)
    ;(mods as Record<string, number>)[key] = key === 'speed' ? Math.round(v) : round3(v)
  }
  return {
    id: `sk_dy${seq}`,
    name: SKILLS.has(`sk_dy${seq}`) ? `${name}·${seq}` : name,
    type: 'mind',
    class: 'any',
    mods,
    desc: `无名古卷所录心法：${modsDesc(mods)}。`,
  }
}

// ---------- 运行时注册（读档后把存档中的动态内容注入配置表） ----------

const RUNTIME_ATTACK_MODES = new Set<AttackMode>([
  'melee_arc', 'whirlwind', 'flying_sword', 'flying_sword_burst', 'magic_bolt',
  'frost_nova', 'frost_nova_burst', 'thunder_chain', 'sword_array', 'giant_sword',
  'slash_pierce', 'bolt_fire', 'slash_heavy', 'bolt_needle', 'slash_ice',
  'bolt_dart', 'thunder_net', 'flying_sword_split', 'flame_slash',
  'shadow_blade', 'spirit_chain', 'wind_slash', 'stone_spike',
  'blood_scythe', 'star_barrage', 'venom_claw', 'light_beam',
  'soul_flame', 'crystal_shard',
])
const RUNTIME_ART_MODES = new Set<ArtMode>([
  'sword_fan', 'fire_rain', 'thunder_strike', 'dageng',
  'sword_storm', 'fire_phoenix', 'mountain_seal', 'shadow_swarm',
  'ice_thunder', 'thunder_prison',
  'meteor_storm', 'void_rift', 'blood_domain', 'light_pillar',
  'frozen_domain', 'spirit_vortex', 'blade_orbit', 'poison_cloud',
  'gravity_crush', 'phoenix_rebirth',
])
const DYNAMIC_ID = /^set_dy[\w-]+$/
const DYNAMIC_BASE_ID = /^[whab]_dy[\w-]+$/
const VALID_SLOTS = new Set<ItemSlot>(['weapon', 'head', 'armor', 'boots', 'charm'])
const CURRENT_DYNAMIC_SET_SLOTS: readonly ItemSlot[] = ['weapon', 'head', 'armor', 'boots']

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

const PRESENTATION_BONUS_FIELDS = [
  'attackMode', 'artMode', 'transformId', 'attackName', 'artName', 'vfxRecipe', 'hitLinkage', 'fxTags', 'artPower', 'artCooldownMs',
  'normalPrimitive', 'artPrimitive',
] as const

function hasPresentationBonusFields(value: Record<string, unknown>): boolean {
  return PRESENTATION_BONUS_FIELDS.some((field) => value[field] !== undefined)
}

function isValidMods(value: unknown): value is Partial<Mods> {
  return isPlainRecord(value) && Object.entries(value).every(([key, rawValue]) =>
    Object.prototype.hasOwnProperty.call(MOD_LABELS, key) && isFiniteNumber(rawValue))
}

function isKnownSetEffectTag(value: unknown): value is SetEffectTag {
  return value === 'sword_split' || value === 'fire_burst' || value === 'delayed_burst' || value === 'array_mine'
    || value === 'procedural_vfx' || value === 'test_sword_visual' || value === 'test_frost_visual'
    || value === 'test_thunder_visual' || value === 'test_giant_visual'
}

/**
 * Legacy records retain their declared compatible fields without rerolling, but
 * hostile numeric/mod payloads reject the whole record. Unknown visual tags are
 * deliberately dropped: they have no runtime ownership and cannot activate a
 * future effect after an upgrade.
 */
function sanitizeLegacyBonus(value: unknown): SetBonus | null {
  if (!isValidDynamicBonus(value)) return null
  const raw = value as Record<string, unknown>
  const tags = Array.isArray(raw.fxTags) ? raw.fxTags.filter(isKnownSetEffectTag) : undefined
  const { fxTags: _ignoredFxTags, ...rest } = raw
  return {
    ...(rest as unknown as SetBonus),
    ...(raw.mods !== undefined ? { mods: raw.mods as Partial<Mods> } : {}),
    ...(tags && tags.length > 0 ? { fxTags: tags } : {}),
  }
}

function isValidDynamicBonus(value: unknown): boolean {
  if (!isPlainRecord(value) || !isFiniteNumber(value.count) || !Number.isInteger(value.count) || value.count <= 0 || typeof value.desc !== 'string' || !value.desc.trim()) return false
  // Keep untrusted legacy/current records aligned with runtime and static-data gates: 2-piece is numeric-only;
  // presentation fields may occur only on independently qualified 4- or 6-piece rows.
  if (hasPresentationBonusFields(value) && value.count !== 4 && value.count !== 6) return false
  if (value.mods !== undefined && !isValidMods(value.mods)) return false
  if (value.attackMode !== undefined && (!RUNTIME_ATTACK_MODES.has(value.attackMode as AttackMode))) return false
  if (value.artMode !== undefined && (!RUNTIME_ART_MODES.has(value.artMode as ArtMode))) return false
  if (value.vfxRecipe !== undefined && !isProceduralVfxRecipe(value.vfxRecipe)) return false
  if (value.vfxRecipe !== undefined
    && !isProceduralVfxCompatibleForPhase(value.vfxRecipe, 'attack', value.attackMode)
    && !isProceduralVfxCompatibleForPhase(value.vfxRecipe, 'art', value.artMode)) return false
  if (value.hitLinkage !== undefined && !isControlledHitLinkageAttackCompatible(value.hitLinkage, value.attackMode)) return false
  if (value.fxTags !== undefined && !Array.isArray(value.fxTags)) return false
  if (value.artPower !== undefined && (!isFiniteNumber(value.artPower) || value.artPower <= 0)) return false
  if (value.artCooldownMs !== undefined && (!isFiniteNumber(value.artCooldownMs) || value.artCooldownMs <= 0)) return false
  return true
}

/** schema v2 的词条只能来自既有生成池的对应轮次范围，避免存档直接注入任意属性。 */
function isGeneratedMods(value: unknown, minCount: number, maxCount: number, scale: number): value is Partial<Mods> {
  if (!isPlainRecord(value)) return false
  const entries = Object.entries(value)
  if (entries.length < minCount || entries.length > maxCount || new Set(entries.map(([key]) => key)).size !== entries.length) return false
  return entries.every(([key, rawValue]) => {
    if (!Object.prototype.hasOwnProperty.call(MOD_LABELS, key) || !isFiniteNumber(rawValue)) return false
    const pool = SET_MOD_POOL.find(([candidate]) => candidate === key)
    if (!pool) return false
    const [, min, max] = pool
    if (key === 'speed') {
      return Number.isInteger(rawValue)
        && rawValue >= Math.round(min * scale)
        && rawValue <= Math.round(max * scale)
    }
    return rawValue === round3(rawValue)
      && rawValue >= round3(min * scale)
      && rawValue <= round3(max * scale)
  })
}

function isGeneratedMoveName(value: unknown, theme: string, mode: DynamicAttackMode): value is string {
  if (typeof value !== 'string' || !value.startsWith(`${theme}·`)) return false
  const suffix = value.slice(theme.length + 1)
  return MOVE_LEADS[mode].some((lead) => MOVE_TAILS[mode].some((tail) => suffix === `${lead}${tail}`))
}

function isGeneratedArtName(value: unknown, theme: string, mode: ArtMode): value is string {
  if (typeof value !== 'string' || !value.startsWith(`${theme}·`)) return false
  const suffix = value.slice(theme.length + 1)
  return ART_LEADS[mode].some((lead) => ART_TAILS[mode].some((tail) => suffix === `${lead}${tail}`))
}

type GeneratedBaseStatKey = 'atk' | 'def' | 'speed' | 'crit' | 'maxHp'
const GENERATED_BASE_STAT_KEYS: readonly GeneratedBaseStatKey[] = ['atk', 'def', 'speed', 'crit', 'maxHp']

function hasOnlyGeneratedBaseStats(base: ItemBase, allowed: readonly GeneratedBaseStatKey[]): boolean {
  return GENERATED_BASE_STAT_KEYS.every((key) => allowed.includes(key) || base[key] === undefined)
}

function isRoundedBaseValue(value: unknown, min: number, max: number, tier: number): value is number {
  return isFiniteNumber(value)
    && Number.isInteger(value)
    && value >= Math.round(min * tier)
    && value <= Math.round(max * tier)
}

function isGeneratedCurrentBase(base: ItemBase, theme: string, sequence: number, slot: ItemSlot): boolean {
  if (base.slot !== slot || base.id !== `${slot[0]}_dy${sequence}` || !base.name.startsWith(theme)) return false
  if (!SET_PIECE_SUFFIX[slot].includes(base.name.slice(theme.length))) return false
  const tier = 1 + Math.min(0.5, sequence * 0.06)
  switch (slot) {
    case 'weapon':
      return hasOnlyGeneratedBaseStats(base, ['atk', 'crit'])
        && isRoundedBaseValue(base.atk, 19, 25, tier)
        && (base.crit === undefined || (isFiniteNumber(base.crit) && base.crit === round3(base.crit) && base.crit >= 0.03 && base.crit <= 0.06))
    case 'head':
      return hasOnlyGeneratedBaseStats(base, ['def', 'maxHp', 'crit'])
        && isRoundedBaseValue(base.def, 5, 7, tier)
        && isRoundedBaseValue(base.maxHp, 22, 34, tier)
        && (base.crit === undefined || base.crit === 0.02)
    case 'armor':
      return hasOnlyGeneratedBaseStats(base, ['def', 'maxHp', 'speed'])
        && isRoundedBaseValue(base.def, 11, 14, tier)
        && isRoundedBaseValue(base.maxHp, 20, 32, tier)
        && (base.speed === undefined || isRoundedBaseValue(base.speed, 3, 5, tier))
    case 'boots':
      return hasOnlyGeneratedBaseStats(base, ['def', 'speed'])
        && isRoundedBaseValue(base.def, 3, 5, tier)
        && isRoundedBaseValue(base.speed, 12, 17, tier)
    default:
      return false
  }
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && keys.every((key) => expected.includes(key))
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function isCurrentThemeForProfile(theme: string, sequence: number, profile: DynamicSetCombatProfile): boolean {
  return profile.themes.some((baseTheme) => theme === baseTheme || theme === `${baseTheme}${sequence}`)
}

interface GeneratedRecordContext {
  readonly generation: Record<string, unknown> & {
    readonly move: DynamicSetMoveSpec
    readonly art: DynamicSetArtSpec
    readonly vfxRecipe: ProceduralVfxRecipe
    readonly profileId: string
  }
  readonly sequence: number
  readonly theme: string
  readonly expectedSetId: string
  readonly profile: DynamicSetCombatProfile
}

function resolveGeneratedRecordContext(
  raw: Record<string, unknown>,
  set: Record<string, unknown>,
): GeneratedRecordContext | null {
  if (!hasExactKeys(raw, ['schemaVersion', 'generation', 'set', 'bases'])
    || !hasExactKeys(set, ['id', 'name', 'pieces', 'bonuses'])
    || !isPlainRecord(raw.generation)) return null

  const generation = raw.generation
  const sequence = generation.sequence
  const theme = generation.theme
  const expectedSetId = isFiniteNumber(sequence) && Number.isInteger(sequence) && sequence > 0 ? `set_dy${sequence}` : ''
  if (!isFiniteNumber(generation.seed)
    || !Number.isInteger(generation.seed)
    || generation.seed < 0
    || generation.seed > 0xffffffff
    || !isFiniteNumber(sequence)
    || !Number.isInteger(sequence)
    || sequence <= 0
    || typeof theme !== 'string'
    || !theme.trim()
    || typeof generation.profileId !== 'string'
    || !generation.profileId
    || set.id !== expectedSetId
    || set.name !== `${theme}套`
    || !isPlainRecord(generation.move)
    || !isPlainRecord(generation.art)
    || !hasOnlyKeys(generation.move, ['id', 'name', 'mode', 'behavior'])
    || !hasOnlyKeys(generation.art, ['id', 'name', 'mode', 'behavior'])
    || (generation.vfxRecipe !== undefined && !isProceduralVfxRecipe(generation.vfxRecipe))
  ) return null

  const profile = DYNAMIC_SET_COMBAT_PROFILES.find((candidate) => candidate.id === generation.profileId && candidate.enabled)
  if (!profile
    || !isCurrentThemeForProfile(theme, sequence, profile)
    || generation.vfxRecipe !== profile.vfxRecipe
    || generation.move.id !== `${expectedSetId}_move`
    || (profile.attackMode !== undefined && !isGeneratedMoveName(generation.move.name, theme, profile.attackMode))
    || generation.move.mode !== profile.attackMode
    || generation.move.behavior !== profile.attackBehavior
    || generation.art.id !== `${expectedSetId}_art`
    || (profile.artMode !== undefined && !isGeneratedArtName(generation.art.name, theme, profile.artMode))
    || generation.art.mode !== profile.artMode
    || generation.art.behavior !== profile.artBehavior
  ) return null

  return {
    generation: generation as GeneratedRecordContext['generation'],
    sequence,
    theme,
    expectedSetId,
    profile,
  }
}

function validateGeneratedBases(
  raw: Record<string, unknown>,
  pieces: readonly string[],
  bases: readonly ItemBase[],
  context: GeneratedRecordContext,
): boolean {
  const rawBases = raw.bases
  if (pieces.length !== CURRENT_DYNAMIC_SET_SLOTS.length
    || bases.length !== pieces.length
    || new Set(pieces).size !== pieces.length
    || new Set(bases.map((base) => base.id)).size !== bases.length
    || !Array.isArray(rawBases)) return false

  return CURRENT_DYNAMIC_SET_SLOTS.every((slot, index) => {
    const base = bases[index]
    const rawBase = rawBases[index]
    if (!base || !isPlainRecord(rawBase) || rawBase.set !== context.expectedSetId) return false
    const allowedKeys: readonly string[] = slot === 'weapon'
      ? ['id', 'name', 'slot', 'set', 'atk', 'crit']
      : slot === 'head'
        ? ['id', 'name', 'slot', 'set', 'def', 'maxHp', 'crit']
        : slot === 'armor'
          ? ['id', 'name', 'slot', 'set', 'def', 'maxHp', 'speed']
          : ['id', 'name', 'slot', 'set', 'def', 'speed']
    return hasOnlyKeys(rawBase, allowedKeys)
      && base.id === pieces[index]
      && isGeneratedCurrentBase(base, context.theme, context.sequence, slot)
  })
}

function hasExpectedGeneratedBonuses(
  bonuses: ReadonlyArray<SetDef['bonuses'][number]>,
  context: GeneratedRecordContext,
  linkage: ControlledHitLinkage | null,
  expectsLinkageField: boolean,
): boolean {
  const twoPiece = bonuses[0]
  const transform = bonuses[1]
  const profile = context.profile
  const hasAbility = !!(profile.attackMode || profile.artMode || profile.normalPrimitive || profile.artPrimitive)
  const expectedTransformKeys = [
    'count', 'mods', 'transformId', 'attackMode', 'artMode', 'attackName', 'artName', 'vfxRecipe',
    'normalPrimitive', 'artPrimitive',
    ...(expectsLinkageField && linkage !== null ? ['hitLinkage'] : []),
    'fxTags', 'artPower', 'artCooldownMs', 'desc',
  ]
  if (!twoPiece || !transform
    || bonuses.length !== 2
    || !isPlainRecord(twoPiece)
    || !isPlainRecord(transform)
    || !hasExactKeys(twoPiece, ['count', 'mods', 'desc'])
    || !hasOnlyKeys(transform, expectedTransformKeys)
    || twoPiece.count !== 2
    || !isGeneratedMods(twoPiece.mods, 1, 2, 1)
    || twoPiece.desc !== `2件：${modsDesc(twoPiece.mods as Partial<Mods>)}`
    || transform.count !== 4
    || !isGeneratedMods(transform.mods, 2, 2, 1.8)
    || transform.transformId !== (hasAbility ? `${profile.id}-${context.sequence}` : undefined)
    || transform.attackMode !== profile.attackMode
    || transform.artMode !== profile.artMode
    || transform.normalPrimitive !== profile.normalPrimitive
    || transform.artPrimitive !== profile.artPrimitive
    || (transform.attackName ?? '') !== context.generation.move.name
    || (transform.artName ?? '') !== context.generation.art.name
    || transform.vfxRecipe !== profile.vfxRecipe
    || !Array.isArray(transform.fxTags)
    || transform.fxTags.length !== 1
    || transform.fxTags[0] !== 'procedural_vfx'
    || transform.artPower !== profile.artPower
    || transform.artCooldownMs !== profile.artCooldownMs
    || (profile.vfxRecipe !== undefined && !isProceduralVfxCompatible(transform.vfxRecipe, transform.attackMode, transform.artMode))
  ) return false

  if (!expectsLinkageField) return transform.hitLinkage === undefined
  if (linkage === null) return transform.hitLinkage === undefined
  return isControlledHitLinkageAttackCompatible(transform.hitLinkage, transform.attackMode)
    && transform.hitLinkage.recipeId === linkage.recipeId
    && JSON.stringify(transform.hitLinkage) === JSON.stringify(linkage)
}

/** Schema v2 remains frozen exactly as its original generator-v1 contract. */
function isValidV2DynamicSetRecord(
  raw: Record<string, unknown>,
  set: Record<string, unknown>,
  pieces: readonly string[],
  bases: readonly ItemBase[],
  bonuses: ReadonlyArray<SetDef['bonuses'][number]>,
): boolean {
  if (raw.schemaVersion !== DYNAMIC_SET_V2_SCHEMA_VERSION) return false
  const context = resolveGeneratedRecordContext(raw, set)
  if (!context) return false
  const generation = context.generation
  return hasOnlyKeys(generation, ['generatorVersion', 'seed', 'sequence', 'theme', 'profileId', 'move', 'art', 'vfxRecipe'])
    && generation.generatorVersion === DYNAMIC_SET_V2_GENERATOR_VERSION
    && hasExpectedGeneratedBonuses(bonuses, context, null, false)
    && validateGeneratedBases(raw, pieces, bases, context)
}

/** Schema v3 is strict: identity and linkage payloads must match the locked profile. */
function isValidV3DynamicSetRecord(
  raw: Record<string, unknown>,
  set: Record<string, unknown>,
  pieces: readonly string[],
  bases: readonly ItemBase[],
  bonuses: ReadonlyArray<SetDef['bonuses'][number]>,
): boolean {
  if (raw.schemaVersion !== DYNAMIC_SET_SCHEMA_VERSION) return false
  const context = resolveGeneratedRecordContext(raw, set)
  if (!context) return false
  const generation = context.generation
  const hasAbility = !!(context.profile.attackMode || context.profile.artMode || context.profile.normalPrimitive || context.profile.artPrimitive)
  if (!hasOnlyKeys(generation, ['generatorVersion', 'seed', 'sequence', 'theme', 'profileId', 'move', 'art', 'vfxRecipe', 'identity', 'hitLinkage'])
    || generation.generatorVersion !== DYNAMIC_SET_GENERATOR_VERSION
    || !isPlainRecord(generation.identity)
    || !hasExactKeys(generation.identity, ['setId', 'profileId', 'transformId'])
    || generation.identity.setId !== context.expectedSetId
    || generation.identity.profileId !== context.profile.id
    || generation.identity.transformId !== (hasAbility ? `${context.profile.id}-${context.sequence}` : 'none')
  ) return false

  const expectedLinkage = controlledHitLinkageForProfile(context.profile)
  if (expectedLinkage === null) {
    if (generation.hitLinkage !== null) return false
  } else if (!isControlledHitLinkageAttackCompatible(generation.hitLinkage, context.profile.attackMode)
    || generation.hitLinkage.recipeId !== expectedLinkage.recipeId) return false

  return hasExpectedGeneratedBonuses(bonuses, context, expectedLinkage, true)
    && validateGeneratedBases(raw, pieces, bases, context)
}

/**
 * 存档边界验证：仅无 schema 的历史记录可走兼容路径；schema v2 必须完整验证，
 * 任何其它显式 schema 都隔离，绝不以删字段方式降级为 legacy。
 */
export function normalizeDynamicSetRecords(input: unknown): DynamicSetRecord[] {
  if (!Array.isArray(input)) return []
  const accepted: DynamicSetRecord[] = []
  const seenSetIds = new Set<string>()
  const seenBaseIds = new Set<string>()
  for (const raw of input) {
    if (!isPlainRecord(raw) || !isPlainRecord(raw.set) || !Array.isArray(raw.bases)) continue
    const set = raw.set
    if (typeof set.id !== 'string' || !DYNAMIC_ID.test(set.id) || seenSetIds.has(set.id) || STATIC_SET_IDS.has(set.id)) continue
    if (typeof set.name !== 'string' || !set.name.trim() || !Array.isArray(set.pieces) || !Array.isArray(set.bonuses)) continue
    const pieces = set.pieces as unknown[]
    const bonusEntries = set.bonuses as unknown[]
    if (pieces.length === 0 || pieces.some((id) => typeof id !== 'string' || !DYNAMIC_BASE_ID.test(id))) continue
    const pieceIds = pieces as string[]
    if (new Set(pieces).size !== pieces.length || bonusEntries.some((bonus) => !isValidDynamicBonus(bonus))) continue
    const bases: ItemBase[] = []
    let invalidBase = false
    for (const rawBase of raw.bases) {
      if (!isPlainRecord(rawBase)
        || typeof rawBase.id !== 'string'
        || !DYNAMIC_BASE_ID.test(rawBase.id)
        || seenBaseIds.has(rawBase.id)
        || STATIC_BASE_IDS.has(rawBase.id)
        || typeof rawBase.name !== 'string'
        || !rawBase.name.trim()
        || !VALID_SLOTS.has(rawBase.slot as ItemSlot)
        || !['atk', 'def', 'speed', 'crit', 'maxHp'].every((key) => rawBase[key] === undefined || isFiniteNumber(rawBase[key]))
        || (rawBase.set !== undefined && rawBase.set !== set.id)) {
        invalidBase = true
        break
      }
      bases.push({
        id: rawBase.id,
        name: rawBase.name,
        slot: rawBase.slot as ItemSlot,
        set: set.id,
        ...(typeof rawBase.atk === 'number' ? { atk: rawBase.atk } : {}),
        ...(typeof rawBase.def === 'number' ? { def: rawBase.def } : {}),
        ...(typeof rawBase.speed === 'number' ? { speed: rawBase.speed } : {}),
        ...(typeof rawBase.crit === 'number' ? { crit: rawBase.crit } : {}),
        ...(typeof rawBase.maxHp === 'number' ? { maxHp: rawBase.maxHp } : {}),
      })
    }
    if (invalidBase || new Set(bases.map((base) => base.id)).size !== bases.length) continue
    if (bases.some((base) => !pieceIds.includes(base.id))) continue
    // Only records with a completely absent schemaVersion can take the legacy path.
    // Explicit undefined, damaged current records and unknown schemas are isolated.
    const isLegacy = !Object.prototype.hasOwnProperty.call(raw, 'schemaVersion')
    const sanitizedBonuses = isLegacy
      ? bonusEntries.map(sanitizeLegacyBonus)
      : bonusEntries as Array<SetDef['bonuses'][number]>
    if (sanitizedBonuses.some((bonus) => bonus === null)) continue
    const cleanSet: SetDef = {
      id: set.id,
      name: set.name,
      pieces: [...pieces] as string[],
      bonuses: sanitizedBonuses as SetDef['bonuses'],
    }
    const isV2 = raw.schemaVersion === DYNAMIC_SET_V2_SCHEMA_VERSION
    const isV3 = raw.schemaVersion === DYNAMIC_SET_SCHEMA_VERSION
    if (!isLegacy && !isV2 && !isV3) continue
    if (isV2 && !isValidV2DynamicSetRecord(raw, set, pieceIds, bases, cleanSet.bonuses)) continue
    if (isV3 && !isValidV3DynamicSetRecord(raw, set, pieceIds, bases, cleanSet.bonuses)) continue

    const rec: DynamicSetRecord = { set: cleanSet, bases }
    if (isV2 || isV3) {
      rec.schemaVersion = raw.schemaVersion as number
      rec.generation = raw.generation as DynamicSetGeneration
    }
    accepted.push(rec)
    seenSetIds.add(cleanSet.id)
    for (const base of bases) seenBaseIds.add(base.id)
  }
  return accepted
}

export function registerDynamicContent(sets: DynamicSetRecord[] | undefined, skills: SkillDef[] | undefined) {
  // 正常流程应已规范化；这里再次规范化以确保其它调用方不能绕过存档边界。
  for (const rec of normalizeDynamicSetRecords(sets ?? [])) {
    if (STATIC_SET_IDS.has(rec.set.id)) continue
    if (!SETS[rec.set.id]) SETS[rec.set.id] = rec.set
    for (const base of rec.bases) {
      if (STATIC_BASE_IDS.has(base.id)) continue
      if (!ITEM_BASE_MAP.has(base.id)) {
        ITEM_BASES.push(base)
        ITEM_BASE_MAP.set(base.id, base)
      }
    }
  }
  for (const sk of skills ?? []) {
    if (sk?.id && !SKILLS.has(sk.id)) SKILLS.set(sk.id, sk)
  }
}
