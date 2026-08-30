import { describe, expect, it } from 'vitest'
import { validateSetBonusPresentationGate } from '../scripts/validate-data.mjs'
import { emptyMods, SETS, type Mods } from '../src/data'
import type { EquipItem } from '../src/core'
import {
  aggregateMods,
  isSetBonusActive,
  isSetNumericBonusActive,
  isSetPresentationBonusActive,
  resolveAttackMode,
  resolveProceduralArtVfx,
  resolveProceduralAttackVfx,
  resolveSetArtOverride,
  resolveSetEffectRuntime,
} from '../src/effects'
import { genDynamicSetFromSeed } from '../src/lore'
import { newGame } from '../src/state'
import { withTemporarySets } from './set-test-fixture'

const fourPieceSlots = ['weapon', 'head', 'armor', 'boots'] as const
const allSetSlots = ['weapon', 'head', 'armor', 'boots', 'charm1', 'charm2'] as const

type EquipSlot = typeof allSetSlots[number]

function itemSlot(slot: EquipSlot): EquipItem['slot'] {
  return slot.startsWith('charm') ? 'charm' : slot
}

function piece(setId: string, slot: EquipSlot, index: number): EquipItem {
  return {
    uid: `${setId}-${slot}-${index}`,
    baseId: `${setId}-${slot}`,
    name: `${setId}-${slot}`,
    slot: itemSlot(slot),
    quality: 1,
    setId,
    atk: 10,
    def: 7,
    speed: 3,
    crit: 0.02,
    maxHp: 30,
    affixes: [],
    price: 1,
  }
}

function equipPieces(state: ReturnType<typeof newGame>, setId: string, selectedSlots: readonly EquipSlot[]) {
  for (const [index, slot] of selectedSlots.entries()) state.equipment[slot] = piece(setId, slot, index)
}

function expectNoSetRuntime(state: ReturnType<typeof newGame>, fallbackMode: ReturnType<typeof resolveAttackMode>) {
  expect(resolveAttackMode(state)).toBe(fallbackMode)
  expect(resolveSetArtOverride(state)).toBeNull()
  expect(resolveProceduralAttackVfx(state)).toBeNull()
  expect(resolveProceduralArtVfx(state)).toBeNull()
  expect(resolveSetEffectRuntime(state)).toEqual({
    swordSplit: false,
    fireBurst: false,
    delayedBurst: false,
    arrayMine: false,
    testSwordVisual: false,
    testFrostVisual: false,
    testThunderVisual: false,
    testGiantVisual: false,
  })
}

function addMods(target: Mods, mods: Partial<Mods> | undefined) {
  for (const [key, value] of Object.entries(mods ?? {})) target[key as keyof Mods] += value as number
}

function itemBaseMods(pieceCount: number): Mods {
  const base = emptyMods()
  base.atk = pieceCount * 10
  base.def = pieceCount * 7
  base.speed = pieceCount * 3
  base.crit = pieceCount * 0.02
  base.maxHp = pieceCount * 30
  return base
}

function expectMods(actual: Mods, expected: Mods) {
  for (const key of Object.keys(expected) as Array<keyof Mods>) {
    if (typeof expected[key] === 'number' && !Number.isInteger(expected[key])) expect(actual[key]).toBeCloseTo(expected[key])
    else expect(actual[key]).toBe(expected[key])
  }
}

describe('independent set bonus tiers', () => {
  it('stacks A2 and B2 numeric Mods without activating any presentation', () => {
    const state = newGame()
    const firstId = 'gate_two_two_a'
    const secondId = 'gate_two_two_b'
    const first = {
      id: firstId,
      name: '甲套',
      pieces: [],
      bonuses: [
        { count: 2, mods: { atkPct: 0.5, aspd: 0.2 }, desc: '二件数值' },
        { count: 4, attackMode: 'flying_sword_burst' as const, artMode: 'sword_fan' as const, vfxRecipe: 'sword-comet' as const, fxTags: ['sword_split' as const], desc: '四件变身' },
      ],
    }
    const second = {
      id: secondId,
      name: '乙套',
      pieces: [],
      bonuses: [
        { count: 2, mods: { defPct: 0.5, cdPct: 0.2 }, desc: '二件数值' },
        { count: 4, attackMode: 'giant_sword' as const, artMode: 'dageng' as const, vfxRecipe: 'giant-crest' as const, fxTags: ['fire_burst' as const], desc: '四件变身' },
      ],
    }

    withTemporarySets(SETS, state, [[firstId, first], [secondId, second]], () => {
      const fallbackMode = resolveAttackMode(state)
      equipPieces(state, firstId, ['weapon', 'head'])
      equipPieces(state, secondId, ['armor', 'boots'])

      expect(aggregateMods(state)).toEqual({
        ...itemBaseMods(4),
        atkPct: 0.5,
        defPct: 0.5,
        aspd: 0.2,
        cdPct: 0.2,
      })
      expectNoSetRuntime(state, fallbackMode)
    })
  })

  it('activates A two-piece numeric Mods at A3 plus B1 without presentation', () => {
    const state = newGame()
    const firstId = 'gate_three_one'
    const secondId = 'gate_single'
    const first = {
      id: firstId,
      name: '三件套',
      pieces: [],
      bonuses: [
        { count: 2, mods: { atk: 100, speed: 40 }, desc: '二件数值' },
        { count: 4, attackMode: 'thunder_chain' as const, artMode: 'thunder_strike' as const, vfxRecipe: 'thunder-sigil' as const, fxTags: ['array_mine' as const], desc: '四件变身' },
      ],
    }
    const second = { id: secondId, name: '散配套', pieces: [], bonuses: [{ count: 2, mods: { def: 100 }, desc: '二件数值' }] }

    withTemporarySets(SETS, state, [[firstId, first], [secondId, second]], () => {
      const fallbackMode = resolveAttackMode(state)
      equipPieces(state, firstId, ['weapon', 'head', 'armor'])
      equipPieces(state, secondId, ['boots'])

      const expected = itemBaseMods(4)
      addMods(expected, first.bonuses[0].mods)
      expect(aggregateMods(state)).toEqual(expected)
      expectNoSetRuntime(state, fallbackMode)
    })
  })

  it('keeps A four-piece presentation while stacking A and B numeric tiers at A4 plus B2', () => {
    const state = newGame()
    const firstId = 'gate_four_two_a'
    const secondId = 'gate_four_two_b'
    const first = {
      id: firstId,
      name: '甲四件套',
      pieces: [],
      bonuses: [
        { count: 2, mods: { atk: 100, speed: 40 }, desc: '二件数值' },
        { count: 4, mods: { def: 50 }, attackMode: 'thunder_chain' as const, artMode: 'thunder_strike' as const, artPower: 1.4, artCooldownMs: 12000, vfxRecipe: 'thunder-sigil' as const, fxTags: ['array_mine' as const], desc: '四件变身' },
      ],
    }
    const second = {
      id: secondId,
      name: '乙二件套',
      pieces: [],
      bonuses: [{ count: 2, mods: { crit: 0.1, lifesteal: 0.1 }, desc: '二件数值' }],
    }

    withTemporarySets(SETS, state, [[firstId, first], [secondId, second]], () => {
      equipPieces(state, firstId, fourPieceSlots)
      equipPieces(state, secondId, ['charm1', 'charm2'])

      const expected = itemBaseMods(6)
      addMods(expected, first.bonuses[0].mods)
      addMods(expected, first.bonuses[1].mods)
      addMods(expected, second.bonuses[0].mods)
      expectMods(aggregateMods(state), expected)
      expect(resolveAttackMode(state)).toBe('thunder_chain')
      expect(resolveSetArtOverride(state)).toEqual({ mode: 'thunder_strike', power: 1.4, cooldownMs: 12000, vfxRecipe: 'thunder-sigil' })
      expect(resolveProceduralAttackVfx(state)).toBe('thunder-sigil')
      expect(resolveProceduralArtVfx(state)).toBe('thunder-sigil')
      expect(resolveSetEffectRuntime(state).arrayMine).toBe(true)
    })
  })

  it('keeps 2/4 numeric Mods active while a six-piece definition remains gated without fabricated slots', () => {
    const state = newGame()
    const setId = 'gate_six_piece'
    const set = {
      id: setId,
      name: '六件阶梯套',
      pieces: [],
      bonuses: [
        { count: 2, mods: { atk: 100, aspd: 0.1 }, desc: '二件数值' },
        { count: 4, mods: { def: 50, cdPct: 0.1 }, attackMode: 'thunder_chain' as const, artMode: 'thunder_strike' as const, artPower: 1.4, artCooldownMs: 12000, transformId: 'four-stage', vfxRecipe: 'thunder-sigil' as const, fxTags: ['array_mine' as const], desc: '四件变身' },
        { count: 6, mods: { speed: 30, lifesteal: 0.1 }, attackMode: 'giant_sword' as const, artMode: 'dageng' as const, artPower: 1.2, artCooldownMs: 9000, transformId: 'six-stage', vfxRecipe: 'giant-crest' as const, fxTags: ['fire_burst' as const], desc: '六件变身' },
      ],
    }

    withTemporarySets(SETS, state, [[setId, set]], () => {
      const fallbackMode = resolveAttackMode(state)

      equipPieces(state, setId, ['weapon', 'head'])
      const atTwo = itemBaseMods(2)
      addMods(atTwo, set.bonuses[0].mods)
      expect(aggregateMods(state)).toEqual(atTwo)
      expectNoSetRuntime(state, fallbackMode)

      equipPieces(state, setId, fourPieceSlots)
      const atFour = itemBaseMods(4)
      addMods(atFour, set.bonuses[0].mods)
      addMods(atFour, set.bonuses[1].mods)
      expect(aggregateMods(state)).toEqual(atFour)
      expect(resolveAttackMode(state)).toBe('thunder_chain')
      expect(resolveSetArtOverride(state)).toEqual({ mode: 'thunder_strike', power: 1.4, cooldownMs: 12000, transformId: 'four-stage', vfxRecipe: 'thunder-sigil' })
      expect(resolveProceduralAttackVfx(state)).toBe('thunder-sigil')
      expect(resolveProceduralArtVfx(state)).toBe('thunder-sigil')
      expect(resolveSetEffectRuntime(state)).toMatchObject({ arrayMine: true, fireBurst: false })

      // No pseudo slots are created: current production equipment cannot
      // manufacture a six-piece dynamic path. The four-piece state remains real.
      expect(aggregateMods(state)).toEqual(atFour)
      expect(resolveAttackMode(state)).toBe('thunder_chain')
      expect(resolveSetArtOverride(state)).toEqual({ mode: 'thunder_strike', power: 1.4, cooldownMs: 12000, transformId: 'four-stage', vfxRecipe: 'thunder-sigil' })
      expect(resolveProceduralAttackVfx(state)).toBe('thunder-sigil')
      expect(resolveProceduralArtVfx(state)).toBe('thunder-sigil')
      expect(resolveSetEffectRuntime(state)).toMatchObject({ arrayMine: true, fireBurst: false })
    })
  })

  it('defensively keeps numeric Mods but blocks malformed two-piece presentation fields', () => {
    const state = newGame()
    const setId = 'gate_invalid_two_piece'
    const invalidTwoPiece = {
      count: 2,
      mods: { atk: 100 },
      attackMode: 'giant_sword' as const,
      artMode: 'dageng' as const,
      transformId: 'must-not-activate',
      attackName: '不可触发招式',
      artName: '不可触发神通',
      artPower: 1.2,
      artCooldownMs: 9000,
      vfxRecipe: 'giant-crest' as const,
      fxTags: ['fire_burst' as const],
      desc: '非法二件能力字段',
    }
    const set = { id: setId, name: '非法二件套', pieces: [], bonuses: [invalidTwoPiece] }

    withTemporarySets(SETS, state, [[setId, set]], () => {
      const fallbackMode = resolveAttackMode(state)
      equipPieces(state, setId, ['weapon', 'head'])

      expect(isSetNumericBonusActive(2, invalidTwoPiece)).toBe(true)
      expect(isSetPresentationBonusActive(2, invalidTwoPiece)).toBe(false)
      expect(isSetBonusActive(2, invalidTwoPiece)).toBe(false)
      expect(aggregateMods(state)).toEqual({ ...itemBaseMods(2), atk: 120 })
      expectNoSetRuntime(state, fallbackMode)
    })

    expect(validateSetBonusPresentationGate(invalidTwoPiece)).toMatch(/2 件/)
    expect(validateSetBonusPresentationGate({ count: 3, attackMode: 'giant_sword' })).toMatch(/4 或 6/)
    expect(validateSetBonusPresentationGate({ count: 5, fxTags: ['fire_burst'] })).toMatch(/4 或 6/)
    expect(validateSetBonusPresentationGate({ count: 4, attackMode: 'giant_sword' })).toBeNull()
    expect(validateSetBonusPresentationGate({ count: 6, fxTags: ['fire_burst'] })).toBeNull()
  })

  it('activates every declared static-set bonus at four same-set pieces while retaining direct item stats', () => {
    const state = newGame()
    const setId = 'gate_static_four'
    const set = {
      id: setId,
      name: '静态四件套',
      pieces: [],
      bonuses: [
        { count: 2, mods: { atk: 100, speed: 40 }, desc: '二件数值' },
        { count: 4, mods: { def: 50 }, attackMode: 'thunder_chain' as const, artMode: 'thunder_strike' as const, artPower: 1.4, artCooldownMs: 12000, fxTags: ['array_mine' as const], desc: '四件变身' },
      ],
    }

    withTemporarySets(SETS, state, [[setId, set]], () => {
      equipPieces(state, setId, fourPieceSlots)
      state.equipment.charm1 = {
        uid: 'loose-charm', baseId: 'loose-charm', name: '散修玉佩', slot: 'charm', quality: 1,
        atk: 11, def: 13, speed: 17, crit: 0.03, maxHp: 19, affixes: [], price: 1,
      }

      expect(aggregateMods(state)).toMatchObject({ atk: 151, def: 91, speed: 69, crit: 0.11, maxHp: 139 })
      expect(resolveAttackMode(state)).toBe('thunder_chain')
      expect(resolveSetArtOverride(state)).toEqual({ mode: 'thunder_strike', power: 1.4, cooldownMs: 12000 })
      expect(resolveSetEffectRuntime(state).arrayMine).toBe(true)
    })
  })

  it('keeps generated random sets at four pieces, with numeric two-piece and profile-backed four-piece behavior', () => {
    const record = genDynamicSetFromSeed(777, 1, [])
    const state = newGame()
    const twoPiece = record.set.bonuses.find((bonus) => bonus.count === 2)!
    const transform = record.set.bonuses.find((bonus) => bonus.count === 4)!

    expect(record.set.pieces).toHaveLength(4)
    withTemporarySets(SETS, state, [[record.set.id, record.set]], () => {
      const fallbackMode = resolveAttackMode(state)
      equipPieces(state, record.set.id, ['weapon', 'head'])

      const expectedTwo = itemBaseMods(2)
      addMods(expectedTwo, twoPiece.mods)
      expect(aggregateMods(state)).toEqual(expectedTwo)
      expectNoSetRuntime(state, fallbackMode)

      equipPieces(state, record.set.id, fourPieceSlots)
      if (transform.attackMode) {
        expect(resolveAttackMode(state)).toBe(transform.attackMode)
      }
      if (transform.vfxRecipe) {
        expect(resolveProceduralAttackVfx(state)).toBe(transform.vfxRecipe)
        expect(resolveProceduralArtVfx(state)).toBe(transform.vfxRecipe)
      } else {
        expect(resolveProceduralAttackVfx(state)).toBeNull()
        expect(resolveProceduralArtVfx(state)).toBeNull()
      }
      if (transform.artMode) {
        expect(resolveSetArtOverride(state)).toMatchObject({ mode: transform.artMode, displayName: transform.artName })
      } else {
        expect(resolveSetArtOverride(state)).toBeNull()
      }

      const expected = itemBaseMods(4)
      for (const bonus of record.set.bonuses) addMods(expected, bonus.mods)
      expect(aggregateMods(state)).toEqual(expected)
    })
  })
})
