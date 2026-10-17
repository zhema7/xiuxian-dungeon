// ---------- 外交系统：使者/贸易/同盟/战争/资源争夺 ----------

import type { GameState } from './state'
import type { SectData } from './sect-data'
import type { AiSect, ResourceNode, DiplomacyActionType, DiplomacyStatus } from './ai-sect-data'
import { sectDisciplePower } from './disciple-data'
import {
  DIPLOMACY_ACTIONS, getDiplomacyStatus, aiAcceptDiplomacy, aiSectTick,
  calcSectPower, diplomacyStatusName, dispositionDesc,
} from './ai-sect-data'
import { makeRng } from './core'
import { onSectWarWon } from './storyline-system'
import { toast, showDialog } from './ui'
import { sfx } from './audio'
import { input } from './input'
import { saveGame } from './state'
import { buildingLabel } from './labels'

/** 执行外交行动 */
export async function executeDiplomacy(
  state: GameState,
  ai: AiSect,
  action: DiplomacyActionType,
): Promise<void> {
  input.clearQueues()
  const def = DIPLOMACY_ACTIONS[action]
  if (!def) { input.clearQueues(); return }

  const sect = state.sect
  if (!sect) { input.clearQueues(); return }

  // 检查冷却
  if (Date.now() < ai.cooldownUntil) {
    const remain = Math.ceil((ai.cooldownUntil - Date.now()) / 1000)
    toast(`冷却中，还需 ${remain} 秒`, '#f87171')
    input.clearQueues()
    return
  }

  // 检查外交值
  if (ai.relationValue < def.relationReq) {
    toast(`外交值不足（需要 ${def.relationReq}，当前 ${ai.relationValue}）`, '#f87171')
    input.clearQueues()
    return
  }

  // 检查资源消耗
  if (def.cost.stone && sect.resources.stone < def.cost.stone) {
    toast('宗门灵石不足', '#f87171')
    input.clearQueues()
    return
  }
  if (def.cost.prestige && sect.resources.prestige < def.cost.prestige) {
    toast('声望不足', '#f87171')
    input.clearQueues()
    return
  }

  // 扣除资源
  if (def.cost.stone) sect.resources.stone -= def.cost.stone
  if (def.cost.prestige) sect.resources.prestige -= def.cost.prestige

  // 设置冷却
  ai.cooldownUntil = Date.now() + def.cooldown

  const rng = makeRng(Date.now() % 2147483647)
  const buildingCount = Object.values(sect.buildings).filter(v => v > 0).length
  const playerPower = calcSectPower(sect.level, buildingCount, sectDisciplePower(state.disciples), sect.resources)

  // 侦查行动特殊处理
  if (action === 'scout') {
    sfx('sfx_click')
    await showDialog(`侦查 ${ai.name}`, [
      `宗门等级：Lv.${ai.level}`,
      `综合战力：${ai.power}`,
      `弟子数量：${ai.discipleCount}`,
      `性格：${dispositionDesc(ai.disposition)}`,
      `资源：灵石${ai.resources.stone} 灵草${ai.resources.herb} 矿石${ai.resources.ore} 木材${ai.resources.wood}`,
      `外交值：${ai.relationValue}`,
    ])
    saveGame(state)
    input.clearQueues()
    return
  }

  // 宣战/签和约特殊处理
  if (action === 'declare_war') {
    if (ai.atWar) { toast('已经处于交战状态', '#f87171'); input.clearQueues(); return }
    if (ai.alliance) {
      ai.alliance = false
      ai.relationValue -= 30
    }
    ai.atWar = true
    ai.relationValue = Math.max(-100, ai.relationValue - 40)
    sfx('sfx_levelup')
    toast(`已向 ${ai.name} 宣战！`, '#f87171')
    saveGame(state)
    input.clearQueues()
    return
  }

  if (action === 'sign_peace') {
    if (!ai.atWar) { toast('并未处于交战状态', '#f87171'); input.clearQueues(); return }
    const result = aiAcceptDiplomacy(ai, 'sign_peace', playerPower, rng)
    if (result.accept) {
      ai.atWar = false
      ai.relationValue = Math.min(50, ai.relationValue + 20)
      ai.warExhaustion = 0
      sfx('sfx_click')
      await showDialog(ai.name, [`和约已签订。`, result.reason])
    } else {
      await showDialog(ai.name, [result.reason])
    }
    saveGame(state)
    input.clearQueues()
    return
  }

  // 要求进贡特殊处理
  if (action === 'request_tribute') {
    const result = aiAcceptDiplomacy(ai, 'request_tribute', playerPower, rng)
    if (result.accept) {
      const tribute = Math.floor(ai.resources.stone * 0.2)
      ai.resources.stone -= tribute
      sect.resources.stone += tribute
      ai.relationValue = Math.max(-100, ai.relationValue - 15)
      sfx('sfx_pickup')
      await showDialog(ai.name, [
        result.reason,
        `获得进贡：灵石 ×${tribute}`,
        `外交值 -15`,
      ])
    } else {
      ai.relationValue = Math.max(-100, ai.relationValue - 10)
      await showDialog(ai.name, [result.reason, '外交值 -10'])
    }
    saveGame(state)
    input.clearQueues()
    return
  }

  // 其他外交行动：使者/贸易/结盟
  const result = aiAcceptDiplomacy(ai, action, playerPower, rng)

  if (action === 'send_envoy') {
    const gain = 8 + Math.floor(rng() * 8)
    ai.relationValue = Math.min(100, ai.relationValue + gain)
    sfx('sfx_click')
    await showDialog(ai.name, [
      result.reason,
      `外交值 +${gain}`,
      `当前外交值：${ai.relationValue}（${diplomacyStatusName(getDiplomacyStatus(ai.relationValue, ai.atWar, ai.alliance, ai.vassalOf))}）`,
    ])
  } else if (action === 'propose_trade') {
    if (result.accept) {
      ai.tradeAgreement = true
      ai.relationValue = Math.min(100, ai.relationValue + 5)
      sfx('sfx_levelup')
      await showDialog(ai.name, [
        result.reason,
        '贸易协定已签订！每小时双方获得额外资源',
        '外交值 +5',
      ])
      toast(`与 ${ai.name} 签订贸易协定`, '#34d399')
    } else {
      await showDialog(ai.name, [result.reason])
    }
  } else if (action === 'propose_alliance') {
    if (result.accept) {
      ai.alliance = true
      ai.relationValue = Math.min(100, ai.relationValue + 20)
      sect.resources.prestige += 10
      sfx('sfx_levelup')
      await showDialog(ai.name, [
        result.reason,
        '同盟已缔结！双方互助，共享资源',
        '声望 +10，外交值 +20',
      ])
      toast(`与 ${ai.name} 缔结同盟！`, '#fbbf24')
    } else {
      await showDialog(ai.name, [result.reason])
    }
  }

  saveGame(state)
  input.clearQueues()
}

/** 贸易结算（每小时调用） */
export function processTradeIncome(state: GameState, aiSects: AiSect[]): void {
  const sect = state.sect
  if (!sect) return
  for (const ai of aiSects) {
    if (ai.defeated) continue
    if (ai.tradeAgreement) {
      const stone = Math.floor(ai.level * 8)
      const herb = Math.floor(ai.level * 3)
      sect.resources.stone += stone
      sect.resources.herb += herb
      ai.resources.stone += Math.floor(ai.level * 4)
    }
    if (ai.alliance) {
      const ore = Math.floor(ai.level * 2)
      const wood = Math.floor(ai.level * 3)
      sect.resources.ore += ore
      sect.resources.wood += wood
    }
  }
}

/** AI 宗门全体 tick */
export function tickAllAiSects(state: GameState, aiSects: AiSect[]): string[] {
  const sect = state.sect
  if (!sect) return []
  const rng = makeRng(Math.floor(Date.now() / 300000))
  const events: string[] = []
  const buildingCount = Object.values(sect.buildings).filter(v => v > 0).length
  const playerPower = calcSectPower(sect.level, buildingCount, sectDisciplePower(state.disciples), sect.resources)

  for (const ai of aiSects) {
    const msg = aiSectTick(ai, playerPower, rng)
    if (msg) {
      events.push(msg)
      // 外交型宗门派遣使者送礼：玩家获得灵石
      if (msg.includes('派遣使者前来') && msg.includes('赠送灵石')) {
        const gift = ai.level * 20
        state.gold += gift
      }
    }
  }

  // 附庸进贡结算
  processVassalTribute(state, aiSects)

  // 附庸叛乱检查
  const rebellionEvents = checkRebellion(state, aiSects, rng)
  events.push(...rebellionEvents)

  return events
}

/** 处理 AI 宗门攻击玩家宗门的防御战 */
export async function processSectDefense(
  state: GameState,
  ai: AiSect,
): Promise<void> {
  input.clearQueues()
  const sect = state.sect
  if (!sect) { input.clearQueues(); return }

  const rng = makeRng(Date.now() % 2147483647)
  const buildingCount = Object.values(sect.buildings).filter(v => v > 0).length

  // 攻击力
  const dispositionMod = ai.disposition === 'aggressive' ? 1.2 : ai.disposition === 'expansionist' ? 1.1 : 0.9
  const attackPower = Math.floor(ai.power * (0.4 + rng() * 0.3) * dispositionMod)

  // 防御力 = 玩家宗门战力 + 护山大阵加成 + 弟子战力
  const guardLevel = sect.buildings.guard_array ?? 0
  const guardBonus = guardLevel * 80
  let discipleDefense = 0
  for (const d of state.disciples) {
    if (d.status !== 'dispatched' && d.status !== 'retreating') {
      discipleDefense += d.atk + d.def
    }
  }
  const playerSectPower = calcSectPower(sect.level, buildingCount, sectDisciplePower(state.disciples), sect.resources)
  const defensePower = playerSectPower + guardBonus + discipleDefense

  const defended = defensePower >= attackPower

  sfx('sfx_hit')

  if (defended) {
    // 防御成功
    ai.power = Math.floor(ai.power * 0.9)
    ai.warExhaustion += 15
    sect.resources.prestige += 10

    // 弟子轻微损耗
    if (state.disciples.length > 0 && rng() < 0.3) {
      const d = state.disciples[Math.floor(rng() * state.disciples.length)]
      if (d) {
        d.loyalty = Math.max(0, d.loyalty - 3)
      }
    }

    sfx('sfx_levelup')
    await showDialog(`宗门防御战 · ${ai.name}`, [
      `${ai.name} 来犯！`,
      `敌方攻击力 ${attackPower}`,
      `我方防御力 ${defensePower}`,
      '防御成功！击退来犯之敌！',
      `声望 +10`,
      `敌方战力下降，战争疲劳 +15`,
    ])
    toast(`击退 ${ai.name} 的进攻！`, '#34d399')
  } else {
    // 防御失败
    const stoneLoss = Math.floor(sect.resources.stone * (0.15 + rng() * 0.15))
    const herbLoss = Math.floor(sect.resources.herb * (0.1 + rng() * 0.1))
    sect.resources.stone -= stoneLoss
    sect.resources.herb -= herbLoss
    sect.resources.prestige = Math.max(0, sect.resources.prestige - 15)

    // 弟子损耗
    let discipleLost = 0
    if (state.disciples.length > 0) {
      const losses = Math.min(state.disciples.length, Math.floor(1 + rng() * 2))
      for (let i = 0; i < losses; i++) {
        if (rng() < 0.3 && state.disciples.length > 0) {
          state.disciples.pop()
          discipleLost++
        }
      }
    }

    // 建筑损坏（随机降低一级）
    let buildingDamaged = ''
    const buildingIds = Object.keys(sect.buildings).filter(id => sect.buildings[id] > 0)
    if (buildingIds.length > 0 && rng() < 0.4) {
      const target = buildingIds[Math.floor(rng() * buildingIds.length)]
      sect.buildings[target] = Math.max(0, sect.buildings[target] - 1)
      buildingDamaged = `${buildingLabel(target)} 降级`
    }

    ai.warExhaustion += 5

    await showDialog(`宗门防御战 · ${ai.name}`, [
      `${ai.name} 来犯！`,
      `敌方攻击力 ${attackPower}`,
      `我方防御力 ${defensePower}`,
      '防御失败！宗门遭劫！',
      `损失灵石 ${stoneLoss}，灵草 ${herbLoss}`,
      discipleLost > 0 ? `弟子折损 ${discipleLost} 人` : '弟子无伤亡',
      buildingDamaged || '建筑未受损',
      `声望 -15`,
    ])
    toast(`宗门被 ${ai.name} 攻破！`, '#f87171')
  }

  saveGame(state)
  input.clearQueues()
}

/** 攻击资源点 */
export async function attackResourceNode(
  state: GameState,
  node: ResourceNode,
  aiSects: AiSect[],
): Promise<void> {
  input.clearQueues()
  const sect = state.sect
  if (!sect) { input.clearQueues(); return }

  const buildingCount = Object.values(sect.buildings).filter(v => v > 0).length
  const playerPower = calcSectPower(sect.level, buildingCount, sectDisciplePower(state.disciples), sect.resources)
  const rng = makeRng(Date.now() % 2147483647)

  // 驻军强度
  const garrison = node.garrison
  const attackPower = playerPower * (0.5 + rng() * 0.3)
  const success = attackPower > garrison

  // 扣减弟子（参战消耗）
  if (state.disciples.length > 0) {
    const losses = Math.min(state.disciples.length, Math.floor(1 + rng() * 2))
    for (let i = 0; i < losses; i++) {
      const d = state.disciples[state.disciples.length - 1 - i]
      if (d && rng() < 0.3) {
        state.disciples.splice(state.disciples.length - 1 - i, 1)
      }
    }
  }

  if (success) {
    const oldOwner = node.ownerId
    node.ownerId = 'player'
    node.garrison = Math.floor(playerPower * 0.3)
    sfx('sfx_levelup')

    // 奖励
    const prod = node.production
    const reward: string[] = ['攻占成功！']
    if (prod.stone) { sect.resources.stone += prod.stone * 2; reward.push(`灵石 +${prod.stone * 2}`) }
    if (prod.herb) { sect.resources.herb += prod.herb * 2; reward.push(`灵草 +${prod.herb * 2}`) }
    if (prod.ore) { sect.resources.ore += prod.ore * 2; reward.push(`矿石 +${prod.ore * 2}`) }
    if (prod.wood) { sect.resources.wood += prod.wood * 2; reward.push(`木材 +${prod.wood * 2}`) }
    sect.resources.prestige += 5
    reward.push('声望 +5')

    if (oldOwner && oldOwner !== 'player') {
      const ai = aiSects.find(a => a.id === oldOwner)
      if (ai) {
        ai.relationValue = Math.max(-100, ai.relationValue - 30)
        ai.warExhaustion += 10
        reward.push(`与 ${ai.name} 关系大幅下降`)
      }
    }

    await showDialog(`攻占 ${node.name}`, reward)
    toast(`占领 ${node.name}！`, '#34d399')
  } else {
    sfx('sfx_hit')
    sect.resources.stone -= Math.floor(50 + rng() * 50)
    node.garrison = Math.floor(node.garrison * 0.7)

    const oldOwner = node.ownerId
    if (oldOwner && oldOwner !== 'player') {
      const ai = aiSects.find(a => a.id === oldOwner)
      if (ai) {
        ai.relationValue = Math.max(-100, ai.relationValue - 20)
      }
    }

    await showDialog(`攻击 ${node.name}`, [
      '攻击失败！驻军太强。',
      `损失灵石 ${Math.floor(50 + rng() * 50)}`,
    ])
    toast(`攻打 ${node.name} 失败`, '#f87171')
  }

  saveGame(state)
  input.clearQueues()
}

/** 资源点每 tick 产出 */
export function processResourceIncome(state: GameState, nodes: ResourceNode[]): void {
  const sect = state.sect
  if (!sect) return
  for (const node of nodes) {
    if (node.ownerId === 'player' && !node.contested) {
      const p = node.production
      if (p.stone) sect.resources.stone += p.stone
      if (p.herb) sect.resources.herb += p.herb
      if (p.ore) sect.resources.ore += p.ore
      if (p.wood) sect.resources.wood += p.wood
    }
  }
}

/** 发动宗门战（大规模战争） */
export async function launchSectWar(
  state: GameState,
  ai: AiSect,
): Promise<void> {
  input.clearQueues()
  const sect = state.sect
  if (!sect) { input.clearQueues(); return }

  const buildingCount = Object.values(sect.buildings).filter(v => v > 0).length
  const playerPower = calcSectPower(sect.level, buildingCount, sectDisciplePower(state.disciples), sect.resources)
  const rng = makeRng(Date.now() % 2147483647)

  // 战力对比
  const ratio = playerPower / Math.max(1, ai.power)
  const winChance = Math.min(0.85, Math.max(0.15, 0.5 + (ratio - 1) * 0.3))
  const won = rng() < winChance

  // 损耗
  const myLosses = Math.floor(sect.resources.stone * (0.1 + rng() * 0.2))
  const enemyLosses = Math.floor(ai.resources.stone * (0.1 + rng() * 0.2))
  sect.resources.stone -= myLosses
  ai.resources.stone -= enemyLosses
  ai.warExhaustion += 20
  ai.relationValue = Math.max(-100, ai.relationValue - 15)

  // 弟子损耗
  const discipleLosses = Math.min(state.disciples.length, Math.floor(1 + rng() * 3))
  for (let i = 0; i < discipleLosses; i++) {
    if (rng() < 0.4 && state.disciples.length > 0) {
      state.disciples.pop()
    }
  }
  ai.discipleCount = Math.max(0, ai.discipleCount - Math.floor(1 + rng() * 3))

  if (won) {
    ai.power = Math.floor(ai.power * 0.8)
    ai.warExhaustion += 15
    sect.resources.prestige += 15

    // 判断是否达到灭宗条件
    const canDestroy = ai.power < 100 || ai.warExhaustion >= 100

    if (canDestroy) {
      ai.atWar = false
      sfx('sfx_levelup')

      const choice = await showDialog(`宗门战 · ${ai.name}`, [
        '大获全胜！对方宗门已无力抵抗！',
        `缴获灵石 ${enemyLosses}`,
        `损失灵石 ${myLosses}`,
        `声望 +15`,
        `${ai.name} 残存：战力${ai.power}，弟子${ai.discipleCount}，灵石${ai.resources.stone}`,
        '请选择处置方式：',
      ], [
        { label: '吞并宗门', value: 'annex' },
        { label: '收为附庸', value: 'vassalize' },
        { label: '彻底摧毁', value: 'destroy' },
      ])

      if (choice === 'annex') {
        await annexSect(state, ai)
      } else if (choice === 'vassalize') {
        await vassalizeSect(state, ai)
      } else {
        await destroySect(state, ai)
      }
    } else {
      sfx('sfx_levelup')
      await showDialog(`宗门战 · ${ai.name}`, [
        '宗门战胜利！',
        `缴获灵石 ${enemyLosses}`,
        `损失灵石 ${myLosses}`,
        `声望 +15`,
        `对方战力下降`,
      ])
      toast(`击败 ${ai.name}！`, '#34d399')
    }
    onSectWarWon(state)
  } else {
    sect.resources.prestige = Math.max(0, sect.resources.prestige - 10)
    sfx('sfx_hit')
    await showDialog(`宗门战 · ${ai.name}`, [
      '宗门战失利！',
      `损失灵石 ${myLosses}`,
      `声望 -10`,
      '对方也有所损耗',
    ])
    toast(`败于 ${ai.name}`, '#f87171')
  }

  saveGame(state)
  input.clearQueues()
}

/** 吞并宗门：吸收弟子、资源、领地 */
async function annexSect(state: GameState, ai: AiSect): Promise<void> {
  const sect = state.sect
  if (!sect) return

  const gainedStone = Math.floor(ai.resources.stone * 0.7)
  const gainedHerb = Math.floor(ai.resources.herb * 0.7)
  const gainedOre = Math.floor(ai.resources.ore * 0.7)
  const gainedWood = Math.floor(ai.resources.wood * 0.7)
  sect.resources.stone += gainedStone
  sect.resources.herb += gainedHerb
  sect.resources.ore += gainedOre
  sect.resources.wood += gainedWood

  const absorbedDisciples = Math.floor(ai.discipleCount * 0.4)
  ai.discipleCount -= absorbedDisciples

  let nodesGained = 0
  if (state.resourceNodes) {
    for (const node of state.resourceNodes) {
      if (node.ownerId === ai.id) {
        node.ownerId = 'player'
        node.garrison = Math.floor(node.garrison * 0.5)
        nodesGained++
      }
    }
  }

  sect.resources.prestige += 30
  ai.defeated = true
  ai.vassalOf = null
  ai.atWar = false

  sfx('sfx_levelup')
  await showDialog(`吞并 ${ai.name}`, [
    '宗门已吞并！所有资源、弟子、领地归你所有！',
    `获得灵石 +${gainedStone}，灵草 +${gainedHerb}，矿石 +${gainedOre}，木材 +${gainedWood}`,
    `吸收弟子 +${absorbedDisciples}`,
    `占领资源点 ${nodesGained} 处`,
    `声望 +30`,
  ])
  toast(`已吞并 ${ai.name}！`, '#fbbf24')
}

/** 收为附庸：定期进贡，保留自治 */
async function vassalizeSect(state: GameState, ai: AiSect): Promise<void> {
  const sect = state.sect
  if (!sect) return

  ai.vassalOf = 'player'
  ai.tributeRate = 0.25
  ai.rebellionChance = 0.05
  ai.originalPower = Math.max(ai.originalPower, ai.power)
  ai.atWar = false
  ai.alliance = false
  ai.tradeAgreement = false
  ai.relationValue = -20
  ai.warExhaustion = 0

  let nodesGained = 0
  if (state.resourceNodes) {
    for (const node of state.resourceNodes) {
      if (node.ownerId === ai.id) {
        node.ownerId = 'player'
        node.garrison = Math.floor(node.garrison * 0.3)
        nodesGained++
      }
    }
  }

  sect.resources.prestige += 20

  sfx('sfx_levelup')
  await showDialog(`附庸 ${ai.name}`, [
    `${ai.name} 已成为你的附庸宗门！`,
    `每 5 分钟进贡 ${Math.floor(ai.tributeRate * 100)}% 资源`,
    `占领资源点 ${nodesGained} 处`,
    `声望 +20`,
    '注意：附庸可能叛乱！',
  ])
  toast(`${ai.name} 已成为附庸！`, '#a78bfa')
}

/** 彻底摧毁宗门 */
async function destroySect(state: GameState, ai: AiSect): Promise<void> {
  const sect = state.sect
  if (!sect) return

  const gainedStone = Math.floor(ai.resources.stone * 0.3)
  sect.resources.stone += gainedStone
  sect.resources.prestige += 15

  ai.defeated = true
  ai.vassalOf = null
  ai.atWar = false
  ai.power = 0
  ai.discipleCount = 0

  sfx('sfx_levelup')
  await showDialog(`摧毁 ${ai.name}`, [
    `${ai.name} 已被彻底摧毁！`,
    `获得残余灵石 +${gainedStone}`,
    `声望 +15`,
    '此宗门从世间除名。',
  ])
  toast(`已摧毁 ${ai.name}！`, '#f87171')
}

/** 附庸进贡结算（每 5 分钟调用一次，见 WorldScene diplomacyTimer） */
export function processVassalTribute(state: GameState, aiSects: AiSect[]): void {
  const sect = state.sect
  if (!sect) return
  for (const ai of aiSects) {
    if (ai.defeated || ai.vassalOf !== 'player') continue
    const rate = ai.tributeRate || 0.2
    const stoneTribute = Math.floor(ai.resources.stone * rate)
    const herbTribute = Math.floor(ai.resources.herb * rate)
    const oreTribute = Math.floor(ai.resources.ore * rate)
    const woodTribute = Math.floor(ai.resources.wood * rate)
    ai.resources.stone -= stoneTribute
    ai.resources.herb -= herbTribute
    ai.resources.ore -= oreTribute
    ai.resources.wood -= woodTribute
    sect.resources.stone += stoneTribute
    sect.resources.herb += herbTribute
    sect.resources.ore += oreTribute
    sect.resources.wood += woodTribute
  }
}

/** 检查附庸叛乱（每 tick 调用） */
export function checkRebellion(state: GameState, aiSects: AiSect[], rng: () => number): string[] {
  const sect = state.sect
  if (!sect) return []
  const buildingCount = Object.values(sect.buildings).filter(v => v > 0).length
  const playerPower = calcSectPower(sect.level, buildingCount, sectDisciplePower(state.disciples), sect.resources)
  const events: string[] = []

  for (const ai of aiSects) {
    if (ai.defeated || ai.vassalOf !== 'player') continue
    if (rng() < ai.rebellionChance) {
      ai.vassalOf = null
      ai.atWar = true
      ai.relationValue = -80
      ai.rebellionChance = 0
      ai.power = Math.floor(ai.originalPower * (0.6 + rng() * 0.3))
      events.push(`${ai.name} 叛乱！宣布独立并向你宣战！`)
    }
  }

  return events
}
