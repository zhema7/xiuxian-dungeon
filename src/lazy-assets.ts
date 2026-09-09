/**
 * 按需资源加载器
 *
 * BootScene 仅加载核心资源（标题/洞府/地下城/战斗），
 * 场景专属资源在各场景首次进入时加载。
 * 所有场景已用 textures.exists() 做兜底，缺失贴图不会崩溃。
 */

import Phaser from 'phaser'
import { REGIONS } from './data'
import { AUDIO_KEYS, audioUrls } from './audio'
import { V4_KIT_ASSET_READY } from './v4/manifest'

type LazyGroup =
  | 'world'
  | 'sect'
  | 'city'
  | 'xian'
  | 'v4kit'

const loadedGroups = new Set<LazyGroup>()

// ── 资源清单（供校验脚本 scripts/validate-assets.mjs 解析） ──

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
const BUILDING_IDS = [
  'main_hall', 'spirit_vein', 'disciple_room', 'alchemy_room', 'forge_pavilion',
  'library', 'training_ground', 'guard_array', 'quest_hall', 'spirit_farm',
  'ore_mine', 'wood_pavilion', 'beast_park', 'realm_gate',
]
const BUILDING_SHEET_FILES = ['core', 'craft', 'resource', 'mine_wood']

const xianEnemies = [
  'xian_sanxian_m', 'xian_sanxian_f', 'xian_zhenxian_m', 'xian_zhenxian_f',
  'xian_jinxian_m', 'xian_jinxian_f', 'xian_tong_nan', 'xian_tong_nv',
  'beast_crane', 'beast_deer', 'beast_pixiu', 'beast_phoenix',
  'boss_xianzun',
]

const aiEffectSheets = ['ai_slash', 'ai_sword_proj', 'ai_bolt_fly', 'ai_proj_fx', 'ai_mod', 'ai_burst']

const NPC_ANIM_IDS = ['disciple_outer', 'disciple_inner', 'elder', 'deacon']

export function isGroupLoaded(group: LazyGroup): boolean {
  return loadedGroups.has(group)
}

/** 检查贴图是否存在，不存在才加入加载队列 */
function loadImageIfMissing(scene: Phaser.Scene, key: string, url: string): boolean {
  if (scene.textures.exists(key)) return false
  scene.load.image(key, url)
  return true
}

function loadAtlasIfMissing(scene: Phaser.Scene, key: string, png: string, json: string): boolean {
  if (scene.textures.exists(key)) return false
  scene.load.atlas(key, png, json)
  return true
}

function loadJsonIfMissing(scene: Phaser.Scene, key: string, url: string): boolean {
  if (scene.cache.json.has(key)) return false
  scene.load.json(key, url)
  return true
}

/** 世界地图资源组（WorldScene 首次进入时加载） */
function loadWorldGroup(scene: Phaser.Scene): boolean {
  let added = false
  // 五域背景
  for (const dir of ['south', 'central', 'east', 'west', 'north']) {
    added = loadImageIfMissing(scene, `world_${dir}_bg`, `sprites/world_${dir}_bg.jpg`) || added
    added = loadImageIfMissing(scene, `ai_terrain_${dir}`, `sprites/terrain_${dir}.jpg`) || added
  }
  // 建筑贴图
  for (const [key, url] of [
    ['ai_bldg_home', 'sprites/bldg_home_v2.jpg'],
    ['ai_bldg_city', 'sprites/bldg_city_v2.jpg'],
    ['ai_bldg_sect', 'sprites/bldg_sect_v2.jpg'],
    ['ai_bldg_dungeon', 'sprites/bldg_dungeon_v2.jpg'],
    ['ai_bldg_landmark', 'sprites/bldg_landmark_v2.jpg'],
  ] as const) {
    added = loadImageIfMissing(scene, key, url) || added
  }
  // 装饰物
  for (const [key, url] of [
    ['ai_deco_waterfall', 'sprites/world_deco_waterfall.jpg'],
    ['ai_deco_altar', 'sprites/world_deco_altar.jpg'],
    ['ai_deco_bonfire', 'sprites/world_deco_bonfire.jpg'],
  ] as const) {
    added = loadImageIfMissing(scene, key, url) || added
  }
  // 地形贴图
  for (const key of ['ai_grass_hq', 'ai_stone_hq', 'ai_water_hq', 'ai_shrine']) {
    added = loadImageIfMissing(scene, key, `sprites/${key}.jpg`) || added
  }
  for (const key of ['tex_grass', 'tex_stone', 'tex_water', 'tex_sand', 'tex_snow', 'tex_forest']) {
    added = loadImageIfMissing(scene, key, `sprites/${key}.jpg`) || added
  }
  // 3D 植被装饰精灵
  for (const key of ['spr_pine_tree', 'spr_willow_tree', 'spr_bamboo', 'spr_rock_formation', 'spr_spirit_crystal', 'spr_dead_tree', 'spr_lotus_pond']) {
    added = loadImageIfMissing(scene, key, `sprites/${key}.jpg`) || added
  }
  // 地点图标
  for (const icon of ['home', 'city', 'dungeon', 'resource', 'teleport', 'landmark', 'sect', 'domain_gate']) {
    added = loadImageIfMissing(scene, `world_icon_${icon}`, `sprites/world_icon_${icon}.png`) || added
  }
  return added
}

/** 宗门资源组（SectScene 首次进入时加载） */
function loadSectGroup(scene: Phaser.Scene): boolean {
  let added = false
  added = loadImageIfMissing(scene, 'sect_bg', 'sprites/sect_bg.png') || added

  for (const bid of BUILDING_IDS) {
    const sheet = BUILDING_SHEET_MAP[bid]
    if (sheet) {
      added = loadAtlasIfMissing(scene, `building_${bid}`, `sprites/${sheet}.png`, `sprites/building_${bid}.json`) || added
    }
  }

  // NPC/弟子角色动画
  for (const nid of NPC_ANIM_IDS) {
    added = loadAtlasIfMissing(scene, `npc_${nid}_atlas`, `sprites/npc_${nid}_sheet.png`, `sprites/npc_${nid}_atlas.json`) || added
    added = loadJsonIfMissing(scene, `npc_${nid}_anims`, `sprites/npc_${nid}_anims.json`) || added
  }
  return added
}

/** 天枢城资源组（CityScene 首次进入时加载） */
function loadCityGroup(scene: Phaser.Scene): boolean {
  let added = false
  const images: [string, string][] = [
    ['city_map', 'sprites/city_map_large.png'],
    ['city_bg', 'sprites/city_bg.png'],
    ['arena_bg', 'sprites/arena_bg.png'],
    ['npc_auctioneer', 'sprites/npc_auctioneer.png'],
    ['npc_arena', 'sprites/npc_arena.png'],
    ['npc_honor', 'sprites/npc_honor.png'],
    ['npc_quest1', 'sprites/npc_quest1.png'],
    ['npc_quest2', 'sprites/npc_quest2.png'],
    ['npc_quest3', 'sprites/npc_quest3.png'],
    ['npc_city_lord', 'sprites/npc_city_lord.png'],
    ['npc_arena_champion', 'sprites/npc_arena_champion.png'],
    ['e_dark_sword', 'sprites/e_dark_sword.png'],
    ['e_fire_mage', 'sprites/e_fire_mage.png'],
    ['e_beast_tamer', 'sprites/e_beast_tamer.png'],
    ['e_shadow_assassin', 'sprites/e_shadow_assassin.png'],
  ]
  for (const [key, url] of images) {
    added = loadImageIfMissing(scene, key, url) || added
  }
  return added
}

/** 仙界资源组（进入仙界内容时加载） */
function loadXianGroup(scene: Phaser.Scene): boolean {
  let added = false
  for (const e of xianEnemies) {
    added = loadImageIfMissing(scene, e, `sprites/xian/${e}_1.png`) || added
    for (let i = 1; i <= 16; i++) {
      added = loadImageIfMissing(scene, `${e}_${i}`, `sprites/xian/${e}_${i}.png`) || added
    }
  }
  // 仙界专用物件
  for (const [key, url] of [
    ['portal_xian', 'sprites/portal_xian.png'],
    ['cave_bg_xian', 'sprites/cave_bg_xian.png'],
    ['chest_xian', 'sprites/chest_xian.png'],
    ['altar_xian', 'sprites/altar_xian.png'],
    ['talisman_save', 'sprites/talisman_save.png'],
  ] as const) {
    added = loadImageIfMissing(scene, key, url) || added
  }
  // AI 生成攻击特效帧
  for (const prefix of aiEffectSheets) {
    for (let i = 1; i <= 16; i++) {
      added = loadImageIfMissing(scene, `${prefix}_${i}`, `sprites/${prefix}_${i}.png`) || added
    }
  }
  // thunder_prison 神通特效帧
  for (let i = 1; i <= 4; i++) {
    added = loadImageIfMissing(scene, `thunder_prison_${i}`, `sprites/thunder_prison_${i}.png`) || added
  }
  return added
}

/** v4 Kit 资源组（首次获得 v4 套件时加载） */
function loadV4KitGroup(scene: Phaser.Scene): boolean {
  let added = false
  for (const kitId of V4_KIT_ASSET_READY) {
    added = loadAtlasIfMissing(scene, `v4_${kitId}_atlas`, `sprites/v4-atlas/${kitId}_atlas.png`, `sprites/v4-atlas/${kitId}_atlas.json`) || added
  }
  return added
}

const groupLoaders: Record<LazyGroup, (scene: Phaser.Scene) => boolean> = {
  world: loadWorldGroup,
  sect: loadSectGroup,
  city: loadCityGroup,
  xian: loadXianGroup,
  v4kit: loadV4KitGroup,
}

// ── 动画注册（资产加载后调用） ──

const AI_EFFECTS = [
  { prefix: 'ai_slash', keys: [1, 2, 3, 4, 5, 6], rate: 14, repeat: 0 },
  { prefix: 'ai_sword_proj', keys: [1, 2, 3, 4], rate: 10, repeat: -1 },
  { prefix: 'ai_bolt_fly', keys: [1, 2, 3, 4], rate: 10, repeat: -1 },
  { prefix: 'ai_proj_fx', keys: [5, 6, 7, 8], rate: 12, repeat: 0 },
  { prefix: 'ai_mod', keys: [1, 2, 3, 4], rate: 14, repeat: 0 },
  { prefix: 'ai_burst', keys: [1, 2, 3, 4], rate: 12, repeat: 0 },
  { prefix: 'thunder_prison', keys: [1, 2, 3, 4], rate: 10, repeat: 0 },
] as const

function registerSectAnimations(scene: Phaser.Scene): void {
  for (const nid of NPC_ANIM_IDS) {
    const atlasKey = `npc_${nid}_atlas`
    if (!scene.textures.exists(atlasKey)) continue
    const tex = scene.textures.get(atlasKey)
    const testFrame = `npc_${nid}_00`
    if (!tex || !tex.has || !tex.has(testFrame)) continue
    const defs = scene.cache.json.get(`npc_${nid}_anims`) as Record<string, Phaser.Types.Animations.Animation> | undefined
    if (!defs) continue
    for (const def of Object.values(defs)) {
      if (!scene.anims.exists(def.key!)) scene.anims.create(def)
    }
  }
}

function registerXianAnimations(scene: Phaser.Scene): void {
  for (const id of xianEnemies) {
    const hasFrame = (n: number) => scene.textures.exists(`${id}_${n}`)
    if (!hasFrame(1)) continue
    if ([1, 2, 3, 4].every(hasFrame) && !scene.anims.exists(`${id}_idle`)) {
      scene.anims.create({
        key: `${id}_idle`,
        frames: [1, 2, 3, 4].map((n) => ({ key: `${id}_${n}` })),
        frameRate: 6, repeat: -1,
      })
    }
    if ([5, 6, 7, 8].every(hasFrame) && !scene.anims.exists(`${id}_walk`)) {
      scene.anims.create({
        key: `${id}_walk`,
        frames: [5, 6, 7, 8].map((n) => ({ key: `${id}_${n}` })),
        frameRate: 10, repeat: -1,
      })
    }
    if ([9, 10, 11, 12].every(hasFrame) && !scene.anims.exists(`${id}_attack`)) {
      scene.anims.create({
        key: `${id}_attack`,
        frames: [9, 10, 11, 12].map((n) => ({ key: `${id}_${n}` })),
        frameRate: 12, repeat: 0,
      })
    }
    if ([13, 14, 15, 16].every(hasFrame) && !scene.anims.exists(`${id}_hit`)) {
      scene.anims.create({
        key: `${id}_hit`,
        frames: [13, 14, 15, 16].map((n) => ({ key: `${id}_${n}` })),
        frameRate: 10, repeat: 0,
      })
    }
  }
  for (const fx of AI_EFFECTS) {
    const animKey = `${fx.prefix}_anim`
    if (scene.anims.exists(animKey)) continue
    const allExist = fx.keys.every((k) => scene.textures.exists(`${fx.prefix}_${k}`))
    if (!allExist) continue
    scene.anims.create({
      key: animKey,
      frames: fx.keys.map((k) => ({ key: `${fx.prefix}_${k}` })),
      frameRate: fx.rate, repeat: fx.repeat,
    })
  }
}

function registerV4KitAnimations(scene: Phaser.Scene): void {
  for (const kitId of V4_KIT_ASSET_READY) {
    const atlasKey = `v4_${kitId}_atlas`
    const animKey = `v4_${kitId}_art_main`
    if (!scene.textures.exists(atlasKey)) continue
    if (scene.anims.exists(animKey)) continue
    const tex = scene.textures.get(atlasKey)
    const testFrame = `${kitId}_art_main_1`
    if (!tex.has(testFrame)) continue
    const frames: { key: string; frame: string }[] = []
    for (let f = 1; f <= 8; f++) {
      frames.push({ key: atlasKey, frame: `${kitId}_art_main_${f}` })
    }
    scene.anims.create({ key: animKey, frames, frameRate: 12, repeat: 0 })
  }
}

const groupAnimRegistrators: Partial<Record<LazyGroup, (scene: Phaser.Scene) => void>> = {
  sect: registerSectAnimations,
  xian: registerXianAnimations,
  v4kit: registerV4KitAnimations,
}

/**
 * 加载一个资源组。若贴图已存在则跳过（零延迟）。
 * 在场景 preload() 中调用，资产加载完成后 Phaser 自动进入 create()，
 * 此时调用 registerLazyAnimations() 注册动画。
 */
export function loadLazyGroup(scene: Phaser.Scene, group: LazyGroup): void {
  if (loadedGroups.has(group)) return
  loadedGroups.add(group)
  groupLoaders[group](scene)
}

/** 资产加载后注册动画（在场景 create() 中调用） */
export function registerLazyAnimations(scene: Phaser.Scene, group: LazyGroup): void {
  const reg = groupAnimRegistrators[group]
  if (reg) reg(scene)
}

/**
 * 异步加载资源组并等待完成，然后注册动画。
 * 适用于非 preload 上下文（如交互回调中按需加载）。
 */
export function loadLazyGroupAsync(scene: Phaser.Scene, group: LazyGroup): Promise<void> {
  if (loadedGroups.has(group)) return Promise.resolve()
  loadedGroups.add(group)

  const added = groupLoaders[group](scene)
  if (!added) {
    const reg = groupAnimRegistrators[group]
    if (reg) reg(scene)
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    const done = () => {
      scene.load.off('complete', done)
      scene.load.off('loaderror', done)
      const reg = groupAnimRegistrators[group]
      if (reg) reg(scene)
      resolve()
    }
    scene.load.on('complete', done)
    scene.load.on('loaderror', done)
    scene.load.start()
  })
}

/** 重置已加载标记（仅供测试用） */
export function _resetLazyGroups(): void {
  loadedGroups.clear()
}
