// ---------- 队伍系统统一层（PartyMember[] 唯一真源） ----------
// 设计依据：docs/architecture/party-system-redesign.md
// 取代 v0.7 三份并存的伴随状态：companion(洞府道友) / activeCompanionNpcId(大世界组队) / activePetUid(灵兽)
//
// 约束：本模块必须与 state.ts 保持零运行时依赖（只用结构化宿主类型），
// 否则 state.ts ↔ party.ts 会形成循环 import。切勿在此 import 值。
// 仅允许 `import type`（编译期擦除，不产生运行时依赖）。

import type { EquipItem } from './core'

// 可用于 AI 队友外形的职业（与 BootScene.ts:14 ANIM_CLASSES 对齐）
const ANIM_CLASS_POOL = ['sword', 'fairy', 'mage', 'sword_new', 'fairy_new'] as const

// ---------- 队员装备 / 功法槽 ----------

/** 队员装备槽：固定四件（武器/头/甲/靴），不设饰品槽（对齐 v4 随机套四件制） */
export const MEMBER_SLOT_KEYS = ['weapon', 'head', 'armor', 'boots'] as const
export type MemberSlotKey = (typeof MEMBER_SLOT_KEYS)[number]

export const MEMBER_SLOT_NAMES: Record<MemberSlotKey, string> = {
  weapon: '武器',
  head: '头部',
  armor: '衣甲',
  boots: '靴履',
}

export type MemberEquipment = Record<MemberSlotKey, EquipItem | null>

/** 队员功法槽：招式一 / 心法二 / 神通一（与玩家同构，不含天赋） */
export interface MemberSkillSlots {
  style: string | null
  minds: [string | null, string | null]
  art: string | null
}

/** 功法槽位键：mind0/mind1 对应 minds[0]/minds[1]，便于 UI 扁平遍历 */
export type MemberSkillSlotKey = 'style' | 'mind0' | 'mind1' | 'art'

export const MEMBER_SKILL_SLOTS: Array<{ key: MemberSkillSlotKey; label: string; accept: 'style' | 'mind' | 'art' }> = [
  { key: 'style', label: '招式', accept: 'style' },
  { key: 'mind0', label: '心法一', accept: 'mind' },
  { key: 'mind1', label: '心法二', accept: 'mind' },
  { key: 'art', label: '神通', accept: 'art' },
]

// ---------- 类型 ----------

/** 队员来源：决定 UI 分组与写入口径 */
export type PartySource = 'sectSibling' | 'worldNpc' | 'beast'

/** 队员大类：决定能否装备 / 能否学功法 / 消费哪套数值 */
export type PartyMemberKind = 'cultivator' | 'beast'

/** 出战状态：active 出战 / reserve 待命 / downed 重伤本局退场 */
export type PartyMemberStatus = 'active' | 'reserve' | 'downed'

export interface PartyMember {
  /** 队内唯一 ID：`pm_<source>_<refId>` */
  uid: string
  kind: PartyMemberKind
  source: PartySource
  status: PartyMemberStatus

  // ---- 身份 ----
  displayName: string
  /** 修士：proceduralNpc.id（道友为 'sister'）；灵兽：beast.uid */
  refId: string
  /** 修士外形与近/远战判定；灵兽存 species */
  classId: string

  // ---- 独立装备页与功法槽（GDD §8.3；装备从玩家行囊共享池授予）----
  equipment: MemberEquipment
  skillSlots: MemberSkillSlots

  // ---- 数值（P1 仅等级成长，P2 扩装备/功法）----
  level: number
  /** 累积经验（用于指数曲线升级） */
  exp: number
  realm: number
  hp: number
  maxHp: number
  /** 综合战力评分（NPC 由其修为档案带入，用于 UI 排序与强度对比） */
  power: number
  /** 相对玩家 stats 的伤害倍率 */
  attackMult: number
  /** 承伤系数：0 = 灵体护体（保持 v0.7 陆青鸢手感）；1 = 正常承伤 */
  damageTakenRatio: number
  /** 移动速度倍率（灵兽用） */
  speedMult: number

  joinedAt: number
}

/**
 * 宿主状态的最小结构。刻意不使用 GameState：避免 state.ts 与 party.ts 循环依赖。
 *
 * ⚠️ v13 起旧三字段（companion / activeCompanionNpcId / activePetUid）已彻底移除，
 * party 是唯一真源。读取一律走本节提供的查询函数，禁止业务代码自行过滤 party。
 */
export interface PartyHostState {
  party: PartyMember[]
}

// ---------- 旧三字段的等价查询（取代直接读字段） ----------

/** 是否有洞府道友在队（取代 state.companion） */
export function hasSectSibling(party: PartyMember[]): boolean {
  return party.some(m => m.source === 'sectSibling')
}

/** 当前出战的大世界组队 NPC 的 refId（取代 state.activeCompanionNpcId） */
export function activeCompanionRef(party: PartyMember[]): string | null {
  const npc = sortParty(party).find(m => m.source === 'worldNpc' && m.status !== 'reserve')
  return npc ? npc.refId : null
}

/** 当前出战灵兽的 refId（取代 state.activePetUid） */
export function activeBeastRef(party: PartyMember[]): string | null {
  const beast = sortParty(party).find(m => m.kind === 'beast' && m.status !== 'reserve')
  return beast ? beast.refId : null
}

// ---------- 规则常量 ----------

export const PARTY_RULES = {
  /** 同时出战总数上限 */
  maxActive: 3,
  /** 其中修士上限（对齐 docs/01 §8.3「最多携带 2 名 NPC 伙伴」） */
  maxCultivator: 2,
  /** 灵兽上限 */
  maxBeast: 1,
  /** 重伤复活血量比 */
  downedReviveRatio: 0.3,
  /** DungeonScene 生成时相对玩家的落位偏移 */
  slotOffsets: [
    { dx: -20, dy: 10 },
    { dx: 20, dy: 10 },
    { dx: 0, dy: 26 },
  ],
} as const

export const MEMBER_GROWTH = {
  perLevelAttackMult: 0.02,
  perLevelMaxHp: 25,
  /** 上限 2.2：高阶 NPC 战力可显著超过同级玩家（见 npc-progression.npcPowerMult） */
  maxAttackMult: 2.2,
  /** 队员分享的玩家经验比例 */
  expRatio: 0.5,
  /** 等级上限 */
  maxLevel: 200,
}

/** 队员每级所需经验 — 随等级指数增长，参照玩家曲线的 50% */
export function memberExpNeed(level: number): number {
  return Math.round(20 * Math.pow(Math.max(1, level), 1.45))
}

/** 各来源的默认战力倍率 */
export const DEFAULT_ATTACK_MULT = {
  sectSibling: 0.8, // 沿用 v0.7 道友数值
  worldNpc: 0.9, // 兜底；实际按等级比算出 0.5~1.2
  beast: 0.6, // 沿用 v0.7 灵兽数值
} as const

// ---------- 基础工具 ----------

const MAX_SAFE_INT = 2 ** 31

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

function intOf(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function numOf(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function memberUid(source: PartySource, refId: string): string {
  return `pm_${source}_${refId}`
}

/** 把任意职业值归一到现有 5 套动画职业之一，杜绝 sword_new/mage 误落到 sword 的旧缺陷 */
export function normalizeClassId(c: unknown): string {
  return typeof c === 'string' && (ANIM_CLASS_POOL as readonly string[]).includes(c) ? c : 'sword'
}

/** 道友职业：严格沿用 v0.7 的「玩家取反」公式，保证老存档视觉不跳变 */
export function pickSiblingClass(playerClassId: unknown): string {
  return normalizeClassId(playerClassId) === 'sword' ? 'fairy' : 'sword'
}

/** 组队 NPC 职业：避开玩家与已有队员已占用的外形，按种子确定性旋转 */
export function pickNpcClass(playerClassId: unknown, party: PartyMember[], seed: number): string {
  const used = new Set<string>(party.map(m => m.classId))
  used.add(normalizeClassId(playerClassId))
  const offset = Math.abs(intOf(seed, 0)) % ANIM_CLASS_POOL.length
  const rotated = [
    ...ANIM_CLASS_POOL.slice(offset),
    ...ANIM_CLASS_POOL.slice(0, offset),
  ]
  return normalizeClassId(rotated.find(c => !used.has(c)) ?? 'sword')
}

export function cultivatorBaseMaxHp(level: number): number {
  return Math.round(120 + Math.max(0, intOf(level, 0)) * 25)
}

/** 组队 NPC 战力：按自身等级 / 玩家等级插值，钳制在 [0.5, 1.2] */
export function npcAttackMult(npcLevel: unknown, playerLevel: unknown): number {
  const nl = Math.max(1, numOf(npcLevel, 1))
  const pl = Math.max(1, numOf(playerLevel, 1))
  return clamp(0.5 + (nl / pl) * 0.45, 0.5, 1.2)
}

// ---------- 构造 ----------

interface CultivatorOpts {
  source: PartySource
  refId: string
  displayName: string
  classId: string
  level?: number
  realm?: number
  /** 覆盖默认气血上限（NPC 由修为档案给出） */
  maxHp?: number
  attackMult?: number
  damageTakenRatio?: number
  /** 战力评分（NPC 由修为档案给出） */
  power?: number
  joinedAt?: number
}

export function makeCultivatorMember(o: CultivatorOpts): PartyMember {
  const level = Math.max(1, intOf(o.level, 1))
  const maxHp = Math.max(1, intOf(o.maxHp, cultivatorBaseMaxHp(level)))
  return {
    uid: memberUid(o.source, o.refId),
    kind: 'cultivator',
    source: o.source,
    status: 'active',
    displayName: String(o.displayName || '无名道友'),
    refId: String(o.refId),
    classId: normalizeClassId(o.classId),
    equipment: emptyMemberEquipment(),
    skillSlots: emptyMemberSkillSlots(),
    level,
    exp: 0,
    realm: Math.max(0, intOf(o.realm, 0)),
    hp: maxHp,
    maxHp,
    power: Math.max(0, intOf(o.power, 0)),
    attackMult: clamp(numOf(o.attackMult, DEFAULT_ATTACK_MULT[o.source] ?? 0.8), 0.1, MEMBER_GROWTH.maxAttackMult),
    damageTakenRatio: clamp(numOf(o.damageTakenRatio, 1), 0, 1),
    speedMult: 1,
    joinedAt: intOf(o.joinedAt, 0),
  }
}

export function makeBeastMember(o: {
  uid: string
  name: string
  species: string
  level?: number
  maxHp?: number
  hp?: number
  attackMult?: number
  damageTakenRatio?: number
  speedMult?: number
  power?: number
  joinedAt?: number
}): PartyMember {
  const maxHp = Math.max(1, intOf(o.maxHp, 100))
  return {
    uid: memberUid('beast', o.uid),
    kind: 'beast',
    source: 'beast',
    status: 'active',
    displayName: String(o.name || '灵兽'),
    refId: String(o.uid),
    classId: String(o.species || 'wolf'),
    // 灵兽不设装备页与功法槽（走 beastCombatStats 自有数值）
    equipment: emptyMemberEquipment(),
    skillSlots: emptyMemberSkillSlots(),
    level: Math.max(1, intOf(o.level, 1)),
    exp: 0,
    realm: 0,
    hp: clamp(intOf(o.hp, maxHp), 0, maxHp),
    maxHp,
    power: Math.max(0, intOf(o.power, 0)),
    attackMult: clamp(numOf(o.attackMult, DEFAULT_ATTACK_MULT.beast), 0.1, MEMBER_GROWTH.maxAttackMult),
    damageTakenRatio: clamp(numOf(o.damageTakenRatio, 1), 0, 1),
    speedMult: clamp(numOf(o.speedMult, 1), 0.4, 2.5),
    joinedAt: intOf(o.joinedAt, 0),
  }
}

/** 洞府道友（陆青鸢）标准成员：保留 v0.7 的免伤手感 */
export function makeSisterMember(playerClassId: unknown, joinedAt?: number): PartyMember {
  return makeCultivatorMember({
    source: 'sectSibling',
    refId: 'sister',
    displayName: '陆青鸢',
    classId: pickSiblingClass(playerClassId),
    level: 1,
    attackMult: DEFAULT_ATTACK_MULT.sectSibling,
    damageTakenRatio: 0,
    joinedAt,
  })
}

// ---------- 队员装备 / 功法槽（纯逻辑） ----------

export function emptyMemberEquipment(): MemberEquipment {
  return { weapon: null, head: null, armor: null, boots: null }
}

export function emptyMemberSkillSlots(): MemberSkillSlots {
  return { style: null, minds: [null, null], art: null }
}

/** 单件装备计入队员属性的有效数值（强化按 +2/级 折算，与 ui.ts compareItems 口径一致） */
function itemBonus(it: EquipItem | null): { atk: number; def: number; speed: number; crit: number; maxHp: number } {
  if (!it || typeof it !== 'object') return { atk: 0, def: 0, speed: 0, crit: 0, maxHp: 0 }
  const enh = (it.enh ?? 0) * 2
  return {
    atk: numOf(it.atk, 0) + enh,
    def: numOf(it.def, 0) + enh,
    speed: numOf(it.speed, 0),
    crit: numOf(it.crit, 0),
    maxHp: numOf(it.maxHp, 0),
  }
}

export interface MemberEquipBonus {
  atk: number
  def: number
  speed: number
  crit: number
  maxHp: number
}

/** 队员四件装备的合计加成 */
export function memberEquipBonus(m: PartyMember): MemberEquipBonus {
  const out: MemberEquipBonus = { atk: 0, def: 0, speed: 0, crit: 0, maxHp: 0 }
  const eq = m.equipment
  if (!eq) return out
  for (const slot of MEMBER_SLOT_KEYS) {
    const b = itemBonus(eq[slot] ?? null)
    out.atk += b.atk
    out.def += b.def
    out.speed += b.speed
    out.crit += b.crit
    out.maxHp += b.maxHp
  }
  return out
}

/** 队员有效气血上限 = 基础 + 装备 */
export function effectiveMaxHp(m: PartyMember): number {
  return Math.max(1, Math.round(m.maxHp + memberEquipBonus(m).maxHp))
}

/** 队员有效移动速度倍率 = 基础 + 装备速（每 10 点 +10%） */
export function effectiveSpeedMult(m: PartyMember): number {
  return clamp(m.speedMult + memberEquipBonus(m).speed / 100, 0.3, 3)
}

/** 已装配功法 id 列表（去重后），供战斗表现与 UI 展示 */
export function memberEquippedSkillIds(m: PartyMember): string[] {
  const s = m.skillSlots
  if (!s) return []
  const ids = [s.style, s.minds?.[0] ?? null, s.minds?.[1] ?? null, s.art]
  return ids.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

export function getMemberSkillSlot(m: PartyMember, key: MemberSkillSlotKey): string | null {
  const s = m.skillSlots
  if (!s) return null
  if (key === 'style') return s.style
  if (key === 'art') return s.art
  if (key === 'mind0') return s.minds?.[0] ?? null
  return s.minds?.[1] ?? null
}

export function setMemberSkillSlot(m: PartyMember, key: MemberSkillSlotKey, id: string | null): void {
  const s = m.skillSlots ?? emptyMemberSkillSlots()
  if (key === 'style') s.style = id
  else if (key === 'art') s.art = id
  else if (key === 'mind0') s.minds[0] = id
  else s.minds[1] = id
  m.skillSlots = s
}

/** 装配装备到指定槽位；返回被替换下来的旧装备（可能为 null） */
export function equipMemberItem(m: PartyMember, slot: MemberSlotKey, item: EquipItem | null): EquipItem | null {
  const eq = m.equipment ?? emptyMemberEquipment()
  const old = eq[slot] ?? null
  eq[slot] = item
  m.equipment = eq
  return old
}

export function unequipMemberSlot(m: PartyMember, slot: MemberSlotKey): EquipItem | null {
  return equipMemberItem(m, slot, null)
}

/** 结构校验：只接受形似 EquipItem 的对象，残缺项丢弃（避免脏档污染 UI） */
function isEquipItemLike(v: unknown): v is EquipItem {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.name === 'string' && typeof r.slot === 'string' && typeof r.uid === 'string'
}

export function normalizeMemberEquipment(v: unknown): MemberEquipment {
  const out = emptyMemberEquipment()
  if (!v || typeof v !== 'object') return out
  const raw = v as Record<string, unknown>
  for (const slot of MEMBER_SLOT_KEYS) {
    const it = raw[slot]
    if (!isEquipItemLike(it)) continue
    // 槽位不符（如饰品塞进武器槽）直接丢弃，杜绝 UI 错位
    if (it.slot !== slot) continue
    out[slot] = it
  }
  return out
}

export function normalizeMemberSkillSlots(v: unknown): MemberSkillSlots {
  const out = emptyMemberSkillSlots()
  if (!v || typeof v !== 'object') return out
  const raw = v as Record<string, unknown>
  const idOf = (x: unknown): string | null => (typeof x === 'string' && x ? x : null)
  out.style = idOf(raw.style)
  out.art = idOf(raw.art)
  if (Array.isArray(raw.minds)) {
    out.minds = [idOf(raw.minds[0]), idOf(raw.minds[1])]
  }
  return out
}

// ---------- 规范化 / 去重 / 名额 ----------

/** 把未知输入收敛成合法 PartyMember[]；非法或残缺条目直接丢弃（杜绝幽灵队员） */
export function normalizeParty(v: unknown): PartyMember[] {
  if (!Array.isArray(v)) return []
  const out: PartyMember[] = []
  const seen = new Set<string>()
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const source = r.source
    if (source !== 'sectSibling' && source !== 'worldNpc' && source !== 'beast') continue
    const refId = typeof r.refId === 'string' && r.refId ? r.refId : null
    if (!refId) continue
    const uid = typeof r.uid === 'string' && r.uid ? r.uid : memberUid(source, refId)
    if (seen.has(uid)) continue
    seen.add(uid)

    const maxHp = Math.max(1, intOf(r.maxHp, cultivatorBaseMaxHp(intOf(r.level, 1))))
    const status = r.status === 'reserve' || r.status === 'downed' ? r.status : 'active'
    out.push({
      uid,
      kind: source === 'beast' ? 'beast' : 'cultivator',
      source,
      status,
      displayName: typeof r.displayName === 'string' && r.displayName ? r.displayName : '无名道友',
      refId,
      classId: source === 'beast' ? String(r.classId || 'wolf') : normalizeClassId(r.classId),
      equipment: normalizeMemberEquipment(r.equipment),
      skillSlots: normalizeMemberSkillSlots(r.skillSlots),
      level: Math.max(1, intOf(r.level, 1)),
      exp: intOf(r.exp, 0),
      realm: Math.max(0, intOf(r.realm, 0)),
      hp: clamp(intOf(r.hp, maxHp), 0, maxHp),
      maxHp,
      power: Math.max(0, intOf(r.power, 0)),
      attackMult: clamp(numOf(r.attackMult, 0.8), 0.1, MEMBER_GROWTH.maxAttackMult),
      damageTakenRatio: clamp(numOf(r.damageTakenRatio, source === 'sectSibling' ? 0 : 1), 0, 1),
      speedMult: clamp(numOf(r.speedMult, 1), 0.4, 2.5),
      joinedAt: intOf(r.joinedAt, 0),
    })
  }
  return enforceRules(out)
}

/** 稳定排序：修士在前，同类按加入时间；保证每帧遍历顺序一致 */
export function sortParty(party: PartyMember[]): PartyMember[] {
  return [...party].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'cultivator' ? -1 : 1
    return a.joinedAt - b.joinedAt
  })
}

/** 出战名额裁决：超额 active 自动降级为 reserve */
export function enforceRules(party: PartyMember[]): PartyMember[] {
  const sorted = sortParty(party)
  let activeCultivator = 0
  let activeBeast = 0
  return sorted.map(m => {
    let status = m.status
    if (status === 'downed') status = 'downed'
    else if (m.kind === 'cultivator') {
      if (activeCultivator < PARTY_RULES.maxCultivator) activeCultivator++
      else status = 'reserve'
    } else {
      if (activeBeast < PARTY_RULES.maxBeast) activeBeast++
      else status = 'reserve'
    }
    return status === m.status ? m : { ...m, status }
  })
}

export function countActive(party: PartyMember[], kind?: PartyMemberKind): number {
  return party.filter(m => m.status === 'active' && (!kind || m.kind === kind)).length
}

export function getActiveMembers(party: PartyMember[]): PartyMember[] {
  return sortParty(party).filter(m => m.status === 'active')
}

export function findMemberByRef(party: PartyMember[], refId: string): PartyMember | undefined {
  return party.find(m => m.refId === refId)
}

export function hasMemberRef(party: PartyMember[], refId: string): boolean {
  return party.some(m => m.refId === refId)
}

// ---------- 增删改 ----------

export function canAddCultivator(party: PartyMember[]): { ok: boolean; reason: string } {
  if (countActive(party, 'cultivator') >= PARTY_RULES.maxCultivator) {
    return { ok: false, reason: `出战修士已达上限（${PARTY_RULES.maxCultivator} 名）` }
  }
  return { ok: true, reason: '' }
}

/** 加入队员（返回新数组；已存在同 refId 则视为幂等，返回原数组） */
export function addMember(party: PartyMember[], member: PartyMember): PartyMember[] {
  if (party.some(m => m.uid === member.uid || m.refId === member.refId)) return party
  return enforceRules([...party, { ...member, status: 'active' }])
}

export function removeMemberByRef(party: PartyMember[], refId: string): PartyMember[] {
  return enforceRules(party.filter(m => m.refId !== refId))
}

export function setMemberStatus(
  party: PartyMember[],
  refId: string,
  status: PartyMemberStatus,
): PartyMember[] {
  const next = party.map(m => (m.refId === refId ? { ...m, status } : m))
  return enforceRules(next)
}

export function toggleMemberActive(party: PartyMember[], refId: string): PartyMember[] {
  const cur = findMemberByRef(party, refId)
  if (!cur) return party
  return setMemberStatus(party, refId, cur.status === 'active' ? 'reserve' : 'active')
}

// ---------- 战斗 ----------

/** 结算一次伤害；返回是否重伤倒地。damageTakenRatio=0 的成员（灵体护体）免疫 */
export function damageMember(m: PartyMember, amount: number): boolean {
  const raw = Math.max(0, numOf(amount, 0)) * m.damageTakenRatio
  // 已倒地者不可再受伤，避免范围伤害重复触发离队结算
  if (raw <= 0 || m.status === 'downed' || m.hp <= 0) return false
  const hp = Math.max(0, m.hp - raw)
  m.hp = hp
  if (hp <= 0) {
    m.status = 'downed'
    return true
  }
  return false
}

/** 本局结束统一救治：downed → reserve，并恢复到 30% 气血 */
export function reviveDowned(party: PartyMember[]): PartyMember[] {
  const ratio = PARTY_RULES.downedReviveRatio
  return party.map(m => {
    if (m.status !== 'downed') return m
    return { ...m, status: 'reserve' as PartyMemberStatus, hp: Math.max(1, Math.round(m.maxHp * ratio)) }
  })
}

/** 满血复活全部队员（回到洞府/大世界时调用） */
export function fullHealParty(party: PartyMember[]): PartyMember[] {
  return party.map(m => ({ ...m, hp: m.maxHp, status: m.status === 'downed' ? ('reserve' as PartyMemberStatus) : m.status }))
}

/** 队员分享经验，返回升级次数 */
export function grantMemberExp(m: PartyMember, playerExp: number): number {
  const gain = Math.max(0, numOf(playerExp, 0)) * MEMBER_GROWTH.expRatio
  if (gain <= 0) return 0
  if (m.level >= MEMBER_GROWTH.maxLevel) return 0

  m.exp = (m.exp || 0) + gain
  const before = m.level
  let gained = 0
  while (m.level < MEMBER_GROWTH.maxLevel && m.exp >= memberExpNeed(m.level)) {
    m.exp -= memberExpNeed(m.level)
    m.level++
    gained++
  }
  if (gained > 0) {
    m.maxHp = cultivatorBaseMaxHp(m.level)
    m.hp = m.maxHp
    m.attackMult = Math.min(MEMBER_GROWTH.maxAttackMult, m.attackMult + gained * MEMBER_GROWTH.perLevelAttackMult)
    if (m.power > 0) m.power = Math.round(m.power * Math.pow(1.03, gained))
  }
  return gained
}

// ---------- 旧三字段兼容层 ----------

/**
 * 由 v11 及更早的三份伴随状态合成 party。幂等。
 * 只在 migrate()（旧档升级）中调用一次，之后 party 独立演进。
 */
export function partyFromLegacy(raw: Record<string, unknown>): PartyMember[] {
  const out: PartyMember[] = []
  const now = Date.now()

  // 1) 洞府道友：保留 v0.7 免伤手感
  if (raw.companion === true) {
    out.push(makeSisterMember(raw.classId, now))
  }

  // 2) 大世界组队 NPC：幽灵引用（NPC 已陨落）不入队
  const npcId = raw.activeCompanionNpcId
  const npcs = Array.isArray(raw.proceduralNpcs) ? (raw.proceduralNpcs as Array<Record<string, unknown>>) : []
  if (typeof npcId === 'string' && npcId) {
    const npc = npcs.find(n => n && n.id === npcId)
    if (npc && npc.alive !== false) {
      out.push(
        makeCultivatorMember({
          source: 'worldNpc',
          refId: npcId,
          displayName: String(npc.name || '同行道友'),
          classId: pickNpcClass(raw.classId, out, intOf(npc.seed, 0)),
          level: intOf(npc.level, 1),
          realm: intOf(npc.realm, 0),
          attackMult: npcAttackMult(npc.level, raw.level),
          damageTakenRatio: 1,
          joinedAt: now + 1,
        }),
      )
    }
  }

  // 3) 灵兽：仅在确能查到实体时入队，避免幽灵
  const petUid = raw.activePetUid
  const beasts = Array.isArray(raw.beasts) ? (raw.beasts as Array<Record<string, unknown>>) : []
  if (typeof petUid === 'string' && petUid) {
    const b = beasts.find(x => x && x.uid === petUid)
    if (b) {
      out.push(
        makeBeastMember({
          uid: petUid,
          name: String(b.name || '灵兽'),
          species: String(b.species || 'wolf'),
          level: intOf(b.level, 1),
          maxHp: intOf(b.maxHp, 100),
          hp: intOf(b.hp, intOf(b.maxHp, 100)),
          speedMult: clamp(numOf(b.speed, 100) / 100, 0.4, 2.5),
          joinedAt: now + 2,
        }),
      )
    }
  }

  return enforceRules(out)
}

/**
 * 设置出战灵兽（传 null 收回）。出战名额恒为 1，新设会顶掉旧的。
 */
export function setActiveBeast(
  s: PartyHostState,
  beast: { uid: string; name: string; species: string; level?: number; maxHp?: number; hp?: number; speed?: number } | null,
): void {
  s.party = (s.party ?? []).filter(m => m.kind !== 'beast')
  if (beast) {
    s.party = addMember(s.party, makeBeastMember({
      uid: beast.uid,
      name: beast.name,
      species: beast.species,
      level: intOf(beast.level, 1),
      maxHp: intOf(beast.maxHp, 100),
      hp: intOf(beast.hp, intOf(beast.maxHp, 100)),
      speedMult: clamp(numOf(beast.speed, 100) / 100, 0.4, 2.5),
      joinedAt: Date.now(),
    }))
  }
}

// ---------- 宿主状态操作（薄封装） ----------

export function addMemberToState(s: PartyHostState, member: PartyMember): { ok: boolean; reason: string } {
  const party = s.party ?? []
  if (party.some(m => m.refId === member.refId)) {
    return { ok: false, reason: '该同伴已在队伍中' }
  }
  if (member.kind === 'cultivator') {
    const gate = canAddCultivator(party)
    if (!gate.ok) return gate
  } else if (countActive(party, 'beast') >= PARTY_RULES.maxBeast) {
    return { ok: false, reason: `出战灵兽已达上限（${PARTY_RULES.maxBeast} 只）` }
  }
  s.party = addMember(party, member)
  return { ok: true, reason: '' }
}

export function removeMemberFromState(s: PartyHostState, refId: string): boolean {
  const before = s.party ?? []
  if (!hasMemberRef(before, refId)) return false
  s.party = removeMemberByRef(before, refId)
  return true
}

export function toggleMemberInState(s: PartyHostState, refId: string): { ok: boolean; reason: string } {
  const party = s.party ?? []
  const cur = findMemberByRef(party, refId)
  if (!cur) return { ok: false, reason: '队伍中没有该成员' }
  if (cur.status !== 'active') {
    if (cur.kind === 'cultivator' && countActive(party, 'cultivator') >= PARTY_RULES.maxCultivator) {
      return { ok: false, reason: `出战修士已达上限（${PARTY_RULES.maxCultivator} 名）` }
    }
    if (cur.kind === 'beast' && countActive(party, 'beast') >= PARTY_RULES.maxBeast) {
      return { ok: false, reason: `出战灵兽已达上限（${PARTY_RULES.maxBeast} 只）` }
    }
  }
  s.party = toggleMemberActive(party, refId)
  return { ok: true, reason: '' }
}
