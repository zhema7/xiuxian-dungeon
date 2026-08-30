import { describe, expect, it } from 'vitest'
import { safePaletteV1Overlay } from '../src/palette-v1'
import {
  SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS,
  SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS,
  hasCompleteSequenceResourceBundleForRegistration,
  hasRegisteredSequenceAnimationPlayback,
  sequenceAnimationKeysForCompleteResourceBundleRegistration,
  type SequenceAnimationKey,
} from '../src/fx/sequence-contract'

const numberedTextureKeys = (prefix: string, count: number, start = 1) =>
  Array.from({ length: count }, (_, index) => `${prefix}_${start + index}`)

const sequenceProbe = (textureKeys: readonly string[], animationRegistered = true) => {
  const available = new Set(textureKeys)
  return {
    animationRegistered,
    textureExists: (key: string) => available.has(key),
  }
}

describe('Palette V1 sequence registration and playback contracts', () => {
  it('requires the complete sword resource bundle before registering any split sword animation', () => {
    const bundle = SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS.sword_proj
    const registrationPlan = (textureExists: (key: string) => boolean) =>
      sequenceAnimationKeysForCompleteResourceBundleRegistration('sword_proj', textureExists)

    expect(bundle.requiredTextureKeysForRegistration).toEqual(numberedTextureKeys('sword_proj', 8))
    expect(bundle.animationKeys).toEqual(['sword_proj_fly', 'sword_proj_loop', 'sword_proj_hit'])
    expect(registrationPlan(() => true)).toEqual(bundle.animationKeys)
    expect(bundle.animationKeys.map((animationKey) => SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS[animationKey].requiredTextureKeysForPlayback)).toEqual([
      numberedTextureKeys('sword_proj', 4),
      numberedTextureKeys('sword_proj', 2, 3),
      numberedTextureKeys('sword_proj', 4, 5),
    ])

    for (const missingTexture of bundle.requiredTextureKeysForRegistration) {
      expect(registrationPlan((key) => key !== missingTexture)).toEqual([])
    }
  })

  it('checks each sword animation against its actual playback frames instead of the registration bundle', () => {
    expect(hasCompleteSequenceResourceBundleForRegistration('sword_proj', () => true)).toBe(true)

    const checkedFlyTextures: string[] = []
    expect(hasRegisteredSequenceAnimationPlayback('sword_proj_fly', {
      animationRegistered: true,
      textureExists: (key) => {
        checkedFlyTextures.push(key)
        return true
      },
    })).toBe(true)
    expect(checkedFlyTextures).toEqual(numberedTextureKeys('sword_proj', 4))
    expect(checkedFlyTextures).not.toContain('sword_proj_fly')
    expect(SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS.sword_proj_fly).toMatchObject({ framePrefix: 'sword_proj', firstFrame: 1, lastFrame: 4 })
    expect(SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS.sword_proj_loop).toMatchObject({ framePrefix: 'sword_proj', firstFrame: 3, lastFrame: 4 })
    expect(SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS.sword_proj_hit).toMatchObject({ framePrefix: 'sword_proj', firstFrame: 5, lastFrame: 8 })

    expect(hasRegisteredSequenceAnimationPlayback('sword_proj_loop', sequenceProbe(['sword_proj_3', 'sword_proj_4']))).toBe(true)
    expect(hasRegisteredSequenceAnimationPlayback('sword_proj_hit', sequenceProbe(numberedTextureKeys('sword_proj', 4, 5)))).toBe(true)
    expect(hasRegisteredSequenceAnimationPlayback('sword_proj_fly', sequenceProbe(numberedTextureKeys('sword_proj', 4), false))).toBe(false)
  })

  it('degrades only sword animations whose real playback frame is missing', () => {
    const swordAnimations = SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS.sword_proj.animationKeys
    const expectedUsableAnimationsByMissingFrame: Record<number, readonly SequenceAnimationKey[]> = {
      1: ['sword_proj_loop', 'sword_proj_hit'],
      2: ['sword_proj_loop', 'sword_proj_hit'],
      3: ['sword_proj_hit'],
      4: ['sword_proj_hit'],
      5: ['sword_proj_fly', 'sword_proj_loop'],
      6: ['sword_proj_fly', 'sword_proj_loop'],
      7: ['sword_proj_fly', 'sword_proj_loop'],
      8: ['sword_proj_fly', 'sword_proj_loop'],
    }

    for (const missingFrame of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const usableAnimations = swordAnimations.filter((animationKey) =>
        hasRegisteredSequenceAnimationPlayback(animationKey, sequenceProbe(
          numberedTextureKeys('sword_proj', 8).filter((key) => key !== `sword_proj_${missingFrame}`),
        )),
      )
      expect(usableAnimations).toEqual(expectedUsableAnimationsByMissingFrame[missingFrame])
    }
  })

  it('keeps slash and single-segment modular, fx, bolt, and projectile paths fully guarded', () => {
    const singleSegmentCases: readonly (readonly [SequenceAnimationKey, string, number])[] = [
      ['slash_anim', 'slash', 6],
      ['mod_blade', 'mod_blade', 6],
      ['mod_burst', 'mod_burst', 6],
      ['mod_charge', 'mod_charge', 4],
      ['mod_field', 'mod_field', 6],
      ['mod_hit', 'mod_hit', 4],
      ['mod_rune', 'mod_rune', 4],
      ['fx_ring', 'fx_ring', 8],
      ['fx_splash', 'fx_splash', 8],
      ['fx_spark', 'fx_spark', 6],
      ['bolt_fly', 'bolt_fly', 8],
      ['proj_fly', 'proj_fly', 8],
    ]

    for (const [animationKey, prefix, frameCount] of singleSegmentCases) {
      const playbackTextures = numberedTextureKeys(prefix, frameCount)
      expect(SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS[animationKey].requiredTextureKeysForPlayback).toEqual(playbackTextures)
      expect(hasRegisteredSequenceAnimationPlayback(animationKey, sequenceProbe(playbackTextures))).toBe(true)
      expect(hasRegisteredSequenceAnimationPlayback(animationKey, sequenceProbe(playbackTextures.slice(0, -1)))).toBe(false)
    }
  })
})

describe('Palette V1 overlay safety', () => {
  it('uses a non-obscuring Graphics overlay only when a dynamic palette exists', () => {
    expect(safePaletteV1Overlay(undefined, 'impact')).toBeUndefined()
    expect(safePaletteV1Overlay({
      algorithmVersion: 'palette-v1',
      identity: { setId: 'set_dy1', profileId: 'profile', transformId: 'profile-1', theme: '青元' },
      identityKey: 'palette-v1|set_dy1|profile|profile-1|青元',
      primary: 0x2f8fdb,
      highlight: 0xa8ddff,
      darkOutline: 0x123c67,
    }, 'impact')).toMatchObject({
      stroke: 0x123c67,
      fill: 0x2f8fdb,
      alpha: expect.any(Number),
      radius: expect.any(Number),
    })
  })
})
