// ---------- 宗门管理系统 ----------
// 弟子招募 + 职务分配 + 门规制定 + 宗门运营

import type { GameState } from './state'
import type { SectData } from './sect-data'
import type { DiscipleData } from './disciple-system'
import { SPECIALTY_NAMES, type DiscipleSpecialty } from './disciple-system'

// ===== 职务系统 =====

export type SectPosition =
  | 'none'           // 无职
  | 'elder'          // 长老
  | 'hall_master'    // 殿主
  | 'alchemist'      // 丹堂执事
  | 'blacksmith'     // 器堂执事
  | 'librarian'      // 藏经阁守
  | 'captain'        // 护卫队长
  | 'envoy'          // 外务使者
  | 'disciple'       // 普通弟子

export const POSITION_NAMES: Record<SectPosition, string> = {
  none: '无职',
  elder: '长老',
  hall_master: '殿主',
  alchemist: '丹堂执事',
  blacksmith: '器堂执事',
  librarian: '藏经阁守',
  captain: '护卫队长',
  envoy: '外务使者',
  disciple: '普通弟子',
}

export const POSITION_DESC: Record<SectPosition, string> = {
  none: '未分配职务',
  elder: '统管宗门事务，提升全宗修炼效率',
  hall_master: '管理主殿，提升资源产出',
  alchemist: '管理炼丹房，提升丹药产出',
  blacksmith: '管理炼器阁，提升装备产出',
  librarian: '管理藏经阁，提升悟道产出',
  captain: '统领护卫，提升宗门防御',
  envoy: '负责外交，提升声望产出',
  disciple: '普通修炼',
}

// ===== 职务分配 =====

export function assignPosition(disciple: DiscipleData, position: SectPosition): { ok: boolean; message: string } {
  // 职务与特长的匹配度检查
  const matchTable: Record<DiscipleSpecialty, SectPosition[]> = {
    combat: ['captain', 'elder'],
    alchemy: ['alchemist'],
    crafting: ['blacksmith'],
    talisman: ['librarian'],
    management: ['hall_master', 'envoy', 'elder'],
    intelligence: ['envoy'],
  }

  const preferredPositions = matchTable[disciple.specialty] || ['disciple']

  if (!preferredPositions.includes(position) && position !== 'disciple' && position !== 'none') {
    return {
      ok: true,
      message: `${disciple.name}被任命为${POSITION_NAMES[position]}，但与特长不符，效率较低`,
    }
  }

  const oldPosition = disciple.onMission === position ? 'none' : 'none'
  disciple.onMission = position
  disciple.mood = Math.min(100, disciple.mood + 5)

  return {
    ok: true,
    message: `${disciple.name}被任命为${POSITION_NAMES[position]}`,
  }
}

// ===== 职务效果 =====

export interface SectPositionEffects {
  cultivationBonus: number    // 全宗修炼效率加成
  productionBonus: number     // 资源产出加成
  alchemyBonus: number        // 丹药产出加成
  forgeBonus: number          // 装备产出加成
  defenseBonus: number        // 宗门防御加成
  reputationBonus: number      // 声望产出加成
}

export function calculatePositionEffects(disciples: DiscipleData[]): SectPositionEffects {
  const effects: SectPositionEffects = {
    cultivationBonus: 0, productionBonus: 0, alchemyBonus: 0,
    forgeBonus: 0, defenseBonus: 0, reputationBonus: 0,
  }

  for (const d of disciples) {
    const pos = (d.onMission as SectPosition) || 'none'
    const realmBonus = 1 + d.realm * 0.1
    const loyaltyMult = d.loyalty / 100

    switch (pos) {
      case 'elder':
        effects.cultivationBonus += 0.05 * realmBonus * loyaltyMult
        break
      case 'hall_master':
        effects.productionBonus += 0.1 * realmBonus * loyaltyMult
        break
      case 'alchemist':
        effects.alchemyBonus += 0.15 * realmBonus * loyaltyMult
        break
      case 'blacksmith':
        effects.forgeBonus += 0.15 * realmBonus * loyaltyMult
        break
      case 'librarian':
        effects.cultivationBonus += 0.03 * realmBonus * loyaltyMult
        break
      case 'captain':
        effects.defenseBonus += 50 * realmBonus * loyaltyMult
        break
      case 'envoy':
        effects.reputationBonus += 0.1 * realmBonus * loyaltyMult
        break
    }
  }

  return effects
}

// ===== 门规系统 =====

export type SectRule =
  | 'benevolent'     // 仁义门规：行善加分
  | 'strict'         // 严厉门规：犯过重罚
  | 'neutral'        // 中庸门规
  | 'dark'           // 魔道门规：不择手段
  | 'hermit'         // 隐世门规：不问外事

export const RULE_NAMES: Record<SectRule, string> = {
  benevolent: '仁义为道',
  strict: '法度森严',
  neutral: '中庸之道',
  dark: '弱肉强食',
  hermit: '隐世无为',
}

export const RULE_DESC: Record<SectRule, string> = {
  benevolent: '门下弟子需行善积德，恶行受罚。弟子忠诚提升，但资源获取较慢',
  strict: '门规森严，弟子修炼效率提升，但心情较低',
  neutral: '不偏不倚，各方面均衡发展',
  dark: '弱肉强食，不择手段。弟子战斗力提升，但忠诚降低',
  hermit: '与世无争，修炼加速，但声望增长缓慢',
}

export function applySectRule(sect: SectData, rule: SectRule): string {
  // 门规影响弟子属性
  for (const d of sect.disciples) {
    switch (rule) {
      case 'benevolent':
        d.loyalty = Math.min(100, d.loyalty + 2)
        d.affection = Math.min(100, d.affection + 1)
        break
      case 'strict':
        d.affection = Math.max(20, d.affection - 3)
        break
      case 'dark':
        d.loyalty = Math.max(10, d.loyalty - 5)
        break
      case 'hermit':
        d.affection = Math.min(100, d.affection + 2)
        break
    }
  }

  // 存储门规
  ;(sect as any).sectRule = rule
  return `宗门确立门规：${RULE_NAMES[rule]}`
}

export function getSectRule(sect: SectData): SectRule {
  return ((sect as any).sectRule as SectRule) || 'neutral'
}

// ===== 门规效果修正 =====

export function getRuleModifier(rule: SectRule): {
  cultivation: number
  combat: number
  loyalty: number
  mood: number
  resourceGain: number
} {
  const modifiers: Record<SectRule, { cultivation: number; combat: number; loyalty: number; mood: number; resourceGain: number }> = {
    benevolent: { cultivation: 1.0, combat: 0.9, loyalty: 1.2, mood: 1.1, resourceGain: 0.9 },
    strict: { cultivation: 1.15, combat: 1.0, loyalty: 0.9, mood: 0.8, resourceGain: 1.0 },
    neutral: { cultivation: 1.0, combat: 1.0, loyalty: 1.0, mood: 1.0, resourceGain: 1.0 },
    dark: { cultivation: 0.9, combat: 1.25, loyalty: 0.7, mood: 0.9, resourceGain: 1.1 },
    hermit: { cultivation: 1.2, combat: 0.8, loyalty: 1.1, mood: 1.1, resourceGain: 0.7 },
  }
  return modifiers[rule] || modifiers.neutral
}

// ===== 宗门总览 =====

export function getSectOverview(state: GameState): string[] {
  if (!state.sect) return ['尚未建立宗门']

  const sect = state.sect
  const rules = getSectRule(sect)
  const effects = calculatePositionEffects(state.disciples)
  const ruleMod = getRuleModifier(rules)

  const lines: string[] = [
    `宗门：${sect.name}（${sect.level}级）`,
    `门规：${RULE_NAMES[rules]}`,
    `弟子：${state.disciples.length}人`,
    '',
    '—— 宗门资源 ——',
    `灵石：${sect.resources.stone}`,
    `灵草：${sect.resources.herb}`,
    `矿石：${sect.resources.ore}`,
    `木材：${sect.resources.wood}`,
    `悟道：${sect.resources.insight}`,
    `声望：${sect.resources.prestige}`,
    '',
    '—— 职务加成 ——',
    `修炼效率：${(effects.cultivationBonus * 100).toFixed(0)}%`,
    `资源产出：${(effects.productionBonus * 100).toFixed(0)}%`,
    `宗门防御：${effects.defenseBonus.toFixed(0)}`,
    `声望产出：${(effects.reputationBonus * 100).toFixed(0)}%`,
  ]

  if (state.disciples.length > 0) {
    lines.push('')
    lines.push('—— 弟子名单 ——')
    for (const d of state.disciples) {
      const pos = (d.onMission as SectPosition) || 'none'
      const posName = POSITION_NAMES[pos] || '修炼'
      const specName = SPECIALTY_NAMES[d.specialty] || ''
      lines.push(`${d.name} [${posName}] ${specName} 忠诚${d.loyalty.toFixed(0)} 心情${d.mood.toFixed(0)}`)
    }
  }

  return lines
}
