// ---------- 因果业力系统 ----------
// 道德值/声望值/业力值的管理与报应触发

import type { GameState } from './state'
import type { ProceduralNpc } from './procedural-npc'

export interface KarmaEntry {
  time: number
  type: 'good' | 'evil'
  amount: number
  description: string
  targetNpcId?: string
}

export interface KarmaRetribution {
  type: 'gratitude' | 'revenge' | 'fortune' | 'backlash' | 'heaven_tribulation'
  description: string
  triggered: boolean
}

// ===== 道德值操作 =====

export function addMorality(state: GameState, amount: number, reason: string): void {
  state.morality = Math.max(-100, Math.min(100, state.morality + amount))
  // 道德值变化影响声望
  if (amount > 0) {
    state.reputation = Math.min(9999, state.reputation + Math.floor(amount * 0.3))
  } else {
    state.reputation = Math.max(-9999, state.reputation + Math.floor(amount * 0.5))
  }
}

// ===== 业力操作 =====

export function addKarma(
  state: GameState,
  amount: number,
  description: string,
  targetNpcId?: string,
): void {
  state.karma += amount
  state.karmaLog.push({
    time: Date.now(),
    type: amount > 0 ? 'good' : 'evil',
    amount,
    description,
    targetNpcId,
  })
  // 业力日志上限
  if (state.karmaLog.length > 200) {
    state.karmaLog = state.karmaLog.slice(-200)
  }
}

// ===== 具体行为 =====

export function onKillInnocent(state: GameState, npc: ProceduralNpc): void {
  addMorality(state, -15, `杀害无辜修士${npc.name}`)
  addKarma(state, -20, `杀害${npc.name}（${npc.profession}）`, npc.id)
  // 通知NPC关系网
  notifyNpcRelations(state, npc, 'killed_by_player')
}

export function onKillEvilCultivator(state: GameState, npc: ProceduralNpc): void {
  addMorality(state, 5, `斩杀邪修${npc.name}`)
  addKarma(state, 10, `斩杀邪修${npc.name}`, npc.id)
  state.reputation = Math.min(9999, state.reputation + 5)
}

export function onHelpNpc(state: GameState, npc: ProceduralNpc): void {
  addMorality(state, 3, `救助${npc.name}`)
  addKarma(state, 8, `救助${npc.name}`, npc.id)
}

export function onPlunderNpc(state: GameState, npc: ProceduralNpc): void {
  addMorality(state, -10, `劫掠${npc.name}`)
  addKarma(state, -12, `劫掠${npc.name}`, npc.id)
}

export function onTeachDisciple(state: GameState, discipleName: string): void {
  addKarma(state, 5, `传授功法给弟子${discipleName}`)
}

// ===== 因果报应检查 =====

export function checkRetribution(state: GameState): KarmaRetribution | null {
  const totalEvil = state.karmaLog
    .filter(e => e.type === 'evil')
    .reduce((sum, e) => sum + e.amount, 0)
  const totalGood = state.karmaLog
    .filter(e => e.type === 'good')
    .reduce((sum, e) => sum + e.amount, 0)

  // 恶业积累触发反噬
  if (totalEvil < -50 && Math.random() < 0.1) {
    const types = [
      '走火入魔：修为受损',
      '被正道修士追查',
      '心魔滋生',
      '修炼遇到瓶颈',
    ]
    return {
      type: 'backlash',
      description: types[Math.floor(Math.random() * types.length)],
      triggered: true,
    }
  }

  // 善业积累触发奇遇
  if (totalGood > 50 && Math.random() < 0.05) {
    const types = [
      '路遇贵人相助',
      '意外获得前辈传承',
      '妖兽报恩送来灵草',
      '悟性提升，修炼加速',
    ]
    return {
      type: 'fortune',
      description: types[Math.floor(Math.random() * types.length)],
      triggered: true,
    }
  }

  return null
}

// ===== 通知NPC关系网 =====

function notifyNpcRelations(
  state: GameState,
  npc: ProceduralNpc,
  event: string,
): void {
  // 通知NPC的关系网中的其他NPC
  for (const rel of npc.relations) {
    const targetNpc = state.proceduralNpcs.find(n => n.id === rel.targetId)
    if (targetNpc && targetNpc.alive) {
      if (event === 'killed_by_player') {
        // 亲友记恨玩家，仇人可能高兴
        if (rel.type === 'friend' || rel.type === 'family' || rel.type === 'partner' || rel.type === 'master' || rel.type === 'disciple') {
          targetNpc.eventLog.push(`道友${npc.name}被玩家所杀，心中悲愤`)
        } else if (rel.type === 'enemy' || rel.type === 'rival') {
          targetNpc.eventLog.push(`宿敌${npc.name}被玩家所杀，暗自庆幸`)
        }
      }
    }
  }
}

// ===== 道德等级 =====

export function getMoralityTier(morality: number): { name: string; color: string } {
  if (morality >= 80) return { name: '大善', color: '#4ade80' }
  if (morality >= 40) return { name: '行善', color: '#86efac' }
  if (morality >= 10) return { name: '正派', color: '#bef264' }
  if (morality >= -10) return { name: '中立', color: '#e2e8f0' }
  if (morality >= -40) return { name: '偏邪', color: '#fda4af' }
  if (morality >= -80) return { name: '邪修', color: '#f87171' }
  return { name: '魔道', color: '#dc2626' }
}

export function getReputationTier(reputation: number): { name: string } {
  if (reputation >= 500) return { name: '名震天下' }
  if (reputation >= 200) return { name: '声名远播' }
  if (reputation >= 50) return { name: '小有名气' }
  if (reputation >= 0) return { name: '默默无闻' }
  if (reputation >= -50) return { name: '恶名初显' }
  if (reputation >= -200) return { name: '声名狼藉' }
  return { name: '人人喊打' }
}
