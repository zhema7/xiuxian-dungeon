// ---------- NPC 修为档案单测 ----------
// 覆盖：三维度加成（修为 / 经历 / 时间）、装备物化、功法装配、战力换算、时间成长、旧档回填

import { describe, expect, it } from 'vitest'
import type { ProceduralNpc } from '../src/procedural-npc'
import {
  NPC_GEAR_SLOTS, advanceNpcCultivation, buildNpcLoadout, buildNpcStats, daoYearsOf,
  ensureNpcProgression, estimatePlayerPower, forgeNpcGear, isNpcOwnedItem,
  npcEquippedSkillIds, npcGearBonus, npcGearSummary, npcPowerMult, npcSkillSummary, npcTraitMods,
  sectNpcProfile,
} from '../src/npc-progression'
import { SKILLS } from '../src/data'

function makeNpc(over: Partial<ProceduralNpc> = {}): ProceduralNpc {
  return {
    id: 'pnpc_test',
    seed: 20260909,
    name: '测试道友',
    gender: 'male',
    age: 30,
    realm: 1,
    level: 12,
    physique: '普通',
    profession: '散修',
    personality: ['淡泊'],
    background: '寒门子弟',
    daoPath: '剑道',
    lifeGoal: '飞升长生',
    currentPurpose: '采药',
    secret: '暗伤隐患：修炼过急留有暗伤',
    story: { surface: '', middle: '', deep: '' },
    inventory: {},
    equipment: {},
    skills: [],
    gear: { weapon: null, head: null, armor: null, boots: null },
    loadout: { style: null, minds: [null, null], art: null },
    skillLevels: {},
    cultivation: 0,
    cultivationDays: 0,
    lastGrowthAt: 0,
    breakthroughs: 0,
    power: 0,
    morality: 0,
    location: { domain: 'south', x: 0, y: 0 },
    schedule: null,
    relations: [],
    appearanceSeed: 1,
    isActive: true,
    alive: true,
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 5,
    spd: 8,
    eventLog: [],
    spawnTime: 0,
    ...over,
  } as ProceduralNpc
}

/** 完整档案：生成 → 装配 → 算属性 */
function withProgression(over: Partial<ProceduralNpc> = {}): ProceduralNpc {
  const npc = makeNpc(over)
  npc.gear = forgeNpcGear(npc)
  const { loadout, levels } = buildNpcLoadout(npc)
  npc.loadout = loadout
  npc.skillLevels = levels
  Object.assign(npc, buildNpcStats(npc), { power: buildNpcStats(npc).power })
  return npc
}

describe('NPC 修为档案 · 经历维度', () => {
  it('天资与出身会显著改变战力', () => {
    const weak = withProgression({ physique: '普通', background: '寒门子弟', daoPath: '丹道' })
    const strong = withProgression({ physique: '异灵根', background: '世家嫡子', daoPath: '剑道' })
    expect(buildNpcStats(strong).power).toBeGreaterThan(buildNpcStats(weak).power * 1.15)
  })

  it('经历加成可确定性复现（同输入同结果）', () => {
    const a = npcTraitMods(makeNpc())
    const b = npcTraitMods(makeNpc())
    expect(a).toEqual(b)
  })

  it('好战提高攻击、谨慎提高防御', () => {
    const aggr = npcTraitMods(makeNpc({ personality: ['好战'] }))
    const care = npcTraitMods(makeNpc({ personality: ['谨慎'] }))
    expect(aggr.atk).toBeGreaterThan(care.atk)
    expect(care.def).toBeGreaterThan(aggr.def)
  })
})

describe('NPC 修为档案 · 修为维度', () => {
  it('境界越高战力单调上升', () => {
    let prev = 0
    for (let realm = 0; realm <= 5; realm++) {
      const npc = withProgression({ realm, level: realm * 10 + 5 })
      const p = buildNpcStats(npc).power
      expect(p).toBeGreaterThan(prev)
      prev = p
    }
  })

  it('同境界下等级越高战力越高', () => {
    const low = buildNpcStats(withProgression({ realm: 2, level: 21 })).power
    const high = buildNpcStats(withProgression({ realm: 2, level: 29 })).power
    expect(high).toBeGreaterThan(low)
  })
})

describe('NPC 修为档案 · 时间维度', () => {
  it('道行随年岁、突破次数与在世历练累加', () => {
    const base = daoYearsOf(makeNpc({ age: 30, breakthroughs: 0, cultivationDays: 0 }))
    const older = daoYearsOf(makeNpc({ age: 130, breakthroughs: 0, cultivationDays: 0 }))
    const bt = daoYearsOf(makeNpc({ age: 30, breakthroughs: 4, cultivationDays: 0 }))
    const days = daoYearsOf(makeNpc({ age: 30, breakthroughs: 0, cultivationDays: 300 }))
    expect(older).toBeGreaterThan(base)
    expect(bt).toBeGreaterThan(base)
    expect(days).toBeGreaterThan(base)
  })

  it('道行深的同龄人更强（封顶 +60%）', () => {
    const young = buildNpcStats(withProgression({ age: 20, breakthroughs: 0, cultivationDays: 0 }))
    const old = buildNpcStats(withProgression({ age: 20, breakthroughs: 40, cultivationDays: 2000 }))
    expect(old.atk).toBeGreaterThan(young.atk)
    expect(old.atk / young.atk).toBeLessThanOrEqual(1.61)
  })
})

describe('NPC 装备物化', () => {
  it('生成真实四槽装备且槽位自洽', () => {
    const npc = withProgression({ realm: 3, level: 35 })
    const filled = NPC_GEAR_SLOTS.filter(s => npc.gear[s])
    expect(filled.length).toBeGreaterThan(0)
    for (const s of filled) {
      expect(npc.gear[s]!.slot).toBe(s)
      expect(npc.gear[s]!.uid).toContain('npcgear_')
      expect(isNpcOwnedItem(npc.gear[s])).toBe(true)
    }
  })

  it('高境界装备品质与强化不低于低境界（同一 NPC 档案）', () => {
    const low = forgeNpcGear(makeNpc({ realm: 0, level: 5 }))
    const high = forgeNpcGear(makeNpc({ realm: 6, level: 70 }))
    const score = (g: typeof low) => NPC_GEAR_SLOTS.reduce((s, k) => s + (g[k]?.quality ?? 0) + (g[k]?.enh ?? 0), 0)
    expect(score(high)).toBeGreaterThan(score(low))
  })

  it('世家嫡子出身装备优于寒门子弟', () => {
    const poor = npcGearBonus(forgeNpcGear(makeNpc({ realm: 2, level: 25, background: '寒门子弟' })))
    const rich = npcGearBonus(forgeNpcGear(makeNpc({ realm: 2, level: 25, background: '世家嫡子' })))
    expect(rich.atk + rich.def + rich.maxHp).toBeGreaterThanOrEqual(poor.atk + poor.def + poor.maxHp)
  })

  it('装备加成按强化 +2/级 计入（与队员面板同口径）', () => {
    const npc = makeNpc()
    npc.gear = forgeNpcGear(npc)
    const bonus = npcGearBonus(npc.gear)
    const raw = NPC_GEAR_SLOTS.reduce((s, k) => {
      const it = npc.gear[k]
      if (!it) return s
      return { atk: s.atk + (it.atk ?? 0), def: s.def + (it.def ?? 0), enh: s.enh + (it.enh ?? 0) * 2 }
    }, { atk: 0, def: 0, enh: 0 })
    expect(bonus.atk).toBe(raw.atk + raw.enh)
    expect(bonus.def).toBe(raw.def + raw.enh)
  })

  it('装备摘要含品质与强化标记', () => {
    const npc = withProgression({ realm: 4, level: 50 })
    const lines = npcGearSummary(npc)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.join('')).toMatch(/凡品|灵品|宝品|玄品/)
  })
})

describe('NPC 功法装配', () => {
  it('按道途取对应流派功法，且均为真实技能 id', () => {
    const sword = buildNpcLoadout(makeNpc({ daoPath: '剑道', realm: 3, level: 35 }))
    const ids = [sword.loadout.style, ...sword.loadout.minds, sword.loadout.art].filter(Boolean) as string[]
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(SKILLS.has(id)).toBe(true)
    expect(SKILLS.get(sword.loadout.style!)?.class).not.toBe('mage')
  })

  it('境界越高装配门数越多（上限四门）', () => {
    const low = npcEquippedSkillIds(buildNpcLoadout(makeNpc({ realm: 0, level: 3 })).loadout).length
    const high = npcEquippedSkillIds(buildNpcLoadout(makeNpc({ realm: 6, level: 70 })).loadout).length
    expect(high).toBeGreaterThanOrEqual(low)
    expect(high).toBeLessThanOrEqual(4)
  })

  it('功法修炼等级随境界提升且不超过 5', () => {
    const low = Object.values(buildNpcLoadout(makeNpc({ realm: 0, level: 3 })).levels)
    const high = Object.values(buildNpcLoadout(makeNpc({ realm: 6, level: 70 })).levels)
    const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)
    expect(avg(high)).toBeGreaterThan(avg(low))
    for (const lv of [...low, ...high]) {
      expect(lv).toBeGreaterThanOrEqual(1)
      expect(lv).toBeLessThanOrEqual(5)
    }
  })

  it('功法摘要带修炼等级', () => {
    const npc = withProgression({ realm: 3, level: 35 })
    const lines = npcSkillSummary(npc)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0]).toMatch(/Lv\d/)
  })
})

describe('战力换算与成长', () => {
  it('战力倍率钳制在下限 0.5 / 上限 2.2', () => {
    expect(npcPowerMult(0, 50)).toBeCloseTo(0.5, 5)
    expect(npcPowerMult(estimatePlayerPower(50) * 100, 50)).toBe(2.2)
    // 传入真实玩家属性时基准更准
    const strong = npcPowerMult(5000, 50, { maxHp: 500, atk: 60, def: 30, speed: 120, crit: 0.1 })
    expect(strong).toBeGreaterThan(npcPowerMult(5000, 50))
  })

  it('同境界 NPC 相对同级玩家倍率落在合理区间（不再系统性虚高）', () => {
    const npc = withProgression({ realm: 2, level: 25 })
    const mult = npcPowerMult(buildNpcStats(npc).power, 25)
    expect(mult).toBeGreaterThanOrEqual(0.45)
    expect(mult).toBeLessThan(2.2)
    // 高境界 NPC 明显强于低境界同行
    const high = npcPowerMult(buildNpcStats(withProgression({ realm: 5, level: 55 })).power, 25)
    expect(high).toBeGreaterThan(mult)
  })

  it('时间推进会带来升级且战力提升', () => {
    const npc = withProgression({ realm: 0, level: 5 })
    const before = { level: npc.level, power: buildNpcStats(npc).power }
    advanceNpcCultivation(npc, 120, () => 0.99)
    expect(npc.level).toBeGreaterThan(before.level)
    expect(buildNpcStats(npc).power).toBeGreaterThan(before.power)
  })

  it('达标且判定成功时突破境界并重铸装备', () => {
    const npc = withProgression({ realm: 0, level: 9 })
    const res = advanceNpcCultivation(npc, 200, () => 0.01)
    expect(res.breakthroughs).toBeGreaterThan(0)
    expect(npc.realm).toBe(1)
    expect(npc.breakthroughs).toBeGreaterThan(0)
    expect(res.reforged).toBe(true)
  })

  it('已陨落 NPC 不再修行', () => {
    const npc = withProgression({ alive: false })
    const res = advanceNpcCultivation(npc, 500, () => 0.5)
    expect(res.levels).toBe(0)
    expect(res.breakthroughs).toBe(0)
  })

  it('成长幂等：重复回填不改变已有档案', () => {
    const npc = withProgression({ realm: 2, level: 25 })
    const gearBefore = JSON.stringify(npc.gear)
    const loadBefore = JSON.stringify(npc.loadout)
    ensureNpcProgression(npc)
    expect(JSON.stringify(npc.gear)).toBe(gearBefore)
    expect(JSON.stringify(npc.loadout)).toBe(loadBefore)
  })
})

describe('宗门 / 城镇 NPC 派生档案', () => {
  it('同一 NPC 多次派生结果稳定（不入库也不会漂移）', () => {
    const a = sectNpcProfile({ id: 'npc_champion', realm: 3, level: 4, daoPath: '剑道', role: 'champion' })
    const b = sectNpcProfile({ id: 'npc_champion', realm: 3, level: 4, daoPath: '剑道', role: 'champion' })
    expect(a.stats.power).toBe(b.stats.power)
    expect(a.gearSummary).toEqual(b.gearSummary)
    expect(a.skillSummary).toEqual(b.skillSummary)
  })

  it('不同角色拿到不同的法器与功法取向', () => {
    const champ = sectNpcProfile({ id: 'npc_champion', realm: 3, level: 4, daoPath: '剑道', role: 'champion' })
    const inn = sectNpcProfile({ id: 'npc_innkeeper', realm: 3, level: 4, daoPath: '剑道', role: 'innkeeper' })
    expect(champ.stats.power).toBeGreaterThan(inn.stats.power)
    expect(champ.gearSummary.join()).not.toBe(inn.gearSummary.join())
  })

  it('境界越高战力越高，且产出真实法器与功法', () => {
    const low = sectNpcProfile({ id: 'npc_elder', realm: 1, level: 2, role: 'elder' })
    const high = sectNpcProfile({ id: 'npc_elder', realm: 4, level: 2, role: 'elder' })
    expect(high.stats.power).toBeGreaterThan(low.stats.power)
    expect(high.gearSummary.length).toBeGreaterThan(0)
    expect(high.skillSummary[0]).toMatch(/Lv\d/)
  })
})

describe('旧档回填（v11 及更早）', () => {
  it('缺失 gear / loadout 的旧 NPC 会被补齐真实装备与功法', () => {
    const legacy = makeNpc({ realm: 2, level: 25 })
    // 模拟旧档：只有占位串与写死的技能 id
    Object.assign(legacy, {
      gear: undefined,
      loadout: undefined,
      skillLevels: undefined,
      equipment: { weapon: 'npc_w_2', armor: 'npc_a_2' },
      skills: ['sk_sanlian'],
    })
    ensureNpcProgression(legacy)
    expect(legacy.gear).toBeTruthy()
    expect(legacy.loadout).toBeTruthy()
    expect(npcEquippedSkillIds(legacy.loadout).length).toBeGreaterThan(0)
    expect(legacy.power).toBeGreaterThan(0)
    expect(legacy.maxHp).toBe(buildNpcStats(legacy).maxHp)
    // 旧展示字段同步为新档案
    expect(legacy.skills.some((s: string) => SKILLS.has(s))).toBe(true)
  })

  it('回填后气血不超过上限', () => {
    const legacy = makeNpc({ realm: 1, level: 15, hp: 999999 })
    ensureNpcProgression(legacy)
    expect(legacy.hp).toBeLessThanOrEqual(legacy.maxHp)
  })
})
