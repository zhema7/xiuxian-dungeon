// ---------- NPC 系统 / AI 宗门 / 外交结算 三系统单测 ----------
// 覆盖 src/npc-data.ts、src/npc-system.ts、src/ai-sect-data.ts、src/diplomacy.ts
//
// 说明：npc-system 与 diplomacy 通过 src/ui.ts 间接依赖 Phaser（ui → audio → phaser）
// 与 DOM（input.ts 模块级 new InputPort() → document）。这里用 vi.mock（编译期提升）
// 替换掉这三个壳模块，被测模块本身不做任何改动。

import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui', () => ({
  toast: vi.fn(),
  showDialog: vi.fn(async () => 'ok'),
  dialogOpen: vi.fn(() => false),
}))
vi.mock('../src/audio', () => ({ sfx: vi.fn() }))
vi.mock('../src/input', () => ({ input: { clearQueues: vi.fn() } }))

import {
  NPC_DEFS, RELATION_THRESHOLDS, STORIES, getNpcDef, getNpcsByLocation, createNpcState,
  npcCultivate, changeFavor, getRelation, npcExpToNext, npcBreakthroughChance, getStory,
  type NpcLocation, type NpcRole, type NpcState, type RelationLevel,
} from '../src/npc-data'
import { initNpcStates, updateNpcGrowth, getNpcDisplayInfo, getLocationNpcs, talkToNpc, syncNpcStoryAvailability } from '../src/npc-system'
// showDialog / toast 等来自被 vi.mock 替换的壳模块，取引用来编排对话分支
import { showDialog } from '../src/ui'
import {
  DIPLOMACY_ACTIONS, generateAiSectName, generateAiSect, generateResourceNodes,
  getDiplomacyStatus, diplomacyStatusName, dispositionDesc, aiAcceptDiplomacy, aiSectTick,
  calcSectPower, type AiSect, type AiSectDisposition, type DiplomacyActionType,
  type DiplomacyStatus, type ResourceNode,
} from '../src/ai-sect-data'
import {
  processTradeIncome, tickAllAiSects, processResourceIncome, processVassalTribute, checkRebellion,
} from '../src/diplomacy'
import type { GameState } from '../src/state'
import { makeRng } from '../src/core'
import {
  installLocalStorageStub, makeState, makeSect, makeAiSect, constRng, seqRng,
} from './system-test-helpers'

beforeAll(() => installLocalStorageStub())

const LOCATIONS: NpcLocation[] = ['home', 'city', 'sect', 'world', 'arena']
const ROLES: NpcRole[] = [
  'elder', 'merchant', 'healer', 'arena_master', 'alchemist', 'blacksmith', 'scholar',
  'innkeeper', 'sect_elder', 'wanderer', 'hermit', 'scout', 'rival', 'champion', 'city_lord',
]
const DISPOSITIONS: AiSectDisposition[] = ['aggressive', 'diplomatic', 'isolationist', 'expansionist', 'mercantile']
const ACTION_TYPES: DiplomacyActionType[] = [
  'send_envoy', 'propose_trade', 'propose_alliance', 'declare_war',
  'request_tribute', 'sign_peace', 'scout',
]
const STATUSES: DiplomacyStatus[] = ['war', 'hostile', 'neutral', 'friendly', 'allied', 'vassal']
const HAS_CJK = /[一-龥]/

// ==================== NPC 数据表 ====================
describe('NPC 定义表', () => {
  it('20 个 NPC，id 唯一，字段完整', () => {
    expect(NPC_DEFS).toHaveLength(20)
    const ids = NPC_DEFS.map(n => n.id)
    expect(new Set(ids).size).toBe(20)
    for (const n of NPC_DEFS) {
      expect(n.name.length).toBeGreaterThan(0)
      expect(n.title.length).toBeGreaterThan(0)
      expect(n.desc.length).toBeGreaterThan(0)
      expect(LOCATIONS).toContain(n.location)
      expect(ROLES).toContain(n.role)
      expect(n.baseRealm).toBeGreaterThanOrEqual(0)
      expect(n.cultSpeed).toBeGreaterThan(0)
      expect(n.preferredGift.length).toBeGreaterThan(0)
      expect(n.giftHint.length).toBeGreaterThan(0)
      expect(n.dialogues.length).toBeGreaterThan(0)
      expect(n.highFavorDialogues.length).toBeGreaterThan(0)
      expect(typeof n.canGift).toBe('boolean')
    }
  })

  it('按地点分组后总数守恒，每个地点都有 NPC', () => {
    let sum = 0
    for (const loc of LOCATIONS) {
      const list = getNpcsByLocation(loc)
      expect(list.length).toBeGreaterThan(0)
      for (const n of list) expect(n.location).toBe(loc)
      sum += list.length
    }
    expect(sum).toBe(NPC_DEFS.length)
  })

  it('getNpcDef 命中与未命中', () => {
    expect(getNpcDef('npc_elder')!.name).toBe('玄清子')
    expect(getNpcDef('不存在')).toBeUndefined()
  })

  it('【已知缺陷 B13】隐士 npc_hermit 的对话残留英文占位文本', () => {
    // 复现：npc-data.ts 中 npc_hermit.dialogues[0] = ' Leave me to my cultivation... '
    // 全中文语境下会原样显示给玩家，且首尾带空格。建议替换为中文台词。
    const hermit = getNpcDef('npc_hermit')!
    expect(hermit.dialogues[0].trim()).toBe('Leave me to my cultivation...')
    // 全表中只有这一处非中文台词
    const nonChinese = NPC_DEFS.flatMap(n =>
      [...n.dialogues, ...n.highFavorDialogues]
        .filter(line => !HAS_CJK.test(line))
        .map(line => `${n.id}:${line.trim()}`),
    )
    expect(nonChinese).toEqual(['npc_hermit:Leave me to my cultivation...'])
  })
})

describe('关系等级', () => {
  it('阈值表按好感递增排列', () => {
    expect(RELATION_THRESHOLDS).toHaveLength(6)
    for (let i = 1; i < RELATION_THRESHOLDS.length; i++) {
      expect(RELATION_THRESHOLDS[i].favor).toBeGreaterThan(RELATION_THRESHOLDS[i - 1].favor)
    }
    const levels = RELATION_THRESHOLDS.map(t => t.level) as RelationLevel[]
    expect(new Set(levels).size).toBe(6)
    for (const t of RELATION_THRESHOLDS) expect(t.name.length).toBeGreaterThan(0)
  })

  it('在 [-50, 500] 区间内，好感提升时关系单调变好', () => {
    // 注意：低于 -50 的区间存在倒挂，见下方「已知缺陷 B24」。
    let prevIndex = -1
    for (let favor = -50; favor <= 500; favor += 10) {
      const idx = RELATION_THRESHOLDS.findIndex(t => t.level === getRelation(favor).level)
      expect(idx).toBeGreaterThanOrEqual(prevIndex)
      prevIndex = idx
    }
  })

  it('边界值命中正确档位', () => {
    expect(getRelation(0).level).toBe('neutral')
    expect(getRelation(29).level).toBe('neutral')
    expect(getRelation(30).level).toBe('acquaintance')
    expect(getRelation(80).level).toBe('friendly')
    expect(getRelation(160).level).toBe('trusted')
    expect(getRelation(280).level).toBe('sworn')
    expect(getRelation(9999).level).toBe('sworn')
    expect(getRelation(-50).level).toBe('hostile')
  })

  it('【已知缺陷 B24】好感低于 -50 时关系反而回落到"初识"（敌视档不可达）', () => {
    // 复现：getRelation 的初值取 RELATION_THRESHOLDS[1]（初识/neutral），
    // 循环条件 favor >= t.favor 对 hostile 档（阈值 -50）在 favor < -50 时不成立，
    // 于是兜底值仍是"初识"，出现 -49 → 敌视、-51 → 初识 的倒挂。
    // changeFavor 的下界正是 -100，该区间可达（如宿敌初始 -30 再吃罚）。
    // 建议：初值改为 RELATION_THRESHOLDS[0]。
    expect(getRelation(-49).level).toBe('hostile')
    expect(getRelation(-51).level).toBe('neutral')
    expect(getRelation(-100).level).toBe('neutral')
    expect(getRelation(-100).name).toBe('初识')
  })
})

describe('NPC 修炼与好感', () => {
  it('升级经验随境界递增', () => {
    expect(npcExpToNext(0)).toBe(200)
    expect(npcExpToNext(1)).toBe(400)
    expect(npcExpToNext(2)).toBe(700)
    for (let r = 1; r <= 10; r++) expect(npcExpToNext(r)).toBeGreaterThan(npcExpToNext(r - 1))
  })

  it('突破概率随境界下降、随修炼速度上升，并有 0.2 下限', () => {
    expect(npcBreakthroughChance(0, 0)).toBeCloseTo(0.7, 10)
    expect(npcBreakthroughChance(6, 0)).toBeCloseTo(0.4, 10)
    expect(npcBreakthroughChance(3, 0)).toBeGreaterThan(npcBreakthroughChance(5, 0))
    expect(npcBreakthroughChance(0, 10)).toBeGreaterThan(npcBreakthroughChance(0, 0))
    expect(npcBreakthroughChance(50, 0)).toBe(0.2)
    for (let r = 0; r <= 20; r++) {
      const c = npcBreakthroughChance(r, 2)
      expect(c).toBeGreaterThanOrEqual(0.2)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('createNpcState 由定义生成初始状态', () => {
    const elder = getNpcDef('npc_elder')!
    const ns = createNpcState(elder)
    expect(ns.id).toBe(elder.id)
    expect(ns.realm).toBe(elder.baseRealm)
    expect(ns.exp).toBe(0)
    expect(ns.expToNext).toBe(npcExpToNext(elder.baseRealm))
    expect(ns.favor).toBe(elder.baseFavor)
    expect(ns.storyProgress).toBe(0)
    expect(ns.lastInteract).toBe(0)
    expect(ns.alive).toBe(true)
    // 只有玄清子与陆青鸢开局就有故事线
    expect(ns.storyStage).toBe('available')
    expect(createNpcState(getNpcDef('npc_merchant')!).storyStage).toBe('locked')
  })

  it('npcCultivate 按 cultSpeed × 分钟累积经验；达标后尝试突破', () => {
    const def = getNpcDef('npc_elder')! // baseRealm 3, cultSpeed 2 → expToNext 1100
    const ns = createNpcState(def)
    expect(ns.expToNext).toBe(1100)

    // 未达标：只累积不突破
    expect(npcCultivate(ns, def, 100, constRng(0))).toBe(false)
    expect(ns.exp).toBe(200) // floor(2 * 100)
    expect(ns.realm).toBe(3)

    // 达标且 rng 命中 → 突破成功
    npcCultivate(ns, def, 450, constRng(0)) // exp 1100
    expect(ns.realm).toBe(4)
    expect(ns.exp).toBe(0)
    expect(ns.expToNext).toBe(npcExpToNext(4))
  })

  it('突破失败时经验减半而非清零', () => {
    const def = getNpcDef('npc_elder')!
    const ns = createNpcState(def)
    npcCultivate(ns, def, 550, constRng(0.999999)) // exp 1100，chance 0.57，rng 0.999999 不中
    expect(ns.realm).toBe(3)
    expect(ns.exp).toBe(Math.floor(1100 * 0.5))
  })

  it('已故 NPC 不再修炼；境界达上限（6）后不再突破', () => {
    const def = getNpcDef('npc_elder')!
    const dead: NpcState = { ...createNpcState(def), alive: false }
    expect(npcCultivate(dead, def, 10000, constRng(0))).toBe(false)
    expect(dead.exp).toBe(0)

    const capped: NpcState = { ...createNpcState(def), realm: 6, exp: 99999, expToNext: 1 }
    expect(npcCultivate(capped, def, 1, constRng(0))).toBe(false)
    expect(capped.realm).toBe(6)
  })

  it('changeFavor 钳制在 [-100, 500] 并返回关系是否跨档', () => {
    const ns = createNpcState(getNpcDef('npc_merchant')!) // baseFavor 0
    expect(changeFavor(ns, 99999)).toBe(true)
    expect(ns.favor).toBe(500)
    expect(changeFavor(ns, -99999)).toBe(true)
    expect(ns.favor).toBe(-100)
    expect(changeFavor(ns, 5)).toBe(false)
    expect(ns.favor).toBe(-95)
  })
})

describe('NPC 故事线', () => {
  it('5 条故事线，npcId 均在 NPC 定义表中存在', () => {
    expect(STORIES).toHaveLength(5)
    const npcIds = new Set(NPC_DEFS.map(n => n.id))
    const storyIds = STORIES.map(s => s.id)
    expect(new Set(storyIds).size).toBe(5)
    for (const s of STORIES) {
      expect(npcIds.has(s.npcId)).toBe(true)
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.desc.length).toBeGreaterThan(0)
      expect(s.requireFavor).toBeGreaterThanOrEqual(0)
      expect(s.requireLevel).toBeGreaterThan(0)
      expect(s.stages.length).toBeGreaterThan(0)
    }
  })

  it('阶段 index 从 0 连续递增，末阶段无条件可完成', () => {
    for (const s of STORIES) {
      s.stages.forEach((st, i) => {
        expect(st.index).toBe(i)
        expect(st.text.length).toBeGreaterThan(0)
        expect(st.objective.length).toBeGreaterThan(0)
        expect(st.reward.length).toBeGreaterThan(0)
        expect(typeof st.check).toBe('function')
      })
      const last = s.stages[s.stages.length - 1]
      expect(last.check(0, 0, 0)).toBe(true)
    }
  })

  it('5 条故事线全部可开启：有故事的 NPC 初始即为 available（B27 已修复）', () => {
    // 修复前：createNpcState 只硬编码 npc_elder / npc_sister 为 'available'，其余一律 'locked'，
    // 且全仓没有任何 locked → available 的迁移路径，导致「城主的考验」「宿敌的觉悟」
    // 「隐士的传承」三条故事线成为死内容。
    // 修复后：初始状态由 STORIES 表判定 —— 有故事即可接取，
    // 等级 / 好感门槛交给 progressStory 的 requireLevel / requireFavor（会给出明确提示文案）。
    const storyNpcIds = STORIES.map(s => s.npcId)
    expect(storyNpcIds.sort()).toEqual(
      ['npc_city_lord', 'npc_elder', 'npc_hermit', 'npc_rival', 'npc_sister'].sort(),
    )
    for (const def of NPC_DEFS) {
      const expected = storyNpcIds.includes(def.id) ? 'available' : 'locked'
      expect(createNpcState(def).storyStage, `${def.id} 的初始故事状态`).toBe(expected)
    }
    // 20 个 NPC 中恰好 5 个带故事线
    expect(NPC_DEFS).toHaveLength(20)
    expect(NPC_DEFS.filter(d => createNpcState(d).storyStage === 'available')).toHaveLength(5)
  })

  it('旧存档迁移：locked 但有故事的 NPC 会被提升为 available（B27 回归）', () => {
    // 修复前生成的存档里，有故事的 NPC 也可能停留在 'locked'，需要一条解锁路径，
    // 否则旧档玩家依然看不到这三条故事线。
    const dead = ['npc_city_lord', 'npc_rival', 'npc_hermit']
    const s = makeState({ npcStates: {}, level: 1 })
    initNpcStates(s)
    for (const id of dead) s.npcStates[id].storyStage = 'locked'
    for (const id of dead) expect(s.npcStates[id].storyStage).toBe('locked')

    syncNpcStoryAvailability(s)
    for (const id of dead) {
      expect(getStory(id)).toBeDefined()
      expect(s.npcStates[id].storyStage, `${id} 应被迁移到 available`).toBe('available')
    }

    // 只做单向提升：已推进 / 已完成的状态绝不被回退
    const s2 = makeState({ npcStates: {}, level: 1 })
    initNpcStates(s2)
    s2.npcStates.npc_elder.storyStage = 'completed'
    s2.npcStates.npc_rival.storyStage = 'active'
    syncNpcStoryAvailability(s2)
    expect(s2.npcStates.npc_elder.storyStage).toBe('completed')
    expect(s2.npcStates.npc_rival.storyStage).toBe('active')
  })

  it('有故事的 5 个 NPC 开局即可接故事，无故事的保持 locked', () => {
    for (const id of ['npc_elder', 'npc_sister', 'npc_city_lord', 'npc_rival', 'npc_hermit']) {
      expect(createNpcState(getNpcDef(id)!).storyStage).toBe('available')
    }
    expect(createNpcState(getNpcDef('npc_merchant')!).storyStage).toBe('locked')
  })
})

// ==================== NPC 系统逻辑 ====================
describe('initNpcStates', () => {
  it('为全部 NPC 生成状态', () => {
    const s = makeState({ npcStates: {} })
    initNpcStates(s)
    expect(Object.keys(s.npcStates)).toHaveLength(NPC_DEFS.length)
    for (const def of NPC_DEFS) expect(s.npcStates[def.id].id).toBe(def.id)
  })

  it('幂等：已存在的状态不被覆盖', () => {
    const s = makeState({ npcStates: {} })
    initNpcStates(s)
    s.npcStates.npc_elder.favor = 400
    s.npcStates.npc_elder.realm = 6
    initNpcStates(s)
    expect(s.npcStates.npc_elder.favor).toBe(400)
    expect(s.npcStates.npc_elder.realm).toBe(6)
  })

  it('npcStates 缺失时自动初始化', () => {
    const s = makeState({ npcStates: undefined as never })
    expect(() => initNpcStates(s)).not.toThrow()
    expect(Object.keys(s.npcStates)).toHaveLength(NPC_DEFS.length)
  })
})

describe('getNpcDisplayInfo / getLocationNpcs', () => {
  it('返回名称、称号、境界与关系名', () => {
    const s = makeState({ npcStates: {} })
    const info = getNpcDisplayInfo(s, 'npc_elder')!
    expect(info.name).toBe('玄清子')
    expect(info.title).toBe('青冥长老')
    expect(info.realm).toBe(3)
    expect(info.relation).toBe(getRelation(15).name)
  })

  it('未知 NPC id 返回 null', () => {
    expect(getNpcDisplayInfo(makeState({ npcStates: {} }), '不存在')).toBeNull()
  })

  it('按地点返回 定义+状态 配对，且自动初始化状态', () => {
    const s = makeState({ npcStates: {} })
    const home = getLocationNpcs(s, 'home')
    expect(home).toHaveLength(2)
    for (const n of home) {
      expect(n.def.location).toBe('home')
      expect(n.state.id).toBe(n.def.id)
    }
    expect(s.npcStates.npc_elder).toBeDefined()
  })

  it('未知地点返回空数组而非抛错', () => {
    expect(getLocationNpcs(makeState({ npcStates: {} }), '不存在的地点')).toEqual([])
  })
})

// ==================== 故事线端到端 ====================
describe('故事线逐条可开启（B27 回归）', () => {
  it('5 条故事线都能从 available 走到 completed', async () => {
    // 走真实入口 talkToNpc：外层对话框选「故事」，内层选「完成」，逐段推进直到完成。
    // 修复前，除「长老的心愿」「道友的羁绊」外的 3 条连「故事」选项都不会出现，
    // 玩家无论练到多少级、刷到多少好感都无法开启。
    vi.mocked(showDialog).mockReset()
    vi.mocked(showDialog).mockResolvedValue('ok')

    expect(STORIES).toHaveLength(5)
    for (const story of STORIES) {
      const s = makeState({ npcStates: {}, level: 99 })
      initNpcStates(s)
      const ns = s.npcStates[story.npcId]
      expect(getStory(story.npcId)).toBe(story)

      // 满足该故事线的触发门槛（等级与好感）
      ns.favor = Math.max(story.requireFavor, 80)
      expect(ns.storyStage, `${story.name} 应处于可开启状态`).toBe('available')

      for (let step = 0; step < story.stages.length; step++) {
        // 每次 talkToNpc 消耗两次对话：外层「故事」→ 内层「完成」
        vi.mocked(showDialog)
          .mockResolvedValueOnce('story')
          .mockResolvedValueOnce('complete')
        await talkToNpc(s, story.npcId)
      }

      expect(ns.storyProgress, `${story.name} 的阶段进度`).toBe(story.stages.length)
      expect(ns.storyStage, `${story.name} 应能走到完成`).toBe('completed')
    }
  })

  it('门槛未达标时给出提示且不开启故事线', async () => {
    // 有故事 ≠ 无条件可推进：等级 / 好感不足时 progressStory 应停在 available 并提示原因。
    vi.mocked(showDialog).mockReset()
    vi.mocked(showDialog).mockResolvedValue('ok')

    const story = getStory('npc_hermit')!  // requireFavor 50 / requireLevel 25
    const s = makeState({ npcStates: {}, level: 1 })
    initNpcStates(s)
    const ns = s.npcStates.npc_hermit
    ns.favor = 0

    vi.mocked(showDialog).mockResolvedValueOnce('story')
    await talkToNpc(s, 'npc_hermit')

    expect(ns.storyStage).toBe('available')
    expect(ns.storyProgress).toBe(0)
    // 提示里应说明差的是好感还是等级
    const lines = vi.mocked(showDialog).mock.calls.at(-1)?.[1] as string[]
    expect(lines.join('\n')).toMatch(/需要(好感|等级)/)
  })
})

describe('updateNpcGrowth', () => {
  it('推进 0 分钟不产生突破', () => {
    const s = makeState({ npcStates: {} })
    initNpcStates(s)
    const before = s.npcStates.npc_elder.exp
    expect(updateNpcGrowth(s, 0)).toEqual([])
    expect(s.npcStates.npc_elder.exp).toBe(before)
  })

  it('返回值为字符串数组，元素形如「<名字> 突破至 N 境！」', () => {
    const s = makeState({ npcStates: {} })
    initNpcStates(s)
    const events = updateNpcGrowth(s, 100000)
    expect(Array.isArray(events)).toBe(true)
    for (const e of events) {
      expect(typeof e).toBe('string')
      expect(e).toMatch(/突破至 \d+ 境！$/)
    }
  })

  it('跳过已故 NPC 且不抛错', () => {
    const s = makeState({ npcStates: {} })
    initNpcStates(s)
    s.npcStates.npc_elder.alive = false
    const before = { ...s.npcStates.npc_elder }
    expect(() => updateNpcGrowth(s, 5000)).not.toThrow()
    expect(s.npcStates.npc_elder.exp).toBe(before.exp)
  })

  it('npcStates 缺失时返回空数组', () => {
    expect(updateNpcGrowth(makeState({ npcStates: undefined as never }), 100)).toEqual([])
  })

  it('【已知缺陷 B25】updateNpcGrowth 内部用 Date.now()/60000 播种，结果不可复现', () => {
    // 复现：const rng = makeRng(Math.floor(Date.now() / 60000))，同一分钟内两次调用
    // 会得到相同结果，跨分钟则不同；无法在测试中注入固定 rng。
    // 建议：将 rng 作为参数传入（或由调用方注入），便于回归测试与存档回放。
    const s = makeState({ npcStates: {} })
    initNpcStates(s)
    const a = updateNpcGrowth(s, 0) // 无副作用
    const b = updateNpcGrowth(s, 0)
    expect(a).toEqual(b) // 仅说明调用本身稳定，不等于 rng 可注入
  })
})

// ==================== AI 宗门数据 ====================
describe('外交行动配置表', () => {
  it('7 种行动齐备且字段合法', () => {
    expect(Object.keys(DIPLOMACY_ACTIONS)).toHaveLength(7)
    for (const t of ACTION_TYPES) {
      const a = DIPLOMACY_ACTIONS[t]
      expect(a.type).toBe(t)
      expect(a.name.length).toBeGreaterThan(0)
      expect(a.desc.length).toBeGreaterThan(0)
      expect(a.cooldown).toBeGreaterThan(0)
      expect(typeof a.relationReq).toBe('number')
      for (const v of Object.values(a.cost)) expect(v!).toBeGreaterThanOrEqual(0)
    }
  })

  it('高门槛行动要求更高外交值', () => {
    expect(DIPLOMACY_ACTIONS.propose_alliance.relationReq)
      .toBeGreaterThan(DIPLOMACY_ACTIONS.propose_trade.relationReq)
    expect(DIPLOMACY_ACTIONS.propose_trade.relationReq)
      .toBeGreaterThan(DIPLOMACY_ACTIONS.send_envoy.relationReq)
  })

  it('外交状态中文名覆盖全部状态', () => {
    for (const st of STATUSES) expect(diplomacyStatusName(st).length).toBeGreaterThan(0)
    expect(new Set(STATUSES.map(diplomacyStatusName)).size).toBe(6)
  })

  it('性格描述覆盖全部性格', () => {
    for (const d of DISPOSITIONS) expect(dispositionDesc(d).length).toBeGreaterThan(0)
  })
})

describe('AI 宗门生成', () => {
  it('宗门名由前缀+后缀组成', () => {
    expect(generateAiSectName(constRng(0))).toBe('苍剑宗')
    expect(generateAiSectName(constRng(0.999999))).toBe('玉清火宗')
    for (let i = 0; i < 200; i++) {
      expect(generateAiSectName(makeRng(i)).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('生成结果字段完整且 id 由 index 决定', () => {
    for (let idx = 0; idx < 8; idx++) {
      const ai = generateAiSect(makeRng(idx + 1), 10, idx)
      expect(ai.id).toBe(`ai_sect_${idx}`)
      expect(ai.level).toBeGreaterThanOrEqual(1)
      expect(ai.power).toBeGreaterThan(0)
      expect(DISPOSITIONS).toContain(ai.disposition)
      expect(ai.mapX).toBeGreaterThanOrEqual(200)
      expect(ai.mapX).toBeLessThanOrEqual(999)
      expect(ai.mapY).toBeGreaterThanOrEqual(300)
      expect(ai.mapY).toBeLessThanOrEqual(1299)
      expect(ai.resources.stone).toBeGreaterThanOrEqual(300)
      expect(ai.discipleCount).toBeGreaterThan(0)
      expect(ai.relationValue).toBeGreaterThanOrEqual(-100)
      expect(ai.relationValue).toBeLessThanOrEqual(100)
      expect(ai.defeated).toBe(false)
      expect(ai.vassalOf).toBeNull()
      expect(ai.atWar).toBe(false)
      expect(ai.tradeAgreement).toBe(false)
      expect(ai.alliance).toBe(false)
      expect(ai.warExhaustion).toBe(0)
      expect(ai.cooldownUntil).toBe(0)
      expect(ai.attackTimer).toBe(0)
      expect(ai.originalPower).toBe(ai.power)
      expect(ai.tributeRate).toBe(0)
      expect(ai.rebellionChance).toBe(0)
    }
  })

  it('低玩家等级时宗门等级不低于 1', () => {
    for (let i = 0; i < 300; i++) {
      expect(generateAiSect(makeRng(i), 1, 0).level).toBeGreaterThanOrEqual(1)
    }
  })

  it('资源点 8 个，id 唯一，产出非空', () => {
    const nodes = generateResourceNodes(makeRng(9))
    expect(nodes).toHaveLength(8)
    const ids = nodes.map(n => n.id)
    expect(new Set(ids).size).toBe(8)
    for (const n of nodes) {
      expect(n.name.length).toBeGreaterThan(0)
      expect(n.x).toBeGreaterThanOrEqual(150)
      expect(n.y).toBeGreaterThanOrEqual(250)
      expect(n.garrison).toBeGreaterThan(0)
      expect(n.contested).toBe(false)
      expect(Object.keys(n.production).length).toBeGreaterThan(0)
      for (const v of Object.values(n.production)) expect(v!).toBeGreaterThan(0)
    }
  })

  it('【数据可调项】资源点归属按 floor(i/2) 分配，ai_sect_0 永远无主', () => {
    // 观察值：i<3 为无主；i>=3 归属 ai_sect_floor(i/2) → 1,2,2,3,3。
    // ai_sect_0（首个 AI 宗门）从不拥有资源点，且 ai_sect_4 及以上也未被引用。
    // 若后续 AI 宗门数量调整，此处需同步。当前按现状锁定。
    const nodes = generateResourceNodes(constRng(0))
    expect(nodes.map(n => n.ownerId)).toEqual([
      null, null, null, 'ai_sect_1', 'ai_sect_2', 'ai_sect_2', 'ai_sect_3', 'ai_sect_3',
    ])
    expect(nodes.some(n => n.ownerId === 'ai_sect_0')).toBe(false)
  })
})

describe('getDiplomacyStatus', () => {
  it('附庸 > 交战 > 同盟 > 友好 > 中立 > 敌对', () => {
    expect(getDiplomacyStatus(0, false, false, 'player')).toBe('vassal')
    expect(getDiplomacyStatus(100, true, true, null)).toBe('war')
    expect(getDiplomacyStatus(100, false, true, null)).toBe('allied')
    expect(getDiplomacyStatus(60, false, false, null)).toBe('friendly')
    expect(getDiplomacyStatus(59, false, false, null)).toBe('neutral')
    expect(getDiplomacyStatus(10, false, false, null)).toBe('neutral')
    expect(getDiplomacyStatus(9, false, false, null)).toBe('hostile')
    expect(getDiplomacyStatus(-100, false, false, null)).toBe('hostile')
  })

  it('【已知缺陷 B8】末尾两个分支都返回 hostile，存在不可达代码', () => {
    // 复现：src/ai-sect-data.ts
    //   if (relationValue >= -30) return 'hostile'
    //   return 'hostile'
    // 两个分支返回值相同，-30 这个阈值没有任何实际效果。
    // 从注释与档位设计推测，原意可能是低于 -30 时返回更严重的状态（或 war）。
    // 建议：删除冗余分支，或补上缺失的档位。
    expect(getDiplomacyStatus(-30, false, false, null)).toBe('hostile')
    expect(getDiplomacyStatus(-31, false, false, null)).toBe('hostile')
    expect(getDiplomacyStatus(-100, false, false, null)).toBe('hostile')
  })
})

describe('aiAcceptDiplomacy 决策', () => {
  const player = 10000

  it('使者 / 宣战 / 侦查 必定接受', () => {
    for (const action of ['send_envoy', 'declare_war', 'scout'] as DiplomacyActionType[]) {
      for (const disp of DISPOSITIONS) {
        const ai = makeAiSect({ disposition: disp, relationValue: -100 })
        const r = aiAcceptDiplomacy(ai, action, player, constRng(0.99))
        expect(r.accept).toBe(true)
        expect(r.reason.length).toBeGreaterThan(0)
      }
    }
  })

  it('通商：重商必接受；关系不足或闭关锁国必拒绝', () => {
    expect(aiAcceptDiplomacy(makeAiSect({ disposition: 'mercantile', relationValue: -100 }), 'propose_trade', player, constRng(0)).accept).toBe(true)
    expect(aiAcceptDiplomacy(makeAiSect({ disposition: 'diplomatic', relationValue: 9 }), 'propose_trade', player, constRng(0)).accept).toBe(false)
    expect(aiAcceptDiplomacy(makeAiSect({ disposition: 'isolationist', relationValue: 100 }), 'propose_trade', player, constRng(0)).accept).toBe(false)
  })

  it('结盟：关系不足 / 好战 / 实力被看轻 均拒绝', () => {
    expect(aiAcceptDiplomacy(makeAiSect({ relationValue: 49 }), 'propose_alliance', player, constRng(0)).accept).toBe(false)
    expect(aiAcceptDiplomacy(makeAiSect({ relationValue: 100, disposition: 'aggressive' }), 'propose_alliance', player, constRng(0)).accept).toBe(false)
    expect(aiAcceptDiplomacy(makeAiSect({ relationValue: 100, power: 100000 }), 'propose_alliance', 10, constRng(0)).accept).toBe(false)
  })

  it('进贡：实力不足以压制则拒绝', () => {
    expect(aiAcceptDiplomacy(makeAiSect({ power: 10000 }), 'request_tribute', 10000, constRng(0)).accept).toBe(false)
    expect(aiAcceptDiplomacy(makeAiSect({ power: 100, disposition: 'aggressive' }), 'request_tribute', 10000, constRng(0.99)).accept).toBe(false)
  })

  it('和谈：厌战必接受，仇恨太深必拒绝', () => {
    expect(aiAcceptDiplomacy(makeAiSect({ warExhaustion: 51, relationValue: -100 }), 'sign_peace', player, constRng(0)).accept).toBe(true)
    expect(aiAcceptDiplomacy(makeAiSect({ warExhaustion: 0, relationValue: -100 }), 'sign_peace', player, constRng(0)).accept).toBe(false)
  })

  it('power 为 0 时不产生除零（Math.max(1, ai.power) 兜底）', () => {
    const ai = makeAiSect({ power: 0, relationValue: 100 })
    const r = aiAcceptDiplomacy(ai, 'propose_alliance', 100, constRng(0))
    expect(Number.isNaN(r.accept)).toBe(false)
    expect(typeof r.accept).toBe('boolean')
  })

  it('【已知缺陷 B4】随机分支对 rng 调用两次，accept 与 reason 会自相矛盾', () => {
    // 复现：src/ai-sect-data.ts 中 propose_trade / propose_alliance / request_tribute /
    // sign_peace 四个分支写成
    //   return { accept: rng() > p, reason: rng() > p ? '同意…' : '拒绝…' }
    // 两次独立取随机数，约 42% 的情况下会出现「accept=true 但文案说拒绝」（或反之），
    // 玩家会看到自相矛盾的对话。
    // 建议：const ok = rng() > p; return { accept: ok, reason: ok ? '…' : '…' }
    const trade = aiAcceptDiplomacy(makeAiSect({ disposition: 'diplomatic', relationValue: 30 }), 'propose_trade', player, seqRng([0.5, 0.1]))
    expect(trade.accept).toBe(true)
    expect(trade.reason).toContain('婉拒')

    const alliance = aiAcceptDiplomacy(makeAiSect({ relationValue: 100 }), 'propose_alliance', player, seqRng([0.5, 0.1]))
    expect(alliance.accept).toBe(true)
    expect(alliance.reason).toContain('暂不考虑')

    const tribute = aiAcceptDiplomacy(makeAiSect({ power: 100 }), 'request_tribute', player, seqRng([0.5, 0.1]))
    expect(tribute.accept).toBe(true)
    expect(tribute.reason).toContain('拒绝')

    const peace = aiAcceptDiplomacy(makeAiSect({ warExhaustion: 10, relationValue: 0 }), 'sign_peace', player, seqRng([0.5, 0.1]))
    expect(peace.accept).toBe(true)
    expect(peace.reason).toContain('拒绝')
  })

  it('实测矛盾率约 42%（20000 次抽样）', () => {
    let mismatch = 0
    const N = 20000
    for (let i = 0; i < N; i++) {
      const ai = makeAiSect({ disposition: 'diplomatic', relationValue: 30 })
      const r = aiAcceptDiplomacy(ai, 'propose_trade', 5000, makeRng(i))
      if (r.accept !== r.reason.includes('同意')) mismatch++
    }
    const rate = mismatch / N
    expect(rate).toBeGreaterThan(0.35)
    expect(rate).toBeLessThan(0.5)
  })
})

describe('aiSectTick', () => {
  it('已覆灭或冷却中不做任何事', () => {
    const defeated = makeAiSect({ defeated: true })
    expect(aiSectTick(defeated, 1000, constRng(0))).toBeNull()
    expect(defeated.resources.stone).toBe(1000)

    const cooling = makeAiSect({ cooldownUntil: Date.now() + 60000 })
    expect(aiSectTick(cooling, 1000, constRng(0))).toBeNull()
    expect(cooling.resources.stone).toBe(1000)
  })

  it('常规 tick 累积资源并衰减战争疲劳', () => {
    const ai = makeAiSect({ level: 4, warExhaustion: 10, disposition: 'isolationist' })
    const before = { ...ai.resources }
    aiSectTick(ai, 10000, constRng(0.99)) // rng 高 → 不触发概率分支
    expect(ai.resources.stone).toBe(before.stone + 20)      // level*5
    expect(ai.resources.herb).toBe(before.herb + 10)        // floor(20*0.5)
    expect(ai.resources.ore).toBe(before.ore + 8)           // floor(20*0.4)
    expect(ai.resources.wood).toBe(before.wood + 12)        // floor(20*0.6)
    expect(ai.warExhaustion).toBe(8)
  })

  it('战争疲劳衰减有 0 下限', () => {
    const ai = makeAiSect({ warExhaustion: 1, disposition: 'isolationist' })
    aiSectTick(ai, 1000, constRng(0.99))
    expect(ai.warExhaustion).toBe(0)
  })

  it('附庸：设置默认进贡率并评估叛乱概率，不返回事件', () => {
    const ai = makeAiSect({ vassalOf: 'player', tributeRate: 0, power: 9000, warExhaustion: 0, originalPower: 9000 })
    expect(aiSectTick(ai, 1000, constRng(0.99))).toBeNull()
    expect(ai.tributeRate).toBe(0.2)
    expect(ai.rebellionChance).toBeGreaterThan(0)
  })

  it('实力占优的附庸叛乱概率上升，弱势时下降', () => {
    const strong = makeAiSect({ vassalOf: 'player', power: 9000, originalPower: 9000, rebellionChance: 0.1 })
    aiSectTick(strong, 1000, constRng(0.99))
    expect(strong.rebellionChance).toBeGreaterThan(0.1)

    const weak = makeAiSect({ vassalOf: 'player', power: 10, originalPower: 10, rebellionChance: 0.1 })
    aiSectTick(weak, 100000, constRng(0.99))
    expect(weak.rebellionChance).toBeLessThan(0.1)
  })

  it('战争中且攻击时间已到 → 返回 __ATTACK__ 指令', () => {
    const ai = makeAiSect({ atWar: true, attackTimer: Date.now() - 1, disposition: 'expansionist' })
    const msg = aiSectTick(ai, 1000, constRng(0.99))
    expect(msg).toBe(`__ATTACK__:${ai.id}`)
    expect(ai.attackTimer).toBe(0) // 触发后重置
  })

  it('好战且交战：安排下次攻击时间', () => {
    const ai = makeAiSect({ atWar: true, attackTimer: 0, disposition: 'aggressive', warExhaustion: 0 })
    aiSectTick(ai, 1000, constRng(0.5))
    expect(ai.attackTimer).toBeGreaterThan(Date.now())
  })

  it('大地图随机关系波动钳制在 [-100, 100]', () => {
    for (let i = 0; i < 500; i++) {
      const ai = makeAiSect({ relationValue: 100, disposition: 'isolationist' })
      aiSectTick(ai, 1000, makeRng(i))
      expect(ai.relationValue).toBeGreaterThanOrEqual(-100)
      expect(ai.relationValue).toBeLessThanOrEqual(100)
    }
  })

  it('playerPower 为 0 时不产生除零（Math.max(1, …) 兜底）', () => {
    const ai = makeAiSect()
    expect(() => aiSectTick(ai, 0, constRng(0.5))).not.toThrow()
    expect(Number.isFinite(ai.power)).toBe(true)
  })
})

describe('calcSectPower', () => {
  const zero = { stone: 0, herb: 0, ore: 0, wood: 0 }

  it('基础公式正确', () => {
    expect(calcSectPower(1, 0, 0, zero)).toBe(280)      // 200 + 80
    expect(calcSectPower(5, 0, 0, zero)).toBe(600)      // 200 + 400
    expect(calcSectPower(1, 2, 0, zero)).toBe(380)      // + 2*50
    expect(calcSectPower(1, 0, 4, zero)).toBe(400)      // + 4*30
    expect(calcSectPower(1, 0, 0, { stone: 1000, herb: 0, ore: 0, wood: 0 })).toBe(380) // + 100
  })

  it('随各输入单调递增', () => {
    const base = calcSectPower(3, 3, 3, { stone: 100, herb: 100, ore: 100, wood: 100 })
    expect(calcSectPower(4, 3, 3, { stone: 100, herb: 100, ore: 100, wood: 100 })).toBeGreaterThan(base)
    expect(calcSectPower(3, 4, 3, { stone: 100, herb: 100, ore: 100, wood: 100 })).toBeGreaterThan(base)
    expect(calcSectPower(3, 3, 4, { stone: 100, herb: 100, ore: 100, wood: 100 })).toBeGreaterThan(base)
    expect(calcSectPower(3, 3, 3, { stone: 200, herb: 100, ore: 100, wood: 100 })).toBeGreaterThan(base)
  })

  it('灵草不计入战力；资源为负时不崩溃', () => {
    const a = calcSectPower(1, 0, 0, { stone: 0, herb: 0, ore: 0, wood: 0 })
    const b = calcSectPower(1, 0, 0, { stone: 0, herb: 9999, ore: 0, wood: 0 })
    expect(b).toBe(a)
    expect(Number.isInteger(calcSectPower(1, 1, 1, { stone: -500, herb: 0, ore: -500, wood: -500 }))).toBe(true)
  })
})

// ==================== 外交结算 ====================
describe('processTradeIncome', () => {
  it('无宗门时直接返回，不抛错', () => {
    const s = makeState({ sect: null })
    expect(() => processTradeIncome(s, [makeAiSect()])).not.toThrow()
  })

  it('贸易协定带来灵石与灵草，同盟带来矿石与木材', () => {
    const s = makeState({ sect: makeSect() })
    const before = { ...s.sect!.resources }
    const trade = makeAiSect({ level: 3, tradeAgreement: true })
    const ally = makeAiSect({ level: 3, alliance: true })
    const aiBefore = trade.resources.stone
    processTradeIncome(s, [trade, ally])
    expect(s.sect!.resources.stone).toBe(before.stone + 24) // 3*8
    expect(s.sect!.resources.herb).toBe(before.herb + 9)    // 3*3
    expect(s.sect!.resources.ore).toBe(before.ore + 6)      // 3*2
    expect(s.sect!.resources.wood).toBe(before.wood + 9)    // 3*3
    expect(trade.resources.stone).toBe(aiBefore + 12)       // 3*4
  })

  it('跳过已覆灭宗门；无协定时不产生任何收益', () => {
    const s = makeState({ sect: makeSect() })
    const before = { ...s.sect!.resources }
    processTradeIncome(s, [makeAiSect({ defeated: true, tradeAgreement: true, alliance: true })])
    processTradeIncome(s, [makeAiSect({ tradeAgreement: false, alliance: false })])
    expect(s.sect!.resources).toEqual(before)
  })
})

describe('processResourceIncome', () => {
  const node = (owner: string | null, contested = false): ResourceNode => ({
    id: 'n', name: '测试点', x: 0, y: 0, type: 'spirit_mine',
    ownerId: owner, garrison: 10, production: { stone: 50 }, contested,
  })

  it('只结算玩家所有且非争夺中的资源点', () => {
    const s = makeState({ sect: makeSect() })
    const before = s.sect!.resources.stone
    processResourceIncome(s, [node('player'), node('ai_sect_1'), node('player', true), node(null)])
    expect(s.sect!.resources.stone).toBe(before + 50)
  })

  it('四种资源分别入账', () => {
    const s = makeState({ sect: makeSect() })
    const before = { ...s.sect!.resources }
    processResourceIncome(s, [{
      id: 'n', name: 'x', x: 0, y: 0, type: 'spirit_spring',
      ownerId: 'player', garrison: 1, production: { stone: 20, herb: 10 }, contested: false,
    }])
    expect(s.sect!.resources.stone).toBe(before.stone + 20)
    expect(s.sect!.resources.herb).toBe(before.herb + 10)
  })

  it('无宗门或空列表时不抛错', () => {
    expect(() => processResourceIncome(makeState({ sect: null }), [node('player')])).not.toThrow()
    const s = makeState({ sect: makeSect() })
    const before = { ...s.sect!.resources }
    processResourceIncome(s, [])
    expect(s.sect!.resources).toEqual(before)
  })
})

describe('processVassalTribute', () => {
  it('按 tributeRate 转移四种资源', () => {
    const s = makeState({ sect: makeSect() })
    const ai = makeAiSect({ vassalOf: 'player', tributeRate: 0.5 })
    const sectBefore = { ...s.sect!.resources }
    const aiBefore = { ...ai.resources }
    processVassalTribute(s, [ai])
    expect(s.sect!.resources.stone).toBe(sectBefore.stone + Math.floor(aiBefore.stone * 0.5))
    expect(ai.resources.stone).toBe(aiBefore.stone - Math.floor(aiBefore.stone * 0.5))
    expect(s.sect!.resources.herb).toBe(sectBefore.herb + Math.floor(aiBefore.herb * 0.5))
    expect(s.sect!.resources.ore).toBe(sectBefore.ore + Math.floor(aiBefore.ore * 0.5))
    expect(s.sect!.resources.wood).toBe(sectBefore.wood + Math.floor(aiBefore.wood * 0.5))
  })

  it('tributeRate 为 0 时按默认 0.2 结算（|| 兜底）', () => {
    const s = makeState({ sect: makeSect() })
    const ai = makeAiSect({ vassalOf: 'player', tributeRate: 0 })
    const sectBefore = s.sect!.resources.stone
    const aiBefore = ai.resources.stone // 1000
    processVassalTribute(s, [ai])
    expect(s.sect!.resources.stone).toBe(sectBefore + 200)
    expect(ai.resources.stone).toBe(aiBefore - 200)
  })

  it('跳过非附庸 / 已覆灭宗门', () => {
    const s = makeState({ sect: makeSect() })
    const before = { ...s.sect!.resources }
    processVassalTribute(s, [
      makeAiSect({ vassalOf: null, tributeRate: 0.5 }),
      makeAiSect({ vassalOf: 'ai_sect_9', tributeRate: 0.5 }),
      makeAiSect({ vassalOf: 'player', defeated: true, tributeRate: 0.5 }),
    ])
    expect(s.sect!.resources).toEqual(before)
  })

  it('无宗门时不抛错', () => {
    expect(() => processVassalTribute(makeState({ sect: null }), [makeAiSect({ vassalOf: 'player' })])).not.toThrow()
  })
})

describe('checkRebellion', () => {
  it('rng 低于叛乱概率时发动叛乱', () => {
    const s = makeState({ sect: makeSect() })
    const ai = makeAiSect({ vassalOf: 'player', rebellionChance: 0.5, originalPower: 1000, power: 300 })
    const events = checkRebellion(s, [ai], constRng(0))
    expect(events).toHaveLength(1)
    expect(events[0]).toContain('叛乱')
    expect(ai.vassalOf).toBeNull()
    expect(ai.atWar).toBe(true)
    expect(ai.relationValue).toBe(-80)
    expect(ai.rebellionChance).toBe(0)
    expect(ai.power).toBe(Math.floor(1000 * 0.6))
  })

  it('rng 高于叛乱概率时不发动', () => {
    const s = makeState({ sect: makeSect() })
    const ai = makeAiSect({ vassalOf: 'player', rebellionChance: 0.5 })
    expect(checkRebellion(s, [ai], constRng(0.9))).toEqual([])
    expect(ai.vassalOf).toBe('player')
  })

  it('叛乱概率为 0 时永不叛乱', () => {
    const s = makeState({ sect: makeSect() })
    const ai = makeAiSect({ vassalOf: 'player', rebellionChance: 0 })
    for (let i = 0; i < 200; i++) {
      expect(checkRebellion(s, [ai], makeRng(i))).toEqual([])
    }
  })

  it('只检查玩家的附庸', () => {
    const s = makeState({ sect: makeSect() })
    const nonVassal = makeAiSect({ vassalOf: null, rebellionChance: 1 })
    const otherVassal = makeAiSect({ vassalOf: 'ai_sect_9', rebellionChance: 1 })
    const defeatedVassal = makeAiSect({ vassalOf: 'player', defeated: true, rebellionChance: 1 })
    expect(checkRebellion(s, [nonVassal, otherVassal, defeatedVassal], constRng(0))).toEqual([])
    expect(nonVassal.vassalOf).toBeNull()
    expect(otherVassal.vassalOf).toBe('ai_sect_9')
    expect(defeatedVassal.vassalOf).toBe('player')
    expect(nonVassal.atWar).toBe(false)
    expect(otherVassal.atWar).toBe(false)
  })
})

describe('tickAllAiSects', () => {
  it('无宗门时返回空事件', () => {
    expect(tickAllAiSects(makeState({ sect: null }), [makeAiSect()])).toEqual([])
  })

  it('返回字符串数组，并顺带执行进贡与叛乱结算', () => {
    const s = makeState({ sect: makeSect() })
    const vassal = makeAiSect({ vassalOf: 'player', tributeRate: 0.5, rebellionChance: 0, disposition: 'isolationist' })
    const stoneBefore = s.sect!.resources.stone
    const events = tickAllAiSects(s, [vassal])
    expect(Array.isArray(events)).toBe(true)
    for (const e of events) expect(typeof e).toBe('string')
    expect(s.sect!.resources.stone).toBeGreaterThan(stoneBefore) // 已收进贡
  })

  it('空 AI 列表时返回空数组且不抛错', () => {
    const s = makeState({ sect: makeSect() })
    expect(tickAllAiSects(s, [])).toEqual([])
  })

  it('多次调用不产生 NaN 或无限资源', () => {
    const s = makeState({ sect: makeSect() })
    const ai = makeAiSect({ vassalOf: 'player', tributeRate: 0.2, rebellionChance: 0 })
    for (let i = 0; i < 50; i++) tickAllAiSects(s, [ai])
    for (const v of Object.values(s.sect!.resources)) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
    }
  })
})
