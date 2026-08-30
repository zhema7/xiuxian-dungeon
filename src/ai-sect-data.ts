// ---------- AI 宗门势力数据定义 ----------

/** AI 宗门性格倾向 */
export type AiSectDisposition = 'aggressive' | 'diplomatic' | 'isolationist' | 'expansionist' | 'mercantile'

/** 外交关系状态 */
export type DiplomacyStatus = 'war' | 'hostile' | 'neutral' | 'friendly' | 'allied' | 'vassal'

/** AI 宗门定义（运行时） */
export interface AiSect {
  id: string
  name: string
  level: number                          // 宗门等级
  power: number                          // 综合战力
  disposition: AiSectDisposition          // 性格倾向
  mapX: number                            // 大地图位置
  mapY: number
  resources: { stone: number; herb: number; ore: number; wood: number }
  discipleCount: number                  // 弟子数量
  relationValue: number                  // 外交值 (-100~100)
  tradeAgreement: boolean
  alliance: boolean
  atWar: boolean
  warExhaustion: number                   // 战争疲劳 (0~100)
  cooldownUntil: number                   // 行动冷却时间戳
  defeated: boolean
  color: number                           // 势力标识色
  vassalOf: string | null                // 附庸于谁的宗门ID（'player' 或 AI宗门ID）
  tributeRate: number                    // 附庸进贡比例 (0~1)
  rebellionChance: number                // 叛乱概率 (0~1)
  originalPower: number                   // 被附庸前的原始战力（用于叛乱评估）
  attackTimer: number                     // 下次攻击时间戳（ms），0=未安排
}

/** 资源点定义 */
export interface ResourceNode {
  id: string
  name: string
  x: number
  y: number
  type: 'spirit_mine' | 'herb_field' | 'ore_vein' | 'wood_forest' | 'spirit_spring'
  ownerId: string | null                 // null=无主, 'player'=玩家, ai-sect-id=AI宗门
  garrison: number                        // 驻军战力
  production: { stone?: number; herb?: number; ore?: number; wood?: number }
  contested: boolean                     // 是否正在争夺
}

/** 外交行动类型 */
export type DiplomacyActionType =
  | 'send_envoy'
  | 'propose_trade'
  | 'propose_alliance'
  | 'declare_war'
  | 'request_tribute'
  | 'sign_peace'
  | 'scout'

/** 外交行动定义 */
export interface DiplomacyActionDef {
  type: DiplomacyActionType
  name: string
  desc: string
  cost: { stone?: number; prestige?: number }
  relationReq: number                     // 所需最低外交值
  cooldown: number                        // 冷却时间（ms）
}

/** 外交行动配置 */
export const DIPLOMACY_ACTIONS: Record<DiplomacyActionType, DiplomacyActionDef> = {
  send_envoy: {
    type: 'send_envoy', name: '派遣使者', desc: '派遣使者改善关系，外交值+8~15',
    cost: { stone: 100 }, relationReq: -100, cooldown: 120000,
  },
  propose_trade: {
    type: 'propose_trade', name: '提议通商', desc: '签订贸易协定，每小时双方宗门获得额外资源',
    cost: { stone: 200 }, relationReq: 10, cooldown: 300000,
  },
  propose_alliance: {
    type: 'propose_alliance', name: '提议结盟', desc: '结为同盟，互相支援，共享部分资源产出',
    cost: { stone: 500, prestige: 20 }, relationReq: 50, cooldown: 600000,
  },
  declare_war: {
    type: 'declare_war', name: '宣战', desc: '向对方宣战，可争夺资源点，但双方都有损失',
    cost: { prestige: 10 }, relationReq: -100, cooldown: 60000,
  },
  request_tribute: {
    type: 'request_tribute', name: '要求进贡', desc: '以武力胁迫对方进贡资源',
    cost: {}, relationReq: -50, cooldown: 300000,
  },
  sign_peace: {
    type: 'sign_peace', name: '签订和约', desc: '结束战争状态，恢复正常外交',
    cost: { stone: 300 }, relationReq: -100, cooldown: 60000,
  },
  scout: {
    type: 'scout', name: '斥候侦查', desc: '侦查对方宗门实力和资源情况',
    cost: { stone: 50 }, relationReq: -100, cooldown: 60000,
  },
}

/** AI 宗门名字组件 */
const SECT_PREFIX = ['苍', '玄', '青', '紫', '赤', '金', '玉', '幽', '天', '灵', '太', '无', '九', '万', '太虚', '混元', '上清', '玉清']
const SECT_SUFFIX = ['剑宗', '丹宗', '器宗', '符宗', '阵宗', '灵宗', '魔宗', '佛宗', '道宗', '兽宗', '花宗', '星宗', '雷宗', '冰宗', '火宗']

/** 随机生成 AI 宗门名 */
export function generateAiSectName(rng: () => number): string {
  const p = SECT_PREFIX[Math.floor(rng() * SECT_PREFIX.length)]
  const s = SECT_SUFFIX[Math.floor(rng() * SECT_SUFFIX.length)]
  return `${p}${s}`
}

/** 生成 AI 宗门 */
export function generateAiSect(rng: () => number, playerLevel: number, index: number): AiSect {
  const name = generateAiSectName(rng)
  const level = Math.max(1, playerLevel + Math.floor(rng() * 5) - 2)
  const dispositions: AiSectDisposition[] = ['aggressive', 'diplomatic', 'isolationist', 'expansionist', 'mercantile']
  const disposition = dispositions[Math.floor(rng() * dispositions.length)]
  const colors = [0xef4444, 0xf59e0b, 0x10b981, 0x3b82f6, 0xa78bfa, 0xec4899, 0x06b6d4, 0xf97316]
  const color = colors[index % colors.length]

  const power = Math.floor((200 + level * 80) * (0.8 + rng() * 0.5))
  const baseRelation = disposition === 'aggressive' ? -20 : disposition === 'diplomatic' ? 10 : 0

  return {
    id: `ai_sect_${index}`,
    name,
    level,
    power,
    disposition,
    mapX: 200 + Math.floor(rng() * 800),
    mapY: 300 + Math.floor(rng() * 1000),
    resources: {
      stone: Math.floor(300 + rng() * 500),
      herb: Math.floor(100 + rng() * 300),
      ore: Math.floor(80 + rng() * 200),
      wood: Math.floor(150 + rng() * 300),
    },
    discipleCount: Math.floor(3 + level * 2 + rng() * 5),
    relationValue: baseRelation,
    tradeAgreement: false,
    alliance: false,
    atWar: false,
    warExhaustion: 0,
    cooldownUntil: 0,
    defeated: false,
    color,
    vassalOf: null,
    tributeRate: 0,
    rebellionChance: 0,
    originalPower: power,
    attackTimer: 0,
  }
}

/** 生成资源点 */
export function generateResourceNodes(rng: () => number): ResourceNode[] {
  const types: ResourceNode['type'][] = ['spirit_mine', 'herb_field', 'ore_vein', 'wood_forest', 'spirit_spring']
  const names: Record<ResourceNode['type'], string> = {
    spirit_mine: '灵石矿脉',
    herb_field: '灵草野',
    ore_vein: '矿石矿脉',
    wood_forest: '灵木林',
    spirit_spring: '灵泉眼',
  }
  const prod: Record<ResourceNode['type'], ResourceNode['production']> = {
    spirit_mine: { stone: 50 },
    herb_field: { herb: 30 },
    ore_vein: { ore: 25 },
    wood_forest: { wood: 40 },
    spirit_spring: { stone: 20, herb: 10 },
  }
  const nodes: ResourceNode[] = []
  for (let i = 0; i < 8; i++) {
    const type = types[i % types.length]
    nodes.push({
      id: `resource_${i}`,
      name: names[type],
      x: 150 + Math.floor(rng() * 900),
      y: 250 + Math.floor(rng() * 1200),
      type,
      ownerId: i < 3 ? null : `ai_sect_${Math.floor(i / 2)}`,
      garrison: Math.floor(50 + rng() * 200),
      production: prod[type],
      contested: false,
    })
  }
  return nodes
}

/** 获取外交状态 */
export function getDiplomacyStatus(relationValue: number, atWar: boolean, alliance: boolean, vassalOf?: string | null): DiplomacyStatus {
  if (vassalOf) return 'vassal'
  if (atWar) return 'war'
  if (alliance) return 'allied'
  if (relationValue >= 60) return 'friendly'
  if (relationValue >= 10) return 'neutral'
  if (relationValue >= -30) return 'hostile'
  return 'hostile'
}

/** 外交状态中文名 */
export function diplomacyStatusName(status: DiplomacyStatus): string {
  const names: Record<DiplomacyStatus, string> = {
    war: '交战',
    hostile: '敌对',
    neutral: '中立',
    friendly: '友好',
    allied: '同盟',
    vassal: '附庸',
  }
  return names[status]
}

/** AI 性格描述 */
export function dispositionDesc(d: AiSectDisposition): string {
  const descs: Record<AiSectDisposition, string> = {
    aggressive: '好战',
    diplomatic: '善交',
    isolationist: '封闭',
    expansionist: '扩张',
    mercantile: '重商',
  }
  return descs[d]
}

/** AI 决策：是否接受外交提议 */
export function aiAcceptDiplomacy(
  ai: AiSect,
  action: DiplomacyActionType,
  playerPower: number,
  rng: () => number,
): { accept: boolean; reason: string } {
  const powerRatio = playerPower / Math.max(1, ai.power)
  const relation = ai.relationValue

  switch (action) {
    case 'send_envoy':
      return { accept: true, reason: '使者受到接待' }

    case 'propose_trade':
      if (ai.disposition === 'mercantile') return { accept: true, reason: '对方乐于通商' }
      if (relation < 10) return { accept: false, reason: '关系不足，拒绝通商' }
      if (ai.disposition === 'isolationist') return { accept: false, reason: '对方闭关锁国，拒绝通商' }
      return { accept: rng() > 0.3, reason: rng() > 0.3 ? '对方同意通商' : '对方婉拒了通商提议' }

    case 'propose_alliance':
      if (relation < 50) return { accept: false, reason: '关系不足，无法结盟' }
      if (ai.disposition === 'aggressive') return { accept: false, reason: '好战宗门不愿结盟' }
      if (powerRatio < 0.5) return { accept: false, reason: '对方看不起你的实力' }
      return { accept: rng() > 0.2, reason: rng() > 0.2 ? '对方同意结盟' : '对方暂不考虑结盟' }

    case 'declare_war':
      return { accept: true, reason: '战争已开始' }

    case 'request_tribute':
      if (powerRatio < 1.5) return { accept: false, reason: '对方实力不弱，拒绝进贡' }
      if (ai.disposition === 'aggressive') return { accept: false, reason: '好战宗门宁死不从' }
      return { accept: rng() > 0.4, reason: rng() > 0.4 ? '对方被迫进贡' : '对方拒绝了进贡要求' }

    case 'sign_peace':
      if (ai.warExhaustion > 50) return { accept: true, reason: '对方厌战，同意和谈' }
      if (relation < -50) return { accept: false, reason: '对方恨你入骨，拒绝和谈' }
      return { accept: rng() > 0.3, reason: rng() > 0.3 ? '对方同意和谈' : '对方拒绝了和谈' }

    case 'scout':
      return { accept: true, reason: '侦查完成' }
  }
  return { accept: false, reason: '无效操作' }
}

/** AI 宗门每 tick 行为 */
export function aiSectTick(ai: AiSect, playerPower: number, rng: () => number): string | null {
  if (ai.defeated) return null
  if (Date.now() < ai.cooldownUntil) return null

  // 资源累积
  const gain = ai.level * 5
  ai.resources.stone += gain
  ai.resources.herb += Math.floor(gain * 0.5)
  ai.resources.ore += Math.floor(gain * 0.4)
  ai.resources.wood += Math.floor(gain * 0.6)

  // 战力随等级缓慢增长
  if (rng() < 0.1) ai.power += Math.floor(ai.level * 5)

  // 战争疲劳衰减
  if (ai.warExhaustion > 0) ai.warExhaustion = Math.max(0, ai.warExhaustion - 2)

  // 附庸行为：进贡 + 叛乱评估
  if (ai.vassalOf === 'player') {
    // 附庸进贡（每 tick 转移部分资源给玩家宗门）
    ai.tributeRate = ai.tributeRate || 0.2
    // 附庸战力缓慢恢复（但不超原始战力）
    if (ai.power < ai.originalPower && rng() < 0.15) {
      ai.power += Math.floor(ai.level * 3)
    }
    // 叛乱概率评估：玩家战力下降时附庸更可能叛乱
    const powerRatio = ai.power / Math.max(1, playerPower)
    if (powerRatio > 0.8 && ai.warExhaustion < 30) {
      ai.rebellionChance = Math.min(0.8, ai.rebellionChance + 0.02)
    } else {
      ai.rebellionChance = Math.max(0, ai.rebellionChance - 0.01)
    }
    // 好战性格的附庸更容易叛乱
    if (ai.disposition === 'aggressive') {
      ai.rebellionChance = Math.min(0.9, ai.rebellionChance + 0.01)
    }
    return null
  }

  // 非附庸的常规行为
  const powerRatio = ai.power / Math.max(1, playerPower)

  switch (ai.disposition) {
    case 'aggressive':
      if (ai.atWar) {
        if (ai.warExhaustion > 70 && rng() < 0.5) return `${ai.name} 厌战，有意和谈`
        if (powerRatio > 1.2 && rng() < 0.3) return `${ai.name} 在战争中占据上风`
        if (ai.attackTimer === 0) ai.attackTimer = Date.now() + 180000 + Math.floor(rng() * 300000)
      } else {
        if (powerRatio > 1.5 && ai.relationValue < -30 && rng() < 0.2) {
          ai.relationValue -= 10
          return `${ai.name} 对你的宗门虎视眈眈`
        }
      }
      break

    case 'expansionist':
      if (ai.atWar && ai.attackTimer === 0) {
        ai.attackTimer = Date.now() + 300000 + Math.floor(rng() * 300000)
      }
      if (rng() < 0.15) {
        ai.discipleCount += Math.floor(1 + rng() * 2)
        return `${ai.name} 招收新弟子，实力增长`
      }
      break

    case 'mercantile':
      if (!ai.tradeAgreement && ai.relationValue > 20 && rng() < 0.2) {
        return `${ai.name} 有意与你通商`
      }
      break

    case 'diplomatic':
      if (ai.relationValue < 50 && rng() < 0.15) {
        ai.relationValue += 5
        return `${ai.name} 派遣使者改善关系`
      }
      break

    case 'isolationist':
      // 很少行动
      break
  }

  // 战争中的攻击触发
  if (ai.atWar && ai.attackTimer > 0 && Date.now() >= ai.attackTimer) {
    ai.attackTimer = 0
    return `__ATTACK__:${ai.id}`
  }

  // 随机关系波动
  if (rng() < 0.05) {
    const delta = Math.floor(rng() * 6) - 3
    ai.relationValue = Math.max(-100, Math.min(100, ai.relationValue + delta))
  }

  return null
}

/** 计算宗门综合战力 */
export function calcSectPower(
  level: number,
  buildingCount: number,
  discipleCount: number,
  resources: { stone: number; herb: number; ore: number; wood: number },
): number {
  const buildingPower = buildingCount * 50
  const disciplePower = discipleCount * 30
  const resourcePower = Math.floor((resources.stone + resources.ore + resources.wood) * 0.1)
  return Math.floor((200 + level * 80 + buildingPower + disciplePower + resourcePower) * 1.0)
}
