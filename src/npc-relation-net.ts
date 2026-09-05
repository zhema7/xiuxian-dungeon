// ---------- NPC关系网系统 ----------
// NPC间关系的生成、查询和玩家行为的连锁反应

import type { GameState } from './state'
import type { ProceduralNpc, NpcRelationEntry, RelationType } from './procedural-npc'

// ===== 生成NPC关系网 =====

export function generateNpcRelations(state: GameState): void {
  const npcs = state.proceduralNpcs.filter(n => n.alive)
  const entries: NpcRelationEntry[] = []

  for (let i = 0; i < npcs.length; i++) {
    for (let j = i + 1; j < npcs.length; j++) {
      const a = npcs[i]
      const b = npcs[j]
      const chance = 0.15 // 15%概率有关系
      if (Math.random() < chance) {
        const relation = generateRelation(a, b)
        if (relation) {
          entries.push(relation)
          // 双向关系
          a.relations.push({ targetId: b.id, type: relation.type, level: relation.level })
          b.relations.push({ targetId: a.id, type: reverseRelationType(relation.type), level: relation.level })
        }
      }
    }
  }

  state.npcRelationNet = entries
}

function generateRelation(a: ProceduralNpc, b: ProceduralNpc): NpcRelationEntry | null {
  // 同域NPC更容易有关系
  if (a.location.domain !== b.location.domain) return null

  // 同姓可能是家族关系
  if (a.name.charAt(0) === b.name.charAt(0) && Math.random() < 0.3) {
    return {
      sourceId: a.id,
      targetId: b.id,
      type: 'family',
      level: Math.floor(Math.random() * 30) + 20,
    }
  }

  // 同道途可能是同门
  if (a.daoPath === b.daoPath && Math.random() < 0.2) {
    const isRival = Math.random() < 0.3
    return {
      sourceId: a.id,
      targetId: b.id,
      type: isRival ? 'rival' : 'friend',
      level: isRival ? -Math.floor(Math.random() * 30) - 10 : Math.floor(Math.random() * 20) + 10,
    }
  }

  // 道德相反可能是仇敌
  if ((a.morality > 30 && b.morality < -30) || (a.morality < -30 && b.morality > 30)) {
    if (Math.random() < 0.4) {
      return {
        sourceId: a.id,
        targetId: b.id,
        type: 'enemy',
        level: -Math.floor(Math.random() * 40) - 30,
      }
    }
  }

  // 同职业可能是交易伙伴
  if (a.profession === b.profession && Math.random() < 0.15) {
    return {
      sourceId: a.id,
      targetId: b.id,
      type: 'trade',
      level: Math.floor(Math.random() * 20) + 10,
    }
  }

  // 随机好友/相识
  if (Math.random() < 0.1) {
    return {
      sourceId: a.id,
      targetId: b.id,
      type: 'friend',
      level: Math.floor(Math.random() * 25) + 10,
    }
  }

  return null
}

function reverseRelationType(type: RelationType): RelationType {
  const map: Record<RelationType, RelationType> = {
    master: 'disciple',
    disciple: 'master',
    partner: 'partner',
    friend: 'friend',
    enemy: 'enemy',
    rival: 'rival',
    family: 'family',
    benefactor: 'benefactor',
    trade: 'trade',
    acquaintance: 'acquaintance',
  }
  return map[type] || type
}

// ===== 玩家行为的连锁反应 =====

export function onPlayerKillNpc(state: GameState, killedNpc: ProceduralNpc): string[] {
  const messages: string[] = []
  // 找到被杀NPC的关系网
  for (const rel of killedNpc.relations) {
    const targetNpc = state.proceduralNpcs.find(n => n.id === rel.targetId)
    if (!targetNpc || !targetNpc.alive) continue

    if (rel.type === 'friend' || rel.type === 'family' || rel.type === 'partner' || rel.type === 'master' || rel.type === 'disciple') {
      // 亲友被杀 → 对玩家仇恨
      const playerRel = state.playerNpcRelations[targetNpc.id]
      if (playerRel) {
        playerRel.favor -= 60
        playerRel.trust = Math.max(0, playerRel.trust - 40)
      } else {
        state.playerNpcRelations[targetNpc.id] = {
          npcId: targetNpc.id,
          favor: -50,
          trust: 0,
          fear: 30,
          saved: false,
          killedKnown: [killedNpc.id],
          metCount: 0,
          lastInteract: Date.now(),
        }
      }
      targetNpc.eventLog.push(`道友${killedNpc.name}被玩家所杀，誓要报仇`)
      messages.push(`${targetNpc.name} 得知道友${killedNpc.name}被杀，对你心生仇恨！`)
    } else if (rel.type === 'enemy' || rel.type === 'rival') {
      // 仇敌被杀 → 对玩家好感可能提升
      const playerRel = state.playerNpcRelations[targetNpc.id]
      if (playerRel) {
        playerRel.favor += 10
      }
      targetNpc.eventLog.push(`宿敌${killedNpc.name}被玩家所杀`)
      messages.push(`${targetNpc.name} 得知宿敌${killedNpc.name}被杀，对你略有好感`)
    }
  }

  return messages
}

export function onPlayerHelpNpc(state: GameState, helpedNpc: ProceduralNpc): string[] {
  const messages: string[] = []
  for (const rel of helpedNpc.relations) {
    if (rel.type === 'friend' || rel.type === 'family' || rel.type === 'partner') {
      const targetNpc = state.proceduralNpcs.find(n => n.id === rel.targetId)
      if (!targetNpc || !targetNpc.alive) continue
      const playerRel = state.playerNpcRelations[targetNpc.id]
      if (playerRel) {
        playerRel.favor += 5
      }
      targetNpc.eventLog.push(`道友${helpedNpc.name}被玩家所救`)
      messages.push(`${targetNpc.name} 得知道友${helpedNpc.name}被你救助，对你略有好感`)
    }
  }
  return messages
}

// ===== 查询关系 =====

export function getNpcRelation(
  state: GameState,
  npcAId: string,
  npcBId: string,
): NpcRelationEntry | undefined {
  return state.npcRelationNet.find(
    r => (r.sourceId === npcAId && r.targetId === npcBId) ||
          (r.sourceId === npcBId && r.targetId === npcAId)
  )
}

export function getPlayerNpcRelation(
  state: GameState,
  npcId: string,
): PlayerNpcRelation | undefined {
  return state.playerNpcRelations[npcId]
}

// 从 procedural-npc.ts 导入类型
import type { PlayerNpcRelation } from './procedural-npc'

export function getRelationLevelName(level: number): string {
  if (level >= 60) return '至交'
  if (level >= 30) return '好友'
  if (level >= 10) return '相识'
  if (level >= -10) return '泛泛'
  if (level >= -30) return '不满'
  if (level >= -50) return '敌视'
  return '仇敌'
}
