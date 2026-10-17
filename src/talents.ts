// ---------- 天赋系统运行时（v0.9：五职业独立天赋树） ----------

import {
  CAPSTONE_REQ, TALENT_NODES, TALENT_NODE_CLASS, talentBranchesFor, emptyMods,
  type ModKey, type Mods, type TalentBranch,
} from './data'
import type { GameState } from './state'

export const RESPEC_COST = 100
/** 预设方案上限 */
export const MAX_TALENT_PRESETS = 3

export interface TalentPreset { name: string; points: Record<string, number> }

export function spentPoints(s: GameState): number {
  return Object.values(s.talents).reduce((a, b) => a + b, 0)
}

/** 可用天赋点：每级 1 点 */
export function availablePoints(s: GameState): number {
  return Math.max(0, s.level - 1 - spentPoints(s))
}

/** 取当前职业的天赋分支（3 条，每条 6 节点） */
export function branchesOf(s: GameState): TalentBranch[] {
  return talentBranchesFor(s.classId)
}

/** 某分支已投入点数 */
export function branchSpent(s: GameState, br: TalentBranch): number {
  return br.nodes.reduce((a, n) => a + (s.talents[n.id] ?? 0), 0)
}

/** 节点是否属于当前职业 */
export function isOwnNode(s: GameState, nodeId: string): boolean {
  return TALENT_NODE_CLASS.get(nodeId) === s.classId
}

/**
 * 是否可加点：节点存在、属于本职业、未达上限、有余点；
 * 顶点（tier 3）额外要求本分支已投入 CAPSTONE_REQ 点。
 */
export function canAddPoint(s: GameState, nodeId: string): boolean {
  const node = TALENT_NODES.get(nodeId)
  if (!node || !isOwnNode(s, nodeId)) return false
  if ((s.talents[nodeId] ?? 0) >= node.max) return false
  if (availablePoints(s) <= 0) return false
  if (node.tier === 3) {
    const br = branchesOf(s).find((b) => b.nodes.some((n) => n.id === nodeId))
    if (!br || branchSpent(s, br) < CAPSTONE_REQ) return false
  }
  return true
}

export function addPoint(s: GameState, nodeId: string): boolean {
  if (!canAddPoint(s, nodeId)) return false
  s.talents[nodeId] = (s.talents[nodeId] ?? 0) + 1
  return true
}

/** 批量加点（返回实际投入点数） */
export function addPoints(s: GameState, nodeId: string, count: number): number {
  let n = 0
  for (let i = 0; i < count; i++) { if (addPoint(s, nodeId)) n++; else break }
  return n
}

/**
 * 流派一键加点：把当前可用点数按「基础 → 进阶 → 顶点」顺序灌满该分支。
 * @returns 实际投入点数
 */
export function autoAssignBranch(s: GameState, branchId: string): number {
  const br = branchesOf(s).find((b) => b.id === branchId)
  if (!br) return 0
  // 同层级内轮流分配（先基础、再进阶、最后顶点），点数不足时属性成长更均衡
  const cursor = new Map<number, number>() // tier → 轮转游标
  let added = 0
  let guard = 0
  let progressed = true
  while (progressed && availablePoints(s) > 0 && guard++ < 500) {
    progressed = false
    for (const tier of [1, 2, 3] as const) {
      const group = br.nodes.filter((n) => n.tier === tier)
      if (group.length === 0) continue
      if (tier === 3 && branchSpent(s, br) < CAPSTONE_REQ) continue
      const start = cursor.get(tier) ?? 0
      for (let i = 0; i < group.length; i++) {
        const n = group[(start + i) % group.length]
        if (addPoint(s, n.id)) {
          added++
          progressed = true
          cursor.set(tier, (start + i + 1) % group.length)
          break
        }
      }
    }
  }
  return added
}

export function respec(s: GameState): boolean {
  if (s.gold < RESPEC_COST || spentPoints(s) === 0) return false
  s.gold -= RESPEC_COST
  s.talents = {}
  return true
}

/** 无条件清空（迁移 / 换职业时使用，不扣费） */
export function clearTalents(s: GameState): void {
  s.talents = {}
}

// ---------- 预设方案 ----------
export function presetsOf(s: GameState): TalentPreset[] {
  return s.talentPresets ?? []
}

/** 保存当前加点为预设（同名覆盖，最多 MAX_TALENT_PRESETS 套） */
export function savePreset(s: GameState, name: string): boolean {
  if (spentPoints(s) === 0) return false
  const list = presetsOf(s).slice()
  const idx = list.findIndex((p) => p.name === name)
  const preset: TalentPreset = { name, points: { ...s.talents } }
  if (idx >= 0) list[idx] = preset
  else {
    if (list.length >= MAX_TALENT_PRESETS) return false
    list.push(preset)
  }
  s.talentPresets = list
  return true
}

/** 套用预设：清空后按预设逐点投入（点数不足则尽力而为） */
export function applyPreset(s: GameState, index: number): boolean {
  const p = presetsOf(s)[index]
  if (!p) return false
  s.talents = {}
  for (const [id, pts] of Object.entries(p.points)) addPoints(s, id, pts)
  // 清掉未能投入的残留（例如预设来自其它职业）
  s.talents = Object.fromEntries(Object.entries(s.talents).filter(([id]) => isOwnNode(s, id)))
  return true
}

export function deletePreset(s: GameState, index: number): boolean {
  const list = presetsOf(s).slice()
  if (index < 0 || index >= list.length) return false
  list.splice(index, 1)
  s.talentPresets = list
  return true
}

// ---------- 修饰聚合 ----------
/** 天赋总修饰（只统计本职业节点，防止旧档残留生效） */
export function talentMods(s: GameState): Mods {
  const mods = emptyMods()
  for (const [id, pts] of Object.entries(s.talents)) {
    const node = TALENT_NODES.get(id)
    if (!node || pts <= 0) continue
    if (!isOwnNode(s, id)) continue
    for (const [k, v] of Object.entries(node.per)) {
      mods[k as ModKey] += (v as number) * pts
    }
  }
  return mods
}
