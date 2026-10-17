// ---------- 秘境系统 ----------
// 秘境入口、层级、程序化NPC生态、探索深度记录

import type { GameState } from './state'
import { generateProceduralNpc, type ProceduralNpc } from './procedural-npc'
import {
  activeCompanionRef, addMemberToState, findMemberByRef, makeCultivatorMember, npcAttackMult, PARTY_RULES, pickNpcClass,
  removeMemberFromState, countActive, normalizeMemberEquipment, normalizeMemberSkillSlots, type PartyMember,
} from './party'
import { buildNpcStats, npcPowerMult, ensureNpcProgression } from './npc-progression'
import { calcStats } from './effects'

export type RealmLayerType = 'outer' | 'middle' | 'core' | 'forbidden' | 'inheritance'

export interface RealmLayer {
  type: RealmLayerType
  name: string
  recommendedRealm: number
  description: string
  monsterLevel: number
  npcTypes: string[]
  lootTier: number
}

export interface SecretRealmDef {
  id: string
  name: string
  description: string
  domain: string
  entranceX: number
  entranceY: number
  layers: RealmLayer[]
  isTimeLimited: boolean
  unlockCondition?: string
  /** 对应 data.ts 中 RegionDef 的 id，用于关卡美术和敌人 */
  regionId: string
  /** 秘境类型 key */
  realmType: string
  // 状态
  discovered: boolean
  clearedLayers: number[]
  maxDepth: number
}

export const REALM_LAYERS: Record<RealmLayerType, RealmLayer> = {
  outer: {
    type: 'outer',
    name: '外层区域',
    recommendedRealm: 0,
    description: '秘境外围，灵气稀薄，有低阶妖兽出没。',
    monsterLevel: 5,
    npcTypes: ['采药散修', '低阶弟子', '游方道人'],
    lootTier: 1,
  },
  middle: {
    type: 'middle',
    name: '中层区域',
    recommendedRealm: 1,
    description: '秘境深处入口，灵气渐浓，妖兽更强。',
    monsterLevel: 15,
    npcTypes: ['筑基散修', '宗门执事', '寻宝猎人'],
    lootTier: 2,
  },
  core: {
    type: 'core',
    name: '核心区域',
    recommendedRealm: 2,
    description: '秘境核心，有高阶妖兽和守护者把守传承。',
    monsterLevel: 30,
    npcTypes: ['金丹长老', '秘境守护者', '邪修盗匪'],
    lootTier: 3,
  },
  forbidden: {
    type: 'forbidden',
    name: '禁地深渊',
    recommendedRealm: 3,
    description: '秘境最深处，上古异兽盘踞，禁制密布。',
    monsterLevel: 50,
    npcTypes: ['陨落前辈残魂', '上古傀儡', '隐居修士'],
    lootTier: 4,
  },
  inheritance: {
    type: 'inheritance',
    name: '传承之地',
    recommendedRealm: 4,
    description: '秘境主人留下传承之地，需通过天道考验。',
    monsterLevel: 70,
    npcTypes: ['秘境主人', '传承者', '守护圣兽'],
    lootTier: 5,
  },
}

// ===== 秘境类型定义 =====

export interface RealmTypeDef {
  key: string
  baseName: string
  regionId: string
  description: string
}

export const REALM_TYPES: RealmTypeDef[] = [
  { key: 'yy', baseName: '灵药园', regionId: 'rl_yy', description: '一座被灵气笼罩的药园，灵草遍布，有守护妖兽巡逻。' },
  { key: 'gd', baseName: '古修洞府', regionId: 'rl_gd', description: '上古修士留下的洞府，内含功法传承、丹药、法宝。' },
  { key: 'km', baseName: '矿脉秘境', regionId: 'rl_km', description: '蕴藏稀有矿石的地下矿脉，器修必去之地。' },
  { key: 'mx', baseName: '魔修遗迹', regionId: 'rl_mx', description: '魔修留下的遗迹，有魔道功法，但风险极高。' },
  { key: 'ys', baseName: '妖兽巢穴', regionId: 'rl_ys', description: '妖兽聚居之地，有妖丹和材料，可收服幼兽。' },
  { key: 'sl', baseName: '试炼秘境', regionId: 'rl_sl', description: '宗门设置的试炼场，用于弟子考核，有排名奖励。' },
]

// ===== 程序化描述生成 =====

const REALM_ATMOSPHERE: string[] = [
  '空气中弥漫着{element}的气息，{detail}',
  '四周{detail}，隐约传来{sound}',
  '{element}环绕四周，{detail}',
  '入目皆是{detail}，{element}扑面而来',
  '天地间{element}与{element2}交织，{detail}',
]

const ELEMENTS: Record<string, string[]> = {
  south: ['青翠灵气', '温润云雾', '淡金灵光', '碧色烟霞'],
  central: ['玄黄之气', '紫金灵光', '太虚清气', '九霄罡风'],
  east: ['碧海潮音', '沧溟水汽', '蓬莱仙气', '龙涎异香'],
  west: ['赤焰余温', '黄沙铁气', '大荒煞气', '落日余晖'],
  north: ['玄冰寒气', '极夜幽光', '霜雪寒芒', '幽冥阴气'],
}

const DETAILS: string[] = [
  '残破的石碑上刻着上古符文',
  '断裂的阵法纹路仍在微微发光',
  '地面上散落着不知名的骨骼',
  '远处有微弱的光芒时隐时现',
  '岩壁上布满了深浅不一的爪痕',
  '空气中飘浮着细碎的灵光碎片',
  '脚下传来隐约的震动',
  '头顶的岩缝中渗出奇异的液体',
  '墙角处生着几株散发幽光的灵草',
  '前方道路分岔，各有异象',
]

const SOUNDS: string[] = [
  '低沉的嘶吼',
  '金属碰撞的脆响',
  '空灵的吟唱',
  '石块碎裂的声音',
  '风穿过缝隙的呜咽',
  '不知名生物的脚步声',
  '阵法运转的嗡鸣',
  '水流冲击岩壁的回声',
]

const LAYER_DESC_PREFIX: string[] = [
  '前方道路愈发狭窄，',
  '灵气浓度骤然变化，',
  '脚下的石板开始出现裂纹，',
  '四周的壁画风格突变，',
  '空气中多了一丝腐朽的味道，',
  '头顶的光源变得昏暗，',
  '脚边的碎石开始增多，',
  '远处传来若有若无的气息，',
]

const LAYER_DESC_SUFFIX: string[] = [
  '隐约能感知到前方有强大的气息。',
  '地面上有着大量战斗痕迹。',
  '岩壁上的符文开始变得密集。',
  '能感受到一股压迫感。',
  '似乎已接近核心区域。',
  '禁制的痕迹越来越明显。',
  '前方传来不祥的气息。',
  '整个空间都在微微震动。',
]

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function generateAtmosphere(domain: string): string {
  const elems = ELEMENTS[domain] || ELEMENTS.south
  const element = pick(elems)
  const element2 = pick(elems)
  const detail = pick(DETAILS)
  const sound = pick(SOUNDS)
  return pick(REALM_ATMOSPHERE)
    .replace('{element}', element)
    .replace('{element2}', element2 !== element ? element2 : pick(elems))
    .replace('{detail}', detail)
    .replace('{sound}', sound)
}

function generateLayerDesc(domain: string, layerIndex: number): string {
  const prefix = pick(LAYER_DESC_PREFIX)
  const suffix = pick(LAYER_DESC_SUFFIX)
  return `${prefix}${suffix}`
}

/** 程序化生成秘境描述 */
function generateRealmDescription(domain: string, typeDef: RealmTypeDef): string {
  const atmos = generateAtmosphere(domain)
  return `${typeDef.description}${atmos}。`
}

/** 程序化生成层级（怪物等级随玩家等级浮动） */
function generateLayers(
  layerCount: number,
  playerLevel: number,
  domain: string,
): RealmLayer[] {
  const baseTypes: RealmLayerType[] = ['outer', 'middle', 'core', 'forbidden', 'inheritance']
  const types = baseTypes.slice(0, layerCount)
  return types.map((lt, i) => {
    const base = REALM_LAYERS[lt]
    // 怪物等级：基础值与玩家等级挂钩，逐层递增
    const baseLevel = Math.max(5, Math.floor(playerLevel * 0.6) + i * Math.max(5, Math.floor(playerLevel * 0.15)))
    const monsterLevel = Math.max(base.monsterLevel, baseLevel)
    // 随机化NPC类型
    const npcShuffled = [...base.npcTypes].sort(() => Math.random() - 0.5)
    // 程序化生成层级描述
    const layerDesc = `${base.description}${generateLayerDesc(domain, i)}`
    return {
      ...base,
      description: layerDesc,
      monsterLevel,
      npcTypes: npcShuffled,
    }
  })
}

// ===== 独特命名系统 =====
// 域前缀词：根据所在域选择氛围词
const DOMAIN_PREFIXES: Record<string, string[]> = {
  south: ['青冥', '碧落', '翠霞', '云隐', '紫竹'],
  central: ['苍玄', '太虚', '九霄', '玉清', '玄黄'],
  east: ['碧海', '沧溟', '蓬莱', '蛟渊', '潮音'],
  west: ['赤焰', '黄沙', '大荒', '落日', '玄铁'],
  north: ['玄冰', '极夜', '霜月', '凛冬', '幽寒'],
}

// 秘境类型修饰词：与类型搭配的氛围前缀
const TYPE_EPITHETS: Record<string, string[]> = {
  yy: ['月华', '灵雾', '仙露', '万草', '百灵'],
  gd: ['残月', '幽光', '古墟', '寂灭', '遗世'],
  km: ['赤晶', '玄铁', '金脉', '碎星', '厚岩'],
  mx: ['血煞', '幽冥', '噬魂', '万魔', '暗渊'],
  ys: ['龙吟', '虎啸', '万兽', '血月', '蛮荒'],
  sl: ['天骄', '混元', '通天', '问道', '碎虚'],
}

// 生成唯一秘境名
function generateRealmName(domain: string, typeKey: string): string {
  const domainWords = DOMAIN_PREFIXES[domain] || DOMAIN_PREFIXES.south
  const epithets = TYPE_EPITHETS[typeKey] || []
  const domainWord = domainWords[Math.floor(Math.random() * domainWords.length)]
  const epithet = epithets.length > 0 ? epithets[Math.floor(Math.random() * epithets.length)] : ''
  const typeDef = REALM_TYPES.find(t => t.key === typeKey)
  const baseName = typeDef?.baseName || '秘境'
  return epithet ? `${domainWord}·${epithet}${baseName}` : `${domainWord}·${baseName}`
}

// 生成秘境
export function generateSecretRealm(
  domain: string,
  x: number,
  y: number,
  realmType?: string,
  playerLevel?: number,
): SecretRealmDef {
  const typeDef = REALM_TYPES.find(t => t.key === realmType) || REALM_TYPES[Math.floor(Math.random() * REALM_TYPES.length)]
  const id = `realm_${Date.now()}_${Math.floor(Math.random() * 10000)}`
  const name = generateRealmName(domain, typeDef.key)

  // 根据类型决定层数（加入随机波动）
  const baseLayerCount = typeDef.key === 'sl' ? 3 : typeDef.key === 'mx' ? 5 : 4
  const layerCount = Math.max(2, baseLayerCount + (Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0))

  // 程序化生成描述和层级
  const description = generateRealmDescription(domain, typeDef)
  const layers = generateLayers(layerCount, playerLevel || 1, domain)

  return {
    id,
    name,
    description,
    domain,
    entranceX: x,
    entranceY: y,
    layers,
    isTimeLimited: typeDef.key === 'sl',
    discovered: true,
    clearedLayers: [],
    maxDepth: 0,
    regionId: typeDef.regionId,
    realmType: typeDef.key,
  }
}

// 发现秘境入口
export function discoverRealm(
  state: GameState,
  realm: SecretRealmDef,
): boolean {
  if (state.discoveredRealms.includes(realm.id)) return false
  state.discoveredRealms.push(realm.id)
  state.discoveredRealmDefs.push(realm)
  state.realmExplorationRecord[realm.id] = 0
  return true
}

// 生成秘境中的NPC
export function generateRealmNpcs(
  realm: SecretRealmDef,
  layerIndex: number,
  count: number,
): ProceduralNpc[] {
  if (layerIndex >= realm.layers.length) return []
  const layer = realm.layers[layerIndex]
  const npcs: ProceduralNpc[] = []

  for (let i = 0; i < count; i++) {
    const forcedRealm = layer.recommendedRealm + Math.floor(Math.random() * 2)
    const npc = generateProceduralNpc(realm.domain, Date.now(), forcedRealm)
    // 根据层级赋予不同属性
    npc.hp = Math.floor(npc.maxHp * (1 + layerIndex * 0.2))
    npc.maxHp = npc.hp
    npc.atk = Math.floor(npc.atk * (1 + layerIndex * 0.15))
    npc.def = Math.floor(npc.def * (1 + layerIndex * 0.1))
    npcs.push(npc)
  }

  return npcs
}

// ---------- 队伍：统一由 state.party 承载（取代旧的 activeCompanionNpcId 单字段） ----------

/**
 * 世界 NPC → 队伍成员。
 * v12：不再只按等级比插值，而是把 NPC 的修为档案（装备四件 / 功法四门 / 属性 / 战力）
 * 整份带入队员，伤害倍率由战力评分相对玩家换算（上限 2.2）。
 */
export function npcToPartyMember(state: GameState, npc: ProceduralNpc): PartyMember {
  ensureNpcProgression(npc)
  const stats = buildNpcStats(npc)
  // 以玩家真实属性（含装备/心法/天赋）为基准换算，比按等级估算更准
  const ps = calcStats(state)
  const m = makeCultivatorMember({
    source: 'worldNpc',
    refId: npc.id,
    displayName: npc.name,
    classId: pickNpcClass(state.classId, state.party, npc.seed),
    level: npc.level,
    realm: npc.realm,
    maxHp: stats.maxHp,
    // 战力换算为主，等级比作为保守兜底取较高者，避免弱 NPC 反而更低
    attackMult: Math.max(npcAttackMult(npc.level, state.level), npcPowerMult(stats.power, state.level, ps)),
    damageTakenRatio: 1,
    power: stats.power,
    joinedAt: Date.now(),
  })
  m.equipment = normalizeMemberEquipment(npc.gear ?? {})
  m.skillSlots = normalizeMemberSkillSlots(npc.loadout ?? {})
  return m
}

/** 是否还能再带一名修士（出战名额见 PARTY_RULES） */
export function canBringNpcToRealm(
  state: GameState,
  npcId: string,
): { ok: boolean; reason: string } {
  const npc = state.proceduralNpcs.find(n => n.id === npcId)
  if (!npc || !npc.alive) return { ok: false, reason: '该修士不存在或已陨落' }
  if (findMemberByRef(state.party, npcId)) return { ok: false, reason: '该道友已在队伍中' }
  if (countActive(state.party, 'cultivator') >= PARTY_RULES.maxCultivator) {
    return { ok: false, reason: `出战道友已达上限（${PARTY_RULES.maxCultivator} 名）` }
  }
  const rel = state.playerNpcRelations[npcId]
  if (!rel || rel.favor < 50) return { ok: false, reason: '好感度不足，需达到友好以上' }
  return { ok: true, reason: '' }
}

export function bringNpcToRealm(
  state: GameState,
  npcId: string,
): { ok: boolean; message: string } {
  const check = canBringNpcToRealm(state, npcId)
  if (!check.ok) return { ok: false, message: check.reason }
  const npc = state.proceduralNpcs.find(n => n.id === npcId)!
  const res = addMemberToState(state, npcToPartyMember(state, npc))
  if (!res.ok) return { ok: false, message: res.reason }
  return { ok: true, message: `${npc.name}已加入队伍，一同进入秘境` }
}

/** 让指定道友离队（此前为无人调用的死函数，现已由 WorldScene 接入） */
export function dismissCompanion(state: GameState, npcId?: string): void {
  const target = npcId ?? activeCompanionRef(state.party)
  if (!target) {
    const first = state.party.find(m => m.source === 'worldNpc')
    if (first) removeMemberFromState(state, first.refId)
    return
  }
  removeMemberFromState(state, target)
}

// 秘境层层数据
export function getRealmProgress(state: GameState, realmId: string): number {
  return state.realmExplorationRecord[realmId] || 0
}

export function updateRealmProgress(state: GameState, realmId: string, depth: number): void {
  const current = state.realmExplorationRecord[realmId] || 0
  if (depth > current) {
    state.realmExplorationRecord[realmId] = depth
  }
}
