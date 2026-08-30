import { describe, expect, it } from 'vitest'
import { ITEM_BASE_MAP, SETS } from '../src/data'
import { makeRng } from '../src/core'
import {
  DYNAMIC_SET_COMBAT_PROFILES,
  DYNAMIC_SET_THEMES,
  chooseDynamicAttackMode,
  chooseDynamicSetCombatProfile,
  combatProfilesForTheme,
  formatDynamicSetBonusDesc,
  DYNAMIC_SET_GENERATOR_VERSION,
  DYNAMIC_SET_SCHEMA_VERSION,
  genDynamicSet,
} from '../src/lore'

const RUNTIME_IDS = ['flying_sword_burst', 'frost_nova_burst', 'thunder_chain', 'giant_sword', 'sword_fan', 'fire_rain', 'thunder_strike', 'dageng']
const FORBIDDEN_TEXT = ['冻结', '定身', '流血', '吸血', '封魂', '诅咒', '冥火']
const THUNDER_CHAIN_FACT = '雷光命中首个目标后，最多向邻近妖敌跳传三次，总计最多命中四个目标，后续威力递减'

const LOCKED_PROFILE_TABLE = [
  {
    id: 'jianchao-chuanyun', themes: ['青元', '千竹', '白虹'],
    attackMode: 'flying_sword_burst', artMode: 'sword_fan',
  },
  {
    id: 'wanjian-guiliu', themes: ['大衍', '金阙', '苍坤'],
    attackMode: 'flying_sword_burst', artMode: 'dageng',
  },
  {
    id: 'shuanglei-zhenyu', themes: ['冰魄', '掩月', '银月'],
    attackMode: 'frost_nova_burst', artMode: 'thunder_strike',
  },
  {
    id: 'xuanzhen-zhenpo', themes: ['玄骨', '虚天', '啼魂'],
    attackMode: 'frost_nova_burst', artMode: 'dageng',
  },
  {
    id: 'tianjie-chuanlei', themes: ['紫灵', '惊蛰', '天澜'],
    attackMode: 'thunder_chain', artMode: 'thunder_strike',
  },
  {
    id: 'fenglei-xuntian', themes: ['六翼', '黄枫', '黑风'],
    attackMode: 'thunder_chain', artMode: 'thunder_strike',
  },
  {
    id: 'fentian-kaihe', themes: ['赤炎', '青焰', '血焰'],
    attackMode: 'giant_sword', artMode: 'fire_rain',
  },
  {
    id: 'xingyun-pozhen', themes: ['魔银', '逆星', '曲魂'],
    attackMode: 'giant_sword', artMode: 'fire_rain',
  },
  { id: 'jinfeng-huihuan', themes: ['青焰', '白虹', '千竹'], attackMode: 'melee_arc' },
  { id: 'xuanfeng-liexue', themes: ['黑风', '六翼', '黄枫'], attackMode: 'whirlwind' },
  { id: 'liuguang-feijian', themes: ['流云', '青冥', '玉辰'], attackMode: 'flying_sword' },
  { id: 'lingdan-fatan', themes: ['丹朱', '阳燧', '紫府'], attackMode: 'magic_bolt' },
  { id: 'hanjing-binghuan', themes: ['冰魄', '掩月', '银月'], attackMode: 'frost_nova' },
  { id: 'wanjian-guizong', themes: ['天罡', '太一', '玉衡'], attackMode: 'sword_array' },
  { id: 'yuanfan-wanglai', themes: ['大衍', '天璇', '紫微'] },
  { id: 'xuanren-huixuan', themes: ['苍坤', '九宫', '玄枢'] },
  { id: 'zheguang-dingxue', themes: ['清光', '六仪', '太微'] },
  { id: 'wangjie-leizhuang', themes: ['钧天', '风雷', '神霄'] },
  { id: 'tianhuo-xingyun', themes: ['业火', '凰焰', '烬燃'], artMode: 'fire_rain' },
  { id: 'shenlei-pixie', themes: ['惊雷', '辟邪', '玉辰'], artMode: 'thunder_strike' },
  { id: 'anxiao-liekong', themes: ['玄骨', '虚天', '啼魂'], attackMode: 'shadow_blade', artMode: 'void_rift' },
  { id: 'fengxuan-lingxuan', themes: ['流云', '青冥', '玉辰'], attackMode: 'wind_slash', artMode: 'spirit_vortex' },
  { id: 'dizhen-bingyuan', themes: ['苍坤', '九宫', '玄枢'], attackMode: 'stone_spike', artMode: 'frozen_domain' },
  { id: 'xueming-xueyu', themes: ['血焰', '烬燃', '业火'], attackMode: 'blood_scythe', artMode: 'blood_domain' },
  { id: 'xingyu-jianhuan', themes: ['紫微', '天璇', '玉衡'], attackMode: 'star_barrage', artMode: 'blade_orbit' },
  { id: 'duzhao-wanyun', themes: ['曲魂', '六翼', '黄枫'], attackMode: 'venom_claw', artMode: 'poison_cloud' },
  { id: 'shengguang-tianzhu', themes: ['太一', '天罡', '浩然'], attackMode: 'light_beam', artMode: 'light_pillar' },
  { id: 'hunyan-zhongyuan', themes: ['惊雷', '辟邪', '神霄'], attackMode: 'soul_flame', artMode: 'gravity_crush' },
  { id: 'jingsui-xingyun', themes: ['银月', '冰魄', '紫灵'], attackMode: 'crystal_shard', artMode: 'meteor_storm' },
  { id: 'lingsuo-fenghuang', themes: ['金阙', '镇界', '天罗'], attackMode: 'spirit_chain', artMode: 'phoenix_rebirth' },
  { id: 'hunyuan-baoti', themes: ['归元', '浩然', '太一'] },
  { id: 'xuantie-jianshan', themes: ['庚金', '镇界', '天罗'] },
] as const

describe('dynamic set combat profiles', () => {
  it('registers four independent test sets with the intended modes and pieces', () => {
    const cases = [
      ['set_test_flying', 'flying_sword_burst'],
      ['set_test_frost', 'frost_nova_burst'],
      ['set_test_thunder', 'thunder_chain'],
      ['set_test_giant', 'giant_sword'],
    ] as const
    for (const [id, mode] of cases) {
      const set = SETS[id]
      expect(set).toBeDefined()
      expect(set.bonuses.find((b) => b.count === 4)?.attackMode).toBe(mode)
      expect(set.pieces).toHaveLength(4)
      for (const piece of set.pieces) expect(ITEM_BASE_MAP.get(piece)?.set).toBe(id)
    }
  })

  it('exactly matches the locked thirty-two-profile compatibility table', () => {
    expect(DYNAMIC_SET_COMBAT_PROFILES).toHaveLength(LOCKED_PROFILE_TABLE.length)
    expect(DYNAMIC_SET_COMBAT_PROFILES.map(({ id, themes, attackMode, artMode }) => ({ id, themes, attackMode, artMode })))
      .toEqual(LOCKED_PROFILE_TABLE)
  })

  it('uses enabled, complete Chinese profiles and covers every runtime attack/art mode', () => {
    expect(new Set(DYNAMIC_SET_COMBAT_PROFILES.map((p) => p.attackMode))).toEqual(new Set([
      'flying_sword_burst', 'frost_nova_burst', 'thunder_chain', 'giant_sword',
      'melee_arc', 'whirlwind', 'flying_sword', 'magic_bolt', 'frost_nova', 'sword_array',
      'shadow_blade', 'spirit_chain', 'wind_slash', 'stone_spike',
      'blood_scythe', 'star_barrage', 'venom_claw', 'light_beam',
      'soul_flame', 'crystal_shard',
      undefined,
    ]))
    expect(new Set(DYNAMIC_SET_COMBAT_PROFILES.map((p) => p.artMode))).toEqual(new Set([
      'sword_fan', 'fire_rain', 'thunder_strike', 'dageng',
      'void_rift', 'spirit_vortex', 'frozen_domain', 'blood_domain',
      'blade_orbit', 'poison_cloud', 'light_pillar', 'gravity_crush',
      'meteor_storm', 'phoenix_rebirth',
      undefined,
    ]))
    for (const profile of DYNAMIC_SET_COMBAT_PROFILES) {
      expect(profile.enabled).toBe(true)
      expect(profile.id).toMatch(/^[a-z0-9-]+$/)
      expect(profile.themes).toHaveLength(3)
      expect(profile.weight).toBeGreaterThan(0)
      if (profile.artPower != null) expect(profile.artPower).toBeGreaterThan(0)
      if (profile.artCooldownMs != null) expect(profile.artCooldownMs).toBeGreaterThan(0)
      const behaviorText = `${profile.attackName ?? ''}${profile.attackBehavior ?? ''}${profile.artName ?? ''}${profile.artBehavior ?? ''}`
      if (behaviorText) {
        expect(behaviorText).toMatch(/[\u4e00-\u9fff]/)
        for (const forbidden of [...FORBIDDEN_TEXT, ...RUNTIME_IDS]) expect(behaviorText).not.toContain(forbidden)
      }
    }
  })

  it('keeps player-facing frost and thunder facts aligned with the implemented runtime limits', () => {
    const frostProfiles = DYNAMIC_SET_COMBAT_PROFILES.filter((profile) => profile.attackMode === 'frost_nova_burst')
    const thunderProfiles = DYNAMIC_SET_COMBAT_PROFILES.filter((profile) => profile.attackMode === 'thunder_chain')

    expect(frostProfiles).not.toHaveLength(0)
    expect(frostProfiles.every((profile) => /迟缓|减速/.test(profile.attackBehavior))).toBe(true)
    expect(frostProfiles.every((profile) => !profile.attackBehavior.includes('冻结'))).toBe(true)
    expect(thunderProfiles).not.toHaveLength(0)
    expect(thunderProfiles.every((profile) => profile.attackBehavior === THUNDER_CHAIN_FACT)).toBe(true)
  })

  it('maps all themes through explicit profile membership', () => {
    const flattened = DYNAMIC_SET_COMBAT_PROFILES.flatMap((p) => p.themes)
    expect(flattened).toHaveLength(DYNAMIC_SET_COMBAT_PROFILES.length * 3)
    expect(DYNAMIC_SET_THEMES).toHaveLength(new Set(flattened).size)
    expect(new Set(flattened)).toEqual(new Set(DYNAMIC_SET_THEMES))
    for (const theme of DYNAMIC_SET_THEMES) {
      expect(combatProfilesForTheme(theme).length).toBeGreaterThanOrEqual(1)
      expect(chooseDynamicSetCombatProfile(() => 0.5, [theme]).themes).toContain(theme)
    }
  })

  it('keeps one-theme mode selection compatible without keyword inference', () => {
    expect(chooseDynamicAttackMode(() => 0, '冰魄')).toBe('frost_nova_burst')
    expect(chooseDynamicAttackMode(() => 0, '惊蛰')).toBe('thunder_chain')
    expect(chooseDynamicAttackMode(() => 0, '赤炎')).toBe('giant_sword')
    expect(chooseDynamicAttackMode(() => 0, '青元')).toBe('flying_sword_burst')
  })

  it('is deterministic and persists the complete transform contract with Chinese description', () => {
    const a = genDynamicSet(makeRng(123), 1, [])
    const b = genDynamicSet(makeRng(123), 1, [])
    expect(a).toEqual(b)
    expect(a.schemaVersion).toBe(DYNAMIC_SET_SCHEMA_VERSION)
    expect(a.generation?.generatorVersion).toBe(DYNAMIC_SET_GENERATOR_VERSION)
    expect(a.generation?.identity.setId).toBe(a.set.id)
    const bonus = a.set.bonuses.find((entry) => entry.count === 4)
    expect(bonus).toMatchObject({
      fxTags: [expect.any(String)],
    })
    if (bonus?.transformId) expect(bonus.transformId).toEqual(expect.any(String))
    if (bonus?.attackMode) expect(bonus.attackMode).toEqual(expect.any(String))
    if (bonus?.artMode) expect(bonus.artMode).toEqual(expect.any(String))
    if (bonus?.artPower != null) expect(bonus.artPower).toBeGreaterThan(0)
    if (bonus?.artCooldownMs != null) expect(bonus.artCooldownMs).toBeGreaterThan(0)
    if (bonus?.attackName) expect(bonus?.desc).toContain('招式化为【')
    if (bonus?.artName) expect(bonus?.desc).toContain('神通化为【')
    for (const forbidden of [...FORBIDDEN_TEXT, ...RUNTIME_IDS]) expect(bonus?.desc).not.toContain(forbidden)
  })

  it('generates all attacks and arts across deterministic seed coverage', () => {
    const attacks = new Set<string>()
    const arts = new Set<string>()
    for (let seed = 1; seed <= 400; seed++) {
      const bonus = genDynamicSet(makeRng(seed), seed, []).set.bonuses.find((entry) => entry.count === 4)!
      attacks.add(bonus.attackMode ?? 'none')
      arts.add(bonus.artMode ?? 'none')
    }
    const expectedAttacks = [
      'flying_sword_burst', 'frost_nova_burst', 'thunder_chain', 'giant_sword',
      'melee_arc', 'whirlwind', 'flying_sword', 'magic_bolt', 'frost_nova', 'sword_array',
      'none',
    ]
    const expectedArts = ['sword_fan', 'fire_rain', 'thunder_strike', 'dageng', 'none']
    for (const mode of expectedAttacks) expect(attacks).toContain(mode)
    for (const mode of expectedArts) expect(arts).toContain(mode)
    expect(attacks.size).toBeGreaterThanOrEqual(expectedAttacks.length)
    expect(arts.size).toBeGreaterThanOrEqual(expectedArts.length)
  })

  it('formats Chinese desc independently of internal ids and unsupported states', () => {
    const profile = DYNAMIC_SET_COMBAT_PROFILES[0]
    const desc = formatDynamicSetBonusDesc({ atkPct: 0.18 }, profile)
    expect(desc).toContain('攻击+18%')
    expect(desc).toContain(profile.attackName)
    expect(desc).toContain(profile.artName)
    for (const forbidden of [...FORBIDDEN_TEXT, ...RUNTIME_IDS]) expect(desc).not.toContain(forbidden)
  })

  it('keeps old dynamic records without transform fields load-compatible', () => {
    const old = { set: { id: 'set_old', name: '旧套', pieces: ['old_w'], bonuses: [{ count: 4, desc: '旧数据' }] }, bases: [] }
    expect(old.set.bonuses[0].attackMode).toBeUndefined()
    expect(old.set.bonuses[0].artMode).toBeUndefined()
    expect(old.set.bonuses[0].transformId).toBeUndefined()
  })

  it('does not alter the existing four static sets', () => {
    expect(SETS.set_qm.bonuses[1]).toMatchObject({ attackMode: 'flying_sword_burst', fxTags: ['sword_split'] })
    expect(SETS.set_xm.bonuses[1]).toMatchObject({ attackMode: 'frost_nova_burst', fxTags: ['delayed_burst'] })
    expect(SETS.set_zx.bonuses[1]).toMatchObject({ attackMode: 'thunder_chain', fxTags: ['array_mine'] })
    expect(SETS.set_fr.bonuses[1]).toMatchObject({ attackMode: 'giant_sword', artMode: 'dageng', fxTags: ['fire_burst'] })
  })
})
