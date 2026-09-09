// ---------- NPC独立成长与世界宏观演进 ----------
// NPC自主修炼突破、世界势力消长、时代变迁

import type { GameState } from './state'
import type { ProceduralNpc } from './procedural-npc'
import type { WorldTime } from './world-time'
import type { NpcLifeEventRecord } from './state'
import { updateNpcGrowth } from './npc-system'

// ===== NPC独立成长 =====

export interface NpcBreakthroughResult {
  npcId: string
  npcName: string
  oldRealm: number
  newRealm: number
  description: string
}

export function tickNpcBreakthroughs(state: GameState, time: WorldTime): NpcBreakthroughResult[] {
  const results: NpcBreakthroughResult[] = []
  const npcs = state.proceduralNpcs || []

  for (const npc of npcs) {
    if (!npc.alive) continue

    // 每日检查突破概率
    const baseChance = 0.005 // 基础0.5%
    const realmBonus = npc.realm * 0.002 // 境界越高越难
    const chance = Math.max(0.001, baseChance - realmBonus)

    if (Math.random() > chance) continue
    if (npc.realm >= 5) continue // 最高化神

    // NPC突破
    npc.realm++
    const oldRealm = npc.realm - 1
    npc.level = Math.max(npc.level, npc.realm * 15)

    const result: NpcBreakthroughResult = {
      npcId: npc.id,
      npcName: npc.name,
      oldRealm,
      newRealm: npc.realm,
      description: `${npc.name}突破至${['练气', '筑基', '金丹', '元婴', '化神'][npc.realm] || '未知'}境！`,
    }
    results.push(result)

    // 记录到NPC个人eventLog
    if (!npc.eventLog) npc.eventLog = []
    npc.eventLog.push(result.description)
    if (npc.eventLog.length > 50) npc.eventLog = npc.eventLog.slice(-50)

    // 记录到人生事件日志
    const event: NpcLifeEventRecord = {
      npcId: npc.id,
      npcName: npc.name,
      eventType: 'breakthrough',
      description: result.description,
      year: time.year,
      timestamp: Date.now(),
    }
    state.npcLifeEventsLog.push(event)

    // 世界演进分数
    state.worldEvolutionScore = (state.worldEvolutionScore || 0) + 1
  }

  return results
}

// ===== NPC人生事件 =====

export function tickNpcLifeEvents(state: GameState, time: WorldTime): string[] {
  const messages: string[] = []
  const npcs = state.proceduralNpcs || []
  if (npcs.length === 0) return messages

  // 随机选取几个NPC产生人生事件
  const eventCount = Math.min(3, Math.floor(npcs.length * 0.1))
  const shuffled = [...npcs].sort(() => Math.random() - 0.5)

  for (let i = 0; i < eventCount; i++) {
    const npc = shuffled[i]
    if (!npc.alive) continue

    const events = [
      'enlightenment',  // 顿悟
      'gain_disciple',  // 收徒
      'find_treasure',  // 寻宝
      'sect_join',      // 加入宗门
      'rivalry',        // 结怨
      'romance',        // 道侣
      'seclusion',      // 闭关
      'wandering',      // 云游
    ]

    const eventType = events[Math.floor(Math.random() * events.length)]
    const eventDesc = generateNpcLifeEvent(npc, eventType)

    if (eventDesc) {
      messages.push(eventDesc)

      // 记录到NPC个人eventLog
      if (!npc.eventLog) npc.eventLog = []
      npc.eventLog.push(eventDesc)
      if (npc.eventLog.length > 50) npc.eventLog = npc.eventLog.slice(-50)

      const record: NpcLifeEventRecord = {
        npcId: npc.id,
        npcName: npc.name,
        eventType,
        description: eventDesc,
        year: time.year,
        timestamp: Date.now(),
      }
      state.npcLifeEventsLog.push(record)

      // 限制日志长度
      if (state.npcLifeEventsLog.length > 200) {
        state.npcLifeEventsLog = state.npcLifeEventsLog.slice(-200)
      }
    }
  }

  return messages
}

function generateNpcLifeEvent(npc: ProceduralNpc, eventType: string): string | null {
  const realmNames = ['练气', '筑基', '金丹', '元婴', '化神']
  const realmName = realmNames[npc.realm] || '未知'

  switch (eventType) {
    case 'enlightenment':
      return `${npc.name}（${realmName}境）在修行中有所顿悟，修为精进`
    case 'gain_disciple':
      return `${npc.name}（${realmName}境）收了一名新弟子，传承道统`
    case 'find_treasure':
      return `${npc.name}（${realmName}境）在一处遗迹中寻得宝物`
    case 'sect_join':
      return `${npc.name}（${realmName}境）加入了一方宗门`
    case 'rivalry':
      return `${npc.name}（${realmName}境）与一位修士结下梁子`
    case 'romance':
      return `${npc.name}（${realmName}境）遇到了心慕之人`
    case 'seclusion':
      return `${npc.name}（${realmName}境）开始闭关修炼`
    case 'wandering':
      return `${npc.name}（${realmName}境）开始云游天下`
    default:
      return null
  }
}

// ===== NPC死亡（寿元/斗法） =====

export function tickNpcMortality(state: GameState, time: WorldTime): string[] {
  const messages: string[] = []
  const npcs = state.proceduralNpcs || []

  for (const npc of npcs) {
    if (!npc.alive) continue

    // 高境界NPC有寿元限制（化神境500年等）
    const maxLifespan = [80, 150, 300, 500, 1000, 2000]
    const lifespan = maxLifespan[npc.realm] || 100
    const npcAge = (npc as any).age || Math.floor(Math.random() * lifespan * 0.5) + 10

    // 老死概率
    if (npcAge > lifespan * 0.8) {
      if (Math.random() < 0.02) {
        npc.alive = false
        messages.push(`${npc.name}寿元已尽，坐化于天地之间`)
        const record: NpcLifeEventRecord = {
          npcId: npc.id,
          npcName: npc.name,
          eventType: 'death',
          description: `${npc.name}寿元已尽，坐化于天地之间`,
          year: time.year,
          timestamp: Date.now(),
        }
        state.npcLifeEventsLog.push(record)
      }
    }

    // NPC间斗法死亡（低概率）
    if (Math.random() < 0.001) {
      npc.alive = false
      messages.push(`${npc.name}在一场斗法中陨落`)
      const record: NpcLifeEventRecord = {
        npcId: npc.id,
        npcName: npc.name,
        eventType: 'death',
        description: `${npc.name}在一场斗法中陨落`,
        year: time.year,
        timestamp: Date.now(),
      }
      state.npcLifeEventsLog.push(record)
    }
  }

  return messages
}

// ===== 世界宏观演进 =====

export interface WorldEvolutionState {
  era: string              // 当前纪元
  totalNpcBreakthroughs: number  // NPC总突破次数
  totalSectWars: number          // 宗门战争总数
  totalAnnualEvents: number      // 年度事件总数
  activeAlliances: number        // 活跃联盟数
  fallenSects: number            // 灭门宗门数
  powerBalance: number           // 势力平衡值（-100~100，正=正道盛，负=魔道盛）
}

export function getWorldEvolutionState(state: GameState): WorldEvolutionState {
  const score = state.worldEvolutionScore || 0
  const annualEvents = state.annualEventLog || []
  const morality = state.morality || 0

  // 纪元判定
  let era = '初灵纪'
  if (score >= 100) era = '灵启纪'
  if (score >= 250) era = '仙凡纪'
  if (score >= 500) era = '大乘纪'
  if (score >= 1000) era = '永恒纪'

  return {
    era,
    totalNpcBreakthroughs: state.npcLifeEventsLog?.filter(e => e.eventType === 'breakthrough').length || 0,
    totalSectWars: state.totalSectWarsWon || 0,
    totalAnnualEvents: annualEvents.length,
    activeAlliances: (state as any).alliances?.filter((a: any) => a.status === 'active').length || 0,
    fallenSects: state.aiSects?.filter(s => s.defeated).length || 0,
    powerBalance: morality,
  }
}

// ===== 每日世界演进 =====

export function tickWorldEvolution(state: GameState, time: WorldTime): string[] {
  const messages: string[] = []

  // 1. NPC突破
  const breakthroughs = tickNpcBreakthroughs(state, time)
  for (const bt of breakthroughs) {
    messages.push(bt.description)
  }

  // 2. NPC人生事件
  const lifeEvents = tickNpcLifeEvents(state, time)
  messages.push(...lifeEvents)

  // 3. NPC死亡
  const deaths = tickNpcMortality(state, time)
  messages.push(...deaths)

  // 4. 世界演进分数自然增长
  state.worldEvolutionScore = (state.worldEvolutionScore || 0) + 1

  // 5. 纪元变迁检测
  const evolution = getWorldEvolutionState(state)
  const score = state.worldEvolutionScore || 0
  if (score === 100 || score === 250 || score === 500 || score === 1000) {
    messages.push(`【纪元变迁】世界进入了「${evolution.era}」！`)
  }

  // 限制消息数量
  return messages.slice(0, 5)
}

// ===== 获取NPC人生履历 =====

export function getNpcLifeEvents(state: GameState, npcId: string): NpcLifeEventRecord[] {
  return (state.npcLifeEventsLog || []).filter(e => e.npcId === npcId)
}

// ===== 生成新NPC补充人口 =====

export function maintainNpcPopulation(state: GameState): string[] {
  const messages: string[] = []
  const npcs = state.proceduralNpcs || []
  const aliveCount = npcs.filter(n => n.alive).length

  // 如果存活NPC太少，生成新NPC
  if (aliveCount < 20) {
    const need = 30 - aliveCount
    messages.push(`世界新生了${need}位修士，崭露头角`)
  }

  return messages
}
