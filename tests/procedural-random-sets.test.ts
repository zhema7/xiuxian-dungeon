import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveEffectiveArtCast } from '../src/art-cast'
import { SETS } from '../src/data'
import { isProceduralVfxCompatible, isProceduralVfxRecipe, proceduralVfxSteps } from '../src/procedural-vfx'
import {
  DYNAMIC_SET_SCHEMA_VERSION,
  genDynamicSetFromSeed,
  nextDynamicSetSequence,
  normalizeDynamicSetRecords,
} from '../src/lore'
import {
  resolveAttackMode,
  resolveProceduralArtVfx,
  resolveProceduralAttackVfx,
  resolveSetArtOverride,
} from '../src/effects'
import { loadGame, newGame, SAVE_VERSION } from '../src/state'
import { withTemporarySets } from './set-test-fixture'

const stored: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => stored[key] ?? null,
  setItem: (key: string, value: string) => { stored[key] = String(value) },
  removeItem: (key: string) => { delete stored[key] },
  clear: () => { for (const key of Object.keys(stored)) delete stored[key] },
}
vi.stubGlobal('localStorage', localStorageMock)

function equipDynamicSet(state: ReturnType<typeof newGame>, setId: string) {
  const slots = ['weapon', 'head', 'armor', 'boots'] as const
  for (const [index, slot] of slots.entries()) {
    state.equipment[slot] = {
      uid: `${setId}-${slot}`,
      baseId: `${slot}-base`,
      name: `${slot}-piece`,
      slot,
      quality: 3,
      setId,
      atk: 0,
      def: 0,
      speed: 0,
      crit: 0,
      maxHp: 0,
      affixes: [],
      price: 1,
    }
  }
}

/** 以真实生成结果为对抗样本基线，随后只篡改一个 current-schema 契约点。 */
function currentSchemaRecord(seed = 0x6a09e667, sequence = 1): Record<string, any> {
  return JSON.parse(JSON.stringify(genDynamicSetFromSeed(seed, sequence, []))) as Record<string, any>
}

describe('procedural random set generation', () => {
  beforeEach(() => localStorageMock.clear())

  it('replays a complete named set exactly from its explicit seed', () => {
    const a = genDynamicSetFromSeed(0x6a09e667, 3, [])
    const b = genDynamicSetFromSeed(0x6a09e667, 3, [])
    const transform = a.set.bonuses.find((bonus) => bonus.count === 4)!

    expect(a).toEqual(b)
    expect(a.schemaVersion).toBe(DYNAMIC_SET_SCHEMA_VERSION)
    expect(a.generation).toMatchObject({
      generatorVersion: 2,
      seed: 0x6a09e667,
      sequence: 3,
      profileId: expect.any(String),
      move: { id: expect.any(String), name: expect.any(String) },
      art: { id: expect.any(String), name: expect.any(String) },
    })
    if (a.generation?.move.mode) {
      expect(a.generation.move).toMatchObject({ mode: expect.any(String), behavior: expect.any(String) })
    }
    if (a.generation?.art.mode) {
      expect(a.generation.art).toMatchObject({ mode: expect.any(String), behavior: expect.any(String) })
    }
    if (a.generation?.vfxRecipe) {
      expect(transform).toMatchObject({ vfxRecipe: a.generation!.vfxRecipe })
    }
    if (transform.attackMode) {
      expect(transform.attackMode).toBe(a.generation!.move.mode)
    }
    if (transform.artMode) {
      expect(transform.artMode).toBe(a.generation!.art.mode)
    }
    if (transform.attackName) {
      expect(transform.attackName).toBe(a.generation!.move.name)
    }
    if (transform.artName) {
      expect(transform.artName).toBe(a.generation!.art.name)
    }
    if (transform.attackName) expect(transform.desc).toContain(`【${a.generation!.move.name}】`)
    if (transform.artName) expect(transform.desc).toContain(`【${a.generation!.art.name}】`)
    if (a.generation!.move.mode) expect(transform.desc).not.toContain(a.generation!.move.mode)
    if (a.generation!.art.mode) expect(transform.desc).not.toContain(a.generation!.art.mode)
  })

  it('chooses a free sequence rather than colliding with sparse legacy ids', () => {
    const existing = [
      { set: { id: 'set_dy1', name: '一套', pieces: [], bonuses: [] }, bases: [] },
      { set: { id: 'set_dy3', name: '三套', pieces: [], bonuses: [] }, bases: [] },
    ]
    expect(nextDynamicSetSequence(existing)).toBe(2)
    expect(genDynamicSetFromSeed(11, nextDynamicSetSequence(existing), existing).set.id).toBe('set_dy2')
  })

  it('never generates unsupported modes, VFX recipes, or legacy test tags', () => {
    const validAttacks = ['flying_sword_burst', 'frost_nova_burst', 'thunder_chain', 'giant_sword',
      'melee_arc', 'whirlwind', 'flying_sword', 'magic_bolt', 'frost_nova', 'sword_array',
      'shadow_blade', 'spirit_chain', 'wind_slash', 'stone_spike',
      'blood_scythe', 'star_barrage', 'venom_claw', 'light_beam',
      'soul_flame', 'crystal_shard']
    const validArts = ['sword_fan', 'fire_rain', 'thunder_strike', 'dageng',
      'meteor_storm', 'void_rift', 'blood_domain', 'light_pillar',
      'frozen_domain', 'spirit_vortex', 'blade_orbit', 'poison_cloud',
      'gravity_crush', 'phoenix_rebirth']
    for (let seed = 1; seed <= 96; seed++) {
      const rec = genDynamicSetFromSeed(seed, seed, [])
      const bonus = rec.set.bonuses.find((entry) => entry.count === 4)!
      if (bonus.attackMode) expect(validAttacks).toContain(bonus.attackMode)
      if (bonus.artMode) expect(validArts).toContain(bonus.artMode)
      if (bonus.vfxRecipe) {
        expect(isProceduralVfxRecipe(bonus.vfxRecipe)).toBe(true)
        expect(isProceduralVfxCompatible(bonus.vfxRecipe, bonus.attackMode, bonus.artMode)).toBe(true)
      }
      expect(bonus.fxTags?.every((tag) => !tag.startsWith('test_'))).toBe(true)
      expect(rec.set.id).toMatch(/^set_dy[\w-]+$/)
      expect(new Set(rec.set.pieces).size).toBe(4)
    }
  })

  it('creates bounded, non-field modular VFX steps for both attack and art phases', () => {
    const rec = genDynamicSetFromSeed(42, 1, [])
    const recipe = rec.generation!.vfxRecipe
    // Profiles without vfxRecipe (KitPrimitive, art-only, no-ability) produce no VFX steps.
    if (!recipe) return
    const attack = proceduralVfxSteps(recipe, 'attack')
    const art = proceduralVfxSteps(recipe, 'art')
    const allSteps = [...attack, ...art]

    expect(attack.length).toBeGreaterThan(0)
    expect(art.length).toBeGreaterThan(0)
    // 每个阶段最多一组主焦点加两层辅助表现；持续领域尚未实现，不得进入随机池。
    expect(attack.length).toBeLessThanOrEqual(3)
    expect(art.length).toBeLessThanOrEqual(3)
    expect(allSteps.every((step) => ['rune', 'blade', 'burst', 'charge', 'hit'].includes(step.kind))).toBe(true)
    expect(allSteps.some((step) => step.kind === 'field')).toBe(false)
  })

  it('covers all shipped transform families, VFX recipes, and multiple Chinese identities across a fixed seed corpus', () => {
    const attackModes = new Set<string>()
    const recipes = new Set<string>()
    const moveNames = new Set<string>()
    const artNames = new Set<string>()

    // 固定语料是发布回归契约：扩展词池可以增加多样性，但不得丢失现有四个真实家族。
    for (let seed = 1; seed <= 400; seed++) {
      const rec = genDynamicSetFromSeed(seed, seed, [])
      const transform = rec.set.bonuses.find((entry) => entry.count === 4)!
      if (transform.attackName) {
        expect(transform.attackName).toMatch(/[\u4e00-\u9fff]/)
        moveNames.add(transform.attackName)
      }
      if (transform.artName) {
        expect(transform.artName).toMatch(/[\u4e00-\u9fff]/)
        artNames.add(transform.artName)
      }
      if (transform.attackMode) attackModes.add(transform.attackMode)
      if (transform.vfxRecipe) recipes.add(transform.vfxRecipe)
    }

    const expectedAttacks = new Set([
      'flying_sword_burst', 'frost_nova_burst', 'thunder_chain', 'giant_sword',
      'melee_arc', 'whirlwind', 'flying_sword', 'magic_bolt', 'frost_nova', 'sword_array',
    ])
    for (const mode of expectedAttacks) expect(attackModes).toContain(mode)
    expect(recipes).toEqual(new Set(['sword-comet', 'frost-bloom', 'thunder-sigil', 'giant-crest']))
    expect(moveNames.size).toBeGreaterThanOrEqual(8)
    expect(artNames.size).toBeGreaterThanOrEqual(8)
  })

  it('resolves generated display names and VFX only when its dynamic set wins', () => {
    const rec = genDynamicSetFromSeed(777, 1, [])
    const setId = rec.set.id

    const state = newGame()
    withTemporarySets(SETS, state, [[setId, rec.set]], () => {
      equipDynamicSet(state, setId)
      const transform = rec.set.bonuses.find((entry) => entry.count === 4)!
      const override = resolveSetArtOverride(state)

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
        expect(override).toMatchObject({ mode: transform.artMode, displayName: transform.artName })
        expect(resolveEffectiveArtCast(override, undefined, 1, 1)?.displayName).toBe(transform.artName)
      } else {
        expect(override).toBeNull()
      }
    })
  })

  it('does not activate dynamic transforms or VFX during a 2+2 mixed set', () => {
    const highId = 'set_dy_aaa_high'
    const lowId = 'set_dy_zzz_low'
    const highSet = {
      id: highId, name: '高优先级', pieces: [], bonuses: [{ count: 2, attackMode: 'giant_sword' as const, desc: '高优先级巨剑' }],
    }
    const lowSet = {
      id: lowId, name: '低优先级', pieces: [], bonuses: [{ count: 2, attackMode: 'giant_sword' as const, artMode: 'dageng' as const, vfxRecipe: 'giant-crest' as const, desc: '低优先级巨剑' }],
    }

    const state = newGame()
    const fallbackMode = resolveAttackMode(state)
    withTemporarySets(SETS, state, [[highId, highSet], [lowId, lowSet]], () => {
      const item = (setId: string, slot: 'weapon' | 'head') => ({
        uid: `${setId}-${slot}`, baseId: `${setId}-${slot}`, name: setId, slot, quality: 1 as const, setId,
        atk: 0, def: 0, speed: 0, crit: 0, maxHp: 0, affixes: [], price: 1,
      })
      state.equipment.weapon = item(highId, 'weapon')
      state.equipment.head = item(highId, 'head')
      state.equipment.armor = item(lowId, 'weapon')
      state.equipment.boots = item(lowId, 'head')
      expect(resolveAttackMode(state)).toBe(fallbackMode)
      expect(resolveSetArtOverride(state)).toBeNull()
      expect(resolveProceduralAttackVfx(state)).toBeNull()
      expect(resolveProceduralArtVfx(state)).toBeNull()
    })
  })

  it('rejects malformed and unsupported explicit-schema dynamic records without degrading them to legacy', () => {
    const cases: Array<[string, (record: Record<string, any>) => void]> = [
      ['missing generation', (record) => { delete record.generation }],
      ['malformed generation', (record) => { record.generation.seed = 'not-a-number' }],
      ['generation sequence/id mismatch', (record) => { record.generation.sequence += 1 }],
      ['generation profile/mode/recipe mismatch', (record) => { record.generation.vfxRecipe = 'sword-comet' }],
      ['incomplete or mismatched piece bases', (record) => { record.bases.pop() }],
      ['forged bonus gameplay tag', (record) => { record.set.bonuses[1].fxTags = ['sword_split'] }],
      ['forged v3 linkage recipe parameters', (record) => {
        const linkage = record.set.bonuses[1].hitLinkage
        if (linkage) linkage.parameters.damageMultiplier = 99
        else record.generation.hitLinkage = { recipeId: 'giant_sword_first_hit_fire_bolt', parameters: { projectileCount: 1, damageMultiplier: 0.4, cooldownMs: 1200, nonRecursive: true } }
      }],
      ['forged two-piece presentation field', (record) => { record.set.bonuses[0].attackMode = 'giant_sword' }],
      ['forged bonus numeric contract', (record) => { record.set.bonuses[1].artPower += 0.1 }],
      ['forged base stat payload', (record) => { record.bases[0].atk = 999999 }],
      ['explicit undefined schema version', (record) => { record.schemaVersion = undefined }],
      ['unsupported explicit schema version', (record) => { record.schemaVersion = DYNAMIC_SET_SCHEMA_VERSION + 1 }],
    ]

    for (const [, mutate] of cases) {
      const forged = currentSchemaRecord()
      mutate(forged)
      expect(normalizeDynamicSetRecords([forged])).toEqual([])
    }
  })

  it('keeps valid current-schema records after strict generation contract validation', () => {
    const record = currentSchemaRecord()
    const normalized = normalizeDynamicSetRecords([record])

    expect(normalized).toHaveLength(1)
    expect(normalized[0]).toMatchObject({
      schemaVersion: DYNAMIC_SET_SCHEMA_VERSION,
      generation: record.generation,
      set: { id: record.set.id },
    })
    expect(normalized[0].bases).toHaveLength(record.bases.length)
  })

  it('accepts a fixed corpus of generator-produced current-schema records unchanged', () => {
    const records = Array.from({ length: 64 }, (_, index) => genDynamicSetFromSeed(index + 1, index + 1, []))
    const normalized = normalizeDynamicSetRecords(records)

    // All 64 records pass validation: no-ability profiles produce identity.transformId
    // 'none' which the v3 validator accepts for profiles without ability fields.
    expect(normalized).toHaveLength(64)
    expect(normalized.every((record) => record.schemaVersion === DYNAMIC_SET_SCHEMA_VERSION)).toBe(true)
    const recordIds = new Set(records.map((record) => record.set.id))
    expect(normalized.every((record) => recordIds.has(record.set.id))).toBe(true)
  })

  it('rejects legacy dynamic records with two-piece presentation fields', () => {
    const invalidLegacy = {
      set: {
        id: 'set_dy_invalid_two',
        name: '非法旧套',
        pieces: ['w_dy_invalid_two'],
        bonuses: [{ count: 2, mods: { atk: 10 }, attackMode: 'giant_sword', desc: '非法二件能力' }],
      },
      bases: [{ id: 'w_dy_invalid_two', name: '非法旧剑', slot: 'weapon', set: 'set_dy_invalid_two', atk: 12 }],
    }
    expect(normalizeDynamicSetRecords([invalidLegacy])).toEqual([])
  })

  it('keeps valid legacy records but drops unsafe dynamic entries before runtime registration', () => {
    const legacy = {
      set: {
        id: 'set_dy_legacy',
        name: '旧机缘套',
        pieces: ['w_dy_legacy'],
        bonuses: [{ count: 4, attackMode: 'giant_sword', artMode: 'dageng', desc: '旧版变身' }],
      },
      bases: [{ id: 'w_dy_legacy', name: '旧机缘剑', slot: 'weapon', set: 'set_dy_legacy', atk: 12 }],
    }
    const unsafe = {
      schemaVersion: DYNAMIC_SET_SCHEMA_VERSION,
      set: {
        id: 'set_qm',
        name: '伪造官方套',
        pieces: ['w_qm'],
        bonuses: [{ count: 4, attackMode: 'not_supported', vfxRecipe: 'javascript:alert(1)', desc: '非法' }],
      },
      bases: [{ id: 'w_qm', name: '伪造剑', slot: 'weapon', set: 'set_qm', atk: 999 }],
    }

    const records = normalizeDynamicSetRecords([legacy, unsafe])
    expect(records).toHaveLength(1)
    expect(records[0].set.id).toBe('set_dy_legacy')
    expect(records[0].set.bonuses[0]).toMatchObject({ attackMode: 'giant_sword', artMode: 'dageng' })
    expect(records[0].bases[0].set).toBe('set_dy_legacy')
  })

  it('isolates forged current-schema dynamic content during v5 load without losing a valid peer record', () => {
    const valid = currentSchemaRecord(42, 1)
    const forged = currentSchemaRecord(43, 2)
    forged.generation.seed = 'forged'
    localStorageMock.setItem('xiuxian_save_v1', JSON.stringify({
      ...newGame(),
      version: SAVE_VERSION,
      dynamicSets: [valid, forged],
    }))

    const loaded = loadGame()
    expect(loaded.version).toBe(SAVE_VERSION)
    expect(loaded.dynamicSets).toHaveLength(1)
    expect(loaded.dynamicSets[0]).toMatchObject({
      schemaVersion: DYNAMIC_SET_SCHEMA_VERSION,
      set: { id: valid.set.id },
    })
  })

  it('migrates legacy dynamic content into v5 without accepting forged entries', () => {
    const legacy = {
      set: {
        id: 'set_dy_savelegacy',
        name: '存档旧套',
        pieces: ['w_dy_savelegacy'],
        bonuses: [{ count: 4, attackMode: 'thunder_chain', artMode: 'thunder_strike', desc: '旧存档雷法' }],
      },
      bases: [{ id: 'w_dy_savelegacy', name: '存档旧雷剑', slot: 'weapon', set: 'set_dy_savelegacy', atk: 13 }],
    }
    localStorageMock.setItem('xiuxian_save_v1', JSON.stringify({
      version: 4,
      classId: 'sword',
      level: 1,
      dynamicSets: [legacy, { set: { id: 'set_qm', name: '假货', pieces: [], bonuses: [] }, bases: [] }],
      dynamicSkills: [],
    }))

    const loaded = loadGame()
    expect(loaded.version).toBe(SAVE_VERSION)
    expect(loaded.dynamicSets).toHaveLength(1)
    expect(loaded.dynamicSets[0].set.id).toBe('set_dy_savelegacy')
    expect(SETS.set_qm.name).toBe('青冥剑套')
  })
})
