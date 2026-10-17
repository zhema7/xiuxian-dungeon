// ---------- 年度事件系统 ----------
// 每年在特定月份触发大型世界事件：
// 三月·宗门大比 / 六月·坊市集会 / 九月·秘境开启

import type { GameState } from './state'
import type { AnnualEventType, AnnualEventRecord } from './state'
import type { WorldTime } from './world-time'
import { seasonOf } from './world-time'
import { getBuildingEffects } from './sect-building-v2'
import { sectDisciplePower } from './disciple-data'
import { getDemonSummary } from './inner-demon'
import { materialLabel } from './labels'

// ===== 事件触发时间配置 =====

interface EventSchedule {
  type: AnnualEventType
  name: string
  month: number
  desc: string
}

const SCHEDULES: EventSchedule[] = [
  { type: 'sect_tournament', name: '宗门大比', month: 3, desc: '各方宗门齐聚一堂，以武论道，争夺排名' },
  { type: 'market_fair', name: '坊市集会', month: 6, desc: '天下修士汇聚坊市，珍稀法宝琳琅满目' },
  { type: 'realm_opening', name: '秘境开启', month: 9, desc: '上古秘境封印松动，机缘与危险并存' },
]

// ===== 检查是否应该触发年度事件 =====

export function getPendingAnnualEvent(state: GameState, time: WorldTime): EventSchedule | null {
  if (time.year <= state.lastAnnualEventYear) return null

  for (const s of SCHEDULES) {
    if (time.month === s.month && time.day >= 1 && time.day <= 5) {
      // 检查该年是否已触发过此事件
      const alreadyTriggered = state.annualEventLog.some(
        e => e.type === s.type && e.year === time.year
      )
      if (!alreadyTriggered) return s
    }
  }
  return null
}

// ===== 宗门大比 =====

export interface TournamentResult {
  rank: number           // 排名（1=冠军）
  totalSects: number
  rewardGold: number
  rewardInsight: number
  rewardPrestige: number
  description: string
  messages: string[]
}

export function simulateSectTournament(state: GameState): TournamentResult {
  const aiSects = state.aiSects || []
  const totalSects = aiSects.length + (state.sect ? 1 : 0)
  const messages: string[] = []

  // 玩家宗门实力计算
  let playerPower = 0
  if (state.sect) {
    const effects = getBuildingEffects(state.sect)
    const disciplePower = sectDisciplePower(state.disciples || [])
    const buildingPower = Object.entries(state.sect.buildings).reduce((s, [, lv]) => s + (lv as number) * 15, 0)
    playerPower = Math.floor(disciplePower + buildingPower + effects.defensePower * 0.3 + state.realm * 100)
    messages.push(`本门实力评估：${playerPower}`)
  } else {
    playerPower = Math.floor(state.level * 50 + state.realm * 80)
    messages.push(`散修个人实力：${playerPower}`)
  }

  // AI宗门实力
  const aiPowers = aiSects.map(s => {
    const base = s.level * 100 + (s.discipleCount || 0) * 30
    return { id: s.id, name: s.name, power: base + Math.floor(Math.random() * 200) }
  })

  // 排名计算
  const allPowers = [
    { name: state.sect?.name || `${state.heroName}（散修）`, power: playerPower, isPlayer: true },
    ...aiPowers.map(p => ({ name: p.name, power: p.power, isPlayer: false })),
  ]
  allPowers.sort((a, b) => b.power - a.power)
  const rank = allPowers.findIndex(p => p.isPlayer) + 1

  // 奖励计算
  const tier = totalSects > 0 ? Math.max(1, totalSects - rank + 1) : 1
  const rewardGold = 200 + tier * 150 + state.level * 20
  const rewardInsight = 10 + tier * 5
  const rewardPrestige = tier * 3

  // 描述
  let description = ''
  if (rank === 1) {
    description = `宗门大比中力压群雄，夺得魁首！天下闻名！`
    messages.push('【大比魁首】声望大涨，各方来贺！')
  } else if (rank <= 3) {
    description = `宗门大比中表现出色，位列第${rank}名，名声渐起。`
    messages.push(`【三甲之列】第${rank}名，可喜可贺。`)
  } else if (rank <= Math.ceil(totalSects / 2)) {
    description = `宗门大比中表现尚可，排名第${rank}。`
    messages.push(`第${rank}名，仍需努力。`)
  } else {
    description = `宗门大比中表现平平，排名第${rank}，需加强弟子培养。`
    messages.push(`第${rank}名，当勉力精进。`)
  }

  // 实际发放奖励
  state.gold += rewardGold
  state.insight = (state.insight || 0) + rewardInsight
  state.reputation = (state.reputation || 0) + rewardPrestige
  if (state.sect) {
    state.sect.resources.prestige += rewardPrestige
  }

  return { rank, totalSects, rewardGold, rewardInsight, rewardPrestige, description, messages }
}

// ===== 坊市集会 =====

export interface MarketFairResult {
  rareItemsPurchased: number
  goldSpent: number
  goldEarned: number
  insightGained: number
  description: string
  messages: string[]
}

export function simulateMarketFair(state: GameState): MarketFairResult {
  const messages: string[] = []
  let goldSpent = 0
  let goldEarned = 0
  let insightGained = 0
  let rareItemsPurchased = 0

  // 玩家可以购买稀有材料
  const rareItems = [
    { name: '千年灵草', cost: 200, material: 'herb', amount: 3 },
    { name: '玄铁矿石', cost: 150, material: 'ore', amount: 3 },
    { name: '灵木心', cost: 180, material: 'wood', amount: 3 },
    { name: '破界石', cost: 300, material: 'tupo', amount: 1 },
  ]

  // 根据玩家灵石决定购买行为
  for (const item of rareItems) {
    if (state.gold >= item.cost && Math.random() < 0.5) {
      state.gold -= item.cost
      goldSpent += item.cost
      state.materials[item.material] = (state.materials[item.material] || 0) + item.amount
      rareItemsPurchased++
      messages.push(`购得${item.name}×${item.amount}`)
    }
  }

  // 出售多余材料
  const sellableMats = ['herb', 'ore', 'wood']
  for (const mat of sellableMats) {
    const have = state.materials[mat] || 0
    if (have > 10) {
      const sellAmount = Math.floor((have - 10) * 0.3)
      if (sellAmount > 0) {
        const sellPrice = sellAmount * 30
        state.materials[mat] = have - sellAmount
        state.gold += sellPrice
        goldEarned += sellPrice
        messages.push(`售出${materialLabel(mat)}×${sellAmount}，获利${sellPrice}灵石`)
      }
    }
  }

  // 坊市感悟
  if (Math.random() < 0.4) {
    const gain = 5 + Math.floor(Math.random() * 10)
    state.insight = (state.insight || 0) + gain
    insightGained += gain
    messages.push(`在坊市中观摩各家法宝，悟道点+${gain}`)
  }

  // 宗门通商加成
  if (state.sect) {
    const tradeBonus = 50 + state.sect.level * 20
    state.gold += tradeBonus
    goldEarned += tradeBonus
    messages.push(`宗门通商收益：${tradeBonus}灵石`)
  }

  const description = rareItemsPurchased > 0
    ? `坊市集会收获颇丰，购得${rareItemsPurchased}件稀有材料`
    : '坊市集会热闹非凡，虽未大购，却也开了眼界'

  return { rareItemsPurchased, goldSpent, goldEarned, insightGained, description, messages }
}

// ===== 秘境开启 =====

export interface RealmOpeningResult {
  realmType: string
  realmName: string
  floorBonus: number
  description: string
  messages: string[]
}

const OPENING_REALMS = [
  { type: 'xian', name: '破碎仙宫·裂隙', minFloor: 1, floorBonus: 0 },
  { type: 'wanyao', name: '无尽妖域·深层', minFloor: 10, floorBonus: 5 },
  { type: 'tianjian', name: '天剑冢·秘室', minFloor: 5, floorBonus: 3 },
  { type: 'haishi', name: '海市蜃楼·幻层', minFloor: 3, floorBonus: 2 },
  { type: 'guzhan', name: '古战场·遗冢', minFloor: 5, floorBonus: 3 },
  { type: 'bingyuan', name: '冰原·寒冢', minFloor: 5, floorBonus: 3 },
  { type: 'shenyuan', name: '深渊·神墓', minFloor: 8, floorBonus: 4 },
]

export function simulateRealmOpening(state: GameState): RealmOpeningResult {
  const messages: string[] = []

  // 根据玩家境界选择秘境
  const accessibleRealms = OPENING_REALMS.filter(r => {
    const effFloor = state.realm >= 4
      ? 20 + (state.xianMaxDepth || 0) * 0.8
      : state.level
    return effFloor >= r.minFloor
  })

  const pool = accessibleRealms.length > 0 ? accessibleRealms : [OPENING_REALMS[0]]
  const chosen = pool[Math.floor(Math.random() * pool.length)]

  // 心魔影响探索
  const demonSummary = getDemonSummary(state)
  const demonInterference = demonSummary.total > 100

  // 奖励
  const insightGain = 15 + state.realm * 5 + Math.floor(Math.random() * 20)
  state.insight = (state.insight || 0) + insightGain
  messages.push(`探索${chosen.name}，悟道点+${insightGain}`)

  // 有概率获得稀有材料
  if (Math.random() < 0.6) {
    const tupoGain = 1 + Math.floor(Math.random() * 2)
    state.materials.tupo = (state.materials.tupo || 0) + tupoGain
    messages.push(`获得突破石×${tupoGain}`)
  }

  // 灵石奖励
  const goldGain = 100 + state.level * 15
  state.gold += goldGain
  messages.push(`获得灵石${goldGain}`)

  // 心魔干扰
  if (demonInterference) {
    messages.push('心魔在秘境中作祟，探索受到了干扰……')
  }

  const description = `${chosen.name}封印松动，你深入探索，收获颇丰`

  return {
    realmType: chosen.type,
    realmName: chosen.name,
    floorBonus: chosen.floorBonus,
    description,
    messages,
  }
}

// ===== 年度事件执行 =====

export interface AnnualEventResult {
  type: AnnualEventType
  name: string
  description: string
  messages: string[]
}

export function executeAnnualEvent(state: GameState, type: AnnualEventType, time: WorldTime): AnnualEventResult {
  let result: AnnualEventResult

  switch (type) {
    case 'sect_tournament': {
      const t = simulateSectTournament(state)
      result = {
        type, name: '宗门大比',
        description: t.description, messages: t.messages,
      }
      break
    }
    case 'market_fair': {
      const m = simulateMarketFair(state)
      result = {
        type, name: '坊市集会',
        description: m.description, messages: m.messages,
      }
      break
    }
    case 'realm_opening': {
      const r = simulateRealmOpening(state)
      result = {
        type, name: '秘境开启',
        description: r.description, messages: r.messages,
      }
      break
    }
  }

  // 记录事件
  const record: AnnualEventRecord = {
    type,
    year: time.year,
    result: result.description,
    timestamp: Date.now(),
  }
  state.annualEventLog.push(record)

  // 更新世界演进分数
  state.worldEvolutionScore = (state.worldEvolutionScore || 0) + 10

  // 更新最后触发年份
  state.lastAnnualEventYear = time.year

  return result
}

// ===== 获取年度事件预告 =====

export function getUpcomingEvent(time: WorldTime): { name: string; monthLeft: number } | null {
  const season = seasonOf(time.month)
  for (const s of SCHEDULES) {
    if (s.month > time.month) {
      return { name: s.name, monthLeft: s.month - time.month }
    }
  }
  // 明年三月
  return { name: SCHEDULES[0].name, monthLeft: 12 - time.month + SCHEDULES[0].month }
}

// ===== 获取年度事件历史 =====

export function getEventHistory(state: GameState, type?: AnnualEventType): AnnualEventRecord[] {
  const log = state.annualEventLog || []
  return type ? log.filter(e => e.type === type) : log
}
