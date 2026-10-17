// ---------- 队伍系统统一层单测 ----------
// 覆盖 src/party.ts：模型规范化、名额裁决、战斗结算、成长，以及 v11→v12 破坏性迁移
// 设计依据：docs/architecture/party-system-redesign.md

import { describe, expect, it } from 'vitest'
import {
  addMember, addMemberToState, canAddCultivator, countActive, cultivatorBaseMaxHp,
  damageMember, DEFAULT_ATTACK_MULT, enforceRules, findMemberByRef, getActiveMembers,
  grantMemberExp, hasMemberRef, makeBeastMember, makeCultivatorMember, makeSisterMember, MEMBER_GROWTH,
  memberUid, normalizeClassId, normalizeParty, npcAttackMult, partyFromLegacy,
  PARTY_RULES, pickNpcClass, pickSiblingClass, removeMemberByRef, removeMemberFromState,
  reviveDowned, setActiveBeast, setMemberStatus, sortParty, toggleMemberActive,
  toggleMemberInState, fullHealParty,
  activeBeastRef, activeCompanionRef, hasSectSibling,
  effectiveMaxHp, equipMemberItem, getMemberSkillSlot, memberEquipBonus,
  MEMBER_SKILL_SLOTS, MEMBER_SLOT_KEYS, normalizeMemberEquipment, normalizeMemberSkillSlots,
  setMemberSkillSlot, unequipMemberSlot,
  type PartyHostState, type PartyMember,
} from '../src/party'

const host = (party: PartyMember[] = []): PartyHostState => ({ party })

describe('party · 职业归一', () => {
  it('旧缺陷修复：sword_new / mage 不再被误判落到 sword', () => {
    expect(normalizeClassId('sword_new')).toBe('sword_new')
    expect(normalizeClassId('mage')).toBe('mage')
    expect(normalizeClassId('fairy_new')).toBe('fairy_new')
  })

  it('未知职业回退到 sword', () => {
    expect(normalizeClassId('???')).toBe('sword')
    expect(normalizeClassId(undefined)).toBe('sword')
  })

  it('道友职业沿用 v0.7 取反公式，保证老存档视觉不跳变', () => {
    expect(pickSiblingClass('sword')).toBe('fairy')
    expect(pickSiblingClass('mage')).toBe('sword')
  })

  it('组队 NPC 避开玩家与已有队员已占用的外形', () => {
    const occupied = [makeSisterMember('sword', 1)]
    const cls = pickNpcClass('sword', occupied, 0)
    expect(cls).not.toBe('sword')
    expect(cls).not.toBe(occupied[0].classId)
  })
})

describe('party · 规范化与名额裁决', () => {
  it('丢弃缺 refId / 非法 source 的幽灵条目', () => {
    const out = normalizeParty([
      { source: 'worldNpc' }, // 缺 refId
      { source: 'unknownSource', refId: 'x' }, // 非法来源
      null,
      'not-an-object',
      { source: 'sectSibling', refId: 'sister', classId: 'fairy' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].refId).toBe('sister')
  })

  it('重复 uid 去重', () => {
    const base = { source: 'worldNpc' as const, refId: 'n1', uid: 'pm_worldNpc_n1' }
    expect(normalizeParty([base, base])).toHaveLength(1)
  })

  it('出战修士超额时自动降级为 reserve', () => {
    const three = [
      makeCultivatorMember({ source: 'sectSibling', refId: 'sister', displayName: '陆青鸢', classId: 'fairy', joinedAt: 1 }),
      makeCultivatorMember({ source: 'worldNpc', refId: 'n1', displayName: '甲', classId: 'sword', joinedAt: 2 }),
      makeCultivatorMember({ source: 'worldNpc', refId: 'n2', displayName: '乙', classId: 'mage', joinedAt: 3 }),
    ]
    const out = enforceRules(three)
    expect(countActive(out, 'cultivator')).toBe(PARTY_RULES.maxCultivator)
    expect(findMemberByRef(out, 'n2')!.status).toBe('reserve')
  })

  it('灵兽超额时降级为 reserve', () => {
    const out = enforceRules([
      makeBeastMember({ uid: 'b1', name: '青狼', species: 'wolf', joinedAt: 1 }),
      makeBeastMember({ uid: 'b2', name: '玄龟', species: 'turtle', joinedAt: 2 }),
    ])
    expect(countActive(out, 'beast')).toBe(PARTY_RULES.maxBeast)
    expect(findMemberByRef(out, 'b2')!.status).toBe('reserve')
  })

  it('排序稳定：修士在前，同类按加入时间', () => {
    const out = sortParty([
      makeBeastMember({ uid: 'b1', name: '兽', species: 'wolf', joinedAt: 1 }),
      makeCultivatorMember({ source: 'worldNpc', refId: 'n2', displayName: '乙', classId: 'sword', joinedAt: 3 }),
      makeCultivatorMember({ source: 'sectSibling', refId: 'sister', displayName: '甲', classId: 'fairy', joinedAt: 2 }),
    ])
    expect(out.map(m => m.refId)).toEqual(['sister', 'n2', 'b1'])
  })

  it('getActiveMembers 只返回出战成员', () => {
    const p = setMemberStatus([makeSisterMember('sword', 1)], 'sister', 'reserve')
    expect(getActiveMembers(p)).toHaveLength(0)
  })
})

describe('party · 增删改', () => {
  it('加入同一 refId 幂等', () => {
    const m = makeSisterMember('sword', 1)
    const once = addMember([], m)
    const twice = addMember(once, makeSisterMember('sword', 9))
    expect(twice).toHaveLength(1)
  })

  it('canAddCultivator 在满员时拒绝', () => {
    const full = enforceRules([
      makeCultivatorMember({ source: 'sectSibling', refId: 'sister', displayName: '甲', classId: 'fairy', joinedAt: 1 }),
      makeCultivatorMember({ source: 'worldNpc', refId: 'n1', displayName: '乙', classId: 'sword', joinedAt: 2 }),
    ])
    expect(canAddCultivator(full).ok).toBe(false)
    expect(canAddCultivator([]).ok).toBe(true)
  })

  it('toggleMemberActive 在出战与待命间切换', () => {
    const m = makeSisterMember('sword', 1)
    const off = toggleMemberActive([m], 'sister')
    expect(findMemberByRef(off, 'sister')!.status).toBe('reserve')
    expect(findMemberByRef(toggleMemberActive(off, 'sister'), 'sister')!.status).toBe('active')
  })

  it('移除成员后再无残留', () => {
    const m = makeSisterMember('sword', 1)
    expect(hasMemberRef(removeMemberByRef([m], 'sister'), 'sister')).toBe(false)
  })

  it('宿主移除不存在的成员返回 false', () => {
    const s = host([])
    expect(removeMemberFromState(s, 'ghost')).toBe(false)
  })

  it('addMemberToState 满员时拒绝并给出原因', () => {
    const s = host([
      makeCultivatorMember({ source: 'sectSibling', refId: 'sister', displayName: '甲', classId: 'fairy', joinedAt: 1 }),
      makeCultivatorMember({ source: 'worldNpc', refId: 'n1', displayName: '乙', classId: 'sword', joinedAt: 2 }),
    ])
    const res = addMemberToState(s, makeCultivatorMember({ source: 'worldNpc', refId: 'n2', displayName: '丙', classId: 'mage' }))
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('上限')
  })

  it('toggleMemberInState 满员时拒绝再出战', () => {
    const s = host([
      makeCultivatorMember({ source: 'sectSibling', refId: 'sister', displayName: '甲', classId: 'fairy', joinedAt: 1 }),
      makeCultivatorMember({ source: 'worldNpc', refId: 'n1', displayName: '乙', classId: 'sword', joinedAt: 2 }),
      makeCultivatorMember({ source: 'worldNpc', refId: 'n2', displayName: '丙', classId: 'mage', joinedAt: 3 }),
    ])
    s.party = enforceRules(s.party)
    const res = toggleMemberInState(s, 'n2')
    expect(res.ok).toBe(false)
  })
})

describe('party · 战斗结算', () => {
  it('灵体护体（damageTakenRatio=0）免疫伤害', () => {
    const m = makeSisterMember('sword', 1)
    expect(m.damageTakenRatio).toBe(0)
    expect(damageMember(m, 9999)).toBe(false)
    expect(m.hp).toBe(m.maxHp)
  })

  it('正常队员承伤并扣血', () => {
    const m = makeCultivatorMember({ source: 'worldNpc', refId: 'n1', displayName: '甲', classId: 'sword' })
    const hp0 = m.hp
    expect(damageMember(m, 30)).toBe(false)
    expect(m.hp).toBe(hp0 - 30)
  })

  it('气血归零 → downed 且只触发一次', () => {
    const m = makeCultivatorMember({ source: 'worldNpc', refId: 'n1', displayName: '甲', classId: 'sword' })
    expect(damageMember(m, m.maxHp)).toBe(true)
    expect(m.status).toBe('downed')
    expect(damageMember(m, 100)).toBe(false)
    expect(m.hp).toBe(0)
  })

  it('reviveDowned：重伤者退为待命并按比例复原', () => {
    const m = makeCultivatorMember({ source: 'worldNpc', refId: 'n1', displayName: '甲', classId: 'sword' })
    damageMember(m, m.maxHp)
    const [revived] = reviveDowned([m])
    expect(revived.status).toBe('reserve')
    expect(revived.hp).toBe(Math.max(1, Math.round(revived.maxHp * PARTY_RULES.downedReviveRatio)))
  })

  it('fullHealParty 让重伤者满血回到待命', () => {
    const m = makeCultivatorMember({ source: 'worldNpc', refId: 'n1', displayName: '甲', classId: 'sword' })
    damageMember(m, m.maxHp)
    const [healed] = fullHealParty([m])
    expect(healed.hp).toBe(healed.maxHp)
    expect(healed.status).toBe('reserve')
  })
})

describe('party · 成长', () => {
  it('分享经验达到阈值才升级', () => {
    const m = makeSisterMember('sword', 1)
    expect(grantMemberExp(m, 10)).toBe(0)
    expect(m.level).toBe(1)
    const gained = grantMemberExp(m, 240) // 240 * 0.5 / 60 = 2 级
    expect(gained).toBe(2)
    expect(m.level).toBe(3)
    expect(m.maxHp).toBe(cultivatorBaseMaxHp(3))
  })

  it('升级提升战力且不超过上限', () => {
    const m = makeSisterMember('sword', 1)
    grantMemberExp(m, 100000)
    // v12：上限由 1.3 抬到 2.2（NPC 修为档案可带来更强的同行）
    expect(m.attackMult).toBeLessThanOrEqual(MEMBER_GROWTH.maxAttackMult)
  })

  it('组队 NPC 战力按等级比钳制在 [0.5, 1.2]', () => {
    expect(npcAttackMult(1, 100)).toBeGreaterThanOrEqual(0.5)
    expect(npcAttackMult(1, 100)).toBeLessThan(0.6)
    expect(npcAttackMult(999, 1)).toBe(1.2)
    expect(npcAttackMult(10, 10)).toBeCloseTo(0.95, 5)
  })
})

describe('party · v11→v12 迁移（破坏性，必须全覆盖）', () => {
  it('情形1：仅洞府道友 → 1 名 sectSibling，且保留免伤手感', () => {
    const out = partyFromLegacy({ companion: true, classId: 'sword' })
    expect(out).toHaveLength(1)
    expect(out[0].source).toBe('sectSibling')
    expect(out[0].refId).toBe('sister')
    expect(out[0].damageTakenRatio).toBe(0) // 灵体护体不回退
    expect(out[0].attackMult).toBe(DEFAULT_ATTACK_MULT.sectSibling)
  })

  it('情形2：仅大世界组队 NPC → 1 名 worldNpc，正常承伤', () => {
    const out = partyFromLegacy({
      activeCompanionNpcId: 'npc_1',
      proceduralNpcs: [{ id: 'npc_1', name: '青玄子', alive: true, seed: 7, level: 20, realm: 2 }],
      level: 20,
      classId: 'sword',
    })
    expect(out).toHaveLength(1)
    expect(out[0].source).toBe('worldNpc')
    expect(out[0].displayName).toBe('青玄子')
    expect(out[0].damageTakenRatio).toBe(1)
  })

  it('情形3：仅灵兽 → 1 只 beast', () => {
    const out = partyFromLegacy({
      activePetUid: 'b1',
      beasts: [{ uid: 'b1', name: '青狼', species: 'wolf', level: 5, maxHp: 200, hp: 200, speed: 120 }],
    })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('beast')
    expect(out[0].maxHp).toBe(200)
  })

  it('情形4：三者全有 → 恰好 3 席满员且全出战', () => {
    const out = partyFromLegacy({
      companion: true,
      classId: 'sword',
      activeCompanionNpcId: 'npc_1',
      proceduralNpcs: [{ id: 'npc_1', name: '青玄子', alive: true, seed: 1, level: 10, realm: 1 }],
      activePetUid: 'b1',
      beasts: [{ uid: 'b1', name: '青狼', species: 'wolf', level: 5, maxHp: 200, hp: 200, speed: 100 }],
    })
    expect(out).toHaveLength(3)
    expect(getActiveMembers(out)).toHaveLength(3)
    expect(countActive(out, 'cultivator')).toBe(PARTY_RULES.maxCultivator)
    expect(countActive(out, 'beast')).toBe(PARTY_RULES.maxBeast)
  })

  it('幽灵引用不入库：NPC 已陨落 / 灵兽已丢失', () => {
    expect(partyFromLegacy({
      activeCompanionNpcId: 'ghost_npc',
      proceduralNpcs: [{ id: 'ghost_npc', name: '已故', alive: false, level: 1 }],
    })).toHaveLength(0)
    expect(partyFromLegacy({ activePetUid: 'ghost_beast', beasts: [] })).toHaveLength(0)
  })

  it('全空 → 空队伍', () => {
    expect(partyFromLegacy({})).toHaveLength(0)
  })

  it('幂等：重复迁移不产生重复成员', () => {
    const raw = { companion: true, classId: 'sword' }
    const a = partyFromLegacy(raw)
    const b = partyFromLegacy({ ...raw, party: a })
    expect(b).toHaveLength(1)
    expect(normalizeParty([...a, ...a])).toHaveLength(1)
  })
})

describe('party · 旧字段移除后的等价查询（v13）', () => {
  it('hasSectSibling 取代 state.companion', () => {
    const s = host([makeSisterMember('sword', 1)])
    expect(hasSectSibling(s.party)).toBe(true)
    removeMemberFromState(s, 'sister')
    expect(hasSectSibling(s.party)).toBe(false)
  })

  it('activeCompanionRef 取代 activeCompanionNpcId', () => {
    const s = host([])
    expect(activeCompanionRef(s.party)).toBeNull()
    addMemberToState(s, makeCultivatorMember({ source: 'worldNpc', refId: 'npc_9', displayName: '甲', classId: 'sword' }))
    expect(activeCompanionRef(s.party)).toBe('npc_9')
    expect(hasSectSibling(s.party)).toBe(false)
  })

  it('待命的组队 NPC 不算当前同行，避免把 reserve 误判为已组队', () => {
    const m = makeCultivatorMember({ source: 'worldNpc', refId: 'npc_9', displayName: '甲', classId: 'sword' })
    m.status = 'reserve'
    expect(activeCompanionRef([m])).toBeNull()
  })

  it('setActiveBeast 写 party；activeBeastRef 取代 activePetUid；再传 null 收回', () => {
    const s = host([])
    setActiveBeast(s, { uid: 'b1', name: '青狼', species: 'wolf', level: 3, maxHp: 150, hp: 150, speed: 110 })
    expect(activeBeastRef(s.party)).toBe('b1')
    expect(countActive(s.party, 'beast')).toBe(1)
    setActiveBeast(s, { uid: 'b2', name: '玄龟', species: 'turtle', level: 2, maxHp: 300, hp: 300 })
    expect(activeBeastRef(s.party)).toBe('b2')
    expect(s.party.filter(m => m.kind === 'beast')).toHaveLength(1) // 名额为 1，旧的直接被顶掉
    setActiveBeast(s, null)
    expect(activeBeastRef(s.party)).toBeNull()
    expect(s.party.some(m => m.kind === 'beast')).toBe(false)
  })
})

describe('party · 队员装备页', () => {
  const item = (slot: string, atk: number, def: number, hp: number, enh = 0) => ({
    uid: `it_${slot}`, baseId: 'b', name: `${slot}装`, slot, quality: 1 as const,
    itemLevel: 5, atk, def, speed: 0, crit: 0, maxHp: hp, affixes: [], price: 10, enh,
  })

  it('新成员默认为空四槽与空功法槽', () => {
    const m = makeSisterMember('sword', 1)
    expect(MEMBER_SLOT_KEYS.every(s => m.equipment[s] === null)).toBe(true)
    expect(m.skillSlots.style).toBeNull()
    expect(m.skillSlots.minds).toEqual([null, null])
  })

  it('装备加成汇总：强化按 +2/级 折算，与玩家面板口径一致', () => {
    const m = makeSisterMember('sword', 1)
    m.equipment.weapon = item('weapon', 10, 0, 0, 3) as never // 攻 10 + 强化 3×2 = 16
    m.equipment.armor = item('armor', 0, 8, 40) as never
    const b = memberEquipBonus(m)
    expect(b.atk).toBe(16)
    // 强化每级同时 +2 攻 +2 防（与玩家装备面板 compareItems 口径一致），故武器强化也贡献 6 点防
    expect(b.def).toBe(14)
    expect(b.maxHp).toBe(40)
  })

  it('effectiveMaxHp = 基础气血 + 装备气血', () => {
    const m = makeSisterMember('sword', 1)
    const base = m.maxHp
    m.equipment.armor = item('armor', 0, 0, 60) as never
    expect(effectiveMaxHp(m)).toBe(base + 60)
  })

  it('授予装备返回被替换的旧件；卸下返回原件', () => {
    const m = makeSisterMember('sword', 1)
    const a = item('weapon', 5, 0, 0) as never
    const b = item('weapon', 9, 0, 0) as never
    expect(equipMemberItem(m, 'weapon', a)).toBeNull()
    expect(equipMemberItem(m, 'weapon', b)).toBe(a)
    expect(unequipMemberSlot(m, 'weapon')).toBe(b)
    expect(m.equipment.weapon).toBeNull()
  })

  it('规范化丢弃槽位不符的脏数据（饰品塞进武器槽）', () => {
    const eq = normalizeMemberEquipment({ weapon: item('charm', 1, 1, 1) })
    expect(eq.weapon).toBeNull()
  })

  it('规范化接受合法装备', () => {
    const eq = normalizeMemberEquipment({ weapon: item('weapon', 3, 0, 0) })
    expect(eq.weapon?.atk).toBe(3)
  })
})

describe('party · 队员功法槽', () => {
  it('四槽读写与去重：同一功法不占两槽', () => {
    const m = makeSisterMember('sword', 1)
    setMemberSkillSlot(m, 'style', 'sk_a')
    setMemberSkillSlot(m, 'mind0', 'sk_b')
    setMemberSkillSlot(m, 'mind1', 'sk_c')
    setMemberSkillSlot(m, 'art', 'sk_d')
    expect(getMemberSkillSlot(m, 'style')).toBe('sk_a')
    expect(getMemberSkillSlot(m, 'mind0')).toBe('sk_b')
    expect(getMemberSkillSlot(m, 'mind1')).toBe('sk_c')
    expect(getMemberSkillSlot(m, 'art')).toBe('sk_d')
    // 模拟 UI 的先清后装
    for (const s of MEMBER_SKILL_SLOTS) {
      if (s.key !== 'art' && getMemberSkillSlot(m, s.key) === 'sk_d') setMemberSkillSlot(m, s.key, null)
    }
    setMemberSkillSlot(m, 'art', 'sk_d')
    expect(MEMBER_SKILL_SLOTS.filter(s => getMemberSkillSlot(m, s.key) === 'sk_d')).toHaveLength(1)
  })

  it('normalizeParty 保留装备与功法槽', () => {
    const m = makeSisterMember('sword', 1)
    setMemberSkillSlot(m, 'art', 'sk_x')
    const out = normalizeParty([m])
    expect(getMemberSkillSlot(out[0], 'art')).toBe('sk_x')
    expect(out[0].equipment.weapon).toBeNull()
  })

  it('normalizeMemberSkillSlots 拒绝非法输入', () => {
    const s = normalizeMemberSkillSlots({ style: 123, minds: 'nope', art: null })
    expect(s.style).toBeNull()
    expect(s.minds).toEqual([null, null])
    expect(s.art).toBeNull()
  })
})

describe('party · 敌人索敌的承伤判定', () => {
  it('灵体护体（damageTakenRatio=0）不可被锁定；普通队员可', () => {
    const sister = makeSisterMember('sword', 1) // damageTakenRatio = 0
    const npc = makeCultivatorMember({ source: 'worldNpc', refId: 'npc_1', displayName: '乙', classId: 'mage' })
    // 场景侧判定口径：maxHp > 0 且 damageTakenRatio > 0
    const lockable = (m: typeof sister) => m.maxHp > 0 && m.damageTakenRatio > 0
    expect(lockable(sister)).toBe(false)
    expect(lockable(npc)).toBe(true)
  })
})

describe('party · 关键修复回归', () => {
  it('BUG 修复：v0.7 无法解散道友 —— 现在可移除', () => {
    const s = host([makeSisterMember('sword', 1)])
    expect(removeMemberFromState(s, 'sister')).toBe(true)
    expect(s.party).toHaveLength(0)
    expect(hasSectSibling(s.party)).toBe(false)
  })

  it('BUG 修复：道友与组队 NPC 可同时出战（旧实现互斥且 NPC 不参战）', () => {
    const s = host([makeSisterMember('sword', 1)])
    const res = addMemberToState(s, makeCultivatorMember({ source: 'worldNpc', refId: 'npc_1', displayName: '青玄子', classId: 'mage' }))
    expect(res.ok).toBe(true)
    expect(getActiveMembers(s.party)).toHaveLength(2)
  })

  it('名额上限：2 修士 + 1 灵兽 = 3 个单位', () => {
    const s = host([
      makeSisterMember('sword', 1),
      makeCultivatorMember({ source: 'worldNpc', refId: 'n1', displayName: '甲', classId: 'sword', joinedAt: 2 }),
    ])
    setActiveBeast(s, { uid: 'b1', name: '青狼', species: 'wolf', level: 1, maxHp: 100, hp: 100 })
    expect(getActiveMembers(s.party)).toHaveLength(3)
    expect(countActive(s.party, 'cultivator')).toBe(2)
    expect(countActive(s.party, 'beast')).toBe(1)
  })

  it('memberUid 格式稳定', () => {
    expect(memberUid('worldNpc', 'abc')).toBe('pm_worldNpc_abc')
  })
})
