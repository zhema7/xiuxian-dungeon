// ---------- 深层事件链 ----------
// 跨场景、跨时间的大剧情，多阶段展开

import type { GameState } from './state'
import type { WorldTime } from './world-time'

// ===== 事件链定义 =====

export type EventChainId =
  | 'fallen_sword'      // 堕剑录：一柄魔剑引发的连环事件
  | 'immortal_legacy'   // 仙道遗产：远古仙人的传承争夺
  | 'demon_resurgence'  // 魔道复兴：魔修势力的卷土重来
  | 'world_crisis'      // 天地劫难：世界级危机事件
  | 'blood_debt'        // 血债：一桩灭门惨案的追凶

export type ChainStage =
  | 'intro'      // 引入
  | 'investigate' // 调查
  | 'conflict'   // 冲突
  | 'climax'     // 高潮
  | 'resolution' // 结局

export interface ChainEvent {
  stage: ChainStage
  title: string
  description: string
  /** 触发条件 */
  trigger: {
    minChapter?: number        // 需完成的事件链章节
    minLevel?: number
    minRealm?: number
    minDaysElapsed?: number    // 距离事件链开始最少天数
    location?: string          // 需在特定地点
    probability?: number       // 触发概率
  }
  choices: ChainChoice[]
  /** 完成后的效果 */
  onComplete: {
    nextStage?: ChainStage
    karmaImpact?: number
    moralityImpact?: number
    worldEvolutionScore?: number
    rewards?: {
      gold?: number
      insight?: number
      exp?: number
      items?: Record<string, number>
    }
  }
}

export interface ChainChoice {
  label: string
  text: string
  branchTag?: string
  karmaImpact?: number
  moralityImpact?: number
  insight?: number
  exp?: number
}

// ===== 事件链配置 =====

export const EVENT_CHAINS: Record<EventChainId, {
  id: EventChainId
  name: string
  desc: string
  stages: ChainEvent[]
}> = {
  fallen_sword: {
    id: 'fallen_sword',
    name: '堕剑录',
    desc: '一柄被封印的魔剑现世，持剑者皆陷入疯狂',
    stages: [
      {
        stage: 'intro',
        title: '魔剑出世',
        description: '大地震颤，一道黑光冲天而起。远处传来诡异的剑鸣声。你赶到时，只见一柄漆黑长剑插在裂开的地面中，周围散落着数具尸体。',
        trigger: { minLevel: 20, minRealm: 1, probability: 0.1 },
        choices: [
          { label: '拔剑', text: '你握住剑柄，一股杀意涌入脑海……你勉强抵抗住了。', branchTag: 'wielder', karmaImpact: -10, moralityImpact: -5 },
          { label: '重新封印', text: '你以真元加固封印，暂时压制了魔剑。', karmaImpact: 5, moralityImpact: 5 },
          { label: '离开并记录', text: '你记下位置，决定调查清楚再行动。', branchTag: 'researcher' },
        ],
        onComplete: {
          nextStage: 'investigate',
          rewards: { insight: 15 },
        },
      },
      {
        stage: 'investigate',
        title: '追查魔剑来历',
        description: '你四处打探，得知魔剑名为「噬魂」，是千年前一位魔道剑修的遗物。每当封印减弱，便会引来血灾。',
        trigger: { minChapter: 0, minDaysElapsed: 7, probability: 0.2 },
        choices: [
          { label: '深入魔道古籍', text: '你在藏经阁中找到了关于噬魂剑的记载。', insight: 10, branchTag: 'scholar' },
          { label: '寻找知情者', text: '你找到了一位当年参与封印的前辈。', karmaImpact: 5 },
        ],
        onComplete: {
          nextStage: 'conflict',
          rewards: { insight: 25, gold: 200 },
          worldEvolutionScore: 3,
        },
      },
      {
        stage: 'conflict',
        title: '剑灵苏醒',
        description: '魔剑的剑灵在你的调查中苏醒，试图蛊惑你。同时，其他觊觎魔剑的修士也找上门来。',
        trigger: { minChapter: 1, minLevel: 30, minRealm: 2, probability: 0.3 },
        choices: [
          { label: '以意志压制剑灵', text: '你与剑灵进行了精神层面的较量，最终压制了它。', karmaImpact: 10, moralityImpact: 5, branchTag: 'master' },
          { label: '与剑灵谈判', text: '你试图与剑灵达成协议——它借你力量，你帮它解封。', branchTag: 'pact', karmaImpact: -15, moralityImpact: -10 },
          { label: '击退觊觎者', text: '你赶走了来犯的修士，但魔剑的消息已经传开。', karmaImpact: 0 },
        ],
        onComplete: {
          nextStage: 'climax',
          rewards: { insight: 30, exp: 500, gold: 300 },
          worldEvolutionScore: 5,
        },
      },
      {
        stage: 'climax',
        title: '魔剑争夺战',
        description: '各方势力齐聚，围绕魔剑展开了最终争夺。你必须做出抉择：利用魔剑的力量，还是彻底将其封印？',
        trigger: { minChapter: 2, minLevel: 40, minRealm: 3, probability: 0.5 },
        choices: [
          { label: '彻底封印魔剑', text: '你集合众人之力，将噬魂剑永久封印。天下太平，你声名远扬。', branchTag: 'seal_forever', karmaImpact: 30, moralityImpact: 20 },
          { label: '掌控魔剑', text: '你以大毅力掌控了噬魂剑，成为新的剑主。力量暴涨，但心魔也加深了。', branchTag: 'dark_master', karmaImpact: -30, moralityImpact: -15 },
          { label: '销毁魔剑', text: '你选择将魔剑熔毁，释放其中被困的亡魂。', branchTag: 'destroy', karmaImpact: 15, moralityImpact: 10 },
        ],
        onComplete: {
          nextStage: 'resolution',
          rewards: { insight: 50, gold: 500, items: { tupo: 3 } },
          worldEvolutionScore: 10,
        },
      },
      {
        stage: 'resolution',
        title: '余波',
        description: '魔剑事件尘埃落定。你的选择将影响未来的走向。',
        trigger: { minChapter: 3, minDaysElapsed: 3 },
        choices: [
          { label: '回顾这段经历', text: '你静心回顾，感悟良多。', insight: 20 },
        ],
        onComplete: {
          rewards: { insight: 20, exp: 300 },
          worldEvolutionScore: 5,
        },
      },
    ],
  },

  immortal_legacy: {
    id: 'immortal_legacy',
    name: '仙道遗产',
    desc: '远古仙人的传承现世，引动天下风云',
    stages: [
      {
        stage: 'intro',
        title: '仙缘初现',
        description: '你在一处古迹中发现了一枚仙令，上面刻着古老的符文。仙令微微发光，似乎在指引着什么方向。',
        trigger: { minLevel: 25, minRealm: 2, probability: 0.08 },
        choices: [
          { label: '追随仙令指引', text: '仙令引领你来到一处隐秘的山谷。', branchTag: 'follower' },
          { label: '参悟仙令符文', text: '你试图理解仙令上的符文，获得了一丝感悟。', insight: 15 },
        ],
        onComplete: { nextStage: 'investigate', rewards: { insight: 15 } },
      },
      {
        stage: 'investigate',
        title: '传承之谜',
        description: '山谷中有一座古老的洞府，门上刻着：「吾道传于有缘者。然传承非免费，需以三试炼证道心。」',
        trigger: { minChapter: 0, minDaysElapsed: 5, probability: 0.15 },
        choices: [
          { label: '接受三试炼', text: '你毅然踏入洞府，开始接受考验。', branchTag: 'challenger', karmaImpact: 5 },
          { label: '先在外参悟', text: '你在外围参悟阵纹，获得了些许感悟。', insight: 10 },
        ],
        onComplete: { nextStage: 'conflict', rewards: { insight: 20, gold: 100 }, worldEvolutionScore: 3 },
      },
      {
        stage: 'conflict',
        title: '争夺传承',
        description: '仙令的消息泄露，多位修士前来争夺传承。你必须在试炼中击败他们，才能获得仙人的认可。',
        trigger: { minChapter: 1, minLevel: 35, minRealm: 3, probability: 0.25 },
        choices: [
          { label: '正面对决', text: '你逐一击败来犯修士，展现了实力与道心。', karmaImpact: 10, moralityImpact: 5 },
          { label: '智取传承', text: '你利用洞府阵法困住对手，独自获取了传承。', branchTag: 'cunning', karmaImpact: -5 },
        ],
        onComplete: { nextStage: 'climax', rewards: { insight: 35, exp: 600, gold: 400 }, worldEvolutionScore: 5 },
      },
      {
        stage: 'climax',
        title: '仙人遗泽',
        description: '你通过了最终试炼，仙人的虚影出现在你面前。「吾道终于有了传人。」他挥手间，大量修为感悟涌入你的识海。',
        trigger: { minChapter: 2, minLevel: 45, minRealm: 3, probability: 0.4 },
        choices: [
          { label: '跪拜受传承', text: '你跪拜仙人虚影，正式成为传承者。', karmaImpact: 15, moralityImpact: 10, branchTag: 'inheritor' },
          { label: '「我走自己的道」', text: '你婉拒了传承身份，但接受了仙人的指点。', branchTag: 'independent', karmaImpact: 5, insight: 10 },
        ],
        onComplete: {
          nextStage: 'resolution',
          rewards: { insight: 60, gold: 800, items: { tupo: 4 } },
          worldEvolutionScore: 10,
        },
      },
      {
        stage: 'resolution',
        title: '传承之后',
        description: '你获得了仙人的传承，但也引来了更多觊觎。修仙之路，永无止境。',
        trigger: { minChapter: 3, minDaysElapsed: 5 },
        choices: [
          { label: '闭关消化传承', text: '你闭关消化传承中的感悟，实力大增。', insight: 30, exp: 500 },
        ],
        onComplete: { rewards: { insight: 30, exp: 500 }, worldEvolutionScore: 5 },
      },
    ],
  },

  demon_resurgence: {
    id: 'demon_resurgence',
    name: '魔道复兴',
    desc: '沉寂多年的魔道势力暗中壮大，意欲颠覆正道秩序',
    stages: [
      {
        stage: 'intro',
        title: '魔气蔓延',
        description: '你注意到最近各地魔气渐浓，一些小宗门莫名失踪。这似乎不是巧合。',
        trigger: { minLevel: 30, minRealm: 2, probability: 0.06 },
        choices: [
          { label: '调查魔气来源', text: '你循着魔气追踪，发现了一个地下魔修据点。', karmaImpact: 5 },
          { label: '通知附近宗门', text: '你将消息告知附近宗门，引起了警惕。', moralityImpact: 5 },
        ],
        onComplete: { nextStage: 'investigate', rewards: { insight: 15 }, worldEvolutionScore: 2 },
      },
      {
        stage: 'investigate',
        title: '魔道组织',
        description: '你深入调查，发现一个名为「血冥宗」的魔道组织正在暗中壮大，其首领据说是一位突破失败的散修所化。',
        trigger: { minChapter: 0, minDaysElapsed: 10, probability: 0.15 },
        choices: [
          { label: '潜入血冥宗', text: '你伪装潜入，获得了大量情报。', branchTag: 'infiltrator', insight: 20 },
          { label: '联合正道宗门', text: '你联合数个正道宗门，准备围剿。', karmaImpact: 10, moralityImpact: 5 },
        ],
        onComplete: { nextStage: 'conflict', rewards: { insight: 25, gold: 200 }, worldEvolutionScore: 3 },
      },
      {
        stage: 'conflict',
        title: '正魔大战',
        description: '正道与魔道的全面冲突爆发。你身处其中，必须选择立场。',
        trigger: { minChapter: 1, minLevel: 40, minRealm: 3, probability: 0.2 },
        choices: [
          { label: '站在正道一方', text: '你带领正道修士攻入血冥宗总部。', karmaImpact: 20, moralityImpact: 10 },
          { label: '暗中挑拨双方', text: '你在两方之间制造矛盾，坐收渔利。', branchTag: 'manipulator', karmaImpact: -20, moralityImpact: -10 },
        ],
        onComplete: { nextStage: 'climax', rewards: { insight: 30, exp: 600, gold: 300 }, worldEvolutionScore: 5 },
      },
      {
        stage: 'climax',
        title: '血冥宗主',
        description: '血冥宗主现身，其修为远超预期。一场恶战不可避免。',
        trigger: { minChapter: 2, minLevel: 50, minRealm: 4, probability: 0.3 },
        choices: [
          { label: '全力斩杀', text: '你拼尽全力，终于斩杀了血冥宗主！', karmaImpact: 25, moralityImpact: 15, branchTag: 'slayer' },
          { label: '封印替代斩杀', text: '你选择封印血冥宗主，留下活口。', karmaImpact: 10, moralityImpact: 5, branchTag: 'sealer' },
        ],
        onComplete: {
          nextStage: 'resolution',
          rewards: { insight: 50, gold: 600, items: { tupo: 5 } },
          worldEvolutionScore: 15,
        },
      },
      {
        stage: 'resolution',
        title: '魔道余波',
        description: '血冥宗覆灭后，残余魔修四散。正道虽然获胜，但也损失惨重。',
        trigger: { minChapter: 3, minDaysElapsed: 7 },
        choices: [
          { label: '追剿残余', text: '你追剿残余魔修，维护一方安宁。', karmaImpact: 10 },
          { label: '休养生息', text: '你选择休养生息，将精力投入修炼。', insight: 25 },
        ],
        onComplete: { rewards: { insight: 25, exp: 400 }, worldEvolutionScore: 5 },
      },
    ],
  },

  world_crisis: {
    id: 'world_crisis',
    name: '天地劫难',
    desc: '天地异变，一场波及整个修仙界的灾难正在酝酿',
    stages: [
      {
        stage: 'intro',
        title: '天象异常',
        description: '天空中出现了异样的星象，星辰错位，日月无光。各地修士议论纷纷，似乎要有大事发生。',
        trigger: { minLevel: 40, minRealm: 3, probability: 0.04 },
        choices: [
          { label: '参悟天象', text: '你尝试参悟天象，隐约感知到一场劫难将至。', insight: 20 },
          { label: '向高人请教', text: '你找到一位前辈请教，他面色凝重。', karmaImpact: 5 },
        ],
        onComplete: { nextStage: 'investigate', rewards: { insight: 20 }, worldEvolutionScore: 3 },
      },
      {
        stage: 'investigate',
        title: '劫难之源',
        description: '你查明劫难之源在一处上古遗迹中，天地灵脉的平衡正在被打破。',
        trigger: { minChapter: 0, minDaysElapsed: 10, probability: 0.1 },
        choices: [
          { label: '前往灵脉核心', text: '你深入灵脉核心，发现了一处正在崩坏的阵法。', branchTag: 'core' },
          { label: '召集修士商议', text: '你召集各方修士共商对策。', karmaImpact: 10, moralityImpact: 5 },
        ],
        onComplete: { nextStage: 'conflict', rewards: { insight: 30, gold: 200 }, worldEvolutionScore: 5 },
      },
      {
        stage: 'conflict',
        title: '天劫降临',
        description: '天地劫难正式降临——灵气暴走，妖兽暴动，空间裂缝遍布。你必须稳定灵脉。',
        trigger: { minChapter: 1, minLevel: 50, minRealm: 4, probability: 0.15 },
        choices: [
          { label: '独自修复灵脉', text: '你以一己之力修复灵脉，虽然艰难但卓有成效。', branchTag: 'solo', karmaImpact: 15, moralityImpact: 10 },
          { label: '指挥众人协作', text: '你组织众人分工协作，效率更高。', karmaImpact: 20, moralityImpact: 15 },
        ],
        onComplete: { nextStage: 'climax', rewards: { insight: 40, exp: 800, gold: 500 }, worldEvolutionScore: 10 },
      },
      {
        stage: 'climax',
        title: '劫难终局',
        description: '在所有人的努力下，天地劫难终于被平息。灵脉重归平衡，天空恢复清明。',
        trigger: { minChapter: 2, minLevel: 55, minRealm: 4, probability: 0.25 },
        choices: [
          { label: '吸收残余天地之力', text: '你吸收了劫难残余的天地之力，修为大增。', insight: 50, exp: 1000, branchTag: 'absorber' },
          { label: '散归于天地', text: '你将残余之力散归于天地，造福苍生。', karmaImpact: 30, moralityImpact: 20, branchTag: 'sage' },
        ],
        onComplete: {
          nextStage: 'resolution',
          rewards: { insight: 80, gold: 1000, items: { tupo: 5 } },
          worldEvolutionScore: 25,
        },
      },
      {
        stage: 'resolution',
        title: '新纪元',
        description: '劫难过后，修仙界迎来了新的纪元。你因平息劫难而名垂青史。',
        trigger: { minChapter: 3, minDaysElapsed: 5 },
        choices: [
          { label: '继续修行', text: '你选择继续修行，追求更高的境界。', insight: 40 },
        ],
        onComplete: { rewards: { insight: 40, exp: 600 }, worldEvolutionScore: 10 },
      },
    ],
  },

  blood_debt: {
    id: 'blood_debt',
    name: '血债',
    desc: '一桩灭门惨案的背后，隐藏着惊天阴谋',
    stages: [
      {
        stage: 'intro',
        title: '灭门惨案',
        description: '你路过一处被灭门的宗门遗址，残垣断壁中弥漫着血腥气。一个微弱的声音在呼唤……',
        trigger: { minLevel: 25, minRealm: 2, probability: 0.08 },
        choices: [
          { label: '调查现场', text: '你仔细搜索，发现了一个幸存的弟子。', branchTag: 'rescuer', moralityImpact: 5 },
          { label: '追踪凶手痕迹', text: '你循着凶手留下的痕迹追踪而去。', karmaImpact: 5 },
        ],
        onComplete: { nextStage: 'investigate', rewards: { insight: 15, gold: 100 } },
      },
      {
        stage: 'investigate',
        title: '追凶之路',
        description: '幸存弟子告诉你，凶手是一位声名显赫的「正道」前辈。这背后似乎隐藏着更大的阴谋。',
        trigger: { minChapter: 0, minDaysElapsed: 7, probability: 0.12 },
        choices: [
          { label: '暗中搜集证据', text: '你暗中搜集证据，准备揭露真相。', branchTag: 'detective', insight: 15 },
          { label: '直接质问', text: '你直接找上那位前辈质问，对方矢口否认。', karmaImpact: -5 },
        ],
        onComplete: { nextStage: 'conflict', rewards: { insight: 25, gold: 200 }, worldEvolutionScore: 3 },
      },
      {
        stage: 'conflict',
        title: '真相大白',
        description: '你找到了确凿证据——那位前辈为了独占一处秘境，灭门了整个宗门。但他背后还有更大的势力。',
        trigger: { minChapter: 1, minLevel: 35, minRealm: 3, probability: 0.2 },
        choices: [
          { label: '公开真相', text: '你向天下公开真相，那位前辈身败名裂。', karmaImpact: 20, moralityImpact: 15, branchTag: 'justice' },
          { label: '私下解决', text: '你选择私下解决，亲手为灭门案复仇。', karmaImpact: 0, moralityImpact: -5, branchTag: 'avenger' },
        ],
        onComplete: { nextStage: 'climax', rewards: { insight: 30, exp: 500, gold: 300 }, worldEvolutionScore: 5 },
      },
      {
        stage: 'climax',
        title: '幕后黑手',
        description: '幕后势力现身——原来是一个以灭门搜集资源的黑暗组织。你必须将其连根拔起。',
        trigger: { minChapter: 2, minLevel: 45, minRealm: 3, probability: 0.3 },
        choices: [
          { label: '联合各宗剿灭', text: '你联合各方宗门，一举剿灭了黑暗组织。', karmaImpact: 25, moralityImpact: 15 },
          { label: '独自潜入摧毁', text: '你独自潜入组织总部，从内部将其摧毁。', branchTag: 'infiltrator', karmaImpact: 10, moralityImpact: 5 },
        ],
        onComplete: {
          nextStage: 'resolution',
          rewards: { insight: 50, gold: 600, items: { tupo: 4 } },
          worldEvolutionScore: 12,
        },
      },
      {
        stage: 'resolution',
        title: '沉冤昭雪',
        description: '黑暗组织覆灭，灭门惨案终于沉冤昭雪。你站在遗址前，为亡魂上香。',
        trigger: { minChapter: 3, minDaysElapsed: 3 },
        choices: [
          { label: '为亡魂超度', text: '你为亡魂诵经超度，心中一片安宁。', karmaImpact: 10, moralityImpact: 10 },
        ],
        onComplete: { rewards: { insight: 30, exp: 400 }, worldEvolutionScore: 5 },
      },
    ],
  },
}

// ===== 事件链进度管理 =====

export function getChainProgress(state: GameState, chainId: EventChainId): number {
  const key = `chain_${chainId}`
  return (state as any)[key] || -1 // -1 = 未开始
}

export function setChainProgress(state: GameState, chainId: EventChainId, stageIndex: number): void {
  const key = `chain_${chainId}`
  ;(state as any)[key] = stageIndex
}

// ===== 检查事件链是否可触发 =====

export function checkChainTrigger(state: GameState, chainId: EventChainId): ChainEvent | null {
  const chain = EVENT_CHAINS[chainId]
  const progress = getChainProgress(state, chainId)

  // 已完成所有阶段
  if (progress >= chain.stages.length - 1) return null

  // 下一阶段
  const nextStage = chain.stages[progress + 1]
  if (!nextStage) return null

  // 检查触发条件
  const t = nextStage.trigger
  if (t.minLevel && state.level < t.minLevel) return null
  if (t.minRealm && state.realm < t.minRealm) return null
  if (t.probability && Math.random() > t.probability) return null

  return nextStage
}

// ===== 完成事件链阶段 =====

export function completeChainStage(
  state: GameState,
  chainId: EventChainId,
  stageIndex: number,
): { rewards: string[]; chainComplete: boolean } {
  const chain = EVENT_CHAINS[chainId]
  const event = chain.stages[stageIndex]
  if (!event) return { rewards: [], chainComplete: false }

  const messages: string[] = []
  const r = event.onComplete.rewards
  if (r) {
    if (r.gold) { state.gold += r.gold; messages.push(`灵石+${r.gold}`) }
    if (r.insight) { state.insight = (state.insight || 0) + r.insight; messages.push(`悟道点+${r.insight}`) }
    if (r.exp) { state.exp += r.exp; messages.push(`经验+${r.exp}`) }
    if (r.items) {
      for (const [k, v] of Object.entries(r.items)) {
        state.materials[k] = (state.materials[k] || 0) + v
        messages.push(`${k}+${v}`)
      }
    }
  }

  // 因果业力
  if (event.onComplete.karmaImpact) {
    state.karma = (state.karma || 0) + event.onComplete.karmaImpact
  }
  if (event.onComplete.moralityImpact) {
    state.morality = (state.morality || 0) + event.onComplete.moralityImpact
  }
  if (event.onComplete.worldEvolutionScore) {
    state.worldEvolutionScore = (state.worldEvolutionScore || 0) + event.onComplete.worldEvolutionScore
  }

  // 更新进度
  setChainProgress(state, chainId, stageIndex)

  const chainComplete = stageIndex >= chain.stages.length - 1
  if (chainComplete) {
    messages.push(`事件链「${chain.name}」圆满完结！`)
    state.worldEvolutionScore = (state.worldEvolutionScore || 0) + 10
  }

  return { rewards: messages, chainComplete }
}

// ===== 检查所有事件链 =====

export function checkAllChains(state: GameState): { chainId: EventChainId; event: ChainEvent } | null {
  for (const chainId of Object.keys(EVENT_CHAINS) as EventChainId[]) {
    const event = checkChainTrigger(state, chainId)
    if (event) return { chainId, event }
  }
  return null
}
