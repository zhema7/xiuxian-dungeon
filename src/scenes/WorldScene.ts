// ---------- 大地图场景 · 南域 ----------

import Phaser from 'phaser'
import { Player } from '../entities'
import { input } from '../input'
import { makeRng, randInt, rollEquip, type EquipItem } from '../core'
import { saveGame, loadSaveSlot, type GameState } from '../state'
import { calcStats } from '../effects'
import { toast, showDialog, showInputDialog, dialogOpen, panelOpen, modalPanel, resetControls, setFloorText, updateHUD, setSettingsCallbacks, openNpcPanel, closePanel, openInventory, openSettings, type NpcPanelData } from '../ui'
import { BGM_TOWN, BGM_SOUTH, BGM_SOUTH_ALT, BGM_CENTRAL, BGM_WEST, BGM_EAST, BGM_NORTH, playBgm, sfx, stopBgm } from '../audio'
import { WORLD_MAP_W, WORLD_MAP_H, getPoint, isPointUnlocked, getTeleportTargets, getDomainPoints, getDomainDef, type WorldPoint, type DomainId } from '../world-map'
import { advanceTime, formatTime, isDaytime, isNight, getMoveTimeMultiplier, type WorldTime } from '../world-time'
import { rollWorldEvent, type WorldEvent, type WorldEventChoice } from '../world-events'
import { createNewSect, SECT_FOUND_COST, SECT_FOUND_REALM } from '../sect-data'
import { REALMS } from '../data'
import { initNpcStates, updateNpcGrowth } from '../npc-system'
import { generateAiSect, generateResourceNodes, getDiplomacyStatus, diplomacyStatusName, dispositionDesc, type AiSect, type ResourceNode } from '../ai-sect-data'
import { tickAllAiSects, processTradeIncome, processResourceIncome, executeDiplomacy, attackResourceNode, launchSectWar } from '../diplomacy'
import { tryCompleteQuest, initMainQuest, onSectEstablished, getQuestHudText } from '../storyline-system'
import { refreshNpcsAroundPlayer, moveNpc, findNearbyNpcs, type ProceduralNpc, getNpcEquipName, getNpcSkillName, getNpcItemName, getRealmName } from '../procedural-npc'
import { getOrCreateNpcTexture } from '../npc-sprite-gen'
import { createNpcCombatData, decideNpcAction, damageNpc, npcAttackDamage, onNpcDefeated, plunderNpc, sparWithNpc, type NpcCombatData } from '../npc-combat'
import { performDivineSense, updateDivineSenseLevel, type DivineSenseResult } from '../divine-sense'
import { addMorality, addKarma, onHelpNpc, getMoralityTier, getReputationTier, checkRetribution } from '../karma'
import { runDailyKarmaCheck, type RevengeEvent } from '../karma-v2'
import { runDailyKarmaV3 } from '../karma-v3'
import { addInnerDemon, checkDemonManifestation, getDemonSummary, purifyDemon, getCultivationModifier, generateDemonIllusion, type InnerDemonType } from '../inner-demon'
import { canTriggerTribulation, prepareTribulation, buildEnhancedTribulation, calculateTribulationReward, calculateTribulationFailure } from '../tribulation-v2'
import { canUpgradeBuilding, upgradeBuilding, tickSectProduction, getBuildingEffects, withdrawSectResources, type BuildingId } from '../sect-building-v2'
import { assignPosition, applySectRule, getSectRule, getSectOverview, calculatePositionEffects, RULE_NAMES, RULE_DESC, POSITION_NAMES, type SectPosition, type SectRule } from '../sect-management'
import { recruitDisciple, canRecruitDisciple, updateDiscipleGrowth } from '../disciple-system'
import { generateNpcRelations, onPlayerKillNpc, onPlayerHelpNpc, getPlayerNpcRelation, getRelationLevelName, getNpcRelation } from '../npc-relation-net'
import { runDailySocialSimulation, getNpcSocialSummary } from '../social-simulation'
import { updateNpcBySchedule, applyScheduleEffect, getNpcActivityDesc } from '../npc-schedule-system'
import { generateRelationQuest, updateQuestProgress, claimQuestReward, getAvailableQuests, type RelationQuest } from '../relation-quests'
import { recordLifeEvent, rewriteNpcStory, getNpcLifeEvents, runDailyNpcEvents } from '../narrative-engine-v2'
import { generateSecretRealm, discoverRealm, canBringNpcToRealm, bringNpcToRealm, generateRealmNpcs, getRealmProgress, type SecretRealmDef } from '../secret-realm'
import { tickStamina, getStaminaSpeedModifier, getStaminaDisplay } from '../stamina'
import { refreshDynamicElements, collectElement, type DynamicElement } from '../dynamic-elements'
import { exploreTile, isExplored, getVisionRadius } from '../world-fog'
import { getPendingAnnualEvent, executeAnnualEvent, getUpcomingEvent } from '../annual-events'
import { tickSectWars, aiDeclareWars } from '../sect-war'
import { tickWorldEvolution, getWorldEvolutionState } from '../world-evolution'
import { checkAllChains, completeChainStage, type EventChainId, type ChainEvent } from '../deep-event-chain'
import { getMountSpeedMultiplier, getMountVisionBonus, canFly, tickMountEndurance, MOUNTS, MOUNT_TEXTURES, summonMount, dismissMount, purchaseMount, type MountType } from '../mount-system'
import { getWeatherType, getWeatherConfig, type WeatherType } from '../weather'
import { getBiomePalette, type BiomePalette } from '../biome-palette'
import { generateWorldIcons, getWorldIconKey } from '../world-icons'
import { generateWorldDecorations, scatterDecorations, getDecoKey, type ScatterContext } from '../world-decorations'
import { generateDomainTerrain, DOMAIN_WATER, DOMAIN_TERRAIN_PLACEMENTS, getTerrainKey, type WaterPath } from '../domain-terrain'
import { loadLazyGroup } from '../lazy-assets'
import { blendRegionHeight, blendRegionColor, getRegionVegType, getRegionDensity, getRegionPlan } from '../region-plan'
import { fbm } from '../fbm'
import type { ThreeBridge } from '../three-bridge'

const PLAYER_SPEED = 140
const INTERACT_RANGE = 60
type Rng = () => number
const EVENT_BASE_DISTANCE = 400 // 移动约 400 像素触发一次随机事件

export class WorldScene extends Phaser.Scene {
  private state!: GameState
  private player!: Player
  private worldTime!: WorldTime
  private pointObjects: Map<string, Phaser.GameObjects.Container> = new Map()
  private nearPoint: WorldPoint | null = null
  private promptText: Phaser.GameObjects.Text | null = null
  private timeText: Phaser.GameObjects.Text | null = null
  private travelText: Phaser.GameObjects.Text | null = null
  private moveAccumulator = 0
  private eventActive = false
  private transitioning = false
  private lastTickMs = 0
  private rng!: Rng
  private miniMap!: Phaser.GameObjects.Graphics
  private miniMapBg!: Phaser.GameObjects.Rectangle
  private miniMapTerrain!: Phaser.GameObjects.Graphics
  private resourceCooldowns: Record<string, number> = {} // pointId → timestamp
  private npcGrowTimer = 0
  private aiSectMarkers: { id: string; container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text }[] = []
  private resourceNodeMarkers: { id: string; container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text }[] = []
  private diplomacyTimer = 0
  private _lastTarget: string | null = null
  private currentDomain: DomainId = 'south'
  // NPC 精灵管理
  private npcSprites: Map<string, Phaser.GameObjects.Sprite> = new Map()
  private npcLabels: Map<string, Phaser.GameObjects.Text> = new Map()
  private npcRefreshTimer = 0
  private nearbyNpc: ProceduralNpc | null = null
  // 动态元素
  private dynamicElements: DynamicElement[] = []
  private dynamicElementContainers: Map<string, Phaser.GameObjects.Container> = new Map()
  private dynamicRefreshTimer = 0
  private nearbyElement: DynamicElement | null = null
  // 世界迷雾
  private fogGraphics!: Phaser.GameObjects.Graphics
  // 体力显示
  private staminaText: Phaser.GameObjects.Text | null = null
  private threeBridge: ThreeBridge | null = null
  private _hd2dFrameCount = 0
  // HD-2D 精灵阴影
  private playerShadow!: Phaser.GameObjects.Graphics
  private mountSprite: Phaser.GameObjects.Sprite | null = null
  private npcShadows: Map<string, Phaser.GameObjects.Graphics> = new Map()
  // 3D 模式下需要投影到屏幕的 2D 标签和标记容器
  private projectableItems: { obj: Phaser.GameObjects.Text | Phaser.GameObjects.Container; wx: number; wy: number; yOff: number }[] = []
  // HD-2D 光照覆盖
  private lightOverlay!: Phaser.GameObjects.Rectangle
  // HD-2D 装饰物
  private decoObjects: Phaser.GameObjects.GameObject[] = []
  // HD-2D 植被容器（风吹动画）
  private vegetationContainers: Phaser.GameObjects.Container[] = []
  // L2 水域图层（动态水面）
  private waterGraphics!: Phaser.GameObjects.Graphics
  // L1 地形特征图层（山脉/岩柱/冰墙等）
  private terrainObjects: Phaser.GameObjects.Image[] = []
  // HD-2D 暗角
  private vignetteGraphics!: Phaser.GameObjects.Graphics
  // HD-2D 大气雾渐变
  private atmFogOverlay!: Phaser.GameObjects.Graphics
  // 秘境入口
  private realmEntranceMarkers: Phaser.GameObjects.Container[] = []
  private discoveredRealmDefs: SecretRealmDef[] = []
  // Phase 5: 每日结算计时器
  private dailyTickTimer = 0
  private lastDayChecked = 0
  // Phase 5: 关系任务
  private activeQuests: RelationQuest[] = []
  // Phase 5: NPC行为结算
  private npcBehaviorTimer = 0
  // 天气粒子
  private weatherEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null
  private currentWeather: WeatherType = 'clear'
  private weatherCheckTimer = 0
  // 视差背景层
  private parallaxLayers: { gfx: Phaser.GameObjects.Graphics; factor: number }[] = []
  // 当前群系色调
  private biomePalette: BiomePalette | null = null
  // 地图动画元素
  private mapAnims: { gfx: Phaser.GameObjects.Graphics; tween: Phaser.Tweens.Tween }[] = []
  private shimmerGfx: Phaser.GameObjects.Graphics | null = null
  private shimmerPhase = 0

  constructor() { super('World') }

  preload() {
    loadLazyGroup(this, 'world')
  }

  private static aiBgProcessed = false

  create(data?: { fromScene?: string }) {
    this.state = this.registry.get('state')
    this.state.lastScene = 'World'
    this.state.lastSceneData = {}
    this.worldTime = this.state.worldTime
    this.rng = makeRng(Date.now() % 2147483647)
    this.transitioning = false
    this.eventActive = false
    this.currentWeather = 'clear'
    this.weatherCheckTimer = 0
    this.mapAnims = []
    this.shimmerGfx = null
    this.shimmerPhase = 0
    this.moveAccumulator = this.state.worldEventCooldown || 0
    this.lastTickMs = this.time.now
    this.npcRefreshTimer = 0

    // AI 生成贴图背景移除（仅首次执行）
    if (!WorldScene.aiBgProcessed) {
      WorldScene.aiBgProcessed = true
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
            px[i + 3] = 0
          } else if (dr + dg + db < threshold * 6) {
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
    }

    // 清理上一轮残留引用（场景 restart 时 Phaser 只销毁游戏对象，不清理 Map/Array）
    this.pointObjects.clear()
    this.aiSectMarkers = []
    this.resourceNodeMarkers = []
    this.npcSprites.clear()
    this.npcLabels.clear()
    this.npcShadows.clear()
    this.dynamicElements = []
    this.dynamicElementContainers.clear()
    this.projectableItems = []
    this.decoObjects = []
    this.vegetationContainers = []
    this.terrainObjects = []
    this.realmEntranceMarkers = []
    this.parallaxLayers = []

    // 从 NPC 战斗场景返回时处理战斗结果
    if (this.registry.get('npcCombatData')) {
      this.time.delayedCall(100, () => this.handleNpcCombatResult())
    }

    this.currentDomain = (this.state.worldDomain as DomainId) || 'south'
    const domainDef = getDomainDef(this.currentDomain)
    // 按域选择BGM
    if (this.currentDomain === 'south') {
      playBgm(BGM_SOUTH)       // 南域：南境云隐
    } else if (this.currentDomain === 'central') {
      playBgm(BGM_CENTRAL)     // 中域：仙域天威
    } else if (this.currentDomain === 'west') {
      playBgm(BGM_WEST)        // 西域：西域幻境
    } else if (this.currentDomain === 'east') {
      playBgm(BGM_EAST)        // 东域：南洋仙踪
    } else if (this.currentDomain === 'north') {
      playBgm(BGM_NORTH)       // 北域：北域寒锋
    } else {
      playBgm(BGM_TOWN)        // 其他域暂用洞府BGM
    }
    setFloorText(`${domainDef?.name ?? '南域'} · 大地图`)
    initNpcStates(this.state)
    initMainQuest(this.state)

    const questHud = this.add.text(4, 4, getQuestHudText(this.state), {
      fontSize: '8px', color: '#fbbf24', backgroundColor: '#00000088',
      padding: { x: 4, y: 2 },
    }).setOrigin(0, 0).setDepth(10)

    this.time.delayedCall(800, () => {
      tryCompleteQuest(this.state).then(() => {
        questHud.setText(getQuestHudText(this.state))
      })
    })

    document.getElementById('hud')!.style.display = 'block'
    resetControls()
    document.getElementById('btnAct')!.style.display = 'none'
    document.getElementById('btnAct')!.textContent = '交互'
    document.getElementById('btnSkill')!.style.display = 'none'
    document.getElementById('btnRetreat')!.style.display = 'none'
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
        saveGame(this.state)
        stopBgm()
        this.cameras.main.fadeOut(400, 0, 0, 0)
        this.time.delayedCall(420, () => this.scene.start('Title'))
      },
      onBuildHome: () => { this.buildNewHome() },
      onZoom: (delta) => { this.threeBridge?.zoom(delta) },
      onResetCamera: () => { this.threeBridge?.resetCamera() },
      onToggleRenderMode: () => {
        this.cameras.main.fadeOut(400, 0, 0, 0)
        this.time.delayedCall(420, () => {
          this.scene.restart()
        })
      },
    })

    this.physics.world.setBounds(0, 0, WORLD_MAP_W, WORLD_MAP_H)
    this.cameras.main.setBounds(0, 0, WORLD_MAP_W, WORLD_MAP_H)
    this.cameras.main.setBackgroundColor(domainDef ? `#${domainDef.bgTint.toString(16).padStart(6, '0')}` : '#1a2b20')

    // 先初始化视差背景层 + 群系色调（renderMap 依赖 biomePalette）
    this.biomePalette = getBiomePalette(this.currentDomain)

    // 先初始化 HD-2D 3D 背景层（depth -1，最底层）
    if (this.state.renderMode === '3d') {
      this.initHD2DBackground()
    } else {
      ;(this as any)._useDirect3D = false
      this.initHeightField()
    }

    // 再绘制半透明 2D 地形（depth 0，覆盖在 3D 背景之上）
    this.renderMap()

    // 玩家
    const isFromTown = data?.fromScene === 'town'
    const px = isFromTown ? (this.state.homeX || 600) : (this.state.worldPlayerX || 600)
    const py = isFromTown ? (this.state.homeY || 1350) : (this.state.worldPlayerY || 1350)
    this.player = new Player(this, px, py, this.state.classId)
    this.player.sprite.setCollideWorldBounds(true)
    this.player.sprite.setScale(0.8)
    this.player.sprite.setDepth(5)
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1)

    // HD-2D：玩家阴影椭圆（接地 + 方向阴影，模拟左上光源）
    this.playerShadow = this.add.graphics().setDepth(4)
    this.playerShadow.fillStyle(0x000000, 0.35)
    this.playerShadow.fillEllipse(0, 0, 44, 15)
    this.playerShadow.setPosition(this.player.sprite.x + 4, this.player.sprite.y + 19)

    // 坐骑贴图：若已召唤坐骑则显示
    this.refreshMountSprite()

    // HD-2D：昼夜光照覆盖层
    this.lightOverlay = this.add.rectangle(0, 0, WORLD_MAP_W, WORLD_MAP_H, 0x000000, 0).setOrigin(0).setDepth(50)
    this.updateLightOverlay()

    // HD-2D：大气雾渐变 / 屏幕暗角 — 3D 直显模式下由 Three.js Fog 和透视相机提供
    if (!(this as any)._useDirect3D) {
      this.initAtmosphericFog()
      this.initVignette()
    }

    // 处理 AI 建筑贴图（缩放+去白背景）
    this.processAiBuildingTextures()
    this.processAiDecorationTextures()

    // 点位标记
    this.renderPoints()

    // AI 宗门和资源点标记
    this.renderAiSects()
    this.renderResourceNodes()

    // 神念等级更新
    updateDivineSenseLevel(this.state)

    // 世界迷雾遮罩
    this.fogGraphics = this.add.graphics().setDepth(50)

    // 天气粒子系统
    this.initWeather()

    // 程序化生成兴趣点图标（覆盖旧 PNG）
    generateWorldIcons(this)
    // 程序化生成 HD-2D 装饰物纹理（建筑/植物/石头等）
    generateWorldDecorations(this, this.currentDomain)
    // 程序化生成各域地形特征纹理（山脉/岩柱/冰墙/仙人掌等）
    generateDomainTerrain(this, this.currentDomain)
    // L2 绘制水域（河流/海/护城河/冰河）— 3D 直显模式下跳过
    if (!(this as any)._useDirect3D) {
      this.drawDomainWater()
    // L1 放置地形特征（山脉/岩柱/冰墙/沙丘等）
    this.drawDomainTerrain()
    // 在地图上散布装饰物（区域规划驱动：每个区域放置对应植被）
    const scatterCtx: ScatterContext = {
      waterPaths: DOMAIN_WATER[this.currentDomain],
      terrainPlacements: DOMAIN_TERRAIN_PLACEMENTS[this.currentDomain],
      worldPoints: getDomainPoints(this.currentDomain).map(p => ({ x: p.x, y: p.y, type: p.type })),
    }
    this.decoObjects = scatterDecorations(this, this.currentDomain, WORLD_MAP_W, WORLD_MAP_H, scatterCtx)
    // 收集植被容器用于风吹动画
    this.vegetationContainers = this.decoObjects.filter(
      (d): d is Phaser.GameObjects.Container => d instanceof Phaser.GameObjects.Container && d.getData('isVegetation') === true
    )
    this.scatterAiDecorations()
    // 绘制连接主要点位的道路
    this.drawRoads()
    // 放置 AI 神龛装饰（域中心附近）
    this.placeAiShrines()
    this.initParallax()

    // 地图动画元素（水波/草浪/光斑）
    this.initMapAnimations()
    } else {
      // 3D 模式：玩家精灵不可见，用 3D billboard 替代
      this.player.sprite.setVisible(false)
      if (this.playerShadow) this.playerShadow.setVisible(false)
      // 设置 NPC 阴影不可见
      for (const shadow of this.npcShadows.values()) shadow.setVisible(false)
      // 添加玩家 billboard
      this.addPlayerBillboard()
    }

    // NPC关系网初始化
    if (this.state.proceduralNpcs.length > 0 && this.state.npcRelationNet.length === 0) {
      generateNpcRelations(this.state)
    }

    // Phase 5: 从存档加载活跃任务
    this.activeQuests = (this.state.activeRelationQuests as unknown as RelationQuest[]) || []
    this.lastDayChecked = this.state.lastSocialSimDay || 0

    // NPC 精灵初始化
    const activeNpcs = refreshNpcsAroundPlayer(this.state, this.player.sprite.x, this.player.sprite.y, this.currentDomain)
    for (const npc of activeNpcs) {
      this.spawnNpcSprite(npc)
    }

    // 动态元素初始化
    this.dynamicElements = refreshDynamicElements(this.state, this.player.sprite.x, this.player.sprite.y, this.currentDomain, this.worldTime, this.dynamicElements)
    this.renderDynamicElements()

    // 体力显示
    this.staminaText = this.add.text(310, 18, '', { fontSize: '9px', color: '#fbbf24', stroke: '#000', strokeThickness: 2 })
      .setOrigin(1, 0).setDepth(100).setScrollFactor(0)

    // 交互提示文字
    this.promptText = this.add.text(180, 580, '', { fontSize: '12px', color: '#f0d98c', stroke: '#000', strokeThickness: 3, align: 'center' })
      .setOrigin(0.5).setDepth(100).setScrollFactor(0).setVisible(false)

    // 时间显示
    this.timeText = this.add.text(180, 18, '', { fontSize: '10px', color: '#a3e4d7', stroke: '#000', strokeThickness: 2, align: 'center' })
      .setOrigin(0.5).setDepth(100).setScrollFactor(0)
    this.travelText = this.add.text(180, 32, '', { fontSize: '8px', color: '#fbbf24', stroke: '#000', strokeThickness: 2, align: 'center' })
      .setOrigin(0.5).setDepth(100).setScrollFactor(0)
    this.updateTimeDisplay()

    // 小地图
    this.createMiniMap()

    updateHUD()
    toast(`大地图已开启，自由探索${domainDef?.name ?? '南域'}`, '#a3e4d7')

    // 从城市场景回来时恢复
    if (data?.fromScene === 'city') {
      this.player.sprite.setPosition(this.state.worldPlayerX, this.state.worldPlayerY)
    }

    // 恢复已发现的秘境入口（避免场景重启后入口消失）
    if (this.state.discoveredRealmDefs && this.state.discoveredRealmDefs.length > 0) {
      for (const realm of this.state.discoveredRealmDefs) {
        if (realm.domain === this.currentDomain) {
          this.discoveredRealmDefs.push(realm)
          this.renderSecretRealmEntrance(realm)
        }
      }
    }

    // 转场淡入
    this.cameras.main.fadeIn(400, 0, 0, 0)
  }

  private renderMap() {
    const domainDef = getDomainDef(this.currentDomain)
    // HD-2D：3D 地形为主背景，AI 域地形贴图增强域特征
    this.renderDomainTerrain()
    if (!(this as any)._useDirect3D) {
      this.drawMapFallback(domainDef?.bgTint ?? 0x1a3b2a)
    }
  }

  /** 渲染 AI 域特色地形背景（让地域差异一目了然） */
  private renderDomainTerrain(): void {
    const terrainKey = `ai_terrain_${this.currentDomain}`
    if (!this.textures.exists(terrainKey)) return

    // 3D 直显模式下域色调由 vertexColors 和 Three.js 雾色提供
    if ((this as any)._useDirect3D) return

    // 不再全图平铺同一张贴图——改为仅在区域规划边界处绘制低透明度域色调
    const pal = this.biomePalette
    if (pal) {
      const tint = this.add.rectangle(
        WORLD_MAP_W / 2, WORLD_MAP_H / 2,
        WORLD_MAP_W, WORLD_MAP_H,
        pal.groundLight, 0.08,
      )
      tint.setDepth(-0.4).setOrigin(0.5)
    }
  }

  private drawMapFallback(baseTint: number) {
    const pal = this.biomePalette
    const darkTint = pal ? pal.groundDark : (baseTint & 0xfefefe) >> 1
    const lightTint = pal ? pal.groundLight : Math.min(0xffffff, baseTint + 0x101010)

    // 优先使用高清像素风地形贴图
    const grassKey = this.textures.exists('tex_grass') ? 'tex_grass' : (this.textures.exists('ai_grass_hq') ? 'ai_grass_hq' : (this.textures.exists('grass') ? 'grass' : null))
    const stoneKey = this.textures.exists('tex_stone') ? 'tex_stone' : (this.textures.exists('ai_stone_hq') ? 'ai_stone_hq' : (this.textures.exists('stone') ? 'stone' : null))
    const waterKey = this.textures.exists('tex_water') ? 'tex_water' : (this.textures.exists('ai_water_hq') ? 'ai_water_hq' : null)

    const tileSize = 48
    for (let y = 0; y < WORLD_MAP_H; y += tileSize) {
      for (let x = 0; x < WORLD_MAP_W; x += tileSize) {
        const heightAt = (this as any)._heightAt as ((x: number, z: number) => number) | undefined
        let h = 15
        if (heightAt) {
          h = heightAt(x - 700, y - 900)
        }

        if (h > 45) {
          // 高山区 — AI 石纹贴图
          if (stoneKey) {
            const img = this.add.image(x + tileSize / 2, y + tileSize / 2, stoneKey)
            img.setDisplaySize(tileSize, tileSize).setOrigin(0.5).setDepth(0.05).setAlpha(0.25)
          }
          const shade = this.add.rectangle(x + tileSize / 2, y + tileSize / 2, tileSize, tileSize, darkTint, 0.25)
          shade.setDepth(0.1).setOrigin(0.5)
        } else if (h > 25) {
          // 丘陵过渡区 — AI 草纹贴图 + 暗色叠加
          if (grassKey) {
            const img = this.add.image(x + tileSize / 2, y + tileSize / 2, grassKey)
            img.setDisplaySize(tileSize, tileSize).setOrigin(0.5).setDepth(0.05).setAlpha(0.18)
          }
          const shade = this.add.rectangle(x + tileSize / 2, y + tileSize / 2, tileSize, tileSize, darkTint, 0.1)
          shade.setDepth(0.1).setOrigin(0.5)
        } else if (h < 0) {
          // 水域 — AI 水纹贴图
          if (waterKey) {
            const img = this.add.image(x + tileSize / 2, y + tileSize / 2, waterKey)
            img.setDisplaySize(tileSize, tileSize).setOrigin(0.5).setDepth(0.05).setAlpha(0.3)
          }
          const shade = this.add.rectangle(x + tileSize / 2, y + tileSize / 2, tileSize, tileSize, 0x1a3a5a, 0.15)
          shade.setDepth(0.1).setOrigin(0.5)
        } else {
          // 平原 — AI 草纹贴图
          if (grassKey) {
            const img = this.add.image(x + tileSize / 2, y + tileSize / 2, grassKey)
            img.setDisplaySize(tileSize, tileSize).setOrigin(0.5).setDepth(0.05).setAlpha(0.15)
          }
          const h2 = ((x * 73856093) ^ (y * 19349663)) >>> 0
          if (h2 % 9 === 0) {
            const lite = this.add.rectangle(x + tileSize / 2, y + tileSize / 2, tileSize, tileSize, lightTint, 0.05)
            lite.setDepth(0.1).setOrigin(0.5)
          }
        }
      }
    }
    this.drawRiver()

    // HD2D 风格地形高度阴影
    this.drawTerrainShadows()

    const border = this.add.graphics().setDepth(1)
    border.lineStyle(4, darkTint, 0.6)
    border.strokeRect(0, 0, WORLD_MAP_W, WORLD_MAP_H)
  }

  /** HD2D 风格地形高度阴影：在山区边缘绘制伪 3D 悬崖 */
  private drawTerrainShadows() {
    const g = this.add.graphics().setDepth(0.05)
    const pal = this.biomePalette
    if (!pal) return
    const cliffColor = pal.groundDark
    const tileSize = 48
    const heightAt = (this as any)._heightAt as ((x: number, z: number) => number) | undefined
    if (!heightAt) return
    for (let y = 0; y < WORLD_MAP_H; y += tileSize) {
      for (let x = 0; x < WORLD_MAP_W; x += tileSize) {
        const h = heightAt(x - 700, y - 900)
        if (h > 45) {
          // 山区边缘向内投射阴影
          const shadowH = 6
          g.fillStyle(cliffColor, 0.4)
          g.fillRect(x, y + tileSize - shadowH, tileSize, shadowH)
          g.fillStyle(0x000000, 0.15)
          g.fillRect(x, y + tileSize - shadowH, tileSize, 2)
        }
      }
    }
  }

  /** HD-2D：昼夜光照覆盖层（统一 2D 精灵与 3D 场景色调） */
  private updateLightOverlay() {
    if (!this.lightOverlay) return
    // 3D 直显模式下由 Three.js 光照系统负责，2D 光照层透明
    if ((this as any)._useDirect3D) {
      this.lightOverlay.setAlpha(0)
      // 仍然同步 3D 光照颜色
      const daytime = isDaytime(this.worldTime)
      const night = isNight(this.worldTime)
      if (this.threeBridge) {
        if (daytime) {
          this.threeBridge.setLightColor(0x6a7a8a, 0xfff5d0, 1.6, false)
        } else if (night) {
          this.threeBridge.setLightColor(0x3a4a6a, 0x7a8aba, 1.0, true)
        } else {
          this.threeBridge.setLightColor(0x4a4a6a, 0xd0b080, 1.2, false)
        }
      }
      return
    }
    const daytime = isDaytime(this.worldTime)
    const night = isNight(this.worldTime)
    if (daytime) {
      this.lightOverlay.setFillStyle(0xfff5d0, 0.06)
    } else if (night) {
      this.lightOverlay.setFillStyle(0x2a2a5a, 0.2)
    } else {
      this.lightOverlay.setFillStyle(0x4a3a2a, 0.15)
    }
    // 同步 3D 场景光照
    if (this.threeBridge) {
      if (daytime) {
        this.threeBridge.setLightColor(0x6a7a8a, 0xfff5d0, 1.6, false)
      } else if (night) {
        this.threeBridge.setLightColor(0x3a4a6a, 0x7a8aba, 1.0, true)
      } else {
        this.threeBridge.setLightColor(0x4a4a6a, 0xd0b080, 1.2, false)
      }
    }
  }

  /** HD-2D：初始化大气雾渐变（上方浓雾→下方清透） */
  private initAtmosphericFog(): void {
    const domainDef = getDomainDef(this.currentDomain)
    const fogColor = domainDef?.bgTint ?? 0x1a3b2a

    this.atmFogOverlay = this.add.graphics().setDepth(49).setScrollFactor(0)
    // 在屏幕高度上画 8 条渐变带，从上到下 alpha 递减
    const VW = this.scale.gameSize.width
    const VH = this.scale.gameSize.height
    const bands = 10
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1)
      const y = Math.floor(t * VH)
      const h = Math.ceil(VH / bands) + 1
      const alpha = (1 - t) * 0.18  // 顶部 0.18 → 底部 0
      this.atmFogOverlay.fillStyle(fogColor, alpha)
      this.atmFogOverlay.fillRect(0, y, VW, h)
    }
  }

  /** HD-2D：初始化屏幕暗角（边缘暗化，收束视线增强纵深） */
  private initVignette(): void {
    this.vignetteGraphics = this.add.graphics().setDepth(49).setScrollFactor(0)
    const VW = this.scale.gameSize.width
    const VH = this.scale.gameSize.height
    const layers = 6
    const stepX = Math.floor(VW / 2 / layers)
    const stepY = Math.floor(VH / 2 / layers)
    for (let i = 0; i < layers; i++) {
      const a = 0.04 + i * 0.02  // 内圈 0.04 → 外圈 0.14
      this.vignetteGraphics.fillStyle(0x000000, a)
      // 上边
      this.vignetteGraphics.fillRect(0, 0, VW, stepY * (i + 1))
      // 下边
      this.vignetteGraphics.fillRect(0, VH - stepY * (i + 1), VW, stepY * (i + 1))
      // 左边
      this.vignetteGraphics.fillRect(0, stepY * (i + 1), stepX * (i + 1), VH - stepY * 2 * (i + 1))
      // 右边
      this.vignetteGraphics.fillRect(VW - stepX * (i + 1), stepY * (i + 1), stepX * (i + 1), VH - stepY * 2 * (i + 1))
    }
  }

  /** 处理 AI 建筑贴图：缩放至 256x256 + 去白背景 + 边缘羽化 */
  private processAiBuildingTextures(): void {
    const AI_BLDG_KEYS: Record<string, string> = {
      bldg_home: 'ai_bldg_home',
      bldg_city: 'ai_bldg_city',
      bldg_sect: 'ai_bldg_sect',
      bldg_dungeon: 'ai_bldg_dungeon',
      bldg_landmark: 'ai_bldg_landmark',
    }
    const TARGET = 256

    for (const [type, sourceKey] of Object.entries(AI_BLDG_KEYS)) {
      const processedKey = `ai_bldg_proc_${type}`
      if (this.textures.exists(processedKey)) continue
      if (!this.textures.exists(sourceKey)) continue

      const sourceImg = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement
      if (!sourceImg || !sourceImg.width) continue

      const canvas = document.createElement('canvas')
      canvas.width = TARGET
      canvas.height = TARGET
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(sourceImg, 0, 0, sourceImg.width, sourceImg.height, 0, 0, TARGET, TARGET)

      // 去白背景 + 边缘羽化
      const imgData = ctx.getImageData(0, 0, TARGET, TARGET)
      const data = imgData.data
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const brightness = (r + g + b) / 3
        // 近白色像素 → 透明
        if (r > 230 && g > 230 && b > 230) {
          data[i + 3] = 0
        } else if (r > 210 && g > 210 && b > 210) {
          // 半透明过渡
          data[i + 3] = Math.floor(data[i + 3] * (1 - (brightness - 210) / 20) * 0.5)
        }
        // 边缘 2px 羽化
        const x = (i / 4) % TARGET
        const y = Math.floor((i / 4) / TARGET)
        const edgeDist = Math.min(x, y, TARGET - 1 - x, TARGET - 1 - y)
        if (edgeDist < 2 && data[i + 3] > 0) {
          data[i + 3] = Math.floor(data[i + 3] * (edgeDist / 2))
        }
      }
      ctx.putImageData(imgData, 0, 0)
      this.textures.addCanvas(processedKey, canvas)
    }
  }

  /** 处理 AI 装饰物贴图：缩放至 48x48 + 去白背景 */
  private processAiDecorationTextures(): void {
    const AI_DECO_KEYS: Record<string, string> = {
      waterfall: 'ai_deco_waterfall',
      altar: 'ai_deco_altar',
      bonfire: 'ai_deco_bonfire',
    }
    const TARGET = 48

    for (const [type, sourceKey] of Object.entries(AI_DECO_KEYS)) {
      const processedKey = `ai_deco_proc_${type}`
      if (this.textures.exists(processedKey)) continue
      if (!this.textures.exists(sourceKey)) continue

      const sourceImg = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement
      if (!sourceImg || !sourceImg.width) continue

      const canvas = document.createElement('canvas')
      canvas.width = TARGET
      canvas.height = TARGET
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(sourceImg, 0, 0, sourceImg.width, sourceImg.height, 0, 0, TARGET, TARGET)

      const imgData = ctx.getImageData(0, 0, TARGET, TARGET)
      const data = imgData.data
      // 采样四角颜色作为背景色
      const cIdx = [0, (TARGET - 1) * 4, (TARGET - 1) * TARGET * 4, (TARGET - 1) * TARGET * 4 + (TARGET - 1) * 4]
      const bgR = cIdx.reduce((s, i) => s + data[i], 0) / 4
      const bgG = cIdx.reduce((s, i) => s + data[i + 1], 0) / 4
      const bgB = cIdx.reduce((s, i) => s + data[i + 2], 0) / 4
      const threshold = 55
      for (let i = 0; i < data.length; i += 4) {
        const dr = Math.abs(data[i] - bgR)
        const dg = Math.abs(data[i + 1] - bgG)
        const db = Math.abs(data[i + 2] - bgB)
        if (dr + dg + db < threshold * 3) {
          data[i + 3] = 0
        } else if (dr + dg + db < threshold * 6) {
          data[i + 3] = Math.floor(data[i + 3] * (dr + dg + db) / (threshold * 6))
        }
      }
      ctx.putImageData(imgData, 0, 0)
      this.textures.addCanvas(processedKey, canvas)
    }
  }

  /** 散布 AI 生成装饰物 */
  private scatterAiDecorations(): void {
    const has3D = !!(this as any)._has3DBuildings
    const AI_DECOS: { key: string; count: number }[] = [
      { key: 'ai_deco_proc_waterfall', count: 3 },
      { key: 'ai_deco_proc_altar', count: 4 },
      { key: 'ai_deco_proc_bonfire', count: 5 },
    ]

    let seed = 7777
    const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }

    for (const { key, count } of AI_DECOS) {
      if (!this.textures.exists(key)) continue
      for (let i = 0; i < count; i++) {
        const x = Math.floor(rng() * (WORLD_MAP_W - 80)) + 40
        const y = Math.floor(rng() * (WORLD_MAP_H - 80)) + 40
        const distFromCenter = Math.hypot(x - WORLD_MAP_W / 2, y - WORLD_MAP_H / 2)
        if (distFromCenter < 60) continue

        const yRatio = y / WORLD_MAP_H
        const perspScale = 0.55 + yRatio * 0.65
        const baseScale = (0.9 + rng() * 0.4) * perspScale
        const atmAlpha = 0.65 + yRatio * 0.3

        const shadow = this.add.ellipse(x, y + 2, 20 * baseScale, 6 * baseScale, 0x000000, 0.3 * atmAlpha)
        shadow.setDepth(0.3 + yRatio * 0.3)

        // 3D 立面版本已渲染时跳过 2D 图片
        if (has3D) continue

        const img = this.add.image(x, y - 2, key).setOrigin(0.5, 1)
        img.setScale(baseScale)
        img.setAlpha(atmAlpha)
        img.setDepth(0.5 + yRatio * 0.3)
      }
    }
  }

  /** 刷新坐骑贴图（召唤/收回时调用） */
  private refreshMountSprite() {
    const activeMount = (this.state as any).activeMount as { type: MountType; summoned: boolean; endurance: number } | undefined
    if (activeMount?.summoned && activeMount.endurance > 0) {
      const texInfo = MOUNT_TEXTURES[activeMount.type]
      if (this.textures.exists(texInfo.tex)) {
        if (!this.mountSprite) {
          this.mountSprite = this.add.sprite(this.player.sprite.x, this.player.sprite.y + 6, texInfo.tex)
          this.mountSprite.setDepth(4.5).setScale(0.6)
        } else {
          this.mountSprite.setTexture(texInfo.tex)
        }
        // 播放动画（如有）
        if (texInfo.anim && this.anims.exists(texInfo.anim)) {
          this.mountSprite.anims.play(texInfo.anim, true)
        }
        this.mountSprite.setVisible(true)
      }
    } else {
      if (this.mountSprite) this.mountSprite.setVisible(false)
    }
  }

  /** HD-2D：更新 NPC 阴影椭圆位置 */
  private updateNpcShadows() {
    for (const [npcId, shadow] of this.npcShadows) {
      const sprite = this.npcSprites.get(npcId)
      if (sprite) {
        shadow.setPosition(sprite.x + 3, sprite.y + 15)
      } else {
        shadow.setVisible(false)
      }
    }
  }

  /** HD-2D：NPC 动态效果（呼吸缩放 + 浮动 + 阴影联动） */
  private updateNpcAnimations(): void {
    const t = this.time.now * 0.001
    for (const [id, sprite] of this.npcSprites) {
      if (sprite.alpha < 0.05) continue
      const npc = this.state.proceduralNpcs.find(n => n.id === id)
      if (!npc) continue

      const phase = (npc.appearanceSeed % 100) * 0.06

      // 呼吸：Y 轴微缩放
      const breathe = Math.sin(t * 1.5 + phase) * 0.02
      const baseScale = 1.0
      sprite.setScale(baseScale, baseScale * (1 + breathe))

      // 浮动：Y 轴微位移
      const bob = Math.sin(t * 1.2 + phase) * 1.2
      sprite.y = npc.location.y + bob

      // 阴影联动：身体上浮时阴影缩小变淡
      const shadow = this.npcShadows.get(id)
      if (shadow) {
        const sScale = 1 - breathe * 0.6
        shadow.setPosition(sprite.x + 3, npc.location.y + 15)
        shadow.setScale(sScale, 1)
        shadow.setAlpha(0.3 * (1 - breathe * 2))
      }

      // 高境界光晕脉冲（替代旧的 alpha 闪烁）
      if (npc.realm >= 3) {
        const pulse = Math.sin(t * 2 + phase) * 0.08
        sprite.setAlpha(Math.min(1, 0.85 + pulse))
      }
    }
  }

  /** HD-2D：为 NPC 创建方向阴影椭圆 */
  private createNpcShadow(npcId: string, x: number, y: number): Phaser.GameObjects.Graphics {
    const shadow = this.add.graphics().setDepth(3.5)
    shadow.fillStyle(0x000000, 0.3)
    shadow.fillEllipse(0, 0, 36, 11)
    shadow.setPosition(x + 3, y + 15)
    this.npcShadows.set(npcId, shadow)
    return shadow
  }

  /** HD-2D：植被风吹摇摆动画（每帧） */
  private updateVegetationAnimation(): void {
    if (this.vegetationContainers.length === 0) return
    const t = this.time.now * 0.001
    // 风力随时间变化（阵风效果）
    const windStrength = 0.6 + Math.sin(t * 0.3) * 0.3 + Math.sin(t * 0.07) * 0.15

    for (const container of this.vegetationContainers) {
      if (!container.active || container.alpha < 0.05) continue
      const phase = container.getData('phase') as number ?? 0
      const baseScale = container.getData('baseScale') as number ?? 1
      const flipX = container.getData('flipX') as number ?? 1

      // 主摇摆：X轴轻微倾斜
      const sway = Math.sin(t * 1.8 + phase) * 0.03 * windStrength
      // 次摇摆：更高频率细微抖动
      const microSway = Math.sin(t * 3.5 + phase * 2) * 0.008 * windStrength

      // 获取容器内的精灵（第二个子对象是图片）
      const img = container.list.find(c => c instanceof Phaser.GameObjects.Image && c.active) as Phaser.GameObjects.Image | undefined
      if (img && img.texture && img.texture.key !== '__MISSING') {
        img.setScale(baseScale * flipX * (1 + sway * 0.3), baseScale * (1 - sway * 0.15))
        img.setAngle(sway * 12 + microSway * 8)
      }
    }
  }

  /** HD-2D 3D 背景：fBm 噪声地形 + 海拔调色 + 水面 + 体素装饰 */
  /** 初始化地形高度函数（2D/3D 模式共用） */
  private initHeightField(): void {
    const TERRAIN_W = 1400
    const TERRAIN_D = 1800
    const domainSeeds: Record<string, number> = { south: 0, central: 500, east: 1000, west: 1500, north: 2000 }
    const ds = domainSeeds[this.currentDomain] ?? 0
    const toWorldX = (mx: number) => mx + TERRAIN_W / 2
    const toWorldZ = (mz: number) => mz + TERRAIN_D / 2
    const heightAt = (x: number, z: number): number => {
      const dist = Math.sqrt(x * x + z * z)
      const warpX = fbm((x + ds) * 0.005, (z + ds) * 0.005, 3, 2.0, 0.5) * 40
      const warpZ = fbm((x + ds + 100) * 0.005, (z + ds + 100) * 0.005, 3, 2.0, 0.5) * 40
      const detail = (x: number, z: number): number => {
        const n1 = fbm(x * 0.003, z * 0.003, 5, 2.1, 0.5)
        const n2 = fbm(x * 0.02, z * 0.025, 3, 2.2, 0.3) * 0.3
        const n3 = fbm(x * 0.06, z * 0.06, 2, 2.5, 0.4) * 0.12
        return n1 + n2 + n3
      }
      const wx = toWorldX(x + warpX), wz = toWorldZ(z + warpZ)
      const regionH = blendRegionHeight(wx, wz, this.currentDomain, (rx, rz) => detail(rx + ds, rz + ds)) * 1.4
      const edgeNoise = fbm((x + ds) * 0.004, (z + ds) * 0.004, 3, 2.0, 0.5)
      const ridge = dist > 300 ? Math.pow((dist - 300) / 220, 2.2) * (55 + edgeNoise * 75) : 0
      const basin = dist < 200 ? -(200 - dist) * 0.05 * (0.5 + edgeNoise * 0.5) : 0
      const microBump = fbm((x + ds) * 0.08, (z + ds) * 0.08, 2, 2.0, 0.5) * 2.5
      return regionH + ridge + basin + microBump
    }
    ;(this as any)._heightAt = heightAt
  }

  private async initHD2DBackground() {
    const domainDef = getDomainDef(this.currentDomain)
    const bgTint = domainDef?.bgTint ?? 0x1a3b2a

    const VIEW_W = 960
    const VIEW_H = 1360
    const TERRAIN_W = 1400
    const TERRAIN_D = 1800
    const WATER_LEVEL = -8

    const { ThreeBridge: ThreeBridgeClass } = await import('../three-bridge')
    this.threeBridge = new ThreeBridgeClass(this, 720, 1280)

    // 域海拔调色板：水→沙→草→林→岩→雪
    const palettes: Record<string, { water: number; sand: number; grass: number; forest: number; rock: number; snow: number }> = {
      south:  { water: 0x1a4a6a, sand: 0x8a7a5a, grass: 0x2a5a3a, forest: 0x1a4a2a, rock: 0x4a4540, snow: 0xa0b0b0 },
      central:{ water: 0x2a3a5a, sand: 0x9a8a6a, grass: 0x3a5a2a, forest: 0x2a4a1a, rock: 0x5a5045, snow: 0xb0a5a0 },
      east:   { water: 0x1a4a7a, sand: 0x7a8a7a, grass: 0x2a4a4a, forest: 0x1a3a3a, rock: 0x4a5055, snow: 0x8ac0d0 },
      west:   { water: 0x3a3a2a, sand: 0xaa8a5a, grass: 0x4a3a2a, forest: 0x3a2a1a, rock: 0x5a4035, snow: 0xc0a890 },
      north:  { water: 0x1a2a5a, sand: 0x6a7a8a, grass: 0x2a3a4a, forest: 0x1a2a3a, rock: 0x3a4050, snow: 0xb0c0e0 },
    }
    const pal = palettes[this.currentDomain] ?? palettes.south

    // 初始化高度场（2D/3D 共用）
    this.initHeightField()
    const heightAt = (this as any)._heightAt as (x: number, z: number) => number
    const toWorldX = (mx: number) => mx + TERRAIN_W / 2
    const toWorldZ = (mz: number) => mz + TERRAIN_D / 2
    const colorFn = (x: number, z: number, h: number): [number, number, number] => {
      return blendRegionColor(toWorldX(x), toWorldZ(z), h, this.currentDomain)
    }

    this.threeBridge.createTerrain(TERRAIN_W, TERRAIN_D, 400, heightAt, colorFn)

    // 将 2D 地面贴图烘焙到 3D 地形上（优先使用高清像素风贴图）
    const tex = (key: string, fallback1: string, fallback2: string): string =>
      this.textures.exists(key) ? key : (this.textures.exists(fallback1) ? fallback1 : (this.textures.exists(fallback2) ? fallback2 : ''))
    const grassKey = tex('tex_grass', 'ai_grass_hq', 'grass')
    const stoneKey = tex('tex_stone', 'ai_stone_hq', 'stone')
    const waterTexKey = tex('tex_water', 'ai_water_hq', '')
    const extra: { sand?: string; snow?: string; forest?: string } = {}
    const sandK = tex('tex_sand', '', '')
    const snowK = tex('tex_snow', '', '')
    const forestK = tex('tex_forest', '', '')
    if (sandK) extra.sand = sandK
    if (snowK) extra.snow = snowK
    if (forestK) extra.forest = forestK
    if (grassKey || stoneKey) {
      this.threeBridge.applyGroundTexture(grassKey, stoneKey, waterTexKey || undefined, extra)
    }

    // 水面（降低透明度，避免突兀的蓝色平面）
    this.threeBridge.createWater(TERRAIN_W, TERRAIN_D, WATER_LEVEL, pal.water)

    // 昼夜光照
    const daytime = isDaytime(this.worldTime)
    const nightTime = isNight(this.worldTime)
    if (daytime) {
      this.threeBridge.setLightColor(0x6a7a8a, 0xfff5d0, 1.6, false)
    } else if (nightTime) {
      this.threeBridge.setLightColor(0x3a4a6a, 0x7a8aba, 1.0, true)
    } else {
      this.threeBridge.setLightColor(0x4a4a6a, 0xd0b080, 1.2, false)
    }
    this.threeBridge.setFogColor(bgTint, 900, 3000)

    // 在 3D 地形上放置 HD-2D 立面建筑
    this.add3DStandingBuildings()
    // 在 3D 地形上放置道路、植被、神龛、域地形特征
    this.add3DMapElements()

    // 直显模式：Three.js canvas 挂 DOM，Phaser 透明
    this.threeBridge.showInDOM()
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)')
    ;(this as any)._useDirect3D = true

    this.threeBridge.render()

    this.events.once('shutdown', () => {
      if (this.threeBridge) {
        this.threeBridge.destroy()
        this.threeBridge = null
      }
    })
  }

  /** 在 3D 地形上放置竖直立面建筑（HD-2D billboard） */
  private add3DStandingBuildings(): void {
    if (!this.threeBridge) return
    const TERRAIN_W = 1400
    const TERRAIN_D = 1800

    const BUILDING_TEX: Record<string, string> = {
      home: 'ai_bldg_proc_bldg_home',
      city: 'ai_bldg_proc_bldg_city',
      sect: 'ai_bldg_proc_bldg_sect',
      dungeon: 'ai_bldg_proc_bldg_dungeon',
      landmark: 'ai_bldg_proc_bldg_landmark',
    }

    let count = 0
    for (const p of getDomainPoints(this.currentDomain)) {
      const texKey = BUILDING_TEX[p.type] ?? BUILDING_TEX[p.icon]
      if (!texKey || !this.textures.exists(texKey)) continue
      const tx = (p.x / WORLD_MAP_W - 0.5) * TERRAIN_W
      const tz = (p.y / WORLD_MAP_H - 0.5) * TERRAIN_D
      this.threeBridge.addStandingSprite(texKey, tx, tz, 55, 75, 6)
      count++
    }

    // AI 装饰物也放置为 3D 立面
    const AI_DECOS: { key: string; count: number; w: number; h: number }[] = [
      { key: 'ai_deco_proc_waterfall', count: 3, w: 35, h: 50 },
      { key: 'ai_deco_proc_altar', count: 4, w: 30, h: 35 },
      { key: 'ai_deco_proc_bonfire', count: 5, w: 18, h: 28 },
    ]
    let seed = 7777
    const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
    for (const { key, count: cnt, w, h } of AI_DECOS) {
      if (!this.textures.exists(key)) continue
      for (let i = 0; i < cnt; i++) {
        const x = Math.floor(rng() * (WORLD_MAP_W - 80)) + 40
        const y = Math.floor(rng() * (WORLD_MAP_H - 80)) + 40
        const distFromCenter = Math.hypot(x - WORLD_MAP_W / 2, y - WORLD_MAP_H / 2)
        if (distFromCenter < 60) continue
        rng()
        const tx = (x / WORLD_MAP_W - 0.5) * TERRAIN_W
        const tz = (y / WORLD_MAP_H - 0.5) * TERRAIN_D
        this.threeBridge.addStandingSprite(key, tx, tz, w, h, 3)
      }
    }
    ;(this as any)._has3DBuildings = count > 0
  }

  /** 在 3D 地形上放置道路、植被、神龛、域地形特征 */
  private add3DMapElements(): void {
    if (!this.threeBridge) return
    const TERRAIN_W = 1400
    const TERRAIN_D = 1800
    const to3DX = (wx: number) => (wx / WORLD_MAP_W - 0.5) * TERRAIN_W
    const to3DZ = (wy: number) => (wy / WORLD_MAP_H - 0.5) * TERRAIN_D

    // ─── 1. 道路 ───
    this.add3DRoads(to3DX, to3DZ)

    // ─── 2. 散布植被 ───
    this.add3DVegetation(to3DX, to3DZ)

    // ─── 3. AI 神龛 ───
    if (this.textures.exists('ai_shrine')) {
      const regions = getRegionPlan(this.currentDomain)
      const candidates = regions.filter(r => r.density >= 0.7).slice(0, 3)
      for (const r of candidates) {
        const tx = to3DX(r.cx)
        const tz = to3DZ(r.cy + 40)
        this.threeBridge.addStandingSprite('ai_shrine', tx, tz, 36, 48, 2)
      }
    }

    // ─── 4. 域地形特征（山脉/冰墙/沙丘等） ───
    const placements = DOMAIN_TERRAIN_PLACEMENTS[this.currentDomain] ?? []
    for (const p of placements) {
      const key = getTerrainKey(p.type, this.currentDomain)
      if (!this.textures.exists(key)) continue
      const tx = to3DX(p.x)
      const tz = to3DZ(p.y)
      const w = 48 * p.scale
      const h = 64 * p.scale
      this.threeBridge.addStandingSprite(key, tx, tz, w, h, 4)
    }
  }

  /** 3D 道路：在主要节点间铺设 L 型道路贴花 */
  private add3DRoads(to3DX: (x: number) => number, to3DZ: (y: number) => number): void {
    if (!this.threeBridge) return
    const points = getDomainPoints(this.currentDomain)
    const hubs = points.filter(p =>
      p.type === 'city' || p.type === 'sect' || p.type === 'teleport' || p.type === 'domain_gate' || p.type === 'home'
    )
    if (hubs.length < 2) return

    const pathH = getDecoKey('path_h', this.currentDomain)
    const pathV = getDecoKey('path_v', this.currentDomain)
    const pathCross = getDecoKey('path_cross', this.currentDomain)
    const TILE = 48

    for (let i = 0; i < hubs.length; i++) {
      const a = hubs[i]
      const neighbors = hubs
        .filter((_, j) => j !== i)
        .map(b => ({ b, d: Math.hypot(b.x - a.x, b.y - a.y) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, 2)

      for (const n of neighbors) {
        this.add3DRoadSegment(a.x, a.y, n.b.x, n.b.y, TILE, pathH, pathV, pathCross, to3DX, to3DZ)
      }
    }
  }

  /** 3D 道路段：L 型贴花 */
  private add3DRoadSegment(
    x1: number, y1: number, x2: number, y2: number, tile: number,
    pathH: string, pathV: string, pathCross: string,
    to3DX: (x: number) => number, to3DZ: (y: number) => number,
  ): void {
    if (!this.threeBridge) return
    const dx = x2 - x1
    const dy = y2 - y1
    const stepsH = Math.abs(Math.round(dx / tile))
    const stepsV = Math.abs(Math.round(dy / tile))
    const sx = Math.sign(dx)
    const sy = Math.sign(dy)

    // 水平段
    for (let i = 1; i < stepsH; i++) {
      const px = x1 + sx * i * tile
      const key = this.textures.exists(pathH) ? pathH : pathCross
      if (this.textures.exists(key)) {
        this.threeBridge.addTerrainDecal(key, to3DX(px), to3DZ(y1), tile, tile, 0)
      }
    }
    // 垂直段
    for (let i = 0; i <= stepsV; i++) {
      const py = y1 + sy * i * tile
      const key = this.textures.exists(pathV) ? pathV : pathCross
      if (this.textures.exists(key)) {
        this.threeBridge.addTerrainDecal(key, to3DX(x2), to3DZ(py), tile, tile, 0)
      }
    }
    // 转角
    if (stepsH > 0 && stepsV > 0 && this.textures.exists(pathCross)) {
      this.threeBridge.addTerrainDecal(pathCross, to3DX(x1 + sx * stepsH * tile), to3DZ(y1), tile, tile, 0)
    }
  }

  /** 3D 植被：基于区域规划散布 standing sprites */
  private add3DVegetation(to3DX: (x: number) => number, to3DZ: (y: number) => number): void {
    if (!this.threeBridge) return
    let seed = 13713
    const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }

    // AI 高清精灵贴图映射（优先于程序化贴图）
    const AI_SPRITE_MAP: Record<string, string> = {
      pine: 'spr_pine_tree',
      willow: 'spr_willow_tree',
      bamboo: 'spr_bamboo',
      dead_tree: 'spr_dead_tree',
      crystal: 'spr_spirit_crystal',
      lotus_pond: 'spr_lotus_pond',
    }
    const getVegTexKey = (vegType: string): string => {
      const aiKey = AI_SPRITE_MAP[vegType]
      if (aiKey && this.textures.exists(aiKey)) return aiKey
      return getDecoKey(vegType, this.currentDomain)
    }
    const isAiSprite = (vegType: string): boolean =>
      !!(AI_SPRITE_MAP[vegType] && this.textures.exists(AI_SPRITE_MAP[vegType]))

    // 小型植被类型（草/花/小灌木）— 用 billboard
    const SMALL_VEG = ['grass_1', 'grass_2', 'bush_s', 'flower_r', 'flower_y', 'flower_b', 'mushroom']
    // 高山专用植被类型
    const MOUNTAIN_VEG = ['snow_pine', 'alpine_bush']

    // 海拔感知植被选择：高地用山地植物，不复用地表贴图
    const getAltitudeVegType = (wx: number, wy: number): string | null => {
      const h = blendRegionHeight(wx, wy, this.currentDomain, (x: number, z: number) => fbm(x * 0.01, z * 0.01))
      if (h > 45) {
        // 高海拔：雪松为主，间杂高山灌木
        return rng() > 0.35 ? 'snow_pine' : 'alpine_bush'
      }
      // 正常海拔：用区域规划植被
      return getRegionVegType(wx, wy, this.currentDomain)
    }

    // 集群式散布（180个集群，每集群4-10株）
    const numClusters = 180
    for (let c = 0; c < numClusters; c++) {
      const cx = Math.floor(rng() * (WORLD_MAP_W - 80)) + 40
      const cy = Math.floor(rng() * (WORLD_MAP_H - 80)) + 40
      const distFromCenter = Math.hypot(cx - WORLD_MAP_W / 2, cy - WORLD_MAP_H / 2)
      if (distFromCenter < 60) continue

      const vegType = getAltitudeVegType(cx, cy)
      if (!vegType) continue
      const density = getRegionDensity(cx, cy, this.currentDomain)
      if (rng() > density) continue

      const texKey = getVegTexKey(vegType)
      if (!this.textures.exists(texKey)) continue

      const clusterSize = 4 + Math.floor(rng() * 7)
      for (let j = 0; j < clusterSize; j++) {
        const angle = rng() * Math.PI * 2
        const r = 10 + rng() * 55
        const px = cx + Math.cos(angle) * r
        const py = cy + Math.sin(angle) * r
        if (px < 20 || px > WORLD_MAP_W - 20 || py < 20 || py > WORLD_MAP_H - 20) continue

        // 对集群内每株也做海拔判断
        const subVegType = getAltitudeVegType(px, py) || vegType
        const subTexKey = subVegType === vegType ? texKey : (this.textures.exists(getVegTexKey(subVegType)) ? getVegTexKey(subVegType) : texKey)

        const perspScale = 0.7 + (py / WORLD_MAP_H) * 0.5
        const sizeVar = 0.8 + rng() * 0.4
        const isSmall = SMALL_VEG.includes(subVegType)
        const isMountain = MOUNTAIN_VEG.includes(subVegType)
        const aiBoost = isAiSprite(subVegType) ? 1.3 : 1.0
        // 山地植物更大些
        const baseW = isMountain ? 34 : isSmall ? 24 : 32
        const baseH = isMountain ? 44 : isSmall ? 32 : 42
        const w = baseW * perspScale * sizeVar * aiBoost
        const h = baseH * perspScale * sizeVar * aiBoost
        this.threeBridge.addStandingSprite(subTexKey, to3DX(px), to3DZ(py), w, h, 1)
      }
    }

    // 独立小型装饰物（100个，填补空隙）
    for (let i = 0; i < 100; i++) {
      const px = Math.floor(rng() * (WORLD_MAP_W - 80)) + 40
      const py = Math.floor(rng() * (WORLD_MAP_H - 80)) + 40
      const distFromCenter = Math.hypot(px - WORLD_MAP_W / 2, py - WORLD_MAP_H / 2)
      if (distFromCenter < 50) continue

      const vegType = getAltitudeVegType(px, py)
      if (!vegType) continue
      const density = getRegionDensity(px, py, this.currentDomain)
      if (rng() > density * 0.6) continue

      const texKey = getVegTexKey(vegType)
      if (!this.textures.exists(texKey)) continue

      const perspScale = 0.7 + (py / WORLD_MAP_H) * 0.5
      const sizeVar = 0.7 + rng() * 0.5
      const isSmall = SMALL_VEG.includes(vegType)
      const isMountain = MOUNTAIN_VEG.includes(vegType)
      const baseW = isMountain ? 26 : isSmall ? 18 : 22
      const baseH = isMountain ? 34 : isSmall ? 24 : 28
      const w = baseW * perspScale * sizeVar
      const h = baseH * perspScale * sizeVar
      this.threeBridge.addStandingSprite(texKey, to3DX(px), to3DZ(py), w, h, 1)
    }

    // 高山专用散布：在海拔 > 40 的区域密集放置雪松和高山灌木
    for (let i = 0; i < 120; i++) {
      const px = Math.floor(rng() * (WORLD_MAP_W - 80)) + 40
      const py = Math.floor(rng() * (WORLD_MAP_H - 80)) + 40
      const distFromCenter = Math.hypot(px - WORLD_MAP_W / 2, py - WORLD_MAP_H / 2)
      if (distFromCenter < 50) continue
      const h = blendRegionHeight(px, py, this.currentDomain, (x: number, z: number) => fbm(x * 0.01, z * 0.01))
      if (h < 40) continue // 只在海拔 > 40 的区域放置

      const mtnVeg = rng() > 0.4 ? 'snow_pine' : 'alpine_bush'
      const texKey = getVegTexKey(mtnVeg)
      if (!this.textures.exists(texKey)) continue

      const perspScale = 0.7 + (py / WORLD_MAP_H) * 0.5
      const sizeVar = 0.85 + rng() * 0.35
      const baseW = mtnVeg === 'snow_pine' ? 36 : 26
      const baseH = mtnVeg === 'snow_pine' ? 48 : 32
      const w = baseW * perspScale * sizeVar
      const h2 = baseH * perspScale * sizeVar
      this.threeBridge.addStandingSprite(texKey, to3DX(px), to3DZ(py), w, h2, 2)
    }

    // 路旁小石头和草丛装饰
    const rockKey = getDecoKey('rock_s', this.currentDomain)
    const grassKey = getDecoKey('grass_1', this.currentDomain)
    const grassKey2 = getDecoKey('grass_2', this.currentDomain)
    for (let i = 0; i < 60; i++) {
      const px = Math.floor(rng() * (WORLD_MAP_W - 80)) + 40
      const py = Math.floor(rng() * (WORLD_MAP_H - 80)) + 40
      const perspScale = 0.7 + (py / WORLD_MAP_H) * 0.5
      const isRock = rng() > 0.5
      const key = isRock ? rockKey : (rng() > 0.5 ? grassKey : grassKey2)
      if (!this.textures.exists(key)) continue
      const w = (isRock ? 14 : 12) * perspScale
      const h = (isRock ? 16 : 14) * perspScale
      this.threeBridge.addStandingSprite(key, to3DX(px), to3DZ(py), w, h, 0.5)
    }

    // 专用立草散布（350 株，集中在草地区域，更大）
    for (let i = 0; i < 350; i++) {
      const px = Math.floor(rng() * (WORLD_MAP_W - 80)) + 40
      const py = Math.floor(rng() * (WORLD_MAP_H - 80)) + 40
      const distFromCenter = Math.hypot(px - WORLD_MAP_W / 2, py - WORLD_MAP_H / 2)
      if (distFromCenter < 40) continue
      const vegType = getAltitudeVegType(px, py)
      // 只在低海拔草地区域放置
      if (!vegType || !SMALL_VEG.includes(vegType)) continue
      const density = getRegionDensity(px, py, this.currentDomain)
      if (rng() > density * 0.8) continue
      const key = getVegTexKey(vegType)
      if (!this.textures.exists(key)) continue
      const perspScale = 0.7 + (py / WORLD_MAP_H) * 0.5
      const sizeVar = 0.7 + rng() * 0.4
      const w = 16 * perspScale * sizeVar
      const h = 22 * perspScale * sizeVar
      this.threeBridge.addStandingSprite(key, to3DX(px), to3DZ(py), w, h, 0.5)
    }

    // 特殊景观：灵石/岩层 + 莲池（稀疏放置）
    const specials: { key: string; w: number; h: number; count: number }[] = []
    if (this.textures.exists('spr_rock_formation')) {
      specials.push({ key: 'spr_rock_formation', w: 40, h: 44, count: 20 })
    }
    if (this.textures.exists('spr_spirit_crystal')) {
      specials.push({ key: 'spr_spirit_crystal', w: 32, h: 40, count: 15 })
    }
    if (this.textures.exists('spr_lotus_pond')) {
      specials.push({ key: 'spr_lotus_pond', w: 36, h: 36, count: 12 })
    }
    for (const sp of specials) {
      for (let i = 0; i < sp.count; i++) {
        const px = Math.floor(rng() * (WORLD_MAP_W - 80)) + 40
        const py = Math.floor(rng() * (WORLD_MAP_H - 80)) + 40
        const distFromCenter = Math.hypot(px - WORLD_MAP_W / 2, py - WORLD_MAP_H / 2)
        if (distFromCenter < 80) continue
        const perspScale = 0.8 + (py / WORLD_MAP_H) * 0.3
        const sizeVar = 0.85 + rng() * 0.3
        this.threeBridge.addStandingSprite(
          sp.key, to3DX(px), to3DZ(py),
          sp.w * perspScale * sizeVar, sp.h * perspScale * sizeVar, 1,
        )
      }
    }
  }

  /** 添加玩家 3D billboard */
  private addPlayerBillboard(): void {
    if (!this.threeBridge) return
    const frame = this.player.sprite.frame
    if (!frame || !frame.texture) return
    const texKey = frame.texture.key
    const frameName = (frame.name ?? '__BASE') as string
    const [tx, tz] = this.threeBridge.worldTo3D(this.player.sprite.x, this.player.sprite.y, WORLD_MAP_W, WORLD_MAP_H)
    this.threeBridge.addBillboard('player', texKey, frameName, tx, tz, 28, 38, 4)
  }

  /** 每帧同步 3D billboard + 2D 标签投影 */
  private sync3DBillboards(): void {
    if (!this.threeBridge) return
    // 玩家 billboard
    const frame = this.player.sprite.frame
    if (frame && frame.texture) {
      const texKey = frame.texture.key
      const frameName = (frame.name ?? '__BASE') as string
      const [tx, tz] = this.threeBridge.worldTo3D(this.player.sprite.x, this.player.sprite.y, WORLD_MAP_W, WORLD_MAP_H)
      this.threeBridge.updateBillboardFrame('player', texKey, frameName)
      this.threeBridge.updateBillboardPosition('player', tx, tz, 4)
      this.threeBridge.setBillboardFlip('player', this.player.sprite.flipX)
    }

    // NPC billboards + 标签投影
    for (const [npcId, sprite] of this.npcSprites) {
      if (!sprite || !sprite.frame || !sprite.frame.texture) continue
      const npcFrame = sprite.frame
      const npcTexKey = npcFrame.texture.key
      const npcFrameName = (npcFrame.name ?? '__BASE') as string
      const [nx, nz] = this.threeBridge.worldTo3D(sprite.x, sprite.y, WORLD_MAP_W, WORLD_MAP_H)
      if (!this.threeBridge.hasBillboard(`npc_${npcId}`)) {
        this.threeBridge.addBillboard(`npc_${npcId}`, npcTexKey, npcFrameName, nx, nz, 20, 28, 3)
      } else {
        this.threeBridge.updateBillboardFrame(`npc_${npcId}`, npcTexKey, npcFrameName)
        this.threeBridge.updateBillboardPosition(`npc_${npcId}`, nx, nz, 3)
      }
      // 将 3D 位置投影到 2D 屏幕坐标，定位名称标签
      const label = this.npcLabels.get(npcId)
      if (label) {
        const proj = this.threeBridge.project3DTo2D(nx, nz, 34)
        if (proj) {
          label.setPosition(proj.x, proj.y - 4)
          label.setVisible(true)
        } else {
          label.setVisible(false)
        }
      }
    }

    // 投影所有世界空间标签和标记容器
    this.updateProjectableItems()
  }

  /** 注册一个需要 3D→2D 投影的世界空间对象（标签或容器） */
  private registerProjectable(obj: Phaser.GameObjects.Text | Phaser.GameObjects.Container, wx: number, wy: number, yOff: number): void {
    if (!this.threeBridge) {
      obj.setScrollFactor(1)
      return
    }
    obj.setScrollFactor(0)
    this.projectableItems.push({ obj, wx, wy, yOff })
  }

  /** 每帧将所有注册的世界空间对象投影到 2D 屏幕坐标 */
  private updateProjectableItems(): void {
    if (!this.threeBridge) return
    let needsPrune = false
    for (const pi of this.projectableItems) {
      if (!pi.obj.active) { needsPrune = true; continue }
      const [x3d, z3d] = this.threeBridge.worldTo3D(pi.wx, pi.wy, WORLD_MAP_W, WORLD_MAP_H)
      const proj = this.threeBridge.project3DTo2D(x3d, z3d, pi.yOff)
      if (proj) {
        pi.obj.setPosition(proj.x, proj.y).setVisible(true)
      } else {
        pi.obj.setVisible(false)
      }
    }
    if (needsPrune) {
      this.projectableItems = this.projectableItems.filter(pi => pi.obj.active)
    }
  }

  private drawRiver() {
    const pal = this.biomePalette
    const riverColor = pal ? pal.river : 0x2a5a6a
    const riverHi = pal ? pal.riverHighlight : 0x4a8a9a
    // 使用域水域路径绘制河流（不再用 sin/cos 周期函数）
    const waterPaths = DOMAIN_WATER[this.currentDomain]
    if (!waterPaths || waterPaths.length === 0) return

    const g = this.add.graphics().setDepth(0.2)
    g.fillStyle(riverColor, 0.5)
    const g2 = this.add.graphics().setDepth(0.25)
    g2.fillStyle(riverHi, 0.35)

    for (const wp of waterPaths) {
      if (wp.points.length < 2) continue
      const w = wp.type === 'sea' ? 60 : wp.type === 'moat' ? 40 : 28

      for (let i = 0; i < wp.points.length - 1; i++) {
        const p1 = wp.points[i]
        const p2 = wp.points[i + 1]
        // 绘制河段
        g.beginPath()
        g.moveTo(p1[0] - w, p1[1])
        g.lineTo(p2[0] - w, p2[1])
        g.lineTo(p2[0] + w, p2[1])
        g.lineTo(p1[0] + w, p1[1])
        g.closePath()
        g.fillPath()

        // 高光
        const hw = w * 0.5
        g2.fillRect(
          Math.min(p1[0], p2[0]) - hw,
          Math.min(p1[1], p2[1]),
          Math.abs(p2[0] - p1[0]) + hw * 2,
          Math.abs(p2[1] - p1[1]) + 2,
        )
      }
    }
  }

  private renderPoints() {
    for (const p of getDomainPoints(this.currentDomain)) {
      const unlocked = isPointUnlocked(p, this.state)
      const discovered = this.state.discoveredPoints.includes(p.id)

      // 域门始终可见（引导玩家跨域）；其他点位需靠近或已发现
      const alwaysVisible = p.type === 'domain_gate'
      const visible = alwaysVisible || (unlocked && (discovered || this.isNearby(p)))

      if (!visible && !discovered) continue

      // 发现新点位
      if (visible && !discovered) {
        this.state.discoveredPoints.push(p.id)
      }

      const container = this.createPointMarker(p, !unlocked)
      container.setDepth(3)
      this.pointObjects.set(p.id, container)
      this.registerProjectable(container, p.x, p.y, 0)

      // 点位名称
      const label = this.add.text(p.x, p.y - 40, p.name, {
        fontSize: '11px',
        color: unlocked ? '#f0d98c' : '#666',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(4)
      this.registerProjectable(label, p.x, p.y, 40)

      if (!unlocked) label.setAlpha(0.4)
    }
  }

  // ============================================================
  // L2 水域图层：河流、海、护城河、冰河、绿洲
  // ============================================================
  private drawDomainWater(): void {
    this.waterGraphics = this.add.graphics().setDepth(0.5)
    const paths = DOMAIN_WATER[this.currentDomain] ?? []
    for (const wp of paths) {
      this.drawWaterPath(wp)
    }
  }

  private drawWaterPath(wp: WaterPath): void {
    const g = this.waterGraphics
    const pts = wp.points
    if (pts.length < 3) return

    const colors = this.getWaterColors(wp.type)

    // 河流/冰河：沿路径生成左右岸边多边形
    if (wp.type === 'river' || wp.type === 'ice_river') {
      const width = wp.type === 'ice_river' ? 28 : 18
      const left: number[][] = []
      const right: number[][] = []
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[Math.max(0, i - 1)]
        const next = pts[Math.min(pts.length - 1, i + 1)]
        const dx = next[0] - prev[0]
        const dy = next[1] - prev[1]
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len, ny = dx / len // 法线
        left.push([pts[i][0] + nx * width, pts[i][1] + ny * width])
        right.push([pts[i][0] - nx * width, pts[i][1] - ny * width])
      }
      // 水面主体
      g.fillStyle(colors.fill, 0.8)
      g.beginPath()
      g.moveTo(left[0][0], left[0][1])
      for (let i = 1; i < left.length; i++) g.lineTo(left[i][0], left[i][1])
      for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1])
      g.closePath()
      g.fillPath()
      // 深水中线
      g.fillStyle(colors.deep, 0.35)
      const innerW = width * 0.5
      g.beginPath()
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[Math.max(0, i - 1)]
        const next = pts[Math.min(pts.length - 1, i + 1)]
        const dx = next[0] - prev[0], dy = next[1] - prev[1]
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len, ny = dx / len
        const lx = pts[i][0] + nx * innerW, ly = pts[i][1] + ny * innerW
        if (i === 0) g.moveTo(lx, ly)
        else g.lineTo(lx, ly)
      }
      for (let i = pts.length - 1; i >= 0; i--) {
        const prev = pts[Math.max(0, i - 1)]
        const next = pts[Math.min(pts.length - 1, i + 1)]
        const dx = next[0] - prev[0], dy = next[1] - prev[1]
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len, ny = dx / len
        g.lineTo(pts[i][0] - nx * innerW, pts[i][1] - ny * innerW)
      }
      g.closePath()
      g.fillPath()
      // 边缘高光
      g.lineStyle(2, colors.edge, 0.4)
      g.beginPath()
      g.moveTo(left[0][0], left[0][1])
      for (let i = 1; i < left.length; i++) g.lineTo(left[i][0], left[i][1])
      g.strokePath()
      g.beginPath()
      g.moveTo(right[0][0], right[0][1])
      for (let i = 1; i < right.length; i++) g.lineTo(right[i][0], right[i][1])
      g.strokePath()
      // 波纹点
      for (let i = 0; i < pts.length - 1; i++) {
        g.fillStyle(colors.shine, 0.35)
        g.fillCircle(pts[i][0] + 3, pts[i][1] - 2, 2.5)
        g.fillCircle(pts[i][0] - 4, pts[i][1] + 3, 1.8)
      }
      return
    }

    // 海域/护城河/绿洲：多边形填充
    g.fillStyle(colors.fill, 0.75)
    g.beginPath()
    g.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1])
    g.closePath()
    g.fillPath()

    // 深水层（内缩）
    g.fillStyle(colors.deep, 0.4)
    g.beginPath()
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
    for (let i = 0; i < pts.length; i++) {
      const ix = cx + (pts[i][0] - cx) * 0.7
      const iy = cy + (pts[i][1] - cy) * 0.7
      if (i === 0) g.moveTo(ix, iy)
      else g.lineTo(ix, iy)
    }
    g.closePath()
    g.fillPath()

    // 边缘高光
    g.lineStyle(3, colors.edge, 0.5)
    g.beginPath()
    g.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1])
    g.closePath()
    g.strokePath()
  }

  private getWaterColors(type: string): { fill: number; deep: number; edge: number; shine: number } {
    switch (type) {
      case 'sea':
        return { fill: 0x2a6a9a, deep: 0x1a4a7a, edge: 0x4a9aca, shine: 0x7ac4f0 }
      case 'ice_river':
        return { fill: 0x6a9aba, deep: 0x4a7a9a, edge: 0xaac4e4, shine: 0xe0f0ff }
      case 'moat':
        return { fill: 0x2a5a7a, deep: 0x1a3a5a, edge: 0x4a8aaa, shine: 0x6ab4d0 }
      case 'oasis':
        return { fill: 0x2a7a5a, deep: 0x1a5a3a, edge: 0x4aaa7a, shine: 0x7ad4a0 }
      default:
        return { fill: 0x2a5a7a, deep: 0x1a3a5a, edge: 0x4a8aaa, shine: 0x7ac4f0 }
    }
  }

  private updateWaterAnimation(): void {
    if (!this.waterGraphics || !this.waterGraphics.active) return
    const t = this.time.now * 0.001
    const paths = DOMAIN_WATER[this.currentDomain] ?? []
    for (const wp of paths) {
      if (wp.type !== 'river' && wp.type !== 'ice_river' && wp.type !== 'sea') continue
      const colors = this.getWaterColors(wp.type)
      const pts = wp.points
      for (let i = 0; i < pts.length - 1; i++) {
        const wave = Math.sin(t * 2 + i * 0.5)
        if (wave > 0.7) {
          this.waterGraphics.fillStyle(colors.shine, wave * 0.3)
          const x = pts[i][0] + Math.sin(t + i) * 4
          const y = pts[i][1] + Math.cos(t + i) * 3
          this.waterGraphics.fillCircle(x, y, 1.5)
        }
      }
    }
  }

  // ============================================================
  // L1 地形特征层：山脉、岩柱、冰墙、沙丘等
  // ============================================================
  private drawDomainTerrain(): void {
    this.terrainObjects = []
    const placements = DOMAIN_TERRAIN_PLACEMENTS[this.currentDomain] ?? []
    for (const p of placements) {
      const key = getTerrainKey(p.type, this.currentDomain)
      if (!this.textures.exists(key)) continue

      // 阴影
      const shadowW = 24 * p.scale
      const shadowH = 8 * p.scale
      const shadow = this.add.ellipse(p.x + 2, p.y + shadowH * 0.5, shadowW, shadowH, 0x000000, 0.25)
      shadow.setDepth(0.6)

      // 主体（depth 0.7-0.9，在水域之上、植被之下）
      const img = this.add.image(p.x, p.y, key).setOrigin(0.5, 1)
      img.setScale(p.scale)
      img.setDepth(0.7 + (p.y / WORLD_MAP_H) * 0.2)
      this.terrainObjects.push(img)
    }
  }

  /** 放置 AI 神龛装饰（灵气汇聚点） */
  private placeAiShrines(): void {
    if (!this.textures.exists('ai_shrine')) return
    const regions = getRegionPlan(this.currentDomain)
    // 在高密度区域中心放置神龛（最多 3 个）
    const candidates = regions.filter(r => r.density >= 0.7).slice(0, 3)
    for (const r of candidates) {
      const shrine = this.add.image(r.cx, r.cy + 40, 'ai_shrine')
      shrine.setDisplaySize(48, 48).setOrigin(0.5, 1).setDepth(2.5).setAlpha(0.7)
      // 呼吸光效
      this.tweens.add({
        targets: shrine,
        alpha: 0.5,
        duration: 2000 + (r.cx % 1000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }
  }

  /** 在主要点位之间绘制道路（HD-2D 像素路径） */
  private drawRoads(): void {
    const points = getDomainPoints(this.currentDomain)
    // 主要节点：城市、宗门、传送阵、域门
    const hubs = points.filter(p =>
      p.type === 'city' || p.type === 'sect' || p.type === 'teleport' || p.type === 'domain_gate' || p.type === 'home'
    )
    if (hubs.length < 2) return

    const pathKey = getDecoKey('path_h', this.currentDomain)
    if (!this.textures.exists(pathKey)) return

    const TILE = 48
    // 连接每个 hub 到最近的 2 个 hub
    for (let i = 0; i < hubs.length; i++) {
      const a = hubs[i]
      // 找最近的 2 个
      const neighbors = hubs
        .filter((_, j) => j !== i)
        .map(b => ({ b, d: Math.hypot(b.x - a.x, b.y - a.y) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, 2)

      for (const n of neighbors) {
        this.drawRoadSegment(a.x, a.y, n.b.x, n.b.y, TILE)
      }
    }
  }

  /** 在两点间铺设 L 型道路 */
  private drawRoadSegment(x1: number, y1: number, x2: number, y2: number, tile: number): void {
    const pathH = getDecoKey('path_h', this.currentDomain)
    const pathV = getDecoKey('path_v', this.currentDomain)
    const pathCross = getDecoKey('path_cross', this.currentDomain)
    const rockKey = getDecoKey('rock_s', this.currentDomain)
    const grassKey = getDecoKey('grass_1', this.currentDomain)

    // 先水平后垂直（L 型）
    const dx = x2 - x1
    const dy = y2 - y1
    const stepsH = Math.abs(Math.round(dx / tile))
    const stepsV = Math.abs(Math.round(dy / tile))
    const sx = Math.sign(dx)
    const sy = Math.sign(dy)

    // 水平段
    for (let i = 1; i < stepsH; i++) {
      const px = x1 + sx * i * tile
      const key = this.textures.exists(pathH) ? pathH : pathCross
      if (this.textures.exists(key)) {
        const img = this.add.image(px, y1, key).setOrigin(0.5, 0.5).setDepth(0.9)
        img.setAlpha(0.6)
        this.decoObjects.push(img)
      }
      // 路旁装饰（每隔 2 格放小石头/草丛）
      if (i % 3 === 0) {
        const side = i % 2 === 0 ? -1 : 1
        if (this.textures.exists(rockKey)) {
          const r = this.add.image(px + side * 18, y1 + 14, rockKey).setOrigin(0.5, 1).setDepth(0.95)
          r.setAlpha(0.5).setScale(0.35)
          this.decoObjects.push(r)
        }
        if (this.textures.exists(grassKey)) {
          const g = this.add.image(px - side * 16, y1 - 14, grassKey).setOrigin(0.5, 1).setDepth(0.95)
          g.setAlpha(0.5).setScale(0.3)
          this.decoObjects.push(g)
        }
      }
    }
    // 垂直段
    for (let i = 0; i <= stepsV; i++) {
      const py = y1 + sy * i * tile
      const key = this.textures.exists(pathV) ? pathV : pathCross
      if (this.textures.exists(key)) {
        const img = this.add.image(x2, py, key).setOrigin(0.5, 0.5).setDepth(0.9)
        img.setAlpha(0.6)
        this.decoObjects.push(img)
      }
      // 路旁装饰
      if (i % 3 === 0 && i > 0) {
        const side = i % 2 === 0 ? -1 : 1
        if (this.textures.exists(grassKey)) {
          const g = this.add.image(x2 + side * 18, py, grassKey).setOrigin(0.5, 1).setDepth(0.95)
          g.setAlpha(0.5).setScale(0.3)
          this.decoObjects.push(g)
        }
        if (this.textures.exists(rockKey)) {
          const r = this.add.image(x2 - side * 16, py, rockKey).setOrigin(0.5, 1).setDepth(0.95)
          r.setAlpha(0.5).setScale(0.35)
          this.decoObjects.push(r)
        }
      }
    }
    // 转角处用 cross
    if (stepsH > 0 && stepsV > 0 && this.textures.exists(pathCross)) {
      const img = this.add.image(x1 + sx * stepsH * tile, y1, pathCross).setOrigin(0.5, 0.5).setDepth(0.9)
      img.setAlpha(0.6)
      this.decoObjects.push(img)
    }
  }

  private createPointMarker(p: WorldPoint, locked: boolean): Phaser.GameObjects.Container {
    const iconKey = getWorldIconKey(p.type)
    const colors: Record<string, number> = {
      home: 0x48e08a, city: 0xffd54a, dungeon: 0xff6b6b,
      dungeon_xian: 0xaf7ac5, resource: 0x5dade2,
      teleport: 0xbb8fce, landmark: 0xf0c987,
      sect: 0xfbbf24, domain_gate: 0x60a5fa,
    }
    const color = colors[p.type] || colors[p.icon] || 0xffffff

    const children: Phaser.GameObjects.GameObject[] = []

    // 建筑型点位使用 HD-2D 建筑贴图（不使用简单图标/圆圈）
    const BUILDING_DECO: Record<string, string> = {
      home: 'bldg_home',
      city: 'bldg_city',
      sect: 'bldg_sect',
      dungeon: 'bldg_dungeon',
      dungeon_xian: 'bldg_dungeon',
      landmark: 'bldg_landmark',
    }
    const bldgType = BUILDING_DECO[p.type] ?? BUILDING_DECO[p.icon]
    if (bldgType) {
      // 优先使用 AI 处理贴图，其次程序化贴图
      const aiKey = `ai_bldg_proc_${bldgType}`
      const procKey = getDecoKey(bldgType, this.currentDomain)
      const useAi = this.textures.exists(aiKey)
      const bldgKey = useAi ? aiKey : procKey
      if (this.textures.exists(bldgKey)) {
        const has3D = (this as any)._has3DBuildings === true && useAi
        // Y 轴透视缩放
        const yRatio = p.y / WORLD_MAP_H
        const bldgScale = useAi ? (0.28 + yRatio * 0.08) : (1.4 + yRatio * 0.4)
        const shadowSize = useAi ? 1.0 : (bldgScale / 1.6)
        // 方向阴影 + 接地暗影（3D 模式跳过 — 由 3D 地形提供）
        if (!has3D) {
          const shadow = this.add.ellipse(4, 8, 60 * shadowSize, 18 * shadowSize, 0x000000, 0.42)
          children.push(shadow)
          const groundShadow = this.add.ellipse(0, 4, 44 * shadowSize, 10 * shadowSize, 0x000000, 0.25)
          children.push(groundShadow)
        }
        // 外圈光晕
        const glow = this.add.circle(0, -16, 40, color, 0.12)
        children.push(glow)
        const glow2 = this.add.circle(0, -16, 28, color, 0.18)
        children.push(glow2)
        // 建筑贴图（3D 立面版本存在时跳过 2D 渲染）
        let bldg: Phaser.GameObjects.Image | null = null
        if (!has3D) {
          const bldgOriginY = useAi ? 0.65 : 0.6
          bldg = this.add.image(0, -10, bldgKey).setOrigin(0.5, bldgOriginY)
          bldg.setScale(bldgScale)
          children.push(bldg)
        }
        // 小图标指示器（建筑上方）
        if (this.textures.exists(iconKey)) {
          const indicator = this.add.image(0, -48, iconKey).setOrigin(0.5, 0.5)
          indicator.setScale(0.5)
          children.push(indicator)
        }

        const container = this.add.container(p.x, p.y, children).setDepth(3)

        if (locked) {
          container.setAlpha(0.35)
        } else {
          // 呼吸光晕
          this.tweens.add({ targets: glow, alpha: 0.25, duration: 1500 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
          this.tweens.add({ targets: glow2, alpha: 0.35, duration: 1100 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
          // 建筑轻微浮动（仅 2D 版本）
          if (bldg) {
            this.tweens.add({ targets: bldg, y: -12, duration: 2500 + Math.random() * 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
          }
        }
        return container
      }
    }

    if (this.textures.exists(iconKey)) {
      // 底部投影
      const shadow = this.add.ellipse(0, 2, 36, 12, 0x000000, 0.35)
      children.push(shadow)
      // 外圈光晕
      const glow = this.add.circle(0, -8, 28, color, 0.15)
      children.push(glow)
      const glow2 = this.add.circle(0, -8, 20, color, 0.2)
      children.push(glow2)
      // 精灵图标（48×48 原始尺寸，scale 1.0 显示）
      const spr = this.add.image(0, -12, iconKey).setOrigin(0.5, 0.5)
      children.push(spr)

      const container = this.add.container(p.x, p.y, children).setDepth(3)

      if (locked) {
        container.setAlpha(0.3)
      } else {
        // 呼吸光晕
        this.tweens.add({ targets: glow, alpha: 0.35, duration: 1200 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
        this.tweens.add({ targets: glow2, alpha: 0.45, duration: 900 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
        // 轻微上下浮动
        this.tweens.add({ targets: spr, y: -14, duration: 2000 + Math.random() * 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
        if (p.type === 'teleport' || p.type === 'domain_gate') {
          this.tweens.add({ targets: spr, angle: 360, duration: 6000, repeat: -1 })
        }
      }
      return container
    }

    // 兜底：Graphics 绘制
    const g = this.add.graphics()
    // 外圈光晕
    g.fillStyle(color, 0.15)
    g.fillCircle(0, 0, 22)
    // 内圈
    g.lineStyle(2, color, 0.9)
    g.strokeCircle(0, 0, 14)
    g.fillStyle(color, 0.3)
    g.fillCircle(0, 0, 14)
    // 中心点
    g.fillStyle(color, 0.95)
    g.fillCircle(0, 0, 5)
    // 特殊图标
    switch (p.type) {
      case 'home':
        g.fillStyle(0x48e08a, 0.9)
        g.fillRect(-4, -6, 8, 10)
        g.beginPath()
        g.moveTo(-7, -6); g.lineTo(0, -11); g.lineTo(7, -6)
        g.closePath()
        g.fillPath()
        break
      case 'city':
        g.fillStyle(0xffd54a, 0.9)
        g.fillRect(-6, -4, 5, 8)
        g.fillRect(1, -2, 5, 6)
        g.fillRect(-2, 4, 4, 2)
        break
      case 'dungeon':
        g.fillStyle(0xff6b6b, 0.9)
        g.beginPath()
        g.moveTo(-8, 5); g.lineTo(-5, -5); g.lineTo(5, -5); g.lineTo(8, 5)
        g.closePath()
        g.fillPath()
        break
      case 'resource':
        g.fillStyle(0x5dade2, 0.9)
        g.beginPath()
        g.moveTo(0, -7); g.lineTo(5, 0); g.lineTo(0, 7); g.lineTo(-5, 0)
        g.closePath()
        g.fillPath()
        break
      case 'teleport':
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2
          g.fillStyle(0xbb8fce, 0.9)
          g.fillCircle(Math.cos(a) * 10, Math.sin(a) * 10, 3)
        }
        break
      case 'landmark':
        g.fillStyle(0xf0c987, 0.9)
        g.beginPath()
        g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(-6, 6)
        g.closePath()
        g.fillPath()
        break
      case 'sect':
        g.fillStyle(0xfbbf24, 0.9)
        g.fillRect(-6, -6, 12, 12)
        g.fillStyle(0x1a1a2e, 0.8)
        g.fillRect(-3, -3, 6, 6)
        break
      case 'domain_gate':
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3
          g.fillStyle(0x60a5fa, 0.9)
          g.fillCircle(Math.cos(a) * 12, Math.sin(a) * 12, 4)
        }
        g.lineStyle(2, 0x60a5fa, 0.7)
        g.strokeCircle(0, 0, 12)
        break
    }

    const container = this.add.container(p.x, p.y, [g]).setDepth(3)

    if (locked) {
      g.setAlpha(0.3)
    } else {
      // 动画
      this.tweens.add({ targets: g, alpha: 0.6, duration: 800 + Math.random() * 400, yoyo: true, repeat: -1 })
      if (p.type === 'teleport') {
        this.tweens.add({ targets: g, angle: 360, duration: 4000, repeat: -1 })
      }
    }

    return container
  }

  private isNearby(p: WorldPoint): boolean {
    const px = this.state.worldPlayerX || 600
    const py = this.state.worldPlayerY || 1350
    return Phaser.Math.Distance.Between(px, py, p.x, p.y) < 100
  }

  private renderAiSects() {
    this.aiSectMarkers = []
    if (!this.state.aiSects || this.state.aiSects.length === 0) return
    for (const ai of this.state.aiSects) {
      if (ai.defeated) continue
      const g = this.add.graphics()
      g.fillStyle(ai.color, 0.15)
      g.fillCircle(0, 0, 26)
      g.lineStyle(3, ai.color, 0.9)
      g.strokeCircle(0, 0, 16)
      g.fillStyle(ai.color, 0.5)
      g.fillCircle(0, 0, 16)
      g.fillStyle(ai.color, 0.95)
      g.fillCircle(0, 0, 6)
      // 战旗
      g.fillStyle(ai.color, 0.8)
      g.fillRect(-1, -20, 2, 8)
      g.beginPath()
      g.moveTo(0, -20); g.lineTo(7, -17); g.lineTo(0, -14)
      g.closePath(); g.fillPath()

      const container = this.add.container(ai.mapX, ai.mapY, [g]).setDepth(3)
      this.tweens.add({ targets: g, alpha: 0.6, duration: 1000, yoyo: true, repeat: -1 })
      this.registerProjectable(container, ai.mapX, ai.mapY, 0)

      const status = ai.atWar ? '⚔' : ai.alliance ? '★' : ai.tradeAgreement ? '◆' : ''
      const label = this.add.text(ai.mapX, ai.mapY - 30, `${ai.name}${status}`, {
        fontSize: '10px', color: `#${ai.color.toString(16).padStart(6, '0')}`,
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(4)
      this.registerProjectable(label, ai.mapX, ai.mapY, 30)

      this.aiSectMarkers.push({ id: ai.id, container, label })
    }
  }

  private renderResourceNodes() {
    this.resourceNodeMarkers = []
    if (!this.state.resourceNodes || this.state.resourceNodes.length === 0) return
    const typeColors: Record<string, number> = {
      spirit_mine: 0xfbbf24, herb_field: 0x34d399, ore_vein: 0x94a3b8,
      wood_forest: 0x84cc16, spirit_spring: 0x06b6d4,
    }
    const typeIcons: Record<string, string> = {
      spirit_mine: '石', herb_field: '草', ore_vein: '矿',
      wood_forest: '木', spirit_spring: '泉',
    }
    for (const node of this.state.resourceNodes) {
      const color = typeColors[node.type] || 0xffffff
      const isContested = node.contested
      const g = this.add.graphics()
      // 争夺中：红色外圈
      if (isContested) {
        g.fillStyle(0xff0000, 0.1)
        g.fillCircle(0, 0, 24)
        g.lineStyle(2, 0xff0000, 0.6)
        g.strokeCircle(0, 0, 20)
      }
      g.fillStyle(color, 0.12)
      g.fillCircle(0, 0, 18)
      g.lineStyle(1.5, color, 0.7)
      g.strokeCircle(0, 0, 10)
      g.fillStyle(color, 0.9)
      g.fillCircle(0, 0, 3)

      const container = this.add.container(node.x, node.y, [g]).setDepth(2.5)
      this.tweens.add({ targets: g, alpha: 0.5, duration: isContested ? 500 : 1200, yoyo: true, repeat: -1 })
      this.registerProjectable(container, node.x, node.y, 0)

      const ownerTag = node.ownerId === 'player' ? '[我]' : node.ownerId ? '[敌]' : '[无主]'
      const contestTag = isContested ? '⚔' : ''
      const label = this.add.text(node.x, node.y - 20, `${typeIcons[node.type]}${ownerTag}${contestTag}`, {
        fontSize: '8px', color: `#${(isContested ? 0xff6b6b : color).toString(16).padStart(6, '0')}`,
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(3)
      this.registerProjectable(label, node.x, node.y, 20)

      this.resourceNodeMarkers.push({ id: node.id, container, label })
    }
  }

  private createMiniMap() {
    const mmW = 80, mmH = 112
    const mmX = this.cameras.main.width - mmW - 10
    const mmY = 40
    const scaleX = mmW / WORLD_MAP_W
    const scaleY = mmH / WORLD_MAP_H

    this.miniMapBg = this.add.rectangle(mmX + mmW / 2, mmY + mmH / 2, mmW + 4, mmH + 4, 0x000000, 0.7)
      .setOrigin(0.5).setDepth(90).setScrollFactor(0)

    // 地形层（只绘制一次）
    this.miniMapTerrain = this.add.graphics().setDepth(90.5).setScrollFactor(0)
    this.drawMiniMapTerrain(mmX, mmY, mmW, mmH, scaleX, scaleY)

    // 动态层（点位 + 玩家位置，定期刷新）
    this.miniMap = this.add.graphics().setDepth(91).setScrollFactor(0)
    this.drawMiniMapPoints(mmX, mmY, scaleX, scaleY)
  }

  /** 绘制小地图地形背景：采样区域配色 + 水域 + 地形特征 */
  private drawMiniMapTerrain(mmX: number, mmY: number, mmW: number, mmH: number, scaleX: number, scaleY: number): void {
    const g = this.miniMapTerrain
    g.clear()

    // 1. 采样地形颜色（每 20 世界单位采样一次）
    const STEP = 20
    const cellW = Math.ceil(STEP * scaleX) + 1
    const cellH = Math.ceil(STEP * scaleY) + 1
    for (let wy = 0; wy < WORLD_MAP_H; wy += STEP) {
      for (let wx = 0; wx < WORLD_MAP_W; wx += STEP) {
        const h = blendRegionHeight(wx, wy, this.currentDomain, (x, z) => fbm(x * 0.01, z * 0.01))
        const [r, gC, b] = blendRegionColor(wx, wy, h, this.currentDomain)
        const hex = ((Math.min(255, Math.floor(r * 255)) << 16) |
                     (Math.min(255, Math.floor(gC * 255)) << 8) |
                     Math.min(255, Math.floor(b * 255)))
        g.fillStyle(hex, 0.85)
        g.fillRect(mmX + wx * scaleX, mmY + wy * scaleY, cellW, cellH)
      }
    }

    // 2. 绘制水域
    const waterPaths = DOMAIN_WATER[this.currentDomain] ?? []
    for (const wp of waterPaths) {
      const wColor = wp.type === 'river' ? 0x2a6a8a : wp.type === 'sea' ? 0x1a5a8a
        : wp.type === 'ice_river' ? 0x6a9aba : wp.type === 'oasis' ? 0x2a7a5a : 0x2a5a7a
      g.fillStyle(wColor, 0.75)
      const pts = wp.points.map(([x, y]) => ({ x: mmX + x * scaleX, y: mmY + y * scaleY }))
      if (pts.length >= 3) {
        g.beginPath()
        g.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
        g.closePath()
        g.fillPath()
      }
    }

    // 3. 绘制地形特征点（山脉、岩柱、冰墙等）
    const placements = DOMAIN_TERRAIN_PLACEMENTS[this.currentDomain] ?? []
    for (const p of placements) {
      const isMountain = p.type.startsWith('mountain')
      const isRock = p.type.startsWith('rock') || p.type === 'beacon' || p.type === 'war_monument'
      const isIce = p.type.startsWith('ice') || p.type === 'snow_patch' || p.type === 'frozen_beast'
      const isSand = p.type === 'sand_dune' || p.type === 'cactus'
      const color = isMountain ? 0x5a5a50 : isRock ? 0x8a7a5a : isIce ? 0x9ac4e4 : isSand ? 0xcab46a : 0x666666
      g.fillStyle(color, 0.8)
      g.fillCircle(mmX + p.x * scaleX, mmY + p.y * scaleY, Math.max(1, p.scale * 0.5))
    }

    // 4. 绘制道路连线（灰色细线）
    const hubs = getDomainPoints(this.currentDomain).filter(p =>
      p.type === 'city' || p.type === 'sect' || p.type === 'teleport' || p.type === 'domain_gate' || p.type === 'home'
    )
    g.lineStyle(1, 0x6a6a5a, 0.4)
    for (let i = 0; i < hubs.length; i++) {
      const a = hubs[i]
      const neighbors = hubs.filter((_, j) => j !== i)
        .map(b => ({ b, d: Math.hypot(b.x - a.x, b.y - a.y) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, 2)
      for (const n of neighbors) {
        g.beginPath()
        g.moveTo(mmX + a.x * scaleX, mmY + a.y * scaleY)
        g.lineTo(mmX + n.b.x * scaleX, mmY + n.b.y * scaleY)
        g.strokePath()
      }
    }
  }

  /** 绘制小地图上的已发现点位和玩家位置 */
  private drawMiniMapPoints(mmX: number, mmY: number, scaleX: number, scaleY: number): void {
    this.miniMap.clear()
    const colors: Record<string, number> = {
      home: 0x48e08a, city: 0xffd54a, dungeon: 0xff6b6b,
      dungeon_xian: 0xaf7ac5, resource: 0x5dade2,
      teleport: 0xbb8fce, landmark: 0xf0c987,
      sect: 0xfbbf24, domain_gate: 0x60a5fa,
    }
    for (const p of getDomainPoints(this.currentDomain)) {
      if (!this.state.discoveredPoints.includes(p.id)) continue
      this.miniMap.fillStyle(colors[p.type] || colors[p.icon] || 0xffffff, 0.9)
      this.miniMap.fillCircle(mmX + p.x * scaleX, mmY + p.y * scaleY, 2)
    }
    this.miniMap.fillStyle(0xffffff, 1)
    this.miniMap.fillCircle(mmX + this.player.sprite.x * scaleX, mmY + this.player.sprite.y * scaleY, 2.5)
  }

  private updateMiniMap() {
    const mmW = 80, mmH = 112
    const mmX = this.cameras.main.width - mmW - 10
    const mmY = 40
    const scaleX = mmW / WORLD_MAP_W
    const scaleY = mmH / WORLD_MAP_H
    this.drawMiniMapPoints(mmX, mmY, scaleX, scaleY)
  }

  // ===== NPC 精灵管理 =====

  private spawnNpcSprite(npc: ProceduralNpc): void {
    if (this.npcSprites.has(npc.id)) return

    const tex = getOrCreateNpcTexture(this, npc)
    if (!tex) return

    const sprite = this.add.sprite(npc.location.x, npc.location.y, tex.key).setDepth(5)
    sprite.setScale(1.0)
    sprite.setInteractive({ useHandCursor: true })
    // 3D 直显模式下隐藏 2D NPC 精灵（用 3D billboard 替代）
    if ((this as any)._useDirect3D) sprite.setVisible(false)

    // 名称标签
    const realmNames = ['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫']
    const morality = npc.morality > 20 ? '#4ade80' : npc.morality < -20 ? '#f87171' : '#e2e8f0'
    const label = this.add.text(npc.location.x, npc.location.y - 22, `${npc.name}·${realmNames[npc.realm]}`, {
      fontSize: '8px', color: morality, stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(6)
    label.setScrollFactor((this as any)._useDirect3D ? 0 : 1)

    sprite.setDepth(5)

    this.npcSprites.set(npc.id, sprite)
    this.npcLabels.set(npc.id, label)

    // HD-2D：创建 NPC 阴影椭圆（3D 模式下隐藏）
    this.createNpcShadow(npc.id, sprite.x, sprite.y)
    if ((this as any)._useDirect3D) {
      this.npcShadows.get(npc.id)?.setVisible(false)
    }
  }

  private updateNpcSprites(): void {
    const visionR = getVisionRadius(this.state.realm) + getMountVisionBonus(this.state)
    const px = this.player.sprite.x
    const py = this.player.sprite.y

    // 移除已死亡或远离的NPC精灵
    for (const [id, sprite] of this.npcSprites) {
      const npc = this.state.proceduralNpcs.find(n => n.id === id)
      if (!npc || !npc.alive || !npc.isActive) {
        sprite.destroy()
        this.npcLabels.get(id)?.destroy()
        this.npcShadows.get(id)?.destroy()
        this.npcShadows.delete(id)
        this.npcSprites.delete(id)
        this.npcLabels.delete(id)
        this.threeBridge?.removeBillboard(`npc_${id}`)
      }
    }

    // 添加新NPC精灵或更新已有精灵
    for (const npc of this.state.proceduralNpcs) {
      if (!npc.alive || !npc.isActive) continue
      if (this.npcSprites.has(npc.id)) {
        // 更新位置
        const sprite = this.npcSprites.get(npc.id)!
        const label = this.npcLabels.get(npc.id)
        sprite.setPosition(npc.location.x, npc.location.y)
        label?.setPosition(npc.location.x, npc.location.y - 22)

        // 视野外NPC隐藏，视野内NPC渐显
        const dist = Math.hypot(npc.location.x - px, npc.location.y - py)
        if (dist > visionR) {
          // 视野外：完全隐藏（迷雾遮挡）
          sprite.setAlpha(0)
          label?.setAlpha(0)
        } else if (dist > visionR * 0.7) {
          // 视野边缘：渐隐
          const edgeAlpha = Math.max(0, 1 - (dist - visionR * 0.7) / (visionR * 0.3))
          sprite.setAlpha(edgeAlpha)
          label?.setAlpha(edgeAlpha)
        } else {
          // 视野内：完全可见
          sprite.setAlpha(1)
          label?.setAlpha(1)
        }
      } else {
        this.spawnNpcSprite(npc)
        // 新生成的NPC检查视野
        const sprite = this.npcSprites.get(npc.id)
        const label = this.npcLabels.get(npc.id)
        if (sprite) {
          const dist = Math.hypot(npc.location.x - px, npc.location.y - py)
          if (dist > visionR) {
            sprite.setAlpha(0)
            label?.setAlpha(0)
          }
        }
      }
    }
  }

  private moveNpcs(delta: number): void {
    const hour = this.worldTime.hour
    for (const npc of this.state.proceduralNpcs) {
      if (!npc.alive || !npc.isActive) continue
      // Phase 5: 日程驱动的NPC移动
      updateNpcBySchedule(npc, hour)
      // NPC间随机游走叠加
      moveNpc(npc, delta * 0.3)
    }

    // Phase 5: NPC行为效果结算（每10秒）
    this.npcBehaviorTimer += delta
    if (this.npcBehaviorTimer >= 10000) {
      const elapsed = this.npcBehaviorTimer
      this.npcBehaviorTimer = 0
      for (const npc of this.state.proceduralNpcs) {
        if (!npc.alive || !npc.isActive) continue
        const action = updateNpcBySchedule(npc, this.worldTime.hour)
        const msg = applyScheduleEffect(npc, action, elapsed)
        if (msg && Math.random() < 0.3) {
          toast(msg, '#a3e4d7')
        }
      }
    }
  }

  // ===== 动态元素管理 =====

  private renderDynamicElements(): void {
    // 清除旧元素
    for (const [, container] of this.dynamicElementContainers) {
      container.destroy()
    }
    this.dynamicElementContainers.clear()

    const typeColors: Record<string, number> = {
      herb: 0x34d399, ore: 0x94a3b8, beast: 0xf87171,
      rumor: 0xfbbf24, insight: 0xaf7ac5, npc_encounter: 0x60a5fa,
    }
    const typeIcons: Record<string, string> = {
      herb: '药', ore: '矿', beast: '兽', rumor: '卷', insight: '悟', npc_encounter: '人',
    }

    for (const elem of this.dynamicElements) {
      if (elem.collected) continue
      const color = typeColors[elem.type] || 0xffffff
      const g = this.add.graphics()
      g.fillStyle(color, 0.15)
      g.fillCircle(0, 0, 14)
      g.lineStyle(1.5, color, 0.7)
      g.strokeCircle(0, 0, 8)
      g.fillStyle(color, 0.9)
      g.fillCircle(0, 0, 3)

      const container = this.add.container(elem.x, elem.y, [g]).setDepth(2)
      this.tweens.add({ targets: g, alpha: 0.4, duration: 1000 + Math.random() * 500, yoyo: true, repeat: -1 })
      this.registerProjectable(container, elem.x, elem.y, 0)

      const label = this.add.text(elem.x, elem.y - 14, typeIcons[elem.type] || '?', {
        fontSize: '7px', color: `#${color.toString(16).padStart(6, '0')}`,
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(2.5)
      this.registerProjectable(label, elem.x, elem.y, 14)

      this.dynamicElementContainers.set(elem.id, container)
    }
  }

  // ===== 地图动画元素 =====

  private initMapAnimations(): void {
    // 清理旧动画
    for (const a of this.mapAnims) { a.gfx.destroy(); a.tween.stop() }
    this.mapAnims = []
    if (this.shimmerGfx) { this.shimmerGfx.destroy(); this.shimmerGfx = null }
    if (!this.biomePalette) return
    const pal = this.biomePalette

    // 河流水波闪烁层
    this.shimmerGfx = this.add.graphics().setDepth(0.3)
    this.shimmerPhase = 0

    // 装饰草丛/灌木（随机分布在地图上）
    const decoCount = 25
    for (let i = 0; i < decoCount; i++) {
      const dx = this.rng() * WORLD_MAP_W
      const dy = 200 + this.rng() * (WORLD_MAP_H - 300)
      // 避开河流区域
      const riverX = 500 + Math.sin(dy * 0.008) * 120
      if (Math.abs(dx - riverX) < 60) continue
      const g = this.add.graphics().setDepth(0.15)
      // 绘制小草丛
      const color = pal.deco
      g.fillStyle(color, 0.6)
      g.fillRect(-2, -3, 1, 3)
      g.fillRect(0, -4, 1, 4)
      g.fillRect(2, -3, 1, 3)
      g.fillStyle(Phaser.Display.Color.GetColor(
        Math.min(255, ((color >> 16) & 0xff) + 30),
        Math.min(255, ((color >> 8) & 0xff) + 30),
        Math.min(255, (color & 0xff) + 30),
      ), 0.4)
      g.fillRect(0, -4, 1, 2)
      g.setPosition(dx, dy)
      // 摇摆动画
      const tween = this.tweens.add({
        targets: g,
        rotation: { from: -0.08, to: 0.08 },
        duration: 1500 + this.rng() * 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: this.rng() * 500,
      })
      this.mapAnims.push({ gfx: g, tween })
    }

    // 光斑（在兴趣点附近随机闪烁）
    const points = getDomainPoints(this.currentDomain)
    for (const p of points) {
      if (p.type === 'dungeon' || p.type === 'landmark' || p.type === 'sect') {
        for (let i = 0; i < 3; i++) {
          const ox = (this.rng() - 0.5) * 80
          const oy = (this.rng() - 0.5) * 80
          const g = this.add.graphics().setDepth(1.5).setPosition(p.x + ox, p.y + oy)
          const color = p.type === 'dungeon' ? 0xff6b6b : p.type === 'landmark' ? 0xf0c987 : 0xfbbf24
          g.fillStyle(color, 0.5)
          g.fillCircle(0, 0, 2)
          g.fillStyle(color, 0.2)
          g.fillCircle(0, 0, 4)
          const tween = this.tweens.add({
            targets: g,
            alpha: { from: 0.2, to: 0.8 },
            scale: { from: 0.5, to: 1.5 },
            duration: 800 + this.rng() * 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            delay: this.rng() * 1000,
          })
          this.mapAnims.push({ gfx: g, tween })
        }
      }
    }
  }

  private updateShimmer(delta: number): void {
    if (!this.shimmerGfx) return
    this.shimmerPhase += delta * 0.002
    const pal = this.biomePalette
    if (!pal) return
    this.shimmerGfx.clear()
    const riverHi = pal.riverHighlight
    // 沿河流绘制闪烁点
    for (let y = 0; y < WORLD_MAP_H; y += 15) {
      const x = 500 + Math.sin(y * 0.008) * 120 + Math.sin(y * 0.03) * 40
      const phase = this.shimmerPhase + y * 0.01
      const alpha = (Math.sin(phase) + 1) * 0.15
      if (alpha > 0.05) {
        this.shimmerGfx.fillStyle(riverHi, alpha)
        this.shimmerGfx.fillCircle(x + Math.sin(phase * 2) * 10, y, 2)
      }
    }
  }

  // ===== 视差背景层 =====

  private initParallax(): void {
    // 清理旧层
    for (const layer of this.parallaxLayers) layer.gfx.destroy()
    this.parallaxLayers = []
    if (!this.biomePalette) return

    const pal = this.biomePalette
    const camView = this.cameras.main.worldView
    const viewW = camView.width || this.scale.gameSize.width
    const viewH = camView.height || this.scale.gameSize.height

    // 远景山脉层（scrollFactor 0.3）
    const mountains = this.add.graphics().setDepth(-2)
    mountains.fillStyle((pal.mountain & 0xfefefe) >> 1, 0.5)
    for (let i = 0; i < 8; i++) {
      const mx = (i / 8) * viewW * 2.5
      const mh = 80 + Math.sin(i * 1.3) * 40
      const mw = viewW * 0.4
      mountains.beginPath()
      mountains.moveTo(mx - mw / 2, viewH * 0.5)
      mountains.lineTo(mx, viewH * 0.5 - mh)
      mountains.lineTo(mx + mw / 2, viewH * 0.5)
      mountains.closePath()
      mountains.fillPath()
    }
    mountains.fillStyle(pal.mountain, 0.35)
    for (let i = 0; i < 6; i++) {
      const mx = (i / 6) * viewW * 3 + 50
      const mh = 120 + Math.sin(i * 2.1) * 30
      const mw = viewW * 0.5
      mountains.beginPath()
      mountains.moveTo(mx - mw / 2, viewH * 0.55)
      mountains.lineTo(mx, viewH * 0.55 - mh)
      mountains.lineTo(mx + mw / 2, viewH * 0.55)
      mountains.closePath()
      mountains.fillPath()
    }
    mountains.setScrollFactor(0.3)
    this.parallaxLayers.push({ gfx: mountains, factor: 0.3 })

    // 云层（scrollFactor 0.15）
    const clouds = this.add.graphics().setDepth(-1.5)
    clouds.fillStyle(pal.cloud, 0.12)
    for (let i = 0; i < 10; i++) {
      const cx = (i / 10) * viewW * 4
      const cy = 20 + Math.sin(i * 0.7) * 50
      const cw = 60 + Math.sin(i * 1.5) * 40
      clouds.fillEllipse(cx, cy, cw, cw * 0.4)
    }
    clouds.fillStyle(pal.cloud, 0.08)
    for (let i = 0; i < 8; i++) {
      const cx = (i / 8) * viewW * 5 + 80
      const cy = 60 + Math.cos(i * 1.1) * 30
      const cw = 80 + Math.cos(i * 2.3) * 50
      clouds.fillEllipse(cx, cy, cw, cw * 0.35)
    }
    clouds.setScrollFactor(0.15)
    this.parallaxLayers.push({ gfx: clouds, factor: 0.15 })

    // 缓慢漂移云层
    this.tweens.add({
      targets: clouds,
      x: { from: 0, to: -50 },
      duration: 20000,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.easeInOut',
    })
  }

  // ===== 天气粒子系统 =====

  private initWeather(): void {
    // 生成 2x2 白色粒子纹理
    if (!this.textures.exists('weather_particle')) {
      const canvas = this.textures.createCanvas('weather_particle', 2, 2)
      if (canvas) {
        const ctx = canvas.getContext()
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, 2, 2)
        canvas.refresh()
      }
    }
    this.applyWeather()
  }

  private applyWeather(): void {
    const weatherType = getWeatherType(this.currentDomain, this.worldTime)
    if (weatherType === this.currentWeather) return
    this.currentWeather = weatherType

    // 销毁旧粒子
    if (this.weatherEmitter) {
      this.weatherEmitter.destroy()
      this.weatherEmitter = null
    }

    const night = isNight(this.worldTime)
    const config = getWeatherConfig(weatherType, night)
    if (!config) return

    const camView = this.cameras.main.worldView
    const w = camView.width || this.scale.gameSize.width
    const h = camView.height || this.scale.gameSize.height

    this.weatherEmitter = this.add.particles(0, 0, 'weather_particle', {
      x: { min: 0, max: w },
      y: { min: -20, max: -5 },
      speed: config.speed,
      angle: config.angle,
      lifespan: config.lifespan,
      alpha: config.alpha,
      scale: config.scale,
      quantity: config.quantity,
      frequency: config.frequency,
      tint: config.color,
      blendMode: 'NORMAL',
    })
    this.weatherEmitter.setScrollFactor(0).setDepth(60)

    // 3D 场景天气效果：调整雾和光照
    if (this.threeBridge) {
      const domainDef = getDomainDef(this.currentDomain)
      const baseFog = domainDef?.bgTint ?? 0x1a3b2a
      switch (weatherType) {
        case 'rain':
          this.threeBridge.setFogColor(0x2a3a3a, 400, 1400)
          this.threeBridge.setBloom(0.18, 0.3, 0.88)
          break
        case 'mist':
          this.threeBridge.setFogColor(baseFog, 250, 800)
          this.threeBridge.setBloom(0.2, 0.35, 0.85)
          break
        case 'snow':
          this.threeBridge.setFogColor(0x5a6a7a, 500, 1800)
          this.threeBridge.setBloom(0.3, 0.35, 0.8)
          break
        case 'sand':
          this.threeBridge.setFogColor(0x6a5a3a, 350, 1200)
          this.threeBridge.setBloom(0.15, 0.25, 0.88)
          break
        case 'leaves':
          this.threeBridge.setFogColor(baseFog, 600, 2000)
          this.threeBridge.setBloom(0.25, 0.3, 0.85)
          break
        default:
          this.threeBridge.setFogColor(baseFog, 700, 2200)
          this.threeBridge.setBloom(0.3, 0.3, 0.85)
          this.updateLightOverlay()
          break
      }
    }
  }

  // ===== 世界迷雾遮罩 =====

  private updateFogOverlay(): void {
    // 记录已探索区域（无论 2D/3D 都需要记录）
    exploreTile(this.state, this.currentDomain, this.player.sprite.x, this.player.sprite.y)

    // 3D 直显模式下由 Three.js Fog 提供大气深度，跳过 2D 迷雾遮罩
    if ((this as any)._useDirect3D) {
      this.fogGraphics.clear()
      return
    }

    const visionR = getVisionRadius(this.state.realm) + getMountVisionBonus(this.state)
    const px = this.player.sprite.x
    const py = this.player.sprite.y

    this.fogGraphics.clear()

    const camView = this.cameras.main.worldView
    // 更细腻的迷雾格子，与 3D 地面纹理像素块大小一致
    const TILE = 8
    const startCx = Math.floor((camView.x - 30) / TILE)
    const endCx = Math.ceil((camView.x + camView.width + 30) / TILE)
    const startCy = Math.floor((camView.y - 30) / TILE)
    const endCy = Math.ceil((camView.y + camView.height + 30) / TILE)

    // 迷雾颜色使用群系色调
    const fogColor = this.biomePalette ? this.biomePalette.fog : 0x000000
    // 视野核心区（0~60% R）：无迷雾
    // 视野边缘区（60%~85% R）：渐变 0→0.15
    // 视野外缘区（85%~110% R）：渐变 0.15→0.35
    // 视野外已探索：0.25
    // 视野外未探索：0.55
    const innerR = visionR * 0.6
    const midR = visionR * 0.85
    const outerR = visionR * 1.1

    for (let cx = startCx; cx <= endCx; cx++) {
      for (let cy = startCy; cy <= endCy; cy++) {
        const tx = cx * TILE + TILE / 2
        const ty = cy * TILE + TILE / 2
        const distToPlayer = Math.hypot(tx - px, ty - py)
        const explored = isExplored(this.state, this.currentDomain, tx, ty)

        if (distToPlayer < innerR) {
          // 视野核心：完全清晰
          continue
        }

        if (distToPlayer < midR) {
          // 视野边缘：渐变 0→0.15
          const t = (distToPlayer - innerR) / (midR - innerR)
          if (!explored) {
            this.fogGraphics.fillStyle(fogColor, t * 0.15)
            this.fogGraphics.fillRect(cx * TILE, cy * TILE, TILE, TILE)
          }
        } else if (distToPlayer < outerR) {
          // 视野外缘：渐变 0.15→0.35
          const t = (distToPlayer - midR) / (outerR - midR)
          const baseAlpha = explored ? 0.15 : 0.15
          this.fogGraphics.fillStyle(fogColor, baseAlpha + t * 0.2)
          this.fogGraphics.fillRect(cx * TILE, cy * TILE, TILE, TILE)
        } else {
          // 视野外
          if (explored) {
            this.fogGraphics.fillStyle(fogColor, 0.25)
            this.fogGraphics.fillRect(cx * TILE, cy * TILE, TILE, TILE)
          } else {
            this.fogGraphics.fillStyle(fogColor, 0.55)
            this.fogGraphics.fillRect(cx * TILE, cy * TILE, TILE, TILE)
          }
        }
      }
    }
  }

  // ===== 体力显示 =====

  private updateStaminaDisplay(): void {
    if (!this.staminaText) return
    const s = getStaminaDisplay(this.state)
    this.staminaText.setText(`体力:${s.value}/${s.max}`)
    this.staminaText.setColor(s.label === '疲惫' ? '#f87171' : '#fbbf24')
  }

  // ===== NPC 交互 =====

  private async interactWithNpc(npc: ProceduralNpc) {
    if (this.transitioning || this.eventActive) return
    input.clearQueues()
    this.player.halt()

    // 更新相遇记录
    const rel = getPlayerNpcRelation(this.state, npc.id)
    if (rel) {
      rel.metCount++
      rel.lastInteract = Date.now()
    } else {
      this.state.playerNpcRelations[npc.id] = {
        npcId: npc.id, favor: 0, trust: 0, fear: 0, saved: false,
        killedKnown: [], metCount: 1, lastInteract: Date.now(),
      }
    }

    const realmNames = ['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫']
    const relLevel = rel ? getRelationLevelName(rel.favor) : '初次相遇'
    const morality = getMoralityTier(npc.morality)
    const moralityColor = npc.morality > 20 ? '#4ade80' : npc.morality < -20 ? '#f87171' : '#e2e8f0'

    // 获取社交信息和人生经历
    const socialLines = getNpcSocialSummary(npc, this.state)
    const lifeEvents = getNpcLifeEvents(npc)

    // 神念探查决定可显示的隐秘信息
    let secretText: string | undefined
    if (this.state.divineSenseLevel >= 3 && npc.story.deep) {
      secretText = npc.story.deep
    } else if (this.state.divineSenseLevel >= 1 && npc.story.middle) {
      secretText = npc.story.middle
    }

    // 打开 NPC 信息面板
    const panelData: NpcPanelData = {
      name: npc.name,
      realmName: realmNames[npc.realm],
      profession: npc.profession,
      personality: npc.personality,
      daoPath: npc.daoPath,
      physique: npc.physique,
      moralityName: morality.name,
      moralityColor,
      relationLevel: relLevel,
      favor: rel?.favor ?? 0,
      trust: rel?.trust ?? 0,
      fear: rel?.fear ?? 0,
      story: npc.story.surface,
      purpose: npc.currentPurpose,
      activity: getNpcActivityDesc(npc, this.worldTime.hour),
      socialLines,
      lifeEvents,
      hasSecret: !!secretText,
      secretText,
      hp: npc.hp,
      maxHp: npc.maxHp,
      level: npc.level,
    }
    openNpcPanel(panelData)

    // 对话框仅展示核心交互选项
    const options: { label: string; value: string }[] = [
      { label: '交谈', value: 'talk' },
      { label: '神念探查', value: 'divine_sense' },
    ]

    // 切磋（好感>=10）
    if (rel && rel.favor >= 10) {
      options.push({ label: '切磋', value: 'spar' })
    }

    // Phase 5: 关系驱动任务
    const hasActiveQuest = this.activeQuests.some(q => q.giverNpcId === npc.id && !q.completed)
    if (hasActiveQuest) {
      options.push({ label: '提交任务', value: 'submit_quest' })
    }
    if (rel && rel.favor >= 15 && !hasActiveQuest) {
      options.push({ label: '有何委托', value: 'quest' })
    }

    // 收徒
    const recruitCheck = canRecruitDisciple(this.state, npc)
    if (recruitCheck.ok) {
      options.push({ label: '收为弟子', value: 'recruit' })
    }

    // 劫掠 / 强行攻击（进入战斗场景）
    options.push({ label: '劫掠', value: 'plunder' })
    options.push({ label: '强行攻击', value: 'attack' })

    // 带下秘境（好感>=50且有空位）
    if (rel && rel.favor >= 50 && !this.state.activeCompanionNpcId) {
      options.push({ label: '邀入队伍', value: 'invite' })
    }

    options.push({ label: '离开', value: 'leave' })

    const result = await showDialog(npc.name, ['请选择交互方式：'], options)

    // 关闭面板（除非需要进入战斗场景）
    if (result !== 'plunder' && result !== 'attack') {
      closePanel()
    }

    switch (result) {
      case 'talk': await this.npcTalk(npc); break
      case 'divine_sense': await this.npcDivineSense(npc); break
      case 'spar': await this.npcSpar(npc); break
      case 'quest': await this.npcOfferQuest(npc); break
      case 'submit_quest': await this.npcSubmitQuest(npc); break
      case 'recruit': await this.npcRecruit(npc); break
      case 'plunder': await this.npcPlunder(npc); break
      case 'attack': await this.npcAttack(npc); break
      case 'invite': await this.npcInvite(npc); break
      default: input.clearQueues(); break
    }
  }

  private async npcTalk(npc: ProceduralNpc) {
    const rel = this.state.playerNpcRelations[npc.id]
    const favor = rel?.favor ?? 0
    const realmNames = ['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫']

    const lines: string[] = []

    // 1. 关系感知问候
    if (favor >= 60) {
      lines.push(`${npc.name}眼前一亮：「道友！别来无恙！」`)
    } else if (favor >= 30) {
      lines.push(`${npc.name}微笑点头：「许久不见，修为精进不少。」`)
    } else if (favor >= 10) {
      lines.push(`${npc.name}颔首致意：「别来无恙。」`)
    } else if (favor >= -10) {
      lines.push(`${npc.name}淡淡看了你一眼：「有事？」`)
    } else if (favor >= -30) {
      lines.push(`${npc.name}冷哼一声：「又是你。」`)
    } else if (favor >= -50) {
      lines.push(`${npc.name}目光冰冷：「你来做什么？」`)
    } else {
      lines.push(`${npc.name}杀意凛然：「你竟敢出现在我面前！」`)
    }

    // 2. 玩家状态感知对话
    const playerHpMax = this.state.level * 100 + 200
    const playerHp = this.state.hp === -1 ? playerHpMax : this.state.hp
    const hpRatio = playerHp / playerHpMax

    if (hpRatio < 0.3) {
      if (favor >= 30) {
        lines.push(`「道友气色不佳，可是受了伤？需要丹药么？」`)
      } else if (favor <= -30) {
        lines.push(`「哼，伤痕累累还敢出来行走，当真不怕死。」`)
      } else {
        lines.push(`「你身上伤势不轻，修行之人当爱惜性命。」`)
      }
    } else if (hpRatio < 0.6 && favor >= 30) {
      lines.push(`「道友似有疲色，万事小心。」`)
    }

    // 境界差距感知
    const realmDiff = this.state.realm - npc.realm
    if (realmDiff >= 2) {
      if (npc.morality > 0) {
        lines.push(`（${npc.name}感受到你远超自己的修为，眼中闪过敬畏之色）`)
      } else {
        lines.push(`（${npc.name}感受到你远超自己的修为，暗自咬牙）`)
      }
    } else if (realmDiff <= -2) {
      lines.push(`（${npc.name}觉得你修为尚浅，态度变得轻慢）`)
    }

    // 因果/道德感知
    if (this.state.morality < -40 && npc.morality > 20) {
      lines.push(`「你身上戾气太重，望你好自为之。」`)
    } else if (this.state.morality > 40 && npc.morality > 20) {
      lines.push(`「道友心性纯善，令人敬佩。」`)
    } else if (this.state.morality < -40 && npc.morality < -20) {
      lines.push(`「同道中人，嘿嘿。」`)
    }

    // 声望感知
    const repTier = getReputationTier(this.state.reputation || 0)
    if (repTier.name === '名震天下' || repTier.name === '声名远播') {
      if (favor >= 10) {
        lines.push(`「道友如今名声赫赫，${npc.name}与有荣焉。」`)
      } else if (favor <= -10) {
        lines.push(`「你名气虽大，未必能吓退我。」`)
      }
    }

    // 3. NPC 修为详情
    lines.push('')
    lines.push('—— 修为履历 ——')
    lines.push(`境界：${getRealmName(npc.realm)} ${npc.level}级`)
    lines.push(`道途：${npc.daoPath}`)
    lines.push(`出身：${npc.background}`)
    lines.push(`志向：${npc.lifeGoal}`)
    if (npc.skills.length > 0) lines.push(`功法：${npc.skills.map(s => getNpcSkillName(s)).join('、')}`)

    // 装备
    const eqParts: string[] = []
    if (npc.equipment.weapon) eqParts.push(getNpcEquipName(npc.equipment.weapon))
    if (npc.equipment.armor) eqParts.push(getNpcEquipName(npc.equipment.armor))
    if (npc.equipment.accessory) eqParts.push(getNpcEquipName(npc.equipment.accessory))
    if (eqParts.length > 0) lines.push(`装备：${eqParts.join('、')}`)

    // 持有物品
    const invEntries = Object.entries(npc.inventory)
    if (invEntries.length > 0) {
      lines.push(`持有：${invEntries.map(([k, v]) => `${getNpcItemName(k)}×${v}`).join('、')}`)
    }

    // 当前活动
    lines.push(`当前：${getNpcActivityDesc(npc, this.worldTime.hour)}`)
    lines.push(`「${npc.currentPurpose}」`)

    // 4. 社交关系
    const socialLines = getNpcSocialSummary(npc, this.state)
    if (socialLines.length > 0) {
      lines.push('')
      lines.push('—— 社交关系 ——')
      lines.push(...socialLines)
    }

    // 5. 复杂关系暗示（又爱又恨）
    if (rel) {
      const complexHints: string[] = []
      if (rel.favor > 20 && rel.fear > 20) {
        complexHints.push(`${npc.name}对你又敬又畏，关系微妙`)
      }
      if (rel.saved) {
        complexHints.push(`${npc.name}感念你的救命之恩`)
      }
      if (rel.killedKnown.length > 0) {
        complexHints.push(`${npc.name}知道你杀过${rel.killedKnown.length}人，心存忌惮`)
      }
      if (rel.favor <= -30 && rel.trust > 10) {
        complexHints.push(`${npc.name}虽对你不满，却仍存一丝信任`)
      }
      if (rel.favor >= 30 && rel.fear > 10) {
        complexHints.push(`${npc.name}既亲近你又畏惧你的手段`)
      }
      if (complexHints.length > 0) {
        lines.push('')
        for (const h of complexHints) lines.push(`（${h}）`)
      }
    }

    // 6. 性格特征对话
    if (npc.personality.includes('好战') && favor >= 10 && favor < 50) {
      lines.push('')
      lines.push(`「改日定要与道友切磋一番！」`)
    }
    if (npc.personality.includes('贪婪') && invEntries.length > 2) {
      lines.push(`（${npc.name}不自觉地摸了摸储物袋）`)
    }
    if (npc.personality.includes('孤僻') && favor < 20) {
      lines.push(`（${npc.name}似乎不愿多说，目光飘向别处）`)
    }
    if (npc.personality.includes('热情') && favor >= 10) {
      lines.push(`「有何需要帮忙的，尽管开口！」`)
    }

    await showDialog(npc.name, lines, [{ label: '继续', value: 'ok' }])

    // 交谈增加好感
    if (rel) { rel.favor += 2; rel.trust += 1 }
    toast(`与${npc.name}交谈甚欢，好感+2`, '#a3e4d7')
    input.clearQueues()
  }

  // Phase 5: 关系驱动任务
  private async npcOfferQuest(npc: ProceduralNpc) {
    const quests = getAvailableQuests(this.state, npc)
    if (quests.length === 0) {
      toast(`${npc.name}：近来并无特别之事需要帮忙`, '#94a3b8')
      input.clearQueues()
      return
    }

    const quest = quests[0]
    const lines = [
      `${quest.title}`,
      quest.description,
      `目标：${quest.objectives.map(o => o.description).join('；')}`,
      `奖励：${quest.rewards.gold ? `灵石${quest.rewards.gold} ` : ''}${quest.rewards.exp ? `经验${quest.rewards.exp} ` : ''}${quest.rewards.favorGain ? `好感+${quest.rewards.favorGain}` : ''}`,
      `时限：${quest.expireDays}日`,
    ]
    const result = await showDialog(`${npc.name}的委托`, lines, [
      { label: '接受', value: 'accept' },
      { label: '拒绝', value: 'decline' },
    ])

    if (result === 'accept') {
      quest.accepted = true
      this.activeQuests.push(quest)
      this.syncQuestsToState()
      toast(`接受任务：${quest.title}`, '#4ade80')
      sfx('sfx_chest')
      saveGame(this.state)
    }
    input.clearQueues()
  }

  private async npcSubmitQuest(npc: ProceduralNpc) {
    const quest = this.activeQuests.find(q => q.giverNpcId === npc.id && !q.completed)
    if (!quest) {
      toast(`没有来自${npc.name}的进行中任务`, '#94a3b8')
      input.clearQueues()
      return
    }

    // 检查任务进度
    const allDone = quest.objectives.every(o => o.done)
    const progressLines = quest.objectives.map(o => `${o.done ? '✓' : '✗'} ${o.description}（${o.currentCount}/${o.targetCount}）`)

    if (!allDone) {
      await showDialog(`${quest.title}（进行中）`, progressLines, [{ label: '知道了', value: 'ok' }])
      input.clearQueues()
      return
    }

    // 领取奖励
    quest.completed = true
    const rewardMsgs = claimQuestReward(this.state, quest)
    // 从活跃列表移除
    this.activeQuests = this.activeQuests.filter(q => q.id !== quest.id)
    this.syncQuestsToState()

    // 记录人生事件
    recordLifeEvent(npc, 'victory', '委托被玩家完成', 'positive')

    const lines = [
      `${npc.name}：多谢道友相助！这是答应的谢礼。`,
      ...rewardMsgs,
    ]
    await showDialog(`${quest.title}（完成）`, lines, [{ label: '收下', value: 'ok' }])
    sfx('sfx_levelup')
    saveGame(this.state)
    updateHUD()
    input.clearQueues()
  }

  // Phase 5: 查看人生经历
  private async npcLifeEvents(npc: ProceduralNpc) {
    const events = getNpcLifeEvents(npc)
    const lines = [
      `${npc.name}的人生经历：`,
      '',
      ...events,
    ]
    await showDialog(`${npc.name}的经历`, lines, [{ label: '继续', value: 'ok' }])
    input.clearQueues()
  }

  private scheduleDesc(npc: ProceduralNpc): string {
    if (!npc.schedule) return '闲逛'
    const hour = this.worldTime.hour
    if (hour >= 7 && hour < 12) return npc.schedule.morning
    if (hour >= 12 && hour < 18) return npc.schedule.afternoon
    return npc.schedule.night
  }

  private async npcDivineSense(npc: ProceduralNpc) {
    const result = performDivineSense(this.state, npc)
    const lines: string[] = []

    if (result.backlashDmg > 0) {
      lines.push(result.texts.surface)
      lines.push(`受到${result.backlashDmg}点反噬伤害！`)
      this.state.hp = Math.max(1, (this.state.hp > 0 ? this.state.hp : 100) - result.backlashDmg)
      sfx('sfx_hit')
    } else {
      lines.push('—— 表层探查 ——')
      lines.push(result.texts.surface)
      if (result.texts.middle !== '???（需要更高境界）') {
        lines.push('')
        lines.push('—— 中层探查 ——')
        lines.push(result.texts.middle)
      }
      if (result.secretKnown) {
        lines.push('')
        lines.push('—— 深层探查 ——')
        lines.push(result.texts.deep)
        // Phase 5: 高境界可看到近期人生事件
        const lifeEvents = getNpcLifeEvents(npc)
        if (lifeEvents.length > 0 && lifeEvents[0] !== '此人身世平淡，并无值得记载之事') {
          lines.push('')
          lines.push('—— 近期经历 ——')
          lines.push(...lifeEvents.slice(-5))
        }
      }
    }

    if (result.detected) {
      lines.push('')
      lines.push(`「${npc.name}似乎察觉到了你的探查……」`)
      const rel = this.state.playerNpcRelations[npc.id]
      if (rel) rel.favor -= 5
    }

    await showDialog('神念探查', lines, [{ label: '收功', value: 'ok' }])
    sfx('sfx_levelup')
    input.clearQueues()
  }

  private async npcSpar(npc: ProceduralNpc) {
    const result = sparWithNpc(this.state, npc)
    // 给经验
    let remaining = result.exp
    while (remaining > 0) {
      const need = this.state.level * 50
      if (this.state.exp + remaining >= need) {
        remaining -= need - this.state.exp
        this.state.level++
        this.state.exp = 0
        sfx('sfx_levelup')
      } else {
        this.state.exp += remaining
        remaining = 0
      }
    }
    this.worldTime = advanceTime(this.worldTime, 30 * 60 * 1000)
    this.state.worldTime = this.worldTime
    saveGame(this.state)
    toast(result.message, '#fbbf24')
    updateHUD()
    input.clearQueues()
  }

  private async npcRecruit(npc: ProceduralNpc) {
    const result = recruitDisciple(this.state, npc)
    toast(result.message, result.ok ? '#4ade80' : '#f87171')
    if (result.ok) {
      sfx('sfx_levelup')
      saveGame(this.state)
    }
    input.clearQueues()
  }

  // 大地图域 → 战斗场景地形映射
  private domainToRegionId(domain: DomainId): string {
    const map: Record<DomainId, string> = {
      south: 'qm',    // 南域：青冥山脉（草地/山峦）
      central: 'sy',  // 中域：无尽妖域（暗色密林）
      east: 'haishi', // 东域：海市蜃楼（水道/海滨）
      west: 'guzhan', // 西域：古战场（荒漠/戈壁）
      north: 'bingyuan', // 北域：冰原秘境（冰雪）
    }
    return map[domain] || 'qm'
  }

  private async npcPlunder(npc: ProceduralNpc) {
    // 进入战斗场景进行劫掠
    const regionId = this.domainToRegionId(this.currentDomain)
    this.registry.set('npcCombatData', {
      npcId: npc.id,
      mode: 'plunder',
      npcName: npc.name,
      npcHp: npc.hp,
      npcMaxHp: npc.maxHp,
      npcAtk: npc.atk,
      npcDef: npc.def,
      npcRealm: npc.realm,
      npcMorality: npc.morality,
      regionId,
      appearanceSeed: npc.appearanceSeed,
      gender: npc.gender,
      daoPath: npc.daoPath,
      level: npc.level,
      background: npc.background,
      profession: npc.profession,
      skills: npc.skills,
      equipment: npc.equipment,
      inventory: npc.inventory,
      story: npc.story,
      lifeGoal: npc.lifeGoal,
      currentPurpose: npc.currentPurpose,
      personality: npc.personality,
    })
    closePanel()
    this.transitioning = true
    sfx('sfx_hit')
    saveGame(this.state)
    this.worldTime = advanceTime(this.worldTime, 5 * 60 * 1000)
    this.state.worldTime = this.worldTime
    this.time.delayedCall(200, () => {
      this.registry.set('dungeonReturnScene', 'World')
      this.scene.start('Dungeon', {
        mode: 'npcCombat',
        subMode: 'plunder',
        regionOverride: regionId,
        npcId: npc.id,
      })
    })
  }

  private async npcAttack(npc: ProceduralNpc) {
    // 进入战斗场景进行强攻
    const regionId = this.domainToRegionId(this.currentDomain)
    this.registry.set('npcCombatData', {
      npcId: npc.id,
      mode: 'attack',
      npcName: npc.name,
      npcHp: npc.hp,
      npcMaxHp: npc.maxHp,
      npcAtk: npc.atk,
      npcDef: npc.def,
      npcRealm: npc.realm,
      npcMorality: npc.morality,
      regionId,
      appearanceSeed: npc.appearanceSeed,
      gender: npc.gender,
      daoPath: npc.daoPath,
      level: npc.level,
      background: npc.background,
      profession: npc.profession,
      skills: npc.skills,
      equipment: npc.equipment,
      inventory: npc.inventory,
      story: npc.story,
      lifeGoal: npc.lifeGoal,
      currentPurpose: npc.currentPurpose,
      personality: npc.personality,
    })
    closePanel()
    this.transitioning = true
    sfx('sfx_hit')
    saveGame(this.state)
    this.worldTime = advanceTime(this.worldTime, 10 * 60 * 1000)
    this.state.worldTime = this.worldTime
    this.time.delayedCall(200, () => {
      this.registry.set('dungeonReturnScene', 'World')
      this.scene.start('Dungeon', {
        mode: 'npcCombat',
        subMode: 'attack',
        regionOverride: regionId,
        npcId: npc.id,
      })
    })
  }

  /** 从战斗场景返回后处理 NPC 战斗结果 */
  private handleNpcCombatResult(): void {
    const combatData = this.registry.get('npcCombatData') as {
      npcId: string
      mode: string
      npcName: string
      npcMorality: number
      victory: boolean
      isArena?: boolean
      isRevenge?: boolean
      resourceNodeId?: string
      resourceName?: string
      sectName?: string
    } | undefined

    if (!combatData) return
    this.registry.remove('npcCombatData')
    this.transitioning = false

    const npc = this.state.proceduralNpcs.find(n => n.id === combatData.npcId)
    if (!npc) {
      input.clearQueues()
      return
    }

    // 擂台模式（切磋，不杀死NPC）
    if (combatData.isArena) {
      if (combatData.victory) {
        // 擂台胜利
        this.state.honor = (this.state.honor || 0) + 5
        const expGain = npc.realm * 20 + 15
        let remaining = expGain
        while (remaining > 0) {
          const need = this.state.level * 50
          if (this.state.exp + remaining >= need) {
            remaining -= need - this.state.exp
            this.state.level++
            this.state.exp = 0
            sfx('sfx_levelup')
          } else {
            this.state.exp += remaining
            remaining = 0
          }
        }
        toast(`擂台胜利！获得经验${expGain}，荣誉+5`, '#fbbf24')

        // 资源点擂台：夺取控制权
        if (combatData.resourceNodeId) {
          const node = this.state.resourceNodes?.find(n => n.id === combatData.resourceNodeId)
          if (node) {
            node.ownerId = 'player'
            node.contested = false
            node.garrison = Math.max(50, node.garrison - 30)
            toast(`成功夺取${node.name}的控制权！`, '#4ade80')
            this.renderResourceNodes()
          }
        }

        // 宗门拜访擂台：改善关系
        if (combatData.sectName) {
          const aiSect = this.state.aiSects?.find(s => s.name === combatData.sectName)
          if (aiSect) {
            aiSect.relationValue = Math.min(100, aiSect.relationValue + 8)
            toast(`与${aiSect.name}弟子切磋获胜，外交值+8`, '#a3e4d7')
          }
        }
      } else {
        toast('擂台切磋失利，改日再战', '#f87171')
        // 资源点失败：保持对方控制
        if (combatData.resourceNodeId) {
          const node = this.state.resourceNodes?.find(n => n.id === combatData.resourceNodeId)
          if (node) node.contested = false
        }
      }
      this.state.hp = Math.max(1, this.state.hp)
      saveGame(this.state)
      updateHUD()
      input.clearQueues()
      return
    }

    if (combatData.victory) {
      if (combatData.mode === 'plunder') {
        // 劫掠胜利：获得物品
        const result = plunderNpc(this.state, npc)
        if (result.gold) this.state.gold += result.gold
        if (result.loot) {
          for (const [k, v] of Object.entries(result.loot)) {
            if (k === 'gold') continue
            this.state.materials[k] = (this.state.materials[k] || 0) + v
          }
        }
        addInnerDemon(this.state, 'greed', 5, `劫掠了${npc.name}`)
        toast(result.message, '#f87171')

        // 好感大幅下降
        const rel = this.state.playerNpcRelations[npc.id]
        if (rel) {
          rel.favor -= 50
          rel.trust = Math.max(0, rel.trust - 30)
        }
        npc.hp = Math.floor(npc.maxHp * 0.3)
      } else {
        // 强攻胜利：击杀NPC
        const combat = createNpcCombatData(npc)
        combat.hp = 0
        const defeatResult = onNpcDefeated(this.state, npc, combat)
        if (npc.morality > 0) {
          addInnerDemon(this.state, 'killing', 10, `杀害无辜修士${npc.name}`)
        } else {
          addInnerDemon(this.state, 'killing', 3, `斩杀${npc.name}`)
        }
        if (defeatResult.gold) this.state.gold += defeatResult.gold
        if (defeatResult.loot) {
          for (const [k, v] of Object.entries(defeatResult.loot)) {
            if (k === 'gold') continue
            this.state.materials[k] = (this.state.materials[k] || 0) + v
          }
        }
        const chainMsgs = onPlayerKillNpc(this.state, npc)
        for (const msg of chainMsgs) toast(msg, '#fda4af')

        // 移除NPC精灵
        this.npcSprites.get(npc.id)?.destroy()
        this.npcLabels.get(npc.id)?.destroy()
        this.npcSprites.delete(npc.id)
        this.npcLabels.delete(npc.id)
        this.threeBridge?.removeBillboard(`npc_${npc.id}`)

        sfx('sfx_levelup')
      }
    } else {
      // 战斗失败
      if (combatData.isRevenge) {
        toast(`${npc.name}的寻仇得逞，你败下阵来`, '#f87171')
      } else {
        toast('战斗失利，未能得手', '#f87171')
      }
      this.state.hp = Math.max(1, this.state.hp)
      // 仇人寻仇胜利后更嚣张
      if (combatData.isRevenge) {
        const rel = this.state.playerNpcRelations[npc.id]
        if (rel) { rel.fear += 10; rel.favor -= 5 }
      }
    }

    // 检查报应
    const ret = checkRetribution(this.state)
    if (ret) toast(`因果报应：${ret.description}`, '#fda4af')

    saveGame(this.state)
    updateHUD()
    input.clearQueues()
  }

  /** 仇人寻仇触发战斗 */
  private async triggerRevengeCombat(npc: ProceduralNpc, revenge: RevengeEvent) {
    if (this.transitioning || this.eventActive || dialogOpen() || panelOpen()) {
      this.time.delayedCall(2000, () => this.triggerRevengeCombat(npc, revenge))
      return
    }

    this.player.halt()
    const regionId = this.domainToRegionId(this.currentDomain)

    if (revenge.type === 'ambush') {
      // 偷袭：直接进入战斗，无法拒绝
      toast(revenge.description, '#f87171')
      sfx('sfx_boss_spawn', 0.6)
      this.registry.set('npcCombatData', {
        npcId: npc.id,
        mode: 'attack',
        npcName: npc.name,
        npcHp: npc.hp,
        npcMaxHp: npc.maxHp,
        npcAtk: npc.atk,
        npcDef: npc.def,
        npcRealm: npc.realm,
        npcMorality: npc.morality,
        regionId,
        appearanceSeed: npc.appearanceSeed,
        gender: npc.gender,
        daoPath: npc.daoPath,
        level: npc.level,
        background: npc.background,
        profession: npc.profession,
        skills: npc.skills,
        equipment: npc.equipment,
        inventory: npc.inventory,
        story: npc.story,
        lifeGoal: npc.lifeGoal,
        currentPurpose: npc.currentPurpose,
        personality: npc.personality,
        isRevenge: true,
      })
      this.transitioning = true
      saveGame(this.state)
      this.worldTime = advanceTime(this.worldTime, 5 * 60 * 1000)
      this.state.worldTime = this.worldTime
      this.time.delayedCall(500, () => {
        this.registry.set('dungeonReturnScene', 'World')
        this.scene.start('Dungeon', {
          mode: 'npcCombat',
          subMode: 'attack',
          regionOverride: regionId,
          npcId: npc.id,
        })
      })
    } else {
      // 挑战：玩家可以选择接受或拒绝
      const result = await showDialog('仇人挑战', [
        revenge.description,
        `${npc.name}·${['练气','筑基','金丹','元婴','化神','合体','大乘','渡劫'][npc.realm] || '未知'} ${npc.level}级`,
        `道途：${npc.daoPath}`,
        `危险等级：${'★'.repeat(revenge.dangerLevel)}`,
      ], [
        { label: '应战', value: 'accept' },
        { label: '回避', value: 'refuse' },
      ])

      if (result === 'accept') {
        this.registry.set('npcCombatData', {
          npcId: npc.id,
          mode: 'attack',
          npcName: npc.name,
          npcHp: npc.hp,
          npcMaxHp: npc.maxHp,
          npcAtk: npc.atk,
          npcDef: npc.def,
          npcRealm: npc.realm,
          npcMorality: npc.morality,
          regionId,
          appearanceSeed: npc.appearanceSeed,
          gender: npc.gender,
          daoPath: npc.daoPath,
          level: npc.level,
          background: npc.background,
          profession: npc.profession,
          skills: npc.skills,
          equipment: npc.equipment,
          inventory: npc.inventory,
          story: npc.story,
          lifeGoal: npc.lifeGoal,
          currentPurpose: npc.currentPurpose,
          personality: npc.personality,
          isRevenge: true,
        })
        this.transitioning = true
        sfx('sfx_hit')
        saveGame(this.state)
        this.worldTime = advanceTime(this.worldTime, 10 * 60 * 1000)
        this.state.worldTime = this.worldTime
        this.time.delayedCall(200, () => {
          this.registry.set('dungeonReturnScene', 'World')
          this.scene.start('Dungeon', {
            mode: 'npcCombat',
            subMode: 'attack',
            regionOverride: regionId,
            npcId: npc.id,
          })
        })
      } else {
        // 回避：增加恐惧，但仇人会更恨你
        const rel = this.state.playerNpcRelations[npc.id]
        if (rel) {
          rel.favor -= 10
          rel.fear += 5
        }
        toast(`你回避了${npc.name}的挑战，对方更加恼怒`, '#fda4af')
        saveGame(this.state)
        input.clearQueues()
      }
    }
  }

  private async npcInvite(npc: ProceduralNpc) {
    const result = bringNpcToRealm(this.state, npc.id)
    toast(result.message, result.ok ? '#4ade80' : '#f87171')
    if (result.ok) {
      sfx('sfx_chest')
      saveGame(this.state)
    }
    input.clearQueues()
  }

  // ===== 秘境发现 =====

  private tryDiscoverSecretRealm(): void {
    if (this.rng() > 0.003) return // 极低概率触发
    const px = this.player.sprite.x
    const py = this.player.sprite.y
    const angle = this.rng() * Math.PI * 2
    const dist = 100 + this.rng() * 150
    const x = Math.max(50, Math.min(WORLD_MAP_W - 50, px + Math.cos(angle) * dist))
    const y = Math.max(50, Math.min(WORLD_MAP_H - 50, py + Math.sin(angle) * dist))

    const realm = generateSecretRealm(this.currentDomain, Math.floor(x), Math.floor(y))
    if (discoverRealm(this.state, realm)) {
      this.discoveredRealmDefs.push(realm)
      this.renderSecretRealmEntrance(realm)
      toast(`你发现了一处秘境入口：${realm.name}！`, '#af7ac5')
      sfx('sfx_chest')
      saveGame(this.state)
    }
  }

  private renderSecretRealmEntrance(realm: SecretRealmDef): void {
    // 外层光晕
    const glow = this.add.graphics()
    glow.fillStyle(0xaf7ac5, 0.08)
    glow.fillCircle(0, 0, 30)
    glow.fillStyle(0xaf7ac5, 0.15)
    glow.fillCircle(0, 0, 22)

    // 旋转能量环
    const ring = this.add.graphics()
    ring.lineStyle(2, 0xc39bd3, 0.7)
    ring.strokeCircle(0, 0, 18)
    ring.lineStyle(1, 0xaf7ac5, 0.5)
    ring.strokeCircle(0, 0, 14)

    // 核心光点
    const core = this.add.graphics()
    core.fillStyle(0xaf7ac5, 0.5)
    core.fillCircle(0, 0, 10)
    core.fillStyle(0xd2b4de, 0.7)
    core.fillCircle(0, 0, 6)
    core.fillStyle(0xffffff, 0.9)
    core.fillCircle(0, 0, 3)

    // 环绕粒子
    const sparks: Phaser.GameObjects.Arc[] = []
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2
      const sx = Math.cos(angle) * 16
      const sy = Math.sin(angle) * 16
      const spark = this.add.circle(sx, sy, 1.5, 0xffffff, 0.8).setDepth(0.5)
      sparks.push(spark)
    }

    const container = this.add.container(realm.entranceX, realm.entranceY, [glow, ring, core, ...sparks]).setDepth(3.5)

    // 脉动动画
    this.tweens.add({ targets: glow, alpha: 0.3, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    this.tweens.add({ targets: core, scale: 1.3, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    // 旋转环
    this.tweens.add({ targets: ring, angle: 360, duration: 6000, repeat: -1 })
    // 粒子环绕
    sparks.forEach((spark, i) => {
      this.tweens.add({
        targets: spark,
        x: Math.cos((i / 4) * Math.PI * 2 + Math.PI) * 16,
        y: Math.sin((i / 4) * Math.PI * 2 + Math.PI) * 16,
        duration: 2000,
        repeat: -1,
        ease: 'Sine.inOut',
        yoyo: true,
      })
    })

    this.registerProjectable(container, realm.entranceX, realm.entranceY, 0)

    const label = this.add.text(realm.entranceX, realm.entranceY - 26, `秘境·${realm.name}`, {
      fontSize: '9px', color: '#af7ac5', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(4)
    this.registerProjectable(label, realm.entranceX, realm.entranceY, 26)

    this.realmEntranceMarkers.push(container)
  }

  // ===== 秘境入口交互 =====

  private async interactWithSecretRealm(realm: SecretRealmDef) {
    if (this.transitioning || this.eventActive) return
    input.clearQueues()
    this.player.halt()

    const progress = getRealmProgress(this.state, realm.id)
    const realmNames = ['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫']
    const companionNpc = this.state.activeCompanionNpcId
      ? this.state.proceduralNpcs.find(n => n.id === this.state.activeCompanionNpcId)
      : null

    const lines: string[] = [
      `【${realm.name}】`,
      realm.description,
      `层数：${realm.layers.length}  当前深度：${progress}`,
      `时限：${realm.isTimeLimited ? '限时开启' : '常驻可入'}`,
    ]

    if (companionNpc) {
      lines.push(`组队道友：${companionNpc.name}（${realmNames[companionNpc.realm]}境）`)
    }

    // 显示各层信息
    for (let i = 0; i < realm.layers.length; i++) {
      const layer = realm.layers[i]
      const cleared = realm.clearedLayers.includes(i) ? '✓' : progress > i ? '探索中' : '未探索'
      lines.push(`第${i + 1}层 ${layer.name}（推荐${realmNames[layer.recommendedRealm]}境）[${cleared}]`)
    }

    const options: { label: string; value: string }[] = [
      { label: `进入秘境`, value: 'enter' },
    ]

    if (companionNpc) {
      options.push({ label: `让${companionNpc.name}等候`, value: 'dismiss' })
    }

    options.push({ label: '离开', value: 'leave' })

    const result = await showDialog(realm.name, lines, options)

    if (result === 'enter') {
      // 生成秘境NPC
      const layerToEnter = Math.min(progress, realm.layers.length - 1)
      const realmNpcs = generateRealmNpcs(realm, layerToEnter, 3 + Math.floor(Math.random() * 3))

      // 存储到registry供DungeonScene使用
      this.registry.set('secretRealmData', {
        realmId: realm.id,
        realmName: realm.name,
        layerIndex: layerToEnter,
        layer: realm.layers[layerToEnter],
        npcs: realmNpcs,
        companionNpc: companionNpc || null,
      })

      this.transitioning = true
      sfx('sfx_portal')
      saveGame(this.state)

      // 时间推进2时辰
      this.worldTime = advanceTime(this.worldTime, 2 * 5 * 60 * 1000 / 12)
      this.state.worldTime = this.worldTime

      toast(`进入${realm.name}·${realm.layers[layerToEnter].name}`, '#af7ac5')

      this.time.delayedCall(300, () => {
        this.registry.set('dungeonReturnScene', 'World')
        this.scene.start('Dungeon', {
          floor: realm.layers[layerToEnter].monsterLevel,
          diff: 'normal',
          secretRealm: realm.id,
          regionOverride: realm.regionId,
        })
      })
    } else if (result === 'dismiss') {
      this.state.activeCompanionNpcId = null
      toast(`${companionNpc!.name}在入口等候`, '#a3e4d7')
      saveGame(this.state)
      input.clearQueues()
    } else {
      input.clearQueues()
    }
  }

  // ===== 动态元素采集 =====

  private collectDynamicElement(elem: DynamicElement) {
    if (elem.collected) return
    input.clearQueues()

    const result = collectElement(elem)
    sfx('sfx_pickup')

    if (elem.type === 'beast') {
      // 妖兽 → 进入战斗
      this.eventActive = true
      this.transitioning = true
      saveGame(this.state)
      toast('遭遇妖兽！', '#ff6b6b')
      this.time.delayedCall(300, () => {
        this.registry.set('dungeonReturnScene', 'World')
        this.scene.start('Dungeon', { floor: result.monsterLevel || 1, diff: 'normal' })
      })
      return
    }

    if (elem.type === 'rumor') {
      toast(`传闻：${elem.rumorText}`, '#fbbf24')
    } else if (result.insight) {
      this.state.insight += result.insight
      toast(`感悟天地 +${result.insight} 悟道点`, '#af7ac5')
    } else if (result.materials) {
      for (const [k, v] of Object.entries(result.materials)) {
        if (v > 0) this.state.materials[k] = (this.state.materials[k] || 0) + v
      }
      toast(`采集获得 ${elem.itemName || '材料'}×${Object.values(result.materials)[0]}`, '#34d399')
    }

    if (result.exp) {
      let remaining = result.exp
      while (remaining > 0) {
        const need = this.state.level * 50
        if (this.state.exp + remaining >= need) {
          remaining -= need - this.state.exp
          this.state.level++
          this.state.exp = 0
        } else {
          this.state.exp += remaining
          remaining = 0
        }
      }
    }

    // 采集消耗时间
    this.worldTime = advanceTime(this.worldTime, 5 * 60 * 1000)
    this.state.worldTime = this.worldTime
    saveGame(this.state)
    updateHUD()

    // 从动态元素容器中移除
    const container = this.dynamicElementContainers.get(elem.id)
    if (container) {
      container.destroy()
      this.dynamicElementContainers.delete(elem.id)
    }
  }

  // ===== Phase 5: 每日社交模拟 =====

  private syncQuestsToState(): void {
    this.state.activeRelationQuests = this.activeQuests as unknown[]
    this.state.lastSocialSimDay = this.lastDayChecked
  }

  private runDailySimulation(): void {
    const allMessages: string[] = []

    // 1. NPC社交模拟
    const socialResult = runDailySocialSimulation(this.state)
    allMessages.push(...socialResult.summaries)
    // 新关系加入关系网
    this.state.npcRelationNet.push(...socialResult.newRelations)

    // 2. NPC自发事件（突破/顿悟/遭遇）
    const npcEvents = runDailyNpcEvents(this.state)
    allMessages.push(...npcEvents)

    // 3. 因果报应v2
    const karmaResult = runDailyKarmaCheck(this.state)
    allMessages.push(...karmaResult.messages)

    // 仇人寻仇：触发实际战斗
    if (karmaResult.revenge && (karmaResult.revenge.type === 'ambush' || karmaResult.revenge.type === 'challenge')) {
      const revenge = karmaResult.revenge
      const enemyNpc = this.state.proceduralNpcs.find(n => n.id === revenge.npcId && n.alive)
      if (enemyNpc && !this.transitioning) {
        this.time.delayedCall(600, () => this.triggerRevengeCombat(enemyNpc, revenge))
      }
    }

    // Phase 6: 因果业力v3（天道反噬+善缘奇遇）
    const karmaV3Result = runDailyKarmaV3(this.state)
    allMessages.push(...karmaV3Result.messages)

    // Phase 6: 心魔触发检测
    const demonManifestation = checkDemonManifestation(this.state)
    if (demonManifestation) {
      allMessages.push(demonManifestation.description)
      // 心魔效果
      if (demonManifestation.effect === 'berserk') {
        this.state.hp = Math.max(1, (this.state.hp || 100) - 20)
      }
    }

    // Phase 6: 宗门产出结算
    if (this.state.sect) {
      const sectMsgs = tickSectProduction(this.state, 30000) // 30秒≈1日
      allMessages.push(...sectMsgs)
    }

    // Phase 7: 年度事件检查
    const pendingEvent = getPendingAnnualEvent(this.state, this.worldTime)
    if (pendingEvent) {
      const eventResult = executeAnnualEvent(this.state, pendingEvent.type, this.worldTime)
      allMessages.push(`【年度事件】${eventResult.name}：${eventResult.description}`)
      allMessages.push(...eventResult.messages)
    }

    // Phase 7: 宗门战争结算
    const warMsgs = tickSectWars(this.state)
    allMessages.push(...warMsgs)

    // Phase 7: AI宗门主动宣战
    const aiWarMsgs = aiDeclareWars(this.state)
    allMessages.push(...aiWarMsgs)

    // Phase 7: 世界宏观演进（NPC突破/人生事件/死亡）
    const evolutionMsgs = tickWorldEvolution(this.state, this.worldTime)
    allMessages.push(...evolutionMsgs)

    // Phase 7: 深层事件链检查
    const chainTrigger = checkAllChains(this.state)
    if (chainTrigger) {
      allMessages.push(`【事件链】${chainTrigger.event.title}：${chainTrigger.event.description}`)
    }

    // 4. 检查活跃任务过期
    this.activeQuests = this.activeQuests.filter(q => {
      if (q.completed || q.failed) return false
      q.expireDays--
      if (q.expireDays <= 0) {
        q.failed = true
        toast(`任务「${q.title}」已过期`, '#f87171')
        return false
      }
      return true
    })

    // 显示重要消息
    for (const msg of allMessages.slice(0, 5)) {
      toast(msg, '#fbbf24')
    }

    this.syncQuestsToState()
    saveGame(this.state)
  }

  update(time: number, delta: number) {
    if (this.transitioning || this.eventActive || panelOpen() || dialogOpen()) {
      this.player.sprite.setVelocity(0, 0)
      return
    }

    // 背包快捷键
    if (input.consumeBag()) {
      if (panelOpen()) { if (!modalPanel()) closePanel() }
      else { this.player.halt(); openInventory() }
      return
    }

    // 设置快捷键
    if (input.consumeSettings()) {
      if (!panelOpen()) { this.player.halt(); openSettings() }
      return
    }

    // 输入
    input.poll()
    const mx = input.move.x
    const my = input.move.y
    const isMoving = mx !== 0 || my !== 0
    const mountSpeed = getMountSpeedMultiplier(this.state)
    const speed = PLAYER_SPEED * getStaminaSpeedModifier(this.state) * mountSpeed

    // 世界时间推进：移动时加速流逝（与速度属性反相关）
    const stats = calcStats(this.state)
    const timeMult = isMoving ? getMoveTimeMultiplier(stats.speed) * mountSpeed : 1.0
    this.worldTime = advanceTime(this.worldTime, delta * timeMult)
    this.state.worldTime = this.worldTime
    this.updateTimeDisplay()

    // 赶路提示
    if (this.travelText) {
      if (isMoving) {
        this.travelText.setText(`赶路中 · 时间×${timeMult.toFixed(1)}`)
        this.travelText.setVisible(true)
      } else {
        this.travelText.setVisible(false)
      }
    }

    // 体力结算
    tickStamina(this.state, isMoving, delta)
    // Phase 7: 坐骑耐力结算
    tickMountEndurance(this.state, delta, isMoving)
    this.updateStaminaDisplay()

    if (isMoving) {
      const len = Math.hypot(mx, my) || 1
      this.player.sprite.setVelocity((mx / len) * speed, (my / len) * speed)

      // 更新朝向和贴图翻转（WorldScene 自带移动逻辑，不调用 player.move）
      if (Math.abs(mx) >= Math.abs(my)) {
        this.player.sprite.setFlipX(mx < 0)
      }

      // 移动距离累积 → 随机事件
      this.moveAccumulator += Math.abs(mx / len) * speed * (delta / 1000) + Math.abs(my / len) * speed * (delta / 1000)
      if (this.moveAccumulator >= EVENT_BASE_DISTANCE) {
        this.moveAccumulator = 0
        this.triggerRandomEvent()
      }
    } else {
      this.player.sprite.setVelocity(0, 0)
    }

    // 保存玩家位置
    this.state.worldPlayerX = Math.round(this.player.sprite.x)
    this.state.worldPlayerY = Math.round(this.player.sprite.y)
    this.state.worldEventCooldown = this.moveAccumulator

    // HD-2D：更新玩家阴影位置（跟随精灵脚底 + 方向偏移）
    if (this.playerShadow) {
      this.playerShadow.setPosition(this.player.sprite.x + 4, this.player.sprite.y + 19)
    }

    // 更新坐骑贴图位置
    if (this.mountSprite) {
      this.mountSprite.setPosition(this.player.sprite.x, this.player.sprite.y + 6)
      this.mountSprite.setFlipX(this.player.sprite.flipX)
    }

    // HD-2D：更新 NPC 阴影位置
    this.updateNpcShadows()

    // HD-2D 3D 全量渲染（直显模式）
    if (this.threeBridge && this.scene.isActive()) {
      this.threeBridge.follow(
        this.player.sprite.x, this.player.sprite.y,
        WORLD_MAP_W, WORLD_MAP_H,
        1400, 1800,
        0.08,
      )
      this.sync3DBillboards()
      this.threeBridge.render()
    }

    // 世界迷雾探索
    this.updateFogOverlay()

    // 河流水波闪烁更新
    this.updateShimmer(delta)

    // 天气检查（每5秒检查一次昼夜变化）
    this.weatherCheckTimer += delta
    if (this.weatherCheckTimer >= 5000) {
      this.weatherCheckTimer = 0
      this.applyWeather()
      this.updateLightOverlay()
    }

    // NPC 管理定时刷新（每2秒）
    this.npcRefreshTimer += delta
    if (this.npcRefreshTimer >= 2000) {
      this.npcRefreshTimer = 0
      refreshNpcsAroundPlayer(this.state, this.player.sprite.x, this.player.sprite.y, this.currentDomain)
      // NPC关系网补充（NPC数量变化后）
      if (this.state.proceduralNpcs.length > 0 && this.state.npcRelationNet.length < this.state.proceduralNpcs.length) {
        generateNpcRelations(this.state)
      }
    }

    // NPC 移动与精灵更新（每帧）
    this.moveNpcs(delta)
    this.updateNpcSprites()
    this.updateNpcAnimations()

    // HD-2D：植被风吹动画（每帧）
    this.updateVegetationAnimation()

    // L2 水面波纹动画
    this.updateWaterAnimation()

    // 动态元素刷新（每10秒）
    this.dynamicRefreshTimer += delta
    if (this.dynamicRefreshTimer >= 10000) {
      this.dynamicRefreshTimer = 0
      this.dynamicElements = refreshDynamicElements(this.state, this.player.sprite.x, this.player.sprite.y, this.currentDomain, this.worldTime, this.dynamicElements)
      this.renderDynamicElements()
    }

    // 秘境随机发现
    if (isMoving) {
      this.tryDiscoverSecretRealm()
    }

    // 点位检测（含 AI 宗门和资源点）
    let nearest: WorldPoint | null = null
    let nearestDist = INTERACT_RANGE
    for (const p of getDomainPoints(this.currentDomain)) {
      if (!isPointUnlocked(p, this.state)) continue
      if (!this.state.discoveredPoints.includes(p.id)) {
        const d = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, p.x, p.y)
        if (d < 80) {
          this.state.discoveredPoints.push(p.id)
          this.renderPoints()
          this.updateMiniMap()
          toast(`发现：${p.name}`, '#f0d98c')
          sfx('sfx_chest')
        }
        continue
      }
      const d = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, p.x, p.y)
      if (d < nearestDist) {
        nearestDist = d
        nearest = p
      }
    }

    // AI 宗门检测
    let nearAiSect: AiSect | null = null
    let aiDist = 50
    for (const ai of this.state.aiSects ?? []) {
      if (ai.defeated) continue
      const d = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, ai.mapX, ai.mapY)
      if (d < aiDist) { aiDist = d; nearAiSect = ai }
    }

    // 资源点检测
    let nearResource: ResourceNode | null = null
    let resDist = 40
    for (const node of this.state.resourceNodes ?? []) {
      const d = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, node.x, node.y)
      if (d < resDist) { resDist = d; nearResource = node }
    }

    // NPC 检测
    const nearNpcs = findNearbyNpcs(this.state, this.player.sprite.x, this.player.sprite.y, 45)
    const nearNpc = nearNpcs.length > 0 ? nearNpcs[0] : null

    // 动态元素检测
    let nearElem: DynamicElement | null = null
    let elemDist = 35
    for (const elem of this.dynamicElements) {
      if (elem.collected) continue
      const d = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, elem.x, elem.y)
      if (d < elemDist) { elemDist = d; nearElem = elem }
    }

    // 秘境入口检测
    let nearRealm: SecretRealmDef | null = null
    let realmDist = 50
    for (const realm of this.discoveredRealmDefs) {
      const d = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, realm.entranceX, realm.entranceY)
      if (d < realmDist) { realmDist = d; nearRealm = realm }
    }

    // 优先级：世界点位 > 秘境 > AI宗门 > 资源点 > NPC > 动态元素
    if (nearest !== this.nearPoint) {
      this.nearPoint = nearest
    }
    const interactTarget = nearest ? 'point' : nearRealm ? 'realm' : nearAiSect ? 'ai_sect' : nearResource ? 'resource' : nearNpc ? 'npc' : nearElem ? 'element' : null

    if (interactTarget !== this._lastTarget) {
      this._lastTarget = interactTarget
      document.getElementById('btnAct')!.style.display = interactTarget ? 'flex' : 'none'
      if (interactTarget === 'point' && nearest) {
        this.promptText?.setText(`【${nearest.name}】\n点击进入`).setVisible(true)
      } else if (interactTarget === 'realm' && nearRealm) {
        this.promptText?.setText(`【秘境·${nearRealm.name}】\n点击探索`).setVisible(true)
      } else if (interactTarget === 'ai_sect' && nearAiSect) {
        const status = nearAiSect.atWar ? '交战中' : nearAiSect.alliance ? '同盟' : '外交'
        this.promptText?.setText(`【${nearAiSect.name}】\n${status} · 点击交涉`).setVisible(true)
      } else if (interactTarget === 'resource' && nearResource) {
        const owner = nearResource.ownerId === 'player' ? '已占领' : nearResource.ownerId ? '敌方' : '无主'
        this.promptText?.setText(`【${nearResource.name}】\n${owner} · 点击争夺`).setVisible(true)
      } else if (interactTarget === 'npc' && nearNpc) {
        const realmNames = ['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫']
        this.promptText?.setText(`【${nearNpc.name}·${realmNames[nearNpc.realm]}】\n点击交互`).setVisible(true)
      } else if (interactTarget === 'element' && nearElem) {
        const typeNames: Record<string, string> = {
          herb: '灵草', ore: '矿石', beast: '妖兽', rumor: '传闻', insight: '悟道光晕',
        }
        this.promptText?.setText(`【${typeNames[nearElem.type] || '物品'}】\n点击采集`).setVisible(true)
      } else {
        this.promptText?.setVisible(false)
      }
    }

    // 检测交互按钮
    if (input.consumeAct()) {
      if (interactTarget === 'point' && this.nearPoint) {
        this.interactWithPoint(this.nearPoint)
      } else if (interactTarget === 'realm' && nearRealm) {
        this.interactWithSecretRealm(nearRealm)
      } else if (interactTarget === 'ai_sect' && nearAiSect) {
        this.interactWithAiSect(nearAiSect)
      } else if (interactTarget === 'resource' && nearResource) {
        this.interactWithResourceNode(nearResource)
      } else if (interactTarget === 'npc' && nearNpc) {
        this.interactWithNpc(nearNpc)
      } else if (interactTarget === 'element' && nearElem) {
        this.collectDynamicElement(nearElem)
      }
    }

    // 小地图刷新（每 30 帧）
    if (Math.floor(time / 500) !== Math.floor(this.lastTickMs / 500)) {
      this.updateMiniMap()
      this.lastTickMs = time
    }

    // 自动保存（每 10 秒）
    if (Math.floor(time / 10000) !== Math.floor(this.lastTickMs / 10000)) {
      saveGame(this.state)
    }

    // NPC 修炼成长 + 弟子成长（每60秒结算一次）
    this.npcGrowTimer += delta
    if (this.npcGrowTimer >= 60000) {
      const minutes = this.npcGrowTimer / 60000
      this.npcGrowTimer = 0
      const breakthroughs = updateNpcGrowth(this.state, minutes)
      const discipleMsgs = updateDiscipleGrowth(this.state, 60000)
      for (const msg of [...breakthroughs, ...discipleMsgs]) {
        toast(msg, '#fbbf24')
      }
      if (breakthroughs.length > 0 || discipleMsgs.length > 0) saveGame(this.state)
    }

    // Phase 5: 每日社交模拟 + 因果报应 + NPC自发事件
    this.dailyTickTimer += delta
    if (this.dailyTickTimer >= 30000) { // 每30秒检查一次日期变化
      this.dailyTickTimer = 0
      const currentDay = this.worldTime.year * 360 + this.worldTime.month * 30 + this.worldTime.day
      if (currentDay !== this.lastDayChecked) {
        this.lastDayChecked = currentDay
        this.runDailySimulation()
      }
    }

    // AI 宗门外交 tick（每5分钟结算一次）
    this.diplomacyTimer += delta
    if (this.diplomacyTimer >= 300000) {
      this.diplomacyTimer = 0
      if (this.state.aiSects && this.state.aiSects.length > 0) {
        const events = tickAllAiSects(this.state, this.state.aiSects)
        processTradeIncome(this.state, this.state.aiSects)
        if (this.state.resourceNodes) processResourceIncome(this.state, this.state.resourceNodes)
        for (const msg of events) {
          toast(msg, '#fbbf24')
        }
        if (events.length > 0) saveGame(this.state)
      }
    }
  }

  private updateTimeDisplay() {
    if (this.timeText) {
      this.timeText.setText(formatTime(this.worldTime))
    }
    // 夜晚暗化画面
    if (this.worldTime) {
      const alpha = isDaytime(this.worldTime) ? 0 : 0.1
      // 用一个覆盖层实现夜晚效果
      if (!this.cameras.main.postFX) {
        this.cameras.main.setAlpha(1 - alpha)
      }
    }
  }

  private async interactWithAiSect(ai: AiSect) {
    if (this.transitioning || this.eventActive) return
    input.clearQueues()
    this.player.halt()

    const status = getDiplomacyStatus(ai.relationValue, ai.atWar, ai.alliance)
    const statusName = diplomacyStatusName(status)
    const disp = dispositionDesc(ai.disposition)

    const lines = [
      `${ai.name}（Lv.${ai.level}）`,
      `战力 ${ai.power}  弟子 ${ai.discipleCount}  性格 ${disp}`,
      `外交值 ${ai.relationValue}  关系：${statusName}`,
      ai.atWar ? `战争疲劳 ${ai.warExhaustion}` : ai.alliance ? '同盟关系' : ai.tradeAgreement ? '通商中' : '',
    ]

    const options: { label: string; value: string }[] = [
      { label: '派遣使者', value: 'send_envoy' },
      { label: '斥候侦查', value: 'scout' },
    ]
    if (!ai.atWar && ai.relationValue >= -20) options.push({ label: '拜访宗门', value: 'visit' })
    if (!ai.tradeAgreement && !ai.atWar) options.push({ label: '提议通商', value: 'propose_trade' })
    if (!ai.alliance && !ai.atWar && ai.relationValue >= 50) options.push({ label: '提议结盟', value: 'propose_alliance' })
    if (!ai.atWar && ai.relationValue < -30) options.push({ label: '宣战', value: 'declare_war' })
    if (ai.atWar) {
      options.push({ label: '宗门决战', value: 'sect_war' })
      options.push({ label: '签订和约', value: 'sign_peace' })
    }
    if (!ai.atWar && !ai.alliance && ai.relationValue < 0) options.push({ label: '要求进贡', value: 'request_tribute' })
    options.push({ label: '离开', value: 'leave' })

    const result = await showDialog(ai.name, lines, options)

    if (result === 'visit') {
      await this.visitAiSect(ai)
    } else if (result === 'sect_war') {
      await launchSectWar(this.state, ai)
    } else if (result && result !== 'leave') {
      await executeDiplomacy(this.state, ai, result as any)
    } else {
      input.clearQueues()
    }
  }

  /** 拜访其他宗门：展示宗门场景描述和可交互内容 */
  private async visitAiSect(ai: AiSect) {
    const realmNames = ['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫']
    const disp = dispositionDesc(ai.disposition)

    // 根据宗门属性生成场景描述
    const buildingDescs: string[] = []
    if (ai.level >= 1) buildingDescs.push('主殿巍峨，飞檐翘角，灵气缭绕')
    if (ai.level >= 2) buildingDescs.push('灵脉阵法光芒流转，汇聚天地灵气')
    if (ai.level >= 3) buildingDescs.push('弟子房错落有致，可见弟子修习身影')
    if (ai.level >= 4) buildingDescs.push('炼丹房药香四溢，炉火长明')
    if (ai.level >= 5) buildingDescs.push('藏经阁古朴庄严，典籍浩如烟海')
    if (ai.level >= 6) buildingDescs.push('演武场剑气纵横，弟子切磋正酣')
    if (ai.level >= 7) buildingDescs.push('护山大阵笼罩山门，威压隐现')
    if (ai.level >= 8) buildingDescs.push('秘境入口隐现虚空，灵光吞吐')

    // 弟子信息
    const discipleDesc = ai.discipleCount > 50
      ? `门下弟子${ai.discipleCount}人，人多势众`
      : ai.discipleCount > 20
      ? `门下弟子${ai.discipleCount}人，颇有规模`
      : `门下弟子${ai.discipleCount}人，人丁单薄`

    // 资源状况
    const r = ai.resources
    const resourceDesc = `灵石${r.stone} 灵草${r.herb} 矿石${r.ore} 木材${r.wood}`

    const visitLines: string[] = [
      `你来到${ai.name}山门前。`,
      '',
      '—— 宗门景致 ——',
      ...buildingDescs,
      '',
      `掌门修为约${realmNames[Math.min(ai.level, 7)]}境，性格${disp}`,
      discipleDesc,
      `库存：${resourceDesc}`,
    ]

    // 拜访互动选项
    const visitOptions: { label: string; value: string }[] = []

    // 与弟子交谈
    visitOptions.push({ label: '与弟子交谈', value: 'chat' })

    // 观摩修炼（增加经验）
    if (ai.level >= 3) visitOptions.push({ label: '观摩修炼', value: 'observe' })

    // 交易（通商关系或友好）
    if (ai.tradeAgreement || ai.relationValue >= 30) {
      visitOptions.push({ label: '交换物资', value: 'trade' })
    }

    // 擂台切磋（中立以上）
    if (ai.relationValue >= -10 && !ai.atWar) {
      visitOptions.push({ label: '擂台切磋', value: 'arena' })
    }

    // 结缘（高好感）
    if (ai.relationValue >= 50) {
      visitOptions.push({ label: '论道参悟', value: 'discuss' })
    }

    visitOptions.push({ label: '告辞', value: 'leave' })

    const visitResult = await showDialog(`拜访·${ai.name}`, visitLines, visitOptions)

    if (visitResult === 'chat') {
      // 与弟子交谈：获取宗门情报
      const gossip = [
        `${ai.name}弟子：「欢迎道友来访，我宗${disp}，${ai.discipleCount > 30 ? '人才济济' : '虽小却精'}。」`,
        `「掌门常说：${ai.disposition === 'aggressive' ? '弱肉强食，唯有强者才能守护宗门' : ai.disposition === 'mercantile' ? '和气生财，广结善缘方为长久之道' : ai.disposition === 'isolationist' ? '闭门造车不如潜心修炼' : ai.disposition === 'expansionist' ? '开疆拓土，方能立于不败之地' : '以和为贵，不惹事端'}」`,
      ]
      // 随机弟子八卦
      if (ai.relationValue >= 30) {
        gossip.push(`「听说附近有个秘境出了不少宝贝，道友若有兴趣不妨去看看。」`)
      }
      if (ai.atWar === false && ai.relationValue < -10) {
        gossip.push(`（弟子小声嘀咕了什么，似乎对你有所戒备）`)
      }
      await showDialog(`${ai.name}弟子`, gossip, [{ label: '告辞', value: 'ok' }])
      // 好感+
      ai.relationValue = Math.min(100, ai.relationValue + 3)
      toast(`与${ai.name}弟子交谈甚欢，外交值+3`, '#a3e4d7')
      saveGame(this.state)
    } else if (visitResult === 'observe') {
      // 观摩修炼：获得经验
      const expGain = ai.level * 15 + 10
      let remaining = expGain
      while (remaining > 0) {
        const need = this.state.level * 50
        if (this.state.exp + remaining >= need) {
          remaining -= need - this.state.exp
          this.state.level++
          this.state.exp = 0
          sfx('sfx_levelup')
        } else {
          this.state.exp += remaining
          remaining = 0
        }
      }
      this.worldTime = advanceTime(this.worldTime, 60 * 60 * 1000)
      this.state.worldTime = this.worldTime
      toast(`观摩${ai.name}修炼之法，获得经验${expGain}`, '#fbbf24')
      updateHUD()
      saveGame(this.state)
    } else if (visitResult === 'trade') {
      // 交换物资：用灵石换材料
      const tradeOptions = [
        { label: `灵石50→灵草×3`, value: 'herb' },
        { label: `灵石50→矿石×3`, value: 'ore' },
        { label: `灵石50→木材×3`, value: 'wood' },
        { label: '算了', value: 'cancel' },
      ]
      const tradeResult = await showDialog(`${ai.name}·交换物资`, [
        `${ai.name}愿意与你交换物资。`,
        `你的灵石：${this.state.gold}`,
      ], tradeOptions)

      if (tradeResult && tradeResult !== 'cancel') {
        if (this.state.gold >= 50) {
          this.state.gold -= 50
          const matKey = tradeResult === 'herb' ? 'lingcao' : tradeResult === 'ore' ? 'kuangshi' : 'mucai'
          this.state.materials[matKey] = (this.state.materials[matKey] || 0) + 3
          toast(`交换成功！获得${tradeResult === 'herb' ? '灵草' : tradeResult === 'ore' ? '矿石' : '木材'}×3`, '#4ade80')
          sfx('sfx_chest')
          saveGame(this.state)
          updateHUD()
        } else {
          toast('灵石不足', '#f87171')
        }
      }
    } else if (visitResult === 'arena') {
      // 擂台切磋：1v1战斗，派出对方弟子
      const enemyLevel = Math.max(1, ai.level + Math.floor(this.state.level / 3))
      const enemyRealm = Math.min(7, Math.max(0, ai.level - 1))
      const enemyNpc = this.state.proceduralNpcs.find(n =>
        n.alive && n.isActive && n.realm <= enemyRealm + 1 && n.realm >= enemyRealm - 1
      )
      if (enemyNpc) {
        this.registry.set('npcCombatData', {
          npcId: enemyNpc.id,
          mode: 'arena',
          npcName: `${ai.name}弟子·${enemyNpc.name}`,
          npcHp: enemyNpc.hp,
          npcMaxHp: enemyNpc.maxHp,
          npcAtk: enemyNpc.atk,
          npcDef: enemyNpc.def,
          npcRealm: enemyNpc.realm,
          npcMorality: enemyNpc.morality,
          regionId: this.domainToRegionId(this.currentDomain),
          appearanceSeed: enemyNpc.appearanceSeed,
          gender: enemyNpc.gender,
          daoPath: enemyNpc.daoPath,
          level: enemyNpc.level,
          background: enemyNpc.background,
          profession: enemyNpc.profession,
          skills: enemyNpc.skills,
          equipment: enemyNpc.equipment,
          inventory: enemyNpc.inventory,
          story: enemyNpc.story,
          lifeGoal: enemyNpc.lifeGoal,
          currentPurpose: enemyNpc.currentPurpose,
          personality: enemyNpc.personality,
          isArena: true,
          sectName: ai.name,
        })
        this.transitioning = true
        sfx('sfx_hit')
        saveGame(this.state)
        this.worldTime = advanceTime(this.worldTime, 30 * 60 * 1000)
        this.state.worldTime = this.worldTime
        this.time.delayedCall(200, () => {
          this.registry.set('dungeonReturnScene', 'World')
          this.scene.start('Dungeon', {
            mode: 'npcCombat',
            subMode: 'attack',
            regionOverride: this.domainToRegionId(this.currentDomain),
            npcId: enemyNpc.id,
          })
        })
      } else {
        toast(`${ai.name}暂时没有合适的弟子出战`, '#94a3b8')
      }
    } else if (visitResult === 'discuss') {
      // 论道参悟：获得悟道点
      const insightGain = ai.level + 3
      this.state.insight = (this.state.insight || 0) + insightGain
      this.worldTime = advanceTime(this.worldTime, 2 * 60 * 60 * 1000)
      this.state.worldTime = this.worldTime
      ai.relationValue = Math.min(100, ai.relationValue + 5)
      toast(`与${ai.name}高人论道，悟道+${insightGain}，外交值+5`, '#af7ac5')
      sfx('sfx_levelup')
      updateHUD()
      saveGame(this.state)
    }

    input.clearQueues()
  }

  private async interactWithResourceNode(node: ResourceNode) {
    if (this.transitioning || this.eventActive) return
    input.clearQueues()
    this.player.halt()

    const owner = node.ownerId === 'player' ? '你的领地' : node.ownerId ? '敌方占领' : '无主之地'
    const prod = node.production
    const prodStr = [
      prod.stone ? `灵石${prod.stone}` : '',
      prod.herb ? `灵草${prod.herb}` : '',
      prod.ore ? `矿石${prod.ore}` : '',
      prod.wood ? `木材${prod.wood}` : '',
    ].filter(Boolean).join(' ')

    const lines = [
      `${node.name}（${owner}）`,
      `产出：${prodStr}/小时`,
      `驻军战力：${node.garrison}`,
    ]

    const options: { label: string; value: string }[] = []
    if (node.ownerId !== 'player') {
      options.push({ label: '攻打占领', value: 'attack' })
      options.push({ label: '擂台挑战', value: 'arena' })
    } else {
      options.push({ label: '查看详情', value: 'info' })
      // 设置争夺中状态
      node.contested = false
    }
    options.push({ label: '离开', value: 'leave' })

    const result = await showDialog(node.name, lines, options)

    if (result === 'attack') {
      await attackResourceNode(this.state, node, this.state.aiSects ?? [])
      this.renderResourceNodes()
    } else if (result === 'arena') {
      await this.resourceArenaChallenge(node)
    } else {
      input.clearQueues()
    }
  }

  /** 资源点擂台挑战：对方宗门派出弟子1v1 */
  private async resourceArenaChallenge(node: ResourceNode) {
    // 查找对方宗门
    const ownerSect = node.ownerId && node.ownerId !== 'player'
      ? this.state.aiSects?.find(s => s.id === node.ownerId)
      : null
    const sectName = ownerSect?.name || '守方'

    // 生成对方出战弟子
    const enemyRealm = ownerSect ? Math.min(7, Math.max(0, ownerSect.level - 1)) : 1
    const enemyNpc = this.state.proceduralNpcs.find(n =>
      n.alive && n.isActive && n.realm <= enemyRealm + 1 && n.realm >= Math.max(0, enemyRealm - 1)
    )

    if (!enemyNpc) {
      toast(`${sectName}暂时无人出战擂台`, '#94a3b8')
      input.clearQueues()
      return
    }

    const realmNames = ['练气', '筑基', '金丹', '元婴', '化神', '合体', '大乘', '渡劫']
    const introLines = [
      `${node.name} · 擂台争夺`,
      `守方：${sectName} 派出弟子${enemyNpc.name}`,
      `${enemyNpc.name}·${realmNames[enemyNpc.realm]} ${enemyNpc.level}级`,
      `道途：${enemyNpc.daoPath}`,
      enemyNpc.skills.length > 0 ? `功法：${enemyNpc.skills.map(s => getNpcSkillName(s)).join('、')}` : '',
      `胜者获得此资源点控制权`,
    ].filter(Boolean)

    const acceptResult = await showDialog('擂台挑战', introLines, [
      { label: '出战', value: 'fight' },
      { label: '放弃', value: 'cancel' },
    ])

    if (acceptResult !== 'fight') {
      input.clearQueues()
      return
    }

    // 进入战斗
    this.registry.set('npcCombatData', {
      npcId: enemyNpc.id,
      mode: 'arena',
      npcName: `${sectName}弟子·${enemyNpc.name}`,
      npcHp: enemyNpc.hp,
      npcMaxHp: enemyNpc.maxHp,
      npcAtk: enemyNpc.atk,
      npcDef: enemyNpc.def,
      npcRealm: enemyNpc.realm,
      npcMorality: enemyNpc.morality,
      regionId: this.domainToRegionId(this.currentDomain),
      appearanceSeed: enemyNpc.appearanceSeed,
      gender: enemyNpc.gender,
      daoPath: enemyNpc.daoPath,
      level: enemyNpc.level,
      background: enemyNpc.background,
      profession: enemyNpc.profession,
      skills: enemyNpc.skills,
      equipment: enemyNpc.equipment,
      inventory: enemyNpc.inventory,
      story: enemyNpc.story,
      lifeGoal: enemyNpc.lifeGoal,
      currentPurpose: enemyNpc.currentPurpose,
      personality: enemyNpc.personality,
      isArena: true,
      resourceName: node.name,
      resourceNodeId: node.id,
      sectName,
    })

    node.contested = true
    this.transitioning = true
    sfx('sfx_hit')
    saveGame(this.state)
    this.worldTime = advanceTime(this.worldTime, 30 * 60 * 1000)
    this.state.worldTime = this.worldTime
    this.time.delayedCall(200, () => {
      this.registry.set('dungeonReturnScene', 'World')
      this.scene.start('Dungeon', {
        mode: 'npcCombat',
        subMode: 'attack',
        regionOverride: this.domainToRegionId(this.currentDomain),
        npcId: enemyNpc.id,
      })
    })
  }

  private async interactWithPoint(p: WorldPoint) {
    if (this.transitioning || this.eventActive) return
    input.clearQueues()

    switch (p.type) {
      case 'home':
        await this.interactHome(p)
        break
      case 'city':
        this.transitioning = true
        sfx('sfx_portal')
        saveGame(this.state)
        this.cameras.main.fadeOut(400, 0, 0, 0)
        this.time.delayedCall(420, () => this.scene.start('City'))
        break
      case 'dungeon':
        await this.enterDungeon(p)
        break
      case 'resource':
        this.collectResource(p)
        break
      case 'teleport':
        this.openTeleportMenu(p)
        break
      case 'landmark':
        this.visitLandmark(p)
        break
      case 'sect':
        await this.enterSect(p)
        break
      case 'domain_gate':
        await this.switchDomain(p)
        break
    }
  }

  // ===== Phase 6: 洞府交互（心魔管理 + 渡劫准备） =====

  private async interactHome(p: WorldPoint) {
    const demonSummary = getDemonSummary(this.state)
    const demonCount = demonSummary.demons.length
    const tribCheck = canTriggerTribulation(this.state)
    const upcoming = getUpcomingEvent(this.worldTime)

    const lines: string[] = [p.description || '洞府']
    const options: { label: string; value: string }[] = [
      { label: '进入洞府', value: 'enter_town' },
    ]
    if (demonCount > 0) {
      lines.push(`心魔：${demonCount}种，总强度${demonSummary.total}/100`)
      options.push({ label: '心魔修炼', value: 'manage_demons' })
    } else {
      lines.push('心魔：无')
    }
    if (tribCheck.ok) {
      options.push({ label: '准备渡劫', value: 'prepare_tribulation' })
    }
    // Phase 7: 坐骑管理
    options.push({ label: '坐骑', value: 'mount_menu' })
    // Phase 7: 年度事件预告
    if (upcoming) {
      lines.push(`下月年度事件：${upcoming.name}（${upcoming.monthLeft}个月后）`)
    }
    // Phase 7: 世界演进状态
    const evolution = getWorldEvolutionState(this.state)
    lines.push(`世界纪元：${evolution.era}（演进值${this.state.worldEvolutionScore || 0}）`)

    const result = await showDialog(p.name, lines, options)

    switch (result) {
      case 'enter_town':
        this.transitioning = true
        sfx('sfx_portal')
        saveGame(this.state)
        this.cameras.main.fadeOut(400, 0, 0, 0)
        this.time.delayedCall(420, () => this.scene.start('Town'))
        break
      case 'manage_demons':
        await this.manageInnerDemons()
        break
      case 'prepare_tribulation':
        await this.prepareEnhancedTribulation()
        break
      case 'mount_menu':
        await this.openMountMenu()
        break
      default:
        input.clearQueues()
        break
    }
  }

  /** 开辟新洞府：花费灵石，将当前位置设为出生点 */
  private async buildNewHome() {
    const COST = 5000
    const lines = [
      `在此处开辟新洞府？出洞后将固定在此位置出生。`,
      `费用：灵石 ${COST}`,
      `当前灵石：${this.state.gold}`,
    ]
    const result = await showDialog('开辟新洞府', lines, [
      { label: `开辟（${COST} 灵石）`, value: 'confirm' },
      { label: '放弃', value: 'cancel' },
    ])
    if (result !== 'confirm') {
      input.clearQueues()
      return
    }
    if (this.state.gold < COST) {
      toast('灵石不足！', '#ff6b6b')
      input.clearQueues()
      return
    }
    this.state.gold -= COST
    this.state.homeX = Math.round(this.player.sprite.x)
    this.state.homeY = Math.round(this.player.sprite.y)
    saveGame(this.state)
    toast(`新洞府已开辟！出洞后将在此处出生`, '#48e0d0')
    sfx('sfx_cave_build', 0.6)
  }

  // ===== Phase 7: 坐骑管理界面 =====

  private async openMountMenu() {
    const ownedMounts = (this.state as any).ownedMounts as MountType[] | undefined
    const activeMount = (this.state as any).activeMount as { type: MountType; summoned: boolean; endurance: number } | undefined

    const lines: string[] = []
    if (activeMount?.summoned) {
      const def = MOUNTS[activeMount.type]
      lines.push(`当前坐骑：${def.name}（耐力${activeMount.endurance}/100）`)
      lines.push(`速度${def.speedMultiplier}x | 飞行${def.canFly ? '可' : '否'} | 视野+${def.visionBonus}`)
    } else {
      lines.push('未召唤坐骑')
    }

    const options: { label: string; value: string }[] = []

    if (activeMount?.summoned) {
      options.push({ label: '收回坐骑', value: 'dismiss' })
    }

    if (ownedMounts && ownedMounts.length > 0) {
      for (const mt of ownedMounts) {
        const def = MOUNTS[mt]
        if (this.state.realm >= def.minRealm) {
          options.push({ label: `召唤·${def.name}`, value: `summon_${mt}` })
        }
      }
    }

    // 可购买的坐骑
    for (const mt of Object.keys(MOUNTS) as MountType[]) {
      const def = MOUNTS[mt]
      if (!ownedMounts?.includes(mt) && this.state.realm >= def.minRealm && this.state.level >= def.minLevel) {
        options.push({ label: `购买·${def.name}(${def.cost})`, value: `buy_${mt}` })
      }
    }

    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('坐骑管理', lines, options)

    if (!result || result === 'back') {
      await this.interactHome(getPoint('home')!)
      return
    }

    if (result === 'dismiss') {
      const r = dismissMount(this.state)
      toast(r.reason, '#fbbf24')
      saveGame(this.state)
      this.refreshMountSprite()
      await this.openMountMenu()
      return
    }

    if (result.startsWith('summon_')) {
      const mt = result.replace('summon_', '') as MountType
      const r = summonMount(this.state, mt)
      toast(r.reason, r.ok ? '#a3e4d7' : '#f87171')
      saveGame(this.state)
      this.refreshMountSprite()
      await this.openMountMenu()
      return
    }

    if (result.startsWith('buy_')) {
      const mt = result.replace('buy_', '') as MountType
      const r = purchaseMount(this.state, mt)
      toast(r.reason, r.ok ? '#a3e4d7' : '#f87171')
      saveGame(this.state)
      await this.openMountMenu()
      return
    }

    input.clearQueues()
  }

  private async manageInnerDemons() {
    const summary = getDemonSummary(this.state)
    if (summary.demons.length === 0) {
      toast('心中澄明，无心魔困扰', '#a3e4d7')
      input.clearQueues()
      return
    }

    const typeNames: Record<string, string> = {
      killing: '杀戮', betrayal: '背叛', dark_arts: '魔功',
      heartbreak: '情伤', greed: '贪欲', pride: '傲慢',
      fear: '恐惧', obsession: '执念',
    }

    const lines: string[] = ['当前心魔：']
    for (const d of summary.demons) {
      const status = d.sealed ? ' [已封印]' : ''
      lines.push(`· ${typeNames[d.type] ?? d.type}：${d.intensity}/100${status}`)
    }
    lines.push('', '选择化解方式：')

    const options: { label: string; value: string }[] = [
      { label: '静坐化解(-5)', value: 'meditation' },
      { label: '丹药净化(-20)', value: 'pill' },
      { label: '封印镇压', value: 'seal' },
      { label: '返回', value: 'back' },
    ]

    const method = await showDialog('心魔修炼', lines, options)
    if (!method || method === 'back') {
      await this.interactHome(getPoint('home')!)
      return
    }

    const methodMap: Record<string, 'meditation' | 'pill' | 'seal'> = {
      meditation: 'meditation',
      pill: 'pill',
      seal: 'seal',
    }
    const purifyMethod = methodMap[method]
    if (!purifyMethod) {
      input.clearQueues()
      return
    }

    // 选择目标心魔
    const targetOptions: { label: string; value: string }[] = summary.demons
      .filter(d => !d.sealed)
      .map(d => ({
        label: `${typeNames[d.type] ?? d.type} (${d.intensity})`,
        value: d.type,
      }))
    if (targetOptions.length === 0) {
      toast('所有心魔已被封印', '#fbbf24')
      await this.interactHome(getPoint('home')!)
      return
    }
    targetOptions.push({ label: '返回', value: 'back' })

    const targetType = await showDialog('选择目标心魔', ['选择要化解的心魔：'], targetOptions)
    if (!targetType || targetType === 'back') {
      await this.manageInnerDemons()
      return
    }

    const demonType = targetType as InnerDemonType
    const result = purifyDemon(this.state, demonType, purifyMethod)
    toast(result.message, result.success ? '#a3e4d7' : '#f87171')
    saveGame(this.state)

    // 继续管理或返回
    await this.manageInnerDemons()
  }

  private async prepareEnhancedTribulation() {
    const prep = prepareTribulation(this.state)
    if (!prep) {
      toast('当前境界无法渡劫或修为不足', '#f87171')
      await this.interactHome(getPoint('home')!)
      return
    }

    const lines = [...prep.warnings]
    lines.push('', '是否立即开始渡劫？')

    const result = await showDialog(prep.def.name, lines, [
      { label: '开始渡劫', value: 'start' },
      { label: '容后再议', value: 'cancel' },
    ])

    if (result !== 'start') {
      await this.interactHome(getPoint('home')!)
      return
    }

    // 传递增强天劫数据到注册表，供 TribulationScene 使用
    this.registry.set('enhancedTribulation', prep.def)
    this.transitioning = true
    sfx('sfx_portal')
    saveGame(this.state)
    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.time.delayedCall(320, () => this.scene.start('Tribulation', { realmIndex: prep.def.realmIndex }))
  }

  private async enterDungeon(p: WorldPoint) {
    if (!p.dungeonData) return
    const dd = p.dungeonData

    const result = await showDialog(p.name, [
      p.description,
      '是否进入此秘境？',
    ], [{ label: '进入', value: 'enter' }, { label: '离开', value: 'leave' }])

    if (result !== 'enter') {
      input.clearQueues()
      return
    }

    this.transitioning = true
    sfx('sfx_portal')
    saveGame(this.state)

    // 时间推进 2 时辰（进入秘境耗时）
    this.worldTime = advanceTime(this.worldTime, 2 * 5 * 60 * 1000 / 12)
    this.state.worldTime = this.worldTime

    // 根据秘境数据进入 DungeonScene（带转场淡出）
    this.registry.set('dungeonReturnScene', 'World')
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.time.delayedCall(420, () => {
      if (dd.region === 'hl') {
        this.scene.start('Dungeon', { mode: 'hl' })
      } else if (dd.region === 'xian') {
        this.scene.start('Dungeon', { floor: dd.startFloor, diff: 'normal', mode: 'xian' })
      } else if (['wanyao', 'tianjian', 'haishi', 'jiaolong', 'guzhan', 'loulan', 'bingyuan', 'shenyuan'].includes(dd.region)) {
        this.scene.start('Dungeon', { floor: dd.startFloor, diff: 'normal', regionOverride: dd.region })
      } else {
        this.scene.start('Dungeon', { floor: dd.startFloor, diff: 'normal' })
      }
    })
  }

  private async enterSect(p: WorldPoint) {
    if (this.state.sectUnlocked && this.state.sect) {
      // 已建立宗门 → 直接进入
      this.transitioning = true
      sfx('sfx_portal')
      saveGame(this.state)
      this.cameras.main.fadeOut(400, 0, 0, 0)
      this.time.delayedCall(420, () => this.scene.start('Sect', { fromScene: 'world' }))
      return
    }

    // 未建立宗门 → 检查开宗条件
    if (this.state.realm < SECT_FOUND_REALM) {
      toast(`需要达到${REALMS[SECT_FOUND_REALM].name}期方可开宗立派`, '#f87171')
      input.clearQueues()
      return
    }

    if (this.state.gold < SECT_FOUND_COST) {
      toast(`开宗需要 ${SECT_FOUND_COST} 灵石，当前不足`, '#f87171')
      input.clearQueues()
      return
    }

    const result = await showDialog('开宗立派', [
      p.description,
      `消耗 ${SECT_FOUND_COST} 灵石，在此建立宗门。`,
    ], [{ label: '开宗立派', value: 'found' }, { label: '容后再议', value: 'cancel' }])

    if (result !== 'found') {
      input.clearQueues()
      return
    }

    // 让玩家自定义宗门名称
    const defaultName = this.state.heroName + '宗'
    const inputName = await showInputDialog('宗门命名', ['请为新宗门命名：'], defaultName, '输入宗门名称')

    if (inputName === null) {
      input.clearQueues()
      return
    }

    // 扣费并创建宗门
    this.state.gold -= SECT_FOUND_COST
    const sectName = inputName || defaultName
    this.state.sect = createNewSect(sectName, this.worldTime, p.x, p.y)
    this.state.sectUnlocked = true
    onSectEstablished(this.state)

    // 初始化 AI 宗门和资源点
    const aiRng = makeRng(Date.now() % 2147483647)
    this.state.aiSects = []
    for (let i = 0; i < 6; i++) {
      this.state.aiSects.push(generateAiSect(aiRng, 1, i))
    }
    this.state.resourceNodes = generateResourceNodes(aiRng)
    this.state.diplomacyTickTimer = 0

    saveGame(this.state)

    sfx('sfx_levelup')
    toast(`宗门「${sectName}」已建立！`, '#fbbf24')

    // 宗门成立剧情：NPC 加入
    await showDialog('宗门初立', [
      `宗门「${sectName}」巍然矗立于天地之间。`,
      '消息传出，四方修士来投。',
      '',
      '长老 周道玄：「老朽愿辅佐宗主，统管宗门事务。」',
      '丹师 丹阳子：「丹道无穷，吾愿为宗门炼制丹药。」',
      '器师 欧冶子：「器道亦是道，宗门炼器之事交予老夫。」',
      '书灵：「藏经阁万千功法，吾将悉心守护。」',
      '教头 武狂：「演武场交给我，弟子们的战力我来磨砺！」',
      '执事 陈奉：「任务殿运转、宗门杂务，陈某义不容辞。」',
      '',
      '宗门初立，百废待兴。可在「宗门」面板中建造建筑、管理弟子、处理外交。',
    ], [{ label: '开始经营', value: 'ok' }])
    input.clearQueues()

    this.transitioning = true
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.time.delayedCall(420, () => this.scene.start('Sect', { fromScene: 'world' }))
  }

  private collectResource(p: WorldPoint) {
    if (!p.resourceType) return

    const now = Date.now()
    const lastCollect = this.resourceCooldowns[p.id] || 0
    const cooldown = 30000 // 30 秒冷却
    if (now - lastCollect < cooldown) {
      const remaining = Math.ceil((cooldown - (now - lastCollect)) / 1000)
      toast(`灵气尚未恢复，约 ${remaining} 秒后可再次采集`, '#f0c987')
      return
    }

    this.resourceCooldowns[p.id] = now

    const level = p.resourceLevel || 1
    const amounts: Record<string, number> = {
      spirit_stone: 20 + level * 15 + randInt(this.rng, 0, 10),
      ore: 1 + level + randInt(this.rng, 0, 2),
      herb: 1 + level + randInt(this.rng, 0, 2),
      insight: 3 + level * 2 + randInt(this.rng, 0, 3),
    }

    const amount = amounts[p.resourceType] || 10
    sfx('sfx_pickup')

    switch (p.resourceType) {
      case 'spirit_stone':
        this.state.gold += amount
        toast(`采集灵石 +${amount}`, '#ffd54a')
        break
      case 'ore':
        this.state.materials.ore = (this.state.materials.ore || 0) + amount
        toast(`采集矿石 +${amount}`, '#5dade2')
        break
      case 'herb':
        this.state.materials.herb = (this.state.materials.herb || 0) + amount
        toast(`采集灵草 +${amount}`, '#48e08a')
        break
      case 'insight':
        this.state.insight += amount
        toast(`感悟天地 +${amount} 悟道点`, '#af7ac5')
        break
    }

    // 采集消耗时间
    this.worldTime = advanceTime(this.worldTime, 30 * 1000)
    this.state.worldTime = this.worldTime
    saveGame(this.state)
  }

  private async openTeleportMenu(p: WorldPoint) {
    const targets = getTeleportTargets(this.currentDomain).filter(t => t.id !== p.id && this.state.discoveredPoints.includes(t.id))
    if (targets.length === 0) {
      toast('尚未发现其他传送阵', '#f0c987')
      return
    }

    const options = targets.map(t => ({ label: t.name, value: t.id }))
    const result = await showDialog(p.name, [
      '选择传送目标：',
      ...targets.map(t => `${t.name} (${t.description})`),
    ], options)

    if (result && result !== 'cancel') {
      const target = getPoint(result)
      if (target) {
        this.transitioning = true
        sfx('sfx_portal')
        // 传送消耗时间（1 时辰）
        this.worldTime = advanceTime(this.worldTime, 5 * 60 * 1000 / 12)
        this.state.worldTime = this.worldTime
        this.player.sprite.setPosition(target.x + 30, target.y + 30)
        this.state.worldPlayerX = target.x + 30
        this.state.worldPlayerY = target.y + 30
        saveGame(this.state)
        toast(`已传送至 ${target.name}`, '#bb8fce')
        this.transitioning = false
        // 重新渲染点位以发现周围新点位
        this.renderPoints()
        this.updateMiniMap()
      }
    }
  }

  private async visitLandmark(p: WorldPoint) {
    const result = await showDialog(p.name, [
      p.description,
      '此处灵气充沛，可就地修炼。',
    ], [{ label: '修炼片刻', value: 'meditate' }, { label: '离开', value: 'leave' }])

    if (result === 'meditate') {
      // 修炼获得悟道点 + 少量经验
      const insight = 2 + randInt(this.rng, 0, 4)
      this.state.insight += insight
      // 修炼消耗 1 时辰
      this.worldTime = advanceTime(this.worldTime, 5 * 60 * 1000 / 12)
      this.state.worldTime = this.worldTime
      saveGame(this.state)
      toast(`修炼感悟 +${insight} 悟道点`, '#af7ac5')
      sfx('sfx_levelup')
    }
  }

  private async switchDomain(p: WorldPoint) {
    if (!p.domainGateTarget) return
    const targetDomain = p.domainGateTarget
    const targetDef = getDomainDef(targetDomain)
    if (!targetDef) return

    // 检查解锁条件
    if (!isPointUnlocked(p, this.state)) {
      toast('此域门尚未解锁', '#f87171')
      input.clearQueues()
      return
    }

    const result = await showDialog(p.name, [
      p.description,
      `是否前往${targetDef.name}？`,
    ], [{ label: '前往', value: 'go' }, { label: '离开', value: 'leave' }])

    if (result !== 'go') {
      input.clearQueues()
      return
    }

    this.transitioning = true
    sfx('sfx_portal')

    // 更新域和坐标
    this.state.worldDomain = targetDomain
    // 设置玩家到目标域的传送阵附近
    const targetGate = getDomainPoints(targetDomain).find(pt => pt.type === 'domain_gate' && pt.domainGateTarget === this.currentDomain)
    if (targetGate) {
      this.state.worldPlayerX = targetGate.x + 30
      this.state.worldPlayerY = targetGate.y + 30
    } else {
      // 找不到对应域门，放到该域的传送阵
      const teleport = getDomainPoints(targetDomain).find(pt => pt.type === 'teleport')
      if (teleport) {
        this.state.worldPlayerX = teleport.x + 30
        this.state.worldPlayerY = teleport.y + 30
      }
    }

    // 时间推进 6 时辰（跨域旅行）
    this.worldTime = advanceTime(this.worldTime, 6 * 5 * 60 * 1000 / 12)
    this.state.worldTime = this.worldTime
    saveGame(this.state)

    this.cameras.main.fadeOut(600, 0, 0, 0)
    this.time.delayedCall(620, () => {
      this.scene.restart({ fromScene: 'world' })
    })
  }

  private async triggerRandomEvent() {
    if (this.eventActive || this.transitioning) return
    this.eventActive = true

    const ev = rollWorldEvent(this.rng, this.worldTime, this.state.level)
    const options = ev.choices.map(c => ({ label: c.label, value: c.label }))
    const result = await showDialog(ev.title, [ev.description], options)

    const choice = ev.choices.find(c => c.label === result)
    if (!choice) {
      this.eventActive = false
      return
    }

    this.applyEventChoice(ev, choice)
  }

  private applyEventChoice(ev: WorldEvent, choice: WorldEventChoice) {
    const r = choice.reward
    if (!r) {
      if (choice.text) toast(choice.text, '#a3e4d7')
      this.eventActive = false
      return
    }

    switch (choice.outcome) {
      case 'battle':
        // 进入战斗（以临时地下城场景模拟）
        this.eventActive = false
        this.transitioning = true
        sfx('sfx_portal')
        saveGame(this.state)
        toast(choice.text, '#ff6b6b')
        this.time.delayedCall(300, () => {
          this.registry.set('dungeonReturnScene', 'World')
          this.scene.start('Dungeon', { floor: r.dungeonFloor || 1, diff: 'normal' })
        })
        break
      case 'reward':
        if (r.gold) this.state.gold += r.gold
        if (r.exp) {
          // gainExp logic inline
          let remaining = r.exp
          while (remaining > 0) {
            const need = this.state.level * 50
            if (this.state.exp + remaining >= need) {
              remaining -= need - this.state.exp
              this.state.level++
              this.state.exp = 0
              sfx('sfx_levelup')
            } else {
              this.state.exp += remaining
              remaining = 0
            }
          }
        }
        if (r.insight) this.state.insight += r.insight
        if (r.hpCost) {
          // 在大地图上 HP 不会低于 1
          toast(choice.text || '事件结束', '#f0d98c')
        }
        if (r.materials) {
          for (const [k, v] of Object.entries(r.materials)) {
            if (v > 0) this.state.materials[k] = (this.state.materials[k] || 0) + v
          }
        }
        // 宝物事件生成装备进背包
        if (ev.type === 'treasure_find' || ev.type === 'ancestor_relic') {
          const item = this.generateTreasureItem(ev.type === 'ancestor_relic')
          this.state.inventory.push(item)
          const qColors = ['#a0a0a0', '#4ade80', '#60a5fa', '#c084fc']
          toast(`获得【${item.name}】`, qColors[item.quality] ?? '#f0d98c')
        }
        // 事件消耗时间
        this.worldTime = advanceTime(this.worldTime, 60 * 1000)
        this.state.worldTime = this.worldTime
        saveGame(this.state)
        toast(choice.text || '事件结束', '#f0d98c')
        this.eventActive = false
        break
      case 'leave':
        if (choice.text) toast(choice.text, '#a3e4d7')
        this.eventTimeAdvance()
        this.eventActive = false
        break
      case 'teleport_home':
        this.eventActive = false
        this.transitioning = true
        sfx('sfx_portal')
        this.player.sprite.setPosition(600, 1350)
        this.state.worldPlayerX = 600
        this.state.worldPlayerY = 1350
        saveGame(this.state)
        toast('你回到了洞府附近', '#48e08a')
        this.transitioning = false
        break
    }
    updateHUD()
  }

  private eventTimeAdvance() {
    this.worldTime = advanceTime(this.worldTime, 60 * 1000)
    this.state.worldTime = this.worldTime
  }

  /** 宝物事件生成随机装备 */
  private generateTreasureItem(highQuality: boolean): EquipItem {
    const rng = makeRng(Date.now() ^ Math.floor(Math.random() * 1e9))
    const luck = highQuality ? 30 : 5
    return rollEquip(rng, this.state.level, luck, this.state.level)
  }
}
