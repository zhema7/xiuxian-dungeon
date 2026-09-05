// ---------- 神念探查系统 ----------
// 基于境界压制实现信息分级查看

import type { GameState } from './state'
import type { ProceduralNpc, RelationType } from './procedural-npc'
import { getRealmDiff } from './procedural-npc'
import { SKILLS } from './data'

export interface DivineSenseResult {
  // 表层信息
  nameKnown: boolean
  realmKnown: boolean
  healthKnown: boolean
  equipQualityKnown: boolean
  moralitySense: boolean
  // 中层信息
  realNameKnown: boolean
  exactRealmKnown: boolean
  inventoryKnown: boolean
  skillsKnown: boolean
  recentHistoryKnown: boolean
  relationSurfaceKnown: boolean
  // 深层信息
  secretKnown: boolean
  hiddenTreasureKnown: boolean
  deepRelationsKnown: boolean
  daoHeartFlawKnown: boolean
  // 状态
  detected: boolean
  backlashDmg: number
  // 可显示的文本
  texts: {
    surface: string
    middle: string
    deep: string
  }
}

export function performDivineSense(
  state: GameState,
  npc: ProceduralNpc,
): DivineSenseResult {
  const playerRealm = state.realm
  const npcRealm = npc.realm
  const diff = getRealmDiff(playerRealm, npcRealm)
  const divineSenseLevel = state.divineSenseLevel

  const result: DivineSenseResult = {
    nameKnown: false,
    realmKnown: false,
    healthKnown: false,
    equipQualityKnown: false,
    moralitySense: false,
    realNameKnown: false,
    exactRealmKnown: false,
    inventoryKnown: false,
    skillsKnown: false,
    recentHistoryKnown: false,
    relationSurfaceKnown: false,
    secretKnown: false,
    hiddenTreasureKnown: false,
    deepRelationsKnown: false,
    daoHeartFlawKnown: false,
    detected: false,
    backlashDmg: 0,
    texts: { surface: '', middle: '', deep: '' },
  }

  // 神念反噬：对方高2+大境界
  if (diff <= -2) {
    result.backlashDmg = Math.floor(10 + Math.abs(diff) * 15)
    result.detected = true
    result.texts.surface = '深不可测……你只觉得一股磅礴神念反噬而来，险些受伤！'
    return result
  }

  // 表层信息：境界相当即可
  if (diff >= -1) {
    result.nameKnown = true
    result.realmKnown = true
    result.healthKnown = true
    result.equipQualityKnown = true
    result.moralitySense = true
  }

  // 中层信息：己方高1大境界
  if (diff >= 1) {
    result.realNameKnown = true
    result.exactRealmKnown = true
    result.inventoryKnown = true
    result.skillsKnown = true
    result.recentHistoryKnown = true
    result.relationSurfaceKnown = true
  }

  // 深层信息：己方高2+大境界
  if (diff >= 2) {
    result.secretKnown = true
    result.hiddenTreasureKnown = true
    result.deepRelationsKnown = true
    result.daoHeartFlawKnown = true
  }

  // 被探查者察觉概率
  let detectChance = 0
  if (diff <= -1) detectChance = 0.8
  else if (diff === 0) detectChance = 0.2
  else if (diff === 1) detectChance = 0.05
  else detectChance = 0

  // 神念等级降低被察觉概率
  detectChance = Math.max(0, detectChance - divineSenseLevel * 0.05)

  // NPC反探查能力（高境界NPC有隐匿功法）
  if (npc.personality.includes('狡诈')) detectChance += 0.1
  if (npc.realm >= 3) detectChance += 0.05

  result.detected = Math.random() < detectChance

  // 生成显示文本
  result.texts.surface = buildSurfaceText(npc, result)
  result.texts.middle = buildMiddleText(npc, result)
  result.texts.deep = buildDeepText(npc, result, state.proceduralNpcs)

  return result
}

// ===== 中文名称映射 =====

const RELATION_TYPE_NAMES: Record<RelationType, string> = {
  master: '师徒',
  disciple: '徒弟',
  partner: '道侣',
  friend: '友人',
  enemy: '仇敌',
  rival: '对手',
  family: '亲族',
  benefactor: '恩人',
  trade: '交易',
  acquaintance: '相识',
}

const HERB_NAMES = ['灵芝', '人参果', '凤血草', '龙涎花', '九叶莲', '寒冰草', '紫韵藤', '黄精']
const ORE_NAMES = ['精铁', '寒铁', '灵铜', '玄银', '紫晶', '星陨铁', '太乙精金']

const NPC_SKILL_FALLBACK_NAMES: Record<string, string> = {
  sk_chuancheng: '传承秘法',
  sk_shanbi: '闪避身法',
  sk_liehuo: '烈火诀',
}

export function getItemName(key: string): string {
  if (key === 'gold') return '灵石'
  if (key === 'hp_pill') return '回气丹'
  if (key === 'tupo') return '突破石'
  if (key.startsWith('herb_')) {
    const idx = parseInt(key.slice(5)) || 0
    return HERB_NAMES[idx % HERB_NAMES.length]
  }
  if (key.startsWith('ore_')) {
    const idx = parseInt(key.slice(4)) || 0
    return ORE_NAMES[idx % ORE_NAMES.length]
  }
  return key
}

function getSkillName(id: string): string {
  return SKILLS.get(id)?.name ?? NPC_SKILL_FALLBACK_NAMES[id] ?? id
}

function getRelationTypeName(type: RelationType): string {
  return RELATION_TYPE_NAMES[type] ?? type
}

function buildSurfaceText(npc: ProceduralNpc, r: DivineSenseResult): string {
  const parts: string[] = []
  if (r.nameKnown) parts.push(`姓名：${npc.name}`)
  else parts.push('姓名：???')
  if (r.realmKnown) {
    const realmNames = ['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫']
    parts.push(`境界：${realmNames[npc.realm]}期`)
  } else parts.push('境界：深浅未知')
  if (r.healthKnown) parts.push(`气血：${npc.hp}/${npc.maxHp}`)
  if (r.equipQualityKnown) {
    const eqLevel = npc.realm + 1
    parts.push(`装备品阶：约${eqLevel}品`)
  }
  if (r.moralitySense) {
    const moralityDesc = npc.morality > 30 ? '正派' : npc.morality < -30 ? '邪气' : '中性'
    parts.push(`气息：${moralityDesc}`)
  }
  return parts.join('\n')
}

function buildMiddleText(npc: ProceduralNpc, r: DivineSenseResult): string {
  if (!r.realNameKnown) return '???（需要更高境界）'
  const parts: string[] = []
  parts.push(`真实身份：${npc.name}，${npc.background}出身`)
  parts.push(`修为：${npc.realm}境${npc.level}级`)
  parts.push(`道途：${npc.daoPath}`)
  parts.push(`体质：${npc.physique}`)
  if (r.inventoryKnown) {
    const items = Object.entries(npc.inventory).map(([k, v]) => `${getItemName(k)}×${v}`).join('、')
    parts.push(`储物：${items || '空空如也'}`)
  }
  if (r.skillsKnown) {
    const skillNames = npc.skills.map(getSkillName).join('、')
    parts.push(`功法：${skillNames || '未见特殊功法'}`)
  }
  if (r.relationSurfaceKnown) {
    const rels = npc.relations.slice(0, 3).map(r => `${getRelationTypeName(r.type)}(${r.level})`).join('、')
    parts.push(`关系：${rels || '独来独往'}`)
  }
  return parts.join('\n')
}

function buildDeepText(npc: ProceduralNpc, r: DivineSenseResult, allNpcs: readonly ProceduralNpc[]): string {
  if (!r.secretKnown) return '???（需要远超对方的境界）'
  const parts: string[] = []
  parts.push(`秘密：${npc.secret}`)
  parts.push(`人生目标：${npc.lifeGoal}`)
  parts.push(`性格：${npc.personality.join('、')}`)
  if (r.deepRelationsKnown) {
    const deepRels = npc.relations.map(r => {
      const target = allNpcs.find(n => n.id === r.targetId)
      const targetName = target ? target.name : '不知名修士'
      return `${getRelationTypeName(r.type)}→${targetName}(${r.level})`
    }).join('、')
    parts.push(`深层关系：${deepRels || '无'}`)
  }
  if (r.daoHeartFlawKnown) {
    const flaws = ['执念太深', '心魔滋生', '道心动摇', '根基不稳']
    parts.push(`道心弱点：${flaws[npc.seed % flaws.length]}`)
  }
  return parts.join('\n')
}

// ===== 神念等级提升 =====

export function updateDivineSenseLevel(state: GameState): void {
  state.divineSenseLevel = Math.floor(state.realm / 2)
}
