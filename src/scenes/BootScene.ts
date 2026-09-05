import Phaser from 'phaser'
import { generateMissing, SPRITE_KEYS } from '../textures'
import { AUDIO_KEYS, audioInit, BGM_TITLE, playBgm, audioUrls } from '../audio'
import { REGIONS } from '../data'
import { loadGame } from '../state'
import { initUI } from '../ui'
import {
  SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS,
  SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS,
  hasCompleteSequenceResourceBundleForRegistration,
  type SequenceResourceBundleRegistrationKey,
} from '../fx/sequence-contract'
import { V4_KIT_ASSET_READY } from '../v4/manifest'

const ANIM_CLASSES = ['sword', 'fairy', 'mage', 'sword_new', 'fairy_new']

// 灵兽动画种类（8 只灵兽，每只 1 个 idle 动画）
const BEAST_ANIM_IDS = ['wolf', 'turtle', 'fox', 'bear', 'eagle', 'serpent', 'qilin', 'dragon']
// 阵法动画种类（3 种类型，每类 1 个 spin 动画）
const FORMATION_ANIM_TYPES = ['attack', 'defense', 'trap']
// 宗门建筑（14 种，单帧 atlas）
const BUILDING_IDS = [
  'main_hall', 'spirit_vein', 'disciple_room', 'alchemy_room', 'forge_pavilion',
  'library', 'training_ground', 'guard_array', 'quest_hall', 'spirit_farm',
  'ore_mine', 'wood_pavilion', 'beast_park', 'realm_gate',
]
// NPC/弟子 角色（4 种，4方向 idle 动画）
const NPC_ANIM_IDS = ['disciple_outer', 'disciple_inner', 'elder', 'deacon']
// 建筑所在的精灵表（building id -> 精灵表文件名）
const BUILDING_SHEET_MAP: Record<string, string> = {
  main_hall: 'sect_buildings_core',
  library: 'sect_buildings_core',
  guard_array: 'sect_buildings_core',
  realm_gate: 'sect_buildings_core',
  alchemy_room: 'sect_buildings_craft',
  forge_pavilion: 'sect_buildings_craft',
  training_ground: 'sect_buildings_craft',
  quest_hall: 'sect_buildings_craft',
  spirit_vein: 'sect_buildings_resource',
  disciple_room: 'sect_buildings_resource',
  spirit_farm: 'sect_buildings_resource',
  beast_park: 'sect_buildings_resource',
  ore_mine: 'sect_buildings_mine_wood',
  wood_pavilion: 'sect_buildings_mine_wood',
}
// 建筑精灵表图片文件（去重后的列表）
const BUILDING_SHEET_FILES = ['core', 'craft', 'resource', 'mine_wood']

// 序列帧特效动画：逐帧独立 PNG，仅在所有帧加载成功时注册动画
// - 无 anim 字段者为多段动画（sword_proj / slash），沿用下方硬编码注册块
// - 有 anim 字段者为单段动画（Tier1+2 批量特效），由数据驱动循环批量注册
type MultiSegmentFxBundleDef = {
  key: 'sword_proj' | 'slash'
  frameSize: number
  anim?: undefined
}
type SingleSegmentFxAnimDef = {
  key: Exclude<SequenceResourceBundleRegistrationKey, 'sword_proj' | 'slash'>
  frameSize: number
  anim: { frameRate: number; repeat: number }
}
type FxAnimDef = MultiSegmentFxBundleDef | SingleSegmentFxAnimDef

const FX_ANIMS: readonly FxAnimDef[] = [
  { key: 'mod_blade', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },
  { key: 'mod_burst', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },
  { key: 'mod_charge', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },
  { key: 'mod_field', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },
  { key: 'mod_hit', frameSize: 48, anim: { frameRate: 14, repeat: 0 } },
  { key: 'mod_rune', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },
  { key: 'sword_proj', frameSize: 48 },
  { key: 'slash', frameSize: 48 },
  // ---- Tier1+2 批量特效（fx-anim-batch-spec.md §1）----
  { key: 'fx_ring', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },   // 径向环，once
  { key: 'fx_splash', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },  // 爆裂溅射，once
  { key: 'fx_spark', frameSize: 48, anim: { frameRate: 14, repeat: 0 } },  // 飞剑火花，once
  { key: 'bolt_fly', frameSize: 48, anim: { frameRate: 10, repeat: -1 } }, // 火弹弹道，loop
  { key: 'proj_fly', frameSize: 48, anim: { frameRate: 10, repeat: -1 } }, // 祛础弹道，loop
  // ---- Tier3 新增招式贴图（10种）----
  { key: 'fx_shadow', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },   // 暗影刃
  { key: 'fx_chain', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },    // 灵锁链
  { key: 'fx_wind', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },      // 风刃连
  { key: 'fx_spike', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },     // 地刺术
  { key: 'fx_scythe', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },   // 血镰斩
  { key: 'fx_star', frameSize: 48, anim: { frameRate: 14, repeat: 0 } },    // 星雨弩
  { key: 'fx_claw', frameSize: 48, anim: { frameRate: 14, repeat: 0 } },     // 毒爪裂
  { key: 'fx_light', frameSize: 48, anim: { frameRate: 14, repeat: 0 } },    // 圣光束
  { key: 'fx_soul', frameSize: 48, anim: { frameRate: 10, repeat: 0 } },    // 魂火弹
  { key: 'fx_crystal', frameSize: 48, anim: { frameRate: 12, repeat: 0 } }, // 晶碎刃
  // ---- Tier3 新增神通贴图（10种）----
  { key: 'fx_meteor', frameSize: 48, anim: { frameRate: 10, repeat: 0 } },   // 陨石天降
  { key: 'fx_void', frameSize: 48, anim: { frameRate: 10, repeat: 0 } },     // 虚空裂
  { key: 'fx_blood', frameSize: 48, anim: { frameRate: 10, repeat: 0 } },   // 血域降
  { key: 'fx_pillar', frameSize: 48, anim: { frameRate: 12, repeat: 0 } }, // 圣光柱
  { key: 'fx_frozen', frameSize: 48, anim: { frameRate: 12, repeat: 0 } }, // 冰封域
  { key: 'fx_vortex', frameSize: 48, anim: { frameRate: 12, repeat: 0 } }, // 元神旋
  { key: 'fx_orbit', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },   // 剑环舞
  { key: 'fx_poison', frameSize: 48, anim: { frameRate: 10, repeat: 0 } },  // 万毒瘴
  { key: 'fx_gravity', frameSize: 48, anim: { frameRate: 10, repeat: 0 } },// 重力渊
  { key: 'fx_phoenix', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },// 凤凰涅
]

export class BootScene extends Phaser.Scene {
  private failedKeys = new Set<string>()
  private readonly isMinitool = typeof window !== 'undefined' && (window as any).__MINITOOL__ === true
  // 加载进度条相关
  private progressBarBg: Phaser.GameObjects.Graphics | null = null
  private progressBar: Phaser.GameObjects.Graphics | null = null
  private progressText: Phaser.GameObjects.Text | null = null
  private loadingText: Phaser.GameObjects.Text | null = null
  private titleText: Phaser.GameObjects.Text | null = null
  // 资源加载占整个启动过程的 80%，create() 阶段占 20%
  private static readonly LOAD_RATIO = 0.8
  private static readonly CREATE_RATIO = 0.2
  private static readonly CREATE_STEPS = 10
  private createStep = 0

  constructor() { super('Boot') }

  preload() {
    // 创建加载界面
    this.createLoadingScreen()

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.failedKeys.add(file.key)
    })

    // 监听加载进度（映射到 0 ~ LOAD_RATIO）
    this.load.on('progress', (value: number) => {
      this.updateProgress(value * BootScene.LOAD_RATIO)
    })

    // 加载完成
    this.load.on('complete', () => {
      this.updateProgress(BootScene.LOAD_RATIO)
    })

    if (this.isMinitool) {
      this.preloadMinitool()
      return
    }
    this.preloadStandard()
  }

  /** 创建加载界面 */
  private createLoadingScreen() {
    const w = this.cameras.main.width
    const h = this.cameras.main.height
    const cx = w / 2
    const cy = h / 2

    // 深色背景
    this.add.rectangle(0, 0, w, h, 0x0a0a14).setOrigin(0, 0)

    // 星空装饰（简单的随机星点）
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const size = Math.random() * 2 + 0.5
      const alpha = Math.random() * 0.6 + 0.2
      this.add.circle(x, y, size, 0xffffff, alpha)
    }

    // 游戏标题
    this.titleText = this.add.text(cx, cy - 100, '修仙与地下城', {
      fontSize: '32px',
      color: '#ffd54a',
      fontStyle: 'bold',
      stroke: '#2a1a0a',
      strokeThickness: 4,
    }).setOrigin(0.5)

    // 副标题
    this.add.text(cx, cy - 60, '像素修仙 · ROGUELIKE', {
      fontSize: '14px',
      color: '#aabbdd',
    }).setOrigin(0.5)

    // 加载文字
    this.loadingText = this.add.text(cx, cy + 10, '正在汲取天地灵气...', {
      fontSize: '14px',
      color: '#cccccc',
    }).setOrigin(0.5)

    // 进度条背景
    const barWidth = Math.min(280, w * 0.7)
    const barHeight = 12
    const barX = cx - barWidth / 2
    const barY = cy + 40

    this.progressBarBg = this.add.graphics()
    this.progressBarBg.fillStyle(0x222233, 0.8)
    this.progressBarBg.fillRoundedRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4, 4)
    this.progressBarBg.lineStyle(2, 0x445577, 0.6)
    this.progressBarBg.strokeRoundedRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4, 4)

    // 进度条
    this.progressBar = this.add.graphics()

    // 进度百分比文字
    this.progressText = this.add.text(cx, cy + 70, '0%', {
      fontSize: '12px',
      color: '#88aacc',
    }).setOrigin(0.5)
  }

  /** 更新加载进度 */
  private updateProgress(value: number) {
    if (!this.progressBar || !this.progressText) return

    const w = this.cameras.main.width
    const barWidth = Math.min(280, w * 0.7)
    const barHeight = 12
    const barX = w / 2 - barWidth / 2
    const barY = this.cameras.main.height / 2 + 40

    this.progressBar.clear()
    const fillWidth = Math.max(0, Math.min(barWidth, barWidth * value))
    // 渐变效果：从蓝到金到橙红
    // 使用分段矩形模拟渐变
    const segments = 20
    const segWidth = fillWidth / segments
    for (let i = 0; i < segments; i++) {
      const t = i / segments
      // 颜色插值：0% = 蓝，50% = 金，100% = 橙红
      let r: number, g: number, b: number
      if (t < 0.5) {
        const lt = t * 2
        r = Math.round(0x6b + (0xff - 0x6b) * lt)
        g = Math.round(0x8f + (0xd5 - 0x8f) * lt)
        b = Math.round(0xff + (0x4a - 0xff) * lt)
      } else {
        const lt = (t - 0.5) * 2
        r = Math.round(0xff + (0xff - 0xff) * lt)
        g = Math.round(0xd5 + (0x88 - 0xd5) * lt)
        b = Math.round(0x4a + (0x66 - 0x4a) * lt)
      }
      const color = Phaser.Display.Color.GetColor(r, g, b)
      this.progressBar.fillStyle(color, 1)
      this.progressBar.fillRect(barX + i * segWidth, barY, segWidth + 0.5, barHeight)
    }
    // 圆角末端
    if (fillWidth > 6) {
      this.progressBar.fillStyle(0xff8866, 1)
      this.progressBar.fillRoundedRect(barX + fillWidth - 6, barY, 6, barHeight, 2)
    }

    const percent = Math.round(value * 100)
    this.progressText.setText(`${percent}%`)

    // 加载完成时的文字变化
    if (value >= 0.99 && this.loadingText) {
      this.loadingText.setText('灵气充盈，仙途将启...')
    }
  }

  /** create() 阶段进度推进 */
  private advanceCreateProgress() {
    this.createStep++
    const ratio = BootScene.LOAD_RATIO + (this.createStep / BootScene.CREATE_STEPS) * BootScene.CREATE_RATIO
    this.updateProgress(Math.min(1, ratio))
  }

  private preloadMinitool() {
    const atlasFiles = [
      'atlas_main', 'atlas_v4_1', 'atlas_v4_2',
      'atlas_xian', 'atlas_terrain',
    ]
    for (const name of atlasFiles) {
      this.load.atlas(name, `sprites/${name}.png`, `sprites/${name}.json`)
    }
    for (const cls of ANIM_CLASSES) {
      this.load.atlas(`${cls}_atlas`, `sprites/${cls}_spritesheet.png`, `sprites/${cls}_atlas.json`)
      this.load.json(`${cls}_anims`, `sprites/${cls}_anims.json`)
    }
    for (const key of AUDIO_KEYS) {
      this.load.audio(key, audioUrls(key))
    }
  }

  private preloadStandard() {
    // 静态贴图：外部文件优先，失败用程序化兜底
    for (const key of SPRITE_KEYS) {
      this.load.image(key, `sprites/${key}.png`)
    }
    // v2 地形瓷砖集（每区域一套完整瓷砖）
    const terrainTiles = [
      'floor_base', 'floor_var1', 'floor_var2', 'floor_var3', 'floor_edge',
      'wall_top', 'wall_side', 'wall_corner_tl', 'wall_corner_tr', 'wall_corner_bl', 'wall_corner_br', 'wall_pillar',
      'water_1', 'water_2', 'water_3', 'water_4',
      'floor_deco_1', 'floor_deco_2', 'floor_deco_3', 'floor_deco_4',
      'wall_deco_1', 'wall_deco_2', 'wall_deco_3',
    ]
    for (const r of REGIONS) {
      for (const tile of terrainTiles) {
        this.load.image(`terrain_${r.terrainPrefix}_${tile}`, `sprites/terrain/${r.terrainPrefix}_${tile}.png`)
      }
    }
    // 仙界敌人形象（16帧精灵动画：4行×4列 = idle/walk/attack/hit）
    const xianEnemies = [
      'xian_sanxian_m', 'xian_sanxian_f', 'xian_zhenxian_m', 'xian_zhenxian_f',
      'xian_jinxian_m', 'xian_jinxian_f', 'xian_tong_nan', 'xian_tong_nv',
      'beast_crane', 'beast_deer', 'beast_pixiu', 'beast_phoenix',
      'boss_xianzun',
    ]
    for (const e of xianEnemies) {
      // 主贴图（帧 1）用于精灵创建
      this.load.image(e, `sprites/xian/${e}_1.png`)
      // 全部 16 帧用于动画
      for (let i = 1; i <= 16; i++) {
        this.load.image(`${e}_${i}`, `sprites/xian/${e}_${i}.png`)
      }
    }
    // 仙界专用物件
    this.load.image('portal_xian', 'sprites/portal_xian.png')
    this.load.image('cave_bg_xian', 'sprites/cave_bg_xian.png')
    this.load.image('chest_xian', 'sprites/chest_xian.png')
    this.load.image('altar_xian', 'sprites/altar_xian.png')
    this.load.image('talisman_save', 'sprites/talisman_save.png')
    // AI 生成攻击特效帧（仙界专用）
    const aiEffectSheets = ['ai_slash', 'ai_sword_proj', 'ai_bolt_fly', 'ai_proj_fx', 'ai_mod', 'ai_burst']
    for (const prefix of aiEffectSheets) {
      for (let i = 1; i <= 16; i++) {
        this.load.image(`${prefix}_${i}`, `sprites/${prefix}_${i}.png`)
      }
    }
    // thunder_prison 神通特效帧（AI 生成）
    for (let i = 1; i <= 4; i++) {
      this.load.image(`thunder_prison_${i}`, `sprites/thunder_prison_${i}.png`)
    }
    // 角色帧动画（atlas + 动画定义）
    for (const cls of ANIM_CLASSES) {
      this.load.atlas(`${cls}_atlas`, `sprites/${cls}_spritesheet.png`, `sprites/${cls}_atlas.json`)
      this.load.json(`${cls}_anims`, `sprites/${cls}_anims.json`)
    }
    // 灵兽帧动画（atlas + 动画定义）
    for (const id of BEAST_ANIM_IDS) {
      this.load.atlas(`beast_${id}_atlas`, `sprites/beast_${id}_sheet.png`, `sprites/beast_${id}_atlas.json`)
      this.load.json(`beast_${id}_anims`, `sprites/beast_${id}_anims.json`)
    }
    // 阵法帧动画（atlas + 动画定义）
    for (const t of FORMATION_ANIM_TYPES) {
      this.load.atlas(`formation_${t}_atlas`, `sprites/formation_${t}_spin.png`, `sprites/formation_${t}_atlas.json`)
      this.load.json(`formation_${t}_anims`, `sprites/formation_${t}_anims.json`)
    }
    // 宗门建筑（每个建筑一个单帧 atlas，指向对应的精灵表）
    for (const bid of BUILDING_IDS) {
      const sheet = BUILDING_SHEET_MAP[bid]
      if (sheet) {
        this.load.atlas(`building_${bid}`, `sprites/${sheet}.png`, `sprites/building_${bid}.json`)
      }
    }
    // NPC/弟子角色动画（atlas + 动画定义）
    for (const nid of NPC_ANIM_IDS) {
      this.load.atlas(`npc_${nid}_atlas`, `sprites/npc_${nid}_sheet.png`, `sprites/npc_${nid}_atlas.json`)
      this.load.json(`npc_${nid}_anims`, `sprites/npc_${nid}_anims.json`)
    }
    // 宗门场景背景
    this.load.image('sect_bg', 'sprites/sect_bg.png')
    // 大地图五域背景（AI 生成）
    this.load.image('world_south_bg', 'sprites/world_south_bg.jpg')
    this.load.image('world_central_bg', 'sprites/world_central_bg.jpg')
    this.load.image('world_east_bg', 'sprites/world_east_bg.jpg')
    this.load.image('world_west_bg', 'sprites/world_west_bg.jpg')
    this.load.image('world_north_bg', 'sprites/world_north_bg.jpg')
    // AI 生成大地图建筑贴图 v2（高精度像素风 + 名称调性匹配）
    this.load.image('ai_bldg_home', 'sprites/bldg_home_v2.jpg')
    this.load.image('ai_bldg_city', 'sprites/bldg_city_v2.jpg')
    this.load.image('ai_bldg_sect', 'sprites/bldg_sect_v2.jpg')
    this.load.image('ai_bldg_dungeon', 'sprites/bldg_dungeon_v2.jpg')
    this.load.image('ai_bldg_landmark', 'sprites/bldg_landmark_v2.jpg')
    // AI 生成域特色地形贴图
    this.load.image('ai_terrain_south', 'sprites/terrain_south.jpg')
    this.load.image('ai_terrain_central', 'sprites/terrain_central.jpg')
    this.load.image('ai_terrain_east', 'sprites/terrain_east.jpg')
    this.load.image('ai_terrain_west', 'sprites/terrain_west.jpg')
    this.load.image('ai_terrain_north', 'sprites/terrain_north.jpg')
    // AI 生成大地图装饰物贴图
    this.load.image('ai_deco_waterfall', 'sprites/world_deco_waterfall.jpg')
    this.load.image('ai_deco_altar', 'sprites/world_deco_altar.jpg')
    this.load.image('ai_deco_bonfire', 'sprites/world_deco_bonfire.jpg')
    // AI 生成高清地形贴图
    this.load.image('ai_grass_hq', 'sprites/ai_grass_hq.jpg')
    this.load.image('ai_stone_hq', 'sprites/ai_stone_hq.jpg')
    this.load.image('ai_water_hq', 'sprites/ai_water_hq.jpg')
    this.load.image('ai_shrine', 'sprites/ai_shrine.jpg')
    // 高清像素风地貌贴图（无缝平铺）
    this.load.image('tex_grass', 'sprites/tex_grass.jpg')
    this.load.image('tex_stone', 'sprites/tex_stone.jpg')
    this.load.image('tex_water', 'sprites/tex_water.jpg')
    this.load.image('tex_sand', 'sprites/tex_sand.jpg')
    this.load.image('tex_snow', 'sprites/tex_snow.jpg')
    this.load.image('tex_forest', 'sprites/tex_forest.jpg')
    // 3D 植被装饰精灵（白底，后续抠图处理）
    this.load.image('spr_pine_tree', 'sprites/spr_pine_tree.jpg')
    this.load.image('spr_willow_tree', 'sprites/spr_willow_tree.jpg')
    this.load.image('spr_bamboo', 'sprites/spr_bamboo.jpg')
    this.load.image('spr_rock_formation', 'sprites/spr_rock_formation.jpg')
    this.load.image('spr_spirit_crystal', 'sprites/spr_spirit_crystal.jpg')
    this.load.image('spr_dead_tree', 'sprites/spr_dead_tree.jpg')
    this.load.image('spr_lotus_pond', 'sprites/spr_lotus_pond.jpg')
    // 大地图地点图标
    for (const icon of ['home', 'city', 'dungeon', 'resource', 'teleport', 'landmark', 'sect', 'domain_gate']) {
      this.load.image(`world_icon_${icon}`, `sprites/world_icon_${icon}.png`)
    }
    // Sequence texture keys come from registration bundles; missing assets retain static fallback paths.
    for (const fx of FX_ANIMS) {
      for (const textureKey of SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS[fx.key].requiredTextureKeysForRegistration) {
        this.load.image(textureKey, `sprites/${textureKey}.png`)
      }
    }
    // 音频：BGM + 音效（缺失文件走 loaderror 兜底，不影响游戏）
    for (const key of AUDIO_KEYS) {
      this.load.audio(key, audioUrls(key))
    }
    // 黄龙山 NPC 立绘（韩前辈 / 施法光翼 / 乐上师）
    this.load.image('hanli_base', 'sprites/hanli_base.png')
    this.load.image('hanli_cast', 'sprites/hanli_cast.png')
    this.load.image('leshangshi', 'sprites/leshangshi.png')
    // 天枢城场景资源（城池背景、竞技场背景、NPC精灵）
    this.load.image('city_map', 'sprites/city_map_large.png')
    this.load.image('city_bg', 'sprites/city_bg.png')
    this.load.image('arena_bg', 'sprites/arena_bg.png')
    this.load.image('npc_auctioneer', 'sprites/npc_auctioneer.png')
    this.load.image('npc_arena', 'sprites/npc_arena.png')
    this.load.image('npc_honor', 'sprites/npc_honor.png')
    this.load.image('npc_quest1', 'sprites/npc_quest1.png')
    this.load.image('npc_quest2', 'sprites/npc_quest2.png')
    this.load.image('npc_quest3', 'sprites/npc_quest3.png')
    this.load.image('npc_city_lord', 'sprites/npc_city_lord.png')
    this.load.image('npc_arena_champion', 'sprites/npc_arena_champion.png')
    this.load.image('npc', 'sprites/npc.png')
    // 洞府NPC（统一像素风）
    this.load.image('npc_merchant', 'sprites/npc_merchant.png')
    this.load.image('npc_elder', 'sprites/npc_elder.png')
    this.load.image('npc_blacksmith', 'sprites/npc_blacksmith.png')
    // 竞技场敌方NPC
    this.load.image('e_dark_sword', 'sprites/e_dark_sword.png')
    this.load.image('e_fire_mage', 'sprites/e_fire_mage.png')
    this.load.image('e_beast_tamer', 'sprites/e_beast_tamer.png')
    this.load.image('e_shadow_assassin', 'sprites/e_shadow_assassin.png')
    // 新怪物
    this.load.image('m_spirit_fox', 'sprites/m_spirit_fox.png')
    this.load.image('m_demon_general', 'sprites/m_demon_general.png')
    this.load.image('m_stone_guardian', 'sprites/m_stone_guardian.png')
    // Phase 7: 剧情线 NPC 立绘（64x64 PNG 透明背景）
    this.load.image('npc_sword_sage', 'sprites/story/npc_sword_sage.png')
    this.load.image('npc_alchemist_grandma', 'sprites/story/npc_alchemist_grandma.png')
    this.load.image('npc_demon_sealer', 'sprites/story/npc_demon_sealer.png')
    this.load.image('npc_wandering_cloud', 'sprites/story/npc_wandering_cloud.png')
    this.load.image('npc_spirit_tamer', 'sprites/story/npc_spirit_tamer.png')
    // Phase 7: 坐骑灵驹（基础图 + 4帧序列 + 精灵表）
    this.load.image('mount_spirit_horse', 'sprites/mount_spirit_horse.png')
    this.load.spritesheet('mount_spirit_horse_anim', 'sprites/mount_spirit_horse_sheet.png', { frameWidth: 64, frameHeight: 64 })
    // Phase 7: 秘境原住民部落精灵（基础图 + 4帧序列 + 精灵表）
    for (const tribe of ['spirit_beast', 'ancient_human', 'elemental', 'shadow_folk', 'crystal_people']) {
      this.load.image(`tribe_${tribe}`, `sprites/tribes/tribe_${tribe}.png`)
      this.load.spritesheet(`tribe_${tribe}_anim`, `sprites/tribes/tribe_${tribe}_sheet.png`, { frameWidth: 64, frameHeight: 64 })
    }
    // v4 Kit Atlas 资产（30 套 × 9 帧 = 270 帧，请求数 30）
    for (const kitId of V4_KIT_ASSET_READY) {
      this.load.atlas(`v4_${kitId}_atlas`, `sprites/v4-atlas/${kitId}_atlas.png`, `sprites/v4-atlas/${kitId}_atlas.json`)
    }
  }

  private extractAtlasFrames() {
    const atlasKeys = ['atlas_main', 'atlas_v4_1', 'atlas_v4_2', 'atlas_xian', 'atlas_terrain']
    for (const atlasKey of atlasKeys) {
      if (!this.textures.exists(atlasKey)) continue
      const atlas = this.textures.get(atlasKey)
      const sourceImage = atlas.getSourceImage() as HTMLImageElement | HTMLCanvasElement
      const frameNames = atlas.getFrameNames()
      for (const name of frameNames) {
        if (this.textures.exists(name)) continue
        const frame = atlas.get(name)
        const canvas = document.createElement('canvas')
        canvas.width = frame.cutWidth
        canvas.height = frame.cutHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(sourceImage, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, frame.cutWidth, frame.cutHeight)
        this.textures.addCanvas(name, canvas)
      }
    }
  }

  create() {
    // 将 create() 分为 10 个步骤，每步之间延迟一帧让进度条可见
    const steps: (() => void)[] = [
      // Step 1: 生成缺失贴图
      () => {
        if (this.isMinitool) {
          this.extractAtlasFrames()
          const missing = SPRITE_KEYS.filter(k => !this.textures.exists(k))
          generateMissing(this, missing)
        } else {
          generateMissing(this, this.failedKeys)
        }
        this.setLoadingText('正在凝聚灵脉...')
      },
      // Step 2: 音频初始化 + 贴图变体
      () => {
        audioInit(this.sound)
        playBgm(BGM_TITLE)
    // 预生成地面/墙体暗色变体贴图（canvas 合成，WebGL 下安全；丰富地面层次用）
    const variantOf = (src: string) => {
      const key = `${src}_d`
      if (this.textures.exists(key) || !this.textures.exists(src)) return
      const img = this.textures.get(src).getSourceImage() as HTMLImageElement | HTMLCanvasElement
      const c = document.createElement('canvas')
      c.width = img.width as number
      c.height = img.height as number
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = '#b8c0d8'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(img, 0, 0)
      this.textures.addCanvas(key, c)
    }
    for (const r of REGIONS) { variantOf(r.floorTex); variantOf(r.wallTex) }
        this.setLoadingText('正在炼化法阵...')
      },
      // Step 3: AI 贴图背景移除
      () => {
    // AI 生成装饰物背景移除（.jpg → 透明 .png 效果）
    const removeAiBg = (key: string) => {
      if (!this.textures.exists(key)) return
      const src = this.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement
      const w = src.width as number, h = src.height as number
      const cv = document.createElement('canvas')
      cv.width = w; cv.height = h
      const ctx = cv.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(src, 0, 0)
      const data = ctx.getImageData(0, 0, w, h)
      const px = data.data
      // 采样四角颜色作为背景色
      const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (h - 1) * w * 4 + (w - 1) * 4]
      const bgR = corners.reduce((s, i) => s + px[i], 0) / 4
      const bgG = corners.reduce((s, i) => s + px[i + 1], 0) / 4
      const bgB = corners.reduce((s, i) => s + px[i + 2], 0) / 4
      const threshold = 50
      for (let i = 0; i < px.length; i += 4) {
        const dr = Math.abs(px[i] - bgR)
        const dg = Math.abs(px[i + 1] - bgG)
        const db = Math.abs(px[i + 2] - bgB)
        if (dr + dg + db < threshold * 3) {
          px[i + 3] = 0 // 透明
        } else if (dr + dg + db < threshold * 6) {
          // 边缘半透明过渡
          px[i + 3] = Math.floor(255 * (dr + dg + db) / (threshold * 6))
        }
      }
      ctx.putImageData(data, 0, 0)
      this.textures.remove(key)
      this.textures.addCanvas(key, cv)
    }
    removeAiBg('ai_shrine')
    for (const spr of ['spr_pine_tree', 'spr_willow_tree', 'spr_bamboo', 'spr_rock_formation', 'spr_spirit_crystal', 'spr_dead_tree', 'spr_lotus_pond']) {
      removeAiBg(spr)
    }
        this.setLoadingText('正在注册剑灵...')
      },
      // Step 4: 角色动画 + 灵兽动画注册
      () => {
    // 注册角色动画（atlas 与动画定义都成功加载时）
    for (const cls of ANIM_CLASSES) {
      if (!this.textures.exists(`${cls}_atlas`)) { console.warn(`[anim] ${cls}_atlas missing`); continue }
      const tex = this.textures.get(`${cls}_atlas`)
      const testFrame = `${cls}_down_idle_00`
      const hasFrame = tex && tex.has ? tex.has(testFrame) : false
      if (!hasFrame) { console.warn(`[anim] ${cls} frame ${testFrame} NOT in texture!`); continue }
      const defs = this.cache.json.get(`${cls}_anims`) as Record<string, Phaser.Types.Animations.Animation> | undefined
      if (!defs) { console.warn(`[anim] ${cls}_anims missing`); continue }
      for (const def of Object.values(defs)) {
        if (!this.anims.exists(def.key!)) this.anims.create(def)
      }
    }
    // 注册灵兽动画
    for (const id of BEAST_ANIM_IDS) {
      const atlasKey = `beast_${id}_atlas`
      const animsKey = `beast_${id}_anims`
      if (!this.textures.exists(atlasKey)) { console.warn(`[beast-anim] ${atlasKey} missing`); continue }
      const tex = this.textures.get(atlasKey)
      const testFrame = `beast_${id}_idle_00`
      const hasFrame = tex && tex.has ? tex.has(testFrame) : false
      if (!hasFrame) { console.warn(`[beast-anim] ${id} frame ${testFrame} NOT in texture!`); continue }
      const defs = this.cache.json.get(animsKey) as Record<string, Phaser.Types.Animations.Animation> | undefined
      if (!defs) { console.warn(`[beast-anim] ${animsKey} missing`); continue }
      for (const def of Object.values(defs)) {
        if (!this.anims.exists(def.key!)) this.anims.create(def)
      }
    }
        this.setLoadingText('正在唤醒灵兽...')
      },
      // Step 5: 阵法 + NPC 动画注册
      () => {
    // 注册阵法动画
    for (const t of FORMATION_ANIM_TYPES) {
      const atlasKey = `formation_${t}_atlas`
      const animsKey = `formation_${t}_anims`
      if (!this.textures.exists(atlasKey)) { console.warn(`[form-anim] ${atlasKey} missing`); continue }
      const tex = this.textures.get(atlasKey)
      const testFrame = `formation_${t}_spin_00`
      const hasFrame = tex && tex.has ? tex.has(testFrame) : false
      if (!hasFrame) { console.warn(`[form-anim] ${t} frame ${testFrame} NOT in texture!`); continue }
      const defs = this.cache.json.get(animsKey) as Record<string, Phaser.Types.Animations.Animation> | undefined
      if (!defs) { console.warn(`[form-anim] ${animsKey} missing`); continue }
      for (const def of Object.values(defs)) {
        if (!this.anims.exists(def.key!)) this.anims.create(def)
      }
    }
    // 注册 NPC/弟子角色动画
    for (const nid of NPC_ANIM_IDS) {
      const atlasKey = `npc_${nid}_atlas`
      const animsKey = `npc_${nid}_anims`
      if (!this.textures.exists(atlasKey)) { console.warn(`[npc-anim] ${atlasKey} missing`); continue }
      const tex = this.textures.get(atlasKey)
      const testFrame = `npc_${nid}_00`
      const hasFrame = tex && tex.has ? tex.has(testFrame) : false
      if (!hasFrame) { console.warn(`[npc-anim] ${nid} frame ${testFrame} NOT in texture!`); continue }
      const defs = this.cache.json.get(animsKey) as Record<string, Phaser.Types.Animations.Animation> | undefined
      if (!defs) { console.warn(`[npc-anim] ${animsKey} missing`); continue }
      for (const def of Object.values(defs)) {
        if (!this.anims.exists(def.key!)) this.anims.create(def)
      }
    }
        this.setLoadingText('正在布设阵法...')
      },
      // Step 6: v4 Kit + 坐骑 + 部落动画
      () => {
    // 注册 v4 Kit 神通动画（30 套 × 8 帧 art_main）
    for (const kitId of V4_KIT_ASSET_READY) {
      const atlasKey = `v4_${kitId}_atlas`
      const animKey = `v4_${kitId}_art_main`
      if (!this.textures.exists(atlasKey)) { console.warn(`[v4-anim] ${atlasKey} missing`); continue }
      if (this.anims.exists(animKey)) continue
      const tex = this.textures.get(atlasKey)
      const testFrame = `${kitId}_art_main_1`
      if (!tex.has(testFrame)) { console.warn(`[v4-anim] ${kitId} frame ${testFrame} NOT in texture!`); continue }
      const frames: { key: string; frame: string }[] = []
      for (let f = 1; f <= 8; f++) {
        frames.push({ key: atlasKey, frame: `${kitId}_art_main_${f}` })
      }
      this.anims.create({ key: animKey, frames, frameRate: 12, repeat: 0 })
    }
    // Phase 7: 注册坐骑灵驹奔跑动画（4帧）
    if (this.textures.exists('mount_spirit_horse_anim')) {
      const mountFrames: { key: string; frame: number }[] = []
      for (let f = 0; f < 4; f++) mountFrames.push({ key: 'mount_spirit_horse_anim', frame: f })
      if (!this.anims.exists('mount_spirit_horse_gallop')) {
        this.anims.create({ key: 'mount_spirit_horse_gallop', frames: mountFrames, frameRate: 8, repeat: -1 })
      }
    }
    // Phase 7: 注册部落待机动画（5类 × 4帧）
    for (const tribe of ['spirit_beast', 'ancient_human', 'elemental', 'shadow_folk', 'crystal_people']) {
      const ssKey = `tribe_${tribe}_anim`
      if (!this.textures.exists(ssKey)) continue
      const animKey = `tribe_${tribe}_idle`
      if (this.anims.exists(animKey)) continue
      const frames: { key: string; frame: number }[] = []
      for (let f = 0; f < 4; f++) frames.push({ key: ssKey, frame: f })
      this.anims.create({ key: animKey, frames, frameRate: 4, repeat: -1 })
    }
        this.setLoadingText('正在铭刻神通...')
      },
      // Step 7: 序列帧特效动画注册
      () => {
    // Registration bundles and runtime playback contracts are intentionally separate.
    // Sword registration remains atomic over sword_proj_1..8, while each runtime
    // route validates only the frames the target animation actually consumes.
    const resourceBundleReadyForRegistration = (resourceBundleKey: SequenceResourceBundleRegistrationKey) => {
      const bundle = SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS[resourceBundleKey]
      if (hasCompleteSequenceResourceBundleForRegistration(resourceBundleKey, (textureKey) => this.textures.exists(textureKey))) return true
      const missingTextureKey = bundle.requiredTextureKeysForRegistration
        .find((textureKey) => !this.textures.exists(textureKey))
      if (missingTextureKey && import.meta.env.DEV) {
        console.warn(`[fx] ${resourceBundleKey} 注册资源包不完整（缺 ${missingTextureKey}），已降级到静态兜底`)
      }
      return false
    }
    const createSequenceAnimation = (animationKey: keyof typeof SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS, frameRate: number, repeat: number) => {
      if (this.anims.exists(animationKey)) return
      this.anims.create({
        key: animationKey,
        frames: SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS[animationKey]
          .requiredTextureKeysForPlayback
          .map((key) => ({ key })),
        frameRate,
        repeat,
      })
    }
    if (resourceBundleReadyForRegistration('sword_proj')) {
      createSequenceAnimation('sword_proj_fly', 10, -1)
      createSequenceAnimation('sword_proj_loop', 10, -1)
      createSequenceAnimation('sword_proj_hit', 12, 0)
    }
    if (resourceBundleReadyForRegistration('slash')) createSequenceAnimation('slash_anim', 12, 0)
    // 批量单段特效动画（Tier1+2）：帧齐全才注册；未注册时调用点自动降级到静态兜底（零回归）
    for (const fx of FX_ANIMS) {
      if (!('anim' in fx) || !fx.anim) continue              // 多段动画由上方硬编码块处理
      if (!resourceBundleReadyForRegistration(fx.key)) continue // 帧缺失 → 不注册 → 零回归
      if (this.anims.exists(fx.key)) continue                 // 幂等守卫
      this.anims.create({
        key: fx.key,
        frames: SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS[fx.key]
          .requiredTextureKeysForPlayback
          .map((key) => ({ key })),
        frameRate: fx.anim.frameRate,
        repeat: fx.anim.repeat,
      })
    }
        this.setLoadingText('正在注入仙法...')
      },
      // Step 8: 仙界敌人动画注册
      () => {
    // 仙界敌人动画注册（4行×4列：idle/walk/attack/hit）
    const xianAnimIds = [
      'xian_sanxian_m', 'xian_sanxian_f', 'xian_zhenxian_m', 'xian_zhenxian_f',
      'xian_jinxian_m', 'xian_jinxian_f', 'xian_tong_nan', 'xian_tong_nv',
      'beast_crane', 'beast_deer', 'beast_pixiu', 'beast_phoenix',
      'boss_xianzun',
    ]
    for (const id of xianAnimIds) {
      // 检查帧是否齐全
      const hasFrame = (n: number) => this.textures.exists(`${id}_${n}`)
      if (!hasFrame(1)) continue

      // idle: 帧 1-4, 循环, 6fps
      if ([1, 2, 3, 4].every(hasFrame) && !this.anims.exists(`${id}_idle`)) {
        this.anims.create({
          key: `${id}_idle`,
          frames: [1, 2, 3, 4].map((n) => ({ key: `${id}_${n}` })),
          frameRate: 6,
          repeat: -1,
        })
      }
      // walk: 帧 5-8, 循环, 10fps
      if ([5, 6, 7, 8].every(hasFrame) && !this.anims.exists(`${id}_walk`)) {
        this.anims.create({
          key: `${id}_walk`,
          frames: [5, 6, 7, 8].map((n) => ({ key: `${id}_${n}` })),
          frameRate: 10,
          repeat: -1,
        })
      }
      // attack: 帧 9-12, 单次, 12fps
      if ([9, 10, 11, 12].every(hasFrame) && !this.anims.exists(`${id}_attack`)) {
        this.anims.create({
          key: `${id}_attack`,
          frames: [9, 10, 11, 12].map((n) => ({ key: `${id}_${n}` })),
          frameRate: 12,
          repeat: 0,
        })
      }
      // hit: 帧 13-16, 单次, 10fps
      if ([13, 14, 15, 16].every(hasFrame) && !this.anims.exists(`${id}_hit`)) {
        this.anims.create({
          key: `${id}_hit`,
          frames: [13, 14, 15, 16].map((n) => ({ key: `${id}_${n}` })),
          frameRate: 10,
          repeat: 0,
        })
      }
    }
        this.setLoadingText('正在召唤仙兵...')
      },
      // Step 9: AI 特效动画注册
      () => {
    // AI 攻击特效动画注册（仙界专用）
    const aiEffects = [
      { prefix: 'ai_slash', keys: [1, 2, 3, 4, 5, 6], rate: 14, repeat: 0 },     // 剑光
      { prefix: 'ai_sword_proj', keys: [1, 2, 3, 4], rate: 10, repeat: -1 },      // 飞剑弹道
      { prefix: 'ai_bolt_fly', keys: [1, 2, 3, 4], rate: 10, repeat: -1 },         // 法弹弹道
      { prefix: 'ai_proj_fx', keys: [5, 6, 7, 8], rate: 12, repeat: 0 },          // 爆裂
      { prefix: 'ai_mod', keys: [1, 2, 3, 4], rate: 14, repeat: 0 },              // 命中
      { prefix: 'ai_burst', keys: [1, 2, 3, 4], rate: 12, repeat: 0 },            // 爆发
      { prefix: 'thunder_prison', keys: [1, 2, 3, 4], rate: 10, repeat: 0 },      // 雷牢
    ]
    for (const fx of aiEffects) {
      const animKey = `${fx.prefix}_anim`
      if (this.anims.exists(animKey)) continue
      const allExist = fx.keys.every((k) => this.textures.exists(`${fx.prefix}_${k}`))
      if (!allExist) continue
      this.anims.create({
        key: animKey,
        frames: fx.keys.map((k) => ({ key: `${fx.prefix}_${k}` })),
        frameRate: fx.rate,
        repeat: fx.repeat,
      })
    }
        this.setLoadingText('正在开启天机...')
      },
      // Step 10: 加载存档 + 初始化 UI + 启动标题
      () => {
        const state = loadGame()
        this.registry.set('state', state)
        initUI(state, () => {})
        this.setLoadingText('灵气充盈，仙途将启...')
        this.updateProgress(1)
        this.time.delayedCall(200, () => {
          this.scene.start('Title')
        })
      },
    ]

    // 逐步执行，每步之间延迟一帧让进度条可见
    let stepIndex = 0
    const runNextStep = () => {
      if (stepIndex >= steps.length) return
      steps[stepIndex]()
      this.advanceCreateProgress()
      stepIndex++
      if (stepIndex < steps.length) {
        this.time.delayedCall(1, runNextStep)
      }
    }
    runNextStep()
  }

  /** 更新加载文字 */
  private setLoadingText(text: string) {
    if (this.loadingText) this.loadingText.setText(text)
  }
}
