import { describe, expect, it } from 'vitest'
import type { SetAbilitySource } from '../src/effects'
import {
  resolveArtPaletteV1FromSources,
  resolveAttackPaletteV1FromSources,
  resolveSetAbilityPaletteV1,
} from '../src/effects'
import {
  PALETTE_V1_ALGORITHM_VERSION,
  derivePaletteV1,
  inheritPaletteV1VisualContext,
  makePaletteV1VisualContext,
  paletteV1LightningColors,
  paletteV1Tint,
} from '../src/palette-v1'
import {
  genDynamicSetFromSeed,
  genDynamicSetV2FromSeed,
  type DynamicSetRecord,
} from '../src/lore'

function transform(record: DynamicSetRecord) {
  const bonus = record.set.bonuses.find((candidate) => candidate.count === 4)
  if (!bonus) throw new Error('expected generated four-piece transform')
  return bonus
}

function sourceFor(
  record: DynamicSetRecord,
  channel: 'attack' | 'art',
): SetAbilitySource {
  const bonus = transform(record)
  return {
    setId: record.set.id,
    count: 4,
    bonus: channel === 'attack'
      ? { ...bonus, artMode: undefined, artName: undefined, artPower: undefined, artCooldownMs: undefined }
      : { ...bonus, attackMode: undefined, attackName: undefined, hitLinkage: undefined },
  }
}

function v3RecordFor(
  sequence: number,
  predicate: (record: DynamicSetRecord) => boolean,
): DynamicSetRecord {
  for (let seed = 1; seed <= 400; seed++) {
    const record = genDynamicSetFromSeed(seed, sequence, [])
    if (predicate(record)) return record
  }
  throw new Error('expected a deterministic matching v3 record')
}

describe('Palette V1 deterministic v3 eligibility', () => {
  it('derives the same controlled palette from the same persisted v3 identity', () => {
    const record = genDynamicSetFromSeed(0x6a09e667, 1, [])
    const bonus = transform(record)
    const source = { setId: record.set.id, transformId: bonus.transformId }
    const replay = JSON.parse(JSON.stringify(record)) as DynamicSetRecord

    const first = derivePaletteV1(record, source)
    const second = derivePaletteV1(replay, source)

    expect(first).toEqual(second)
    expect(first).toMatchObject({ algorithmVersion: PALETTE_V1_ALGORITHM_VERSION })
    expect(first?.primary).not.toBe(0xffffff)
    expect(first?.highlight).not.toBe(0xffffff)
    expect(first?.darkOutline).not.toBe(first?.highlight)
  })

  it('can produce a distinct controlled color for a different persisted identity', () => {
    const firstRecord = genDynamicSetFromSeed(1, 1, [])
    const first = derivePaletteV1(firstRecord, {
      setId: firstRecord.set.id,
      transformId: transform(firstRecord).transformId,
    })
    const alternative = v3RecordFor(2, (candidate) => {
      const palette = derivePaletteV1(candidate, {
        setId: candidate.set.id,
        transformId: transform(candidate).transformId,
      })
      return palette?.primary !== first?.primary
    })
    const second = derivePaletteV1(alternative, {
      setId: alternative.set.id,
      transformId: transform(alternative).transformId,
    })

    expect(second?.identityKey).not.toBe(first?.identityKey)
    expect(second?.primary).not.toBe(first?.primary)
  })

  it('rejects static, v2, legacy, and mismatched transform sources without adding a palette', () => {
    const v3 = genDynamicSetFromSeed(7, 1, [])
    const v2 = genDynamicSetV2FromSeed(7, 1, [])
    const staticSource: SetAbilitySource = {
      setId: 'set_fr',
      count: 4,
      bonus: { count: 4, attackMode: 'giant_sword', transformId: 'static-not-v3', desc: '静态套' },
    }
    const legacy: DynamicSetRecord = {
      set: {
        id: 'set_dy_legacy_palette',
        name: '旧档套',
        pieces: [],
        bonuses: [{ count: 4, attackMode: 'giant_sword', transformId: 'legacy-transform', desc: '旧档' }],
      },
      bases: [],
    }

    expect(resolveSetAbilityPaletteV1([], staticSource)).toBeUndefined()
    expect(resolveSetAbilityPaletteV1([v2], sourceFor(v2, 'attack'))).toBeUndefined()
    expect(resolveSetAbilityPaletteV1([legacy], sourceFor(legacy, 'attack'))).toBeUndefined()
    expect(derivePaletteV1(v3, { setId: v3.set.id, transformId: 'wrong-transform' })).toBeUndefined()
  })

  it('keeps static/v2/legacy routes on their fixed colors while v3 yields a palette', () => {
    const v3 = genDynamicSetFromSeed(13, 1, [])
    const v2 = genDynamicSetV2FromSeed(13, 1, [])
    const legacy: DynamicSetRecord = {
      set: { id: 'set_dy_legacy_no_tint', name: '旧档套', pieces: [], bonuses: [{ count: 4, attackMode: 'thunder_chain', desc: '旧档' }] },
      bases: [],
    }

    expect(resolveSetAbilityPaletteV1([v3], sourceFor(v3, 'attack'))).toBeDefined()
    expect(resolveSetAbilityPaletteV1([v2], sourceFor(v2, 'attack'))).toBeUndefined()
    expect(resolveSetAbilityPaletteV1([legacy], sourceFor(legacy, 'attack'))).toBeUndefined()
  })
})

describe('Palette V1 source ownership and visual context', () => {
  it('keeps mixed v3 attack and art palettes with their independently winning sources', () => {
    const attackRecord = v3RecordFor(1, (record) => record.generation?.move.mode === 'giant_sword')
    const artRecord = v3RecordFor(2, (record) => record.generation?.art.mode === 'thunder_strike')
    const sources = [sourceFor(attackRecord, 'attack'), sourceFor(artRecord, 'art')]

    const attackPalette = resolveAttackPaletteV1FromSources([attackRecord, artRecord], sources)
    const artPalette = resolveArtPaletteV1FromSources([attackRecord, artRecord], sources)

    expect(attackPalette?.identity.setId).toBe(attackRecord.set.id)
    expect(artPalette?.identity.setId).toBe(artRecord.set.id)
    expect(attackPalette?.identityKey).not.toBe(artPalette?.identityKey)
  })

  it('uses the independently winning dageng art source palette rather than the attack source palette', () => {
    const attackRecord = v3RecordFor(1, (record) => record.generation?.move.mode === 'flying_sword_burst')
    const dagengRecord = v3RecordFor(2, (record) => record.generation?.art.mode === 'dageng')
    const sources = [sourceFor(attackRecord, 'attack'), sourceFor(dagengRecord, 'art')]

    const dagengPalette = resolveArtPaletteV1FromSources([attackRecord, dagengRecord], sources)
    const expected = derivePaletteV1(dagengRecord, {
      setId: dagengRecord.set.id,
      transformId: transform(dagengRecord).transformId,
    })

    expect(dagengPalette).toEqual(expected)
    expect(dagengPalette?.identity.setId).toBe(dagengRecord.set.id)
  })

  it('provides palette colors to the Graphics lightning path without relying on color alone', () => {
    const record = genDynamicSetFromSeed(9, 1, [])
    const palette = derivePaletteV1(record, {
      setId: record.set.id,
      transformId: transform(record).transformId,
    })

    expect(paletteV1LightningColors(undefined)).toBeUndefined()
    expect(paletteV1LightningColors(palette)).toEqual({
      outer: palette?.primary,
      inner: palette?.highlight,
    })
  })

  it('inherits only immutable visual context for controlled child projectiles without changing linkage gameplay data', () => {
    const record = genDynamicSetFromSeed(11, 1, [])
    const palette = derivePaletteV1(record, {
      setId: record.set.id,
      transformId: transform(record).transformId,
    })
    const parent = makePaletteV1VisualContext(palette)
    const child = inheritPaletteV1VisualContext(parent)

    expect(child).toEqual(parent)
    expect(child?.palette.identityKey).toBe(palette?.identityKey)
    expect(paletteV1Tint(child?.palette, 'highlight')).toBe(palette?.highlight)
    expect(inheritPaletteV1VisualContext(undefined)).toBeUndefined()
  })
})
