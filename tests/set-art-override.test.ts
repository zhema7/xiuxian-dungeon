import { describe, expect, it } from 'vitest'
import { resolveEffectiveArtCast } from '../src/art-cast'
import { resolveAttackMode, resolveProceduralArtVfx, resolveProceduralAttackVfx, resolveSetArtMode, resolveSetArtOverride, resolveSetEffectRuntime } from '../src/effects'
import { newGame } from '../src/state'
import { SETS } from '../src/data'
import type { EquipItem } from '../src/core'
import { withTemporarySets } from './set-test-fixture'

function equipSet(s: ReturnType<typeof newGame>, setId: string, count = 4) {
  const base: EquipItem = {
    uid: '1', baseId: 'piece', name: 'piece', slot: 'weapon', quality: 1, setId,
    atk: 1, def: 0, speed: 0, crit: 0, maxHp: 0, affixes: [], price: 1,
  }
  const slots = ['weapon', 'head', 'armor', 'boots', 'charm1', 'charm2'] as const
  for (let index = 0; index < count; index++) {
    const key = slots[index]
    s.equipment[key] = { ...base, uid: String(index + 1), slot: key.startsWith('charm') ? 'charm' : key }
  }
}

describe('set art override resolver', () => {
  it('does not override below its four-piece threshold', () => {
    const state = newGame()
    const setId = 'dynamic_profile_under_threshold'
    const set = {
      id: setId, name: '测试套', pieces: [], bonuses: [{
        count: 4, attackMode: 'thunder_chain' as const, artMode: 'thunder_strike' as const, transformId: 'test',
        artPower: 1.4, artCooldownMs: 12000, desc: '测试',
      }],
    }

    withTemporarySets(SETS, state, [[setId, set]], () => {
      equipSet(state, setId, 3)
      expect(resolveSetArtOverride(state)).toBeNull()
      expect(resolveSetArtMode(state)).toBeNull()
    })
  })

  it('resolves a dynamic four-piece attack and complete art contract', () => {
    const state = newGame()
    const setId = 'dynamic_profile_contract'
    const set = {
      id: setId, name: '测试套', pieces: [], bonuses: [{
        count: 4, attackMode: 'thunder_chain' as const, artMode: 'thunder_strike' as const, transformId: 'ziling-thunder',
        artPower: 1.4, artCooldownMs: 12000, fxTags: ['test_thunder_visual' as const], desc: '测试',
      }],
    }

    withTemporarySets(SETS, state, [[setId, set]], () => {
      equipSet(state, setId)
      expect(resolveAttackMode(state)).toBe('thunder_chain')
      expect(resolveSetArtOverride(state)).toEqual({ mode: 'thunder_strike', power: 1.4, cooldownMs: 12000, transformId: 'ziling-thunder' })
      expect(resolveSetArtMode(state)).toBe('thunder_strike')
    })
  })

  it('keeps static set_fr dageng behavior through compatibility defaults', () => {
    const state = newGame()
    equipSet(state, 'set_fr')
    expect(resolveAttackMode(state)).toBe('giant_sword')
    expect(resolveSetArtOverride(state)).toEqual({ mode: 'dageng', power: 0.45, cooldownMs: 15000 })
    expect(resolveSetArtMode(state)).toBe('dageng')
  })

  it('rejects malformed two-piece art fields even when their set reaches four pieces', () => {
    const state = newGame()
    const setId = 'invalid_two_piece_art'
    const set = { id: setId, name: '非法二件能力', pieces: [], bonuses: [{ count: 2, artMode: 'fire_rain' as const, artPower: 1.2, artCooldownMs: 9000, desc: '非法' }] }

    withTemporarySets(SETS, state, [[setId, set]], () => {
      equipSet(state, setId, 4)
      expect(resolveSetArtOverride(state)).toBeNull()
      expect(resolveSetArtMode(state)).toBeNull()
    })
  })

  it('keeps a six-piece definition gated when current real equipment only activates the four-piece source', () => {
    const state = newGame()
    const firstId = 'aaa_four_record'
    const secondId = 'zzz_six_record'
    const first = { id: firstId, name: '四件记录', pieces: [], bonuses: [{ count: 4, attackMode: 'thunder_chain' as const, artMode: 'thunder_strike' as const, artPower: 1.4, artCooldownMs: 12000, transformId: 'four-art', vfxRecipe: 'thunder-sigil' as const, fxTags: ['array_mine' as const], desc: '四件' }] }
    const second = { id: secondId, name: '六件记录', pieces: [], bonuses: [{ count: 6, attackMode: 'giant_sword' as const, artMode: 'fire_rain' as const, artPower: 1.2, artCooldownMs: 9000, transformId: 'six-art', vfxRecipe: 'giant-crest' as const, fxTags: ['fire_burst' as const], desc: '六件' }] }

    withTemporarySets(SETS, state, [[firstId, first], [secondId, second]], () => {
      equipSet(state, firstId, 4)
      expect(resolveAttackMode(state)).toBe('thunder_chain')
      expect(resolveSetArtOverride(state)).toMatchObject({ mode: 'thunder_strike', transformId: 'four-art' })
      expect(resolveProceduralAttackVfx(state)).toBe('thunder-sigil')
      expect(resolveProceduralArtVfx(state)).toBe('thunder-sigil')
      expect(resolveSetEffectRuntime(state)).toMatchObject({ arrayMine: true, fireBurst: false })

      // No extra pseudo slots are created: the six-piece row remains gated,
      // not a claim that six dynamic pieces are currently obtainable.
      expect(resolveAttackMode(state)).toBe('thunder_chain')
      expect(resolveSetArtOverride(state)).toMatchObject({ mode: 'thunder_strike', transformId: 'four-art' })
      expect(resolveProceduralAttackVfx(state)).toBe('thunder-sigil')
      expect(resolveProceduralArtVfx(state)).toBe('thunder-sigil')
      expect(resolveSetEffectRuntime(state)).toMatchObject({ arrayMine: true, fireBurst: false })
    })
  })
})

describe('effective art dispatch selection', () => {
  it('selects every existing set art mode rather than falling back to equipped skill', () => {
    const modes = ['sword_fan', 'fire_rain', 'thunder_strike', 'dageng'] as const
    for (const mode of modes) {
      const resolved = resolveEffectiveArtCast(
        { mode, power: 1.25, cooldownMs: 7777, transformId: `profile-${mode}` },
        { artMode: 'fire_rain', name: '玩家神通' },
        9,
        999,
      )
      expect(resolved).toMatchObject({ mode, power: 1.25, cooldownMs: 7777, source: 'set' })
      expect(resolved?.displayName).not.toBe('玩家神通')
    }
  })

  it('preserves normal equipped-skill behavior when no set override exists', () => {
    expect(resolveEffectiveArtCast(null, { artMode: 'fire_rain', name: '流星火雨' }, 1.2, 9000)).toEqual({
      mode: 'fire_rain', power: 1.2, cooldownMs: 9000, source: 'skill', displayName: '流星火雨',
    })
    expect(resolveEffectiveArtCast(null, undefined, 1, 1)).toBeNull()
  })
})
