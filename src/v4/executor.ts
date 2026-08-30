// ---------- v4 Typed Executor（ADR §3：以 KitPrimitive 为判别联合，纯函数无 Phaser） ----------
// executor 输入 KitAbility + 战斗上下文 → 输出行为描述（KitBehaviorRequest）
// 场景适配层（DungeonScene v4 分支）读取行为描述落地为 Phaser 对象
// 禁 DSL / 禁自由字符串：每个原语一个分支函数，新增原语须扩展联合

import type { KitAbility, KitPrimitive } from '../data'

export interface Vec2 { x: number; y: number }

export interface KitCombatContext {
  origin: Vec2
  direction: Vec2
  atk: number
  crit: number
  rng: () => number
  /** 蓄力原语：按住时长（ms），0 = 未蓄 */
  chargeMs?: number
  /** 定点原语：瞄准点，缺省取 origin + direction * 80 */
  aimPoint?: Vec2
}

// ---------- 普攻侧行为请求 ----------

export interface NormalRoundtrip {
  primitive: 'roundtrip'
  channel: 'normal'
  origin: Vec2
  direction: Vec2
  range: number
  damageMult: number
  returnDamageMult: number
}
export interface NormalRefract {
  primitive: 'refract'
  channel: 'normal'
  origin: Vec2
  direction: Vec2
  maxTargets: number
  damageMult: number
  falloffPerTarget: number
}
export interface NormalMark {
  primitive: 'mark'
  channel: 'normal'
  origin: Vec2
  direction: Vec2
  markDurationMs: number
  markBonusPct: number
  damageMult: number
}
export interface NormalFixedpoint {
  primitive: 'fixedpoint'
  channel: 'normal'
  origin: Vec2
  target: Vec2
  damageMult: number
  radius: number
}
export interface NormalThundernet {
  primitive: 'thundernet'
  channel: 'normal'
  origin: Vec2
  radius: number
  durationMs: number
  tickMs: number
  damageMultPerTick: number
  maxNets: number
}
export interface NormalThunderstake {
  primitive: 'thunderstake'
  channel: 'normal'
  origin: Vec2
  target: Vec2
  durationMs: number
  tickMs: number
  radius: number
  damageMultPerTick: number
  maxStakes: number
}
export interface NormalCharge {
  primitive: 'charge'
  channel: 'normal'
  origin: Vec2
  direction: Vec2
  chargeMs: number
  tier: 0 | 1 | 2
  damageMult: number
  speedPenaltyPct: number
}
export interface NormalBoomerang {
  primitive: 'boomerang'
  channel: 'normal'
  origin: Vec2
  radius: number
  damageMult: number
  rotationSpeed: number
}

export type KitNormalBehavior =
  | NormalRoundtrip | NormalRefract | NormalMark | NormalFixedpoint
  | NormalThundernet | NormalThunderstake | NormalCharge | NormalBoomerang

// ---------- 神通侧行为请求 ----------

export interface ArtRoundtrip {
  primitive: 'roundtrip'
  channel: 'art'
  origin: Vec2
  direction: Vec2
  range: number
  damageMult: number
  returnDamageMult: number
}
export interface ArtRefract {
  primitive: 'refract'
  channel: 'art'
  origin: Vec2
  maxTargets: number
  damageMult: number
  falloffPerTarget: number
  radius: number
}
export interface ArtMark {
  primitive: 'mark'
  channel: 'art'
  origin: Vec2
  radius: number
  markDurationMs: number
  markBonusPct: number
  detonationMult: number
}
export interface ArtFixedpoint {
  primitive: 'fixedpoint'
  channel: 'art'
  origin: Vec2
  target: Vec2
  damageMult: number
  radius: number
}
export interface ArtThundernet {
  primitive: 'thundernet'
  channel: 'art'
  origin: Vec2
  radius: number
  durationMs: number
  tickMs: number
  damageMultPerTick: number
  maxNets: number
}
export interface ArtThunderstake {
  primitive: 'thunderstake'
  channel: 'art'
  origin: Vec2
  targets: Vec2[]
  durationMs: number
  tickMs: number
  radius: number
  damageMultPerTick: number
  chainDamageMult: number
  maxStakes: number
}
export interface ArtCharge {
  primitive: 'charge'
  channel: 'art'
  origin: Vec2
  direction: Vec2
  chargeMs: number
  tier: 0 | 1 | 2
  damageMult: number
  range: number
  speedPenaltyPct: number
}
export interface ArtBoomerang {
  primitive: 'boomerang'
  channel: 'art'
  origin: Vec2
  radius: number
  durationMs: number
  damageMultPerTick: number
  rotationSpeed: number
}

export type KitArtBehavior =
  | ArtRoundtrip | ArtRefract | ArtMark | ArtFixedpoint
  | ArtThundernet | ArtThunderstake | ArtCharge | ArtBoomerang

export type KitBehaviorRequest = KitNormalBehavior | KitArtBehavior

// ---------- 原语参数常量（B1 lean，待模拟器调参） ----------

const NORMAL_PARAMS = {
  roundtrip: { range: 120, damageMult: 1.0, returnDamageMult: 0.7 },
  refract: { maxTargets: 3, damageMult: 1.0, falloffPerTarget: 0.25 },
  mark: { markDurationMs: 3000, markBonusPct: 0.15, damageMult: 0.9 },
  fixedpoint: { damageMult: 1.3, radius: 20 },
  thundernet: { radius: 60, durationMs: 2000, tickMs: 300, damageMultPerTick: 0.3, maxNets: 1 },
  thunderstake: { durationMs: 3000, tickMs: 400, radius: 40, damageMultPerTick: 0.4, maxStakes: 1 },
  charge: { maxChargeMs: 800, minMult: 1.0, midMult: 1.5, maxMult: 2.2, speedPenaltyPct: 0.4 },
  boomerang: { radius: 50, damageMult: 1.0, rotationSpeed: 720 },
} as const

const ART_PARAMS = {
  roundtrip: { range: 200, damageMult: 2.0, returnDamageMult: 1.5 },
  refract: { maxTargets: 5, damageMult: 1.5, falloffPerTarget: 0.2, radius: 200 },
  mark: { radius: 100, markDurationMs: 5000, markBonusPct: 0.25, detonationMult: 1.5 },
  fixedpoint: { damageMult: 2.5, radius: 40 },
  thundernet: { radius: 120, durationMs: 4000, tickMs: 300, damageMultPerTick: 0.5, maxNets: 3 },
  thunderstake: { durationMs: 4000, tickMs: 400, radius: 60, damageMultPerTick: 0.6, chainDamageMult: 0.8, maxStakes: 3 },
  charge: { maxChargeMs: 1200, minMult: 1.5, midMult: 2.5, maxMult: 3.5, range: 300, speedPenaltyPct: 0.5 },
  boomerang: { radius: 80, durationMs: 3000, damageMultPerTick: 0.5, rotationSpeed: 540 },
} as const

const CHARGE_TIERS = [0.33, 0.66] as const

function chargeTier(chargeMs: number, maxChargeMs: number): 0 | 1 | 2 {
  const ratio = maxChargeMs > 0 ? chargeMs / maxChargeMs : 0
  if (ratio >= CHARGE_TIERS[1]) return 2
  if (ratio >= CHARGE_TIERS[0]) return 1
  return 0
}

function chargeMult(tier: 0 | 1 | 2, min: number, mid: number, max: number): number {
  return tier === 0 ? min : tier === 1 ? mid : max
}

function defaultTarget(ctx: KitCombatContext, dist = 80): Vec2 {
  return ctx.aimPoint ?? { x: ctx.origin.x + ctx.direction.x * dist, y: ctx.origin.y + ctx.direction.y * dist }
}

// ---------- 普攻 executor（8 原语分支） ----------

function execNormalRoundtrip(ability: KitAbility, ctx: KitCombatContext): NormalRoundtrip {
  const p = NORMAL_PARAMS.roundtrip
  return {
    primitive: 'roundtrip', channel: 'normal',
    origin: ctx.origin, direction: ctx.direction,
    range: p.range, damageMult: p.damageMult, returnDamageMult: p.returnDamageMult,
  }
}

function execNormalRefract(ability: KitAbility, ctx: KitCombatContext): NormalRefract {
  const p = NORMAL_PARAMS.refract
  return {
    primitive: 'refract', channel: 'normal',
    origin: ctx.origin, direction: ctx.direction,
    maxTargets: p.maxTargets, damageMult: p.damageMult, falloffPerTarget: p.falloffPerTarget,
  }
}

function execNormalMark(ability: KitAbility, ctx: KitCombatContext): NormalMark {
  const p = NORMAL_PARAMS.mark
  return {
    primitive: 'mark', channel: 'normal',
    origin: ctx.origin, direction: ctx.direction,
    markDurationMs: p.markDurationMs, markBonusPct: p.markBonusPct, damageMult: p.damageMult,
  }
}

function execNormalFixedpoint(ability: KitAbility, ctx: KitCombatContext): NormalFixedpoint {
  const p = NORMAL_PARAMS.fixedpoint
  return {
    primitive: 'fixedpoint', channel: 'normal',
    origin: ctx.origin, target: defaultTarget(ctx),
    damageMult: p.damageMult, radius: p.radius,
  }
}

function execNormalThundernet(ability: KitAbility, ctx: KitCombatContext): NormalThundernet {
  const p = NORMAL_PARAMS.thundernet
  return {
    primitive: 'thundernet', channel: 'normal',
    origin: ctx.origin, radius: p.radius, durationMs: p.durationMs,
    tickMs: p.tickMs, damageMultPerTick: p.damageMultPerTick, maxNets: p.maxNets,
  }
}

function execNormalThunderstake(ability: KitAbility, ctx: KitCombatContext): NormalThunderstake {
  const p = NORMAL_PARAMS.thunderstake
  return {
    primitive: 'thunderstake', channel: 'normal',
    origin: ctx.origin, target: defaultTarget(ctx),
    durationMs: p.durationMs, tickMs: p.tickMs, radius: p.radius,
    damageMultPerTick: p.damageMultPerTick, maxStakes: p.maxStakes,
  }
}

function execNormalCharge(ability: KitAbility, ctx: KitCombatContext): NormalCharge {
  const p = NORMAL_PARAMS.charge
  const chargeMs = ctx.chargeMs ?? 0
  const tier = chargeTier(chargeMs, p.maxChargeMs)
  const mult = chargeMult(tier, p.minMult, p.midMult, p.maxMult)
  return {
    primitive: 'charge', channel: 'normal',
    origin: ctx.origin, direction: ctx.direction,
    chargeMs, tier, damageMult: mult, speedPenaltyPct: p.speedPenaltyPct,
  }
}

function execNormalBoomerang(ability: KitAbility, ctx: KitCombatContext): NormalBoomerang {
  const p = NORMAL_PARAMS.boomerang
  return {
    primitive: 'boomerang', channel: 'normal',
    origin: ctx.origin, radius: p.radius,
    damageMult: p.damageMult, rotationSpeed: p.rotationSpeed,
  }
}

// ---------- 神通 executor（8 原语分支） ----------

function execArtRoundtrip(ability: KitAbility, ctx: KitCombatContext): ArtRoundtrip {
  const p = ART_PARAMS.roundtrip
  return {
    primitive: 'roundtrip', channel: 'art',
    origin: ctx.origin, direction: ctx.direction,
    range: p.range, damageMult: p.damageMult * ability.artPower,
    returnDamageMult: p.returnDamageMult * ability.artPower,
  }
}

function execArtRefract(ability: KitAbility, ctx: KitCombatContext): ArtRefract {
  const p = ART_PARAMS.refract
  return {
    primitive: 'refract', channel: 'art',
    origin: ctx.origin, maxTargets: p.maxTargets,
    damageMult: p.damageMult * ability.artPower, falloffPerTarget: p.falloffPerTarget,
    radius: p.radius,
  }
}

function execArtMark(ability: KitAbility, ctx: KitCombatContext): ArtMark {
  const p = ART_PARAMS.mark
  return {
    primitive: 'mark', channel: 'art',
    origin: ctx.origin, radius: p.radius,
    markDurationMs: p.markDurationMs, markBonusPct: p.markBonusPct,
    detonationMult: p.detonationMult * ability.artPower,
  }
}

function execArtFixedpoint(ability: KitAbility, ctx: KitCombatContext): ArtFixedpoint {
  const p = ART_PARAMS.fixedpoint
  return {
    primitive: 'fixedpoint', channel: 'art',
    origin: ctx.origin, target: defaultTarget(ctx, 100),
    damageMult: p.damageMult * ability.artPower, radius: p.radius,
  }
}

function execArtThundernet(ability: KitAbility, ctx: KitCombatContext): ArtThundernet {
  const p = ART_PARAMS.thundernet
  return {
    primitive: 'thundernet', channel: 'art',
    origin: ctx.origin, radius: p.radius, durationMs: p.durationMs,
    tickMs: p.tickMs, damageMultPerTick: p.damageMultPerTick * ability.artPower,
    maxNets: p.maxNets,
  }
}

function execArtThunderstake(ability: KitAbility, ctx: KitCombatContext): ArtThunderstake {
  const p = ART_PARAMS.thunderstake
  const target = defaultTarget(ctx, 100)
  const spread = 40
  const targets: Vec2[] = [
    target,
    { x: target.x + spread, y: target.y - spread },
    { x: target.x - spread, y: target.y + spread },
  ]
  return {
    primitive: 'thunderstake', channel: 'art',
    origin: ctx.origin, targets,
    durationMs: p.durationMs, tickMs: p.tickMs, radius: p.radius,
    damageMultPerTick: p.damageMultPerTick * ability.artPower,
    chainDamageMult: p.chainDamageMult, maxStakes: p.maxStakes,
  }
}

function execArtCharge(ability: KitAbility, ctx: KitCombatContext): ArtCharge {
  const p = ART_PARAMS.charge
  const chargeMs = ctx.chargeMs ?? 0
  const tier = chargeTier(chargeMs, p.maxChargeMs)
  const mult = chargeMult(tier, p.minMult, p.midMult, p.maxMult) * ability.artPower
  return {
    primitive: 'charge', channel: 'art',
    origin: ctx.origin, direction: ctx.direction,
    chargeMs, tier, damageMult: mult, range: p.range,
    speedPenaltyPct: p.speedPenaltyPct,
  }
}

function execArtBoomerang(ability: KitAbility, ctx: KitCombatContext): ArtBoomerang {
  const p = ART_PARAMS.boomerang
  return {
    primitive: 'boomerang', channel: 'art',
    origin: ctx.origin, radius: p.radius, durationMs: p.durationMs,
    damageMultPerTick: p.damageMultPerTick * ability.artPower,
    rotationSpeed: p.rotationSpeed,
  }
}

// ---------- 公共入口 ----------

const NORMAL_DISPATCH: Record<KitPrimitive, (a: KitAbility, c: KitCombatContext) => KitNormalBehavior> = {
  roundtrip: execNormalRoundtrip,
  refract: execNormalRefract,
  mark: execNormalMark,
  fixedpoint: execNormalFixedpoint,
  thundernet: execNormalThundernet,
  thunderstake: execNormalThunderstake,
  charge: execNormalCharge,
  boomerang: execNormalBoomerang,
}

const ART_DISPATCH: Record<KitPrimitive, (a: KitAbility, c: KitCombatContext) => KitArtBehavior> = {
  roundtrip: execArtRoundtrip,
  refract: execArtRefract,
  mark: execArtMark,
  fixedpoint: execArtFixedpoint,
  thundernet: execArtThundernet,
  thunderstake: execArtThunderstake,
  charge: execArtCharge,
  boomerang: execArtBoomerang,
}

/** 执行普攻原语 → 行为描述（纯函数，不依赖 Phaser） */
export function executeKitNormal(ability: KitAbility, ctx: KitCombatContext): KitNormalBehavior {
  return NORMAL_DISPATCH[ability.normalPrimitive](ability, ctx)
}

/** 执行神通原语 → 行为描述（纯函数，不依赖 Phaser） */
export function executeKitArt(ability: KitAbility, ctx: KitCombatContext): KitArtBehavior {
  return ART_DISPATCH[ability.artPrimitive](ability, ctx)
}

/** 通用入口：按 channel 分派 */
export function executeKit(
  ability: KitAbility,
  ctx: KitCombatContext,
  channel: 'normal' | 'art',
): KitBehaviorRequest {
  return channel === 'normal' ? executeKitNormal(ability, ctx) : executeKitArt(ability, ctx)
}
