// ---------- 命中碎裂判据单测：排除 bolt_fly/proj_fly 误播 sword_proj_hit ----------
// 验证 destroySwordProj 回归修复（fx-anim-batch-spec.md §2.3 / §4.6）：
// bolt_fly / proj_fly 是 Sprite 但 currentAnim 非 sword_proj，必须走直接销毁，不能播剑光碎裂。

import { describe, expect, it } from 'vitest'
import { isSwordProjAnim } from '../src/scenes/anim-guard'

describe('isSwordProjAnim', () => {
  it('非 Sprite 不播（静态 proj/bolt 兜底路径）', () => {
    expect(isSwordProjAnim(false, 'bolt_fly')).toBe(false)
    expect(isSwordProjAnim(false, 'proj_fly')).toBe(false)
  })

  it('bolt_fly Sprite 不误播 sword_proj_hit（回归关键）', () => {
    expect(isSwordProjAnim(true, 'bolt_fly')).toBe(false)
  })

  it('proj_fly Sprite 不误播 sword_proj_hit', () => {
    expect(isSwordProjAnim(true, 'proj_fly')).toBe(false)
  })

  it('sword_proj_fly Sprite 播', () => {
    expect(isSwordProjAnim(true, 'sword_proj_fly')).toBe(true)
  })

  it('sword_proj_hit Sprite 播', () => {
    expect(isSwordProjAnim(true, 'sword_proj_hit')).toBe(true)
  })

  it('currentAnimKey 为 undefined 不播', () => {
    expect(isSwordProjAnim(true, undefined)).toBe(false)
  })
})
