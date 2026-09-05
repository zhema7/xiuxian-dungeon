// ---------- 宗门战争与势力博弈 ----------
// 资源争夺 + 联盟系统 + 吞并灭门

import type { GameState } from './state'
import type { AiSect } from './ai-sect-data'
import { getBuildingEffects } from './sect-building-v2'
import { getDemonSummary } from './inner-demon'

// ===== 战争类型 =====

export type WarType =
  | 'resource_raid'    // 资源劫掠
  | 'sect_invasion'    // 宗门入侵
  | 'alliance_war'     // 联盟战争
  | 'annexation'      // 吞并
  | 'defense'         // 防御战

export type WarStatus = 'pending' | 'ongoing' | 'victory' | 'defeat' | 'truce'

export interface SectWar {
  id: string
  type: WarType
  attacker: string     // 进攻方ID
  defender: string     // 防守方ID
  startTime: number
  status: WarStatus
  stakeResource?: 'stone' | 'herb' | 'ore' | 'wood' | 'insight'  // 争夺资源
  stakeAmount: number
  result?: string
}

// ===== 联盟系统 =====

export type AllianceStatus = 'active' | 'dissolved' | 'at_war'

export interface Alliance {
  id: string
  name: string
  memberIds: string[]  // 宗门ID
  leaderId: string
  foundedTime: number
  status: AllianceStatus
  mutualDefense: boolean  // 共同防御
  tradeAgreement: boolean // 贸易协定
}

// ===== 宗门实力评估 =====

export function evaluateSectPower(state: GameState, sectId: string): number {
  if (sectId === 'player') {
    if (!state.sect) return Math.floor(state.level * 50 + state.realm * 80)
    const effects = getBuildingEffects(state.sect)
    const disciplePower = (state.disciples || []).reduce((s, d) => {
      return s + d.level * 10 + d.loyalty * 0.5
    }, 0)
    const buildingPower = Object.entries(state.sect.buildings).reduce((s, [, lv]) => s + (lv as number) * 15, 0)
    return Math.floor(disciplePower + buildingPower + effects.defensePower * 0.3 + state.realm * 100 + 200)
  }

  const aiSect = state.aiSects.find(s => s.id === sectId)
  if (!aiSect) return 0
  return Math.floor(aiSect.level * 100 + (aiSect.discipleCount || 0) * 30 + 150)
}

// ===== 发动战争 =====

export function declareWar(
  state: GameState,
  attackerId: string,
  defenderId: string,
  type: WarType,
): { ok: boolean; war?: SectWar; reason: string } {
  // 检查双方是否存在
  const attackerPower = evaluateSectPower(state, attackerId)
  const defenderPower = evaluateSectPower(state, defenderId)

  if (attackerPower === 0) return { ok: false, reason: '进攻方不存在' }
  if (defenderPower === 0) return { ok: false, reason: '防守方不存在' }

  // 检查是否已在交战
  // (state as any).sectWars might not exist yet
  const wars = (state as any).sectWars as SectWar[] | undefined
  if (wars) {
    const existing = wars.find(w =>
      w.status === 'ongoing' &&
      ((w.attacker === attackerId && w.defender === defenderId) ||
       (w.attacker === defenderId && w.defender === attackerId))
    )
    if (existing) return { ok: false, reason: '双方已在交战中' }
  }

  // 检查联盟关系
  const alliances = (state as any).alliances as Alliance[] | undefined
  if (alliances && type !== 'defense') {
    const sameAlliance = alliances.find(a =>
      a.status === 'active' &&
      a.memberIds.includes(attackerId) &&
      a.memberIds.includes(defenderId)
    )
    if (sameAlliance) return { ok: false, reason: '双方在同一联盟中' }
  }

  // 计算战争赌注
  const stakeAmount = Math.floor(20 + Math.min(attackerPower, defenderPower) * 0.1)
  const stakeResources: SectWar['stakeResource'][] = ['stone', 'herb', 'ore', 'wood', 'insight']
  const stakeResource = stakeResources[Math.floor(Math.random() * stakeResources.length)]

  const war: SectWar = {
    id: `war_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type,
    attacker: attackerId,
    defender: defenderId,
    startTime: Date.now(),
    status: 'ongoing',
    stakeResource,
    stakeAmount,
  }

  if (!(state as any).sectWars) (state as any).sectWars = []
  ;(state as any).sectWars.push(war)

  return { ok: true, war, reason: '' }
}

// ===== 模拟战争结果 =====

export interface WarResult {
  warId: string
  winner: string
  loser: string
  resourcesGained: number
  resourceType: SectWar['stakeResource']
  annihilated: boolean  // 是否灭门
  description: string
  messages: string[]
}

export function resolveWar(state: GameState, war: SectWar): WarResult {
  const attackerPower = evaluateSectPower(state, war.attacker)
  const defenderPower = evaluateSectPower(state, war.defender)

  // 加入随机因素（0.7~1.3 倍波动）
  const attackerRoll = attackerPower * (0.7 + Math.random() * 0.6)
  const defenderRoll = defenderPower * (0.7 + Math.random() * 0.6)

  const messages: string[] = []
  let winner: string, loser: string

  if (attackerRoll >= defenderRoll) {
    winner = war.attacker
    loser = war.defender
  } else {
    winner = war.defender
    loser = war.attacker
  }

  // 计算资源转移
  let resourcesGained = war.stakeAmount
  if (winner === war.attacker) {
    resourcesGained = Math.floor(war.stakeAmount * 1.2)
  }

  // 实际执行资源转移
  const resourceType = war.stakeResource || 'stone'
  if (winner === 'player') {
    if (state.sect) {
      state.sect.resources[resourceType] = (state.sect.resources[resourceType] || 0) + resourcesGained
      messages.push(`宗门获得${resourceType}×${resourcesGained}`)
    } else {
      if (resourceType === 'stone') {
        state.gold += resourcesGained * 10
        messages.push(`获得灵石${resourcesGained * 10}`)
      } else if (resourceType === 'insight') {
        state.insight = (state.insight || 0) + resourcesGained
        messages.push(`获得悟道点${resourcesGained}`)
      } else {
        state.materials[resourceType] = (state.materials[resourceType] || 0) + resourcesGained
        messages.push(`获得${resourceType}×${resourcesGained}`)
      }
    }
  } else if (loser === 'player') {
    if (state.sect) {
      state.sect.resources[resourceType] = Math.max(0, (state.sect.resources[resourceType] || 0) - resourcesGained)
      messages.push(`宗门损失${resourceType}×${resourcesGained}`)
    } else {
      if (resourceType === 'stone') {
        state.gold = Math.max(0, state.gold - resourcesGained * 10)
        messages.push(`损失灵石${resourcesGained * 10}`)
      } else if (resourceType === 'insight') {
        state.insight = Math.max(0, (state.insight || 0) - resourcesGained)
        messages.push(`损失悟道点${resourcesGained}`)
      } else {
        state.materials[resourceType] = Math.max(0, (state.materials[resourceType] || 0) - resourcesGained)
        messages.push(`损失${resourceType}×${resourcesGained}`)
      }
    }
  }

  // 检查是否灭门（实力差距极大时触发）
  let annihilated = false
  const powerRatio = Math.max(attackerPower, defenderPower) / Math.max(1, Math.min(attackerPower, defenderPower))
  if (powerRatio >= 3 && Math.random() < 0.3) {
    annihilated = true
    const annihilatedId = loser
    if (annihilatedId !== 'player') {
      // 移除被灭AI宗门
      state.aiSects = state.aiSects.filter(s => s.id !== annihilatedId)
      messages.push(`${annihilatedId}宗门被灭门！`)
    } else {
      // 玩家宗门被灭——大幅降级但不完全删除
      if (state.sect) {
        state.sect.level = Math.max(1, state.sect.level - 3)
        for (const [k, v] of Object.entries(state.sect.buildings)) {
          state.sect.buildings[k] = Math.max(0, (v as number) - 2)
        }
        messages.push('宗门遭到毁灭性打击！建筑等级大幅下降。')
      }
    }
  }

  // 更新战争状态
  war.status = winner === war.attacker ? 'victory' : 'defeat'

  // 声望变化
  if (winner === 'player') {
    state.reputation = (state.reputation || 0) + 10
    state.totalSectWarsWon = (state.totalSectWarsWon || 0) + 1
    messages.push('声望+10')
  } else if (loser === 'player') {
    state.reputation = (state.reputation || 0) - 5
    messages.push('声望-5')
  }

  // 心魔影响（战争杀戮增加杀戮心魔）
  if (winner === 'player' && Math.random() < 0.3) {
    const demons = state.innerDemons as any[]
    const killingDemon = demons?.find(d => d.type === 'killing')
    if (killingDemon) {
      killingDemon.intensity = Math.min(100, killingDemon.intensity + 5)
    } else if (demons) {
      demons.push({ type: 'killing', intensity: 5, accumulatedMs: 0, lastTrigger: Date.now(), sealed: false })
    }
    messages.push('战争杀戮，杀戮心魔+5')
  }

  const description = `${winner === 'player' ? '你方' : winner}击败了${loser === 'player' ? '你方' : loser}，${annihilated ? '并将其灭门！' : `获得${resourceType}×${resourcesGained}`}`

  return {
    warId: war.id,
    winner,
    loser,
    resourcesGained,
    resourceType,
    annihilated,
    description,
    messages,
  }
}

// ===== 联盟管理 =====

export function formAlliance(
  state: GameState,
  name: string,
  memberIds: string[],
  leaderId: string,
): { ok: boolean; alliance?: Alliance; reason: string } {
  if (memberIds.length < 2) return { ok: false, reason: '联盟至少需要2个宗门' }

  // 检查成员是否已在其他联盟
  const alliances = (state as any).alliances as Alliance[] | undefined
  if (alliances) {
    for (const m of memberIds) {
      const existing = alliances.find(a =>
        a.status === 'active' && a.memberIds.includes(m)
      )
      if (existing) return { ok: false, reason: `${m}已在联盟「${existing.name}」中` }
    }
  }

  const alliance: Alliance = {
    id: `alliance_${Date.now()}`,
    name,
    memberIds,
    leaderId,
    foundedTime: Date.now(),
    status: 'active',
    mutualDefense: true,
    tradeAgreement: true,
  }

  if (!(state as any).alliances) (state as any).alliances = []
  ;(state as any).alliances.push(alliance)

  return { ok: true, alliance, reason: '' }
}

export function dissolveAlliance(state: GameState, allianceId: string): { ok: boolean; reason: string } {
  const alliances = (state as any).alliances as Alliance[] | undefined
  if (!alliances) return { ok: false, reason: '无联盟' }

  const alliance = alliances.find(a => a.id === allianceId)
  if (!alliance) return { ok: false, reason: '联盟不存在' }

  alliance.status = 'dissolved'
  return { ok: true, reason: '' }
}

// ===== 联盟共同防御 =====

export function checkAllianceDefense(state: GameState, defenderId: string): string[] {
  const alliances = (state as any).alliances as Alliance[] | undefined
  if (!alliances) return []

  const defenders: string[] = [defenderId]
  for (const a of alliances) {
    if (a.status !== 'active' || !a.mutualDefense) continue
    if (a.memberIds.includes(defenderId)) {
      // 联盟其他成员加入防御
      for (const m of a.memberIds) {
        if (m !== defenderId) defenders.push(m)
      }
    }
  }
  return defenders
}

// ===== 吞并系统 =====

export function annexSect(state: GameState, winnerId: string, loserId: string): { ok: boolean; description: string; resources?: Record<string, number> } {
  if (loserId === 'player') {
    return { ok: false, description: '你的宗门无法被吞并（保护机制）' }
  }

  const loserSect = state.aiSects.find(s => s.id === loserId)
  if (!loserSect) return { ok: false, description: '目标宗门不存在' }

  // 获取被吞并宗门的资源
  const resources: Record<string, number> = {}
  const loserResources: Record<string, number> = (loserSect as any).resources || {}
  for (const [k, v] of Object.entries(loserResources)) {
    resources[k] = Math.floor((v as number) * 0.5) // 吞并获得50%资源
  }

  // 移除被吞并宗门
  state.aiSects = state.aiSects.filter(s => s.id !== loserId)

  // 如果玩家是吞并方，获得资源
  if (winnerId === 'player' && state.sect) {
    for (const [k, v] of Object.entries(resources)) {
      if (k in state.sect.resources) {
        ;(state.sect.resources as any)[k] += v
      }
    }
    state.reputation = (state.reputation || 0) + 20
    state.worldEvolutionScore = (state.worldEvolutionScore || 0) + 5
  }

  // 解散相关联盟
  const alliances = (state as any).alliances as Alliance[] | undefined
  if (alliances) {
    for (const a of alliances) {
      if (a.memberIds.includes(loserId)) {
        a.memberIds = a.memberIds.filter(m => m !== loserId)
        if (a.memberIds.length < 2) a.status = 'dissolved'
      }
    }
  }

  return {
    ok: true,
    description: `${winnerId === 'player' ? '你' : winnerId}吞并了${loserSect.name}，获得大量资源！`,
    resources,
  }
}

// ===== 每日战争结算 =====

export function tickSectWars(state: GameState): string[] {
  const wars = (state as any).sectWars as SectWar[] | undefined
  if (!wars || wars.length === 0) return []

  const messages: string[] = []
  const ongoing = wars.filter(w => w.status === 'ongoing')

  for (const war of ongoing) {
    // 30%概率在本日结算
    if (Math.random() < 0.3) {
      const result = resolveWar(state, war)
      messages.push(result.description)
      messages.push(...result.messages)

      // 检查吞并条件
      if (result.winner !== 'player' && result.loser !== 'player') {
        // AI vs AI，可能发生吞并
        if (result.annihilated && Math.random() < 0.5) {
          const annexResult = annexSect(state, result.winner, result.loser)
          if (annexResult.ok) {
            messages.push(annexResult.description)
          }
        }
      }
    }
  }

  // 清理已结束的战争（保留最近20条记录）
  if (wars.length > 20) {
    const sorted = wars.sort((a, b) => b.startTime - a.startTime)
    ;(state as any).sectWars = sorted.slice(0, 20)
  }

  return messages
}

// ===== AI宗门主动发动战争 =====

export function aiDeclareWars(state: GameState): string[] {
  const messages: string[] = []
  const aiSects = state.aiSects || []
  if (aiSects.length < 2) return messages

  // 随机概率AI宗门发动战争
  for (const ai of aiSects) {
    if (Math.random() > 0.02) continue // 2%概率

    // 选择目标（实力相近或略弱的）
    const candidates = aiSects.filter(other => {
      if (other.id === ai.id) return false
      const myPower = evaluateSectPower(state, ai.id)
      const theirPower = evaluateSectPower(state, other.id)
      return theirPower > myPower * 0.3 && theirPower < myPower * 1.5
    })

    if (state.sect && Math.random() < 0.3) {
      // 30%概率进攻玩家宗门
      const playerPower = evaluateSectPower(state, 'player')
      const aiPower = evaluateSectPower(state, ai.id)
      if (playerPower < aiPower * 1.5 && playerPower > aiPower * 0.3) {
        candidates.push({ id: 'player', name: state.sect?.name || state.heroName } as any)
      }
    }

    if (candidates.length === 0) continue

    const target = candidates[Math.floor(Math.random() * candidates.length)]
    const warTypes: WarType[] = ['resource_raid', 'sect_invasion']
    const warType = warTypes[Math.floor(Math.random() * warTypes.length)]

    const result = declareWar(state, ai.id, target.id, warType)
    if (result.ok && result.war) {
      const targetName = target.id === 'player' ? (state.sect?.name || state.heroName) : target.name
      messages.push(`【宗门冲突】${ai.name}向${targetName}发动了${warType === 'resource_raid' ? '资源劫掠' : '宗门入侵'}！`)
    }
  }

  return messages
}
