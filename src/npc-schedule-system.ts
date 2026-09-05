// ---------- NPC日程表增强系统 ----------
// NPC按日程移动+行为：修炼/交易/休息/探索/访友

import type { ProceduralNpc, NpcSchedule } from './procedural-npc'
import type { GameState } from './state'
import { WORLD_MAP_W, WORLD_MAP_H } from './world-map'

// ===== 日程行为类型 =====

export type ScheduleAction =
  | 'cultivate'    // 修炼
  | 'explore'      // 探索
  | 'trade'        // 交易
  | 'rest'         // 休息
  | 'socialize'    // 社交访友
  | 'gather'       // 采集
  | 'hunt'         // 狩猎妖兽
  | 'meditate'     // 静坐悟道
  | 'travel'       // 赶路
  | 'patrol'       // 巡逻

export interface ScheduleSlot {
  action: ScheduleAction
  x: number
  y: number
  label: string
}

// ===== 根据NPC属性生成日程行为 =====

export function generateNpcScheduleSlots(npc: ProceduralNpc): { morning: ScheduleSlot; afternoon: ScheduleSlot; night: ScheduleSlot } {
  const baseX = npc.location.x
  const baseY = npc.location.y

  // 性格影响行为偏好
  const isWarlike = npc.personality.includes('好战')
  const isGreedy = npc.personality.includes('贪婪')
  const isTranquil = npc.personality.includes('淡泊') || npc.personality.includes('孤僻')
  const isSocial = npc.personality.includes('热情')

  // 上午：修炼 or 采集
  const morningAction: ScheduleAction = isTranquil ? 'cultivate' : isWarlike ? 'gather' : 'explore'
  const morning = makeSlot(morningAction, baseX, baseY, npc)

  // 下午：交易 or 狩猎 or 探索
  const afternoonAction: ScheduleAction = isGreedy ? 'trade' : isWarlike ? 'hunt' : 'explore'
  const afternoon = makeSlot(afternoonAction, baseX + (Math.random() - 0.5) * 200, baseY + (Math.random() - 0.5) * 200, npc)

  // 夜晚：休息 or 修炼
  const nightAction: ScheduleAction = isSocial ? 'socialize' : 'rest'
  const night = makeSlot(nightAction, baseX, baseY, npc)

  return { morning, afternoon, night }
}

function makeSlot(action: ScheduleAction, x: number, y: number, npc: ProceduralNpc): ScheduleSlot {
  const cx = Math.max(30, Math.min(WORLD_MAP_W - 30, Math.floor(x)))
  const cy = Math.max(30, Math.min(WORLD_MAP_H - 30, Math.floor(y)))
  const labels: Record<ScheduleAction, string> = {
    cultivate: '闭关修炼', explore: '外出游历', trade: '坊市交易',
    rest: '歇息打坐', socialize: '访友论道', gather: '采集灵药',
    hunt: '狩猎妖兽', meditate: '静坐悟道', travel: '赶路', patrol: '巡视领地',
  }
  return { action, x: cx, y: cy, label: labels[action] }
}

// ===== 获取当前时段 =====

export function getCurrentSlot(worldTimeHour: number): 'morning' | 'afternoon' | 'night' {
  if (worldTimeHour >= 5 && worldTimeHour < 12) return 'morning'
  if (worldTimeHour >= 12 && worldTimeHour < 19) return 'afternoon'
  return 'night'
}

// ===== 按日程更新NPC位置 =====

export function updateNpcBySchedule(npc: ProceduralNpc, worldTimeHour: number): ScheduleAction {
  const slots = generateNpcScheduleSlots(npc)
  const period = getCurrentSlot(worldTimeHour)
  const slot = slots[period]

  // 缓慢移动到日程位置
  const dx = slot.x - npc.location.x
  const dy = slot.y - npc.location.y
  const dist = Math.hypot(dx, dy)

  if (dist > 5) {
    const speed = 0.3
    npc.location.x += (dx / dist) * speed
    npc.location.y += (dy / dist) * speed
  }

  // 更新当前目的描述
  npc.currentPurpose = slot.label

  return slot.action
}

// ===== 行为效果 =====

export function applyScheduleEffect(npc: ProceduralNpc, action: ScheduleAction, deltaMs: number): string | null {
  // 每10秒结算一次行为效果
  const minutes = deltaMs / 60000

  switch (action) {
    case 'cultivate': {
      // 修炼：缓慢恢复HP+微量经验
      npc.hp = Math.min(npc.maxHp, npc.hp + Math.floor(npc.maxHp * 0.01 * minutes))
      if (Math.random() < 0.005 * minutes) {
        const expGain = Math.floor(5 + npc.realm * 3)
        return `${npc.name}修炼有所悟，获得${expGain}点经验`
      }
      break
    }
    case 'meditate': {
      // 悟道：极低概率顿悟
      if (Math.random() < 0.002 * minutes) {
        return `${npc.name}静坐悟道，灵感涌现`
      }
      break
    }
    case 'gather': {
      // 采集：有概率获得材料
      if (Math.random() < 0.01 * minutes) {
        const materials = ['herb_grass', 'herb_lotus', 'ore_iron', 'ore_silver']
        const mat = materials[Math.floor(Math.random() * materials.length)]
        npc.inventory[mat] = (npc.inventory[mat] || 0) + 1
        return `${npc.name}采集到了一些材料`
      }
      break
    }
    case 'hunt': {
      // 狩猎：有概率受伤或获得掉落
      if (Math.random() < 0.008 * minutes) {
        if (Math.random() < 0.3) {
          npc.hp = Math.max(1, npc.hp - Math.floor(npc.maxHp * 0.1))
          return `${npc.name}狩猎时受伤`
        } else {
          npc.inventory.gold = (npc.inventory.gold || 0) + Math.floor(10 + Math.random() * 50)
          return `${npc.name}狩猎有所收获`
        }
      }
      break
    }
    case 'trade': {
      // 交易：获得灵石
      if (Math.random() < 0.015 * minutes) {
        const gold = Math.floor(5 + Math.random() * 30 + npc.realm * 5)
        npc.inventory.gold = (npc.inventory.gold || 0) + gold
        return `${npc.name}完成一笔交易，赚得${gold}灵石`
      }
      break
    }
    case 'rest': {
      // 休息：恢复HP
      npc.hp = Math.min(npc.maxHp, npc.hp + Math.floor(npc.maxHp * 0.02 * minutes))
      break
    }
  }

  return null
}

// ===== 获取NPC可见行为描述 =====

export function getNpcActivityDesc(npc: ProceduralNpc, worldTimeHour: number): string {
  const slots = generateNpcScheduleSlots(npc)
  const period = getCurrentSlot(worldTimeHour)
  const slot = slots[period]
  return slot.label
}
