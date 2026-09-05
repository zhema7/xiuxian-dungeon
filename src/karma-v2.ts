// ---------- 因果报应v2 ----------
// 远期追踪 + 仇人寻仇 + 恩人报恩 + 天道反噬 + 随机因果事件

import type { GameState } from './state'
import type { ProceduralNpc } from './procedural-npc'
import { getPlayerNpcRelation } from './npc-relation-net'
import { addKarma, addMorality } from './karma'

// ===== 仇人寻仇系统 =====

export interface RevengeEvent {
  npcId: string
  npcName: string
  type: 'ambush' | 'challenge' | 'bounty' | 'curse'
  description: string
  dangerLevel: number // 1-5
}

export function checkEnemyRevenge(state: GameState): RevengeEvent | null {
  // 查找对玩家有深仇大恨的NPC
  const enemies: ProceduralNpc[] = []

  for (const [npcId, rel] of Object.entries(state.playerNpcRelations)) {
    if (rel.favor <= -40) {
      const npc = state.proceduralNpcs.find(n => n.id === npcId && n.alive)
      if (npc && npc.isActive) {
        enemies.push(npc)
      }
    }
  }

  if (enemies.length === 0) return null

  // 每日有概率触发寻仇事件
  if (Math.random() > 0.08) return null

  const enemy = enemies[Math.floor(Math.random() * enemies.length)]
  const rel = state.playerNpcRelations[enemy.id]
  const dangerLevel = Math.min(5, Math.max(1, Math.floor(-rel.favor / 15)))

  const eventTypes: { type: RevengeEvent['type']; desc: string }[] = [
    { type: 'ambush', desc: `${enemy.name}设伏偷袭，要你血债血偿！` },
    { type: 'challenge', desc: `${enemy.name}发出挑战书，约你生死决斗！` },
    { type: 'bounty', desc: `${enemy.name}悬赏追杀你，引来其他修士的觊觎！` },
    { type: 'curse', desc: `${enemy.name}以秘术诅咒你，修为受损！` },
  ]

  const evt = eventTypes[Math.floor(Math.random() * eventTypes.length)]

  // 诅咒效果
  if (evt.type === 'curse') {
    state.hp = Math.max(1, state.hp - dangerLevel * 15)
    addKarma(state, -5, `被${enemy.name}诅咒`, enemy.id)
  }

  // 悬赏效果：降低声望
  if (evt.type === 'bounty') {
    state.reputation -= dangerLevel * 10
  }

  return {
    npcId: enemy.id,
    npcName: enemy.name,
    type: evt.type,
    description: evt.desc,
    dangerLevel,
  }
}

// ===== 恩人报恩系统 =====

export interface GratitudeEvent {
  npcId: string
  npcName: string
  type: 'gift' | 'info' | 'assist' | 'referral' | 'protection'
  description: string
  reward: { gold?: number; item?: string; itemCount?: number; insight?: number; exp?: number }
}

export function checkBenefactorReward(state: GameState): GratitudeEvent | null {
  const benefactors: ProceduralNpc[] = []

  for (const [npcId, rel] of Object.entries(state.playerNpcRelations)) {
    if (rel.favor >= 40 && rel.saved) {
      const npc = state.proceduralNpcs.find(n => n.id === npcId && n.alive)
      if (npc && npc.isActive) {
        benefactors.push(npc)
      }
    }
  }

  if (benefactors.length === 0) return null

  // 每日有概率触发报恩事件
  if (Math.random() > 0.06) return null

  const benefactor = benefactors[Math.floor(Math.random() * benefactors.length)]
  const rel = state.playerNpcRelations[benefactor.id]

  const eventTypes: { type: GratitudeEvent['type']; desc: (n: string) => string; reward: GratitudeEvent['reward'] }[] = [
    {
      type: 'gift',
      desc: (n) => `${n}感念旧恩，送来一份谢礼`,
      reward: { gold: 50 + benefactor.realm * 30 },
    },
    {
      type: 'info',
      desc: (n) => `${n}传来消息，告知你一处秘境的下落`,
      reward: { insight: 5 + benefactor.realm * 2 },
    },
    {
      type: 'assist',
      desc: (n) => `${n}出手相助，帮你击退了强敌`,
      reward: { exp: 30 + benefactor.realm * 20 },
    },
    {
      type: 'referral',
      desc: (n) => `${n}将你引荐给一位前辈，获得指点`,
      reward: { exp: 50 + benefactor.realm * 25, insight: 3 },
    },
    {
      type: 'protection',
      desc: (n) => `${n}暗中护佑，帮你化解了一次危机`,
      reward: { insight: 2 },
    },
  ]

  const evt = eventTypes[Math.floor(Math.random() * eventTypes.length)]
  addMorality(state, 1, `受到${benefactor.name}的报恩`)

  return {
    npcId: benefactor.id,
    npcName: benefactor.name,
    type: evt.type,
    description: evt.desc(benefactor.name),
    reward: evt.reward,
  }
}

// ===== 天道反噬系统 =====

export function checkHeavenBacklash(state: GameState): string | null {
  // 累积恶业超过阈值触发天道反噬
  const totalEvil = state.karmaLog
    .filter(e => e.type === 'evil')
    .reduce((sum, e) => sum + Math.abs(e.amount), 0)

  const totalGood = state.karmaLog
    .filter(e => e.type === 'good')
    .reduce((sum, e) => sum + e.amount, 0)

  const netEvil = totalEvil - totalGood

  // 严重恶业
  if (netEvil > 80 && state.morality < -50 && Math.random() < 0.15) {
    const effects = [
      '天雷降下！修为受损，HP大幅降低',
      '心魔入侵！修炼进度倒退',
      '天道警示！突破概率降低',
      '灵气逆行！一段时间内修炼效率减半',
      '业火焚烧！灵石和材料损失',
    ]
    const effect = effects[Math.floor(Math.random() * effects.length)]

    // 实际惩罚效果
    if (effect.includes('HP')) {
      state.hp = Math.max(1, state.hp - 50)
    } else if (effect.includes('灵石')) {
      const loss = Math.min(state.gold, Math.floor(state.gold * 0.1))
      state.gold -= loss
    } else if (effect.includes('修炼')) {
      state.exp = Math.max(0, state.exp - state.level * 10)
    }

    return `【天道反噬】${effect}`
  }

  // 大善积累触发天道眷顾
  if (netEvil < -50 && state.morality > 50 && Math.random() < 0.08) {
    const effects = [
      '天道眷顾！修炼效率大幅提升',
      '福至心灵！悟道点增加',
      '机缘降临！发现一处隐藏秘境',
      '灵气汇聚！HP全满',
      '贵人相助！获得稀有材料',
    ]
    const effect = effects[Math.floor(Math.random() * effects.length)]

    // 实际奖励效果
    if (effect.includes('HP全满')) {
      state.hp = state.level * 100 + 200
    } else if (effect.includes('悟道')) {
      state.insight = (state.insight || 0) + 5
    } else if (effect.includes('材料')) {
      const mats = ['herb_lotus', 'ore_silver', 'beast_core']
      const mat = mats[Math.floor(Math.random() * mats.length)]
      state.materials[mat] = (state.materials[mat] || 0) + 2
    }

    return `【天道眷顾】${effect}`
  }

  return null
}

// ===== 每日因果结算 =====

export interface DailyKarmaResult {
  revenge: RevengeEvent | null
  gratitude: GratitudeEvent | null
  backlash: string | null
  messages: string[]
}

export function runDailyKarmaCheck(state: GameState): DailyKarmaResult {
  const messages: string[] = []

  const revenge = checkEnemyRevenge(state)
  if (revenge) {
    messages.push(revenge.description)
  }

  const gratitude = checkBenefactorReward(state)
  if (gratitude) {
    messages.push(gratitude.description)
    // 给奖励
    if (gratitude.reward.gold) state.gold += gratitude.reward.gold
    if (gratitude.reward.insight) state.insight = (state.insight || 0) + gratitude.reward.insight
    if (gratitude.reward.exp) {
      let remaining = gratitude.reward.exp
      while (remaining > 0) {
        const need = state.level * 50
        if (state.exp + remaining >= need) {
          remaining -= need - state.exp
          state.level++
          state.exp = 0
        } else {
          state.exp += remaining
          remaining = 0
        }
      }
    }
  }

  const backlash = checkHeavenBacklash(state)
  if (backlash) {
    messages.push(backlash)
  }

  return { revenge, gratitude, backlash, messages }
}
