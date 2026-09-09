// ---------- 破碎仙宫：无尽模式 + 仙人/妖兽敌人 + 敌人使用玩家招式 ----------
// 化神期解锁，每层敌人携带不同的攻击模式/神通/套装效果

import { MONSTERS, SETS, type AttackMode, type ArtMode, type MonsterDef } from './data'
import { resolveSetEffectRuntime, type SetEffectRuntime } from './effects'

// ========== 仙界敌人模板 ==========
// 仙人/妖兽：携带 attackMode + artMode + 套装效果，使用玩家级别的招式

export interface XianEnemyDef {
  id: string
  name: string
  tex: string            // 贴图 key（xian/xxx）
  tier: 1 | 2 | 3 | 4    // 敌人阶级：1散仙/灵兽 2真仙/仙兽 3金仙/圣兽 4仙尊/Boss
  hp: number
  atk: number
  def: number
  speed: number
  exp: number
  gold: [number, number]
  attackMode: AttackMode  // 普攻模式（同玩家）
  artMode: ArtMode       // 神通模式（同玩家）
  setId?: string         // 携带套装（提供数值加成 + 视觉效果）
  ai: 'xian_melee' | 'xian_ranged' | 'xian_boss'
  range?: number
  cd?: number
  scale?: number
  isBoss?: boolean
}

export const XIAN_ENEMIES: XianEnemyDef[] = [
  // ===== Tier 1：散仙 / 低阶灵兽 =====
  {
    id: 'xian_sanxian_m', name: '青锋散仙', tex: 'xian_sanxian_m', tier: 1,
    hp: 120, atk: 14, def: 4, speed: 55, exp: 40, gold: [15, 30],
    attackMode: 'melee_arc', artMode: 'sword_fan',
    setId: 'set_qm',
    ai: 'xian_melee', range: 28, cd: 1200,
  },
  {
    id: 'xian_sanxian_f', name: '玉露散仙', tex: 'xian_sanxian_f', tier: 1,
    hp: 100, atk: 12, def: 3, speed: 60, exp: 38, gold: [15, 28],
    attackMode: 'magic_bolt', artMode: 'fire_rain',
    ai: 'xian_ranged', range: 180, cd: 1500,
  },
  {
    id: 'xian_tong_nan', name: '守山仙童', tex: 'xian_tong_nan', tier: 1,
    hp: 80, atk: 10, def: 2, speed: 70, exp: 30, gold: [10, 20],
    attackMode: 'flying_sword', artMode: 'sword_fan',
    ai: 'xian_ranged', range: 150, cd: 1300,
  },
  {
    id: 'beast_crane', name: '云中仙鹤', tex: 'beast_crane', tier: 1,
    hp: 90, atk: 13, def: 3, speed: 75, exp: 35, gold: [12, 22],
    attackMode: 'flying_sword', artMode: 'thunder_strike',
    ai: 'xian_ranged', range: 160, cd: 1100,
  },

  // ===== Tier 2：真仙 / 高阶仙兽 =====
  {
    id: 'xian_zhenxian_m', name: '赤霞真仙', tex: 'xian_zhenxian_m', tier: 2,
    hp: 220, atk: 22, def: 8, speed: 55, exp: 80, gold: [30, 55],
    attackMode: 'whirlwind', artMode: 'fire_rain',
    setId: 'set_huo',
    ai: 'xian_melee', range: 32, cd: 1100,
  },
  {
    id: 'xian_zhenxian_f', name: '紫霞真仙', tex: 'xian_zhenxian_f', tier: 2,
    hp: 180, atk: 20, def: 6, speed: 60, exp: 75, gold: [28, 50],
    attackMode: 'frost_nova', artMode: 'thunder_strike',
    setId: 'set_bing',
    ai: 'xian_ranged', range: 170, cd: 1400,
  },
  {
    id: 'beast_deer', name: '九色灵鹿', tex: 'beast_deer', tier: 2,
    hp: 200, atk: 18, def: 7, speed: 80, exp: 70, gold: [25, 45],
    attackMode: 'thunder_chain', artMode: 'thunder_strike',
    ai: 'xian_ranged', range: 160, cd: 1200,
  },
  {
    id: 'beast_pixiu', name: '镇山貔貅', tex: 'beast_pixiu', tier: 2,
    hp: 280, atk: 24, def: 12, speed: 50, exp: 85, gold: [35, 60],
    attackMode: 'giant_sword', artMode: 'dageng',
    ai: 'xian_melee', range: 30, cd: 1300,
  },

  // ===== Tier 3：金仙 / 圣兽 =====
  {
    id: 'xian_jinxian_m', name: '太清金仙', tex: 'xian_jinxian_m', tier: 3,
    hp: 450, atk: 38, def: 15, speed: 50, exp: 180, gold: [70, 120],
    attackMode: 'sword_array', artMode: 'dageng',
    setId: 'set_qm',
    ai: 'xian_melee', range: 36, cd: 1000,
  },
  {
    id: 'xian_jinxian_f', name: '瑶池金仙', tex: 'xian_jinxian_f', tier: 3,
    hp: 380, atk: 35, def: 12, speed: 55, exp: 170, gold: [65, 110],
    attackMode: 'frost_nova_burst', artMode: 'fire_rain',
    setId: 'set_lei',
    ai: 'xian_ranged', range: 180, cd: 1300,
  },
  {
    id: 'xian_tong_nv', name: '莲花仙童', tex: 'xian_tong_nv', tier: 3,
    hp: 320, atk: 32, def: 10, speed: 70, exp: 150, gold: [55, 90],
    attackMode: 'flying_sword_burst', artMode: 'sword_fan',
    ai: 'xian_ranged', range: 170, cd: 1000,
  },
  {
    id: 'beast_phoenix', name: '南明朱雀', tex: 'beast_phoenix', tier: 3,
    hp: 420, atk: 40, def: 10, speed: 75, exp: 200, gold: [80, 140],
    attackMode: 'magic_bolt', artMode: 'fire_rain',
    setId: 'set_huo',
    ai: 'xian_ranged', range: 200, cd: 900,
  },

  // ===== Tier 4：仙尊 Boss =====
  {
    id: 'boss_xianzun', name: '玄天仙尊', tex: 'boss_xianzun', tier: 4,
    hp: 1200, atk: 55, def: 25, speed: 45, exp: 500, gold: [200, 350],
    attackMode: 'sword_array', artMode: 'dageng',
    setId: 'set_lei',
    ai: 'xian_boss', range: 40, cd: 900,
    isBoss: true, scale: 1.3,
  },
]

export const XIAN_ENEMY_MAP = new Map(XIAN_ENEMIES.map((e) => [e.id, e]))

// 转换为 MonsterDef 兼容格式（给现有 Enemy 类使用）
export function xianToMonster(def: XianEnemyDef): MonsterDef {
  // 借用对应基础 AI 的行为模式，但携带独立的攻击/神通配置
  const baseAi: 'melee' | 'ranged' | 'boss' =
    def.ai === 'xian_boss' ? 'boss' :
    def.ai === 'xian_ranged' ? 'ranged' : 'melee'

  return {
    id: def.id,
    name: def.name,
    tex: def.tex,
    hp: def.hp,
    atk: def.atk,
    def: def.def,
    speed: def.speed,
    exp: def.exp,
    gold: def.gold,
    ai: baseAi,
    range: def.range,
    cd: def.cd,
    scale: def.scale,
  } as MonsterDef
}

// ========== 仙界无尽模式：楼层生成 ==========

/** 获取仙界第 n 层的敌人池和难度倍率 */
export function xianFloorPool(floor: number): {
  enemies: string[]
  scale: number
  hpMult: number
  atkMult: number
  isBoss: boolean
  bossId?: string
} {
  const isBoss = floor % 10 === 0
  const depth = floor // 仙界层数从 1 开始

  // 难度曲线：每层 HP +20%, ATK +8%, DEF +3
  const hpMult = 1 + (depth - 1) * 0.20
  const atkMult = 1 + (depth - 1) * 0.08
  const scale = 1 + (depth - 1) * 0.03

  // 敌人池按深度解锁
  const pool: string[] = []

  // Tier 1：1 层起
  if (depth >= 1) {
    pool.push('xian_sanxian_m', 'xian_sanxian_f', 'beast_crane')
  }
  if (depth >= 3) {
    pool.push('xian_tong_nan')
  }
  // Tier 2：5 层起
  if (depth >= 5) {
    pool.push('xian_zhenxian_m', 'xian_zhenxian_f', 'beast_pixiu')
  }
  if (depth >= 7) {
    pool.push('beast_deer')
  }
  // Tier 3：10 层起
  if (depth >= 10) {
    pool.push('xian_jinxian_m', 'xian_jinxian_f', 'beast_phoenix')
  }
  if (depth >= 15) {
    pool.push('xian_tong_nv')
  }

  // Boss 轮换：每 10 层一位，循环仙尊 → 后续可扩展更多 Boss
  let bossId: string | undefined
  if (isBoss) {
    bossId = 'boss_xianzun'
  }

  return { enemies: pool, scale, hpMult, atkMult, isBoss, bossId }
}

/** 生成仙界某层的刷怪表（格式同 spawnTableFor） */
export function xianSpawnTable(floor: number): Array<[string, number, number]> {
  const { enemies, isBoss, bossId, hpMult } = xianFloorPool(floor)
  const result: Array<[string, number, number]> = []

  if (isBoss && bossId) {
    // Boss 层：1 个 Boss + 2~3 个精英小怪
    result.push([bossId, 1, 1])
    const minion = enemies[Math.floor(Math.random() * enemies.length)]
    result.push([minion, 2, 3])
  } else {
    // 普通层：3~5 个敌人混合
    const count = 3 + Math.floor(Math.random() * 3)
    for (let i = 0; i < count; i++) {
      const id = enemies[Math.floor(Math.random() * enemies.length)]
      result.push([id, 1, 2])
    }
  }

  return result
}

/** 计算仙界敌人实际数值（应用层数倍率） */
export function xianEnemyStats(def: XianEnemyDef, floor: number) {
  const { hpMult, atkMult, scale } = xianFloorPool(floor)
  return {
    hp: Math.round(def.hp * hpMult * scale),
    atk: Math.round(def.atk * atkMult * (0.8 + scale * 0.2)),
    def: def.def + Math.floor((scale - 1) * 3),
    speed: def.speed,
    exp: Math.round(def.exp * scale),
    gold: [Math.round(def.gold[0] * scale), Math.round(def.gold[1] * scale)] as [number, number],
  }
}

// ========== 仙界入口条件 ==========

/** 玩家是否达到进入仙界的境界要求（化神期及以上） */
export function canEnterXianRealm(realmIndex: number): boolean {
  // 境界索引：0炼气 1筑基 2金丹 3元婴 4化神 5炼虚
  return realmIndex >= 4
}

/** 仙界起始楼层（用于传送门进入） */
export const XIAN_START_FLOOR = 10000

/** 判断楼层是否在仙界 */
export function isXianFloor(floor: number): boolean {
  return floor >= XIAN_START_FLOOR
}

/** 将仙界楼层转换为显示用的层数（10000 → 第1层） */
export function xianFloorDisplay(floor: number): number {
  return floor - XIAN_START_FLOOR + 1
}

/** 仙界最高记录楼层（用于存档） */
export function xianCheckpointFloor(state: { xianMaxDepth: number }): number {
  const maxDepth = state.xianMaxDepth ?? 1
  // 每 5 层设置一个存档点，从最近的存档点开始
  const checkpoint = Math.max(1, Math.floor((maxDepth - 1) / 5) * 5 + 1)
  return checkpoint
}

/** 记录仙界最深层数 */
export function recordXianDepth(state: { xianMaxDepth: number }, floor: number): void {
  if (floor > (state.xianMaxDepth ?? 0)) {
    state.xianMaxDepth = floor
  }
}
