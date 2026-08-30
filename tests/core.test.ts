// ---------- 核心玩法层单测：随机工具 / 伤害公式 / 掉落 / 装备生成 ----------
// 覆盖 src/core.ts（纯函数，不依赖 Phaser，可直接在 Node 下测试）

import { describe, expect, it } from 'vitest'
import {
  makeRng, randInt, pickWeighted, calcDamage, expNeed,
  enhanceCost, enhMult, makeItem, rollEquip, rollDrop,
} from '../src/core'
import { QUALITY_AFFIX_COUNT } from '../src/data'

// ---------- 随机工具 ----------
describe('随机工具', () => {
  it('makeRng 同种子序列完全可复现', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    for (let i = 0; i < 10; i++) expect(a()).toBe(b())
  })

  it('makeRng 不同种子序列不同', () => {
    const a = makeRng(1)
    const b = makeRng(2)
    expect(a()).not.toBe(b())
  })

  it('randInt 始终落在闭区间内', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 500; i++) {
      const v = randInt(rng, 3, 9)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(9)
    }
  })

  it('pickWeighted 按权重边界正确分区', () => {
    const entries: Array<[string, number]> = [['a', 3], ['b', 1]]
    // total=4：r<3 归 a，3<=r<4 归 b
    expect(pickWeighted(() => 0.0, entries)).toBe('a')
    expect(pickWeighted(() => 0.74, entries)).toBe('a')  // r=2.96
    expect(pickWeighted(() => 0.75, entries)).toBe('a')  // r=3.00 边界含 a
    expect(pickWeighted(() => 0.76, entries)).toBe('b')  // r=3.04
    expect(pickWeighted(() => 0.999, entries)).toBe('b')
  })
})

// ---------- 伤害公式 ----------
// calcDamage 内部按序调用 rng 两次：①判会心 ②算浮动(0.9+rng()*0.2)
describe('伤害公式 calcDamage', () => {
  it('普通伤害 = 攻击×倍率×浮动 - 防御', () => {
    const seq = [0.5, 0.5] // 不暴击，浮动 1.0
    const rng = () => seq.shift() ?? 0.5
    const { dmg, crit } = calcDamage(100, 1.0, 0, 10, rng)
    expect(crit).toBe(false)
    expect(dmg).toBe(90)
  })

  it('会心伤害 ×1.6', () => {
    const seq = [0.1, 0.5] // 0.1<1.0 → 暴击
    const rng = () => seq.shift() ?? 0.5
    const { dmg, crit } = calcDamage(100, 1.0, 1.0, 10, rng)
    expect(crit).toBe(true)
    expect(dmg).toBe(150) // 100×1.6×1.0 - 10
  })

  it('伤害保底 1 点（防御远高于攻击时）', () => {
    const rng = () => 0.5
    expect(calcDamage(1, 1.0, 0, 1000, rng).dmg).toBe(1)
  })

  it('浮动下界 0.9', () => {
    const seq = [0.5, 0.0]
    const rng = () => seq.shift() ?? 0.5
    expect(calcDamage(10, 1.0, 0, 0, rng).dmg).toBe(9)
  })

  it('浮动上界接近 1.1', () => {
    const seq = [0.5, 0.9999]
    const rng = () => seq.shift() ?? 0.5
    expect(calcDamage(10, 1.0, 0, 0, rng).dmg).toBe(11)
  })

  it('功法倍率生效', () => {
    const seq = [0.5, 0.5]
    const rng = () => seq.shift() ?? 0.5
    expect(calcDamage(50, 1.4, 0, 5, rng).dmg).toBe(65) // 50×1.4 - 5
  })
})

// ---------- 经验 ----------
describe('经验公式 expNeed', () => {
  it('基础值精确', () => {
    expect(expNeed(1)).toBe(40)
    expect(expNeed(2)).toBe(Math.round(40 * Math.pow(2, 1.45)))
  })
  it('随等级递增', () => {
    expect(expNeed(3)).toBeGreaterThan(expNeed(2))
    expect(expNeed(10)).toBeGreaterThan(expNeed(5))
  })
})

// ---------- 强化 ----------
describe('装备强化', () => {
  it('enhMult 每级 +10%', () => {
    expect(enhMult({} as never)).toBe(1)
    expect(enhMult({ enh: 5 } as never)).toBe(1.5)
  })

  it('enhanceCost 随强化等级、品质与装备等级上升', () => {
    expect(enhanceCost({ enh: 0, quality: 0, itemLevel: 1 } as never)).toBe(28)   // (25+3)*1+0
    expect(enhanceCost({ enh: 2, quality: 1, itemLevel: 1 } as never)).toBe(99)   // (25+3)*3+15
    expect(enhanceCost({ enh: 5, quality: 3, itemLevel: 1 } as never)).toBe(213)  // (25+3)*6+45
    expect(enhanceCost({ enh: 0, quality: 0, itemLevel: 50 } as never)).toBe(175) // (25+150)*1+0
  })
})

// ---------- 装备生成 ----------
describe('装备生成 rollEquip', () => {
  it('批量生成的装备结构完整且字段合法', () => {
    const rng = makeRng(20260821)
    for (let i = 0; i < 200; i++) {
      const it = rollEquip(rng, 3, 0)
      expect(it.uid).toBeTruthy()
      expect(it.baseId).toBeTruthy()
      expect(it.name).toBeTruthy()
      expect([0, 1, 2, 3]).toContain(it.quality)
      expect(['weapon', 'head', 'armor', 'boots', 'charm']).toContain(it.slot)
      expect(it.maxHp).toBeGreaterThanOrEqual(0)
      expect(it.itemLevel).toBeGreaterThanOrEqual(1)
      expect(it.price).toBeGreaterThan(0)
      // 词缀数 ≥ 该品质保底条数（可能额外有机缘词缀）
      expect(it.affixes.length).toBeGreaterThanOrEqual(QUALITY_AFFIX_COUNT[it.quality])
      for (const af of it.affixes) {
        expect(af.id).toBeTruthy()
        expect(af.stat).toBeTruthy()
        expect(typeof af.value).toBe('number')
      }
    }
  })

  it('不同楼层生成结果不崩且可复现', () => {
    const a1 = makeRng(9)
    const a2 = makeRng(9)
    const it1 = rollEquip(a1, 1, 0)
    const it2 = rollEquip(a2, 1, 0)
    expect(it1.baseId).toBe(it2.baseId)
    expect(it1.quality).toBe(it2.quality)
    expect(it1.affixes).toEqual(it2.affixes)
    const b = makeRng(9)
    expect(rollEquip(b, 8, 0).uid).toBeTruthy()
  })

  it('装备等级随玩家等级提升', () => {
    const rngLow = makeRng(100)
    const rngHigh = makeRng(100)
    const low = rollEquip(rngLow, 1, 0, 5)
    const high = rollEquip(rngHigh, 1, 0, 80)
    expect(high.itemLevel).toBeGreaterThan(low.itemLevel)
    expect(high.atk).toBeGreaterThan(low.atk)
  })

  it('高装备等级解锁额外词条', () => {
    const rng = makeRng(42)
    const lowItem = rollEquip(rng, 1, 0, 1)
    const baseCount = QUALITY_AFFIX_COUNT[lowItem.quality]
    expect(lowItem.affixes.length).toBeGreaterThanOrEqual(baseCount)

    const rng2 = makeRng(42)
    const highItem = rollEquip(rng2, 50, 0, 80)
    expect(highItem.itemLevel).toBeGreaterThanOrEqual(60)
    expect(highItem.affixes.length).toBeGreaterThanOrEqual(baseCount + 3)
  })
})

describe('GM 工具 makeItem', () => {
  it('按基座打造指定品质装备', () => {
    const it = makeItem('w_iron', 3, 1)
    expect(it).not.toBeNull()
    expect(it!.baseId).toBe('w_iron')
    expect(it!.quality).toBe(3)
    expect(it!.atk).toBeGreaterThan(0)
  })
  it('未知基座返回 null', () => {
    expect(makeItem('not_exist', 1, 1)).toBeNull()
  })
})

// ---------- 掉落 ----------
describe('掉落 rollDrop', () => {
  it('Boss 必掉装备且灵石翻倍', () => {
    const rng = () => 0.01 // 极小随机：命中各分支
    const roll = rollDrop(rng, [10, 20], 3, true, 0, 1)
    expect(roll.equip).not.toBeNull()
    expect(roll.gold).toBeGreaterThanOrEqual(20)
    expect(roll.gold).toBeLessThanOrEqual(40)
  })

  it('普通怪小随机时药水与装备均不掉', () => {
    const rng = () => 0.999
    const roll = rollDrop(rng, [10, 20], 3, false, 0, 1)
    expect(roll.equip).toBeNull()
    expect(roll.potion).toBe(false)
  })

  it('金币倍率作用于灵石范围', () => {
    const rng = makeRng(5)
    const roll = rollDrop(rng, [10, 20], 3, false, 0, 2)
    expect(roll.gold).toBeGreaterThanOrEqual(20)
    expect(roll.gold).toBeLessThanOrEqual(40)
  })

  it('运气加成提升装备掉率', () => {
    // luck=0 时装备掉率 13%，luck=100 时 33%；用固定 rng 验证高 luck 能出装备
    const rngHigh = () => 0.2
    expect(rollDrop(rngHigh, [1, 2], 1, false, 100, 1).equip).not.toBeNull()
    const rngLow = () => 0.2
    expect(rollDrop(rngLow, [1, 2], 1, false, 0, 1).equip).toBeNull()
  })
})
