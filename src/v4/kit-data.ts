// ---------- v4 Kit 静态数据注册器（S7 旁路：v4 记录不进共享 SETS） ----------
// 读取 v4-kits.json → 构建独立 V4_KIT_SETS 注册器 + item bases 注入 ITEM_BASE_MAP
// 数值 mods 走 effects.ts aggregateMods 的 v4 旁路缝（S1），表现能力走 v4/runtime.ts（S4-S6）

import {
  ITEM_BASES, ITEM_BASE_MAP,
  V4_KIT_ABILITIES, V4_KIT_SET_ID_PREFIX, kitIdFromSetId,
  type ItemBase, type KitAbility, type KitId, type SetDef, type SetBonus,
} from '../data'

const V4_SET_PIECE_SLOTS: readonly ItemBase['slot'][] = ['weapon', 'head', 'armor', 'boots']

const SLOT_PREFIX: Record<ItemBase['slot'], string> = {
  weapon: 'w', head: 'h', armor: 'a', boots: 'b', charm: 'c',
}

const SLOT_SUFFIX: Record<ItemBase['slot'], string> = {
  weapon: '剑', head: '冠', armor: '袍', boots: '靴', charm: '佩',
}

function v4SetId(kitId: KitId): string {
  return `${V4_KIT_SET_ID_PREFIX}${kitId}`
}

function v4BaseId(kitId: KitId, slot: ItemBase['slot']): string {
  return `${SLOT_PREFIX[slot]}_v4_${kitId}`
}

function buildItemBase(kit: KitAbility, slot: ItemBase['slot']): ItemBase {
  const base: ItemBase = {
    id: v4BaseId(kit.kitId, slot),
    name: `${kit.theme}${SLOT_SUFFIX[slot]}`,
    slot,
    set: v4SetId(kit.kitId),
  }
  if (slot === 'weapon') { base.atk = 22; base.crit = 0.03 }
  if (slot === 'head') { base.def = 6; base.maxHp = 28 }
  if (slot === 'armor') { base.def = 12; base.maxHp = 26 }
  if (slot === 'boots') { base.speed = 14; base.def = 4 }
  return base
}

function buildSetDef(kit: KitAbility): SetDef {
  const setId = v4SetId(kit.kitId)
  const pieces = V4_SET_PIECE_SLOTS.map((slot) => v4BaseId(kit.kitId, slot))
  const m2: Partial<SetBonus['mods']> = { atkPct: 0.10, defPct: 0.10 }
  const m4: Partial<SetBonus['mods']> = { atkPct: 0.15, hpPct: 0.15, aspd: 0.05 }
  const bonuses: SetBonus[] = [
    { count: 2, mods: m2, desc: `2件：攻击+10%，防御+10%` },
    {
      count: 4,
      mods: m4,
      desc: `4件：攻击+15%，气血+15%，攻速+5%；招式化为【${kit.theme}·${kit.normalPrimitive}】，神通化为【${kit.theme}·${kit.artPrimitive}】`,
    },
  ]
  return { id: setId, name: kit.name, pieces, bonuses }
}

/** v4 Kit 独立 set 注册器（不进 SETS，S7 旁路） */
export const V4_KIT_SETS: ReadonlyMap<string, SetDef> = new Map(
  V4_KIT_ABILITIES.map((kit) => [v4SetId(kit.kitId), buildSetDef(kit)]),
)

/** v4 Kit item bases（注入 ITEM_BASE_MAP，使装备/掉落/normalizeItem 可用） */
export const V4_KIT_BASES: readonly ItemBase[] = V4_KIT_ABILITIES.flatMap((kit) =>
  V4_SET_PIECE_SLOTS.map((slot) => buildItemBase(kit, slot)),
)

/** setId → KitAbility 查找（经 kitIdFromSetId 白名单校验） */
export function v4KitForSetId(setId: string): KitAbility | null {
  const kid = kitIdFromSetId(setId)
  if (!kid) return null
  return V4_KIT_ABILITIES.find((k) => k.kitId === kid) ?? null
}

/** 模块加载时注入 item bases 到共享 ITEM_BASE_MAP/ITEM_BASES（仅注入，不改既有条目） */
let registered = false
export function registerV4KitBases(): void {
  if (registered) return
  registered = true
  for (const base of V4_KIT_BASES) {
    if (!ITEM_BASE_MAP.has(base.id)) {
      ITEM_BASES.push(base)
      ITEM_BASE_MAP.set(base.id, base)
    }
  }
}

/** 测试/重置用：清除注册标记（不回退已推入的数组，仅允许重复调用安全） */
export function _resetV4Registration(): void {
  registered = false
}

/** 生成 v4 kit 的 4 件装备模板（测试/赠送用） */
export function v4KitPieceIds(kitId: KitId): readonly string[] {
  return V4_SET_PIECE_SLOTS.map((slot) => v4BaseId(kitId, slot))
}

export { v4SetId, v4BaseId }
