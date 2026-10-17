// ---------- 弟子系统 ----------
// 收徒、培养、资源分配、成长、派遣历练

import type { GameState } from './state'
import type { ProceduralNpc } from './procedural-npc'
import { addKarma } from './karma'
import {
  generateDisciple, expToNextRealm, ensureCultivation,
  type CultivatedDisciple, type Disciple, type DiscipleRealm,
  type DiscipleSpecialty, type TrainingFocus,
} from './disciple-data'

export type { CultivatedDisciple } from './disciple-data'
export { ensureCultivation } from './disciple-data'

/**
 * 历史类型别名：合轨后弟子实体统一为 `Disciple`，唯一真源是 `state.disciples: Disciple[]`。
 * 保留别名仅为兼容旧引用，新代码请直接使用 `Disciple`。
 */
export type DiscipleData = Disciple

export type { DiscipleSpecialty, TrainingFocus } from './disciple-data'

export { SPECIALTY_NAMES, SPECIALTY_DESC, TRAINING_FOCUS_NAMES } from './disciple-data'

// 简易确定性 RNG（基于种子）
function makeNpcRng(seed: number): () => number {
  let s = seed || 1
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
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

  // 合轨：只生成一份 Disciple 实体写入 state.disciples，不再双写 sect.disciples
  const rng = makeNpcRng(npc.seed)
  const d = generateDisciple(rng, state.sect?.level ?? 1)
  d.uid = 'd_npc_' + npc.id
  d.name = npc.name
  d.realm = Math.max(0, Math.min(6, npc.realm)) as DiscipleRealm
  d.exp = 0
  d.expToNext = expToNextRealm(d.realm)
  d.loyalty = 60
  d.affection = 30
  d.skills = npc.skills.slice()
  d.status = 'idle'
  d.atk = npc.atk
  d.def = npc.def
  d.maxHp = npc.maxHp
  d.crit = 5
  // 同步 NPC 的外观和背景信息
  d.gender = npc.gender
  d.daoPath = npc.daoPath
  d.background = npc.background
  d.physique = npc.physique
  d.lifeGoal = npc.lifeGoal
  d.profession = npc.profession
  d.personality = npc.personality.slice()
  d.appearanceSeed = npc.appearanceSeed
  // 培养线字段（原 DiscipleData 独有，已并入 Disciple）
  d.npcId = npc.id
  d.level = npc.level
  d.specialty = specialty
  d.trainingFocus = 'balanced'
  d.resourcesAllocated = { gold: 0, pills: 0, materials: 0 }
  d.mood = 70
  d.onMission = null
  d.missionEndTime = 0
  d.weeklyContribution = 0
  d.lastContributionTime = Date.now()

  state.disciples.push(d)

  // 宗门内记录招募事件（未建宗时跳过，弟子仍存在于 state.disciples）
  if (state.sect) {
    if (typeof (state.sect as any).discipleEvents === 'undefined') {
      (state.sect as any).discipleEvents = []
    }
    ;(state.sect as any).discipleEvents.unshift({
      id: 'evt_' + Date.now().toString(36),
      type: 'recruit',
      discipleUid: d.uid,
      discipleName: d.name,
      timestamp: Date.now(),
      description: `${npc.name}仰慕掌门风采，拜入宗门`,
    })
    if ((state.sect as any).discipleEvents.length > 50) {
      (state.sect as any).discipleEvents.length = 50
    }
  }

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
  return expToNextRealm(Math.max(0, Math.min(6, realm)) as DiscipleRealm)
}


// ===== 弟子成长 =====

export function updateDiscipleGrowth(state: GameState, deltaMs: number): string[] {
  const messages: string[] = []
  const deltaMin = deltaMs / 60000

  for (const d of state.disciples) {
    ensureCultivation(d)
    // 宗门自行招录的弟子没有对应的世界 NPC（npcId 为空），此时用自身体质判定
    const npc = d.npcId ? state.proceduralNpcs.find(n => n.id === d.npcId) : undefined
    if (npc && !npc.alive) continue
    const physique = npc?.physique ?? d.physique

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
    if (physique === '天灵根') cultSpeed *= 1.3
    if (physique === '异灵根') cultSpeed *= 1.5

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
        d.realm = (d.realm + 1) as DiscipleRealm
        if (npc) npc.realm = d.realm
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

function completeMission(d: CultivatedDisciple): string[] {
  const messages: string[] = []
  const baseReward = (d.realm + 1) * 20
  d.resourcesAllocated.gold += baseReward
  messages.push(`${d.name} 完成历练任务归来，带回${baseReward}灵石`)
  return messages
}

// 修复：避免直接访问未定义属性，使用安全方式
function completeMissionReward(d: Disciple): number {
  return (d.realm + 1) * 20 + Math.floor(Math.random() * 50)
}

function calculateContribution(d: CultivatedDisciple): number {
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

export function dispatchMission(d: Disciple, mission: MissionType): boolean {
  ensureCultivation(d)
  if (d.onMission) return false
  d.onMission = mission
  d.missionEndTime = Date.now() + MISSION_DURATIONS[mission]
  return true
}

// ===== 设置训练方向 =====

export function setTrainingFocus(d: Disciple, focus: TrainingFocus): void {
  ensureCultivation(d)
  d.trainingFocus = focus
}

// ===== 分配资源 =====

export function allocateResources(
  d: Disciple,
  resources: { gold?: number; pills?: number; materials?: number },
): void {
  ensureCultivation(d)
  if (resources.gold) d.resourcesAllocated.gold += resources.gold
  if (resources.pills) d.resourcesAllocated.pills += resources.pills
  if (resources.materials) d.resourcesAllocated.materials += resources.materials
  d.mood = Math.min(100, d.mood + 5)
}
