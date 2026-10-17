// ---------- 玩家可见文案的中文标签单测 ----------
// 目的：锁住「内部 key/id 不得进入玩家文案」这条约定。
// 任何新增资源/材料/建筑/势力 key 若忘了登记中文名，兜底值也必须仍是中文。

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resourceLabel, materialLabel, buildingLabel, sectLabel, primitiveLabel, PRIMITIVE_LABELS } from '../src/labels'
import type { GameState } from '../src/state'
import type { KitPrimitive } from '../src/data'

const LATIN = /[A-Za-z_]/

const fakeState = {
  aiSects: [
    { id: 'ai_sect_0', name: '太虚剑宗' },
    { id: 'ai_sect_4', name: '丹霞谷' },
  ],
} as unknown as GameState

describe('labels：资源/材料/建筑/势力中文标签', () => {
  it('资源 key 有中文名', () => {
    expect(resourceLabel('stone')).toBe('灵石')
    expect(resourceLabel('herb')).toBe('灵草')
    expect(resourceLabel('ore')).toBe('矿石')
    expect(resourceLabel('wood')).toBe('木材')
    expect(resourceLabel('insight')).toBe('悟道点')
    expect(resourceLabel('prestige')).toBe('声望')
  })

  it('材料 key 有中文名', () => {
    expect(materialLabel('tupo')).toBe('突破石')
    expect(materialLabel('lingcao')).toBe('灵草')
    expect(materialLabel('herb_lotus')).toBe('九叶莲')
    expect(materialLabel('beast_core')).toBe('妖兽内丹')
  })

  it('建筑 id 有中文名', () => {
    expect(buildingLabel('spirit_vein')).toBe('灵脉阵')
    expect(buildingLabel('wood_pavilion')).toBe('灵木林')
  })

  it('势力名：player 用你方，AI 宗门用宗门名', () => {
    expect(sectLabel(fakeState, 'player')).toBe('你方')
    expect(sectLabel(fakeState, 'ai_sect_4')).toBe('丹霞谷')
    expect(sectLabel(fakeState, 'ai_sect_gone')).toBe('未知宗门')
  })

  it('未知 key 的兜底值不得含英文字母（防止 wood×63 / ai_sect_4 类泄漏回归）', () => {
    const fallbacks = [
      resourceLabel('stone_deposit_x'),
      materialLabel('some_new_material'),
      buildingLabel('some_new_building'),
      sectLabel(fakeState, 'some_new_sect_id'),
    ]
    for (const f of fallbacks) {
      expect(LATIN.test(f)).toBe(false)
      expect(f.length).toBeGreaterThan(0)
    }
  })
})

describe('labels：v4 套装战斗原语中文标签', () => {
  // KitPrimitive 全量取值（data.ts:263）。新增原语而忘记登记中文名时此测试会失败。
  const ALL_PRIMITIVES: KitPrimitive[] = [
    'roundtrip', 'refract', 'mark', 'fixedpoint',
    'thundernet', 'thunderstake', 'charge', 'boomerang',
  ]

  it('八个原语都有中文名且不含英文字母', () => {
    for (const p of ALL_PRIMITIVES) {
      const label = primitiveLabel(p)
      expect(LATIN.test(label)).toBe(false)
      expect(label.length).toBeGreaterThan(0)
    }
  })

  it('八个原语中文名互不重复', () => {
    const names = ALL_PRIMITIVES.map((p) => primitiveLabel(p))
    expect(new Set(names).size).toBe(names.length)
  })

  it('原语表覆盖 KitPrimitive 全量取值（防漏登记）', () => {
    for (const p of ALL_PRIMITIVES) expect(PRIMITIVE_LABELS[p]).toBeTruthy()
    // 反向：表里有、但类型里没有的冗余项（允许，但提示同步）
    for (const k of Object.keys(PRIMITIVE_LABELS)) {
      expect(ALL_PRIMITIVES).toContain(k)
    }
  })

  it('空值/未知原语兜底为中文', () => {
    expect(LATIN.test(primitiveLabel(null))).toBe(false)
    expect(LATIN.test(primitiveLabel('some_new_primitive'))).toBe(false)
  })

  it('v4 三十套的招式/神通原语都能落到中文（防 boomerang 类英文回归）', () => {
    const raw = readFileSync(resolve(__dirname, '../src/data/v4-kits.json'), 'utf8')
    const kits = JSON.parse(raw) as Array<{ kitId: string; normalPrimitive: string; artPrimitive: string }>
    expect(kits.length).toBeGreaterThan(0)
    for (const k of kits) {
      expect(LATIN.test(primitiveLabel(k.normalPrimitive))).toBe(false)
      expect(LATIN.test(primitiveLabel(k.artPrimitive))).toBe(false)
    }
  })
})
