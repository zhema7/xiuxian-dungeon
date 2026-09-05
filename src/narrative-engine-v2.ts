// ---------- 程序化叙事引擎v2 ----------
// 人生事件日志 + 故事改写 + 动态剧情推进

import type { ProceduralNpc } from './procedural-npc'
import type { GameState } from './state'
import { getPlayerNpcRelation } from './npc-relation-net'

// ===== 人生事件类型 =====

export type LifeEventType =
  | 'breakthrough'      // 突破
  | 'defeat'           // 被击败
  | 'victory'          // 战胜对手
  | 'betrayal'         // 被背叛
  | 'betray'           // 背叛他人
  | 'loss'             // 失去亲人/道侣
  | 'gain'             // 获得传承/宝物
  | 'epiphany'         // 顿悟
  | 'heart_demon'      // 心魔
  | 'tribulation'      // 天劫
  | 'romance'          // 邂逅
  | 'disciple_taken'   // 被收为弟子
  | 'disciple_gained'  // 收到弟子
  | 'player_help'      // 被玩家帮助
  | 'player_harm'      // 被玩家伤害
  | 'player_kill'      // 被玩家所杀
  | 'player_save'      // 被玩家所救
  | 'friend_made'      // 结交好友
  | 'enemy_made'       // 树立敌人
  | 'sevent_change'    // 境界变化
  | 'treasure_found'   // 发现宝物
  | 'adventure'        // 冒险经历

export interface LifeEvent {
  type: LifeEventType
  time: number
  description: string
  impact: 'positive' | 'negative' | 'neutral'
  relationTargetId?: string
}

// ===== 记录人生事件 =====

export function recordLifeEvent(npc: ProceduralNpc, type: LifeEventType, description: string, impact: 'positive' | 'negative' | 'neutral' = 'neutral', relationTargetId?: string): void {
  if (!npc.eventLog) npc.eventLog = []

  const event: LifeEvent = {
    type,
    time: Date.now(),
    description,
    impact,
    relationTargetId,
  }

  npc.eventLog.push(description)

  // 重大事件影响NPC属性
  switch (type) {
    case 'breakthrough':
      npc.morality = Math.max(-100, Math.min(100, npc.morality + (Math.random() < 0.5 ? 2 : -2)))
      break
    case 'defeat':
      npc.morality = Math.max(-100, Math.min(100, npc.morality - 1))
      break
    case 'victory':
      npc.morality = Math.max(-100, Math.min(100, npc.morality + 1))
      break
    case 'player_help':
    case 'player_save':
      npc.morality = Math.max(-100, Math.min(100, npc.morality + 1))
      break
    case 'player_harm':
      npc.morality = Math.max(-100, Math.min(100, npc.morality - 2))
      break
    case 'heart_demon':
      npc.morality = Math.max(-100, Math.min(100, npc.morality - 5))
      break
    case 'epiphany':
      npc.morality = Math.max(-100, Math.min(100, npc.morality + 3))
      break
  }

  // 保持事件日志合理长度
  if (npc.eventLog.length > 50) {
    npc.eventLog = npc.eventLog.slice(-50)
  }
}

// ===== 玩家介入改写故事 =====

export interface StoryRewriteResult {
  originalStory: string
  newStory: string
  logMessage: string
  npcReaction: string
}

export function rewriteNpcStory(
  state: GameState,
  npc: ProceduralNpc,
  intervention: 'help' | 'harm' | 'avenge' | 'befriend' | 'recruit' | 'reveal_secret' | 'gift' | 'teach',
): StoryRewriteResult | null {
  const rel = getPlayerNpcRelation(state, npc.id)

  // 原始故事（来自NPC生成的story.surface）
  const originalStory = npc.story?.surface || `${npc.name}，${npc.background}，${npc.profession}。`

  let newStory = originalStory
  let logMessage = ''
  let npcReaction = ''

  switch (intervention) {
    case 'help': {
      recordLifeEvent(npc, 'player_help', '被玩家所救，感恩戴德', 'positive')
      logMessage = `玩家帮助了${npc.name}`
      npcReaction = `${npc.name}对你感激不已，誓言日后必报`
      newStory = `${originalStory}\n后来得道友所救，从此结下善缘。`
      if (rel) { rel.favor += 15; rel.trust += 8 }
      break
    }
    case 'harm': {
      recordLifeEvent(npc, 'player_harm', '被玩家伤害，怀恨在心', 'negative')
      logMessage = `玩家伤害了${npc.name}`
      npcReaction = `${npc.name}对你怀恨在心，可能伺机报复`
      newStory = `${originalStory}\n却遭道友暗算，心生怨恨。`
      if (rel) { rel.favor -= 20; rel.trust -= 15; rel.fear += 10 }
      break
    }
    case 'avenge': {
      recordLifeEvent(npc, 'victory', '玩家替其报仇雪恨', 'positive')
      logMessage = `玩家替${npc.name}报仇`
      npcReaction = `${npc.name}感你替他复仇，恩同再造`
      newStory = `${originalStory}\n幸得道友仗义援手，大仇得报。`
      if (rel) { rel.favor += 30; rel.trust += 20; rel.saved = true }
      break
    }
    case 'befriend': {
      recordLifeEvent(npc, 'friend_made', '与玩家结为好友', 'positive')
      logMessage = `${npc.name}与玩家结为好友`
      npcReaction = `${npc.name}与你结为好友，愿互帮互助`
      newStory = `${originalStory}\n后与一位道友结为莫逆之交。`
      if (rel) { rel.favor += 20; rel.trust += 10 }
      break
    }
    case 'recruit': {
      recordLifeEvent(npc, 'disciple_taken', '被玩家收为弟子', 'positive')
      logMessage = `${npc.name}拜入玩家门下`
      npcReaction = `${npc.name}拜入你的门下，成为弟子`
      newStory = `${originalStory}\n后拜入一位前辈门下，成为亲传弟子。`
      if (rel) { rel.favor += 25; rel.trust += 15 }
      break
    }
    case 'reveal_secret': {
      recordLifeEvent(npc, 'heart_demon', '秘密被玩家发现', 'negative')
      logMessage = `玩家发现了${npc.name}的秘密`
      npcReaction = `${npc.name}的秘密被你发现，对方神色复杂`
      newStory = `${originalStory}\n其隐藏的秘密终被人发现，命运由此转折。`
      if (rel) { rel.favor -= 5; rel.trust -= 10 }
      break
    }
    case 'gift': {
      recordLifeEvent(npc, 'gain', '收到玩家赠礼', 'positive')
      logMessage = `玩家赠送礼物给${npc.name}`
      npcReaction = `${npc.name}收到你的礼物，喜不自胜`
      newStory = `${originalStory}\n后得道友慷慨赠礼，修途更上一层。`
      if (rel) { rel.favor += 10; rel.trust += 5 }
      break
    }
    case 'teach': {
      recordLifeEvent(npc, 'epiphany', '得玩家指点修行', 'positive')
      logMessage = `玩家指点${npc.name}修行`
      npcReaction = `${npc.name}得到你的指点，受益匪浅`
      newStory = `${originalStory}\n后得道友指点，功法精进。`
      if (rel) { rel.favor += 12; rel.trust += 8 }
      break
    }
    default:
      return null
  }

  // 更新NPC故事
  if (npc.story) {
    npc.story.surface = newStory
  }

  return { originalStory, newStory, logMessage, npcReaction }
}

// ===== 获取NPC人生事件摘要 =====

export function getNpcLifeEvents(npc: ProceduralNpc): string[] {
  if (!npc.eventLog || npc.eventLog.length === 0) {
    return ['此人身世平淡，并无值得记载之事']
  }

  // 取最近10条事件
  const recent = npc.eventLog.slice(-10)

  // 如果事件太多，显示摘要
  if (npc.eventLog.length > 10) {
    return ['（更早的事件已被淡忘）', ...recent]
  }

  return recent
}

// ===== NPC自发事件（非玩家触发） =====

export function generateNpcSelfEvent(npc: ProceduralNpc, state: GameState): string | null {
  if (!npc.alive || !npc.isActive) return null

  const roll = Math.random()
  const realmNames = ['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫']

  // 突破事件
  if (roll < 0.02 && npc.realm < 7) {
    if (Math.random() < 0.3) {
      npc.realm++
      npc.maxHp += npc.realm * 50
      npc.hp = npc.maxHp
      npc.atk += npc.realm * 5
      recordLifeEvent(npc, 'breakthrough', `突破至${realmNames[npc.realm]}境`, 'positive')
      return `${npc.name}突破至${realmNames[npc.realm]}境！`
    } else {
      recordLifeEvent(npc, 'heart_demon', '突破失败，心魔入侵', 'negative')
      npc.hp = Math.max(1, npc.hp - Math.floor(npc.maxHp * 0.3))
      return `${npc.name}突破失败，修为受损`
    }
  }

  // 顿悟事件
  if (roll < 0.04 && roll >= 0.02) {
    recordLifeEvent(npc, 'epiphany', '静坐悟道，灵感涌现', 'positive')
    return `${npc.name}静坐悟道，若有所悟`
  }

  // 发现宝物
  if (roll < 0.05 && roll >= 0.04) {
    recordLifeEvent(npc, 'treasure_found', '在一处遗迹中发现宝物', 'positive')
    npc.inventory.gold = (npc.inventory.gold || 0) + 30 + npc.realm * 15
    return `${npc.name}在一处遗迹中寻得宝物`
  }

  // 遭遇险境
  if (roll < 0.06 && roll >= 0.05) {
    if (Math.random() < 0.4) {
      npc.hp = Math.max(1, npc.hp - Math.floor(npc.maxHp * 0.2))
      recordLifeEvent(npc, 'defeat', '历练时遭遇险境', 'negative')
      return `${npc.name}历练时遭遇险境，负伤而归`
    }
  }

  // 结交好友
  if (roll < 0.07 && roll >= 0.06) {
    recordLifeEvent(npc, 'friend_made', '结交了一位新道友', 'positive')
    return `${npc.name}结交了一位新道友`
  }

  return null
}

// ===== 每日NPC自发事件结算 =====

export function runDailyNpcEvents(state: GameState): string[] {
  const messages: string[] = []
  const npcs = state.proceduralNpcs.filter(n => n.alive && n.isActive)

  for (const npc of npcs) {
    const msg = generateNpcSelfEvent(npc, state)
    if (msg) messages.push(msg)
  }

  return messages
}
