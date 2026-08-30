// ---------- 新系统模块单测公共夹具 ----------
// 说明：
// 1. 只依赖不触碰 Phaser 的模块（state / core / 各 *-data），保证 Node 环境可用。
// 2. 不修改任何生产数据表；需要可变对象时一律返回全新实例，避免并行 worker 间串扰。
// 3. 随机行为一律通过注入 rng 驱动，禁止在断言里依赖 Math.random。

import { vi } from 'vitest'
import { newGame, type GameState } from '../src/state'
import { newWorldTime } from '../src/world-time'
import type { SectData } from '../src/sect-data'
import type { Disciple } from '../src/disciple-data'
import type { Beast } from '../src/beast-data'
import type { AiSect } from '../src/ai-sect-data'

// ---------- localStorage stub（Node 环境无 localStorage；saveGame 会用到） ----------
export function installLocalStorageStub(): void {
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v) },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  })
}

// ---------- rng 工具 ----------
/** 恒定值 rng：便于把随机分支钉死在边界上 */
export function constRng(v: number): () => number {
  return () => v
}

/** 序列 rng：按给定值依次返回，耗尽后回落到最后一个值 */
export function seqRng(values: number[]): () => number {
  let i = 0
  return () => {
    const v = values[Math.min(i, values.length - 1)]
    i++
    return v
  }
}

// ---------- GameState 夹具 ----------
/** 基于 newGame() 的最小可用 state；overrides 浅合并 */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  const s = newGame()
  return Object.assign(s, overrides)
}

// ---------- 宗门夹具 ----------
export function makeSect(overrides: Partial<SectData> = {}): SectData {
  const base: SectData = {
    name: '测试宗',
    level: 1,
    buildings: { main_hall: 1 },
    resources: { stone: 1000, herb: 100, ore: 100, wood: 100, insight: 10, prestige: 10 },
    foundedTime: newWorldTime(),
    productionTimer: 0,
    mapX: 100,
    mapY: 100,
    disciples: [],
    recruitCooldown: 0,
    techs: {},
    farmSlots: [null, null, null],
  }
  return Object.assign(base, overrides)
}

// ---------- 弟子夹具 ----------
export function makeDisciple(overrides: Partial<Disciple> = {}): Disciple {
  const base: Disciple = {
    uid: 'd_test',
    name: '测试弟子',
    root: 'gold',
    rootTier: 'common',
    realm: 0,
    exp: 0,
    expToNext: 100,
    talents: [],
    loyalty: 70,
    affection: 40,
    skills: [],
    status: 'idle',
    questId: null,
    questStartTime: 0,
    retreatEndTime: 0,
    guidanceCooldown: 0,
    sparCooldown: 0,
    atk: 30,
    def: 15,
    maxHp: 200,
    crit: 5,
    equipment: { weapon: null, head: null, armor: null, boots: null, charm: null },
    rank: 0,
    role: null,
  }
  return Object.assign(base, overrides)
}

// ---------- 灵兽夹具 ----------
export function makeBeast(overrides: Partial<Beast> = {}): Beast {
  const base: Beast = {
    uid: 'b_test',
    name: '测试灵兽',
    species: 'wolf',
    rarity: 'common',
    element: 'wind',
    level: 1,
    exp: 0,
    expToNext: 90,
    atk: 35,
    def: 15,
    maxHp: 200,
    speed: 140,
    hp: 200,
    role: 'none',
    deployed: false,
    feedCooldown: 0,
  }
  return Object.assign(base, overrides)
}

// ---------- AI 宗门夹具 ----------
export function makeAiSect(overrides: Partial<AiSect> = {}): AiSect {
  const base: AiSect = {
    id: 'ai_sect_0',
    name: '测试剑宗',
    level: 3,
    power: 500,
    disposition: 'diplomatic',
    mapX: 200,
    mapY: 300,
    resources: { stone: 1000, herb: 500, ore: 300, wood: 400 },
    discipleCount: 10,
    relationValue: 0,
    tradeAgreement: false,
    alliance: false,
    atWar: false,
    warExhaustion: 0,
    cooldownUntil: 0,
    defeated: false,
    color: 0xef4444,
    vassalOf: null,
    tributeRate: 0,
    rebellionChance: 0,
    originalPower: 500,
    attackTimer: 0,
  }
  return Object.assign(base, overrides)
}
