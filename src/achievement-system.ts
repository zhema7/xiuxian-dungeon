// ---------- 成就系统 ----------

import type { GameState } from './state'
import { REALMS } from './data'
import { toast } from './ui'
import { sfx } from './audio'
import { saveGame } from './state'
import { calcSectPower } from './ai-sect-data'
import { sectDisciplePower } from './disciple-data'
// 用于把「完成全部主线任务」的门槛绑定到主线表长度，避免数据表增删后再次失同步（缺陷 B1）
import { MAIN_QUESTS } from './storyline-data'

/** 成就类别 */
export type AchievementCategory = 'combat' | 'exploration' | 'sect' | 'collection' | 'special'

/** 成就条件类型 */
export type AchievementCondType =
  | 'level'
  | 'realm'
  | 'kills'
  | 'dungeon_clears'
  | 'gold_earned'
  | 'sect_wars_won'
  | 'vassal_count'
  | 'disciple_count'
  | 'sect_power'
  | 'domains_explored'
  | 'main_quests'
  | 'pvp_rank'
  | 'enemy_defeated'

/** 成就定义 */
export interface AchievementDef {
  id: string
  name: string
  desc: string
  category: AchievementCategory
  icon: string
  condition: { type: AchievementCondType; target: number }
  reward: {
    gold?: number
    insight?: number
    prestige?: number
    skillPoint?: number
  }
}

/** 成就配置表
 *
 * 擂台段位语义（与 CityScene.RANK_NAMES 一致）：
 *   0=初入擂台 1=铜牌斗士 2=银牌斗士 3=金牌斗士 4=王者斗士
 * 即 arenaRank 越大段位越高，且取值恒在 [0, 4]（DungeonScene 晋升时以 arenaRank < 4 为上限）。
 * 因此 pvp_rank 类成就的 target 是「段位档位」而非名次，必须落在 [0, 4] 内，
 * 否则会出现不可达（target > 4）或语义反转（target 过小）的问题。
 * 注意：pvp_5 / pvp_1 这两个 id 是历史遗留命名，已不再等于其 target，
 * 为保证旧存档 achievementsUnlocked 兼容而保留，请勿据 id 反推门槛。
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  // 战斗类
  { id: 'kill_100', name: '初露锋芒', desc: '累计击杀 100 个敌人', category: 'combat', icon: '⚔️',
    condition: { type: 'kills', target: 100 }, reward: { gold: 500 } },
  { id: 'kill_500', name: '百战不殆', desc: '累计击杀 500 个敌人', category: 'combat', icon: '⚔️',
    condition: { type: 'kills', target: 500 }, reward: { gold: 2000, insight: 5 } },
  { id: 'kill_2000', name: '杀伐之道', desc: '累计击杀 2000 个敌人', category: 'combat', icon: '⚔️',
    condition: { type: 'kills', target: 2000 }, reward: { gold: 10000, insight: 20 } },
  { id: 'dungeon_10', name: '秘境行者', desc: '通关秘境 10 次', category: 'combat', icon: '🏰',
    condition: { type: 'dungeon_clears', target: 10 }, reward: { gold: 1000 } },
  { id: 'dungeon_50', name: '秘境征服者', desc: '通关秘境 50 次', category: 'combat', icon: '🏰',
    condition: { type: 'dungeon_clears', target: 50 }, reward: { gold: 5000, insight: 10 } },
  { id: 'dungeon_100', name: '秘境之主', desc: '通关秘境 100 次', category: 'combat', icon: '🏰',
    condition: { type: 'dungeon_clears', target: 100 }, reward: { gold: 20000, skillPoint: 1 } },
  { id: 'war_1', name: '宗门首战', desc: '赢得 1 次宗门战争', category: 'combat', icon: '🗡️',
    condition: { type: 'sect_wars_won', target: 1 }, reward: { prestige: 20 } },
  { id: 'war_5', name: '战争之王', desc: '赢得 5 次宗门战争', category: 'combat', icon: '🗡️',
    condition: { type: 'sect_wars_won', target: 5 }, reward: { prestige: 50, insight: 10 } },
  // target 为段位档位，不是名次：1 = 铜牌斗士（第 2 档），早期可达的擂台目标（缺陷 B2）
  { id: 'pvp_5', name: '擂台新秀', desc: '擂台段位达到铜牌斗士', category: 'combat', icon: '🥊',
    condition: { type: 'pvp_rank', target: 1 }, reward: { gold: 3000 } },
  // target 为段位档位：4 = 王者斗士，即最高段位（缺陷 B3，旧值 1 导致刚升铜牌即拿到）
  { id: 'pvp_1', name: '天下第一', desc: '擂台段位达到王者斗士（最高段位）', category: 'combat', icon: '🥊',
    condition: { type: 'pvp_rank', target: 4 }, reward: { gold: 50000, skillPoint: 2 } },

  // 探索类
  { id: 'domain_3', name: '游历四方', desc: '探索 3 个地域', category: 'exploration', icon: '🗺️',
    condition: { type: 'domains_explored', target: 3 }, reward: { gold: 1000 } },
  { id: 'domain_5', name: '五域行者', desc: '探索全部五域', category: 'exploration', icon: '🗺️',
    condition: { type: 'domains_explored', target: 5 }, reward: { gold: 5000, insight: 15 } },
  { id: 'level_30', name: '小有所成', desc: '角色达到 30 级', category: 'exploration', icon: '⭐',
    condition: { type: 'level', target: 30 }, reward: { gold: 2000 } },
  { id: 'level_60', name: '修为精深', desc: '角色达到 60 级', category: 'exploration', icon: '⭐',
    condition: { type: 'level', target: 60 }, reward: { gold: 10000, skillPoint: 1 } },
  { id: 'level_90', name: '登峰造极', desc: '角色达到 90 级', category: 'exploration', icon: '⭐',
    condition: { type: 'level', target: 90 }, reward: { gold: 50000, skillPoint: 2 } },

  // 宗门类
  { id: 'sect_create', name: '开宗立派', desc: '建立宗门', category: 'sect', icon: '🏯',
    condition: { type: 'sect_power', target: 200 }, reward: { prestige: 10 } },
  { id: 'disciple_5', name: '门徒渐多', desc: '拥有 5 名弟子', category: 'sect', icon: '👤',
    condition: { type: 'disciple_count', target: 5 }, reward: { insight: 10 } },
  { id: 'disciple_10', name: '弟子满门', desc: '拥有 10 名弟子', category: 'sect', icon: '👤',
    condition: { type: 'disciple_count', target: 10 }, reward: { insight: 20, prestige: 10 } },
  { id: 'sect_power_1000', name: '小有名气', desc: '宗门战力达到 1000', category: 'sect', icon: '⚡',
    condition: { type: 'sect_power', target: 1000 }, reward: { prestige: 30 } },
  { id: 'sect_power_3000', name: '名震一方', desc: '宗门战力达到 3000', category: 'sect', icon: '⚡',
    condition: { type: 'sect_power', target: 3000 }, reward: { prestige: 50, insight: 20 } },
  { id: 'vassal_1', name: '初掌附庸', desc: '拥有 1 个附庸宗门', category: 'sect', icon: '👑',
    condition: { type: 'vassal_count', target: 1 }, reward: { prestige: 20 } },
  { id: 'vassal_3', name: '附庸成群', desc: '拥有 3 个附庸宗门', category: 'sect', icon: '👑',
    condition: { type: 'vassal_count', target: 3 }, reward: { prestige: 50, insight: 15 } },

  // 收集类
  { id: 'gold_10k', name: '初积灵石', desc: '累计获得 10000 灵石', category: 'collection', icon: '💰',
    condition: { type: 'gold_earned', target: 10000 }, reward: { insight: 5 } },
  { id: 'gold_100k', name: '富甲一方', desc: '累计获得 100000 灵石', category: 'collection', icon: '💰',
    condition: { type: 'gold_earned', target: 100000 }, reward: { insight: 20, skillPoint: 1 } },
  { id: 'realm_3', name: '金丹大道', desc: '达到金丹境界', category: 'collection', icon: '🔮',
    condition: { type: 'realm', target: 2 }, reward: { gold: 3000 } },
  { id: 'realm_5', name: '化神通天', desc: '达到化神境界', category: 'collection', icon: '🔮',
    condition: { type: 'realm', target: 4 }, reward: { gold: 20000, skillPoint: 1 } },

  // 特殊类
  { id: 'quest_5', name: '仙途初启', desc: '完成 5 个主线任务', category: 'special', icon: '📜',
    condition: { type: 'main_quests', target: 5 }, reward: { gold: 2000, insight: 5 } },
  { id: 'quest_15', name: '仙途漫漫', desc: '完成 15 个主线任务', category: 'special', icon: '📜',
    condition: { type: 'main_quests', target: 15 }, reward: { gold: 10000, skillPoint: 1 } },
  { id: 'quest_all', name: '仙途圆满', desc: '完成全部主线任务', category: 'special', icon: '📜',
    // 动态绑定主线表长度，避免增删章节后成就门槛与数据表失同步（缺陷 B1：曾硬编码 30 而主线为 31 章）
    condition: { type: 'main_quests', target: MAIN_QUESTS.length }, reward: { gold: 50000, skillPoint: 3, insight: 50 } },
]

/** 获取成就进度值 */
export function getAchievementProgress(state: GameState, cond: AchievementCondType): number {
  switch (cond) {
    case 'kills': return state.totalKills ?? 0
    case 'level': return state.level ?? 1
    case 'realm': return state.realm ?? 0
    case 'gold_earned': return state.totalGoldEarned ?? 0
    case 'dungeon_clears': return state.totalDungeonClears ?? 0
    case 'sect_wars_won': return state.totalSectWarsWon ?? 0
    case 'vassal_count': {
      if (!state.aiSects) return 0
      return state.aiSects.filter(a => !a.defeated && a.vassalOf === 'player').length
    }
    case 'disciple_count': return state.disciples.length
    case 'sect_power': {
      if (!state.sect) return 0
      const bc = Object.values(state.sect.buildings).filter(v => v > 0).length
      return calcSectPower(state.sect.level, bc, sectDisciplePower(state.disciples), state.sect.resources)
    }
    case 'domains_explored': {
      const d = state.worldDomain
      if (!d) return 1
      const domains = ['south', 'central', 'east', 'west', 'north']
      return domains.indexOf(d) >= 0 ? Math.max(1, domains.indexOf(d) + 1) : 1
    }
    case 'main_quests': return state.mainQuestCompleted?.length ?? 0
    case 'pvp_rank': return state.arenaRank ?? 0
    case 'enemy_defeated': return state.totalKills ?? 0
    default: return 0
  }
}

/** 检查并解锁成就 */
export function checkAchievements(state: GameState): string[] {
  if (!state.achievementsUnlocked) state.achievementsUnlocked = []
  const newlyUnlocked: string[] = []

  for (const ach of ACHIEVEMENTS) {
    if (state.achievementsUnlocked.includes(ach.id)) continue
    const progress = getAchievementProgress(state, ach.condition.type)
    if (progress >= ach.condition.target) {
      state.achievementsUnlocked.push(ach.id)
      newlyUnlocked.push(ach.id)

      // 发放奖励
      if (ach.reward.gold) state.gold = (state.gold ?? 0) + ach.reward.gold
      if (ach.reward.insight && state.sect) state.sect.resources.insight += ach.reward.insight
      if (ach.reward.prestige && state.sect) state.sect.resources.prestige += ach.reward.prestige
      if (ach.reward.skillPoint) state.skillPoints = (state.skillPoints ?? 0) + ach.reward.skillPoint

      sfx('sfx_levelup')
      toast(`成就解锁：${ach.name}`, '#fbbf24')
    }
  }

  if (newlyUnlocked.length > 0) saveGame(state)
  return newlyUnlocked
}

/** 获取成就完成总数 */
export function getAchievementCount(state: GameState): { unlocked: number; total: number } {
  return {
    unlocked: state.achievementsUnlocked?.length ?? 0,
    total: ACHIEVEMENTS.length,
  }
}

/** 成就类别中文名 */
export function categoryName(cat: AchievementCategory): string {
  const names: Record<AchievementCategory, string> = {
    combat: '战斗',
    exploration: '探索',
    sect: '宗门',
    collection: '收集',
    special: '特殊',
  }
  return names[cat]
}
