// ---------- 秘境系统 ----------
// 秘境入口、层级、程序化NPC生态、探索深度记录

import type { GameState } from './state'
import { generateProceduralNpc, type ProceduralNpc } from './procedural-npc'

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
): SecretRealmDef {
  const typeDef = REALM_TYPES.find(t => t.key === realmType) || REALM_TYPES[Math.floor(Math.random() * REALM_TYPES.length)]
  const id = `realm_${Date.now()}_${Math.floor(Math.random() * 10000)}`
  const name = generateRealmName(domain, typeDef.key)

  // 根据类型决定层数
  const layerCount = typeDef.key === 'sl' ? 3 : typeDef.key === 'mx' ? 5 : 4
  const layerTypes: RealmLayerType[] = (['outer', 'middle', 'core', 'forbidden', 'inheritance'] as RealmLayerType[]).slice(0, layerCount)

  return {
    id,
    name,
    description: typeDef.description,
    domain,
    entranceX: x,
    entranceY: y,
    layers: layerTypes.map(lt => REALM_LAYERS[lt]),
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

// 带NPC下秘境
export function canBringNpcToRealm(
  state: GameState,
  npcId: string,
): { ok: boolean; reason: string } {
  const npc = state.proceduralNpcs.find(n => n.id === npcId)
  if (!npc || !npc.alive) return { ok: false, reason: 'NPC不存在或已陨落' }
  const rel = state.playerNpcRelations[npcId]
  if (!rel || rel.favor < 50) return { ok: false, reason: '好感度不足，需达到友好以上' }
  if (state.activeCompanionNpcId) return { ok: false, reason: '已有组队NPC' }
  return { ok: true, reason: '' }
}

export function bringNpcToRealm(
  state: GameState,
  npcId: string,
): { ok: boolean; message: string } {
  const check = canBringNpcToRealm(state, npcId)
  if (!check.ok) return { ok: false, message: check.reason }
  state.activeCompanionNpcId = npcId
  return { ok: true, message: 'NPC已加入队伍，一同进入秘境' }
}

export function dismissCompanion(state: GameState): void {
  state.activeCompanionNpcId = null
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
