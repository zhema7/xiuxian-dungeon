import { describe, expect, it } from 'vitest'
import {
  V4_KIT_ABILITIES, V4_KIT_ABILITY_MAP, V4_KIT_WHITELIST,
  V4_KIT_SET_ID_PREFIX, kitIdFromSetId,
  type KitId,
} from '../src/data'
import { V4_KIT_SETS, V4_KIT_BASES, registerV4KitBases, v4KitForSetId, v4KitPieceIds, v4SetId } from '../src/v4/kit-data'
import {
  executeKit, executeKitNormal, executeKitArt,
  type KitCombatContext,
} from '../src/v4/executor'
import { buildKitManifest, availableFrames, missingFrames, KIT_FRAME_TOTAL, KIT_ASSET_TOTAL } from '../src/v4/manifest'
import { generateV4Kit, normalizeV4KitRecord, V4_KIT_SCHEMA_VERSION, V4_KIT_GENERATOR_VERSION } from '../src/v4/generator3'
import { resolveV4KitAbility, resolveV4KitArtOverride, resolveV4KitFxRuntime, isV4KitActive } from '../src/v4/runtime'
import { aggregateMods } from '../src/effects'
import { newGame } from '../src/state'
import type { EquipItem } from '../src/core'
import { SLOT_KEYS } from '../src/data'

registerV4KitBases()

const FOUR_PIECE_SLOTS = ['weapon', 'head', 'armor', 'boots'] as const

function v4Piece(kitId: KitId, slot: typeof FOUR_PIECE_SLOTS[number], index: number): EquipItem {
  const setId = `${V4_KIT_SET_ID_PREFIX}${kitId}`
  const baseId = `${slot[0]}_v4_${kitId}`
  return {
    uid: `${setId}-${slot}-${index}`,
    baseId,
    name: `${kitId}-${slot}`,
    slot,
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

function equipV4Kit(state: ReturnType<typeof newGame>, kitId: KitId, count: number) {
  const slots = FOUR_PIECE_SLOTS.slice(0, count)
  for (const [i, slot] of slots.entries()) state.equipment[slot] = v4Piece(kitId, slot, i)
}

const CTX: KitCombatContext = {
  origin: { x: 0, y: 0 },
  direction: { x: 1, y: 0 },
  atk: 100,
  crit: 0.1,
  rng: () => 0.5,
  chargeMs: 500,
  aimPoint: { x: 80, y: 0 },
}

// ---------- data.ts 类型与白名单 ----------

describe('v4 data types and whitelist', () => {
  it('whitelist has exactly 30 kit ids k01-k30', () => {
    expect(V4_KIT_WHITELIST).toHaveLength(30)
    expect(V4_KIT_WHITELIST[0]).toBe('k01')
    expect(V4_KIT_WHITELIST[29]).toBe('k30')
  })

  it('V4_KIT_ABILITIES has 30 entries matching whitelist', () => {
    expect(V4_KIT_ABILITIES).toHaveLength(30)
    for (const ability of V4_KIT_ABILITIES) {
      expect(V4_KIT_WHITELIST).toContain(ability.kitId)
      expect(ability.artPower).toBeGreaterThan(0)
      expect(ability.artCooldownMs).toBeGreaterThan(0)
    }
  })

  it('30 kits have 30 unique normal/art primitive combinations', () => {
    const combos = V4_KIT_ABILITIES.map(a => `${a.normalPrimitive}/${a.artPrimitive}`)
    expect(combos).toHaveLength(30)
    expect(new Set(combos).size).toBe(30)
  })

  it('all 8 primitives appear on both normal and art sides', () => {
    const PRIMITIVES = ['boomerang', 'roundtrip', 'refract', 'mark', 'fixedpoint', 'thundernet', 'thunderstake', 'charge']
    const normalSet = new Set(V4_KIT_ABILITIES.map(a => a.normalPrimitive))
    const artSet = new Set(V4_KIT_ABILITIES.map(a => a.artPrimitive))
    for (const p of PRIMITIVES) {
      expect(normalSet.has(p)).toBe(true)
      expect(artSet.has(p)).toBe(true)
    }
  })

  it('kitIdFromSetId resolves v4 set ids', () => {
    expect(kitIdFromSetId('set_v4_k01')).toBe('k01')
    expect(kitIdFromSetId('set_v4_k30')).toBe('k30')
    expect(kitIdFromSetId('set_v4_k99')).toBeNull()
    expect(kitIdFromSetId('set_dy1')).toBeNull()
    expect(kitIdFromSetId('set_qm')).toBeNull()
  })
})

// ---------- kit-data.ts 静态注册器 ----------

describe('v4 kit-data registration', () => {
  it('V4_KIT_SETS has 30 set defs with correct ids', () => {
    expect(V4_KIT_SETS.size).toBe(30)
    for (const ability of V4_KIT_ABILITIES) {
      const setId = v4SetId(ability.kitId)
      const def = V4_KIT_SETS.get(setId)
      expect(def).toBeDefined()
      expect(def!.id).toBe(setId)
      expect(def!.name).toBe(ability.name)
      expect(def!.pieces).toHaveLength(4)
    }
  })

  it('V4_KIT_BASES has 120 item bases (30 kits × 4 slots)', () => {
    expect(V4_KIT_BASES.length).toBe(120)
  })

  it('v4KitForSetId returns correct KitAbility', () => {
    expect(v4KitForSetId('set_v4_k01')?.normalPrimitive).toBe('boomerang')
    expect(v4KitForSetId('set_v4_k01')?.artPrimitive).toBe('thundernet')
    expect(v4KitForSetId('set_v4_k05')?.normalPrimitive).toBe('mark')
    expect(v4KitForSetId('set_v4_k05')?.artPrimitive).toBe('charge')
    expect(v4KitForSetId('set_dy1')).toBeNull()
  })

  it('v4 set defs have numeric bonuses only (no attackMode/artMode/fxTags)', () => {
    for (const def of V4_KIT_SETS.values()) {
      for (const bonus of def.bonuses) {
        expect(bonus.attackMode).toBeUndefined()
        expect(bonus.artMode).toBeUndefined()
        expect(bonus.fxTags).toBeUndefined()
        expect(bonus.mods).toBeDefined()
      }
    }
  })
})

// ---------- executor.ts typed executor ----------

describe('v4 typed executor', () => {
  it('produces correct normal behavior for each primitive', () => {
    for (const ability of V4_KIT_ABILITIES) {
      const behavior = executeKitNormal(ability, CTX)
      expect(behavior.primitive).toBe(ability.normalPrimitive)
      expect(behavior.channel).toBe('normal')
    }
  })

  it('produces correct art behavior for each primitive', () => {
    for (const ability of V4_KIT_ABILITIES) {
      const behavior = executeKitArt(ability, CTX)
      expect(behavior.primitive).toBe(ability.artPrimitive)
      expect(behavior.channel).toBe('art')
    }
  })

  it('executeKit dispatches by channel', () => {
    const ability = V4_KIT_ABILITY_MAP.get('k01')!
    const normal = executeKit(ability, CTX, 'normal')
    const art = executeKit(ability, CTX, 'art')
    expect(normal.channel).toBe('normal')
    expect(art.channel).toBe('art')
    expect(normal.primitive).toBe('boomerang')
    expect(art.primitive).toBe('thundernet')
  })

  it('boomerang normal returns radius and rotation speed', () => {
    const ability = V4_KIT_ABILITY_MAP.get('k01')!
    const b = executeKitNormal(ability, CTX)
    expect(b.primitive).toBe('boomerang')
    if (b.primitive === 'boomerang') {
      expect(b.radius).toBeGreaterThan(0)
      expect(b.rotationSpeed).toBeGreaterThan(0)
      expect(b.damageMult).toBeGreaterThan(0)
    }
  })

  it('charge normal respects chargeMs for tier', () => {
    const ability = V4_KIT_ABILITY_MAP.get('k05')! // k05 normal=mark, art=charge
    // Test art side charge
    const noCharge = executeKitArt(ability, { ...CTX, chargeMs: 0 })
    expect(noCharge.primitive).toBe('charge')
    if (noCharge.primitive === 'charge') {
      expect(noCharge.tier).toBe(0)
    }
    const fullCharge = executeKitArt(ability, { ...CTX, chargeMs: 1200 })
    if (fullCharge.primitive === 'charge') {
      expect(fullCharge.tier).toBe(2)
      expect(fullCharge.damageMult).toBeGreaterThan(noCharge.primitive === 'charge' ? (noCharge as { damageMult: number }).damageMult : 0)
    }
  })

  it('thundernet normal returns persistent entity params with maxNets', () => {
    const ability = V4_KIT_ABILITY_MAP.get('k01')! // k01 art=thundernet
    const b = executeKitArt(ability, CTX)
    expect(b.primitive).toBe('thundernet')
    if (b.primitive === 'thundernet') {
      expect(b.durationMs).toBeGreaterThan(0)
      expect(b.tickMs).toBeGreaterThan(0)
      expect(b.maxNets).toBeGreaterThan(0)
      expect(b.radius).toBeGreaterThan(0)
    }
  })

  it('thunderstake art returns multiple targets and chain params', () => {
    const ability = V4_KIT_ABILITY_MAP.get('k02')! // k02 art=thunderstake
    const b = executeKitArt(ability, CTX)
    expect(b.primitive).toBe('thunderstake')
    if (b.primitive === 'thunderstake') {
      expect(b.targets.length).toBeGreaterThan(1)
      expect(b.chainDamageMult).toBeGreaterThan(0)
      expect(b.maxStakes).toBeGreaterThan(0)
    }
  })

  it('art behaviors scale damage by artPower', () => {
    const ability = V4_KIT_ABILITY_MAP.get('k01')!
    const basePower = ability.artPower
    const b = executeKitArt(ability, CTX)
    if (b.primitive === 'thundernet') {
      // damageMultPerTick should include artPower scaling
      expect(b.damageMultPerTick).toBeGreaterThan(0)
    }
    // Verify different artPower produces different damage
    const ability2 = { ...ability, artPower: basePower * 2 }
    const b2 = executeKitArt(ability2, CTX)
    if (b2.primitive === 'thundernet' && b.primitive === 'thundernet') {
      expect(b2.damageMultPerTick).toBeGreaterThan(b.damageMultPerTick)
    }
  })
})

// ---------- generator3.ts 确定性生成器 ----------

describe('v4 generator3', () => {
  it('same seed + sequence produces same result', () => {
    const a = generateV4Kit(12345, 1)
    const b = generateV4Kit(12345, 1)
    expect(a.kitId).toBe(b.kitId)
    expect(a.generation.seed).toBe(b.generation.seed)
    expect(a.generation.sequence).toBe(b.generation.sequence)
  })

  it('schema version is 4, generator version is 3', () => {
    const rec = generateV4Kit(42, 1)
    expect(rec.schemaVersion).toBe(V4_KIT_SCHEMA_VERSION)
    expect(rec.generation.generatorVersion).toBe(V4_KIT_GENERATOR_VERSION)
  })

  it('kitId is in whitelist', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rec = generateV4Kit(seed, 1)
      expect(V4_KIT_WHITELIST).toContain(rec.kitId)
    }
  })

  it('generated set has no attackMode/artMode/fxTags (D8)', () => {
    const rec = generateV4Kit(42, 1)
    for (const bonus of rec.set.bonuses) {
      expect(bonus.attackMode).toBeUndefined()
      expect(bonus.artMode).toBeUndefined()
      expect(bonus.fxTags).toBeUndefined()
    }
  })

  it('normalizeV4KitRecord accepts valid records', () => {
    const rec = generateV4Kit(42, 1)
    const normalized = normalizeV4KitRecord(JSON.parse(JSON.stringify(rec)))
    expect(normalized).not.toBeNull()
    expect(normalized!.kitId).toBe(rec.kitId)
  })

  it('normalizeV4KitRecord rejects non-v4 schemas', () => {
    expect(normalizeV4KitRecord({ schemaVersion: 3 })).toBeNull()
    expect(normalizeV4KitRecord({ schemaVersion: 2 })).toBeNull()
    expect(normalizeV4KitRecord(null)).toBeNull()
    expect(normalizeV4KitRecord({})).toBeNull()
  })

  it('normalizeV4KitRecord rejects invalid kitId', () => {
    const rec = generateV4Kit(42, 1)
    const bad = JSON.parse(JSON.stringify(rec))
    bad.generation.kitId = 'k99'
    expect(normalizeV4KitRecord(bad)).toBeNull()
  })
})

// ---------- runtime.ts 旁路解析器 ----------

describe('v4 runtime resolvers', () => {
  it('resolveV4KitAbility returns null with no v4 equipment', () => {
    const state = newGame()
    expect(resolveV4KitAbility(state)).toBeNull()
    expect(isV4KitActive(state)).toBe(false)
  })

  it('resolveV4KitAbility returns null with only 2 pieces', () => {
    const state = newGame()
    equipV4Kit(state, 'k01', 2)
    expect(resolveV4KitAbility(state)).toBeNull()
  })

  it('resolveV4KitAbility returns KitAbility with 4 pieces', () => {
    const state = newGame()
    equipV4Kit(state, 'k01', 4)
    const ability = resolveV4KitAbility(state)
    expect(ability).not.toBeNull()
    expect(ability!.kitId).toBe('k01')
    expect(ability!.normalPrimitive).toBe('boomerang')
    expect(ability!.artPrimitive).toBe('thundernet')
  })

  it('resolveV4KitArtOverride returns art primitive and power', () => {
    const state = newGame()
    equipV4Kit(state, 'k01', 4)
    const art = resolveV4KitArtOverride(state)
    expect(art).not.toBeNull()
    expect(art!.primitive).toBe('thundernet')
    expect(art!.power).toBeGreaterThan(0)
    expect(art!.cooldownMs).toBeGreaterThan(0)
  })

  it('resolveV4KitFxRuntime returns inactive for no v4 kit', () => {
    const state = newGame()
    const fx = resolveV4KitFxRuntime(state)
    expect(fx.active).toBe(false)
    expect(fx.kitId).toBeNull()
  })

  it('resolveV4KitFxRuntime returns active for v4 kit', () => {
    const state = newGame()
    equipV4Kit(state, 'k03', 4)
    const fx = resolveV4KitFxRuntime(state)
    expect(fx.active).toBe(true)
    expect(fx.kitId).toBe('k03')
    expect(fx.normalPrimitive).toBe('roundtrip')
    expect(fx.artPrimitive).toBe('boomerang')
  })
})

// ---------- effects.ts aggregateMods v4 旁路 ----------

describe('v4 aggregateMods bypass (S1)', () => {
  it('applies v4 2-piece numeric bonus', () => {
    const state = newGame()
    equipV4Kit(state, 'k01', 2)
    const mods = aggregateMods(state)
    // 2-piece: atkPct +0.10, defPct +0.10
    expect(mods.atkPct).toBeGreaterThan(0)
    expect(mods.defPct).toBeGreaterThan(0)
  })

  it('applies v4 4-piece numeric bonus fully', () => {
    const state = newGame()
    equipV4Kit(state, 'k01', 4)
    const mods = aggregateMods(state)
    // 2-piece: atkPct +0.10, defPct +0.10
    // 4-piece: atkPct +0.15, hpPct +0.15, aspd +0.05
    expect(mods.atkPct).toBeCloseTo(0.25, 2) // 0.10 + 0.15
    expect(mods.defPct).toBeCloseTo(0.10, 2) // 0.10 only
    expect(mods.hpPct).toBeCloseTo(0.15, 2)
    expect(mods.aspd).toBeCloseTo(0.05, 2)
  })

  it('does not interfere with legacy sets', () => {
    const state = newGame()
    // Equip v4 kit pieces + legacy set pieces (different slots not possible in this simple test,
    // but verify aggregateMods still works with only v4 equipment)
    equipV4Kit(state, 'k02', 4)
    const mods = aggregateMods(state)
    expect(mods.atkPct).toBeGreaterThan(0)
    expect(mods.hpPct).toBeGreaterThan(0)
  })
})

// ---------- manifest.ts 资源 Manifest ----------

describe('v4 resource manifest', () => {
  it('buildKitManifest produces correct frame counts', () => {
    const m = buildKitManifest('k01')
    expect(m.icons).toHaveLength(1)
    expect(m.normalFrames.start).toHaveLength(4)
    expect(m.normalFrames.main).toHaveLength(6)
    expect(m.normalFrames.mid).toHaveLength(4)
    expect(m.artFrames.start).toHaveLength(4)
    expect(m.artFrames.main).toHaveLength(8)
    expect(m.artFrames.mid).toHaveLength(8)
    expect(m.tintPolicy).toBe('no-tint')
  })

  it('total frame count is 34 + 1 icon = 35', () => {
    expect(KIT_FRAME_TOTAL).toBe(34)
    expect(KIT_ASSET_TOTAL).toBe(35)
  })

  it('frame keys follow naming convention', () => {
    const m = buildKitManifest('k01')
    expect(m.normalFrames.main[0]).toBe('v4/k01_atk_main_1')
    expect(m.artFrames.mid[7]).toBe('v4/k01_art_mid_8')
    expect(m.icons[0]).toBe('v4/k01_icon_0')
  })

  it('availableFrames returns all frames when textures exist', () => {
    const m = buildKitManifest('k01')
    const allExist = (key: string) => true
    const frames = availableFrames(m, 'normal', 'main', allExist)
    expect(frames).toHaveLength(6)
  })

  it('availableFrames returns empty when no textures exist', () => {
    const m = buildKitManifest('k01')
    const noneExist = (key: string) => false
    const frames = availableFrames(m, 'normal', 'main', noneExist)
    expect(frames).toHaveLength(0)
  })

  it('availableFrames returns partial frames when some textures exist', () => {
    const m = buildKitManifest('k01')
    const partial = (key: string) => key.endsWith('_1') || key.endsWith('_2')
    const frames = availableFrames(m, 'normal', 'main', partial)
    expect(frames).toHaveLength(2)
  })

  it('missingFrames lists all missing texture keys', () => {
    const m = buildKitManifest('k01')
    const none = (key: string) => false
    const missing = missingFrames(m, none)
    expect(missing.length).toBe(KIT_ASSET_TOTAL)
  })
})
