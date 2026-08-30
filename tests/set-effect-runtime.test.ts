import { describe, expect, it } from 'vitest'
import { newGame } from '../src/state'
import { resolveSetEffectRuntime } from '../src/effects'
import { SETS } from '../src/data'
import { withTemporarySets } from './set-test-fixture'

function equip(state: ReturnType<typeof newGame>, setId: string, count: number) {
  const slots = ['weapon', 'head', 'armor', 'boots', 'charm1', 'charm2'] as const
  const base = { uid: '1', baseId: 'piece', name: 'piece', slot: 'weapon' as const, quality: 1, setId, atk: 1, def: 0, speed: 0, crit: 0, maxHp: 0, affixes: [], price: 1 }
  for (let index = 0; index < count; index++) {
    const key = slots[index]
    state.equipment[key] = { ...base, uid: String(index + 1), slot: key.startsWith('charm') ? 'charm' : key }
  }
}

describe('set effect runtime', () => {
  it('defaults all effects off', () => {
    expect(resolveSetEffectRuntime(newGame())).toEqual({ swordSplit: false, fireBurst: false, delayedBurst: false, arrayMine: false, testSwordVisual: false, testFrostVisual: false, testThunderVisual: false, testGiantVisual: false })
  })

  it('rejects malformed two-piece visual tags at the real four-piece boundary', () => {
    const state = newGame()
    const setId = 'test_runtime_malformed_two'
    const set = { id: setId, name: 'test', pieces: [], bonuses: [{ count: 2, fxTags: ['sword_split' as const], desc: '非法二件表现' }] }

    withTemporarySets(SETS, state, [[setId, set]], () => {
      equip(state, setId, 4)
      expect(resolveSetEffectRuntime(state).swordSplit).toBe(false)
    })
  })

  it('ignores unknown visual tags without activating a neighboring legacy effect', () => {
    const state = newGame()
    const setId = 'test_runtime_unknown_tag'
    const set = { id: setId, name: 'test', pieces: [], bonuses: [{ count: 4, fxTags: ['unknown_fx_tag' as never], desc: '未知表现' }] }

    withTemporarySets(SETS, state, [[setId, set]], () => {
      equip(state, setId, 4)
      expect(resolveSetEffectRuntime(state)).toEqual({ swordSplit: false, fireBurst: false, delayedBurst: false, arrayMine: false, testSwordVisual: false, testFrostVisual: false, testThunderVisual: false, testGiantVisual: false })
    })
  })

  it('activates a declared four-piece visual tag only after the same set reaches four pieces', () => {
    const state = newGame()
    const setId = 'test_runtime_four'
    const set = { id: setId, name: 'test', pieces: [], bonuses: [{ count: 4, fxTags: ['sword_split', 'unknown' as never], desc: '四件表现' }] }

    withTemporarySets(SETS, state, [[setId, set]], () => {
      equip(state, setId, 3)
      expect(resolveSetEffectRuntime(state).swordSplit).toBe(false)
      equip(state, setId, 4)
      expect(resolveSetEffectRuntime(state).swordSplit).toBe(true)
    })
  })

  it('keeps a declared six-piece visual tag gated when the current set only has four real pieces', () => {
    const state = newGame()
    const setId = 'test_runtime_six'
    const set = { id: setId, name: 'test', pieces: [], bonuses: [{ count: 6, fxTags: ['fire_burst' as const], desc: '六件表现' }] }

    withTemporarySets(SETS, state, [[setId, set]], () => {
      equip(state, setId, 4)
      expect(resolveSetEffectRuntime(state).fireBurst).toBe(false)
      expect(Object.keys(state.equipment)).toEqual(['weapon', 'head', 'armor', 'boots', 'charm1', 'charm2'])
    })
  })

  it('binds temporary entries to the resolver registry only for the callback scope', () => {
    const state = newGame()
    const setId = 'test_resolver_registry'
    const set = { id: setId, name: 'resolver registry', pieces: [], bonuses: [{ count: 4, fxTags: ['test_sword_visual' as const], desc: 'test' }] }
    equip(state, setId, 4)

    expect(resolveSetEffectRuntime(state).testSwordVisual).toBe(false)
    withTemporarySets(SETS, state, [[setId, set]], () => {
      expect(resolveSetEffectRuntime(state).testSwordVisual).toBe(true)
    })
    expect(resolveSetEffectRuntime(state).testSwordVisual).toBe(false)
  })

  it('activates each configured four-piece visual tag without cross-enabling others', () => {
    const cases = [
      ['set_xm', 'delayedBurst'],
      ['set_zx', 'arrayMine'],
      ['set_fr', 'fireBurst'],
    ] as const
    for (const [setId, active] of cases) {
      const state = newGame()
      equip(state, setId, 4)
      const runtime = resolveSetEffectRuntime(state)
      expect(runtime[active]).toBe(true)
      for (const [key, value] of Object.entries(runtime)) {
        if (key !== active) expect(value).toBe(false)
      }
    }
  })
})
