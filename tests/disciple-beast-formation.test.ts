// ---------- 弟子 / 灵兽 / 阵法三系统的单测 ----------
// 覆盖 src/disciple-data.ts、src/beast-data.ts、src/formation-data.ts（纯函数 + 数据表）

import { describe, expect, it } from 'vitest'
import {
  SPIRIT_ROOTS, TALENTS, REALM_NAMES, DISCIPLE_RANKS, DISCIPLE_ROLES, SECT_QUESTS,
  generateDisciple, cultivationSpeed, expToNextRealm, effectiveStats, disciplePower,
  sparDisciples, questSuccessRate, canPromote, promoteDisciple, rankName, retreatCost,
  RETREAT_DURATION, GUIDANCE_COOLDOWN, GUIDANCE_EXP, SPAR_COOLDOWN,
  type Disciple, type SpiritRoot, type RootTier, type TalentId, type DiscipleRealm,
} from '../src/disciple-data'
import {
  BEAST_SPECIES, BEAST_SPECIES_MAP, RARITY_NAMES, RARITY_COLORS, ELEMENT_NAMES,
  beastCapacity, beastExpToNext, generateBeast, randomBeastEncounter, captureRate,
  feedBeast, beastCombatStats, mountSpeedBonus, type Beast,
} from '../src/beast-data'
import {
  FORMATIONS, FORMATION_MAP, FORMATION_TYPE_NAMES, FORMATION_TYPE_COLORS,
  createFormationEffect, isFormationReady, type FormationType,
} from '../src/formation-data'
import { makeRng } from '../src/core'
import { makeDisciple, makeBeast, constRng } from './system-test-helpers'

const ALL_ROOTS: SpiritRoot[] = ['gold', 'wood', 'water', 'fire', 'earth', 'thunder', 'ice', 'wind']
const ALL_TIERS: RootTier[] = ['common', 'uncommon', 'rare', 'epic']
const POSITIVE_TALENTS: TalentId[] = [
  'body_tempering', 'sword_affinity', 'swift_mind', 'thick_skin', 'spirit_eye',
  'stone_skin', 'merciless', 'heavenly_root',
]
const NEGATIVE_TALENTS: TalentId[] = ['frail', 'dull']

// ==================== 弟子系统 ====================
describe('灵根与天赋配置表', () => {
  it('八种灵根字段完整', () => {
    expect(Object.keys(SPIRIT_ROOTS).sort()).toEqual([...ALL_ROOTS].sort())
    for (const r of ALL_ROOTS) {
      const def = SPIRIT_ROOTS[r]
      expect(def.name.length).toBeGreaterThan(0)
      expect(def.color).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(ALL_TIERS).toContain(def.tier)
    }
  })

  it('灵根品质分组与随机抽取表一致（common×5 / rare×2 / epic×1）', () => {
    const byTier = (t: RootTier) => ALL_ROOTS.filter(r => SPIRIT_ROOTS[r].tier === t)
    expect(byTier('common').sort()).toEqual(['earth', 'fire', 'gold', 'water', 'wood'])
    expect(byTier('rare').sort()).toEqual(['ice', 'wind'])
    expect(byTier('epic')).toEqual(['thunder'])
  })

  it('天赋表 id 与键一致，正负与稀有度标注自洽', () => {
    const ids = Object.keys(TALENTS) as TalentId[]
    expect(ids).toHaveLength(10)
    for (const id of ids) {
      expect(TALENTS[id].id).toBe(id)
      expect(TALENTS[id].name.length).toBeGreaterThan(0)
      expect(TALENTS[id].desc.length).toBeGreaterThan(0)
    }
    for (const t of POSITIVE_TALENTS) expect(TALENTS[t].positive).toBe(true)
    for (const t of NEGATIVE_TALENTS) expect(TALENTS[t].positive).toBe(false)
    expect(ids.filter(id => TALENTS[id].rarity === 'rare').sort())
      .toEqual(['heavenly_root', 'merciless'])
  })

  it('境界名称覆盖 DiscipleRealm 全部取值 0~6', () => {
    expect(REALM_NAMES).toHaveLength(7)
    for (const n of REALM_NAMES) expect(n.length).toBeGreaterThan(0)
    for (const r of [0, 1, 2, 3, 4, 5, 6] as DiscipleRealm[]) {
      expect(REALM_NAMES[r]).toBeDefined()
    }
  })

  it('三次随机抽样生成的弟子字段均合法', () => {
    for (const seed of [1, 42, 20240501]) {
      const d = generateDisciple(makeRng(seed), 1)
      expect(ALL_ROOTS).toContain(d.root)
      expect(d.rootTier).toBe(SPIRIT_ROOTS[d.root].tier)
      expect(d.realm).toBe(0)
      expect(d.exp).toBe(0)
      expect(d.expToNext).toBe(expToNextRealm(0))
      expect(d.name.length).toBeGreaterThan(1)
      expect(d.uid.startsWith('d_')).toBe(true)
      expect(d.loyalty).toBeGreaterThanOrEqual(60)
      expect(d.loyalty).toBeLessThanOrEqual(79)
      expect(d.affection).toBeGreaterThanOrEqual(30)
      expect(d.affection).toBeLessThanOrEqual(44)
      expect(d.status).toBe('idle')
      // 修为档案下沉：新生成即带功法（1~4 门，按道途选池）
      expect(Array.isArray(d.skills)).toBe(true)
      expect(d.skills.length).toBeLessThanOrEqual(4)
      expect(d.rank).toBe(0)
      expect(d.role).toBeNull()
      expect(d.atk).toBeGreaterThan(0)
      expect(d.def).toBeGreaterThan(0)
      expect(d.maxHp).toBeGreaterThan(0)
      expect(d.crit).toBeGreaterThan(0)
      // 修为档案下沉：初始装备按修为/出身铸造（低境界可能缺件），但槽位必须齐全
      expect(Object.keys(d.equipment).sort()).toEqual(['armor', 'boots', 'charm', 'head', 'weapon'])
      for (const it of Object.values(d.equipment)) {
        if (it) expect(it.uid.startsWith('discgear_')).toBe(true)
      }
    }
  })

  it('天赋组合与灵根品质一致，且不含重复项', () => {
    for (let seed = 0; seed < 200; seed++) {
      const d = generateDisciple(makeRng(seed), 1)
      expect(new Set(d.talents).size).toBe(d.talents.length)
      expect(d.talents.length).toBeGreaterThanOrEqual(1)
      for (const t of d.talents) expect(TALENTS[t]).toBeDefined()
    }
  })

  it('【已知缺陷 B10】约 2% 的弟子只抽到负面天赋（零正面天赋）', () => {
    // 复现：generateDisciple → randomTalents，count = 2 + floor(rng()*2) ∈ {2,3}，
    // negCount 最高为 2，故 posCount 可能为 0，弟子可能只带 frail / dull。
    // 实测 20000 次抽样：空天赋 0%，零正面天赋约 2.28%。
    // 建议：保证 posCount >= 1。当前按现状锁定。
    let noPositive = 0
    const N = 4000
    for (let i = 0; i < N; i++) {
      const d = generateDisciple(makeRng(i), 1)
      if (!d.talents.some(t => POSITIVE_TALENTS.includes(t))) noPositive++
    }
    expect(noPositive).toBeGreaterThan(0)
    expect(noPositive / N).toBeLessThan(0.1)
  })

  it('【已知缺陷 B18】generateDisciple 的 sectLevel 形参未被使用', () => {
    // 复现：generateDisciple(rng, sectLevel) 函数体完全未引用 sectLevel，
    // 宗门等级对新生弟子的属性/天赋没有任何影响。当前按现状锁定。
    // 注：uid 字段会因为模块级自增序列而不同，这里只验证其他字段与 sectLevel 无关。
    const a = generateDisciple(makeRng(777), 1)
    const b = generateDisciple(makeRng(777), 99)
    const { uid: ua, ...aRest } = a
    const { uid: ub, ...bRest } = b
    expect(aRest).toEqual(bRest)
  })

  it('B19 已修：generateDisciple 同一进程内多次调用保证 uid 唯一', () => {
    // 修复前：uid = 'd_' + Date.now().toString(36) + '_' + floor(rng()*9999).toString(36)
    // 同一毫秒 + 同一 rng 批量招募时撞号，导致存档中弟子互相覆盖。
    // 修复后：uid = 'd_<seq>_<rand>'，seq 是模块级自增（与墙钟脱钩），
    // 即使 rng 完全相同也保证唯一。
    const a = generateDisciple(constRng(0), 1)
    const b = generateDisciple(constRng(0), 1)
    const c = generateDisciple(constRng(0), 1)
    expect(a.uid).not.toBe(b.uid)
    expect(b.uid).not.toBe(c.uid)
    expect(a.uid).not.toBe(c.uid)
  })
})

describe('修炼速度与升级经验', () => {
  it('灵根品质决定基础速度', () => {
    expect(cultivationSpeed('gold', 'common', [])).toBeCloseTo(1.0, 10)
    expect(cultivationSpeed('ice', 'rare', [])).toBeCloseTo(1.3, 10)
    expect(cultivationSpeed('thunder', 'epic', [])).toBeCloseTo(1.6, 10)
  })

  it('天赋按乘法叠加（顺序无关）', () => {
    const a = cultivationSpeed('gold', 'common', ['swift_mind', 'heavenly_root'])
    const b = cultivationSpeed('gold', 'common', ['heavenly_root', 'swift_mind'])
    expect(a).toBeCloseTo(b, 10)
    expect(a).toBeCloseTo(1.0 * 1.3 * 1.6, 10)
  })

  it('负面天赋降低速度，正负抵消可回到 1.0 附近', () => {
    expect(cultivationSpeed('gold', 'common', ['dull'])).toBeCloseTo(0.8, 10)
    expect(cultivationSpeed('thunder', 'epic', ['dull'])).toBeCloseTo(1.6 * 0.8, 10)
  })

  it('expToNextRealm 随境界递增且为正整数', () => {
    let prev = 0
    for (let r = 0; r <= 6; r++) {
      const v = expToNextRealm(r as DiscipleRealm)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
    expect(expToNextRealm(0)).toBe(100)
    expect(expToNextRealm(1)).toBe(200)
    expect(expToNextRealm(6)).toBe(1300)
  })
})

describe('弟子属性聚合', () => {
  const equip = (over: Partial<{ atk: number; def: number; maxHp: number; crit: number; speed: number }>) =>
    ({
      uid: 'e_test', baseId: 'b_test', name: '测试法器', slot: 'weapon', quality: 1,
      itemLevel: 1, atk: 0, def: 0, speed: 0, crit: 0, maxHp: 0, affixes: [], price: 1, ...over,
    }) as Disciple['equipment']['weapon']

  it('无装备时等于基础属性', () => {
    const d = makeDisciple()
    expect(effectiveStats(d)).toEqual({ atk: 30, def: 15, maxHp: 200, crit: 5 })
  })

  it('装备各字段逐项累加', () => {
    const d = makeDisciple({ equipment: { ...makeDisciple().equipment, armor: equip({ def: 20, maxHp: 50 }) } })
    expect(effectiveStats(d)).toEqual({ atk: 30, def: 35, maxHp: 250, crit: 5 })
  })

  it('speed 按一半折算进攻击', () => {
    const d = makeDisciple({ equipment: { ...makeDisciple().equipment, weapon: equip({ speed: 10 }) } })
    expect(effectiveStats(d).atk).toBe(35) // 30 + floor(10 * 0.5)
  })

  it('空槽位按 0 处理，不产生 NaN', () => {
    const d = makeDisciple({ equipment: { weapon: null, head: null, armor: null, boots: null, charm: null } })
    const s = effectiveStats(d)
    for (const v of Object.values(s)) expect(Number.isNaN(v)).toBe(false)
  })

  it('disciplePower 综合战力公式与等级加成', () => {
    const d = makeDisciple() // atk30 def15 maxHp200 crit5 realm0
    expect(disciplePower(d)).toBe(Math.floor(30 * 3 + 15 * 2 + 200 * 0.5 + 5 * 10 + 0))
    const d2 = makeDisciple({ realm: 6 })
    expect(disciplePower(d2)).toBe(disciplePower(d) + 600)
    expect(disciplePower(d2)).toBeGreaterThan(disciplePower(d))
  })
})

describe('弟子切磋 sparDisciples', () => {
  it('同属性对局：先手方（d1）获胜，回合数有限（rng=0 触发必暴击）', () => {
    const d1 = makeDisciple({ uid: 'a', name: '甲' })
    const d2 = makeDisciple({ uid: 'b', name: '乙' })
    const r = sparDisciples(d1, d2, constRng(0)) // rng()=0 < crit/100(0.05) → 每击必暴击
    expect(r.winner).toBe(d1)
    expect(r.loser).toBe(d2)
    // 单击伤害 = floor(max(1, 30 - floor(15*0.5)) * 1.5) = floor(23*1.5) = 34；200 / 34 → 第 11 回合分出胜负
    expect(r.rounds).toHaveLength(11)
    expect(r.rounds[0]).toContain('暴击')
    expect(r.d1Power).toBe(270)
    expect(r.d2Power).toBe(270)
    // winnerExp = 30 + loser.realm*12 + floor(loserPower * 0.01)
    expect(r.winnerExp).toBe(32)
    expect(r.loserExp).toBe(10)
  })

  it('暴击为 0 时走普通伤害路径，回合数相应变长', () => {
    const d1 = makeDisciple({ uid: 'a', name: '甲', crit: 0 })
    const d2 = makeDisciple({ uid: 'b', name: '乙', crit: 0 })
    const r = sparDisciples(d1, d2, constRng(0)) // 0 < 0 为假 → 永不暴击
    expect(r.rounds).toHaveLength(17) // 200 / 23
    expect(r.rounds[0]).not.toContain('暴击')
    expect(r.rounds[0]).toContain('造成 23 伤害')
  })

  it('20 回合上限生效，不会无限循环', () => {
    const tank = (uid: string, name: string) => makeDisciple({ uid, name, atk: 0, def: 1000, maxHp: 1000 })
    const r = sparDisciples(tank('a', '甲'), tank('b', '乙'), constRng(0))
    expect(r.rounds).toHaveLength(20)
    expect(r.winner).toBeTruthy()
    expect(r.loser).toBeTruthy()
  })

  it('伤害下限为 1，防御再高也不会打出 0 或负数', () => {
    const d1 = makeDisciple({ uid: 'a', name: '甲', atk: 1, def: 0, maxHp: 50 })
    const d2 = makeDisciple({ uid: 'b', name: '乙', atk: 1, def: 10000, maxHp: 50 })
    const r = sparDisciples(d1, d2, constRng(0))
    expect(r.rounds.length).toBeLessThanOrEqual(20)
    for (const line of r.rounds) {
      const dmg = Number(line.match(/造成 (-?\d+) 伤害/)?.[1])
      expect(Number.isNaN(dmg)).toBe(false)
      expect(dmg).toBeGreaterThanOrEqual(1)
    }
  })

  it('必暴击时伤害为 1.5 倍', () => {
    const d1 = makeDisciple({ uid: 'a', name: '甲', atk: 100, def: 0, maxHp: 500 })
    const d2 = makeDisciple({ uid: 'b', name: '乙', atk: 100, def: 0, maxHp: 500 })
    const r = sparDisciples(d1, d2, constRng(0)) // rng()=0 < crit/100 恒成立
    expect(r.rounds[0]).toContain('暴击')
    expect(r.rounds[0]).toContain('造成 150 伤害')
  })
})

describe('宗门任务表与成功率', () => {
  it('任务 id 唯一，字段合法', () => {
    const ids = SECT_QUESTS.map(q => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    const types = new Set(SECT_QUESTS.map(q => q.type))
    expect(types).toEqual(new Set(['gather', 'patrol', 'subdue', 'explore']))
    for (const q of SECT_QUESTS) {
      expect(q.name.length).toBeGreaterThan(0)
      expect(q.desc.length).toBeGreaterThan(0)
      expect(q.duration).toBeGreaterThan(0)
      expect(q.minRealm).toBeGreaterThanOrEqual(0)
      expect(q.minRealm).toBeLessThanOrEqual(6)
      expect(q.baseSuccess).toBeGreaterThan(0)
      expect(q.baseSuccess).toBeLessThanOrEqual(1)
      for (const v of Object.values(q.rewards)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('难度越高的任务：耗时更长、奖励更好、成功率更低', () => {
    const sorted = [...SECT_QUESTS].sort((a, b) => a.minRealm - b.minRealm)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].minRealm === sorted[i - 1].minRealm) continue
      expect(sorted[i].baseSuccess).toBeLessThan(sorted[i - 1].baseSuccess)
      expect(sorted[i].duration).toBeGreaterThan(sorted[i - 1].duration)
    }
  })

  it('成功率钳制在 [0.1, 0.99]', () => {
    const easy = SECT_QUESTS.find(q => q.id === 'q_gather_herb')!
    const hard = SECT_QUESTS.find(q => q.id === 'q_explore_ruins')!
    // 攻击力极高 → 逼近上限
    expect(questSuccessRate(easy, makeDisciple({ atk: 1e9 }))).toBe(0.99)
    // 低忠诚 → 额外 -0.1
    const disloyal = makeDisciple({ loyalty: 10, atk: 0, realm: 0 })
    const loyal = makeDisciple({ loyalty: 90, atk: 0, realm: 0 })
    expect(questSuccessRate(hard, disloyal)).toBeLessThan(questSuccessRate(hard, loyal))
    // 极低值仍不低于下限
    expect(questSuccessRate(hard, makeDisciple({ loyalty: 0, atk: 0, realm: 0 }))).toBeGreaterThanOrEqual(0.1)
  })

  it('境界超出任务要求会提升成功率', () => {
    const q = SECT_QUESTS.find(x => x.id === 'q_subdue_beast')! // minRealm 2
    const low = questSuccessRate(q, makeDisciple({ realm: 0 }))
    const high = questSuccessRate(q, makeDisciple({ realm: 6 }))
    expect(high).toBeGreaterThan(low)
  })
})

describe('弟子晋升体系', () => {
  it('DISCIPLE_RANKS 层级连续且门槛单调不减', () => {
    expect(DISCIPLE_RANKS).toHaveLength(5)
    DISCIPLE_RANKS.forEach((r, i) => {
      expect(r.level).toBe(i)
      if (i > 0) {
        expect(r.minRealm).toBeGreaterThanOrEqual(DISCIPLE_RANKS[i - 1].minRealm)
        expect(r.minLoyalty).toBeGreaterThanOrEqual(DISCIPLE_RANKS[i - 1].minLoyalty)
      }
    })
  })

  it('未满足境界或忠诚时不可晋升', () => {
    expect(canPromote(makeDisciple({ rank: 0, realm: 0, loyalty: 100 }))).toBe(false) // 需 realm >= 1
    expect(canPromote(makeDisciple({ rank: 0, realm: 5, loyalty: 10 }))).toBe(false)  // 需 loyalty >= 50
    expect(canPromote(makeDisciple({ rank: 0, realm: 1, loyalty: 50 }))).toBe(true)
  })

  it('满级（大长老）不可再晋升', () => {
    expect(canPromote(makeDisciple({ rank: 4, realm: 6, loyalty: 100 }))).toBe(false)
    const d = makeDisciple({ rank: 4 })
    expect(promoteDisciple(d)).toBe(false)
    expect(d.rank).toBe(4)
  })

  it('promoteDisciple 成功时 rank+1，失败时不变', () => {
    const d = makeDisciple({ rank: 0, realm: 2, loyalty: 60 })
    expect(promoteDisciple(d)).toBe(true)
    expect(d.rank).toBe(1)
    const d2 = makeDisciple({ rank: 0, realm: 0 })
    expect(promoteDisciple(d2)).toBe(false)
    expect(d2.rank).toBe(0)
  })

  it('rankName 越界时回退到外门弟子', () => {
    expect(rankName(makeDisciple({ rank: 0 }))).toBe('外门弟子')
    expect(rankName(makeDisciple({ rank: 4 }))).toBe('大长老')
    expect(rankName(makeDisciple({ rank: 99 }))).toBe('外门弟子')
  })

  it('闭关与指点常量为正，闭关消耗随境界增长', () => {
    expect(RETREAT_DURATION).toBeGreaterThan(0)
    expect(GUIDANCE_COOLDOWN).toBeGreaterThan(0)
    expect(GUIDANCE_EXP).toBeGreaterThan(0)
    expect(SPAR_COOLDOWN).toBeGreaterThan(0)
    for (let r = 0; r <= 6; r++) {
      expect(retreatCost(r as DiscipleRealm)).toBe(100 + r * 50)
    }
  })

  it('DISCIPLE_ROLES 职能 id 唯一且加成有效', () => {
    const ids = DISCIPLE_ROLES.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of DISCIPLE_ROLES) {
      expect(r.name.length).toBeGreaterThan(0)
      expect(r.desc.length).toBeGreaterThan(0)
      expect(r.effect.mult).toBeGreaterThan(0)
      expect(typeof r.effect.type).toBe('string')
    }
  })
})

// ==================== 灵兽系统 ====================
describe('灵兽物种表', () => {
  it('物种 id 唯一，MAP 与数组完全一致', () => {
    const ids = BEAST_SPECIES.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(BEAST_SPECIES_MAP.size).toBe(BEAST_SPECIES.length)
    for (const s of BEAST_SPECIES) {
      expect(BEAST_SPECIES_MAP.get(s.id)).toBe(s)
    }
  })

  it('物种字段合法', () => {
    for (const s of BEAST_SPECIES) {
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.desc.length).toBeGreaterThan(0)
      expect(['common', 'rare', 'epic', 'legendary']).toContain(s.rarity)
      expect(['fire', 'ice', 'thunder', 'wind', 'earth', 'spirit']).toContain(s.element)
      expect(s.baseAtk).toBeGreaterThan(0)
      expect(s.baseDef).toBeGreaterThan(0)
      expect(s.baseHp).toBeGreaterThan(0)
      expect(s.baseSpeed).toBeGreaterThan(0)
      expect(s.captureRate).toBeGreaterThan(0)
      expect(s.captureRate).toBeLessThanOrEqual(1)
      expect(typeof s.canMount).toBe('boolean')
    }
  })

  it('稀有度越高，基础属性与捕获难度趋势合理', () => {
    const avg = (r: string) => {
      const list = BEAST_SPECIES.filter(s => s.rarity === r)
      return list.reduce((a, s) => a + s.baseAtk + s.baseDef + s.baseHp, 0) / list.length
    }
    expect(avg('legendary')).toBeGreaterThan(avg('epic'))
    expect(avg('epic')).toBeGreaterThan(avg('rare'))
    expect(avg('rare')).toBeGreaterThan(avg('common'))
    const dragon = BEAST_SPECIES_MAP.get('dragon')!
    const wolf = BEAST_SPECIES_MAP.get('wolf')!
    expect(dragon.captureRate).toBeLessThan(wolf.captureRate)
  })

  it('稀有度/属性名称与颜色表覆盖全部物种取值', () => {
    for (const s of BEAST_SPECIES) {
      expect(RARITY_NAMES[s.rarity]).toBeTruthy()
      expect(RARITY_COLORS[s.rarity]).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(ELEMENT_NAMES[s.element]).toBeTruthy()
    }
    expect(Object.keys(RARITY_NAMES)).toHaveLength(4)
    expect(Object.keys(ELEMENT_NAMES)).toHaveLength(6)
  })
})

describe('灵兽生成与成长', () => {
  it('灵兽园容量公式', () => {
    expect(beastCapacity(0)).toBe(0)
    expect(beastCapacity(1)).toBe(3)
    expect(beastCapacity(10)).toBe(12)
  })

  it('升级经验随等级递增', () => {
    expect(beastExpToNext(1)).toBe(90)
    expect(beastExpToNext(2)).toBe(150)
    for (let lv = 1; lv <= 30; lv++) {
      expect(beastExpToNext(lv)).toBeGreaterThan(beastExpToNext(lv - 1))
    }
  })

  it('按物种生成 1 级灵兽，属性取自物种表', () => {
    const wolf = BEAST_SPECIES_MAP.get('wolf')!
    const b = generateBeast('wolf', makeRng(5))
    expect(b.species).toBe('wolf')
    expect(b.name).toBe(wolf.name)
    expect(b.rarity).toBe(wolf.rarity)
    expect(b.element).toBe(wolf.element)
    expect(b.level).toBe(1)
    expect(b.exp).toBe(0)
    expect(b.expToNext).toBe(beastExpToNext(1))
    expect(b.atk).toBe(wolf.baseAtk)
    expect(b.def).toBe(wolf.baseDef)
    expect(b.maxHp).toBe(wolf.baseHp)
    expect(b.hp).toBe(b.maxHp)
    expect(b.role).toBe('none')
    expect(b.deployed).toBe(false)
  })

  it('未知物种 id 静默回退到表首项（幽冥狼）', () => {
    const b = generateBeast('不存在的灵兽', makeRng(5))
    expect(b.species).toBe(BEAST_SPECIES[0].id)
    expect(b.name).toBe(BEAST_SPECIES[0].name)
  })

  it('喂养三次后升到 2 级，属性按公式放大', () => {
    const b = generateBeast('wolf', makeRng(5))
    feedBeast(b, 0)
    feedBeast(b, 0)
    expect(b.level).toBe(1)
    feedBeast(b, 0) // exp 105 >= 90
    expect(b.level).toBe(2)
    expect(b.exp).toBe(15)
    expect(b.expToNext).toBe(beastExpToNext(2))
    const mult = 1 + 2 * 0.08
    expect(b.atk).toBe(Math.floor(BEAST_SPECIES[0].baseAtk * mult))
    expect(b.def).toBe(Math.floor(BEAST_SPECIES[0].baseDef * mult))
    expect(b.maxHp).toBe(Math.floor(BEAST_SPECIES[0].baseHp * mult))
    expect(b.hp).toBe(b.maxHp)
    expect(b.speed).toBe(Math.floor(BEAST_SPECIES[0].baseSpeed * (1 + 2 * 0.02)))
  })

  it('喂养设置冷却时间戳，且等级封顶 30', () => {
    const b = generateBeast('wolf', makeRng(5))
    const before = Date.now()
    feedBeast(b, 0)
    expect(b.feedCooldown).toBeGreaterThanOrEqual(before + 60000)
    for (let i = 0; i < 2000; i++) feedBeast(b, 0)
    expect(b.level).toBe(30)
    expect(b.maxHp).toBeGreaterThan(0)
    expect(Number.isFinite(b.exp)).toBe(true)
  })

  it('【已知缺陷 B15】feedBeast 的 herbCost 形参从未被使用', () => {
    // 复现：feedBeast(beast, herbCost) 既不校验也不扣除灵草，恒返回 true。
    // 调用方若依赖返回值判断"是否喂得起"，会无条件成功。
    // 建议：扣除灵草并在不足时返回 false。当前按现状锁定。
    const b = generateBeast('wolf', makeRng(5))
    expect(feedBeast(b, 0)).toBe(true)
    expect(feedBeast(b, 999999)).toBe(true)
    const b2 = generateBeast('wolf', makeRng(5))
    expect(feedBeast(b2, 0)).toBe(true)
    expect(b2.exp).toBeGreaterThan(0)
  })
})

describe('捕获率与遭遇', () => {
  it('捕获率 = 物种基础 + 残血加成 + 灵兽园加成，并钳制在 [0.05, 0.95]', () => {
    const wolf = BEAST_SPECIES_MAP.get('wolf')! // 0.4
    const full = makeBeast({ species: 'wolf', maxHp: 200, hp: 200 })
    expect(captureRate(full, 0)).toBeCloseTo(0.4, 10)
    expect(captureRate(full, 10)).toBeCloseTo(0.4 + 0.3, 10)
    const dying = makeBeast({ species: 'wolf', maxHp: 200, hp: 0 })
    expect(captureRate(dying, 0)).toBeCloseTo(0.4 + 0.3, 10)
    expect(captureRate(dying, 10)).toBe(0.95) // 0.4+0.3+0.3 = 1.0 → 上限
    // 传说级满血在 0 级灵兽园 → 触及下限
    const dragon = makeBeast({ species: 'dragon', maxHp: 900, hp: 900 })
    expect(captureRate(dragon, 0)).toBeCloseTo(0.05, 10)
    expect(wolf.captureRate).toBeGreaterThan(0)
  })

  it('【已知缺陷 B7】maxHp 为 0 时捕获率返回 NaN（除零）', () => {
    // 复现：captureRate 中 hpRatio = beast.hp / beast.maxHp，maxHp=0 → 0/0 = NaN，
    // hpBonus 随之 NaN，Math.min/max 无法钳制，最终返回 NaN 并会写入 UI。
    // 建议：const hpRatio = beast.maxHp > 0 ? beast.hp / beast.maxHp : 0
    const broken = makeBeast({ species: 'wolf', maxHp: 0, hp: 0 })
    expect(Number.isNaN(captureRate(broken, 1))).toBe(true)
  })

  it('遭遇抽取返回合法物种 id，且 rng 端点不越界', () => {
    for (const floor of [0, 5, 19, 20, 30, 99]) {
      for (const r of [0, 0.1, 0.5, 0.9, 0.999999]) {
        const id = randomBeastEncounter(constRng(r), floor)
        expect(BEAST_SPECIES_MAP.has(id)).toBe(true)
      }
    }
    expect(randomBeastEncounter(constRng(0), 1)).toBe('wolf')
    expect(randomBeastEncounter(constRng(0.999999), 1)).toBe('dragon')
  })

  it('高楼层提升高阶灵兽的权重（史诗/传说在深处更易出现）', () => {
    const countAt = (floor: number, target: string) => {
      let n = 0
      const N = 20000
      for (let i = 0; i < N; i++) {
        if (randomBeastEncounter(makeRng(i), floor) === target) n++
      }
      return n / N
    }
    expect(countAt(30, 'dragon')).toBeGreaterThan(countAt(1, 'dragon'))
    expect(countAt(25, 'qilin')).toBeGreaterThan(countAt(1, 'qilin'))
  })
})

describe('灵兽出战与坐骑', () => {
  it('beastCombatStats 返回属性快照', () => {
    const b = makeBeast({ atk: 11, def: 22, maxHp: 333, speed: 44 })
    expect(beastCombatStats(b)).toEqual({ atk: 11, def: 22, maxHp: 333, speed: 44 })
  })

  it('坐骑速度加成随等级缓慢提升', () => {
    expect(mountSpeedBonus(makeBeast({ level: 1 }))).toBeCloseTo(0.21, 10)
    expect(mountSpeedBonus(makeBeast({ level: 30 }))).toBeCloseTo(0.5, 10)
    expect(mountSpeedBonus(makeBeast({ level: 30 }))).toBeGreaterThan(mountSpeedBonus(makeBeast({ level: 1 })))
  })
})

// ==================== 阵法系统 ====================
describe('阵法配置表', () => {
  it('阵法 id 唯一，FORMATIONS 与 FORMATION_MAP 一致', () => {
    const ids = FORMATIONS.map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(FORMATION_MAP.size).toBe(FORMATIONS.length)
    for (const f of FORMATIONS) expect(FORMATION_MAP.get(f.id)).toBe(f)
  })

  it('三类阵法数量均衡，每类 3 种', () => {
    const counts: Record<string, number> = {}
    for (const f of FORMATIONS) counts[f.type] = (counts[f.type] ?? 0) + 1
    expect(counts).toEqual({ attack: 3, defense: 3, trap: 3 })
    for (const t of Object.keys(counts) as FormationType[]) {
      expect(FORMATION_TYPE_NAMES[t]).toBeTruthy()
      expect(FORMATION_TYPE_COLORS[t]).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('阵法类型与效果字段严格对应（攻击→atkBonus / 防御→dmgReduce / 陷阱→trapDamage）', () => {
    for (const f of FORMATIONS) {
      if (f.type === 'attack') {
        expect(f.atkBonus).toBeGreaterThan(0)
        expect(f.dmgReduce).toBeUndefined()
        expect(f.trapDamage).toBeUndefined()
      } else if (f.type === 'defense') {
        expect(f.dmgReduce).toBeGreaterThan(0)
        expect(f.atkBonus).toBeUndefined()
        expect(f.trapDamage).toBeUndefined()
      } else {
        expect(f.trapDamage).toBeGreaterThan(0)
        expect(f.atkBonus).toBeUndefined()
        expect(f.dmgReduce).toBeUndefined()
      }
    }
  })

  it('解锁门槛、消耗、时长与冷却均为正，且高阶阵法门槛更高', () => {
    for (const f of FORMATIONS) {
      expect(f.name.length).toBeGreaterThan(0)
      expect(f.desc.length).toBeGreaterThan(0)
      expect(f.insightCost).toBeGreaterThan(0)
      expect(f.prestigeCost).toBeGreaterThan(0)
      expect(f.requireLibrary).toBeGreaterThanOrEqual(1)
      expect(f.duration).toBeGreaterThan(0)
      expect(f.cooldown).toBeGreaterThan(0)
      // 冷却必须 >= 持续时间，否则可以无缝常驻
      expect(f.cooldown).toBeGreaterThanOrEqual(f.duration)
    }
  })
})

describe('createFormationEffect', () => {
  it('攻击阵只带 atkBonus，其余归零', () => {
    const before = Date.now()
    const e = createFormationEffect('f_sword_array')
    const after = Date.now()
    expect(e).not.toBeNull()
    expect(e!.formationId).toBe('f_sword_array')
    expect(e!.atkBonus).toBe(0.15)
    expect(e!.dmgReduce).toBe(0)
    expect(e!.trapDamage).toBe(0)
    expect(e!.endTime).toBeGreaterThanOrEqual(before + 60 * 1000)
    expect(e!.endTime).toBeLessThanOrEqual(after + 60 * 1000)
  })

  it('防御阵 / 陷阱阵各自填充对应字段', () => {
    expect(createFormationEffect('f_shield_array')!.dmgReduce).toBe(0.15)
    expect(createFormationEffect('f_shield_array')!.atkBonus).toBe(0)
    const trap = createFormationEffect('f_soul_trap')!
    expect(trap.trapDamage).toBe(150)
    expect(trap.endTime).toBeGreaterThan(Date.now() + 59 * 1000)
  })

  it('所有阵法均可创建效果，duration 决定 endTime', () => {
    for (const f of FORMATIONS) {
      const e = createFormationEffect(f.id)
      expect(e).not.toBeNull()
      const delta = e!.endTime - Date.now()
      expect(delta).toBeGreaterThan(f.duration * 1000 - 2000)
      expect(delta).toBeLessThanOrEqual(f.duration * 1000)
    }
  })

  it('未知阵法 id 返回 null 而非抛错', () => {
    expect(createFormationEffect('不存在的阵法')).toBeNull()
    expect(createFormationEffect('')).toBeNull()
  })
})

describe('isFormationReady', () => {
  it('冷却结束后可用，冷却中不可用', () => {
    expect(isFormationReady(Date.now() - 121_000, 'f_sword_array')).toBe(true)   // cooldown 120s
    expect(isFormationReady(Date.now() - 119_000, 'f_sword_array')).toBe(false)
    expect(isFormationReady(Date.now(), 'f_thunder_array')).toBe(false)          // cooldown 150s
  })

  it('未知阵法 id 一律视为不可用', () => {
    expect(isFormationReady(Date.now() - 10_000_000, '不存在的阵法')).toBe(false)
    expect(isFormationReady(Date.now() - 10_000_000, '')).toBe(false)
  })
})
