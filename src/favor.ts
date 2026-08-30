// ---------- NPC 好感度 / 送礼 / 任务 ----------

import type { GameState } from './state'

export type NpcFavorId = 'elder' | 'merchant' | 'sister'

// ---------- 好感等级 ----------
export interface FavorTier { v: number; name: string }
export const FAVOR_TIERS: FavorTier[] = [
  { v: 0, name: '陌生' },
  { v: 30, name: '相识' },
  { v: 80, name: '友好' },
  { v: 160, name: '信赖' },
  { v: 280, name: '至交' },
]

export function favorOf(s: GameState, npc: string): number {
  return s.favor[npc] ?? 0
}

export function tierOf(favor: number): FavorTier {
  let t = FAVOR_TIERS[0]
  for (const tier of FAVOR_TIERS) if (favor >= tier.v) t = tier
  return t
}

/** 增加好感；返回新达到的等级名（未升档为 null）。每升一档奖励悟道 +10（由调用方提示）。 */
export function addFavor(s: GameState, npc: string, amount: number): string | null {
  const before = tierOf(favorOf(s, npc))
  s.favor[npc] = favorOf(s, npc) + amount
  const after = tierOf(s.favor[npc])
  if (after.v > before.v) {
    s.insight += 10
    return after.name
  }
  return null
}

// ---------- 送礼 ----------
export interface GiftDef {
  id: string
  name: string
  base: number          // 基础好感
  /** 检查并扣减代价；不足返回 false */
  pay: (s: GameState) => boolean
}

export const GIFTS: GiftDef[] = [
  {
    id: 'potion', name: '回春丹 ×1', base: 5,
    pay: (s) => { if (s.potions < 1) return false; s.potions--; return true },
  },
  {
    id: 'tupo', name: '突破石 ×1', base: 15,
    pay: (s) => { if ((s.materials.tupo ?? 0) < 1) return false; s.materials.tupo--; return true },
  },
  {
    id: 'gold50', name: '灵石 ×50', base: 8,
    pay: (s) => { if (s.gold < 50) return false; s.gold -= 50; return true },
  },
]

/** NPC 喜好：投其所好好感翻倍 */
export const NPC_PREFS: Record<string, { like: string; likeHint: string }> = {
  elder: { like: 'tupo', likeHint: '老者似乎对突破石格外上心' },
  merchant: { like: 'gold50', likeHint: '商人见到灵石眼睛一亮' },
  sister: { like: 'potion', likeHint: '道友近日历练受了些暗伤，正需回春丹调理' },
}

export function giftFavor(npc: string, gift: GiftDef): { amount: number; liked: boolean } {
  const liked = NPC_PREFS[npc]?.like === gift.id
  return { amount: liked ? gift.base * 2 : gift.base, liked }
}

// ---------- 商店折扣 ----------
export function shopDiscount(merchantFavor: number): number {
  if (merchantFavor >= 160) return 0.8
  if (merchantFavor >= 80) return 0.9
  return 1
}

// ---------- 任务 ----------
export interface QuestDef {
  id: string
  npc: NpcFavorId
  name: string
  desc: string
  /** 当前进度描述（活跃中展示） */
  progress: (s: GameState) => string
  /** 是否可交付 */
  complete: (s: GameState) => boolean
  /** 发放奖励（好感单独处理） */
  reward: (s: GameState) => string
  rewardFavor: number
}

export const QUESTS: QuestDef[] = [
  {
    id: 'q_elder_slayer', npc: 'elder', name: '除魔卫道',
    desc: '山中魔兽日盛。累计击杀 40 只魔兽，再来见老夫。',
    progress: (s) => `已击杀 ${Math.min(s.totalKills, 40)} / 40`,
    complete: (s) => s.totalKills >= 40,
    reward: (s) => { s.insight += 15; return '悟道 +15' },
    rewardFavor: 30,
  },
  {
    id: 'q_merchant_fund', npc: 'merchant', name: '进货筹备',
    desc: '最近要去山外进一批稀罕货，缺些本钱。资助 150 灵石如何？稳赚不赔！',
    progress: () => '需缴纳 150 灵石',
    complete: (s) => s.gold >= 150,
    reward: (s) => { s.gold -= 150; s.potions += 3; return '回春丹 +3' },
    rewardFavor: 25,
  },
  {
    id: 'q_sister_growth', npc: 'sister', name: '结伴之约',
    desc: '道友有意与你结伴下山闯荡。待你到了 12 级，再来与他汇合。',
    progress: (s) => `当前等级 Lv.${s.level} / 12`,
    complete: (s) => s.level >= 12,
    reward: () => '道友的信赖',
    rewardFavor: 40,
  },
]

export function questOf(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id)
}

/** 道友入队所需好感 */
export const SISTER_JOIN_FAVOR = 80
