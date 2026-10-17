// ---------- 宗门场景 · 俯视视角 ----------

import Phaser from 'phaser'
import { Player } from '../entities'
import { input } from '../input'
import { saveGame, loadSaveSlot, type GameState } from '../state'
import { activeBeastRef, setActiveBeast } from '../party'
import { toast, showDialog, dialogOpen, panelOpen, resetControls, setFloorText, updateHUD, setSettingsCallbacks, openInventory, closePanel, openSectDashboard, setSectCallbacks, type SectDashboardData, type BuildingProdInfo, openDiscipleDashboard, setDiscipleCallbacks, type DiscipleDashboardData, type DiscipleCardData, type RecruitCandidate } from '../ui'
import { BGM_SECT, playBgm, sfx, stopBgm } from '../audio'
import { advanceTime, formatTime, type WorldTime } from '../world-time'
import { makeRng, type EquipItem } from '../core'
import { QUALITY_NAMES } from '../data'
import {
  BUILDINGS, BUILDING_IDS,
  spiritVeinProduction, spiritFarmProduction, oreMineProduction, woodPavilionProduction, discipleCapacity,
  addDiscipleEvent,
  type BuildingId, type SectData, type SectResources, type RevengeTarget,
} from '../sect-data'
import {
  canUpgradeBuilding, getBuildingUpgradeCost, upgradeBuilding as upgradeBuildingV2,
} from '../sect-building-v2'
import {
  generateDisciple, cultivationSpeed, expToNextRealm,
  questSuccessRate, retreatCost, RETREAT_DURATION,
  GUIDANCE_COOLDOWN, GUIDANCE_EXP,
  effectiveStats, disciplePower, sparDisciples, SPAR_COOLDOWN,
  DISCIPLE_RANKS, DISCIPLE_ROLES, canPromote, promoteDisciple, rankName,
  SPIRIT_ROOTS, TALENTS, REALM_NAMES, SECT_QUESTS,
  aggregateSectBuffs, stoneCultivateCost, stoneCultivate, checkAmbush, ambushResultName,
  type Disciple, type DiscipleRealm, type SectQuest, type AmbushEvent,
} from '../disciple-data'
import {
  PILL_RECIPES, FORGE_RECIPES, CROPS, TECHS, TECH_IDS,
  alchemySuccess, generateForgedEquipment, techUpgradeCost,
  getTeachableSkills, canLearnSkill, getTechMultipliers,
  type PillRecipe, type ForgeRecipe, type TechDef, type CropDef, type TechId,
} from '../sect-production'
import { initNpcStates, updateNpcGrowth, talkToNpc, getLocationNpcs, type NpcDef, type NpcState } from '../npc-system'
import { getOrCreateNpcTexture } from '../npc-sprite-gen'
import { getDiplomacyStatus, diplomacyStatusName, dispositionDesc, type AiSect } from '../ai-sect-data'
import { executeDiplomacy, launchSectWar, tickAllAiSects, processTradeIncome, processResourceIncome, processSectDefense } from '../diplomacy'
import { tryCompleteQuest, onDiplomacyAction, onSectWarWon, getQuestHudText } from '../storyline-system'
import { checkAchievements } from '../achievement-system'
import { loadLazyGroup, registerLazyAnimations } from '../lazy-assets'
import {
  BEAST_SPECIES, BEAST_SPECIES_MAP, RARITY_NAMES, RARITY_COLORS, ELEMENT_NAMES,
  beastCapacity, generateBeast, feedBeast, captureRate, mountSpeedBonus,
  type Beast,
} from '../beast-data'
import {
  FORMATIONS, FORMATION_MAP, FORMATION_TYPE_NAMES,
  isFormationReady, type FormationDef,
} from '../formation-data'
import {
  createMerchant, shouldRefreshMerchant, getSellPrice, generateTradeOffer,
  type MerchantData,
} from '../merchant-system'

const PLAYER_SPEED = 120
const TILE = 48
const COLS = 9
const ROWS = 20
const SECT_W = COLS * TILE   // 432
const SECT_H = ROWS * TILE   // 960

interface BuildingObj {
  id: BuildingId
  name: string
  level: number
  gx: number
  gy: number
  sprite: Phaser.GameObjects.Sprite | null
  label: Phaser.GameObjects.Text
  lvText: Phaser.GameObjects.Text
  /** 未建造时的占位底座 */
  placeholder: Phaser.GameObjects.Rectangle | null
}

export class SectScene extends Phaser.Scene {
  private state!: GameState
  private player!: Player
  private worldTime!: WorldTime
  private sect!: SectData
  private buildingObjs: Map<BuildingId, BuildingObj> = new Map()
  private npcSprites: { id: string; sprite: Phaser.Physics.Arcade.Sprite; nameText: Phaser.GameObjects.Text; baseX: number; baseY: number }[] = []
  private nearNpcId: string | null = null
  private npcShadows: Map<string, Phaser.GameObjects.Graphics> = new Map()
  /** 弟子渲染对象 */
  private discipleSprites: { uid: string; sprite: Phaser.Physics.Arcade.Sprite; nameText: Phaser.GameObjects.Text; shadow: Phaser.GameObjects.Graphics; activity: string; wanderTimer: number; targetX: number; targetY: number }[] = []
  private nearDiscipleUid: string | null = null
  /** 弟子间互动冷却 */
  private discipleChatCooldown = 0
  /** 弟子任务上次检查时间（用于疲劳恢复计算） */
  private lastTaskCheck = 0
  private nearBuilding: BuildingId | '__exit' | null = null
  private promptText: Phaser.GameObjects.Text | null = null
  private timeText: Phaser.GameObjects.Text | null = null
  private resText: Phaser.GameObjects.Text | null = null
  private transitioning = false
  private lastTickMs = 0
  private rng!: () => number
  private npcGrowTimer = 0
  private diplomacyTimer = 0
  private defenseInProgress = false
  // 编辑模式
  private placeMode: false | 'building' | 'npc' = false
  private placeTargetId: string | null = null
  private placeGhost: Phaser.GameObjects.Container | null = null

  constructor() { super('Sect') }

  preload() {
    loadLazyGroup(this, 'sect')
  }

  create(data?: { fromScene?: string }) {
    this.state = this.registry.get('state')
    this.state.lastScene = 'Sect'
    this.state.lastSceneData = {}
    if (!this.state.sect) {
      this.scene.start('World')
      return
    }
    this.sect = this.state.sect
    this.worldTime = this.state.worldTime
    registerLazyAnimations(this, 'sect')
    this.transitioning = false
    this.lastTickMs = this.time.now
    this.rng = makeRng(Date.now() % 2147483647)
    this.npcGrowTimer = 0
    this.diplomacyTimer = 0
    this.npcSprites = []
    this.npcShadows.clear()
    this.discipleSprites = []
    this.nearDiscipleUid = null

    playBgm(BGM_SECT)
    setFloorText(`宗门 · ${this.sect.name}`)

    document.getElementById('hud')!.style.display = 'block'
    resetControls()
    document.getElementById('btnAct')!.style.display = 'flex'
    document.getElementById('btnAct')!.textContent = '宗门'
    document.getElementById('btnAtk')!.style.display = 'none'
    document.getElementById('btnPot')!.style.display = 'none'
    document.getElementById('btnSkill')!.style.display = 'none'
    document.getElementById('btnRetreat')!.style.display = 'flex'
    document.getElementById('btnRetreat')!.textContent = '外交'
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
    })

    this.physics.world.setBounds(0, 0, SECT_W, SECT_H)
    this.cameras.main.setBounds(0, 0, SECT_W, SECT_H)
    this.cameras.main.setBackgroundColor('#1a1a2e')

    this.renderGround()
    this.renderBuildings()

    // 玩家
    const px = SECT_W / 2
    const py = SECT_H - TILE * 2.5  // 底部起区
    this.player = new Player(this, px, py, this.state.classId)
    this.player.sprite.setCollideWorldBounds(true)
    this.player.sprite.setScale(0.5)
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1)

    // 交互提示
    this.promptText = this.add.text(180, 580, '', { fontSize: '12px', color: '#f0d98c', stroke: '#000', strokeThickness: 3, align: 'center' })
      .setOrigin(0.5).setDepth(100).setScrollFactor(0).setVisible(false)

    // 时间显示
    this.timeText = this.add.text(180, 18, '', { fontSize: '10px', color: '#a3e4d7', stroke: '#000', strokeThickness: 2, align: 'center' })
      .setOrigin(0.5).setDepth(100).setScrollFactor(0)
    this.updateTimeDisplay()

    // 资源显示
    this.resText = this.add.text(180, 36, '', { fontSize: '9px', color: '#fbbf24', stroke: '#000', strokeThickness: 2, align: 'center' })
      .setOrigin(0.5).setDepth(100).setScrollFactor(0)
    this.updateResourceDisplay()

    // 出口传送阵
    this.createExitPortal()

    // NPC
    initNpcStates(this.state)
    this.renderNpcs()

    // 弟子
    this.renderDisciples()

    const questHud = this.add.text(4, 4, getQuestHudText(this.state), {
      fontSize: '8px', color: '#fbbf24', backgroundColor: '#00000088',
      padding: { x: 4, y: 2 },
    }).setOrigin(0, 0).setDepth(10)

    this.time.delayedCall(800, () => {
      tryCompleteQuest(this.state).then(() => {
        if (!questHud.scene) return   // 场景已切走：questHud 已被销毁，跳过刷新
        questHud.setText(getQuestHudText(this.state))
      })
    })

    updateHUD()
    toast('宗门已建立，可建造与升级建筑', '#a3e4d7')
  }

  private renderGround() {
    // 宗门场景背景（优先使用美术图，缺失时回退到网格地面）
    if (this.textures.exists('sect_bg')) {
      const bg = this.add.image(SECT_W / 2, SECT_H / 2, 'sect_bg')
        .setOrigin(0.5).setDepth(0)
      // 缩放以适配场景尺寸
      const scale = Math.max(SECT_W / bg.width, SECT_H / bg.height)
      bg.setScale(scale)
    } else {
      // 地面网格（兜底）
      const rt = this.add.renderTexture(0, 0, SECT_W, SECT_H).setOrigin(0).setDepth(0)
      const grass = this.textures.exists('grass') ? 'grass' : null

      for (let y = 0; y < SECT_H; y += TILE) {
        for (let x = 0; x < SECT_W; x += TILE) {
          if (grass) {
            rt.draw(grass, x + TILE / 2, y + TILE / 2)
          } else {
            const isAlt = (Math.floor(x / TILE) + Math.floor(y / TILE)) % 2 === 0
            const r = this.add.rectangle(x + TILE / 2, y + TILE / 2, TILE, TILE, isAlt ? 0x1e2e1e : 0x1a281a)
            r.setOrigin(0.5).setDepth(0)
          }
        }
      }
    }

    // 边界
    const border = this.add.graphics().setDepth(1)
    border.lineStyle(3, 0xfbbf24, 0.5)
    border.strokeRect(0, 0, SECT_W, SECT_H)
  }

  private getBuildingPos(id: BuildingId): { x: number; y: number } {
    const custom = this.state.customBuildingPos?.[id]
    const def = BUILDINGS[id]
    return custom ?? { x: def.gridX, y: def.gridY }
  }

  private getNpcPos(id: string, defX: number, defY: number): { x: number; y: number } {
    const custom = this.state.customNpcPos?.[id]
    return custom ?? { x: defX, y: defY }
  }

  private renderBuildings() {
    for (const id of BUILDING_IDS) {
      const def = BUILDINGS[id]
      const level = this.sect.buildings[id] ?? 0
      if (level === 0) continue  // 未建造建筑不渲染
      const built = true
      const pos = this.getBuildingPos(id)
      const cx = pos.x * TILE + TILE / 2
      const cy = pos.y * TILE + TILE / 2
      const atlasKey = `building_${id}`
      const frameName = `building_${id}`

      let sprite: Phaser.GameObjects.Sprite | null = null
      let placeholder: Phaser.GameObjects.Rectangle | null = null

      if (built && this.textures.exists(atlasKey)) {
        // 已建造：使用美术图
        sprite = this.add.sprite(cx, cy, atlasKey, frameName)
          .setOrigin(0.5).setDepth(2)
        // 缩放到合适大小（约 1.5 tile 宽）
        const targetW = TILE * 1.8
        const scale = targetW / sprite.width
        sprite.setScale(scale)
      } else {
        // 未建造或图缺失：彩色方块占位
        placeholder = this.add.rectangle(cx, cy, TILE * 1.6, TILE * 1.6, def.color, built ? 0.6 : 0.15)
          .setOrigin(0.5).setDepth(2)
        if (!built) placeholder.setStrokeStyle(1, def.color, 0.3)
      }

      // 建筑名称
      const label = this.add.text(cx, cy - TILE * 0.9, def.name, {
        fontSize: '9px', color: built ? '#fff' : '#888', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(3)

      // 等级
      const lvText = this.add.text(cx, cy + TILE * 0.9, built ? `Lv.${level}` : '未建', {
        fontSize: '8px', color: built ? '#fbbf24' : '#666', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(3)

      this.buildingObjs.set(id, { id, name: def.name, level, gx: pos.x, gy: pos.y, sprite, label, lvText, placeholder })
    }
  }

  private renderNpcs() {
    const npcs = getLocationNpcs(this.state, 'sect')

    for (const { def } of npcs) {
      const ns = this.state.npcStates?.[def.id]
      const pos = this.getNpcPos(def.id, def.x, def.y)
      const cx = pos.x * TILE + TILE / 2
      const cy = pos.y * TILE + TILE / 2

      let sprite: Phaser.Physics.Arcade.Sprite

      // 程序化生成的像素贴图（48×48，×0.67≈32px 匹配玩家 64px×0.5=32px）
      if (ns?.appearanceSeed !== undefined && ns.procGender && ns.procDaoPath) {
        const tex = getOrCreateNpcTexture(this, {
          id: def.id,
          appearanceSeed: ns.appearanceSeed,
          gender: ns.procGender,
          daoPath: ns.procDaoPath,
          realm: ns.realm,
        })
        if (tex) {
          sprite = this.physics.add.sprite(cx, cy, tex.key)
          sprite.setScale(0.67).setImmovable(true).setDepth(3)
        } else {
          const tex2 = this.textures.exists(def.texture) ? def.texture : 'npc_junior'
          sprite = this.physics.add.sprite(cx, cy, tex2)
          sprite.setScale(0.5).setImmovable(true).setDepth(3)
        }
      } else {
        // 兜底：静态图
        const tex = this.textures.exists(def.texture) ? def.texture : 'npc_junior'
        sprite = this.physics.add.sprite(cx, cy, tex)
        sprite.setScale(0.5).setImmovable(true).setDepth(3)
      }

      this.physics.add.collider(this.player.sprite, sprite)

      const nameText = this.add.text(cx, cy - 30, def.name, {
        fontSize: '9px', color: '#a3e4d7', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(4)

      // HD-2D：NPC 接地阴影
      const shadow = this.add.graphics().setDepth(2.5)
      shadow.fillStyle(0x000000, 0.3)
      shadow.fillEllipse(0, 0, 24, 7)
      shadow.setPosition(cx + 1, cy + 10)
      this.npcShadows.set(def.id, shadow)

      this.npcSprites.push({ id: def.id, sprite, nameText, baseX: cx, baseY: cy })
    }
  }

  /** 渲染宗门内弟子（程序化贴图 + 游荡/修炼） */
  private renderDisciples(): void {
    for (const d of this.state.disciples) {
      // 派遣中的弟子不显示在宗门内
      if (d.status === 'dispatched') continue

      // 确定初始位置：修炼弟子在演武场/悟道殿附近，空闲弟子随机分布
      let cx: number, cy: number
      let activity = '游荡'

      if (d.status === 'cultivating') {
        // 修炼中的弟子：在演武场（120,200）或悟道殿（200,120）附近
        if (d.daoPath === '体修' || Math.random() < 0.5) {
          cx = 120 + Math.random() * 80
          cy = 200 + Math.random() * 40
          activity = '修炼'
        } else {
          cx = 200 + Math.random() * 60
          cy = 120 + Math.random() * 40
          activity = '打坐悟道'
        }
      } else if (d.status === 'retreating') {
        // 闭关弟子在主殿附近
        cx = 160 + Math.random() * 80
        cy = 60 + Math.random() * 30
        activity = '闭关'
      } else {
        // 空闲弟子：随机分布在宗门下半区域
        cx = 40 + Math.random() * (SECT_W - 80)
        cy = 280 + Math.random() * (SECT_H - 350)
        activity = '闲逛'
      }

      // 保存到弟子数据中（用于状态同步）
      d.sectX = cx
      d.sectY = cy
      d.currentActivity = activity

      // 程序化贴图
      const tex = getOrCreateNpcTexture(this, {
        id: d.uid,
        appearanceSeed: d.appearanceSeed,
        gender: d.gender,
        daoPath: d.daoPath,
        realm: d.realm,
      })

      let sprite: Phaser.Physics.Arcade.Sprite
      if (tex) {
        sprite = this.physics.add.sprite(cx, cy, tex.key)
        sprite.setScale(0.6).setImmovable(true).setDepth(3)
      } else {
        sprite = this.physics.add.sprite(cx, cy, 'npc_junior')
        sprite.setScale(0.5).setImmovable(true).setDepth(3)
      }

      this.physics.add.collider(this.player.sprite, sprite)

      // 名字 + 境界
      // SPIRIT_ROOTS / REALM_NAMES already imported at file top
      const rankLabel = d.rank >= 3 ? '【长老】' : d.rank >= 2 ? '【执事】' : d.rank >= 1 ? '【内门】' : ''
      const nameStr = `${rankLabel}${d.name}`
      const nameText = this.add.text(cx, cy - 28, nameStr, {
        fontSize: '8px', color: '#a3e4d7', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(4)

      // 状态小标签（修炼中/闭关中）
      if (d.status === 'cultivating' || d.status === 'retreating') {
        const statusText = this.add.text(cx, cy - 38, d.status === 'retreating' ? '✦闭关✦' : '✦修炼中✦', {
          fontSize: '7px', color: '#fbbf24', stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(4)
      }

      // 阴影
      const shadow = this.add.graphics().setDepth(2.5)
      shadow.fillStyle(0x000000, 0.3)
      shadow.fillEllipse(0, 0, 20, 6)
      shadow.setPosition(cx + 1, cy + 8)

      this.discipleSprites.push({
        uid: d.uid,
        sprite,
        nameText,
        shadow,
        activity,
        wanderTimer: Math.random() * 3000,
        targetX: cx,
        targetY: cy,
      })
    }
  }

  /** HD-2D：NPC 动态效果（呼吸缩放 + 浮动 + 阴影联动） */
  private updateNpcAnimations(): void {
    const t = this.time.now * 0.001
    for (const entry of this.npcSprites) {
      const sprite = entry.sprite
      if (sprite.alpha < 0.05) continue

      const ns = this.state.npcStates?.[entry.id]
      if (!ns || ns.appearanceSeed === undefined) continue

      const phase = (ns.appearanceSeed % 100) * 0.06

      // 呼吸：Y 轴微缩放
      const breathe = Math.sin(t * 1.5 + phase) * 0.02
      const baseScale = ns.procDaoPath ? 0.67 : 0.5
      sprite.setScale(baseScale, baseScale * (1 + breathe))

      // 浮动：Y 轴微位移
      const bob = Math.sin(t * 1.2 + phase) * 1.0
      sprite.y = entry.baseY + bob
      entry.nameText.y = entry.baseY - 30 + bob

      // 阴影联动：身体上浮时阴影缩小变淡
      const shadow = this.npcShadows.get(entry.id)
      if (shadow) {
        const sScale = 1 - breathe * 0.6
        shadow.setPosition(entry.baseX + 1, entry.baseY + 10)
        shadow.setScale(sScale, 1)
        shadow.setAlpha(0.3 * (1 - breathe * 2))
      }

      // 高境界光晕脉冲
      if (ns.realm >= 3) {
        const pulse = Math.sin(t * 2 + phase) * 0.08
        sprite.setAlpha(Math.min(1, 0.85 + pulse))
      }
    }
  }

  private createExitPortal() {
    const cx = 4 * TILE + TILE / 2
    const cy = 19 * TILE + TILE / 2
    const g = this.add.graphics().setDepth(2)
    g.fillStyle(0xbb8fce, 0.3)
    g.fillCircle(cx, cy, 18)
    g.lineStyle(2, 0xbb8fce, 0.8)
    g.strokeCircle(cx, cy, 18)
    this.tweens.add({ targets: g, alpha: 0.5, duration: 800, yoyo: true, repeat: -1 })

    this.add.text(cx, cy + 22, '出宗', {
      fontSize: '9px', color: '#bb8fce', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3)
  }

  update(time: number, delta: number) {
    if (this.transitioning || panelOpen() || dialogOpen()) {
      this.player.sprite.setVelocity(0, 0)
      return
    }

    // 世界时间推进
    this.worldTime = advanceTime(this.worldTime, delta)
    this.state.worldTime = this.worldTime
    this.updateTimeDisplay()

    // 资源产出（每5秒结算一次）
    this.sect.productionTimer += delta
    if (this.sect.productionTimer >= 5000) {
      this.produceResources(this.sect.productionTimer / 1000)
      this.sect.productionTimer -= 5000 // 保留余数，保证长期精确
      this.updateResourceDisplay()
    }

    // 宗门随机事件（每 90~120 秒触发一次）
    this.sect.eventTimer += delta
    if (this.sect.eventTimer >= 90000 + Math.floor(Math.random() * 30000)) {
      this.sect.eventTimer = 0
      this.triggerSectEvent()
    }

    // 输入
    input.poll()
    // 摆放模式：跟随玩家
    this.updateGhost()
    const mx = input.move.x
    const my = input.move.y
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my) || 1
      this.player.sprite.setVelocity((mx / len) * PLAYER_SPEED, (my / len) * PLAYER_SPEED)
    } else {
      this.player.sprite.setVelocity(0, 0)
    }

    // 检测最近建筑
    const px = this.player.sprite.x
    const py = this.player.sprite.y
    let nearest: BuildingId | null = null
    let nearestDist = TILE * 1.2

    // 检测最近 NPC（摆放模式跳过交互检测）
    if (this.placeMode) {
      this.promptText?.setText('【摆放中】\n点击宗门按钮确认').setVisible(true)
    } else {

    // 检测最近 NPC
    let nearNpc: string | null = null
    let npcDist = TILE * 1.0
    for (const npc of this.npcSprites) {
      const d = Phaser.Math.Distance.Between(px, py, npc.sprite.x, npc.sprite.y)
      if (d < npcDist) {
        npcDist = d
        nearNpc = npc.id
      }
    }

    // NPC 交互优先
    if (nearNpc && nearNpc !== this.nearNpcId) {
      this.nearNpcId = nearNpc
      this.nearBuilding = null
      this.nearDiscipleUid = null
      this.promptText?.setText('【对话】\n点击与修士交谈').setVisible(true)
    } else if (!nearNpc && this.nearNpcId) {
      this.nearNpcId = null
    }

    // 检测最近弟子
    if (!this.nearNpcId) {
      let nearDisc: string | null = null
      let discDist = TILE * 0.9
      for (const ds of this.discipleSprites) {
        const dd = Phaser.Math.Distance.Between(px, py, ds.sprite.x, ds.sprite.y)
        if (dd < discDist) {
          discDist = dd
          nearDisc = ds.uid
        }
      }
      if (nearDisc && nearDisc !== this.nearDiscipleUid) {
        this.nearDiscipleUid = nearDisc
        this.nearBuilding = null
        const d = this.state.disciples.find(x => x.uid === nearDisc)
        const statusStr = d?.status === 'cultivating' ? '（修炼中）' : d?.status === 'retreating' ? '（闭关中）' : d?.status === 'dispatched' ? '（外派中）' : ''
        this.promptText?.setText(`【查看弟子】\n点击查看${statusStr}`).setVisible(true)
      } else if (!nearDisc && this.nearDiscipleUid) {
        this.nearDiscipleUid = null
      }
    }

    // 检测出口传送阵和建筑（NPC/弟子在附近时跳过，避免交互冲突）
    if (!this.nearNpcId && !this.nearDiscipleUid) {
      const exitX = 4 * TILE + TILE / 2
      const exitY = 19 * TILE + TILE / 2
      const exitDist = Phaser.Math.Distance.Between(px, py, exitX, exitY)
      if (exitDist < TILE) {
        nearestDist = exitDist
        nearest = null
        if (this.nearBuilding !== '__exit') {
          this.nearBuilding = '__exit'
          this.promptText?.setText('【出宗】\n点击返回大地图').setVisible(true)
        }
      } else {
        for (const [id, obj] of this.buildingObjs) {
          const cx = obj.gx * TILE + TILE / 2
          const cy = obj.gy * TILE + TILE / 2
          const d = Phaser.Math.Distance.Between(px, py, cx, cy)
          if (d < nearestDist) {
            nearestDist = d
            nearest = id
          }
        }
        if (nearest !== this.nearBuilding) {
          this.nearBuilding = nearest
          if (nearest) {
            const def = BUILDINGS[nearest]
            const lv = this.sect.buildings[nearest] ?? 0
            this.promptText?.setText(`【${def.name} ${lv > 0 ? 'Lv.' + lv : '未建'}】\n点击建造/升级`).setVisible(true)
          } else {
            this.promptText?.setVisible(false)
          }
        }
      }
    }
    } // end else (非摆放模式)

    // 编辑模式优先：点击确认摆放
    if (this.placeMode && input.consumeAct()) {
      this.confirmPlacement()
      return
    }

    // 宗门管理按钮
    if (input.consumeAct()) {
      if (this.nearNpcId) {
        talkToNpc(this.state, this.nearNpcId)
      } else if (this.nearDiscipleUid) {
        this.openDiscipleDetail(this.nearDiscipleUid)
      } else if (this.nearBuilding === '__exit') {
        this.exitSect()
      } else if (this.nearBuilding) {
        this.interactBuilding(this.nearBuilding)
      } else {
        this.openSectManagement()
      }
    }

    // 背包按钮
    if (input.consumeBag()) {
      if (panelOpen()) { closePanel() }
      else { this.player.halt(); openInventory() }
    }

    // 外交按钮
    if (input.consumeRetreat()) {
      this.openDiplomacyPanel()
    }

    // 弟子修炼经验（每5秒结算）
    this.updateDiscipleCultivation(delta)

    // 弟子派遣/闭关结算
    this.updateDiscipleTasks()

    // 灵田作物生长
    this.updateFarmGrowth()

    // NPC 修炼成长（每60秒结算一次）
    this.npcGrowTimer = (this.npcGrowTimer ?? 0) + delta
    if (this.npcGrowTimer >= 60000) {
      const minutes = this.npcGrowTimer / 60000
      this.npcGrowTimer = 0
      const breakthroughs = updateNpcGrowth(this.state, minutes)
      for (const msg of breakthroughs) {
        toast(msg, '#fbbf24')
      }
      if (breakthroughs.length > 0) saveGame(this.state)
    }

    // HD-2D：NPC 动态效果（每帧）
    this.updateNpcAnimations()

    // 弟子游荡 + 动画
    this.updateDiscipleAnimations(delta)

    // 弟子间随机互动
    this.discipleChatCooldown -= delta
    if (this.discipleChatCooldown <= 0 && this.discipleSprites.length >= 2) {
      this.discipleChatCooldown = 8000 + Math.random() * 12000
      this.tryDiscipleChat()
    }

    // AI 宗门外交 tick（每5分钟结算一次）
    this.diplomacyTimer = (this.diplomacyTimer ?? 0) + delta
    if (this.diplomacyTimer >= 300000) {
      this.diplomacyTimer = 0
      if (this.state.aiSects && this.state.aiSects.length > 0) {
        const events = tickAllAiSects(this.state, this.state.aiSects)
        processTradeIncome(this.state, this.state.aiSects)
        if (this.state.resourceNodes) processResourceIncome(this.state, this.state.resourceNodes)
        for (const msg of events) {
          if (msg.startsWith('__ATTACK__:')) {
            const aiId = msg.slice('__ATTACK__:'.length)
            const ai = this.state.aiSects.find(a => a.id === aiId)
            if (ai && !this.defenseInProgress) {
              this.defenseInProgress = true
              processSectDefense(this.state, ai).then(() => {
                this.defenseInProgress = false
              })
            }
          } else {
            toast(msg, '#fbbf24')
          }
        }
        if (events.length > 0) saveGame(this.state)
      }
    }

    // 小地图刷新计时
    if (Math.floor(time / 500) !== Math.floor(this.lastTickMs / 500)) {
      this.lastTickMs = time
    }

    // 自动保存
    if (Math.floor(time / 10000) !== Math.floor(this.lastTickMs / 10000)) {
      saveGame(this.state)
    }
  }

  private produceResources(seconds: number) {
    const sv = spiritVeinProduction(this.sect.buildings.spirit_vein ?? 0)
    const sf = spiritFarmProduction(this.sect.buildings.spirit_farm ?? 0)
    const om = oreMineProduction(this.sect.buildings.ore_mine ?? 0)
    const wp = woodPavilionProduction(this.sect.buildings.wood_pavilion ?? 0)
    const rate = seconds / 60

    let stoneBonus = 1, herbBonus = 1, oreBonus = 1, woodBonus = 1
    for (const d of this.state.disciples) {
      if (!d.role) continue
      if (d.role === 'quartermaster') stoneBonus += 0.15
      if (d.role === 'herbalist') herbBonus += 0.15
      if (d.role === 'forge_master') oreBonus += 0.15
      if (d.role === 'wood_master') woodBonus += 0.15
    }
    // 弟子宗门经营 buff
    const sectBuffs = aggregateSectBuffs(this.state.disciples)
    if (sectBuffs.stoneBonus) stoneBonus += sectBuffs.stoneBonus / 100
    if (sectBuffs.herbBonus) herbBonus += sectBuffs.herbBonus / 100
    if (sectBuffs.oreBonus) oreBonus += sectBuffs.oreBonus / 100
    if (sectBuffs.woodBonus) woodBonus += sectBuffs.woodBonus / 100

    this.sect.resources.stone += Math.floor(sv * rate * stoneBonus)
    this.sect.resources.herb += Math.floor(sf * rate * herbBonus)
    this.sect.resources.ore += Math.floor(om * rate * oreBonus)
    this.sect.resources.wood += Math.floor(wp * rate * woodBonus)
  }

  private updateTimeDisplay() {
    if (this.timeText) this.timeText.setText(formatTime(this.worldTime))
  }

  /** 弟子动画 + 游荡 AI */
  private updateDiscipleAnimations(delta: number): void {
    const t = this.time.now * 0.001
    for (const entry of this.discipleSprites) {
      const d = this.state.disciples.find(x => x.uid === entry.uid)
      if (!d) continue
      if (entry.sprite.alpha < 0.05) continue

      // 呼吸缩放（基于appearanceSeed错开相位）
      const phase = (d.appearanceSeed % 100) * 0.06
      const breathe = 1 + Math.sin(t * 1.6 + phase) * 0.02
      entry.sprite.setScale(d.status === 'cultivating' ? 0.5 * breathe : d.status === 'retreating' ? 0.48 * breathe : 0.6 * breathe)

      // 修炼中弟子轻微浮动（打坐效果）
      if (d.status === 'cultivating' || d.status === 'retreating') {
        const floatY = Math.sin(t * 1.2 + phase) * 2
        entry.sprite.y = (d.sectY ?? entry.sprite.y) + floatY
        entry.nameText.setPosition(entry.sprite.x, entry.sprite.y - 28)
        entry.shadow.setPosition(entry.sprite.x + 1, entry.sprite.y + 8)
        // 修炼弟子周围闪烁光点
        if (Math.random() < 0.03) {
          const p = this.add.circle(entry.sprite.x + (Math.random() - 0.5) * 20, entry.sprite.y - 10, 1.5, 0xfbbf24, 0.8)
          this.tweens.add({
            targets: p, y: p.y - 15, alpha: 0, duration: 800, onComplete: () => p.destroy(),
          })
        }
        continue
      }

      // 空闲弟子游荡
      entry.wanderTimer -= delta
      if (entry.wanderTimer <= 0) {
        // 重新选择目标点
        entry.wanderTimer = 2000 + Math.random() * 4000
        const range = 40
        const baseX = d.sectX ?? entry.sprite.x
        const baseY = d.sectY ?? entry.sprite.y
        entry.targetX = Phaser.Math.Clamp(baseX + (Math.random() - 0.5) * range * 2, 30, SECT_W - 30)
        entry.targetY = Phaser.Math.Clamp(baseY + (Math.random() - 0.5) * range * 2, 30, SECT_H - 30)
      }

      // 向目标点移动
      const dx = entry.targetX - entry.sprite.x
      const dy = entry.targetY - entry.sprite.y
      const dist = Math.hypot(dx, dy)
      if (dist > 3) {
        const speed = 20 // 像素/秒
        const vx = (dx / dist) * speed * (delta / 1000)
        const vy = (dy / dist) * speed * (delta / 1000)
        entry.sprite.x += vx
        entry.sprite.y += vy
        entry.nameText.setPosition(entry.sprite.x, entry.sprite.y - 28)
        entry.shadow.setPosition(entry.sprite.x + 1, entry.sprite.y + 8)
        // 走动时轻微上下浮动
        const bob = Math.abs(Math.sin(t * 6 + phase)) * 1.5
        entry.sprite.y -= bob
      }
    }
  }

  /** 弟子间随机互动对话 */
  private tryDiscipleChat(): void {
    // 找一对距离较近的空闲弟子
    const idle = this.discipleSprites.filter(ds => {
      const d = this.state.disciples.find(x => x.uid === ds.uid)
      return d && (d.status === 'idle') && ds.sprite.alpha > 0.05
    })
    if (idle.length < 2) return

    // 随机选一对
    const a = idle[Math.floor(Math.random() * idle.length)]
    let b = idle[Math.floor(Math.random() * idle.length)]
    let attempts = 0
    while (b === a && attempts < 5) {
      b = idle[Math.floor(Math.random() * idle.length)]
      attempts++
    }
    if (b === a) return

    const dist = Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, b.sprite.x, b.sprite.y)
    if (dist > 80) return // 太远不互动

    const dA = this.state.disciples.find(x => x.uid === a.uid)
    const dB = this.state.disciples.find(x => x.uid === b.uid)
    if (!dA || !dB) return

    // 生成对话内容
    const chats = this.generateDiscipleChat(dA, dB)
    if (chats.length === 0) return

    // 显示对话气泡
    this.showDiscipleBubble(a.sprite.x, a.sprite.y - 35, chats[0], dA.name)
    if (chats.length > 1) {
      this.time.delayedCall(2500, () => {
        this.showDiscipleBubble(b.sprite.x, b.sprite.y - 35, chats[1], dB.name)
      })
    }
  }

  /** 生成弟子间对话内容 */
  private generateDiscipleChat(dA: Disciple, dB: Disciple): string[] {
    const topics: string[] = []

    // 修炼交流
    if (dA.status === 'cultivating' || dB.status === 'cultivating') {
      topics.push(
        `师兄，我这功法修炼到瓶颈了，可有指点？`,
        `${dA.name}，修炼之道在于心境，不可操之过急。`,
      )
    }

    // 性格相关
    if (dA.personality.includes('好战') && dB.personality.includes('好战')) {
      topics.push(`${dB.name}，来比划比划？`, `正合我意！`)
    }
    if (dA.personality.includes('贪婪')) {
      topics.push(`听说灵脉阵下面藏着宝贝...`, `${dB.name}你别乱来，小心掌门责罚。`)
    }
    if (dA.personality.includes('孤僻') && dB.personality.includes('热情')) {
      topics.push(`${dA.name}，怎么又是你...`, `哈哈，咱们有缘嘛！一起去灵药园走走？`)
    }

    // 境界差距
    if (dA.realm > dB.realm) {
      topics.push(`${dB.name}师弟，可要勤加修炼，莫要荒废了。`, `师兄教训的是。`)
    } else if (dA.realm < dB.realm) {
      topics.push(`${dA.name}，你根骨不凡，假以时日必成大器。`, `多谢师兄吉言！`)
    }

    // 出身相关
    if (dA.background === '寒门子弟' && dB.background === '世家嫡子') {
      topics.push(`你们世家的功法就是不一样。`, `哪里哪里，修行之路不分出身。`)
    }
    if (dA.background === '魔修遗脉') {
      topics.push(`...你不会告诉别人我的身世吧？`, `放心，宗门之内不分彼此。`)
    }

    // 通用日常
    topics.push(`今天灵气似乎格外充沛。`, `是啊，正适合修炼。`)
    topics.push(`听说大地图上又出了新的秘境。`, `等宗门实力够了，一起去探索。`)
    topics.push(`掌门最近在闭关吗？好久没见了。`, `应该在修炼突破吧。`)
    topics.push(`炼丹房的丹药又被偷吃了...`, `咳，不是我。`)
    topics.push(`你看天边那道剑光，是哪位前辈？`, `或许是哪位大能路过。`)

    // 随机选一组
    const idx = Math.floor(Math.random() * topics.length)
    const lines: string[] = []
    if (idx % 2 === 0 && idx + 1 < topics.length) {
      lines.push(topics[idx])
      lines.push(topics[idx + 1])
    } else if (idx > 0) {
      lines.push(topics[idx - 1])
      lines.push(topics[idx])
    } else {
      lines.push(topics[0])
      if (topics.length > 1) lines.push(topics[1])
    }
    return lines
  }

  /** 显示弟子对话气泡 */
  private showDiscipleBubble(x: number, y: number, text: string, speakerName: string): void {
    const bubble = this.add.container(x, y).setDepth(6)

    const txt = this.add.text(0, 0, text, {
      fontSize: '8px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 100 },
    }).setOrigin(0.5)

    const w = txt.width + 10
    const h = txt.height + 6

    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.8)
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 4)
    bg.lineStyle(1, 0xffffff, 0.3)
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 4)

    bubble.add(bg)
    bubble.add(txt)

    this.tweens.add({
      targets: bubble,
      y: y - 10,
      alpha: { from: 0, to: 1 },
      duration: 300,
      ease: 'Back.out',
    })

    this.time.delayedCall(4000, () => {
      this.tweens.add({
        targets: bubble,
        alpha: 0,
        duration: 500,
        onComplete: () => bubble.destroy(),
      })
    })
  }

  private updateResourceDisplay() {
    if (!this.resText) return
    const r = this.sect.resources
    this.resText.setText(
      `灵石${r.stone}  草${r.herb}  矿${r.ore}  木${r.wood}  悟${r.insight}  声${r.prestige}`
    )
  }

  // ===== 宗门管理面板 =====
  private async openSectManagement() {
    input.clearQueues()
    if (this.placeMode) { this.cancelPlacement(); return }

    const sect = this.sect
    const r = sect.resources
    const buildings = BUILDING_IDS.map(id => {
      const def = BUILDINGS[id]
      const lv = sect.buildings[id] ?? 0
      return { id, name: def.name, level: lv, desc: def.desc }
    })

    // 计算弟子职务+天赋加成
    let stoneBonus = 0, herbBonus = 0, oreBonus = 0, woodBonus = 0
    for (const d of this.state.disciples) {
      if (!d.role) continue
      if (d.role === 'quartermaster') stoneBonus += 0.15
      if (d.role === 'herbalist') herbBonus += 0.15
      if (d.role === 'forge_master') oreBonus += 0.15
      if (d.role === 'wood_master') woodBonus += 0.15
    }
    const sectBuffs = aggregateSectBuffs(this.state.disciples)
    if (sectBuffs.stoneBonus) stoneBonus += sectBuffs.stoneBonus / 100
    if (sectBuffs.herbBonus) herbBonus += sectBuffs.herbBonus / 100
    if (sectBuffs.oreBonus) oreBonus += sectBuffs.oreBonus / 100
    if (sectBuffs.woodBonus) woodBonus += sectBuffs.woodBonus / 100

    // 产出建筑详细信息
    const svLv = sect.buildings.spirit_vein ?? 0
    const sfLv = sect.buildings.spirit_farm ?? 0
    const omLv = sect.buildings.ore_mine ?? 0
    const wpLv = sect.buildings.wood_pavilion ?? 0
    const productionBuildings: BuildingProdInfo[] = [
      { id: 'spirit_vein', name: '灵脉阵', level: svLv, desc: '产出灵石', produces: svLv > 0 ? '灵石' : null, rate: spiritVeinProduction(svLv), bonus: stoneBonus },
      { id: 'spirit_farm', name: '灵田', level: sfLv, desc: '产出灵草', produces: sfLv > 0 ? '灵草' : null, rate: spiritFarmProduction(sfLv), bonus: herbBonus },
      { id: 'ore_mine', name: '矽脉', level: omLv, desc: '产出矿石', produces: omLv > 0 ? '矿石' : null, rate: oreMineProduction(omLv), bonus: oreBonus },
      { id: 'wood_pavilion', name: '灵木林', level: wpLv, desc: '产出木材', produces: wpLv > 0 ? '木材' : null, rate: woodPavilionProduction(wpLv), bonus: woodBonus },
    ]

    const dashData: SectDashboardData = {
      sectName: sect.name,
      sectLevel: sect.level,
      resources: { stone: r.stone, herb: r.herb, ore: r.ore, wood: r.wood, insight: r.insight, prestige: r.prestige },
      buildings,
      productionBuildings,
      discipleBonuses: { stone: stoneBonus, herb: herbBonus, ore: oreBonus, wood: woodBonus },
      discipleCount: this.state.disciples.length,
      discipleCapacity: discipleCapacity(sect.buildings.disciple_room ?? 0),
    }

    setSectCallbacks({
      onPlaceBuilding: () => { this.startBuildingPlacement() },
      onPlaceNpc: () => { this.startNpcPlacement() },
      onManageDisciples: () => { this.openDisciplePanel() },
      onDiplomacy: () => { this.openDiplomacyPanel() },
      onRevengeList: () => { this.openRevengeList() },
    })

    openSectDashboard(dashData)
  }

  private async showSectInfo() {
    input.clearQueues()
    const sect = this.sect
    const r = sect.resources
    const lines = [
      `宗门：${sect.name}（${sect.level}级）`,
      `灵石：${r.stone}  灵草：${r.herb}  矿石：${r.ore}`,
      `木材：${r.wood}  悟道：${r.insight}  声望：${r.prestige}`,
      `弟子：${this.state.disciples.length}/${discipleCapacity(sect.buildings.disciple_room ?? 0)}`,
      '',
      '—— 建筑等级 ——',
    ]
    for (const id of BUILDING_IDS) {
      const def = BUILDINGS[id]
      const lv = sect.buildings[id] ?? 0
      lines.push(`${def.name}：${lv > 0 ? 'Lv.' + lv : '未建'}`)
    }
    await showDialog('宗门信息', lines, [{ label: '关闭', value: 'close' }])
    input.clearQueues()
  }

  // ===== 建筑摆放 =====
  private async startBuildingPlacement() {
    input.clearQueues()
    const options: { label: string; value: string }[] = []
    for (const id of BUILDING_IDS) {
      const def = BUILDINGS[id]
      const lv = this.sect.buildings[id] ?? 0
      if (lv > 0) {
        options.push({ label: `${def.name} (重新摆放)`, value: id })
      } else {
        const cost = def.baseCost
        const canAfford = this.sect.resources.stone >= cost.stone && this.sect.resources.wood >= cost.wood && this.sect.resources.ore >= cost.ore
        const costStr = `${cost.stone}石/${cost.wood}木/${cost.ore}矿`
        options.push({ label: `${def.name} [建造 ${costStr}]${canAfford ? '' : ' (材料不足)'}`, value: id })
      }
    }
    options.push({ label: '重置全部位置', value: 'reset' })
    options.push({ label: '返回', value: 'back' })
    const result = await showDialog('建筑摆放', ['选择要摆放/建造的建筑：'], options)
    if (result === 'back' || result === null) { input.clearQueues(); return }
    if (result === 'reset') {
      this.state.customBuildingPos = undefined
      saveGame(this.state)
      this.scene.restart()
      return
    }

    const id = result as BuildingId
    const def = BUILDINGS[id]
    const currentLv = this.sect.buildings[id] ?? 0

    if (currentLv === 0) {
      // 首次建造：检查材料
      const cost = def.baseCost
      if (this.sect.resources.stone < cost.stone || this.sect.resources.wood < cost.wood || this.sect.resources.ore < cost.ore) {
        await showDialog('材料不足', [
          `${def.name} 需要消耗：`,
          `灵石 ${cost.stone}（现有 ${this.sect.resources.stone}）`,
          `木材 ${cost.wood}（现有 ${this.sect.resources.wood}）`,
          `矿石 ${cost.ore}（现有 ${this.sect.resources.ore}）`,
        ], [{ label: '返回', value: 'close' }])
        input.clearQueues()
        return
      }
      // 确认建造
      const confirm = await showDialog('确认建造', [
        `即将建造 ${def.name}`,
        `消耗：灵石${cost.stone} 木材${cost.wood} 矿石${cost.ore}`,
        `${def.desc}`,
      ], [{ label: '确认建造', value: 'ok' }, { label: '取消', value: 'cancel' }])
      if (confirm !== 'ok') { input.clearQueues(); return }
      // 扣除材料
      this.sect.resources.stone -= cost.stone
      this.sect.resources.wood -= cost.wood
      this.sect.resources.ore -= cost.ore
      this.sect.buildings[id] = 1
      saveGame(this.state)
      toast(`【${def.name}】建造成功！请选择摆放位置`, '#a3e4d7')
    }

    this.placeTargetId = id
    this.placeMode = 'building'
    this.startPlacementGhost()
    toast('移动到目标位置，点击宗门按钮确认', '#a3e4d7')
  }

  // ===== NPC 摆放 =====
  private async startNpcPlacement() {
    input.clearQueues()
    const npcs = getLocationNpcs(this.state, 'sect')
    const options: { label: string; value: string }[] = []
    for (const { def } of npcs) {
      options.push({ label: def.name, value: def.id })
    }
    options.push({ label: '重置全部', value: 'reset' })
    options.push({ label: '返回', value: 'back' })
    const result = await showDialog('人员安排', ['选择要安排的修士：'], options)
    if (result === 'back' || result === null) { input.clearQueues(); return }
    if (result === 'reset') {
      this.state.customNpcPos = undefined
      saveGame(this.state)
      this.scene.restart()
      return
    }
    this.placeTargetId = result
    this.placeMode = 'npc'
    this.startPlacementGhost()
    toast('移动到目标位置，点击宗门按钮确认', '#a3e4d7')
  }

  // ===== 摆放幽灵预览 =====
  private startPlacementGhost() {
    this.cleanupGhost()
    const ghost = this.add.container(0, 0).setDepth(50)
    const rect = this.add.rectangle(0, 0, TILE * 1.6, TILE * 1.6, 0xfbbf24, 0.25)
    rect.setStrokeStyle(2, 0xfbbf24, 0.8)
    ghost.add(rect)
    const label = this.add.text(0, -TILE * 1.2, '摆放中', {
      fontSize: '10px', color: '#fbbf24', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5)
    ghost.add(label)
    this.placeGhost = ghost
    // 更新提示
    this.promptText?.setText('【摆放中】\n点击宗门按钮确认').setVisible(true)
    // 改变按钮文字
    document.getElementById('btnAct')!.textContent = '确认'
  }

  private cleanupGhost() {
    if (this.placeGhost) { this.placeGhost.destroy(); this.placeGhost = null }
  }

  private updateGhost() {
    if (!this.placeGhost || !this.placeMode) return
    const px = this.player.sprite.x
    const py = this.player.sprite.y
    this.placeGhost.setPosition(px, py)
  }

  private confirmPlacement() {
    if (!this.placeMode || !this.placeTargetId) return
    const px = this.player.sprite.x
    const py = this.player.sprite.y
    const gx = Math.round((px - TILE / 2) / TILE)
    const gy = Math.round((py - TILE / 2) / TILE)
    // 边界检查
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) {
      toast('摆放位置超出边界', '#f87171')
      return
    }
    if (this.placeMode === 'building') {
      if (!this.state.customBuildingPos) this.state.customBuildingPos = {}
      this.state.customBuildingPos[this.placeTargetId] = { x: gx, y: gy }
    } else if (this.placeMode === 'npc') {
      if (!this.state.customNpcPos) this.state.customNpcPos = {}
      this.state.customNpcPos[this.placeTargetId] = { x: gx, y: gy }
    }
    saveGame(this.state)
    this.cancelPlacement()
    sfx('sfx_sect_place', 0.6)
    toast('摆放成功！场景重建中', '#a3e4d7')
    this.scene.restart()
  }

  private cancelPlacement() {
    this.placeMode = false
    this.placeTargetId = null
    this.cleanupGhost()
    this.promptText?.setVisible(false)
    document.getElementById('btnAct')!.textContent = '宗门'
    input.clearQueues()
  }

  private async interactBuilding(id: BuildingId) {
    input.clearQueues()
    const def = BUILDINGS[id]
    const currentLv = this.sect.buildings[id] ?? 0

    // 生产建筑已建造时提供使用/升级双选项
    const productionBuildings: BuildingId[] = ['alchemy_room', 'forge_pavilion', 'library', 'spirit_farm', 'training_ground', 'beast_park', 'guard_array']
    if (currentLv > 0 && productionBuildings.includes(id)) {
      const result = await showDialog(def.name, [
        `${def.name} Lv.${currentLv}`,
        def.desc,
        '选择操作：',
      ], [
        { label: '使用', value: 'use' },
        { label: currentLv < def.maxLevel ? '升级' : '满级', value: 'upgrade' },
        { label: '返回', value: 'cancel' },
      ])

      if (result === 'use') {
        switch (id) {
          case 'alchemy_room': await this.openAlchemy(); break
          case 'forge_pavilion': await this.openForge(); break
          case 'library': await this.openLibrary(); break
          case 'spirit_farm': await this.openSpiritFarm(); break
          case 'training_ground': await this.openTrainingGround(); break
          case 'beast_park': await this.openBeastPark(); break
          case 'guard_array': await this.openGuardArray(); break
        }
      } else if (result === 'upgrade' && currentLv < def.maxLevel) {
        await this.upgradeBuilding(id)
      } else {
        input.clearQueues()
      }
      return
    }

    // 未建造或非生产建筑 → 直接建造/升级流程
    await this.upgradeBuilding(id)
  }

  private async upgradeBuilding(id: BuildingId) {
    input.clearQueues()
    const def = BUILDINGS[id]
    const currentLv = this.sect.buildings[id] ?? 0

    if (currentLv >= def.maxLevel) {
      toast(`${def.name} 已达最高等级`, '#f0c987')
      return
    }

    if (def.requireHall && (this.sect.buildings.main_hall ?? 0) < def.requireHall) {
      toast(`需要主殿达到 ${def.requireHall} 级才能建造`, '#f87171')
      return
    }

    // 成本与可执行性统一走 sect-building-v2 —— 与 WorldScene 同一实现，杜绝两套口径
    const check = canUpgradeBuilding(this.state, id)
    const cost = check.cost ?? getBuildingUpgradeCost(this.sect, id)
    if (!cost) {
      toast(`${def.name} 已达最高等级`, '#f0c987')
      return
    }
    const goldNeed = cost.gold ?? 0
    const r = this.sect.resources
    const canAfford = r.stone >= cost.stone && r.wood >= cost.wood && r.ore >= cost.ore && this.state.gold >= goldNeed

    const action = currentLv === 0 ? '建造' : `升级至 Lv.${currentLv + 1}`
    const costStr = `灵石 ${cost.stone}  木材 ${cost.wood}  矿石 ${cost.ore}  金银 ${goldNeed}`

    const result = await showDialog(def.name, [
      def.desc,
      `${action}？`,
      `消耗：${costStr}`,
      canAfford ? '资源充足' : '资源不足！',
    ], [{ label: canAfford ? action : '资源不足', value: 'upgrade' }, { label: '取消', value: 'cancel' }])

    if (result !== 'upgrade' || !canAfford) {
      input.clearQueues()
      return
    }

    const res = upgradeBuildingV2(this.state, id)
    if (!res.ok) {
      input.clearQueues()
      toast(res.message, '#f87171')
      return
    }

    if (currentLv === 0) sfx('sfx_sect_build', 0.6)
    else sfx('sfx_sect_upgrade', 0.6)
    this.updateBuildingVisual(id)
    this.updateResourceDisplay()
    saveGame(this.state)
    toast(`${def.name} ${action}成功！`, '#34d399')
  }

  private updateBuildingVisual(id: BuildingId) {
    const obj = this.buildingObjs.get(id)
    if (!obj) return
    const def = BUILDINGS[id]
    const newLv = this.sect.buildings[id] ?? 0
    obj.level = newLv
    const atlasKey = `building_${id}`
    const frameName = `building_${id}`
    const cx = def.gridX * TILE + TILE / 2
    const cy = def.gridY * TILE + TILE / 2

    if (newLv > 0 && this.textures.exists(atlasKey)) {
      // 升级为已建造：创建/显示精灵图
      if (obj.placeholder) { obj.placeholder.destroy(); obj.placeholder = null }
      if (!obj.sprite) {
        obj.sprite = this.add.sprite(cx, cy, atlasKey, frameName)
          .setOrigin(0.5).setDepth(2)
        const targetW = TILE * 1.8
        const scale = targetW / obj.sprite.width
        obj.sprite.setScale(scale)
      }
      obj.sprite.setVisible(true)
    } else if (newLv > 0) {
      // 已建造但无美术图：用占位方块
      if (obj.sprite) { obj.sprite.destroy(); obj.sprite = null }
      if (!obj.placeholder) {
        obj.placeholder = this.add.rectangle(cx, cy, TILE * 1.6, TILE * 1.6, def.color, 0.6)
          .setOrigin(0.5).setDepth(2)
      }
      obj.placeholder.setFillStyle(def.color, 0.6)
    } else {
      // 未建造：半透明占位
      if (obj.sprite) { obj.sprite.destroy(); obj.sprite = null }
      if (!obj.placeholder) {
        obj.placeholder = this.add.rectangle(cx, cy, TILE * 1.6, TILE * 1.6, def.color, 0.15)
          .setOrigin(0.5).setDepth(2)
        obj.placeholder.setStrokeStyle(1, def.color, 0.3)
      }
      obj.placeholder.setFillStyle(def.color, 0.15)
    }

    obj.label.setColor(newLv > 0 ? '#fff' : '#888')
    obj.lvText.setText(newLv > 0 ? `Lv.${newLv}` : '未建')
    obj.lvText.setColor(newLv > 0 ? '#fbbf24' : '#666')
  }

  // ===== 弟子系统 =====

  private async openDisciplePanel() {
    input.clearQueues()
    this.refreshDiscipleDashboard()
  }

  /** 构建弟子看板数据并渲染 */
  private refreshDiscipleDashboard() {
    const sect = this.sect
    const cap = discipleCapacity(sect.buildings.disciple_room ?? 0)
    const now = Date.now()

    const disciples: DiscipleCardData[] = this.state.disciples.map(d => {
      const rootInfo = SPIRIT_ROOTS[d.root]
      const tierLabel = d.rootTier === 'epic' ? '变异' : d.rootTier === 'rare' ? '稀有' : '普通'
      const rankDef = DISCIPLE_RANKS[d.rank]
      const roleDef = d.role ? DISCIPLE_ROLES.find(r => r.id === d.role) : null
      const eff = effectiveStats(d)
      const power = disciplePower(d)
      const statusLabel = d.status === 'idle' ? '空闲' : d.status === 'cultivating' ? '修炼中' : d.status === 'retreating' ? '闭关中' : '派遣中'

      let retreatRemain: number | undefined
      let questName: string | undefined
      let questRemain: number | undefined
      if (d.status === 'retreating' && d.retreatEndTime > 0) {
        retreatRemain = Math.max(0, Math.ceil((d.retreatEndTime - now) / 1000))
      }
      if (d.status === 'dispatched' && d.questId) {
        const quest = SECT_QUESTS.find(q => q.id === d.questId)
        if (quest) {
          const elapsed = (now - d.questStartTime) / 1000
          questName = quest.name
          questRemain = Math.max(0, Math.ceil(quest.duration - elapsed))
        }
      }

      return {
        uid: d.uid,
        name: d.name,
        rootName: rootInfo.name,
        rootColor: rootInfo.color,
        rootTierLabel: tierLabel,
        realmName: REALM_NAMES[d.realm],
        rankName: rankDef?.name ?? '外门',
        roleName: roleDef?.name ?? null,
        status: d.status,
        statusLabel,
        power,
        atk: eff.atk,
        def: eff.def,
        maxHp: eff.maxHp,
        crit: eff.crit,
        exp: d.exp,
        expToNext: d.expToNext,
        loyalty: d.loyalty,
        affection: d.affection,
        talents: d.talents.map(t => ({ name: TALENTS[t].name, desc: TALENTS[t].desc, positive: TALENTS[t].positive })),
        retreatRemain,
        questName,
        questRemain,
        canGuide: d.status === 'idle' && now > d.guidanceCooldown,
        canPromote: canPromote(d),
      }
    })

    const cdRemain = Math.max(0, Math.ceil((sect.recruitCooldown - now) / 1000))

    let candidate: RecruitCandidate | null = null
    if (this.sect.recruitCandidate) {
      const c = this.sect.recruitCandidate
      const rootInfo = SPIRIT_ROOTS[c.root]
      candidate = {
        name: c.name,
        rootName: rootInfo.name,
        rootColor: rootInfo.color,
        rootTierLabel: c.rootTier === 'epic' ? '变异' : c.rootTier === 'rare' ? '稀有' : '普通',
        talents: c.talents.map(t => ({ name: TALENTS[t].name, desc: TALENTS[t].desc, positive: TALENTS[t].positive })),
        atk: c.atk,
        def: c.def,
        maxHp: c.maxHp,
        crit: c.crit,
        loyalty: c.loyalty,
        affection: c.affection,
      }
    }

    setDiscipleCallbacks({
      onCultivate: (uid) => {
        const d = this.state.disciples.find(x => x.uid === uid)
        if (d && d.status === 'idle') {
          d.status = 'cultivating'
          toast(`${d.name} 开始修炼`, '#60a5fa')
          saveGame(this.state)
        }
        this.refreshDiscipleDashboard()
      },
      onStopCultivate: (uid) => {
        const d = this.state.disciples.find(x => x.uid === uid)
        if (d && d.status === 'cultivating') {
          d.status = 'idle'
          toast(`${d.name} 停止修炼`, '#a3a3a3')
          saveGame(this.state)
        }
        this.refreshDiscipleDashboard()
      },
      onRetreat: (uid) => {
        const d = this.state.disciples.find(x => x.uid === uid)
        if (d) this.startRetreat(d).then(() => this.refreshDiscipleDashboard())
      },
      onBreakRetreat: (uid) => {
        const d = this.state.disciples.find(x => x.uid === uid)
        if (d && d.status === 'retreating') {
          d.status = 'idle'
          d.retreatEndTime = 0
          toast(`${d.name} 提前出关`, '#f0c987')
          saveGame(this.state)
        }
        this.refreshDiscipleDashboard()
      },
      onGuide: (uid) => {
        const d = this.state.disciples.find(x => x.uid === uid)
        if (d) this.guideDisciple(d).then(() => this.refreshDiscipleDashboard())
      },
      onDispatch: (uid) => {
        const d = this.state.disciples.find(x => x.uid === uid)
        if (d) this.dispatchDisciple(d).then(() => this.refreshDiscipleDashboard())
      },
      onEquip: (uid) => {
        const d = this.state.disciples.find(x => x.uid === uid)
        if (d) this.openDiscipleEquip(d)
      },
      onPromote: (uid) => {
        const d = this.state.disciples.find(x => x.uid === uid)
        if (d) this.openPromotionPanel(d)
      },
      onRecruitAccept: () => {
        if (this.sect.recruitCandidate) {
          // 确认招募当前候补
          const c = this.sect.recruitCandidate
          this.state.disciples.push(c)
          sect.recruitCooldown = Date.now() + 300000
          addDiscipleEvent(sect, c, 'recruit', `${c.name}拜入山门，成为${rankName(c)}弟子`)
          saveGame(this.state)
          sfx('sfx_sect_recruit', 0.6)
          toast(`${c.name} 已加入宗门！`, '#34d399')
          this.sect.recruitCandidate = null
        } else {
          // 生成新候补
          this.sect.recruitCandidate = generateDisciple(this.rng, sect.level)
        }
        this.refreshDiscipleDashboard()
      },
      onRecruitReject: () => {
        if (this.sect.recruitCandidate) {
          sect.recruitCooldown = Date.now() + 60000
          this.sect.recruitCandidate = null
          toast('婉拒了来人', '#a3a3a3')
        }
        this.refreshDiscipleDashboard()
      },
    })

    openDiscipleDashboard({
      count: this.state.disciples.length,
      capacity: cap,
      recruitCooldownRemain: cdRemain,
      disciples,
      candidate,
    })
  }

  private async recruitDisciple() {
    input.clearQueues()
    const cap = discipleCapacity(this.sect.buildings.disciple_room ?? 0)
    if (this.state.disciples.length >= cap) {
      toast('弟子房已满，请先升级弟子房', '#f87171')
      return
    }
    const now = Date.now()
    if (now < this.sect.recruitCooldown) {
      const remain = Math.ceil((this.sect.recruitCooldown - now) / 1000)
      toast(`招募冷却中，还需 ${remain} 秒`, '#f0c987')
      return
    }

    const disciple = generateDisciple(this.rng, this.sect.level)
    const rootName = SPIRIT_ROOTS[disciple.root].name
    const talentNames = disciple.talents.map(t => TALENTS[t].name).join('、')

    const result = await showDialog('山门招募', [
      `${disciple.name}  ${rootName}（${disciple.rootTier === 'epic' ? '变异' : disciple.rootTier === 'rare' ? '稀有' : '普通'}）`,
      `天赋：${talentNames}`,
      `忠诚 ${disciple.loyalty}  好感 ${disciple.affection}`,
      `攻击 ${disciple.atk}  防御 ${disciple.def}  气血 ${disciple.maxHp}  暴击 ${disciple.crit}%`,
      '是否收为弟子？',
    ], [{ label: '收下', value: 'accept' }, { label: '拒绝', value: 'reject' }])

    if (result === 'accept') {
      this.state.disciples.push(disciple)
      this.sect.recruitCooldown = now + 300000 // 5分钟冷却
      saveGame(this.state)
      sfx('sfx_levelup')
      toast(`${disciple.name} 已加入宗门！`, '#34d399')
    } else {
      this.sect.recruitCooldown = now + 60000 // 拒绝后1分钟可再招
      toast('婉拒了来人', '#a3a3a3')
    }
    input.clearQueues()
  }

  private async manageDisciple(d: Disciple) {
    input.clearQueues()
    const rootName = SPIRIT_ROOTS[d.root].name
    const realmName = REALM_NAMES[d.realm]
    const talentDescs = d.talents.map(t => `${TALENTS[t].name}(${TALENTS[t].desc})`).join('；')
    const eff = effectiveStats(d)
    const power = disciplePower(d)

    const lines = [
      `${d.name}  ${rootName}·${realmName}  战力${power}`,
      `经验 ${d.exp} / ${d.expToNext}`,
      `基础：攻${d.atk} 防${d.def} 体${d.maxHp} 暴${d.crit}%`,
      `有效：攻${eff.atk} 防${eff.def} 体${eff.maxHp} 暴${eff.crit}%`,
      `忠诚 ${d.loyalty}  好感 ${d.affection}`,
      `天赋：${talentDescs}`,
      `状态：${d.status === 'idle' ? '空闲' : d.status === 'cultivating' ? '修炼中' : d.status === 'retreating' ? '闭关中' : '派遣中'}`,
    ]
    const options: { label: string; value: string }[] = []

    if (d.status === 'idle') {
      options.push({ label: '修炼', value: 'cultivate' })
      options.push({ label: '闭关', value: 'retreat' })
      if (Date.now() > d.guidanceCooldown) {
        options.push({ label: '指点', value: 'guide' })
      }
      options.push({ label: '派遣任务', value: 'dispatch' })
    } else if (d.status === 'cultivating') {
      options.push({ label: '停止修炼', value: 'stop_cult' })
    } else if (d.status === 'retreating') {
      const remain = Math.ceil((d.retreatEndTime - Date.now()) / 1000)
      lines.push(`闭关剩余 ${remain} 秒`)
      options.push({ label: '提前出关', value: 'break_retreat' })
    } else if (d.status === 'dispatched') {
      const quest = SECT_QUESTS.find(q => q.id === d.questId)
      if (quest) {
        const elapsed = (Date.now() - d.questStartTime) / 1000
        const remain = Math.ceil(quest.duration - elapsed)
        lines.push(`任务：${quest.name}  剩余 ${Math.max(0, remain)} 秒`)
      }
      options.push({ label: '查看', value: 'check_quest' })
    }
    options.push({ label: '装备法器', value: 'equip' })
    options.push({ label: '晋升职位', value: 'promote' })
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('弟子详情', lines, options)

    switch (result) {
      case 'cultivate':
        d.status = 'cultivating'
        toast(`${d.name} 开始修炼`, '#60a5fa')
        saveGame(this.state)
        break
      case 'stop_cult':
        d.status = 'idle'
        toast(`${d.name} 停止修炼`, '#a3a3a3')
        saveGame(this.state)
        break
      case 'retreat':
        await this.startRetreat(d)
        break
      case 'break_retreat':
        d.status = 'idle'
        d.retreatEndTime = 0
        toast(`${d.name} 提前出关`, '#f0c987')
        saveGame(this.state)
        break
      case 'guide':
        await this.guideDisciple(d)
        break
      case 'dispatch':
        await this.dispatchDisciple(d)
        break
      case 'equip':
        await this.openDiscipleEquip(d)
        break
      case 'promote':
        await this.openPromotionPanel(d)
        break
    }
    input.clearQueues()
  }

  private async openDiscipleEquip(d: Disciple) {
    input.clearQueues()
    const slots: { key: keyof Disciple['equipment']; name: string }[] = [
      { key: 'weapon', name: '武器' },
      { key: 'head', name: '头盔' },
      { key: 'armor', name: '护甲' },
      { key: 'boots', name: '靴子' },
      { key: 'charm', name: '饰品' },
    ]

    const lines = [
      `${d.name} · 法器装备`,
      '',
    ]
    for (const s of slots) {
      const item = d.equipment[s.key]
      if (item) {
        lines.push(`${s.name}：${item.name}（${QUALITY_NAMES[item.quality]}）`)
        lines.push(`  攻${item.atk ?? 0} 防${item.def ?? 0} 体${item.maxHp ?? 0} 暴${item.crit ?? 0}%`)
      } else {
        lines.push(`${s.name}：空`)
      }
    }

    const options: { label: string; value: string }[] = []
    for (const s of slots) {
      options.push({ label: `${s.name}${d.equipment[s.key] ? '（卸下）' : '（装备）'}`, value: 'slot_' + s.key })
    }
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('弟子装备', lines, options)
    if (result && result.startsWith('slot_')) {
      const slotKey = result.slice(5) as keyof Disciple['equipment']
      if (d.equipment[slotKey]) {
        const unequipped = d.equipment[slotKey]!
        this.state.inventory.push(unequipped)
        d.equipment[slotKey] = null
        sfx('sfx_click')
        toast(`卸下 ${unequipped.name}`, '#94a3b8')
        saveGame(this.state)
      } else {
        await this.equipFromInventory(d, slotKey)
      }
      await this.openDiscipleEquip(d)
    } else {
      input.clearQueues()
    }
  }

  private async equipFromInventory(d: Disciple, slot: keyof Disciple['equipment']) {
    input.clearQueues()
    const candidates = this.state.inventory.filter(item => item.slot === slot || (slot === 'charm' && item.slot === 'charm'))

    if (candidates.length === 0) {
      toast(`背包中没有${slot === 'weapon' ? '武器' : slot === 'head' ? '头盔' : slot === 'armor' ? '护甲' : slot === 'boots' ? '靴子' : '饰品'}`, '#f87171')
      input.clearQueues()
      return
    }

    const lines = ['选择要装备的法器：', '']
    const options: { label: string; value: string }[] = []
    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i]
      lines.push(`${i + 1}. ${item.name}（${QUALITY_NAMES[item.quality]}）攻${item.atk ?? 0} 防${item.def ?? 0} 体${item.maxHp ?? 0}`)
      options.push({ label: item.name, value: 'i_' + i })
    }
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('选择法器', lines, options)
    if (result && result.startsWith('i_')) {
      const idx = parseInt(result.slice(2))
      const item = candidates[idx]
      if (item) {
        const invIdx = this.state.inventory.indexOf(item)
        if (invIdx >= 0) this.state.inventory.splice(invIdx, 1)
        d.equipment[slot] = item
        sfx('sfx_pickup')
        toast(`${d.name} 装备 ${item.name}`, '#34d399')
        saveGame(this.state)
      }
    }
    input.clearQueues()
  }

  private async startRetreat(d: Disciple) {
    input.clearQueues()
    const cost = retreatCost(d.realm)
    if (this.sect.resources.stone < cost) {
      toast(`闭关需要 ${cost} 灵石，不足`, '#f87171')
      return
    }
    const result = await showDialog('闭关修炼', [
      `消耗 ${cost} 宗门灵石，${d.name} 闭关 ${RETREAT_DURATION} 秒`,
      '闭关结束后大幅提升经验',
    ], [{ label: '开始闭关', value: 'start' }, { label: '取消', value: 'cancel' }])

    if (result === 'start') {
      this.sect.resources.stone -= cost
      d.status = 'retreating'
      d.retreatEndTime = Date.now() + RETREAT_DURATION * 1000
      saveGame(this.state)
      toast(`${d.name} 已开始闭关`, '#a78bfa')
    }
    input.clearQueues()
  }

  private async guideDisciple(d: Disciple) {
    input.clearQueues()
    d.exp += GUIDANCE_EXP
    d.loyalty = Math.min(100, d.loyalty + 2)
    d.affection = Math.min(100, d.affection + 5)
    d.guidanceCooldown = Date.now() + GUIDANCE_COOLDOWN * 1000
    this.checkDiscipleBreakthrough(d)
    saveGame(this.state)
    sfx('sfx_levelup')
    toast(`指点 ${d.name}，获得 ${GUIDANCE_EXP} 经验`, '#fbbf24')
  }

  private async dispatchDisciple(d: Disciple) {
    input.clearQueues()
    const available = SECT_QUESTS.filter(q => d.realm >= q.minRealm)
    if (available.length === 0) {
      toast('当前境界无可接取的宗门任务', '#f87171')
      return
    }
    const lines = ['选择宗门任务：']
    const options: { label: string; value: string }[] = []
    for (const q of available) {
      const rate = Math.floor(questSuccessRate(q, d) * 100)
      lines.push(`${q.name}  ${q.desc}  成功率${rate}%  ${q.duration}秒`)
      options.push({ label: q.name, value: q.id })
    }
    options.push({ label: '取消', value: 'cancel' })

    const result = await showDialog('宗门任务', lines, options)
    if (result && result !== 'cancel') {
      const quest = SECT_QUESTS.find(q => q.id === result)
      if (quest) {
        d.status = 'dispatched'
        d.questId = quest.id
        d.questStartTime = Date.now()
        addDiscipleEvent(this.sect, d, 'quest_start', `出发执行「${quest.name}」`, { questId: quest.id })
        saveGame(this.state)
        sfx('sfx_sect_dispatch', 0.5)
        toast(`已派遣 ${d.name} 执行「${quest.name}」`, '#60a5fa')
      }
    }
    input.clearQueues()
  }

  private updateDiscipleCultivation(delta: number) {
    const roomLv = this.sect.buildings.disciple_room ?? 0
    if (roomLv <= 0) return
    const roomBonus = 1 + roomLv * 0.1
    const accum = delta / 1000

    let instructorBonus = 0
    let grandElderBonus = 0
    for (const d of this.state.disciples) {
      if (d.role === 'instructor') instructorBonus = 0.30
      if (d.rank === 4) grandElderBonus = 0.15
      if (instructorBonus > 0 && grandElderBonus > 0) break // 都已找到，提前退出
    }
    for (const d of this.state.disciples) {
      if (d.status !== 'cultivating') continue
      const speed = cultivationSpeed(d.root, d.rootTier, d.talents)
      const rankBonus = 1 + d.rank * 0.05 + instructorBonus + grandElderBonus
      const expGain = Math.floor(accum * 5 * speed * roomBonus * rankBonus)
      d.exp += expGain
      this.checkDiscipleBreakthrough(d)
    }
  }

  private updateDiscipleTasks() {
    const now = Date.now()
    for (const d of this.state.disciples) {
      // 闭关结算
      if (d.status === 'retreating' && d.retreatEndTime > 0 && now >= d.retreatEndTime) {
        const expGain = expToNextRealm(d.realm) * 3
        d.exp += expGain
        d.status = 'idle'
        d.retreatEndTime = 0
        this.checkDiscipleBreakthrough(d)
        addDiscipleEvent(this.sect, d, 'retreat_end', `闭关结束，获得 ${expGain} 经验`)
        toast(`${d.name} 闭关结束，获得 ${expGain} 经验`, '#a78bfa')
        saveGame(this.state)
      }
      // 派遣结算
      if (d.status === 'dispatched' && d.questId) {
        const quest = SECT_QUESTS.find(q => q.id === d.questId)
        if (quest) {
          const elapsed = (now - d.questStartTime) / 1000
          if (elapsed >= quest.duration) {
            this.completeQuest(d, quest)
          }
        }
      }
      // 修炼疲劳结算
      if (d.status === 'cultivating' && d.cultivateStartTime > 0) {
        const cultElapsed = (now - d.cultivateStartTime) / 1000 // 秒
        // 每60秒疲劳+10，修炼获得经验
        const fatigueGain = (cultElapsed / 60) * 10
        const expGain = Math.floor(cultElapsed * 0.5) // 每秒0.5经验
        d.fatigue = Math.min(100, d.fatigue + fatigueGain)
        d.exp += expGain
        d.cultivateStartTime = now // 重置计时，避免重复累加
        this.checkDiscipleBreakthrough(d)

        // 疲劳满100自动休息
        if (d.fatigue >= 100) {
          d.status = 'idle'
          d.cultivateStartTime = 0
          addDiscipleEvent(this.sect, d, 'cultivate', `${d.name}修炼过度，疲惫休息`)
          toast(`${d.name} 修炼过度，需要休息`, '#f0c987')
          this.recreateDisciples()
          saveGame(this.state)
        }
      }
      // 空闲弟子恢复疲劳
      if (d.status === 'idle' && d.fatigue > 0) {
        // 每秒恢复约0.5疲劳
        const recover = 0.5 * (this.lastTaskCheck > 0 ? (now - this.lastTaskCheck) / 1000 : 0)
        d.fatigue = Math.max(0, d.fatigue - recover)
      }
    }
    this.lastTaskCheck = now
  }

  private completeQuest(d: Disciple, quest: SectQuest) {
    // 先检查是否遭遇袭击（影响任务结果）
    const ambush = checkAmbush(d, quest.type, this.rng)

    if (ambush) {
      this.handleAmbush(d, quest, ambush)
      return
    }

    const rate = questSuccessRate(quest, d)
    const success = this.rng() < rate
    d.status = 'idle'
    d.questId = null
    d.exp += quest.rewards.exp
    this.checkDiscipleBreakthrough(d)

    if (success) {
      const r = quest.rewards
      this.sect.resources.stone += r.stone
      this.sect.resources.herb += r.herb
      this.sect.resources.ore += r.ore
      this.sect.resources.wood += r.wood
      this.sect.resources.insight += r.insight
      this.sect.resources.prestige += r.prestige
      d.loyalty = Math.min(100, d.loyalty + 3)
      d.affection = Math.min(100, d.affection + 2)
      addDiscipleEvent(this.sect, d, 'quest_success',
        `完成「${quest.name}」，获得灵石${r.stone}、声望${r.prestige}`,
        { questId: quest.id, stone: r.stone, prestige: r.prestige })
      sfx('sfx_quest_complete', 0.6)
      toast(`${d.name} 完成「${quest.name}」，获得奖励！`, '#34d399')
    } else {
      d.loyalty = Math.max(0, d.loyalty - 5)
      addDiscipleEvent(this.sect, d, 'quest_fail',
        `执行「${quest.name}」失败，受挫而归`,
        { questId: quest.id })
      sfx('sfx_hit', 0.3)
      toast(`${d.name} 执行「${quest.name}」失败，忠诚下降`, '#f87171')
    }
    this.updateResourceDisplay()
    saveGame(this.state)
  }

  /** 处理弟子遇袭事件 */
  private handleAmbush(d: Disciple, quest: SectQuest, ambush: AmbushEvent) {
    d.status = 'idle'
    d.questId = null

    const attackerName = ambush.attackerName
    const resultName = ambushResultName(ambush.result)
    const questName = quest.name

    switch (ambush.result) {
      case 'victory':
        // 击退敌人：任务仍可完成，但获得额外战利品和经验
        d.exp += Math.floor(quest.rewards.exp * 1.5)
        this.checkDiscipleBreakthrough(d)
        const r = quest.rewards
        const bonusStone = Math.floor(ambush.attackerPower * 0.3)
        this.sect.resources.stone += r.stone + bonusStone
        this.sect.resources.herb += r.herb
        this.sect.resources.ore += r.ore
        this.sect.resources.prestige += r.prestige + 5
        d.loyalty = Math.min(100, d.loyalty + 5)
        d.affection = Math.min(100, d.affection + 3)
        addDiscipleEvent(this.sect, d, 'quest_success',
          `路遇${attackerName}，力战击退！完成「${questName}」并缴获灵石${bonusStone}`,
          { questId: quest.id, attacker: attackerName, bonusStone })
        sfx('sfx_quest_complete', 0.6)
        toast(`${d.name} 击退${attackerName}，超额完成任务！`, '#fbbf24')
        break

      case 'injured':
        // 负伤而归：任务失败，忠诚下降，需休养
        d.loyalty = Math.max(0, d.loyalty - 8)
        // 损失部分资源
        if (ambush.lootLost.stone) {
          this.sect.resources.stone = Math.max(0, this.sect.resources.stone - ambush.lootLost.stone)
        }
        if (ambush.lootLost.herb) {
          this.sect.resources.herb = Math.max(0, this.sect.resources.herb - ambush.lootLost.herb)
        }
        if (ambush.lootLost.ore) {
          this.sect.resources.ore = Math.max(0, this.sect.resources.ore - ambush.lootLost.ore)
        }
        addDiscipleEvent(this.sect, d, 'attacked',
          `执行「${questName}」途中遭${attackerName}袭击，负伤而归`,
          { questId: quest.id, attacker: attackerName, damage: ambush.damage })
        // 记录仇人
        this.addRevengeTarget(attackerName, ambush, d.name, d.uid, 'attacked')
        sfx('sfx_hit', 0.4)
        toast(`${d.name} 遭${attackerName}袭击，负伤而归！`, '#f87171')
        // 弹出报仇通知
        this.showAmbushNotification(d.name, attackerName, ambush, 'injured')
        break

      case 'fled':
        // 侥幸逃脱：任务失败，丢失部分物资
        d.loyalty = Math.max(0, d.loyalty - 3)
        if (ambush.lootLost.stone) {
          this.sect.resources.stone = Math.max(0, this.sect.resources.stone - ambush.lootLost.stone)
        }
        addDiscipleEvent(this.sect, d, 'attacked',
          `执行「${questName}」途中遇${attackerName}，侥幸逃脱但遗失物资`,
          { questId: quest.id, attacker: attackerName, fled: true })
        this.addRevengeTarget(attackerName, ambush, d.name, d.uid, 'attacked')
        sfx('sfx_hit', 0.2)
        toast(`${d.name} 遇${attackerName}，侥幸逃脱`, '#f0c987')
        break

      case 'killed':
        // 不幸遇害：弟子阵亡，任务失败
        addDiscipleEvent(this.sect, d, 'killed',
          `执行「${questName}」时遭${attackerName}杀害，不幸陨落`,
          { questId: quest.id, attacker: attackerName })
        this.addRevengeTarget(attackerName, ambush, d.name, '', 'killed')
        // 从弟子列表中移除
        const idx = this.state.disciples.indexOf(d)
        if (idx >= 0) this.state.disciples.splice(idx, 1)
        sfx('sfx_boss_death', 0.5)
        toast(`${d.name} 遭${attackerName}杀害，不幸陨落...`, '#f87171')
        // 宗门声望下降
        this.sect.resources.prestige = Math.max(0, this.sect.resources.prestige - 10)
        // 弹出报仇通知
        this.showAmbushNotification(d.name, attackerName, ambush, 'killed')
        break
    }

    this.updateResourceDisplay()
    saveGame(this.state)
  }

  /** 添加报仇目标 */
  private addRevengeTarget(
    attackerName: string,
    ambush: AmbushEvent,
    victimName: string,
    victimUid: string,
    eventType: 'attacked' | 'killed',
  ): void {
    if (!this.sect.revengeTargets) this.sect.revengeTargets = []
    this.sect.revengeTargets.push({
      id: 'rev_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1000).toString(36),
      attackerName,
      attackerType: ambush.attackerType,
      attackerRealm: ambush.attackerRealm,
      attackerPower: ambush.attackerPower,
      victimName,
      victimUid,
      eventType,
      timestamp: Date.now(),
      resolved: false,
    })
    // 保留最近 20 条
    if (this.sect.revengeTargets.length > 20) {
      this.sect.revengeTargets = this.sect.revengeTargets.slice(-20)
    }
  }

  /** 弹出遇袭通知面板 */
  private async showAmbushNotification(
    discipleName: string,
    attackerName: string,
    ambush: AmbushEvent,
    eventType: 'injured' | 'killed',
  ): Promise<void> {
    const lines: string[] = []
    if (eventType === 'killed') {
      lines.push(`弟子「${discipleName}」在外出任务时遭${attackerName}袭击，不幸陨落！`)
      lines.push(`敌修境界：${REALM_NAMES[ambush.attackerRealm]}`)
      lines.push(`敌修战力：约${ambush.attackerPower}`)
      lines.push('')
      lines.push('宗门声望下降10点，弟子弟心受挫。')
      lines.push('是否前往追杀仇人，为弟子报仇？')
    } else {
      lines.push(`弟子「${discipleName}」在外出途中遭${attackerName}袭击，负伤而归。`)
      lines.push(`敌修境界：${REALM_NAMES[ambush.attackerRealm]}`)
      lines.push(`敌修战力：约${ambush.attackerPower}`)
      lines.push('')
      lines.push('是否前往追杀仇人，为弟子雪耻？')
    }

    const result = await showDialog('弟子遇袭', lines, [
      { label: '前往报仇', value: 'revenge' },
      { label: '暂且作罢', value: 'ignore' },
    ])

    if (result === 'revenge') {
      await this.startRevengeBattle(attackerName, ambush)
    }
    input.clearQueues()
  }

  /** 发起复仇战斗 */
  private async startRevengeBattle(attackerName: string, ambush: AmbushEvent): Promise<void> {
    // 根据敌人类型生成战斗
    const enemyHp = Math.floor(ambush.attackerPower * 2 + 200)
    const enemyAtk = Math.floor(ambush.attackerPower * 0.3 + 20)

    const lines: string[] = []
    lines.push(`你追踪至一处荒野，${attackerName}正在此处歇息。`)
    lines.push(`对方察觉到你的杀意，拔出法器迎面而来！`)
    lines.push(`敌人境界：${REALM_NAMES[ambush.attackerRealm]}`)
    lines.push(`敌人体魄：${enemyHp}`)
    lines.push(`敌人攻击：${enemyAtk}`)

    await showDialog('仇人现身', lines, [{ label: '出手', value: 'fight' }])

    // 进入地牢战斗场景
    this.scene.start('Dungeon', {
      state: this.state,
      mode: 'npc_combat' as any,
      npcEnemy: {
        name: attackerName,
        hp: enemyHp,
        atk: enemyAtk,
        realm: ambush.attackerRealm,
        sprite: 'enemy_bandit',
        isRevengeTarget: true,
      },
    })

    // 标记报仇目标为已处理（将在战斗胜利后清除）
    const target = this.sect.revengeTargets?.find(t => t.attackerName === attackerName && !t.resolved)
    if (target) {
      target.resolved = true
      saveGame(this.state)
    }

    stopBgm()
  }

  /** 从场景内点击弟子打开详情面板（背景/性格/道途/事件日志 + 灵石灌顶） */
  private async openDiscipleDetail(uid: string) {
    input.clearQueues()
    const d = this.state.disciples.find(x => x.uid === uid)
    if (!d) return

    const rootInfo = SPIRIT_ROOTS[d.root]
    const tierLabel = d.rootTier === 'epic' ? '变异' : d.rootTier === 'rare' ? '稀有' : '普通'
    const rankDef = DISCIPLE_RANKS[d.rank]
    const eff = effectiveStats(d)
    const power = disciplePower(d)
    const statusLabel = d.status === 'idle' ? '空闲' : d.status === 'cultivating' ? '修炼中' : d.status === 'retreating' ? '闭关中' : '派遣中'

    const lines: string[] = []
    lines.push(`【${rankDef?.name ?? '外门'}】${d.name}`)
    lines.push(`境界：${REALM_NAMES[d.realm]}（${d.exp}/${d.expToNext}）`)
    lines.push(`灵根：${rootInfo.name}（${tierLabel}）`)
    lines.push(`战力：${power}  攻${eff.atk} 防${eff.def} 体${eff.maxHp}`)
    lines.push(`状态：${statusLabel}`)
    lines.push(`忠诚：${d.loyalty}  好感：${d.affection}  疲劳：${Math.floor(d.fatigue)}/100`)
    lines.push('')
    lines.push('—— 出身履历 ——')
    lines.push(`道途：${d.daoPath}`)
    lines.push(`出身：${d.background}`)
    lines.push(`体质：${d.physique}`)
    lines.push(`志向：${d.lifeGoal}`)
    lines.push(`性格：${d.personality.join('、')}`)
    lines.push(`天赋：${d.talents.map(t => TALENTS[t as keyof typeof TALENTS]?.name ?? t).join('、') || '无'}`)

    // 装备
    const eqParts: string[] = []
    if (d.equipment.weapon) eqParts.push(`武:${d.equipment.weapon.name}`)
    if (d.equipment.head) eqParts.push(`头:${d.equipment.head.name}`)
    if (d.equipment.armor) eqParts.push(`甲:${d.equipment.armor.name}`)
    if (d.equipment.boots) eqParts.push(`靴:${d.equipment.boots.name}`)
    if (d.equipment.charm) eqParts.push(`饰:${d.equipment.charm.name}`)
    if (eqParts.length > 0) {
      lines.push('')
      lines.push(`装备：${eqParts.join(' ')}`)
    }

    // 最近事件（5条）
    const allEvents = this.sect.discipleEvents.filter(e => e.discipleUid === d.uid)
    const events = allEvents.slice(0, 5)
    if (events.length > 0) {
      lines.push('')
      lines.push(`—— 近期动态（共${allEvents.length}条）——`)
      for (const ev of events) {
        const timeStr = new Date(ev.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        lines.push(`[${timeStr}] ${ev.description}`)
      }
    }

    const options: { label: string; value: string }[] = []

    // 灵石灌顶（仅非派遣/非闭关状态可用）
    if (d.status === 'idle' || d.status === 'cultivating') {
      const cost = stoneCultivateCost(d.realm, d.exp, d.expToNext)
      options.push({ label: `灵石灌顶（${cost}灵石→满级）`, value: 'stone' })
    }

    options.push({ label: '指点（+50经验）', value: 'guide' })
    if (d.status === 'idle') {
      if (d.fatigue >= 80) {
        toast(`${d.name} 疲劳过高，需要休息`, '#f87171')
      } else {
        options.push({ label: '开始修炼', value: 'cultivate' })
      }
    }
    if (d.status === 'cultivating') options.push({ label: '停止修炼', value: 'stop_cultivate' })
    if (d.status === 'idle' && d.realm >= 1) options.push({ label: '闭关修炼', value: 'retreat' })
    options.push({ label: '装备法器', value: 'equip' })
    options.push({ label: '派遣任务', value: 'dispatch' })
    if (allEvents.length > 5) options.push({ label: `查看全部事件（${allEvents.length}条）`, value: 'all_events' })
    options.push({ label: '关闭', value: 'close' })

    const result = await showDialog(d.name, lines, options)
    if (result === 'stone') {
      await this.stoneCultivateDisciple(d)
      this.openDiscipleDetail(d.uid) // 刷新面板
      return
    }
    if (result === 'guide') {
      if (Date.now() < d.guidanceCooldown) {
        toast('指点冷却中', '#f87171')
      } else {
        await this.guideDisciple(d)
        addDiscipleEvent(this.sect, d, 'guidance', `掌门亲自指点，${d.name}受益匪浅`)
        saveGame(this.state)
      }
      this.openDiscipleDetail(d.uid)
      return
    }
    if (result === 'cultivate') {
      d.status = 'cultivating'
      d.cultivateStartTime = Date.now()
      addDiscipleEvent(this.sect, d, 'cultivate', `${d.name}开始潜心修炼`)
      saveGame(this.state)
      toast(`${d.name} 开始修炼`, '#a78bfa')
      this.recreateDisciples()
    }
    if (result === 'stop_cultivate') {
      d.status = 'idle'
      d.cultivateStartTime = 0
      saveGame(this.state)
      toast(`${d.name} 停止修炼`, '#fbbf24')
      this.recreateDisciples()
    }
    if (result === 'retreat') {
      await this.startRetreat(d)
      this.recreateDisciples()
    }
    if (result === 'equip') {
      await this.openDiscipleEquip(d)
      this.openDiscipleDetail(d.uid)
      return
    }
    if (result === 'dispatch') {
      await this.dispatchDisciple(d)
      this.recreateDisciples()
    }
    if (result === 'all_events') {
      await this.showDiscipleEventLog(d)
      this.openDiscipleDetail(d.uid)
      return
    }
    input.clearQueues()
  }

  /** 显示弟子完整事件日志（分页） */
  private async showDiscipleEventLog(d: Disciple): Promise<void> {
    const allEvents = this.sect.discipleEvents.filter(e => e.discipleUid === d.uid)
    if (allEvents.length === 0) {
      await showDialog(`${d.name}·事件日志`, ['暂无事件记录'], [{ label: '关闭', value: 'close' }])
      input.clearQueues()
      return
    }

    const PAGE_SIZE = 10
    let page = 0
    const totalPages = Math.ceil(allEvents.length / PAGE_SIZE)

    while (true) {
      const start = page * PAGE_SIZE
      const pageEvents = allEvents.slice(start, start + PAGE_SIZE)
      const lines: string[] = [`—— ${d.name}·事件日志（第${page + 1}/${totalPages}页，共${allEvents.length}条）——`, '']
      for (const ev of pageEvents) {
        const timeStr = new Date(ev.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        const typeLabel = this.eventTypeLabel(ev.type)
        lines.push(`[${timeStr}] ${typeLabel} ${ev.description}`)
      }

      const options: { label: string; value: string }[] = []
      if (page > 0) options.push({ label: '上一页', value: 'prev' })
      if (page < totalPages - 1) options.push({ label: '下一页', value: 'next' })
      options.push({ label: '关闭', value: 'close' })

      const result = await showDialog(`${d.name}·事件日志`, lines, options)
      if (result === 'prev' && page > 0) page--
      else if (result === 'next' && page < totalPages - 1) page++
      else break
    }
    input.clearQueues()
  }

  /** 事件类型中文标签 */
  private eventTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      recruit: '招募',
      cultivate: '修炼',
      breakthrough: '突破',
      quest_start: '出发',
      quest_success: '完成',
      quest_fail: '失败',
      attacked: '遇袭',
      killed: '遇害',
      rescued: '获救',
      promote: '晋升',
      retreat_start: '闭关',
      retreat_end: '出关',
      spar_win: '切磋胜',
      spar_lose: '切磋败',
      guidance: '指点',
    }
    return labels[type] ? `[${labels[type]}]` : ''
  }

  /** 灵石灌顶弟子 */
  private async stoneCultivateDisciple(d: Disciple) {
    const cost = stoneCultivateCost(d.realm, d.exp, d.expToNext)
    if (this.sect.resources.stone < cost) {
      toast(`灵石不足（需要${cost}）`, '#f87171')
      return
    }
    const result = await showDialog('灵石灌顶', [
      `消耗 ${cost} 灵石，将 ${d.name} 推升至下一境界`,
      `<span class="dim">当前：${REALM_NAMES[d.realm]}（${d.exp}/${d.expToNext}）</span>`,
    ], [{ label: '确认灌顶', value: 'yes' }, { label: '取消', value: 'no' }])

    if (result === 'yes') {
      this.sect.resources.stone -= cost
      const res = stoneCultivate(d, cost)
      addDiscipleEvent(this.sect, d, res.breakthrough ? 'breakthrough' : 'cultivate',
        res.breakthrough
          ? `灵石灌顶，一举突破至${REALM_NAMES[d.realm]}！`
          : `灵石灌顶，获得${res.expGained}点经验`)
      this.checkDiscipleBreakthrough(d)
      saveGame(this.state)
      sfx('sfx_levelup')
      toast(res.breakthrough ? `${d.name} 突破至${REALM_NAMES[d.realm]}！` : `${d.name} 获得 ${res.expGained} 经验`, '#fbbf24')
    }
    input.clearQueues()
  }

  /** 重建弟子渲染（状态变化后调用） */
  private recreateDisciples(): void {
    for (const ds of this.discipleSprites) {
      ds.sprite.destroy()
      ds.nameText.destroy()
      ds.shadow.destroy()
    }
    this.discipleSprites = []
    this.renderDisciples()
  }

  private checkDiscipleBreakthrough(d: Disciple) {
    while (d.exp >= d.expToNext && d.realm < 6) {
      d.exp -= d.expToNext
      d.realm = (d.realm + 1) as DiscipleRealm
      d.expToNext = expToNextRealm(d.realm)
      // 重算属性
      const tierMult = d.rootTier === 'epic' ? 1.3 : d.rootTier === 'rare' ? 1.15 : 1.0
      d.atk = Math.floor((30 + d.realm * 25) * tierMult)
      d.def = Math.floor((15 + d.realm * 12) * tierMult)
      d.maxHp = Math.floor((200 + d.realm * 150) * tierMult)
      d.crit = 5 + d.realm * 2
      for (const t of d.talents) {
        if (t === 'body_tempering') d.maxHp = Math.floor(d.maxHp * 1.2)
        if (t === 'sword_affinity') d.atk = Math.floor(d.atk * 1.15)
        if (t === 'thick_skin') d.def = Math.floor(d.def * 1.15)
        if (t === 'spirit_eye') d.crit += 10
        if (t === 'frail') d.maxHp = Math.floor(d.maxHp * 0.85)
      }
      sfx('sfx_levelup')
      toast(`${d.name} 突破至 ${REALM_NAMES[d.realm]}！`, '#fbbf24')
    }
  }

  // ===== 生产系统 =====

  private async openAlchemy() {
    input.clearQueues()
    const alchemyLv = this.sect.buildings.alchemy_room ?? 0
    if (alchemyLv <= 0) {
      toast('请先建造炼丹房', '#f87171')
      return
    }
    const available = PILL_RECIPES.filter(r => alchemyLv >= r.requireLevel)
    if (available.length === 0) {
      toast('炼丹房等级不足，无法炼制任何丹药', '#f87171')
      return
    }
    const lines = ['选择炼制配方：', `当前灵草：${this.sect.resources.herb}`]
    const options: { label: string; value: string }[] = []
    for (const r of available) {
      const rate = Math.floor(alchemySuccess(r, alchemyLv) * 100)
      const can = this.sect.resources.herb >= r.herbCost
      lines.push(`${r.name}  灵草×${r.herbCost}  产出×${r.output}  成功率${rate}%${can ? '' : '（不足）'}`)
      options.push({ label: r.name, value: r.id })
    }
    options.push({ label: '取消', value: 'cancel' })

    const result = await showDialog('炼丹房', lines, options)
    if (result && result !== 'cancel') {
      const recipe = PILL_RECIPES.find(r => r.id === result)
      if (recipe) await this.craftPill(recipe, alchemyLv)
    }
    input.clearQueues()
  }

  private async craftPill(recipe: PillRecipe, alchemyLv: number) {
    input.clearQueues()
    if (this.sect.resources.herb < recipe.herbCost) {
      toast(`灵草不足，需要 ${recipe.herbCost}`, '#f87171')
      return
    }
    this.sect.resources.herb -= recipe.herbCost
    const success = this.rng() < alchemySuccess(recipe, alchemyLv)

    if (success) {
      sfx('sfx_refine', 0.5)
      sfx('sfx_levelup', 0.4)
      switch (recipe.id) {
        case 'hp_pill':
          this.state.consumables.hp_pill = (this.state.consumables.hp_pill ?? 0) + recipe.output
          this.state.potions = (this.state.potions ?? 0) + recipe.output
          toast(`炼制成功！获得回春丹 ×${recipe.output}`, '#34d399')
          break
        case 'exp_pill':
          this.state.exp += recipe.output * 50
          toast(`炼制成功！获得 ${recipe.output * 50} 经验`, '#34d399')
          break
        case 'breakthrough_pill':
          this.state.consumables.breakthrough_pill = (this.state.consumables.breakthrough_pill ?? 0) + recipe.output
          toast(`炼制成功！获得突破丹 ×${recipe.output}`, '#fbbf24')
          break
        case 'body_pill':
          this.state.consumables.body_pill = (this.state.consumables.body_pill ?? 0) + recipe.output
          toast(`炼制成功！获得锻体丹 ×${recipe.output}`, '#a78bfa')
          break
      }
    } else {
      sfx('sfx_click')
      toast('炼丹失败，材料损耗', '#f87171')
    }
    this.updateResourceDisplay()
    saveGame(this.state)
    input.clearQueues()
  }

  private async openForge() {
    input.clearQueues()
    const forgeLv = this.sect.buildings.forge_pavilion ?? 0
    if (forgeLv <= 0) {
      toast('请先建造炼器阁', '#f87171')
      return
    }
    const available = FORGE_RECIPES.filter(r => forgeLv >= r.requireLevel)
    const lines = [`矿石 ${this.sect.resources.ore}  木材 ${this.sect.resources.wood}`, '选择锻造装备：']
    const options: { label: string; value: string }[] = []
    for (const r of available) {
      const can = this.sect.resources.ore >= r.oreCost && this.sect.resources.wood >= r.woodCost
      lines.push(`${r.name}  矿×${r.oreCost} 木×${r.woodCost}${can ? '' : '（不足）'}`)
      options.push({ label: r.name, value: r.slot })
    }
    options.push({ label: '取消', value: 'cancel' })

    const result = await showDialog('炼器阁', lines, options)
    if (result && result !== 'cancel') {
      const recipe = FORGE_RECIPES.find(r => r.slot === result)
      if (recipe) await this.forgeEquipment(recipe, forgeLv)
    }
    input.clearQueues()
  }

  private async forgeEquipment(recipe: ForgeRecipe, forgeLv: number) {
    input.clearQueues()
    if (this.sect.resources.ore < recipe.oreCost || this.sect.resources.wood < recipe.woodCost) {
      toast('材料不足', '#f87171')
      return
    }
    this.sect.resources.ore -= recipe.oreCost
    this.sect.resources.wood -= recipe.woodCost

    const item = generateForgedEquipment(recipe.slot, forgeLv, this.state.level, this.rng)
    this.state.inventory.push(item)
    sfx('sfx_refine', 0.6)
    if (item.quality >= 3) sfx('sfx_drop_epic', 0.4)
    this.updateResourceDisplay()
    saveGame(this.state)
    toast(`锻造成功！获得 ${item.name}`, '#34d399')
    input.clearQueues()
  }

  private async openLibrary() {
    input.clearQueues()
    const libLv = this.sect.buildings.library ?? 0
    if (libLv <= 0) {
      toast('请先建造藏经阁', '#f87171')
      return
    }

    const result = await showDialog('藏经阁', [
      '选择功能：',
      `悟道点 ${this.sect.resources.insight}  声望 ${this.sect.resources.prestige}`,
    ], [
      { label: '功法传授', value: 'teach' },
      { label: '科技研究', value: 'tech' },
      { label: '关闭', value: 'close' },
    ])

    if (result === 'teach') {
      await this.teachDiscipleSkill()
    } else if (result === 'tech') {
      await this.openTechResearch()
    } else {
      input.clearQueues()
    }
  }

  private async teachDiscipleSkill() {
    input.clearQueues()
    if (this.state.disciples.length === 0) {
      toast('宗门暂无弟子', '#f87171')
      return
    }
    // 选择弟子
    const dLines = ['选择弟子：']
    const dOptions: { label: string; value: string }[] = []
    for (let i = 0; i < this.state.disciples.length; i++) {
      const d = this.state.disciples[i]
      dLines.push(`${i + 1}. ${d.name}  已学${d.skills.length}/3`)
      dOptions.push({ label: d.name, value: 'd_' + i })
    }
    dOptions.push({ label: '取消', value: 'cancel' })

    const dResult = await showDialog('功法传授', dLines, dOptions)
    if (!dResult || dResult === 'cancel') {
      input.clearQueues()
      return
    }
    const dIdx = parseInt(dResult.slice(2))
    const d = this.state.disciples[dIdx]
    if (!d) { input.clearQueues(); return }

    // 选择功法
    const skills = getTeachableSkills(d.realm)
    if (skills.length === 0) {
      toast('暂无可学功法', '#f87171')
      input.clearQueues()
      return
    }
    const sLines = [`悟道点 ${this.sect.resources.insight}`, '选择功法：']
    const sOptions: { label: string; value: string }[] = []
    for (const s of skills) {
      if (!canLearnSkill(d, s.id)) continue
      const can = this.sect.resources.insight >= s.insightCost
      sLines.push(`${s.name}  消耗悟道×${s.insightCost}${can ? '' : '（不足）'}`)
      sOptions.push({ label: s.name, value: s.id })
    }
    sOptions.push({ label: '取消', value: 'cancel' })

    if (sOptions.length <= 1) {
      toast('该弟子已学满功法或无可学功法', '#f0c987')
      input.clearQueues()
      return
    }

    const sResult = await showDialog('选择功法', sLines, sOptions)
    if (sResult && sResult !== 'cancel') {
      const skill = skills.find(s => s.id === sResult)
      if (skill && this.sect.resources.insight >= skill.insightCost) {
        this.sect.resources.insight -= skill.insightCost
        d.skills.push(skill.id)
        saveGame(this.state)
        sfx('sfx_levelup')
        toast(`${d.name} 学会了 ${skill.name}！`, '#a78bfa')
      } else {
        toast('悟道点不足', '#f87171')
      }
    }
    this.updateResourceDisplay()
    input.clearQueues()
  }

  private async openTechResearch() {
    input.clearQueues()
    const libLv = this.sect.buildings.library ?? 0
    const lines = [`悟道点 ${this.sect.resources.insight}  声望 ${this.sect.resources.prestige}`, '选择科技：']
    const options: { label: string; value: string }[] = []

    for (const id of TECH_IDS) {
      const tech = TECHS[id]
      if (libLv < tech.requireLibrary) continue
      const lv = this.sect.techs[id] ?? 0
      if (lv >= tech.maxLevel) {
        lines.push(`${tech.name} Lv.${lv}（满级）`)
        continue
      }
      const cost = techUpgradeCost(tech, lv)
      const can = this.sect.resources.insight >= cost.insight && this.sect.resources.prestige >= cost.prestige
      lines.push(`${tech.name} Lv.${lv}→${lv + 1}  悟道×${cost.insight} 声望×${cost.prestige}${can ? '' : '（不足）'}`)
      options.push({ label: tech.name, value: id })
    }
    options.push({ label: '取消', value: 'cancel' })

    if (options.length <= 1) {
      toast('暂无可研究的科技', '#f0c987')
      input.clearQueues()
      return
    }

    const result = await showDialog('科技研究', lines, options)
    if (result && result !== 'cancel') {
      const techId = result as TechId
      const tech = TECHS[techId]
      const lv = this.sect.techs[techId] ?? 0
      const cost = techUpgradeCost(tech, lv)
      if (this.sect.resources.insight >= cost.insight && this.sect.resources.prestige >= cost.prestige) {
        this.sect.resources.insight -= cost.insight
        this.sect.resources.prestige -= cost.prestige
        this.sect.techs[techId] = lv + 1
        saveGame(this.state)
        sfx('sfx_levelup')
        toast(`${tech.name} 升级至 Lv.${lv + 1}！`, '#fbbf24')
        this.updateResourceDisplay()
      } else {
        toast('资源不足', '#f87171')
      }
    }
    input.clearQueues()
  }

  private async openSpiritFarm() {
    input.clearQueues()
    const farmLv = this.sect.buildings.spirit_farm ?? 0
    if (farmLv <= 0) {
      toast('请先建造灵田', '#f87171')
      return
    }
    const slots = this.sect.farmSlots
    const availCrops = CROPS.filter(c => farmLv >= c.requireFarm)

    const lines = [`灵石 ${this.sect.resources.stone}`, '灵田种植状态：']
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      if (!s) {
        lines.push(`灵田 ${i + 1}：空闲`)
      } else if (s.ready) {
        const crop = CROPS.find(c => c.id === s.cropId)
        lines.push(`灵田 ${i + 1}：${crop?.name ?? '?'}（可收获）`)
      } else {
        const crop = CROPS.find(c => c.id === s.cropId)
        const elapsed = (Date.now() - s.plantTime) / 1000
        const remain = Math.max(0, Math.ceil((crop?.growTime ?? 0) - elapsed))
        lines.push(`灵田 ${i + 1}：${crop?.name ?? '?'}（${remain}秒后成熟）`)
      }
    }

    const options: { label: string; value: string }[] = []
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      if (!s) {
        for (const c of availCrops) {
          options.push({ label: `灵田${i + 1}·种${c.name}`, value: `plant_${i}_${c.id}` })
        }
      } else if (s.ready) {
        options.push({ label: `灵田${i + 1}·收获`, value: `harvest_${i}` })
      }
    }
    options.push({ label: '关闭', value: 'close' })

    if (options.length <= 1) {
      toast('灵田暂无可执行操作', '#f0c987')
      input.clearQueues()
      return
    }

    const result = await showDialog('灵田', lines, options)
    if (result && result !== 'close') {
      if (result.startsWith('plant_')) {
        const [, idxStr, cropId] = result.split('_')
        const idx = parseInt(idxStr)
        const crop = CROPS.find(c => c.id === cropId)
        if (crop && this.sect.resources.stone >= crop.seedCost) {
          this.sect.resources.stone -= crop.seedCost
          this.sect.farmSlots[idx] = { cropId: crop.id, plantTime: Date.now(), ready: false }
          saveGame(this.state)
          toast(`灵田 ${idx + 1} 种植了 ${crop.name}`, '#84cc16')
          this.updateResourceDisplay()
        } else {
          toast('灵石不足', '#f87171')
        }
      } else if (result.startsWith('harvest_')) {
        const idx = parseInt(result.split('_')[1])
        const slot = this.sect.farmSlots[idx]
        if (slot) {
          const crop = CROPS.find(c => c.id === slot.cropId)
          if (crop) {
            this.sect.resources.herb += crop.herbYield
            this.sect.farmSlots[idx] = null
            saveGame(this.state)
            sfx('sfx_pickup')
            toast(`收获 ${crop.name}，获得灵草 ×${crop.herbYield}`, '#34d399')
            this.updateResourceDisplay()
          }
        }
      }
    }
    input.clearQueues()
  }

  private updateFarmGrowth() {
    const now = Date.now()
    for (const slot of this.sect.farmSlots) {
      if (!slot || slot.ready) continue
      const crop = CROPS.find(c => c.id === slot.cropId)
      if (!crop) continue
      const elapsed = (now - slot.plantTime) / 1000
      if (elapsed >= crop.growTime) {
        slot.ready = true
      }
    }
  }

  // ===== 演武场切磋 =====

  private async openTrainingGround() {
    input.clearQueues()
    const tgLv = this.sect.buildings.training_ground ?? 0
    if (tgLv <= 0) {
      toast('请先建造演武场', '#f87171')
      return
    }

    const available = this.state.disciples.filter(d => d.status === 'idle' && Date.now() > d.sparCooldown)
    if (available.length < 2) {
      toast('需要至少 2 名空闲弟子（未冷却）才能切磋', '#f87171')
      input.clearQueues()
      return
    }

    const lines = [
      `演武场 Lv.${tgLv}  切磋加成 +${tgLv * 10}%经验`,
      `可切磋弟子 ${available.length} 人`,
      '选择第一位弟子：',
    ]
    const options: { label: string; value: string }[] = []
    for (let i = 0; i < available.length; i++) {
      const d = available[i]
      const rootName = SPIRIT_ROOTS[d.root].name
      const power = disciplePower(d)
      lines.push(`${i + 1}. ${d.name}  ${rootName}·${REALM_NAMES[d.realm]}  战力${power}`)
      options.push({ label: d.name, value: 'd1_' + i })
    }
    options.push({ label: '返回', value: 'back' })

    const result1 = await showDialog('演武场', lines, options)
    if (!result1 || result1 === 'back') {
      input.clearQueues()
      return
    }

    const idx1 = parseInt(result1.slice(3))
    const d1 = available[idx1]
    if (!d1) { input.clearQueues(); return }

    const available2 = available.filter(d => d.uid !== d1.uid)
    const lines2 = [
      `第一位：${d1.name}  战力${disciplePower(d1)}`,
      '选择第二位弟子：',
    ]
    const options2: { label: string; value: string }[] = []
    for (let i = 0; i < available2.length; i++) {
      const d = available2[i]
      const power = disciplePower(d)
      lines2.push(`${i + 1}. ${d.name}  ${REALM_NAMES[d.realm]}  战力${power}`)
      options2.push({ label: d.name, value: 'd2_' + i })
    }
    options2.push({ label: '返回', value: 'back' })

    const result2 = await showDialog('选择对手', lines2, options2)
    if (!result2 || result2 === 'back') {
      input.clearQueues()
      return
    }

    const idx2 = parseInt(result2.slice(3))
    const d2 = available2[idx2]
    if (!d2) { input.clearQueues(); return }

    await this.runSpar(d1, d2, tgLv)
  }

  private async runSpar(d1: Disciple, d2: Disciple, tgLv: number) {
    input.clearQueues()

    const spar = sparDisciples(d1, d2, this.rng)
    const expBonus = 1 + tgLv * 0.1
    const wExp = Math.floor(spar.winnerExp * expBonus)
    const lExp = Math.floor(spar.loserExp * expBonus)

    spar.winner.exp += wExp
    spar.loser.exp += lExp
    spar.winner.sparCooldown = Date.now() + SPAR_COOLDOWN * 1000
    spar.loser.sparCooldown = Date.now() + SPAR_COOLDOWN * 1000

    spar.winner.loyalty = Math.min(100, spar.winner.loyalty + 2)
    spar.loser.loyalty = Math.max(0, spar.loser.loyalty - 1)

    this.checkDiscipleBreakthrough(spar.winner)
    this.checkDiscipleBreakthrough(spar.loser)

    const logLines = [
      `${d1.name}（战力${spar.d1Power}） 对阵 ${d2.name}（战力${spar.d2Power}）`,
      ...spar.rounds.slice(0, 6),
      spar.rounds.length > 6 ? `...（共${spar.rounds.length}回合）` : '',
      '',
      `胜者：${spar.winner.name}  经验+${wExp}`,
      `败者：${spar.loser.name}  经验+${lExp}`,
    ].filter(l => l !== '')

    sfx('sfx_disciple_sparring', 0.5)
    sfx('sfx_hit', 0.4)
    saveGame(this.state)

    const result = await showDialog('切磋结果', logLines, [
      { label: '再来一场', value: 'again' },
      { label: '返回', value: 'back' },
    ])

    if (result === 'again') {
      await this.openTrainingGround()
    } else {
      input.clearQueues()
    }
  }

  // ===== 灵兽园 =====

  private async openBeastPark() {
    input.clearQueues()
    const parkLv = this.sect.buildings.beast_park ?? 0
    if (parkLv <= 0) {
      toast('请先建造灵兽园', '#f87171')
      return
    }

    const cap = beastCapacity(parkLv)
    const beasts = this.state.beasts
    const activePet = beasts.find(b => b.uid === activeBeastRef(this.state.party))
    const activeMount = beasts.find(b => b.uid === this.state.activeMountUid)

    const lines = [
      `灵兽园 Lv.${parkLv}  容量 ${beasts.length}/${cap}`,
      activePet ? `出战灵兽：${activePet.name}（Lv.${activePet.level}）` : '出战灵兽：无',
      activeMount ? `坐骑灵兽：${activeMount.name}（Lv.${activeMount.level}）` : '坐骑灵兽：无',
      '选择操作：',
    ]

    const options: { label: string; value: string }[] = [
      { label: '查看灵兽', value: 'view' },
      { label: '出战灵兽（战斗）', value: 'pet' },
      { label: '坐骑灵兽（加速）', value: 'mount' },
      { label: '返回', value: 'back' },
    ]

    const result = await showDialog('灵兽园', lines, options)
    if (result === 'view') {
      await this.viewBeasts()
    } else if (result === 'pet') {
      await this.assignPet()
    } else if (result === 'mount') {
      await this.assignMount()
    } else {
      input.clearQueues()
    }
  }

  private async viewBeasts() {
    input.clearQueues()
    const beasts = this.state.beasts
    if (beasts.length === 0) {
      toast('灵兽园中暂无灵兽，可在秘境中捕获', '#f0c987')
      input.clearQueues()
      return
    }

    const lines = ['灵兽列表：', '']
    const options: { label: string; value: string }[] = []
    for (let i = 0; i < beasts.length; i++) {
      const b = beasts[i]
      const rn = RARITY_NAMES[b.rarity]
      const el = ELEMENT_NAMES[b.element]
      lines.push(`${i + 1}. ${b.name} ${rn}·${el} Lv.${b.level}`)
      lines.push(`  攻${b.atk} 防${b.def} 体${b.maxHp} 速${b.speed}`)
      const isPet = activeBeastRef(this.state.party) === b.uid
      const isMount = this.state.activeMountUid === b.uid
      const tag = isPet ? '【出战】' : isMount ? '【坐骑】' : ''
      options.push({ label: `${b.name} Lv.${b.level} ${tag}`, value: 'b_' + i })
    }
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('灵兽详情', lines, options)
    if (result && result.startsWith('b_')) {
      const idx = parseInt(result.slice(2))
      const b = beasts[idx]
      if (b) await this.manageBeast(b)
    } else {
      input.clearQueues()
    }
  }

  private async manageBeast(b: Beast) {
    input.clearQueues()
    const sp = BEAST_SPECIES_MAP.get(b.species)
    const herbCost = 5 + b.level * 2
    const canFeed = Date.now() > b.feedCooldown && this.sect.resources.herb >= herbCost

    const lines = [
      `${b.name}  ${RARITY_NAMES[b.rarity]}·${ELEMENT_NAMES[b.element]}  Lv.${b.level}`,
      `经验 ${b.exp} / ${b.expToNext}`,
      `攻${b.atk}  防${b.def}  体${b.maxHp}  速${b.speed}`,
      sp?.desc ?? '',
      `喂养消耗：灵草×${herbCost}`,
    ]

    const options: { label: string; value: string }[] = []
    if (canFeed) options.push({ label: '喂养升级', value: 'feed' })
    if (activeBeastRef(this.state.party) === b.uid) {
      options.push({ label: '收回出战', value: 'unpet' })
    } else if (b.deployed === false || true) {
      options.push({ label: '设为出战', value: 'pet' })
    }
    if (this.state.activeMountUid === b.uid) {
      options.push({ label: '收回坐骑', value: 'unmount' })
    } else if (sp?.canMount) {
      options.push({ label: '设为坐骑', value: 'mount' })
    }
    options.push({ label: '放生', value: 'release' })
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('灵兽管理', lines, options)

    if (result === 'feed' && canFeed) {
      this.sect.resources.herb -= herbCost
      feedBeast(b, herbCost)
      sfx('sfx_pickup')
      toast(`${b.name} 获得经验，等级 Lv.${b.level}`, '#34d399')
      saveGame(this.state)
      this.updateResourceDisplay()
      await this.manageBeast(b)
    } else if (result === 'pet') {
      setActiveBeast(this.state, b)
      toast(`${b.name} 已设为出战灵兽`, '#c084fc')
      saveGame(this.state)
      await this.manageBeast(b)
    } else if (result === 'unpet') {
      setActiveBeast(this.state, null)
      toast(`收回 ${b.name}`, '#94a3b8')
      saveGame(this.state)
      await this.manageBeast(b)
    } else if (result === 'mount') {
      this.state.activeMountUid = b.uid
      toast(`${b.name} 已设为坐骑`, '#c084fc')
      saveGame(this.state)
      await this.manageBeast(b)
    } else if (result === 'unmount') {
      this.state.activeMountUid = null
      toast(`收回 ${b.name}`, '#94a3b8')
      saveGame(this.state)
      await this.manageBeast(b)
    } else if (result === 'release') {
      this.state.beasts = this.state.beasts.filter(x => x.uid !== b.uid)
      if (activeBeastRef(this.state.party) === b.uid) setActiveBeast(this.state, null)
      if (this.state.activeMountUid === b.uid) this.state.activeMountUid = null
      toast(`放生了 ${b.name}`, '#94a3b8')
      saveGame(this.state)
      input.clearQueues()
    } else {
      input.clearQueues()
    }
  }

  private async assignPet() {
    input.clearQueues()
    const beasts = this.state.beasts
    if (beasts.length === 0) {
      toast('暂无灵兽可出战', '#f87171')
      input.clearQueues()
      return
    }

    const lines = ['选择出战灵兽：', '']
    const options: { label: string; value: string }[] = []
    for (let i = 0; i < beasts.length; i++) {
      const b = beasts[i]
      const cur = activeBeastRef(this.state.party) === b.uid ? '（当前）' : ''
      lines.push(`${i + 1}. ${b.name} Lv.${b.level} 攻${b.atk} 防${b.def}${cur}`)
      options.push({ label: `${b.name}${cur}`, value: 'p_' + i })
    }
    options.push({ label: '取消出战', value: 'unpet' })
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('出战灵兽', lines, options)
    if (result === 'unpet') {
      setActiveBeast(this.state, null)
      toast('已取消出战灵兽', '#94a3b8')
      saveGame(this.state)
    } else if (result && result.startsWith('p_')) {
      const idx = parseInt(result.slice(2))
      const b = beasts[idx]
      if (b) {
        setActiveBeast(this.state, b)
        toast(`${b.name} 已出战`, '#c084fc')
        saveGame(this.state)
      }
    }
    input.clearQueues()
  }

  private async assignMount() {
    input.clearQueues()
    const beasts = this.state.beasts.filter(b => {
      const sp = BEAST_SPECIES_MAP.get(b.species)
      return sp?.canMount
    })
    if (beasts.length === 0) {
      toast('暂无可作为坐骑的灵兽', '#f87171')
      input.clearQueues()
      return
    }

    const lines = ['选择坐骑灵兽：', '']
    const options: { label: string; value: string }[] = []
    for (let i = 0; i < beasts.length; i++) {
      const b = beasts[i]
      const bonus = Math.floor(mountSpeedBonus(b) * 100)
      const cur = this.state.activeMountUid === b.uid ? '（当前）' : ''
      lines.push(`${i + 1}. ${b.name} Lv.${b.level} 速度+${bonus}%${cur}`)
      options.push({ label: `${b.name}${cur}`, value: 'm_' + i })
    }
    options.push({ label: '取消坐骑', value: 'unmount' })
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('坐骑灵兽', lines, options)
    if (result === 'unmount') {
      this.state.activeMountUid = null
      toast('已取消坐骑', '#94a3b8')
      saveGame(this.state)
    } else if (result && result.startsWith('m_')) {
      const idx = parseInt(result.slice(2))
      const b = beasts[idx]
      if (b) {
        this.state.activeMountUid = b.uid
        const bonus = Math.floor(mountSpeedBonus(b) * 100)
        toast(`${b.name} 已设为坐骑，移动速度+${bonus}%`, '#c084fc')
        saveGame(this.state)
      }
    }
    input.clearQueues()
  }

  // ===== 阵法部署系统 =====

  private async openGuardArray() {
    input.clearQueues()
    const gaLv = this.sect.buildings.guard_array ?? 0
    if (gaLv <= 0) {
      toast('请先建造护山大阵', '#f87171')
      return
    }

    const defenseBonus = gaLv * 0.05
    const lines = [
      `护山大阵 Lv.${gaLv}  防御加成 +${Math.floor(defenseBonus * 100)}%`,
      `已学阵法 ${this.state.formations.length} 种`,
      '选择操作：',
    ]

    const options: { label: string; value: string }[] = [
      { label: '学习阵法', value: 'learn' },
      { label: '部署阵法（秘境）', value: 'deploy' },
      { label: '返回', value: 'back' },
    ]

    const result = await showDialog('护山大阵', lines, options)
    if (result === 'learn') {
      await this.learnFormation()
    } else if (result === 'deploy') {
      await this.deployFormation()
    } else {
      input.clearQueues()
    }
  }

  private async learnFormation() {
    input.clearQueues()
    const libLv = this.sect.buildings.library ?? 0
    const available = FORMATIONS.filter(f => libLv >= f.requireLibrary && !this.state.formations.includes(f.id))

    if (available.length === 0) {
      toast('暂无可学习的新阵法', '#f0c987')
      input.clearQueues()
      return
    }

    const lines = [`悟道点 ${this.sect.resources.insight}  声望 ${this.sect.resources.prestige}`, '选择阵法学习：']
    const options: { label: string; value: string }[] = []
    for (const f of available) {
      const can = this.sect.resources.insight >= f.insightCost && this.sect.resources.prestige >= f.prestigeCost
      lines.push(`${f.name}（${FORMATION_TYPE_NAMES[f.type]}）${f.desc} 悟道×${f.insightCost} 声望×${f.prestigeCost}${can ? '' : '（不足）'}`)
      options.push({ label: f.name, value: f.id })
    }
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('学习阵法', lines, options)
    if (result && result !== 'back') {
      const f = FORMATION_MAP.get(result)
      if (f && this.sect.resources.insight >= f.insightCost && this.sect.resources.prestige >= f.prestigeCost) {
        this.sect.resources.insight -= f.insightCost
        this.sect.resources.prestige -= f.prestigeCost
        this.state.formations.push(f.id)
        saveGame(this.state)
        sfx('sfx_levelup')
        toast(`学会了 ${f.name}！`, '#a78bfa')
        this.updateResourceDisplay()
      } else {
        toast('资源不足', '#f87171')
      }
    }
    input.clearQueues()
  }

  private async deployFormation() {
    input.clearQueues()
    if (this.state.formations.length === 0) {
      toast('尚未学会任何阵法', '#f87171')
      input.clearQueues()
      return
    }

    const lines = ['选择要部署的阵法（下次秘境生效）：', '']
    const options: { label: string; value: string }[] = []
    for (const fid of this.state.formations) {
      const f = FORMATION_MAP.get(fid)
      if (!f) continue
      const ready = isFormationReady(this.state.formationLastUse, fid)
      lines.push(`${f.name}（${FORMATION_TYPE_NAMES[f.type]}）${f.desc}${ready ? '' : '（冷却中）'}`)
      options.push({ label: `${f.name}${ready ? '' : '（冷却）'}`, value: fid })
    }
    options.push({ label: '取消部署', value: 'cancel' })
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('部署阵法', lines, options)
    if (result && result !== 'back' && result !== 'cancel') {
      const f = FORMATION_MAP.get(result)
      if (f && isFormationReady(this.state.formationLastUse, result)) {
        this.state.activeFormation = result
        toast(`已部署 ${f.name}，下次进入秘境生效`, '#a78bfa')
        saveGame(this.state)
      } else {
        toast('阵法冷却中', '#f87171')
      }
    } else if (result === 'cancel') {
      this.state.activeFormation = null
      toast('已取消阵法部署', '#94a3b8')
      saveGame(this.state)
    }
    input.clearQueues()
  }

  // ===== 弟子晋升体系 =====

  private async openPromotionPanel(d: Disciple) {
    input.clearQueues()
    const curRank = DISCIPLE_RANKS[d.rank]
    const nextRank = DISCIPLE_RANKS[d.rank + 1]
    const can = canPromote(d)

    const lines = [
      `${d.name}  当前职位：${rankName(d)}`,
      curRank.desc,
    ]

    if (nextRank) {
      lines.push('', `下一职位：${nextRank.name}`)
      lines.push(`需要境界：${REALM_NAMES[nextRank.minRealm]}（当前 ${REALM_NAMES[d.realm]}）`)
      lines.push(`需要忠诚：${nextRank.minLoyalty}（当前 ${d.loyalty}）`)
      lines.push(nextRank.desc)
    } else {
      lines.push('', '已达最高职位')
    }

    if (d.rank >= 2 && d.role) {
      lines.push('', `当前职务：${DISCIPLE_ROLES.find(r => r.id === d.role)?.name ?? d.role}`)
    }

    const options: { label: string; value: string }[] = []
    if (can && nextRank) {
      options.push({ label: `晋升为${nextRank.name}`, value: 'promote' })
    }
    if (d.rank >= 2) {
      options.push({ label: '管理职务', value: 'role' })
    }
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('弟子晋升', lines, options)

    if (result === 'promote') {
      promoteDisciple(d)
      d.loyalty = Math.min(100, d.loyalty + 5)
      sfx('sfx_levelup')
      toast(`${d.name} 晋升为 ${rankName(d)}！`, '#fbbf24')
      saveGame(this.state)
      await this.openPromotionPanel(d)
    } else if (result === 'role') {
      await this.assignRole(d)
    } else {
      input.clearQueues()
    }
  }

  private async assignRole(d: Disciple) {
    input.clearQueues()
    const availableRoles = DISCIPLE_ROLES.filter(r => {
      if (d.rank < 2) return false
      if (d.rank < 3 && (r.id === 'instructor' || r.id === 'array_master')) return false
      const otherD = this.state.disciples.find(x => x.role === r.id && x.uid !== d.uid)
      return !otherD
    })

    if (availableRoles.length === 0) {
      toast('暂无可分配的职务（可能已被其他弟子担任）', '#f0c987')
      input.clearQueues()
      return
    }

    const lines = ['选择管理职务：', '']
    const options: { label: string; value: string }[] = []
    for (const r of availableRoles) {
      lines.push(`${r.name}：${r.desc}`)
      options.push({ label: r.name, value: r.id })
    }
    if (d.role) {
      options.push({ label: '卸任', value: 'remove' })
    }
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('管理职务', lines, options)
    if (result && result !== 'back') {
      if (result === 'remove') {
        d.role = null
        toast(`${d.name} 已卸任`, '#94a3b8')
      } else {
        d.role = result
        const role = DISCIPLE_ROLES.find(r => r.id === result)
        toast(`${d.name} 担任 ${role?.name ?? result}`, '#fbbf24')
      }
      saveGame(this.state)
      await this.openPromotionPanel(d)
    } else {
      input.clearQueues()
    }
  }

  // ===== 仇人名录 =====

  private async openRevengeList() {
    input.clearQueues()
    const targets = (this.sect.revengeTargets ?? []).filter(t => !t.resolved)

    if (targets.length === 0) {
      await showDialog('仇人名录', ['目前没有待报仇的仇人。'], [{ label: '关闭', value: 'close' }])
      input.clearQueues()
      return
    }

    const lines: string[] = ['—— 仇人名录 ——', '']
    const options: { label: string; value: string }[] = []

    for (const t of targets) {
      const typeLabel = t.attackerType === 'bandit' ? '盗匪' : t.attackerType === 'demon' ? '魔修' : t.attackerType === 'beast' ? '妖兽' : '邪修'
      const eventLabel = t.eventType === 'killed' ? '杀害' : '袭击'
      lines.push(`${t.attackerName}（${typeLabel}·${REALM_NAMES[t.attackerRealm]}）`)
      lines.push(`  战力约${t.attackerPower}，${eventLabel}弟子「${t.victimName}」`)
      lines.push(`  时间：${new Date(t.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`)
      lines.push('')
      options.push({ label: `追杀${t.attackerName}`, value: t.id })
    }

    options.push({ label: '关闭', value: 'close' })

    const result = await showDialog('仇人名录', lines, options)
    if (result !== 'close' && result) {
      const target = targets.find(t => t.id === result)
      if (target) {
        const ambush: AmbushEvent = {
          attackerName: target.attackerName,
          attackerType: target.attackerType,
          attackerRealm: target.attackerRealm,
          attackerPower: target.attackerPower,
          result: target.eventType === 'killed' ? 'killed' : 'injured',
          damage: 0,
          lootLost: {},
        }
        await this.startRevengeBattle(target.attackerName, ambush)
      }
    }
    input.clearQueues()
  }

  // ===== 外交系统 =====

  private async openDiplomacyPanel() {
    input.clearQueues()
    const aiSects = this.state.aiSects ?? []
    if (aiSects.length === 0 || aiSects.every(a => a.defeated)) {
      toast('周边暂无势力', '#f0c987')
      input.clearQueues()
      return
    }

    const buildingCount = Object.values(this.sect.buildings).filter(v => v > 0).length
    const playerPower = Math.floor((200 + this.sect.level * 80 + buildingCount * 50 + this.state.disciples.length * 30) * 1.0)

    const lines = [
      `我方宗门战力 ${playerPower}`,
      `灵石 ${this.sect.resources.stone}  声望 ${this.sect.resources.prestige}`,
      '选择势力交涉：',
    ]
    const options: { label: string; value: string }[] = []
    for (let i = 0; i < aiSects.length; i++) {
      const ai = aiSects[i]
      if (ai.defeated) continue
      const status = getDiplomacyStatus(ai.relationValue, ai.atWar, ai.alliance, ai.vassalOf)
      const statusName = diplomacyStatusName(status)
      options.push({ label: `${ai.name} Lv.${ai.level} ${statusName}`, value: 'ai_' + i })
    }
    options.push({ label: '关闭', value: 'close' })

    const hasVassals = aiSects.some(a => !a.defeated && a.vassalOf === 'player')
    if (hasVassals) {
      options.splice(options.length - 1, 0, { label: '附庸管理', value: 'vassal_mgr' })
    }
    options.splice(options.length - 1, 0, { label: '宗门通商', value: 'trade' })

    const result = await showDialog('外交 · 势力列表', lines, options)
    if (result === 'trade') {
      await this.openTradePanel()
    } else if (result === 'vassal_mgr') {
      await this.openVassalPanel()
    } else if (result && result.startsWith('ai_')) {
      const idx = parseInt(result.slice(3))
      const ai = aiSects[idx]
      if (ai) await this.diplomacyWithAi(ai, playerPower)
    } else {
      input.clearQueues()
    }
  }

  private async openVassalPanel() {
    input.clearQueues()
    const aiSects = this.state.aiSects ?? []
    const vassals = aiSects.filter(a => !a.defeated && a.vassalOf === 'player')

    if (vassals.length === 0) {
      toast('当前无附庸宗门', '#f0c987')
      input.clearQueues()
      return
    }

    const lines = [
      `附庸宗门 ${vassals.length} 个`,
      `每 5 分钟进贡资源`,
      '选择附庸查看详情：',
    ]
    const options: { label: string; value: string }[] = []
    for (let i = 0; i < vassals.length; i++) {
      const v = vassals[i]
      options.push({ label: `${v.name} 战力${v.power} 进贡${Math.floor((v.tributeRate || 0.2) * 100)}%`, value: 'v_' + i })
    }
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('附庸管理', lines, options)
    if (result && result.startsWith('v_')) {
      const idx = parseInt(result.slice(2))
      const v = vassals[idx]
      if (v) await this.vassalDetail(v)
    } else {
      input.clearQueues()
    }
  }

  private async openTradePanel() {
    input.clearQueues()
    if (Date.now() < this.state.sectTradeCooldown) {
      const remain = Math.ceil((this.state.sectTradeCooldown - Date.now()) / 1000)
      toast(`通商冷却中，还需 ${remain} 秒`, '#f0c987')
      input.clearQueues()
      return
    }

    const offer = generateTradeOffer(this.rng, this.sect.level)
    const r = this.sect.resources
    const canTrade = r[offer.giveResource] >= offer.giveAmount

    const giveName: Record<string, string> = { stone: '灵石', herb: '灵草', ore: '矿石', wood: '木材', insight: '悟道点', prestige: '声望' }
    const recvName = giveName

    const lines = [
      '今日通商方案：',
      `付出：${giveName[offer.giveResource]}×${offer.giveAmount}（当前 ${r[offer.giveResource]}）`,
      `获得：${recvName[offer.receiveResource]}×${offer.receiveAmount}（当前 ${r[offer.receiveResource]})`,
      canTrade ? '资源充足' : '资源不足！',
    ]

    const options: { label: string; value: string }[] = [
      { label: canTrade ? '执行通商' : '资源不足', value: 'trade' },
      { label: '放弃', value: 'cancel' },
    ]

    const result = await showDialog('宗门通商', lines, options)
    if (result === 'trade' && canTrade) {
      (r as any)[offer.giveResource] -= offer.giveAmount
      ;(r as any)[offer.receiveResource] += offer.receiveAmount
      this.state.sectTradeCooldown = Date.now() + 1800000 // 30分钟冷却
      sfx('sfx_pickup')
      toast('通商成功！资源已更新', '#34d399')
      saveGame(this.state)
      this.updateResourceDisplay()
    }
    input.clearQueues()
  }

  private async vassalDetail(ai: AiSect) {
    input.clearQueues()
    const tributeRate = Math.floor((ai.tributeRate || 0.2) * 100)
    const rebelPct = Math.floor(ai.rebellionChance * 100)

    const lines = [
      `${ai.name}（附庸）`,
      `战力 ${ai.power} / 原始 ${ai.originalPower}`,
      `弟子 ${ai.discipleCount}  等级 Lv.${ai.level}`,
      `进贡率 ${tributeRate}%`,
      `叛乱风险 ${rebelPct}%`,
      `资源：灵石${ai.resources.stone} 灵草${ai.resources.herb} 矿石${ai.resources.ore} 木材${ai.resources.wood}`,
    ]

    const options: { label: string; value: string }[] = [
      { label: '释放附庸（恢复独立）', value: 'release' },
      { label: '返回', value: 'back' },
    ]

    const result = await showDialog('附庸详情', lines, options)

    if (result === 'release') {
      ai.vassalOf = null
      ai.tributeRate = 0
      ai.rebellionChance = 0
      ai.relationValue = 0
      ai.atWar = false
      sfx('sfx_click')
      toast(`已释放 ${ai.name}`, '#94a3b8')
      saveGame(this.state)
    }
    input.clearQueues()
  }

  private async diplomacyWithAi(ai: AiSect, playerPower: number) {
    input.clearQueues()
    const status = getDiplomacyStatus(ai.relationValue, ai.atWar, ai.alliance, ai.vassalOf)
    const statusName = diplomacyStatusName(status)
    const disp = dispositionDesc(ai.disposition)

    const lines = [
      `${ai.name}（Lv.${ai.level}）`,
      `战力 ${ai.power}  弟子 ${ai.discipleCount}  性格 ${disp}`,
      `外交值 ${ai.relationValue}  关系：${statusName}`,
      ai.vassalOf === 'player'
        ? `附庸 | 进贡${Math.floor((ai.tributeRate || 0.2) * 100)}% | 叛乱风险${Math.floor(ai.rebellionChance * 100)}%`
        : ai.atWar ? `战争疲劳 ${ai.warExhaustion}` : ai.alliance ? '同盟关系' : ai.tradeAgreement ? '通商中' : '',
    ]

    const options: { label: string; value: string }[] = []

    if (ai.vassalOf === 'player') {
      options.push({ label: '派遣使者（改善关系）', value: 'send_envoy' })
      options.push({ label: '释放附庸', value: 'release_vassal' })
      if (ai.rebellionChance > 0.15) {
        options.push({ label: '镇压威慑（消耗灵石）', value: 'suppress' })
      }
    } else {
      options.push({ label: '派遣使者', value: 'send_envoy' })
      options.push({ label: '斥候侦查', value: 'scout' })
      if (!ai.tradeAgreement && !ai.atWar) options.push({ label: '提议通商', value: 'propose_trade' })
      if (!ai.alliance && !ai.atWar && ai.relationValue >= 50) options.push({ label: '提议结盟', value: 'propose_alliance' })
      if (!ai.atWar && ai.relationValue < -30) options.push({ label: '宣战', value: 'declare_war' })
      if (ai.atWar) {
        options.push({ label: '宗门决战', value: 'sect_war' })
        options.push({ label: '签订和约', value: 'sign_peace' })
      }
      if (!ai.atWar && !ai.alliance && ai.relationValue < 0) options.push({ label: '要求进贡', value: 'request_tribute' })
    }
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog(ai.name, lines, options)

    if (result === 'sect_war') {
      // 塔防战模式
      input.clearQueues()
      this.cameras.main.fadeOut(400, 0, 0, 0)
      this.time.delayedCall(420, () => {
        this.scene.start('SectWar', { state: this.state, enemySect: ai, isDefense: true })
      })
      onSectWarWon(this.state)
      checkAchievements(this.state)
      this.time.delayedCall(500, () => {
        tryCompleteQuest(this.state)
      })
    } else if (result === 'release_vassal') {
      ai.vassalOf = null
      ai.tributeRate = 0
      ai.rebellionChance = 0
      ai.relationValue = 0
      ai.atWar = false
      sfx('sfx_click')
      toast(`已释放 ${ai.name}`, '#94a3b8')
      saveGame(this.state)
      input.clearQueues()
    } else if (result === 'suppress') {
      const cost = 300
      if (this.sect.resources.stone < cost) {
        toast('灵石不足，无法镇压', '#f87171')
        input.clearQueues()
      } else {
        this.sect.resources.stone -= cost
        ai.rebellionChance = Math.max(0, ai.rebellionChance - 0.1)
        ai.relationValue = Math.max(-100, ai.relationValue - 5)
        sfx('sfx_hit')
        toast(`镇压 ${ai.name}，叛乱风险降至 ${Math.floor(ai.rebellionChance * 100)}%`, '#fbbf24')
        saveGame(this.state)
        input.clearQueues()
      }
    } else if (result && result !== 'back') {
      await executeDiplomacy(this.state, ai, result as any)
      onDiplomacyAction(this.state)
      this.time.delayedCall(500, () => {
        tryCompleteQuest(this.state)
      })
    } else {
      input.clearQueues()
    }
  }

  /** 宗门随机事件 */
  private triggerSectEvent() {
    const events = [
      'spirit_vein_surge',   // 灵脉涌动
      'disciple_enlightenment', // 弟子顿悟
      'wandering_cultivator',   // 游方修士到访
      'treasure_find',          // 弟子发现宝物
      'spirit_beast_invasion',  // 灵兽闯入
      'sect_aura_rise',         // 宗门气运提升
    ]
    const eventId = events[Math.floor(this.rng() * events.length)]
    const sect = this.sect

    switch (eventId) {
      case 'spirit_vein_surge': {
        const bonus = Math.floor((sect.buildings.spirit_vein ?? 0) * 50 + 100)
        sect.resources.stone += bonus
        sfx('sfx_spirit_vein', 0.5)
        toast(`灵脉涌动！获得灵石 +${bonus}`, '#fbbf24')
        break
      }
      case 'disciple_enlightenment': {
        const idle = this.state.disciples.filter(d => d.status === 'cultivating')
        if (idle.length > 0) {
          const d = idle[Math.floor(this.rng() * idle.length)]
          const expGain = d.expToNext * 0.3
          d.exp += Math.floor(expGain)
          sfx('sfx_enlightenment', 0.5)
          toast(`${d.name} 顿悟天道！获得经验 +${Math.floor(expGain)}`, '#60a5fa')
        } else {
          const insight = 3 + sect.level
          sect.resources.insight += insight
          sfx('sfx_enlightenment', 0.4)
          toast(`宗门气运流转，悟道点 +${insight}`, '#60a5fa')
        }
        break
      }
      case 'wandering_cultivator': {
        if (this.state.disciples.length < discipleCapacity(sect.buildings.disciple_room ?? 0) && Date.now() > sect.recruitCooldown) {
          this.sect.recruitCandidate = generateDisciple(this.rng, sect.level)
          sfx('sfx_wandering_cultivator', 0.5)
          toast('有游方修士叩访山门，可往弟子堂招募', '#34d399')
        } else {
          const stone = 200 + sect.level * 50
          sect.resources.stone += stone
          sfx('sfx_wandering_cultivator', 0.4)
          toast(`游方修士留下谢礼，灵石 +${stone}`, '#fbbf24')
        }
        break
      }
      case 'treasure_find': {
        const idle = this.state.disciples.filter(d => d.status === 'idle' || d.status === 'cultivating')
        if (idle.length > 0) {
          const d = idle[Math.floor(this.rng() * idle.length)]
          const oreGain = 30 + sect.level * 10
          const woodGain = 20 + sect.level * 8
          sect.resources.ore += oreGain
          sect.resources.wood += woodGain
          d.loyalty = Math.min(100, d.loyalty + 5)
          sfx('sfx_treasure_find', 0.5)
          toast(`${d.name} 在后山发现矿脉，矿石 +${oreGain} 木材 +${woodGain}`, '#a78bfa')
        } else {
          // 全员在外奔波，给宗门一笔小保底收益
          const stone = 20 + sect.level * 5
          sect.resources.stone += stone
          toast(`弟子们皆在外奔波，意外收获了一些灵石 +${stone}`, '#a78bfa')
        }
        break
      }
      case 'spirit_beast_invasion': {
        const defense = (sect.buildings.guard_array ?? 0) * 20 + this.state.disciples.length * 10
        if (defense > 50) {
          const prestige = 5 + sect.level
          sect.resources.prestige += prestige
          sfx('sfx_spirit_beast', 0.5)
          toast(`灵兽闯入山门，弟子合力击退！声望 +${prestige}`, '#f87171')
        } else {
          const loss = Math.min(sect.resources.stone, 100)
          sect.resources.stone -= loss
          sfx('sfx_spirit_beast', 0.6)
          toast(`灵兽闯入山门，损失灵石 ${loss}。建议建造护山大阵`, '#f87171')
        }
        break
      }
      case 'sect_aura_rise': {
        for (const d of this.state.disciples) {
          d.loyalty = Math.min(100, d.loyalty + 3)
        }
        const prestige = 3 + Math.floor(sect.level / 2)
        sect.resources.prestige += prestige
        sfx('sfx_aura_rise', 0.5)
        toast(`宗门气运提升，弟子忠诚度上升，声望 +${prestige}`, '#e8c86a')
        break
      }
    }
    saveGame(this.state)
    this.updateResourceDisplay()
  }

  private exitSect() {
    if (this.transitioning) return
    input.clearQueues()
    this.transitioning = true
    sfx('sfx_portal')
    saveGame(this.state)
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.time.delayedCall(420, () => this.scene.start('World', { fromScene: 'sect' }))
  }
}
