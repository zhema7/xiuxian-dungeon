// ---------- 核心 NPC 系统：20+ NPC 动态成长 + 关系网络 + 故事线 ----------

import type { WorldTime } from './world-time'
import { makeRng } from './core'

/** NPC 所在场景 */
export type NpcLocation = 'home' | 'city' | 'sect' | 'world' | 'arena'

/** NPC 职能类型 */
export type NpcRole =
  | 'elder'       // 长老
  | 'merchant'    // 商人
  | 'healer'      // 医者
  | 'arena_master' // 擂台主
  | 'alchemist'   // 炼丹师
  | 'blacksmith'  // 铁匠
  | 'scholar'     // 学者
  | 'innkeeper'   // 客栈掌柜
  | 'sect_elder'  // 宗门长老
  | 'wanderer'    // 游方修士
  | 'hermit'      // 隐士
  | 'scout'       // 斥候
  | 'rival'       // 对手/宿敌
  | 'champion'    // 擂台冠军
  | 'city_lord'   // 城主

/** 关系等级 */
export type RelationLevel = 'hostile' | 'neutral' | 'acquaintance' | 'friendly' | 'trusted' | 'sworn'

/** 故事线阶段 */
export type StoryStage = 'locked' | 'available' | 'active' | 'completed' | 'failed'

/** NPC 基础定义 */
export interface NpcDef {
  id: string
  name: string
  title: string         // 称号
  role: NpcRole
  location: NpcLocation
  /** 在场景中的位置（相对坐标） */
  x: number
  y: number
  /** 外观贴图 key */
  texture: string
  /** 初始境界 */
  baseRealm: number
  /** 初始好感 */
  baseFavor: number
  /** 修炼速度（经验/分钟） */
  cultSpeed: number
  /** 喜好礼物 ID */
  preferredGift: string
  /** 喜好提示 */
  giftHint: string
  /** 对话语录 */
  dialogues: string[]
  /** 高好感对话 */
  highFavorDialogues: string[]
  /** 是否可送礼 */
  canGift: boolean
  /** 是否有商店 */
  hasShop?: boolean
  /** 职能描述 */
  desc: string
}

/** NPC 运行时数据（存档） */
export interface NpcState {
  id: string
  realm: number
  /** 级别（境界内的细分等级 0~9，满 10 触发境界突破判定） */
  level: number
  exp: number
  expToNext: number
  favor: number
  /** 故事线进度 */
  storyStage: StoryStage
  storyProgress: number
  /** 上次交互时间（ms 时间戳） */
  lastInteract: number
  /** 是否存活 */
  alive: boolean
  /** 阅历：成长与事件日志（最近 30 条） */
  chronicle?: string[]
  /** 程序化外观：外观种子（用于像素画生成） */
  appearanceSeed?: number
  /** 程序化外观：性别 */
  procGender?: 'male' | 'female'
  /** 程序化外观：道途（决定武器/配饰/体型） */
  procDaoPath?: '剑道' | '丹道' | '器道' | '符道' | '体修' | '法修'
  /** 程序化外观：灵根体质 */
  procPhysique?: '普通' | '单灵根' | '双灵根' | '天灵根' | '异灵根'
}

/** 关系等级阈值 */
export const RELATION_THRESHOLDS: { level: RelationLevel; favor: number; name: string }[] = [
  { level: 'hostile', favor: -50, name: '敌视' },
  { level: 'neutral', favor: 0, name: '初识' },
  { level: 'acquaintance', favor: 30, name: '相识' },
  { level: 'friendly', favor: 80, name: '友好' },
  { level: 'trusted', favor: 160, name: '信赖' },
  { level: 'sworn', favor: 280, name: '至交' },
]

/** 获取关系等级 */
export function getRelation(favor: number): { level: RelationLevel; name: string } {
  let result = RELATION_THRESHOLDS[1]
  for (const t of RELATION_THRESHOLDS) {
    if (favor >= t.favor) result = t
  }
  return { level: result.level, name: result.name }
}

/** NPC 境界突破所需经验（旧门槛，保留供迁移换算） */
export function npcExpToNext(realm: number): number {
  return 200 + realm * 150 + realm * realm * 50
}

/** 境界名称 */
export const NPC_REALM_NAMES = ['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫']

/** NPC 单级所需经验（境界突破门槛的 1/10，使级别增长更频繁） */
export function npcLevelExp(realm: number): number {
  return Math.max(20, Math.floor(npcExpToNext(realm) / 10))
}

/** 修炼结果 */
export type CultivateResult = 'none' | 'levelup' | 'breakthrough' | 'breakfail'

/** NPC 突破概率 */
export function npcBreakthroughChance(realm: number, cultSpeed: number): number {
  const base = 0.7 - realm * 0.05
  return Math.max(0.2, base + cultSpeed * 0.01)
}

/** 核心 NPC 定义表 */
export const NPC_DEFS: NpcDef[] = [
  // ===== 青冥洞府 =====
  {
    id: 'npc_elder', name: '玄清子', title: '青冥长老', role: 'elder',
    location: 'home', x: 200, y: 240, texture: 'npc_junior',
    baseRealm: 3, baseFavor: 15, cultSpeed: 2,
    preferredGift: 'tupo', giftHint: '长老对突破石颇有兴趣',
    dialogues: ['修仙之路，在乎坚持。', '近日山中有异动，需多加小心。'],
    highFavorDialogues: ['你已成长许多，老甚欣慰。', '若有难处，尽管来找老夫。'],
    canGift: true, desc: '青冥洞府的老者，你的引路人',
  },
  {
    id: 'npc_sister', name: '陆青鸢', title: '道友', role: 'wanderer',
    location: 'home', x: 280, y: 260, texture: 'npc_junior',
    baseRealm: 1, baseFavor: 30, cultSpeed: 3,
    preferredGift: 'potion', giftHint: '青鸢近来历练有些暗伤',
    dialogues: ['又见面了，道友可好？', '我也要努力修炼才行。'],
    highFavorDialogues: ['与你结伴，心中甚安。', '我们一起闯荡江湖吧！'],
    canGift: true, desc: '与你一同入门的道友',
  },

  // ===== 青冥城 =====
  {
    id: 'npc_city_lord', name: '萧天衡', title: '青冥城主', role: 'city_lord',
    location: 'city', x: 200, y: 200, texture: 'npc_junior',
    baseRealm: 5, baseFavor: 0, cultSpeed: 1.5,
    preferredGift: 'gold50', giftHint: '城主政务繁忙，灵石总是不嫌多',
    dialogues: ['青冥城欢迎你。', '城外妖兽横行，望多加小心。'],
    highFavorDialogues: ['你是我看好的后起之秀。', '青冥城的未来，就靠你们了。'],
    canGift: true, desc: '青冥城之主，修为深厚',
  },
  {
    id: 'npc_merchant', name: '钱万三', title: '游商', role: 'merchant',
    location: 'city', x: 320, y: 280, texture: 'npc_junior',
    baseRealm: 1, baseFavor: 0, cultSpeed: 0.5,
    preferredGift: 'gold50', giftHint: '商人见到灵石眼就亮了',
    dialogues: ['客官要买点什么？', '最近新到一批好货！'],
    highFavorDialogues: ['老朋友来了！今天给你打折。', '有好货先给你留着。'],
    canGift: true, hasShop: true, desc: '青冥城的游商，货品齐全',
  },
  {
    id: 'npc_healer', name: '苏婉清', title: '医修', role: 'healer',
    location: 'city', x: 180, y: 320, texture: 'npc_junior',
    baseRealm: 2, baseFavor: 0, cultSpeed: 1.2,
    preferredGift: 'potion', giftHint: '医者也需要丹药研究',
    dialogues: ['身体要紧，不可硬撑。', '最近伤员有些多……'],
    highFavorDialogues: ['你来了，身体可好？', '有些调理的方子，你要不要试试？'],
    canGift: true, desc: '城中医修，擅长疗伤',
  },
  {
    id: 'npc_arena_master', name: '雷震', title: '擂台主事', role: 'arena_master',
    location: 'arena', x: 160, y: 200, texture: 'npc_junior',
    baseRealm: 4, baseFavor: 0, cultSpeed: 2,
    preferredGift: 'tupo', giftHint: '武痴对突破石格外上心',
    dialogues: ['来切磋一番？', '擂台之上见真章。'],
    highFavorDialogues: ['你是条汉子！', '下次给你安排个有意思的对手。'],
    canGift: true, desc: '擂台管事，崇尚武力',
  },
  {
    id: 'npc_champion', name: '独孤剑', title: '擂台冠军', role: 'champion',
    location: 'arena', x: 240, y: 180, texture: 'npc_junior',
    baseRealm: 5, baseFavor: -10, cultSpeed: 2.5,
    preferredGift: 'tupo', giftHint: '冠军一直在追求突破',
    dialogues: ['你也是来挑战的？', '哼，不自量力。'],
    highFavorDialogues: ['你果然有些本事。', '下次再战，我不会输。'],
    canGift: true, desc: '擂台现任冠军，高傲自负',
  },
  {
    id: 'npc_alchemist', name: '药尘', title: '炼丹师', role: 'alchemist',
    location: 'city', x: 340, y: 200, texture: 'npc_junior',
    baseRealm: 3, baseFavor: 0, cultSpeed: 1.8,
    preferredGift: 'potion', giftHint: '丹师对各种丹药都感兴趣',
    dialogues: ['炼丹一道，博大精深。', '最近灵草品质下降，愁人。'],
    highFavorDialogues: ['你对丹道也有见解？难得。', '有空来我丹房坐坐。'],
    canGift: true, desc: '城中炼丹师，可提供丹药',
  },
  {
    id: 'npc_blacksmith', name: '铁锤', title: '铁匠', role: 'blacksmith',
    location: 'city', x: 160, y: 260, texture: 'npc_junior',
    baseRealm: 2, baseFavor: 0, cultSpeed: 1,
    preferredGift: 'gold50', giftHint: '铁匠要养家糊口',
    dialogues: ['打铁也是修行。', '最近矿石不够用了。'],
    highFavorDialogues: ['老朋友，给你打件好的！', '你拿来什么矿，我就打什么器。'],
    canGift: true, desc: '城中铁匠，擅长锻造',
  },
  {
    id: 'npc_innkeeper', name: '王婆', title: '客栈掌柜', role: 'innkeeper',
    location: 'city', x: 280, y: 340, texture: 'npc_junior',
    baseRealm: 1, baseFavor: 5, cultSpeed: 0.5,
    preferredGift: 'gold50', giftHint: '掌柜最喜欢灵石',
    dialogues: ['住店还是吃饭？', '我们这有上好的灵酒。'],
    highFavorDialogues: ['老主顾来了！', '今天给你留了上房。'],
    canGift: true, desc: '客栈掌柜，消息灵通',
  },

  // ===== 宗门 =====
  {
    id: 'npc_sect_elder', name: '周道玄', title: '宗门长老', role: 'sect_elder',
    location: 'sect', x: 4, y: 10, texture: 'npc_junior', // 主殿上方
    baseRealm: 4, baseFavor: 20, cultSpeed: 1.5,
    preferredGift: 'tupo', giftHint: '长老在追求突破',
    dialogues: ['宗门建设不可懈怠。', '弟子培养是重中之重。'],
    highFavorDialogues: ['宗主英明。', '我等愿为宗门效死。'],
    canGift: true, desc: '宗门长老，辅佐宗主',
  },
  {
    id: 'npc_alchemy_master', name: '丹阳子', title: '炼丹大师', role: 'alchemist',
    location: 'sect', x: 2, y: 14, texture: 'npc_junior', // 炼丹房旁
    baseRealm: 3, baseFavor: 10, cultSpeed: 1.8,
    preferredGift: 'potion', giftHint: '丹师对丹药很有研究',
    dialogues: ['丹道无穷，吾辈上下求索。', '灵草品质决定丹药品质。'],
    highFavorDialogues: ['宗主的丹道天分不差。', '有我在，丹药不愁。'],
    canGift: true, desc: '宗门炼丹大师',
  },
  {
    id: 'npc_forge_master', name: '欧冶子', title: '炼器大师', role: 'blacksmith',
    location: 'sect', x: 6, y: 14, texture: 'npc_junior', // 炼器阁旁
    baseRealm: 3, baseFavor: 10, cultSpeed: 1.5,
    preferredGift: 'gold50', giftHint: '大师也在筹集材料',
    dialogues: ['器道亦是道。', '好矿出好器。'],
    highFavorDialogues: ['宗主也懂炼器？难得。', '你的装备，我包了。'],
    canGift: true, desc: '宗门炼器大师',
  },
  {
    id: 'npc_library_keeper', name: '书灵', title: '藏经阁守阁人', role: 'scholar',
    location: 'sect', x: 4, y: 14, texture: 'npc_junior', // 藏经阁旁
    baseRealm: 4, baseFavor: 10, cultSpeed: 2,
    preferredGift: 'tupo', giftHint: '守阁人在参悟功法',
    dialogues: ['书中自有大道。', '功法万千，择一而终。'],
    highFavorDialogues: ['你的悟性不凡。', '有些古籍，或许你能参悟。'],
    canGift: true, desc: '藏经阁守阁人，学识渊博',
  },
  {
    id: 'npc_training_master', name: '武狂', title: '演武教头', role: 'arena_master',
    location: 'sect', x: 1, y: 12, texture: 'npc_junior', // 演武场旁
    baseRealm: 3, baseFavor: 10, cultSpeed: 2.5,
    preferredGift: 'tupo', giftHint: '教头在追求武道突破',
    dialogues: ['练武先练心。', '弟子们还需磨砺。'],
    highFavorDialogues: ['宗主的武道天分不低。', '演武场交给我。'],
    canGift: true, desc: '宗门演武教头',
  },
  {
    id: 'npc_quest_elder', name: '陈奉', title: '任务殿执事', role: 'sect_elder',
    location: 'sect', x: 1, y: 16, texture: 'npc_junior', // 任务殿旁
    baseRealm: 2, baseFavor: 15, cultSpeed: 1,
    preferredGift: 'gold50', giftHint: '执事需要活动经费',
    dialogues: ['任务殿近来活不少。', '弟子们多多历练。'],
    highFavorDialogues: ['宗主放心，任务殿运转良好。', '有好差事我先想着宗门。'],
    canGift: true, desc: '任务殿执事，负责宗门任务',
  },

  // ===== 大地图 =====
  {
    id: 'npc_wanderer', name: '云游道人', title: '散修', role: 'wanderer',
    location: 'world', x: 800, y: 1000, texture: 'npc_junior',
    baseRealm: 3, baseFavor: 0, cultSpeed: 2,
    preferredGift: 'potion', giftHint: '散修常年受伤',
    dialogues: ['四处云游也是一种修行。', '最近山中有奇宝出世？'],
    highFavorDialogues: ['相逢即是有缘。', '我观你气色，将有大机缘。'],
    canGift: true, desc: '云游四方的散修，见多识广',
  },
  {
    id: 'npc_hermit', name: '无名老叟', title: '隐士', role: 'hermit',
    location: 'world', x: 400, y: 600, texture: 'npc_junior',
    baseRealm: 6, baseFavor: 0, cultSpeed: 0.5,
    preferredGift: 'tupo', giftHint: '隐士在追求更高的突破',
    dialogues: [' Leave me to my cultivation... ', '道法自然，何须强求？'],
    highFavorDialogues: ['你终于来了。', '我等你很久了……'],
    canGift: true, desc: '隐居深山的神秘老者，修为深不可测',
  },
  {
    id: 'npc_scout', name: '风影', title: '斥候', role: 'scout',
    location: 'world', x: 900, y: 1200, texture: 'npc_junior',
    baseRealm: 2, baseFavor: 0, cultSpeed: 1.5,
    preferredGift: 'gold50', giftHint: '斥候需要经费打点消息',
    dialogues: ['我消息灵通，要不要听听？', '最近妖兽频繁出没。'],
    highFavorDialogues: ['有情况我第一时间通知你。', '你是我信得过的人。'],
    canGift: true, desc: '游走各地的斥候，贩卖情报',
  },
  {
    id: 'npc_rival', name: '冷无缺', title: '宿敌', role: 'rival',
    location: 'world', x: 1000, y: 800, texture: 'npc_junior',
    baseRealm: 4, baseFavor: -30, cultSpeed: 3,
    preferredGift: 'tupo', giftHint: '宿敌也在追求力量',
    dialogues: ['哼，又见面了。', '你我都走在同一条路上。'],
    highFavorDialogues: ['或许……我们可以暂时合作。', '你果然不简单。'],
    canGift: true, desc: '与你亦敌亦友的修士',
  },
]

/** 根据 ID 获取 NPC 定义 */
export function getNpcDef(id: string): NpcDef | undefined {
  return NPC_DEFS.find(n => n.id === id)
}

/** 获取某地点的所有 NPC */
export function getNpcsByLocation(loc: NpcLocation): NpcDef[] {
  return NPC_DEFS.filter(n => n.location === loc)
}

/** 生成 NPC 初始状态 */
export function createNpcState(def: NpcDef): NpcState {
  const state: NpcState = {
    id: def.id,
    realm: def.baseRealm,
    level: 0,
    exp: 0,
    expToNext: npcLevelExp(def.baseRealm),
    favor: def.baseFavor,
    // 故事线初始状态由 STORIES 表决定，而不是硬编码两个 NPC id。
    storyStage: getStory(def.id) ? 'available' : 'locked',
    storyProgress: 0,
    lastInteract: 0,
    alive: true,
  }
  logNpcEvent(state, `初入修仙界，${NPC_REALM_NAMES[def.baseRealm]}境`)
  return state
}

const PROC_DAO_PATHS: NonNullable<NpcState['procDaoPath']>[] = ['剑道', '丹道', '器道', '符道', '体修', '法修']
const PROC_PHYSIQUES: NonNullable<NpcState['procPhysique']>[] = ['普通', '单灵根', '双灵根', '天灵根', '异灵根']

function npcIdHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 为宗门 NPC 生成程序化外观字段（appearanceSeed/gender/daoPath/physique）。
 * 仅在缺失时填充，已有值则跳过，故可安全用于存档迁移与新建。
 * 种子由 def.id 哈希派生，保证每个宗门 NPC 外观稳定且互不相同。
 */
export function ensureProcAppearance(ns: NpcState, def: NpcDef): void {
  if (def.location !== 'sect') return
  if (ns.appearanceSeed !== undefined) return
  const rng = makeRng(npcIdHash(def.id))
  ns.appearanceSeed = Math.floor(rng() * 1000000)
  ns.procGender = rng() < 0.5 ? 'male' : 'female'
  ns.procDaoPath = PROC_DAO_PATHS[Math.floor(rng() * PROC_DAO_PATHS.length)]
  ns.procPhysique = PROC_PHYSIQUES[Math.floor(rng() * PROC_PHYSIQUES.length)]
}

/**
 * 旧存档迁移：为 NPC 补齐 level 字段，并把旧「经验满即境界突破」制换算为
 * 「级别细分（0~9）满 10 触发境界突破」制。旧门槛为级别门槛的 10 倍，
 * 故经验按 1/10 折算以保留进度。幂等：已有 level 字段则跳过。
 */
export function ensureNpcLevel(ns: NpcState, def: NpcDef): void {
  void def
  if (ns.level !== undefined) return
  ns.level = 0
  ns.exp = Math.floor(ns.exp / 10)
  ns.expToNext = npcLevelExp(ns.realm)
}

/** 记录一条阅历日志（最多保留 30 条，超出丢弃最早的） */
export function logNpcEvent(ns: NpcState, msg: string): void {
  if (!ns.chronicle) ns.chronicle = []
  ns.chronicle.push(msg)
  if (ns.chronicle.length > 30) ns.chronicle.shift()
}

/** NPC 随时间修炼：经验累积 → 级别增长（0~9）→ 满 10 级触发境界突破判定 */
export function npcCultivate(state: NpcState, def: NpcDef, deltaMinutes: number, rng: () => number): CultivateResult {
  if (!state.alive) return 'none'
  state.exp += Math.floor(def.cultSpeed * deltaMinutes)
  // 境界封顶：不再细分级别，仅折损经验避免溢出
  if (state.realm >= 6) {
    if (state.exp >= state.expToNext) state.exp = Math.floor(state.expToNext * 0.5)
    return 'none'
  }
  let result: CultivateResult = 'none'
  while (state.exp >= state.expToNext) {
    state.exp -= state.expToNext
    state.level++
    result = 'levelup'
    // 满 10 级触发境界突破判定
    if (state.level >= 10) {
      const chance = npcBreakthroughChance(state.realm, def.cultSpeed)
      if (state.realm < 6 && rng() < chance) {
        state.realm++
        state.level = 0
        state.exp = 0
        state.expToNext = npcLevelExp(state.realm)
        logNpcEvent(state, `突破至 ${NPC_REALM_NAMES[state.realm]}境`)
        result = 'breakthrough'
        if (state.realm >= 6) break // 达到境界封顶，不再继续细分级别
      } else {
        // 突破失败：级别回退一级，经验折损
        state.level--
        state.exp = Math.floor(state.expToNext * 0.5)
        result = 'breakfail'
        break
      }
    }
  }
  return result
}

/** 好感变化 */
export function changeFavor(state: NpcState, amount: number): boolean {
  const before = getRelation(state.favor)
  state.favor = Math.max(-100, Math.min(500, state.favor + amount))
  const after = getRelation(state.favor)
  return after.level !== before.level // 关系等级变化
}

// ===== 故事线定义 =====

export interface StoryDef {
  id: string
  npcId: string
  name: string
  desc: string
  /** 触发所需好感 */
  requireFavor: number
  /** 触发所需玩家等级 */
  requireLevel: number
  /** 故事阶段数 */
  stages: StoryStageDef[]
}

export interface StoryStageDef {
  index: number
  text: string
  /** 完成条件描述 */
  objective: string
  /** 检查完成条件 */
  check: (playerLevel: number, playerRealm: number, npcFavor: number) => boolean
  /** 奖励描述 */
  reward: string
}

/** 故事线定义 */
export const STORIES: StoryDef[] = [
  {
    id: 'story_elder', npcId: 'npc_elder', name: '长老的心愿',
    desc: '玄清子似乎有未了的心愿',
    requireFavor: 80, requireLevel: 10,
    stages: [
      {
        index: 0,
        text: '长老提到他年轻时遗失了一件法器，就在青冥山深处。',
        objective: '探索青冥山秘境，找到长老法器',
        check: (lv) => lv >= 15,
        reward: '长老传授功法「太乙剑诀」',
      },
      {
        index: 1,
        text: '长老说法器虽失，但更重要的是找到传人。他看着你，目光殷切。',
        objective: '达到 20 级，证明自己的实力',
        check: (lv) => lv >= 20,
        reward: '长老赠送突破石 ×5，好感大增',
      },
      {
        index: 2,
        text: '「去吧，青冥一脉的传承，就在你手中了。」长老欣慰地笑了。',
        objective: '完成最终对话',
        check: () => true,
        reward: '获得青冥传承：悟道+30，声望+20',
      },
    ],
  },
  {
    id: 'story_sister', npcId: 'npc_sister', name: '道友的羁绊',
    desc: '陆青鸢似乎有话想对你说',
    requireFavor: 80, requireLevel: 8,
    stages: [
      {
        index: 0,
        text: '青鸢提到她的家乡被妖兽侵袭，家人失散。',
        objective: '帮助青鸢，击杀 50 只魔兽',
        check: (lv) => lv >= 12,
        reward: '青鸢好感大增，赠予灵石×200',
      },
      {
        index: 1,
        text: '青鸢找到了亲人的线索，需要你的帮助。',
        objective: '达到 18 级，有足够实力',
        check: (lv) => lv >= 18,
        reward: '青鸢正式加入你的修仙之路',
      },
      {
        index: 2,
        text: '「谢谢你，一直以来……」青鸢露出了笑容。',
        objective: '完成最终对话',
        check: () => true,
        reward: '获得羁绊之力：攻防+5%，好感满级',
      },
    ],
  },
  {
    id: 'story_city_lord', npcId: 'npc_city_lord', name: '城主的考验',
    desc: '萧天衡似乎在考察你',
    requireFavor: 50, requireLevel: 15,
    stages: [
      {
        index: 0,
        text: '城主提到城外有一处妖兽巢穴，危害百姓。',
        objective: '达到 25 级，证明有实力清剿',
        check: (lv) => lv >= 25,
        reward: '城主赠予灵石×500，声望+10',
      },
      {
        index: 1,
        text: '城主告诉你青冥城暗藏一股势力，需要你去调查。',
        objective: '达到 30 级',
        check: (lv) => lv >= 30,
        reward: '城主授予「青冥城荣誉客卿」称号',
      },
      {
        index: 2,
        text: '「青冥城的安宁，就拜托你了。」城主郑重地说。',
        objective: '完成最终对话',
        check: () => true,
        reward: '获得城主信物：商店永久 8 折',
      },
    ],
  },
  {
    id: 'story_rival', npcId: 'npc_rival', name: '宿敌的觉悟',
    desc: '冷无缺似乎在等着你',
    requireFavor: 0, requireLevel: 20,
    stages: [
      {
        index: 0,
        text: '冷无缺拦住你：「你我之间，该有个了断了。」',
        objective: '达到 25 级',
        check: (lv) => lv >= 25,
        reward: '与冷无缺切磋，获得经验',
      },
      {
        index: 1,
        text: '「你变强了……」冷无缺露出了难得的笑容，「也许我们不该是敌人。」',
        objective: '好感达到 80',
        check: (_, __, favor) => favor >= 80,
        reward: '冷无缺成为盟友，赠送突破石×3',
      },
      {
        index: 2,
        text: '「走吧，一起看看这修仙界的尽头。」',
        objective: '完成最终对话',
        check: () => true,
        reward: '获得宿敌之力：暴击+10%，暴伤+20%',
      },
    ],
  },
  {
    id: 'story_hermit', npcId: 'npc_hermit', name: '隐士的传承',
    desc: '无名老叟似乎在等你',
    requireFavor: 50, requireLevel: 25,
    stages: [
      {
        index: 0,
        text: '隐士问你：「何为道？」你需要用实力回答。',
        objective: '达到 30 级',
        check: (lv) => lv >= 30,
        reward: '隐士点头，传授基础功法',
      },
      {
        index: 1,
        text: '隐士开始讲述一个关于远古修士的故事……',
        objective: '达到 40 级',
        check: (lv) => lv >= 40,
        reward: '隐士赠予远古法器',
      },
      {
        index: 2,
        text: '「道在心中，你已找到了。」隐士化为光点消散。',
        objective: '完成最终对话',
        check: () => true,
        reward: '获得隐士传承：悟道+50，境界+1',
      },
    ],
  },
]

/** 获取 NPC 故事线 */
export function getStory(npcId: string): StoryDef | undefined {
  return STORIES.find(s => s.npcId === npcId)
}
