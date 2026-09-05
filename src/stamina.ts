// ---------- 体力系统 ----------
// 移动消耗、休息恢复、体力影响移动速度

import type { GameState } from './state'

const MAX_STAMINA = 100
const STAMINA_MOVE_COST = 0.02   // 每帧消耗
const STAMINA_RECOVER_RATE = 0.5 // 静止时恢复
const STAMINA_EXHAUST_THRESHOLD = 20  // 体力低于此值减速

export function tickStamina(state: GameState, isMoving: boolean, deltaMs: number): void {
  if (isMoving) {
    state.stamina = Math.max(0, state.stamina - STAMINA_MOVE_COST * deltaMs / 16.67)
  } else {
    state.stamina = Math.min(MAX_STAMINA, state.stamina + STAMINA_RECOVER_RATE * deltaMs / 16.67)
  }
}

export function getStaminaSpeedModifier(state: GameState): number {
  if (state.stamina < STAMINA_EXHAUST_THRESHOLD) {
    return 0.5  // 体力不足时减速50%
  }
  return 1.0
}

export function isExhausted(state: GameState): boolean {
  return state.stamina < STAMINA_EXHAUST_THRESHOLD
}

export function getStaminaDisplay(state: GameState): { value: number; max: number; label: string } {
  const value = Math.floor(state.stamina)
  let label = '充沛'
  if (value < 20) label = '疲惫'
  else if (value < 50) label = '一般'
  return { value, max: MAX_STAMINA, label }
}
