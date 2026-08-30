// ---------- 天赋系统运行时 ----------

import { TALENT_NODES, emptyMods, type ModKey, type Mods } from './data'
import type { GameState } from './state'

export const RESPEC_COST = 100

export function spentPoints(s: GameState): number {
  return Object.values(s.talents).reduce((a, b) => a + b, 0)
}

/** 可用天赋点：每级 1 点 */
export function availablePoints(s: GameState): number {
  return Math.max(0, s.level - 1 - spentPoints(s))
}

export function addPoint(s: GameState, nodeId: string): boolean {
  const node = TALENT_NODES.get(nodeId)
  if (!node) return false
  const cur = s.talents[nodeId] ?? 0
  if (cur >= node.max || availablePoints(s) <= 0) return false
  s.talents[nodeId] = cur + 1
  return true
}

export function respec(s: GameState): boolean {
  if (s.gold < RESPEC_COST || spentPoints(s) === 0) return false
  s.gold -= RESPEC_COST
  s.talents = {}
  return true
}

/** 天赋总修饰 */
export function talentMods(s: GameState): Mods {
  const mods = emptyMods()
  for (const [id, pts] of Object.entries(s.talents)) {
    const node = TALENT_NODES.get(id)
    if (!node || pts <= 0) continue
    for (const [k, v] of Object.entries(node.per)) {
      mods[k as ModKey] += (v as number) * pts
    }
  }
  return mods
}
