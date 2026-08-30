// ---------- 存档系统单测：localStorage mock + 迁移链 ----------
// 覆盖 src/state.ts 的 loadGame / saveGame 与 SAVE_VERSION 迁移逻辑

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyPreset, loadGame, newGame, saveGame, snapshotPreset, SAVE_VERSION } from '../src/state'
import type { GameState } from '../src/state'

// ---------- localStorage mock（Node 环境无 localStorage） ----------
const store: Record<string, string> = {}
const lsMock = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = String(v) },
  removeItem: (k: string) => { delete store[k] },
  clear: () => { for (const k of Object.keys(store)) delete store[k] },
}
vi.stubGlobal('localStorage', lsMock)

const SAVE_KEY = 'xiuxian_save_v1'
const stash = (obj: unknown) => { store[SAVE_KEY] = JSON.stringify(obj) }

// ---------- 基础加载 ----------
describe('存档加载', () => {
  beforeEach(() => lsMock.clear())

  it('无存档返回全新游戏', () => {
    const s = loadGame()
    expect(s.version).toBe(SAVE_VERSION)
    expect(s.level).toBe(1)
    expect(s.classId).toBe('sword')
    expect(s.gold).toBe(0)
    expect(s.presets).toHaveLength(5)
  })

  it('存档 JSON 损坏时回退新游戏', () => {
    store[SAVE_KEY] = 'not-a-json{{{'
    const s = loadGame()
    expect(s.version).toBe(SAVE_VERSION)
    expect(s.level).toBe(1)
  })

  it('未知的更高版本号回退新游戏', () => {
    stash({ version: 999, level: 50 })
    const s = loadGame()
    expect(s.level).toBe(1)
  })
})

// ---------- 迁移链 ----------
describe('旧版本存档迁移', () => {
  beforeEach(() => lsMock.clear())

  /** 模拟 v1 存档：缺 insight / 配装方案 / 无尽妖域 / 动态内容 / 图鉴等新字段 */
  const oldSave = {
    version: 1,
    classId: 'fairy',
    heroName: '青鸢',
    level: 5,
    exp: 50,
    gold: 123,
    potions: 2,
    realm: 1,
    equipment: {
      weapon: { uid: 'u1', baseId: 'w_iron', name: '铁剑', slot: 'weapon', quality: 1, atk: 8, def: 0, speed: 0, crit: 0, maxHp: 0, affixes: [], price: 10 },
      head: null, armor: null, boots: null, charm: null, charm2: null,
    },
    inventory: [],
    skills: { sk_sanlian: 2, sk_taiyi: 1 },
    skillSlots: { style: 'sk_sanlian', minds: ['sk_taiyi', null], art: null },
    talents: { t_jifeng: 2 },
    progress: { qmCleared: true, ymCleared: false },
    favor: { elder: 15 },
    quests: { q_elder_slayer: 'active' },
    totalKills: 42,
  }

  it('迁移后版本升级且核心数据保留', () => {
    stash(oldSave)
    const s = loadGame()
    expect(s.version).toBe(SAVE_VERSION)
    expect(s.classId).toBe('fairy')
    expect(s.heroName).toBe('青鸢')
    expect(s.level).toBe(5)
    expect(s.exp).toBe(50)
    expect(s.gold).toBe(123)
    expect(s.potions).toBe(2)
    expect(s.realm).toBe(1)
    expect(s.equipment.weapon?.name).toBe('铁剑')
    expect(s.equipment.weapon?.enh).toBe(0) // normalizeItem 补齐
    expect(s.skills).toMatchObject({ sk_sanlian: 2, sk_taiyi: 1 })
    expect(s.skillSlots.style).toBe('sk_sanlian')
    expect(s.skillSlots.minds).toEqual(['sk_taiyi', null])
    expect(s.talents).toEqual({ t_jifeng: 2 })
    expect(s.progress.qmCleared).toBe(true)
    expect(s.progress.ymCleared).toBe(false)
    expect(s.favor.elder).toBe(15)
    expect(s.quests.q_elder_slayer).toBe('active')
    expect(s.totalKills).toBe(42)
  })

  it('迁移后缺失字段取默认值', () => {
    stash(oldSave)
    const s = loadGame()
    expect(s.insight).toBe(12)              // 无 insight → (等级-1)×3
    expect(s.syCheckpoint).toBe(7)          // 无尽妖域默认起点
    expect(s.syMaxDepth).toBe(0)
    expect(s.activePreset).toBe(-1)
    expect(s.presets).toEqual([null, null, null, null, null])
    expect(s.dynamicSets).toEqual([])
    expect(s.dynamicSkills).toEqual([])
    expect(s.codex).toEqual({ items: [], skills: [], sets: [] })
  })
})

// ---------- 保存 / 读取往返 ----------
describe('保存与读取', () => {
  beforeEach(() => lsMock.clear())

  it('saveGame 后 loadGame 恢复状态', () => {
    const s = newGame()
    s.level = 10
    s.gold = 500
    s.heroName = '测试散修'
    s.totalKills = 99
    saveGame(s)

    const loaded = loadGame()
    expect(loaded.level).toBe(10)
    expect(loaded.gold).toBe(500)
    expect(loaded.heroName).toBe('测试散修')
    expect(loaded.totalKills).toBe(99)
    expect(loaded.version).toBe(SAVE_VERSION)
  })

  it('drops unknown equipment keys from current saves and preset application', () => {
    const current = newGame() as GameState & { equipment: Record<string, any> }
    current.equipment.unknown_equipment_key = {
      uid: 'forged', baseId: 'forged', name: '伪槽位装备', slot: 'weapon', quality: 1,
      atk: 999999, def: 0, speed: 0, crit: 0, maxHp: 0, affixes: [], price: 1,
    }
    saveGame(current)

    const loaded = loadGame() as GameState & { equipment: Record<string, unknown> }
    expect(loaded.equipment.unknown_equipment_key).toBeUndefined()
    expect(Object.keys(loaded.equipment)).toEqual(['weapon', 'head', 'armor', 'boots', 'charm1', 'charm2'])

    const preset = {
      equipment: { ...newGame().equipment, unknown_equipment_key: current.equipment.unknown_equipment_key },
      skillSlots: newGame().skillSlots,
      talents: {},
    } as any
    applyPreset(loaded, preset)
    expect((loaded.equipment as Record<string, unknown>).unknown_equipment_key).toBeUndefined()
    expect(Object.keys(loaded.equipment)).toEqual(['weapon', 'head', 'armor', 'boots', 'charm1', 'charm2'])

    ;(loaded.equipment as Record<string, unknown>).unknown_equipment_key = current.equipment.unknown_equipment_key
    const snapshot = snapshotPreset(loaded) as typeof preset
    expect(snapshot.equipment.unknown_equipment_key).toBeUndefined()
    expect(Object.keys(snapshot.equipment)).toEqual(['weapon', 'head', 'armor', 'boots', 'charm1', 'charm2'])
  })

  it('当前版本存档完整加载（含动态内容与图鉴）', () => {
    const s: GameState = newGame()
    s.version = SAVE_VERSION
    s.dynamicSets = [{
      set: { id: 'set_dy1', name: '青元套', pieces: ['w_dy1'], bonuses: [] },
      bases: [{ id: 'w_dy1', name: '青元剑', slot: 'weapon', atk: 10 }],
    }]
    s.dynamicSkills = [{
      id: 'sk_dy1', name: '青元诀', type: 'mind', class: 'any',
      mods: { atkPct: 0.1 }, desc: '测试',
    }]
    s.codex = { items: ['铁剑'], skills: ['sk_sanlian'], sets: [] }
    saveGame(s)

    const loaded = loadGame()
    expect(loaded.dynamicSets).toHaveLength(1)
    expect(loaded.dynamicSets?.[0].set.name).toBe('青元套')
    expect(loaded.dynamicSkills).toHaveLength(1)
    expect(loaded.codex.items).toContain('铁剑')
  })
})
