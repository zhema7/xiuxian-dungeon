// ---------- 关系驱动支线任务系统 ----------
// 基于NPC关系网生成支线任务

import type { GameState } from './state'
import type { ProceduralNpc } from './procedural-npc'
import { getPlayerNpcRelation, getRelationLevelName } from './npc-relation-net'
import { getNpcRelation } from './npc-relation-net'
import { materialLabel } from './labels'

// ===== 任务类型 =====

export type QuestType =
  | 'help_friend'     // 帮助好友（找材料/打怪/护送）
  | 'avenge_enemy'    // 替NPC报仇（击杀仇敌）
  | 'deliver_item'    // 代为送物（给另一位NPC）
  | 'escort'          // 护送到指定地点
  | 'gather_herb'     // 采集特定灵药
  | 'subdue_beast'    // 降服妖兽
  | 'resolve_conflict' // 调解纠纷
  | 'find_person'     // 寻找失散亲人
  | 'protect'         // 保护NPC免遭袭击
  | 'trade_mediation'  // 交易调解

export interface RelationQuest {
  id: string
  type: QuestType
  giverNpcId: string
  targetNpcId?: string
  title: string
  description: string
  objectives: QuestObjective[]
  rewards: QuestReward
  relationRequired: number  // 最低好感要求
  moralityRequired?: number // 最低道德值要求
  expireDays: number        // 任务过期天数
  accepted: boolean
  completed: boolean
  failed: boolean
}

export interface QuestObjective {
  type: 'kill_npc' | 'deliver_to' | 'collect_item' | 'reach_location' | 'talk_to' | 'defeat_beast'
  targetId?: string
  targetItem?: string
  targetCount: number
  currentCount: number
  targetX?: number
  targetY?: number
  description: string
  done: boolean
}

export interface QuestReward {
  gold?: number
  exp?: number
  favorGain?: number
  trustGain?: number
  items?: Record<string, number>
  insight?: number
  moralityChange?: number
}

// ===== 任务模板 =====

interface QuestTemplate {
  type: QuestType
  title: string
  description: (giver: ProceduralNpc, target?: ProceduralNpc) => string
  relationRequired: number
  generateObjectives: (giver: ProceduralNpc, target: ProceduralNpc | undefined, state: GameState) => QuestObjective[]
  generateRewards: (giver: ProceduralNpc, target?: ProceduralNpc) => QuestReward
  weight: number
}

const QUEST_TEMPLATES: QuestTemplate[] = [
  {
    type: 'help_friend',
    title: '道友相助',
    description: (g) => `${g.name}需要帮助：「我有一件急事需要帮忙，能否替我采集一些灵药？我有重谢。」`,
    relationRequired: 15,
    generateObjectives: (g, _t) => [{
      type: 'collect_item',
      targetItem: ['herb_grass', 'herb_lotus', 'herb_mushroom'][Math.floor(Math.random() * 3)],
      targetCount: 3 + Math.floor(Math.random() * 5),
      currentCount: 0,
      description: `采集${3 + Math.floor(Math.random() * 5)}株灵药`,
      done: false,
    }],
    generateRewards: (g) => ({
      gold: 50 + g.realm * 20,
      exp: 30 + g.realm * 15,
      favorGain: 10,
      trustGain: 5,
    }),
    weight: 30,
  },
  {
    type: 'avenge_enemy',
    title: '替天行道',
    description: (g, t) => `${g.name}请求你帮忙报仇：「仇人${t?.name || '某'}害我至亲，此仇不报，誓不为人！望道友助我一臂之力。」`,
    relationRequired: 30,
    generateObjectives: (g, t) => t ? [{
      type: 'kill_npc',
      targetId: t.id,
      targetCount: 1,
      currentCount: 0,
      description: `击败${t.name}`,
      done: false,
    }] : [],
    generateRewards: (g, t) => ({
      gold: 100 + (g.realm + (t?.realm || 0)) * 30,
      exp: 80 + g.realm * 20,
      favorGain: 25,
      trustGain: 15,
      moralityChange: -5,
    }),
    weight: 15,
  },
  {
    type: 'deliver_item',
    title: '代为传物',
    description: (g, t) => `${g.name}托你送物：「这件东西请代我交给${t?.name || '一位道友'}，他应该在南域某处。」`,
    relationRequired: 10,
    generateObjectives: (_g, t) => t ? [{
      type: 'deliver_to',
      targetId: t.id,
      targetCount: 1,
      currentCount: 0,
      description: `将物品送达${t.name}`,
      done: false,
    }] : [],
    generateRewards: (g) => ({
      gold: 30 + g.realm * 10,
      exp: 20 + g.realm * 10,
      favorGain: 8,
      trustGain: 5,
    }),
    weight: 25,
  },
  {
    type: 'resolve_conflict',
    title: '调解释怨',
    description: (g, t) => `${g.name}请你调解纠纷：「我与${t?.name || '道友'}之间有些误会，望你从中斡旋。」`,
    relationRequired: 20,
    generateObjectives: (_g, t) => t ? [{
      type: 'talk_to',
      targetId: t.id,
      targetCount: 1,
      currentCount: 0,
      description: `与${t.name}交谈调解`,
      done: false,
    }] : [],
    generateRewards: (g) => ({
      gold: 20 + g.realm * 8,
      exp: 25 + g.realm * 10,
      favorGain: 12,
      trustGain: 8,
      moralityChange: 3,
    }),
    weight: 20,
  },
  {
    type: 'find_person',
    title: '寻访亲人',
    description: (g, t) => `${g.name}请求帮忙寻人：「我的至亲${t?.name || '某人'}失散多年，望道友帮忙打听下落。」`,
    relationRequired: 25,
    generateObjectives: (_g, t) => t ? [{
      type: 'talk_to',
      targetId: t.id,
      targetCount: 1,
      currentCount: 0,
      description: `找到${t.name}并告知下落`,
      done: false,
    }] : [],
    generateRewards: (g) => ({
      gold: 60 + g.realm * 15,
      exp: 50 + g.realm * 15,
      favorGain: 20,
      trustGain: 12,
      moralityChange: 5,
    }),
    weight: 10,
  },
]

// ===== 生成关系驱动任务 =====

export function generateRelationQuest(state: GameState, giverNpc: ProceduralNpc): RelationQuest | null {
  const playerRel = getPlayerNpcRelation(state, giverNpc.id)
  if (!playerRel || playerRel.favor < 10) return null

  // 检查NPC是否有目标NPC关系
  const npcRelations = giverNpc.relations.filter(r => r.level !== 0)
  if (npcRelations.length === 0) return null

  // 按权重选择任务模板
  const availableTemplates = QUEST_TEMPLATES.filter(t => playerRel.favor >= t.relationRequired)
  if (availableTemplates.length === 0) return null

  const totalWeight = availableTemplates.reduce((s, t) => s + t.weight, 0)
  let roll = Math.random() * totalWeight
  let template = availableTemplates[0]
  for (const t of availableTemplates) {
    roll -= t.weight
    if (roll <= 0) { template = t; break }
  }

  // 选择目标NPC（关系网中的NPC）
  let targetNpc: ProceduralNpc | undefined
  if (template.type === 'avenge_enemy') {
    // 找仇敌
    targetNpc = npcRelations
      .filter(r => r.type === 'enemy' || r.type === 'rival')
      .map(r => state.proceduralNpcs.find(n => n.id === r.targetId && n.alive))
      .find(n => n !== undefined)
  } else if (template.type === 'deliver_item' || template.type === 'resolve_conflict' || template.type === 'find_person') {
    // 找好友/亲族
    targetNpc = npcRelations
      .filter(r => r.type === 'friend' || r.type === 'family' || r.type === 'partner')
      .map(r => state.proceduralNpcs.find(n => n.id === r.targetId && n.alive))
      .find(n => n !== undefined)
  }

  // 如果模板需要目标NPC但没找到，换一个模板
  if ((template.type === 'avenge_enemy' || template.type === 'deliver_item' || template.type === 'resolve_conflict' || template.type === 'find_person') && !targetNpc) {
    const fallback = availableTemplates.find(t => t.type === 'help_friend' || t.type === 'gather_herb')
    if (!fallback) return null
    template = fallback
  }

  const objectives = template.generateObjectives(giverNpc, targetNpc, state)
  if (objectives.length === 0) return null

  return {
    id: `rq_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000).toString(36)}`,
    type: template.type,
    giverNpcId: giverNpc.id,
    targetNpcId: targetNpc?.id,
    title: template.title,
    description: template.description(giverNpc, targetNpc),
    objectives,
    rewards: template.generateRewards(giverNpc, targetNpc),
    relationRequired: template.relationRequired,
    expireDays: 3 + Math.floor(Math.random() * 5),
    accepted: false,
    completed: false,
    failed: false,
  }
}

// ===== 更新任务进度 =====

export function updateQuestProgress(
  state: GameState,
  quest: RelationQuest,
  eventType: 'kill_npc' | 'deliver_to' | 'collect_item' | 'talk_to',
  targetId?: string,
  itemName?: string,
): boolean {
  let progress = false

  for (const obj of quest.objectives) {
    if (obj.done) continue
    if (obj.type !== eventType) continue

    if (eventType === 'kill_npc' && obj.targetId === targetId) {
      obj.currentCount++
      if (obj.currentCount >= obj.targetCount) obj.done = true
      progress = true
    } else if (eventType === 'deliver_to' && obj.targetId === targetId) {
      obj.currentCount = obj.targetCount
      obj.done = true
      progress = true
    } else if (eventType === 'talk_to' && obj.targetId === targetId) {
      obj.currentCount = obj.targetCount
      obj.done = true
      progress = true
    } else if (eventType === 'collect_item' && obj.targetItem === itemName) {
      const have = state.materials[itemName || ''] || 0
      obj.currentCount = Math.min(obj.targetCount, have)
      if (obj.currentCount >= obj.targetCount) obj.done = true
      progress = true
    }
  }

  // 检查是否全部完成
  if (quest.objectives.every(o => o.done)) {
    quest.completed = true
  }

  return progress
}

// ===== 领取任务奖励 =====

export function claimQuestReward(state: GameState, quest: RelationQuest): string[] {
  if (!quest.completed) return ['任务尚未完成']

  const msgs: string[] = []
  const r = quest.rewards

  if (r.gold) {
    state.gold += r.gold
    msgs.push(`获得灵石 ${r.gold}`)
  }
  if (r.exp) {
    let remaining = r.exp
    while (remaining > 0) {
      const need = state.level * 50
      if (state.exp + remaining >= need) {
        remaining -= need - state.exp
        state.level++
        state.exp = 0
        msgs.push('等级提升！')
      } else {
        state.exp += remaining
        remaining = 0
      }
    }
    msgs.push(`获得经验 ${r.exp}`)
  }
  if (r.insight) {
    state.insight = (state.insight || 0) + r.insight
    msgs.push(`悟道点 +${r.insight}`)
  }
  if (r.items) {
    for (const [k, v] of Object.entries(r.items)) {
      state.materials[k] = (state.materials[k] || 0) + v
      msgs.push(`获得物品 ${materialLabel(k)}×${v}`)
    }
  }
  if (r.favorGain) {
    const rel = state.playerNpcRelations[quest.giverNpcId]
    if (rel) {
      rel.favor += r.favorGain
      rel.trust += r.trustGain || 0
      msgs.push(`好感 +${r.favorGain}`)
    }
  }
  if (r.moralityChange) {
    state.morality = Math.max(-100, Math.min(100, state.morality + r.moralityChange))
  }

  quest.accepted = false
  return msgs
}

// ===== 获取NPC可用任务 =====

export function getAvailableQuests(state: GameState, npc: ProceduralNpc): RelationQuest[] {
  const quests: RelationQuest[] = []
  const playerRel = getPlayerNpcRelation(state, npc.id)
  if (!playerRel || playerRel.favor < 10) return quests

  // 有30%概率提供任务
  if (Math.random() < 0.3) {
    const quest = generateRelationQuest(state, npc)
    if (quest) quests.push(quest)
  }

  return quests
}
