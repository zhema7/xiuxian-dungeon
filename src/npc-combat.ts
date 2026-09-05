// ---------- NPC 战斗系统 ----------
// 修士AI、技能使用、掉落机制

import type { GameState } from './state'
import type { ProceduralNpc } from './procedural-npc'
import { onKillInnocent, onKillEvilCultivator, onPlunderNpc } from './karma'
import { getItemName } from './divine-sense'

export interface NpcCombatData {
  npcId: string
  hp: number
  maxHp: number
  atk: number
  def: number
  spd: number
  // AI状态
  aiState: 'idle' | 'aggro' | 'attacking' | 'fleeing' | 'dead'
  // 技能冷却
  skillCooldowns: Record<string, number>
  // 战斗行为
  fleeThreshold: number  // 血量低于此比例时逃跑
  aggression: number    // 攻击性 0~1
}

export function createNpcCombatData(npc: ProceduralNpc): NpcCombatData {
  let fleeThreshold = 0.2
  let aggression = 0.5

  // 性格影响战斗行为
  if (npc.personality.includes('好战')) {
    aggression = 0.8
    fleeThreshold = 0.1
  }
  if (npc.personality.includes('谨慎')) {
    aggression = 0.3
    fleeThreshold = 0.4
  }
  if (npc.personality.includes('狡诈')) {
    aggression = 0.6
    fleeThreshold = 0.3
  }
  if (npc.personality.includes('刚正')) {
    aggression = 0.7
    fleeThreshold = 0.05
  }

  return {
    npcId: npc.id,
    hp: npc.hp,
    maxHp: npc.maxHp,
    atk: npc.atk,
    def: npc.def,
    spd: npc.spd,
    aiState: 'idle',
    skillCooldowns: {},
    fleeThreshold,
    aggression,
  }
}

// ===== NPC战斗AI决策 =====

export type NpcAction =
  | { type: 'attack'; target: 'player' }
  | { type: 'skill'; skillId: string; target: 'player' }
  | { type: 'flee' }
  | { type: 'defend' }
  | { type: 'taunt'; text: string }

export function decideNpcAction(
  combat: NpcCombatData,
  npc: ProceduralNpc,
  playerHp: number,
  playerMaxHp: number,
  rng: () => number,
): NpcAction {
  const hpRatio = combat.hp / combat.maxHp

  // 血量低于阈值时逃跑
  if (hpRatio < combat.fleeThreshold) {
    // 谨慎性格更容易逃跑
    if (npc.personality.includes('谨慎') || rng() < 0.5) {
      const fleeTexts = ['「此地不留爷，后会有期！」', '「你且等着！」', '「可恶……先撤为敬！」']
      return { type: 'flee' }
    }
    // 好战性格可能在低血量时反扑
    if (npc.personality.includes('好战') && rng() < 0.3) {
      const tauntTexts = ['「今日便拼死一战！」', '「即使死也要拉你垫背！」']
      return { type: 'taunt', text: tauntTexts[Math.floor(rng() * tauntTexts.length)] }
    }
  }

  // 使用技能（如果可用）
  if (npc.skills.length > 0 && rng() < combat.aggression * 0.4) {
    const skillId = npc.skills[Math.floor(rng() * npc.skills.length)]
    if (!(combat.skillCooldowns[skillId] > 0)) {
      return { type: 'skill', skillId, target: 'player' }
    }
  }

  // 普通攻击
  return { type: 'attack', target: 'player' }
}

// ===== NPC受到伤害 =====

export function damageNpc(combat: NpcCombatData, damage: number): void {
  const actualDamage = Math.max(1, damage - Math.floor(combat.def * 0.3))
  combat.hp = Math.max(0, combat.hp - actualDamage)
  if (combat.hp <= 0) {
    combat.aiState = 'dead'
  }
}

// ===== NPC造成伤害 =====

export function npcAttackDamage(combat: NpcCombatData, rng: () => number): number {
  const variance = 0.8 + rng() * 0.4
  return Math.floor(combat.atk * variance)
}

// ===== 击杀NPC后的处理 =====

export function onNpcDefeated(
  state: GameState,
  npc: ProceduralNpc,
  combat: NpcCombatData,
): { loot: Record<string, number>; gold: number; message: string } {
  npc.alive = false
  combat.aiState = 'dead'

  // 掉落物品 = NPC背包中的物品
  const loot: Record<string, number> = { ...npc.inventory }
  const gold = loot.gold || 0
  delete loot.gold

  // 判定道德/业力影响
  if (npc.morality < -20) {
    // 邪修
    onKillEvilCultivator(state, npc)
  } else if (npc.morality > 20) {
    // 正派修士
    onKillInnocent(state, npc)
  } else {
    // 中立NPC
    onKillInnocent(state, npc)
  }

  const lootSummary = Object.entries(loot).map(([k, v]) => `${getItemName(k)}×${v}`).join('、')
  return {
    loot,
    gold,
    message: `${npc.name} 被击败！获得灵石${gold}，${lootSummary || '背包空空如也'}`,
  }
}

// ===== 劫掠（不杀死） =====

export function plunderNpc(
  state: GameState,
  npc: ProceduralNpc,
): { loot: Record<string, number>; gold: number; message: string } {
  const loot: Record<string, number> = {}
  const gold = Math.floor((npc.inventory.gold || 0) * 0.5)
  loot.gold = gold

  // 随机抽取部分物品
  for (const [k, v] of Object.entries(npc.inventory)) {
    if (k === 'gold') continue
    if (Math.random() < 0.5) {
      loot[k] = Math.ceil(v * 0.5)
    }
  }

  onPlunderNpc(state, npc)
  // NPC好感大幅下降
  const rel = state.playerNpcRelations[npc.id]
  if (rel) {
    rel.favor -= 50
    rel.trust = Math.max(0, rel.trust - 30)
  }

  // NPC可能逃跑
  npc.hp = Math.floor(npc.maxHp * 0.3)

  const lootSummary = Object.entries(loot).map(([k, v]) => `${getItemName(k)}×${v}`).join('、')
  return {
    loot,
    gold,
    message: `你劫掠了${npc.name}的储物戒！获得${lootSummary || '没什么好东西'}`,
  }
}

// ===== 切磋（友好战斗） =====

export function sparWithNpc(
  state: GameState,
  npc: ProceduralNpc,
): { exp: number; favor: number; message: string } {
  const expGain = 20 + npc.level * 5
  const favorGain = 5

  const rel = state.playerNpcRelations[npc.id]
  if (rel) {
    rel.favor += favorGain
  }

  return {
    exp: expGain,
    favor: favorGain,
    message: `与${npc.name}切磋一番，收获颇丰！好感度+${favorGain}`,
  }
}
