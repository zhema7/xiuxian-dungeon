// ---------- 天劫系统v2 ----------
// 突破渡劫 + 业力影响 + 心魔劫 + 多重天劫类型

import type { GameState } from './state'
import { getDemonSummary } from './inner-demon'
import { needsTribulation, getTribulation, type TribulationDef } from './tribulation-data'

// ===== 天劫类型 =====

export type TribulationKind =
  | 'heaven_thunder'   // 天雷劫（标准）
  | 'heart_demon'      // 心魔劫（心魔过高触发）
  | 'karma_fire'       // 业火劫（恶业过重触发）
  | 'wind_fire'        // 风火劫（中等难度）
  | 'nine_nine'        // 九九重劫（终极渡劫）

export interface EnhancedTribulationDef extends TribulationDef {
  kind: TribulationKind
  karmaModifier: number    // 业力影响系数
  demonModifier: number    // 心魔影响系数
  additionalWaves: number   // 额外波次
  rewardBonus: number      // 成功额外奖励
  description: string
}

// ===== 根据玩家状态判定天劫类型 =====

export function determineTribulationKind(state: GameState): TribulationKind {
  const karma = state.karma || 0
  const demonSummary = getDemonSummary(state)

  // 极度恶业 → 业火劫
  if (state.morality < -50 && karma < -50) {
    return 'karma_fire'
  }

  // 心魔极重 → 心魔劫
  if (demonSummary.max >= 70) {
    return 'heart_demon'
  }

  // 渡劫境突破 → 九九重劫
  if (state.realm >= 5) {
    return 'nine_nine'
  }

  // 化神境 → 风火劫
  if (state.realm >= 4) {
    return 'wind_fire'
  }

  // 默认 → 天雷劫
  return 'heaven_thunder'
}

// ===== 构建增强天劫 =====

export function buildEnhancedTribulation(state: GameState, realmIndex: number): EnhancedTribulationDef | null {
  if (!needsTribulation(realmIndex)) return null
  const base = getTribulation(realmIndex)
  if (!base) return null

  const kind = determineTribulationKind(state)
  const demonSummary = getDemonSummary(state)
  const karma = state.karma || 0

  // 业力影响：恶业增加天劫难度
  const karmaModifier = Math.max(0, -karma / 100)
  // 心魔影响：心魔增加天劫难度
  const demonModifier = demonSummary.total / 200

  const kindConfigs: Record<TribulationKind, { additionalWaves: number; rewardBonus: number; description: string }> = {
    heaven_thunder: {
      additionalWaves: 0,
      rewardBonus: 0,
      description: '天道降下雷劫，需以肉身硬抗天雷',
    },
    heart_demon: {
      additionalWaves: 2,
      rewardBonus: 15,
      description: '心魔引动天劫，天雷与心魔齐至！渡过则心魔大减',
    },
    karma_fire: {
      additionalWaves: 3,
      rewardBonus: 20,
      description: '业火焚身，天道惩戒恶业！渡过则业力消减',
    },
    wind_fire: {
      additionalWaves: 1,
      rewardBonus: 10,
      description: '罡风烈火齐至，双重考验',
    },
    nine_nine: {
      additionalWaves: 6,
      rewardBonus: 50,
      description: '九九八十一道天劫！大乘之劫，生死一线',
    },
  }

  const config = kindConfigs[kind]

  return {
    ...base,
    kind,
    karmaModifier,
    demonModifier,
    additionalWaves: config.additionalWaves,
    rewardBonus: config.rewardBonus,
    description: config.description,
    // 增加伤害
    damagePerStrike: Math.floor(base.damagePerStrike * (1 + karmaModifier * 0.3 + demonModifier * 0.2)),
    // 增加波次
    maxStrikesTotal: base.maxStrikesTotal + config.additionalWaves * 3,
    // 延长时间
    durationMs: base.durationMs + config.additionalWaves * 2000,
  }
}

// ===== 天劫成功奖励 =====

export interface TribulationReward {
  insight: number
  hpRestore: number
  demonReduction: number
  karmaReduction: number
  bonusGold: number
  messages: string[]
}

export function calculateTribulationReward(state: GameState, trib: EnhancedTribulationDef): TribulationReward {
  const reward: TribulationReward = {
    insight: 0,
    hpRestore: 0,
    demonReduction: 0,
    karmaReduction: 0,
    bonusGold: 0,
    messages: [],
  }

  const tier = trib.realmIndex - 1
  const baseInsight = 10 + tier * 5

  reward.insight = baseInsight + trib.rewardBonus
  reward.hpRestore = state.level * 100 + 500
  reward.bonusGold = 100 + tier * 50

  reward.messages.push(`渡过${trib.name}！获得悟道点 ${reward.insight}`)
  reward.messages.push(`灵石 +${reward.bonusGold}`)
  reward.messages.push(`HP恢复至满值`)

  // 心魔劫特殊奖励
  if (trib.kind === 'heart_demon') {
    reward.demonReduction = 30
    reward.messages.push(`心魔减轻 30 点`)
  }

  // 业火劫特殊奖励
  if (trib.kind === 'karma_fire') {
    reward.karmaReduction = 30
    reward.messages.push(`业力消减 30 点，道德值 +5`)
    state.morality = Math.min(100, (state.morality || 0) + 5)
  }

  return reward
}

// ===== 天劫失败惩罚 =====

export interface TribulationFailure {
  hpLoss: number
  expLoss: number
  demonIncrease: number
  messages: string[]
}

export function calculateTribulationFailure(state: GameState, trib: EnhancedTribulationDef): TribulationFailure {
  const failure: TribulationFailure = {
    hpLoss: 0,
    expLoss: 0,
    demonIncrease: 0,
    messages: [],
  }

  failure.hpLoss = Math.floor(state.level * 50 + 100)
  failure.expLoss = state.level * 30
  failure.messages.push(`天劫失败！HP降至1，修为倒退${failure.expLoss}经验`)

  // 心魔增加
  if (trib.kind === 'heart_demon') {
    failure.demonIncrease = 10
    failure.messages.push(`心魔加重 10 点`)
  }

  // 业火劫失败更严重
  if (trib.kind === 'karma_fire') {
    failure.expLoss *= 2
    failure.messages.push(`业火反噬！修为倒退翻倍`)
  }

  return failure
}

// ===== 检查是否可以触发天劫 =====

export function canTriggerTribulation(state: GameState): { ok: boolean; realmIndex: number; reason: string } {
  // 检查境界是否在渡劫范围
  for (let i = 1; i <= 6; i++) {
    if (needsTribulation(i) && state.realm === i - 1) {
      // 检查经验是否足够
      const expNeed = state.level * 200
      if (state.exp < expNeed) {
        return { ok: false, realmIndex: i, reason: `修为不足，需${expNeed}经验方可触发天劫` }
      }
      return { ok: true, realmIndex: i, reason: '' }
    }
  }
  return { ok: false, realmIndex: 0, reason: '当前境界无需渡劫' }
}

// ===== 天劫准备 =====

export function prepareTribulation(state: GameState): { def: EnhancedTribulationDef; warnings: string[] } | null {
  const check = canTriggerTribulation(state)
  if (!check.ok) return null

  const def = buildEnhancedTribulation(state, check.realmIndex)
  if (!def) return null

  const warnings: string[] = []

  // 天劫预警
  warnings.push(`即将迎来：${def.name}`)
  warnings.push(def.description)
  warnings.push(`劫难时长：${(def.durationMs / 1000).toFixed(1)}秒`)
  warnings.push(`天雷伤害：${def.damagePerStrike}`)
  warnings.push(`天雷数量：${def.maxStrikesTotal}道`)

  if (def.karmaModifier > 0.1) {
    warnings.push(`⚠ 业力影响：天劫威力增加${(def.karmaModifier * 30).toFixed(0)}%`)
  }
  if (def.demonModifier > 0.1) {
    warnings.push(`⚠ 心魔影响：天劫威力增加${(def.demonModifier * 20).toFixed(0)}%`)
  }

  // 天劫前准备建议
  warnings.push('')
  warnings.push('建议：确保HP充足，准备恢复丹药')

  return { def, warnings }
}
