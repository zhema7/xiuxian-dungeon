// ---------- 弟子系统 ----------
// 收徒、培养、资源分配、成长、派遣历练

import type { GameState } from './state'
import type { ProceduralNpc } from './procedural-npc'
import { addKarma } from './karma'

export interface DiscipleData {
  npcId: string          // 对应的 ProceduralNpc ID
  name: string
  realm: number
  level: number
  physique: string
  daoPath: string
  specialty: DiscipleSpecialty
  // 培养
  trainingFocus: TrainingFocus
  resourcesAllocated: { gold: number; pills: number; materials: number }
  // 成长
  exp: number
  expToNext: number
  // 状态
  loyalty: number        // 忠诚度 0~100
  mood: number           // 心情 0~100
  onMission: string | null  // 正在执行的任务
  missionEndTime: number    // 任务结束时间
  // 产出
  weeklyContribution: number  // 每周上交贡献
  lastContributionTime: number
}

export type DiscipleSpecialty =
  | 'combat' | 'alchemy' | 'crafting' | 'talisman' | 'management' | 'intelligence'

export type TrainingFocus =
  | 'cultivation' | 'combat' | 'alchemy' | 'crafting' | 'talisman' | 'balanced'

export const SPECIALTY_NAMES: Record<DiscipleSpecialty, string> = {
  combat: '战斗型',
  alchemy: '丹道型',
  crafting: '器道型',
  talisman: '符道型',
  management: '管理型',
  intelligence: '情报型',
}

export const SPECIALTY_DESC: Record<DiscipleSpecialty, string> = {
  combat: '擅长战斗，可随师出战秘境',
  alchemy: '擅长炼丹，管理药园，提供丹药',
  crafting: '擅长炼器，管理矿场，打造装备',
  talisman: '擅长画符，提供符箓支援',
  management: '擅长经营，管理产业，打理灵石',
  intelligence: '擅长搜集情报，打探消息',
}

export const TRAINING_FOCUS_NAMES: Record<TrainingFocus, string> = {
  cultivation: '闭关修炼',
  combat: '战斗训练',
  alchemy: '丹道研习',
  crafting: '器道研习',
  talisman: '符道研习',
  balanced: '均衡培养',
}

// ===== 收徒条件 =====

export function canRecruitDisciple(state: GameState, npc: ProceduralNpc): { ok: boolean; reason: string } {
  // 境界要求：玩家需高于NPC至少1个大境界
  if (state.realm < npc.realm + 1) {
    return { ok: false, reason: '修为不足，需高于对方至少一个大境界方可收徒' }
  }
  // NPC不能已经是弟子
  if (state.disciples.some(d => d.npcId === npc.id)) {
    return { ok: false, reason: '对方已是你的弟子' }
  }
  // 好感度要求
  const rel = state.playerNpcRelations[npc.id]
  if (!rel || rel.favor < 30) {
    return { ok: false, reason: '好感度不足，需达到相识以上方可收徒' }
  }
  // NPC需要存活
  if (!npc.alive) {
    return { ok: false, reason: '对方已不在人世' }
  }
  // 弟子数量限制
  const maxDisciples = 3 + Math.floor(state.realm / 2)
  if (state.disciples.length >= maxDisciples) {
    return { ok: false, reason: `弟子名额已满（上限${maxDisciples}人）` }
  }
  return { ok: true, reason: '' }
}

// ===== 收徒 =====

export function recruitDisciple(state: GameState, npc: ProceduralNpc): { ok: boolean; message: string } {
  const check = canRecruitDisciple(state, npc)
  if (!check.ok) return { ok: false, message: check.reason }

  // 判定弟子特长
  const specialty = determineSpecialty(npc)

  const disciple: DiscipleData = {
    npcId: npc.id,
    name: npc.name,
    realm: npc.realm,
    level: npc.level,
    physique: npc.physique,
    daoPath: npc.daoPath,
    specialty: specialty,
    trainingFocus: 'balanced',
    resourcesAllocated: { gold: 0, pills: 0, materials: 0 },
    exp: 0,
    expToNext: discipleExpToNext(npc.realm),
    loyalty: 60,
    mood: 70,
    onMission: null,
    missionEndTime: 0,
    weeklyContribution: 0,
    lastContributionTime: Date.now(),
  }

  state.disciples.push(disciple)
  // 更新关系
  if (!state.playerNpcRelations[npc.id]) {
    state.playerNpcRelations[npc.id] = {
      npcId: npc.id,
      favor: 30,
      trust: 50,
      fear: 0,
      saved: false,
      killedKnown: [],
      metCount: 1,
      lastInteract: Date.now(),
    }
  }
  state.playerNpcRelations[npc.id].favor += 50
  state.playerNpcRelations[npc.id].trust += 30

  // 因果
  addKarma(state, 5, `收${npc.name}为弟子`, npc.id)

  return { ok: true, message: `${npc.name} 拜入门下，成为你的弟子！` }
}

// ===== 弟子特长判定 =====

function determineSpecialty(npc: ProceduralNpc): DiscipleSpecialty {
  if (npc.profession === '丹师') return 'alchemy'
  if (npc.profession === '器师') return 'crafting'
  if (npc.profession === '符师') return 'talisman'
  if (npc.personality.includes('好战')) return 'combat'
  if (npc.personality.includes('狡诈')) return 'intelligence'
  if (npc.personality.includes('谨慎') || npc.personality.includes('淡泊')) return 'management'
  return 'combat'
}

// ===== 弟子经验 =====

export function discipleExpToNext(realm: number): number {
  return 100 + realm * 80 + realm * realm * 30
}

// ===== 弟子成长 =====

export function updateDiscipleGrowth(state: GameState, deltaMs: number): string[] {
  const messages: string[] = []
  const deltaMin = deltaMs / 60000

  for (const d of state.disciples) {
    const npc = state.proceduralNpcs.find(n => n.id === d.npcId)
    if (!npc || !npc.alive) continue

    // 修炼速度由训练方向决定
    let cultSpeed = 1
    switch (d.trainingFocus) {
      case 'cultivation': cultSpeed = 1.5; break
      case 'combat': cultSpeed = 0.8; break
      case 'alchemy': cultSpeed = 0.6; break
      case 'crafting': cultSpeed = 0.6; break
      case 'talisman': cultSpeed = 0.6; break
      case 'balanced': cultSpeed = 1.0; break
    }

    // 体质加成
    if (npc.physique === '天灵根') cultSpeed *= 1.3
    if (npc.physique === '异灵根') cultSpeed *= 1.5

    // 资源加成
    if (d.resourcesAllocated.pills > 0) cultSpeed *= 1.2

    d.exp += Math.floor(cultSpeed * deltaMin * 10)

    // 升级
    while (d.exp >= d.expToNext) {
      d.exp -= d.expToNext
      d.level++
      d.expToNext = discipleExpToNext(d.realm)
      messages.push(`${d.name} 修为精进，达到 ${d.level} 级`)
    }

    // 突破
    if (d.level >= (d.realm + 1) * 10 && d.realm < 7) {
      const chance = 0.3 + d.loyalty * 0.001
      if (Math.random() < chance) {
        d.realm++
        npc.realm = d.realm
        d.level = 0
        d.expToNext = discipleExpToNext(d.realm)
        messages.push(`${d.name} 突破至${['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫'][d.realm]}境！`)
      }
    }

    // 忠诚度变化
    if (d.mood > 70) d.loyalty = Math.min(100, d.loyalty + 0.01)
    else if (d.mood < 30) d.loyalty = Math.max(0, d.loyalty - 0.05)

    // 任务完成检查
    if (d.onMission && Date.now() >= d.missionEndTime) {
      const missionReward = completeMission(d)
      messages.push(...missionReward)
      d.onMission = null
      d.missionEndTime = 0
    }

    // 贡献
    const weekMs = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - d.lastContributionTime > weekMs) {
      const contribution = calculateContribution(d)
      d.weeklyContribution = contribution
      d.lastContributionTime = Date.now()
      messages.push(`${d.name} 上交贡献：${contribution} 灵石`)
    }
  }

  return messages
}

function completeMission(d: DiscipleData): string[] {
  const messages: string[] = []
  const baseReward = (d.realm + 1) * 20
  d.resourcesAllocated.gold += baseReward
  messages.push(`${d.name} 完成历练任务归来，带回${baseReward}灵石`)
  return messages
}

// 修复：避免直接访问未定义属性，使用安全方式
function completeMissionReward(d: DiscipleData): number {
  return (d.realm + 1) * 20 + Math.floor(Math.random() * 50)
}

function calculateContribution(d: DiscipleData): number {
  const base = (d.realm + 1) * 10
  const specialtyBonus = d.specialty === 'management' ? 1.5 : 1.0
  const moodBonus = d.mood > 60 ? 1.2 : 0.8
  return Math.floor(base * specialtyBonus * moodBonus)
}

// ===== 派遣任务 =====

export type MissionType = 'gather_herbs' | 'hunt_beasts' | 'escort' | 'scout' | 'train'

export const MISSION_NAMES: Record<MissionType, string> = {
  gather_herbs: '采药',
  hunt_beasts: '除妖',
  escort: '护送',
  scout: '侦查',
  train: '修炼',
}

export const MISSION_DURATIONS: Record<MissionType, number> = {
  gather_herbs: 30 * 60 * 1000,   // 30分钟
  hunt_beasts: 45 * 60 * 1000,
  escort: 60 * 60 * 1000,
  scout: 20 * 60 * 1000,
  train: 90 * 60 * 1000,
}

export function dispatchMission(d: DiscipleData, mission: MissionType): boolean {
  if (d.onMission) return false
  d.onMission = mission
  d.missionEndTime = Date.now() + MISSION_DURATIONS[mission]
  return true
}

// ===== 设置训练方向 =====

export function setTrainingFocus(d: DiscipleData, focus: TrainingFocus): void {
  d.trainingFocus = focus
}

// ===== 分配资源 =====

export function allocateResources(
  d: DiscipleData,
  resources: { gold?: number; pills?: number; materials?: number },
): void {
  if (resources.gold) d.resourcesAllocated.gold += resources.gold
  if (resources.pills) d.resourcesAllocated.pills += resources.pills
  if (resources.materials) d.resourcesAllocated.materials += resources.materials
  d.mood = Math.min(100, d.mood + 5)
}
