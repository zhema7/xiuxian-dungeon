// 构建期配置表校验：字段完整性与引用一致性，失败即非零退出
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')
const load = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'))

let errors = 0
const err = (msg) => { errors++; console.error(`  ✗ ${msg}`) }

const SLOTS = ['weapon', 'head', 'armor', 'boots', 'charm']
const MOD_KEYS = ['atk', 'def', 'speed', 'crit', 'maxHp', 'atkPct', 'defPct', 'hpPct', 'aspd', 'lifesteal', 'skillPct', 'cdPct']
const ATTACK_MODES = ['melee_arc', 'whirlwind', 'flying_sword', 'flying_sword_burst', 'magic_bolt', 'frost_nova', 'frost_nova_burst', 'thunder_chain', 'sword_array', 'giant_sword', 'slash_pierce', 'bolt_fire', 'slash_heavy', 'bolt_needle', 'slash_ice', 'bolt_dart', 'thunder_net', 'flying_sword_split', 'flame_slash', 'shadow_blade', 'spirit_chain', 'wind_slash', 'stone_spike', 'blood_scythe', 'star_barrage', 'venom_claw', 'light_beam', 'soul_flame', 'crystal_shard']
const SKILL_TYPES = ['style', 'mind', 'art']
const SKILL_CLASSES = ['sword', 'fairy', 'sword_new', 'fairy_new', 'mage', 'any']
const ART_MODES = ['sword_fan', 'fire_rain', 'thunder_strike', 'dageng', 'sword_storm', 'fire_phoenix', 'mountain_seal', 'shadow_swarm', 'ice_thunder', 'thunder_prison', 'meteor_storm', 'void_rift', 'blood_domain', 'light_pillar', 'frozen_domain', 'spirit_vortex', 'blade_orbit', 'poison_cloud', 'gravity_crush', 'phoenix_rebirth']
const PROCEDURAL_VFX_RECIPES = ['sword-comet', 'frost-bloom', 'thunder-sigil', 'giant-crest']
const SET_EFFECT_TAGS = ['sword_split', 'fire_burst', 'delayed_burst', 'array_mine', 'procedural_vfx', 'test_sword_visual', 'test_frost_visual', 'test_thunder_visual', 'test_giant_visual']
const CONTROLLED_HIT_LINKAGES = {
  flying_sword_first_hit_split: { attackMode: 'flying_sword_burst', childCount: 2, damageMultiplier: 0.4, cooldownMs: 800 },
  giant_sword_first_hit_fire_bolt: { attackMode: 'giant_sword', projectileCount: 1, damageMultiplier: 0.4, cooldownMs: 1200 },
}
const SET_PRESENTATION_FIELDS = ['attackMode', 'artMode', 'transformId', 'attackName', 'artName', 'vfxRecipe', 'hitLinkage', 'fxTags', 'artPower', 'artCooldownMs']

/**
 * Presentation fields are reserved for independently qualified 4/6-piece tiers.
 * Exported for focused regression coverage; the CLI below reports the owning set id.
 */
export function validateSetBonusPresentationGate(bonus) {
  const presentationFields = SET_PRESENTATION_FIELDS.filter((field) => bonus?.[field] !== undefined)
  if (presentationFields.length === 0) return null
  if (bonus?.count === 2) return `2 件条目不得携带能力字段：${presentationFields.join(', ')}`
  if (bonus?.count !== 4 && bonus?.count !== 6) return `携带能力字段的条目必须为 4 或 6 件，当前为 ${bonus?.count ?? '缺失'} 件：${presentationFields.join(', ')}`
  return null
}

/** Static data may only name fully specified, implemented first-hit linkages. */
export function validateControlledHitLinkage(linkage, attackMode, artMode) {
  if (linkage === undefined) return null
  if (!linkage || typeof linkage !== 'object' || Array.isArray(linkage)) return 'hitLinkage 必须为受控机制对象'
  const def = CONTROLLED_HIT_LINKAGES[linkage.recipeId]
  if (!def) return `未知受控命中联动：${linkage.recipeId ?? '缺失'}`
  if (artMode === 'dageng') return '大庚剑阵不得携带受控命中联动'
  if (attackMode !== def.attackMode) return `受控命中联动 ${linkage.recipeId} 与攻击模式不兼容`
  if (!linkage.parameters || typeof linkage.parameters !== 'object' || Array.isArray(linkage.parameters)) return `受控命中联动 ${linkage.recipeId} 缺少 parameters`
  const expected = { ...def, nonRecursive: true }
  delete expected.attackMode
  const keys = Object.keys(linkage.parameters)
  const expectedKeys = Object.keys(expected)
  if (keys.length !== expectedKeys.length || !keys.every((key) => expectedKeys.includes(key))) return `受控命中联动 ${linkage.recipeId} 参数字段非法`
  for (const [key, value] of Object.entries(expected)) {
    if (linkage.parameters[key] !== value) return `受控命中联动 ${linkage.recipeId} 参数 ${key} 必须为 ${value}`
  }
  return null
}

const classes = load('classes.json')
const monsters = load('monsters.json')
const floors = load('floors.json')
const items = load('items.json')
const affixes = load('affixes.json')
const sets = load('sets.json')
const skills = load('skills.json')
const talents = load('talents.json')

// classes
const DIRS = ['down', 'left', 'right', 'up']
for (const [id, c] of Object.entries(classes)) {
  if (c.id !== id) err(`classes: ${id} 的 id 字段不一致`)
  for (const k of ['hp', 'atk', 'def', 'speed', 'crit']) if (typeof c.base?.[k] !== 'number') err(`classes.${id}: base.${k} 缺失`)
  if (c.dirRemap) for (const [k, v] of Object.entries(c.dirRemap)) {
    if (!DIRS.includes(k) || !DIRS.includes(v)) err(`classes.${id}: dirRemap 含非法方向 ${k}->${v}`)
  }
}

// monsters
for (const [id, m] of Object.entries(monsters)) {
  for (const k of ['hp', 'atk', 'def', 'exp']) if (!(m[k] > 0)) err(`monsters.${id}: ${k} 非法`)
  if (!(m.speed >= 0)) err(`monsters.${id}: speed 非法`)
  if (!['melee', 'ranged', 'boss'].includes(m.ai)) err(`monsters.${id}: ai 非法`)
  if (m.ai === 'ranged' && !m.range) err(`monsters.${id}: 远程怪缺少 range`)
}

// floors
for (const [f, spawns] of Object.entries(floors.floors)) {
  if (Number(f) > floors.max) err(`floors: 第 ${f} 层超过 max=${floors.max}`)
  for (const [mid, min, max] of spawns) {
    if (!monsters[mid]) err(`floors.${f}: 未知怪物 ${mid}`)
    if (min < 0 || max < min) err(`floors.${f}: ${mid} 数量区间非法`)
  }
}

// items & sets
const itemIds = new Set()
for (const it of items) {
  if (itemIds.has(it.id)) err(`items: id 重复 ${it.id}`)
  itemIds.add(it.id)
  if (!SLOTS.includes(it.slot)) err(`items.${it.id}: slot 非法 ${it.slot}`)
  if (it.set && !sets[it.set]) err(`items.${it.id}: 引用未知套装 ${it.set}`)
}
for (const [sid, s] of Object.entries(sets)) {
  for (const p of s.pieces) {
    if (!itemIds.has(p)) err(`sets.${sid}: 部件 ${p} 不存在`)
  }
  for (const b of s.bonuses) {
    const presentationGateError = validateSetBonusPresentationGate(b)
    if (presentationGateError) err(`sets.${sid}: ${presentationGateError}`)
    if (typeof b.desc !== 'string' || !b.desc.trim()) err(`sets.${sid}: bonus desc 缺失或为空`)
    if (b.mods) for (const k of Object.keys(b.mods)) if (!MOD_KEYS.includes(k)) err(`sets.${sid}: 未知修饰 ${k}`)
    if (b.attackMode && !ATTACK_MODES.includes(b.attackMode)) err(`sets.${sid}: 未知攻击模式 ${b.attackMode}`)
    if (b.artMode && !ART_MODES.includes(b.artMode)) err(`sets.${sid}: 未知神通模式 ${b.artMode}`)
    if (b.fxTags) for (const tag of b.fxTags) if (!SET_EFFECT_TAGS.includes(tag)) err(`sets.${sid}: 未知套装特效标签 ${tag}`)
    if (b.artPower !== undefined && !(typeof b.artPower === 'number' && b.artPower > 0)) err(`sets.${sid}: artPower 必须为正数`)
    if (b.artCooldownMs !== undefined && !(typeof b.artCooldownMs === 'number' && b.artCooldownMs > 0)) err(`sets.${sid}: artCooldownMs 必须为正数`)
    if (b.transformId !== undefined && !(typeof b.transformId === 'string' && b.transformId.trim())) err(`sets.${sid}: transformId 必须为非空字符串`)
    if (b.vfxRecipe !== undefined && !PROCEDURAL_VFX_RECIPES.includes(b.vfxRecipe)) err(`sets.${sid}: 未知程序特效处方 ${b.vfxRecipe}`)
    const linkageError = validateControlledHitLinkage(b.hitLinkage, b.attackMode, b.artMode)
    if (linkageError) err(`sets.${sid}: ${linkageError}`)
  }
}

// affixes
for (const a of affixes) {
  if (!MOD_KEYS.includes(a.stat)) err(`affixes.${a.id}: 未知属性 ${a.stat}`)
  if (!(a.max >= a.min && a.min > 0)) err(`affixes.${a.id}: 数值区间非法`)
}

// skills
for (const s of skills) {
  if (!SKILL_TYPES.includes(s.type)) err(`skills.${s.id}: type 非法`)
  if (!SKILL_CLASSES.includes(s.class)) err(`skills.${s.id}: class 非法（需 sword/fairy/sword_new/fairy_new/mage/any）`)
  if (s.type === 'style' && !ATTACK_MODES.includes(s.attackMode)) err(`skills.${s.id}: 未知攻击模式`)
  if (s.type === 'mind' && s.mods) for (const k of Object.keys(s.mods)) if (!MOD_KEYS.includes(k)) err(`skills.${s.id}: 未知修饰 ${k}`)
  if (s.type === 'art' && !(s.cd > 0 && s.power > 0)) err(`skills.${s.id}: 神通缺少 cd/power`)
  if (s.type === 'art' && s.artMode && !ART_MODES.includes(s.artMode)) err(`skills.${s.id}: 未知神通模式`)
}
// 每个职业必须有默认招式
for (const [cid, c] of Object.entries(classes)) {
  const def = skills.find((s) => s.id === c.defaultStyle)
  if (!def) err(`classes.${cid}: 默认招式 ${c.defaultStyle} 不存在`)
  else if (def.type !== 'style') err(`classes.${cid}: 默认招式必须是 style 类型`)
}

// talents
const talentIds = new Set()
for (const br of talents.branches) {
  for (const n of br.nodes) {
    if (talentIds.has(n.id)) err(`talents: 节点 id 重复 ${n.id}`)
    talentIds.add(n.id)
    for (const k of Object.keys(n.per)) if (!MOD_KEYS.includes(k)) err(`talents.${n.id}: 未知修饰 ${k}`)
    if (!(n.max > 0)) err(`talents.${n.id}: max 非法`)
  }
}

if (errors > 0) {
  console.error(`\n配置表校验失败：${errors} 处错误`)
  process.exit(1)
}

// ---------- v4 三十套独立 Kit 硬校验（ADR §6） ----------
const V4_KIT_IDS = Array.from({ length: 30 }, (_, i) => `k${String(i + 1).padStart(2, '0')}`)
const KIT_PRIMITIVES = ['roundtrip', 'refract', 'mark', 'fixedpoint', 'thundernet', 'thunderstake', 'charge', 'boomerang']
const EXPECTED_NORMAL_COUNTS = { roundtrip: 5, refract: 5, mark: 5, fixedpoint: 3, thundernet: 1, thunderstake: 2, charge: 2, boomerang: 7 }
const EXPECTED_ART_COUNTS = { roundtrip: 2, refract: 1, mark: 4, fixedpoint: 3, thundernet: 5, thunderstake: 5, charge: 4, boomerang: 6 }

const v4Kits = load('v4-kits.json')
const seenKitIds = new Set()

if (!Array.isArray(v4Kits)) { err('v4-kits: 须为数组'); process.exit(1) }
if (v4Kits.length !== 30) err(`v4-kits: 须为 30 套，当前为 ${v4Kits.length}`)

for (const kit of v4Kits) {
  if (typeof kit.kitId !== 'string' || !V4_KIT_IDS.includes(kit.kitId)) err(`v4-kits: kitId 非法或不在白名单 ${kit.kitId}`)
  if (seenKitIds.has(kit.kitId)) err(`v4-kits: kitId 重复 ${kit.kitId}`)
  seenKitIds.add(kit.kitId)
  if (typeof kit.name !== 'string' || !kit.name.trim()) err(`v4-kits.${kit.kitId}: name 缺失`)
  if (!KIT_PRIMITIVES.includes(kit.normalPrimitive)) err(`v4-kits.${kit.kitId}: normalPrimitive 非法 ${kit.normalPrimitive}`)
  if (!KIT_PRIMITIVES.includes(kit.artPrimitive)) err(`v4-kits.${kit.kitId}: artPrimitive 非法 ${kit.artPrimitive}`)
  if (typeof kit.element !== 'string' || !kit.element.trim()) err(`v4-kits.${kit.kitId}: element 缺失`)
  if (typeof kit.theme !== 'string' || !kit.theme.trim()) err(`v4-kits.${kit.kitId}: theme 缺失`)
}

// 原语计数硬校验（两侧各精确 30，GDD §2）
if (v4Kits.length === 30) {
  const normalCounts = {}
  const artCounts = {}
  for (const p of KIT_PRIMITIVES) { normalCounts[p] = 0; artCounts[p] = 0 }
  for (const kit of v4Kits) {
    normalCounts[kit.normalPrimitive] = (normalCounts[kit.normalPrimitive] ?? 0) + 1
    artCounts[kit.artPrimitive] = (artCounts[kit.artPrimitive] ?? 0) + 1
  }
  let normalTotal = 0, artTotal = 0
  for (const p of KIT_PRIMITIVES) {
    normalTotal += normalCounts[p]
    artTotal += artCounts[p]
    if (normalCounts[p] !== EXPECTED_NORMAL_COUNTS[p])
      err(`v4-kits: 普攻原语 ${p} 计数 ${normalCounts[p]} ≠ 预期 ${EXPECTED_NORMAL_COUNTS[p]}`)
    if (artCounts[p] !== EXPECTED_ART_COUNTS[p])
      err(`v4-kits: 神通原语 ${p} 计数 ${artCounts[p]} ≠ 预期 ${EXPECTED_ART_COUNTS[p]}`)
  }
  if (normalTotal !== 30) err(`v4-kits: 普攻原语总数 ${normalTotal} ≠ 30`)
  if (artTotal !== 30) err(`v4-kits: 神通原语总数 ${artTotal} ≠ 30`)
  // 八原语全覆盖（每原语两侧各 ≥1）
  for (const p of KIT_PRIMITIVES) {
    if (normalCounts[p] === 0) err(`v4-kits: 普攻原语 ${p} 出现 0 次，未全覆盖`)
    if (artCounts[p] === 0) err(`v4-kits: 神通原语 ${p} 出现 0 次，未全覆盖`)
  }
}

if (errors > 0) {
  console.error(`\n配置表校验失败：${errors} 处错误`)
  process.exit(1)
}
console.log(`配置表校验通过：${Object.keys(classes).length} 职业 / ${Object.keys(monsters).length} 怪物 / ${items.length} 装备基座 / ${affixes.length} 词缀 / ${skills.length} 功法 / ${talentIds.size} 天赋节点 / ${v4Kits.length} v4Kit`)
