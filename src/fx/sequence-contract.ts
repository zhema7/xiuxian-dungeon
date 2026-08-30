// ---------- 序列帧资源包注册与动画播放契约 ----------
// 资源包完整性只决定一组动画能否注册；运行时播放只检查目标动画实际引用的帧。

export interface RegisteredSequenceAnimationPlaybackProbe {
  readonly animationRegistered: boolean
  readonly textureExists: (textureKey: string) => boolean
}

export interface SequenceAnimationPlaybackContract {
  /** Exact texture keys consumed while this animation plays; never animation keys. */
  readonly requiredTextureKeysForPlayback: readonly string[]
}

export interface SequenceAnimationPlaybackFrameRangeContract extends SequenceAnimationPlaybackContract {
  /** Auditable 1-based frame range for a single frame-prefix animation segment. */
  readonly framePrefix: string
  readonly firstFrame: number
  readonly lastFrame: number
}

const numberedTextureKeys = (framePrefix: string, firstFrame: number, lastFrame: number): readonly string[] =>
  Array.from({ length: lastFrame - firstFrame + 1 }, (_, index) => `${framePrefix}_${firstFrame + index}`)

const playbackFrameRange = (
  framePrefix: string,
  firstFrame: number,
  lastFrame: number,
): SequenceAnimationPlaybackFrameRangeContract => ({
  framePrefix,
  firstFrame,
  lastFrame,
  requiredTextureKeysForPlayback: numberedTextureKeys(framePrefix, firstFrame, lastFrame),
})

/**
 * Runtime playback contracts. These lists intentionally model each animation's
 * actual frames rather than the larger source bundle used during registration.
 */
export const SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS = {
  slash_anim: playbackFrameRange('slash', 1, 6),
  sword_proj_fly: playbackFrameRange('sword_proj', 1, 4),
  sword_proj_loop: playbackFrameRange('sword_proj', 3, 4),
  sword_proj_hit: playbackFrameRange('sword_proj', 5, 8),
  mod_blade: playbackFrameRange('mod_blade', 1, 6),
  mod_burst: playbackFrameRange('mod_burst', 1, 6),
  mod_charge: playbackFrameRange('mod_charge', 1, 4),
  mod_field: playbackFrameRange('mod_field', 1, 6),
  mod_hit: playbackFrameRange('mod_hit', 1, 4),
  mod_rune: playbackFrameRange('mod_rune', 1, 4),
  fx_ring: playbackFrameRange('fx_ring', 1, 8),
  fx_splash: playbackFrameRange('fx_splash', 1, 8),
  fx_spark: playbackFrameRange('fx_spark', 1, 6),
  bolt_fly: playbackFrameRange('bolt_fly', 1, 8),
  proj_fly: playbackFrameRange('proj_fly', 1, 8),
  // ---- Tier3 新增招式贴图（10种）----
  fx_shadow: playbackFrameRange('fx_shadow', 1, 6),
  fx_chain: playbackFrameRange('fx_chain', 1, 6),
  fx_wind: playbackFrameRange('fx_wind', 1, 6),
  fx_spike: playbackFrameRange('fx_spike', 1, 6),
  fx_scythe: playbackFrameRange('fx_scythe', 1, 6),
  fx_star: playbackFrameRange('fx_star', 1, 6),
  fx_claw: playbackFrameRange('fx_claw', 1, 6),
  fx_light: playbackFrameRange('fx_light', 1, 4),
  fx_soul: playbackFrameRange('fx_soul', 1, 6),
  fx_crystal: playbackFrameRange('fx_crystal', 1, 6),
  // ---- Tier3 新增神通贴图（10种）----
  fx_meteor: playbackFrameRange('fx_meteor', 1, 8),
  fx_void: playbackFrameRange('fx_void', 1, 6),
  fx_blood: playbackFrameRange('fx_blood', 1, 6),
  fx_pillar: playbackFrameRange('fx_pillar', 1, 6),
  fx_frozen: playbackFrameRange('fx_frozen', 1, 6),
  fx_vortex: playbackFrameRange('fx_vortex', 1, 8),
  fx_orbit: playbackFrameRange('fx_orbit', 1, 8),
  fx_poison: playbackFrameRange('fx_poison', 1, 6),
  fx_gravity: playbackFrameRange('fx_gravity', 1, 6),
  fx_phoenix: playbackFrameRange('fx_phoenix', 1, 8),
} as const satisfies Record<string, SequenceAnimationPlaybackFrameRangeContract>

export type SequenceAnimationKey = keyof typeof SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS

export interface SequenceResourceBundleRegistrationContract {
  /** All textures that must exist before BootScene registers this bundle's animations. */
  readonly requiredTextureKeysForRegistration: readonly string[]
  /** Animation keys BootScene may register only after the complete bundle is available. */
  readonly animationKeys: readonly SequenceAnimationKey[]
}

/**
 * Registration contracts are deliberately separate from playback contracts.
 * `sword_proj_1..8` is one atomic registration bundle for its three animations,
 * even though fly, loop, and hit each consume only a subset at runtime.
 */
export const SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS = {
  sword_proj: {
    requiredTextureKeysForRegistration: numberedTextureKeys('sword_proj', 1, 8),
    animationKeys: ['sword_proj_fly', 'sword_proj_loop', 'sword_proj_hit'],
  },
  slash: {
    requiredTextureKeysForRegistration: numberedTextureKeys('slash', 1, 6),
    animationKeys: ['slash_anim'],
  },
  mod_blade: {
    requiredTextureKeysForRegistration: numberedTextureKeys('mod_blade', 1, 6),
    animationKeys: ['mod_blade'],
  },
  mod_burst: {
    requiredTextureKeysForRegistration: numberedTextureKeys('mod_burst', 1, 6),
    animationKeys: ['mod_burst'],
  },
  mod_charge: {
    requiredTextureKeysForRegistration: numberedTextureKeys('mod_charge', 1, 4),
    animationKeys: ['mod_charge'],
  },
  mod_field: {
    requiredTextureKeysForRegistration: numberedTextureKeys('mod_field', 1, 6),
    animationKeys: ['mod_field'],
  },
  mod_hit: {
    requiredTextureKeysForRegistration: numberedTextureKeys('mod_hit', 1, 4),
    animationKeys: ['mod_hit'],
  },
  mod_rune: {
    requiredTextureKeysForRegistration: numberedTextureKeys('mod_rune', 1, 4),
    animationKeys: ['mod_rune'],
  },
  fx_ring: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_ring', 1, 8),
    animationKeys: ['fx_ring'],
  },
  fx_splash: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_splash', 1, 8),
    animationKeys: ['fx_splash'],
  },
  fx_spark: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_spark', 1, 6),
    animationKeys: ['fx_spark'],
  },
  bolt_fly: {
    requiredTextureKeysForRegistration: numberedTextureKeys('bolt_fly', 1, 8),
    animationKeys: ['bolt_fly'],
  },
  proj_fly: {
    requiredTextureKeysForRegistration: numberedTextureKeys('proj_fly', 1, 8),
    animationKeys: ['proj_fly'],
  },
  // ---- Tier3 新增招式贴图（10种）----
  fx_shadow: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_shadow', 1, 6),
    animationKeys: ['fx_shadow'],
  },
  fx_chain: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_chain', 1, 6),
    animationKeys: ['fx_chain'],
  },
  fx_wind: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_wind', 1, 6),
    animationKeys: ['fx_wind'],
  },
  fx_spike: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_spike', 1, 6),
    animationKeys: ['fx_spike'],
  },
  fx_scythe: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_scythe', 1, 6),
    animationKeys: ['fx_scythe'],
  },
  fx_star: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_star', 1, 6),
    animationKeys: ['fx_star'],
  },
  fx_claw: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_claw', 1, 6),
    animationKeys: ['fx_claw'],
  },
  fx_light: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_light', 1, 4),
    animationKeys: ['fx_light'],
  },
  fx_soul: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_soul', 1, 6),
    animationKeys: ['fx_soul'],
  },
  fx_crystal: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_crystal', 1, 6),
    animationKeys: ['fx_crystal'],
  },
  // ---- Tier3 新增神通贴图（10种）----
  fx_meteor: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_meteor', 1, 8),
    animationKeys: ['fx_meteor'],
  },
  fx_void: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_void', 1, 6),
    animationKeys: ['fx_void'],
  },
  fx_blood: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_blood', 1, 6),
    animationKeys: ['fx_blood'],
  },
  fx_pillar: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_pillar', 1, 6),
    animationKeys: ['fx_pillar'],
  },
  fx_frozen: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_frozen', 1, 6),
    animationKeys: ['fx_frozen'],
  },
  fx_vortex: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_vortex', 1, 8),
    animationKeys: ['fx_vortex'],
  },
  fx_orbit: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_orbit', 1, 8),
    animationKeys: ['fx_orbit'],
  },
  fx_poison: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_poison', 1, 6),
    animationKeys: ['fx_poison'],
  },
  fx_gravity: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_gravity', 1, 6),
    animationKeys: ['fx_gravity'],
  },
  fx_phoenix: {
    requiredTextureKeysForRegistration: numberedTextureKeys('fx_phoenix', 1, 8),
    animationKeys: ['fx_phoenix'],
  },
} as const satisfies Record<string, SequenceResourceBundleRegistrationContract>

export type SequenceResourceBundleRegistrationKey = keyof typeof SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS

/** BootScene uses this only before registering a bundle's animation group. */
export function hasCompleteSequenceResourceBundleForRegistration(
  resourceBundleKey: SequenceResourceBundleRegistrationKey,
  textureExists: (textureKey: string) => boolean,
): boolean {
  return SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS[resourceBundleKey]
    .requiredTextureKeysForRegistration
    .every(textureExists)
}

/**
 * Pure registration adapter: an incomplete resource bundle registers none of
 * its animations, while a complete bundle authorizes precisely its declared keys.
 */
export function sequenceAnimationKeysForCompleteResourceBundleRegistration(
  resourceBundleKey: SequenceResourceBundleRegistrationKey,
  textureExists: (textureKey: string) => boolean,
): readonly SequenceAnimationKey[] {
  return hasCompleteSequenceResourceBundleForRegistration(resourceBundleKey, textureExists)
    ? SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS[resourceBundleKey].animationKeys
    : []
}

/**
 * Runtime route guard. Registration of the requested animation and every frame
 * it actually plays are both required; an animation key is never resource proof.
 */
export function hasRegisteredSequenceAnimationPlayback(
  animationKey: SequenceAnimationKey,
  probe: RegisteredSequenceAnimationPlaybackProbe,
): boolean {
  return probe.animationRegistered
    && SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS[animationKey]
      .requiredTextureKeysForPlayback
      .every(probe.textureExists)
}
