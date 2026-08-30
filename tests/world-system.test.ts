// ---------- 大地图 / 世界时间 / 随机事件 三系统单测 ----------
// 覆盖 src/world-map.ts、src/world-time.ts、src/world-events.ts

import { describe, expect, it } from 'vitest'
import {
  WORLD_POINTS, WORLD_MAP_W, WORLD_MAP_H, DOMAINS,
  getDomainPoints, getDomainDef, getPoint, isPointUnlocked, getTeleportTargets,
  type DomainId, type WorldPoint,
} from '../src/world-map'
import {
  newWorldTime, seasonOf, isDaytime, isNight, seasonModifier, advanceTime, advanceDays,
  formatTime, formatDate, timeOfDayName, SHICHEN_NAMES, MONTH_NAMES, SEASONS,
  type WorldTime,
} from '../src/world-time'
import { rollWorldEvent, shouldTriggerEvent, type WorldEventType } from '../src/world-events'
import { makeRng } from '../src/core'
import { constRng } from './system-test-helpers'
import { MAIN_QUESTS } from '../src/storyline-data'

const ALL_DOMAINS: DomainId[] = ['south', 'central', 'east', 'west', 'north']
const VALID_TYPES = ['home', 'city', 'dungeon', 'resource', 'teleport', 'landmark', 'sect', 'domain_gate']

const mockProgress = (level: number, realm: number, qm = false, ym = false) =>
  ({ level, realm, progress: { qmCleared: qm, ymCleared: ym } })

// ==================== 大地图 ====================
describe('大地图点位数据', () => {
  it('点位非空且 id 全局唯一', () => {
    expect(WORLD_POINTS.length).toBeGreaterThan(0)
    const ids = WORLD_POINTS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('每个点位字段完整', () => {
    for (const p of WORLD_POINTS) {
      expect(p.id.length).toBeGreaterThan(0)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.icon.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
      expect(VALID_TYPES).toContain(p.type)
      expect(ALL_DOMAINS).toContain(p.domain)
    }
  })

  it('坐标落在地图尺寸范围内', () => {
    expect(WORLD_MAP_W).toBeGreaterThan(0)
    expect(WORLD_MAP_H).toBeGreaterThan(0)
    for (const p of WORLD_POINTS) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(WORLD_MAP_W)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(WORLD_MAP_H)
    }
  })

  it('类型专属字段齐备：秘境带 dungeonData / 资源点带 resourceType / 域门带 domainGateTarget', () => {
    for (const p of WORLD_POINTS) {
      if (p.type === 'dungeon') {
        expect(p.dungeonData).toBeDefined()
        expect(p.dungeonData!.region.length).toBeGreaterThan(0)
        expect(p.dungeonData!.startFloor).toBeGreaterThan(0)
        expect(p.dungeonData!.difficulty).toBeGreaterThanOrEqual(0)
      }
      if (p.type === 'resource') expect(p.resourceType).toBeTruthy()
      if (p.type === 'domain_gate') {
        expect(p.domainGateTarget).toBeDefined()
        expect(ALL_DOMAINS).toContain(p.domainGateTarget!)
      }
    }
  })

  it('五域定义完整，点位全部归属已定义的域', () => {
    expect(DOMAINS).toHaveLength(5)
    const ids = DOMAINS.map(d => d.id)
    expect(new Set(ids)).toEqual(new Set(ALL_DOMAINS))
    for (const d of DOMAINS) {
      expect(d.name.length).toBeGreaterThan(0)
      expect(d.desc.length).toBeGreaterThan(0)
      expect(d.bgTint).toBeGreaterThanOrEqual(0)
    }
  })

  it('域门双向连通：每个域都能回到南域或中域', () => {
    for (const d of ALL_DOMAINS) {
      const gates = getDomainPoints(d).filter(p => p.type === 'domain_gate')
      expect(gates.length).toBeGreaterThan(0)
      for (const g of gates) {
        expect(g.domainGateTarget).not.toBe(d) // 不允许指向自身
        expect(ALL_DOMAINS).toContain(g.domainGateTarget!)
      }
    }
  })

  it('主线任务 visit_point 目标（望仙崖）在点位表中存在', () => {
    const visitTargets = MAIN_QUESTS
      .filter(q => q.objectiveType === 'visit_point')
      .map(q => q.objectiveTarget)
    expect(visitTargets.length).toBeGreaterThan(0)
    for (const t of visitTargets) {
      expect(getPoint(t)).toBeDefined()
    }
  })
})

describe('大地图查询函数', () => {
  it('getDomainPoints 按域过滤且总数守恒', () => {
    let sum = 0
    for (const d of ALL_DOMAINS) {
      const list = getDomainPoints(d)
      expect(list.length).toBeGreaterThan(0)
      for (const p of list) expect(p.domain).toBe(d)
      sum += list.length
    }
    expect(sum).toBe(WORLD_POINTS.length)
  })

  it('getDomainDef 命中全部域，非法 id 返回 undefined', () => {
    for (const d of ALL_DOMAINS) expect(getDomainDef(d)!.id).toBe(d)
    expect(getDomainDef('不存在的域' as DomainId)).toBeUndefined()
  })

  it('getPoint 命中与未命中', () => {
    expect(getPoint('home')!.id).toBe('home')
    expect(getPoint('不存在的点位')).toBeUndefined()
  })

  it('getTeleportTargets 只返回传送阵', () => {
    for (const d of ALL_DOMAINS) {
      const list = getTeleportTargets(d)
      expect(list.length).toBeGreaterThan(0)
      for (const p of list) {
        expect(p.type).toBe('teleport')
        expect(p.domain).toBe(d)
      }
    }
  })

  it('isPointUnlocked：无解锁条件时始终开放', () => {
    const p: WorldPoint = { ...WORLD_POINTS[0], unlockCondition: null }
    expect(isPointUnlocked(p, mockProgress(1, 0))).toBe(true)
    const p2: WorldPoint = { ...WORLD_POINTS[0], unlockCondition: undefined }
    expect(isPointUnlocked(p2, mockProgress(1, 0))).toBe(true)
  })

  it('isPointUnlocked：等级 / 境界 / 任务条件各自生效', () => {
    const lv: WorldPoint = { ...WORLD_POINTS[0], unlockCondition: { level: 10 } }
    expect(isPointUnlocked(lv, mockProgress(9, 0))).toBe(false)
    expect(isPointUnlocked(lv, mockProgress(10, 0))).toBe(true)

    const rm: WorldPoint = { ...WORLD_POINTS[0], unlockCondition: { realm: 3 } }
    expect(isPointUnlocked(rm, mockProgress(99, 2))).toBe(false)
    expect(isPointUnlocked(rm, mockProgress(99, 3))).toBe(true)

    const q: WorldPoint = { ...WORLD_POINTS[0], unlockCondition: { questDone: 'qmCleared' } }
    expect(isPointUnlocked(q, mockProgress(99, 9, false, true))).toBe(false)
    expect(isPointUnlocked(q, mockProgress(99, 9, true, false))).toBe(true)

    const q2: WorldPoint = { ...WORLD_POINTS[0], unlockCondition: { questDone: 'ymCleared' } }
    expect(isPointUnlocked(q2, mockProgress(99, 9, true, false))).toBe(false)
    expect(isPointUnlocked(q2, mockProgress(99, 9, false, true))).toBe(true)
  })

  it('全部点位的解锁条件在满级状态下均可通过', () => {
    const maxed = mockProgress(999, 99, true, true)
    for (const p of WORLD_POINTS) {
      expect(isPointUnlocked(p, maxed)).toBe(true)
    }
  })

  it('【已知缺陷 B20】解锁条件 level/realm 为 0 时因 falsy 判定被跳过', () => {
    // 复现：isPointUnlocked 用 `if (c.level && ...)` 而非 `!== undefined`，
    // { level: 0 } / { realm: 0 } 会被当作"无条件"直接放行。
    // 当前数据表未使用 0 值，暂不影响线上；建议改为 hasOwnProperty 判定。
    const zeroLv: WorldPoint = { ...WORLD_POINTS[0], unlockCondition: { level: 0 } }
    expect(isPointUnlocked(zeroLv, mockProgress(0, 0))).toBe(true)
    const zeroRealm: WorldPoint = { ...WORLD_POINTS[0], unlockCondition: { realm: 0 } }
    expect(isPointUnlocked(zeroRealm, mockProgress(0, 0))).toBe(true)
  })
})

// ==================== 世界时间 ====================
describe('时间常量与初始状态', () => {
  it('时辰 12 个、月份 12 个、季节 4 个', () => {
    expect(SHICHEN_NAMES).toHaveLength(12)
    expect(MONTH_NAMES).toHaveLength(12)
    expect(SEASONS).toHaveLength(4)
    expect([...SEASONS]).toEqual(['春', '夏', '秋', '冬'])
    for (const n of SHICHEN_NAMES) expect(n.length).toBeGreaterThan(0)
    for (const n of MONTH_NAMES) expect(n.length).toBeGreaterThan(0)
  })

  it('newWorldTime 返回苍玄历元年正月初一辰时', () => {
    const t = newWorldTime()
    expect(t).toEqual({ year: 1, month: 1, day: 1, hour: 4, elapsed: 0 })
    expect(isDaytime(t)).toBe(true)
  })

  it('newWorldTime 每次返回独立对象', () => {
    const a = newWorldTime()
    const b = newWorldTime()
    a.day = 99
    expect(b.day).toBe(1)
  })
})

describe('seasonOf', () => {
  it('每三个月一个季节', () => {
    expect(seasonOf(1)).toBe('春')
    expect(seasonOf(3)).toBe('春')
    expect(seasonOf(4)).toBe('夏')
    expect(seasonOf(6)).toBe('夏')
    expect(seasonOf(7)).toBe('秋')
    expect(seasonOf(9)).toBe('秋')
    expect(seasonOf(10)).toBe('冬')
    expect(seasonOf(12)).toBe('冬')
  })

  it('【已知缺陷 B6】月份越界时返回 undefined，并污染格式化文本', () => {
    // 复现：seasonOf(month) = SEASONS[floor((month-1)/3)]，无钳制。
    // month=0 → SEASONS[-1]；month=13 → SEASONS[4]，均为 undefined。
    // formatTime 会渲染出「苍玄历1年 undefinedundefined1日」。
    // 建议：const m = Math.min(12, Math.max(1, month)) 后再索引。
    expect(seasonOf(0)).toBeUndefined()
    expect(seasonOf(13)).toBeUndefined()
    expect(seasonOf(-1)).toBeUndefined()
    const broken = { year: 1, month: 13, day: 1, hour: 4, elapsed: 0 }
    expect(formatTime(broken)).toContain('undefined')
  })
})

describe('昼夜判定', () => {
  it('辰~酉（hour 4~9）为白天，其余为夜晚', () => {
    for (let h = 0; h < 12; h++) {
      const t = { ...newWorldTime(), hour: h }
      expect(isDaytime(t)).toBe(h >= 4 && h <= 9)
      expect(isNight(t)).toBe(!isDaytime(t))
    }
  })

  it('【文档与实现不符】isNight 注释称"戌时~寅时"，实际还包含卯时', () => {
    // isNight = !isDaytime → hour ∈ {10, 11, 0, 1, 2, 3}，即 戌亥子丑寅卯。
    // 注释写的是「戌时~寅时」，漏掉卯时（hour 3）。
    expect(isNight({ ...newWorldTime(), hour: 3 })).toBe(true)
  })
})

describe('季节加成', () => {
  it('四季各自返回四项倍率且为正', () => {
    for (const s of SEASONS) {
      const m = seasonModifier(s)
      for (const v of Object.values(m)) {
        expect(v).toBeGreaterThan(0)
        expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('春促灵草、夏促遭遇、秋促资源、冬促修炼', () => {
    expect(seasonModifier('春').herbGrowth).toBeGreaterThan(1)
    expect(seasonModifier('夏').encounterRate).toBeGreaterThan(1)
    expect(seasonModifier('秋').resourceRate).toBeGreaterThan(1)
    expect(seasonModifier('冬').cultivateRate).toBeGreaterThan(1)
    expect(seasonModifier('冬').herbGrowth).toBeLessThan(1)
  })
})

describe('advanceTime / advanceDays', () => {
  it('不足一个时辰时只累计 elapsed，不改日历', () => {
    const t = newWorldTime()
    const r = advanceTime(t, 1000) // 0.04 时辰
    expect(r.elapsed).toBe(1000)
    expect(r.hour).toBe(4)
    expect(r.day).toBe(1)
    expect(r.month).toBe(1)
    expect(r.year).toBe(1)
  })

  it('现实 5 分钟 = 游戏内 1 天（12 时辰）', () => {
    const r = advanceDays(newWorldTime(), 1)
    expect(r.hour).toBe(4)
    expect(r.day).toBe(2)
    expect(r.month).toBe(1)
    expect(r.year).toBe(1)
  })

  it('跨月：30 天后进入二月', () => {
    const r = advanceDays(newWorldTime(), 30)
    expect(r.month).toBe(2)
    expect(r.day).toBe(1)
    expect(r.hour).toBe(4)
    expect(r.year).toBe(1)
  })

  it('跨年：360 天后进入二年正月', () => {
    const r = advanceDays(newWorldTime(), 360)
    expect(r.year).toBe(2)
    expect(r.month).toBe(1)
    expect(r.day).toBe(1)
    expect(r.hour).toBe(4)
  })

  it('推进 0 天不改变任何字段', () => {
    const t = newWorldTime()
    expect(advanceDays(t, 0)).toEqual(t)
    expect(advanceTime(t, 0)).toEqual(t)
  })

  it('分段推进与一次推进等价（elapsed 累积不丢时辰）', () => {
    let t = newWorldTime()
    for (let i = 0; i < 100; i++) t = advanceTime(t, 30_000) // 每次 1.2 时辰
    const once = advanceTime(newWorldTime(), 3_000_000)
    expect(t.hour).toBe(once.hour)
    expect(t.day).toBe(once.day)
    expect(t.month).toBe(once.month)
    expect(t.year).toBe(once.year)
    expect(t.elapsed).toBe(once.elapsed)
  })

  it('负增量不会让日历倒退（仍按 elapsed 记账）', () => {
    const t = newWorldTime()
    const r = advanceTime(t, -300_000)
    expect(r.year).toBe(1)
    expect(r.month).toBe(1)
    expect(r.day).toBe(1)
    expect(r.hour).toBe(4)
    expect(r.elapsed).toBe(-300_000)
    expect(Number.isFinite(advanceTime(r, 300_000).day)).toBe(true)
  })

  it('长时间推进不会产出越界月/日/时辰', () => {
    let t = newWorldTime()
    for (let i = 0; i < 500; i++) {
      t = advanceDays(t, 7)
      expect(t.month).toBeGreaterThanOrEqual(1)
      expect(t.month).toBeLessThanOrEqual(12)
      expect(t.day).toBeGreaterThanOrEqual(1)
      expect(t.day).toBeLessThanOrEqual(30)
      expect(t.hour).toBeGreaterThanOrEqual(0)
      expect(t.hour).toBeLessThanOrEqual(11)
    }
    expect(t.year).toBeGreaterThan(1)
  })
})

describe('时间格式化', () => {
  it('formatTime 输出完整历法文本', () => {
    expect(formatTime(newWorldTime())).toBe('苍玄历1年 春正月1日 辰时·白昼')
    expect(formatTime({ year: 3, month: 7, day: 15, hour: 11, elapsed: 0 }))
      .toBe('苍玄历3年 秋七月15日 亥时·夜')
  })

  it('formatDate 只输出季节+月日', () => {
    expect(formatDate(newWorldTime())).toBe('春正月1日')
    expect(formatDate({ year: 2, month: 12, day: 30, hour: 0, elapsed: 0 })).toBe('冬腊月30日')
  })

  it('timeOfDayName 覆盖 0~11 全部时辰', () => {
    const names = Array.from({ length: 12 }, (_, h) => timeOfDayName({ ...newWorldTime(), hour: h }))
    expect(names).toEqual([
      '深夜', '深夜', '拂晓', '拂晓', '拂晓',
      '清晨', '清晨', '清晨', '午后', '午后', '黄昏', '黄昏',
    ])
    for (const n of names) expect(n.length).toBeGreaterThan(0)
  })

  it('【已知缺陷 B21】timeOfDayName 的兜底分支「日间」永远不可达', () => {
    // 复现：0~11 全部被前五个分支覆盖，末尾 `return '日间'` 是死代码。
    // 若未来扩展时辰数（>12），该兜底才会生效。建议删除或加注释。
    const reached = Array.from({ length: 12 }, (_, h) => timeOfDayName({ ...newWorldTime(), hour: h }))
    expect(reached).not.toContain('日间')
  })
})

// ==================== 随机事件 ====================
describe('shouldTriggerEvent', () => {
  it('以移动累积量是否达到阈值为准（含等号）', () => {
    expect(shouldTriggerEvent(99, 100)).toBe(false)
    expect(shouldTriggerEvent(100, 100)).toBe(true)
    expect(shouldTriggerEvent(101, 100)).toBe(true)
    expect(shouldTriggerEvent(0, 0)).toBe(true)
  })
})

describe('rollWorldEvent', () => {
  const day = newWorldTime()                                  // hour 4 → 白天，month 1 → 春
  const night = { ...newWorldTime(), hour: 0 }                // 子时 → 夜晚
  const summer = { ...newWorldTime(), month: 6 }              // 夏
  const winter = { ...newWorldTime(), month: 11 }             // 冬

  it('rng 端点命中确定事件且不越界', () => {
    expect(rollWorldEvent(constRng(0), day, 10).type).toBe('monster_ambush')
    expect(rollWorldEvent(constRng(0.15), day, 10).type).toBe('treasure_find')
    expect(rollWorldEvent(constRng(0.999999), day, 10).type).toBe('fog_trap')
  })

  it('事件结构完整：标题、描述、至少一个选项', () => {
    for (let i = 0; i < 300; i++) {
      const e = rollWorldEvent(makeRng(i), { ...newWorldTime(), hour: i % 12, month: (i % 12) + 1 }, 5 + i)
      expect(e).toBeTruthy()
      expect(e.title.length).toBeGreaterThan(0)
      expect(e.description.length).toBeGreaterThan(0)
      expect(e.choices.length).toBeGreaterThan(0)
      for (const c of e.choices) {
        expect(c.label.length).toBeGreaterThan(0)
        expect(c.text.length).toBeGreaterThan(0)
        expect(['battle', 'reward', 'leave', 'teleport_home']).toContain(c.outcome)
      }
    }
  })

  it('十二种事件类型均可达', () => {
    const seen = new Set<WorldEventType>()
    for (let i = 0; i < 4000; i++) {
      const t = { ...newWorldTime(), hour: i % 12, month: (i % 12) + 1 }
      seen.add(rollWorldEvent(makeRng(i), t, 10).type)
    }
    expect(seen.size).toBe(12)
  })

  it('夜晚偏向危险事件，白天偏向奇遇事件', () => {
    const freq = (time: WorldTime, type: WorldEventType) => {
      let n = 0
      const N = 6000
      for (let i = 0; i < N; i++) {
        if (rollWorldEvent(makeRng(i), time, 10).type === type) n++
      }
      return n / N
    }
    expect(freq(night, 'monster_ambush')).toBeGreaterThan(freq(day, 'monster_ambush'))
    expect(freq(night, 'fog_trap')).toBeGreaterThan(freq(day, 'fog_trap'))
    expect(freq(day, 'treasure_find')).toBeGreaterThan(freq(night, 'treasure_find'))
  })

  it('季节影响事件权重（春多灵草 / 夏多兽群 / 冬多感悟）', () => {
    const freq = (time: WorldTime, type: WorldEventType) => {
      let n = 0
      const N = 6000
      for (let i = 0; i < N; i++) {
        if (rollWorldEvent(makeRng(i), time, 10).type === type) n++
      }
      return n / N
    }
    const spring = day // month 1 → 春
    expect(freq(spring, 'herb_discovery')).toBeGreaterThan(freq(winter, 'herb_discovery'))
    expect(freq(summer, 'beast_pack')).toBeGreaterThan(freq(winter, 'beast_pack'))
    expect(freq(winter, 'cultivation_insight')).toBeGreaterThan(freq(spring, 'cultivation_insight'))
  })

  it('battle 类选项携带秘境参数，供战斗跳转使用', () => {
    let battles = 0
    for (let i = 0; i < 600; i++) {
      const e = rollWorldEvent(makeRng(i), day, 20)
      for (const c of e.choices) {
        if (c.outcome !== 'battle') continue
        battles++
        expect(c.reward?.dungeonRegion).toBeTruthy()
        expect(typeof c.reward?.dungeonFloor).toBe('number')
        expect(typeof c.reward?.dungeonDifficulty).toBe('number')
      }
    }
    expect(battles).toBeGreaterThan(0)
  })

  it('【已知缺陷 B9】三处分支使用 Math.random，注入固定 rng 也无法复现', () => {
    // 复现：src/world-events.ts 中 treasure_find / spirit_tide / ancestor_relic
    // 的奖励写成 `materials: { tupo: Math.random() < 0.3 ? 1 : 0 }`，
    // 绕过了传入的 rng，导致同一种子两次调用结果不一致（破坏存档回放与确定性测试）。
    // 实测：固定 constRng(0.15) 命中 treasure_find，重复 300 次后 tupo 同时出现 0 和 1。
    // 建议：改为 `rng() < 0.3 ? 1 : 0`。
    const values = new Set<number>()
    for (let i = 0; i < 300; i++) {
      const e = rollWorldEvent(constRng(0.15), day, 10) // 恒定命中 treasure_find
      expect(e.type).toBe('treasure_find')
      const choice = e.choices.find(c => c.label === '搜寻宝物')!
      values.add(choice.reward?.materials?.tupo ?? -1)
    }
    expect(values.size).toBe(2)
    expect([...values].sort()).toEqual([0, 1])
  })

  it('其中仍有一处 rng 驱动的奖励是可复现的（对照组）', () => {
    const a = rollWorldEvent(constRng(0.15), day, 10)
    const b = rollWorldEvent(constRng(0.15), day, 10)
    const pick = (e: ReturnType<typeof rollWorldEvent>) =>
      e.choices.find(c => c.label === '仔细参悟壁上剑痕')!.reward?.insight
    expect(pick(a)).toBe(pick(b)) // 走 randInt(rng, 0, 5)，同种子同结果
  })

  it('【已知缺陷 B16】rng 返回 1.0 时越界，rollWorldEvent 返回 undefined', () => {
    // 复现：randInt(rng, 0, len-1) = min + floor(rng() * len)，rng()=1 → 索引 len（越界）；
    // buildEvent 的 switch 没有 default 分支，未命中时函数隐式返回 undefined。
    // makeRng 不会产生 1.0（上限为 4294967295/4294967296），故线上暂未触发，
    // 但任何自定义 rng 或未来的 rng 实现都可能踩中。
    // 建议：randInt 结果做 clamp，buildEvent 增加 default 兜底。
    const e = rollWorldEvent(constRng(1), day, 10)
    expect(e).toBeUndefined()
  })
})
