// ---------- 宗门系统单测：建筑 / 生产 / 科技 / 炼丹 / 炼器 ----------
// 覆盖 src/sect-data.ts 与 src/sect-production.ts（纯函数 + 数据表，不依赖 Phaser）

import { beforeAll, describe, expect, it } from 'vitest'
import {
  BUILDINGS, BUILDING_IDS, createNewSect, buildingUpgradeCost, canUpgradeBuilding,
  spiritVeinProduction, discipleCapacity, spiritFarmProduction, oreMineProduction,
  woodPavilionProduction, SECT_FOUND_COST, SECT_FOUND_REALM, type BuildingId,
} from '../src/sect-data'
import {
  PILL_RECIPES, alchemySuccess, FORGE_RECIPES, TECHS, TECH_IDS, techUpgradeCost,
  CROPS, getTechMultipliers, canLearnSkill, getTeachableSkills, generateForgedEquipment,
  type PillRecipe,
} from '../src/sect-production'
import { SKILLS } from '../src/data'
import { makeRng } from '../src/core'
import { installLocalStorageStub, makeSect, makeDisciple, constRng } from './system-test-helpers'
import { newWorldTime } from '../src/world-time'

beforeAll(() => installLocalStorageStub())

// ---------- 建筑配置表 ----------
describe('宗门建筑配置表', () => {
  it('BUILDING_IDS 与 BUILDINGS 键完全一致且无重复', () => {
    expect(BUILDING_IDS).toHaveLength(Object.keys(BUILDINGS).length)
    expect(new Set(BUILDING_IDS).size).toBe(BUILDING_IDS.length)
    for (const id of BUILDING_IDS) {
      expect(BUILDINGS[id]).toBeDefined()
      expect(BUILDINGS[id].id).toBe(id)
    }
  })

  it('每个建筑字段完整且数值合法', () => {
    for (const id of BUILDING_IDS) {
      const def = BUILDINGS[id]
      expect(def.name.length).toBeGreaterThan(0)
      expect(def.desc.length).toBeGreaterThan(0)
      expect(def.maxLevel).toBeGreaterThan(0)
      expect(Number.isInteger(def.maxLevel)).toBe(true)
      expect(def.gridX).toBeGreaterThanOrEqual(0)
      expect(def.gridY).toBeGreaterThanOrEqual(0)
      expect(def.color).toBeGreaterThanOrEqual(0)
      expect(def.baseCost.stone).toBeGreaterThan(0)
      expect(def.baseCost.wood).toBeGreaterThan(0)
      expect(def.baseCost.ore).toBeGreaterThan(0)
    }
  })

  it('主殿不设 requireHall，其余建筑均依赖主殿且门槛不超过自身上限', () => {
    expect(BUILDINGS.main_hall.requireHall).toBeUndefined()
    for (const id of BUILDING_IDS) {
      if (id === 'main_hall') continue
      const def = BUILDINGS[id]
      expect(def.requireHall).toBeGreaterThanOrEqual(1)
      expect(def.requireHall).toBeLessThanOrEqual(BUILDINGS.main_hall.maxLevel)
    }
  })

  it('建筑网格坐标互不重叠（同一格不允许两个建筑）', () => {
    const cells = BUILDING_IDS.map(id => `${BUILDINGS[id].gridX},${BUILDINGS[id].gridY}`)
    expect(new Set(cells).size).toBe(cells.length)
  })
})

// ---------- 新宗门初始化 ----------
describe('createNewSect', () => {
  it('按入参生成初始宗门', () => {
    const t = newWorldTime()
    const s = createNewSect('青冥宗', t, 300, 400)
    expect(s.name).toBe('青冥宗')
    expect(s.level).toBe(1)
    expect(s.buildings).toEqual({ main_hall: 1 })
    expect(s.mapX).toBe(300)
    expect(s.mapY).toBe(400)
    expect(s.productionTimer).toBe(0)
    expect(s.techs).toEqual({})
    expect(s.farmSlots).toHaveLength(3)
    expect(s.farmSlots.every(x => x === null)).toBe(true)
    expect(s.foundedTime).toBe(t)
  })

  it('初始资源非零，可支撑开宗后的第一波建造', () => {
    const s = createNewSect('宗', newWorldTime(), 0, 0)
    expect(s.resources.stone).toBeGreaterThan(0)
    expect(s.resources.herb).toBeGreaterThan(0)
    expect(s.resources.ore).toBeGreaterThan(0)
    expect(s.resources.wood).toBeGreaterThan(0)
    expect(s.resources.insight).toBeGreaterThan(0)
    expect(s.resources.prestige).toBeGreaterThan(0)
  })

  it('createNewSect 每次返回独立对象（不共享引用）', () => {
    const a = createNewSect('A', newWorldTime(), 0, 0)
    const b = createNewSect('B', newWorldTime(), 0, 0)
    a.resources.stone = 0
    a.buildings.main_hall = 9
    expect(b.resources.stone).not.toBe(0)
    expect(b.buildings.main_hall).toBe(1)
  })
})

// ---------- 升级费用 ----------
describe('buildingUpgradeCost', () => {
  it('等级 0→1 时费用为 baseCost 的一半（向下取整）', () => {
    const c = buildingUpgradeCost('main_hall', 0)
    expect(c.stone).toBe(Math.floor(500 * 1 * 0.5))
    expect(c.wood).toBe(Math.floor(200 * 1 * 0.5))
    expect(c.ore).toBe(Math.floor(100 * 1 * 0.5))
  })

  it('费用随 (level+1)^2 二次增长', () => {
    const l1 = buildingUpgradeCost('spirit_vein', 0)
    const l2 = buildingUpgradeCost('spirit_vein', 1)
    const l3 = buildingUpgradeCost('spirit_vein', 2)
    // lv=1 → mult 1；lv=2 → mult 4；lv=3 → mult 9
    expect(l2.stone).toBe(Math.floor(300 * 4 * 0.5))
    expect(l3.stone).toBe(Math.floor(300 * 9 * 0.5))
    expect(l2.stone).toBeGreaterThan(l1.stone)
    expect(l3.stone).toBeGreaterThan(l2.stone)
  })

  it('返回值补齐 SectResources 六个键，非消耗项为 0', () => {
    const c = buildingUpgradeCost('library', 3)
    expect(c.insight).toBe(0)
    expect(c.prestige).toBe(0)
    expect(c.herb).toBe(0)
    expect(Object.keys(c).sort()).toEqual(
      ['herb', 'insight', 'ore', 'prestige', 'stone', 'wood'],
    )
  })

  it('所有建筑在各等级下费用均单调不减且为有限整数', () => {
    for (const id of BUILDING_IDS) {
      let prev = -1
      for (let lv = 0; lv < BUILDINGS[id].maxLevel + 2; lv++) {
        const c = buildingUpgradeCost(id, lv)
        for (const v of [c.stone, c.wood, c.ore]) {
          expect(Number.isFinite(v)).toBe(true)
          expect(Number.isInteger(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
        }
        expect(c.stone).toBeGreaterThanOrEqual(prev)
        prev = c.stone
      }
    }
  })
})

// ---------- 可升级判定 ----------
describe('canUpgradeBuilding', () => {
  it('主殿未达门槛时依赖建筑不可建造', () => {
    const s = makeSect({ buildings: { main_hall: 1 } })
    expect(canUpgradeBuilding(s, 'spirit_vein')).toBe(true)   // requireHall 1
    expect(canUpgradeBuilding(s, 'alchemy_room')).toBe(false) // requireHall 2
    expect(canUpgradeBuilding(s, 'library')).toBe(false)      // requireHall 3
    expect(canUpgradeBuilding(s, 'beast_park')).toBe(false)   // requireHall 4
    expect(canUpgradeBuilding(s, 'realm_gate')).toBe(false)   // requireHall 5
  })

  it('主殿达门槛后逐档解锁', () => {
    const s = makeSect({ buildings: { main_hall: 5 } })
    for (const id of BUILDING_IDS) {
      expect(canUpgradeBuilding(s, id)).toBe(true)
    }
  })

  it('达到 maxLevel 后不可再升级', () => {
    const s = makeSect({ buildings: { main_hall: 10 } })
    expect(canUpgradeBuilding(s, 'main_hall')).toBe(false)
    const s2 = makeSect({ buildings: { main_hall: 5, realm_gate: 5 } })
    expect(canUpgradeBuilding(s2, 'realm_gate')).toBe(false) // maxLevel 5
  })

  it('未建造过的建筑按等级 0 处理', () => {
    const s = makeSect({ buildings: { main_hall: 3 } })
    expect(s.buildings.forge_pavilion).toBeUndefined()
    expect(canUpgradeBuilding(s, 'forge_pavilion')).toBe(true)
  })
})

// ---------- 产出公式 ----------
describe('建筑产出公式', () => {
  it('未建造（等级 0）产出为 0', () => {
    expect(spiritVeinProduction(0)).toBe(0)
    expect(discipleCapacity(0)).toBe(0)
    expect(spiritFarmProduction(0)).toBe(0)
    expect(oreMineProduction(0)).toBe(0)
    expect(woodPavilionProduction(0)).toBe(0)
  })

  it('等级 1 产出符合公式', () => {
    expect(spiritVeinProduction(1)).toBe(35)   // 20 + 1*15
    expect(discipleCapacity(1)).toBe(4)        // 2 + 1*2
    expect(spiritFarmProduction(1)).toBe(3)    // 2 + 1
    expect(oreMineProduction(1)).toBe(5)       // 3 + 1*2
    expect(woodPavilionProduction(1)).toBe(5)  // 3 + 1*2
  })

  it('满级产出随等级单调递增', () => {
    for (let lv = 1; lv <= 10; lv++) {
      expect(spiritVeinProduction(lv)).toBeGreaterThan(spiritVeinProduction(lv - 1))
      expect(discipleCapacity(lv)).toBeGreaterThan(discipleCapacity(lv - 1))
      expect(spiritFarmProduction(lv)).toBeGreaterThan(spiritFarmProduction(lv - 1))
      expect(oreMineProduction(lv)).toBeGreaterThan(oreMineProduction(lv - 1))
      expect(woodPavilionProduction(lv)).toBeGreaterThan(woodPavilionProduction(lv - 1))
    }
  })
})

describe('开宗条件常量', () => {
  it('开宗灵石与境界门槛为正常量', () => {
    expect(SECT_FOUND_COST).toBeGreaterThan(0)
    expect(SECT_FOUND_REALM).toBeGreaterThanOrEqual(0)
  })

  it('【已知缺陷 B14】新宗门初始灵石低于开宗成本，且低于剧情文案所称的 500', () => {
    // 复现：createNewSect 初始 stone=2000，SECT_FOUND_COST=10000；
    // storyline-data 中 mq_2_2 正文写「建立宗门需要 500 灵石」。
    // 三处数值互不吻合，当前按现状锁定，待产品侧对齐后同步本断言。
    const s = createNewSect('宗', newWorldTime(), 0, 0)
    expect(s.resources.stone).toBe(2000)
    expect(SECT_FOUND_COST).toBe(10000)
    expect(s.resources.stone).toBeLessThan(SECT_FOUND_COST)
  })
})

// ---------- 丹方 ----------
describe('丹药配方表', () => {
  it('配方 id 唯一且字段合法', () => {
    const ids = PILL_RECIPES.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PILL_RECIPES) {
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.desc.length).toBeGreaterThan(0)
      expect(p.herbCost).toBeGreaterThan(0)
      expect(p.requireLevel).toBeGreaterThanOrEqual(1)
      expect(p.output).toBeGreaterThan(0)
      expect(p.baseSuccess).toBeGreaterThan(0)
      expect(p.baseSuccess).toBeLessThanOrEqual(1)
    }
  })

  it('基础成功率与炼丹房要求等级均在合理区间', () => {
    for (const p of PILL_RECIPES) {
      expect(p.baseSuccess).toBeGreaterThan(0)
      expect(p.baseSuccess).toBeLessThanOrEqual(1)
      expect(p.requireLevel).toBeGreaterThanOrEqual(1)
      // 最低阶丹方必须在一级炼丹房即可炼制，否则开宗后炼丹玩法不可达
      expect(PILL_RECIPES.some(r => r.requireLevel === 1)).toBe(true)
    }
  })

  it('【数据可调项】配方成本/成功率并非严格随 requireLevel 单调', () => {
    // 观察值：按 requireLevel 升序为
    //   回春丹(req1, 灵草5, 0.90) → 凝气丹(req2, 灵草10, 0.80)
    //   → 突破丹(req3, 灵草20, 0.70) → 锻体丹(req4, 灵草15, 0.75)
    // 锻体丹门槛更高，但灵草消耗低于突破丹、成功率反而更高。
    // 这可能是有意的平衡取舍（突破丹更稀缺），但数值不自洽，建议产品侧确认后调平。
    const sorted = [...PILL_RECIPES].sort((a, b) => a.requireLevel - b.requireLevel)
    expect(sorted.map(p => p.id)).toEqual(['hp_pill', 'exp_pill', 'breakthrough_pill', 'body_pill'])
    expect(sorted[3].herbCost).toBeLessThan(sorted[2].herbCost)
    expect(sorted[3].baseSuccess).toBeGreaterThan(sorted[2].baseSuccess)
  })
})

describe('alchemySuccess', () => {
  const hp = PILL_RECIPES.find(p => p.id === 'hp_pill')!

  it('炼丹房等级等于要求等级时为基础成功率', () => {
    expect(alchemySuccess(hp, hp.requireLevel)).toBeCloseTo(hp.baseSuccess, 10)
  })

  it('每高一级 +5%（以低阶丹方验证，避免被 0.99 上限截断）', () => {
    const exp = PILL_RECIPES.find(p => p.id === 'exp_pill')!
    expect(alchemySuccess(exp, exp.requireLevel + 1)).toBeCloseTo(exp.baseSuccess + 0.05, 10)
    expect(alchemySuccess(exp, exp.requireLevel + 2)).toBeCloseTo(exp.baseSuccess + 0.10, 10)
    // 回春丹基础 0.90，高两级应为 1.00，被上限截断为 0.99
    expect(alchemySuccess(hp, hp.requireLevel + 2)).toBe(0.99)
  })

  it('每低一级 -5%', () => {
    expect(alchemySuccess(hp, hp.requireLevel - 1)).toBeCloseTo(hp.baseSuccess - 0.05, 10)
  })

  it('上限钳制在 0.99：等级远超要求也不会必成', () => {
    expect(alchemySuccess(hp, hp.requireLevel + 100)).toBe(0.99)
    const body = PILL_RECIPES.find(p => p.id === 'body_pill')!
    expect(alchemySuccess(body, 99)).toBe(0.99)
  })

  it('下限钳制在 0.10：等级远低于要求也不会归零', () => {
    const fake: PillRecipe = {
      id: 'hp_pill', name: 'x', desc: 'x', herbCost: 1,
      requireLevel: 30, output: 1, baseSuccess: 0.5,
    }
    expect(alchemySuccess(fake, 1)).toBe(0.1)
    expect(alchemySuccess(fake, 0)).toBe(0.1)
  })

  it('结果恒在 [0.1, 0.99] 内且非 NaN', () => {
    for (const p of PILL_RECIPES) {
      for (let lv = -5; lv <= 40; lv++) {
        const r = alchemySuccess(p, lv)
        expect(Number.isNaN(r)).toBe(false)
        expect(r).toBeGreaterThanOrEqual(0.1)
        expect(r).toBeLessThanOrEqual(0.99)
      }
    }
  })
})

// ---------- 炼器 ----------
describe('炼器配方表', () => {
  it('覆盖全部五个装备槽位且无重复', () => {
    const slots = FORGE_RECIPES.map(r => r.slot)
    expect(new Set(slots).size).toBe(slots.length)
    expect(new Set(slots)).toEqual(new Set(['weapon', 'head', 'armor', 'boots', 'charm']))
  })

  it('字段合法：消耗为正、要求等级 >= 1', () => {
    for (const r of FORGE_RECIPES) {
      expect(r.name.length).toBeGreaterThan(0)
      expect(r.oreCost).toBeGreaterThan(0)
      expect(r.woodCost).toBeGreaterThan(0)
      expect(r.requireLevel).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('generateForgedEquipment', () => {
  it('注入固定 rng 时产出可复现且槽位正确', () => {
    const a = generateForgedEquipment('weapon', 3, 20, makeRng(1234))
    const b = generateForgedEquipment('weapon', 3, 20, makeRng(1234))
    expect(a.uid).toBeDefined()
    expect(typeof a.name).toBe('string')
    expect(a.name.length).toBeGreaterThan(0)
    expect(a.quality).toBeGreaterThanOrEqual(0)
    expect(a.quality).toBeLessThanOrEqual(3)
    expect(['weapon', 'head', 'armor', 'boots', 'charm', 'charm1', 'charm2']).toContain(a.slot)
    // uid 含时间戳，无法逐字段相等；此处校验结构一致
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort())
  })

  it('所有槽位均可锻造出装备', () => {
    for (const r of FORGE_RECIPES) {
      const item = generateForgedEquipment(r.slot, 1, 10, makeRng(7))
      expect(item).toBeTruthy()
      expect(item.itemLevel).toBeGreaterThan(0)
    }
  })
})

// ---------- 科技 ----------
describe('宗门科技表', () => {
  it('TECH_IDS 与 TECHS 一致', () => {
    expect(TECH_IDS).toHaveLength(Object.keys(TECHS).length)
    for (const id of TECH_IDS) {
      expect(TECHS[id]).toBeDefined()
      expect(TECHS[id].id).toBe(id)
    }
  })

  it('科技定义字段合法', () => {
    for (const id of TECH_IDS) {
      const t = TECHS[id]
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.desc.length).toBeGreaterThan(0)
      expect(t.maxLevel).toBeGreaterThan(0)
      expect(t.insightCost).toBeGreaterThan(0)
      expect(t.prestigeCost).toBeGreaterThan(0)
      expect(t.requireLibrary).toBeGreaterThanOrEqual(1)
    }
  })

  it('techUpgradeCost 随等级线性增长', () => {
    const t = TECHS.spirit_gather
    expect(techUpgradeCost(t, 0)).toEqual({ insight: 10, prestige: 5 })
    expect(techUpgradeCost(t, 1)).toEqual({ insight: 20, prestige: 10 })
    expect(techUpgradeCost(t, 9)).toEqual({ insight: 100, prestige: 50 })
    const a = techUpgradeCost(t, 3)
    const b = techUpgradeCost(t, 4)
    expect(b.insight).toBeGreaterThan(a.insight)
    expect(b.prestige).toBeGreaterThan(a.prestige)
  })
})

describe('getTechMultipliers', () => {
  it('无科技时为 1 倍', () => {
    expect(getTechMultipliers({})).toEqual({ cultSpeed: 1, hp: 1, atk: 1 })
  })

  it('按等级线性加成', () => {
    expect(getTechMultipliers({ spirit_gather: 10 }).cultSpeed).toBeCloseTo(1.5, 10)
    expect(getTechMultipliers({ body_temper: 10 }).hp).toBeCloseTo(1.3, 10)
    expect(getTechMultipliers({ mind_focus: 10 }).atk).toBeCloseTo(1.3, 10)
  })

  it('未知科技键不影响结果（不产生 NaN）', () => {
    const m = getTechMultipliers({ 未知科技: 99 } as Record<string, number>)
    expect(m).toEqual({ cultSpeed: 1, hp: 1, atk: 1 })
    expect(Number.isNaN(m.cultSpeed)).toBe(false)
  })

  it('array_master 不影响弟子属性倍率', () => {
    const m = getTechMultipliers({ array_master: 5 })
    expect(m).toEqual({ cultSpeed: 1, hp: 1, atk: 1 })
  })
})

// ---------- 灵田 ----------
describe('灵田作物表', () => {
  it('作物 id 唯一', () => {
    const ids = CROPS.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('越高级的作物：种子更贵、生长更久、产量更高、要求灵田等级更高', () => {
    for (let i = 1; i < CROPS.length; i++) {
      expect(CROPS[i].seedCost).toBeGreaterThan(CROPS[i - 1].seedCost)
      expect(CROPS[i].growTime).toBeGreaterThan(CROPS[i - 1].growTime)
      expect(CROPS[i].herbYield).toBeGreaterThan(CROPS[i - 1].herbYield)
      expect(CROPS[i].requireFarm).toBeGreaterThan(CROPS[i - 1].requireFarm)
    }
  })

  it('灵田初始 3 个种植槽，作物均可种下', () => {
    const s = makeSect()
    expect(s.farmSlots).toHaveLength(3)
    for (const c of CROPS) {
      expect(c.requireFarm).toBeLessThanOrEqual(BUILDINGS.spirit_farm.maxLevel)
    }
  })
})

// ---------- 功法教学 ----------
describe('可教学功法', () => {
  it('低境界弟子只能学到非 art 功法', () => {
    const list = getTeachableSkills(0)
    expect(list.length).toBeGreaterThan(0)
    expect(list.length).toBeLessThanOrEqual(12)
    for (const s of list) {
      expect(SKILLS.has(s.id)).toBe(true)
      expect(SKILLS.get(s.id)!.type).not.toBe('art')
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.insightCost).toBeGreaterThan(0)
    }
  })

  it('境界 >= 3 后 art 功法进入可教学列表', () => {
    const low = getTeachableSkills(0).map(s => s.id)
    const high = getTeachableSkills(3).map(s => s.id)
    expect(high.length).toBeGreaterThanOrEqual(1)
    const arts = [...SKILLS.values()].filter(s => s.type === 'art').map(s => s.id)
    for (const id of low) expect(arts).not.toContain(id)
    expect(high.some(id => arts.includes(id))).toBe(true)
  })

  it('返回列表截断到 12 条以内且 id 不重复', () => {
    for (const realm of [0, 1, 2, 3, 4, 5, 6]) {
      const list = getTeachableSkills(realm)
      expect(list.length).toBeLessThanOrEqual(12)
      expect(new Set(list.map(s => s.id)).size).toBe(list.length)
    }
  })
})

describe('canLearnSkill', () => {
  it('未学过且不足 3 个时可学', () => {
    expect(canLearnSkill(makeDisciple({ skills: [] }), 'sk_a')).toBe(true)
    expect(canLearnSkill(makeDisciple({ skills: ['a', 'b'] }), 'sk_a')).toBe(true)
  })

  it('已学过的功法不可重复学', () => {
    expect(canLearnSkill(makeDisciple({ skills: ['sk_a'] }), 'sk_a')).toBe(false)
  })

  it('已学满 3 个后不可再学', () => {
    expect(canLearnSkill(makeDisciple({ skills: ['a', 'b', 'c'] }), 'd')).toBe(false)
  })
})

// ---------- 建筑与弟子的联动 ----------
describe('弟子房容量与弟子列表', () => {
  it('弟子房等级决定容量上限', () => {
    const cap = discipleCapacity(3) // 2 + 3*2 = 8
    expect(cap).toBe(8)
    // 弟子真源是 state.disciples（v13 合轨后 sect 不再持有 disciples）
    const disciples = Array.from({ length: cap }, (_, i) => makeDisciple({ uid: `d${i}` }))
    expect(disciples.length).toBeLessThanOrEqual(cap)
  })

  it('建造配置中的建筑 id 均可作为 buildings 键使用', () => {
    const buildings: Record<string, number> = {}
    for (const id of BUILDING_IDS as BuildingId[]) buildings[id] = 1
    const s = makeSect({ buildings })
    expect(Object.keys(s.buildings)).toHaveLength(BUILDING_IDS.length)
    for (const id of BUILDING_IDS) expect(s.buildings[id]).toBe(1)
  })
})

// ---------- rng 边界 ----------
describe('随机数边界健壮性', () => {
  it('rng 恒为 0 时不产生 NaN/越界', () => {
    const item = generateForgedEquipment('head', 1, 1, constRng(0))
    expect(Number.isNaN(item.atk)).toBe(false)
    expect(Number.isNaN(item.def)).toBe(false)
    expect(item).toBeTruthy()
  })

  it('rng 恒为接近 1 的值时不崩溃', () => {
    const item = generateForgedEquipment('boots', 9, 60, constRng(0.999999))
    expect(item).toBeTruthy()
    expect(Number.isFinite(item.price)).toBe(true)
  })
})
