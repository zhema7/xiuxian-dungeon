// ---------- 五职业天赋树单测（v0.9） ----------
// 覆盖：数据结构完整性、职业隔离、顶点门槛、流派一键加点、新机制接入、预设方案、存档迁移

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CAPSTONE_REQ, TALENT_NODES, TALENT_TREES, talentBranchesFor, emptyMods, type ModKey,
} from '../src/data'
import {
  addPoint, autoAssignBranch, availablePoints, branchSpent, branchesOf, canAddPoint,
  deletePreset, presetsOf, savePreset, applyPreset as applyTalentPreset, spentPoints,
  MAX_TALENT_PRESETS, talentMods,
} from '../src/talents'
import { calcStats, type Stats } from '../src/effects'
import { calcDamage } from '../src/core'
import { newGame, loadGame, SAVE_VERSION, type GameState } from '../src/state'

const store: Record<string, string> = {}
const lsMock = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = String(v) },
  removeItem: (k: string) => { delete store[k] },
  clear: () => { for (const k of Object.keys(store)) delete store[k] },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() { return Object.keys(store).length },
}
vi.stubGlobal('localStorage', lsMock)

const CLASS_IDS = ['sword', 'fairy', 'sword_new', 'fairy_new', 'mage']

function stateOf(classId: string, level = 100): GameState {
  const s = newGame()
  s.classId = classId
  s.level = level
  return s
}

// ---------- 1. 数据结构 ----------
describe('天赋树数据结构', () => {
  it('五个职业各一棵树，每棵 3 分支 × 6 节点 = 18 节点', () => {
    expect(Object.keys(TALENT_TREES).sort()).toEqual([...CLASS_IDS].sort())
    for (const id of CLASS_IDS) {
      const brs = talentBranchesFor(id)
      expect(brs).toHaveLength(3)
      const nodes = brs.flatMap((b) => b.nodes)
      expect(nodes).toHaveLength(18)
      for (const b of brs) expect(b.nodes).toHaveLength(6)
    }
  })

  it('全树 90 个节点且 id 唯一', () => {
    expect(TALENT_NODES.size).toBe(90)
    const ids = [...TALENT_NODES.keys()]
    expect(new Set(ids).size).toBe(90)
  })

  it('每分支 3 基础(max8) + 2 进阶(max6) + 1 顶点(max1) = 37 点；全树 111 点 > 100 级 99 点', () => {
    for (const id of CLASS_IDS) {
      for (const br of talentBranchesFor(id)) {
        const t1 = br.nodes.filter((n) => n.tier === 1)
        const t2 = br.nodes.filter((n) => n.tier === 2)
        const t3 = br.nodes.filter((n) => n.tier === 3)
        expect(t1).toHaveLength(3)
        expect(t2).toHaveLength(2)
        expect(t3).toHaveLength(1)
        expect(t1.every((n) => n.max === 8)).toBe(true)
        expect(t2.every((n) => n.max === 6)).toBe(true)
        expect(t3[0].max).toBe(1)
        expect(br.nodes.reduce((a, n) => a + n.max, 0)).toBe(37)
      }
      const total = talentBranchesFor(id).flatMap((b) => b.nodes).reduce((a, n) => a + n.max, 0)
      expect(total).toBe(111)
    }
  })

  it('每个分支都有流派名与描述，且 15 个流派互不重名', () => {
    const styles: string[] = []
    for (const id of CLASS_IDS) {
      for (const br of talentBranchesFor(id)) {
        expect(br.style.length).toBeGreaterThan(0)
        expect(br.desc.length).toBeGreaterThan(0)
        styles.push(br.style)
      }
    }
    expect(styles).toHaveLength(15)
    expect(new Set(styles).size).toBe(15)
  })

  it('每个节点都有效果文案与至少 1 项修饰', () => {
    for (const n of TALENT_NODES.values()) {
      expect(n.desc.length).toBeGreaterThan(0)
      expect(Object.keys(n.per).length).toBeGreaterThan(0)
      for (const k of Object.keys(n.per)) {
        expect(Object.prototype.hasOwnProperty.call(emptyMods(), k)).toBe(true)
      }
    }
  })
})

// ---------- 2. 职业隔离与顶点门槛 ----------
describe('加点规则', () => {
  it('只能点本职业节点：剑修点不了法修节点', () => {
    const s = stateOf('sword')
    expect(addPoint(s, 'mage_star_b1')).toBe(false)
    expect(spentPoints(s)).toBe(0)
    expect(addPoint(s, 't_jifeng')).toBe(true)
  })

  it('tier 3 顶点需本分支先投满 CAPSTONE_REQ 点', () => {
    const s = stateOf('sword')
    const br = branchesOf(s).find((b) => b.id === 'fast')!
    const cap = br.nodes.find((n) => n.tier === 3)!
    expect(canAddPoint(s, cap.id)).toBe(false)
    // 先把基础+进阶投到 24 点
    let guard = 0
    while (branchSpent(s, br) < CAPSTONE_REQ && guard++ < 200) {
      const node = br.nodes.find((n) => n.tier !== 3 && (s.talents[n.id] ?? 0) < n.max)
      if (!node) break
      addPoint(s, node.id)
    }
    expect(branchSpent(s, br)).toBeGreaterThanOrEqual(CAPSTONE_REQ)
    expect(canAddPoint(s, cap.id)).toBe(true)
  })

  it('节点不可超过 max，天赋点不可超支', () => {
    const s = stateOf('sword', 10) // 9 点
    for (let i = 0; i < 20; i++) addPoint(s, 't_jifeng')
    expect(s.talents.t_jifeng).toBe(8)
    expect(spentPoints(s)).toBe(8)
    expect(availablePoints(s)).toBe(1)
  })
})

// ---------- 3. 流派一键加点 ----------
describe('流派一键加点', () => {
  it('一键点满单分支消耗 37 点（100 级共 99 点，够点两条分支）', () => {
    const s = stateOf('mage')
    const added = autoAssignBranch(s, 'star')
    expect(added).toBe(37)
    const br = branchesOf(s).find((b) => b.id === 'star')!
    expect(branchSpent(s, br)).toBe(37)
    expect(availablePoints(s)).toBe(99 - 37)
    // 顶点已解锁并点满
    const cap = br.nodes.find((n) => n.tier === 3)!
    expect(s.talents[cap.id]).toBe(1)
  })

  it('一键加点不会跨分支溢出', () => {
    const s = stateOf('fairy_new')
    autoAssignBranch(s, 'poison')
    const others = branchesOf(s).filter((b) => b.id !== 'poison')
    expect(others.reduce((a, b) => a + branchSpent(s, b), 0)).toBe(0)
  })

  it('点数不足时按基础→进阶顺序尽力分配', () => {
    const s = stateOf('sword', 11) // 10 点
    const added = autoAssignBranch(s, 'heavy')
    expect(added).toBe(10)
    const br = branchesOf(s).find((b) => b.id === 'heavy')!
    // 优先基础：前三个基础节点应各有一点
    for (const n of br.nodes.filter((x) => x.tier === 1)) {
      expect(s.talents[n.id] ?? 0).toBeGreaterThan(0)
    }
  })
})

// ---------- 4. 新机制接入 ----------
describe('天赋新机制', () => {
  it('六类新机制经天赋进入 Stats', () => {
    const s = stateOf('sword_new') // 道修：反伤 / 护盾
    autoAssignBranch(s, 'earth')   // 厚土·反伤流
    const st: Stats = calcStats(s)
    expect(st.thorns).toBeGreaterThan(0)
    expect(st.shieldPct).toBeGreaterThan(0) // 进阶节点「载物」提供护盾
    expect(st.thorns).toBeLessThanOrEqual(0.6)
  })

  it('合欢·血煞流提供斩杀线与吸血；闪避流提供闪避', () => {
    const s = stateOf('fairy_new')
    autoAssignBranch(s, 'blood')
    let st = calcStats(s)
    expect(st.execute).toBeGreaterThan(0)
    expect(st.execute).toBeLessThanOrEqual(0.3)
    expect(st.lifesteal).toBeGreaterThan(0)

    const s2 = stateOf('fairy_new')
    autoAssignBranch(s2, 'shadow')
    st = calcStats(s2)
    expect(st.dodge).toBeGreaterThan(0)
    expect(st.dodge).toBeLessThanOrEqual(0.5)
  })

  it('持续伤害：仙子灼烧流 / 合欢毒伤流写入 dotPct', () => {
    const a = stateOf('fairy'); autoAssignBranch(a, 'fire')
    expect(calcStats(a).dotPct).toBeGreaterThan(0)
    const b = stateOf('fairy_new'); autoAssignBranch(b, 'poison')
    expect(calcStats(b).dotPct).toBeGreaterThan(0)
  })

  it('会心伤害提升暴击伤害（基础 1.6 倍之上叠加）', () => {
    const rng = () => 0 // 必定暴击
    // rng 恒为 0：必定暴击且浮动取下界 ×0.9
    const base = calcDamage(100, 1, 1, 0, rng, 0).dmg
    const withCritDmg = calcDamage(100, 1, 1, 0, rng, 1.0).dmg
    expect(base).toBe(144)                        // 100 × 1.6 × 0.9
    expect(withCritDmg).toBe(234)                 // 100 × 2.6 × 0.9
    expect(withCritDmg).toBeGreaterThan(base * 1.5)
    // 不暴击时不受影响
    const noCrit = calcDamage(100, 1, 0, 0, () => 0.999, 1.0).dmg
    expect(noCrit).toBeLessThan(120)
  })

  it('非本职业的残留点数不生效（talentMods 过滤）', () => {
    const s = stateOf('mage')
    s.talents = { t_jifeng: 8 } // 剑修节点
    const mods = talentMods(s)
    expect(mods.aspd).toBe(0)
  })
})

// ---------- 5. 预设方案 ----------
describe('加点方案预设', () => {
  beforeEach(() => lsMock.clear())

  it('保存 / 套用 / 删除，且上限 3 套', () => {
    const s = stateOf('mage')
    autoAssignBranch(s, 'star')
    expect(savePreset(s, '方案一')).toBe(true)
    expect(presetsOf(s)).toHaveLength(1)

    // 洗掉再套用
    s.talents = {}
    expect(applyTalentPreset(s, 0)).toBe(true)
    expect(spentPoints(s)).toBe(37)

    expect(savePreset(s, '方案二')).toBe(true)
    expect(savePreset(s, '方案三')).toBe(true)
    expect(savePreset(s, '方案四')).toBe(false)
    expect(presetsOf(s)).toHaveLength(MAX_TALENT_PRESETS)

    expect(deletePreset(s, 0)).toBe(true)
    expect(presetsOf(s)).toHaveLength(2)
    expect(applyTalentPreset(s, 99)).toBe(false)
  })

  it('空加点不允许保存', () => {
    const s = stateOf('mage')
    expect(savePreset(s, '空')).toBe(false)
  })
})

// ---------- 6. 存档迁移 ----------
describe('存档版本', () => {
  beforeEach(() => lsMock.clear())

  it('SAVE_VERSION 为 14', () => {
    expect(SAVE_VERSION).toBe(14)
  })

  it('旧档天赋清空并免费重置', () => {
    store['xiuxian_save_v1'] = JSON.stringify({
      version: 13, level: 50, classId: 'mage',
      talents: { t_jifeng: 3, t_bengshan: 3 }, // 旧全局 9 节点
      gold: 1000,
    })
    const s = loadGame()
    expect(s).toBeTruthy()
    expect(Object.keys(s!.talents)).toHaveLength(0)
    expect(availablePoints(s!)).toBe(49)
    expect(s!.talentPresets ?? []).toHaveLength(0)
  })
})
