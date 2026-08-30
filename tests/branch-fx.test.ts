import { describe, expect, it } from 'vitest'
import { createChainVisualGuard, triggerBranchFxOnce } from '../src/fx/branchFx'

describe('branch visual guards', () => {
  it('triggers each attack visual once', () => {
    const seen = new Set<string>()
    expect(triggerBranchFxOnce(seen, 'attack')).toBe(true)
    expect(triggerBranchFxOnce(seen, 'attack')).toBe(false)
  })
  it('does not cross-enable old tags', () => {
    const seen = new Set<string>()
    expect(triggerBranchFxOnce(seen, 'test_sword_visual')).toBe(true)
    expect(seen.has('fire_burst')).toBe(false)
  })
  it('deduplicates chain links and target flashes, then clears', () => {
    const guard = createChainVisualGuard()
    expect(guard.shouldConnect('a', 'b')).toBe(true)
    expect(guard.shouldConnect('a', 'b')).toBe(false)
    expect(guard.shouldFlash('b')).toBe(true)
    expect(guard.shouldFlash('b')).toBe(false)
    guard.clear()
    expect(guard.shouldConnect('a', 'b')).toBe(true)
  })
})
