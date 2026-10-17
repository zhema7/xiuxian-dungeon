// ---------- 秘境深度生态 ----------
// 秘境原住民部落 + 隐藏剧情 + 秘境生态系统

import type { GameState } from './state'
import { materialLabel } from './labels'

// ===== 部落纹理映射 =====
export const TRIBE_TEXTURES: Record<TribeType, { tex: string; anim: string }> = {
  spirit_beast: { tex: 'tribe_spirit_beast', anim: 'tribe_spirit_beast_idle' },
  ancient_human: { tex: 'tribe_ancient_human', anim: 'tribe_ancient_human_idle' },
  elemental: { tex: 'tribe_elemental', anim: 'tribe_elemental_idle' },
  shadow_folk: { tex: 'tribe_shadow_folk', anim: 'tribe_shadow_folk_idle' },
  crystal_people: { tex: 'tribe_crystal_people', anim: 'tribe_crystal_people_idle' },
}

// ===== 原住民部落类型 =====

export type TribeType =
  | 'spirit_beast'    // 灵兽部落
  | 'ancient_human'   // 古人遗族
  | 'elemental'       // 元灵族
  | 'shadow_folk'     // 影族
  | 'crystal_people'  // 晶族

export interface TribeDef {
  type: TribeType
  name: string
  desc: string
  disposition: 'friendly' | 'neutral' | 'hostile' | 'sacred'
  population: number
  techLevel: number     // 部落文明等级 1-10
  specialty: 'alchemy' | 'crafting' | 'beast_taming' | 'formation' | 'cultivation'
  tradeableGoods: { item: string; price: number }[]
  questAvailable: boolean
}

// ===== 秘境生态定义 =====

export interface RealmEcology {
  realmId: string
  tribe: TribeDef | null
  floraAbundance: number    // 植被丰度 0-100
  faunaAbundance: number    // 动物丰度 0-100
  spiritDensity: number     // 灵气浓度 0-100
  hiddenAreas: number       // 隐藏区域数量
  discoveredHiddenAreas: number
  activeQuests: RealmQuest[]
  tradeHistory: { item: string; amount: number; date: number }[]
}

export interface RealmQuest {
  id: string
  title: string
  description: string
  type: 'gather' | 'defeat' | 'negotiate' | 'explore' | 'ritual'
  target: string
  amount: number
  current: number
  reward: {
    gold?: number
    insight?: number
    items?: Record<string, number>
    tribeRelation?: number  // 部落好感变化
  }
  completed: boolean
}

// ===== 部落配置表 =====

export const TRIBES: Record<TribeType, TribeDef> = {
  spirit_beast: {
    type: 'spirit_beast', name: '灵兽族', desc: '由灵智已开的灵兽组成的部落，崇尚自然法则',
    disposition: 'neutral', population: 50, techLevel: 3, specialty: 'beast_taming',
    tradeableGoods: [
      { item: 'beast_core', price: 100 },
      { item: 'herb', price: 30 },
      { item: 'beast_essence', price: 200 },
    ],
    questAvailable: true,
  },
  ancient_human: {
    type: 'ancient_human', name: '遗古人族', desc: '远古时代遗留的人类后裔，保留着失传的修炼之法',
    disposition: 'friendly', population: 80, techLevel: 7, specialty: 'cultivation',
    tradeableGoods: [
      { item: 'tupo', price: 250 },
      { item: 'ancient_scroll', price: 500 },
      { item: 'insight_crystal', price: 300 },
    ],
    questAvailable: true,
  },
  elemental: {
    type: 'elemental', name: '元灵族', desc: '由天地灵气凝聚而成的生命体，掌控元素之力',
    disposition: 'sacred', population: 30, techLevel: 9, specialty: 'formation',
    tradeableGoods: [
      { item: 'element_core', price: 400 },
      { item: 'formation_stone', price: 350 },
      { item: 'insight_crystal', price: 300 },
    ],
    questAvailable: true,
  },
  shadow_folk: {
    type: 'shadow_folk', name: '影族', desc: '生活在秘境暗处的神秘种族，擅长隐匿和暗杀',
    disposition: 'hostile', population: 40, techLevel: 5, specialty: 'cultivation',
    tradeableGoods: [
      { item: 'shadow_essence', price: 300 },
      { item: 'poison_herb', price: 80 },
    ],
    questAvailable: true,
  },
  crystal_people: {
    type: 'crystal_people', name: '晶族', desc: '以晶体为身躯的硅基生命，精通锻造之道',
    disposition: 'neutral', population: 60, techLevel: 8, specialty: 'crafting',
    tradeableGoods: [
      { item: 'crystal_ore', price: 150 },
      { item: 'refined_crystal', price: 400 },
      { item: 'tupo', price: 200 },
    ],
    questAvailable: true,
  },
}

// ===== 生成秘境生态 =====

const TRIBE_BY_REGION: Record<string, TribeType[]> = {
  xian: ['ancient_human', 'elemental'],
  wanyao: ['spirit_beast', 'shadow_folk'],
  tianjian: ['ancient_human', 'crystal_people'],
  haishi: ['elemental', 'spirit_beast'],
  guzhan: ['ancient_human', 'shadow_folk'],
  bingyuan: ['crystal_people', 'elemental'],
  shenyuan: ['shadow_folk', 'ancient_human'],
}

export function generateRealmEcology(realmId: string, playerLevel: number): RealmEcology {
  const region = realmId.split('_')[0]
  const possibleTribes = TRIBE_BY_REGION[region] || ['spirit_beast', 'ancient_human']

  // 70%概率有部落
  const hasTribe = Math.random() < 0.7
  let tribe: TribeDef | null = null

  if (hasTribe) {
    const tribeType = possibleTribes[Math.floor(Math.random() * possibleTribes.length)]
    tribe = { ...TRIBES[tribeType] }
    // 随机调整人口
    tribe.population = Math.floor(tribe.population * (0.5 + Math.random() * 0.5))
  }

  return {
    realmId,
    tribe,
    floraAbundance: 30 + Math.floor(Math.random() * 70),
    faunaAbundance: 30 + Math.floor(Math.random() * 70),
    spiritDensity: 40 + Math.floor(Math.random() * 60),
    hiddenAreas: 1 + Math.floor(Math.random() * 4),
    discoveredHiddenAreas: 0,
    activeQuests: [],
    tradeHistory: [],
  }
}

// ===== 部落交互 =====

export interface TribeInteractionResult {
  type: 'trade' | 'quest' | 'war' | 'befriend' | 'learn'
  success: boolean
  message: string
  rewards?: { gold?: number; insight?: number; items?: Record<string, number> }
}

export function interactWithTribe(
  state: GameState,
  ecology: RealmEcology,
  interaction: 'trade' | 'quest' | 'war' | 'befriend' | 'learn',
): TribeInteractionResult {
  if (!ecology.tribe) return { type: interaction, success: false, message: '此秘境无原住民部落' }

  const tribe = ecology.tribe
  const relation = getTribeRelation(state, ecology.realmId)

  switch (interaction) {
    case 'trade': {
      if (tribe.disposition === 'hostile' && relation < 0) {
        return { type: 'trade', success: false, message: '部落敌视你，拒绝交易' }
      }
      // 随机购买一件商品
      const goods = tribe.tradeableGoods[Math.floor(Math.random() * tribe.tradeableGoods.length)]
      if (state.gold < goods.price) {
        return { type: 'trade', success: false, message: `灵石不足，需${goods.price}` }
      }
      state.gold -= goods.price
      state.materials[goods.item] = (state.materials[goods.item] || 0) + 1
      ecology.tradeHistory.push({ item: goods.item, amount: 1, date: Date.now() })
      return {
        type: 'trade', success: true, message: `从${tribe.name}购得${materialLabel(goods.item)}×1`,
        rewards: { gold: -goods.price, items: { [goods.item]: 1 } },
      }
    }

    case 'befriend': {
      const requiredFavor = tribe.disposition === 'hostile' ? 50 : tribe.disposition === 'neutral' ? 20 : 0
      if (relation >= requiredFavor) {
        setTribeRelation(state, ecology.realmId, relation + 10)
        state.reputation = (state.reputation || 0) + 5
        return { type: 'befriend', success: true, message: `与${tribe.name}关系提升！` }
      }
      // 需要赠送礼物
      const giftCost = 100 + tribe.techLevel * 50
      if (state.gold < giftCost) {
        return { type: 'befriend', success: false, message: `赠送礼物需${giftCost}灵石` }
      }
      state.gold -= giftCost
      setTribeRelation(state, ecology.realmId, relation + 5)
      return { type: 'befriend', success: true, message: `赠送礼物后，${tribe.name}对你好感+5` }
    }

    case 'quest': {
      if (!tribe.questAvailable) {
        return { type: 'quest', success: false, message: '部落暂无可接任务' }
      }
      const quest = generateTribeQuest(tribe, state.level)
      ecology.activeQuests.push(quest)
      return { type: 'quest', success: true, message: `接受任务：${quest.title}` }
    }

    case 'war': {
      // 与部落开战
      const tribePower = tribe.population * (tribe.techLevel * 5) + 200
      const playerPower = state.level * 30 + state.realm * 100
      if (playerPower > tribePower * 1.2) {
        // 胜利
        const reward = tribe.population * 10
        state.gold += reward
        state.reputation = (state.reputation || 0) - 10
        setTribeRelation(state, ecology.realmId, -50)
        return {
          type: 'war', success: true,
          message: `你击败了${tribe.name}！获得灵石${reward}，但声望-10`,
          rewards: { gold: reward },
        }
      } else {
        // 失败
        const loss = Math.floor(state.gold * 0.1)
        state.gold -= loss
        state.hp = Math.max(1, (state.hp || 100) - 50)
        setTribeRelation(state, ecology.realmId, -100)
        return {
          type: 'war', success: false,
          message: `你被${tribe.name}击退！损失灵石${loss}，气血-50`,
        }
      }
    }

    case 'learn': {
      if (relation < 30) {
        return { type: 'learn', success: false, message: `好感度不足，需至少30` }
      }
      const gain = 10 + tribe.techLevel * 3
      state.insight = (state.insight || 0) + gain
      return {
        type: 'learn', success: true,
        message: `你从${tribe.name}学习了${tribe.specialty}之道，悟道点+${gain}`,
        rewards: { insight: gain },
      }
    }
  }
}

// ===== 生成部落任务 =====

function generateTribeQuest(tribe: TribeDef, playerLevel: number): RealmQuest {
  const questTypes: RealmQuest['type'][] = ['gather', 'defeat', 'negotiate', 'explore', 'ritual']
  const type = questTypes[Math.floor(Math.random() * questTypes.length)]

  const targets: Record<RealmQuest['type'], { target: string; title: string; desc: string }> = {
    gather: { target: 'herb', title: '采集灵草', desc: `为${tribe.name}采集灵草` },
    defeat: { target: 'beast', title: '驱除凶兽', desc: `为${tribe.name}驱除附近凶兽` },
    negotiate: { target: 'rival_tribe', title: '交涉邻族', desc: `代表${tribe.name}与邻族交涉` },
    explore: { target: 'hidden_area', title: '探索隐区', desc: `探索${tribe.name}附近的隐藏区域` },
    ritual: { target: 'ritual_material', title: '协助仪式', desc: `协助${tribe.name}完成仪式` },
  }

  const target = targets[type]
  const amount = 1 + Math.floor(Math.random() * 4)

  return {
    id: `quest_${tribe.type}_${Date.now()}`,
    title: target.title,
    description: target.desc,
    type,
    target: target.target,
    amount,
    current: 0,
    reward: {
      gold: 100 + playerLevel * 20,
      insight: 10 + tribe.techLevel * 2,
      items: { tupo: 1 },
      tribeRelation: 20,
    },
    completed: false,
  }
}

// ===== 部落好感管理 =====

const TRIBE_RELATION_KEY = 'tribeRelations'

function getTribeRelation(state: GameState, realmId: string): number {
  const relations = (state as any)[TRIBE_RELATION_KEY] as Record<string, number> | undefined
  return relations?.[realmId] ?? 0
}

function setTribeRelation(state: GameState, realmId: string, value: number): void {
  if (!(state as any)[TRIBE_RELATION_KEY]) (state as any)[TRIBE_RELATION_KEY] = {}
  ;(state as any)[TRIBE_RELATION_KEY][realmId] = Math.max(-100, Math.min(100, value))
}

// ===== 隐藏区域探索 =====

export interface HiddenAreaDiscovery {
  found: boolean
  type: 'treasure' | 'ancient_text' | 'spirit_pool' | 'boss_lair' | 'empty'
  description: string
  rewards?: { gold?: number; insight?: number; items?: Record<string, number> }
}

export function exploreHiddenArea(state: GameState, ecology: RealmEcology): HiddenAreaDiscovery {
  if (ecology.discoveredHiddenAreas >= ecology.hiddenAreas) {
    return { found: false, type: 'empty', description: '已无隐藏区域可探索' }
  }

  ecology.discoveredHiddenAreas++

  const types: HiddenAreaDiscovery['type'][] = ['treasure', 'ancient_text', 'spirit_pool', 'boss_lair', 'empty', 'empty']
  const type = types[Math.floor(Math.random() * types.length)]

  switch (type) {
    case 'treasure':
      const gold = 100 + state.level * 20
      state.gold += gold
      return {
        found: true, type,
        description: `你发现了一处藏宝室！获得灵石${gold}`,
        rewards: { gold },
      }
    case 'ancient_text':
      const insight = 15 + state.level
      state.insight = (state.insight || 0) + insight
      return {
        found: true, type,
        description: `你发现了一卷古籍残篇！悟道点+${insight}`,
        rewards: { insight },
      }
    case 'spirit_pool':
      const spiritInsight = 20 + state.level * 2
      state.insight = (state.insight || 0) + spiritInsight
      return {
        found: true, type,
        description: `你发现了一处灵气池！在其中修炼，悟道点+${spiritInsight}`,
        rewards: { insight: spiritInsight },
      }
    case 'boss_lair':
      return {
        found: true, type,
        description: `你发现了一处凶兽巢穴！里面传来恐怖的气息……`,
      }
    default:
      return { found: true, type: 'empty', description: '你探索了一处隐秘区域，但一无所获' }
  }
}

// ===== 秘境生态自然演化 =====

export function tickRealmEcology(ecology: RealmEcology, deltaDays: number): string[] {
  const messages: string[] = []

  // 植被和动物丰度自然变化
  ecology.floraAbundance = Math.min(100, ecology.floraAbundance + Math.floor(deltaDays * 0.5))
  ecology.faunaAbundance = Math.min(100, ecology.faunaAbundance + Math.floor(deltaDays * 0.3))

  // 部落人口增长
  if (ecology.tribe) {
    const growth = Math.floor(ecology.tribe.population * 0.001 * deltaDays)
    ecology.tribe.population += growth
    if (growth > 0) {
      messages.push(`${ecology.tribe.name}人口增长至${ecology.tribe.population}`)
    }
  }

  // 灵气浓度波动
  ecology.spiritDensity = Math.max(20, Math.min(100,
    ecology.spiritDensity + Math.floor((Math.random() - 0.5) * 10)
  ))

  return messages
}
