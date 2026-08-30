export type BranchFxTag = 'test_sword_visual' | 'test_frost_visual' | 'test_thunder_visual' | 'test_giant_visual'

export interface BranchFxRuntime {
  testSwordVisual: boolean
  testFrostVisual: boolean
  testThunderVisual: boolean
  testGiantVisual: boolean
}

export const EMPTY_BRANCH_FX: BranchFxRuntime = {
  testSwordVisual: false,
  testFrostVisual: false,
  testThunderVisual: false,
  testGiantVisual: false,
}

/** Pure once guard: returns true only for the first event key in a cycle. */
export function triggerBranchFxOnce(seen: Set<string>, key: string): boolean {
  if (seen.has(key)) return false
  seen.add(key)
  return true
}

/** Pure chain visual bookkeeping; callers destroy the returned connection in their scene lifecycle. */
export function createChainVisualGuard() {
  const seen = new Set<string>()
  return {
    shouldFlash(targetKey: string) { return triggerBranchFxOnce(seen, `hit:${targetKey}`) },
    shouldConnect(fromKey: string, targetKey: string) {
      return triggerBranchFxOnce(seen, `link:${fromKey}->${targetKey}`)
    },
    clear() { seen.clear() },
  }
}
