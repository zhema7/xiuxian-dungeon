// ---------- 主线剧情 / 成就 / 日常任务 三系统单测 ----------
// 覆盖 src/storyline-data.ts、src/storyline-system.ts、src/achievement-system.ts、src/daily-quest.ts
//
// 说明：storyline-system / achievement-system / daily-quest 都通过 src/ui.ts 间接依赖
// Phaser（ui → audio → phaser）与 DOM（input.ts 模块级 new InputPort() → document）。
// 这里用 vi.mock（编译期提升，先于静态 import 生效）把它们替换掉，
// 使被测模块在 Node 环境下可加载；生产模块本身不做任何改动。

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui', () => ({
  toast: vi.fn(),
  showDialog: vi.fn(async () => 'ok'),
  dialogOpen: vi.fn(() => false),
}))
vi.mock('../src/audio', () => ({ sfx: vi.fn() }))
vi.mock('../src/input', () => ({ input: { clearQueues: vi.fn() } }))

import {
  VOLUMES, MAIN_QUESTS, getVolumeQuests, getMainQuest, getVolume, getFirstAvailableQuest,
  type MainQuestDef, type VolumeId,
} from '../src/storyline-data'
import {
  getActiveQuest, findNextQuest, isQuestCompleted, getQuestProgressInfo, getQuestHudText,
  onDiplomacyAction, onSectWarWon, initMainQuest, getCompletedInVolume, getTotalInVolume,
  getOverallProgress, tryCompleteQuest,
} from '../src/storyline-system'
import {
  ACHIEVEMENTS, getAchievementProgress, checkAchievements, getAchievementCount, categoryName,
  type AchievementCategory, type AchievementCondType,
} from '../src/achievement-system'
import {
  getTodayKey, generateDailyQuests, refreshDailyQuests, updateDailyProgress,
  claimDailyReward, getDailyQuestStats, type DailyQuestType,
} from '../src/daily-quest'
import type { GameState } from '../src/state'
import { makeRng } from '../src/core'
import { installLocalStorageStub, makeState, makeSect, constRng } from './system-test-helpers'

beforeAll(() => installLocalStorageStub())

const NUMERIC_OBJECTIVE_TYPES = ['reach_level', 'sect_level', 'collect_kills', 'reach_realm', 'win_arena', 'collect_gold']
const ALL_OBJECTIVE_TYPES = [
  'reach_level', 'sect_level', 'clear_dungeon', 'talk_npc', 'collect_kills', 'reach_realm',
  'visit_point', 'establish_sect', 'win_arena', 'collect_gold', 'defeat_boss',
]

// ==================== 主线剧情数据表 ====================
describe('卷宗定义', () => {
  it('四卷定义完整且 id 唯一', () => {
    expect(VOLUMES).toHaveLength(4)
    const ids = VOLUMES.map(v => v.id)
    expect(new Set(ids).size).toBe(4)
    for (const v of VOLUMES) {
      expect(v.name.length).toBeGreaterThan(0)
      expect(v.subtitle.length).toBeGreaterThan(0)
      expect(v.levelRange.length).toBeGreaterThan(0)
      expect(v.desc.length).toBeGreaterThan(0)
    }
  })

  it('getVolume 命中与未命中', () => {
    for (const v of VOLUMES) expect(getVolume(v.id)!.id).toBe(v.id)
    expect(getVolume('vol9' as VolumeId)).toBeUndefined()
  })

  it('每卷都有任务，且总数为 31', () => {
    let sum = 0
    for (const v of VOLUMES) {
      const list = getVolumeQuests(v.id)
      expect(list.length).toBeGreaterThan(0)
      sum += list.length
    }
    expect(sum).toBe(MAIN_QUESTS.length)
    expect(MAIN_QUESTS).toHaveLength(31)
  })
})

describe('主线任务表完整性', () => {
  it('任务 id 唯一', () => {
    const ids = MAIN_QUESTS.map(q => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('文本字段齐备', () => {
    for (const q of MAIN_QUESTS) {
      expect(q.title.length).toBeGreaterThan(0)
      expect(q.narrator.length).toBeGreaterThan(0)
      expect(q.objective.length).toBeGreaterThan(0)
      expect(q.hint.length).toBeGreaterThan(0)
      expect(q.intro.length).toBeGreaterThan(0)
      expect(q.completion.length).toBeGreaterThan(0)
      for (const line of [...q.intro, ...q.completion]) {
        expect(typeof line).toBe('string')
      }
    }
  })

  it('目标类型合法，奖励非负', () => {
    for (const q of MAIN_QUESTS) {
      expect(ALL_OBJECTIVE_TYPES).toContain(q.objectiveType)
      expect(q.objectiveTarget.length).toBeGreaterThan(0)
      for (const [k, v] of Object.entries(q.rewards)) {
        if (k === 'itemDesc') {
          expect(typeof v).toBe('string')
        } else {
          expect(typeof v).toBe('number')
          expect(v as number).toBeGreaterThan(0)
        }
      }
    }
  })

  it('前置任务链：恰好一条主链，起点为 null，其余均指向表中已存在的任务', () => {
    const ids = new Set(MAIN_QUESTS.map(q => q.id))
    const roots = MAIN_QUESTS.filter(q => q.prerequisite === null)
    expect(roots).toHaveLength(1)
    expect(roots[0].id).toBe('mq_1_1')
    for (const q of MAIN_QUESTS) {
      if (q.prerequisite === null) continue
      expect(ids.has(q.prerequisite)).toBe(true)
      expect(q.prerequisite).not.toBe(q.id)
    }
  })

  it('前置引用不构成环：沿链推进可走完全部 31 个任务', () => {
    const byId = new Map(MAIN_QUESTS.map(q => [q.id, q]))
    const completed = new Set<string>()
    let cur: MainQuestDef | undefined = MAIN_QUESTS.find(q => q.prerequisite === null)
    let steps = 0
    while (cur) {
      completed.add(cur.id)
      cur = MAIN_QUESTS.find(q => q.prerequisite === cur!.id)
      steps++
      expect(steps).toBeLessThanOrEqual(MAIN_QUESTS.length)
    }
    expect(completed.size).toBe(MAIN_QUESTS.length)
  })

  it('每卷内章节号从 1 连续递增', () => {
    for (const v of VOLUMES) {
      const list = [...getVolumeQuests(v.id)].sort((a, b) => a.chapter - b.chapter)
      list.forEach((q, i) => expect(q.chapter).toBe(i + 1))
    }
  })

  it('getMainQuest 命中与未命中', () => {
    expect(getMainQuest('mq_1_1')!.id).toBe('mq_1_1')
    expect(getMainQuest('不存在')).toBeUndefined()
  })

  it('主线任务难度递增：同类型目标随章节推进单调不减', () => {
    // 按 objectiveType 分组比较（跨类型比较数值无意义：击杀 30 与擂台 3 不可比）
    const groups = new Map<string, number[]>()
    for (const q of MAIN_QUESTS) {
      if (q.objectiveType === 'collect_gold' && q.objectiveTarget.startsWith('insight_')) {
        const n = Number.parseInt(q.objectiveTarget.slice(8), 10)
        if (Number.isFinite(n)) groups.set('insight', [...(groups.get('insight') ?? []), n])
        continue
      }
      if (!NUMERIC_OBJECTIVE_TYPES.includes(q.objectiveType)) continue
      const n = Number.parseInt(q.objectiveTarget, 10)
      if (!Number.isFinite(n)) continue // 防御性跳过；修复 B22 后主线表应无此类任务
      groups.set(q.objectiveType, [...(groups.get(q.objectiveType) ?? []), n])
    }
    expect(groups.size).toBeGreaterThan(3)
    for (const [type, list] of groups) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i], `${type} 第 ${i + 1} 项目标应不小于前一项`).toBeGreaterThanOrEqual(list[i - 1])
      }
    }
  })
})

describe('主线数据表引用一致性', () => {
  it('mq_4_3 改用 sect_level 类型，目标参数可解析（B22 已修复）', () => {
    // 修复前：objectiveType = 'reach_level' 且 objectiveTarget = 'sect_5'
    //   → 走 `state.level >= parseInt('sect_5')` → NaN → 恒 false
    //   → mq_4_4 / 4_5 / 4_6 / 4_7 因前置未完成全部锁死，终章「飞升」不可达。
    // 修复后：独立的 'sect_level' 类型读 state.sect.level，与角色等级彻底解耦。
    const q = MAIN_QUESTS.find(x => x.id === 'mq_4_3')!
    expect(q.objectiveType).toBe('sect_level')
    expect(q.objectiveTarget).toBe('5')
    expect(Number.parseInt(q.objectiveTarget, 10)).toBe(5)
  })

  it('全部 31 个任务的目标参数均可解析（无断链）', () => {
    const broken = MAIN_QUESTS.filter(q => {
      if (q.objectiveType === 'collect_gold' && q.objectiveTarget.startsWith('insight_')) {
        return Number.isNaN(Number.parseInt(q.objectiveTarget.slice(8), 10))
      }
      if (NUMERIC_OBJECTIVE_TYPES.includes(q.objectiveType)) {
        return Number.isNaN(Number.parseInt(q.objectiveTarget, 10))
      }
      return false
    })
    expect(MAIN_QUESTS).toHaveLength(31)
    expect(broken.map(q => q.id)).toEqual([])
  })

  it('sect_level 只认宗门等级，与角色等级解耦', () => {
    // 宗门未达标：角色等级再高也不算完成
    expect(isQuestCompleted(makeState({
      mainQuestId: 'mq_4_3', level: 999, sect: makeSect({ level: 4 }),
    }))).toBe(false)
    // 宗门达标：角色等级再低也算完成
    expect(isQuestCompleted(makeState({
      mainQuestId: 'mq_4_3', level: 1, sect: makeSect({ level: 5 }),
    }))).toBe(true)
    // 未建宗门：判否且不抛错
    expect(isQuestCompleted(makeState({
      mainQuestId: 'mq_4_3', level: 999, sect: null,
    }))).toBe(false)
  })

  it('sect_level 的进度显示跟随宗门等级且不含 NaN', () => {
    const s = makeState({ mainQuestId: 'mq_4_3', level: 1, sect: makeSect({ level: 3 }) })
    const info = getQuestProgressInfo(s)!
    expect(info.current).toBe(3)
    expect(info.total).toBe(5)
    expect(Number.isNaN(info.total)).toBe(false)
    expect(info.text).toContain('3')
    // HUD 文案也不应出现 NaN
    expect(getQuestHudText(s)).not.toContain('NaN')
  })

  it('端到端：mq_4_1 → mq_4_7 依次完成，终章「飞升」可达（B22 回归）', async () => {
    const chain = ['mq_4_1', 'mq_4_2', 'mq_4_3', 'mq_4_4', 'mq_4_5', 'mq_4_6', 'mq_4_7']
    const s = makeState({
      // 先把前三卷标为完成，确保第四卷前置链打通
      mainQuestCompleted: MAIN_QUESTS.filter(q => q.volume !== 'vol4').map(q => q.id),
      mainQuestId: 'mq_4_1',
      mainQuestProgress: 0,
      // 一次性满足第四卷全部七个目标
      level: 60,            // mq_4_1(55) / mq_4_6(60)
      arenaWins: 30,        // mq_4_2
      sect: makeSect({ level: 5 }), // mq_4_3
      syMaxDepth: 50,       // mq_4_4
      insight: 500,         // mq_4_5
      totalKills: 500,      // mq_4_7
    })

    for (const id of chain) {
      expect(s.mainQuestId, `应轮到 ${id}`).toBe(id)
      expect(isQuestCompleted(s), `${id} 的目标应已达成`).toBe(true)
      expect(await tryCompleteQuest(s), `${id} 应能正常完成`).toBe(true)
      expect(s.mainQuestCompleted).toContain(id)
    }

    // 终章完成后无后续任务，主线进度 100%
    expect(s.mainQuestId).toBeNull()
    expect(s.mainQuestCompleted).toHaveLength(MAIN_QUESTS.length)
    expect(getOverallProgress(s)).toBe(1)
  })
})

describe('getFirstAvailableQuest', () => {
  it('空完成集时返回首个任务', () => {
    expect(getFirstAvailableQuest(new Set(), 1, 0)!.id).toBe('mq_1_1')
  })

  it('跳过已完成与前置未满足的任务', () => {
    expect(getFirstAvailableQuest(new Set(['mq_1_1']), 1, 0)!.id).toBe('mq_1_2')
    expect(getFirstAvailableQuest(new Set(['mq_1_1', 'mq_1_3']), 1, 0)!.id).toBe('mq_1_2')
  })

  it('全部完成时返回 undefined', () => {
    const all = new Set(MAIN_QUESTS.map(q => q.id))
    expect(getFirstAvailableQuest(all, 99, 9)).toBeUndefined()
  })

  it('【已知缺陷 B23】level / realm 两个形参未被使用', () => {
    // 复现：getFirstAvailableQuest(completed, level, realm) 只按前置链推进，
    // 完全忽略 level / realm，等级门槛实际未生效。
    const low = getFirstAvailableQuest(new Set(), 1, 0)
    const high = getFirstAvailableQuest(new Set(), 999, 9)
    expect(low!.id).toBe(high!.id)
  })
})

// ==================== 主线剧情逻辑 ====================
describe('getActiveQuest / findNextQuest', () => {
  it('未接取任务时返回 null', () => {
    expect(getActiveQuest(makeState({ mainQuestId: null }))).toBeNull()
  })

  it('未知任务 id 返回 null', () => {
    expect(getActiveQuest(makeState({ mainQuestId: '不存在的任务' }))).toBeNull()
  })

  it('命中时返回任务定义', () => {
    const q = getActiveQuest(makeState({ mainQuestId: 'mq_1_5' }))!
    expect(q.id).toBe('mq_1_5')
    expect(q.title).toBe('沼泽探险')
  })

  it('findNextQuest 与 getFirstAvailableQuest 结果一致', () => {
    const s = makeState({ mainQuestCompleted: ['mq_1_1', 'mq_1_2'] })
    expect(findNextQuest(s)!.id).toBe('mq_1_3')
    expect(findNextQuest(s)!.id).toBe(getFirstAvailableQuest(new Set(s.mainQuestCompleted), 1, 0)!.id)
  })

  it('全部完成时 findNextQuest 返回 undefined', () => {
    const s = makeState({ mainQuestCompleted: MAIN_QUESTS.map(q => q.id), mainQuestId: null })
    expect(findNextQuest(s)).toBeUndefined()
  })
})

describe('isQuestCompleted 目标判定', () => {
  const active = (id: string, over: Partial<GameState> = {}) => makeState({ mainQuestId: id, ...over })

  it('无进行中任务时恒为 false', () => {
    expect(isQuestCompleted(makeState({ mainQuestId: null, level: 999 }))).toBe(false)
  })

  it('已列入完成列表的任务不再重复判定', () => {
    const s = active('mq_1_2', { level: 99, mainQuestCompleted: ['mq_1_2'] })
    expect(isQuestCompleted(s)).toBe(false)
  })

  it('reach_level：达到目标等级才算完成', () => {
    expect(isQuestCompleted(active('mq_1_2', { level: 4 }))).toBe(false) // 目标 5
    expect(isQuestCompleted(active('mq_1_2', { level: 5 }))).toBe(true)
  })

  it('collect_kills：累计击杀达标', () => {
    expect(isQuestCompleted(active('mq_1_3', { totalKills: 29 }))).toBe(false) // 目标 30
    expect(isQuestCompleted(active('mq_1_3', { totalKills: 30 }))).toBe(true)
  })

  it('reach_realm：境界达标', () => {
    expect(isQuestCompleted(active('mq_1_4', { realm: 0 }))).toBe(false) // 目标 1
    expect(isQuestCompleted(active('mq_1_4', { realm: 1 }))).toBe(true)
  })

  it('clear_dungeon：四套判定各自独立', () => {
    expect(isQuestCompleted(active('mq_1_1', { progress: { qmCleared: false, ymCleared: false } }))).toBe(false)
    expect(isQuestCompleted(active('mq_1_1', { progress: { qmCleared: true, ymCleared: false } }))).toBe(true)
    expect(isQuestCompleted(active('mq_1_5', { progress: { qmCleared: true, ymCleared: false } }))).toBe(false)
    expect(isQuestCompleted(active('mq_1_5', { progress: { qmCleared: true, ymCleared: true } }))).toBe(true)
    expect(isQuestCompleted(active('mq_2_1', { syMaxDepth: 6 }))).toBe(false)  // 需 >= 7
    expect(isQuestCompleted(active('mq_2_1', { syMaxDepth: 7 }))).toBe(true)
    expect(isQuestCompleted(active('mq_2_5', { xianMaxDepth: 10000 }))).toBe(false) // 需 >= 10001
    expect(isQuestCompleted(active('mq_2_5', { xianMaxDepth: 10001 }))).toBe(true)
    expect(isQuestCompleted(active('mq_3_3', { xianMaxDepth: 10009 }))).toBe(false) // 需 >= 10010
    expect(isQuestCompleted(active('mq_3_3', { xianMaxDepth: 10010 }))).toBe(true)
    expect(isQuestCompleted(active('mq_4_4', { syMaxDepth: 49 }))).toBe(false)  // 需 >= 50
    expect(isQuestCompleted(active('mq_4_4', { syMaxDepth: 50 }))).toBe(true)
  })

  it('visit_point：到达指定点位', () => {
    expect(isQuestCompleted(active('mq_1_6', { discoveredPoints: [] }))).toBe(false)
    expect(isQuestCompleted(active('mq_1_6', { discoveredPoints: ['landmark_cliff'] }))).toBe(true)
  })

  it('establish_sect：开宗即完成', () => {
    expect(isQuestCompleted(active('mq_2_2', { sectUnlocked: false }))).toBe(false)
    expect(isQuestCompleted(active('mq_2_2', { sectUnlocked: true }))).toBe(true)
  })

  it('win_arena：擂台胜场达标', () => {
    expect(isQuestCompleted(active('mq_2_3', { arenaWins: 2 }))).toBe(false) // 目标 3
    expect(isQuestCompleted(active('mq_2_3', { arenaWins: 3 }))).toBe(true)
  })

  it('collect_gold：insight_ 前缀按悟道点判定', () => {
    expect(isQuestCompleted(active('mq_4_5', { insight: 499 }))).toBe(false) // 目标 insight_500
    expect(isQuestCompleted(active('mq_4_5', { insight: 500 }))).toBe(true)
  })

  it('talk_npc(diplomacy) / defeat_boss(ai_sect_war)：由 mainQuestProgress 驱动', () => {
    expect(isQuestCompleted(active('mq_2_6', { mainQuestProgress: 0 }))).toBe(false)
    expect(isQuestCompleted(active('mq_2_6', { mainQuestProgress: 1 }))).toBe(true)
    expect(isQuestCompleted(active('mq_3_5', { mainQuestProgress: 0 }))).toBe(false)
    expect(isQuestCompleted(active('mq_3_5', { mainQuestProgress: 1 }))).toBe(true)
  })
})

describe('getQuestProgressInfo', () => {
  const active = (id: string, over: Partial<GameState> = {}) => makeState({ mainQuestId: id, ...over })

  it('无进行中任务时返回 null', () => {
    expect(getQuestProgressInfo(makeState({ mainQuestId: null }))).toBeNull()
  })

  it('等级 / 击杀 / 擂台类给出 当前/目标 文本', () => {
    expect(getQuestProgressInfo(active('mq_1_2', { level: 3 }))).toEqual({ current: 3, total: 5, text: 'Lv.3 / 5' })
    expect(getQuestProgressInfo(active('mq_1_3', { totalKills: 12 }))).toEqual({ current: 12, total: 30, text: '12 / 30' })
    expect(getQuestProgressInfo(active('mq_2_3', { arenaWins: 1 }))).toEqual({ current: 1, total: 3, text: '1 / 3 胜' })
  })

  it('境界类显示境界名', () => {
    const info = getQuestProgressInfo(active('mq_1_4', { realm: 0 }))!
    expect(info.total).toBe(1)
    expect(info.text).toContain('→')
    expect(info.text).not.toContain('undefined')
  })

  it('秘境类分别按层 / 按通关显示', () => {
    expect(getQuestProgressInfo(active('mq_1_1', { progress: { qmCleared: false, ymCleared: false } }))!.text).toBe('未通关')
    expect(getQuestProgressInfo(active('mq_2_1', { syMaxDepth: 3 }))).toEqual({ current: 3, total: 7, text: '3 / 7 层' })
    expect(getQuestProgressInfo(active('mq_4_4', { syMaxDepth: 999 }))!.current).toBe(50) // 钳制到目标
    expect(getQuestProgressInfo(active('mq_3_3', { xianMaxDepth: 10004 }))).toEqual({ current: 4, total: 10, text: '4 / 10 层' })
  })

  it('【已知缺陷 B5】xian_deep 在 xianMaxDepth < 10000 时 current 为负，与 text 不一致', () => {
    // 复现：getQuestProgressInfo 的 xian_deep 分支写
    //   current: Math.min(state.xianMaxDepth - 10000, 10)
    //   text:    `${Math.max(0, Math.min(state.xianMaxDepth - 10000, 10))} / 10 层`
    // text 做了 max(0) 兜底，current 没有。玩家尚未踏入仙宫时（xianMaxDepth = 0）
    // current = -10000，进度条会渲染成负数。
    // 建议：current 一并套 Math.max(0, ...)。
    const info = getQuestProgressInfo(active('mq_3_3', { xianMaxDepth: 0 }))!
    expect(info.current).toBe(-10000)
    expect(info.text).toBe('0 / 10 层')
    expect(info.current).not.toBe(0)
  })

  it('未知目标类型返回 null（如 talk_npc / establish_sect）', () => {
    expect(getQuestProgressInfo(active('mq_2_6'))).toBeNull()
    expect(getQuestProgressInfo(active('mq_2_2'))).toBeNull()
  })
})

describe('getQuestHudText', () => {
  it('无任务时给出占位文案', () => {
    expect(getQuestHudText(makeState({ mainQuestId: null }))).toBe('无主线任务')
  })

  it('有进度时拼上进度，无进度时只显示目标', () => {
    const withProgress = getQuestHudText(makeState({ mainQuestId: 'mq_1_2', level: 3 }))
    expect(withProgress).toBe('道友初逢：达到 5 级 (Lv.3 / 5)')
    const noProgress = getQuestHudText(makeState({ mainQuestId: 'mq_2_6' }))
    expect(noProgress).toBe('外交初体验：完成一次外交行动')
    expect(noProgress).not.toContain('()')
  })
})

describe('主线事件钩子', () => {
  it('onDiplomacyAction 仅对 diplomacy 任务生效', () => {
    const s = makeState({ mainQuestId: 'mq_2_6', mainQuestProgress: 0 })
    onDiplomacyAction(s)
    expect(s.mainQuestProgress).toBe(1)

    const other = makeState({ mainQuestId: 'mq_1_2', mainQuestProgress: 0 })
    onDiplomacyAction(other)
    expect(other.mainQuestProgress).toBe(0)
  })

  it('onDiplomacyAction 幂等：进度已 >= 1 时不再变化', () => {
    const s = makeState({ mainQuestId: 'mq_2_6', mainQuestProgress: 5 })
    onDiplomacyAction(s)
    expect(s.mainQuestProgress).toBe(5)
  })

  it('onSectWarWon 累加战争胜场并推进 ai_sect_war 任务', () => {
    const s = makeState({ mainQuestId: 'mq_3_5', mainQuestProgress: 0, totalSectWarsWon: 2 })
    onSectWarWon(s)
    expect(s.totalSectWarsWon).toBe(3)
    expect(s.mainQuestProgress).toBe(1)
  })

  it('onSectWarWon 对非 defeat_boss 任务只计胜场', () => {
    const s = makeState({ mainQuestId: 'mq_1_2', mainQuestProgress: 0, totalSectWarsWon: 0 })
    onSectWarWon(s)
    expect(s.totalSectWarsWon).toBe(1)
    expect(s.mainQuestProgress).toBe(0)
  })

  it('initMainQuest 只在全新存档时写入首个任务', () => {
    const fresh = makeState({ mainQuestId: null, mainQuestCompleted: [] })
    initMainQuest(fresh)
    expect(fresh.mainQuestId).toBe('mq_1_1')

    const ongoing = makeState({ mainQuestId: 'mq_2_4', mainQuestCompleted: [] })
    initMainQuest(ongoing)
    expect(ongoing.mainQuestId).toBe('mq_2_4')

    const finished = makeState({ mainQuestId: null, mainQuestCompleted: ['mq_1_1'] })
    initMainQuest(finished)
    expect(finished.mainQuestId).toBeNull()
  })
})

describe('主线进度统计', () => {
  it('getTotalInVolume 与数据表一致', () => {
    for (const v of VOLUMES) {
      expect(getTotalInVolume(v.id)).toBe(getVolumeQuests(v.id).length)
    }
  })

  it('getCompletedInVolume 只统计本卷已完成项', () => {
    const s = makeState({ mainQuestCompleted: ['mq_1_1', 'mq_1_2', 'mq_2_1', '不存在任务'] })
    expect(getCompletedInVolume(s, 'vol1')).toBe(2)
    expect(getCompletedInVolume(s, 'vol2')).toBe(1)
    expect(getCompletedInVolume(s, 'vol3')).toBe(0)
  })

  it('getOverallProgress 归一化到 0~1', () => {
    expect(getOverallProgress(makeState({ mainQuestCompleted: [] }))).toBe(0)
    const all = makeState({ mainQuestCompleted: MAIN_QUESTS.map(q => q.id) })
    expect(getOverallProgress(all)).toBe(1)
    const half = makeState({ mainQuestCompleted: MAIN_QUESTS.slice(0, 10).map(q => q.id) })
    expect(getOverallProgress(half)).toBeCloseTo(10 / 31, 10)
  })
})

// ==================== 成就系统 ====================
describe('成就配置表', () => {
  it('成就 id 唯一，字段合法', () => {
    const ids = ACHIEVEMENTS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    const cats: AchievementCategory[] = ['combat', 'exploration', 'sect', 'collection', 'special']
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length).toBeGreaterThan(0)
      expect(a.desc.length).toBeGreaterThan(0)
      expect(a.icon.length).toBeGreaterThan(0)
      expect(cats).toContain(a.category)
      expect(a.condition.target).toBeGreaterThan(0)
      expect(Object.keys(a.reward).length).toBeGreaterThan(0)
      for (const v of Object.values(a.reward)) expect(v!).toBeGreaterThan(0)
    }
  })

  it('同类成就的目标值严格递增（低阶先解锁）', () => {
    const groups = new Map<string, number[]>()
    for (const a of ACHIEVEMENTS) {
      const key = `${a.category}:${a.condition.type}`
      groups.set(key, [...(groups.get(key) ?? []), a.condition.target])
    }
    for (const [key, list] of groups) {
      const sorted = [...list].sort((x, y) => x - y)
      expect(new Set(sorted).size).toBe(sorted.length) // 同组内不允许重复目标
      expect(key).toBeTruthy()
    }
  })

  it('categoryName 覆盖全部类别', () => {
    for (const c of ['combat', 'exploration', 'sect', 'collection', 'special'] as AchievementCategory[]) {
      expect(categoryName(c).length).toBeGreaterThan(0)
    }
  })

  it('"仙途圆满"的门槛动态绑定主线表长度（B1 已修复）', () => {
    // 修复前：target 硬编码 30，而 MAIN_QUESTS 共 31 章，完成第 30 章即提前解锁。
    // 修复后：target = MAIN_QUESTS.length，数据表增删章节时自动跟随。
    const all = ACHIEVEMENTS.find(a => a.id === 'quest_all')!
    expect(all.desc).toContain('全部主线任务')
    expect(MAIN_QUESTS).toHaveLength(31)
    expect(all.condition.target).toBe(MAIN_QUESTS.length)

    // 差最后一章时不解锁
    const almost = makeState({ mainQuestCompleted: MAIN_QUESTS.slice(0, 30).map(q => q.id) })
    expect(checkAchievements(almost)).not.toContain('quest_all')
    expect(getOverallProgress(almost)).toBeLessThan(1)

    // 全部完成才解锁
    const done = makeState({ mainQuestCompleted: MAIN_QUESTS.map(q => q.id) })
    expect(getOverallProgress(done)).toBe(1)
    expect(checkAchievements(done)).toContain('quest_all')
  })

  it('擂台成就按段位档位取值：新秀=铜牌(1)，天下第一=王者(4)（B2/B3 已修复）', () => {
    // arenaRank 语义：0=初入擂台 1=铜牌斗士 2=银牌斗士 3=金牌斗士 4=王者斗士
    // 与 CityScene.RANK_NAMES 一致；DungeonScene 晋升时以 arenaRank < 4 为上限，故取值恒在 [0,4]。
    const novice = ACHIEVEMENTS.find(a => a.id === 'pvp_5')!
    const champion = ACHIEVEMENTS.find(a => a.id === 'pvp_1')!
    expect(novice.condition.type).toBe('pvp_rank')
    expect(champion.condition.type).toBe('pvp_rank')
    expect(novice.condition.target).toBe(1)   // 铜牌斗士：早期可达（原为 5，恒不可达）
    expect(champion.condition.target).toBe(4) // 王者斗士：最高段位（原为 1，刚升铜牌即拿）

    // 两个门槛都必须落在合法段位区间内，且低阶先解锁
    for (const a of [novice, champion]) {
      expect(a.condition.target).toBeGreaterThanOrEqual(0)
      expect(a.condition.target).toBeLessThanOrEqual(4)
    }
    expect(champion.condition.target).toBeGreaterThan(novice.condition.target)

    // 文案与语义一致
    expect(novice.desc).toContain('铜牌')
    expect(champion.desc).toContain('王者')
  })

  it('段位成就在五档上的解锁表现与语义一致（B2/B3 回归）', () => {
    // 初入擂台（0）：两个都不解锁
    expect(checkAchievements(makeState({ arenaRank: 0 })).map(String)).not.toContain('pvp_5')
    expect(checkAchievements(makeState({ arenaRank: 0 })).map(String)).not.toContain('pvp_1')

    // 铜牌（1）：解锁「擂台新秀」，但绝不解锁「天下第一」
    const bronze = checkAchievements(makeState({ arenaRank: 1 })).map(String)
    expect(bronze).toContain('pvp_5')
    expect(bronze).not.toContain('pvp_1')

    // 金牌（3）：仍不解锁「天下第一」
    expect(checkAchievements(makeState({ arenaRank: 3 })).map(String)).not.toContain('pvp_1')

    // 王者（4）：两个都解锁
    const king = checkAchievements(makeState({ arenaRank: 4 })).map(String)
    expect(king).toContain('pvp_1')
    expect(king).toContain('pvp_5')

    // 进度值直接反映段位
    expect(getAchievementProgress(makeState({ arenaRank: 4 }), 'pvp_rank')).toBe(4)
  })
})

describe('getAchievementProgress', () => {
  it('直接映射类条件', () => {
    const s = makeState({
      totalKills: 12, level: 7, realm: 2, totalGoldEarned: 345,
      totalDungeonClears: 4, totalSectWarsWon: 2, mainQuestCompleted: ['mq_1_1'],
    })
    expect(getAchievementProgress(s, 'kills')).toBe(12)
    expect(getAchievementProgress(s, 'enemy_defeated')).toBe(12)
    expect(getAchievementProgress(s, 'level')).toBe(7)
    expect(getAchievementProgress(s, 'realm')).toBe(2)
    expect(getAchievementProgress(s, 'gold_earned')).toBe(345)
    expect(getAchievementProgress(s, 'dungeon_clears')).toBe(4)
    expect(getAchievementProgress(s, 'sect_wars_won')).toBe(2)
    expect(getAchievementProgress(s, 'main_quests')).toBe(1)
  })

  it('无宗门时弟子数与宗门战力均为 0，不产生 NaN', () => {
    const s = makeState({ sect: null })
    expect(getAchievementProgress(s, 'disciple_count')).toBe(0)
    expect(getAchievementProgress(s, 'sect_power')).toBe(0)
  })

  it('宗门战力已建宗门时按公式计算', () => {
    const s = makeState({ sect: makeSect({ level: 2, buildings: { main_hall: 2, spirit_vein: 1 } }) })
    const p = getAchievementProgress(s, 'sect_power')
    expect(p).toBeGreaterThan(0)
    expect(Number.isInteger(p)).toBe(true)
  })

  it('附庸数只统计未覆灭且附庸于玩家的 AI 宗门', () => {
    const s = makeState({
      aiSects: [
        { id: 'a', vassalOf: 'player', defeated: false },
        { id: 'b', vassalOf: 'player', defeated: true },
        { id: 'c', vassalOf: 'ai_sect_x', defeated: false },
        { id: 'd', vassalOf: null, defeated: false },
      ],
    } as Partial<GameState>)
    expect(getAchievementProgress(s, 'vassal_count')).toBe(1)
    expect(getAchievementProgress(makeState({ aiSects: undefined as never }), 'vassal_count')).toBe(0)
  })

  it('【已知缺陷 B12】domains_explored 返回的是"当前所在域的序号+1"，而非已探索域数', () => {
    // 复现：getAchievementProgress 用固定数组 indexOf(state.worldDomain) + 1，
    // 与已发现点位（state.discoveredPoints）完全无关。
    // 后果：玩家传送到北域（哪怕只发现 1 个点）就直接拿到"五域行者"。
    // 建议：改为按 discoveredPoints 对应的点位去重统计域数。
    const s = makeState({ worldDomain: 'north', discoveredPoints: ['home'] })
    expect(getAchievementProgress(s, 'domains_explored')).toBe(5)
    const s2 = makeState({ worldDomain: 'south', discoveredPoints: ['home'] })
    expect(getAchievementProgress(s2, 'domains_explored')).toBe(1)
    const s3 = makeState({ worldDomain: '未知域', discoveredPoints: [] })
    expect(getAchievementProgress(s3, 'domains_explored')).toBe(1)
  })

  it('未知条件类型返回 0', () => {
    expect(getAchievementProgress(makeState(), '不存在的条件' as AchievementCondType)).toBe(0)
  })
})

describe('checkAchievements', () => {
  it('达标即解锁并写入 achievementsUnlocked', () => {
    const s = makeState({ totalKills: 150 })
    const unlocked = checkAchievements(s)
    expect(unlocked).toContain('kill_100')
    expect(unlocked).not.toContain('kill_500')
    expect(s.achievementsUnlocked).toContain('kill_100')
  })

  it('重复调用幂等：第二次不返回已解锁项', () => {
    const s = makeState({ totalKills: 150 })
    checkAchievements(s)
    expect(checkAchievements(s)).toEqual([])
    expect(s.achievementsUnlocked.filter(id => id === 'kill_100')).toHaveLength(1)
  })

  it('灵石奖励进入 state.gold', () => {
    const s = makeState({ totalKills: 150, gold: 0 })
    checkAchievements(s)
    expect(s.gold).toBeGreaterThan(0)
  })

  it('achievementsUnlocked 缺失时自动初始化', () => {
    const s = makeState({ totalKills: 150 })
    // @ts-expect-error 故意置空以验证防御性初始化
    s.achievementsUnlocked = undefined
    expect(() => checkAchievements(s)).not.toThrow()
    expect(Array.isArray(s.achievementsUnlocked)).toBe(true)
  })

  it('【已知缺陷 B11】悟道点与声望奖励在无宗门时被静默丢弃', () => {
    // 复现：checkAchievements 中
    //   if (ach.reward.insight && state.sect) state.sect.resources.insight += ...
    //   if (ach.reward.prestige && state.sect) state.sect.resources.prestige += ...
    // 即悟道/声望不是加给玩家，而是加给宗门；未开宗时奖励直接蒸发，玩家无任何提示。
    // 反观 gold 走的是 state.gold，无此限制。
    // 建议：无宗门时累积到 state.insight，或在 UI 上提示"需先建立宗门"。
    const s = makeState({ totalKills: 600, sect: null })
    const before = s.insight
    const unlocked = checkAchievements(s)
    expect(unlocked).toContain('kill_500') // kill_500 奖励 insight: 5
    expect(s.insight).toBe(before)
    expect(s.gold).toBeGreaterThan(0)
  })

  it('有宗门时悟道与声望写入宗门资源', () => {
    const s = makeState({ totalKills: 600, sect: makeSect() })
    const before = s.sect!.resources.insight
    checkAchievements(s)
    expect(s.sect!.resources.insight).toBeGreaterThan(before)
  })

  it('一次性满足多个成就时全部发放', () => {
    const s = makeState({ totalKills: 2500, level: 95, totalDungeonClears: 120 })
    const unlocked = checkAchievements(s)
    expect(unlocked).toContain('kill_100')
    expect(unlocked).toContain('kill_500')
    expect(unlocked).toContain('kill_2000')
    expect(unlocked).toContain('dungeon_10')
    expect(unlocked).toContain('dungeon_100')
  })

  it('getAchievementCount 返回 已解锁 / 总数', () => {
    const s = makeState({ totalKills: 150 })
    expect(getAchievementCount(s)).toEqual({ unlocked: 0, total: ACHIEVEMENTS.length })
    checkAchievements(s)
    expect(getAchievementCount(s).unlocked).toBeGreaterThan(0)
    expect(getAchievementCount(s).total).toBe(ACHIEVEMENTS.length)
    expect(getAchievementCount(makeState()).unlocked).toBe(0)
  })
})

// ==================== 日常任务 ====================
describe('getTodayKey', () => {
  it('返回 YYYY-M-D 格式（月日不补零）并匹配当前日期', () => {
    const key = getTodayKey()
    expect(key).toMatch(/^\d{4}-\d{1,2}-\d{1,2}$/)
    const d = new Date()
    expect(key).toBe(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`)
    const [y, m, day] = key.split('-').map(Number)
    expect(m).toBeGreaterThanOrEqual(1)
    expect(m).toBeLessThanOrEqual(12)
    expect(day).toBeGreaterThanOrEqual(1)
    expect(day).toBeLessThanOrEqual(31)
    expect(y).toBeGreaterThan(2000)
  })
})

describe('generateDailyQuests', () => {
  it('恒返回 3 个任务，id 唯一，字段合法', () => {
    for (const seed of [0, 1, 99, 20240501]) {
      const list = generateDailyQuests(makeRng(seed))
      expect(list).toHaveLength(3)
      const ids = list.map(q => q.id)
      expect(new Set(ids).size).toBe(3)
      for (const q of list) {
        expect(q.id.startsWith('dq_')).toBe(true)
        expect(q.name.length).toBeGreaterThan(0)
        expect(q.goal).toBeGreaterThan(0)
        expect(q.progress).toBe(0)
        expect(q.claimed).toBe(false)
        expect(q.desc).not.toContain('{n}')
        expect(Object.keys(q.reward).length).toBeGreaterThan(0)
        for (const v of Object.values(q.reward)) expect(v!).toBeGreaterThan(0)
      }
    }
  })

  it('注入同一 rng 时结果可复现', () => {
    const a = generateDailyQuests(makeRng(2024))
    const b = generateDailyQuests(makeRng(2024))
    expect(a).toEqual(b)
  })

  it('rng 端点命中确定模板且不越界', () => {
    const low = generateDailyQuests(constRng(0))
    expect(low.map(q => q.id)).toEqual(['dq_0_kills', 'dq_1_kills', 'dq_2_dungeon_clear'])
    const high = generateDailyQuests(constRng(0.999999))
    expect(high.map(q => q.type)).toEqual(['spend_gold', 'cultivate', 'arena_win'])
    expect(high.every(q => q.goal > 0)).toBe(true)
  })

  it('不同种子可覆盖全部 8 种任务类型', () => {
    const types = new Set<DailyQuestType>()
    for (let i = 0; i < 600; i++) {
      for (const q of generateDailyQuests(makeRng(i))) types.add(q.type)
    }
    expect(types.size).toBe(8)
  })

  it('desc 中的 {n} 已被替换为实际目标数', () => {
    for (const q of generateDailyQuests(makeRng(7))) {
      expect(q.desc).toContain(String(q.goal))
    }
  })
})

describe('refreshDailyQuests', () => {
  beforeEach(() => {
    // 每个用例使用全新 state，避免 dailyQuestDate 互相污染
  })

  it('日期不匹配时重新生成并返回 true', () => {
    const s = makeState({ dailyQuests: [], dailyQuestDate: '1970-1-1' })
    expect(refreshDailyQuests(s)).toBe(true)
    expect(s.dailyQuests).toHaveLength(3)
    expect(s.dailyQuestDate).toBe(getTodayKey())
  })

  it('日期已是今天时不刷新并返回 false', () => {
    const s = makeState({ dailyQuests: [], dailyQuestDate: '1970-1-1' })
    refreshDailyQuests(s)
    const snapshot = s.dailyQuests.map(q => q.id)
    expect(refreshDailyQuests(s)).toBe(false)
    expect(s.dailyQuests.map(q => q.id)).toEqual(snapshot)
  })

  it('刷新后进度与领取状态全部归零', () => {
    const s = makeState({ dailyQuests: [], dailyQuestDate: '' })
    refreshDailyQuests(s)
    for (const q of s.dailyQuests) {
      expect(q.progress).toBe(0)
      expect(q.claimed).toBe(false)
    }
  })
})

describe('updateDailyProgress', () => {
  const fresh = () => {
    const s = makeState({ dailyQuests: generateDailyQuests(makeRng(11)), dailyQuestDate: getTodayKey() })
    return s
  }

  it('按类型累加进度', () => {
    const s = fresh()
    const target = s.dailyQuests[0]
    updateDailyProgress(s, target.type, 1)
    expect(s.dailyQuests[0].progress).toBe(1)
    updateDailyProgress(s, target.type, 5)
    expect(s.dailyQuests[0].progress).toBe(6)
  })

  it('进度钳制在 goal，不会溢出', () => {
    const s = fresh()
    const t = s.dailyQuests[0]
    updateDailyProgress(s, t.type, t.goal + 9999)
    expect(s.dailyQuests[0].progress).toBe(t.goal)
  })

  it('已领取的任务不再更新；未匹配类型不影响任何任务', () => {
    const s = fresh()
    s.dailyQuests[0].claimed = true
    const before = s.dailyQuests[0].progress
    updateDailyProgress(s, s.dailyQuests[0].type, 10)
    expect(s.dailyQuests[0].progress).toBe(before)

    const s2 = fresh()
    const before2 = s2.dailyQuests.map(q => q.progress)
    updateDailyProgress(s2, '不存在的类型' as DailyQuestType, 99)
    expect(s2.dailyQuests.map(q => q.progress)).toEqual(before2)
  })

  it('dailyQuests 缺失时不抛错', () => {
    const s = makeState({ dailyQuests: undefined as never })
    expect(() => updateDailyProgress(s, 'kills', 10)).not.toThrow()
  })

  it('同类型多个任务会被同时推进', () => {
    const s = makeState({ dailyQuests: [], dailyQuestDate: '' })
    s.dailyQuests = [
      { id: 'a', type: 'kills', name: 'A', desc: 'A', goal: 10, progress: 0, reward: { gold: 1 }, claimed: false },
      { id: 'b', type: 'kills', name: 'B', desc: 'B', goal: 10, progress: 0, reward: { gold: 1 }, claimed: false },
    ]
    updateDailyProgress(s, 'kills', 3)
    expect(s.dailyQuests.map(q => q.progress)).toEqual([3, 3])
  })
})

describe('claimDailyReward', () => {
  const ready = () => {
    const s = makeState({ dailyQuests: generateDailyQuests(makeRng(31)), dailyQuestDate: getTodayKey(), gold: 0, insight: 0 })
    s.dailyQuests[0].progress = s.dailyQuests[0].goal
    return s
  }

  it('进度达标时可领取，发放奖励并置位 claimed', () => {
    const s = ready()
    const q = s.dailyQuests[0]
    const goldBefore = s.gold
    const insightBefore = s.insight
    expect(claimDailyReward(s, q.id)).toBe(true)
    expect(s.dailyQuests[0].claimed).toBe(true)
    if (q.reward.gold) expect(s.gold).toBe(goldBefore + q.reward.gold)
    if (q.reward.insight) expect(s.insight).toBe(insightBefore + q.reward.insight)
  })

  it('重复领取返回 false', () => {
    const s = ready()
    const id = s.dailyQuests[0].id
    expect(claimDailyReward(s, id)).toBe(true)
    expect(claimDailyReward(s, id)).toBe(false)
  })

  it('进度未达标 / 未知 id / 无任务列表 均返回 false', () => {
    const s = ready()
    expect(claimDailyReward(s, s.dailyQuests[1].id)).toBe(false) // 进度 0
    expect(claimDailyReward(s, '不存在的任务')).toBe(false)
    expect(claimDailyReward(makeState({ dailyQuests: undefined as never }), 'x')).toBe(false)
  })

  it('有宗门时悟道与声望同时写入宗门资源', () => {
    const s = ready()
    s.sect = makeSect()
    s.dailyQuests[0].reward = { insight: 7, prestige: 3 }
    const beforeInsight = s.sect.resources.insight
    const beforePrestige = s.sect.resources.prestige
    claimDailyReward(s, s.dailyQuests[0].id)
    expect(s.sect.resources.insight).toBe(beforeInsight + 7)
    expect(s.sect.resources.prestige).toBe(beforePrestige + 3)
    expect(s.insight).toBe(7)
  })
})

describe('getDailyQuestStats', () => {
  it('统计 总数 / 已完成 / 已领取', () => {
    const s = makeState({ dailyQuests: generateDailyQuests(makeRng(5)), dailyQuestDate: getTodayKey() })
    expect(getDailyQuestStats(s)).toEqual({ total: 3, completed: 0, claimed: 0 })
    s.dailyQuests[0].progress = s.dailyQuests[0].goal
    expect(getDailyQuestStats(s)).toEqual({ total: 3, completed: 1, claimed: 0 })
    s.dailyQuests[0].claimed = true
    expect(getDailyQuestStats(s)).toEqual({ total: 3, completed: 1, claimed: 1 })
  })

  it('无任务列表时返回全零', () => {
    expect(getDailyQuestStats(makeState({ dailyQuests: undefined as never })))
      .toEqual({ total: 0, completed: 0, claimed: 0 })
  })
})
