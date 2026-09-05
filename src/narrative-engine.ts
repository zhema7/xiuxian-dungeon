// ---------- 程序化叙事引擎 ----------
// 故事模板 + 变量填充 + 一致性约束 + 玩家介入改写

import type { ProceduralNpc } from './procedural-npc'

// ===== 模板定义 =====

interface BackgroundTemplate {
  background: string
  description: string
  compatibleTraits: string[]
}

interface TurningTemplate {
  turning: string
  description: string
  incompatibleGoals: string[]
  minRealm: number
  maxRealm: number
}

interface GoalTemplate {
  goal: string
  description: string
  compatibleTraits: string[]
}

// ===== 背景模板库 =====

const BACKGROUND_TEMPLATES: BackgroundTemplate[] = [
  {
    background: '寒门子弟',
    description: '出身贫寒，自幼父母双亡，在乡野间艰难求生。某日偶遇一游方道人，被相中灵根，带入仙途。',
    compatibleTraits: ['刚正', '坚韧', '淡泊', '谨慎'],
  },
  {
    background: '世家嫡子',
    description: '生于修仙世家，自幼接受族中最好的培养。但家族期望如山，压得喘不过气来。',
    compatibleTraits: ['热情', '好战', '贪婪', '刚正'],
  },
  {
    background: '宗门遗孤',
    description: '宗门在一次变故中衰落，作为少数幸存者，肩负复兴宗门的使命。',
    compatibleTraits: ['刚正', '孤僻', '谨慎', '淡泊'],
  },
  {
    background: '魔修遗脉',
    description: '祖上曾是魔修，被正道围剿后隐姓埋名。体内流传着魔道功法，时时刻刻受到诱惑。',
    compatibleTraits: ['狡诈', '孤僻', '好战', '贪婪'],
  },
  {
    background: '商贾之家',
    description: '出身商贾世家，自幼见惯了利益交换。修仙对他们来说，也是一种投资。',
    compatibleTraits: ['贪婪', '热情', '狡诈', '谨慎'],
  },
  {
    background: '散修传承',
    description: '师承一介散修，虽无宗门背景，但所传功法颇为独特，不循常规。',
    compatibleTraits: ['淡泊', '孤僻', '刚正', '热情'],
  },
  {
    background: '猎户出身',
    description: '本是山中猎户，因追踪猎物误入一处灵脉，开启灵根，踏入修途。',
    compatibleTraits: ['好战', '谨慎', '刚正', '淡泊'],
  },
  {
    background: '书香门第',
    description: '出身书香世家，饱读诗书，后悟出书中道韵，以文入道。',
    compatibleTraits: ['淡泊', '刚正', '孤僻', '谨慎'],
  },
  {
    background: '武将之后',
    description: '将门之后，自幼习武。后在战场上顿悟杀伐大道，转入修途。',
    compatibleTraits: ['好战', '刚正', '热情', '狡诈'],
  },
  {
    background: '妖族混血',
    description: '人妖混血，自小被两族排斥。体内妖力与人道灵力交织，修途坎坷。',
    compatibleTraits: ['孤僻', '好战', '狡诈', '刚正'],
  },
]

// ===== 转折模板库 =====

const TURNING_TEMPLATES: TurningTemplate[] = [
  {
    turning: '家族被灭',
    description: '家族在一夜之间被仇家灭门，只有{{name}}因外出采药而幸免于难。自此踏上复仇之路。',
    incompatibleGoals: ['守护宗门', '富甲天下'],
    minRealm: 0,
    maxRealm: 5,
  },
  {
    turning: '误入仙缘',
    description: '在一次采药途中误入古修洞府，获得传承玉简，从此踏入修仙之途。',
    incompatibleGoals: [],
    minRealm: 0,
    maxRealm: 3,
  },
  {
    turning: '情伤入道',
    description: '曾与一凡人相恋，对方寿尽而亡。{{name}}深受打击，悟出"长生大道"，以情入道。',
    incompatibleGoals: ['报仇雪恨'],
    minRealm: 0,
    maxRealm: 4,
  },
  {
    turning: '被逐师门',
    description: '因理念不合被师门逐出，带着一身所学流落江湖，心中不甘。',
    incompatibleGoals: ['守护宗门'],
    minRealm: 0,
    maxRealm: 5,
  },
  {
    turning: '得遇明师',
    description: '在一次濒死之际被一高人相救，收为关门弟子，从此修行一日千里。',
    incompatibleGoals: ['报仇雪恨'],
    minRealm: 0,
    maxRealm: 3,
  },
  {
    turning: '功法反噬',
    description: '修炼功法过急，导致经脉受损，修为倒退。正在寻找修复之法。',
    incompatibleGoals: ['飞升长生'],
    minRealm: 1,
    maxRealm: 6,
  },
  {
    turning: '血脉觉醒',
    description: '体内沉睡的上古血脉突然觉醒，获得远超常人的天赋，但也引来觊觎。',
    incompatibleGoals: [],
    minRealm: 0,
    maxRealm: 7,
  },
  {
    turning: '魔念侵蚀',
    description: '在一次历练中被魔气侵蚀，时刻与魔念抗争。稍有不慎便会入魔。',
    incompatibleGoals: ['飞升长生'],
    minRealm: 0,
    maxRealm: 6,
  },
  {
    turning: '传承争夺',
    description: '在一处秘境中获得古修传承，但被同门/同道追杀，辗转逃亡。',
    incompatibleGoals: ['守护宗门', '光复宗门'],
    minRealm: 1,
    maxRealm: 5,
  },
  {
    turning: '道侣陨落',
    description: '道侣在一次历练中陨落，{{name}}心如死灰，但发誓要查清真相。',
    incompatibleGoals: ['逍遥自在'],
    minRealm: 1,
    maxRealm: 6,
  },
  {
    turning: '奇遇得宝',
    description: '在一处荒废遗迹中意外获得一件异宝，但消息走漏，引来无数麻烦。',
    incompatibleGoals: ['逍遥自在'],
    minRealm: 0,
    maxRealm: 4,
  },
  {
    turning: '闭关悟道',
    description: '在一处灵气充沛之地闭关百年，悟出一门独属自己的功法。',
    incompatibleGoals: ['报仇雪恨'],
    minRealm: 2,
    maxRealm: 7,
  },
  {
    turning: '被诬陷',
    description: '被诬陷杀害同门，百口莫辩，被迫逃离宗门，暗中调查真凶。',
    incompatibleGoals: ['守护宗门'],
    minRealm: 0,
    maxRealm: 5,
  },
  {
    turning: '妖兽契约',
    description: '与一只灵智初开的妖兽结下契约，共同修炼，互相扶持。',
    incompatibleGoals: [],
    minRealm: 0,
    maxRealm: 4,
  },
  {
    turning: '前世记忆',
    description: '修炼中偶然觉醒前世记忆，发现自己曾是一位大能转世。',
    incompatibleGoals: [],
    minRealm: 1,
    maxRealm: 7,
  },
  {
    turning: '宗门被灭',
    description: '宗门被敌对势力攻破，{{name}}带着宗门最后的传承逃出，发誓复仇重建。',
    incompatibleGoals: ['逍遥自在', '富甲天下'],
    minRealm: 0,
    maxRealm: 5,
  },
  {
    turning: '因祸得福',
    description: '在一次濒死经历中，灵根发生异变，虽然过程痛苦，但天赋大增。',
    incompatibleGoals: ['报仇雪恨'],
    minRealm: 0,
    maxRealm: 3,
  },
  {
    turning: '遭遇邪修',
    description: '在一次历练中遭遇邪修围攻，同伴尽皆陨落，只有{{name}}侥幸逃脱。',
    incompatibleGoals: ['逍遥自在'],
    minRealm: 0,
    maxRealm: 5,
  },
  {
    turning: '灵脉被夺',
    description: '家族灵脉被强夺，修为停滞不前，正在寻找新的灵脉或机缘。',
    incompatibleGoals: ['飞升长生'],
    minRealm: 0,
    maxRealm: 4,
  },
  {
    turning: '天劫降世',
    description: '修炼突破时引动天劫，虽然渡过但身受重伤，正在恢复中。',
    incompatibleGoals: [],
    minRealm: 2,
    maxRealm: 7,
  },
]

// ===== 目标模板库 =====

const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    goal: '飞升长生',
    description: '追求大道，誓要飞升上界，不受轮回之苦。',
    compatibleTraits: ['刚正', '淡泊', '谨慎'],
  },
  {
    goal: '报仇雪恨',
    description: '心中有深仇大恨，誓要让仇人付出代价。',
    compatibleTraits: ['刚正', '好战', '狡诈'],
  },
  {
    goal: '扬名立万',
    description: '要让天下人知道自己的名字，成为一方豪杰。',
    compatibleTraits: ['热情', '好战', '贪婪'],
  },
  {
    goal: '守护宗门',
    description: '以守护宗门为己任，愿为宗门赴汤蹈火。',
    compatibleTraits: ['刚正', '热情', '淡泊'],
  },
  {
    goal: '逍遥自在',
    description: '不慕名利，只求逍遥天地间，做一个快乐散修。',
    compatibleTraits: ['淡泊', '孤僻', '热情'],
  },
  {
    goal: '寻访亲人',
    description: '有至亲失散多年，发誓要找到对方的下落。',
    compatibleTraits: ['刚正', '热情', '谨慎'],
  },
  {
    goal: '光复宗门',
    description: '宗门衰落，誓要重振宗门荣光。',
    compatibleTraits: ['刚正', '好战', '谨慎'],
  },
  {
    goal: '追求大道',
    description: '对大道有执着的追求，不问世俗，只问本心。',
    compatibleTraits: ['淡泊', '孤僻', '刚正'],
  },
  {
    goal: '富甲天下',
    description: '要在修仙界做最大的生意，成为灵石大亨。',
    compatibleTraits: ['贪婪', '热情', '狡诈'],
  },
  {
    goal: '名垂青史',
    description: '要在这修仙界留下自己的传说，让后人铭记。',
    compatibleTraits: ['热情', '好战', '刚正'],
  },
]

// ===== 变量填充 =====

function fillVariables(template: string, npc: ProceduralNpc): string {
  return template
    .replace(/\{\{name\}\}/g, npc.name)
    .replace(/\{\{surname\}\}/g, npc.name.charAt(0))
    .replace(/\{\{realm\}\}/g, ['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫'][npc.realm] || '练气')
    .replace(/\{\{age\}\}/g, String(npc.age))
    .replace(/\{\{profession\}\}/g, npc.profession)
    .replace(/\{\{daoPath\}\}/g, npc.daoPath)
}

// ===== 生成完整故事 =====

export interface GeneratedStory {
  background: BackgroundTemplate
  turning: TurningTemplate
  goal: GoalTemplate
  surface: string
  middle: string
  deep: string
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateNarrative(npc: ProceduralNpc): GeneratedStory {
  // 选择背景
  const bg = randomPick(BACKGROUND_TEMPLATES)

  // 选择转折（兼容性检查）
  const compatibleTurnings = TURNING_TEMPLATES.filter(t =>
    t.minRealm <= npc.realm && t.maxRealm >= npc.realm &&
    !t.incompatibleGoals.includes(npc.lifeGoal)
  )
  const turning = randomPick(compatibleTurnings.length > 0 ? compatibleTurnings : TURNING_TEMPLATES)

  // 选择目标
  const compatibleGoals = GOAL_TEMPLATES.filter(g =>
    g.compatibleTraits.some(t => npc.personality.includes(t as any))
  )
  const goal = randomPick(compatibleGoals.length > 0 ? compatibleGoals : GOAL_TEMPLATES)

  // 生成三层故事
  const surface = fillVariables(bg.description, npc)
  const middle = fillVariables(turning.description, npc)
  const deep = fillVariables(goal.description, npc)

  return { background: bg, turning, goal, surface, middle, deep }
}

// ===== 玩家介入改写 =====

export type StoryIntervention =
  | 'help'           // 帮助NPC
  | 'harm'           // 伤害NPC
  | 'recruit'        // 收为弟子
  | 'befriend'       // 结为好友
  | 'reveal_secret'  // 揭示秘密
  | 'avenge'         // 替NPC复仇

export function applyIntervention(
  npc: ProceduralNpc,
  intervention: StoryIntervention,
): string {
  const log = npc.eventLog

  switch (intervention) {
    case 'help':
      log.push(`被玩家帮助，心中感激`)
      return `${npc.name} 对你心存感激，好感度提升`
    case 'harm':
      log.push(`被玩家伤害，怀恨在心`)
      return `${npc.name} 对你怀恨在心，可能伺机报复`
    case 'recruit':
      log.push(`被玩家收为弟子，心中既感激又忐忑`)
      return `${npc.name} 拜入你的门下，成为弟子`
    case 'befriend':
      log.push(`与玩家结为好友`)
      return `${npc.name} 与你结为好友，愿意互帮互助`
    case 'reveal_secret':
      log.push(`秘密被玩家发现，心中不安`)
      return `${npc.name} 的秘密被你发现，对方神色复杂`
    case 'avenge':
      log.push(`玩家替自己报了仇，恩同再造`)
      return `${npc.name} 感你替他复仇，恩同再造`
    default:
      return ''
  }
}
