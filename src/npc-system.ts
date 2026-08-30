// ---------- NPC 系统交互逻辑：初始化 / 成长 / 对话 / 送礼 / 故事线 ----------

import type { GameState } from './state'
import {
  NPC_DEFS, getNpcDef, getNpcsByLocation, createNpcState,
  npcCultivate, changeFavor, getRelation, npcExpToNext,
  getStory, type NpcDef, type NpcState, type StoryDef,
} from './npc-data'
import { GIFTS, giftFavor } from './favor'
import { makeRng } from './core'
import { toast, showDialog } from './ui'
import { sfx } from './audio'
import { input } from './input'
import { saveGame } from './state'

export type { NpcDef, NpcState, StoryDef, StoryStageDef } from './npc-data'

/** 确保所有 NPC 状态已初始化 */
export function initNpcStates(state: GameState): void {
  if (!state.npcStates) state.npcStates = {}
  for (const def of NPC_DEFS) {
    if (!state.npcStates[def.id]) {
      state.npcStates[def.id] = createNpcState(def)
    }
  }
  // 修复前生成的存档里，有故事线的 NPC 也可能停留在 'locked'，这里补一次迁移
  syncNpcStoryAvailability(state)
}

/**
 * 把「有故事线但仍停留在 locked」的 NPC 状态提升到 available。
 *
 * 这是缺陷 B27 的存档侧解锁入口：修复前 createNpcState 只硬编码开放
 * npc_elder / npc_sister，其余 NPC 一律 locked，且全仓没有任何迁移路径，
 * 因此旧存档中的「城主的考验」「宿敌的觉悟」「隐士的传承」会永久锁死。
 *
 * 只做 locked → available 的单向提升，绝不回退 active / completed，可安全重复调用。
 */
export function syncNpcStoryAvailability(state: GameState): void {
  if (!state.npcStates) state.npcStates = {}
  for (const def of NPC_DEFS) {
    const ns = state.npcStates[def.id]
    if (!ns || ns.storyStage !== 'locked') continue
    if (getStory(def.id)) ns.storyStage = 'available'
  }
}

/** 更新所有 NPC 的修炼成长（基于经过的分钟数） */
export function updateNpcGrowth(state: GameState, deltaMinutes: number): string[] {
  if (!state.npcStates) return []
  const rng = makeRng(Math.floor(Date.now() / 60000))
  const breakthroughs: string[] = []

  for (const def of NPC_DEFS) {
    const ns = state.npcStates[def.id]
    if (!ns || !ns.alive) continue
    const broke = npcCultivate(ns, def, deltaMinutes, rng)
    if (broke) {
      breakthroughs.push(`${def.name} 突破至 ${ns.realm + 1} 境！`)
    }
  }
  return breakthroughs
}

/** 与 NPC 对话 */
export async function talkToNpc(state: GameState, npcId: string): Promise<void> {
  input.clearQueues()
  initNpcStates(state)
  const def = getNpcDef(npcId)
  const ns = state.npcStates[npcId]
  if (!def || !ns) { input.clearQueues(); return }

  const relation = getRelation(ns.favor)
  const useHighFavor = ns.favor >= 80
  const dialogues = useHighFavor ? def.highFavorDialogues : def.dialogues
  const line = dialogues[Math.floor(Math.random() * dialogues.length)] ?? '……'

  const lines = [
    `${def.name}（${def.title}）`,
    `关系：${relation.name}  境界：${ns.realm}`,
    `"${line}"`,
  ]

  const options: { label: string; value: string }[] = [
    { label: '送礼', value: 'gift' },
  ]

  // 检查故事线
  const story = getStory(npcId)
  if (story && (ns.storyStage === 'available' || ns.storyStage === 'active')) {
    options.push({ label: '故事', value: 'story' })
  }

  options.push({ label: '告别', value: 'leave' })

  const result = await showDialog(def.name, lines, options)

  if (result === 'gift') {
    await giftToNpc(state, npcId)
  } else if (result === 'story') {
    await progressStory(state, npcId)
  } else {
    input.clearQueues()
  }
}

/** 送礼给 NPC */
async function giftToNpc(state: GameState, npcId: string): Promise<void> {
  input.clearQueues()
  const def = getNpcDef(npcId)
  const ns = state.npcStates[npcId]
  if (!def || !ns) { input.clearQueues(); return }

  const lines = [`选择礼物送给 ${def.name}：`, def.giftHint]
  const options: { label: string; value: string }[] = []

  for (const g of GIFTS) {
    options.push({ label: g.name, value: g.id })
  }
  options.push({ label: '取消', value: 'cancel' })

  const result = await showDialog('送礼', lines, options)
  if (result && result !== 'cancel') {
    const gift = GIFTS.find(g => g.id === result)
    if (gift) {
      if (!gift.pay(state)) {
        toast('物品不足', '#f87171')
        input.clearQueues()
        return
      }
      const { amount, liked } = giftFavor(npcId, gift)
      const ns2 = state.npcStates[npcId]
      if (ns2) {
        const leveled = changeFavor(ns2, amount)
        ns2.lastInteract = Date.now()
        saveGame(state)
        sfx(liked ? 'sfx_levelup' : 'sfx_click')
        if (liked) {
          toast(`${def.name} 很喜欢！好感 +${amount}`, '#fbbf24')
        } else {
          toast(`${def.name} 收下了礼物。好感 +${amount}`, '#a3e4d7')
        }
        if (leveled) {
          const rel = getRelation(ns2.favor)
          toast(`关系提升至「${rel.name}」！悟道 +10`, '#fbbf24')
          state.insight += 10
        }
      }
    }
  }
  input.clearQueues()
}

/** 推进故事线 */
async function progressStory(state: GameState, npcId: string): Promise<void> {
  input.clearQueues()
  initNpcStates(state)
  const def = getNpcDef(npcId)
  const ns = state.npcStates[npcId]
  const story = getStory(npcId)
  if (!def || !ns || !story) { input.clearQueues(); return }

  // 检查是否满足触发条件
  if (ns.storyStage === 'available') {
    if (ns.favor < story.requireFavor) {
      await showDialog(story.name, [
        story.desc,
        `需要好感 ${story.requireFavor}（当前 ${ns.favor}）`,
      ], [{ label: '知道了', value: 'ok' }])
      input.clearQueues()
      return
    }
    if (state.level < story.requireLevel) {
      await showDialog(story.name, [
        story.desc,
        `需要等级 ${story.requireLevel}（当前 Lv.${state.level}）`,
      ], [{ label: '知道了', value: 'ok' }])
      input.clearQueues()
      return
    }
    // 触发故事
    ns.storyStage = 'active'
    ns.storyProgress = 0
  }

  if (ns.storyStage !== 'active') { input.clearQueues(); return }

  const stage = story.stages[ns.storyProgress]
  if (!stage) { input.clearQueues(); return }

  const lines = [
    `${story.name} · 第${stage.index + 1}段`,
    stage.text,
    `目标：${stage.objective}`,
    `奖励：${stage.reward}`,
  ]

  const completed = stage.check(state.level, state.realm, ns.favor)
  const options: { label: string; value: string }[] = []

  if (completed) {
    options.push({ label: '完成', value: 'complete' })
  } else {
    lines.push('（条件未满足）')
  }
  options.push({ label: '稍后再来', value: 'later' })

  const result = await showDialog(story.name, lines, options)

  if (result === 'complete') {
    ns.storyProgress++
    ns.lastInteract = Date.now()

    // 奖励
    if (stage.index === story.stages.length - 1) {
      // 最终阶段
      ns.storyStage = 'completed'
      // 好感大增
      changeFavor(ns, 30)
      state.insight += 30
      sfx('sfx_levelup')
      toast(`「${story.name}」完成！${stage.reward}`, '#fbbf24')
    } else {
      // 中间阶段
      changeFavor(ns, 10)
      sfx('sfx_levelup')
      toast(`完成第${stage.index + 1}段：${stage.reward}`, '#34d399')
    }
    saveGame(state)
  }

  input.clearQueues()
}

/** 获取 NPC 在场景中的显示信息 */
export function getNpcDisplayInfo(state: GameState, npcId: string): { name: string; title: string; realm: number; relation: string } | null {
  initNpcStates(state)
  const def = getNpcDef(npcId)
  const ns = state.npcStates[npcId]
  if (!def || !ns) return null
  const rel = getRelation(ns.favor)
  return { name: def.name, title: def.title, realm: ns.realm, relation: rel.name }
}

/** 获取场景中的 NPC 列表 */
export function getLocationNpcs(state: GameState, location: string): { def: NpcDef; state: NpcState }[] {
  initNpcStates(state)
  const npcs = getNpcsByLocation(location as NpcDef['location'])
  return npcs.map(def => ({ def, state: state.npcStates[def.id] })).filter(n => n.state)
}
