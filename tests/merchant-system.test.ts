// ---------- 商会交易系统单测 ----------
// 覆盖 src/merchant-system.ts（纯函数 + 数据表，不依赖 Phaser）

import { describe, expect, it } from 'vitest'
import {
  generateMerchantInventory, createMerchant, shouldRefreshMerchant, getSellPrice,
  generateTradeOffer, type MerchantData,
} from '../src/merchant-system'
import { ITEM_BASES, QUALITY_WEIGHT } from '../src/data'
import { makeRng } from '../src/core'
import { constRng, seqRng } from './system-test-helpers'

const VALID_SLOTS = ['weapon', 'head', 'armor', 'boots', 'charm']
const TRADE_RESOURCES = ['stone', 'herb', 'ore', 'wood']

// ==================== 库存生成 ====================
describe('generateMerchantInventory', () => {
  it('每次生成 6~8 件商品', () => {
    for (const seed of [0, 1, 42, 20240501, 99999]) {
      const goods = generateMerchantInventory(makeRng(seed), 1, 10)
      expect(goods.length).toBeGreaterThanOrEqual(6)
      expect(goods.length).toBeLessThanOrEqual(8)
    }
  })

  it('商品字段完整、价格与品质合法', () => {
    for (const goods of [generateMerchantInventory(makeRng(3), 5, 30)]) {
      for (const g of goods) {
        expect(g.item.uid.startsWith('mi_')).toBe(true)
        expect(g.item.name.length).toBeGreaterThan(0)
        expect(VALID_SLOTS).toContain(g.item.slot)
        expect(g.item.quality).toBeGreaterThanOrEqual(0)
        expect(g.item.quality).toBeLessThanOrEqual(3)
        expect(g.item.itemLevel).toBeGreaterThanOrEqual(1)
        expect(g.item.price).toBeGreaterThan(0)
        expect(Number.isInteger(g.item.price)).toBe(true)
        expect(g.price).toBe(g.item.price)   // 售价与物品自带价格一致
        expect(g.sold).toBe(false)
        expect(Array.isArray(g.item.affixes)).toBe(true)
        for (const v of [g.item.atk, g.item.def, g.item.maxHp, g.item.crit, g.item.speed]) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(Number.isFinite(v)).toBe(true)
        }
      }
    }
  })

  it('同一次生成的 uid 互不重复', () => {
    for (const seed of [1, 2, 3]) {
      const goods = generateMerchantInventory(makeRng(seed), 2, 20)
      const uids = goods.map(g => g.item.uid)
      expect(new Set(uids).size).toBe(uids.length)
    }
  })

  it('恒 rng=0 时结果完全确定，且命中表首项与品质 0', () => {
    const goods = generateMerchantInventory(constRng(0), 1, 10)
    expect(goods).toHaveLength(6)              // 6 + floor(0*3)
    const base = ITEM_BASES[0]                 // floor(0*63) = 0
    const itemLevel = Math.max(1, 10 + Math.floor(0 * 6 - 2)) // 8
    const expectedPrice = Math.floor((50 + itemLevel * 15 + 0) * (1.2 + 0 * 0.5 + 1 * 0.1))
    for (const g of goods) {
      expect(g.item.baseId).toBe(base.id)
      expect(g.item.quality).toBe(0)
      expect(g.item.itemLevel).toBe(itemLevel)
      expect(g.item.price).toBe(expectedPrice)
      expect(g.item.price).toBe(221)
    }
    // 攻击力按 (1 + quality*0.3) * (1 + itemLevel*0.03) 放大
    expect(goods[0].item.atk).toBe(Math.floor(base.atk! * 1 * (1 + itemLevel * 0.03)))
  })

  it('品质越高售价越高：质量权重表被正确使用', () => {
    // QUALITY_WEIGHT = [58, 27, 12, 3]，恒 rng 取不同值可命中不同品质档
    const qualityOf = (r: number) => generateMerchantInventory(constRng(r), 0, 10)[0].item.quality
    expect(qualityOf(0.1)).toBe(0)   // r = 10  < 58
    expect(qualityOf(0.7)).toBe(1)   // r = 70  < 85
    expect(qualityOf(0.9)).toBe(2)   // r = 90  < 97
    expect(qualityOf(0.99)).toBe(3)  // r = 99  < 100
    expect(QUALITY_WEIGHT.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('商人等级与玩家等级提升售价', () => {
    const low = generateMerchantInventory(constRng(0.99), 1, 10)[0].item.price
    const highLv = generateMerchantInventory(constRng(0.99), 9, 10)[0].item.price
    const highPlayer = generateMerchantInventory(constRng(0.99), 1, 90)[0].item.price
    expect(highLv).toBeGreaterThan(low)
    expect(highPlayer).toBeGreaterThan(low)
  })

  it('多次抽样不产生 NaN / 负数', () => {
    for (let i = 0; i < 300; i++) {
      for (const g of generateMerchantInventory(makeRng(i), i % 10, (i % 60) + 1)) {
        expect(Number.isFinite(g.item.price)).toBe(true)
        expect(g.item.price).toBeGreaterThan(0)
        expect(Number.isNaN(g.item.atk)).toBe(false)
      }
    }
  })

  it('【已知缺陷 B29】rng 返回 1.0 时索引越界，库存被静默清空', () => {
    // 复现：count = 6 + floor(rng()*3) → 9（超出注释所称的 6~8）；
    // baseIdx = floor(rng() * ITEM_BASES.length) = 63 → ITEM_BASES[63] 为 undefined，
    // `if (!base) continue` 把每一次迭代都跳过，最终返回空数组（商人无货可卖）。
    // makeRng 上限为 4294967295/4294967296 < 1，线上暂不会触发。
    // 建议：对 baseIdx 做 clamp，并在 base 缺失时回退到 ITEM_BASES[0] 而非跳过。
    const goods = generateMerchantInventory(constRng(1), 1, 10)
    expect(goods).toEqual([])
  })
})

// ==================== 商人实例 ====================
describe('createMerchant', () => {
  it('按入参构造商人，收购价与刷新时间符合公式', () => {
    const before = Date.now()
    const m = createMerchant('m_test', '钱万三', makeRng(8), 4, 20)
    const after = Date.now()
    expect(m.id).toBe('m_test')
    expect(m.name).toBe('钱万三')
    expect(m.buyRate).toBeCloseTo(0.4 + 4 * 0.05, 10) // 0.6
    expect(m.goods.length).toBeGreaterThanOrEqual(6)
    expect(m.refreshTime).toBeGreaterThanOrEqual(before + 3_600_000)
    expect(m.refreshTime).toBeLessThanOrEqual(after + 3_600_000)
  })

  it('商人等级越高收购价越高', () => {
    const m1 = createMerchant('a', 'A', makeRng(1), 1, 10)
    const m5 = createMerchant('b', 'B', makeRng(1), 5, 10)
    expect(m5.buyRate).toBeGreaterThan(m1.buyRate)
    expect(m1.buyRate).toBeCloseTo(0.45, 10)
    expect(m5.buyRate).toBeCloseTo(0.65, 10)
  })

  it('每次创建返回独立对象（不共享库存引用）', () => {
    const a = createMerchant('a', 'A', constRng(0), 1, 10)
    const b = createMerchant('b', 'B', constRng(0), 1, 10)
    a.goods[0].sold = true
    a.goods.pop()
    expect(b.goods[0].sold).toBe(false)
    expect(b.goods).toHaveLength(6)
  })
})

describe('shouldRefreshMerchant', () => {
  const base = (): MerchantData => createMerchant('m', 'M', constRng(0), 1, 10)

  it('未到刷新时间返回 false，已过刷新时间返回 true', () => {
    const fresh = base()
    expect(fresh.refreshTime).toBeGreaterThan(Date.now())
    expect(shouldRefreshMerchant(fresh)).toBe(false)

    const stale = base()
    stale.refreshTime = Date.now() - 1
    expect(shouldRefreshMerchant(stale)).toBe(true)
  })

  it('边界：refreshTime 等于当前时刻即视为到期', () => {
    const m = base()
    m.refreshTime = Date.now()
    expect(shouldRefreshMerchant(m)).toBe(true)
  })
})

// ==================== 收购价 ====================
describe('getSellPrice', () => {
  const item = (price: number) => ({
    uid: 'x', baseId: 'b', name: 'n', slot: 'weapon' as const, quality: 0 as const,
    itemLevel: 1, atk: 0, def: 0, speed: 0, crit: 0, maxHp: 0, affixes: [], price,
  })

  it('按收购倍率向下取整', () => {
    expect(getSellPrice(item(1000), 0.4)).toBe(400)
    expect(getSellPrice(item(999), 0.4)).toBe(399)   // floor(399.6)
    expect(getSellPrice(item(1000), 1)).toBe(1000)
    expect(getSellPrice(item(1000), 0)).toBe(0)
    expect(getSellPrice(item(0), 0.6)).toBe(0)
  })

  it('收购价恒不高于物品原价（buyRate <= 1 时）', () => {
    for (const rate of [0, 0.25, 0.4, 0.65, 1]) {
      for (const price of [1, 77, 5000, 99999]) {
        expect(getSellPrice(item(price), rate)).toBeLessThanOrEqual(price)
      }
    }
  })

  it('【已知缺陷 B30】getSellPrice 不做任何入参校验，负数原样透传', () => {
    // 复现：getSellPrice 直接 Math.floor(item.price * buyRate)，
    // 既不校验 price 非负，也不校验 buyRate 落在 [0,1]。
    // 一旦上游传入负值（如数据异常或未来的折扣系统），会得到负的"收购价"，
    // 玩家卖出反而扣钱。建议：Math.max(0, ...) 并校验 buyRate 区间。
    expect(getSellPrice(item(-1000), 0.4)).toBe(-400)
    expect(getSellPrice(item(1000), -0.4)).toBe(-400)
  })
})

// ==================== 宗门通商 ====================
describe('generateTradeOffer', () => {
  it('给出与收取的资源类型必然不同，且都在四资源内', () => {
    for (let i = 0; i < 500; i++) {
      const o = generateTradeOffer(makeRng(i), (i % 10) + 1)
      expect(TRADE_RESOURCES).toContain(o.giveResource)
      expect(TRADE_RESOURCES).toContain(o.receiveResource)
      expect(o.giveResource).not.toBe(o.receiveResource)
    }
  })

  it('数量随宗门等级提升，且落在 baseAmount 的 0.8~1.2 倍区间', () => {
    for (const sectLevel of [1, 5, 10]) {
      const baseAmount = 50 + sectLevel * 20
      for (let i = 0; i < 200; i++) {
        const o = generateTradeOffer(makeRng(i), sectLevel)
        for (const amount of [o.giveAmount, o.receiveAmount]) {
          expect(Number.isInteger(amount)).toBe(true)
          expect(amount).toBeGreaterThanOrEqual(Math.floor(baseAmount * 0.8))
          expect(amount).toBeLessThanOrEqual(Math.floor(baseAmount * 1.2))
          expect(amount).toBeGreaterThan(0)
        }
      }
    }
    const lv1 = generateTradeOffer(makeRng(7), 1).giveAmount
    const lv10 = generateTradeOffer(makeRng(7), 10).giveAmount
    expect(lv10).toBeGreaterThan(lv1)
  })

  it('注入同一 rng 时结果可复现', () => {
    const a = generateTradeOffer(makeRng(2024), 3)
    const b = generateTradeOffer(makeRng(2024), 3)
    expect(a).toEqual(b)
  })

  it('12 种（给出 × 收取）有序组合均可达', () => {
    const pairs = new Set<string>()
    for (let i = 0; i < 3000; i++) {
      const o = generateTradeOffer(makeRng(i), 3)
      pairs.add(`${o.giveResource}->${o.receiveResource}`)
    }
    expect(pairs.size).toBe(12)
  })

  it('恒定消耗 2 次 rng 选出资源对，不再有重试循环（B28 回归）', () => {
    // 旧实现：第 2 次取值若与给出方撞号就反复重试 —— 两次取值相同即死循环。
    // 新实现：第 1 次 rng 定给出资源，第 2 次 rng 在「剩余 3 个候选」中定收取资源，恒定 2 次取值。
    // 这里故意注入两个相同的取值（旧实现会在此处永不退出），验证新实现仍能得到互不相同的资源对。
    // 第 3、4 次 rng 依旧用于两侧数量，故数量断言与原用例保持一致。
    const o = generateTradeOffer(seqRng([0.1, 0.1, 0.25, 0.75]), 1)
    expect(o.giveResource).toBe('stone')   // 第1次 0.1 → floor(0.1*4) = 0
    expect(o.receiveResource).toBe('herb') // 第2次 0.1 → 候选偏移 0 → 跳过索引 0，落到索引 1
    expect(o.giveResource).not.toBe(o.receiveResource)
    expect(o.giveAmount).toBe(Math.floor(70 * 0.9))    // 第3次 0.25
    expect(o.receiveAmount).toBe(Math.floor(70 * 1.1)) // 第4次 0.75
  })

  it('退化 rng 下不会死循环：直接调用 generateTradeOffer 仍返回合法方案（B28 回归）', () => {
    // 缺陷 B28：旧实现 `while (recvIdx === giveIdx) recvIdx = Math.floor(rng() * 4)` 无迭代上限，
    // 常量 rng 下 giveIdx 与 recvIdx 恒等 → 同步死循环冻结主线程，不抛错也无法恢复。
    // 本用例直接调用真实函数（旧用例是代理断言，拦不住复发），覆盖常量 0 / 常量 1 /
    // 越界 4 / 负数等退化取值。
    // 注意：这是同步死循环，一旦复发会直接挂死本套件（vitest 的超时中断不了同步循环），
    // 因此它同时是一个「会响」的回归哨兵。
    for (const v of [0, 1, 0.5, 4, -1]) {
      const o = generateTradeOffer(constRng(v), 3)
      expect(TRADE_RESOURCES).toContain(o.giveResource)
      expect(TRADE_RESOURCES).toContain(o.receiveResource)
      expect(o.giveResource).not.toBe(o.receiveResource)
      expect(Number.isInteger(o.giveAmount)).toBe(true)
      expect(Number.isInteger(o.receiveAmount)).toBe(true)
    }
    // 常量 rng(() => 0) 的具体落位：给出 stone(索引0)，收取 herb(索引1)
    const zero = generateTradeOffer(constRng(0), 3)
    expect(zero.giveResource).toBe('stone')
    expect(zero.receiveResource).toBe('herb')
  }, 5000)
})
