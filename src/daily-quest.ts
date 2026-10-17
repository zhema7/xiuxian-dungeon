// ---------- 日常任务系统 ----------

import type { GameState } from './state'
import { toast } from './ui'
import { sfx } from './audio'
import { saveGame } from './state'
import { makeRng } from './core'

/** 日常任务目标类型 */
export type DailyQuestType =
  | 'kills'
  | 'dungeon_clear'
  | 'gold_earn'
  | 'sect_quest'
  | 'npc_talk'
  | 'spend_gold'
  | 'arena_win'
  | 'cultivate'

/** 日常任务定义 */
export interface DailyQuest {
  id: string
  type: DailyQuestType
  name: string
  desc: string
  goal: number
  progress: number
  reward: { gold?: number; insight?: number; prestige?: number }
  claimed: boolean
}

/** 日常任务模板 */
const DAILY_QUEST_POOL: { type: DailyQuestType; name: string; desc: string; goal: number; reward: { gold?: number; insight?: number; prestige?: number } }[] = [
  { type: 'kills', name: '斩妖除魔', desc: '击杀 {n} 个敌人', goal: 30, reward: { gold: 500, insight: 3 } },
  { type: 'kills', name: '大举清扫', desc: '击杀 {n} 个敌人', goal: 80, reward: { gold: 1500, insight: 8 } },
  { type: 'dungeon_clear', name: '秘境探索', desc: '通关秘境 {n} 次', goal: 1, reward: { gold: 800, insight: 5 } },
  { type: 'dungeon_clear', name: '秘境征服', desc: '通关秘境 {n} 次', goal: 3, reward: { gold: 3000, insight: 15 } },
  { type: 'gold_earn', name: '聚财有道', desc: '获得 {n} 灵石', goal: 2000, reward: { insight: 5 } },
  { type: 'gold_earn', name: '日进斗金', desc: '获得 {n} 灵石', goal: 5000, reward: { insight: 12 } },
  { type: 'sect_quest', name: '宗门差遣', desc: '完成 {n} 个宗门任务', goal: 2, reward: { gold: 600, prestige: 5 } },
  { type: 'npc_talk', name: '广结善缘', desc: '与修士交谈 {n} 次', goal: 3, reward: { gold: 300 } },
  { type: 'arena_win', name: '擂台争锋', desc: '赢得 {n} 场擂台赛', goal: 1, reward: { gold: 1000, prestige: 3 } },
  { type: 'cultivate', name: '潜心修炼', desc: '修炼 {n} 次（闭关/指点弟子）', goal: 1, reward: { gold: 400, insight: 3 } },
  { type: 'spend_gold', name: '灵石流转', desc: '消耗 {n} 灵石', goal: 1000, reward: { insight: 4 } },
]

/** 获取今日日期字符串 (YYYY-MM-DD) */
export function getTodayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** 随机选择 3 个日常任务 */
export function generateDailyQuests(rng: () => number): DailyQuest[] {
  const pool = [...DAILY_QUEST_POOL]
  const picked: DailyQuest[] = []
  const count = Math.min(3, pool.length)

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * pool.length)
    const tpl = pool.splice(idx, 1)[0]
    picked.push({
      id: `dq_${i}_${tpl.type}`,
      type: tpl.type,
      name: tpl.name,
      desc: tpl.desc.replace('{n}', String(tpl.goal)),
      goal: tpl.goal,
      progress: 0,
      reward: { ...tpl.reward },
      claimed: false,
    })
  }
  return picked
}

/** 检查并刷新日常任务（每日重置） */
export function refreshDailyQuests(state: GameState): boolean {
  const today = getTodayKey()
  if (state.dailyQuestDate !== today) {
    const rng = makeRng(Date.now() % 2147483647)
    state.dailyQuests = generateDailyQuests(rng)
    state.dailyQuestDate = today
    saveGame(state)
    return true
  }
  return false
}

/** 更新日常任务进度 */
export function updateDailyProgress(state: GameState, type: DailyQuestType, amount: number): void {
  if (!state.dailyQuests) return
  let changed = false
  for (const q of state.dailyQuests) {
    if (q.type === type && !q.claimed && q.progress < q.goal) {
      q.progress = Math.min(q.goal, q.progress + amount)
      changed = true
      if (q.progress >= q.goal) {
        toast(`日常任务完成：${q.name}`, '#34d399')
      }
    }
  }
  if (changed) saveGame(state)
}

/** 领取日常任务奖励 */
export function claimDailyReward(state: GameState, questId: string): boolean {
  if (!state.dailyQuests) return false
  const q = state.dailyQuests.find(dq => dq.id === questId)
  if (!q || q.claimed || q.progress < q.goal) return false

  q.claimed = true
  if (q.reward.gold) state.gold = (state.gold ?? 0) + q.reward.gold
  if (q.reward.insight) {
    state.insight += q.reward.insight
    if (state.sect) state.sect.resources.insight += q.reward.insight
  }
  if (q.reward.prestige && state.sect) state.sect.resources.prestige += q.reward.prestige

  sfx('sfx_pickup')
  toast(`领取奖励：${q.name}`, '#fbbf24')
  saveGame(state)
  return true
}

/** 获取日常任务完成统计 */
export function getDailyQuestStats(state: GameState): { total: number; completed: number; claimed: number } {
  if (!state.dailyQuests) return { total: 0, completed: 0, claimed: 0 }
  const total = state.dailyQuests.length
  const completed = state.dailyQuests.filter(q => q.progress >= q.goal).length
  const claimed = state.dailyQuests.filter(q => q.claimed).length
  return { total, completed, claimed }
}
