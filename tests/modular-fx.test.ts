import { describe, expect, it } from 'vitest'
import { ARRAY_MINE_LIFETIME, ARRAY_MINE_MAX, ARRAY_MINE_TRIGGER_RADIUS, DELAYED_BURST_DELAY, DELAYED_BURST_RADIUS, DELAYED_BURST_TINT, FIRE_BURST_RADIUS, FIRE_BURST_TINT, SWORD_SPLIT_ANGLE, SWORD_SPLIT_DAMAGE, arrayMineExpired, arrayMineParams, createArrayMineEyes, delayedBurstParams, fireBurstParams, modularAnimationKey, swordSplitParams, triggerArrayMineEye, type ModularKind } from '../src/fx/modularFx'

const MODULAR_KINDS: ModularKind[] = ['rune', 'blade', 'burst', 'charge', 'field', 'hit']

describe('modular animation keys', () => {
  it('maps every modular kind to the registered unsuffixed animation key', () => {
    expect(MODULAR_KINDS.map((kind) => modularAnimationKey(kind))).toEqual(['mod_rune', 'mod_blade', 'mod_burst', 'mod_charge', 'mod_field', 'mod_hit'])
  })
})

describe('modular sword split', () => {
  it('emits two symmetric child angles and scaled power', () => {
    const out = swordSplitParams(1, 100)
    expect(out).toHaveLength(2)
    expect(out[0].angle).toBeCloseTo(1 - SWORD_SPLIT_ANGLE)
    expect(out[1].angle).toBeCloseTo(1 + SWORD_SPLIT_ANGLE)
    expect(out[0].power).toBeCloseTo(100 * SWORD_SPLIT_DAMAGE)
    expect(out.every((x) => x.recursive === false)).toBe(true)
  })

describe('delayed modular burst', () => {
  it('disabled burst is inert', () => {
    expect(delayedBurstParams(false)).toEqual({ enabled: false, delay: DELAYED_BURST_DELAY, tint: DELAYED_BURST_TINT, radius: DELAYED_BURST_RADIUS, once: true, recursive: false })
  })
  it('uses bounded delay and purple tint', () => {
    const p = delayedBurstParams(true)
    expect(p.delay).toBeGreaterThanOrEqual(300)
    expect(p.delay).toBeLessThanOrEqual(500)
    expect(p.tint).toBe(DELAYED_BURST_TINT)
    expect(p.radius).toBe(DELAYED_BURST_RADIUS)
    expect(p.once).toBe(true)
    expect(p.recursive).toBe(false)
  })
})
  it('supports explicit disabled configuration', () => {
    expect(swordSplitParams(0, 10, false)).toEqual([])
  })

describe('delayed modular burst', () => {
  it('disabled burst is inert', () => {
    expect(delayedBurstParams(false)).toEqual({ enabled: false, delay: DELAYED_BURST_DELAY, tint: DELAYED_BURST_TINT, radius: DELAYED_BURST_RADIUS, once: true, recursive: false })
  })
  it('uses bounded delay and purple tint', () => {
    const p = delayedBurstParams(true)
    expect(p.delay).toBeGreaterThanOrEqual(300)
    expect(p.delay).toBeLessThanOrEqual(500)
    expect(p.tint).toBe(DELAYED_BURST_TINT)
    expect(p.radius).toBe(DELAYED_BURST_RADIUS)
    expect(p.once).toBe(true)
    expect(p.recursive).toBe(false)
  })
})
})

describe('delayed modular burst', () => {
  it('disabled burst is inert', () => {
    expect(delayedBurstParams(false)).toEqual({ enabled: false, delay: DELAYED_BURST_DELAY, tint: DELAYED_BURST_TINT, radius: DELAYED_BURST_RADIUS, once: true, recursive: false })
  })
  it('uses bounded delay and purple tint', () => {
    const p = delayedBurstParams(true)
    expect(p.delay).toBeGreaterThanOrEqual(300)
    expect(p.delay).toBeLessThanOrEqual(500)
    expect(p.tint).toBe(DELAYED_BURST_TINT)
    expect(p.radius).toBe(DELAYED_BURST_RADIUS)
    expect(p.once).toBe(true)
    expect(p.recursive).toBe(false)
  })
})

describe('modular fire burst', () => {
  it('disabled burst is inert and non-recursive', () => {
    expect(fireBurstParams(false)).toEqual({ enabled: false, tint: FIRE_BURST_TINT, radius: FIRE_BURST_RADIUS, once: true, recursive: false })

describe('delayed modular burst', () => {
  it('disabled burst is inert', () => {
    expect(delayedBurstParams(false)).toEqual({ enabled: false, delay: DELAYED_BURST_DELAY, tint: DELAYED_BURST_TINT, radius: DELAYED_BURST_RADIUS, once: true, recursive: false })
  })
  it('uses bounded delay and purple tint', () => {
    const p = delayedBurstParams(true)
    expect(p.delay).toBeGreaterThanOrEqual(300)
    expect(p.delay).toBeLessThanOrEqual(500)
    expect(p.tint).toBe(DELAYED_BURST_TINT)
    expect(p.radius).toBe(DELAYED_BURST_RADIUS)
    expect(p.once).toBe(true)
    expect(p.recursive).toBe(false)
  })
})
  })

describe('delayed modular burst', () => {
  it('disabled burst is inert', () => {
    expect(delayedBurstParams(false)).toEqual({ enabled: false, delay: DELAYED_BURST_DELAY, tint: DELAYED_BURST_TINT, radius: DELAYED_BURST_RADIUS, once: true, recursive: false })
  })
  it('uses bounded delay and purple tint', () => {
    const p = delayedBurstParams(true)
    expect(p.delay).toBeGreaterThanOrEqual(300)
    expect(p.delay).toBeLessThanOrEqual(500)
    expect(p.tint).toBe(DELAYED_BURST_TINT)
    expect(p.radius).toBe(DELAYED_BURST_RADIUS)
    expect(p.once).toBe(true)
    expect(p.recursive).toBe(false)
  })
})
  it('uses fire-orange tint and configured radius when enabled', () => {
    expect(fireBurstParams(true)).toEqual({ enabled: true, tint: 0xe67e22, radius: 42, once: true, recursive: false })

describe('delayed modular burst', () => {
  it('disabled burst is inert', () => {
    expect(delayedBurstParams(false)).toEqual({ enabled: false, delay: DELAYED_BURST_DELAY, tint: DELAYED_BURST_TINT, radius: DELAYED_BURST_RADIUS, once: true, recursive: false })
  })
  it('uses bounded delay and purple tint', () => {
    const p = delayedBurstParams(true)
    expect(p.delay).toBeGreaterThanOrEqual(300)
    expect(p.delay).toBeLessThanOrEqual(500)
    expect(p.tint).toBe(DELAYED_BURST_TINT)
    expect(p.radius).toBe(DELAYED_BURST_RADIUS)
    expect(p.once).toBe(true)
    expect(p.recursive).toBe(false)
  })
})
  })

describe('delayed modular burst', () => {
  it('disabled burst is inert', () => {
    expect(delayedBurstParams(false)).toEqual({ enabled: false, delay: DELAYED_BURST_DELAY, tint: DELAYED_BURST_TINT, radius: DELAYED_BURST_RADIUS, once: true, recursive: false })
  })
  it('uses bounded delay and purple tint', () => {
    const p = delayedBurstParams(true)
    expect(p.delay).toBeGreaterThanOrEqual(300)
    expect(p.delay).toBeLessThanOrEqual(500)
    expect(p.tint).toBe(DELAYED_BURST_TINT)
    expect(p.radius).toBe(DELAYED_BURST_RADIUS)
    expect(p.once).toBe(true)
    expect(p.recursive).toBe(false)
  })
})
})

describe('delayed modular burst', () => {
  it('disabled burst is inert', () => {
    expect(delayedBurstParams(false)).toEqual({ enabled: false, delay: DELAYED_BURST_DELAY, tint: DELAYED_BURST_TINT, radius: DELAYED_BURST_RADIUS, once: true, recursive: false })
  })
  it('uses bounded delay and purple tint', () => {
    const p = delayedBurstParams(true)
    expect(p.delay).toBeGreaterThanOrEqual(300)
    expect(p.delay).toBeLessThanOrEqual(500)
    expect(p.tint).toBe(DELAYED_BURST_TINT)
    expect(p.radius).toBe(DELAYED_BURST_RADIUS)
    expect(p.once).toBe(true)
    expect(p.recursive).toBe(false)
  })
})


describe('array mine pure logic', () => {
  it('defaults to disabled with bounded configuration', () => {
    expect(arrayMineParams()).toEqual({ enabled: false, maxMines: ARRAY_MINE_MAX, lifetime: ARRAY_MINE_LIFETIME, triggerRadius: ARRAY_MINE_TRIGGER_RADIUS })
  })
  it('is inert when disabled and caps eyes at three', () => {
    expect(createArrayMineEyes(false, [{ x: 1, y: 2 }])).toEqual([])
    const eyes = createArrayMineEyes(true, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }])
    expect(eyes).toHaveLength(ARRAY_MINE_MAX)
    expect(eyes.every((eye) => eye.triggered === false)).toBe(true)
  })
  it('triggers once only inside configured radius', () => {
    const eye = createArrayMineEyes(true, [{ x: 0, y: 0 }])[0]
    expect(triggerArrayMineEye(eye, ARRAY_MINE_TRIGGER_RADIUS - 1, 0)).toBe(true)
    expect(triggerArrayMineEye(eye, 0, 0)).toBe(false)
    const outside = createArrayMineEyes(true, [{ x: 0, y: 0 }])[0]
    expect(triggerArrayMineEye(outside, ARRAY_MINE_TRIGGER_RADIUS + 1, 0)).toBe(false)
  })
  it('expires exactly at lifetime boundary', () => {
    expect(arrayMineExpired(100, 100 + ARRAY_MINE_LIFETIME - 1)).toBe(false)
    expect(arrayMineExpired(100, 100 + ARRAY_MINE_LIFETIME)).toBe(true)
  })
})
