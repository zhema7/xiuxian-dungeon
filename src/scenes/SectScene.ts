// ---------- 宗门场景 · 俯视视角 ----------

import Phaser from 'phaser'
import { Player } from '../entities'
import { input } from '../input'
import { saveGame, loadSaveSlot, type GameState } from '../state'
import { toast, showDialog, dialogOpen, panelOpen, setFloorText, updateHUD, setSettingsCallbacks } from '../ui'
import { BGM_TOWN, playBgm, sfx, stopBgm } from '../audio'
import { advanceTime, formatTime, type WorldTime } from '../world-time'
import { makeRng, type EquipItem } from '../core'
import { QUALITY_NAMES } from '../data'
import {
  BUILDINGS, BUILDING_IDS, buildingUpgradeCost, canUpgradeBuilding,
  spiritVeinProduction, spiritFarmProduction, oreMineProduction, woodPavilionProduction, discipleCapacity,
  type BuildingId, type SectData, type SectResources,
} from '../sect-data'
import {
  generateDisciple, cultivationSpeed, expToNextRealm,
  questSuccessRate, retreatCost, RETREAT_DURATION,
  GUIDANCE_COOLDOWN, GUIDANCE_EXP,
  effectiveStats, disciplePower, sparDisciples, SPAR_COOLDOWN,
  DISCIPLE_RANKS, DISCIPLE_ROLES, canPromote, promoteDisciple, rankName,
  SPIRIT_ROOTS, TALENTS, REALM_NAMES, SECT_QUESTS,
  type Disciple, type DiscipleRealm, type SectQuest,
} from '../disciple-data'
import {
  PILL_RECIPES, FORGE_RECIPES, CROPS, TECHS, TECH_IDS,
  alchemySuccess, generateForgedEquipment, techUpgradeCost,
  getTeachableSkills, canLearnSkill, getTechMultipliers,
  type PillRecipe, type ForgeRecipe, type TechDef, type CropDef, type TechId,
} from '../sect-production'
import { initNpcStates, updateNpcGrowth, talkToNpc, getLocationNpcs, type NpcDef, type NpcState } from '../npc-system'
import { getDiplomacyStatus, diplomacyStatusName, dispositionDesc, type AiSect } from '../ai-sect-data'
import { executeDiplomacy, launchSectWar, tickAllAiSects, processTradeIncome, processResourceIncome, processSectDefense } from '../diplomacy'
import { tryCompleteQuest, onDiplomacyAction, onSectWarWon, getQuestHudText } from '../storyline-system'
import { checkAchievements } from '../achievement-system'
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
const ROWS = 9
const SECT_W = COLS * TILE   // 432
const SECT_H = ROWS * TILE   // 432

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
  private npcSprites: { id: string; sprite: Phaser.Physics.Arcade.Sprite; nameText: Phaser.GameObjects.Text }[] = []
  private nearNpcId: string | null = null
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

  constructor() { super('Sect') }

  create(data?: { fromScene?: string }) {
    this.state = this.registry.get('state')
    if (!this.state.sect) {
      this.scene.start('World')
      return
    }
    this.sect = this.state.sect
    this.worldTime = this.state.worldTime
    this.transitioning = false
    this.lastTickMs = this.time.now
    this.rng = makeRng(Date.now() % 2147483647)
    this.npcGrowTimer = 0
    this.diplomacyTimer = 0

    playBgm(BGM_TOWN)
    setFloorText(`宗门 · ${this.sect.name}`)

    document.getElementById('hud')!.style.display = 'block'
    document.getElementById('controls')!.style.display = 'block'
    document.getElementById('btnAct')!.style.display = 'flex'
    document.getElementById('btnAct')!.textContent = '建造'
    document.getElementById('btnBag')!.style.display = 'flex'
    document.getElementById('btnBag')!.textContent = '弟子'
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
    const py = SECT_H - TILE * 1.5
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

    const questHud = this.add.text(4, 4, getQuestHudText(this.state), {
      fontSize: '8px', color: '#fbbf24', backgroundColor: '#00000088',
      padding: { x: 4, y: 2 },
    }).setOrigin(0, 0).setDepth(10)

    this.time.delayedCall(800, () => {
      tryCompleteQuest(this.state).then(() => {
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

  private renderBuildings() {
    for (const id of BUILDING_IDS) {
      const def = BUILDINGS[id]
      const level = this.sect.buildings[id] ?? 0
      const built = level > 0
      const cx = def.gridX * TILE + TILE / 2
      const cy = def.gridY * TILE + TILE / 2
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

      this.buildingObjs.set(id, { id, name: def.name, level, gx: def.gridX, gy: def.gridY, sprite, label, lvText, placeholder })
    }
  }

  private renderNpcs() {
    const npcs = getLocationNpcs(this.state, 'sect')
    // NPC 角色到动画类的映射
    const roleAnimMap: Record<string, string> = {
      sect_elder: 'elder',
      scholar: 'elder',
      alchemist: 'deacon',
      blacksmith: 'deacon',
      arena_master: 'disciple_inner',
      wanderer: 'disciple_outer',
    }

    for (const { def } of npcs) {
      const cx = def.x * TILE + TILE / 2
      const cy = def.y * TILE + TILE / 2

      const animClass = roleAnimMap[def.role] ?? 'disciple_outer'
      const atlasKey = `npc_${animClass}_atlas`
      const animKey = `npc_${animClass}_down_idle`
      const frame0 = `npc_${animClass}_00`

      let sprite: Phaser.Physics.Arcade.Sprite

      if (this.textures.exists(atlasKey) && this.anims.exists(animKey)) {
        // 使用动画精灵
        sprite = this.physics.add.sprite(cx, cy, atlasKey, frame0)
        sprite.setScale(0.6).setImmovable(true).setDepth(3)
        sprite.play(animKey)
      } else {
        // 兜底：静态图
        const tex = this.textures.exists(def.texture) ? def.texture : 'npc_junior'
        sprite = this.physics.add.sprite(cx, cy, tex)
        sprite.setScale(0.5).setImmovable(true).setDepth(3)
      }

      this.physics.add.collider(this.player.sprite, sprite)

      const nameText = this.add.text(cx, cy - 18, def.name, {
        fontSize: '9px', color: '#a3e4d7', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(4)

      this.npcSprites.push({ id: def.id, sprite, nameText })
    }
  }

  private createExitPortal() {
    const cx = TILE / 2 + 4
    const cy = SECT_H - TILE / 2 - 4
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
      this.sect.productionTimer = 0
      this.updateResourceDisplay()
    }

    // 输入
    input.poll()
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
      this.promptText?.setText('【对话】\n点击与 NPC 交流').setVisible(true)
    } else if (!nearNpc && this.nearNpcId) {
      this.nearNpcId = null
    }

    // 检测出口传送阵（NPC 不在出口附近时才检测）
    const exitX = TILE / 2 + 4
    const exitY = SECT_H - TILE / 2 - 4
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

    // 交互按钮
    if (input.consumeAct()) {
      if (this.nearNpcId) {
        talkToNpc(this.state, this.nearNpcId)
      } else if (this.nearBuilding === '__exit') {
        this.exitSect()
      } else if (this.nearBuilding) {
        this.interactBuilding(this.nearBuilding)
      }
    }

    // 弟子面板按钮
    if (input.consumeBag()) {
      this.openDisciplePanel()
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
    for (const d of this.sect.disciples) {
      if (!d.role) continue
      if (d.role === 'quartermaster') stoneBonus += 0.15
      if (d.role === 'herbalist') herbBonus += 0.15
      if (d.role === 'forge_master') oreBonus += 0.15
      if (d.role === 'wood_master') woodBonus += 0.15
    }

    this.sect.resources.stone += Math.floor(sv * rate * stoneBonus)
    this.sect.resources.herb += Math.floor(sf * rate * herbBonus)
    this.sect.resources.ore += Math.floor(om * rate * oreBonus)
    this.sect.resources.wood += Math.floor(wp * rate * woodBonus)
  }

  private updateTimeDisplay() {
    if (this.timeText) this.timeText.setText(formatTime(this.worldTime))
  }

  private updateResourceDisplay() {
    if (!this.resText) return
    const r = this.sect.resources
    this.resText.setText(
      `灵石${r.stone}  草${r.herb}  矿${r.ore}  木${r.wood}  悟${r.insight}  声${r.prestige}`
    )
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

    const cost = buildingUpgradeCost(id, currentLv)
    const r = this.sect.resources
    const canAfford = r.stone >= cost.stone && r.wood >= cost.wood && r.ore >= cost.ore

    const action = currentLv === 0 ? '建造' : `升级至 Lv.${currentLv + 1}`
    const costStr = `灵石 ${cost.stone}  木材 ${cost.wood}  矿石 ${cost.ore}`

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

    r.stone -= cost.stone
    r.wood -= cost.wood
    r.ore -= cost.ore
    this.sect.buildings[id] = currentLv + 1
    if (id === 'main_hall') {
      this.sect.level = currentLv + 1
    }

    sfx('sfx_levelup')
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
    const cap = discipleCapacity(this.sect.buildings.disciple_room ?? 0)
    const list = this.sect.disciples

    if (list.length === 0) {
      const result = await showDialog('弟子管理', [
        `当前弟子：0 / ${cap}`,
        '宗门尚无弟子，可前往弟子房招募。',
      ], [{ label: '前往招募', value: 'recruit' }, { label: '关闭', value: 'close' }])
      if (result === 'recruit') {
        await this.recruitDisciple()
      } else {
        input.clearQueues()
      }
      return
    }

    const lines = [`当前弟子：${list.length} / ${cap}`, '']
    const options: { label: string; value: string }[] = []
    for (let i = 0; i < list.length; i++) {
      const d = list[i]
      const rootName = SPIRIT_ROOTS[d.root].name
      const realmName = REALM_NAMES[d.realm]
      const statusText = d.status === 'idle' ? '空闲' :
        d.status === 'cultivating' ? '修炼中' :
        d.status === 'retreating' ? '闭关中' : '派遣中'
      lines.push(`${i + 1}. ${d.name}  ${rootName}·${realmName}  ${rankName(d)}  ${statusText}`)
      options.push({ label: d.name, value: 'd_' + i })
    }
    if (list.length < cap) {
      options.push({ label: '+ 招募弟子', value: 'recruit' })
    }
    options.push({ label: '关闭', value: 'close' })

    const result = await showDialog('弟子管理', lines, options)
    if (result === 'recruit') {
      await this.recruitDisciple()
    } else if (result && result.startsWith('d_')) {
      const idx = parseInt(result.slice(2))
      if (list[idx]) await this.manageDisciple(list[idx])
    } else {
      input.clearQueues()
    }
  }

  private async recruitDisciple() {
    input.clearQueues()
    const cap = discipleCapacity(this.sect.buildings.disciple_room ?? 0)
    if (this.sect.disciples.length >= cap) {
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
      this.sect.disciples.push(disciple)
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
        saveGame(this.state)
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
    let elderBonus = 0
    let grandElderBonus = 0
    for (const d of this.sect.disciples) {
      if (d.role === 'instructor') instructorBonus = 0.30
      if (d.rank === 4) grandElderBonus = 0.15
    }
    for (const d of this.sect.disciples) {
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
    for (const d of this.sect.disciples) {
      // 闭关结算
      if (d.status === 'retreating' && d.retreatEndTime > 0 && now >= d.retreatEndTime) {
        const expGain = expToNextRealm(d.realm) * 3
        d.exp += expGain
        d.status = 'idle'
        d.retreatEndTime = 0
        this.checkDiscipleBreakthrough(d)
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
    }
  }

  private completeQuest(d: Disciple, quest: SectQuest) {
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
      toast(`${d.name} 完成「${quest.name}」，获得奖励！`, '#34d399')
    } else {
      d.loyalty = Math.max(0, d.loyalty - 5)
      toast(`${d.name} 执行「${quest.name}」失败，忠诚下降`, '#f87171')
    }
    this.updateResourceDisplay()
    saveGame(this.state)
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
      sfx('sfx_levelup')
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
    sfx('sfx_chest')
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
    if (this.sect.disciples.length === 0) {
      toast('宗门暂无弟子', '#f87171')
      return
    }
    // 选择弟子
    const dLines = ['选择弟子：']
    const dOptions: { label: string; value: string }[] = []
    for (let i = 0; i < this.sect.disciples.length; i++) {
      const d = this.sect.disciples[i]
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
    const d = this.sect.disciples[dIdx]
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

    const available = this.sect.disciples.filter(d => d.status === 'idle' && Date.now() > d.sparCooldown)
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
      `${d1.name}（战力${spar.d1Power}） VS ${d2.name}（战力${spar.d2Power}）`,
      ...spar.rounds.slice(0, 6),
      spar.rounds.length > 6 ? `...（共${spar.rounds.length}回合）` : '',
      '',
      `胜者：${spar.winner.name}  经验+${wExp}`,
      `败者：${spar.loser.name}  经验+${lExp}`,
    ].filter(l => l !== '')

    sfx('sfx_hit')
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
    const activePet = beasts.find(b => b.uid === this.state.activePetUid)
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
      const isPet = this.state.activePetUid === b.uid
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
    if (this.state.activePetUid === b.uid) {
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
      this.state.activePetUid = b.uid
      toast(`${b.name} 已设为出战灵兽`, '#c084fc')
      saveGame(this.state)
      await this.manageBeast(b)
    } else if (result === 'unpet') {
      this.state.activePetUid = null
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
      if (this.state.activePetUid === b.uid) this.state.activePetUid = null
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
      const cur = this.state.activePetUid === b.uid ? '（当前）' : ''
      lines.push(`${i + 1}. ${b.name} Lv.${b.level} 攻${b.atk} 防${b.def}${cur}`)
      options.push({ label: `${b.name}${cur}`, value: 'p_' + i })
    }
    options.push({ label: '取消出战', value: 'unpet' })
    options.push({ label: '返回', value: 'back' })

    const result = await showDialog('出战灵兽', lines, options)
    if (result === 'unpet') {
      this.state.activePetUid = null
      toast('已取消出战灵兽', '#94a3b8')
      saveGame(this.state)
    } else if (result && result.startsWith('p_')) {
      const idx = parseInt(result.slice(2))
      const b = beasts[idx]
      if (b) {
        this.state.activePetUid = b.uid
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
      const otherD = this.sect.disciples.find(x => x.role === r.id && x.uid !== d.uid)
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
    const playerPower = Math.floor((200 + this.sect.level * 80 + buildingCount * 50 + this.sect.disciples.length * 30) * 1.0)

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
      `每 tick 进贡资源`,
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
      await launchSectWar(this.state, ai)
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
