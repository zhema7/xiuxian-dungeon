// ---------- 大地图类型与数据加载（五域系统） ----------

import worldMapJson from './data/world-map.json'
import worldMapCentralJson from './data/world-map-central.json'
import worldMapEastJson from './data/world-map-east.json'
import worldMapWestJson from './data/world-map-west.json'
import worldMapNorthJson from './data/world-map-north.json'

export type WorldPointType = 'home' | 'city' | 'dungeon' | 'resource' | 'teleport' | 'landmark' | 'sect' | 'domain_gate'
export type DomainId = 'south' | 'central' | 'east' | 'west' | 'north'

export interface DungeonEntryData {
  region: string
  startFloor: number
  difficulty: number
}

export interface WorldPoint {
  id: string
  name: string
  type: WorldPointType
  x: number
  y: number
  icon: string
  description: string
  domain: DomainId
  dungeonData?: DungeonEntryData
  resourceType?: string
  resourceLevel?: number
  unlockCondition?: { level?: number; realm?: number; questDone?: string } | null
  domainGateTarget?: DomainId
}

const ALL_POINTS: WorldPoint[] = [
  ...(worldMapJson as WorldPoint[]),
  ...(worldMapCentralJson as WorldPoint[]),
  ...(worldMapEastJson as WorldPoint[]),
  ...(worldMapWestJson as WorldPoint[]),
  ...(worldMapNorthJson as WorldPoint[]),
]

export const WORLD_POINTS: WorldPoint[] = ALL_POINTS

/** 各域地图尺寸（统一） */
export const WORLD_MAP_W = 1200
export const WORLD_MAP_H = 1700

/** 域定义 */
export interface DomainDef {
  id: DomainId
  name: string
  desc: string
  bgTint: number
}

export const DOMAINS: DomainDef[] = [
  { id: 'south', name: '南域', desc: '青冥山脚，初入修仙之地。气候温润，灵气稀薄。', bgTint: 0x1a3b2a },
  { id: 'central', name: '中域', desc: '苍玄界腹地，万宗林立，坊市繁华。修仙界的中心。', bgTint: 0x2a2a4a },
  { id: 'east', name: '东域', desc: '碧海苍梧，仙岛星罗。海族与修士共处之地。', bgTint: 0x1a3a4a },
  { id: 'west', name: '西域', desc: '大漠黄沙，古战场遗迹遍布。炼器材料丰富。', bgTint: 0x4a3a1a },
  { id: 'north', name: '北域', desc: '冰原万里，极寒之地。上古妖兽沉睡于此。', bgTint: 0x3a4a5a },
]

/** 获取某域的所有点位 */
export function getDomainPoints(domain: DomainId): WorldPoint[] {
  return ALL_POINTS.filter(p => p.domain === domain)
}

/** 获取域定义 */
export function getDomainDef(id: DomainId): DomainDef | undefined {
  return DOMAINS.find(d => d.id === id)
}

export function getPoint(id: string): WorldPoint | undefined {
  return ALL_POINTS.find(p => p.id === id)
}

export function isPointUnlocked(p: WorldPoint, s: {
  level: number
  realm: number
  progress: { qmCleared: boolean; ymCleared: boolean }
}): boolean {
  if (!p.unlockCondition) return true
  const c = p.unlockCondition
  if (c.level && s.level < c.level) return false
  if (c.realm && s.realm < c.realm) return false
  if (c.questDone === 'qmCleared' && !s.progress.qmCleared) return false
  if (c.questDone === 'ymCleared' && !s.progress.ymCleared) return false
  return true
}

/** 获取传送阵目标列表 */
export function getTeleportTargets(domain: DomainId): WorldPoint[] {
  return getDomainPoints(domain).filter(p => p.type === 'teleport')
}
