// ---------- 大地图随机事件系统 ----------

import { randInt } from './core'

type Rng = () => number
import { isNight, seasonOf, type WorldTime } from './world-time'

export type WorldEventType =
  | 'monster_ambush'
  | 'treasure_find'
  | 'wandering_cultivator'
  | 'rescue'
  | 'merchant_caravan'
  | 'spirit_tide'
  | 'herb_discovery'
  | 'ore_discovery'
  | 'beast_pack'
  | 'ancestor_relic'
  | 'cultivation_insight'
  | 'fog_trap'

export interface WorldEvent {
  type: WorldEventType
  title: string
  description: string
  choices: WorldEventChoice[]
}

export interface WorldEventChoice {
  label: string
  /** 战斗 = 进入地下城战斗场景；事件内结算不进战斗 */
  outcome: 'battle' | 'reward' | 'leave' | 'teleport_home'
  reward?: {
    gold?: number
    exp?: number
    insight?: number
    materials?: Record<string, number>
    hpCost?: number
    dungeonRegion?: string
    dungeonFloor?: number
    dungeonDifficulty?: number
  }
  text: string
}

const EVENT_TYPES: WorldEventType[] = [
  'monster_ambush', 'treasure_find', 'wandering_cultivator', 'rescue',
  'merchant_caravan', 'spirit_tide', 'herb_discovery', 'ore_discovery',
  'beast_pack', 'ancestor_relic', 'cultivation_insight', 'fog_trap',
]

/** 生成一个随机事件，根据时间/季节/玩家状态调整概率 */
export function rollWorldEvent(
  rng: Rng,
  time: WorldTime,
  playerLevel: number,
): WorldEvent {
  const night = isNight(time)
  const season = seasonOf(time.month)

  // 夜晚偏向战斗/危险事件，白天偏向发现/奇遇
  const weighted: WorldEventType[] = []
  const pushN = (type: WorldEventType, n: number) => { for (let i = 0; i < n; i++) weighted.push(type) }

  pushN('monster_ambush', night ? 4 : 2)
  pushN('treasure_find', night ? 1 : 3)
  pushN('wandering_cultivator', 2)
  pushN('rescue', night ? 3 : 2)
  pushN('merchant_caravan', night ? 1 : 2)
  pushN('spirit_tide', 1)
  pushN('herb_discovery', season === '春' ? 4 : season === '冬' ? 1 : 2)
  pushN('ore_discovery', 2)
  pushN('beast_pack', season === '夏' ? 4 : 2)
  pushN('ancestor_relic', 1)
  pushN('cultivation_insight', season === '冬' ? 3 : 1)
  pushN('fog_trap', night ? 3 : 1)

  const type = weighted[randInt(rng, 0, weighted.length - 1)]
  return buildEvent(type, rng, playerLevel)
}

function buildEvent(type: WorldEventType, rng: Rng, level: number): WorldEvent {
  switch (type) {
    case 'monster_ambush':
      return {
        type, title: '妖兽伏击！',
        description: '草丛中突然窜出一头妖兽，张牙舞爪向你扑来！',
        choices: [
          { label: '拔剑迎战', outcome: 'battle', text: '进入战斗！', reward: { dungeonRegion: 'qm', dungeonFloor: 1, dungeonDifficulty: 0 } },
          { label: '绕道逃离', outcome: 'leave', text: '你迅速绕开妖兽，但耗费了些气力。', reward: { hpCost: 20 } },
        ],
      }
    case 'treasure_find':
      return {
        type, title: '奇遇 · 前辈洞府',
        description: '你发现一处隐蔽的洞府，门上刻有古老的符文。推门而入，内有前人遗留的宝物。',
        choices: [
          { label: '搜寻宝物', outcome: 'reward', text: '获得灵石与材料！', reward: { gold: 80 + level * 10, materials: { tupo: Math.random() < 0.3 ? 1 : 0 } } },
          { label: '仔细参悟壁上剑痕', outcome: 'reward', text: '你从剑痕中参悟了些许道理。', reward: { insight: 5 + randInt(rng, 0, 5), gold: 30 } },
          { label: '离开', outcome: 'leave', text: '你决定不去打扰前人清净。' },
        ],
      }
    case 'wandering_cultivator':
      return {
        type, title: '路遇散修',
        description: '一位游历四方的散修正在树下歇脚，见你走来微微一笑：「道友可有兴致切磋一二？或交流些消息？」',
        choices: [
          { label: '切磋比试', outcome: 'battle', text: '散修欣然应战！', reward: { dungeonRegion: 'qm', dungeonFloor: 1, dungeonDifficulty: 0 } },
          { label: '交流情报', outcome: 'reward', text: '散修告知你一处灵脉的位置，并赠予些灵石。', reward: { gold: 50, insight: 3 } },
          { label: '拱手告别', outcome: 'leave', text: '你与散修拱手作别，各奔前程。' },
        ],
      }
    case 'rescue':
      return {
        type, title: '救人于危难',
        description: '远处传来呼救声！一名修士正被数只妖兽围攻，情况危急。',
        choices: [
          { label: '出手相救', outcome: 'battle', text: '你冲入战团，妖兽转而攻向你！', reward: { dungeonRegion: 'qm', dungeonFloor: 2, dungeonDifficulty: 0 } },
          { label: '暗中观察', outcome: 'reward', text: '妖兽散去后，修士遗落了一袋灵石。', reward: { gold: 60 } },
          { label: '悄然离开', outcome: 'leave', text: '你不想卷入麻烦，快步离开。' },
        ],
      }
    case 'merchant_caravan':
      return {
        type, title: '行商驼队',
        description: '一支驼队在路边歇脚，领头的商人热情招呼：「道友！稀有货品，童叟无欺！」',
        choices: [
          { label: '购买灵石包', outcome: 'reward', text: '花费灵石获得材料包。', reward: { gold: -50, materials: { tupo: 1 } } },
          { label: '购买功法残卷', outcome: 'reward', text: '花费灵石购得一卷功法残页。', reward: { gold: -100, insight: 15 } },
          { label: '婉拒', outcome: 'leave', text: '你向商人道谢后继续赶路。' },
        ],
      }
    case 'spirit_tide':
      return {
        type, title: '天地异象 · 灵气潮汐',
        description: '天地间灵气突然涌动，浓郁得几乎化为实质！你感到丹田内真元翻涌。',
        choices: [
          { label: '就地修炼', outcome: 'reward', text: '灵气潮汐中修炼，事半功倍！', reward: { insight: 10 + randInt(rng, 0, 10), exp: 50 + level * 5 } },
          { label: '尝试突破', outcome: 'reward', text: '你尝试借势突破，有所感悟。', reward: { insight: 8, materials: { tupo: Math.random() < 0.4 ? 1 : 0 } } },
        ],
      }
    case 'herb_discovery':
      const herbCount = 1 + randInt(rng, 0, 2)
      return {
        type, title: '发现灵草',
        description: `路旁一丛灵草散发着淡淡药香，你辨认出是炼丹材料。共${herbCount}株可采。`,
        choices: [
          { label: '小心采摘', outcome: 'reward', text: `采得灵草${herbCount}株。`, reward: { materials: { herb: herbCount } } },
          { label: '连根带走', outcome: 'reward', text: '你连根带土挖走，但品质略降。', reward: { materials: { herb: herbCount + 1, tupo: 0 } } },
          { label: '不取', outcome: 'leave', text: '你留下灵草，让它继续生长。' },
        ],
      }
    case 'ore_discovery':
      const oreCount = 1 + randInt(rng, 0, 2)
      return {
        type, title: '矿脉露头',
        description: `岩壁上露出一片矿石，闪烁着金属光泽。约有${oreCount}块可采。`,
        choices: [
          { label: '敲击采集', outcome: 'reward', text: `获得矿石${oreCount}块。`, reward: { materials: { ore: oreCount } } },
          { label: '深入探矿', outcome: 'reward', text: '你向深处挖掘，有意外收获！', reward: { materials: { ore: oreCount + 1 }, gold: 30 } },
          { label: '离开', outcome: 'leave', text: '矿石太重，你决定轻装赶路。' },
        ],
      }
    case 'beast_pack':
      return {
        type, title: '兽群出没！',
        description: '前方传来阵阵嘶吼，一群妖兽正在巡猎！它们已经发现了你！',
        choices: [
          { label: '正面迎战', outcome: 'battle', text: '你握紧武器，迎向兽群！', reward: { dungeonRegion: 'qm', dungeonFloor: 2, dungeonDifficulty: 1 } },
          { label: '绕路躲避', outcome: 'leave', text: '你小心翼翼地绕开兽群领地，耽搁了些时间。', reward: { hpCost: 10 } },
        ],
      }
    case 'ancestor_relic':
      return {
        type, title: '前辈遗宝',
        description: '你在偏僻处发现一具修士遗骸，手中还握着一件法宝。遗骸旁刻着：「有缘者得之」。',
        choices: [
          { label: '取走遗宝', outcome: 'reward', text: '获得一件前辈遗留的宝物！', reward: { gold: 100 + level * 15, materials: { tupo: Math.random() < 0.5 ? 1 : 0 } } },
          { label: '入土为安', outcome: 'reward', text: '你为前辈整理遗容，心中有所感悟。', reward: { insight: 15, gold: 40 } },
        ],
      }
    case 'cultivation_insight':
      return {
        type, title: '修炼感悟',
        description: '行至一处灵秀之地，你心中忽然有所触动，仿佛触摸到了大道的一丝痕迹。',
        choices: [
          { label: '就地感悟', outcome: 'reward', text: '你盘膝静坐，悟道点提升！', reward: { insight: 8 + randInt(rng, 0, 8) } },
          { label: '继续赶路', outcome: 'leave', text: '机缘稍纵即逝，你选择继续前行。' },
        ],
      }
    case 'fog_trap':
      return {
        type, title: '迷雾陷阱',
        description: '四周突然涌起浓雾，你完全迷失了方向！在雾中转了许久，好不容易才走出来。',
        choices: [
          { label: '强撑着走出去', outcome: 'reward', text: '你耗尽气力终于走出迷雾，但消耗颇大。', reward: { hpCost: 30, insight: 3 } },
          { label: '原地等待雾散', outcome: 'leave', text: '你耐心等待，雾终于散去，但耽误了不少时间。', reward: { hpCost: 5 } },
        ],
      }
  }
}

/** 检查是否应该触发随机事件 */
export function shouldTriggerEvent(
  moveAccumulator: number,
  baseRate: number,
): boolean {
  return moveAccumulator >= baseRate
}
