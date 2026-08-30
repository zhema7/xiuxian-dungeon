// ---------- 主线剧情系统逻辑：触发 / 推进 / 奖励 ----------

import { gainExp, saveGame, type GameState } from './state'
import { MAIN_QUESTS, getMainQuest, getVolume, VOLUMES, type MainQuestDef, type VolumeId } from './storyline-data'
import { REALMS } from './data'
import { toast, showDialog, dialogOpen } from './ui'
import { sfx } from './audio'
import { input } from './input'

/** 获取当前进行中的主线任务 */
export function getActiveQuest(state: GameState): MainQuestDef | null {
  if (!state.mainQuestId) return null
  return getMainQuest(state.mainQuestId) ?? null
}

/** 获取下一个可接取的任务（基于已完成列表） */
export function findNextQuest(state: GameState): MainQuestDef | undefined {
  const completed = new Set(state.mainQuestCompleted)
  for (const q of MAIN_QUESTS) {
    if (completed.has(q.id)) continue
    if (q.prerequisite && !completed.has(q.prerequisite)) continue
    return q
  }
  return undefined
}

/** 检查当前任务目标是否已完成（纯检查，无副作用） */
export function isQuestCompleted(state: GameState): boolean {
  const quest = getActiveQuest(state)
  if (!quest) return false
  if (state.mainQuestCompleted.includes(quest.id)) return false

  switch (quest.objectiveType) {
    case 'reach_level':
      return state.level >= parseInt(quest.objectiveTarget)
    case 'sect_level': {
      // 宗门等级目标。注意与 reach_level 区分：这里读的是 state.sect.level，
      // 不是角色等级。mq_4_3 曾误用 reach_level + 'sect_5'，
      // 导致 parseInt('sect_5') = NaN、目标恒 false，整条主线在第四卷第三章断链（缺陷 B22）。
      const t = parseInt(quest.objectiveTarget)
      return Number.isFinite(t) && (state.sect?.level ?? 0) >= t
    }
    case 'clear_dungeon':
      return checkDungeonCleared(state, quest.objectiveTarget)
    case 'talk_npc':
      if (quest.objectiveTarget === 'diplomacy') return state.mainQuestProgress >= 1
      return false
    case 'collect_kills':
      return state.totalKills >= parseInt(quest.objectiveTarget)
    case 'reach_realm':
      return state.realm >= parseInt(quest.objectiveTarget)
    case 'visit_point':
      return state.discoveredPoints.includes(quest.objectiveTarget)
    case 'establish_sect':
      return state.sectUnlocked
    case 'win_arena':
      return state.arenaWins >= parseInt(quest.objectiveTarget)
    case 'collect_gold':
      if (quest.objectiveTarget.startsWith('insight_'))
        return state.insight >= parseInt(quest.objectiveTarget.slice(8))
      return state.gold >= parseInt(quest.objectiveTarget)
    case 'defeat_boss':
      if (quest.objectiveTarget === 'ai_sect_war') return state.mainQuestProgress >= 1
      return false
    default:
      return false
  }
}

function checkDungeonCleared(state: GameState, target: string): boolean {
  switch (target) {
    case 'qm': return state.progress.qmCleared
    case 'ym': return state.progress.ymCleared
    case 'sy': return state.syMaxDepth >= 7
    case 'xian': return state.xianMaxDepth >= 10001
    case 'xian_deep': return state.xianMaxDepth >= 10010
    case 'sy_50': return state.syMaxDepth >= 50
    default: return false
  }
}

/** 获取任务进度信息（供 UI 显示） */
export function getQuestProgressInfo(state: GameState): {
  current: number
  total: number
  text: string
} | null {
  const quest = getActiveQuest(state)
  if (!quest) return null

  switch (quest.objectiveType) {
    case 'reach_level': {
      const t = parseInt(quest.objectiveTarget)
      return { current: state.level, total: t, text: `Lv.${state.level} / ${t}` }
    }
    case 'sect_level': {
      const t = parseInt(quest.objectiveTarget)
      const cur = state.sect?.level ?? 0
      return { current: cur, total: t, text: `宗门 Lv.${cur} / Lv.${t}` }
    }
    case 'collect_kills': {
      const t = parseInt(quest.objectiveTarget)
      return { current: state.totalKills, total: t, text: `${state.totalKills} / ${t}` }
    }
    case 'reach_realm': {
      const t = parseInt(quest.objectiveTarget)
      const curName = REALMS[state.realm]?.name ?? '未知'
      const tgtName = REALMS[t]?.name ?? '???'
      return { current: state.realm, total: t, text: `${curName} → ${tgtName}` }
    }
    case 'win_arena': {
      const t = parseInt(quest.objectiveTarget)
      return { current: state.arenaWins, total: t, text: `${state.arenaWins} / ${t} 胜` }
    }
    case 'collect_gold': {
      if (quest.objectiveTarget.startsWith('insight_')) {
        const t = parseInt(quest.objectiveTarget.slice(8))
        return { current: state.insight, total: t, text: `${state.insight} / ${t}` }
      }
      const t = parseInt(quest.objectiveTarget)
      return { current: state.gold, total: t, text: `${state.gold} / ${t}` }
    }
    case 'clear_dungeon': {
      switch (quest.objectiveTarget) {
        case 'qm': return { current: state.progress.qmCleared ? 1 : 0, total: 1, text: state.progress.qmCleared ? '已通关' : '未通关' }
        case 'ym': return { current: state.progress.ymCleared ? 1 : 0, total: 1, text: state.progress.ymCleared ? '已通关' : '未通关' }
        case 'sy': return { current: Math.min(state.syMaxDepth, 7), total: 7, text: `${Math.min(state.syMaxDepth, 7)} / 7 层` }
        case 'xian': return { current: state.xianMaxDepth >= 10001 ? 1 : 0, total: 1, text: state.xianMaxDepth >= 10001 ? '已探索' : '未探索' }
        case 'xian_deep': return { current: Math.min(state.xianMaxDepth - 10000, 10), total: 10, text: `${Math.max(0, Math.min(state.xianMaxDepth - 10000, 10))} / 10 层` }
        case 'sy_50': return { current: Math.min(state.syMaxDepth, 50), total: 50, text: `${Math.min(state.syMaxDepth, 50)} / 50 层` }
        default: return null
      }
    }
    default:
      return null
  }
}

// ---------- 事件钩子（更新状态，不显示对话框） ----------

/** 外交行动完成时调用 */
export function onDiplomacyAction(state: GameState): void {
  const quest = getActiveQuest(state)
  if (quest && quest.objectiveType === 'talk_npc' && quest.objectiveTarget === 'diplomacy') {
    if (state.mainQuestProgress < 1) {
      state.mainQuestProgress = 1
      saveGame(state)
    }
  }
}

/** 宗门战争胜利时调用 */
export function onSectWarWon(state: GameState): void {
  state.totalSectWarsWon = (state.totalSectWarsWon ?? 0) + 1
  const quest = getActiveQuest(state)
  if (quest && quest.objectiveType === 'defeat_boss' && quest.objectiveTarget === 'ai_sect_war') {
    if (state.mainQuestProgress < 1) {
      state.mainQuestProgress = 1
      saveGame(state)
    }
  }
}

/** 宗门建立时调用 */
export function onSectEstablished(state: GameState): void {
  saveGame(state)
}

// ---------- 任务完成流程（异步，显示对话框 + 发放奖励） ----------

let completing = false

/** 尝试完成当前任务。若目标已达成，显示完成对话、发放奖励、推进至下一任务。 */
export async function tryCompleteQuest(state: GameState): Promise<boolean> {
  if (completing) return false
  if (dialogOpen()) return false
  if (!isQuestCompleted(state)) return false

  const quest = getActiveQuest(state)
  if (!quest) return false

  completing = true
  input.clearQueues()

  // 完成对话
  await showDialog(quest.narrator, quest.completion, [
    { label: '领取奖励', value: 'ok' },
  ])

  // 发放奖励
  grantRewards(state, quest)

  // 标记完成
  state.mainQuestCompleted.push(quest.id)
  state.mainQuestId = null
  state.mainQuestProgress = 0
  saveGame(state)

  // 查找下一任务
  const next = findNextQuest(state)
  if (next) {
    state.mainQuestId = next.id
    state.mainQuestProgress = 0
    saveGame(state)

    // 显示下一任务接取对话
    await showDialog(next.narrator, [
      ...next.intro,
      '',
      `【目标】${next.objective}`,
      `【提示】${next.hint}`,
    ], [
      { label: '接取任务', value: 'accept' },
    ])
    toast(`新任务：${next.title}`, '#fbbf24')
  } else {
    toast('主线剧情全卷完成！', '#fbbf24')
  }

  input.clearQueues()
  completing = false
  return true
}

/** 发放任务奖励 */
function grantRewards(state: GameState, quest: MainQuestDef): void {
  const r = quest.rewards
  const msgs: string[] = []
  if (r.exp) {
    const ups = gainExp(state, r.exp)
    msgs.push(`经验 +${r.exp}`)
    if (ups > 0) toast(`升级！Lv.${state.level}`, '#fbbf24')
  }
  if (r.gold) {
    state.gold += r.gold
    msgs.push(`灵石 +${r.gold}`)
  }
  if (r.insight) {
    state.insight += r.insight
    msgs.push(`悟道 +${r.insight}`)
  }
  if (r.potions) {
    state.potions += r.potions
    msgs.push(`丹药 +${r.potions}`)
  }
  if (r.itemDesc) msgs.push(r.itemDesc)
  if (msgs.length > 0) toast(msgs.join('  '), '#34d399')
  sfx('sfx_levelup')
}

/** 显示当前任务接取对话（供玩家回顾） */
export async function showQuestIntro(state: GameState): Promise<void> {
  const quest = getActiveQuest(state)
  if (!quest) return
  if (state.mainQuestCompleted.includes(quest.id)) return

  input.clearQueues()
  const vol = getVolume(quest.volume)
  await showDialog(`${vol?.name ?? ''} · ${quest.title}`, [
    ...quest.intro,
    '',
    `【目标】${quest.objective}`,
    `【提示】${quest.hint}`,
  ], [
    { label: '知道了', value: 'ok' },
  ])
  input.clearQueues()
}

/** 打开任务日志面板，显示当前任务和全卷进度 */
export async function openQuestLog(state: GameState): Promise<void> {
  input.clearQueues()
  const quest = getActiveQuest(state)
  const lines: string[] = []

  if (quest) {
    const vol = getVolume(quest.volume)
    lines.push(`当前任务：${vol?.name ?? ''} · ${quest.title}`)
    lines.push(`目标：${quest.objective}`)
    const info = getQuestProgressInfo(state)
    if (info) lines.push(`进度：${info.text}`)
    lines.push(`提示：${quest.hint}`)
    lines.push('')
    lines.push('——— 全卷进度 ———')
  } else {
    lines.push('暂无进行中的主线任务')
    lines.push('')
    lines.push('——— 全卷进度 ———')
  }

  for (const vol of VOLUMES) {
    const total = MAIN_QUESTS.filter(q => q.volume === vol.id).length
    const done = state.mainQuestCompleted.filter(id => {
      const q = getMainQuest(id)
      return q && q.volume === vol.id
    }).length
    lines.push(`${vol.name} ${vol.subtitle}：${done} / ${total}`)
  }

  const options: { label: string; value: string }[] = []
  if (quest) options.push({ label: '回顾剧情', value: 'intro' })
  options.push({ label: '关闭', value: 'close' })

  const result = await showDialog('主线任务', lines, options)
  if (result === 'intro' && quest) {
    await showQuestIntro(state)
  }
  input.clearQueues()
}

/** 获取当前任务的简要描述（供 HUD / 场景显示） */
export function getQuestHudText(state: GameState): string {
  const quest = getActiveQuest(state)
  if (!quest) return '无主线任务'
  const info = getQuestProgressInfo(state)
  const progress = info ? ` (${info.text})` : ''
  return `${quest.title}：${quest.objective}${progress}`
}

/** 初始化主线任务（新游戏时调用） */
export function initMainQuest(state: GameState): void {
  if (!state.mainQuestId && state.mainQuestCompleted.length === 0) {
    state.mainQuestId = 'mq_1_1'
    state.mainQuestProgress = 0
  }
}

/** 获取某卷的完成数 */
export function getCompletedInVolume(state: GameState, volume: VolumeId): number {
  return state.mainQuestCompleted.filter(id => {
    const q = getMainQuest(id)
    return q && q.volume === volume
  }).length
}

/** 获取某卷的总任务数 */
export function getTotalInVolume(volume: VolumeId): number {
  return MAIN_QUESTS.filter(q => q.volume === volume).length
}

/** 获取主线整体完成度（0~1） */
export function getOverallProgress(state: GameState): number {
  return state.mainQuestCompleted.length / MAIN_QUESTS.length
}
