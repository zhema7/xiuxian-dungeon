// ---------- 大地图动态元素刷新框架 ----------
// 灵草、妖兽、传闻卷轴等可交互元素的生成与刷新

import type { GameState } from './state'
import { isNight, seasonOf, type WorldTime } from './world-time'

export type DynamicElementType =
  | 'herb'         // 灵草
  | 'ore'          // 矿石
  | 'beast'        // 妖兽
  | 'rumor'        // 传闻卷轴
  | 'insight'      // 悟道光晕
  | 'npc_encounter' // 路遇修士

export interface DynamicElement {
  id: string
  type: DynamicElementType
  x: number
  y: number
  domain: string
  // 数据
  itemId?: string    // 采集得到的物品ID
  itemName?: string
  monsterId?: string // 妖兽ID
  monsterLevel?: number
  rumorText?: string  // 传闻内容
  insightAmount?: number
  // 状态
  collected: boolean
  respawnTime: number  // 下次刷新时间戳
  spawnTime: number
}

export interface DynamicElementConfig {
  herbCount: number
  oreCount: number
  beastCount: number
  rumorCount: number
  insightCount: number
}

const DEFAULT_CONFIG: DynamicElementConfig = {
  herbCount: 8,
  oreCount: 5,
  beastCount: 6,
  rumorCount: 3,
  insightCount: 1,
}

const HERB_NAMES = ['灵芝', '人参果', '凤血草', '龙涎花', '九叶莲', '寒冰草', '紫韵藤', '黄精']
const ORE_NAMES = ['精铁', '寒铁', '灵铜', '玄银', '紫晶', '星陨铁', '太乙精金']
const RUMOR_TEXTS = [
  '据闻东域有古修洞府出世，入口在一处瀑布之后。',
  '北域雪峰下有人看到金光冲天，疑似有高人突破。',
  '西域荒漠中出现了魔修踪迹，多加小心。',
  '南域坊市有商人收购稀有灵草，价格不菲。',
  '有散修在中央大陆发现一处灵脉，消息尚未传开。',
  '近日有一邪修在此地出没，专劫散修，小心为上。',
  '听说月圆之夜，某处秘境入口将会开启。',
  '有位前辈陨落之地，其储物戒下落不明。',
]

export function refreshDynamicElements(
  state: GameState,
  playerX: number,
  playerY: number,
  domain: string,
  time: WorldTime,
  existingElements: DynamicElement[],
): DynamicElement[] {
  const season = seasonOf(time.month)
  const night = isNight(time)
  const config = { ...DEFAULT_CONFIG }

  // 季节修正
  if (season === '春') config.herbCount = Math.floor(config.herbCount * 1.5)
  if (season === '夏') config.beastCount = Math.floor(config.beastCount * 1.5)
  if (season === '秋') config.oreCount = Math.floor(config.oreCount * 1.3)
  if (season === '冬') { config.herbCount = Math.floor(config.herbCount * 0.5); config.insightCount = 2 }
  if (night) { config.beastCount = Math.floor(config.beastCount * 1.3); config.herbCount = Math.floor(config.herbCount * 0.7) }

  // 清理已采集且未到刷新时间的元素
  const now = Date.now()
  const active = existingElements.filter(e => {
    if (e.collected && now < e.respawnTime) return false
    return true
  })

  // 清除远离玩家的元素
  const nearby = active.filter(e => {
    const dx = e.x - playerX
    const dy = e.y - playerY
    return Math.sqrt(dx * dx + dy * dy) < 800
  })

  // 统计现有元素数量
  const counts: Record<DynamicElementType, number> = {
    herb: 0, ore: 0, beast: 0, rumor: 0, insight: 0, npc_encounter: 0,
  }
  for (const e of nearby) {
    if (!e.collected) counts[e.type]++
  }

  // 生成缺失元素
  const newElements: DynamicElement[] = [...nearby]
  let idCounter = existingElements.length

  const spawn = (type: DynamicElementType, count: number) => {
    for (let i = counts[type]; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = 150 + Math.random() * 600
      const x = Math.max(50, Math.min(1900, playerX + Math.cos(angle) * dist))
      const y = Math.max(50, Math.min(2750, playerY + Math.sin(angle) * dist))

      const elem: DynamicElement = {
        id: `de_${type}_${idCounter++}`,
        type,
        x: Math.floor(x),
        y: Math.floor(y),
        domain,
        collected: false,
        respawnTime: 0,
        spawnTime: now,
      }

      switch (type) {
        case 'herb':
          elem.itemId = `herb_${Math.floor(Math.random() * HERB_NAMES.length)}`
          elem.itemName = HERB_NAMES[Math.floor(Math.random() * HERB_NAMES.length)]
          elem.respawnTime = now + 24 * 60 * 60 * 1000 // 24小时后刷新
          break
        case 'ore':
          elem.itemId = `ore_${Math.floor(Math.random() * ORE_NAMES.length)}`
          elem.itemName = ORE_NAMES[Math.floor(Math.random() * ORE_NAMES.length)]
          elem.respawnTime = now + 48 * 60 * 60 * 1000
          break
        case 'beast':
          elem.monsterId = `beast_${Math.floor(Math.random() * 10)}`
          elem.monsterLevel = state.realm * 8 + Math.floor(Math.random() * 5)
          elem.respawnTime = now + 12 * 60 * 60 * 1000
          break
        case 'rumor':
          elem.rumorText = RUMOR_TEXTS[Math.floor(Math.random() * RUMOR_TEXTS.length)]
          break
        case 'insight':
          elem.insightAmount = 5 + Math.floor(Math.random() * 10)
          break
      }
      newElements.push(elem)
    }
  }

  spawn('herb', config.herbCount)
  spawn('ore', config.oreCount)
  spawn('beast', config.beastCount)
  spawn('rumor', config.rumorCount)
  spawn('insight', config.insightCount)

  return newElements
}

export function collectElement(elem: DynamicElement): { gold?: number; insight?: number; materials?: Record<string, number>; exp?: number; monsterLevel?: number } {
  elem.collected = true
  switch (elem.type) {
    case 'herb':
      return { materials: { [elem.itemId!]: 1 }, exp: 5 }
    case 'ore':
      return { materials: { [elem.itemId!]: 1 }, exp: 3 }
    case 'beast':
      return { monsterLevel: elem.monsterLevel, exp: 10 }
    case 'insight':
      return { insight: elem.insightAmount! }
    case 'rumor':
      return {}
    default:
      return {}
  }
}
