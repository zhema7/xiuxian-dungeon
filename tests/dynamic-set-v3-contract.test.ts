import { describe, expect, it } from 'vitest'
import type { EquipItem } from '../src/core'
import {
  SETS,
  SLOT_KEYS,
  type ControlledHitLinkage,
  type SetDef,
} from '../src/data'
import {
  aggregateMods,
  controlledHitLinkageSourceFingerprint,
  equippedSetIds,
  mergeSetEffectTagSources,
  resolveAttackMode,
  resolveProceduralArtVfx,
  resolveProceduralArtVfxFromSources,
  resolveProceduralAttackVfx,
  resolveProceduralAttackVfxFromSources,
  resolveSetArtOverride,
  resolveSetAttackSource,
  resolveSetArtSource,
  resolveSetHitLinkageSourceFromSources,
  resolveSetEffectRuntime,
  resolveSetEffectTagSources,
  selectSetAttackSource,
  selectSetArtSource,
  setPieceCount,
} from '../src/effects'
import { advanceControlledHitLinkageEpoch, controlledHitLinkageCooldownKey, createControlledHitLinkageAuthorization, matchesControlledHitLinkageProjectileKind, orderedControlledHitCandidates, tryTriggerControlledHitLinkage } from '../src/fx/modularFx'
import {
  DYNAMIC_SET_GENERATOR_VERSION,
  DYNAMIC_SET_SCHEMA_VERSION,
  DYNAMIC_SET_V2_GENERATOR_VERSION,
  DYNAMIC_SET_V2_SCHEMA_VERSION,
  genDynamicSetFromSeed,
  genDynamicSetV2FromSeed,
  normalizeDynamicSetRecords,
} from '../src/lore'
import { newGame } from '../src/state'
import { withTemporarySets } from './set-test-fixture'

function equipmentPiece(setId: string, slotKey: typeof SLOT_KEYS[number], index: number): EquipItem {
  return {
    uid: `${setId}-${slotKey}-${index}`,
    baseId: `${setId}-${slotKey}`,
    name: `${setId}-${slotKey}`,
    slot: slotKey.startsWith('charm') ? 'charm' : slotKey,
    quality: 1,
    setId,
    atk: 10,
    def: 5,
    speed: 2,
    crit: 0.01,
    maxHp: 20,
    affixes: [],
    price: 1,
  }
}

function equipRealSlots(
  state: ReturnType<typeof newGame>,
  setId: string,
  slots: readonly (typeof SLOT_KEYS[number])[],
) {
  for (const [index, slot] of slots.entries()) state.equipment[slot] = equipmentPiece(setId, slot, index)
}

const FOUR_REAL_SET_SLOTS = ['weapon', 'head', 'armor', 'boots'] as const

function linkedV3Record() {
  for (let seed = 1; seed <= 200; seed++) {
    const record = genDynamicSetFromSeed(seed, 1, [])
    if (record.generation?.hitLinkage?.recipeId === 'giant_sword_first_hit_fire_bolt') return record
  }
  throw new Error('expected a deterministic giant-sword linkage seed')
}

function unlinkedV3Record() {
  for (let seed = 1; seed <= 200; seed++) {
    const record = genDynamicSetFromSeed(seed, 1, [])
    if (record.generation?.hitLinkage === null) return record
  }
  throw new Error('expected a deterministic no-linkage seed')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('dynamic set v3 source routing contract', () => {
  it('uses only SLOT_KEYS for item stats, set ids and set piece counts', () => {
    const state = newGame()
    const injected = state.equipment as unknown as Record<string, EquipItem | null>
    injected.unknown_equipment_key = {
      ...equipmentPiece('set_injected', 'weapon', 1),
      atk: 999999,
      setId: 'set_injected',
    }

    expect(aggregateMods(state).atk).toBe(0)
    expect(equippedSetIds(state)).toEqual([])
    expect(setPieceCount(state, 'set_injected')).toBe(0)
  })

  it('uses the independently winning art source for dageng linkage bans and phase-local VFX', () => {
    const giantLinkage: ControlledHitLinkage = {
      recipeId: 'giant_sword_first_hit_fire_bolt',
      parameters: { projectileCount: 1, damageMultiplier: 0.4, cooldownMs: 1200, nonRecursive: true },
    }
    const attackSource = {
      setId: 'aaa_attack_source',
      count: 4,
      bonus: {
        count: 4,
        attackMode: 'giant_sword' as const,
        vfxRecipe: 'giant-crest' as const,
        hitLinkage: giantLinkage,
        desc: '攻击来源只持有攻击通道',
      },
    }
    const safeArtSource = {
      setId: 'zzz_safe_art_source',
      count: 4,
      bonus: {
        count: 4,
        artMode: 'thunder_strike' as const,
        artPower: 1.4,
        artCooldownMs: 12000,
        vfxRecipe: 'thunder-sigil' as const,
        desc: '神通来源只持有神通通道',
      },
    }
    const dagengArtSource = {
      ...safeArtSource,
      setId: 'zzz_dageng_art_source',
      bonus: {
        ...safeArtSource.bonus,
        artMode: 'dageng' as const,
        vfxRecipe: 'sword-comet' as const,
      },
    }

    expect(resolveProceduralAttackVfxFromSources([attackSource, safeArtSource])).toBe('giant-crest')
    expect(resolveProceduralArtVfxFromSources([attackSource, safeArtSource])).toBe('thunder-sigil')
    expect(resolveSetHitLinkageSourceFromSources([attackSource, safeArtSource])).toMatchObject({
      source: { setId: attackSource.setId },
      artSource: { setId: safeArtSource.setId },
      linkage: giantLinkage,
    })
    expect(resolveSetHitLinkageSourceFromSources([attackSource, dagengArtSource])).toBeNull()
  })

  it('accepts an attack-only linkage source until a separately winning art source authorizes it', () => {
    const linkage: ControlledHitLinkage = {
      recipeId: 'flying_sword_first_hit_split',
      parameters: { childCount: 2, damageMultiplier: 0.4, cooldownMs: 800, nonRecursive: true },
    }
    const attackOnly = { setId: 'aaa_attack_only_link', count: 4, bonus: { count: 4, attackMode: 'flying_sword_burst' as const, hitLinkage: linkage, desc: '攻击联动' } }
    const artWinner = { setId: 'zzz_art_winner_link', count: 4, bonus: { count: 4, artMode: 'sword_fan' as const, desc: '神通授权' } }

    expect(resolveSetHitLinkageSourceFromSources([attackOnly])).toBeNull()
    expect(resolveSetHitLinkageSourceFromSources([attackOnly, artWinner])).toMatchObject({
      source: { setId: attackOnly.setId },
      artSource: { setId: artWinner.setId },
      linkage,
    })
  })

  it('routes attack and art from independent complete sources while their VFX remains source-local', () => {
    const state = newGame()
    const attackSetId = 'aaa_attack_only'
    const artSetId = 'zzz_art_complete'
    const attackSet: SetDef = {
      id: attackSetId,
      name: '攻击源',
      pieces: [],
      bonuses: [{ count: 4, attackMode: 'giant_sword', fxTags: ['sword_split'], desc: '攻击能力' }],
    }
    const artSet: SetDef = {
      id: artSetId,
      name: '神通源',
      pieces: [],
      bonuses: [{
        count: 4,
        artMode: 'thunder_strike',
        artPower: 1.4,
        artCooldownMs: 12000,
        fxTags: ['sword_split', 'fire_burst'],
        desc: '完整神通能力',
      }],
    }

    const sources = [
      { setId: attackSetId, count: 4, bonus: attackSet.bonuses[0] },
      { setId: artSetId, count: 4, bonus: artSet.bonuses[0] },
    ]
    expect(selectSetAttackSource(sources)).toMatchObject({ setId: attackSetId, bonus: { attackMode: 'giant_sword' } })
    expect(selectSetArtSource(sources)).toMatchObject({ setId: artSetId, bonus: { artMode: 'thunder_strike' } })

    withTemporarySets(SETS, state, [[attackSetId, attackSet], [artSetId, artSet]], () => {
      // Two pieces per set cannot activate a presentation source through real runtime slots.
      equipRealSlots(state, attackSetId, ['weapon', 'head'])
      equipRealSlots(state, artSetId, ['armor', 'boots'])
      expect(resolveSetAttackSource(state)).toBeNull()
      expect(resolveSetArtSource(state)).toBeNull()
    })
  })

  it('does not allow transform-only or fxTag-only entries to mask complete ability sources', () => {
    const state = newGame()
    const incompleteId = 'aaa_incomplete'
    const completeId = 'zzz_complete'
    const incomplete: SetDef = {
      id: incompleteId,
      name: '不完整条目',
      pieces: [],
      bonuses: [{ count: 4, transformId: 'visual-only', fxTags: ['array_mine'], desc: '仅表现' }],
    }
    const complete: SetDef = {
      id: completeId,
      name: '完整条目',
      pieces: [],
      bonuses: [{
        count: 4,
        attackMode: 'flying_sword_burst',
        artMode: 'sword_fan',
        artPower: 1.6,
        artCooldownMs: 7000,
        vfxRecipe: 'sword-comet',
        desc: '完整能力',
      }],
    }

    const sources = [
      { setId: incompleteId, count: 4, bonus: incomplete.bonuses[0] },
      { setId: completeId, count: 4, bonus: complete.bonuses[0] },
    ]
    expect(selectSetAttackSource(sources)).toMatchObject({ setId: completeId, bonus: { attackMode: 'flying_sword_burst' } })
    expect(selectSetArtSource(sources)).toMatchObject({ setId: completeId, bonus: { artMode: 'sword_fan' } })

    const isolatedState = newGame()
    withTemporarySets(SETS, isolatedState, [[incompleteId, incomplete], [completeId, complete]], () => {
      // Runtime only has six real slots, so the complete four-piece entry is
      // active while the incomplete one stays below threshold; it cannot mask.
      equipRealSlots(isolatedState, completeId, FOUR_REAL_SET_SLOTS)
      expect(setPieceCount(isolatedState, completeId)).toBe(4)
      expect(resolveSetAttackSource(isolatedState)).toMatchObject({ setId: completeId })
      expect(resolveAttackMode(isolatedState)).toBe('flying_sword_burst')
      expect(resolveSetArtOverride(isolatedState)).toMatchObject({ mode: 'sword_fan' })
      expect(resolveProceduralAttackVfx(isolatedState)).toBe('sword-comet')
      expect(resolveProceduralArtVfx(isolatedState)).toBe('sword-comet')
      expect(resolveSetEffectRuntime(isolatedState).arrayMine).toBe(false)
    })
  })

  it('merges qualified fxTags by registry order and deduplicates provenance by setId', () => {
    const state = newGame()
    const setId = 'tag_merge_source'
    const set: SetDef = {
      id: setId,
      name: '标签来源',
      pieces: [],
      bonuses: [{
        count: 4,
        attackMode: 'flying_sword_burst',
        fxTags: ['fire_burst', 'sword_split', 'fire_burst', 'procedural_vfx'],
        desc: '重复标签来源',
      }],
    }

    withTemporarySets(SETS, state, [[setId, set]], () => {
      equipRealSlots(state, setId, FOUR_REAL_SET_SLOTS)
      expect(resolveSetEffectTagSources(state).map(({ tag, sources }) => ({
        tag,
        sourceIds: sources.map((source) => source.setId),
      }))).toEqual([
        { tag: 'sword_split', sourceIds: [setId] },
        { tag: 'fire_burst', sourceIds: [setId] },
        { tag: 'procedural_vfx', sourceIds: [setId] },
      ])
      expect(resolveSetEffectRuntime(state)).toMatchObject({ swordSplit: true, fireBurst: true })
    })

    const merged = mergeSetEffectTagSources([
      { setId: 'zzz', count: 4, bonus: { count: 4, fxTags: ['fire_burst', 'sword_split'], desc: 'Z' } },
      { setId: 'aaa', count: 6, bonus: { count: 6, fxTags: ['fire_burst', 'array_mine', 'fire_burst'], desc: 'A' } },
    ])
    expect(merged.map(({ tag, sources }) => ({ tag, sourceIds: sources.map((source) => source.setId) }))).toEqual([
      { tag: 'sword_split', sourceIds: ['zzz'] },
      { tag: 'fire_burst', sourceIds: ['aaa', 'zzz'] },
      { tag: 'array_mine', sourceIds: ['aaa'] },
    ])
  })

  it('rejects non-finite legacy Mods and base stats while isolating unknown fxTags without rerolling valid legacy data', () => {
    const validLegacy = {
      set: {
        id: 'set_dy_legacy_safe',
        name: '兼容旧套',
        pieces: ['w_dy_legacy_safe'],
        bonuses: [{ count: 4, mods: { atk: 12 }, fxTags: ['unknown_fx_tag'], desc: '旧套数值' }],
      },
      bases: [{ id: 'w_dy_legacy_safe', name: '兼容旧剑', slot: 'weapon', set: 'set_dy_legacy_safe', atk: 12 }],
    }
    const invalidMod = clone(validLegacy) as Record<string, any>
    invalidMod.set.id = 'set_dy_legacy_nan_mod'
    invalidMod.set.pieces = ['w_dy_legacy_nan_mod']
    invalidMod.bases[0].id = 'w_dy_legacy_nan_mod'
    invalidMod.bases[0].set = invalidMod.set.id
    invalidMod.set.bonuses[0].mods.atk = Number.NaN
    const invalidBase = clone(validLegacy) as Record<string, any>
    invalidBase.set.id = 'set_dy_legacy_inf_base'
    invalidBase.set.pieces = ['w_dy_legacy_inf_base']
    invalidBase.bases[0].id = 'w_dy_legacy_inf_base'
    invalidBase.bases[0].set = invalidBase.set.id
    invalidBase.bases[0].atk = Infinity
    const unknownMod = clone(validLegacy) as Record<string, any>
    unknownMod.set.id = 'set_dy_legacy_unknown_mod'
    unknownMod.set.pieces = ['w_dy_legacy_unknown_mod']
    unknownMod.bases[0].id = 'w_dy_legacy_unknown_mod'
    unknownMod.bases[0].set = unknownMod.set.id
    unknownMod.set.bonuses[0].mods = { notAMod: 1 }

    const normalized = normalizeDynamicSetRecords([validLegacy, invalidMod, invalidBase, unknownMod])
    expect(normalized).toEqual([{
      ...validLegacy,
      set: {
        ...validLegacy.set,
        bonuses: [{ count: 4, mods: { atk: 12 }, desc: '旧套数值' }],
      },
    }])
  })

  it('keeps six-piece as a gated boundary without fabricating extra equipment keys or dynamic accessory content', () => {
    expect(SLOT_KEYS).toEqual(['weapon', 'head', 'armor', 'boots', 'charm1', 'charm2'])
    expect(Object.values(SETS).every((set) => set.pieces.length === 4)).toBe(true)

    const record = genDynamicSetFromSeed(2, 1, [])
    expect(record.set.pieces).toHaveLength(4)
    expect(record.bases.map((base) => base.slot)).toEqual(['weapon', 'head', 'armor', 'boots'])
  })
})

describe('dynamic set v3 archival and controlled linkage contract', () => {
  it('writes a deterministic v3/generator-v2 snapshot with generation identity and controlled linkage data', () => {
    const first = linkedV3Record()
    const second = genDynamicSetFromSeed(first.generation!.seed, 1, [])
    const transform = first.set.bonuses.find((bonus) => bonus.count === 4)!

    expect(first).toEqual(second)
    expect(first.schemaVersion).toBe(DYNAMIC_SET_SCHEMA_VERSION)
    expect(first.generation).toMatchObject({
      generatorVersion: DYNAMIC_SET_GENERATOR_VERSION,
      seed: first.generation!.seed,
      sequence: 1,
      identity: {
        setId: first.set.id,
        profileId: first.generation?.profileId,
        transformId: transform.transformId,
      },
    })
    expect(first.generation?.hitLinkage).toMatchObject({
      recipeId: 'giant_sword_first_hit_fire_bolt',
      parameters: { projectileCount: 1, damageMultiplier: 0.4, cooldownMs: 1200, nonRecursive: true },
    })
    expect(transform.hitLinkage).toEqual(first.generation?.hitLinkage)
    expect(transform.desc).toContain('首次命中')
    expect(transform.desc).toContain('40%')
  })

  it('accepts a complete v3 snapshot with an intentional no-linkage generation field', () => {
    const record = unlinkedV3Record()
    const transform = record.set.bonuses.find((bonus) => bonus.count === 4)!

    expect(record.generation?.hitLinkage).toBeNull()
    expect(transform.hitLinkage).toBeUndefined()
    expect(normalizeDynamicSetRecords([record])).toEqual([record])
  })

  it('preserves valid v2 and legacy snapshots without rerolling while accepting v3 beside them', () => {
    const v2 = genDynamicSetV2FromSeed(7, 2, [])
    const v3 = linkedV3Record()
    const legacy = {
      set: {
        id: 'set_dy_legacy_contract',
        name: '旧档契约套',
        pieces: ['w_dy_legacy_contract'],
        bonuses: [{ count: 4, attackMode: 'thunder_chain', artMode: 'thunder_strike', desc: '旧档雷法' }],
      },
      bases: [{ id: 'w_dy_legacy_contract', name: '旧档雷剑', slot: 'weapon', set: 'set_dy_legacy_contract', atk: 12 }],
    }

    expect(v2.schemaVersion).toBe(DYNAMIC_SET_V2_SCHEMA_VERSION)
    expect(v2.generation?.generatorVersion).toBe(DYNAMIC_SET_V2_GENERATOR_VERSION)
    const normalized = normalizeDynamicSetRecords([v2, v3, legacy])
    expect(normalized).toHaveLength(3)
    expect(normalized[0]).toEqual(v2)
    expect(normalized[1]).toEqual(v3)
    expect(normalized[2]).toEqual(legacy)
  })

  it('preserves complete v2/v3 snapshots after player-facing wording evolves', () => {
    const records = [genDynamicSetV2FromSeed(1, 1, []), genDynamicSetFromSeed(1, 2, [])]
    expect(normalizeDynamicSetRecords(records)).toEqual(records)
  })

  it('isolates damaged or unknown explicit schemas without dropping valid v2/v3 peers', () => {
    const v2 = genDynamicSetV2FromSeed(7, 2, [])
    const v3 = linkedV3Record()
    const damaged = clone(v3) as Record<string, any>
    damaged.generation.hitLinkage.parameters.damageMultiplier = 99
    const unknown = clone(v3) as Record<string, any>
    unknown.schemaVersion = 999

    const normalized = normalizeDynamicSetRecords([v2, damaged, unknown, v3])
    expect(normalized).toEqual([v2, v3])
  })

  it('only gives v3 controlled linkage to approved non-dageng flying-sword or giant-sword profiles', () => {
    const linkedRecipes = new Set<string>()
    for (let seed = 1; seed <= 400; seed++) {
      const record = genDynamicSetFromSeed(seed, seed, [])
      const generation = record.generation!
      const linkage = generation.hitLinkage
      if (generation.art.mode === 'dageng') expect(linkage).toBeNull()
      if (linkage) {
        linkedRecipes.add(linkage.recipeId)
        expect(generation.art.mode).not.toBe('dageng')
        expect(['flying_sword_burst', 'giant_sword']).toContain(generation.move.mode)
      }
    }
    expect(linkedRecipes).toEqual(new Set(['flying_sword_first_hit_split', 'giant_sword_first_hit_fire_bolt']))
  })

  it('advances authorization when an identical-set winner moves from a four-piece to six-piece ability row', () => {
    const linkage: ControlledHitLinkage = {
      recipeId: 'giant_sword_first_hit_fire_bolt',
      parameters: { projectileCount: 1, damageMultiplier: 0.4, cooldownMs: 1200, nonRecursive: true },
    }
    const fourAttack = {
      setId: 'same_set_source', count: 6,
      bonus: { count: 4, attackMode: 'giant_sword' as const, transformId: 'same-four', vfxRecipe: 'giant-crest' as const, hitLinkage: linkage, desc: '四件攻击' },
    }
    const sixAttack = {
      setId: 'same_set_source', count: 6,
      bonus: { count: 6, attackMode: 'giant_sword' as const, transformId: 'same-six', vfxRecipe: 'giant-crest' as const, hitLinkage: linkage, desc: '六件攻击预留' },
    }
    const art = {
      setId: 'same_set_source', count: 6,
      bonus: { count: 4, artMode: 'thunder_strike' as const, transformId: 'same-art', vfxRecipe: 'thunder-sigil' as const, artPower: 1.4, artCooldownMs: 12000, desc: '神通来源' },
    }
    const fourResolved = resolveSetHitLinkageSourceFromSources([fourAttack, art])
    const sixResolved = resolveSetHitLinkageSourceFromSources([sixAttack, art])
    const authorization = createControlledHitLinkageAuthorization()
    const cooldownKey = controlledHitLinkageCooldownKey('same_set_source', linkage.recipeId)
    const oldSnapshot = authorization.capture('same_set_source', linkage.recipeId)
    authorization.setReadyAt(cooldownKey, 2400)

    expect(controlledHitLinkageSourceFingerprint(fourResolved)).not.toBe(controlledHitLinkageSourceFingerprint(sixResolved))
    advanceControlledHitLinkageEpoch(authorization)
    expect(authorization.isCurrent(oldSnapshot)).toBe(false)
    expect(authorization.readyAt(cooldownKey)).toBe(0)
  })

  it('changes the scene-adapter source fingerprint when either a future six-piece attack or art winner changes', () => {
    const linkage: ControlledHitLinkage = {
      recipeId: 'giant_sword_first_hit_fire_bolt',
      parameters: { projectileCount: 1, damageMultiplier: 0.4, cooldownMs: 1200, nonRecursive: true },
    }
    const attackFour = {
      setId: 'future_six_fixture', count: 6,
      bonus: { count: 4, attackMode: 'giant_sword' as const, transformId: 'attack-four', vfxRecipe: 'giant-crest' as const, hitLinkage: linkage, desc: '四件攻击' },
    }
    const attackSix = {
      ...attackFour,
      bonus: { ...attackFour.bonus, count: 6, transformId: 'attack-six', desc: '六件攻击预留' },
    }
    const artFour = {
      setId: 'future_six_fixture', count: 6,
      bonus: { count: 4, artMode: 'thunder_strike' as const, transformId: 'art-four', vfxRecipe: 'thunder-sigil' as const, artPower: 1.4, artCooldownMs: 12000, desc: '四件神通' },
    }
    const artSix = {
      ...artFour,
      bonus: { ...artFour.bonus, count: 6, transformId: 'art-six', desc: '六件神通预留' },
    }
    const atFour = resolveSetHitLinkageSourceFromSources([attackFour, artFour])
    const attackTierChanged = resolveSetHitLinkageSourceFromSources([attackSix, artFour])
    const artTierChanged = resolveSetHitLinkageSourceFromSources([attackFour, artSix])

    expect(controlledHitLinkageSourceFingerprint(atFour)).not.toBe(controlledHitLinkageSourceFingerprint(attackTierChanged))
    expect(controlledHitLinkageSourceFingerprint(atFour)).not.toBe(controlledHitLinkageSourceFingerprint(artTierChanged))
    // This is a resolver/scene-adapter fixture only; current generated content stays fixed at four pieces.
    expect(genDynamicSetFromSeed(2, 1, []).set.pieces).toHaveLength(4)
  })

  it('arbitrates same-frame candidate parents by creation order, not reverse storage order', () => {
    const candidates = [
      { id: 'newest', creationOrder: 9 },
      { id: 'oldest', creationOrder: 3 },
      { id: 'middle', creationOrder: 6 },
    ]
    expect(orderedControlledHitCandidates(candidates).map((candidate) => candidate.id)).toEqual(['oldest', 'middle', 'newest'])
  })

  it('invalidates old projectile authorization and clears source cooldowns on an equipment-source epoch change', () => {
    const authorization = createControlledHitLinkageAuthorization()
    const sourceKey = controlledHitLinkageCooldownKey('set_alpha', 'flying_sword_first_hit_split')
    const parentEpoch = authorization.capture('set_alpha', 'flying_sword_first_hit_split')
    authorization.setReadyAt(sourceKey, 1800)

    expect(authorization.isCurrent(parentEpoch)).toBe(true)
    expect(authorization.readyAt(sourceKey)).toBe(1800)
    expect(advanceControlledHitLinkageEpoch(authorization)).toBe(authorization.epoch)
    expect(authorization.isCurrent(parentEpoch)).toBe(false)
    expect(authorization.readyAt(sourceKey)).toBe(0)
    expect(tryTriggerControlledHitLinkage({
      recipeId: 'flying_sword_first_hit_split',
      parameters: { childCount: 2, damageMultiplier: 0.4, cooldownMs: 800, nonRecursive: true },
    }, 1000, authorization.readyAt(sourceKey), !authorization.isCurrent(parentEpoch))).toBeNull()

    const reequippedEpoch = authorization.capture('set_alpha', 'flying_sword_first_hit_split')
    expect(authorization.isCurrent(reequippedEpoch)).toBe(true)
    expect(authorization.readyAt(sourceKey)).toBe(0)
  })

  it('enforces first-hit cooldown and non-recursion through pure controlled-linkage execution', () => {
    const flying: ControlledHitLinkage = {
      recipeId: 'flying_sword_first_hit_split',
      parameters: { childCount: 2, damageMultiplier: 0.4, cooldownMs: 800, nonRecursive: true },
    }
    const giant: ControlledHitLinkage = {
      recipeId: 'giant_sword_first_hit_fire_bolt',
      parameters: { projectileCount: 1, damageMultiplier: 0.4, cooldownMs: 1200, nonRecursive: true },
    }

    expect(tryTriggerControlledHitLinkage(flying, 1000, 0, false)).toEqual({
      recipeId: 'flying_sword_first_hit_split',
      nextReadyAt: 1800,
      action: { kind: 'split_swords', childCount: 2, damageMultiplier: 0.4 },
    })
    expect(tryTriggerControlledHitLinkage(flying, 1799, 1800, false)).toBeNull()
    expect(tryTriggerControlledHitLinkage(flying, 1800, 0, false, false)).toBeNull()
    expect(tryTriggerControlledHitLinkage(flying, 1800, 1800, false)?.nextReadyAt).toBe(2600)
    expect(tryTriggerControlledHitLinkage(flying, 5000, 0, true)).toBeNull()
    expect(matchesControlledHitLinkageProjectileKind(flying, 'sword')).toBe(true)
    expect(controlledHitLinkageCooldownKey('set_alpha', flying.recipeId)).toBe('set_alpha:flying_sword_first_hit_split')
    expect(controlledHitLinkageCooldownKey('set_beta', flying.recipeId)).not.toBe(controlledHitLinkageCooldownKey('set_alpha', flying.recipeId))
    expect(matchesControlledHitLinkageProjectileKind(flying, 'bolt')).toBe(false)
    expect(matchesControlledHitLinkageProjectileKind(flying, 'giant')).toBe(false)

    expect(tryTriggerControlledHitLinkage(giant, 2000, 0, false)).toEqual({
      recipeId: 'giant_sword_first_hit_fire_bolt',
      nextReadyAt: 3200,
      action: { kind: 'fire_bolt', projectileCount: 1, damageMultiplier: 0.4 },
    })
    expect(tryTriggerControlledHitLinkage(giant, 3199, 3200, false)).toBeNull()
    expect(matchesControlledHitLinkageProjectileKind(giant, 'giant')).toBe(true)
    expect(matchesControlledHitLinkageProjectileKind(giant, 'sword')).toBe(false)
  })
})
