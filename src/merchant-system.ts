// ---------- 商会交易系统 ----------

import { makeRng, type EquipItem } from './core'
import { QUALITY_NAMES, QUALITY_WEIGHT, ITEM_BASES, ITEM_BASE_MAP } from './data'

export interface MerchantItem {
  item: EquipItem
  price: number
  sold: boolean
}

export interface MerchantData {
  /** 商人ID */
  id: string
  name: string
  /** 商品列表 */
  goods: MerchantItem[]
  /** 收购物价倍率 */
  buyRate: number
  /** 下次刷新时间（ms 时间戳） */
  refreshTime: number
}

/** 生成商人库存 */
export function generateMerchantInventory(rng: () => number, merchantLevel: number, playerLevel: number): MerchantItem[] {
  const count = 6 + Math.floor(rng() * 3) // 6-8件
  const goods: MerchantItem[] = []

  for (let i = 0; i < count; i++) {
    const quality = rollQuality(rng)
    const baseIdx = Math.floor(rng() * ITEM_BASES.length)
    const base = ITEM_BASES[baseIdx]
    if (!base) continue

    const itemLevel = Math.max(1, playerLevel + Math.floor(rng() * 6 - 2))
    const priceMult = 1.2 + quality * 0.5 + merchantLevel * 0.1
    const basePrice = 50 + itemLevel * 15 + quality * 40

    const item: EquipItem = {
      uid: 'mi_' + Date.now().toString(36) + '_' + i + '_' + Math.floor(rng() * 9999).toString(36),
      baseId: base.id,
      name: base.name,
      slot: base.slot,
      quality,
      itemLevel,
      atk: base.atk ? Math.floor(base.atk * (1 + quality * 0.3) * (1 + itemLevel * 0.03)) : 0,
      def: base.def ? Math.floor(base.def * (1 + quality * 0.3) * (1 + itemLevel * 0.03)) : 0,
      speed: base.speed ?? 0,
      crit: base.crit ?? 0,
      maxHp: base.maxHp ? Math.floor(base.maxHp * (1 + quality * 0.3) * (1 + itemLevel * 0.03)) : 0,
      affixes: [],
      price: Math.floor(basePrice * priceMult),
    }

    goods.push({ item, price: item.price, sold: false })
  }

  return goods
}

function rollQuality(rng: () => number): 0 | 1 | 2 | 3 {
  const r = rng() * 100
  let acc = 0
  for (let i = 0; i < QUALITY_WEIGHT.length; i++) {
    acc += QUALITY_WEIGHT[i]
    if (r < acc) return i as 0 | 1 | 2 | 3
  }
  return 0
}

/** 创建或刷新商人数据 */
export function createMerchant(id: string, name: string, rng: () => number, merchantLevel: number, playerLevel: number): MerchantData {
  return {
    id,
    name,
    goods: generateMerchantInventory(rng, merchantLevel, playerLevel),
    buyRate: 0.4 + merchantLevel * 0.05,
    refreshTime: Date.now() + 3600000, // 1小时刷新
  }
}

/** 检查是否需要刷新商人库存 */
export function shouldRefreshMerchant(merchant: MerchantData): boolean {
  return Date.now() >= merchant.refreshTime
}

/** 获取商人收购价 */
export function getSellPrice(item: EquipItem, buyRate: number): number {
  return Math.floor(item.price * buyRate)
}

/** 宗门间通商资源交换 */
export interface TradeOffer {
  giveResource: keyof import('./sect-data').SectResources
  giveAmount: number
  receiveResource: keyof import('./sect-data').SectResources
  receiveAmount: number
}

/**
 * 从 [0, n) 取一个数组索引，并对退化 rng 做钳制。
 * 覆盖三类越界：rng() 返回 1.0（得 n）、返回 NaN（得 NaN）、返回负数（得负值）。
 */
function pickIndex(rng: () => number, n: number): number {
  if (n <= 0) return 0
  const i = Math.floor(rng() * n)
  if (!Number.isFinite(i)) return 0
  return Math.min(Math.max(i, 0), n - 1)
}

/** 生成宗门通商方案 */
export function generateTradeOffer(rng: () => number, sectLevel: number): TradeOffer {
  const resourceTypes: (keyof import('./sect-data').SectResources)[] = ['stone', 'herb', 'ore', 'wood']
  const giveIdx = pickIndex(rng, resourceTypes.length)
  // 收取方从「除给出资源外的 N-1 个候选」中确定性落位，而不是撞号后重试。
  // 旧实现为 `while (recvIdx === giveIdx) recvIdx = Math.floor(rng() * 4)`，
  // 是无上限的拒绝采样：常量 rng 下 giveIdx 与 recvIdx 恒等，同步死循环直接冻结主线程（缺陷 B28）。
  // 新实现无循环、无分支依赖、恒定消耗 2 次 rng，且在剩余候选上保持均匀分布。
  const offset = pickIndex(rng, resourceTypes.length - 1)
  const recvIdx = offset < giveIdx ? offset : offset + 1

  const baseAmount = 50 + sectLevel * 20
  const give = resourceTypes[giveIdx]
  const recv = resourceTypes[recvIdx]

  return {
    giveResource: give,
    giveAmount: Math.floor(baseAmount * (0.8 + rng() * 0.4)),
    receiveResource: recv,
    receiveAmount: Math.floor(baseAmount * (0.8 + rng() * 0.4)),
  }
}
