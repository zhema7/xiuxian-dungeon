// ---------- 弟子合轨单测（v13） ----------
// 目标：锁死「state.disciples 是弟子唯一真源」这一不变量，防止 sect.disciples 双轨复发。

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SAVE_VERSION, loadGame, newGame } from '../src/state'
import { canRecruitDisciple, recruitDisciple, updateDiscipleGrowth } from '../src/disciple-system'
import {
  DISCIPLE_POWER_SCALE, disciplePower, ensureCultivation, generateDisciple,
  healDiscipleShape, sectDisciplePower, type Disciple,
} from '../src/disciple-data'
import { NPC_GEAR_SLOTS } from '../src/npc-progression'
import { makeRng } from '../src/core'
import type { ProceduralNpc } from '../src/procedural-npc'
import { createNewSect } from '../src/sect-data'

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

/** 构造满足收徒条件的最小 NPC（避开 domain / 姓名池等无关依赖） */
function fakeNpc(id: string, over: Partial<ProceduralNpc> = {}): ProceduralNpc {
  return {
    id,
    seed: 1000 + id.length,
    name: '测试' + id,
    gender: 'male',
    age: 30,
    realm: 0,
    level: 3,
    physique: '天灵根',
    profession: '丹师',
    personality: ['淡泊'],
    background: '寒门子弟',
    daoPath: '丹道',
    lifeGoal: '飞升长生',
    currentPurpose: '修炼',
    secret: '无',
    story: { surface: '', middle: '', deep: '' },
    inventory: {},
    equipment: {},
    skills: ['sk_sanlian'],
    gear: { weapon: null, head: null, armor: null, boots: null },
    loadout: { style: null, mind0: null, mind1: null, art: null },
    skillLevels: {},
    cultivation: 0,
    cultivationDays: 0,
    lastGrowthAt: 0,
    breakthroughs: 0,
    power: 0,
    morality: 0,
    location: { domain: 'qingming' as never, x: 100, y: 100 },
    relations: [],
    schedule: { morning: null, afternoon: null, night: null } as never,
    eventLog: [],
    alive: true,
    isActive: true,
    hp: 100,
    maxHp: 100,
    atk: 20,
    def: 10,
    spd: 10,
    appearanceSeed: 42,
    spawnTime: 0,
    ...over,
  } as unknown as ProceduralNpc
}

function preparedState() {
  const state = newGame()
  state.realm = 3
  state.sect = createNewSect('测试宗门', state.worldTime, 0, 0)
  return state
}

function withFavor(state: ReturnType<typeof newGame>, npc: ProceduralNpc, favor = 50) {
  state.playerNpcRelations[npc.id] = {
    npcId: npc.id,
    favor,
    trust: 50,
    fear: 0,
    saved: false,
    killedKnown: [],
    metCount: 1,
    lastInteract: Date.now(),
  }
}

describe('弟子合轨：招募只写真源', () => {
  it('收徒后 state.disciples 增加一条，且是完整 Disciple 实体', () => {
    const state = preparedState()
    const npc = fakeNpc('npc_test_1')
    withFavor(state, npc)

    expect(canRecruitDisciple(state, npc).ok).toBe(true)
    const r = recruitDisciple(state, npc)
    expect(r.ok).toBe(true)

    expect(state.disciples).toHaveLength(1)
    const d = state.disciples[0]
    // 完整实体字段（原 sect.disciples 才有的）
    expect(d.uid).toBeTruthy()
    expect(d.name).toBe(npc.name)
    expect(d.equipment).toBeTruthy()
    expect(d.appearanceSeed).toBe(42)
    expect(Array.isArray(d.talents)).toBe(true)
    // 培养线字段（原 DiscipleData 才有的）
    expect(d.npcId).toBe('npc_test_1')
    expect(d.level).toBe(3)
    expect(d.specialty).toBe('alchemy')
    expect(d.mood).toBe(70)
  })

  it('宗门不再持有 disciples（真源唯一，sect 上无该字段）', () => {
    const state = preparedState()
    const npc = fakeNpc('npc_test_2')
    withFavor(state, npc)
    recruitDisciple(state, npc)

    expect('disciples' in (state.sect as unknown as Record<string, unknown>)).toBe(false)
    // 宗门仍记录招募事件
    const events = (state.sect as unknown as { discipleEvents?: unknown[] }).discipleEvents
    expect(events?.length).toBe(1)
  })

  it('收徒上限按真源计数，不会因双轨而翻倍', () => {
    const state = preparedState()
    for (let i = 0; i < 5; i++) {
      const npc = fakeNpc('npc_multi_' + i)
      withFavor(state, npc)
      recruitDisciple(state, npc)
    }
    // state.realm=3 → 上限 3 + floor(3/2) = 4，第 5 个应被拒
    expect(state.disciples.length).toBe(4)
  })
})

describe('弟子合轨：培养线行为', () => {
  it('无对应世界 NPC 的弟子（宗门自行招录）也能成长', () => {
    const state = preparedState()
    const d: Disciple = {
      uid: 'd_local', name: '自行招录', gender: 'male', daoPath: '剑道',
      background: '寒门子弟', physique: '天灵根', lifeGoal: '飞升长生',
      profession: '宗门弟子', personality: ['淡泊'], appearanceSeed: 1,
      root: 'gold', rootTier: 'common', realm: 0, exp: 0, expToNext: 100,
      talents: [], loyalty: 60, affection: 30, skills: [], status: 'idle',
      questId: null, questStartTime: 0, retreatEndTime: 0, guidanceCooldown: 0,
      sparCooldown: 0, cultivateStartTime: 0, fatigue: 0,
      atk: 30, def: 15, maxHp: 200, crit: 5,
      equipment: { weapon: null, head: null, armor: null, boots: null, charm: null },
      rank: 0, role: null,
    }
    state.disciples.push(d)

    // npcId 为空：不应被 continue 跳过
    updateDiscipleGrowth(state, 60 * 60 * 1000)
    expect(d.exp).toBeGreaterThan(0)
  })

  it('ensureCultivation 幂等且补齐全部培养字段', () => {
    const d = { uid: 'd1', name: '甲' } as Disciple
    ensureCultivation(d)
    const snapshot = { ...d }
    ensureCultivation(d)
    expect({ ...d }).toEqual(snapshot)
    expect(d.specialty).toBe('combat')
    expect(d.trainingFocus).toBe('balanced')
    expect(d.resourcesAllocated).toEqual({ gold: 0, pills: 0, materials: 0 })
  })

  it('healDiscipleShape 把精简/残缺实体补成合法 Disciple', () => {
    const raw = { name: '残缺弟子', realm: 99 }
    healDiscipleShape(raw)
    const d = raw as unknown as Disciple
    expect(d.realm).toBe(6)          // 越界钳制
    expect(d.uid).toBeTruthy()
    expect(d.equipment.weapon).toBeNull()
    expect(d.atk).toBeGreaterThan(0)
  })
})

describe('修为档案下沉到弟子', () => {
  it('新生成的弟子带有铸造装备与功法（不再空白）', () => {
    let withGear = 0
    let withSkills = 0
    for (let i = 0; i < 20; i++) {
      const d = generateDisciple(makeRng(i + 1), 3)
      if (NPC_GEAR_SLOTS.some(s => (d.equipment as Record<string, unknown>)[s])) withGear++
      if (d.skills.length > 0) withSkills++
    }
    // 练气缺件率约 32%，但绝大多数应有装备；功法至少 1 门是必然
    expect(withGear).toBeGreaterThan(10)
    expect(withSkills).toBe(20)
  })

  it('弟子装备 uid 用 discgear_ 前缀，与 NPC 装备可区分', () => {
    let checked = 0
    for (let i = 0; i < 20 && checked < 3; i++) {
      const d = generateDisciple(makeRng(100 + i), 3)
      for (const s of NPC_GEAR_SLOTS) {
        const it = (d.equipment as Record<string, { uid?: string } | null>)[s]
        if (it) {
          expect(it.uid?.startsWith('discgear_')).toBe(true)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('战力随装备与功法提升（档案真的生效，不是摆设）', () => {
    const d = generateDisciple(makeRng(7), 3)
    const bare: Disciple = { ...d, equipment: { weapon: null, head: null, armor: null, boots: null, charm: null }, skills: [] }
    const geared = disciplePower(d)
    expect(geared).toBeGreaterThan(disciplePower(bare))
  })

  it('宗门评估口径统一：sectDisciplePower = 弟子战力和 × 折算系数', () => {
    const list = [0, 1, 2].map(i => generateDisciple(makeRng(200 + i), 3))
    const manual = Math.floor(list.reduce((s, d) => s + disciplePower(d), 0) * DISCIPLE_POWER_SCALE)
    expect(sectDisciplePower(list)).toBe(manual)
    expect(sectDisciplePower([])).toBe(0)
    // 弟子越多，宗门战力贡献越高
    expect(sectDisciplePower(list)).toBeGreaterThan(sectDisciplePower([list[0]]))
  })
})

describe('弟子合轨：旧档迁移', () => {
  beforeEach(() => lsMock.clear())

  it('旧档双轨弟子合并去重，战斗字段与培养字段都保留', () => {
    const base = newGame()
    const raw = {
      ...base,
      version: SAVE_VERSION - 1,
      // 旧轨 A：宗门实体（字段全）
      sect: {
        ...createNewSect('旧宗门', base.worldTime, 0, 0),
        disciples: [{
          uid: 'd_npc_x', name: '旧实体', realm: 2, atk: 999, def: 50, maxHp: 800,
          appearanceSeed: 77, rank: 2, npcId: 'x',
        }],
      },
      // 旧轨 B：培养线（字段少，同一人）
      disciples: [{
        npcId: 'x', name: '旧培养', realm: 2, level: 7, specialty: 'management',
        mood: 40, loyalty: 80, trainingFocus: 'cultivation',
      }],
    }
    store[SAVE_KEY] = JSON.stringify(raw)

    const s = loadGame()
    expect(s.disciples).toHaveLength(1)   // 按 npcId 去重
    const d = s.disciples[0]
    expect(d.name).toBe('旧实体')          // 实体侧字段胜出
    expect(d.atk).toBe(999)
    expect(d.appearanceSeed).toBe(77)
    expect(d.level).toBe(7)               // 培养侧字段合并进来
    expect(d.specialty).toBe('management')
    expect(d.mood).toBe(40)
  })

  it('只在培养线出现的记录会被补成合法实体并入', () => {
    const base = newGame()
    const raw = {
      ...base,
      version: SAVE_VERSION - 1,
      disciples: [{ npcId: 'y', name: '仅培养线', realm: 1, level: 4 }],
    }
    store[SAVE_KEY] = JSON.stringify(raw)

    const s = loadGame()
    expect(s.disciples).toHaveLength(1)
    const d = s.disciples[0]
    expect(d.name).toBe('仅培养线')
    expect(d.level).toBe(4)
    expect(d.uid).toBeTruthy()
    expect(d.equipment).toBeTruthy()
  })
})
