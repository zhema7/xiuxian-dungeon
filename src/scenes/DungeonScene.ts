import Phaser from 'phaser'
import { Enemy, Player, Ally, applyEliteAffix, rollEliteAffix, ELITE_AFFIX_NAMES, type CombatCtx } from '../entities'
import { input } from '../input'
import { calcDamage, makeItem, makeRng, randInt, rollDrop, rollEquip, rollSetPiece, type EquipItem } from '../core'
import { ART_MODE_NAMES, CLASSES, controlledHitLinkageById, difficultyById, MONSTERS, QUALITY_COLORS, QUALITY_NAMES, regionOfFloor, getRegionById, SKILLS, spawnTableFor, spawnTableForRegion, V4_KIT_WHITELIST, V4_KIT_ABILITY_MAP, type ControlledHitLinkage, type ControlledHitLinkageRecipeId, type DifficultyDef, type RegionDef } from '../data'
import { calcStats, controlledHitLinkageSourceFingerprint, currentHp, resolveArtPaletteV1, resolveAttackMode, resolveAttackPaletteV1, resolveProceduralArtVfx, resolveProceduralAttackVfx, resolveSetArtOverride, resolveSetEffectRuntime, resolveSetHitLinkageSource, stylePower, type SetEffectRuntime, type Stats } from '../effects'
import { resolveEffectiveArtCast } from '../art-cast'
import {
  COLS, generateArena, generateLevel, isEdgeRockTile, isSolidPixel, isWalkable, OX, OY,
  randomFloorPoint, ROWS, T_FLOOR, T_PILLAR, T_ROCK, T_WATER, TILE,
  tileAtPixel, tileHash, wallTileType, type LevelMap, type WallDeco,
} from '../levelgen'
import {
  canEnterXianRealm, isXianFloor, xianFloorDisplay, xianSpawnTable,
  XIAN_START_FLOOR, XIAN_ENEMY_MAP, xianEnemyStats, recordXianDepth, type XianEnemyDef,
} from '../xian-realm'
import { gainExp, recordCodexItem, saveGame, loadSaveSlot, type GameState } from '../state'
import { artCooldown, learnSkill, skillPowerAt, unlearnedSkills } from '../skills'
import { genDynamicSetFromSeed, genDynamicSkill, nextDynamicSetSequence, registerDynamicContent } from '../lore'
import { BGM_DUNGEON, BGM_SWAMP, BGM_XIAN, BGM_SY1, BGM_SY2, BGM_ARENA, BGM_LADDER, BGM_HUANGLONG, BGM_WANYAO, BGM_TIANJIAN, BGM_HAISHI, BGM_GUZHAN, BGM_LOULAN, BGM_BINGYUAN, BGM_SOUTH_ALT, playBgm, sfx, stopBgm } from '../audio'
import { closePanel, dialogOpen, modalPanel, openInventory, openSettings, panelOpen, resetControls, setFloorText, setSettingsCallbacks, showDialog, showResult, toast, updateHUD } from '../ui'
import { isSwordProjAnim } from './anim-guard'
import { checkAchievements } from '../achievement-system'
import { updateDailyProgress } from '../daily-quest'
import { BEAST_SPECIES, BEAST_SPECIES_MAP, beastCombatStats, beastCapacity, captureRate, generateBeast, randomBeastEncounter, RARITY_NAMES, RARITY_COLORS, ELEMENT_NAMES, type Beast } from '../beast-data'
import { FORMATION_MAP, createFormationEffect } from '../formation-data'
import { getArtifactBuff, type ArtifactInstance } from '../artifact-data'
import { advanceControlledHitLinkageEpoch, arrayMineExpired, controlledHitLinkageCooldownKey, createArrayMineEyes, createControlledHitLinkageAuthorization, delayedBurstParams, fireBurstParams, matchesControlledHitLinkageProjectileKind, orderedControlledHitCandidates, playModularOnce, swordSplitParams, triggerArrayMineEye, tryTriggerControlledHitLinkage, type ArrayMineEye, type ControlledHitLinkageAuthorizationSnapshot } from '../fx/modularFx'
import { hasRegisteredSequenceAnimationPlayback } from '../fx/sequence-contract'
import { inheritPaletteV1VisualContext, makePaletteV1VisualContext, paletteV1LightningColors, paletteV1Tint, safePaletteV1Overlay, type PaletteV1, type PaletteV1VisualContext } from '../palette-v1'
import { createChainVisualGuard } from '../fx/branchFx'
import { playProceduralVfx } from '../procedural-vfx'
import { resolveAnyKitAbility, resolveAnyKitArtAbility, resolveAnyKitArtOverride } from '../v4/runtime'
import { v4SetId } from '../v4/kit-data'
import { FogSystem } from '../fog'
import { DungeonLightSystem } from '../dungeon-light'
import { generateTerrainTextures } from '../terrain-textures'
import { executeKitNormal, executeKitArt, type KitCombatContext } from '../v4/executor'
import { executeV4NormalInScene, executeV4ArtInScene, type V4SceneContext } from '../v4/scene-adapter'
import { ladderDifficulty, ladderReward, LADDER } from '../tribulation-data'
import type { KitAbility, KitId } from '../data'

const ARENA = { x: OX, y: OY, w: COLS * TILE, h: ROWS * TILE }  // 整张地图（800×960，相机跟随）
const COMBO_MULT = [1, 1.15, 1.55]
const ATTACK_RADIUS = 48
const ATTACK_ARC = (100 * Math.PI) / 180

/** v4 投射物贴图方向偏移（弧度）：贴图默认朝向与"朝右（angle=0）"的差值。
 *  正=逆时针转，负=顺时针转。目标：让贴图头部/尖端在 angle=0 时朝右。
 */
const PROJ_ROT_OFFSETS: Record<string, number> = {
  'fx_shadow': -Math.PI / 2,     // 暗影刃：尖齿朝上 → 需 -90° 使尖朝右
  'fx_wind': -Math.PI / 2,       // 风刃：尖朝上 → 需 -90°
  'fx_scythe': -Math.PI / 2,     // 血镰：尖齿朝上 → 需 -90°
  'fx_soul': Math.PI / 2,        // 魂火弹：头朝下尾朝上 → 需 +90° 使头朝右
  'fx_crystal': Math.PI / 4,     // 晶碎：朝右下约45° → 需 +45°
  'fx_claw': 0,                  // 毒爪：近似朝前，无需修正
  'fx_star': 0,                  // 星雨：放射对称，无需修正
  'fx_light': 0,                 // 光束：代码已手动 +90°
  'fx_chain': 0,                 // 锁链：近似水平，无需修正
  'ai_sword_proj': -Math.PI / 6, // 仙界飞剑：朝右下约30° → 需 -30°
  'ai_proj_fx': 0,               // 魅影针：爆炸对称，无需修正
  'ai_slash': 0,                 // 穿甲连射：弧形斩击，近似朝右
  'ai_bolt_fly': Math.PI,         // 仙界烈焰弹：头朝左尾朝右 → 需 180° 翻转使头朝前
  'proj': Math.PI / 2,           // 静态兜底 proj.png：尖朝下 → 需 +90°
  'bolt': 0,                     // 静态火弹：模糊近似球体，无明显方向
}
const HL_DURATION = 180000  // 黄龙山坚守时长：3 分钟
const RANK_NAMES = ['初入擂台', '铜牌斗士', '银牌斗士', '金牌斗士', '王者斗士']
const RANK_HONOR = [10, 20, 35, 55, 80]

interface Drop {
  spr: Phaser.GameObjects.Image
  kind: 'gold' | 'potion' | 'equip' | 'book'
  gold: number
  item?: EquipItem
  skillId?: string
  bornAt: number
}

interface Proj { // 敌方投射物
  spr: Phaser.GameObjects.Image
  atk: number
  bornAt: number
}

interface PProj { // 玩家飞剑/法弹/巨剑气
  spr: Phaser.GameObjects.Image
  vx: number; vy: number
  power: number
  kind: 'sword' | 'bolt' | 'giant'
  bornAt: number
  hits: Set<Enemy>
  homing?: boolean   // 大庚剑阵：全图索敌
  split?: boolean     // legacy static sword_split consumed; child projectiles stay non-recursive
  derived?: boolean   // controlled-linkage child; never re-triggers controlled linkage
  /** Immutable source snapshot captured when the parent attack is emitted. */
  linkage?: ControlledHitLinkage
  /** Set id captured with the linkage; cooldowns never bleed across set sources. */
  linkageSourceSetId?: string
  /** Epoch authorization captured at attack emission; old parents cannot outlive a source change. */
  linkageAuthorization?: ControlledHitLinkageAuthorizationSnapshot
  /** Stable projectile creation order for auditable same-frame first-hit resolution. */
  creationOrder: number
  /** First eligible collision has been evaluated, including a cooldown-blocked one. */
  linkageFirstHitEvaluated?: boolean
  /** Recipe already consumed by this projectile or inherited by a derived child. */
  linkageRecipeId?: ControlledHitLinkageRecipeId
  /** Presentation-only v3 context. It never modifies damage, cooldown, targeting, or linkage. */
  visualContext?: PaletteV1VisualContext
}

interface HlBullet { // 黄龙山弹幕（韩前辈金雷 / 乐上师火弹）
  spr: Phaser.GameObjects.Image
  vx: number; vy: number
  kind: 'gold' | 'fire'
  bornAt: number
}

interface FloorEvent {
  spr: Phaser.GameObjects.Image
  kind: 'chest' | 'altar'
  used: boolean
  rearm?: boolean   // 拒绝献祭后，走出触发圈重新武装
}

export class DungeonScene extends Phaser.Scene {
  private state!: GameState
  private setFx: SetEffectRuntime = { swordSplit: false, fireBurst: false, delayedBurst: false, arrayMine: false, testSwordVisual: false, testFrostVisual: false, testThunderVisual: false, testGiantVisual: false }
  private thunderFxGuard = createChainVisualGuard()
  private player!: Player
  private enemies: Enemy[] = []
  private enemyGroup!: Phaser.Physics.Arcade.Group
  private walls!: Phaser.Physics.Arcade.StaticGroup
  private drops: Drop[] = []
  private projs: Proj[] = []
  private pprojs: PProj[] = []
  private portal: Phaser.GameObjects.Sprite | null = null
  private talisman: Phaser.GameObjects.Image | null = null
  private floor = 1
  private rng!: () => number
  private over = false
  private runGold = 0
  private runKills = 0
  private runItems: string[] = []
  private bgRt: Phaser.GameObjects.RenderTexture | null = null
  private artReadyAt = 0
  private ally: Ally | null = null
  private buffAtkPct = 0   // 祭坛增益：本层攻击加成
  // 灵兽宠物
  private petSprite: Phaser.GameObjects.Sprite | null = null
  private petBeast: Beast | null = null
  private petAtk = 0
  private petCdUntil = 0
  // 阵法效果
  private formationAtkBonus = 0
  private formationDmgReduce = 0
  private formationTrapDmg = 0
  private formationEndTime = 0
  private formationName = ''
  private formationSprite: Phaser.GameObjects.Sprite | null = null
  private formationType: 'attack' | 'defense' | 'trap' = 'attack'
  // ---------- v4 charge 原语：hold-release 状态（P2） ----------
  private v4ChargeHeld = false
  private v4ChargeStartMs = 0
  private floorEvents: FloorEvent[] = []
  private level!: LevelMap
  private diff: DifficultyDef = difficultyById()
  // 万剑归宗 · 旋转剑阵
  private swordArrayOn = false
  private swordBlades: Phaser.GameObjects.Image[] = []
  private swordRing: Phaser.GameObjects.Graphics | null = null
  private swordAngle = 0
  private swordDrainAt = 0
  private swordHitAt = new Map<Enemy, number>()
  // ---------- 大庚剑阵 · 持续剑阵（Lv3+解锁） ----------
  private dagengOrbit: Phaser.GameObjects.Image[] = []
  private dagengOrbitUntil = 0
  private dagengOrbitAngle = 0
  private dagengOrbitHitAt = new Map<Enemy, number>()
  private arrayMineEyes: ArrayMineEye[] = []
  private arrayMineGraphics: Phaser.GameObjects.Graphics | null = null
  private arrayMineStartedAt = 0
  /** Source authorization and cooldowns reset together whenever equipped winners change. */
  private controlledLinkageAuthorization = createControlledHitLinkageAuthorization()
  private controlledLinkageSourceFingerprint = ''
  private projectileCreationSequence = 0
  // 玩家防穿墙：最近安全位置（碰撞挤压入墙时回拉）
  private lastSafeX = 0
  private lastSafeY = 0
  // 防卡死：连续卡墙计数和脱困状态
  private playerStuckCount = 0
  private playerUnstuckUntil = 0
  // ---------- 黄龙山坚守战 ----------
  private hlMode = false
  private hlStartAt = 0
  private hlNextWaveAt = 0
  private hlWave = 0
  private hlBullets: HlBullet[] = []
  private hlHan: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | null = null
  private hlLe: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | null = null
  private hlCastFx: Phaser.GameObjects.Image | null = null   // 韩前辈施法光翼叠加层
  private hlNextHanAt = 0     // 韩前辈施法计时（每 2s 一次金雷）
  private hlNextLeAt = 0      // 乐上师开火计时（随时间加快）
  private hlLeTurn = 0
  private hlNextFxAt = 0      // 暴走阶段环境特效计时
  private hlFrenzy = false    // 最后 20 秒：战场暴走
  private hlBossCount = 0     // Boss 波次计数（三魔将轮换）
  private hlHanName = '韩前辈'  // 元婴玩家面前改称「韩道友」
  private hlTextAt = 0
  private shieldHp = 0          // 金色弹幕提供的护盾值
  private shieldReadyAt = 0     // 护盾 10s 受益间隔
  private shieldRing: Phaser.GameObjects.Graphics | null = null

  // ---------- 破碎仙宫 ----------
  private xianMode = false
  private xianMaxFloor = 1     // 本次挑战达到的最高层
  private xianEnemyRuntime = new Map<string, XianEnemyDef>()  // 每个敌人的仙界配置
  private fogSystem: FogSystem | null = null
  private lightSystem: DungeonLightSystem | null = null
  private dustEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null
  private vignetteGfx: Phaser.GameObjects.Graphics | null = null
  private hitStopUntil = 0   // 攻击顿帧：此时刻前冻结怪物 AI
  // ---------- 擂台模式 ----------
  private arenaMode = false
  private arenaSubMode: '1v1' | '1vN' = '1v1'
  // ---------- 天梯挑战 ----------
  private ladderMode = false
  private arenaRank = 0
  private arenaWave = 0
  private arenaTotalWaves = 3
  private arenaBetweenWaves = false
  private regionOverrideId: string | null = null
  private regionStartFloor = 0
  private regionMaxFloors = 3
  // ---------- NPC 战斗模式（大地图劫掠/强攻） ----------
  private npcCombatMode = false
  private npcCombatSubMode: 'plunder' | 'attack' = 'attack'
  private npcCombatNpcId: string | null = null

  constructor() { super('Dungeon') }

  /** 运行时随装备变动重算标签；撤下阵眼套时立即清理遗留阵图。 */
  private refreshSetFx() {
    const next = resolveSetEffectRuntime(this.state)
    if (this.setFx.arrayMine && !next.arrayMine) {
      this.arrayMineGraphics?.destroy()
      this.arrayMineGraphics = null
      this.arrayMineEyes = []
      this.arrayMineStartedAt = 0
    }
    this.setFx = next
    this.refreshControlledLinkageAuthorization()
  }

  /** 获取当前楼层所属区域（支持域特色秘境 override） */
  private getRegion(): RegionDef {
    if (this.regionOverrideId) {
      const r = getRegionById(this.regionOverrideId)
      if (r) return r
    }
    return regionOfFloor(this.floor)
  }

  /** 域特色秘境的相对楼层（1-based） */
  private getRegionFloor(): number {
    if (this.regionOverrideId) {
      return this.floor - this.regionStartFloor + 1
    }
    return this.floor
  }

  /**
   * The source pair is intentionally explicit: linkage eligibility depends on
   * both the attack and art winners, so a swap/removal invalidates all parents
   * emitted under the previous pair and clears their cooldowns.
   */
  private refreshControlledLinkageAuthorization() {
    const resolved = resolveSetHitLinkageSource(this.state)
    const fingerprint = controlledHitLinkageSourceFingerprint(resolved)
    if (fingerprint === this.controlledLinkageSourceFingerprint) return
    this.controlledLinkageSourceFingerprint = fingerprint
    advanceControlledHitLinkageEpoch(this.controlledLinkageAuthorization)
  }

  /** Captures the active linkage only after its source fingerprint is current. */
  private captureControlledHitLinkage() {
    this.refreshControlledLinkageAuthorization()
    const source = resolveSetHitLinkageSource(this.state)
    if (!source) return { linkage: undefined, sourceSetId: undefined, authorization: undefined }
    return {
      linkage: controlledHitLinkageById(source.linkage.recipeId),
      sourceSetId: source.source.setId,
      authorization: this.controlledLinkageAuthorization.capture(source.source.setId, source.linkage.recipeId),
    }
  }

  /** Target animation registration is insufficient; every frame it actually plays must also exist. */
  private hasCompleteSequenceAnimationPlayback(animationKey: Parameters<typeof hasRegisteredSequenceAnimationPlayback>[0]) {
    return hasRegisteredSequenceAnimationPlayback(animationKey, {
      animationRegistered: this.anims.exists(animationKey),
      textureExists: (key) => this.textures.exists(key),
    })
  }

  /** A compact outline/halo for baked, non-tintable art. It cannot obscure combat or change gameplay. */
  private paletteOverlay(x: number, y: number, palette: PaletteV1 | undefined, kind: 'projectile' | 'impact' | 'cast', depth: number) {
    const overlay = safePaletteV1Overlay(palette, kind)
    if (!overlay) return
    const g = this.add.graphics().setDepth(depth)
    g.lineStyle(1.15, overlay.stroke, Math.min(0.5, overlay.alpha))
    g.strokeCircle(x, y, overlay.radius)
    g.lineStyle(1, overlay.highlight, Math.min(0.5, overlay.alpha + 0.08))
    g.strokeCircle(x, y, Math.max(2, overlay.radius * 0.56))
    this.tweens.add({ targets: g, alpha: 0, duration: kind === 'projectile' ? 150 : 120, onComplete: () => g.destroy() })
  }

  create(data: { floor?: number; diff?: string; mode?: 'hl' | 'xian' | 'arena' | 'ladder' | 'npcCombat'; subMode?: '1v1' | '1vN' | 'plunder' | 'attack'; rank?: number; regionOverride?: string; npcId?: string }) {
    this.state = this.registry.get('state')
    this.setFx = resolveSetEffectRuntime(this.state)
    this.thunderFxGuard.clear()
    this.hlMode = data.mode === 'hl'
    this.xianMode = data.mode === 'xian'
    this.arenaMode = data.mode === 'arena'
    this.ladderMode = data.mode === 'ladder'
    this.npcCombatMode = data.mode === 'npcCombat'
    this.npcCombatSubMode = (data.subMode === 'plunder' || data.subMode === 'attack') ? data.subMode : 'attack'
    this.npcCombatNpcId = data.npcId ?? null
    this.arenaSubMode = (data.subMode === '1v1' || data.subMode === '1vN') ? data.subMode : '1v1'
    this.arenaRank = data.rank ?? 0
    this.regionOverrideId = data.regionOverride ?? null
    this.regionStartFloor = data.floor ?? 1
    this.floor = data.floor ?? (this.hlMode ? 7 : (this.xianMode ? XIAN_START_FLOOR : (this.ladderMode ? Math.max(1, this.state.ladderFloor) : 1)))
    this.diff = difficultyById(data.diff)
    // 退出时位置恢复：普通秘境/无尽妖域/破碎仙宫保存楼层，特殊模式回城
    if (!data.mode || data.mode === 'hl' || data.mode === 'xian') {
      this.state.lastScene = 'Dungeon'
      this.state.lastSceneData = { floor: this.floor, diff: data.diff, mode: data.mode }
    } else {
      this.state.lastScene = data.mode === 'arena' ? 'City' : 'Town'
      this.state.lastSceneData = {}
    }
    this.rng = makeRng((Date.now() % 2147483647) + this.floor * 7919)
    this.over = false
    this.enemies = []
    this.drops = []
    this.projs = []
    this.pprojs = []
    this.portal = null
    this.artReadyAt = 0
    this.ally = null
    this.swordArrayOn = false
    this.swordBlades = []
    this.swordRing = null
    this.swordHitAt.clear()
    this.controlledLinkageAuthorization = createControlledHitLinkageAuthorization()
    this.controlledLinkageSourceFingerprint = ''
    this.projectileCreationSequence = 0
    this.hlBullets = []
    this.hlHan = null
    this.hlLe = null
    this.hlCastFx = null
    this.shieldHp = 0
    this.shieldReadyAt = 0
    this.shieldRing = null
    this.xianEnemyRuntime.clear()
    this.xianMaxFloor = this.xianMode ? 1 : 0
    this.fogSystem = null
    this.lightSystem?.destroy()
    this.lightSystem = null
    this.dustEmitter?.destroy()
    this.dustEmitter = null
    this.vignetteGfx?.destroy()
    this.vignetteGfx = null
    this.hitStopUntil = 0
    this.arenaMode = data.mode === 'arena'
    this.arenaWave = 0
    if (this.floor === 1 || this.xianMode) { this.runGold = 0; this.runKills = 0; this.runItems = [] }

    const region = this.getRegion()
    // 妖域榜：记录历史最深层
    if (!this.hlMode && region.id === 'sy' && this.floor - 6 > (this.state.syMaxDepth ?? 0)) {
      this.state.syMaxDepth = this.floor - 6
      saveGame(this.state)
    }
    this.level = (this.hlMode || this.arenaMode || this.npcCombatMode) ? generateArena(this.rng, { water: this.npcCombatMode && region.id !== 'qm' }) : generateLevel(this.rng, { water: region.id !== 'qm' })
    this.buildArena()
    this.physics.world.setBounds(ARENA.x, ARENA.y, ARENA.w, ARENA.h)

    this.player = new Player(this, this.level.spawn.x, this.level.spawn.y, this.state.classId)
    this.player.sprite.setCollideWorldBounds(true)
    this.physics.add.collider(this.player.sprite, this.walls)
    this.lastSafeX = this.level.spawn.x
    this.lastSafeY = this.level.spawn.y

    this.enemyGroup = this.physics.add.group()
    this.physics.add.collider(this.enemyGroup, this.walls)
    this.physics.add.collider(this.enemyGroup, this.enemyGroup)
    this.physics.add.collider(this.player.sprite, this.enemyGroup)

    // 道友（AI 队友，职业为玩家对立面）
    if (this.state.companion) {
      const allyCls = this.state.classId === 'sword' ? 'fairy' : 'sword'
      this.ally = new Ally(this, this.level.spawn.x - 20, this.level.spawn.y + 10, allyCls)
      this.physics.add.collider(this.ally.sprite, this.walls)
      this.physics.add.collider(this.ally.sprite, this.enemyGroup)
    }

    // 灵兽宠物
    if (this.state.activePetUid) {
      const beast = this.state.beasts.find(b => b.uid === this.state.activePetUid)
      if (beast) {
        this.petBeast = beast
        const stats = beastCombatStats(beast)
        this.petAtk = stats.atk
        const atlasKey = `beast_${beast.species}_atlas`
        const animKey = `beast_${beast.species}_idle`
        const frame0 = `beast_${beast.species}_idle_00`
        this.petSprite = this.add.sprite(this.level.spawn.x + 20, this.level.spawn.y, atlasKey, frame0)
          .setDepth(9)
          .setScale(0.07)
        if (this.anims.exists(animKey)) {
          this.petSprite.play(animKey)
        }
        this.add.text(this.level.spawn.x, this.level.spawn.y - 18, beast.name, {
          fontSize: '7px', color: '#c084fc', stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(10)
      }
    }

    // 阵法效果部署
    if (this.state.activeFormation) {
      const f = FORMATION_MAP.get(this.state.activeFormation)
      if (f) {
        this.formationAtkBonus = f.atkBonus ?? 0
        this.formationDmgReduce = f.dmgReduce ?? 0
        this.formationTrapDmg = f.trapDamage ?? 0
        this.formationEndTime = Date.now() + f.duration * 1000
        this.formationName = f.name
        this.formationType = f.type
        this.state.formationLastUse = Date.now()
        this.state.activeFormation = null
        saveGame(this.state)
        // 创建阵法动画精灵（玩家脚下魔法阵）
        const atlasKey = `formation_${f.type}_atlas`
        const animKey = `formation_${f.type}_spin`
        const frame0 = `formation_${f.type}_spin_00`
        if (this.textures.exists(atlasKey)) {
          this.formationSprite = this.add.sprite(
            this.player.sprite.x,
            this.player.sprite.y + 8,
            atlasKey, frame0
          )
            .setDepth(5)
            .setScale(0.16)
            .setAlpha(0.85)
          if (this.anims.exists(animKey)) {
            this.formationSprite.play(animKey)
          }
        }
        toast(`阵法 ${f.name} 已部署！持续 ${f.duration} 秒`, '#a78bfa')
      }
    }

    if (this.hlMode) this.hlSetup()
    else if (this.npcCombatMode) this.spawnNpcCombat()
    else if (this.arenaMode) this.spawnArena()
    else if (this.ladderMode) this.spawnLadder()
    else this.spawnFloor()
    // 地图迷雾：仙界 + 无尽妖域启用，提升迷宫探索感
    if (!this.hlMode && !this.ladderMode && (this.xianMode || region.id === 'sy')) {
      this.fogSystem = new FogSystem(this, COLS, ROWS)
      this.fogSystem.setMap(this.level.tiles)
      this.fogSystem.updateVisibility(this.player.sprite.x, this.player.sprite.y)
    }

    // 动态光照系统：火把点光源 + 玩家光源
    this.lightSystem = new DungeonLightSystem(this, ARENA.w + 100, ARENA.h + 100)
    this.lightSystem.setAmbientAlpha(0.32)
    this.lightSystem.setPlayerLightRadius(this.fogSystem ? 70 : 90)
    for (const deco of this.level.wallDecos) {
      if (deco.type === 1) {
        this.lightSystem.addLight(deco.x, deco.y - 2, 55, 0xffaa33, true)
      }
    }
    // 传送门光源
    this.lightSystem.addLight(this.level.portal.x, this.level.portal.y, 60, 0x6a8aff, false)

    // 氛围粒子：飘尘
    if (!this.textures.exists('dust_particle')) {
      const canvas = this.textures.createCanvas('dust_particle', 3, 3)
      if (canvas) {
        const ctx = canvas.getContext()
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.fillRect(1, 1, 1, 1)
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.fillRect(0, 0, 1, 1)
        ctx.fillRect(2, 2, 1, 1)
        canvas.refresh()
      }
    }
    const camW = this.cameras.main.width || 360
    this.dustEmitter = this.add.particles(0, 0, 'dust_particle', {
      x: { min: 0, max: camW },
      y: { min: 0, max: this.cameras.main.height || this.scale.gameSize.height },
      speed: { min: 5, max: 20 },
      angle: { min: 250, max: 290 },
      lifespan: { min: 3000, max: 6000 },
      alpha: { start: 0.15, end: 0 },
      scale: { start: 0.6, end: 0.2 },
      quantity: 1,
      frequency: 200,
      blendMode: 'NORMAL',
    })
    this.dustEmitter.setScrollFactor(0).setDepth(3)

    // 暗角效果
    this.vignetteGfx = this.add.graphics().setDepth(50)
    this.vignetteGfx.setScrollFactor(0)
    this.drawVignette()
    // 仙界模式使用专属背景色
    const bgColor = this.hlMode ? 0x15211a : (this.arenaMode ? 0x1a1018 : (this.ladderMode ? 0x0a0a1a : (this.xianMode ? 0x0a1628 : region.bg)))
    this.cameras.main.setBackgroundColor(bgColor)
    this.cameras.main.setBounds(ARENA.x, ARENA.y, ARENA.w, ARENA.h)
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12)
    if (this.hlMode) this.hlIntroPan()
    this.cameras.main.fadeIn(300, 0, 0, 0)
    // 按区域/模式选择BGM
    if (this.xianMode) {
      playBgm(BGM_XIAN)        // 破碎仙宫：碎穹仙途
    } else if (this.hlMode) {
      playBgm(BGM_HUANGLONG)   // 黄龙山：凡尘血战
    } else if (this.arenaMode) {
      playBgm(BGM_ARENA)       // 擂台：修仙擂台激战
    } else if (this.ladderMode) {
      playBgm(BGM_LADDER)      // 天梯：修仙擂台激战变奏
    } else if (region.id === 'sy') {
      // 无尽妖域：每3层切换一次BGM
      const band = Math.floor((this.floor - 7) / 3) % 2
      playBgm(band === 0 ? BGM_SY1 : BGM_SY2)
    } else if (region.id === 'wanyao') {
      playBgm(BGM_WANYAO)     // 万妖谷：万妖荒谷
    } else if (region.id === 'tianjian') {
      playBgm(BGM_TIANJIAN)   // 天剑冢：天剑冢·肃杀
    } else if (region.id === 'haishi') {
      playBgm(BGM_HAISHI)     // 海市蜃楼：蜃楼仙踪
    } else if (region.id === 'guzhan') {
      playBgm(BGM_GUZHAN)     // 古战场：仙陨古战
    } else if (region.id === 'loulan') {
      playBgm(BGM_LOULAN)     // 楼兰秘境：楼兰秘境迷踪
    } else if (region.id === 'bingyuan') {
      playBgm(BGM_BINGYUAN)   // 冰原秘境：冰原秘境
    } else if (region.id.startsWith('rl_')) {
      playBgm(BGM_SOUTH_ALT) // 日常随机秘境：通用秘境BGM
    } else if (region.id === 'qm') {
      playBgm(BGM_DUNGEON)     // 青冥山脉：初踏仙途
    } else if (region.id === 'ym') {
      playBgm(BGM_SWAMP)       // 幽冥沼泽：幽渊剑影
    } else {
      playBgm(BGM_DUNGEON)     // 其他区域暂用初踏仙途
    }
    this.refreshFloorText()
    document.getElementById('hud')!.style.display = 'block'
    resetControls()
    document.getElementById('btnSkill')!.style.display = 'flex'
    document.getElementById('btnRetreat')!.style.display = !this.hlMode && (region.id === 'sy' || this.arenaMode || this.ladderMode || this.npcCombatMode) ? 'block' : 'none'
    document.getElementById('btnSettings')!.style.display = 'block'
    setSettingsCallbacks({
      onLoadSave: (slotIndex) => {
        const loaded = loadSaveSlot(slotIndex)
        if (loaded) {
          Object.assign(this.state, loaded)
          saveGame(this.state)
          this.scene.restart()
        }
      },
      onReturnTitle: () => {
        this.over = true
        saveGame(this.state)
        stopBgm()
        this.cameras.main.fadeOut(400, 0, 0, 0)
        this.time.delayedCall(420, () => this.scene.start('Title'))
      },
    })
    updateHUD()

    this.events.on('enemy_explode', (x: number, y: number, atk: number) => {
      const dist = Phaser.Math.Distance.Between(x, y, this.player.sprite.x, this.player.sprite.y)
      if (dist < 70) this.damagePlayer(Math.round(atk * 1.5), x, y)
      const blast = this.add.circle(x, y, 8, 0xff8800, 0.7).setDepth(12)
      this.tweens.add({ targets: blast, scale: 6, alpha: 0, duration: 300, onComplete: () => blast.destroy() })
      this.cameras.main.shake(80, 0.003)
    })
  }

  /** 层数标题（含剩余怪物数；黄龙山显示坚守倒计时） */
  private refreshFloorText() {
    if (this.arenaMode) {
      const rankName = RANK_NAMES[this.arenaRank]
      const left = this.enemies.filter((e) => e.alive).length
      const waveText = this.arenaSubMode === '1v1'
        ? `1v1 单挑`
        : `1vN 第${this.arenaWave}/${this.arenaTotalWaves}波`
      setFloorText(left > 0 ? `擂台 · ${rankName} · ${waveText} · 余 ${left}` : `擂台 · ${rankName} · ${waveText}`)
      return
    }
    if (this.hlMode) {
      const remain = Math.max(0, HL_DURATION - (this.time.now - this.hlStartAt))
      const m = Math.floor(remain / 60000)
      const s = Math.floor((remain % 60000) / 1000)
      setFloorText(`黄龙山 · 坚守 ${m}:${String(s).padStart(2, '0')}`)
      return
    }
    if (this.xianMode) {
      const xianFloor = xianFloorDisplay(this.floor)
      const left = this.enemies.filter((e) => e.alive).length
      const diffTag = this.diff.id === 'normal' ? '' : ` · ${this.diff.name}`
      const bossTag = xianFloor % 10 === 0 ? ' · ☯ 守关仙尊' : ''
      setFloorText(left > 0
        ? `破碎仙宫 · 第 ${xianFloor} 重${diffTag}${bossTag} · 余 ${left}`
        : `破碎仙宫 · 第 ${xianFloor} 重${diffTag}${bossTag}`)
      return
    }
    if (this.ladderMode) {
      const left = this.enemies.filter((e) => e.alive).length
      const bossTag = this.floor % LADDER.bossInterval === 0 ? ' · ☯ 守关BOSS' : ''
      setFloorText(left > 0 ? `天梯 · 第 ${this.floor} 层${bossTag} · 余 ${left}` : `天梯 · 第 ${this.floor} 层${bossTag}`)
      return
    }
    const region = this.getRegion()
    const secretRealmData = this.registry.get('secretRealmData') as { realmName?: string } | undefined
    const realmName = secretRealmData?.realmName
    const base = this.regionOverrideId
      ? realmName
        ? `${realmName} · 第 ${this.getRegionFloor()} 层`
        : `${region.name} · 第 ${this.getRegionFloor()} 层`
      : region.id === 'sy'
        ? `${region.name} · 第 ${this.floor - 6} 层`
        : `${region.name} · 第 ${this.floor - region.floors[0] + 1} / ${region.floors[1] - region.floors[0] + 1} 层`
    const left = this.enemies.filter((e) => e.alive).length
    const diffTag = this.diff.id === 'normal' ? '' : ` · ${this.diff.name}`
    setFloorText(left > 0 ? `${base}${diffTag} · 余 ${left}` : `${base}${diffTag}`)
  }

  // ---------- NPC 战斗生成（大地图劫掠/强攻） ----------
  private spawnNpcCombat() {
    const combatData = this.registry.get('npcCombatData') as {
      npcId: string
      mode: string
      npcName: string
      npcHp: number
      npcMaxHp: number
      npcAtk: number
      npcDef: number
      npcRealm: number
      npcMorality: number
    } | undefined

    if (!combatData) {
      // 没有数据，直接退出
      this.scene.start('World')
      return
    }

    const pt = randomFloorPoint(this.level, this.rng, 120, this.level.spawn) ?? { x: this.level.portal.x, y: this.level.portal.y }

    // NPC 战斗使用原始属性，不做 dungeon 动态缩放
    // NPC 的 hp/atk/def 已由 procedural-npc.ts 按 realm/level 计算
    const enemyCfg = {
      id: combatData.npcId,
      name: combatData.npcName,
      tex: 'npc',
      hp: combatData.npcMaxHp,
      atk: combatData.npcAtk,
      def: combatData.npcDef,
      speed: 60,
      exp: combatData.npcRealm * 30 + 20,
      gold: [combatData.npcRealm * 15, combatData.npcRealm * 15 + 10] as [number, number],
      ai: 'melee' as const,
      range: 40,
    }
    const e = new Enemy(this, enemyCfg as any, pt.x, pt.y, 1)
    e.elite = combatData.npcRealm >= 3
    e.isBoss = combatData.mode === 'attack'
    this.enemies.push(e)

    const modeText = combatData.mode === 'plunder' ? '劫掠' : '强攻'
    const moralityTag = combatData.npcMorality > 0 ? '正道修士' : combatData.npcMorality < -20 ? '魔修' : '散修'
    toast(`${modeText}！对方是${moralityTag}${combatData.npcName}`, '#f87171')
    setFloorText(`${modeText} · ${combatData.npcName}`)
  }

  // ---------- 场景搭建（程序化瓦片地图 v2：自动拼接 + 多层装饰 + 水动画） ----------
  private waterTiles: Phaser.GameObjects.Image[] = []
  private waterFrame = 0
  private waterTimer = 0

  private drawVignette(): void {
    if (!this.vignetteGfx) return
    const g = this.vignetteGfx
    g.clear()
    const cam = this.cameras.main
    const w = cam.width || 360
    const h = cam.height || this.scale.gameSize.height
    // 四边渐变暗角
    const steps = 6
    for (let i = 0; i < steps; i++) {
      const t = i / steps
      const alpha = (1 - t) * 0.12
      const inset = i * 3
      g.fillStyle(0x000000, alpha)
      g.fillRect(0, inset, w, 3)
      g.fillRect(0, h - inset - 3, w, 3)
      g.fillRect(inset, 0, 3, h)
      g.fillRect(w - inset - 3, 0, 3, h)
    }
  }

  private buildArena() {
    // 生成 v2 地形纹理（如尚未生成）
    generateTerrainTextures(this)

    // 擂台模式：使用竞技场背景图增强氛围（NPC战斗不使用，由地形贴图体现域风格）
    if (this.arenaMode && this.textures.exists('arena_bg')) {
      this.add.image(ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h / 2, 'arena_bg')
        .setDepth(-1).setDisplaySize(ARENA.w, ARENA.h)
    }
    // 黄龙山借用青冥山脉的山野贴图（掉落仍按深层楼层计算）
    const region = this.hlMode ? regionOfFloor(2) : this.getRegion()
    const prefix = `terrain_${region.terrainPrefix}`

    // 检查 v2 地形资源是否可用；不可用时回退旧版
    const hasV2 = this.textures.exists(`${prefix}_floor_base`)
    if (!hasV2) {
      this.buildArenaLegacy(region)
      return
    }

    this.bgRt = this.add.renderTexture(0, 0, ARENA.x + ARENA.w + 16, ARENA.y + ARENA.h + 16).setOrigin(0).setDepth(0)
    this.waterTiles = []

    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const t = this.level.tiles[cy * COLS + cx]
        const px = OX + cx * TILE + TILE / 2
        const py = OY + cy * TILE + TILE / 2
        const h = tileHash(cx, cy)

        if (t === T_FLOOR) {
          // 地面变体：70% base, 10% var1, 10% var2, 10% var3
          let variant = 'floor_base'
          const r = h % 100
          if (r < 10) variant = 'floor_var1'
          else if (r < 20) variant = 'floor_var2'
          else if (r < 30) variant = 'floor_var3'

          this.bgRt.draw(`${prefix}_${variant}`, px, py)

          // 墙边阴影：上方是墙则叠暗色（用 graphics 矩形，不依赖 floor_edge 贴图）
          const aboveIsWall = cy > 0 && !isWalkable(this.level.tiles[(cy - 1) * COLS + cx])
          if (aboveIsWall) {
            this.add.rectangle(px, py - TILE * 0.35, TILE, 4, 0x000000, 0.35).setDepth(0.2).setOrigin(0.5)
          }
        } else if (t === T_WATER) {
          // 水域：用单独的 sprite 支持动画（第一帧先画到底层）
          const img = this.add.image(px, py, `${prefix}_water_1`).setDepth(0).setOrigin(0.5)
          this.waterTiles.push(img)
        } else if (t === T_PILLAR) {
          // 石柱：底层画地面底色，上层画柱体贴图，确保视觉区分
          this.bgRt.draw(`${prefix}_floor_base`, px, py)
          const pillar = this.add.image(px, py, `${prefix}_wall_pillar`).setDepth(1)
          // 加暗色描边增强障碍感
          const outline = this.add.image(px, py + 1, `${prefix}_wall_pillar`).setDepth(0.9).setTint(0x000000).setAlpha(0.3)
          pillar.setOrigin(0.5)
        } else if (isEdgeRockTile(this.level.tiles, cx, cy)) {
          // 墙面：先画 wall_top 底色（防止部分墙角贴图透明导致穿透到背景）
          this.bgRt.draw(`${prefix}_wall_top`, px, py)
          // 再叠具体墙角/侧边类型
          const wt = wallTileType(this.level.tiles, cx, cy)
          const wallKey = `${prefix}_wall_${wt}`
          if (this.textures.exists(wallKey) && wt !== 'top') {
            this.bgRt.draw(wallKey, px, py)
          }
        }
      }
    }

    // 地面装饰（从 levelgen 生成的数据中读取）
    for (const deco of this.level.floorDecos) {
      const key = `${prefix}_floor_deco_${deco.type}`
      if (!this.textures.exists(key)) continue
      const img = this.add.image(deco.x, deco.y, key).setDepth(0)
      if (deco.flipX) img.setFlipX(true)
    }

    // 墙面装饰
    for (const deco of this.level.wallDecos) {
      const key = `${prefix}_wall_deco_${deco.type}`
      if (!this.textures.exists(key)) continue
      const img = this.add.image(deco.x, deco.y, key).setDepth(1)
      if (deco.flipX) img.setFlipX(true)
      // 火把添加发光效果
      if (deco.type === 1) {
        const glow = this.add.circle(deco.x, deco.y - 2, 12, 0xffaa33, 0.15).setDepth(1)
        this.tweens.add({
          targets: glow,
          alpha: { from: 0.1, to: 0.22 },
          scale: { from: 0.9, to: 1.1 },
          duration: 800 + Math.random() * 400,
          yoyo: true,
          repeat: -1,
        })
      }
    }

    this.walls = this.physics.add.staticGroup()
    const WALL_COL_H = 16
    const mk = (cx: number, cy: number, w: number, h: number) => {
      const z = this.add.zone(cx, cy, w, h)
      this.physics.add.existing(z, true)
      this.walls.add(z)
    }
    // 地图外圈围栏
    mk(ARENA.x + ARENA.w / 2, ARENA.y - 8, ARENA.w + 32, WALL_COL_H)
    mk(ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h + 8, ARENA.w + 32, WALL_COL_H)
    mk(ARENA.x - 8, ARENA.y + ARENA.h / 2, WALL_COL_H, ARENA.h + 32)
    mk(ARENA.x + ARENA.w + 8, ARENA.y + ARENA.h / 2, WALL_COL_H, ARENA.h + 32)
    // 内部岩石/石柱碰撞（已按行合并）
    // 完整瓦片高度碰撞，防止玩家从侧面穿过墙体
    for (const r of this.level.wallRects) {
      mk(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h)
    }
  }

  /** 旧版渲染（v2 资源缺失时回退） */
  private buildArenaLegacy(region: ReturnType<typeof regionOfFloor>) {
    this.bgRt = this.add.renderTexture(0, 0, ARENA.x + ARENA.w + 16, ARENA.y + ARENA.h + 16).setOrigin(0).setDepth(0)
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const t = this.level.tiles[cy * COLS + cx]
        const px = OX + cx * TILE + TILE / 2
        const py = OY + cy * TILE + TILE / 2
        const h = ((cx * 73856093) ^ (cy * 19349663)) >>> 0
        if (t === T_FLOOR) {
          this.bgRt.draw(h % 100 < 14 ? `${region.floorTex}_d` : region.floorTex, px, py)
        } else if (t === T_WATER) {
          this.add.image(px, py, region.floorTex).setDepth(0).setTint(0x5588dd).setAlpha(0.9)
        } else if (t === T_PILLAR) {
          this.add.image(px, py, region.wallTex).setDepth(1).setTint(0xbbbbbb).setScale(1.05)
        } else if (this.isEdgeRock(cx, cy)) {
          this.bgRt.draw(h % 100 < 18 ? `${region.wallTex}_d` : region.wallTex, px, py)
        }
      }
    }
    // 地面装饰（旧版随机装饰）
    for (let i = 0; i < 26; i++) {
      const pt = randomFloorPoint(this.level, this.rng, 60, this.level.spawn)
      if (!pt) continue
      if (tileAtPixel(this.level, pt.x, pt.y) !== T_FLOOR) continue
      if (Phaser.Math.Distance.Between(pt.x, pt.y, this.level.portal.x, this.level.portal.y) < 48) continue
      const key = region.decos[randInt(this.rng, 0, region.decos.length - 1)]
      const img = this.add.image(pt.x + randInt(this.rng, -5, 5), pt.y + randInt(this.rng, -4, 4), key).setDepth(0)
      if (this.rng() < 0.5) img.setFlipX(true)
    }
    this.walls = this.physics.add.staticGroup()
    const WALL_COL_H = 16
    const mk = (cx: number, cy: number, w: number, h: number) => {
      const z = this.add.zone(cx, cy, w, h)
      this.physics.add.existing(z, true)
      this.walls.add(z)
    }
    mk(ARENA.x + ARENA.w / 2, ARENA.y - 8, ARENA.w + 32, WALL_COL_H)
    mk(ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h + 8, ARENA.w + 32, WALL_COL_H)
    mk(ARENA.x - 8, ARENA.y + ARENA.h / 2, WALL_COL_H, ARENA.h + 32)
    mk(ARENA.x + ARENA.w + 8, ARENA.y + ARENA.h / 2, WALL_COL_H, ARENA.h + 32)
    // 完整瓦片高度碰撞
    for (const r of this.level.wallRects) {
      mk(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h)
    }
  }

  /** 岩石格是否与可行走区域相邻（只画看得见的墙）——旧版兼容 */
  private isEdgeRock(cx: number, cy: number): boolean {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
        const t = this.level.tiles[ny * COLS + nx]
        if (t === T_FLOOR || t === T_WATER) return true
      }
    return false
  }

  /** 根据玩家实际属性计算动态缩放因子：装备越强，敌人越强 */
  /**
   * 动态敌人数值倍率：根据玩家战力反制，避免玩家碾压
   * mode: 'normal' | 'endless' | 'xian' | 'arena' 不同模式反制强度不同
   */
  private dynamicEnemyScale(mode: 'normal' | 'endless' | 'xian' | 'arena' = 'normal'): number {
    const stats = calcStats(this.state)
    const c = CLASSES[this.state.classId]
    const lv = this.state.level - 1
    const baseAtk = c.base.atk + c.growth.atk * lv
    const baseHp = c.base.hp + c.growth.hp * lv

    // 1. 装备/套装/心法带来的额外战力比（攻击权重更高）
    const atkRatio = baseAtk > 0 ? stats.atk / baseAtk : 1
    const hpRatio = baseHp > 0 ? stats.maxHp / baseHp : 1
    const equipFactor = (atkRatio * 0.7 + hpRatio * 0.3)

    // 2. 境界加成：高境界玩家面对的敌人也应更强
    // 境界每提升一大阶，敌人强度增加（炼气=0, 筑基=1, 金丹=2, 元婴=3, 化神=4, 炼虚=5...）
    const realmBonus = 1 + this.state.realm * 0.08

    // 3. 天赋/功法数量加成
    const skillCount = Object.keys(this.state.skills).length
    const talentCount = Object.values(this.state.talents).reduce((s, v) => s + v, 0)
    const skillBonus = 1 + Math.min(0.5, skillCount * 0.03 + talentCount * 0.01)

    // 4. 套装数量加成（穿戴的装备品质）
    let setBonus = 1
    const eq = this.state.equipment
    let rareCount = 0
    let epicCount = 0
    for (const key of Object.keys(eq) as Array<keyof typeof eq>) {
      const item = eq[key]
      if (!item) continue
      if (item.quality >= 2) rareCount++   // 玄品及以上
      if (item.quality >= 3) epicCount++   // 地品及以上
    }
    setBonus = 1 + rareCount * 0.04 + epicCount * 0.06

    // 综合战力因子
    const powerFactor = equipFactor * realmBonus * skillBonus * setBonus

    // 不同模式的反制强度：
    // - normal: 40%，保留爽感但有压力
    // - endless: 65%，无尽妖域需要持续挑战性
    // - xian: 75%，仙界仙人战力应与玩家同阶
    // - arena: 85%，擂台必须势均力敌才有竞技感
    const counterRates: Record<string, number> = {
      normal: 0.40,
      endless: 0.65,
      xian: 0.75,
      arena: 0.85,
    }
    const counterRate = counterRates[mode] ?? 0.40

    // 最低倍率限制，防止前期敌人太弱
    const result = 1 + Math.max(0, powerFactor - 1) * counterRate
    return Math.max(1, result)
  }

  private spawnFloor() {
    // 仙界模式：使用仙界专属刷怪表和敌人配置
    if (this.xianMode) {
      this.spawnXianFloor()
      return
    }
    const table = this.regionOverrideId
      ? spawnTableForRegion(this.regionOverrideId, this.getRegionFloor())
      : spawnTableFor(this.floor)
    const isEndless = !this.regionOverrideId && this.floor > 6
    const mode = isEndless ? 'endless' : 'normal'
    const dynScale = this.dynamicEnemyScale(mode as 'normal' | 'endless')

    // 基础公式：前6层平缓增长；无尽妖域加速增长且越深越快
    let baseScale: number
    if (this.regionOverrideId) {
      // 域特色秘境：按相对楼层缩放，难度由 startFloor 决定基础
      const relFloor = this.getRegionFloor()
      const diffFactor = this.regionStartFloor / 5
      baseScale = (1 + relFloor * 0.4 + diffFactor * 0.5) + this.state.level * 0.15
    } else if (!isEndless) {
      baseScale = 1 + (this.floor - 1) * 0.35 + this.state.level * 0.15
    } else {
      const depth = this.floor - 6
      // 无尽妖域：基础成长 + 深度加速曲线
      // 深度1: ~1.4x, 深度5: ~2.5x, 深度10: ~4.5x, 深度20: ~10x
      const depthScale = 1 + depth * 0.35 + Math.pow(depth, 1.35) * 0.04
      baseScale = depthScale + this.state.level * 0.18
    }
    const scale = baseScale * dynScale
    for (const [id, min, max] of table) {
      const n = Math.ceil(randInt(this.rng, min, max) * 1.5)  // 大地图刷怪密度 +50%
      for (let i = 0; i < n; i++) {
        const pt = randomFloorPoint(this.level, this.rng, 120, this.level.spawn)
          ?? { x: this.level.portal.x, y: this.level.portal.y }
        const e = new Enemy(this, MONSTERS[id], pt.x, pt.y, scale)
        // 难度加成：气血/攻击/经验
        if (this.diff.hp !== 1) { e.maxHp = Math.round(e.maxHp * this.diff.hp); e.hp = e.maxHp }
        if (this.diff.atk !== 1) e.atk = Math.round(e.atk * this.diff.atk)
        if (this.diff.exp !== 1) e.exp = Math.round(e.exp * this.diff.exp)
        this.enemies.push(e)
        this.enemyGroup.add(e.sprite)
      }
    }

    // Boss 层播放出现音效
    if (table.some(([id]) => MONSTERS[id]?.ai === 'boss')) {
      sfx('sfx_boss_spawn', 0.7)
    }

    // 精英怪：晋升普通怪为精英（随机词缀修饰，必掉装备）
    // 无尽妖域深层精英更多、更强
    const candidates = this.enemies.filter((e) => !e.isBoss)
    const eliteChance = isEndless
      ? Math.min(0.95, 0.65 + this.diff.eliteBonus + (this.floor - 6) * 0.02)
      : 0.65 + this.diff.eliteBonus
    const eliteCount = isEndless
      ? Math.min(4, 1 + Math.floor((this.floor - 6) / 5))  // 深度5: 2只, 深度10: 3只
      : 1
    if (candidates.length > 0 && this.rng() < eliteChance) {
      for (let ei = 0; ei < eliteCount && candidates.length > 0; ei++) {
        const idx = randInt(this.rng, 0, candidates.length - 1)
        const e = candidates.splice(idx, 1)[0]
        e.elite = true
        // 无尽妖域精英强度随深度提升
        const eliteMult = isEndless ? 1 + (this.floor - 6) * 0.03 : 1
        e.maxHp = Math.round(e.maxHp * 1.8 * eliteMult)
        e.hp = e.maxHp
        e.atk = Math.round(e.atk * 1.5 * eliteMult)
        e.def = Math.round(e.def * 1.3 * eliteMult)
        e.exp = Math.round(e.exp * 2.2)
        e.sprite.setScale((e.cfg.scale ?? 1) * 1.35)
        const affix = rollEliteAffix(this.rng)
        applyEliteAffix(e, affix)
        const affixName = ELITE_AFFIX_NAMES[affix]
        e.sprite.setData('label', this.add.text(e.x, e.y - 22, `${affixName}·${e.cfg.name}`, { fontSize: '8px', color: '#ffd54a' }).setOrigin(0.5).setDepth(11))
      }
      sfx('sfx_elite_spawn', 0.6)
    }

    // 随机事件：宝箱 / 血池祭坛（Boss 层不刷；大地图彼此独立判定）
    const isBossFloor = table.some(([id]) => MONSTERS[id]?.ai === 'boss')
    if (!isBossFloor) {
      if (this.rng() < 0.6) this.spawnEvent('chest')
      if (this.rng() < 0.35) this.spawnEvent('altar')
    }
  }

  /** 仙界专属刷怪：仙人/妖兽使用玩家级别的攻击模式和神通 */
  private spawnXianFloor() {
    const xianFloor = xianFloorDisplay(this.floor)
    const table = xianSpawnTable(xianFloor)
    const isBoss = table.some(([id]) => XIAN_ENEMY_MAP.get(id)?.isBoss)
    const dynScale = this.dynamicEnemyScale('xian')

    // 仙界深度加速系数：高层仙人战力更强
    // 1-5重: 1x, 10重: ~1.5x, 20重: ~2.5x, 30重: ~4x
    const depthAccel = 1 + Math.pow(xianFloor, 1.2) * 0.03
    const totalScale = dynScale * depthAccel

    for (const [id, min, max] of table) {
      const xianDef = XIAN_ENEMY_MAP.get(id)
      if (!xianDef) continue

      const n = Math.ceil(randInt(this.rng, min, max) * 1.2) // 密度稍低但单个更强
      const stats = xianEnemyStats(xianDef, xianFloor)

      // 构造 MonsterDef 兼容格式（应用玩家战力动态缩放）
      const monsterDef = {
        id: xianDef.id,
        name: xianDef.name,
        tex: xianDef.tex,
        hp: Math.round(stats.hp * totalScale),
        atk: Math.round(stats.atk * totalScale),
        def: Math.round(stats.def * (1 + (totalScale - 1) * 0.5)),
        speed: stats.speed,
        exp: stats.exp,
        gold: [Math.round(stats.gold[0] * totalScale), Math.round(stats.gold[1] * totalScale)] as [number, number],
        ai: xianDef.ai === 'xian_boss' ? 'boss' : xianDef.ai === 'xian_ranged' ? 'ranged' : 'melee',
        range: xianDef.range,
        cd: xianDef.cd,
        scale: (xianDef.scale ?? 0.6) * (1 + xianFloor * 0.02),
      }

      for (let i = 0; i < n; i++) {
        const pt = randomFloorPoint(this.level, this.rng, 150, this.level.spawn)
          ?? { x: this.level.portal.x, y: this.level.portal.y }
        const e = new Enemy(this, monsterDef as any, pt.x, pt.y, 1)
        // 难度加成
        if (this.diff.hp !== 1) { e.maxHp = Math.round(e.maxHp * this.diff.hp); e.hp = e.maxHp }
        if (this.diff.atk !== 1) e.atk = Math.round(e.atk * this.diff.atk)
        this.enemies.push(e)
        this.enemyGroup.add(e.sprite)
        // 记录仙界配置（用于攻击模式/神通判定）
        this.xianEnemyRuntime.set(e.sprite.name || e.x + '_' + e.y, xianDef)
        // 给 sprite 存 id 用于查找
        e.sprite.name = xianDef.id + '_' + i
        // 设置敌人神通模式（仙界敌人专属）
        e.setArtMode(xianDef.artMode)
      }
    }

    // 精英怪：仙界精英率更高，深层精英更多更强
    const candidates = this.enemies.filter((e) => !e.isBoss)
    const eliteChance = Math.min(0.9, 0.4 + this.diff.eliteBonus + xianFloor * 0.015)
    const eliteCount = Math.min(3, 1 + Math.floor(xianFloor / 8))  // 8重: 2只, 16重: 3只
    if (candidates.length > 0 && this.rng() < eliteChance) {
      for (let ei = 0; ei < eliteCount && candidates.length > 0; ei++) {
        const idx = randInt(this.rng, 0, candidates.length - 1)
        const e = candidates.splice(idx, 1)[0]
        e.elite = true
        const eliteMult = 1 + xianFloor * 0.02
        e.maxHp = Math.round(e.maxHp * 1.5 * eliteMult)
        e.hp = e.maxHp
        e.atk = Math.round(e.atk * 1.3 * eliteMult)
        e.def = Math.round((e.def ?? 0) * 1.2 * eliteMult)
        e.exp = Math.round(e.exp * 2)
        e.sprite.setScale((e.cfg.scale ?? 1) * 1.25).setTint(0xffd54a)
        e.sprite.setData('label', this.add.text(e.x, e.y - 24, `精英·${e.cfg.name}`, { fontSize: '8px', color: '#ffd54a' }).setOrigin(0.5).setDepth(11))
      }
    }

    // 仙界随机事件
    if (!isBoss) {
      if (this.rng() < 0.5) this.spawnEvent('chest')
      if (this.rng() < 0.25) this.spawnEvent('altar')
    }

    // 每 5 重设置符箓存档点
    if (xianFloor % 5 === 0 && this.textures.exists('talisman_save')) {
      const pt = randomFloorPoint(this.level, this.rng, 120, this.level.spawn)
      if (pt) {
        this.talisman = this.add.image(pt.x, pt.y, 'talisman_save').setDepth(4).setScale(0.5)
        // 符箓发光效果
        const glow = this.add.circle(pt.x, pt.y, 14, 0xffd54a, 0.12).setDepth(3)
        this.tweens.add({
          targets: glow,
          alpha: { from: 0.08, to: 0.2 },
          scale: { from: 0.8, to: 1.1 },
          duration: 1200,
          yoyo: true,
          repeat: -1,
        })
        // 浮空标签
        this.add.text(pt.x, pt.y - 18, '传讯符', { fontSize: '8px', color: '#ffd54a' }).setOrigin(0.5).setDepth(5)
      }
    }

    // 更新最高纪录
    if (xianFloor > this.xianMaxFloor) this.xianMaxFloor = xianFloor
  }

  /** 查找敌人对应的仙界配置 */
  private getXianDef(enemy: Enemy): XianEnemyDef | undefined {
    // 通过 sprite.name 查找
    for (const [key, def] of this.xianEnemyRuntime) {
      if (enemy.sprite.name.startsWith(def.id)) return def
    }
    return undefined
  }

  private spawnEvent(kind: 'chest' | 'altar') {
    const pt = randomFloorPoint(this.level, this.rng, 110, this.level.spawn)
    if (!pt) return
    const { x, y } = pt
    // 仙界模式使用专属物件贴图
    const texKey = this.xianMode
      ? (kind === 'chest' && this.textures.exists('chest_xian') ? 'chest_xian'
        : kind === 'altar' && this.textures.exists('altar_xian') ? 'altar_xian' : kind)
      : kind
    const spr = this.add.image(x, y, texKey).setDepth(4)
    // 仙界物件贴图 96px，需缩小到 32px 级别；原版贴图 16px 需放大
    const isXianObj = texKey !== kind
    if (kind === 'chest') spr.setScale(isXianObj ? 0.4 : 1.4)
    this.tweens.add({ targets: spr, alpha: 0.6, duration: 700, yoyo: true, repeat: -1 })
    const label = this.xianMode
      ? (kind === 'chest' ? '仙宝匣' : '灵泉祭坛')
      : (kind === 'chest' ? '宝箱' : '血池祭坛')
    const labelColor = this.xianMode
      ? (kind === 'chest' ? '#aaddff' : '#88ffcc')
      : (kind === 'chest' ? '#f1c40f' : '#ff6b6b')
    this.add.text(x, y - 16, label, { fontSize: '8px', color: labelColor })
      .setOrigin(0.5).setDepth(4)
    this.floorEvents.push({ spr, kind, used: false })
  }

  private openChest(ev: FloorEvent) {
    ev.used = true
    ev.spr.clearTint()
    sfx('sfx_chest')
    const g = Math.round((randInt(this.rng, 15, 30) + this.floor * 5) * this.diff.gold)
    this.state.gold += g
    this.runGold += g
    const herbs = randInt(this.rng, 1, 2)
    this.state.materials.lingcao = (this.state.materials.lingcao ?? 0) + herbs
    const eq = rollEquip(this.rng, this.floor, 15, this.state.level)
    this.state.inventory.push(eq)
    recordCodexItem(this.state, eq)
    this.runItems.push(eq.name)
    this.floatText(ev.spr.x, ev.spr.y - 12, `灵石+${g} 灵草+${herbs}`, '#f1c40f', 10)
    toast(`宝箱开启！获得【${eq.name}】`, '#e8c86a')
    saveGame(this.state)
    updateHUD()
    ev.spr.destroy()
  }

  private async useAltar(ev: FloorEvent) {
    ev.used = true
    this.player.halt()
    const choice = await showDialog('血池祭坛', [
      '池中血气翻涌，隐约传来低语：以鲜血献祭，可换妖力加身……',
      '（献祭当前 25% 气血，本层攻击 +25%）',
    ], [
      { label: '献祭鲜血', value: 'yes' },
      { label: '转身离开', value: 'no' },
    ])
    input.clearQueues()
    if (choice === 'yes') {
      const stats = calcStats(this.state)
      this.state.hp = Math.max(1, Math.round(currentHp(this.state) * 0.75))
      this.buffAtkPct += 0.25
      this.floatText(this.player.sprite.x, this.player.sprite.y - 16, `攻击 +25%（本层）`, '#ff6b6b', 11)
      this.cameras.main.shake(120, 0.004)
      sfx('sfx_art', 0.5)
      toast('妖力入体！本层攻击提升', '#ff6b6b')
      updateHUD()
      ev.spr.setAlpha(0.25)
    } else {
      ev.used = true   // 保持已交互状态，走出触发圈后自动重新武装（见 update）
      ev.rearm = true
    }
  }

  // ---------- 擂台/无尽妖域：撤退 ----------
  private async retreatFlow() {
    if (this.over || panelOpen() || dialogOpen()) return
    if (this.arenaMode) {
      this.player.halt()
      const choice = await showDialog('认输离场', [
        '确定放弃本场擂台挑战？',
        '（段位不会下降，但本场无荣誉奖励）',
      ], [
        { label: '认输离开', value: 'yes' },
        { label: '继续战斗', value: 'no' },
      ])
      input.clearQueues()
      if (choice !== 'yes') return
      this.over = true
      saveGame(this.state)
      sfx('sfx_portal')
      this.cameras.main.fadeOut(400, 0, 0, 0)
      this.time.delayedCall(420, () => this.scene.start('City'))
      return
    }
    if (this.ladderMode) {
      this.player.halt()
      const choice = await showDialog('撤离天梯', [
        `当前天梯第 ${this.floor} 层，确定撤离？`,
        `（进度已保存，下次从第 ${this.state.ladderFloor} 层继续）`,
      ], [
        { label: '撤离', value: 'yes' },
        { label: '继续挑战', value: 'no' },
      ])
      input.clearQueues()
      if (choice !== 'yes') return
      this.over = true
      this.state.hp = -1
      saveGame(this.state)
      sfx('sfx_portal')
      this.cameras.main.fadeOut(400, 0, 0, 0)
      this.time.delayedCall(420, () => this.scene.start('Town'))
      return
    }
    if (this.getRegion().id !== 'sy') return
    const depth = this.floor - 6
    if (depth % 3 !== 0 || !this.portal) {
      toast('需通关 Boss 层（每 3 层一处）方可存档撤离', '#ff8888')
      return
    }
    this.player.halt()
    const choice = await showDialog('存档撤离', [
      `已深入妖域第 ${depth} 层。可在此刻下道标，回洞府休整。`,
      `（本次探索收获全部保留；下次进入将从第 ${depth + 1} 层继续）`,
    ], [
      { label: '存档撤离', value: 'yes' },
      { label: '继续深入', value: 'no' },
    ])
    input.clearQueues()
    if (choice !== 'yes') return
    this.over = true
    this.state.syCheckpoint = this.floor + 1
    saveGame(this.state)
    sfx('sfx_portal')
    toast(`道标已成：下次从第 ${depth + 1} 层继续`, '#48c9b0')
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.time.delayedCall(420, () => this.scene.start('Town'))
  }

  /** 符箓存档点交互（破碎仙宫每 5 重） */
  private async talismanInteract() {
    if (!this.talisman || !this.talisman.active) return
    this.player.halt()
    // 阻止重复触发
    this.talisman.setActive(false).setVisible(false)
    const xianFloor = xianFloorDisplay(this.floor)
    const choice = await showDialog('传讯符', [
      `你已闯过破碎仙宫第 ${xianFloor} 重。`,
      '符箓可将你的仙途进度铭刻于此，返回洞府休整后再续前缘。',
    ], [
      { label: '铭刻存档', value: 'save' },
      { label: '继续深入', value: 'continue' },
    ])
    if (choice === 'save') {
      this.over = true
      recordXianDepth(this.state, xianFloor)
      saveGame(this.state)
      sfx('sfx_portal')
      toast(`进度已铭刻：下次从第 ${xianFloor} 重继续`, '#ffd54a')
      this.cameras.main.fadeOut(400, 0, 0, 0)
      this.time.delayedCall(420, () => this.scene.start('Town'))
    } else {
      // 恢复符箓可交互
      this.talisman.setActive(true).setVisible(true)
    }
  }

  // ---------- 黄龙山坚守战 ----------
  /** 布置顶部对战：韩前辈（金雷）vs 乐上师（火弹），全程弹幕横飞 */
  private hlSetup() {
    const now = this.time.now
    this.hlStartAt = now
    this.hlNextWaveAt = now + 5000   // 5 秒后开始第一波
    this.hlWave = 0
    this.hlNextHanAt = now + 1200
    this.hlNextLeAt = now + 900
    this.hlLeTurn = 0
    this.hlNextFxAt = 0
    this.hlFrenzy = false
    this.hlBossCount = 0
    this.hlHanName = this.state.realm >= 3 ? '韩道友' : '韩前辈'  // 元婴道友以平辈相称
    this.hlTextAt = 0

    const cx = OX + (COLS / 2) * TILE
    const duelY = OY + 8 * TILE
    const label = (x: number, y: number, name: string, color: string) =>
      this.add.text(x, y, name, { fontSize: '10px', color, fontStyle: 'bold' }).setOrigin(0.5).setDepth(7)
    // 兜底：无专属立绘时用职业帧动画
    const mk = (cls: string, x: number, tint: number, name: string, color: string) => {
      if (this.anims.exists(`${cls}_down_attack`)) {
        const spr = this.add.sprite(x, duelY, `${cls}_atlas`, `${cls}_down_idle_00`)
          .setDepth(6).setScale(0.62).setTint(tint)
        spr.play(`${cls}_down_attack`)
        label(x, duelY - 26, name, color)
        return spr
      }
      const spr = this.add.sprite(x, duelY, 'npc').setDepth(6).setTint(tint)
      label(x, duelY - 26, name, color)
      return spr
    }
    // 韩前辈：专属立绘（常态持剑）+ 施法光翼叠加层（发射金雷时闪现）
    if (this.textures.exists('hanli_base')) {
      this.hlHan = this.add.image(cx - 110, duelY, 'hanli_base').setDepth(6).setScale(0.44)
      label(cx - 110, duelY - 36, this.hlHanName, '#ffd54a')
      if (this.textures.exists('hanli_cast')) {
        this.hlCastFx = this.add.image(cx - 110, duelY - 4, 'hanli_cast')
          .setDepth(7).setScale(0.55).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD)
      }
    } else {
      this.hlHan = mk('sword', cx - 110, 0xffe9a8, this.hlHanName, '#ffd54a')
    }
    // 乐上师：固定立绘 + 持续战斗抖动（火焰朝向韩前辈）
    if (this.textures.exists('leshangshi')) {
      this.hlLe = this.add.image(cx + 110, duelY, 'leshangshi').setDepth(6).setScale(0.44).setFlipX(true)
      label(cx + 110, duelY - 36, '乐上师', '#ff8a5c')
      this.tweens.add({ targets: this.hlLe, angle: 2.5, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
      this.tweens.add({ targets: this.hlLe, y: duelY - 3, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    } else {
      this.hlLe = mk('fairy', cx + 110, 0xff9a6a, '乐上师', '#ff8a5c')
    }

    this.shieldRing = this.add.graphics().setDepth(12)
    toast('黄龙山古战场！在弹幕与兽潮中坚守 3 分钟！', '#ffd54a')
    toast('韩前辈的金雷可为你加持护盾，乐上师的火弹千万躲开！', '#9fd8ff')
  }

  /** 开场演出：镜头先摇向山巅的巅峰对决，再回到玩家身上（定时序列，稳过事件回调） */
  private hlIntroPan() {
    if (!this.hlHan) return
    const cam = this.cameras.main
    this.time.delayedCall(150, () => {
      cam.stopFollow()
      cam.pan(this.hlHan!.x, this.hlHan!.y, 1000, 'Sine.easeInOut', true)
      this.time.delayedCall(2000, () => {
        cam.pan(this.player.sprite.x, this.player.sprite.y, 900, 'Sine.easeInOut', true)
      })
      this.time.delayedCall(2950, () => {
        cam.startFollow(this.player.sprite, true, 0.12, 0.12)
      })
    })
  }

  // ---------- 擂台竞技场 ----------
  private spawnArena() {
    this.arenaWave = 0
    this.arenaBetweenWaves = false
    this.arenaTotalWaves = this.arenaSubMode === '1v1' ? 1 : 3
    this.spawnArenaWave()
    const modeText = this.arenaSubMode === '1v1' ? '单挑精英' : `共 ${this.arenaTotalWaves} 波群战`
    const rankName = RANK_NAMES[this.arenaRank]
    toast(`擂台开战！${modeText}！当前段位：【${rankName}】`, '#ffd54a')
  }

  private spawnArenaWave() {
    this.arenaBetweenWaves = false
    if (this.arenaWave >= this.arenaTotalWaves) {
      this.onArenaVictory()
      return
    }
    this.arenaWave++
    const dynScale = this.dynamicEnemyScale('arena')
    // 擂台段位成长加速：高段位敌人强度飙升
    // 段位0: 1x, 段位2: ~2x, 段位4(王者): ~4x
    const rankAccel = 1 + this.arenaRank * 0.5 + Math.pow(this.arenaRank, 1.5) * 0.15
    const waveBonus = 1 + (this.arenaWave - 1) * 0.25
    const scale = rankAccel * waveBonus * dynScale
    if (this.arenaSubMode === '1v1') {
      const bossIds = ['dark_sword', 'fire_mage', 'shadow_assassin', 'beast_tamer', 'demon_general']
      const bossId = bossIds[this.arenaRank % bossIds.length]
      const cfg = MONSTERS[bossId]
      if (!cfg) return
      const pt = randomFloorPoint(this.level, this.rng, 200, this.level.spawn)
        ?? { x: this.level.spawn.x, y: this.level.spawn.y }
      // 1v1 擂台 Boss：段位越高，强度倍率越大
      // 段位0: 2.2x, 段位2: ~3.0x, 段位4: ~4.5x
      const bossScale = scale * (2.2 + this.arenaRank * 0.35)
      const e = new Enemy(this, cfg, pt.x, pt.y, bossScale)
      e.elite = true
      e.exp = 0
      // 高段位 Boss 额外增益
      const rankHpMult = 1 + this.arenaRank * 0.25
      const rankAtkMult = 1 + this.arenaRank * 0.15
      const rankDefMult = 1 + this.arenaRank * 0.1
      e.maxHp = Math.round(e.maxHp * 2.0 * rankHpMult)
      e.hp = e.maxHp
      e.atk = Math.round(e.atk * 1.6 * rankAtkMult)
      e.def = Math.round(e.def * 1.4 * rankDefMult)
      // 增大贴图尺寸
      const srcImg = this.textures.get(cfg.tex).getSourceImage() as HTMLImageElement
      const isLargeTex = srcImg.width > 100
      const baseScale = isLargeTex ? (24 / srcImg.width) : (cfg.scale ?? 1)
      e.sprite.setScale(baseScale * (1.8 + this.arenaRank * 0.15))
      const affix = rollEliteAffix(this.rng)
      applyEliteAffix(e, affix)
      const affixName = ELITE_AFFIX_NAMES[affix]
      e.sprite.setData('label', this.add.text(e.x, e.y - 28, `${affixName}·${cfg.name}`, { fontSize: '9px', color: '#ffd54a' }).setOrigin(0.5).setDepth(11))
      this.enemies.push(e)
      this.enemyGroup.add(e.sprite)
    } else {
      const count = 4 + this.arenaWave * 2 + Math.floor(this.arenaRank / 2)
      const candidates = ['slime', 'bat', 'spitter', 'wraith', 'flower', 'tortoise', 'eagle', 'moth', 'skeleton', 'spirit_fox', 'stone_guardian', 'dark_sword', 'fire_mage', 'shadow_assassin']
      const elites: Enemy[] = []
      for (let i = 0; i < count; i++) {
        const id = candidates[randInt(this.rng, 0, candidates.length - 1)]
        const cfg = MONSTERS[id]
        if (!cfg) continue
        const pt = randomFloorPoint(this.level, this.rng, 150, this.level.spawn)
          ?? { x: this.level.spawn.x, y: this.level.spawn.y }
        const e = new Enemy(this, cfg, pt.x, pt.y, scale * 1.2)
        e.exp = 0
        // 增大贴图尺寸
        const srcImg2 = this.textures.get(cfg.tex).getSourceImage() as HTMLImageElement
        const isLargeTex2 = srcImg2.width > 100
        const baseScale2 = isLargeTex2 ? (24 / srcImg2.width) : (cfg.scale ?? 1)
        e.sprite.setScale(baseScale2 * 1.5)
        this.enemies.push(e)
        this.enemyGroup.add(e.sprite)
        elites.push(e)
      }
      // 群战精英：高段位/高波次精英更多
      const eliteCount = Math.min(3, 1 + Math.floor(this.arenaRank / 2) + (this.arenaWave === this.arenaTotalWaves ? 1 : 0))
      for (let ei = 0; ei < eliteCount && elites.length > 0; ei++) {
        const idx = randInt(this.rng, 0, elites.length - 1)
        const e = elites.splice(idx, 1)[0]
        e.elite = true
        const eliteRankMult = 1 + this.arenaRank * 0.15
        e.maxHp = Math.round(e.maxHp * 1.8 * eliteRankMult)
        e.hp = e.maxHp
        e.atk = Math.round(e.atk * 1.5 * eliteRankMult)
        e.def = Math.round(e.def * 1.3 * eliteRankMult)
        const srcImg3 = this.textures.get(e.cfg.tex).getSourceImage() as HTMLImageElement
        const isLargeTex3 = srcImg3.width > 100
        const baseScale3 = isLargeTex3 ? (24 / srcImg3.width) : (e.cfg.scale ?? 1)
        e.sprite.setScale(baseScale3 * 1.8)
        const affix = rollEliteAffix(this.rng)
        applyEliteAffix(e, affix)
        const affixName = ELITE_AFFIX_NAMES[affix]
        e.sprite.setData('label', this.add.text(e.x, e.y - 28, `${affixName}·${e.cfg.name}`, { fontSize: '9px', color: '#ffd54a' }).setOrigin(0.5).setDepth(11))
      }
    }
    this.refreshFloorText()
  }

  private onArenaWaveCleared() {
    // NPC 战斗模式：击败NPC后返回大地图
    if (this.npcCombatMode) {
      this.over = true
      const combatData = this.registry.get('npcCombatData') as any
      if (combatData) {
        combatData.victory = true
        this.registry.set('npcCombatData', combatData)
      }
      const modeText = this.npcCombatSubMode === 'plunder' ? '劫掠成功' : '强攻得手'
      const lines = [
        `${modeText}！`,
        `<span class="dim">战斗中获得灵石 ${this.runGold}</span>`,
      ]
      showResult(modeText, lines, '返回大地图', () => {
        this.state.hp = -1
        saveGame(this.state)
        this.scene.start('World')
      })
      return
    }
    if (this.arenaBetweenWaves) return
    this.arenaBetweenWaves = true
    if (this.arenaWave >= this.arenaTotalWaves) {
      this.onArenaVictory()
      return
    }
    toast(`第 ${this.arenaWave} 波已清！准备下一波……`, '#ffd54a')
    this.time.delayedCall(1500, () => this.spawnArenaWave())
  }

  private onArenaVictory() {
    this.over = true
    const honorReward = this.arenaSubMode === '1v1'
      ? RANK_HONOR[this.arenaRank]
      : RANK_HONOR[this.arenaRank] * 2
    this.state.honor += honorReward
    this.state.arenaWins++
    if (this.arenaSubMode === '1v1') this.state.arena1v1Wins++
    else this.state.arena1vNWins++
    const needed = (this.state.arenaRank + 1) * 3
    let rankedUp = false
    if (this.state.arenaWins >= needed && this.state.arenaRank < 4) {
      this.state.arenaRank++
      rankedUp = true
    }
    saveGame(this.state)
    const lines = [
      `恭喜你在${this.arenaSubMode === '1v1' ? '单挑' : '群战'}中获胜！`,
      `获得 ${honorReward} 荣誉点`,
      `当前段位：【${RANK_NAMES[this.state.arenaRank]}】`,
    ]
    if (rankedUp) {
      lines.push(`段位提升至【${RANK_NAMES[this.state.arenaRank]}】！`)
    }
    showResult('擂台胜利', lines, '返回天枢城', () => {
      this.state.hp = -1
      this.scene.start('City')
    })
  }

  private spawnLadder() {
    const ladderScale = ladderDifficulty(this.floor)
    const dynScale = this.dynamicEnemyScale('arena')
    const totalScale = ladderScale * dynScale
    const isBossFloor = this.floor % LADDER.bossInterval === 0

    if (isBossFloor) {
      const bossIds = ['golem', 'phantom', 'brute', 'spirit_fox', 'stone_guardian', 'dark_sword', 'fire_mage', 'shadow_assassin']
      const bossId = bossIds[Math.floor(this.rng() * bossIds.length)]
      const cfg = MONSTERS[bossId] ?? MONSTERS['golem']
      const pt = randomFloorPoint(this.level, this.rng, 120, this.level.spawn) ?? { x: this.level.portal.x, y: this.level.portal.y }
      const e = new Enemy(this, cfg, pt.x, pt.y, totalScale * 3.0)
      e.elite = true
      e.isBoss = true
      e.maxHp = Math.round(e.maxHp * 3.5)
      e.hp = e.maxHp
      e.atk = Math.round(e.atk * 2.0)
      e.def = Math.round(e.def * 1.8)
      e.exp = Math.round(e.exp * 3)
      e.sprite.setScale((e.cfg.scale ?? 1) * 1.6)
      this.enemies.push(e)
      this.enemyGroup.add(e.sprite)
      toast(`天梯第 ${this.floor} 层 · 守关BOSS现身！`, '#ff6464')
    } else {
      const table = spawnTableFor(this.floor)
      for (const [id, min, max] of table) {
        const n = Math.ceil(randInt(this.rng, min, max) * 1.2)
        for (let i = 0; i < n; i++) {
          const pt = randomFloorPoint(this.level, this.rng, 120, this.level.spawn)
            ?? { x: this.level.portal.x, y: this.level.portal.y }
          const e = new Enemy(this, MONSTERS[id], pt.x, pt.y, totalScale)
          if (this.diff.hp !== 1) { e.maxHp = Math.round(e.maxHp * this.diff.hp); e.hp = e.maxHp }
          if (this.diff.atk !== 1) e.atk = Math.round(e.atk * this.diff.atk)
          this.enemies.push(e)
          this.enemyGroup.add(e.sprite)
        }
      }
      const eliteChance = Math.min(0.9, 0.3 + this.floor * 0.01)
      if (this.rng() < eliteChance) {
        const eliteId = table[Math.floor(this.rng() * table.length)][0]
        const pt = randomFloorPoint(this.level, this.rng, 120, this.level.spawn) ?? { x: this.level.portal.x, y: this.level.portal.y }
        const e = new Enemy(this, MONSTERS[eliteId], pt.x, pt.y, totalScale * 1.8)
        e.elite = true
        e.maxHp = Math.round(e.maxHp * 1.8)
        e.hp = e.maxHp
        e.atk = Math.round(e.atk * 1.5)
        e.def = Math.round(e.def * 1.3)
        e.exp = Math.round(e.exp * 2.2)
        e.sprite.setScale((e.cfg.scale ?? 1) * 1.35)
        this.enemies.push(e)
        this.enemyGroup.add(e.sprite)
      }
    }
  }

  /** 周期性兽潮：间隔 12s 一波（暴走期 6s），规模与强度随时间爬升，定期出 Boss */
  private hlWaveTick(time: number) {
    if (time < this.hlNextWaveAt) return
    const frenzy = HL_DURATION - (time - this.hlStartAt) <= 20000
    this.hlNextWaveAt = time + (frenzy ? 6000 : 12000)  // 暴走期兽潮间隔减半
    this.hlWave++
    const elapsedMin = (time - this.hlStartAt) / 60000
    const alive = this.enemies.filter((e) => e.alive).length
    if (alive >= (frenzy ? 70 : 45)) return   // 场上怪太多时跳过，防止失控
    const scale = 1.6 + elapsedMin * 0.5 + (frenzy ? 0.6 : 0)  // 暴走期强度再抬一档
    const pool = ['slime', 'bat', 'spitter', 'wraith', 'flower', 'tortoise', 'eagle', 'moth', 'golem', 'skeleton', 'phantom', 'brute']
    const base = 6 + Math.floor(elapsedMin * 3)
    const n = frenzy ? Math.min(Math.round(base * 1.5) + 3, 20) : Math.min(base, 14)
    const isBossWave = frenzy ? this.hlWave % 3 === 0 : this.hlWave % 4 === 0
    const spawnOne = (id: string) => {
      const pt = randomFloorPoint(this.level, this.rng, 160, { x: this.player.sprite.x, y: this.player.sprite.y })
        ?? { x: this.level.spawn.x, y: this.level.spawn.y }
      const e = new Enemy(this, MONSTERS[id], pt.x, pt.y, scale)
      this.enemies.push(e)
      this.enemyGroup.add(e.sprite)
      return e
    }
    if (isBossWave) {
      const bossId = ['boss', 'boss2', 'boss3'][this.hlBossCount % 3]
      this.hlBossCount++
      spawnOne(bossId)
      toast(`兽潮来袭！一头${MONSTERS[bossId].name}踏入了战场！`, '#ff8a5c')
      sfx('sfx_art', 0.5)
    } else {
      toast('兽潮来袭！', '#ff8a5c')
    }
    for (let i = 0; i < n; i++) spawnOne(pool[randInt(this.rng, 0, pool.length - 1)])
  }

  /** 韩 vs 乐：韩每 2s 施法金雷；乐随时间越射越快、越发越多；最后 20s 战场暴走 */
  private hlDuelTick(time: number) {
    if (!this.hlHan || !this.hlLe) return
    const hx = this.hlHan.x, hy = this.hlHan.y + 8
    const lx = this.hlLe.x, ly = this.hlLe.y + 8
    const elapsedS = (time - this.hlStartAt) / 1000

    // 韩前辈：每 2 秒施法一次金雷（3 枚直射 + 5 枚散射入战场），光翼持续整个施法周期
    if (time >= this.hlNextHanAt) {
      this.hlNextHanAt = time + 2000
      const atLe = Phaser.Math.Angle.Between(hx, hy, lx, ly)
      for (const off of [-0.16, 0, 0.16]) this.spawnHlBullet(hx, hy, atLe + off, 'gold')
      const down = Math.PI / 2
      for (let i = 0; i < 5; i++) this.spawnHlBullet(hx, hy, down + (i - 2) * 0.42, 'gold')
      this.hlCastFlash()
      // 观战特效：两修士之间炸开一道闪电
      this.lightningFx(hx, hy, lx, ly)
    }

    // 乐上师：发射间隔 950ms → 最快 400ms，每轮弹数 2 → 最多 8，螺旋火雨越来越密
    if (time >= this.hlNextLeAt) {
      this.hlNextLeAt = time + Math.max(400, Math.round(950 - elapsedS * 6))
      this.hlLeTurn++
      const atHan = Phaser.Math.Angle.Between(lx, ly, hx, hy)
      const count = Math.min(2 + Math.floor(elapsedS / 25), 8)
      for (let i = 0; i < count; i++) {
        this.spawnHlBullet(lx, ly, atHan + (i - (count - 1) / 2) * 0.14, 'fire')
      }
      const spiralEvery = Math.max(2, 4 - Math.floor(elapsedS / 45))
      if (this.hlLeTurn % spiralEvery === 0) {
        const base = this.rng() * Math.PI * 2
        for (let i = 0; i < 8; i++) this.spawnHlBullet(lx, ly, base + (i * Math.PI) / 4, 'fire')
      }
      // 乐上师开火时猛地一震
      this.tweens.add({ targets: this.hlLe!, x: this.hlLe!.x - 5, duration: 100, yoyo: true })
    }

    // 最后 20 秒：仲神师威压逼近，战场暴走——金雷劈落、火焰漩涡四起
    const remain = HL_DURATION - (time - this.hlStartAt)
    if (remain <= 20000) {
      if (!this.hlFrenzy) {
        this.hlFrenzy = true
        toast('天边威压骤临——战场彻底暴走了！', '#ff6b35')
        sfx('sfx_art', 0.7)
        this.cameras.main.shake(400, 0.006)
      }
      if (time >= this.hlNextFxAt) {
        this.hlNextFxAt = time + 220
        const fx = OX + 48 + this.rng() * (ARENA.w - 96)
        const fy = OY + 48 + this.rng() * (ARENA.h - 96)
        if (this.rng() < 0.5) {
          this.lightningFx(fx + randInt(this.rng, -40, 40), fy - 170, fx, fy, 0xffd54a, 0xffffff)
        } else {
          this.fireVortexFx(fx, fy)
        }
      }
    }
  }

  /** 火焰漩涡特效（暴走阶段环境演出） */
  private fireVortexFx(x: number, y: number) {
    const v = this.add.image(x, y, 'slash').setDepth(9).setTint(0xff6b35).setAlpha(0.8).setScale(0.2)
    this.tweens.add({
      targets: v, angle: 540, scale: 1.2, alpha: 0, duration: 900, ease: 'Cubic.easeOut',
      onComplete: () => v.destroy(),
    })
  }

  /** 韩前辈施法演出：光翼亮起并持续整个施法周期（2s），立绘向前一冲 */
  private hlCastFlash() {
    if (this.hlCastFx) {
      this.tweens.killTweensOf(this.hlCastFx)
      this.hlCastFx.setAlpha(0.95).setScale(0.55)
      this.tweens.add({ targets: this.hlCastFx, alpha: 0.25, scale: 0.62, duration: 2000, ease: 'Cubic.easeOut' })
    }
    if (this.hlHan) {
      this.tweens.add({ targets: this.hlHan, x: this.hlHan.x + 6, duration: 120, yoyo: true })
    }
  }

  private spawnHlBullet(x: number, y: number, angle: number, kind: 'gold' | 'fire') {
    const spr = kind === 'gold' && this.hasCompleteSequenceAnimationPlayback('sword_proj_fly')
      ? this.add.sprite(x, y, 'sword_proj_3').setDepth(10).setRotation(angle).setTint(0xffd54a).setScale(1.05).play('sword_proj_fly')
      : kind === 'fire' && this.hasCompleteSequenceAnimationPlayback('bolt_fly')
        ? this.add.sprite(x, y, 'bolt_fly_1').setDepth(10).setRotation(angle).setScale(0.50).play('bolt_fly')  // 方案 A：烘焙火色，不 setTint
        : this.add.image(x, y, kind === 'gold' ? 'sword_proj' : 'bolt')
            .setDepth(10).setRotation(angle).setTint(kind === 'gold' ? 0xffd54a : 0xff6b35).setScale(kind === 'gold' ? 1.05 : 1.4)
    const v = kind === 'gold' ? 175 : 160
    this.hlBullets.push({ spr, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, kind, bornAt: this.time.now })
  }

  /** 弹幕飞行与命中：金雷→护盾（10s 间隔），火弹→-10% 最大气血 */
  private hlBulletTick(time: number) {
    const px = this.player.sprite.x, py = this.player.sprite.y
    for (let i = this.hlBullets.length - 1; i >= 0; i--) {
      const b = this.hlBullets[i]
      b.spr.x += (b.vx * this.game.loop.delta) / 1000
      b.spr.y += (b.vy * this.game.loop.delta) / 1000
      const out = b.spr.x < ARENA.x || b.spr.x > ARENA.x + ARENA.w || b.spr.y < ARENA.y || b.spr.y > ARENA.y + ARENA.h
      const hitP = Phaser.Math.Distance.Between(b.spr.x, b.spr.y, px, py) < 14
      if (hitP) {
        if (b.kind === 'gold') {
          if (time >= this.shieldReadyAt) {
            const stats = calcStats(this.state)
            this.shieldHp = Math.round(stats.maxHp * 0.1)
            this.shieldReadyAt = time + 10000
            this.floatText(px, py - 18, `金雷护体 +${this.shieldHp}`, '#ffd54a', 11)
            sfx('sfx_pickup', 0.5)
          }
        } else {
          this.hlFireHit(b.spr.x, b.spr.y)
        }
        this.destroySwordProj(b.spr)
        this.hlBullets.splice(i, 1)
        continue
      }
      if (out || time - b.bornAt > 6000) {
        b.spr.destroy()
        this.hlBullets.splice(i, 1)
      }
    }
    // 护盾可视化：脚下金色圆环
    this.shieldRing?.clear()
    if (this.shieldHp > 0 && !this.over) {
      this.shieldRing?.lineStyle(2, 0xffd54a, 0.55)
      this.shieldRing?.strokeCircle(px, py, 16)
      this.shieldRing?.lineStyle(1, 0xfff3b0, 0.3)
      this.shieldRing?.strokeCircle(px, py, 20)
    }
  }

  /** 火弹命中：扣除 10% 最大气血（无视防御，先扣护盾），500ms 受击间隔 */
  private hlFireHit(fromX: number, fromY: number) {
    if (this.over || this.time.now < this.player.hurtUntil) return
    const stats = calcStats(this.state)
    let dmg = Math.max(1, Math.round(stats.maxHp * 0.1))
    if (this.shieldHp > 0) {
      const absorbed = Math.min(this.shieldHp, dmg)
      this.shieldHp -= absorbed
      dmg -= absorbed
      if (dmg <= 0) {
        this.player.hurtUntil = this.time.now + 500
        this.floatText(this.player.sprite.x, this.player.sprite.y - 14, '护盾抵挡', '#ffd54a', 10)
        sfx('sfx_hit', 0.4)
        return
      }
    }
    this.state.hp = Math.max(0, currentHp(this.state) - dmg)
    this.player.hurtUntil = this.time.now + 500
    this.player.sprite.setTintFill(0xff5555)
    this.time.delayedCall(90, () => this.player.sprite.clearTint())
    this.player.playHit(this.time.now)
    const kb = new Phaser.Math.Vector2(this.player.sprite.x - fromX, this.player.sprite.y - fromY).normalize().scale(120)
    this.player.sprite.setVelocity(kb.x, kb.y)
    this.floatText(this.player.sprite.x, this.player.sprite.y - 14, `-${dmg} 火毒`, '#ff6b35', 11)
    this.cameras.main.shake(90, 0.004)
    sfx('sfx_hit', 0.55)
    updateHUD()
    if (this.state.hp <= 0) this.onDeath()
  }

  /** 坚守满 3 分钟：剧情演出 + 发放凡人套四件 */
  private async hlVictory() {
    this.over = true
    this.player.halt()
    this.stopSwordArray()
    for (const b of this.hlBullets) b.spr.destroy()
    this.hlBullets = []
    this.shieldRing?.clear()
    // 战场余孽尽数伏诛（不给掉落，属于剧情清场）
    for (const e of this.enemies) {
      if (e.alive) e.takeDamage(999999, e.x, e.y - 1)
    }
    sfx('sfx_levelup')
    // 凡人套四件入背包（传说品质，按当前等级生成数值）
    const lv = Math.max(7, this.state.level)
    const pieces = ['w_fr', 'h_fr', 'a_fr', 'b_fr']
    for (const baseId of pieces) {
      const item = makeItem(baseId, 3, lv, this.state.level)
      if (item) {
        this.state.inventory.push(item)
        recordCodexItem(this.state, item)
        this.runItems.push(item.name)
      }
    }
    saveGame(this.state)
    const peer = this.state.realm >= 3
    const name = peer ? '韩道友' : '韩前辈'
    await showDialog(name, peer ? [
      '乐上师的护体灵光在金雷轰击下寸寸碎裂，踉跄退去——',
      '韩道友收剑长笑：「元明灯……终于到手了！多谢道友方才牵制之功！」',
      '天边骤然金光乍现，一股令人窒息的威压自云端压下。',
      '韩道友脸色骤变：「不好，仲神师来了！道友，速退！！」',
      '混乱中韩道友拂袖一挥，四件灵光之物落入你的怀中。',
      '（获得【凡人套】：青竹云剑 · 血色披风 · 风雷翅 · 韩立元婴，已入背包）',
    ] : [
      '乐上师的护体灵光在金雷轰击下寸寸碎裂，踉跄退去——',
      '韩前辈仰天长笑：「元明灯……终于到手了！」',
      '天边骤然金光乍现，一股令人窒息的威压自云端压下。',
      '韩前辈脸色骤变：「不好，仲神师来了！诸位，撤退！！」',
      '混乱中韩前辈拂袖一挥，四件灵光之物落入你的怀中。',
      '（获得【凡人套】：青竹云剑 · 血色披风 · 风雷翅 · 韩立元婴，已入背包）',
    ])
    showResult('黄龙山 · 夺灯', [
      '你在这场旷世大战中全身而退！',
      `<span class="dim">坚守 3:00 · 击杀 ${this.runKills} · 斩获灵石 ${this.runGold}</span>`,
      '<span class="dim">集齐 4 件凡人套：招式化【巨剑术】，神通化【大庚剑阵】</span>',
    ], '返回洞府', () => {
      this.state.hp = -1
      this.scene.start('Town')
    })
  }

  /** 大庚剑阵：6 批 × 12 道剑气，全图自动索敌。Palette V1 only colors v3 art-owned presentation. */
  private castDageng(time: number, power: number, cooldownMs: number, displayName = ART_MODE_NAMES.dageng, palette?: PaletteV1) {
    const cd = Math.round(cooldownMs * (1 - calcStats(this.state).cdPct))
    if (time < this.artReadyAt) return
    this.artReadyAt = time + cd
    const p = this.player
    const px = p.sprite.x, py = p.sprite.y
    // 旧凡人套仍从 resolver 取得 0.45，与历史 `0.45 * stylePower(state)` 等价。
    for (let batch = 0; batch < 6; batch++) {
      this.time.delayedCall(batch * 100, () => {
        if (this.over) return
        for (let i = 0; i < 12; i++) {
          // 初始方向优先瞄准最近的敌人，其后由逐帧索敌接管
          const tgt = this.nearestEnemy(px, py)
          const angle = tgt
            ? Phaser.Math.Angle.Between(px, py, tgt.x, tgt.y) + (this.rng() - 0.5) * 1.6
            : this.rng() * Math.PI * 2
          const swordTint = paletteV1Tint(palette, 'primary') ?? 0xffd54a
          const spr = this.hasCompleteSequenceAnimationPlayback('sword_proj_fly')
            ? this.add.sprite(px, py, 'sword_proj_3').setDepth(12).setRotation(angle).setTint(swordTint).setScale(1.15).play('sword_proj_fly')
            : this.add.image(px, py, 'sword_proj')
                .setDepth(12).setRotation(angle).setTint(swordTint).setScale(1.15)
          const visualContext = makePaletteV1VisualContext(palette)
          if (visualContext && !this.hasCompleteSequenceAnimationPlayback('sword_proj_fly')) this.paletteOverlay(px, py, palette, 'projectile', 13)
          this.pprojs.push({
            spr, vx: Math.cos(angle) * 340, vy: Math.sin(angle) * 340,
            power, kind: 'sword', bornAt: this.time.now, hits: new Set(), homing: true,
            visualContext,
            creationOrder: this.projectileCreationSequence++,
          })
        }
        this.cameras.main.shake(50, 0.002)
        // 每批剑气发射时金色粒子飞溅
        this.emitParticles(px, py, 6, 0xffd54a, 30, 13, 2, 200)
      })
    }
    p.sprite.setTintFill(paletteV1Tint(palette, 'highlight') ?? 0xffd54a)
    this.time.delayedCall(120, () => p.sprite.clearTint())
    p.playCast(time)
    sfx('sfx_art')
    // Lv3+ 解锁持续剑阵：飞剑环绕玩家，持续60秒，自动索敌攻击
    const artId = this.state.skillSlots.art
    const artLevel = artId ? (this.state.skills[artId] ?? 1) : 1
    if (artLevel >= 3) {
      const orbitCount = artLevel >= 5 ? 6 : 4
      const orbitTint = paletteV1Tint(palette, 'highlight') ?? 0xffd54a
      // 清除旧剑阵
      for (const b of this.dagengOrbit) b.destroy()
      this.dagengOrbit = []
      this.dagengOrbitHitAt.clear()
      for (let i = 0; i < orbitCount; i++) {
        const b = this.hasCompleteSequenceAnimationPlayback('sword_proj_loop')
          ? this.add.sprite(px, py, 'sword_proj_3').setDepth(14).setScale(0.7).setTint(orbitTint).play('sword_proj_loop')
          : this.add.image(px, py, 'sword_proj').setDepth(14).setScale(0.7).setTint(orbitTint)
        this.dagengOrbit.push(b)
      }
      this.dagengOrbitUntil = time + 60000
      this.dagengOrbitAngle = this.rng() * Math.PI * 2
      // 剑阵成型金色粒子爆发
      this.emitParticles(px, py, orbitCount * 2, 0xffd54a, 50, 14, 2.5, 350)
      this.emitRing(px, py, 0xffd54a, 60, 13, 0.5, 400)
      toast(`${displayName} · 七十二剑齐出！剑阵将持续护身！`, '#ffd54a')
    } else {
      toast(`${displayName} · 七十二剑齐出！`, '#ffd54a')
    }
  }

  // ---------- 玩家伤害结算（含吸血） ----------
  private dealDamage(e: Enemy, mult: number, stats: Stats, isSkill: boolean, fromX?: number, fromY?: number) {
    const finalMult = mult * (isSkill ? 1 + stats.skillPct : 1)
    const { dmg, crit } = calcDamage(stats.atk * (1 + this.buffAtkPct + this.formationAtkBonus), finalMult, stats.crit, e.def, Math.random)
    const killed = e.takeDamage(dmg, fromX ?? this.player.sprite.x, fromY ?? this.player.sprite.y)
    // 打击感：顿帧 + 受击闪白 + 粒子迸发 + 震屏 + 音效
    this.hitStopUntil = this.time.now + (crit ? 70 : 40)
    e.sprite.setTintFill(0xffffff)
    this.time.delayedCall(60, () => { if (e.alive) e.sprite.clearTint() })
    this.hitFx(e.x, e.y, crit)
    this.cameras.main.shake(crit ? 80 : 40, Math.min(0.008, 0.002 + dmg * 0.0002))
    this.floatText(e.x, e.y - 12, String(dmg), crit ? '#ffd54a' : '#ffffff', crit ? 14 : 10)
    if (crit) sfx('sfx_critical_hit', 0.5)
    else if (isSkill) sfx('sfx_magic_hit', 0.35)
    else sfx('sfx_sword_hit', 0.3)
    if (stats.lifesteal > 0) {
      const heal = Math.max(1, Math.round(dmg * stats.lifesteal))
      this.state.hp = Math.min(stats.maxHp, currentHp(this.state) + heal)
    }
    if (killed) this.onEnemyKilled(e)
  }

  /** 命中粒子迸发：暴击金色、普通白色 */
  private hitFx(x: number, y: number, crit: boolean) {
    const color = crit ? 0xffd54a : 0xffffff
    const count = crit ? 8 : 4
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5
      const dist = crit ? 14 : 8
      const p = this.add.circle(x, y, crit ? 2.5 : 1.5, color, 1).setDepth(15)
      this.tweens.add({
        targets: p,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
        scale: 0.2,
        duration: crit ? 250 : 150,
        ease: 'Quad.out',
        onComplete: () => p.destroy(),
      })
    }
  }

  /** 死亡爆散：粒子向外飞溅 + 闪白圆环 */
  private deathFx(x: number, y: number, elite: boolean) {
    const count = elite ? 12 : 6
    const color = elite ? 0xffd54a : 0xff6b6b
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.3
      const dist = elite ? 22 : 14
      const p = this.add.circle(x, y, elite ? 3 : 2, color, 1).setDepth(15)
      this.tweens.add({
        targets: p,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
        scale: 0.1,
        duration: elite ? 350 : 250,
        ease: 'Quad.out',
        onComplete: () => p.destroy(),
      })
    }
    // 闪白圆环
    const ring = this.add.circle(x, y, 4, 0xffffff, 0.6).setDepth(14)
    this.tweens.add({
      targets: ring, scale: elite ? 5 : 3, alpha: 0, duration: 300, ease: 'Quad.out',
      onComplete: () => ring.destroy(),
    })
    this.cameras.main.shake(elite ? 120 : 60, 0.004)
  }

  /** 通用粒子爆发：从指定位置向外飞溅 N 个圆形粒子 */
  private emitParticles(x: number, y: number, count: number, color: number, radius: number, depth = 15, particleSize = 2, duration = 300) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4
      const dist = radius * (0.6 + Math.random() * 0.4)
      const p = this.add.circle(x, y, particleSize, color, 1).setDepth(depth)
      this.tweens.add({
        targets: p,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
        scale: 0.15,
        duration: duration + Math.random() * 100,
        ease: 'Quad.out',
        onComplete: () => p.destroy(),
      })
    }
  }

  /** 扩散环效果：从中心向外扩散的光环 */
  private emitRing(x: number, y: number, color: number, maxRadius: number, depth = 14, alpha = 0.6, duration = 350) {
    const ring = this.add.circle(x, y, 3, color, alpha).setDepth(depth)
    this.tweens.add({
      targets: ring,
      scale: maxRadius / 3,
      alpha: 0,
      duration,
      ease: 'Quad.out',
      onComplete: () => ring.destroy(),
    })
  }

  // ---------- v4 Kit 场景旁路（ADR §2 S4/S5 旁路） ----------
  private buildV4SceneContext(stats: Stats, kitId?: string): V4SceneContext {
    const p = this.player
    return {
      scene: this,
      playerX: p.sprite.x,
      playerY: p.sprite.y,
      dirAngle: p.dir.angle(),
      stats,
      enemies: this.enemies,
      dealDamage: (e, mult, isSkill, fromX, fromY) => {
        this.dealDamage(e, mult, stats, isSkill, fromX, fromY)
      },
      floatText: (x, y, text, color, size) => {
        this.floatText(x, y, text, color, size)
      },
      buffAtkPct: this.buffAtkPct,
      kitId,
    }
  }

  private doV4NormalAttack(time: number, ability: KitAbility, chargeMs = 0) {
    this.refreshSetFx()
    this.thunderFxGuard.clear()
    const stats = calcStats(this.state)
    const stage = this.player.tryAttack(time, stats.aspd)
    if (stage === 0) return
    const p = this.player
    const dirAngle = p.dir.angle()
    const ctx: KitCombatContext = {
      origin: { x: p.sprite.x, y: p.sprite.y },
      direction: { x: Math.cos(dirAngle), y: Math.sin(dirAngle) },
      atk: stats.atk * (1 + this.buffAtkPct),
      crit: stats.crit,
      rng: this.rng,
      chargeMs,
    }
    const behavior = executeKitNormal(ability, ctx)
    executeV4NormalInScene(this.buildV4SceneContext(stats), behavior)
    sfx('sfx_swing', 0.5)
  }

  private doV4Art(time: number, ability: KitAbility) {
    this.refreshSetFx()
    const artOverride = resolveAnyKitArtOverride(this.state)
    if (!artOverride) return
    if (time < this.artReadyAt) return
    const stats = calcStats(this.state)
    const p = this.player
    const dirAngle = p.dir.angle()
    const chargeMs = ability.artPrimitive === 'charge' ? 1200 : 0
    const ctx: KitCombatContext = {
      origin: { x: p.sprite.x, y: p.sprite.y },
      direction: { x: Math.cos(dirAngle), y: Math.sin(dirAngle) },
      atk: stats.atk * (1 + this.buffAtkPct),
      crit: stats.crit,
      rng: this.rng,
      chargeMs,
    }
    this.artReadyAt = time + Math.round(artOverride.cooldownMs * (1 - stats.cdPct))
    const behavior = executeKitArt(ability, ctx)
    executeV4ArtInScene(this.buildV4SceneContext(stats, ability.kitId), behavior)
    p.playCast(time)
    this.cameras.main.shake(70, 0.004)
    sfx('sfx_art')
    toast(`${ability.name}！`, '#af7ac5')
  }

  // ---------- 攻击模式 ----------
  private doAttack(time: number) {
    this.refreshSetFx()
    this.thunderFxGuard.clear()
    const stats = calcStats(this.state)
    const stage = this.player.tryAttack(time, stats.aspd)
    if (stage === 0) return
    // v4 旁路（S4）：v4 Kit 普攻走 executor + scene-adapter，不进旧路由
    // charge 原语由 update 中的 hold-release 机制单独触发，此处跳过
    // S4-dyn：动态套装 normalPrimitive 同样走 v4 executor 管线
    const v4Ability = resolveAnyKitAbility(this.state)
    if (v4Ability) {
      if (v4Ability.normalPrimitive !== 'charge') {
        const p = this.player
        const dirAngle = p.dir.angle()
        const ctx: KitCombatContext = {
          origin: { x: p.sprite.x, y: p.sprite.y },
          direction: { x: Math.cos(dirAngle), y: Math.sin(dirAngle) },
          atk: stats.atk * (1 + this.buffAtkPct),
          crit: stats.crit,
          rng: this.rng,
          chargeMs: 0,
        }
        executeV4NormalInScene(this.buildV4SceneContext(stats), executeKitNormal(v4Ability, ctx))
        sfx('sfx_swing', 0.5)
      }
      return
    }
    const mode = resolveAttackMode(this.state)
    // Capture an owned snapshot at emission time. A later equipment swap or an
    // in-memory mutation of the set registry must not retrofit a flying projectile.
    const activeLinkage = this.captureControlledHitLinkage()
    const attackLinkage = activeLinkage.linkage
    const attackLinkageSourceSetId = activeLinkage.sourceSetId
    const attackLinkageAuthorization = activeLinkage.authorization
    // 攻击音效：近战挥砍 / 法术与飞剑施放（剑阵开关自带音效）
    if (mode === 'melee_arc' || mode === 'whirlwind' || mode === 'slash_pierce' || mode === 'slash_heavy' || mode === 'slash_ice' || mode === 'flying_sword_split' || mode === 'flame_slash') sfx('sfx_sword_swing', 0.5)
    else if (mode !== 'sword_array') sfx('sfx_magic_cast', 0.45)
    const p = this.player
    const px = p.sprite.x, py = p.sprite.y
    const dirAngle = p.dir.angle()
    const power = stylePower(this.state)
    // Attack and art palettes intentionally resolve through separate winners.
    // Static/v2/legacy return undefined and retain every existing fixed-color route.
    const attackPalette = resolveAttackPaletteV1(this.state)
    const attackVisualContext = makePaletteV1VisualContext(attackPalette)
    // 程序随机套装仅叠加受限 modular recipe；不存在/未注册资源时安全跳过，不改原攻击行为。
    playProceduralVfx(this, resolveProceduralAttackVfx(this.state), 'attack', px, py, dirAngle, attackPalette)

    // 万剑归宗：攻击键 = 开启/收敛剑阵（持续技能，非常规攻击）
    if (mode === 'sword_array') {
      this.toggleSwordArray(time)
      return
    }

    if (mode === 'melee_arc') {
      this.slashFx(px, py, dirAngle, stage, attackPalette)
      let hit = false
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(px, py, e.x, e.y)
        if (dist > ATTACK_RADIUS + (e.isBoss ? 14 : 0)) continue
        const ang = Phaser.Math.Angle.Between(px, py, e.x, e.y)
        if (Math.abs(Phaser.Math.Angle.Wrap(ang - dirAngle)) > ATTACK_ARC / 2) continue
        hit = true
        this.dealDamage(e, COMBO_MULT[stage - 1] * power, stats, false)
      }
      if (hit) this.cameras.main.shake(40, 0.002)
      return
    }

    if (mode === 'whirlwind') {
      this.burstFx('fx_ring', px, py,
        { depth: 15, peakScale: 1.60, alpha: 0.85 },
        { scale: 0.25, toScale: 1.6, duration: 200, toAngle: 180 }, attackPalette)
      let hit = false
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(px, py, e.x, e.y)
        if (dist > 62 + (e.isBoss ? 14 : 0)) continue
        hit = true
        this.dealDamage(e, 0.95 * power, stats, false)
      }
      if (hit) this.cameras.main.shake(50, 0.003)
      return
    }

    // 冰环：范围伤害 + 减速
    if (mode === 'frost_nova') {
      this.burstFx('fx_ring', px, py,
        { depth: 15, peakScale: 1.90, alpha: 0.9, tint: 0x9fd8ff },
        { scale: 0.25, toScale: 1.8, duration: 240 }, attackPalette)
      let hit = false
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(px, py, e.x, e.y)
        if (dist > 74 + (e.isBoss ? 14 : 0)) continue
        hit = true
        this.dealDamage(e, 0.85 * power, stats, true)
        e.applySlow(2000, time)
      }
      if (hit) this.cameras.main.shake(50, 0.003)
      return
    }

    // 玄冥冰爆（套装强化冰环）：更大范围、更高伤害、更久减速
    if (mode === 'frost_nova_burst') {
      if (this.setFx.testFrostVisual) {
        this.burstFx('fx_spark', px, py, { depth: 16, peakScale: 0.7, alpha: 0.95, tint: 0xd8f0ff }, { scale: 0.2, toScale: 0.7, duration: 180 }, attackPalette)
        this.burstFx('fx_ring', px, py, { depth: 15, peakScale: 2.3, alpha: 0.8, tint: 0x9fd8ff }, { scale: 0.2, toScale: 2.2, duration: 280 }, attackPalette)
      }
      this.burstFx('fx_ring', px, py,
        { depth: 15, peakScale: 2.70, alpha: 0.95, tint: 0x7fd0ff },
        { scale: 0.3, toScale: 2.6, duration: 300 }, attackPalette)
      this.burstFx('fx_ring', px, py,
        { depth: 15, peakScale: 2.10, alpha: 0.7, tint: 0xd8f0ff },
        { scale: 0.2, toScale: 2.0, duration: 380 }, attackPalette)
      let hit = false
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(px, py, e.x, e.y)
        if (dist > 82 + (e.isBoss ? 14 : 0)) continue
        hit = true
        this.dealDamage(e, 1.0 * power, stats, true)
        e.applySlow(3000, time)
      }
      if (hit) this.cameras.main.shake(70, 0.004)
      return
    }
    // 紫霄雷链（套装/五雷引）：雷电命中最近敌人并在敌群间跳跃传导
    if (mode === 'thunder_chain') {
      const chain: Enemy[] = []
      let from = { x: px, y: py }
      let cur = this.nearestEnemy(px, py)
      const falloff = [1, 0.85, 0.7, 0.55]
      while (cur && chain.length < 4) {
        chain.push(cur)
        const targetKey = `${Math.round(cur.x)}:${Math.round(cur.y)}`
        if (this.setFx.testThunderVisual) {
          const linkKey = `${Math.round(from.x)}:${Math.round(from.y)}`
          if (this.thunderFxGuard.shouldConnect(linkKey, targetKey)) this.lightningFx(from.x, from.y, cur.x, cur.y, attackPalette)
          if (this.thunderFxGuard.shouldFlash(targetKey)) this.burstFx('fx_spark', cur.x, cur.y, { depth: 17, peakScale: 0.65, alpha: 0.95, tint: 0xb39dff }, { scale: 0.2, toScale: 0.6, duration: 140 }, attackPalette)
        } else {
          this.lightningFx(from.x, from.y, cur.x, cur.y, attackPalette)
        }
        this.dealDamage(cur, falloff[chain.length - 1] * power, stats, true)
        from = { x: cur.x, y: cur.y }
        // 找下一个 130 内未传导过的敌人
        let next: Enemy | null = null
        let bestD = 130
        for (const e2 of this.enemies) {
          if (!e2.alive || chain.includes(e2)) continue
          const d = Phaser.Math.Distance.Between(from.x, from.y, e2.x, e2.y)
          if (d < bestD) { bestD = d; next = e2 }
        }
        cur = next
      }
      if (chain.length > 0) this.cameras.main.shake(50, 0.003)
      return
    }

    // 巨剑术（凡人套 4 件）：巨大的金色剑气，无视碰撞穿墙，持续 2 秒横扫路径
    if (mode === 'giant_sword') {
      if (this.setFx.testGiantVisual) {
        this.slashFx(px, py, dirAngle, 3, attackPalette)
        this.burstFx('fx_ring', px, py, { depth: 14, peakScale: 1.5, alpha: 0.65, tint: 0xffe9a8 }, { scale: 0.2, toScale: 1.45, duration: 240 }, attackPalette)
      }
      const giantTint = paletteV1Tint(attackPalette, 'highlight') ?? 0xffe9a8
      const spr = this.hasCompleteSequenceAnimationPlayback('sword_proj_fly')
        ? this.add.sprite(px, py, 'sword_proj_3').setDepth(13).setRotation(dirAngle).setScale(3.7).setTint(giantTint).setAlpha(0.95)
            .setBlendMode(Phaser.BlendModes.ADD).play('sword_proj_fly')
        : this.add.image(px, py, 'sword_proj')
            .setDepth(13).setRotation(dirAngle).setScale(3.7).setTint(giantTint).setAlpha(0.95)
            .setBlendMode(Phaser.BlendModes.ADD)
      if (attackVisualContext && !this.hasCompleteSequenceAnimationPlayback('sword_proj_fly')) this.paletteOverlay(px, py, attackPalette, 'projectile', 14)
      const v = 240
      this.pprojs.push({
        spr, vx: Math.cos(dirAngle) * v, vy: Math.sin(dirAngle) * v,
        power: 1.3 * power, kind: 'giant', bornAt: time, hits: new Set(),
        linkage: attackLinkage, linkageSourceSetId: attackLinkageSourceSetId, linkageAuthorization: attackLinkageAuthorization,
        visualContext: attackVisualContext,
        creationOrder: this.projectileCreationSequence++,
      })
      this.cameras.main.shake(60, 0.004)
      sfx('sfx_art', 0.6)
      return
    }

    // 火弹：朝最近敌人（或朝向）发射爆炸法弹，连击第三段两枚
    if (mode === 'magic_bolt') {
      const target = this.nearestEnemy(px, py)
      const baseAngle = target
        ? Phaser.Math.Angle.Between(px, py, target.x, target.y)
        : dirAngle
      const bolts = stage >= 3 ? 2 : 1
      const spread = bolts === 1 ? [0] : [-0.14, 0.14]
      for (const off of spread) {
        this.spawnPlayerProj(px, py, baseAngle + off, power, 'bolt', false, false, undefined, undefined, undefined, undefined, attackVisualContext)
      }
      return
    }

    // 破空斩：剑气直线贯穿，使用 mod_blade 贴图
    if (mode === 'slash_pierce') {
      this.slashFx(px, py, dirAngle, stage, attackPalette)
      playModularOnce(this, 'blade', px, py, { depth: 14, scale: 1.0, tint: paletteV1Tint(attackPalette, 'highlight') ?? 0xcfe8ff })
      const pierceRange = 120
      for (const e of this.enemies) {
        if (!e.alive) continue
        const ex = e.x - px, ey = e.y - py
        const along = ex * Math.cos(dirAngle) + ey * Math.sin(dirAngle)
        const perp = Math.abs(-ex * Math.sin(dirAngle) + ey * Math.cos(dirAngle))
        if (along > 0 && along < pierceRange && perp < 28 + (e.isBoss ? 14 : 0)) {
          this.dealDamage(e, COMBO_MULT[stage - 1] * power, stats, false)
        }
      }
      this.cameras.main.shake(45, 0.003)
      return
    }

    // 烈焰弹：火元素法弹，使用 ai_bolt_fly 贴图 + 火焰染色
    if (mode === 'bolt_fire') {
      const target = this.nearestEnemy(px, py)
      const baseAngle = target
        ? Phaser.Math.Angle.Between(px, py, target.x, target.y)
        : dirAngle
      const fireTint = paletteV1Tint(attackPalette, 'primary') ?? 0xff8844
      // ai_bolt_fly 头朝左尾朝右（右→左朝向），朝右飞行时需翻转 180° 使头朝前
      const rotOff = Math.PI
      const spr = this.textures.exists('ai_bolt_fly_1')
        ? this.add.sprite(px, py, 'ai_bolt_fly_1').setDepth(12).setRotation(baseAngle + rotOff).setScale(0.5).setTint(fireTint).play('ai_bolt_fly')
        : this.add.image(px, py, 'bolt_fly_1').setDepth(12).setRotation(baseAngle).setScale(0.42).setTint(fireTint)
      const v = 200
      this.pprojs.push({
        spr, vx: Math.cos(baseAngle) * v, vy: Math.sin(baseAngle) * v,
        power: 1.15 * power, kind: 'bolt', bornAt: time, hits: new Set(),
        linkage: attackLinkage, linkageSourceSetId: attackLinkageSourceSetId, linkageAuthorization: attackLinkageAuthorization,
        visualContext: attackVisualContext, creationOrder: this.projectileCreationSequence++,
      })
      return
    }

    // 碎岩击：重击地面，使用 mod_hit + fx_ring 贴图
    if (mode === 'slash_heavy') {
      this.slashFx(px, py, dirAngle, 3, attackPalette)
      playModularOnce(this, 'hit', px, py, { depth: 14, scale: 1.2, tint: paletteV1Tint(attackPalette, 'highlight') ?? 0xffe9a8 })
      this.burstFx('fx_ring', px, py,
        { depth: 15, peakScale: 1.80, alpha: 0.75, tint: 0xffe9a8 },
        { scale: 0.25, toScale: 1.75, duration: 280 }, attackPalette)
      let hit = false
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(px, py, e.x, e.y)
        if (dist > 70 + (e.isBoss ? 16 : 0)) continue
        hit = true
        this.dealDamage(e, 1.3 * power, stats, false)
      }
      if (hit) this.cameras.main.shake(70, 0.005)
      return
    }

    // 魅影针：高速暗器，使用 ai_proj_fx 贴图
    if (mode === 'bolt_needle') {
      const target = this.nearestEnemy(px, py)
      const baseAngle = target
        ? Phaser.Math.Angle.Between(px, py, target.x, target.y)
        : dirAngle
      const needleTint = paletteV1Tint(attackPalette, 'primary') ?? 0xd8a8ff
      const rotOff = PROJ_ROT_OFFSETS['ai_proj_fx']
      const spr = this.textures.exists('ai_proj_fx_5')
        ? this.add.sprite(px, py, 'ai_proj_fx_5').setDepth(12).setRotation(baseAngle + rotOff).setScale(0.35).setTint(needleTint).play('ai_proj_fx')
        : this.add.image(px, py, 'proj').setDepth(12).setRotation(baseAngle + PROJ_ROT_OFFSETS['proj']).setScale(0.38).setTint(needleTint)
      const v = 280
      this.pprojs.push({
        spr, vx: Math.cos(baseAngle) * v, vy: Math.sin(baseAngle) * v,
        power: 0.9 * power, kind: 'bolt', bornAt: time, hits: new Set(),
        linkage: attackLinkage, linkageSourceSetId: attackLinkageSourceSetId, linkageAuthorization: attackLinkageAuthorization,
        visualContext: attackVisualContext, creationOrder: this.projectileCreationSequence++,
      })
      return
    }

    // 寒冰刺：冰刺贯穿，使用 mod_charge 贴图 + 冰蓝染色
    if (mode === 'slash_ice') {
      playModularOnce(this, 'charge', px, py, { depth: 14, scale: 1.0, tint: 0x9fd8ff })
      this.burstFx('fx_ring', px, py,
        { depth: 15, peakScale: 1.50, alpha: 0.8, tint: 0x9fd8ff },
        { scale: 0.2, toScale: 1.4, duration: 200, toAngle: 90 }, attackPalette)
      const pierceRange = 100
      for (const e of this.enemies) {
        if (!e.alive) continue
        const ex = e.x - px, ey = e.y - py
        const along = ex * Math.cos(dirAngle) + ey * Math.sin(dirAngle)
        const perp = Math.abs(-ex * Math.sin(dirAngle) + ey * Math.cos(dirAngle))
        if (along > 0 && along < pierceRange && perp < 32 + (e.isBoss ? 14 : 0)) {
          this.dealDamage(e, 0.9 * power, stats, true)
          e.applySlow(1500, time)
        }
      }
      this.cameras.main.shake(40, 0.003)
      return
    }

    // 相思镖：飞镖弹道，使用 proj_fly 贴图（8帧，独立于其他弹道）
    if (mode === 'bolt_dart') {
      const target = this.nearestEnemy(px, py)
      const baseAngle = target
        ? Phaser.Math.Angle.Between(px, py, target.x, target.y)
        : dirAngle
      const dartTint = paletteV1Tint(attackPalette, 'primary') ?? 0xd8a8ff
      // proj_fly 动画帧默认朝右（头右尾左），无需偏移；静态 proj.png 需 +90°
      const spr = this.textures.exists('proj_fly_1')
        ? this.add.sprite(px, py, 'proj_fly_1').setDepth(12).setRotation(baseAngle).setScale(0.4).setTint(dartTint).play('proj_fly')
        : this.add.image(px, py, 'proj').setDepth(12).setRotation(baseAngle + PROJ_ROT_OFFSETS['proj']).setScale(0.38).setTint(dartTint)
      const v = 250
      this.pprojs.push({
        spr, vx: Math.cos(baseAngle) * v, vy: Math.sin(baseAngle) * v,
        power: 1.1 * power, kind: 'bolt', bornAt: time, hits: new Set(),
        linkage: attackLinkage, linkageSourceSetId: attackLinkageSourceSetId, linkageAuthorization: attackLinkageAuthorization,
        visualContext: attackVisualContext, creationOrder: this.projectileCreationSequence++,
      })
      return
    }

    // 雷网：闪电编织成网，使用 ai_mod 贴图 + lightningFx 图形
    if (mode === 'thunder_net') {
      const netTint = paletteV1Tint(attackPalette, 'highlight') ?? 0xb39dff
      const inRange = this.enemies.filter((e) => e.alive
        && Phaser.Math.Distance.Between(px, py, e.x, e.y) < 220)
      const maxJumps = 4 + stage
      const hit = new Set<Enemy>()
      let prev = { x: px, y: py }
      for (const e of inRange.slice(0, maxJumps)) {
        this.lightningFx(prev.x, prev.y, e.x, e.y, attackPalette)
        const aiModSpr = this.textures.exists('ai_mod_1')
          ? this.add.sprite(e.x, e.y, 'ai_mod_1').setDepth(13).setScale(0.65).setTint(netTint).play('ai_mod_anim')
          : this.add.image(e.x, e.y, 'proj').setDepth(13).setScale(0.5).setTint(netTint)
        this.tweens.add({ targets: aiModSpr, scale: 0.3, alpha: 0, duration: 250, onComplete: () => aiModSpr.destroy() })
        if (!hit.has(e)) {
          this.dealDamage(e, 0.85 * power * Math.pow(0.75, hit.size), stats, true)
          hit.add(e)
        }
        prev = { x: e.x, y: e.y }
      }
      this.cameras.main.shake(50, 0.004)
      return
    }

    // 穿甲连射：飞剑分裂齐射，使用 ai_slash 贴图（16帧，独立于其他飞剑弹道）
    if (mode === 'flying_sword_split') {
      const splitTint = paletteV1Tint(attackPalette, 'highlight') ?? 0xffe9a8
      for (const off of [-0.3, -0.1, 0.1, 0.3]) {
        const ang = dirAngle + off
        const spr = this.textures.exists('ai_slash_1')
          ? this.add.sprite(px, py, 'ai_slash_1').setDepth(12).setRotation(ang).setScale(0.55).setTint(splitTint).play('ai_slash_anim')
          : this.add.image(px, py, 'sword_proj').setDepth(12).setRotation(ang).setScale(0.9).setTint(splitTint)
        const v = 240
        this.pprojs.push({
          spr, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
          power: 0.75 * power, kind: 'sword', bornAt: time, hits: new Set(),
          linkage: attackLinkage, linkageSourceSetId: attackLinkageSourceSetId, linkageAuthorization: attackLinkageAuthorization,
          visualContext: attackVisualContext, creationOrder: this.projectileCreationSequence++,
        })
      }
      this.slashFx(px, py, dirAngle, 2, attackPalette)
      return
    }

    // 烈焰斩：前方扇形火焰斩击，使用 ai_burst 贴图（16帧，独立于其他爆发效果）
    if (mode === 'flame_slash') {
      this.slashFx(px, py, dirAngle, 3, attackPalette)
      const flameTint = paletteV1Tint(attackPalette, 'highlight') ?? 0xff6622
      const burstSpr = this.textures.exists('ai_burst_1')
        ? this.add.sprite(px, py, 'ai_burst_1').setDepth(13).setScale(1.3).setTint(flameTint).play('ai_burst_anim')
        : this.add.image(px, py, 'mod_burst_1').setDepth(13).setScale(1.2).setTint(flameTint)
      burstSpr.setRotation(dirAngle)
      const coneRange = 90
      const coneHalfAngle = 0.65
      for (const e of this.enemies) {
        if (!e.alive) continue
        const ex = e.x - px, ey = e.y - py
        const along = ex * Math.cos(dirAngle) + ey * Math.sin(dirAngle)
        const perp = Math.abs(-ex * Math.sin(dirAngle) + ey * Math.cos(dirAngle))
        if (along > 0 && along < coneRange && perp < along * Math.tan(coneHalfAngle) + 24 + (e.isBoss ? 14 : 0)) {
          this.dealDamage(e, 1.2 * power, stats, false)
        }
      }
      this.cameras.main.shake(55, 0.004)
      return
    }

    // 暗影刃：暗紫月牙弹道，使用 fx_shadow 贴图
    if (mode === 'shadow_blade') {
      const shadowTint = paletteV1Tint(attackPalette, 'primary') ?? 0x321446
      const rotOff = PROJ_ROT_OFFSETS['fx_shadow']
      const spr = this.textures.exists('fx_shadow_1')
        ? this.add.sprite(px, py, 'fx_shadow_1').setDepth(12).setRotation(dirAngle + rotOff).setScale(0.6).setTint(shadowTint).play('fx_shadow')
        : this.add.image(px, py, 'proj').setDepth(12).setRotation(dirAngle + PROJ_ROT_OFFSETS['proj']).setScale(0.38).setTint(shadowTint)
      const v = 240
      this.pprojs.push({ spr, vx: Math.cos(dirAngle) * v, vy: Math.sin(dirAngle) * v, power: 1.0 * power, kind: 'bolt', bornAt: time, hits: new Set(), linkage: attackLinkage, linkageSourceSetId: attackLinkageSourceSetId, linkageAuthorization: attackLinkageAuthorization, visualContext: attackVisualContext, creationOrder: this.projectileCreationSequence++ })
      return
    }

    // 灵锁链：前方延伸锁链，穿透直线敌人，使用 fx_chain 贴图
    if (mode === 'spirit_chain') {
      const chainTint = paletteV1Tint(attackPalette, 'highlight') ?? 0xa0a0b4
      if (this.textures.exists('fx_chain_1')) {
        const spr = this.add.sprite(px, py, 'fx_chain_1').setDepth(13).setRotation(dirAngle).setScale(0.8).setTint(chainTint).play('fx_chain')
        this.tweens.add({ targets: spr, scale: 1.2, alpha: 0, duration: 400, onComplete: () => spr.destroy() })
      }
      const chainRange = 140
      for (const e of this.enemies) {
        if (!e.alive) continue
        const ex = e.x - px, ey = e.y - py
        const along = ex * Math.cos(dirAngle) + ey * Math.sin(dirAngle)
        const perp = Math.abs(-ex * Math.sin(dirAngle) + ey * Math.cos(dirAngle))
        if (along > 0 && along < chainRange && perp < 20 + (e.isBoss ? 14 : 0)) this.dealDamage(e, COMBO_MULT[stage - 1] * power, stats, false)
      }
      this.cameras.main.shake(40, 0.003)
      return
    }

    // 风刃连：多道风刃扇形齐发，使用 fx_wind 贴图
    if (mode === 'wind_slash') {
      const windTint = paletteV1Tint(attackPalette, 'primary') ?? 0xb4ffc8
      const rotOff = PROJ_ROT_OFFSETS['fx_wind']
      for (const off of [-0.25, 0, 0.25]) {
        const ang = dirAngle + off
        const spr = this.textures.exists('fx_wind_1')
          ? this.add.sprite(px, py, 'fx_wind_1').setDepth(12).setRotation(ang + rotOff).setScale(0.7).setTint(windTint).play('fx_wind')
          : this.add.image(px, py, 'proj').setDepth(12).setRotation(ang + PROJ_ROT_OFFSETS['proj']).setScale(0.38).setTint(windTint)
        const v = 220
        this.pprojs.push({ spr, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, power: 0.8 * power, kind: 'bolt', bornAt: time, hits: new Set(), linkage: attackLinkage, linkageSourceSetId: attackLinkageSourceSetId, linkageAuthorization: attackLinkageAuthorization, visualContext: attackVisualContext, creationOrder: this.projectileCreationSequence++ })
      }
      return
    }

    // 地刺术：前方直线地刺，使用 fx_spike 贴图
    if (mode === 'stone_spike') {
      const spikeTint = paletteV1Tint(attackPalette, 'highlight') ?? 0x967850
      const spikeRange = 120
      for (let i = 1; i <= 3; i++) {
        const d = (i / 3) * spikeRange
        const sx = px + Math.cos(dirAngle) * d
        const sy = py + Math.sin(dirAngle) * d
        if (this.textures.exists('fx_spike_1')) {
          const spr = this.add.sprite(sx, sy, 'fx_spike_1').setDepth(13).setScale(0.7).setTint(spikeTint).play('fx_spike')
          this.tweens.add({ targets: spr, alpha: 0, duration: 500, onComplete: () => spr.destroy() })
        }
      }
      for (const e of this.enemies) {
        if (!e.alive) continue
        const ex = e.x - px, ey = e.y - py
        const along = ex * Math.cos(dirAngle) + ey * Math.sin(dirAngle)
        const perp = Math.abs(-ex * Math.sin(dirAngle) + ey * Math.cos(dirAngle))
        if (along > 0 && along < spikeRange && perp < 24 + (e.isBoss ? 14 : 0)) this.dealDamage(e, COMBO_MULT[stage - 1] * power, stats, true)
      }
      this.cameras.main.shake(50, 0.004)
      return
    }

    // 血镰斩：血红镰刀弧，使用 fx_scythe 贴图
    if (mode === 'blood_scythe') {
      const scytheTint = paletteV1Tint(attackPalette, 'primary') ?? 0xb41e28
      this.slashFx(px, py, dirAngle, stage, attackPalette)
      if (this.textures.exists('fx_scythe_1')) {
        const spr = this.add.sprite(px, py, 'fx_scythe_1').setDepth(14).setRotation(dirAngle + PROJ_ROT_OFFSETS['fx_scythe']).setScale(1.0).setTint(scytheTint).play('fx_scythe')
        this.tweens.add({ targets: spr, scale: 1.3, alpha: 0, duration: 400, onComplete: () => spr.destroy() })
      }
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(px, py, e.x, e.y)
        if (dist > ATTACK_RADIUS + 20 + (e.isBoss ? 14 : 0)) continue
        const ang = Phaser.Math.Angle.Between(px, py, e.x, e.y)
        if (Math.abs(Phaser.Math.Angle.Wrap(ang - dirAngle)) > ATTACK_ARC / 2 + 0.2) continue
        this.dealDamage(e, 1.2 * power, stats, false)
      }
      this.cameras.main.shake(50, 0.004)
      return
    }

    // 星雨弩：多发星刃弹道，使用 fx_star 贴图
    if (mode === 'star_barrage') {
      const starTint = paletteV1Tint(attackPalette, 'highlight') ?? 0xffdc64
      const rotOff = PROJ_ROT_OFFSETS['fx_star']
      for (const off of [-0.2, -0.07, 0.07, 0.2]) {
        const ang = dirAngle + off
        const spr = this.textures.exists('fx_star_1')
          ? this.add.sprite(px, py, 'fx_star_1').setDepth(12).setRotation(ang + rotOff).setScale(0.65).setTint(starTint).play('fx_star')
          : this.add.image(px, py, 'proj').setDepth(12).setRotation(ang + PROJ_ROT_OFFSETS['proj']).setScale(0.5).setTint(starTint)
        const v = 260
        this.pprojs.push({ spr, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, power: 0.7 * power, kind: 'bolt', bornAt: time, hits: new Set(), linkage: attackLinkage, linkageSourceSetId: attackLinkageSourceSetId, linkageAuthorization: attackLinkageAuthorization, visualContext: attackVisualContext, creationOrder: this.projectileCreationSequence++ })
      }
      return
    }

    // 毒爪裂：近身毒爪三连，使用 fx_claw 贴图
    if (mode === 'venom_claw') {
      const clawTint = paletteV1Tint(attackPalette, 'primary') ?? 0x64c850
      this.slashFx(px, py, dirAngle, stage, attackPalette)
      if (this.textures.exists('fx_claw_1')) {
        const spr = this.add.sprite(px, py, 'fx_claw_1').setDepth(14).setRotation(dirAngle).setScale(0.9).setTint(clawTint).play('fx_claw')
        this.tweens.add({ targets: spr, alpha: 0, duration: 300, onComplete: () => spr.destroy() })
      }
      let hit = false
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(px, py, e.x, e.y)
        if (dist > ATTACK_RADIUS + (e.isBoss ? 14 : 0)) continue
        const ang = Phaser.Math.Angle.Between(px, py, e.x, e.y)
        if (Math.abs(Phaser.Math.Angle.Wrap(ang - dirAngle)) > ATTACK_ARC / 2) continue
        hit = true
        this.dealDamage(e, COMBO_MULT[stage - 1] * power, stats, false)
        e.applySlow(1500, time)
      }
      if (hit) this.cameras.main.shake(40, 0.003)
      return
    }

    // 圣光束：直线穿透光束，使用 fx_light 贴图
    if (mode === 'light_beam') {
      const lightTint = paletteV1Tint(attackPalette, 'highlight') ?? 0xfffadc
      if (this.textures.exists('fx_light_1')) {
        const spr = this.add.sprite(px, py, 'fx_light_1').setDepth(13).setRotation(dirAngle + Math.PI / 2).setScale(0.8).setTint(lightTint).play('fx_light')
        this.tweens.add({ targets: spr, alpha: 0, duration: 350, onComplete: () => spr.destroy() })
      }
      const beamRange = 160
      for (const e of this.enemies) {
        if (!e.alive) continue
        const ex = e.x - px, ey = e.y - py
        const along = ex * Math.cos(dirAngle) + ey * Math.sin(dirAngle)
        const perp = Math.abs(-ex * Math.sin(dirAngle) + ey * Math.cos(dirAngle))
        if (along > 0 && along < beamRange && perp < 16 + (e.isBoss ? 14 : 0)) this.dealDamage(e, 1.1 * power, stats, true)
      }
      this.cameras.main.shake(45, 0.003)
      return
    }

    // 魂火弹：追踪魂火弹道，使用 fx_soul 贴图
    if (mode === 'soul_flame') {
      const soulTint = paletteV1Tint(attackPalette, 'primary') ?? 0x64ffdc
      const target = this.nearestEnemy(px, py)
      const baseAngle = target ? Phaser.Math.Angle.Between(px, py, target.x, target.y) : dirAngle
      const rotOff = PROJ_ROT_OFFSETS['fx_soul']
      const spr = this.textures.exists('fx_soul_1')
        ? this.add.sprite(px, py, 'fx_soul_1').setDepth(12).setRotation(baseAngle + rotOff).setScale(0.7).setTint(soulTint).play('fx_soul')
        : this.add.image(px, py, 'proj').setDepth(12).setRotation(baseAngle + PROJ_ROT_OFFSETS['proj']).setScale(0.5).setTint(soulTint)
      const v = 180
      this.pprojs.push({ spr, vx: Math.cos(baseAngle) * v, vy: Math.sin(baseAngle) * v, power: 1.0 * power, kind: 'bolt', bornAt: time, hits: new Set(), linkage: attackLinkage, linkageSourceSetId: attackLinkageSourceSetId, linkageAuthorization: attackLinkageAuthorization, visualContext: attackVisualContext, creationOrder: this.projectileCreationSequence++ })
      return
    }

    // 晶碎刃：散射晶碎片，使用 fx_crystal 贴图
    if (mode === 'crystal_shard') {
      const crystalTint = paletteV1Tint(attackPalette, 'highlight') ?? 0x96dcff
      const rotOff = PROJ_ROT_OFFSETS['fx_crystal']
      for (const off of [-0.3, -0.1, 0.1, 0.3]) {
        const ang = dirAngle + off
        const spr = this.textures.exists('fx_crystal_1')
          ? this.add.sprite(px, py, 'fx_crystal_1').setDepth(12).setRotation(ang + rotOff).setScale(0.65).setTint(crystalTint).play('fx_crystal')
          : this.add.image(px, py, 'proj').setDepth(12).setRotation(ang + PROJ_ROT_OFFSETS['proj']).setScale(0.35).setTint(crystalTint)
        const v = 230
        this.pprojs.push({ spr, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, power: 0.75 * power, kind: 'bolt', bornAt: time, hits: new Set(), linkage: attackLinkage, linkageSourceSetId: attackLinkageSourceSetId, linkageAuthorization: attackLinkageAuthorization, visualContext: attackVisualContext, creationOrder: this.projectileCreationSequence++ })
      }
      return
    }

    // 飞剑类（远程穿透）
    const swords = mode === 'flying_sword_burst' ? 3 : stage // 御剑术：连击段数 = 飞剑数
    const per = (mode === 'flying_sword_burst' ? 0.85 : 0.8) * power
    const spread = swords === 1 ? [0] : swords === 2 ? [-0.12, 0.12] : [-0.22, 0, 0.22]
    if (this.setFx.testSwordVisual) {
      this.slashFx(px, py, dirAngle, 2, attackPalette)
    }
    for (const off of spread) {
      this.spawnPlayerProj(px, py, dirAngle + off, per, 'sword', false, false, attackLinkage, attackLinkageSourceSetId, undefined, attackLinkageAuthorization, attackVisualContext)
    }
    // 法宝buff：额外召唤飞剑（个人法宝 + 宗门圣物）
    const relicArts = (this.state.sect?.relics ?? []).filter(Boolean) as ArtifactInstance[]
    const allArts = [...(this.state.artifacts ?? []), ...relicArts]
    const artBuff = getArtifactBuff(allArts, this.state.classId)
    if (artBuff?.type === 'flying_sword') {
      const extra = Math.ceil(artBuff.value)
      const extraPer = per * 0.6
      for (let i = 0; i < extra; i++) {
        const off = (i - (extra - 1) / 2) * 0.18
        this.spawnPlayerProj(px, py, dirAngle + off, extraPer, 'sword', false, true, attackLinkage, attackLinkageSourceSetId, undefined, attackLinkageAuthorization, attackVisualContext)
      }
    }
  }

  private nearestEnemy(px: number, py: number): Enemy | null {
    let best: Enemy | null = null
    let bestD = 260
    for (const e of this.enemies) {
      if (!e.alive) continue
      const d = Phaser.Math.Distance.Between(px, py, e.x, e.y)
      if (d < bestD) { bestD = d; best = e }
    }
    return best
  }

  /** 飞剑命中/消散：仅当是 sword_proj 动画 sprite 才播命中碎裂，否则立即销毁（现状兜底）。
   *  判据改为 currentAnim.key 前缀，避免 bolt_fly/proj_fly 等其它 Sprite 误播 sword_proj_hit（回归 bug，spec §4.6）。 */
  private destroySwordProj(spr: Phaser.GameObjects.Image) {
    const isSp = spr instanceof Phaser.GameObjects.Sprite
    const key = isSp ? (spr as Phaser.GameObjects.Sprite).anims.currentAnim?.key : undefined
    if (this.hasCompleteSequenceAnimationPlayback('sword_proj_hit') && isSwordProjAnim(isSp, key)) {
      (spr as Phaser.GameObjects.Sprite).play('sword_proj_hit')
      spr.on('animationcomplete', () => spr.destroy())
    } else {
      spr.destroy()
    }
  }

  /**
   * 径向爆发特效：有序列帧动画时播放（扩散/淡出已烘进帧），否则降级为静态贴图 + 放大淡出补间（现状）。
   * 调用点改造后行为与原补间路径逐参数等价；动画未注册时 100% 走静态兜底（零回归）。
   * @param animKey   fx_ring / fx_splash / fx_spark
   * @param peakScale 动画路径固定 scale = 静态补间的**峰值**（扩散烤进帧，勿用起始值，spec §3.2 / §4.4）
   * @param o    动画/兜底共用的基础参数
   * @param fb   静态兜底补间参数（保持与改造前逐参数一致）
   */
  private burstFx(
    animKey: 'fx_ring' | 'fx_splash' | 'fx_spark',
    x: number, y: number,
    o: { depth: number; peakScale: number; alpha: number; tint?: number },
    fb: { scale: number; toScale: number; duration: number; toAngle?: number },
    palette?: PaletteV1,
  ) {
    if (this.hasCompleteSequenceAnimationPlayback(animKey)) {
      const s = this.add.sprite(x, y, `${animKey}_1`)
        .setDepth(o.depth).setScale(o.peakScale).setAlpha(o.alpha)
      s.setTint(paletteV1Tint(palette, animKey === 'fx_splash' ? 'highlight' : 'primary') ?? o.tint ?? 0xffffff)
      s.play(animKey)
      s.on('animationcomplete', () => s.destroy())
      return
    }
    // Static/baked fallback stays functional. Palette V1 adds only a small
    // Graphics outline when a v3 color is available; it cannot alter AoE logic.
    const img = this.add.image(x, y, 'slash').setDepth(o.depth).setScale(fb.scale).setAlpha(o.alpha)
    if (palette) img.setTint(paletteV1Tint(palette, 'primary')!)
    else if (o.tint !== undefined) img.setTint(o.tint)
    if (palette) this.paletteOverlay(x, y, palette, 'impact', o.depth + 1)
    this.tweens.add({
      targets: img,
      scale: fb.toScale,
      alpha: 0,
      ...(fb.toAngle !== undefined ? { angle: fb.toAngle } : {}),
      duration: fb.duration,
      onComplete: () => img.destroy(),
    })
  }

  private slashFx(px: number, py: number, angle: number, stage: number, palette?: PaletteV1) {
    const tint = paletteV1Tint(palette, stage === 3 ? 'highlight' : 'primary') ?? (stage === 3 ? 0x9fd8ff : undefined)
    if (this.hasCompleteSequenceAnimationPlayback('slash_anim')) {
      // Existing delivered slash frames are registered only after all six frames
      // are present. Keep the historical flip to preserve this project's current art orientation.
      const slash = this.add.sprite(px + Math.cos(angle) * 22, py + Math.sin(angle) * 22, 'slash_1')
        .setDepth(15).setFlipX(true).setRotation(angle).setScale(stage === 3 ? 0.75 : 0.5).setAlpha(0.9)
      if (tint !== undefined) slash.setTint(tint)
      slash.play('slash_anim')
      slash.on('animationcomplete', () => slash.destroy())
    } else {
      // Static fallback retains current behavior; the compact overlay makes a
      // v3 palette visible without claiming an unavailable sequence was used.
      const slash = this.add.image(px + Math.cos(angle) * 22, py + Math.sin(angle) * 22, 'slash')
        .setDepth(15).setFlipX(true).setRotation(angle).setScale(stage === 3 ? 0.75 : 0.5).setAlpha(0.9)
      if (tint !== undefined) slash.setTint(tint)
      if (palette) this.paletteOverlay(slash.x, slash.y, palette, 'cast', 16)
      this.tweens.add({ targets: slash, alpha: 0, scale: slash.scale * 1.3, duration: 130, onComplete: () => slash.destroy() })
    }
  }

  /** 雷电特效：在两点间画一条折线闪电（外晕 + 内芯），快速消散；可自定义配色 */
  private lightningFx(x1: number, y1: number, x2: number, y2: number, paletteOrOuter?: PaletteV1 | number, outerOrInner = 0xb39dff, legacyInner = 0xfff3b0) {
    // Preserve existing external/internal calls that passed custom numeric
    // colors, while allowing Palette V1 to supply the player-owned pair.
    const palette = typeof paletteOrOuter === 'number' ? undefined : paletteOrOuter
    const outer = typeof paletteOrOuter === 'number' ? paletteOrOuter : outerOrInner
    const inner = typeof paletteOrOuter === 'number' ? outerOrInner : legacyInner
    const colors = paletteV1LightningColors(palette)
    const resolvedOuter = colors?.outer ?? outer
    const resolvedInner = colors?.inner ?? inner
    const g = this.add.graphics().setDepth(16)
    const segs = 5
    const pts: Array<{ x: number; y: number }> = [{ x: x1, y: y1 }]
    for (let i = 1; i < segs; i++) {
      const t = i / segs
      const nx = x1 + (x2 - x1) * t
      const ny = y1 + (y2 - y1) * t
      // 垂直于主方向的随机抖动，形成闪电折角
      const len = Math.max(1, Phaser.Math.Distance.Between(x1, y1, x2, y2))
      const px = -(y2 - y1) / len, py = (x2 - x1) / len
      const jitter = (this.rng() - 0.5) * 14
      pts.push({ x: nx + px * jitter, y: ny + py * jitter })
    }
    pts.push({ x: x2, y: y2 })
    g.lineStyle(5, resolvedOuter, 0.5)  // 外晕
    g.strokePoints(pts as Phaser.Types.Math.Vector2Like[], false, false)
    g.lineStyle(2, resolvedInner, 1)    // 内芯
    g.strokePoints(pts as Phaser.Types.Math.Vector2Like[], false, false)
    this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() })
  }

  // ---------- 万剑归宗 · 旋转剑阵 ----------
  /** 当前剑阵飞剑数与半径：随功法等级成长（Lv1=3 把，每级 +1，Lv5=7 把；半径 60→76） */
  private swordArraySpec(): { count: number; radius: number } {
    const styleId = this.state.skillSlots.style
    const lv = styleId ? (this.state.skills[styleId] ?? 1) : 1
    return { count: 2 + lv, radius: 56 + lv * 4 }
  }

  private toggleSwordArray(time: number) {
    if (this.swordArrayOn) {
      this.stopSwordArray()
      sfx('sfx_skill', 0.5)
      toast('剑阵收敛', '#9fd8ff')
      return
    }
    const { count } = this.swordArraySpec()
    this.swordArrayOn = true
    this.swordAngle = this.rng() * Math.PI * 2
    this.swordDrainAt = time + 1000
    this.swordHitAt.clear()
    this.swordRing = this.add.graphics().setDepth(13)
    for (let i = 0; i < count; i++) {
      const b = this.hasCompleteSequenceAnimationPlayback('sword_proj_loop')
        ? this.add.sprite(this.player.sprite.x, this.player.sprite.y, 'sword_proj_3')
            .setDepth(14).setScale(0.8).setTint(0xcfe8ff).play('sword_proj_loop')
        : this.add.image(this.player.sprite.x, this.player.sprite.y, 'sword_proj')
            .setDepth(14).setScale(0.8).setTint(0xcfe8ff)
      this.swordBlades.push(b)
    }
    this.player.sprite.setTintFill(0xcfe8ff)
    this.time.delayedCall(120, () => this.player.sprite.clearTint())
    sfx('sfx_art', 0.5)
    toast(`万剑归宗 · ${count} 剑齐出（每秒燃烧气血 10 点，再按攻击收敛）`, '#af7ac5')
  }

  private stopSwordArray() {
    this.swordArrayOn = false
    for (const b of this.swordBlades) b.destroy()
    this.swordBlades = []
    this.swordRing?.destroy()
    this.swordRing = null
    this.swordHitAt.clear()
  }

  private updateArrayMine(time: number) {
    if (!this.setFx.arrayMine) return
    if (!this.arrayMineEyes.length) {
      const p = this.player.sprite
      const pts = [{ x: p.x - 42, y: p.y }, { x: p.x + 42, y: p.y }, { x: p.x, y: p.y - 42 }]
      this.arrayMineEyes = createArrayMineEyes(true, pts)
      this.arrayMineStartedAt = time
      this.arrayMineGraphics = this.add.graphics().setDepth(8)
      this.arrayMineGraphics.lineStyle(2, 0x8e44ad, 0.8)
      this.arrayMineGraphics.beginPath(); this.arrayMineGraphics.moveTo(pts[0].x, pts[0].y); this.arrayMineGraphics.lineTo(pts[1].x, pts[1].y); this.arrayMineGraphics.lineTo(pts[2].x, pts[2].y); this.arrayMineGraphics.closePath(); this.arrayMineGraphics.strokePath()
      for (const e of this.arrayMineEyes) playModularOnce(this, 'rune', e.x, e.y, { depth: 9, scale: 0.45 })
    }
    if (arrayMineExpired(this.arrayMineStartedAt, time)) {
      this.arrayMineGraphics?.destroy(); this.arrayMineGraphics = null; this.arrayMineEyes = []; return
    }
    for (const eye of this.arrayMineEyes) for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      if (triggerArrayMineEye(eye, enemy.sprite.x, enemy.sprite.y)) {
        playModularOnce(this, 'charge', eye.x, eye.y, { depth: 10, scale: 0.5 })
        playModularOnce(this, 'burst', eye.x, eye.y, { depth: 10, scale: 0.6 })
      }
    }
  }

  /** 主循环驱动：旋转、扣血、触敌伤害；飞剑数随功法等级动态增减 */
  private updateSwordArray(time: number, delta: number) {
    if (!this.swordArrayOn) return
    const p = this.player.sprite
    const { count, radius: R } = this.swordArraySpec()
    // 功法升级/降级时同步飞剑数量
    while (this.swordBlades.length < count) {
      const b = this.hasCompleteSequenceAnimationPlayback('sword_proj_loop')
        ? this.add.sprite(p.x, p.y, 'sword_proj_3').setDepth(14).setScale(0.8).setTint(0xcfe8ff).play('sword_proj_loop')
        : this.add.image(p.x, p.y, 'sword_proj').setDepth(14).setScale(0.8).setTint(0xcfe8ff)
      this.swordBlades.push(b)
    }
    while (this.swordBlades.length > count) this.swordBlades.pop()!.destroy()
    this.swordAngle += delta * 0.0036  // 约 1.75 秒一圈
    for (let i = 0; i < this.swordBlades.length; i++) {
      const a = this.swordAngle + (i * Math.PI * 2) / this.swordBlades.length
      const b = this.swordBlades[i]
      b.setPosition(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R)
      b.setRotation(a + Math.PI / 2)  // 沿切线方向
    }
    this.swordRing?.clear()
    this.swordRing?.lineStyle(1.5, 0x9fd8ff, 0.18)
    this.swordRing?.strokeCircle(p.x, p.y, R)

    // 每秒燃烧气血 10 点；气血 ≤10 时自动收敛（不会烧死）
    if (time >= this.swordDrainAt) {
      this.swordDrainAt = time + 1000
      const hp = currentHp(this.state)
      if (hp <= 10) {
        this.stopSwordArray()
        toast('气血不支，剑阵自行收敛！', '#ff8888')
        return
      }
      this.state.hp = Math.max(1, hp - 10)
      this.floatText(p.x, p.y - 20, '-10 精血', '#ff6b6b', 9)
      updateHUD()
    }

    // 飞剑触敌：每把剑对同一敌人 350ms 冷却
    const stats = calcStats(this.state)
    const power = stylePower(this.state)
    for (const b of this.swordBlades) {
      for (const e of this.enemies) {
        if (!e.alive) continue
        if (Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y) > 22 + (e.isBoss ? 10 : 0)) continue
        if (time < (this.swordHitAt.get(e) ?? 0)) continue
        this.swordHitAt.set(e, time + 350)
        this.dealDamage(e, 0.55 * power, stats, false)
        this.burstFx('fx_spark', b.x, b.y,
          { depth: 15, peakScale: 0.47, alpha: 0.8, tint: 0xcfe8ff },
          { scale: 0.25, toScale: 0.45, duration: 120 })
      }
    }
  }

  /** 大庚剑阵持续效果：飞剑环绕玩家，自动索敌并发射剑光攻击 */
  private updateDagengOrbit(time: number, delta: number) {
    if (this.dagengOrbit.length === 0 || time > this.dagengOrbitUntil) {
      if (this.dagengOrbit.length > 0) {
        for (const b of this.dagengOrbit) b.destroy()
        this.dagengOrbit = []
        this.dagengOrbitHitAt.clear()
      }
      return
    }
    const p = this.player.sprite
    const artId = this.state.skillSlots.art
    const artLevel = artId ? (this.state.skills[artId] ?? 1) : 1
    const radius = 55 + artLevel * 3
    this.dagengOrbitAngle += delta * 0.0028
    for (let i = 0; i < this.dagengOrbit.length; i++) {
      const angle = this.dagengOrbitAngle + (i * Math.PI * 2) / this.dagengOrbit.length
      const b = this.dagengOrbit[i]
      b.setPosition(p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius)
      b.setRotation(angle + Math.PI / 2)
    }

    // 每 200ms 在每把环绕剑位置产生拖尾粒子
    if (time % 200 < delta) {
      for (const b of this.dagengOrbit) {
        const tint = (b as Phaser.GameObjects.Image).tintTopLeft ?? 0xffd54a
        const trail = this.add.circle(b.x, b.y, 1.5, tint, 0.5).setDepth(13)
        this.tweens.add({
          targets: trail, alpha: 0, scale: 0.1, duration: 200, ease: 'Quad.out',
          onComplete: () => trail.destroy(),
        })
      }
    }

    // 索敌攻击：每把环绕剑对范围内敌人发射追踪剑光，每把剑对同一敌人 500ms 冷却
    const stats = calcStats(this.state)
    const power = stylePower(this.state)
    const detectRange = 180 + artLevel * 20
    for (const b of this.dagengOrbit) {
      // 找到最近的敌人
      let nearest: Enemy | null = null
      let nearestDist = detectRange
      for (const e of this.enemies) {
        if (!e.alive) continue
        const d = Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y)
        if (d < nearestDist) {
          nearestDist = d
          nearest = e
        }
      }
      if (!nearest) continue
      if (time < (this.dagengOrbitHitAt.get(nearest) ?? 0)) continue
      this.dagengOrbitHitAt.set(nearest, time + 500)
      // 发射追踪剑光
      const angle = Phaser.Math.Angle.Between(b.x, b.y, nearest.x, nearest.y)
      const tint = (b as Phaser.GameObjects.Image).tintTopLeft ?? 0xffd54a
      const spr = this.add.image(b.x, b.y, 'sword_proj').setDepth(13).setRotation(angle).setScale(0.6).setTint(tint)
      this.pprojs.push({
        spr, vx: Math.cos(angle) * 280, vy: Math.sin(angle) * 280,
        power: power * 0.4, kind: 'sword', bornAt: time, hits: new Set(), homing: true,
        creationOrder: this.projectileCreationSequence++,
      })
      this.burstFx('fx_spark', b.x, b.y,
        { depth: 15, peakScale: 0.35, alpha: 0.6, tint: 0xffd54a },
        { scale: 0.15, toScale: 0.3, duration: 100 })
      // 发射时额外粒子飞溅
      this.emitParticles(b.x, b.y, 4, tint, 18, 15, 1.5, 150)
    }
  }

  private spawnPlayerProj(
    x: number,
    y: number,
    angle: number,
    power: number,
    kind: 'sword' | 'bolt',
    split = false,
    derived = false,
    linkage?: ControlledHitLinkage,
    linkageSourceSetId?: string,
    linkageRecipeId?: ControlledHitLinkageRecipeId,
    linkageAuthorization?: ControlledHitLinkageAuthorizationSnapshot,
    visualContext?: PaletteV1VisualContext,
  ) {
    const palette = visualContext?.palette
    const swordFramesReady = this.hasCompleteSequenceAnimationPlayback('sword_proj_fly')
    const boltFramesReady = this.hasCompleteSequenceAnimationPlayback('bolt_fly')
    const spr = kind !== 'bolt' && swordFramesReady
      ? this.add.sprite(x, y, 'sword_proj_3').setDepth(12).setRotation(angle).setScale(0.9).play('sword_proj_fly')
      : kind === 'bolt' && boltFramesReady
        // Baked fire frames are not safely tintable; the compact palette halo below preserves v3 identity.
        ? this.add.sprite(x, y, 'bolt_fly_1').setDepth(12).setRotation(angle).setScale(0.42).play('bolt_fly')
        : this.add.image(x, y, kind === 'bolt' ? 'bolt' : 'sword_proj').setDepth(12).setRotation(angle).setScale(kind === 'bolt' ? 1 : 0.9)
    if (kind !== 'bolt' && palette) spr.setTint(paletteV1Tint(palette, 'primary')!)
    if (kind === 'bolt' && !boltFramesReady && palette) spr.setTint(paletteV1Tint(palette, 'primary')!)
    if (palette && ((kind !== 'bolt' && !swordFramesReady) || kind === 'bolt')) this.paletteOverlay(x, y, palette, 'projectile', 13)
    const v = kind === 'bolt' ? 260 : 300
    this.pprojs.push({
      spr, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
      power, kind, bornAt: this.time.now, hits: new Set(), split, derived, linkage, linkageSourceSetId, linkageRecipeId, linkageAuthorization, visualContext,
      creationOrder: this.projectileCreationSequence++,
    })
  }

  /** Executes only the two data-whitelisted first-hit actions; no user save can inject another branch. */
  private triggerControlledHitLinkage(pp: PProj, time: number) {
    const linkage = pp.linkage
    if (!linkage || pp.derived || pp.linkageRecipeId !== undefined || pp.linkageFirstHitEvaluated
      || !this.controlledLinkageAuthorization.isCurrent(pp.linkageAuthorization)
      || !matchesControlledHitLinkageProjectileKind(linkage, pp.kind)) return
    // A cooldown-blocked first collision is still the parent's first hit. Mark it
    // before evaluating readiness so a later collision cannot retry this parent.
    pp.linkageFirstHitEvaluated = true
    const cooldownKey = controlledHitLinkageCooldownKey(pp.linkageSourceSetId, linkage.recipeId)
    const readyAt = this.controlledLinkageAuthorization.readyAt(cooldownKey)
    const trigger = tryTriggerControlledHitLinkage(linkage, time, readyAt, false, true)
    if (!trigger) return
    this.controlledLinkageAuthorization.setReadyAt(cooldownKey, trigger.nextReadyAt)
    pp.linkageRecipeId = trigger.recipeId
    const palette = pp.visualContext?.palette
    if (trigger.action.kind === 'split_swords') {
      playModularOnce(this, 'hit', pp.spr.x, pp.spr.y, { depth: 15, scale: 0.7, tint: paletteV1Tint(palette, 'highlight') ?? 0xcfe8ff })
      if (palette) this.paletteOverlay(pp.spr.x, pp.spr.y, palette, 'impact', 16)
      for (const child of swordSplitParams(pp.spr.rotation, pp.power)) {
        // Child retains only its parent visual identity. The derived flag and
        // recipe id remain the existing non-recursive gameplay authority.
        this.spawnPlayerProj(pp.spr.x, pp.spr.y, child.angle, child.power, 'sword', true, true, undefined, pp.linkageSourceSetId, trigger.recipeId, undefined, inheritPaletteV1VisualContext(pp.visualContext))
      }
      return
    }
    const target = this.nearestEnemy(pp.spr.x, pp.spr.y)
    const angle = target ? Phaser.Math.Angle.Between(pp.spr.x, pp.spr.y, target.x, target.y) : pp.spr.rotation
    playModularOnce(this, 'hit', pp.spr.x, pp.spr.y, { depth: 15, scale: 0.65, tint: paletteV1Tint(palette, 'highlight') ?? 0xe67e22 })
    if (palette) this.paletteOverlay(pp.spr.x, pp.spr.y, palette, 'impact', 16)
    this.spawnPlayerProj(pp.spr.x, pp.spr.y, angle, pp.power * trigger.action.damageMultiplier, 'bolt', true, true, undefined, pp.linkageSourceSetId, trigger.recipeId, undefined, inheritPaletteV1VisualContext(pp.visualContext))
  }

  // ---------- 神通 ----------
  private castArt(time: number) {
    this.refreshSetFx()
    // v4 旁路（S5）：v4 Kit 神通走 executor + scene-adapter，不进旧路由
    // S5-dyn：动态套装 artPrimitive 同样走 v4 executor 管线
    const v4Ability = resolveAnyKitArtAbility(this.state)
    if (v4Ability) {
      this.doV4Art(time, v4Ability)
      return
    }
    const setOverride = resolveSetArtOverride(this.state)
    const artId = this.state.skillSlots.art
    const def = artId ? SKILLS.get(artId) : undefined
    if (!setOverride && !artId) { toast('尚未装配神通（背包 → 功法）', '#ff8888'); return }
    if (!setOverride && def && def.class !== 'any' && def.class !== this.state.classId) { toast('该神通与当前职业不符', '#ff8888'); return }

    const stats = calcStats(this.state)
    const resolved = resolveEffectiveArtCast(
      setOverride,
      def,
      artId ? skillPowerAt(this.state, artId) : 1,
      artId ? artCooldown(this.state, artId, stats.cdPct) : 0,
    )
    if (!resolved) { toast('该神通尚未具现', '#ff8888'); return }

    if (time < this.artReadyAt) return

    // Independent art ownership: never borrow the attack winner's palette.
    const artPalette = resolved.source === 'set' ? resolveArtPaletteV1(this.state) : undefined
    const artVisualContext = makePaletteV1VisualContext(artPalette)

    // 静态凡人套没有 transformId，保留旧版“大庚基数 × 当前招式威力”的伤害语义；
    // 动态 profile 已持久化 artPower，按 profile 数值直接结算。
    const executionPower = resolved.source === 'set' && !setOverride?.transformId
      ? resolved.power * stylePower(this.state)
      : resolved.power
    if (resolved.mode === 'dageng') {
      // 套装用自身基础 CD；技能神通的 cooldown 已经由 artCooldown 折算，反推基础值以复用该执行器。
      const baseCooldownMs = resolved.source === 'set'
        ? resolved.cooldownMs
        : Math.round(resolved.cooldownMs / Math.max(0.0001, 1 - stats.cdPct))
      // 大庚 normally returns before the common art VFX branch. Keep its
      // phase-local art palette and recipe on the art-owned route explicitly.
      if (resolved.source === 'set') playProceduralVfx(this, resolveProceduralArtVfx(this.state), 'art', this.player.sprite.x, this.player.sprite.y, this.player.dir.angle(), artPalette)
      this.castDageng(time, executionPower, baseCooldownMs, resolved.displayName, artPalette)
      return
    }

    // 套装走自身基础 CD；普通神通的 cooldown 已由 artCooldown 计算过 cdPct。
    const cooldownMs = resolved.source === 'set'
      ? Math.round(resolved.cooldownMs * (1 - stats.cdPct))
      : resolved.cooldownMs
    this.artReadyAt = time + cooldownMs
    const p = this.player
    const power = executionPower
    const dirAngle = p.dir.angle()
    // 套装神通的 VFX 由覆写 resolver 严格校验；无 recipe 的官方/旧动态套不受影响。
    if (resolved.source === 'set') playProceduralVfx(this, resolveProceduralArtVfx(this.state), 'art', p.sprite.x, p.sprite.y, dirAngle, artPalette)
    if (resolved.mode === 'fire_rain') {
      // 流星火雨：火弹大范围散布，高等级追加火弹数量与余烬
      const frLevel = resolved.source === 'set' ? 1 : (artId ? (this.state.skills[artId] ?? 1) : 1)
      const fireCount = frLevel >= 5 ? 14 : frLevel >= 3 ? 10 : 7
      for (let i = 0; i < fireCount; i++) {
        this.spawnPlayerProj(p.sprite.x, p.sprite.y, dirAngle + (this.rng() - 0.5) * 1.3, power, 'bolt', false, false, undefined, undefined, undefined, undefined, artVisualContext)
      }
      // 施放时火色粒子爆发
      this.emitParticles(p.sprite.x, p.sprite.y, fireCount, 0xff6622, 35, 14, 2.5, 250)
      if (frLevel >= 4) {
        this.burstFx('fx_splash', p.sprite.x, p.sprite.y,
          { depth: 14, peakScale: 1.8, alpha: 0.6, tint: 0xff6622 },
          { scale: 0.2, toScale: 1.6, duration: 300 }, artPalette)
        // Lv4+：余烬粒子缓慢飘散
        this.emitParticles(p.sprite.x, p.sprite.y, 8, 0xff8844, 50, 13, 2, 500)
      }
      if (frLevel >= 5) {
        // Lv5：火焰冲击波
        this.emitRing(p.sprite.x, p.sprite.y, 0xff4400, 60, 12, 0.5, 400)
      }
    } else if (resolved.mode === 'thunder_strike') {
      // 九天神雷：天雷轰击周围敌人，高等级追加雷击次数与连锁
      const tsLevel = resolved.source === 'set' ? 1 : (artId ? (this.state.skills[artId] ?? 1) : 1)
      const strikeCount = tsLevel >= 5 ? 9 : tsLevel >= 3 ? 7 : 5
      const strikeRange = 260
      const inRange = this.enemies.filter((e) => e.alive
        && Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y) < strikeRange)
      const targets: Array<{ x: number; y: number; e?: Enemy }> = inRange.slice(0, strikeCount)
        .map((e) => ({ x: e.x, y: e.y, e }))
      while (targets.length < strikeCount) {
        targets.push({
          x: p.sprite.x + randInt(this.rng, -100, 100),
          y: p.sprite.y + randInt(this.rng, -100, 100),
        })
      }
      for (const t of targets) {
        this.lightningFx(t.x + randInt(this.rng, -30, 30), t.y - 170, t.x, t.y, artPalette)
        this.burstFx('fx_splash', t.x, t.y,
          { depth: 15, peakScale: 1.25, alpha: 0.9, tint: 0xb39dff },
          { scale: 0.25, toScale: 1.2, duration: 220 }, artPalette)
        // 每个雷击点紫色粒子飞溅
        this.emitParticles(t.x, t.y, 5, 0xb39dff, 20, 15, 2, 200)
        if (t.e) {
          this.dealDamage(t.e, power, stats, true)
          if (tsLevel >= 4) t.e.applySlow(1500, time)
        }
      }
      if (tsLevel >= 3) {
        // Lv3+：施放时紫色能量扩散环
        this.emitRing(p.sprite.x, p.sprite.y, 0xb39dff, 50, 13, 0.4, 300)
      }
      if (tsLevel >= 5) {
        // Lv5：追加中心雷暴 + 大范围粒子爆发
        this.burstFx('fx_splash', p.sprite.x, p.sprite.y,
          { depth: 16, peakScale: 2.5, alpha: 0.85, tint: 0xb39dff },
          { scale: 0.3, toScale: 2.3, duration: 300 }, artPalette)
        this.emitRing(p.sprite.x, p.sprite.y, 0xfff3b0, 80, 12, 0.5, 400)
        this.emitParticles(p.sprite.x, p.sprite.y, 10, 0xfff3b0, 40, 16, 3, 350)
        this.cameras.main.shake(100, 0.006)
      }
    } else if (resolved.mode === 'sword_storm') {
      // 千剑归宗：扇形剑气齐发，高等级追加剑气数量
      const ssLevel = resolved.source === 'set' ? 1 : (artId ? (this.state.skills[artId] ?? 1) : 1)
      const stormCount = ssLevel >= 5 ? 14 : ssLevel >= 3 ? 10 : 7
      const spread = ssLevel >= 4 ? 0.7 : 0.6
      const stormTint = paletteV1Tint(artPalette, 'highlight') ?? 0xcfe8ff
      for (let i = 0; i < stormCount; i++) {
        const off = (i / (stormCount - 1) - 0.5) * 2 * spread
        const ang = dirAngle + off
        const spr = this.textures.exists('ai_sword_proj_1')
          ? this.add.sprite(p.sprite.x, p.sprite.y, 'ai_sword_proj_1').setDepth(12).setRotation(ang).setScale(0.65).setTint(stormTint).play('ai_sword_proj')
          : this.add.image(p.sprite.x, p.sprite.y, 'sword_proj').setDepth(12).setRotation(ang).setScale(0.9).setTint(stormTint)
        const v = 220
        this.pprojs.push({
          spr, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
          power: 0.72 * power, kind: 'sword', bornAt: time, hits: new Set(),
          visualContext: artVisualContext, creationOrder: this.projectileCreationSequence++,
        })
      }
      // 施放时冰蓝色粒子爆发
      this.emitParticles(p.sprite.x, p.sprite.y, stormCount, stormTint, 40, 14, 2.5, 300)
      if (ssLevel >= 3) {
        // Lv3+：冰蓝冲击波
        this.emitRing(p.sprite.x, p.sprite.y, stormTint, 55, 13, 0.4, 300)
      }
      if (ssLevel >= 5) {
        // Lv5：金色剑气环绕粒子
        this.emitRing(p.sprite.x, p.sprite.y, 0xfff3b0, 75, 12, 0.5, 400)
        this.emitParticles(p.sprite.x, p.sprite.y, 12, 0xfff3b0, 50, 16, 3, 400)
      }
    } else if (resolved.mode === 'fire_phoenix') {
      // 浴火重生：火凤凰俯冲，使用 mod_burst + 散射火弹
      playModularOnce(this, 'burst', p.sprite.x, p.sprite.y - 20, { depth: 14, scale: 1.5, alpha: 0.9, tint: 0xff6622 })
      for (const off of [-0.35, -0.12, 0.12, 0.35]) {
        this.spawnPlayerProj(p.sprite.x, p.sprite.y, dirAngle + off, 0.5 * power, 'bolt', false, false, undefined, undefined, undefined, undefined, artVisualContext)
      }
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y)
        if (dist < 140) this.dealDamage(e, 0.4 * power, stats, true)
      }
      this.burstFx('fx_splash', p.sprite.x, p.sprite.y,
        { depth: 15, peakScale: 2.0, alpha: 0.85, tint: 0xff8844 },
        { scale: 0.3, toScale: 1.9, duration: 300 }, artPalette)
    } else if (resolved.mode === 'mountain_seal') {
      // 五岳镇域：领域压制，使用 mod_field + mod_rune 贴图
      playModularOnce(this, 'field', p.sprite.x, p.sprite.y, { depth: 13, scale: 2.0, alpha: 0.7, tint: 0xddcc88 })
      const sealRadius = 110
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        const sx = p.sprite.x + Math.cos(a) * sealRadius
        const sy = p.sprite.y + Math.sin(a) * sealRadius
        playModularOnce(this, 'rune', sx, sy, { depth: 14, scale: 0.8, tint: 0xddcc88 })
      }
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y)
        if (dist < sealRadius + (e.isBoss ? 16 : 0)) {
          this.dealDamage(e, power, stats, true)
          e.applySlow(2000, time)
        }
      }
    } else if (resolved.mode === 'shadow_swarm') {
      // 百魅夜行：魅影分身群攻，使用 ai_mod 贴图
      const swLevel = resolved.source === 'set' ? 1 : (artId ? (this.state.skills[artId] ?? 1) : 1)
      const swCount = swLevel >= 5 ? 8 : swLevel >= 3 ? 6 : 5
      const inRange = this.enemies.filter((e) => e.alive
        && Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y) < 220)
      const targets: Array<{ x: number; y: number; e?: Enemy }> = inRange.slice(0, swCount)
        .map((e) => ({ x: e.x, y: e.y, e }))
      while (targets.length < swCount) {
        targets.push({
          x: p.sprite.x + randInt(this.rng, -90, 90),
          y: p.sprite.y + randInt(this.rng, -90, 90),
        })
      }
      for (const t of targets) {
        playModularOnce(this, 'hit', t.x, t.y, { depth: 15, scale: 0.9, alpha: 0.85, tint: 0xd8a8ff })
        this.burstFx('fx_spark', t.x, t.y,
          { depth: 16, peakScale: 0.8, alpha: 0.7, tint: 0xd8a8ff },
          { scale: 0.2, toScale: 0.75, duration: 180 }, artPalette)
        // 每个目标点暗紫色粒子飞溅
        this.emitParticles(t.x, t.y, 4, 0xd8a8ff, 16, 16, 1.5, 180)
        if (t.e) this.dealDamage(t.e, 0.5 * power, stats, true)
      }
      // 施放时暗影扩散环
      this.emitRing(p.sprite.x, p.sprite.y, 0x6a3c88, 45, 13, 0.4, 300)
      if (swLevel >= 5) {
        // Lv5：暗影爆发
        this.emitParticles(p.sprite.x, p.sprite.y, 10, 0xd8a8ff, 45, 16, 2.5, 350)
      }
    } else if (resolved.mode === 'ice_thunder') {
      // 冰雷双生：冰冻+雷击，使用 fx_splash 冰色 + lightningFx
      const itLevel = resolved.source === 'set' ? 1 : (artId ? (this.state.skills[artId] ?? 1) : 1)
      const itCount = itLevel >= 5 ? 8 : itLevel >= 3 ? 6 : 5
      const inRange = this.enemies.filter((e) => e.alive
        && Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y) < 240)
      const targets: Array<{ x: number; y: number; e?: Enemy }> = inRange.slice(0, itCount)
        .map((e) => ({ x: e.x, y: e.y, e }))
      while (targets.length < itCount) {
        targets.push({
          x: p.sprite.x + randInt(this.rng, -100, 100),
          y: p.sprite.y + randInt(this.rng, -100, 100),
        })
      }
      for (const t of targets) {
        this.lightningFx(t.x + randInt(this.rng, -30, 30), t.y - 170, t.x, t.y, artPalette)
        this.burstFx('fx_splash', t.x, t.y,
          { depth: 15, peakScale: 1.3, alpha: 0.9, tint: 0x9fd8ff },
          { scale: 0.25, toScale: 1.25, duration: 240 }, artPalette)
        // 冰色 + 紫色双色粒子飞溅
        this.emitParticles(t.x, t.y, 4, 0x9fd8ff, 18, 15, 2, 200)
        this.emitParticles(t.x, t.y, 3, 0xb39dff, 14, 16, 1.5, 180)
        if (t.e) {
          this.dealDamage(t.e, power, stats, true)
          t.e.applySlow(itLevel >= 3 ? 3500 : 2500, time)
        }
      }
      // 施放时冰雷双色扩散环
      this.emitRing(p.sprite.x, p.sprite.y, 0x9fd8ff, 45, 13, 0.4, 300)
      if (itLevel >= 5) {
        this.emitRing(p.sprite.x, p.sprite.y, 0xb39dff, 65, 12, 0.5, 400)
        this.emitParticles(p.sprite.x, p.sprite.y, 8, 0xfff3b0, 40, 16, 2.5, 350)
      }
    } else if (resolved.mode === 'thunder_prison') {
      // 万雷天牢：雷牢笼困敌，使用 AI 生成 thunder_prison 贴图 + lightningFx
      const prisonTint = paletteV1Tint(artPalette, 'highlight') ?? 0xb39dff
      // 中心雷牢贴图动画
      if (this.textures.exists('thunder_prison_1')) {
        const cage = this.add.sprite(p.sprite.x, p.sprite.y, 'thunder_prison_1')
          .setDepth(14).setScale(2.5).setTint(prisonTint).play('thunder_prison_anim')
        this.tweens.add({ targets: cage, scale: 3.0, alpha: 0, duration: 600, onComplete: () => cage.destroy() })
      }
      const inRange = this.enemies.filter((e) => e.alive
        && Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y) < 220)
      const targets: Array<{ x: number; y: number; e?: Enemy }> = inRange.slice(0, 7)
        .map((e) => ({ x: e.x, y: e.y, e }))
      while (targets.length < 7) {
        const ang = (targets.length / 7) * Math.PI * 2
        const r = 80 + randInt(this.rng, -20, 20)
        targets.push({
          x: p.sprite.x + Math.cos(ang) * r,
          y: p.sprite.y + Math.sin(ang) * r,
        })
      }
      for (const t of targets) {
        // 从天而降的雷柱
        this.lightningFx(t.x + randInt(this.rng, -15, 15), t.y - 200, t.x, t.y, artPalette)
        // 雷柱之间的横向连接形成牢笼
        const next = targets[(targets.indexOf(t) + 1) % targets.length]
        this.lightningFx(t.x, t.y, next.x, next.y, artPalette)
        if (t.e) {
          this.dealDamage(t.e, power * 0.85, stats, true)
          t.e.applySlow(3000, time)
        }
      }
      // 天牢中心闪光
      const flash = this.add.rectangle(p.sprite.x, p.sprite.y, 200, 200, prisonTint, 0.15)
        .setDepth(14)
      this.tweens.add({ targets: flash, alpha: 0, duration: 400, onComplete: () => flash.destroy() })
      // 天牢中心紫色粒子爆发
      this.emitParticles(p.sprite.x, p.sprite.y, 8, prisonTint, 35, 15, 2.5, 300)
      this.emitRing(p.sprite.x, p.sprite.y, prisonTint, 50, 13, 0.4, 350)
      this.cameras.main.shake(90, 0.006)
    } else if (resolved.mode === 'meteor_storm') {
      // 陨石天降：陨石轰击全场，使用 fx_meteor 贴图
      const msLevel = resolved.source === 'set' ? 1 : (artId ? (this.state.skills[artId] ?? 1) : 1)
      const msCount = msLevel >= 5 ? 8 : msLevel >= 3 ? 6 : 5
      const meteorTint = paletteV1Tint(artPalette, 'primary') ?? 0xff8c32
      const inRange = this.enemies.filter((e) => e.alive
        && Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y) < 280)
      const targets: Array<{ x: number; y: number; e?: Enemy }> = inRange.slice(0, msCount).map((e) => ({ x: e.x, y: e.y, e }))
      while (targets.length < msCount) {
        targets.push({ x: p.sprite.x + randInt(this.rng, -120, 120), y: p.sprite.y + randInt(this.rng, -120, 120) })
      }
      for (const t of targets) {
        if (this.textures.exists('fx_meteor_1')) {
          const spr = this.add.sprite(t.x, t.y, 'fx_meteor_1').setDepth(14).setScale(1.2).setTint(meteorTint).play('fx_meteor')
          this.tweens.add({ targets: spr, scale: 1.5, alpha: 0, duration: 600, onComplete: () => spr.destroy() })
        }
        this.burstFx('fx_splash', t.x, t.y, { depth: 15, peakScale: 1.5, alpha: 0.85, tint: 0xff6622 }, { scale: 0.3, toScale: 1.4, duration: 300 }, artPalette)
        // 每个陨石落点橙红色粒子飞溅
        this.emitParticles(t.x, t.y, 6, 0xff6622, 25, 15, 2.5, 250)
        if (t.e) this.dealDamage(t.e, power, stats, true)
      }
      this.cameras.main.shake(100, 0.008)
      if (msLevel >= 3) {
        // Lv3+：施放时橙色冲击波
        this.emitRing(p.sprite.x, p.sprite.y, 0xff8c32, 55, 13, 0.4, 300)
      }
      if (msLevel >= 5) {
        // Lv5：大范围碎片飞溅
        this.emitRing(p.sprite.x, p.sprite.y, 0xff4400, 80, 12, 0.5, 400)
        this.emitParticles(p.sprite.x, p.sprite.y, 12, 0xff8c32, 50, 16, 3, 400)
      }
    } else if (resolved.mode === 'void_rift') {
      // 虚空裂隙：暗紫裂隙范围伤害，使用 fx_void 贴图
      const riftTint = paletteV1Tint(artPalette, 'highlight') ?? 0x3c0050
      if (this.textures.exists('fx_void_1')) {
        const spr = this.add.sprite(p.sprite.x, p.sprite.y, 'fx_void_1').setDepth(14).setScale(2.0).setTint(riftTint).play('fx_void')
        this.tweens.add({ targets: spr, scale: 2.5, alpha: 0, duration: 700, onComplete: () => spr.destroy() })
      }
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y)
        if (dist < 160 + (e.isBoss ? 16 : 0)) this.dealDamage(e, power, stats, true)
      }
      this.emitParticles(p.sprite.x, p.sprite.y, 8, riftTint, 40, 14, 2.5, 300)
      this.emitRing(p.sprite.x, p.sprite.y, riftTint, 50, 13, 0.4, 350)
      this.cameras.main.shake(80, 0.006)
    } else if (resolved.mode === 'blood_domain') {
      // 血域降临：范围生命汲取，使用 fx_blood 贴图
      const bloodTint = paletteV1Tint(artPalette, 'primary') ?? 0xa01428
      if (this.textures.exists('fx_blood_1')) {
        const spr = this.add.sprite(p.sprite.x, p.sprite.y, 'fx_blood_1').setDepth(13).setScale(2.2).setTint(bloodTint).play('fx_blood')
        this.tweens.add({ targets: spr, scale: 2.8, alpha: 0, duration: 600, onComplete: () => spr.destroy() })
      }
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y)
        if (dist < 150 + (e.isBoss ? 16 : 0)) this.dealDamage(e, power * 0.8, stats, true)
      }
      this.emitParticles(p.sprite.x, p.sprite.y, 8, bloodTint, 35, 14, 2.5, 300)
      this.emitRing(p.sprite.x, p.sprite.y, bloodTint, 45, 13, 0.4, 300)
      this.cameras.main.shake(60, 0.004)
    } else if (resolved.mode === 'light_pillar') {
      // 圣光审判：四道光柱轰击，使用 fx_pillar 贴图
      const pillarTint = paletteV1Tint(artPalette, 'highlight') ?? 0xffe678
      const inRange = this.enemies.filter((e) => e.alive
        && Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y) < 240)
      const targets: Array<{ x: number; y: number; e?: Enemy }> = inRange.slice(0, 4).map((e) => ({ x: e.x, y: e.y, e }))
      while (targets.length < 4) {
        targets.push({ x: p.sprite.x + randInt(this.rng, -100, 100), y: p.sprite.y + randInt(this.rng, -100, 100) })
      }
      for (const t of targets) {
        if (this.textures.exists('fx_pillar_1')) {
          const spr = this.add.sprite(t.x, t.y, 'fx_pillar_1').setDepth(14).setScale(1.0).setTint(pillarTint).play('fx_pillar')
          this.tweens.add({ targets: spr, alpha: 0, duration: 500, onComplete: () => spr.destroy() })
        }
        if (t.e) this.dealDamage(t.e, power, stats, true)
      }
      this.cameras.main.shake(80, 0.006)
    } else if (resolved.mode === 'frozen_domain') {
      // 冰封领域：范围冻结，使用 fx_frozen 贴图
      const frozenTint = paletteV1Tint(artPalette, 'primary') ?? 0x96dcff
      if (this.textures.exists('fx_frozen_1')) {
        const spr = this.add.sprite(p.sprite.x, p.sprite.y, 'fx_frozen_1').setDepth(13).setScale(2.0).setTint(frozenTint).play('fx_frozen')
        this.tweens.add({ targets: spr, scale: 2.5, alpha: 0, duration: 600, onComplete: () => spr.destroy() })
      }
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y)
        if (dist < 150 + (e.isBoss ? 16 : 0)) {
          this.dealDamage(e, power * 0.9, stats, true)
          e.applySlow(3000, time)
        }
      }
      this.emitParticles(p.sprite.x, p.sprite.y, 8, frozenTint, 35, 14, 2.5, 300)
      this.emitRing(p.sprite.x, p.sprite.y, frozenTint, 45, 13, 0.4, 300)
      this.cameras.main.shake(60, 0.004)
    } else if (resolved.mode === 'spirit_vortex') {
      // 元神风暴：灵力旋涡范围伤害，使用 fx_vortex 贴图
      const vortexTint = paletteV1Tint(artPalette, 'highlight') ?? 0xc8b4ff
      if (this.textures.exists('fx_vortex_1')) {
        const spr = this.add.sprite(p.sprite.x, p.sprite.y, 'fx_vortex_1').setDepth(13).setScale(1.8).setTint(vortexTint).play('fx_vortex')
        this.tweens.add({ targets: spr, scale: 2.5, alpha: 0, duration: 700, onComplete: () => spr.destroy() })
      }
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y)
        if (dist < 160 + (e.isBoss ? 16 : 0)) this.dealDamage(e, power * 0.7, stats, true)
      }
      this.emitParticles(p.sprite.x, p.sprite.y, 8, vortexTint, 35, 14, 2.5, 300)
      this.emitRing(p.sprite.x, p.sprite.y, vortexTint, 50, 13, 0.4, 350)
      this.cameras.main.shake(70, 0.005)
    } else if (resolved.mode === 'blade_orbit') {
      // 剑环万象：飞剑环绕范围伤害，使用 fx_orbit 贴图
      const orbitTint = paletteV1Tint(artPalette, 'highlight') ?? 0xa0c8ff
      if (this.textures.exists('fx_orbit_1')) {
        const spr = this.add.sprite(p.sprite.x, p.sprite.y, 'fx_orbit_1').setDepth(13).setScale(1.5).setTint(orbitTint).play('fx_orbit')
        this.tweens.add({ targets: spr, scale: 2.0, alpha: 0, duration: 600, onComplete: () => spr.destroy() })
      }
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y)
        if (dist < 120 + (e.isBoss ? 16 : 0)) this.dealDamage(e, power, stats, true)
      }
      this.cameras.main.shake(50, 0.003)
    } else if (resolved.mode === 'poison_cloud') {
      // 万毒瘴气：范围中毒减速，使用 fx_poison 贴图
      const poisonTint = paletteV1Tint(artPalette, 'primary') ?? 0x64a030
      if (this.textures.exists('fx_poison_1')) {
        const spr = this.add.sprite(p.sprite.x, p.sprite.y, 'fx_poison_1').setDepth(13).setScale(2.0).setTint(poisonTint).play('fx_poison')
        this.tweens.add({ targets: spr, scale: 2.5, alpha: 0, duration: 600, onComplete: () => spr.destroy() })
      }
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y)
        if (dist < 150 + (e.isBoss ? 16 : 0)) {
          this.dealDamage(e, power * 0.8, stats, true)
          e.applySlow(2500, time)
        }
      }
      this.cameras.main.shake(50, 0.003)
    } else if (resolved.mode === 'gravity_crush') {
      // 重力深渊：引力范围伤害+减速，使用 fx_gravity 贴图
      const gravityTint = paletteV1Tint(artPalette, 'highlight') ?? 0x502878
      if (this.textures.exists('fx_gravity_1')) {
        const spr = this.add.sprite(p.sprite.x, p.sprite.y, 'fx_gravity_1').setDepth(13).setScale(1.8).setTint(gravityTint).play('fx_gravity')
        this.tweens.add({ targets: spr, scale: 2.3, alpha: 0, duration: 600, onComplete: () => spr.destroy() })
      }
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y)
        if (dist < 160 + (e.isBoss ? 16 : 0)) {
          this.dealDamage(e, power, stats, true)
          e.applySlow(1500, time)
        }
      }
      this.cameras.main.shake(80, 0.006)
    } else if (resolved.mode === 'phoenix_rebirth') {
      // 凤凰涅槃：全屏火焰伤害，使用 fx_phoenix 贴图
      const phoenixTint = paletteV1Tint(artPalette, 'primary') ?? 0xff641e
      if (this.textures.exists('fx_phoenix_1')) {
        const spr = this.add.sprite(p.sprite.x, p.sprite.y, 'fx_phoenix_1').setDepth(14).setScale(2.0).setTint(phoenixTint).play('fx_phoenix')
        this.tweens.add({ targets: spr, scale: 2.5, alpha: 0, duration: 700, onComplete: () => spr.destroy() })
      }
      for (const e of this.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.x, e.y)
        if (dist < 200 + (e.isBoss ? 16 : 0)) this.dealDamage(e, power, stats, true)
      }
      this.emitParticles(p.sprite.x, p.sprite.y, 12, phoenixTint, 50, 15, 3, 400)
      this.emitRing(p.sprite.x, p.sprite.y, phoenixTint, 65, 13, 0.5, 450)
      this.cameras.main.shake(100, 0.008)
    } else {
      // sword_fan（剑气纵横）：五道扇形剑气，高等级追加多波齐发
      const artLevel = resolved.source === 'set' ? 1 : (artId ? (this.state.skills[artId] ?? 1) : 1)
      const waves = artLevel >= 5 ? 3 : artLevel >= 3 ? 2 : 1
      const swordsPerWave = artLevel >= 4 ? 6 : 5
      for (let w = 0; w < waves; w++) {
        const waveDelay = w * 200
        this.time.delayedCall(waveDelay, () => {
          if (this.over) return
          const halfSpread = swordsPerWave === 6 ? 0.6 : 0.5
          for (let s = 0; s < swordsPerWave; s++) {
            const t = (s / (swordsPerWave - 1) - 0.5) * 2 * halfSpread
            const ang = dirAngle + t + (w > 0 ? (w * 0.15 * (w % 2 === 0 ? 1 : -1)) : 0)
            this.spawnPlayerProj(p.sprite.x, p.sprite.y, ang, power * (w === 0 ? 1 : 0.85), 'sword', false, false, undefined, undefined, undefined, undefined, artVisualContext)
          }
          // 每波发射时金色粒子爆发
          this.emitParticles(p.sprite.x, p.sprite.y, swordsPerWave + 2, 0xffd54a, 30 + w * 8, 14, 2, 200)
          if (w > 0) {
            this.cameras.main.shake(30, 0.002)
            this.emitRing(p.sprite.x, p.sprite.y, 0xffd54a, 40 + w * 10, 13, 0.4, 250)
          }
          if (artLevel >= 5 && w === waves - 1) {
            // Lv5 最终波：金色冲击波
            this.emitRing(p.sprite.x, p.sprite.y, 0xfff3b0, 70, 12, 0.6, 400)
            this.emitParticles(p.sprite.x, p.sprite.y, 12, 0xfff3b0, 50, 13, 3, 400)
          }
        })
      }
    }
    p.sprite.setTintFill(paletteV1Tint(artPalette, 'highlight') ?? 0x9fd8ff)
    this.time.delayedCall(120, () => p.sprite.clearTint())
    p.playCast(time)
    this.cameras.main.shake(70, 0.004)
    sfx('sfx_art')
    toast(resolved.source === 'set' ? `${resolved.displayName}！` : `《${resolved.displayName}》！`, '#af7ac5')
  }

  private onEnemyKilled(e: Enemy) {
    this.runKills++
    this.state.totalKills = (this.state.totalKills ?? 0) + 1
    updateDailyProgress(this.state, 'kills', 1)
    sfx('sfx_die', 0.45)
    if (e.isBoss) sfx('sfx_boss_death', 0.7)
    // 死亡粒子迸发
    this.deathFx(e.x, e.y, e.elite ?? false)
    // 经验与升级
    const ups = gainExp(this.state, e.exp)
    this.floatText(e.x, e.y - 24, `+${e.exp} 经验`, '#9b59b6', 9)
    if (ups > 0) {
      const st = calcStats(this.state)
      this.state.hp = Math.min(st.maxHp, currentHp(this.state) + Math.round(st.maxHp * 0.3))
      this.state.insight += 3 * ups
      sfx('sfx_levelup')
      toast(`升至 Lv.${this.state.level}！悟道 +${3 * ups}，获得天赋点`, '#e8c86a')
    }
    // 难度加成：装备按等效楼层生成，高品质权重提升
    const effFloor = this.floor + this.diff.floorBonus
    if (e.isBoss) {
      this.state.insight += 10
      const stones = randInt(this.rng, 1, 2)
      this.state.materials.tupo = (this.state.materials.tupo ?? 0) + stones
      // Boss 必掉套装部件（无尽妖域随机掉落三套套装 + 机缘套装 + v4 Kit）
      const region = this.getRegion()
      let setId: string
      let v4KitId: KitId | null = null
      if (region.id === 'sy') {
        const r = this.rng()
        if (r < 0.2) {
          v4KitId = V4_KIT_WHITELIST[randInt(this.rng, 0, V4_KIT_WHITELIST.length - 1)]
          setId = v4SetId(v4KitId)
        } else if (r < 0.5) {
          setId = this.pickDynamicSetId()
        } else {
          setId = ['set_qm', 'set_xm', 'set_zx'][randInt(this.rng, 0, 2)]
        }
      } else {
        setId = region.setId
      }
      const piece = rollSetPiece(this.rng, setId, effFloor, this.diff.luck, this.state.level)
      if (piece) this.spawnDrop('equip', e.x + 10, e.y, 0, piece)
      toast(`击败守关魔将！悟道 +10，突破石 +${stones}`, '#e8c86a')
      if (v4KitId) {
        const kit = V4_KIT_ABILITY_MAP.get(v4KitId)
        toast(`天机降临！【${kit?.name ?? v4KitId}】现世`, '#ffd54a')
      }
    }
    // 普通掉落
    const roll = rollDrop(this.rng, e.gold, effFloor, e.isBoss, this.diff.luck, this.diff.gold, this.state.level)
    this.spawnDrop('gold', e.x + randInt(this.rng, -14, 14), e.y + randInt(this.rng, -10, 10), roll.gold)
    if (roll.potion) this.spawnDrop('potion', e.x + randInt(this.rng, -16, 16), e.y + randInt(this.rng, -12, 12), 0)
    if (roll.equip) this.spawnDrop('equip', e.x, e.y, 0, roll.equip)
    // 功法秘籍（难度提升掉率）
    const bookChance = (e.isBoss ? 0.5 : 0.07) + this.diff.luck * 0.003
    if (this.rng() < bookChance) {
      const unlearned = unlearnedSkills(this.state)
      if (unlearned.length > 0) {
        const skillId = unlearned[randInt(this.rng, 0, unlearned.length - 1)]
        this.spawnDrop('book', e.x - 10, e.y + 6, 0, undefined, skillId)
      }
    }
    // 无名古卷：拾取时现场生成一部随机心法（Boss 18% / 精英 10%）
    const scrollChance = e.isBoss ? 0.18 : e.elite ? 0.1 : 0
    if (scrollChance > 0 && this.rng() < scrollChance) {
      this.spawnDrop('book', e.x + 12, e.y - 8, 0, undefined, '__dyn__')
    }
    // 灵草（炼丹材料）：小怪 22%，Boss 保底 2 株
    const herbs = e.isBoss ? 2 : (this.rng() < 0.22 ? 1 : 0)
    if (herbs > 0) {
      this.state.materials.lingcao = (this.state.materials.lingcao ?? 0) + herbs
      this.floatText(e.x, e.y - 34, `+${herbs} 灵草`, '#58d68d', 9)
    }
    // 精英必掉装备（按等效楼层+难度加成）
    if (e.elite) this.spawnDrop('equip', e.x - 8, e.y + 8, 0, rollEquip(this.rng, effFloor, 15 + this.diff.luck, this.state.level))
    saveGame(this.state)
    this.refreshFloorText()

    // 灵兽遭遇与捕获
    if (!e.isBoss && this.state.sect?.buildings?.beast_park && (this.state.sect.buildings.beast_park ?? 0) > 0) {
      const parkLv = this.state.sect.buildings.beast_park
      const beasts = this.state.beasts ?? []
      const cap = beastCapacity(parkLv)
      if (beasts.length < cap) {
        const encounterChance = 0.12 + parkLv * 0.02
        if (this.rng() < encounterChance) {
          const speciesId = randomBeastEncounter(this.rng, this.floor)
          const beast = generateBeast(speciesId, this.rng)
          beast.level = Math.max(1, Math.floor(this.floor * 0.5))
          const sp = BEAST_SPECIES_MAP.get(speciesId) ?? BEAST_SPECIES[0]
          const mult = 1 + beast.level * 0.08
          beast.atk = Math.floor(sp.baseAtk * mult)
          beast.def = Math.floor(sp.baseDef * mult)
          beast.maxHp = Math.floor(sp.baseHp * mult)
          beast.hp = beast.maxHp
          beast.speed = Math.floor(sp.baseSpeed * (1 + beast.level * 0.02))
          beast.expToNext = 50 + beast.level * 30 + beast.level * beast.level * 10
          const rate = captureRate(beast, parkLv)
          this.time.delayedCall(600, () => { void this.tryCaptureBeast(beast, rate) })
        }
      }
    }
  }

  private async tryCaptureBeast(beast: Beast, rate: number) {
    const ratePct = Math.floor(rate * 100)
    const choice = await showDialog('灵兽遭遇', [
      `发现了一只野生 ${beast.name}！`,
      `品质：${RARITY_NAMES[beast.rarity]}  属性：${ELEMENT_NAMES[beast.element]}`,
      `等级 Lv.${beast.level}  攻击 ${beast.atk}  防御 ${beast.def}`,
      `气血 ${beast.maxHp}  速度 ${beast.speed}`,
      `捕获成功率：${ratePct}%`,
    ], [
      { label: `尝试捕获（${ratePct}%）`, value: 'capture' },
      { label: '放弃', value: 'skip' },
    ])
    if (choice === 'capture') {
      if (this.rng() < rate) {
        this.state.beasts.push(beast)
        saveGame(this.state)
        sfx('sfx_pickup')
        toast(`成功捕获 ${beast.name}！`, RARITY_COLORS[beast.rarity])
      } else {
        toast(`${beast.name}逃脱了……`, '#f0c987')
      }
    }
    input.clearQueues()
  }

  /** 无尽妖域机缘套装：优先补齐已有套装，否则生成新套（上限 12 套） */
  private pickDynamicSetId(): string {
    const sets = this.state.dynamicSets ?? []
    if (sets.length > 0 && (sets.length >= 12 || this.rng() < 0.6)) {
      return sets[randInt(this.rng, 0, sets.length - 1)].set.id
    }
    // 掉落实例将种子与完整结果共同落盘：读档不重掷，调试时可精确重放。
    const seed = Math.floor(this.rng() * 0x100000000) >>> 0
    const rec = genDynamicSetFromSeed(seed, nextDynamicSetSequence(sets), sets)
    this.state.dynamicSets = [...sets, rec]
    registerDynamicContent([rec], [])
    toast(`天机降临！机缘套装【${rec.set.name}】现世`, '#ffd54a')
    return rec.set.id
  }

  private spawnDrop(kind: Drop['kind'], x: number, y: number, gold: number, item?: EquipItem, skillId?: string) {
    const tex = kind === 'gold' ? 'd_gold' : kind === 'potion' ? 'd_potion' : kind === 'book' ? 'd_book' : 'd_equip'
    const spr = this.add.image(x, y, tex).setDepth(5)
    if (kind === 'equip' && item) {
      spr.setTint(QUALITY_COLORS[item.quality])
      const beam = this.add.image(x, y - 10, 'd_equip').setDepth(4).setTint(QUALITY_COLORS[item.quality]).setAlpha(0.35).setScale(0.6, 2.2)
      this.tweens.add({ targets: beam, alpha: 0.15, duration: 500, yoyo: true, repeat: -1 })
      spr.setData('beam', beam)
      // 高品质装备掉落音效
      if (item.quality >= 4) sfx('sfx_drop_legend', 0.6)
      else if (item.quality >= 3) sfx('sfx_drop_epic', 0.5)
      else if (item.quality >= 2) sfx('sfx_drop_rare', 0.4)
    }
    if (kind === 'book') {
      this.tweens.add({ targets: spr, y: y - 3, duration: 500, yoyo: true, repeat: -1 })
    }
    this.drops.push({ spr, kind, gold, item, skillId, bornAt: this.time.now })
  }

  private damagePlayer(rawAtk: number, fromX: number, fromY: number) {
    if (this.over || this.time.now < this.player.hurtUntil) return
    const stats = calcStats(this.state)
    let dmg = Math.max(1, Math.round(rawAtk * (0.9 + Math.random() * 0.2) * (1 - this.formationDmgReduce) - stats.def * 0.7))
    // 黄龙山金雷护盾：优先吸收伤害
    if (this.shieldHp > 0) {
      const absorbed = Math.min(this.shieldHp, dmg)
      this.shieldHp -= absorbed
      dmg -= absorbed
      if (dmg <= 0) {
        this.player.hurtUntil = this.time.now + 400
        this.floatText(this.player.sprite.x, this.player.sprite.y - 14, '护盾抵挡', '#ffd54a', 10)
        sfx('sfx_hit', 0.4)
        return
      }
    }
    this.state.hp = Math.max(0, currentHp(this.state) - dmg)
    this.player.hurtUntil = this.time.now + 650
    this.player.sprite.setTintFill(0xff5555)
    this.time.delayedCall(90, () => this.player.sprite.clearTint())
    this.player.playHit(this.time.now)
    const kb = new Phaser.Math.Vector2(this.player.sprite.x - fromX, this.player.sprite.y - fromY).normalize().scale(140)
    this.player.sprite.setVelocity(kb.x, kb.y)
    this.floatText(this.player.sprite.x, this.player.sprite.y - 14, `-${dmg}`, '#ff6b6b', 11)
    this.cameras.main.shake(90, 0.004)
    this.cameras.main.flash(120, 120, 0, 0)
    sfx('sfx_hit', 0.55)
    if (this.state.hp <= 0) this.onDeath()
  }

  private spawnProj(x: number, y: number, angle: number, atk: number) {
    // proj.png 默认朝下方（尖朝下），需 +90° 使其朝右，与动画版对齐
    const rotOffset = this.hasCompleteSequenceAnimationPlayback('proj_fly') ? 0 : Math.PI / 2
    const spr = this.hasCompleteSequenceAnimationPlayback('proj_fly')
      ? this.add.sprite(x, y, 'proj_fly_1').setDepth(8).setRotation(angle).setScale(0.38).play('proj_fly')
      : this.add.image(x, y, 'proj').setDepth(8).setRotation(angle + rotOffset)
    const v = 150
    this.physics.add.existing(spr)
    const body = spr.body as Phaser.Physics.Arcade.Body
    body.setAllowGravity(false)
    body.setSize(8, 8)  // 锁定判定体积：动画帧 48×48 的 body 缩回静态 proj 的 8×8（spec §4.7）
    body.setVelocity(Math.cos(angle) * v, Math.sin(angle) * v)
    this.projs.push({ spr, atk, bornAt: this.time.now })
  }

  /** 敌人释放神通（仙界敌人复用玩家招式/神通效果） */
  private spawnEnemyArt(enemyId: string, artMode: string, x: number, y: number, atk: number, tx: number, ty: number) {
    const angleToTarget = Phaser.Math.Angle.Between(x, y, tx, ty)
    const artPower = atk * 0.8 // 神通威力为普攻的 80%

    switch (artMode) {
      case 'sword_fan': {
        // 剑扇：扇形发射 5 把飞剑
        const count = 5
        const spread = Math.PI / 3 // 60度扇形
        for (let i = 0; i < count; i++) {
          const ang = angleToTarget + (i - (count - 1) / 2) * (spread / (count - 1))
          this.spawnXianProj(x, y, ang, artPower, 'flying_sword')
        }
        // 施法特效
        this.burstFx('fx_ring', x, y, { depth: 12, peakScale: 1.2, alpha: 0.5, tint: 0xccddee }, { scale: 0.3, toScale: 1.0, duration: 250 })
        break
      }
      case 'fire_rain': {
        // 火雨：从目标上空落下 6 发火焰弹
        const count = 6
        for (let i = 0; i < count; i++) {
          const offsetX = (Math.random() - 0.5) * 80
          const offsetY = (Math.random() - 0.5) * 60
          const startX = tx + offsetX
          const startY = ty - 120 - Math.random() * 40
          const ang = Phaser.Math.Angle.Between(startX, startY, tx + offsetX, ty + offsetY)
          this.spawnXianProj(startX, startY, ang, artPower * 0.7, 'magic_bolt')
        }
        this.burstFx('fx_splash', x, y, { depth: 12, peakScale: 1.0, alpha: 0.6, tint: 0xff6622 }, { scale: 0.3, toScale: 1.2, duration: 300 })
        break
      }
      case 'thunder_strike': {
        // 雷击：在目标位置降下雷电
        const strikeX = tx + (Math.random() - 0.5) * 30
        const strikeY = ty
        // 雷电特效
        if (this.anims.exists('thunder_prison_anim')) {
          const lightning = this.add.sprite(strikeX, strikeY - 20, 'thunder_prison_1')
            .setDepth(13).setScale(0.8).play('thunder_prison_anim')
          this.time.delayedCall(400, () => lightning.destroy())
        } else {
          // 兜底：用图形绘制
          const lightning = this.add.line(0, 0, strikeX, strikeY - 100, strikeX, strikeY, 0xb39dff, 0.8).setDepth(13).setLineWidth(3)
          this.tweens.add({ targets: lightning, alpha: 0, duration: 300, onComplete: () => lightning.destroy() })
        }
        // 范围伤害
        const dist = Phaser.Math.Distance.Between(strikeX, strikeY, this.player.sprite.x, this.player.sprite.y)
        if (dist < 30) {
          this.damagePlayer(artPower, strikeX, strikeY)
        }
        // 爆裂特效
        this.burstFx('fx_splash', strikeX, strikeY, { depth: 14, peakScale: 1.3, alpha: 0.7, tint: 0xb39dff }, { scale: 0.3, toScale: 1.3, duration: 250 })
        this.emitParticles(strikeX, strikeY, 8, 0xb39dff, 25, 14, 2, 300)
        this.cameras.main.shake(100, 0.002)
        break
      }
      case 'dageng': {
        // 大庚剑阵：召唤 4 把飞剑环绕并朝玩家射出
        const count = 4
        for (let i = 0; i < count; i++) {
          const startAngle = angleToTarget + (i / count) * Math.PI * 2
          const startDist = 40
          const sx = x + Math.cos(startAngle) * startDist
          const sy = y + Math.sin(startAngle) * startDist
          // 延迟发射，先环绕再射出
          this.time.delayedCall(i * 100, () => {
            const ang = Phaser.Math.Angle.Between(sx, sy, this.player.sprite.x, this.player.sprite.y)
            this.spawnXianProj(sx, sy, ang, artPower * 0.9, 'giant_sword')
          })
        }
        this.burstFx('fx_ring', x, y, { depth: 12, peakScale: 1.5, alpha: 0.5, tint: 0xffd54a }, { scale: 0.3, toScale: 1.5, duration: 400 })
        break
      }
      case 'frost_nova':
      case 'frost_nova_burst': {
        // 冰霜新星：8方向冰弹扩散
        const count = 8
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2
          this.spawnXianProj(x, y, ang, artPower * 0.6, 'frost_nova')
        }
        this.burstFx('fx_ring', x, y, { depth: 12, peakScale: 1.5, alpha: 0.5, tint: 0x88ccff }, { scale: 0.3, toScale: 1.5, duration: 350 })
        break
      }
      case 'whirlwind':
      case 'melee_arc':
      case 'flame_slash': {
        // 近战范围斩击
        const reach = 50
        const dist = Phaser.Math.Distance.Between(x, y, this.player.sprite.x, this.player.sprite.y)
        if (dist < reach) {
          this.damagePlayer(artPower, x, y)
        }
        // 斩击特效
        this.burstFx('fx_spark', x, y, { depth: 12, peakScale: 1.3, alpha: 0.6, tint: 0xffdd88 }, { scale: 0.4, toScale: 1.3, duration: 200 })
        break
      }
      case 'sword_array': {
        // 剑列：发射 3 列飞剑
        const cols = 3
        for (let i = 0; i < cols; i++) {
          const offsetAngle = angleToTarget + (i - 1) * 0.15
          this.spawnXianProj(x, y, offsetAngle, artPower * 0.7, 'sword_array')
        }
        this.burstFx('fx_spark', x, y, { depth: 12, peakScale: 1.0, alpha: 0.7, tint: 0xddddee }, { scale: 0.3, toScale: 1.0, duration: 250 })
        break
      }
      case 'thunder_chain':
      case 'thunder_net': {
        // 雷网：3发雷弹扇形
        const count = 3
        const spread = Math.PI / 4
        for (let i = 0; i < count; i++) {
          const ang = angleToTarget + (i - 1) * (spread / 2)
          this.spawnXianProj(x, y, ang, artPower * 0.7, 'thunder_chain')
        }
        this.burstFx('fx_spark', x, y, { depth: 12, peakScale: 1.0, alpha: 0.6, tint: 0xaa88ff }, { scale: 0.3, toScale: 1.0, duration: 250 })
        break
      }
      default:
        // 未知神通：降级为普通投射物
        this.spawnXianProj(x, y, angleToTarget, artPower, 'magic_bolt')
        break
    }
  }

  /** 仙界敌人专属投射物：根据攻击模式选择不同视觉效果 */
  private spawnXianProj(x: number, y: number, angle: number, atk: number, attackMode: string) {
    let tex = 'proj'
    let scale = 0.4
    let speed = 160
    let tint: number | null = null

    // 根据攻击模式选择投射物外观（优先使用 AI 生成的仙界特效帧）
    let animKey = ''
    switch (attackMode) {
      case 'flying_sword':
      case 'flying_sword_burst':
        tex = this.textures.exists('ai_sword_proj_1') ? 'ai_sword_proj_1' : 'sword_proj_3'
        animKey = 'ai_sword_proj_anim'
        scale = 0.6
        speed = 200
        tint = 0xccddee
        break
      case 'magic_bolt':
        tex = this.textures.exists('ai_bolt_fly_1') ? 'ai_bolt_fly_1' : 'bolt_fly_1'
        animKey = 'ai_bolt_fly_anim'
        scale = 0.45
        speed = 170
        tint = 0xffaa44
        break
      case 'frost_nova':
      case 'frost_nova_burst':
        tex = this.textures.exists('ai_bolt_fly_1') ? 'ai_bolt_fly_1' : 'bolt_fly_1'
        animKey = 'ai_bolt_fly_anim'
        scale = 0.4
        speed = 140
        tint = 0x88ccff
        break
      case 'thunder_chain':
        tex = this.textures.exists('ai_bolt_fly_1') ? 'ai_bolt_fly_1' : 'bolt_fly_1'
        animKey = 'ai_bolt_fly_anim'
        scale = 0.5
        speed = 220
        tint = 0xaa88ff
        break
      case 'giant_sword':
        tex = this.textures.exists('ai_sword_proj_1') ? 'ai_sword_proj_1' : 'sword_proj_3'
        animKey = 'ai_sword_proj_anim'
        scale = 1.0
        speed = 130
        tint = 0xffdd88
        break
      case 'sword_array':
        tex = this.textures.exists('ai_sword_proj_1') ? 'ai_sword_proj_1' : 'sword_proj_3'
        animKey = 'ai_sword_proj_anim'
        scale = 0.55
        speed = 180
        tint = 0xddddee
        break
      case 'whirlwind':
      case 'melee_arc':
      case 'flame_slash':
      case 'flying_sword_split':
        // 近战型不发射投射物
        return
      case 'bolt_dart':
        tex = this.textures.exists('proj_fly_1') ? 'proj_fly_1' : 'proj'
        animKey = 'proj_fly'
        scale = 0.4
        speed = 200
        tint = 0xd8a8ff
        break
      case 'thunder_net':
        tex = this.textures.exists('ai_mod_1') ? 'ai_mod_1' : 'proj'
        animKey = 'ai_mod_anim'
        scale = 0.5
        speed = 180
        tint = 0xb39dff
        break
      default:
        tex = 'proj'
        break
    }

    // 优先使用 AI 动画特效，不存在则降级
    const useAnim = animKey && this.anims.exists(animKey)
    // 根据贴图类型获取方向偏移
    let rotOff = 0
    if (tex.startsWith('ai_sword_proj')) rotOff = PROJ_ROT_OFFSETS['ai_sword_proj']
    else if (tex.startsWith('sword_proj')) rotOff = 0
    else if (tex.startsWith('ai_bolt_fly')) rotOff = PROJ_ROT_OFFSETS['ai_bolt_fly']
    else if (tex.startsWith('bolt_fly')) rotOff = 0
    else if (tex.startsWith('proj_fly')) rotOff = 0
    else if (tex === 'proj') rotOff = PROJ_ROT_OFFSETS['proj']
    const spr = useAnim
      ? this.add.sprite(x, y, tex).setDepth(8).setRotation(angle + rotOff).setScale(scale).play(animKey)
      : this.textures.exists(tex)
        ? this.add.image(x, y, tex).setDepth(8).setRotation(angle + rotOff).setScale(scale)
        : this.add.image(x, y, 'proj').setDepth(8).setRotation(angle + PROJ_ROT_OFFSETS['proj']).setScale(scale)

    if (tint && !useAnim) spr.setTint(tint)

    this.physics.add.existing(spr)
    const body = spr.body as Phaser.Physics.Arcade.Body
    body.setAllowGravity(false)
    body.setSize(8, 8)
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed)
    this.projs.push({ spr, atk, bornAt: this.time.now })
  }

  private onDeath() {
    this.over = true
    this.player.halt()
    const lost = Math.floor(this.runGold / 2)
    this.state.gold = Math.max(0, this.state.gold - lost)
    saveGame(this.state)
    if (this.arenaMode) {
      showResult('擂台落败', [
        `你在擂台中被击败，未能通过考验。`,
        `<span class="dim">段位保持在【${RANK_NAMES[this.arenaRank]}】，休整后再战。</span>`,
      ], '返回天枢城', () => {
        this.state.hp = -1
        this.scene.start('City')
      })
      return
    }
    if (this.npcCombatMode) {
      const combatData = this.registry.get('npcCombatData') as any
      if (combatData) {
        combatData.victory = false
        this.registry.set('npcCombatData', combatData)
      }
      showResult('战斗失利', [
        `你未能击败对方，铩羽而归。`,
        `<span class="dim">遗失灵石 ${lost}。</span>`,
      ], '返回大地图', () => {
        this.state.hp = -1
        saveGame(this.state)
        this.cameras.main.fadeOut(400, 0, 0, 0)
        this.time.delayedCall(420, () => this.scene.start('World'))
      })
      return
    }
    if (this.xianMode) {
      const xianFloor = xianFloorDisplay(this.floor)
      showResult('仙途折戟', [
        `你在仙界第 ${xianFloor} 重被击败，仙力溃散坠回凡尘。`,
        `<span class="dim">本次仙旅击败 ${this.runKills} 名仙兵灵兽，遗失灵石 ${lost}。</span>`,
        `<span class="dim">境界、功法与装备已保留，休整后再登仙途。</span>`,
      ], '返回洞府', () => {
        this.state.hp = -1
        this.scene.start('Town')
      })
      return
    }
    if (this.ladderMode) {
      if (this.floor > this.state.ladderMaxFloor) {
        this.state.ladderMaxFloor = this.floor
      }
      saveGame(this.state)
      showResult('天梯折戟', [
        `你在天梯第 ${this.floor} 层被击败，坠落凡尘。`,
        `<span class="dim">本次挑战击败 ${this.runKills} 只敌人，遗失灵石 ${lost}。</span>`,
        `<span class="dim">历史最高：第 ${this.state.ladderMaxFloor} 层。可从第 ${this.state.ladderFloor} 层继续挑战。</span>`,
      ], '返回洞府', () => {
        this.state.hp = -1
        this.scene.start('Town')
      })
      return
    }
    showResult('重伤倒地', [
      `你被击倒了，同道将你抬回了洞府。`,
      `<span class="dim">本次探索击杀 ${this.runKills} 只魔兽，遗失灵石 ${lost}。</span>`,
      `<span class="dim">等级、功法与装备已保留，休整后再战。</span>`,
    ], '返回洞府', () => {
      this.state.hp = -1
      this.scene.start('Town')
    })
  }

  private onFloorCleared() {
    // 天梯模式：无通关上限，每层都开传送门，发放奖励
    if (this.ladderMode) {
      if (this.floor > this.state.ladderMaxFloor) {
        this.state.ladderMaxFloor = this.floor
      }
      this.state.ladderFloor = this.floor + 1
      const reward = ladderReward(this.floor)
      this.state.gold += reward.gold
      this.runGold += reward.gold
      if (reward.materials > 0) {
        this.state.materials.tupo = (this.state.materials.tupo ?? 0) + reward.materials
      }
      saveGame(this.state)
      this.portal = this.add.sprite(this.level.portal.x, this.level.portal.y, 'portal').setDepth(3)
      this.tweens.add({ targets: this.portal, alpha: 0.5, duration: 600, yoyo: true, repeat: -1 })
      const bossTag = (this.floor + 1) % LADDER.bossInterval === 0 ? ' · ☯BOSS层' : ''
      this.add.text(this.level.portal.x, this.level.portal.y - 22, `通往第 ${this.floor + 1} 层${bossTag}`, { fontSize: '9px', color: '#c8a2ff' }).setOrigin(0.5).setDepth(3)
      toast(`天梯第 ${this.floor} 层已肃清！灵石 +${reward.gold}${reward.materials > 0 ? ` · 突破石 +${reward.materials}` : ''}`, '#c8a2ff')
      return
    }
    const region = this.getRegion()
    // 域特色秘境：按相对楼层判断是否通关
    if (this.regionOverrideId && this.getRegionFloor() >= this.regionMaxFloors) {
      this.over = true
      this.state.totalDungeonClears = (this.state.totalDungeonClears ?? 0) + 1
      this.state.totalGoldEarned = (this.state.totalGoldEarned ?? 0) + this.runGold
      checkAchievements(this.state)
      updateDailyProgress(this.state, 'dungeon_clear', 1)
      updateDailyProgress(this.state, 'gold_earn', this.runGold)
      const items = this.runItems.length > 0 ? this.runItems.join('、') : '无'
      showResult(`通关 · ${region.name}`, [
        `此地秘境已肃清，妖气暂散！`,
        `<span class="dim">击杀 ${this.runKills} · 斩获灵石 ${this.runGold}</span>`,
        `<span class="dim">装备：${items}</span>`,
      ], '返回大地图', () => {
        saveGame(this.state)
        this.cameras.main.fadeOut(400, 0, 0, 0)
        this.time.delayedCall(420, () => this.scene.start('World'))
      })
      return
    }
    if (!this.regionOverrideId && this.floor >= region.floors[1]) {
      this.over = true
      this.state.totalDungeonClears = (this.state.totalDungeonClears ?? 0) + 1
      this.state.totalGoldEarned = (this.state.totalGoldEarned ?? 0) + this.runGold
      checkAchievements(this.state)
      updateDailyProgress(this.state, 'dungeon_clear', 1)
      updateDailyProgress(this.state, 'gold_earn', this.runGold)
      if (region.id === 'qm' && !this.state.progress.qmCleared) {
        this.state.progress.qmCleared = true
        toast('新地区「幽冥沼泽」已解锁！', '#c58fff')
      }
      if (region.id === 'ym' && !this.state.progress.ymCleared) {
        this.state.progress.ymCleared = true
        toast('「无尽妖域」已解锁！挑战没有尽头……', '#c58fff')
      }
      const items = this.runItems.length > 0 ? this.runItems.join('、') : '无'
      showResult(`通关 · ${region.name}`, [
        `守关魔将已伏诛，此地妖气暂散！`,
        `<span class="dim">击杀 ${this.runKills} · 斩获灵石 ${this.runGold}</span>`,
        `<span class="dim">装备：${items}</span>`,
      ], '返回洞府', () => {
        saveGame(this.state)
        this.cameras.main.fadeOut(400, 0, 0, 0)
        this.time.delayedCall(420, () => this.scene.start('Town'))
      })
      return
    }
    this.portal = this.add.sprite(this.level.portal.x, this.level.portal.y, this.xianMode && this.textures.exists('portal_xian') ? 'portal_xian' : 'portal').setDepth(3)
    this.tweens.add({ targets: this.portal, alpha: 0.5, duration: 600, yoyo: true, repeat: -1 })
    const portalText = this.xianMode
      ? `通往第 ${xianFloorDisplay(this.floor + 1)} 重`
      : this.regionOverrideId
        ? `通往第 ${this.getRegionFloor() + 1} 层`
        : `通往第 ${this.floor + 1} 层`
    this.add.text(this.level.portal.x, this.level.portal.y - 22, portalText, { fontSize: '9px', color: this.xianMode ? '#aaddff' : '#a3e4d7' }).setOrigin(0.5).setDepth(3)
    toast(this.xianMode ? '仙兵已伏，登仙路开！' : '本层已肃清，传送门开启！', this.xianMode ? '#aaddff' : '#48c9b0')
  }

  private floatText(x: number, y: number, text: string, color: string, size: number) {
    const t = this.add.text(x, y, text, { fontSize: `${size}px`, color, fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(20)
    if (size >= 13) {
      // 暴击/大号文字弹跳放大
      t.setScale(0.3)
      this.tweens.add({
        targets: t, scale: 1, duration: 120, ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: t, y: y - 22, alpha: 0, duration: 550, ease: 'Cubic.easeOut',
            onComplete: () => t.destroy(),
          })
        },
      })
    } else {
      this.tweens.add({
        targets: t, y: y - 18, alpha: 0, duration: 650, ease: 'Cubic.easeOut',
        onComplete: () => t.destroy(),
      })
    }
  }

  // ---------- 主循环 ----------
  update(time: number, delta: number) {
    input.poll()

    // 水波纹动画（每 250ms 切换一帧，4 帧循环）
    if (this.waterTiles.length > 0) {
      this.waterTimer += 16 // 近似帧间隔
      if (this.waterTimer >= 250) {
        this.waterTimer = 0
        this.waterFrame = (this.waterFrame + 1) % 4
        const region = this.hlMode ? regionOfFloor(2) : this.getRegion()
        const frameKey = `terrain_${region.terrainPrefix}_water_${this.waterFrame + 1}`
        if (this.textures.exists(frameKey)) {
          for (const w of this.waterTiles) w.setTexture(frameKey)
        }
      }
    }

    if (input.consumeBag()) {
      if (panelOpen()) { if (!modalPanel()) closePanel() }
      else { this.player.halt(); openInventory() }
    }
    if (input.consumeRetreat()) this.retreatFlow()
    if (input.consumeSettings()) { if (!panelOpen()) { this.player.halt(); openSettings() } }
    if (panelOpen() || dialogOpen()) { this.player.halt(); return }
    if (this.over) return

    const stats = calcStats(this.state)
    // 水域减速（玩家踩水 -45% 速度）
    if (tileAtPixel(this.level, this.player.sprite.x, this.player.sprite.y) === T_WATER) {
      stats.speed = Math.round(stats.speed * 0.55)
    }
    this.player.move(input, stats, time, delta)

    // 防穿墙：碰撞体被怪物/击退挤进实心瓦片时，回拉到最近安全位置
    // 使用身体中心检测，避免边界误判导致频繁卡墙
    {
      const body = this.player.sprite.body as Phaser.Physics.Arcade.Body
      const px = this.player.sprite.x
      const py = this.player.sprite.y
      const bcx = body.x + body.width / 2
      const bcy = body.y + body.height / 2
      const solid = isSolidPixel(this.level, bcx, bcy)
      if (solid) {
        this.playerStuckCount++
        if (this.playerStuckCount >= 5 && time > this.playerUnstuckUntil) {
          // 连续卡墙5次以上：启动智能脱困，在周围寻找最近安全点
          this.playerUnstuckUntil = time + 1000
          let found = false
          const searchRadii = [12, 20, 30, 45, 60]
          for (const r of searchRadii) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
              const tx = px + Math.cos(angle) * r
              const ty = py + Math.sin(angle) * r
              if (!isSolidPixel(this.level, tx, ty)) {
                this.player.sprite.setPosition(tx, ty)
                this.player.sprite.setVelocity(0, 0)
                this.lastSafeX = tx
                this.lastSafeY = ty
                found = true
                break
              }
            }
            if (found) break
          }
          // 实在找不到就回出生点
          if (!found) {
            this.player.sprite.setPosition(this.level.spawn.x, this.level.spawn.y)
            this.player.sprite.setVelocity(0, 0)
            this.lastSafeX = this.level.spawn.x
            this.lastSafeY = this.level.spawn.y
          }
          this.playerStuckCount = 0
        } else {
          // 普通回拉
          this.player.sprite.setPosition(this.lastSafeX, this.lastSafeY)
          this.player.sprite.setVelocity(0, 0)
        }
      } else {
        this.playerStuckCount = Math.max(0, this.playerStuckCount - 1)
        this.lastSafeX = px
        this.lastSafeY = py
      }
    }

    // 地图迷雾：跟随玩家视野更新
    if (this.fogSystem) {
      this.fogSystem.updateVisibility(this.player.sprite.x, this.player.sprite.y)
      this.fogSystem.render()
      // 迷雾下隐藏未探索区域的敌人/Boss
      for (const e of this.enemies) {
        if (!e.alive) continue
        const cx = Math.floor((e.sprite.x - OX) / TILE)
        const cy = Math.floor((e.sprite.y - OY) / TILE)
        const vis = this.fogSystem.isVisible(cx, cy)
        e.sprite.setAlpha(vis ? 1 : 0)
        const label = e.sprite.getData('label')
        if (label) label.setAlpha(vis ? 1 : 0)
      }
    }

    // 动态光照更新
    if (this.lightSystem) {
      this.lightSystem.update(this.player.sprite.x, this.player.sprite.y)
    }

    // 吃丹
    if (input.consumePotion()) {
      const hpPill = this.state.consumables?.hp_pill ?? this.state.potions ?? 0
      if (hpPill > 0 && currentHp(this.state) < stats.maxHp) {
        this.state.consumables.hp_pill = (this.state.consumables.hp_pill ?? this.state.potions ?? 0) - 1
        this.state.potions = Math.max(0, (this.state.potions ?? 0) - 1)
        const heal = Math.round(stats.maxHp * 0.4)
        this.state.hp = Math.min(stats.maxHp, currentHp(this.state) + heal)
        sfx('sfx_potion')
        this.floatText(this.player.sprite.x, this.player.sprite.y - 16, `+${heal}`, '#58d68d', 11)
        updateHUD()
      } else if (hpPill <= 0) {
        toast('没有丹药了', '#ff8888')
      }
    }

    // 装备页可在地下城内直接换装：每帧同步标签，避免 fxTags 拘留或延迟到重进场景。
    this.refreshSetFx()
    // v4 charge 原语旁路（P2：hold-attack 键蓄力，松手释放）
    // S4-dyn：动态套装 charge 原语同样走 hold-release 机制
    const v4Ability = resolveAnyKitAbility(this.state)
    if (v4Ability && v4Ability.normalPrimitive === 'charge') {
      input.consumeAttack() // drain：charge 不走 click-to-fire
      const held = input.attackHeld
      if (held && !this.v4ChargeHeld) {
        this.v4ChargeHeld = true
        this.v4ChargeStartMs = time
      } else if (!held && this.v4ChargeHeld) {
        this.v4ChargeHeld = false
        this.doV4NormalAttack(time, v4Ability, time - this.v4ChargeStartMs)
      }
    } else {
      this.v4ChargeHeld = false
      // 攻击 / 神通
      if (input.consumeAttack()) this.doAttack(time)
    }
    if (input.consumeSkill()) this.castArt(time)
    this.updateSkillButton(time)
    // 万剑归宗剑阵（持续技能：旋转/扣血/触敌）
    this.updateSwordArray(time, this.game.loop.delta)
    this.updateDagengOrbit(time, this.game.loop.delta)
    this.updateArrayMine(time)

    // 黄龙山坚守战：兽潮 + 双修士弹幕 + 倒计时
    if (this.hlMode) {
      this.hlWaveTick(time)
      this.hlDuelTick(time)
      this.hlBulletTick(time)
      if (time >= this.hlTextAt) {
        this.hlTextAt = time + 500
        this.refreshFloorText()
      }
      if (time - this.hlStartAt >= HL_DURATION) {
        this.hlVictory()
        return
      }
    }

    // 怪物 AI
    const ctx: CombatCtx = {
      time,
      px: this.player.sprite.x,
      py: this.player.sprite.y,
      damagePlayer: (a, fx, fy) => this.damagePlayer(a, fx, fy),
      spawnProj: (x, y, ang, a) => {
        // 仙界敌人：根据攻击模式发射不同投射物
        if (this.xianMode && ctx.enemyId) {
          const xianDef = XIAN_ENEMY_MAP.get(ctx.enemyId)
          if (xianDef) {
            this.spawnXianProj(x, y, ang, a, xianDef.attackMode)
            return
          }
        }
        this.spawnProj(x, y, ang, a)
      },
      spawnEnemyArt: (enemyId, artMode, x, y, atk, tx, ty) => {
        this.spawnEnemyArt(enemyId, artMode, x, y, atk, tx, ty)
      },
    }
    // 攻击顿帧：冻结怪物 AI（玩家仍可行动，营造打击感）
    const frozen = time < this.hitStopUntil
    for (const e of this.enemies) {
      if (!frozen) e.update(ctx)
      // 越界回拉：被击退/冲撞穿墙或挤出地图时，拉回出生点（必为可行走格）
      if (e.alive && isSolidPixel(this.level, e.x, e.y)) {
        e.sprite.setPosition(e.homeX, e.homeY)
        e.sprite.setVelocity(0, 0)
      }
    }

    // 敌方投射物
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i]
      const out = pr.spr.x < ARENA.x || pr.spr.x > ARENA.x + ARENA.w || pr.spr.y < ARENA.y || pr.spr.y > ARENA.y + ARENA.h
      const hitWall = isSolidPixel(this.level, pr.spr.x, pr.spr.y)
      const hitP = Phaser.Math.Distance.Between(pr.spr.x, pr.spr.y, this.player.sprite.x, this.player.sprite.y) < 12
      if (out || hitWall || time - pr.bornAt > 3200 || hitP) {
        if (hitP) this.damagePlayer(pr.atk, pr.spr.x, pr.spr.y)
        pr.spr.destroy()
        this.projs.splice(i, 1)
      }
    }

    // 玩家投射物（飞剑穿透 / 火弹爆裂 / 巨剑穿墙 / 大庚剑阵索敌）。
    // Snapshot length prevents same-frame children from racing their parent; ascending
    // creationOrder makes first-hit arbitration stable instead of reverse-array incidental.
    const projectileFrame = orderedControlledHitCandidates(this.pprojs)
    for (const pp of projectileFrame) {
      const i = this.pprojs.indexOf(pp)
      if (i < 0) continue
      // 大庚剑气：每帧朝最近的存活敌人重定向（全图索敌）
      if (pp.homing) {
        let best: Enemy | null = null
        let bestD = Infinity
        for (const e of this.enemies) {
          if (!e.alive || pp.hits.has(e)) continue
          const d = Phaser.Math.Distance.Between(pp.spr.x, pp.spr.y, e.x, e.y)
          if (d < bestD) { bestD = d; best = e }
        }
        if (best) {
          const ang = Phaser.Math.Angle.Between(pp.spr.x, pp.spr.y, best.x, best.y)
          const v = Math.hypot(pp.vx, pp.vy)
          pp.vx = Math.cos(ang) * v
          pp.vy = Math.sin(ang) * v
          pp.spr.setRotation(ang)
        }
      }
      pp.spr.x += (pp.vx * this.game.loop.delta) / 1000
      pp.spr.y += (pp.vy * this.game.loop.delta) / 1000
      const out = pp.spr.x < ARENA.x - 8 || pp.spr.x > ARENA.x + ARENA.w + 8 || pp.spr.y < ARENA.y - 8 || pp.spr.y > ARENA.y + ARENA.h + 8
      // 巨剑术/大庚剑气无视碰撞穿墙；巨剑飞 2 秒，大庚索敌剑飞 2.5 秒，其余 1.1 秒撞墙消散
      const lifespan = pp.kind === 'giant' ? 2000 : pp.homing ? 2500 : 1100
      const hitWall = pp.kind !== 'giant' && !pp.homing && isSolidPixel(this.level, pp.spr.x, pp.spr.y)
      if (out || hitWall || time - pp.bornAt > lifespan) {
        this.destroySwordProj(pp.spr)
        this.pprojs.splice(i, 1)
        continue
      }
      const hitRadius = pp.kind === 'giant' ? 30 : 15
      for (const e of this.enemies) {
        if (!e.alive || pp.hits.has(e)) continue
        if (Phaser.Math.Distance.Between(pp.spr.x, pp.spr.y, e.x, e.y) < hitRadius + (e.isBoss ? 8 : 0)) {
          pp.hits.add(e)
          this.dealDamage(e, pp.power, stats, true)
          // v3 controlled first-hit linkage is captured with its attack source at
          // emission time, cooldown-gated, and cannot recurse through derived children.
          // Legacy static tags retain their historical path only when this projectile
          // does not carry a v3 linkage snapshot.
          if (pp.linkage && !pp.derived) {
            this.triggerControlledHitLinkage(pp, time)
          } else if (pp.kind === 'sword' && !pp.split && this.setFx.swordSplit) {
            // Legacy static tags retain their historical color and mechanics;
            // visualContext is undefined on that path, so no v3 palette leaks in.
            playModularOnce(this, 'hit', pp.spr.x, pp.spr.y, { depth: 15, scale: 0.7, tint: paletteV1Tint(pp.visualContext?.palette, 'highlight') ?? 0xcfe8ff })
            if (pp.visualContext) this.paletteOverlay(pp.spr.x, pp.spr.y, pp.visualContext.palette, 'impact', 16)
            for (const child of swordSplitParams(pp.spr.rotation, pp.power)) {
              this.spawnPlayerProj(pp.spr.x, pp.spr.y, child.angle, child.power, 'sword', true, true, undefined, undefined, undefined, undefined, inheritPaletteV1VisualContext(pp.visualContext))
            }
            pp.split = true
          }
          if (pp.kind === 'giant') {
            this.cameras.main.shake(30, 0.002)
            this.lightningFx(pp.spr.x - 14, pp.spr.y - 10, e.x, e.y, pp.visualContext?.palette)
          } else if (pp.homing) {
            // 大庚剑气命中：颜色仅来自神通自己的 art winner palette.
            this.lightningFx(pp.spr.x - 10, pp.spr.y - 12, e.x, e.y, pp.visualContext?.palette)
            this.destroySwordProj(pp.spr)
            this.pprojs.splice(i, 1)
            break
          } else if (pp.kind === 'bolt') {
            // 爆裂：对周围敌人造成 40% 溅射
            const bx = pp.spr.x, by = pp.spr.y
            const fireBurst = fireBurstParams(this.setFx.fireBurst)
            const delayedBurst = delayedBurstParams(this.setFx.delayedBurst)
            if (delayedBurst.enabled) {
              playModularOnce(this, 'rune', bx, by, { depth: 15, scale: 0.7, tint: delayedBurst.tint })
              playModularOnce(this, 'charge', bx, by, { depth: 15, scale: 0.7, tint: delayedBurst.tint })
              this.time.delayedCall(delayedBurst.delay, () => {
                if (this.scene.isActive()) playModularOnce(this, 'burst', bx, by, { depth: 15, scale: 0.85, tint: delayedBurst.tint })
              })
            }
            if (fireBurst.enabled) {
              playModularOnce(this, 'burst', bx, by,
                { depth: 15, scale: 0.85, alpha: 0.8, tint: fireBurst.tint })
            }
            this.burstFx('fx_splash', bx, by,
              { depth: 14, peakScale: 0.85, alpha: 0.8, tint: 0xe67e22 },
              { scale: 0.2, toScale: 0.8, duration: 160 }, pp.visualContext?.palette)
            for (const other of this.enemies) {
              if (!other.alive || other === e) continue
              if (Phaser.Math.Distance.Between(bx, by, other.x, other.y) < fireBurst.radius) {
                this.dealDamage(other, pp.power * 0.4, stats, true, bx, by)
              }
            }
            pp.spr.destroy()
            this.pprojs.splice(i, 1)
            break
          }
        }
      }
    }

    // 道友 AI（剑修近战 / 仙子远程火弹）
    if (this.ally) {
      const target = this.ally.updateAI(time, this.player.sprite.x, this.player.sprite.y, this.enemies)
      if (target) {
        const ang = Phaser.Math.Angle.Between(this.ally.x, this.ally.y, target.x, target.y)
        if (this.ally.ranged) {
          this.spawnPlayerProj(this.ally.x, this.ally.y, ang, this.ally.attackMult, 'bolt')
        } else {
          this.slashFx(this.ally.x, this.ally.y, ang, 1)
          this.dealDamage(target, this.ally.attackMult, stats, false, this.ally.x, this.ally.y)
        }
      }
    }

    // 灵兽宠物 AI
    if (this.petSprite && this.petBeast) {
      const psp = this.player.sprite
      const pdx = psp.x + 16 - this.petSprite.x
      const pdy = psp.y + 8 - this.petSprite.y
      const pdist = Math.hypot(pdx, pdy)
      if (pdist > 4) {
        const speed = 90
        this.petSprite.x += (pdx / pdist) * speed * (delta / 1000)
        this.petSprite.y += (pdy / pdist) * speed * (delta / 1000)
      }
      if (time >= this.petCdUntil) {
        let nearest: Enemy | null = null
        let nearestDist = 80
        for (const e of this.enemies) {
          if (!e.alive) continue
          const d = Phaser.Math.Distance.Between(this.petSprite.x, this.petSprite.y, e.x, e.y)
          if (d < nearestDist) { nearestDist = d; nearest = e }
        }
        if (nearest) {
          const ang = Phaser.Math.Angle.Between(this.petSprite.x, this.petSprite.y, nearest.x, nearest.y)
          this.slashFx(this.petSprite.x, this.petSprite.y, ang, 1)
          this.dealDamage(nearest, 0.6, stats, false, this.petSprite.x, this.petSprite.y)
          this.petCdUntil = time + 800
        }
      }
    }

    // 阵法效果过期清除
    if (this.formationEndTime > 0 && time >= this.formationEndTime) {
      this.formationAtkBonus = 0
      this.formationDmgReduce = 0
      this.formationTrapDmg = 0
      this.formationEndTime = 0
      if (this.formationSprite) {
        this.formationSprite.destroy()
        this.formationSprite = null
      }
      toast(`阵法 ${this.formationName} 效果已结束`, '#94a3b8')
      this.formationName = ''
    }
    // 阵法精灵跟随玩家
    if (this.formationSprite) {
      this.formationSprite.x = this.player.sprite.x
      this.formationSprite.y = this.player.sprite.y + 8
    }
    // 阵法陷阱效果
    if (this.formationTrapDmg > 0) {
      for (const e of this.enemies) {
        if (!e.alive) continue
        const d = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, e.x, e.y)
        if (d < 50 && time % 1000 < 16) {
          e.takeDamage(this.formationTrapDmg, this.player.sprite.x, this.player.sprite.y)
          this.floatText(e.x, e.y - 12, `${this.formationTrapDmg}`, '#a78bfa', 9)
        }
      }
    }

    // 掉落拾取（磁吸）
    const psp = this.player.sprite
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]
      if (!d.spr.active) { this.drops.splice(i, 1); continue }
      const dist = Phaser.Math.Distance.Between(d.spr.x, d.spr.y, psp.x, psp.y)
      if (dist < 64 && time - d.bornAt > 300) {
        const pull = new Phaser.Math.Vector2(psp.x - d.spr.x, psp.y - d.spr.y).normalize().scale(4.2)
        d.spr.x += pull.x; d.spr.y += pull.y
        const beam = d.spr.getData('beam') as Phaser.GameObjects.Image | null
        if (beam) { beam.x = d.spr.x; beam.y = d.spr.y - 10 }
      }
      if (dist < 16) {
        this.collectDrop(d)
        const beam = d.spr.getData('beam') as Phaser.GameObjects.Image | null
        if (beam) beam.destroy()
        d.spr.destroy()
        this.drops.splice(i, 1)
      }
    }

    // 随机事件交互（宝箱 / 祭坛）
    for (const ev of this.floorEvents) {
      if (!ev.spr.active) continue
      const d = Phaser.Math.Distance.Between(ev.spr.x, ev.spr.y, psp.x, psp.y)
      if (ev.used) {
        // 拒绝献祭后：走出触发圈才允许再次交互
        if (ev.rearm && d > 48) { ev.used = false; ev.rearm = false }
        continue
      }
      if (d < 20) {
        if (ev.kind === 'chest') this.openChest(ev)
        else this.useAltar(ev)
      }
    }

    // 清层判定（黄龙山无清层概念，坚守到底）
    if ((this.arenaMode || this.npcCombatMode) && !this.portal && this.enemies.every((e) => !e.alive)) this.onArenaWaveCleared()
    else if (!this.hlMode && !this.arenaMode && !this.npcCombatMode && !this.portal && this.enemies.every((e) => !e.alive)) this.onFloorCleared()

    // 符箓存档点交互（破碎仙宫每 5 重）
    if (this.xianMode && this.talisman && this.talisman.active) {
      const d = Phaser.Math.Distance.Between(psp.x, psp.y, this.talisman.x, this.talisman.y)
      if (d < 22) {
        this.talismanInteract()
      }
    }

    // 传送门
    if (!this.hlMode && this.portal && Phaser.Math.Distance.Between(psp.x, psp.y, this.portal.x, this.portal.y) < 22) {
      this.over = true
      saveGame(this.state)
      sfx('sfx_portal')
      this.cameras.main.fadeOut(300, 0, 0, 0)
      const nextFloor = this.floor + 1
      const mode = this.xianMode ? 'xian' : this.ladderMode ? 'ladder' : undefined
      // 仙界记录最深层
      if (this.xianMode) {
        recordXianDepth(this.state, xianFloorDisplay(nextFloor))
        saveGame(this.state)
      }
      this.time.delayedCall(320, () => this.scene.start('Dungeon', { floor: nextFloor, diff: this.diff.id, mode }))
      return
    }

    updateHUD()
  }

  private updateSkillButton(time: number) {
    const btn = document.getElementById('btnSkill')!
    const override = resolveSetArtOverride(this.state)
    const hasArt = !!this.state.skillSlots.art || !!override
    if (!hasArt) { btn.textContent = '神通'; btn.classList.add('cd'); return }
    const remain = Math.ceil((this.artReadyAt - time) / 1000)
    if (remain > 0) { btn.textContent = String(remain); btn.classList.add('cd') }
    else { btn.textContent = override ? (override.displayName ?? ART_MODE_NAMES[override.mode]) : '神通'; btn.classList.remove('cd') }
  }

  private collectDrop(d: Drop) {
    if (d.kind === 'gold') {
      sfx('sfx_gold_drop', 0.5)
      this.state.gold += d.gold
      this.runGold += d.gold
      this.floatText(d.spr.x, d.spr.y - 8, `+${d.gold} 灵石`, '#f1c40f', 9)
    } else if (d.kind === 'potion') {
      sfx('sfx_pickup', 0.5)
      this.state.potions = (this.state.potions ?? 0) + 1
      this.state.consumables.hp_pill = (this.state.consumables?.hp_pill ?? 0) + 1
      this.floatText(d.spr.x, d.spr.y - 8, '+1 丹药', '#e74c3c', 9)
    } else if (d.kind === 'book' && d.skillId === '__dyn__') {
      sfx('sfx_pickup', 0.5)
      // 无名古卷：现场生成随机心法并习得
      const seq = (this.state.dynamicSkills?.length ?? 0) + 1
      const def = genDynamicSkill(this.rng, seq)
      this.state.dynamicSkills = [...(this.state.dynamicSkills ?? []), def]
      registerDynamicContent([], [def])
      learnSkill(this.state, def.id)
      toast(`参悟无名古卷，悟得心法《${def.name}》！`, '#ffd54a')
    } else if (d.kind === 'book' && d.skillId) {
      sfx('sfx_pickup', 0.5)
      learnSkill(this.state, d.skillId)
      toast(`习得功法《${SKILLS.get(d.skillId)?.name}》！去背包装配`, '#af7ac5')
    } else if (d.item) {
      sfx('sfx_equip', 0.5)
      this.state.inventory.push(d.item)
      recordCodexItem(this.state, d.item)
      this.runItems.push(`[${QUALITY_NAMES[d.item.quality]}]${d.item.name} Lv.${d.item.itemLevel}`)
      toast(`拾取 [${QUALITY_NAMES[d.item.quality]}] ${d.item.name} Lv.${d.item.itemLevel}`, d.item.named ? '#ffd54a' : '#e8c86a')
    }
    saveGame(this.state)
    updateHUD()
  }
}
