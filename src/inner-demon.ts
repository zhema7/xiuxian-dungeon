// ---------- 心魔系统 ----------
// 心魔来源：杀戮/背叛/魔功/情伤/贪婪
// 应对方式：静坐化解/丹药净化/秘境历练/佛法超度
// 心魔幻境：特殊挑战副本

import type { GameState } from './state'
import type { ProceduralNpc } from './procedural-npc'

// ===== 心魔类型 =====

export type InnerDemonType =
  | 'killing'      // 杀戮心魔（杀无辜过多）
  | 'betrayal'     // 背叛心魔（背叛师门/道友）
  | 'dark_arts'    // 魔功心魔（修炼魔道功法）
  | 'heartbreak'   // 情伤心魔（道侣陨落）
  | 'greed'        // 贪欲心魔（过度劫掠）
  | 'pride'        // 傲慢心魔（连胜生骄）
  | 'fear'         // 恐惧心魔（濒死创伤）
  | 'obsession'    // 执念心魔（执于复仇/寻人）

export interface InnerDemon {
  type: InnerDemonType
  intensity: number     // 1-100
  accumulatedMs: number  // 累积时间
  lastTrigger: number    // 上次触发时间
  sealed: boolean        // 是否被封印
}

// ===== 心魔来源 =====

export function addInnerDemon(state: GameState, type: InnerDemonType, intensity: number, reason: string): string {
  const demons = state.innerDemons as InnerDemon[]
  let demon = demons.find(d => d.type === type)
  if (!demon) {
    demon = { type, intensity: 0, accumulatedMs: 0, lastTrigger: Date.now(), sealed: false }
    demons.push(demon)
  }

  demon.intensity = Math.min(100, demon.intensity + intensity)
  demon.lastTrigger = Date.now()
  demon.sealed = false

  const typeNames: Record<InnerDemonType, string> = {
    killing: '杀戮', betrayal: '背叛', dark_arts: '魔功',
    heartbreak: '情伤', greed: '贪欲', pride: '傲慢',
    fear: '恐惧', obsession: '执念',
  }
  return `${typeNames[type]}心魔加深（${demon.intensity}/100）：${reason}`
}

// ===== 心魔触发检测 =====

export interface DemonManifestation {
  type: InnerDemonType
  effect: 'cultivation_penalty' | 'random_debuff' | 'illusion' | 'berserk' | 'breakthrough_fail'
  description: string
  severity: number
}

export function checkDemonManifestation(state: GameState): DemonManifestation | null {
  const demons = state.innerDemons as InnerDemon[]
  if (!demons || demons.length === 0) return null

  const activeDemons = demons.filter(d => !d.sealed && d.intensity >= 20)
  if (activeDemons.length === 0) return null

  // 心魔强度越高，触发概率越大
  const totalIntensity = activeDemons.reduce((s, d) => s + d.intensity, 0)
  const triggerChance = Math.min(0.15, totalIntensity / 1000)

  if (Math.random() > triggerChance) return null

  // 随机选一个心魔触发
  const demon = activeDemons[Math.floor(Math.random() * activeDemons.length)]
  const severity = demon.intensity
  const demonType = demon.type as InnerDemonType

  const typeNames: Record<InnerDemonType, string> = {
    killing: '杀戮', betrayal: '背叛', dark_arts: '魔功',
    heartbreak: '情伤', greed: '贪欲', pride: '傲慢',
    fear: '恐惧', obsession: '执念',
  }

  // 根据强度选择效果
  if (severity >= 80) {
    return {
      type: demonType,
      effect: 'illusion',
      description: `【心魔幻境】${typeNames[demonType]}心魔爆发！你陷入了幻境……`,
      severity,
    }
  } else if (severity >= 60) {
    const effects = [
      {
        effect: 'berserk' as const,
        description: `【心魔侵蚀】${typeNames[demonType]}心魔侵蚀神智，你陷入了狂化状态！`,
      },
      {
        effect: 'breakthrough_fail' as const,
        description: `【心魔阻碍】${typeNames[demonType]}心魔阻碍修炼，修为停滞不前`,
      },
    ]
    const evt = effects[Math.floor(Math.random() * effects.length)]
    return { type: demonType, ...evt, severity }
  } else if (severity >= 40) {
    return {
      type: demonType,
      effect: 'cultivation_penalty',
      description: `【心魔困扰】${typeNames[demonType]}心魔困扰，修炼效率降低`,
      severity,
    }
  } else {
    return {
      type: demonType,
      effect: 'random_debuff',
      description: `【心魔微扰】${typeNames[demonType]}心魔微扰，心神不宁`,
      severity,
    }
  }
}

// ===== 心魔应对方式 =====

export type PurificationMethod =
  | 'meditation'    // 静坐化解
  | 'pill'          // 丹药净化
  | 'realm_trial'   // 秘境历练
  | 'buddha'        // 佛法超度
  | 'seal'          // 封印镇压

export interface PurificationResult {
  success: boolean
  reducedIntensity: number
  message: string
  sideEffect?: string
}

export function purifyDemon(
  state: GameState,
  demonType: InnerDemonType,
  method: PurificationMethod,
): PurificationResult {
  const demons = state.innerDemons as InnerDemon[]
  if (!demons) return { success: false, reducedIntensity: 0, message: '无心魔可化解' }

  const demon = demons.find(d => d.type === demonType)
  if (!demon || demon.sealed) {
    return { success: false, reducedIntensity: 0, message: '该心魔已被封印或不存在' }
  }

  const methodEffects: Record<PurificationMethod, { reduction: number; cost: string; risk: number }> = {
    meditation: { reduction: 5, cost: '消耗1时辰', risk: 0.05 },
    pill: { reduction: 20, cost: '消耗净魔丹×1', risk: 0.02 },
    realm_trial: { reduction: 35, cost: '需进入秘境历练', risk: 0.1 },
    buddha: { reduction: 50, cost: '需寻得佛法高人', risk: 0.01 },
    seal: { reduction: 0, cost: '暂时封印，非根除', risk: 0.15 },
  }

  const effect = methodEffects[method]

  if (method === 'seal') {
    demon.sealed = true
    return {
      success: true,
      reducedIntensity: 0,
      message: `${demonType}心魔被暂时封印！但非根除，日后可能复发`,
      sideEffect: '封印期间修炼效率降低10%',
    }
  }

  // 检查风险（化解失败可能导致心魔反弹）
  if (Math.random() < effect.risk) {
    demon.intensity = Math.min(100, demon.intensity + 5)
    return {
      success: false,
      reducedIntensity: 0,
      message: `化解失败！${demonType}心魔反弹，强度反而增加了5`,
    }
  }

  demon.intensity = Math.max(0, demon.intensity - effect.reduction)

  if (demon.intensity <= 0) {
    state.innerDemons = demons.filter(d => d.type !== demonType)
    return {
      success: true,
      reducedIntensity: effect.reduction,
      message: `${demonType}心魔彻底化解！心中澄明`,
    }
  }

  return {
    success: true,
    reducedIntensity: effect.reduction,
    message: `${demonType}心魔减弱${effect.reduction}点（剩余${demon.intensity}/100）。${effect.cost}`,
  }
}

// ===== 获取心魔总览 =====

export function getDemonSummary(state: GameState): { total: number; max: number; demons: { type: InnerDemonType; intensity: number; sealed: boolean }[] } {
  const demons = state.innerDemons as InnerDemon[]
  if (!demons || demons.length === 0) return { total: 0, max: 0, demons: [] }
  const total = demons.filter(d => !d.sealed).reduce((s, d) => s + d.intensity, 0)
  const max = Math.max(0, ...demons.map(d => d.intensity))
  return { total, max, demons: demons.map(d => ({ type: d.type, intensity: d.intensity, sealed: d.sealed })) }
}

// ===== 心魔对修炼的影响 =====

export function getCultivationModifier(state: GameState): number {
  const demons = state.innerDemons as InnerDemon[]
  if (!demons) return 1.0
  const activeDemons = demons.filter(d => !d.sealed)
  if (activeDemons.length === 0) return 1.0
  const totalIntensity = activeDemons.reduce((s, d) => s + d.intensity, 0)
  return Math.max(0.5, 1.0 - totalIntensity * 0.001)
}

// ===== 心魔幻境定义 =====

export interface DemonIllusionDef {
  type: InnerDemonType
  name: string
  description: string
  monsterLevel: number
  monsterCount: number
  rewardInsight: number
  rewardDemonReduction: number
}

export function generateDemonIllusion(state: GameState): DemonIllusionDef | null {
  const demons = state.innerDemons as InnerDemon[]
  if (!demons) return null
  const strongestDemon = demons
    .filter(d => !d.sealed && d.intensity >= 80)
    .sort((a, b) => b.intensity - a.intensity)[0]
  if (!strongestDemon) return null

  const demonType = strongestDemon.type as InnerDemonType

  const typeNames: Record<InnerDemonType, string> = {
    killing: '杀戮', betrayal: '背叛', dark_arts: '魔功',
    heartbreak: '情伤', greed: '贪欲', pride: '傲慢',
    fear: '恐惧', obsession: '执念',
  }
  const typeDescs: Record<InnerDemonType, string> = {
    killing: '无数冤魂围攻而来，你必须面对过去的杀孽',
    betrayal: '曾经背叛的人影浮现，你必须直面内心的愧疚',
    dark_arts: '魔气凝成实体，化为你最恐惧的魔修形态',
    heartbreak: '道侣的身影在幻境中消散，你必须战胜心中的执念',
    greed: '遍地金银灵石化作妖魔，贪婪的代价必须偿还',
    pride: '过去的败敌一一重现，骄傲的果实是孤寂',
    fear: '最深层的恐惧化为实体，你必须直面它',
    obsession: '执念化为心魔分身，只有战胜才能放下',
  }

  return {
    type: strongestDemon.type,
    name: `${typeNames[strongestDemon.type]}心魔幻境`,
    description: typeDescs[strongestDemon.type],
    monsterLevel: state.level + 5,
    monsterCount: 3 + Math.floor(strongestDemon.intensity / 25),
    rewardInsight: 20 + strongestDemon.intensity / 5,
    rewardDemonReduction: 40,
  }
}
