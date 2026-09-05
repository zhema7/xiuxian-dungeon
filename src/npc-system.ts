// ---------- NPC 系统交互逻辑：初始化 / 成长 / 对话 / 送礼 / 故事线 ----------

import type { GameState } from './state'
import {
  NPC_DEFS, getNpcDef, getNpcsByLocation, createNpcState,
  npcCultivate, changeFavor, getRelation,
  getStory, ensureProcAppearance, ensureNpcLevel, logNpcEvent, NPC_REALM_NAMES,
  type NpcDef, type NpcState, type StoryDef, type CultivateResult,
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
    // 为宗门 NPC 补齐程序化外观字段（新建与旧存档迁移统一走这里）
    ensureProcAppearance(state.npcStates[def.id], def)
    // 迁移：为所有 NPC 补齐 level 字段并换算经验制
    ensureNpcLevel(state.npcStates[def.id], def)
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
    const result: CultivateResult = npcCultivate(ns, def, deltaMinutes, rng)
    if (result === 'breakthrough') {
      breakthroughs.push(`★ ${def.name} 突破至 ${NPC_REALM_NAMES[ns.realm]}境！`)
    } else if (result === 'levelup') {
      breakthroughs.push(`${def.name} 修为精进，${NPC_REALM_NAMES[ns.realm]}${ns.level}级`)
    } else if (result === 'breakfail') {
      breakthroughs.push(`${def.name} 冲击 ${NPC_REALM_NAMES[Math.min(ns.realm + 1, 7)]}境失败，修为折损…`)
    }
    // 随机事件：兵解/叛逃/奇遇（仅宗门NPC）
    if (def.location === 'sect' && ns.alive) {
      const event = rollNpcEvent(ns, def, rng)
      if (event) breakthroughs.push(event)
    }
  }
  return breakthroughs
}

/** NPC 随机事件：兵解死亡 / 叛逃 / 奇遇 */
function rollNpcEvent(ns: NpcState, def: NpcDef, rng: () => number): string | null {
  const roll = rng()
  // 奇遇（1%）：获得大量经验
  if (roll < 0.01) {
    const gain = ns.expToNext * 2
    ns.exp += gain
    logNpcEvent(ns, '修炼中得遇奇缘，修为大增')
    return `✦ ${def.name} 在修炼中得遇奇缘，修为大增！`
  }
  // 叛逃（0.3%）：忠诚极低时触发
  if (roll < 0.013 && ns.favor < 20) {
    ns.alive = false
    logNpcEvent(ns, '心生异念，叛离宗门')
    return `⚠ ${def.name} 心生异念，叛离宗门！`
  }
  // 兵解死亡（0.2%）：境界高时触发
  if (roll < 0.015 && ns.realm >= 4) {
    ns.alive = false
    logNpcEvent(ns, '渡劫失败，兵解身亡')
    return `☠ ${def.name} 渡劫失败，兵解身亡！`
  }
  return null
}

/** 与 NPC 对话（交互菜单循环，支持送礼/阅历/切磋/故事） */
export async function talkToNpc(state: GameState, npcId: string): Promise<void> {
  input.clearQueues()
  initNpcStates(state)
  const def = getNpcDef(npcId)
  const ns = state.npcStates[npcId]
  if (!def || !ns) { input.clearQueues(); return }

  let active = true
  while (active) {
    const relation = getRelation(ns.favor)
    const useHighFavor = ns.favor >= 80
    const dialogues = useHighFavor ? def.highFavorDialogues : def.dialogues
    const line = dialogues[Math.floor(Math.random() * dialogues.length)] ?? '……'

    const lines = [
      `${def.name}（${def.title}）`,
      `关系：${relation.name}  境界：${NPC_REALM_NAMES[ns.realm]}${ns.level}级`,
      `"${line}"`,
    ]

    const options: { label: string; value: string }[] = [
      { label: '送礼', value: 'gift' },
      { label: '阅历', value: 'chronicle' },
    ]
    // 宗门 NPC 可切磋
    if (def.location === 'sect') {
      options.push({ label: '切磋', value: 'spar' })
    }
    // 检查故事线
    const story = getStory(npcId)
    if (story && (ns.storyStage === 'available' || ns.storyStage === 'active')) {
      options.push({ label: '故事', value: 'story' })
    }
    options.push({ label: '告别', value: 'leave' })

    const result = await showDialog(def.name, lines, options)

    if (result === 'gift') {
      await giftToNpc(state, npcId)
    } else if (result === 'chronicle') {
      await showNpcChronicle(state, npcId)
    } else if (result === 'spar') {
      await sparWithNpc(state, npcId)
    } else if (result === 'story') {
      await progressStory(state, npcId)
    } else {
      active = false
    }
  }
  input.clearQueues()
}

/** 查看 NPC 阅历（成长与事件日志） */
async function showNpcChronicle(state: GameState, npcId: string): Promise<void> {
  input.clearQueues()
  const def = getNpcDef(npcId)
  const ns = state.npcStates[npcId]
  if (!def || !ns) { input.clearQueues(); return }
  const entries = ns.chronicle?.length ? ns.chronicle : ['尚无阅历记录']
  await showDialog(`${def.name}·阅历`, entries, [{ label: '返回', value: 'back' }])
  input.clearQueues()
}

/** 与宗门道友切磋（简易战力对比，消耗好感，胜败均有悟道收益） */
async function sparWithNpc(state: GameState, npcId: string): Promise<void> {
  input.clearQueues()
  const def = getNpcDef(npcId)
  const ns = state.npcStates[npcId]
  if (!def || !ns) { input.clearQueues(); return }
  if (!ns.alive) {
    toast(`${def.name}已不在人世`, '#94a3b8')
    input.clearQueues()
    return
  }
  if (ns.favor < 20) {
    toast(`${def.name}与你尚不熟络，婉拒了切磋`, '#94a3b8')
    input.clearQueues()
    return
  }
  // 战力：玩家等级+境界 vs NPC 境界+级别+底子
  const playerStr = state.level + state.realm * 12
  const npcStr = ns.realm * 12 + ns.level + def.baseRealm
  const pRoll = Math.random() * playerStr
  const nRoll = Math.random() * npcStr
  changeFavor(ns, -2) // 切磋消耗少许好感，避免无限刷
  ns.lastInteract = Date.now()
  if (pRoll >= nRoll) {
    const expGain = 30 + ns.realm * 20
    const insightGain = 3 + ns.realm
    state.exp += expGain
    state.insight += insightGain
    logNpcEvent(ns, '与道友切磋，惜败一招')
    sfx('sfx_levelup')
    toast(`切磋胜出！经验 +${expGain}，悟道 +${insightGain}`, '#fbbf24')
  } else {
    const insightGain = 1 + Math.floor(ns.realm / 2)
    state.insight += insightGain
    logNpcEvent(ns, '与道友切磋，略胜一筹')
    toast(`切磋落败，败中略有领悟。悟道 +${insightGain}`, '#a3e4d7')
  }
  saveGame(state)
  input.clearQueues()
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
        logNpcEvent(ns2, `收到礼物：${gift.name}${liked ? '（甚喜）' : ''}`)
        saveGame(state)
        sfx(liked ? 'sfx_levelup' : 'sfx_click')
        if (liked) {
          toast(`${def.name} 很喜欢！好感 +${amount}`, '#fbbf24')
        } else {
          toast(`${def.name} 收下了礼物。好感 +${amount}`, '#a3e4d7')
        }
        if (leveled) {
          const rel = getRelation(ns2.favor)
          logNpcEvent(ns2, `关系提升至「${rel.name}」`)
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
export function getNpcDisplayInfo(state: GameState, npcId: string): { name: string; title: string; realm: number; level: number; relation: string } | null {
  initNpcStates(state)
  const def = getNpcDef(npcId)
  const ns = state.npcStates[npcId]
  if (!def || !ns) return null
  const rel = getRelation(ns.favor)
  return { name: def.name, title: def.title, realm: ns.realm, level: ns.level, relation: rel.name }
}

/** 获取场景中的 NPC 列表 */
export function getLocationNpcs(state: GameState, location: string): { def: NpcDef; state: NpcState }[] {
  initNpcStates(state)
  const npcs = getNpcsByLocation(location as NpcDef['location'])
  return npcs.map(def => ({ def, state: state.npcStates[def.id] })).filter(n => n.state)
}
