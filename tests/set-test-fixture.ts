import type { SetDef } from '../src/data'

type SetRegistry = Record<string, SetDef>

/**
 * 调用方必须传入与被测 resolver 同模块图的 SETS 引用；无论断言是否失败都恢复原值。
 * Fixture 不再自行建立 data.ts 的运行时导入，避免并行 Vitest worker 中注入到错误注册表实例。
 */
export function withTemporarySets<T>(
  sets: SetRegistry,
  state: { dynamicSets: Array<{ set: SetDef; bases: unknown[] }> },
  entries: ReadonlyArray<readonly [string, SetDef]>,
  run: () => T,
): T {
  const previousSets = entries.map(([id]) => [id, sets[id]] as const)
  const previousDynamicSets = state.dynamicSets
  for (const [id, set] of entries) sets[id] = set
  // Keep fixture-owned records available through the same persisted fallback
  // used by the runtime resolver if Vitest isolates the data.ts module graph.
  state.dynamicSets = [...previousDynamicSets, ...entries.map(([, set]) => ({ set, bases: [] }))]

  try {
    return run()
  } finally {
    state.dynamicSets = previousDynamicSets
    for (const [id, set] of previousSets) {
      if (set) sets[id] = set
      else delete sets[id]
    }
  }
}
