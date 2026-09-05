// ---------- NPC社交模拟引擎 ----------
// 每日结算：NPC间互动、关系演变、社交事件

import type { GameState } from './state'
import type { ProceduralNpc, NpcRelationEntry, RelationType } from './procedural-npc'
import { getRelationLevelName } from './npc-relation-net'

// ===== 社交事件类型 =====

export interface SocialEvent {
  type: 'friendship_deepen' | 'conflict_escalate' | 'betrayal' | 'alliance_form'
      | 'trade_deal' | 'sparring' | 'rivalry_intensity' | 'romance' | 'mentorship'
  npcAId: string
  npcBId: string
  description: string
  relationDelta: number
  trustDelta: number
}

export interface DailySimResult {
  events: SocialEvent[]
  newRelations: NpcRelationEntry[]
  brokenRelations: string[]
  summaries: string[]
}

// ===== 每日社交结算 =====

export function runDailySocialSimulation(state: GameState): DailySimResult {
  const npcs = state.proceduralNpcs.filter(n => n.alive && n.isActive)
  const events: SocialEvent[] = []
  const newRelations: NpcRelationEntry[] = []
  const brokenRelations: string[] = []
  const summaries: string[] = []

  // 1. 已有关系演变
  for (const rel of state.npcRelationNet) {
    const a = npcs.find(n => n.id === rel.sourceId)
    const b = npcs.find(n => n.id === rel.targetId)
    if (!a || !b) continue

    const event = simulateRelationEvolution(a, b, rel)
    if (event) {
      events.push(event)
      applyRelationChange(a, b, rel, event)

      if (Math.abs(event.relationDelta) >= 15) {
        summaries.push(event.description)
      }

      // 关系破裂检测
      if (rel.level <= -80 && (rel.type === 'friend' || rel.type === 'partner' || rel.type === 'trade')) {
        brokenRelations.push(`${a.name}与${b.name}关系破裂`)
        a.eventLog.push(`与${b.name}决裂`)
        b.eventLog.push(`与${a.name}决裂`)
      }
    }
  }

  // 2. 新关系生成（随机配对）
  const maxNewRelations = Math.min(3, Math.floor(npcs.length / 3))
  for (let i = 0; i < maxNewRelations; i++) {
    const a = npcs[Math.floor(Math.random() * npcs.length)]
    const b = npcs[Math.floor(Math.random() * npcs.length)]
    if (a.id === b.id) continue
    if (a.location.domain !== b.location.domain) continue

    // 检查是否已有关系
    const existing = state.npcRelationNet.find(
      r => (r.sourceId === a.id && r.targetId === b.id) ||
            (r.sourceId === b.id && r.targetId === a.id)
    )
    if (existing) continue

    const newRel = tryFormNewRelation(a, b)
    if (newRel) {
      newRelations.push(newRel)
      a.relations.push({ targetId: b.id, type: newRel.type, level: newRel.level })
      b.relations.push({ targetId: a.id, type: reverseType(newRel.type), level: newRel.level })
      summaries.push(`${a.name}与${b.name}建立了${relationTypeName(newRel.type)}关系`)
    }
  }

  // 3. NPC心情与状态变化
  for (const npc of npcs) {
    simulateMoodChange(npc)
  }

  // 4. 玩家关系影响NPC社交
  for (const [npcId, playerRel] of Object.entries(state.playerNpcRelations)) {
    const npc = npcs.find(n => n.id === npcId)
    if (!npc || !npc.alive) continue

    // 玩家好友的NPC朋友可能对玩家产生好感
    if (playerRel.favor >= 30) {
      for (const rel of npc.relations) {
        if (rel.type === 'friend' || rel.type === 'family') {
          const friend = npcs.find(n => n.id === rel.targetId)
          if (!friend) continue
          const friendPlayerRel = state.playerNpcRelations[friend.id]
          if (!friendPlayerRel) {
            // 有概率通过朋友认识新NPC
            if (Math.random() < 0.1) {
              state.playerNpcRelations[friend.id] = {
                npcId: friend.id,
                favor: 5,
                trust: 0,
                fear: 0,
                saved: false,
                killedKnown: [],
                metCount: 0,
                lastInteract: Date.now(),
              }
              summaries.push(`通过${npc.name}，你结识了${friend.name}`)
            }
          }
        }
      }
    }

    // 玩家仇敌的NPC仇敌可能成为潜在盟友
    if (playerRel.favor <= -30) {
      for (const rel of npc.relations) {
        if (rel.type === 'enemy' || rel.type === 'rival') {
          const enemy = npcs.find(n => n.id === rel.targetId)
          if (!enemy) continue
          const enemyPlayerRel = state.playerNpcRelations[enemy.id]
          if (!enemyPlayerRel && Math.random() < 0.08) {
            state.playerNpcRelations[enemy.id] = {
              npcId: enemy.id,
              favor: 8,
              trust: 2,
              fear: 0,
              saved: false,
              killedKnown: [],
              metCount: 0,
              lastInteract: Date.now(),
            }
            summaries.push(`${npc.name}的仇敌${enemy.name}对你产生了兴趣（敌人的敌人即朋友）`)
          }
        }
      }
    }
  }

  return { events, newRelations, brokenRelations, summaries }
}

// ===== 关系演变模拟 =====

function simulateRelationEvolution(
  a: ProceduralNpc,
  b: ProceduralNpc,
  rel: NpcRelationEntry,
): SocialEvent | null {
  const roll = Math.random()

  switch (rel.type) {
    case 'friend': {
      if (roll < 0.15) {
        const delta = 2 + Math.floor(Math.random() * 6)
        return {
          type: 'friendship_deepen',
          npcAId: a.id, npcBId: b.id,
          description: `${a.name}与${b.name}切磋论道，友谊加深`,
          relationDelta: delta, trustDelta: delta,
        }
      }
      if (roll < 0.18 && a.morality < -20) {
        return {
          type: 'betrayal',
          npcAId: a.id, npcBId: b.id,
          description: `${a.name}暗算${b.name}，友谊出现裂痕`,
          relationDelta: -25, trustDelta: -30,
        }
      }
      break
    }

    case 'enemy': {
      if (roll < 0.12) {
        return {
          type: 'conflict_escalate',
          npcAId: a.id, npcBId: b.id,
          description: `${a.name}与${b.name}再起冲突，仇恨加深`,
          relationDelta: -8, trustDelta: -5,
        }
      }
      if (roll < 0.15) {
        return {
          type: 'alliance_form',
          npcAId: a.id, npcBId: b.id,
          description: `${a.name}与${b.name}迫于形势暂时联手`,
          relationDelta: 15, trustDelta: 5,
        }
      }
      break
    }

    case 'rival': {
      if (roll < 0.2) {
        return {
          type: 'rivalry_intensity',
          npcAId: a.id, npcBId: b.id,
          description: `${a.name}与${b.name}暗中较劲，竞争加剧`,
          relationDelta: -3, trustDelta: -2,
        }
      }
      if (roll < 0.25 && rel.level > -20) {
        return {
          type: 'sparring',
          npcAId: a.id, npcBId: b.id,
          description: `${a.name}与${b.name}切磋比试，惺惺相惜`,
          relationDelta: 5, trustDelta: 3,
        }
      }
      break
    }

    case 'trade': {
      if (roll < 0.2) {
        return {
          type: 'trade_deal',
          npcAId: a.id, npcBId: b.id,
          description: `${a.name}与${b.name}完成一笔交易，互利共赢`,
          relationDelta: 3, trustDelta: 2,
        }
      }
      break
    }

    case 'partner': {
      if (roll < 0.1) {
        return {
          type: 'romance',
          npcAId: a.id, npcBId: b.id,
          description: `${a.name}与${b.name}感情升温，琴瑟和鸣`,
          relationDelta: 8, trustDelta: 6,
        }
      }
      break
    }

    case 'master':
    case 'disciple': {
      if (roll < 0.15) {
        return {
          type: 'mentorship',
          npcAId: a.id, npcBId: b.id,
          description: `${a.name}指点${b.name}修行，师徒情谊加深`,
          relationDelta: 4, trustDelta: 3,
        }
      }
      break
    }

    case 'family': {
      if (roll < 0.1) {
        return {
          type: 'friendship_deepen',
          npcAId: a.id, npcBId: b.id,
          description: `${a.name}与${b.name}亲情维系，守望相助`,
          relationDelta: 3, trustDelta: 2,
        }
      }
      break
    }
  }

  return null
}

function tryFormNewRelation(a: ProceduralNpc, b: ProceduralNpc): NpcRelationEntry | null {
  // 同道途+同境界 → 同门/好友
  if (a.daoPath === b.daoPath && Math.abs(a.realm - b.realm) <= 1) {
    if (Math.random() < 0.35) {
      return {
        sourceId: a.id, targetId: b.id,
        type: 'friend', level: 10 + Math.floor(Math.random() * 15),
      }
    }
  }

  // 道德相近 → 好友
  if (Math.abs(a.morality - b.morality) < 20 && Math.random() < 0.2) {
    return {
      sourceId: a.id, targetId: b.id,
      type: 'friend', level: 5 + Math.floor(Math.random() * 15),
    }
  }

  // 道德相反 → 仇敌
  if (Math.abs(a.morality - b.morality) > 50 && Math.random() < 0.25) {
    return {
      sourceId: a.id, targetId: b.id,
      type: 'enemy', level: -20 - Math.floor(Math.random() * 20),
    }
  }

  // 同职业 → 交易伙伴
  if (a.profession === b.profession && Math.random() < 0.2) {
    return {
      sourceId: a.id, targetId: b.id,
      type: 'trade', level: 8 + Math.floor(Math.random() * 12),
    }
  }

  // 境界差距大 → 师徒
  if (Math.abs(a.realm - b.realm) >= 2 && Math.random() < 0.15) {
    const master = a.realm > b.realm ? a : b
    const disciple = a.realm > b.realm ? b : a
    return {
      sourceId: master.id, targetId: disciple.id,
      type: 'master', level: 15 + Math.floor(Math.random() * 15),
    }
  }

  // 随机相识
  if (Math.random() < 0.1) {
    return {
      sourceId: a.id, targetId: b.id,
      type: 'acquaintance', level: Math.floor(Math.random() * 10),
    }
  }

  return null
}

function simulateMoodChange(npc: ProceduralNpc): void {
  // 基于近期事件调整心情
  const recentEvents = npc.eventLog.slice(-3)
  let moodShift = 0

  for (const evt of recentEvents) {
    if (evt.includes('感激') || evt.includes('欣喜') || evt.includes('友谊')) moodShift += 1
    if (evt.includes('仇恨') || evt.includes('暗算') || evt.includes('背叛')) moodShift -= 1
  }

  if (moodShift !== 0) {
    npc.morality = Math.max(-100, Math.min(100, npc.morality + moodShift))
  }
}

function applyRelationChange(
  a: ProceduralNpc,
  b: ProceduralNpc,
  rel: NpcRelationEntry,
  event: SocialEvent,
): void {
  rel.level = Math.max(-100, Math.min(100, rel.level + event.relationDelta))

  // 同步到NPC个体关系列表
  const aRel = a.relations.find(r => r.targetId === b.id)
  const bRel = b.relations.find(r => r.targetId === a.id)
  if (aRel) aRel.level = rel.level
  if (bRel) bRel.level = rel.level

  // 记录事件日志
  a.eventLog.push(event.description)
  b.eventLog.push(event.description)
}

function reverseType(type: RelationType): RelationType {
  const map: Record<RelationType, RelationType> = {
    master: 'disciple', disciple: 'master', partner: 'partner',
    friend: 'friend', enemy: 'enemy', rival: 'rival',
    family: 'family', benefactor: 'benefactor', trade: 'trade',
    acquaintance: 'acquaintance',
  }
  return map[type] || type
}

function relationTypeName(type: RelationType): string {
  const names: Record<RelationType, string> = {
    master: '师徒', disciple: '师徒', partner: '道侣',
    friend: '好友', enemy: '仇敌', rival: '竞争对手',
    family: '亲族', benefactor: '恩人', trade: '交易',
    acquaintance: '相识',
  }
  return names[type] || type
}

// ===== 查询NPC社交状态摘要 =====

export function getNpcSocialSummary(npc: ProceduralNpc, state: GameState): string[] {
  const lines: string[] = []
  const relations = npc.relations.filter(r => r.level !== 0)
  if (relations.length === 0) {
    lines.push('此人在此间并无熟人')
    return lines
  }

  const closeFriends = relations.filter(r => r.type === 'friend' && r.level >= 30)
  const enemies = relations.filter(r => r.type === 'enemy' && r.level <= -30)
  const family = relations.filter(r => r.type === 'family')
  const partners = relations.filter(r => r.type === 'partner')
  const masters = relations.filter(r => r.type === 'master' || r.type === 'disciple')

  if (closeFriends.length > 0) {
    const names = closeFriends.slice(0, 3).map(r => {
      const n = state.proceduralNpcs.find(npc => npc.id === r.targetId)
      return n?.name || '??'
    })
    lines.push(`至交好友：${names.join('、')}`)
  }
  if (enemies.length > 0) {
    const names = enemies.slice(0, 3).map(r => {
      const n = state.proceduralNpcs.find(npc => npc.id === r.targetId)
      return n?.name || '??'
    })
    lines.push(`仇敌：${names.join('、')}`)
  }
  if (family.length > 0) {
    const names = family.slice(0, 3).map(r => {
      const n = state.proceduralNpcs.find(npc => npc.id === r.targetId)
      return n?.name || '??'
    })
    lines.push(`亲族：${names.join('、')}`)
  }
  if (partners.length > 0) {
    const n = state.proceduralNpcs.find(npc => npc.id === partners[0].targetId)
    if (n) lines.push(`道侣：${n.name}`)
  }
  if (masters.length > 0) {
    const names = masters.slice(0, 2).map(r => {
      const n = state.proceduralNpcs.find(npc => npc.id === r.targetId)
      return n?.name || '??'
    })
    lines.push(`师徒：${names.join('、')}`)
  }

  return lines
}
