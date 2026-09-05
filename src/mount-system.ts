// ---------- 坐骑/飞行系统 ----------
// 坐骑提供移动速度加成和探索范围扩展
// 飞行能力允许跨越地形障碍和进入隐藏区域

import type { GameState } from './state'

// ===== 坐骑纹理映射 =====
export const MOUNT_TEXTURES: Record<MountType, { tex: string; anim?: string }> = {
  spirit_horse: { tex: 'mount_spirit_horse', anim: 'mount_spirit_horse_gallop' },
  wind_eagle: { tex: 'beast_eagle_atlas', anim: 'beast_eagle_idle' },
  cloud_crane: { tex: 'beast_crane', anim: 'beast_crane_idle' },
  thunder_dragon: { tex: 'beast_dragon_atlas', anim: 'beast_dragon_idle' },
  void_phoenix: { tex: 'beast_phoenix', anim: 'beast_phoenix_idle' },
}

// ===== 坐骑类型 =====

export type MountType =
  | 'spirit_horse'     // 灵驹（地面坐骑）
  | 'wind_eagle'       // 风雕（低空飞行）
  | 'cloud_crane'      // 云鹤（中空飞行）
  | 'thunder_dragon'   // 雷龙（高空飞行+战斗）
  | 'void_phoenix'     // 虚空凤凰（传送+飞行）

export interface MountDef {
  type: MountType
  name: string
  desc: string
  speedMultiplier: number   // 移动速度倍率
  canFly: boolean           // 是否能飞行
  canTeleport: boolean      // 是否能传送
  visionBonus: number       // 视野范围加成
  staminaDrain: number      // 移动时体力消耗倍率
  minRealm: number          // 最低境界要求
  minLevel: number          // 最低等级要求
  cost: number              // 获取成本（灵石）
  color: number             // 颜色标识
}

export const MOUNTS: Record<MountType, MountDef> = {
  spirit_horse: {
    type: 'spirit_horse', name: '灵驹', desc: '通灵之马，日行千里，踏雪无痕',
    speedMultiplier: 1.5, canFly: false, canTeleport: false,
    visionBonus: 0, staminaDrain: 0.7, minRealm: 0, minLevel: 5,
    cost: 500, color: 0x8b4513,
  },
  wind_eagle: {
    type: 'wind_eagle', name: '风雕', desc: '御风之雕，可低空滑翔，越过浅障',
    speedMultiplier: 1.8, canFly: true, canTeleport: false,
    visionBonus: 2, staminaDrain: 0.8, minRealm: 1, minLevel: 15,
    cost: 1500, color: 0x60a5fa,
  },
  cloud_crane: {
    type: 'cloud_crane', name: '云鹤', desc: '云中仙鹤，翱翔天际，俯瞰大地',
    speedMultiplier: 2.0, canFly: true, canTeleport: false,
    visionBonus: 4, staminaDrain: 0.6, minRealm: 2, minLevel: 25,
    cost: 3000, color: 0xe0e0e0,
  },
  thunder_dragon: {
    type: 'thunder_dragon', name: '雷龙', desc: '雷霆化龙，风驰电掣，可战可骑',
    speedMultiplier: 2.5, canFly: true, canTeleport: false,
    visionBonus: 5, staminaDrain: 0.5, minRealm: 3, minLevel: 40,
    cost: 8000, color: 0xfbbf24,
  },
  void_phoenix: {
    type: 'void_phoenix', name: '虚空凤凰', desc: '穿越虚空的不死凤凰，可瞬移至已探索地点',
    speedMultiplier: 3.0, canFly: true, canTeleport: true,
    visionBonus: 8, staminaDrain: 0.3, minRealm: 4, minLevel: 50,
    cost: 20000, color: 0xff4444,
  },
}

// ===== 坐骑状态 =====

export interface ActiveMountState {
  type: MountType
  summoned: boolean      // 是否已召唤
  endurance: number       // 耐力值 0~100
  lastEnduranceTick: number
}

// ===== 获取坐骑定义 =====

export function getMountDef(type: MountType): MountDef {
  return MOUNTS[type]
}

// ===== 购买坐骑 =====

export function purchaseMount(state: GameState, type: MountType): { ok: boolean; reason: string } {
  const def = MOUNTS[type]
  if (!def) return { ok: false, reason: '坐骑不存在' }

  if (state.realm < def.minRealm) return { ok: false, reason: `境界不足，需${def.minRealm}境` }
  if (state.level < def.minLevel) return { ok: false, reason: `等级不足，需${def.minLevel}级` }
  if (state.gold < def.cost) return { ok: false, reason: `灵石不足，需${def.cost}` }

  // 检查是否已拥有此坐骑
  const ownedMounts = (state as any).ownedMounts as MountType[] | undefined
  if (ownedMounts?.includes(type)) return { ok: false, reason: '已拥有此坐骑' }

  state.gold -= def.cost
  if (!(state as any).ownedMounts) (state as any).ownedMounts = []
  ;(state as any).ownedMounts.push(type)

  return { ok: true, reason: `成功获得${def.name}！` }
}

// ===== 召唤/收回坐骑 =====

export function summonMount(state: GameState, type: MountType): { ok: boolean; reason: string } {
  const ownedMounts = (state as any).ownedMounts as MountType[] | undefined
  if (!ownedMounts?.includes(type)) return { ok: false, reason: '未拥有此坐骑' }

  const def = MOUNTS[type]
  if (state.realm < def.minRealm) return { ok: false, reason: '境界不足以骑乘' }

  if (!(state as any).activeMount) {
    ;(state as any).activeMount = { type, summoned: true, endurance: 100, lastEnduranceTick: Date.now() }
  } else {
    ;(state as any).activeMount.type = type
    ;(state as any).activeMount.summoned = true
    ;(state as any).activeMount.endurance = Math.min(100, (state as any).activeMount.endurance + 50)
  }

  return { ok: true, reason: `${def.name}已召唤！移动速度提升` }
}

export function dismissMount(state: GameState): { ok: boolean; reason: string } {
  if (!(state as any).activeMount) return { ok: false, reason: '未召唤坐骑' }
  ;(state as any).activeMount.summoned = false
  return { ok: true, reason: '坐骑已收回' }
}

// ===== 坐骑效果计算 =====

export function getMountSpeedMultiplier(state: GameState): number {
  const mount = (state as any).activeMount as ActiveMountState | undefined
  if (!mount?.summoned) return 1.0
  const def = MOUNTS[mount.type]
  if (!def) return 1.0

  // 耐力影响速度加成
  const enduranceFactor = Math.max(0.5, mount.endurance / 100)
  return def.speedMultiplier * enduranceFactor
}

export function getMountVisionBonus(state: GameState): number {
  const mount = (state as any).activeMount as ActiveMountState | undefined
  if (!mount?.summoned) return 0
  const def = MOUNTS[mount.type]
  return def?.visionBonus || 0
}

export function canFly(state: GameState): boolean {
  const mount = (state as any).activeMount as ActiveMountState | undefined
  if (!mount?.summoned) return false
  const def = MOUNTS[mount.type]
  return def?.canFly || false
}

export function canTeleport(state: GameState): boolean {
  const mount = (state as any).activeMount as ActiveMountState | undefined
  if (!mount?.summoned) return false
  const def = MOUNTS[mount.type]
  return def?.canTeleport || false
}

// ===== 耐力消耗与恢复 =====

export function tickMountEndurance(state: GameState, deltaMs: number, moving: boolean): void {
  const mount = (state as any).activeMount as ActiveMountState | undefined
  if (!mount?.summoned) return

  const def = MOUNTS[mount.type]
  if (!def) return

  const now = Date.now()
  const elapsed = now - mount.lastEnduranceTick
  if (elapsed < 1000) return // 每秒结算一次

  mount.lastEnduranceTick = now

  if (moving) {
    // 移动时消耗耐力
    const drain = def.staminaDrain * 2 // 每秒消耗
    mount.endurance = Math.max(0, mount.endurance - drain)
    if (mount.endurance <= 0) {
      // 耐力归零，自动收回
      mount.summoned = false
      mount.endurance = 0
    }
  } else {
    // 停留时恢复耐力
    mount.endurance = Math.min(100, mount.endurance + 5)
  }
}

// ===== 传送（虚空凤凰专属） =====

export function teleportToDiscovered(state: GameState): { ok: boolean; reason: string } {
  if (!canTeleport(state)) return { ok: false, reason: '当前坐骑无法传送' }

  const mount = (state as any).activeMount as ActiveMountState
  if (mount.endurance < 30) return { ok: false, reason: '耐力不足，需至少30' }

  mount.endurance -= 30
  return { ok: true, reason: '传送成功' }
}
