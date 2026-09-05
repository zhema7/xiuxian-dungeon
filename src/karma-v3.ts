// ---------- 因果业力v3 ----------
// 天道反噬（极端恶业惩罚） + 善缘奇遇（高善业机缘）
// 业力因果链（长期追踪+跨NPC因果）

import type { GameState } from './state'
import type { ProceduralNpc } from './procedural-npc'
import { getPlayerNpcRelation } from './npc-relation-net'
import { getDemonSummary } from './inner-demon'

// ===== 天道反噬 =====

export interface HeavenWrathResult {
  triggered: boolean
  type: 'thunder_strike' | 'qi_deviation' | 'spirit_seal' | 'karma_chain' | null
  description: string
  effects: { hpLoss?: number; expLoss?: number; goldLoss?: number; insightLoss?: number; demonIncrease?: number }
}

export function checkHeavenWrath(state: GameState): HeavenWrathResult {
  const karma = state.karma || 0
  const morality = state.morality || 0
  const demonSummary = getDemonSummary(state)

  // 恶业+心魔双重叠加 → 天道反噬概率大幅增加
  const totalEvil = state.karmaLog
    .filter(e => e.type === 'evil')
    .reduce((s, e) => s + Math.abs(e.amount), 0)
  const totalGood = state.karmaLog
    .filter(e => e.type === 'good')
    .reduce((s, e) => s + e.amount, 0)
  const netEvil = totalEvil - totalGood

  // 基础概率
  let chance = 0
  if (netEvil > 100 && morality < -50) chance += 0.12
  if (demonSummary.max >= 60) chance += 0.08
  if (demonSummary.total >= 150) chance += 0.05

  if (chance === 0 || Math.random() > chance) {
    return { triggered: false, type: null, description: '', effects: {} }
  }

  // 选择反噬类型
  const types: HeavenWrathResult['type'][] = []
  if (demonSummary.max >= 70) types.push('karma_chain')
  if (morality < -70) types.push('spirit_seal')
  if (netEvil > 150) types.push('thunder_strike')
  types.push('qi_deviation')

  const type = types[Math.floor(Math.random() * types.length)]
  const severity = Math.floor(netEvil / 50)

  switch (type) {
    case 'thunder_strike':
      return {
        triggered: true,
        type,
        description: `【天道雷罚】苍穹之上有雷光隐现，一道天雷劈下！`,
        effects: {
          hpLoss: 80 + severity * 30,
          expLoss: severity * 50,
        },
      }

    case 'qi_deviation':
      return {
        triggered: true,
        type,
        description: `【走火入魔】体内灵气逆行，经脉紊乱！`,
        effects: {
          hpLoss: 30 + severity * 15,
          expLoss: severity * 80,
          demonIncrease: 5,
        },
      }

    case 'spirit_seal':
      return {
        triggered: true,
        type,
        description: `【灵力封印】天道降下封印，你的修为被暂时压制！`,
        effects: {
          insightLoss: severity * 3,
          goldLoss: Math.floor(state.gold * 0.05),
        },
      }

    case 'karma_chain':
      return {
        triggered: true,
        type,
        description: `【因果连锁】过去的恶行引发连锁反应！`,
        effects: {
          hpLoss: 50 + severity * 20,
          demonIncrease: 10,
          goldLoss: Math.floor(state.gold * 0.03),
        },
      }

    default:
      return { triggered: false, type: null, description: '', effects: {} }
  }
}

// ===== 善缘奇遇 =====

export interface FortuneEncounter {
  triggered: boolean
  type: 'hidden_realm' | 'npc_gift' | 'enlightenment' | 'spirit_beast' | 'treasure_map' | null
  description: string
  reward: { gold?: number; insight?: number; exp?: number; items?: Record<string, number> }
}

export function checkFortuneEncounter(state: GameState): FortuneEncounter {
  const karma = state.karma || 0
  const morality = state.morality || 0

  const totalGood = state.karmaLog
    .filter(e => e.type === 'good')
    .reduce((s, e) => s + e.amount, 0)
  const totalEvil = state.karmaLog
    .filter(e => e.type === 'evil')
    .reduce((s, e) => s + Math.abs(e.amount), 0)
  const netGood = totalGood - totalEvil

  // 善缘触发概率
  let chance = 0
  if (netGood > 50 && morality > 30) chance += 0.08
  if (netGood > 100 && morality > 60) chance += 0.05
  if (morality > 80) chance += 0.03

  if (chance === 0 || Math.random() > chance) {
    return { triggered: false, type: null, description: '', reward: {} }
  }

  const types: FortuneEncounter['type'][] = ['npc_gift', 'enlightenment', 'treasure_map']
  if (morality > 50) types.push('spirit_beast')
  if (morality > 70) types.push('hidden_realm')

  const type = types[Math.floor(Math.random() * types.length)]
  const tier = Math.floor(netGood / 50)

  switch (type) {
    case 'hidden_realm':
      return {
        triggered: true,
        type,
        description: `【善缘秘境】你在一处人迹罕至的地方发现了一座隐秘洞府！`,
        reward: {
          insight: 10 + tier * 5,
          gold: 200 + tier * 100,
        },
      }

    case 'npc_gift':
      return {
        triggered: true,
        type,
        description: `【恩人馈赠】一位受过你恩惠的修士找到你，送来了一份厚礼`,
        reward: {
          gold: 100 + tier * 50,
          items: { herb_lotus: 2 + tier, ore_silver: 1 + Math.floor(tier / 2) },
        },
      }

    case 'enlightenment':
      return {
        triggered: true,
        type,
        description: `【天道感悟】你对天道有了更深的理解，灵台一片清明`,
        reward: {
          insight: 15 + tier * 5,
          exp: 50 + tier * 30,
        },
      }

    case 'spirit_beast':
      return {
        triggered: true,
        type,
        description: `【灵兽亲近】一只灵兽被你的善念吸引，前来献礼`,
        reward: {
          gold: 80 + tier * 40,
          items: { beast_core: 1 + Math.floor(tier / 2) },
        },
      }

    case 'treasure_map':
      return {
        triggered: true,
        type,
        description: `【宝图奇缘】你在一处古树下的石碑上发现了一副藏宝图！`,
        reward: {
          insight: 5,
          gold: 50,
        },
      }

    default:
      return { triggered: false, type: null, description: '', reward: {} }
  }
}

// ===== 每日因果结算v3 =====

export interface DailyKarmaV3Result {
  wrath: HeavenWrathResult
  fortune: FortuneEncounter
  messages: string[]
}

export function runDailyKarmaV3(state: GameState): DailyKarmaV3Result {
  const messages: string[] = []

  // 1. 天道反噬检查
  const wrath = checkHeavenWrath(state)
  if (wrath.triggered) {
    messages.push(wrath.description)
    if (wrath.effects.hpLoss) state.hp = Math.max(1, (state.hp || 100) - wrath.effects.hpLoss)
    if (wrath.effects.expLoss) state.exp = Math.max(0, (state.exp || 0) - wrath.effects.expLoss)
    if (wrath.effects.goldLoss) state.gold = Math.max(0, (state.gold || 0) - wrath.effects.goldLoss)
    if (wrath.effects.insightLoss) state.insight = Math.max(0, (state.insight || 0) - wrath.effects.insightLoss)
    if (wrath.effects.demonIncrease) {
      // 增加心魔（通过state.innerDemons）
      if (!state.innerDemons) state.innerDemons = []
      const darkDemon = state.innerDemons.find(d => d.type === 'dark_arts')
      if (darkDemon) darkDemon.intensity = Math.min(100, darkDemon.intensity + wrath.effects.demonIncrease)
      else state.innerDemons.push({
        type: 'dark_arts', intensity: wrath.effects.demonIncrease,
        accumulatedMs: 0, lastTrigger: Date.now(), sealed: false,
      })
    }
  }

  // 2. 善缘奇遇检查
  const fortune = checkFortuneEncounter(state)
  if (fortune.triggered) {
    messages.push(fortune.description)
    if (fortune.reward.gold) state.gold += fortune.reward.gold
    if (fortune.reward.insight) state.insight = (state.insight || 0) + fortune.reward.insight
    if (fortune.reward.exp) {
      let remaining = fortune.reward.exp
      while (remaining > 0) {
        const need = state.level * 50
        if (state.exp + remaining >= need) {
          remaining -= need - state.exp
          state.level++
          state.exp = 0
          messages.push('等级提升！')
        } else {
          state.exp += remaining
          remaining = 0
        }
      }
    }
    if (fortune.reward.items) {
      for (const [k, v] of Object.entries(fortune.reward.items)) {
        state.materials[k] = (state.materials[k] || 0) + v
      }
    }
  }

  // 3. 因果链反应：被你伤害过的NPC的亲友可能来找麻烦
  if (Math.random() < 0.05) {
    for (const [npcId, rel] of Object.entries(state.playerNpcRelations)) {
      if (rel.favor <= -30 && rel.killedKnown && rel.killedKnown.length > 0) {
        const npc = state.proceduralNpcs.find(n => n.id === npcId && n.alive)
        if (npc && npc.isActive) {
          messages.push(`${npc.name}正在打探你的消息，似乎要为亲友报仇……`)
          break
        }
      }
    }
  }

  return { wrath, fortune, messages }
}
