// ---------- 手工剧情线 + 羁绊技能 ----------
// 5个核心NPC个人线，每条线包含多个章节，完成后解锁羁绊技能

import type { GameState } from './state'
import type { ProceduralNpc } from './procedural-npc'

// ===== 剧情NPC立绘纹理映射 =====
export const STORY_NPC_TEXTURES: Record<StoryLineId, string> = {
  sword_sage: 'npc_sword_sage',
  alchemist_dream: 'npc_alchemist_grandma',
  demon_seal: 'npc_demon_sealer',
  wandering_cloud: 'npc_wandering_cloud',
  spirit_tamer: 'npc_spirit_tamer',
}

// ===== 剧情线定义 =====

export type StoryLineId =
  | 'sword_sage'      // 剑道圣者线：与一位剑修的师徒传承
  | 'alchemist_dream' // 丹道大梦线：与一位炼丹师的忘年之交
  | 'demon_seal'      // 封魔者线：与一位封印师共同镇压魔修
  | 'wandering_cloud' // 云游线：与一位散修的游历天下
  | 'spirit_tamer'    // 灵兽师线：与一位驯兽师的灵兽情缘

export interface StoryChapter {
  index: number
  title: string
  description: string
  /** 触发条件 */
  requirements: {
    minLevel?: number
    minRealm?: number
    minFavor?: number       // 与该NPC最低好感
    prevChapterDone?: number // 上一章需完成
    hasKilledNpc?: string   // 需击杀特定NPC
  }
  /** 章节选项 */
  choices: StoryChoice[]
  /** 完成奖励 */
  rewards: {
    gold?: number
    insight?: number
    exp?: number
    favorGain?: number      // NPC好感变化
    items?: Record<string, number>
    unlockSkillId?: string   // 解锁羁绊技能
  }
}

export interface StoryChoice {
  label: string
  text: string
  /** 剧情分支标记 */
  branchTag?: string
  karmaImpact?: number
  moralityImpact?: number
  favorGain?: number
  insight?: number
}

// ===== 羁绊技能 =====

export interface BondSkill {
  id: string
  name: string
  description: string
  sourceStory: StoryLineId
  sourceNpcName: string
  effects: {
    atkBonus?: number        // 攻击加成
    defBonus?: number        // 防御加成
    hpBonus?: number         // 生命加成
    critBonus?: number       // 暴击加成
    expBonus?: number        // 经验加成
    insightBonus?: number   // 悟道加成
    goldBonus?: number       // 灵石加成
    specialEffect?: string   // 特殊效果描述
  }
}

// ===== 5条剧情线定义 =====

export const STORY_LINES: Record<StoryLineId, {
  id: StoryLineId
  name: string
  npcName: string
  npcDesc: string
  chapters: StoryChapter[]
  bondSkill: BondSkill
}> = {
  sword_sage: {
    id: 'sword_sage',
    name: '剑道传承',
    npcName: '玄阳剑尊',
    npcDesc: '隐居山林的剑道宗师，一生追求剑之极致',
    chapters: [
      {
        index: 1,
        title: '初遇剑痕',
        description: '你在山林中发现一处刻满剑痕的石壁，一位白发老者正在壁前沉思。他注意到你的到来：「你也对剑道感兴趣？」',
        requirements: { minLevel: 10, minFavor: 0 },
        choices: [
          { label: '请教剑道', text: '老者微微点头，开始讲述他的剑道心得。', favorGain: 5, karmaImpact: 0, moralityImpact: 2 },
          { label: '只是路过', text: '老者淡淡看了你一眼，继续沉思。', karmaImpact: 0 },
        ],
        rewards: { insight: 10, favorGain: 5 },
      },
      {
        index: 2,
        title: '剑意共鸣',
        description: '玄阳剑尊带你来到一处剑冢，无数残剑插在土中。「感受它们的剑意，然后告诉我你听到了什么。」',
        requirements: { minLevel: 20, minFavor: 20, prevChapterDone: 1 },
        choices: [
          { label: '「我听到了……不屈」', text: '剑尊露出欣慰的笑容：「好！这就是剑之骨气。」', branchTag: 'resolute', favorGain: 10 },
          { label: '「我听到了……寂灭」', text: '剑尊沉默良久：「寂灭……你比我想的更深。」', branchTag: 'silent', favorGain: 8, insight: 5 },
          { label: '「我什么都听不到」', text: '剑尊叹了口气：「看来缘分未到。」', favorGain: -2 },
        ],
        rewards: { insight: 15, exp: 200, favorGain: 10 },
      },
      {
        index: 3,
        title: '剑道试炼',
        description: '玄阳剑尊要求你与他的剑灵分身对决。「只有在战斗中，才能理解剑的真意。」',
        requirements: { minLevel: 30, minRealm: 2, minFavor: 40, prevChapterDone: 2 },
        choices: [
          { label: '全力一战', text: '你拼尽全力，剑尊的分身终于收剑退去。你感到自己对剑道的理解加深了。', favorGain: 15, karmaImpact: 0 },
          { label: '以柔克刚', text: '你以守代攻，找到了剑尊分身的破绽。剑尊赞许地点头。', branchTag: 'flexible', favorGain: 12 },
        ],
        rewards: { insight: 30, exp: 500, gold: 300, favorGain: 15 },
      },
      {
        index: 4,
        title: '剑道传承',
        description: '玄阳剑尊将一枚剑玉交到你手中。「这是我毕生剑道凝聚。如今传于你，望你走出自己的剑道。」',
        requirements: { minLevel: 40, minRealm: 3, minFavor: 70, prevChapterDone: 3 },
        choices: [
          { label: '跪谢恩师', text: '你跪下行礼，剑尊欣慰地笑了。从此你二人为师徒。', karmaImpact: 10, moralityImpact: 5, favorGain: 20 },
          { label: '「我会超越你」', text: '剑尊大笑：「好！有志气！我等着那一天。」', branchTag: 'ambitious', favorGain: 15 },
        ],
        rewards: { insight: 50, gold: 500, items: { tupo: 3 }, unlockSkillId: 'bond_sword_sage', favorGain: 20 },
      },
    ],
    bondSkill: {
      id: 'bond_sword_sage',
      name: '剑尊之契',
      description: '玄阳剑尊的剑道传承，攻击力+15%，暴击率+10%',
      sourceStory: 'sword_sage',
      sourceNpcName: '玄阳剑尊',
      effects: { atkBonus: 0.15, critBonus: 0.10 },
    },
  },

  alchemist_dream: {
    id: 'alchemist_dream',
    name: '丹道大梦',
    npcName: '药仙婆婆',
    npcDesc: '年迈的炼丹大师，一生炼丹无数，却始终在寻找一味传说中的主药',
    chapters: [
      {
        index: 1,
        title: '药庐相遇',
        description: '你在一座小药庐遇到一位满头银发的老婆婆，她正在为一炉丹药焦头烂额。「年轻人，帮我把那株灵草递过来！」',
        requirements: { minLevel: 8, minFavor: 0 },
        choices: [
          { label: '帮忙递草', text: '婆婆接过灵草，顺利成丹。她笑着递给你一颗丹药。', favorGain: 8, moralityImpact: 3 },
          { label: '询问炼丹之道', text: '婆婆眼睛一亮，开始滔滔不绝地讲起丹道。', favorGain: 5, insight: 3 },
        ],
        rewards: { insight: 8, items: { herb: 5 }, favorGain: 8 },
      },
      {
        index: 2,
        title: '寻药之旅',
        description: '药仙婆婆告诉你，她在寻找传说中的「九转还魂草」，据说只生长在极寒之地。',
        requirements: { minLevel: 18, minFavor: 20, prevChapterDone: 1 },
        choices: [
          { label: '承诺帮她寻找', text: '婆婆感动地握住你的手：「有你这句话，老婆子就放心了。」', favorGain: 12, moralityImpact: 5 },
          { label: '询问草药特征', text: '婆婆仔细描述了九转还魂草的模样，你记在心中。', favorGain: 5, insight: 5 },
        ],
        rewards: { insight: 12, favorGain: 12 },
      },
      {
        index: 3,
        title: '冰原采药',
        description: '你在冰原深处终于找到了九转还魂草，但一头守护灵兽挡在面前。',
        requirements: { minLevel: 28, minRealm: 2, minFavor: 40, prevChapterDone: 2 },
        choices: [
          { label: '与灵兽交涉', text: '你以诚意感动灵兽，它让开了路。你采得还魂草。', branchTag: 'peaceful', favorGain: 15, moralityImpact: 5 },
          { label: '击败灵兽', text: '你硬战取胜，采得还魂草。但心中有些不安。', favorGain: 8, karmaImpact: -5, moralityImpact: -3 },
        ],
        rewards: { insight: 20, exp: 400, items: { herb: 10, tupo: 1 }, favorGain: 15 },
      },
      {
        index: 4,
        title: '九转丹成',
        description: '药仙婆婆用九转还魂草炼成了一炉绝世丹药。她将其中一颗递给你：「这是你应得的。」',
        requirements: { minLevel: 38, minRealm: 3, minFavor: 70, prevChapterDone: 3 },
        choices: [
          { label: '感激接过', text: '婆婆慈祥地笑了：「你是老婆子见过最好的年轻人。」', favorGain: 20, moralityImpact: 5 },
          { label: '请求学习丹道', text: '婆婆欣然应允，将毕生丹道倾囊相授。', branchTag: 'learned', favorGain: 25, insight: 10 },
        ],
        rewards: { insight: 40, gold: 400, items: { tupo: 3 }, unlockSkillId: 'bond_alchemist', favorGain: 20 },
      },
    ],
    bondSkill: {
      id: 'bond_alchemist',
      name: '药仙之契',
      description: '药仙婆婆的丹道传承，悟道+20%，灵石获取+15%',
      sourceStory: 'alchemist_dream',
      sourceNpcName: '药仙婆婆',
      effects: { insightBonus: 0.20, goldBonus: 0.15 },
    },
  },

  demon_seal: {
    id: 'demon_seal',
    name: '封魔者',
    npcName: '封魔使·云清',
    npcDesc: '身世神秘的封印师，独自追查一桩百年前的魔修大案',
    chapters: [
      {
        index: 1,
        title: '夜遇魔气',
        description: '夜晚行路时你感到一股魔气，一位身披斗篷的人正在追踪什么。「你也能感知到魔气？看来你不是普通人。」',
        requirements: { minLevel: 15, minRealm: 1, minFavor: 0 },
        choices: [
          { label: '表明来意', text: '云清点了点头，告诉你她在追踪一个魔修组织。', favorGain: 8 },
          { label: '警惕戒备', text: '云清不以为意：「谨慎是好事。但我是友非敌。」', favorGain: 3 },
        ],
        rewards: { insight: 10, favorGain: 8 },
      },
      {
        index: 2,
        title: '魔修据点',
        description: '云清带你来到一处魔修据点的外围。「我需要你的帮助。里面至少有三个魔修，我们分头行动。」',
        requirements: { minLevel: 25, minRealm: 2, minFavor: 25, prevChapterDone: 1 },
        choices: [
          { label: '正面突入', text: '你与云清正面突入，魔修措手不及！', favorGain: 12, karmaImpact: 5 },
          { label: '暗中破坏阵法', text: '你潜入后方破坏了魔修的护阵，云清顺利突入。', branchTag: 'stealth', favorGain: 15, insight: 8 },
        ],
        rewards: { insight: 18, exp: 350, gold: 200, favorGain: 12 },
      },
      {
        index: 3,
        title: '封魔阵法',
        description: '在据点深处，你们发现了一个正在被解封的远古魔灵。云清开始布阵封印，但需要你护法。',
        requirements: { minLevel: 35, minRealm: 3, minFavor: 50, prevChapterDone: 2 },
        choices: [
          { label: '全力护法', text: '你拼死护住云清，魔灵被封入阵中。云清感激地看着你。', favorGain: 20, moralityImpact: 10 },
          { label: '趁机吸收魔气', text: '你偷偷吸收了一丝魔气，实力暴涨，但云清若有所觉。', branchTag: 'corrupted', favorGain: 5, karmaImpact: -20, moralityImpact: -10 },
        ],
        rewards: { insight: 25, exp: 600, gold: 300, favorGain: 20, items: { tupo: 2 } },
      },
      {
        index: 4,
        title: '百年真相',
        description: '云清告诉你真相：百年前的魔修大案，幕后黑手竟是她曾经的师父。她需要做出抉择。',
        requirements: { minLevel: 45, minRealm: 4, minFavor: 70, prevChapterDone: 3 },
        choices: [
          { label: '陪她面对师父', text: '你陪云清面对她堕落的师父，最终一起将其封印。云清泪流满面，但释然了。', favorGain: 30, karmaImpact: 15, moralityImpact: 10 },
          { label: '替她出手', text: '你主动出手斩杀魔修师父，替云清承担了这份罪孽。她沉默良久，向你深深一拜。', branchTag: 'bearer', favorGain: 25, karmaImpact: -10, moralityImpact: -5 },
        ],
        rewards: { insight: 50, gold: 600, items: { tupo: 4 }, unlockSkillId: 'bond_demon_seal', favorGain: 30 },
      },
    ],
    bondSkill: {
      id: 'bond_demon_seal',
      name: '封魔之契',
      description: '云清的封印传承，防御+20%，生命+15%',
      sourceStory: 'demon_seal',
      sourceNpcName: '封魔使·云清',
      effects: { defBonus: 0.20, hpBonus: 0.15 },
    },
  },

  wandering_cloud: {
    id: 'wandering_cloud',
    name: '云游天下',
    npcName: '云游子',
    npcDesc: '一位洒脱的散修，云游四方，见闻广博，却似乎在逃避什么',
    chapters: [
      {
        index: 1,
        title: '酒馆偶遇',
        description: '在一间路旁酒馆，一位豪爽的散修拉你喝酒。「来来来！相逢即是有缘，干！」他自称云游子。',
        requirements: { minLevel: 12, minFavor: 0 },
        choices: [
          { label: '痛快对饮', text: '云游子大笑着拍了拍你的肩：「好酒量！我喜欢你！」', favorGain: 10 },
          { label: '浅尝即止', text: '云游子不以为意：「也罢，各有各的活法。」', favorGain: 3 },
        ],
        rewards: { insight: 8, gold: 50, favorGain: 10 },
      },
      {
        index: 2,
        title: '同游名山',
        description: '云游子邀你同游一座名山。途中他讲了许多江湖轶事，你听得入迷。',
        requirements: { minLevel: 22, minFavor: 25, prevChapterDone: 1 },
        choices: [
          { label: '分享你的见闻', text: '你与云游子互通见闻，彼此受益匪浅。', branchTag: 'sharing', favorGain: 15, insight: 10 },
          { label: '专心倾听', text: '云游子讲得兴起，你获得了不少感悟。', favorGain: 8, insight: 8 },
        ],
        rewards: { insight: 15, exp: 300, favorGain: 15 },
      },
      {
        index: 3,
        title: '过往心结',
        description: '夜宿山间，云游子喝醉了，吐露了他云游的原因——他在逃避一段旧日的仇怨。',
        requirements: { minLevel: 32, minRealm: 2, minFavor: 45, prevChapterDone: 2 },
        choices: [
          { label: '鼓励他面对', text: '云游子沉默许久，最终点头：「你说得对。逃避不是办法。」', favorGain: 20, moralityImpact: 5 },
          { label: '承诺帮他', text: '云游子感激地看着你：「有你在，我或许真能了结这段恩怨。」', branchTag: 'helper', favorGain: 25 },
        ],
        rewards: { insight: 20, exp: 400, favorGain: 20 },
      },
      {
        index: 4,
        title: '了断恩怨',
        description: '你陪云游子回到故地，面对旧日仇人。一番激战后，恩怨终了。云游子向你深深一拜。',
        requirements: { minLevel: 42, minRealm: 3, minFavor: 70, prevChapterDone: 3 },
        choices: [
          { label: '与他共饮庆功酒', text: '二人在仇人坟前痛饮，从此恩怨两清。', favorGain: 25, karmaImpact: 5 },
          { label: '「以后同行如何？」', text: '云游子大笑：「好！从此你我结为道侣，同游天下！」', branchTag: 'companion', favorGain: 30 },
        ],
        rewards: { insight: 45, gold: 500, items: { tupo: 3 }, unlockSkillId: 'bond_wandering', favorGain: 25 },
      },
    ],
    bondSkill: {
      id: 'bond_wandering',
      name: '云游之契',
      description: '云游子的江湖阅历，经验+20%，暴击+8%',
      sourceStory: 'wandering_cloud',
      sourceNpcName: '云游子',
      effects: { expBonus: 0.20, critBonus: 0.08 },
    },
  },

  spirit_tamer: {
    id: 'spirit_tamer',
    name: '灵兽情缘',
    npcName: '驯兽师·灵犀',
    npcDesc: '年轻的驯兽师，能与灵兽心灵相通，正在寻找失散的灵兽伙伴',
    chapters: [
      {
        index: 1,
        title: '灵兽求救',
        description: '一只受伤的小灵兽拦住你的去路，它身后跟着一位焦急的少女。「求求你帮帮它！」',
        requirements: { minLevel: 10, minFavor: 0 },
        choices: [
          { label: '立刻救治', text: '你为灵兽处理了伤口，少女感激不已。', favorGain: 12, moralityImpact: 5 },
          { label: '提供药物', text: '你给了少女一些药物，她道谢后自行处理。', favorGain: 5 },
        ],
        rewards: { insight: 8, items: { herb: 3 }, favorGain: 12 },
      },
      {
        index: 2,
        title: '驯兽之道',
        description: '灵犀告诉你她在寻找失散的灵兽伙伴「墨麟」。她邀请你学习驯兽之道，以便帮忙寻找。',
        requirements: { minLevel: 20, minFavor: 25, prevChapterDone: 1 },
        choices: [
          { label: '认真学习', text: '灵犀倾囊相授，你对灵兽有了新的理解。', branchTag: 'learner', favorGain: 15, insight: 12 },
          { label: '表示不擅长', text: '灵犀笑了笑：「没关系，有你在旁边也好。」', favorGain: 8 },
        ],
        rewards: { insight: 12, exp: 250, favorGain: 15 },
      },
      {
        index: 3,
        title: '寻踪墨麟',
        description: '你们在山林中发现了墨麟的踪迹，但它似乎被一群猎妖人追捕。',
        requirements: { minLevel: 30, minRealm: 2, minFavor: 45, prevChapterDone: 2 },
        choices: [
          { label: '拦截猎妖人', text: '你挡住猎妖人，为墨麟争取了逃脱时间。灵犀眼中满是感激。', favorGain: 20, karmaImpact: 5, moralityImpact: 8 },
          { label: '追踪墨麟', text: '你绕过猎妖人直接追踪墨麟，找到了它的藏身之处。', branchTag: 'tracker', favorGain: 12, insight: 10 },
        ],
        rewards: { insight: 18, exp: 450, gold: 200, favorGain: 20, items: { beast_core: 2 } },
      },
      {
        index: 4,
        title: '灵兽归心',
        description: '墨麟终于愿意跟随灵犀，但它需要你的认可。灵犀紧张地看着你与墨麟对视。',
        requirements: { minLevel: 40, minRealm: 3, minFavor: 70, prevChapterDone: 3 },
        choices: [
          { label: '以善意安抚', text: '墨麟感受到了你的善意，主动靠了过来。灵犀喜极而泣。', favorGain: 25, moralityImpact: 5 },
          { label: '以气势慑服', text: '墨麟被你的气势所慑，低头臣服。灵犀既惊讶又佩服。', branchTag: 'dominator', favorGain: 20 },
        ],
        rewards: { insight: 40, gold: 400, items: { tupo: 3, beast_core: 5 }, unlockSkillId: 'bond_spirit_tamer', favorGain: 25 },
      },
    ],
    bondSkill: {
      id: 'bond_spirit_tamer',
      name: '灵犀之契',
      description: '灵犀的驯兽传承，生命+20%，防御+10%',
      sourceStory: 'spirit_tamer',
      sourceNpcName: '驯兽师·灵犀',
      effects: { hpBonus: 0.20, defBonus: 0.10 },
    },
  },
}

// ===== 剧情线进度管理 =====

export function getStoryProgress(state: GameState, lineId: StoryLineId): number {
  // 从state中查找该剧情线的进度
  const key = `story_${lineId}`
  return (state as any)[key] || 0
}

export function setStoryProgress(state: GameState, lineId: StoryLineId, chapter: number): void {
  const key = `story_${lineId}`
  ;(state as any)[key] = chapter
}

export function canTriggerChapter(state: GameState, lineId: StoryLineId, chapter: StoryChapter): { ok: boolean; reason: string } {
  const progress = getStoryProgress(state, lineId)

  // 已完成此章节
  if (progress >= chapter.index) return { ok: false, reason: '此章节已完成' }

  // 上一章需完成
  if (chapter.requirements.prevChapterDone && progress < chapter.requirements.prevChapterDone) {
    return { ok: false, reason: `需先完成第${chapter.requirements.prevChapterDone}章` }
  }

  // 等级要求
  if (chapter.requirements.minLevel && state.level < chapter.requirements.minLevel) {
    return { ok: false, reason: `等级不足，需${chapter.requirements.minLevel}级` }
  }

  // 境界要求
  if (chapter.requirements.minRealm && state.realm < chapter.requirements.minRealm) {
    return { ok: false, reason: `境界不足` }
  }

  // 好感要求
  if (chapter.requirements.minFavor) {
    const favor = (state.playerNpcRelations[`story_${lineId}`]?.favor) || 0
    if (favor < chapter.requirements.minFavor) {
      return { ok: false, reason: `好感度不足，需${chapter.requirements.minFavor}` }
    }
  }

  return { ok: true, reason: '' }
}

// ===== 获取已解锁羁绊技能 =====

export function getUnlockedBondSkills(state: GameState): BondSkill[] {
  const unlocked: BondSkill[] = []
  for (const lineId of Object.keys(STORY_LINES) as StoryLineId[]) {
    const line = STORY_LINES[lineId]
    const progress = getStoryProgress(state, lineId)
    if (progress >= line.chapters.length) {
      unlocked.push(line.bondSkill)
    }
  }
  return unlocked
}

// ===== 羁绊技能效果汇总 =====

export function getBondSkillBonuses(state: GameState): {
  atkMult: number
  defMult: number
  hpMult: number
  critBonus: number
  expMult: number
  insightMult: number
  goldMult: number
} {
  const skills = getUnlockedBondSkills(state)
  let atkMult = 1, defMult = 1, hpMult = 1, critBonus = 0
  let expMult = 1, insightMult = 1, goldMult = 1

  for (const skill of skills) {
    if (skill.effects.atkBonus) atkMult += skill.effects.atkBonus
    if (skill.effects.defBonus) defMult += skill.effects.defBonus
    if (skill.effects.hpBonus) hpMult += skill.effects.hpBonus
    if (skill.effects.critBonus) critBonus += skill.effects.critBonus
    if (skill.effects.expBonus) expMult += skill.effects.expBonus
    if (skill.effects.insightBonus) insightMult += skill.effects.insightBonus
    if (skill.effects.goldBonus) goldMult += skill.effects.goldBonus
  }

  return { atkMult, defMult, hpMult, critBonus, expMult, insightMult, goldMult }
}

// ===== 完成章节 =====

export function completeChapter(state: GameState, lineId: StoryLineId, chapterIndex: number): { rewards: string[]; unlockedSkill?: string } {
  const line = STORY_LINES[lineId]
  if (!line) return { rewards: [] }

  const chapter = line.chapters.find(c => c.index === chapterIndex)
  if (!chapter) return { rewards: [] }

  const messages: string[] = []
  const r = chapter.rewards

  if (r.gold) { state.gold += r.gold; messages.push(`灵石+${r.gold}`) }
  if (r.insight) { state.insight = (state.insight || 0) + r.insight; messages.push(`悟道点+${r.insight}`) }
  if (r.exp) { state.exp += r.exp; messages.push(`经验+${r.exp}`) }
  if (r.items) {
    for (const [k, v] of Object.entries(r.items)) {
      state.materials[k] = (state.materials[k] || 0) + v
      messages.push(`${k}+${v}`)
    }
  }
  if (r.favorGain) {
    const npcId = `story_${lineId}`
    if (!state.playerNpcRelations[npcId]) {
      state.playerNpcRelations[npcId] = { npcId, favor: 0, trust: 0, fear: 0, saved: false, killedKnown: [], metCount: 0, lastInteract: Date.now() }
    }
    state.playerNpcRelations[npcId].favor += r.favorGain
    messages.push(`好感+${r.favorGain}`)
  }

  // 更新进度
  setStoryProgress(state, lineId, chapterIndex)

  // 解锁羁绊技能
  if (r.unlockSkillId) {
    if (!state.skills[r.unlockSkillId]) {
      state.skills[r.unlockSkillId] = 1
      messages.push(`解锁羁绊技能：${line.bondSkill.name}！`)
    }
    return { rewards: messages, unlockedSkill: r.unlockSkillId }
  }

  return { rewards: messages }
}
