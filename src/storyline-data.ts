// ---------- 主线剧情系统：四卷三十余章 ----------

/** 卷宗 */
export type VolumeId = 'vol1' | 'vol2' | 'vol3' | 'vol4'

/** 任务目标类型 */
export type MainQuestObjective =
  | 'reach_level'        // 达到等级
  | 'clear_dungeon'      // 通关秘境
  | 'talk_npc'           // 与 NPC 对话
  | 'collect_kills'      // 累计击杀
  | 'reach_realm'         // 达到境界
  | 'visit_point'        // 到达地点
  | 'establish_sect'     // 建立宗门
  | 'win_arena'          // 擂台胜场
  | 'collect_gold'       // 收集灵石
  | 'defeat_boss'        // 击败 Boss
  | 'sect_level'         // 宗门等级达到 N（读 state.sect.level，与角色等级无关）

/** 主线任务定义 */
export interface MainQuestDef {
  id: string
  volume: VolumeId
  chapter: number                  // 章节序号
  title: string
  narrator: string                 // 叙述者
  intro: string[]                  // 任务接取时的剧情文本
  objective: string               // 目标描述
  objectiveType: MainQuestObjective
  objectiveTarget: string          // 目标参数（等级数/NPC ID/点位 ID 等）
  objectiveCount?: number          // 需要的数量
  hint: string                     // 提示文字
  completion: string[]             // 完成时的剧情文本
  rewards: {
    exp?: number
    gold?: number
    insight?: number
    potions?: number
    itemDesc?: string              // 特殊奖励描述
  }
  /** 前置任务 ID（null = 开局即可接取） */
  prerequisite: string | null
}

/** 卷宗定义 */
export interface VolumeDef {
  id: VolumeId
  name: string
  subtitle: string
  levelRange: string
  desc: string
}

/** 四卷定义 */
export const VOLUMES: VolumeDef[] = [
  {
    id: 'vol1', name: '第一卷', subtitle: '初入修仙',
    levelRange: 'Lv.1~15',
    desc: '初踏修仙之路，在青冥山脚习武炼丹，探索秘境，结识道友。',
  },
  {
    id: 'vol2', name: '第二卷', subtitle: '崭露头角',
    levelRange: 'Lv.15~30',
    desc: '走出青冥山，建立宗门，结交天下修士，卷入宗门纷争。',
  },
  {
    id: 'vol3', name: '第三卷', subtitle: '风云际会',
    levelRange: 'Lv.30~50',
    desc: '宗门战争爆发，古老阴谋浮出水面，踏上破碎仙宫追寻真相。',
  },
  {
    id: 'vol4', name: '第四卷', subtitle: '问道苍穹',
    levelRange: 'Lv.50+',
    desc: '修仙界大劫将至，纵横五域，挑战至强者，成就无上大道。',
  },
]

/** 主线任务定义表 */
export const MAIN_QUESTS: MainQuestDef[] = [
  // ===== 第一卷：初入修仙 =====
  {
    id: 'mq_1_1', volume: 'vol1', chapter: 1,
    title: '青冥初醒',
    narrator: '玄清子',
    intro: [
      '「你醒了……」',
      '一个苍老的声音将你从昏迷中唤醒。你发现自己躺在一间简陋的石室中，周身灵气稀薄。',
      '一位白发老者站在身旁，目光温和：「你命格特殊，青冥山选中了你。从今日起，你便是青冥一脉的传人。」',
      '「先去历练传送门试试身手吧，山中的妖兽是你最好的磨刀石。」',
    ],
    objective: '通关青冥山脉（1~3层）',
    objectiveType: 'clear_dungeon',
    objectiveTarget: 'qm',
    hint: '在洞府中找到历练传送门，选择青冥山脉进入。',
    completion: [
      '你从青冥山脉中走出，衣衫凌乱却精神奕奕。',
      '玄清子微微点头：「不错，你有修仙的资质。这枚灵石权作奖励。」',
    ],
    rewards: { exp: 200, gold: 100, insight: 5 },
    prerequisite: null,
  },
  {
    id: 'mq_1_2', volume: 'vol1', chapter: 2,
    title: '道友初逢',
    narrator: '陆青鸢',
    intro: [
      '回到洞府时，你发现一位年轻修士正在门口张望。',
      '「你就是玄清前辈新收的弟子？我叫陆青鸢，比你早来半年。」',
      '「道友独行太寂寞了，不如我们结伴而行？不过得先证明你的实力——达到5级再说。」',
    ],
    objective: '达到 5 级',
    objectiveType: 'reach_level',
    objectiveTarget: '5',
    hint: '在秘境中击杀妖兽积累经验，或参悟悟道石获取悟道点。',
    completion: [
      '陆青鸢看着你身上的气息波动，咧嘴一笑：「行啊道友，有模有样的！」',
      '「对了，最近山外来了个游商，听说有不少好货，一起去看看？」',
    ],
    rewards: { exp: 300, gold: 50, potions: 3 },
    prerequisite: 'mq_1_1',
  },
  {
    id: 'mq_1_3', volume: 'vol1', chapter: 3,
    title: '坊市初探',
    narrator: '钱万三',
    intro: [
      '游商钱万三在天枢城外摆了个摊子，见到你们便热情招呼。',
      '「二位道友面善得很！来来来，看看小可的货——丹药、装备、功法秘籍应有尽有！」',
      '「不过嘛，天枢城可不是谁都能进的。先帮老朽一个忙——去青冥山里清剿些妖兽，也好让路太平些。」',
    ],
    objective: '累计击杀 30 只妖兽',
    objectiveType: 'collect_kills',
    objectiveTarget: '30',
    hint: '在秘境中不断击杀妖兽即可累积。',
    completion: [
      '钱万三搓着手笑道：「痛快痛快！路上清净多了。」',
      '「对了，天枢城的事我替你们打点了——城主萧天衡是个正经人，去了报我名字就行。」',
    ],
    rewards: { exp: 400, gold: 200 },
    prerequisite: 'mq_1_2',
  },
  {
    id: 'mq_1_4', volume: 'vol1', chapter: 4,
    title: '城主之托',
    narrator: '萧天衡',
    intro: [
      '天枢城巍峨壮观，城主萧天衡在府中接见了你。',
      '「年轻有为。青冥城近年来妖气日盛，幽冥沼泽那边更是不太平。」',
      '「若你能突破筑基期，我便允你进入幽冥沼泽——那里有你需要的东西。」',
    ],
    objective: '突破至筑基期（境界 1）',
    objectiveType: 'reach_realm',
    objectiveTarget: '1',
    hint: '在秘境中积累经验，达到10级后可尝试突破筑基。',
    completion: [
      '你感受到丹田中灵力凝聚，筑基成功！',
      '萧天衡点头：「好！从今日起，幽冥沼泽向你开放。但切记——那里远比青冥山脉凶险。」',
    ],
    rewards: { exp: 500, insight: 20, potions: 5 },
    prerequisite: 'mq_1_3',
  },
  {
    id: 'mq_1_5', volume: 'vol1', chapter: 5,
    title: '沼泽探险',
    narrator: '旁白',
    intro: [
      '幽冥沼泽弥漫着腐朽的气息。魑魅在雾中若隐若现，蚀骨花的毒刺暗藏杀机。',
      '你小心翼翼地深入，隐约听到前方传来打斗声……',
    ],
    objective: '通关幽冥沼泽（4~6层）',
    objectiveType: 'clear_dungeon',
    objectiveTarget: 'ym',
    hint: '在洞府历练传送门选择幽冥沼泽进入。',
    completion: [
      '沼泽深处，你发现了一块残破的石碑，上面刻着古老的符文。',
      '石碑上的文字模糊不清，但你隐约辨认出「仙宫」「坠落」「封印」几个字。',
      '一股不祥的预感涌上心头。',
    ],
    rewards: { exp: 800, gold: 300, insight: 15 },
    prerequisite: 'mq_1_4',
  },
  {
    id: 'mq_1_6', volume: 'vol1', chapter: 6,
    title: '古碑之谜',
    narrator: '玄清子',
    intro: [
      '你将古碑拓本带给玄清子，老者看后面色骤变。',
      '「这……这是上古仙宫的封印碑文！传说万年前有仙宫坠落人间，被大能封印于此。」',
      '「若封印松动，修仙界将有大劫。你需前往望仙崖——那里或许有更多线索。」',
    ],
    objective: '到达望仙崖',
    objectiveType: 'visit_point',
    objectiveTarget: 'landmark_cliff',
    hint: '在大地图南域北部寻找望仙崖。',
    completion: [
      '站在望仙崖上，你极目远眺。北方天际隐约可见一座破碎的仙宫悬浮于云海之中。',
      '一道苍茫的意念掠过你的识海：「……来……寻……道……」',
      '你猛然回神，四周寂寂无声，仿佛方才的一切只是幻觉。',
    ],
    rewards: { exp: 600, insight: 30 },
    prerequisite: 'mq_1_5',
  },
  {
    id: 'mq_1_7', volume: 'vol1', chapter: 7,
    title: '黄龙试炼',
    narrator: '旁白',
    intro: [
      '玄清子提到黄龙山秘境中有一处剑修圣地，或许能助你精进。',
      '「黄龙山此刻正值大战，韩道友与乐上师争夺元明灯。你去助阵，亦可磨砺自身。」',
      '（需金丹期方可踏入）',
    ],
    objective: '突破至金丹期（境界 2）',
    objectiveType: 'reach_realm',
    objectiveTarget: '2',
    hint: '继续在秘境中修炼，达到15级后可尝试突破金丹。',
    completion: [
      '金丹大成，灵力在体内形成金色旋涡。',
      '你感到自己对天地灵气的感知更加敏锐，黄龙山秘境的威压不再难以承受。',
    ],
    rewards: { exp: 1000, insight: 25 },
    prerequisite: 'mq_1_6',
  },
  {
    id: 'mq_1_8', volume: 'vol1', chapter: 8,
    title: '第一卷·终章·出山',
    narrator: '玄清子',
    intro: [
      '「你已非昔日吴下阿蒙。」玄清子捋须而笑。',
      '「青冥山虽好，但你的路在山外。苍玄界南域已开，出去闯荡吧。」',
      '「记住——修仙之路，道心为先。莫忘初心，方得始终。」',
      '「还有……若有余力，不妨开宗立派。修仙界宗门林立，独行虽快，众行方能致远。」',
    ],
    objective: '到达 15 级',
    objectiveType: 'reach_level',
    objectiveTarget: '15',
    hint: '继续历练秘境、参悟悟道石、完成各类任务提升等级。',
    completion: [
      '你站在青冥山脚，回望洞府。玄清子的身影在山雾中若隐若现。',
      '「去吧。」老者的声音随风传来。',
      '你转身踏入大地图——苍玄界南域的广阔天地在眼前展开。',
      '【第一卷·初入修仙·完】',
    ],
    rewards: { exp: 1500, gold: 500, insight: 40, itemDesc: '玄清子传授「太乙剑诀」残篇' },
    prerequisite: 'mq_1_7',
  },

  // ===== 第二卷：崭露头角 =====
  {
    id: 'mq_2_1', volume: 'vol2', chapter: 1,
    title: '南域游记',
    narrator: '旁白',
    intro: [
      '大地图南域广袤无垠。你沿着官道行走，遇到了形形色色的修士。',
      '一位云游道人在路边歇脚，见你走来，笑道：「年轻人，可愿听听老道的故事？」',
      '「修仙界五大宗门，各据一域。南域虽有天枢城主持大局，但暗流涌动……」',
      '「你若要在这修仙界立足，先得有自保之力——去无尽妖域试试深浅吧。」',
    ],
    objective: '挑战无尽妖域（到达第7层）',
    objectiveType: 'clear_dungeon',
    objectiveTarget: 'sy',
    hint: '在洞府历练传送门选择无尽妖域。',
    completion: [
      '无尽妖域深不见底，你在其中与无穷无尽的妖兽搏斗。',
      '当你从妖域中撤出时，身上多了不少伤痕，但眼中的光芒更加坚定。',
      '云游道人点头：「不错。不过单打独斗终究力薄——何不建立宗门，广纳门徒？」',
    ],
    rewards: { exp: 1200, gold: 300, insight: 20 },
    prerequisite: 'mq_1_8',
  },
  {
    id: 'mq_2_2', volume: 'vol2', chapter: 2,
    title: '开宗立派',
    narrator: '旁白',
    intro: [
      '你在南域找到了一处灵气充沛的山门之地。',
      '建立宗门需要 500 灵石和筑基以上修为。你已具备开宗条件。',
      '「从今日起，你便是一宗之主了。」',
    ],
    objective: '建立宗门',
    objectiveType: 'establish_sect',
    objectiveTarget: 'sect',
    hint: '在大地图上找到「本宗山门」点位，点击建立宗门。',
    completion: [
      '宗门大殿落成，你端坐在宗主之位上，心中感慨万千。',
      '弟子们陆续到来，宗门逐渐兴旺。但你也注意到——周边有其他势力在窥探……',
    ],
    rewards: { exp: 2000, gold: 500, insight: 50, itemDesc: '宗主信物' },
    prerequisite: 'mq_2_1',
  },
  {
    id: 'mq_2_3', volume: 'vol2', chapter: 3,
    title: '擂台扬名',
    narrator: '雷震',
    intro: [
      '天枢城擂台管事雷震找到你：「新晋宗主？来擂台切磋一番如何？」',
      '「修仙界讲究以武会友。你在擂台取得3场胜利，我便替你在城中扬名。」',
    ],
    objective: '擂台胜场达到 3 次',
    objectiveType: 'win_arena',
    objectiveTarget: '3',
    hint: '在天枢城擂台挑战修士，获胜3场。',
    completion: [
      '雷震拍了拍你的肩膀：「好身手！从今日起，你在天枢城也算有头有脸了。」',
      '「对了，城主萧天衡有请——似乎有什么要事相商。」',
    ],
    rewards: { exp: 1500, gold: 400, insight: 15 },
    prerequisite: 'mq_2_2',
  },
  {
    id: 'mq_2_4', volume: 'vol2', chapter: 4,
    title: '城主密议',
    narrator: '萧天衡',
    intro: [
      '萧天衡在书房中接见你，面色凝重。',
      '「近日来，南域各地妖气渐盛。我派出斥候探查，发现破碎仙宫的封印正在松动。」',
      '「万年前坠落的仙宫中，封印着一头上古凶兽。若封印被破，后果不堪设想。」',
      '「你需要更强的实力——突破化神期后，方可踏入仙宫一探。」',
    ],
    objective: '突破至化神期（境界 4）',
    objectiveType: 'reach_realm',
    objectiveTarget: '4',
    hint: '继续修炼，达到30级后可尝试突破化神期。',
    completion: [
      '化神成功！你的神识范围大幅扩展，能感知方圆百里的灵气波动。',
      '萧天衡：「好！仙宫之门已为你敞开。但我要提醒你——仙宫中的敌人远非人间可比。」',
    ],
    rewards: { exp: 3000, insight: 50, potions: 10 },
    prerequisite: 'mq_2_3',
  },
  {
    id: 'mq_2_5', volume: 'vol2', chapter: 5,
    title: '仙宫初探',
    narrator: '旁白',
    intro: [
      '破碎仙宫悬浮于云端之上，仙气缭绕间，隐约可见残垣断壁。',
      '你踏入仙宫，感受到一股古老而强大的威压。这里的每一寸土地都蕴含着上古仙人的遗力。',
    ],
    objective: '挑战破碎仙宫（到达第1层）',
    objectiveType: 'clear_dungeon',
    objectiveTarget: 'xian',
    hint: '在洞府历练传送门选择破碎仙宫进入。',
    completion: [
      '仙宫第一层中，你击败了一群仙人灵兽。',
      '在宫殿深处，你发现了一幅壁画——画中描绘了万年前仙宫坠落的场景：',
      '一道伟岸的身影以自身为媒，将一头遮天蔽日的凶兽封印于仙宫之中。',
      '壁画下方刻着一行字：「封印将破时，持剑者当来。」',
    ],
    rewards: { exp: 2500, gold: 800, insight: 40 },
    prerequisite: 'mq_2_4',
  },
  {
    id: 'mq_2_6', volume: 'vol2', chapter: 6,
    title: '外交初体验',
    narrator: '旁白',
    intro: [
      '回到宗门，你发现周边已有数个他方势力崛起。',
      '修仙界弱肉强食，你需要通过外交手段维护宗门利益。',
      '「派遣使者改善关系，或以武力争夺资源点——宗主的抉择在你手中。」',
    ],
    objective: '完成一次外交行动',
    objectiveType: 'talk_npc',
    objectiveTarget: 'diplomacy',
    hint: '在宗门场景点击「外交」按钮，选择一个他方势力进行交涉。',
    completion: [
      '外交行动完成。你对修仙界的势力格局有了更深的理解。',
      '然而，就在你忙于外交之际，一个不速之客来到了宗门前……',
    ],
    rewards: { exp: 1000, gold: 500, insight: 20 },
    prerequisite: 'mq_2_5',
  },
  {
    id: 'mq_2_7', volume: 'vol2', chapter: 7,
    title: '宿敌初现',
    narrator: '冷无缺',
    intro: [
      '一个浑身散发寒气的修士出现在宗门前：「你就是新晋的宗主？」',
      '「冷无缺。」他自报姓名，「你我之间，迟早要分个高下。不过现在还不是时候。」',
      '「等你有了资格再来找我——25级，天枢城外。」',
      '说罢，他化作一道寒芒消失。',
    ],
    objective: '达到 25 级',
    objectiveType: 'reach_level',
    objectiveTarget: '25',
    hint: '继续历练秘境、参与擂台、完成宗门任务。',
    completion: [
      '你到达25级，实力今非昔比。',
      '冷无缺的身影出现在天枢城外，他嘴角微扬：「来了？」',
    ],
    rewards: { exp: 2500, insight: 30 },
    prerequisite: 'mq_2_6',
  },
  {
    id: 'mq_2_8', volume: 'vol2', chapter: 8,
    title: '第二卷·终章·抉择',
    narrator: '旁白',
    intro: [
      '冷无缺的实力远超想象，但他并未与你死战。',
      '「你知道仙宫封印的事吧？」他突然收剑，「封印下不只有凶兽——还有一个远古宗门的传承。」',
      '「你我若是互相消耗，只会让渔翁得利。不如……暂时联手？」',
      '你面临抉择：与宿敌联手探索仙宫，还是独闯？',
    ],
    objective: '到达 30 级',
    objectiveType: 'reach_level',
    objectiveTarget: '30',
    hint: '继续修炼，突破至30级。',
    completion: [
      '你做出了决定。无论前路如何，你都已做好了准备。',
      '萧天衡传来消息：仙宫封印加速松动，各地妖气暴涨，修仙界大劫将至。',
      '「宗主，该行动了。」',
      '【第二卷·崭露头角·完】',
    ],
    rewards: { exp: 4000, gold: 1000, insight: 60, itemDesc: '远古宗门令牌碎片' },
    prerequisite: 'mq_2_7',
  },

  // ===== 第三卷：风云际会 =====
  {
    id: 'mq_3_1', volume: 'vol3', chapter: 1,
    title: '妖气滔天',
    narrator: '旁白',
    intro: [
      '修仙界各地妖气暴涨，秘境中的妖兽变得狂暴异常。',
      '萧天衡发出征召令，号召各宗门联合清剿。',
      '「宗主，这是你的机会——在清剿中展现宗门实力，赢得天下修士的尊重。」',
    ],
    objective: '累计击杀 200 只妖兽',
    objectiveType: 'collect_kills',
    objectiveTarget: '200',
    hint: '在各类秘境中击杀妖兽累积。',
    completion: [
      '你的战绩传遍南域，各宗门对你刮目相看。',
      '然而，你注意到这些妖兽的异变并非自然——似乎有人在暗中推波助澜。',
    ],
    rewards: { exp: 3000, gold: 800, insight: 40 },
    prerequisite: 'mq_2_8',
  },
  {
    id: 'mq_3_2', volume: 'vol3', chapter: 2,
    title: '宗门大比',
    narrator: '旁白',
    intro: [
      '天枢城举办十年一度的宗门大比，各宗门踊跃参加。',
      '「大比前三名可获得仙宫探索的特许令牌。」',
      '你必须在擂台中证明宗门的实力。',
    ],
    objective: '擂台胜场达到 15 次',
    objectiveType: 'win_arena',
    objectiveTarget: '15',
    hint: '在天枢城擂台持续挑战。',
    completion: [
      '你率领宗门弟子在擂台上大放异彩，夺得前三！',
      '雷震亲手递上仙宫探索令牌：「恭喜宗主！有了此牌，你们可以深入仙宫禁区。」',
    ],
    rewards: { exp: 4000, gold: 1500, insight: 50 },
    prerequisite: 'mq_3_1',
  },
  {
    id: 'mq_3_3', volume: 'vol3', chapter: 3,
    title: '深入仙宫',
    narrator: '旁白',
    intro: [
      '手持探索令牌，你再次踏入破碎仙宫。',
      '这次，你可以深入禁区——那里封印着上古凶兽的力量核心。',
    ],
    objective: '破碎仙宫到达第 10 层',
    objectiveType: 'clear_dungeon',
    objectiveTarget: 'xian_deep',
    hint: '在破碎仙宫中不断深入，达到第10层。',
    completion: [
      '仙宫第十层，你找到了封印核心——一块巨大的镇魂石。',
      '镇魂石上刻满了密密麻麻的封印符文，但其中一些已经碎裂。',
      '「果然……有人在破坏封印。」你低声道。',
      '就在此时，一道黑影从暗处掠出——',
    ],
    rewards: { exp: 5000, gold: 2000, insight: 80 },
    prerequisite: 'mq_3_2',
  },
  {
    id: 'mq_3_4', volume: 'vol3', chapter: 4,
    title: '暗影真身',
    narrator: '旁白',
    intro: [
      '黑影化作人形——竟是一名身穿黑袍的修士，浑身散发着远超凡人的威压。',
      '「你来得太早了。」黑袍人冷笑，「不过也无妨——封印已是强弩之末。」',
      '「你以为万年前的那场封印是为了镇压凶兽？天真。那头凶兽不过是个守门人。」',
      '「门后……是真正的仙界遗产。而我，等了万年。」',
      '黑袍人挥手，一股巨力将你击退。你实力不足，只能撤退。',
    ],
    objective: '突破至炼虚期（境界 5）',
    objectiveType: 'reach_realm',
    objectiveTarget: '5',
    hint: '继续修炼，达到40级后可突破炼虚期。',
    completion: [
      '炼虚大成！你的实力已足以与黑袍人一战。',
      '萧天衡：「宗主，大劫将至。我已召集各域盟友，但最终的战斗仍需你来主导。」',
    ],
    rewards: { exp: 6000, insight: 80, potions: 20 },
    prerequisite: 'mq_3_3',
  },
  {
    id: 'mq_3_5', volume: 'vol3', chapter: 5,
    title: '五域联军',
    narrator: '旁白',
    intro: [
      '你通过外交手段联合各域宗门，组建五域联军。',
      '萧天衡、冷无缺、无名老叟等强者纷纷响应号召。',
      '「决战之前，你需要确保宗门后方稳固——在宗门战争中取得一场决定性胜利。」',
    ],
    objective: '在宗门战争中击败一个他方宗门',
    objectiveType: 'defeat_boss',
    objectiveTarget: 'ai_sect_war',
    hint: '在宗门外交面板对一个他方势力宣战，并发动宗门决战。',
    completion: [
      '宗门决战大获全胜！敌方宗门覆灭，你的威名传遍五域。',
      '联军士气大振，各宗门纷纷表示追随你征讨黑袍人。',
    ],
    rewards: { exp: 5000, gold: 3000, insight: 60 },
    prerequisite: 'mq_3_4',
  },
  {
    id: 'mq_3_6', volume: 'vol3', chapter: 6,
    title: '远古真相',
    narrator: '无名老叟',
    intro: [
      '无名老叟在望仙崖等你。他终于说出了自己的真实身份——',
      '「我乃万年前封印仙宫的那位修士的残余意志。」',
      '「仙宫中封印的不是凶兽，而是一头仙界叛逃的仙兽——它携带着仙界的至宝『天道残卷』。」',
      '「黑袍人想要得到天道残卷，以逆转仙凡之界。若他得逞，修仙界将天翻地覆。」',
      '「你需到达45级，方可与黑袍人一战。」',
    ],
    objective: '到达 45 级',
    objectiveType: 'reach_level',
    objectiveTarget: '45',
    hint: '深入秘境、参与宗门战争、完成各类挑战来提升等级。',
    completion: [
      '你到达45级，实力已臻化境。',
      '无名老叟将一道灵光打入你体内：「这是我最后的传承。去吧，终结这一切。」',
      '老叟化为光点消散，而你感到体内多了一股古老而温暖的力量。',
    ],
    rewards: { exp: 8000, insight: 100, itemDesc: '远古传承之力' },
    prerequisite: 'mq_3_5',
  },
  {
    id: 'mq_3_7', volume: 'vol3', chapter: 7,
    title: '决战前夜',
    narrator: '旁白',
    intro: [
      '五域联军在破碎仙宫下集结。萧天衡、冷无缺、陆青鸢等强者各率一方。',
      '「宗主，这是最后的准备时间。突破至合体期，你才能正面抗衡黑袍人。」',
    ],
    objective: '突破至合体期（境界 6）',
    objectiveType: 'reach_realm',
    objectiveTarget: '6',
    hint: '达到50级后可尝试突破合体期——这是凡界修士的极限。',
    completion: [
      '合体期突破！你的修为已达凡界巅峰。',
      '天地间风起云涌，似乎感应到了一场惊天大战即将到来。',
      '「出发！」你一声令下，五域联军向仙宫进发。',
    ],
    rewards: { exp: 10000, insight: 120, potions: 30 },
    prerequisite: 'mq_3_6',
  },
  {
    id: 'mq_3_8', volume: 'vol3', chapter: 8,
    title: '第三卷·终章·封印之战',
    narrator: '旁白',
    intro: [
      '仙宫之巅，黑袍人站在封印核心旁，周身黑气缭绕。',
      '「你来了。很好，省得我去找你。」',
      '「这一战，赌上修仙界的命运。你——准备好了吗？」',
      '你拔出法器，身后是数万联军的眼神。这一刻，你不再是一个人。',
    ],
    objective: '到达 50 级',
    objectiveType: 'reach_level',
    objectiveTarget: '50',
    hint: '这是最终决战的门槛——达到50级，凡界巅峰。',
    completion: [
      '一场惊天动地的大战在仙宫之巅爆发。',
      '黑袍人的实力深不可测，但在五域联军的支援下，你找到了他的破绽——',
      '一击贯穿！黑袍人跌落封印核心，天道残卷从其体内飞出。',
      '「不可能……凡人怎能……」黑袍人化为齑粉。',
      '你握住天道残卷，感受到其中蕴含的无上大道之力。',
      '「封印修复了。修仙界……暂时安全了。」',
      '然而你低头看向残卷——上面写着：「仙界之门，即将开启。」',
      '【第三卷·风云际会·完】',
    ],
    rewards: { exp: 15000, gold: 5000, insight: 200, itemDesc: '天道残卷' },
    prerequisite: 'mq_3_7',
  },

  // ===== 第四卷：问道苍穹 =====
  {
    id: 'mq_4_1', volume: 'vol4', chapter: 1,
    title: '天道残卷',
    narrator: '旁白',
    intro: [
      '天道残卷蕴含着仙界之门的信息——',
      '「凡界修士若要飞升，需集齐五域天道碎片，开启仙界之门。」',
      '你手中的残卷只是其一。另外四块碎片分散在中域、东域、西域、北域。',
      '是时候离开南域，踏上五域之旅了。',
    ],
    objective: '到达 55 级',
    objectiveType: 'reach_level',
    objectiveTarget: '55',
    hint: '继续深入各类秘境提升修为。',
    completion: [
      '你的实力已足以踏入其他域界。',
      '大地图扩展——五域之门已为你敞开！',
    ],
    rewards: { exp: 12000, insight: 100 },
    prerequisite: 'mq_3_8',
  },
  {
    id: 'mq_4_2', volume: 'vol4', chapter: 2,
    title: '中域·天元宗',
    narrator: '旁白',
    intro: [
      '中域天元宗，修仙界最大的宗门之一。天道碎片被供奉在其镇宗之宝中。',
      '「想要碎片？先证明你有资格。」天元宗宗主提出三个条件——',
      '其一，擂台胜场达30次。其二，宗门等级达到5级。其三，击败天元宗首席弟子。',
    ],
    objective: '擂台胜场达到 30 次',
    objectiveType: 'win_arena',
    objectiveTarget: '30',
    hint: '在天枢城擂台持续挑战，累积胜场。',
    completion: [
      '你在擂台上击败了天元宗首席弟子，三十场胜利威震五域。',
      '天元宗宗主交出天道碎片：「后生可畏。修仙界的未来，交给你了。」',
    ],
    rewards: { exp: 15000, gold: 5000, insight: 150 },
    prerequisite: 'mq_4_1',
  },
  {
    id: 'mq_4_3', volume: 'vol4', chapter: 3,
    title: '东域·沧海阁',
    narrator: '旁白',
    intro: [
      '东域沧海阁临海而建，女子宗门。天道碎片藏于海底秘境之中。',
      '沧海阁掌门：「碎片在海眼深处，需以特殊方式取得——你的宗门必须足够强大。」',
    ],
    objective: '宗门等级达到 5 级（主殿Lv.5）',
    objectiveType: 'sect_level',
    objectiveTarget: '5',
    hint: '在宗门场景升级主殿至5级。',
    completion: [
      '宗门实力大增，沧海阁掌门颔首认可。',
      '你潜入海眼深处，取得天道碎片。海底风景如梦，但你心中隐隐不安——',
      '仙界之门开启后，等待你的是什么？',
    ],
    rewards: { exp: 18000, gold: 3000, insight: 150 },
    prerequisite: 'mq_4_2',
  },
  {
    id: 'mq_4_4', volume: 'vol4', chapter: 4,
    title: '西域·万兽山',
    narrator: '旁白',
    intro: [
      '西域万兽山，妖兽横行之地。天道碎片被一头上古凶兽守护。',
      '「此兽实力远超凡界——你需在无尽妖域中深入50层以上，方可获得足够的力量。」',
    ],
    objective: '无尽妖域到达第 50 层',
    objectiveType: 'clear_dungeon',
    objectiveTarget: 'sy_50',
    hint: '在无尽妖域中不断深入挑战。',
    completion: [
      '无尽妖域第50层——你击败了守护凶兽，获得天道碎片。',
      '凶兽临死前留下一句话：「仙界……并非你想象中那般美好……」',
    ],
    rewards: { exp: 20000, gold: 5000, insight: 200 },
    prerequisite: 'mq_4_3',
  },
  {
    id: 'mq_4_5', volume: 'vol4', chapter: 5,
    title: '北域·冰原遗迹',
    narrator: '旁白',
    intro: [
      '北域冰原之下，埋藏着上古修士的遗迹。最后一块天道碎片就在其中。',
      '「冰原遗迹中寒气逼人，需要极大的悟道之力方能抵御。」',
    ],
    objective: '悟道点达到 500',
    objectiveType: 'collect_gold',
    objectiveTarget: 'insight_500',
    hint: '参悟悟道石、完成宗门科技研究、完成各类任务获取悟道点。',
    completion: [
      '你以深厚的悟道之力抵御冰原寒气，深入遗迹取得了最后一块天道碎片。',
      '五块碎片在你手中合为一体——天道残卷完整了！',
      '仙界之门的位置浮现在你脑海中——就在破碎仙宫的最深处。',
    ],
    rewards: { exp: 25000, insight: 300, itemDesc: '完整的天道残卷' },
    prerequisite: 'mq_4_4',
  },
  {
    id: 'mq_4_6', volume: 'vol4', chapter: 6,
    title: '仙界之门',
    narrator: '旁白',
    intro: [
      '你回到破碎仙宫最深处，将完整的天道残卷放入封印核心。',
      '光芒大盛——一扇巨大的门户在仙宫之巅缓缓显现。',
      '仙界之门！',
      '门后传来浩瀚的仙力，以及一个低沉的声音：「你准备好了吗，凡人？」',
    ],
    objective: '到达 60 级',
    objectiveType: 'reach_level',
    objectiveTarget: '60',
    hint: '这是飞升前的最后门槛——达到60级，凡界之巅。',
    completion: [
      '你站在仙界之门前，回望来时路。',
      '从青冥山脚的懵懂少年，到如今站在仙凡之界的修士——',
      '一切，都是为了这一刻。',
    ],
    rewards: { exp: 30000, insight: 500 },
    prerequisite: 'mq_4_5',
  },
  {
    id: 'mq_4_7', volume: 'vol4', chapter: 7,
    title: '第四卷·终章·飞升',
    narrator: '旁白',
    intro: [
      '你踏入仙界之门。',
      '浩瀚的仙力涌入体内，你的修为突破凡界极限——',
      '飞升！',
      '然而，仙界并非你想象中的仙境。等待你的，是更大的挑战……',
      '「凡人，你以为飞升就是终点？不——这只是开始。」',
    ],
    objective: '累计击杀 500 只妖兽',
    objectiveType: 'collect_kills',
    objectiveTarget: '500',
    hint: '在各类秘境中继续历练，达到500击杀。',
    completion: [
      '你以无上之力扫清前路障碍。',
      '仙界之门后，是一个全新的世界——但你的故事，远未结束。',
      '「修仙无止境，问道永不息。」',
      '【第四卷·问道苍穹·完】',
      '【主线剧情·全卷终】',
      '——但你的修仙之旅仍在继续。无尽妖域深处、仙界秘境、宗门争霸……',
      '修仙与地下城，永无止境。',
    ],
    rewards: { exp: 50000, gold: 10000, insight: 1000, itemDesc: '飞升者称号' },
    prerequisite: 'mq_4_6',
  },
]

/** 获取某卷的所有任务 */
export function getVolumeQuests(volume: VolumeId): MainQuestDef[] {
  return MAIN_QUESTS.filter(q => q.volume === volume)
}

/** 获取某任务 */
export function getMainQuest(id: string): MainQuestDef | undefined {
  return MAIN_QUESTS.find(q => q.id === id)
}

/** 获取卷宗定义 */
export function getVolume(id: VolumeId): VolumeDef | undefined {
  return VOLUMES.find(v => v.id === id)
}

/** 获取第一个可接取的任务（前置已完成或为空） */
export function getFirstAvailableQuest(
  completedQuests: Set<string>,
  level: number,
  realm: number,
): MainQuestDef | undefined {
  for (const q of MAIN_QUESTS) {
    if (completedQuests.has(q.id)) continue
    if (q.prerequisite && !completedQuests.has(q.prerequisite)) continue
    return q
  }
  return undefined
}
