// ---------- 大地图场景 · 南域 ----------

import Phaser from 'phaser'
import { Player } from '../entities'
import { input } from '../input'
import { makeRng, randInt } from '../core'
import { saveGame, loadSaveSlot, type GameState } from '../state'
import { toast, showDialog, dialogOpen, panelOpen, setFloorText, updateHUD, setSettingsCallbacks } from '../ui'
import { BGM_TOWN, playBgm, sfx, stopBgm } from '../audio'
import { WORLD_MAP_W, WORLD_MAP_H, getPoint, isPointUnlocked, getTeleportTargets, getDomainPoints, getDomainDef, type WorldPoint, type DomainId } from '../world-map'
import { advanceTime, formatTime, isDaytime, type WorldTime } from '../world-time'
import { rollWorldEvent, type WorldEvent, type WorldEventChoice } from '../world-events'
import { createNewSect, SECT_FOUND_COST, SECT_FOUND_REALM } from '../sect-data'
import { initNpcStates, updateNpcGrowth } from '../npc-system'
import { generateAiSect, generateResourceNodes, getDiplomacyStatus, diplomacyStatusName, dispositionDesc, type AiSect, type ResourceNode } from '../ai-sect-data'
import { tickAllAiSects, processTradeIncome, processResourceIncome, executeDiplomacy, attackResourceNode, launchSectWar } from '../diplomacy'
import { tryCompleteQuest, initMainQuest, onSectEstablished, getQuestHudText } from '../storyline-system'

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
  private moveAccumulator = 0
  private eventActive = false
  private transitioning = false
  private lastTickMs = 0
  private rng!: Rng
  private miniMap!: Phaser.GameObjects.Graphics
  private miniMapBg!: Phaser.GameObjects.Rectangle
  private resourceCooldowns: Record<string, number> = {} // pointId → timestamp
  private npcGrowTimer = 0
  private aiSectMarkers: { id: string; container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text }[] = []
  private resourceNodeMarkers: { id: string; container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text }[] = []
  private diplomacyTimer = 0
  private _lastTarget: string | null = null
  private currentDomain: DomainId = 'south'

  constructor() { super('World') }

  create(data?: { fromScene?: string }) {
    this.state = this.registry.get('state')
    this.worldTime = this.state.worldTime
    this.rng = makeRng(Date.now() % 2147483647)
    this.transitioning = false
    this.eventActive = false
    this.moveAccumulator = this.state.worldEventCooldown || 0
    this.lastTickMs = this.time.now

    playBgm(BGM_TOWN) // 复用城镇 BGM
    this.currentDomain = (this.state.worldDomain as DomainId) || 'south'
    const domainDef = getDomainDef(this.currentDomain)
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
    document.getElementById('controls')!.style.display = 'block'
    document.getElementById('btnAct')!.style.display = 'flex'
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
    })

    this.physics.world.setBounds(0, 0, WORLD_MAP_W, WORLD_MAP_H)
    this.cameras.main.setBounds(0, 0, WORLD_MAP_W, WORLD_MAP_H)
    this.cameras.main.setBackgroundColor(domainDef ? `#${domainDef.bgTint.toString(16).padStart(6, '0')}` : '#1a2b20')

    this.renderMap()

    // 玩家
    const px = this.state.worldPlayerX || 600
    const py = this.state.worldPlayerY || 1350
    this.player = new Player(this, px, py, this.state.classId)
    this.player.sprite.setCollideWorldBounds(true)
    this.player.sprite.setScale(0.55)
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1)

    // 点位标记
    this.renderPoints()

    // AI 宗门和资源点标记
    this.renderAiSects()
    this.renderResourceNodes()

    // 交互提示文字
    this.promptText = this.add.text(180, 580, '', { fontSize: '12px', color: '#f0d98c', stroke: '#000', strokeThickness: 3, align: 'center' })
      .setOrigin(0.5).setDepth(100).setScrollFactor(0).setVisible(false)

    // 时间显示
    this.timeText = this.add.text(180, 18, '', { fontSize: '10px', color: '#a3e4d7', stroke: '#000', strokeThickness: 2, align: 'center' })
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
  }

  private renderMap() {
    // 程序化绘制地形背景
    const rt = this.add.renderTexture(0, 0, WORLD_MAP_W, WORLD_MAP_H).setOrigin(0).setDepth(0)
    const domainDef = getDomainDef(this.currentDomain)
    const baseTint = domainDef?.bgTint ?? 0x1a3b2a
    const darkTint = (baseTint & 0xfefefe) >> 1
    const lightTint = Math.min(0xffffff, baseTint + 0x101010)

    // 基础草地
    const grassTile = this.textures.exists('grass') ? 'grass' : null
    const stoneTile = this.textures.exists('stone') ? 'stone' : null

    const tileSize = 32
    for (let y = 0; y < WORLD_MAP_H; y += tileSize) {
      for (let x = 0; x < WORLD_MAP_W; x += tileSize) {
        const distFromCenter = Math.hypot(x - WORLD_MAP_W / 2, y - WORLD_MAP_H / 2)
        const noise = Math.sin(x * 0.01) * Math.cos(y * 0.013) * 30 + Math.sin(x * 0.03 + y * 0.02) * 15

        if (grassTile) {
          if (distFromCenter > 600 + noise) {
            rt.draw(stoneTile || grassTile, x + tileSize / 2, y + tileSize / 2)
            const shade = this.add.rectangle(x + tileSize / 2, y + tileSize / 2, tileSize, tileSize, darkTint, 0.35)
            shade.setDepth(0.1).setOrigin(0.5)
          } else {
            rt.draw(grassTile, x + tileSize / 2, y + tileSize / 2)
          }
        } else {
          const color = distFromCenter > 600 + noise ? darkTint : lightTint
          const r = this.add.rectangle(x + tileSize / 2, y + tileSize / 2, tileSize, tileSize, color)
          r.setOrigin(0.5).setDepth(0)
        }
      }
    }

    // 河流（从北到南蜿蜒）
    this.drawRiver(rt)

    // 地图边界（山脉围栏）
    const border = this.add.graphics().setDepth(1)
    border.lineStyle(4, darkTint, 0.6)
    border.strokeRect(0, 0, WORLD_MAP_W, WORLD_MAP_H)
  }

  private drawRiver(rt: Phaser.GameObjects.RenderTexture) {
    const g = this.add.graphics().setDepth(0.2)
    g.fillStyle(0x2a5a6a, 0.5)
    g.beginPath()
    g.moveTo(0, 200)
    for (let y = 0; y < WORLD_MAP_H; y += 20) {
      const x = 500 + Math.sin(y * 0.008) * 120 + Math.sin(y * 0.03) * 40
      g.lineTo(x - 25, y)
      g.lineTo(x + 25, y + 20)
    }
    g.lineTo(0, WORLD_MAP_H)
    g.closePath()
    g.fillPath()

    // 河流亮色
    const g2 = this.add.graphics().setDepth(0.25)
    g2.fillStyle(0x4a8a9a, 0.35)
    g2.beginPath()
    for (let y = 0; y < WORLD_MAP_H; y += 20) {
      const x = 500 + Math.sin(y * 0.008) * 120 + Math.sin(y * 0.03) * 40
      g2.fillRect(x - 15, y, 30, 20)
    }
  }

  private renderPoints() {
    for (const p of getDomainPoints(this.currentDomain)) {
      const unlocked = isPointUnlocked(p, this.state)
      const discovered = this.state.discoveredPoints.includes(p.id)

      // 已解锁但未发现的点位在靠近时自动发现
      const visible = unlocked && (discovered || this.isNearby(p))

      if (!visible && !discovered) continue

      // 发现新点位
      if (visible && !discovered) {
        this.state.discoveredPoints.push(p.id)
      }

      const container = this.createPointMarker(p, !unlocked)
      container.setDepth(3)
      this.pointObjects.set(p.id, container)

      // 点位名称
      const label = this.add.text(p.x, p.y - 28, p.name, {
        fontSize: '11px',
        color: unlocked ? '#f0d98c' : '#666',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(4)

      if (!unlocked) label.setAlpha(0.4)
    }
  }

  private createPointMarker(p: WorldPoint, locked: boolean): Phaser.GameObjects.Container {
    const g = this.add.graphics()
    const colors: Record<string, number> = {
      home: 0x48e08a, city: 0xffd54a, dungeon: 0xff6b6b,
      dungeon_xian: 0xaf7ac5, resource: 0x5dade2,
      teleport: 0xbb8fce, landmark: 0xf0c987,
      sect: 0xfbbf24, domain_gate: 0x60a5fa,
    }
    const color = colors[p.type] || colors[p.icon] || 0xffffff

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

      const status = ai.atWar ? '⚔' : ai.alliance ? '★' : ai.tradeAgreement ? '◆' : ''
      const label = this.add.text(ai.mapX, ai.mapY - 30, `${ai.name}${status}`, {
        fontSize: '10px', color: `#${ai.color.toString(16).padStart(6, '0')}`,
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(4)

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
      const g = this.add.graphics()
      g.fillStyle(color, 0.12)
      g.fillCircle(0, 0, 18)
      g.lineStyle(1.5, color, 0.7)
      g.strokeCircle(0, 0, 10)
      g.fillStyle(color, 0.9)
      g.fillCircle(0, 0, 3)

      const container = this.add.container(node.x, node.y, [g]).setDepth(2.5)
      this.tweens.add({ targets: g, alpha: 0.5, duration: 1200, yoyo: true, repeat: -1 })

      const ownerTag = node.ownerId === 'player' ? '[我]' : node.ownerId ? '[敌]' : '[无主]'
      const label = this.add.text(node.x, node.y - 20, `${typeIcons[node.type]}${ownerTag}`, {
        fontSize: '8px', color: `#${color.toString(16).padStart(6, '0')}`,
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(3)

      this.resourceNodeMarkers.push({ id: node.id, container, label })
    }
  }

  private createMiniMap() {
    const mmW = 80, mmH = 112
    const mmX = 360 - mmW - 10
    const mmY = 40

    this.miniMapBg = this.add.rectangle(mmX + mmW / 2, mmY + mmH / 2, mmW + 4, mmH + 4, 0x000000, 0.6)
      .setOrigin(0.5).setDepth(90).setScrollFactor(0)

    this.miniMap = this.add.graphics().setDepth(91).setScrollFactor(0)

    // 绘制小地图上的点位
    const scaleX = mmW / WORLD_MAP_W
    const scaleY = mmH / WORLD_MAP_H
    this.miniMap.clear()
    this.miniMap.fillStyle(0x1a2b20, 0.8)
    this.miniMap.fillRect(mmX, mmY, mmW, mmH)

    for (const p of getDomainPoints(this.currentDomain)) {
      if (!this.state.discoveredPoints.includes(p.id)) continue
      const colors: Record<string, number> = {
        home: 0x48e08a, city: 0xffd54a, dungeon: 0xff6b6b,
        dungeon_xian: 0xaf7ac5, resource: 0x5dade2,
        teleport: 0xbb8fce, landmark: 0xf0c987,
        sect: 0xfbbf24, domain_gate: 0x60a5fa,
      }
      this.miniMap.fillStyle(colors[p.type] || colors[p.icon] || 0xffffff, 0.9)
      this.miniMap.fillCircle(mmX + p.x * scaleX, mmY + p.y * scaleY, 2)
    }

    // 玩家位置
    this.miniMap.fillStyle(0xffffff, 1)
    this.miniMap.fillCircle(mmX + (this.state.worldPlayerX || 600) * scaleX, mmY + (this.state.worldPlayerY || 1350) * scaleY, 2.5)
  }

  private updateMiniMap() {
    const mmW = 80, mmH = 112
    const mmX = 360 - mmW - 10
    const mmY = 40
    const scaleX = mmW / WORLD_MAP_W
    const scaleY = mmH / WORLD_MAP_H

    this.miniMap.clear()
    this.miniMap.fillStyle(0x1a2b20, 0.8)
    this.miniMap.fillRect(mmX, mmY, mmW, mmH)

    for (const p of getDomainPoints(this.currentDomain)) {
      if (!this.state.discoveredPoints.includes(p.id)) continue
      const colors: Record<string, number> = {
        home: 0x48e08a, city: 0xffd54a, dungeon: 0xff6b6b,
        dungeon_xian: 0xaf7ac5, resource: 0x5dade2,
        teleport: 0xbb8fce, landmark: 0xf0c987,
        sect: 0xfbbf24, domain_gate: 0x60a5fa,
      }
      this.miniMap.fillStyle(colors[p.type] || colors[p.icon] || 0xffffff, 0.9)
      this.miniMap.fillCircle(mmX + p.x * scaleX, mmY + p.y * scaleY, 2)
    }

    this.miniMap.fillStyle(0xffffff, 1)
    this.miniMap.fillCircle(mmX + this.player.sprite.x * scaleX, mmY + this.player.sprite.y * scaleY, 2.5)
  }

  update(time: number, delta: number) {
    if (this.transitioning || this.eventActive || panelOpen() || dialogOpen()) {
      this.player.sprite.setVelocity(0, 0)
      return
    }

    // 世界时间推进
    this.worldTime = advanceTime(this.worldTime, delta)
    this.state.worldTime = this.worldTime
    this.updateTimeDisplay()

    // 输入
    input.poll()
    const mx = input.move.x
    const my = input.move.y
    const speed = PLAYER_SPEED

    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my) || 1
      this.player.sprite.setVelocity((mx / len) * speed, (my / len) * speed)

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
          this.createMiniMap()
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

    // 优先级：世界点位 > AI宗门 > 资源点
    if (nearest !== this.nearPoint) {
      this.nearPoint = nearest
    }
    const interactTarget = nearest ? 'point' : nearAiSect ? 'ai_sect' : nearResource ? 'resource' : null

    if (interactTarget !== this._lastTarget) {
      this._lastTarget = interactTarget
      if (interactTarget === 'point' && nearest) {
        this.promptText?.setText(`【${nearest.name}】\n点击进入`).setVisible(true)
      } else if (interactTarget === 'ai_sect' && nearAiSect) {
        const status = nearAiSect.atWar ? '交战中' : nearAiSect.alliance ? '同盟' : '外交'
        this.promptText?.setText(`【${nearAiSect.name}】\n${status} · 点击交涉`).setVisible(true)
      } else if (interactTarget === 'resource' && nearResource) {
        const owner = nearResource.ownerId === 'player' ? '已占领' : nearResource.ownerId ? '敌方' : '无主'
        this.promptText?.setText(`【${nearResource.name}】\n${owner} · 点击争夺`).setVisible(true)
      } else {
        this.promptText?.setVisible(false)
      }
    }

    // 检测交互按钮
    if (input.consumeAct()) {
      if (interactTarget === 'point' && this.nearPoint) {
        this.interactWithPoint(this.nearPoint)
      } else if (interactTarget === 'ai_sect' && nearAiSect) {
        this.interactWithAiSect(nearAiSect)
      } else if (interactTarget === 'resource' && nearResource) {
        this.interactWithResourceNode(nearResource)
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

    // NPC 修炼成长（每60秒结算一次）
    this.npcGrowTimer += delta
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
      const alpha = isDaytime(this.worldTime) ? 0 : 0.25
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

    if (result === 'sect_war') {
      await launchSectWar(this.state, ai)
    } else if (result && result !== 'leave') {
      await executeDiplomacy(this.state, ai, result as any)
    } else {
      input.clearQueues()
    }
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
    } else {
      options.push({ label: '查看详情', value: 'info' })
    }
    options.push({ label: '离开', value: 'leave' })

    const result = await showDialog(node.name, lines, options)

    if (result === 'attack') {
      await attackResourceNode(this.state, node, this.state.aiSects ?? [])
      this.renderResourceNodes()
    } else {
      input.clearQueues()
    }
  }

  private async interactWithPoint(p: WorldPoint) {
    if (this.transitioning || this.eventActive) return
    input.clearQueues()

    switch (p.type) {
      case 'home':
        this.transitioning = true
        sfx('sfx_portal')
        saveGame(this.state)
        this.cameras.main.fadeOut(400, 0, 0, 0)
        this.time.delayedCall(420, () => this.scene.start('Town'))
        break
      case 'city':
        this.transitioning = true
        sfx('sfx_portal')
        saveGame(this.state)
        this.registry.set('cityReturnScene', 'World')
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

    // 根据秘境数据进入 DungeonScene
    this.registry.set('dungeonReturnScene', 'World')
    if (dd.region === 'hl') {
      this.scene.start('Dungeon', { mode: 'hl' })
    } else if (dd.region === 'xian') {
      this.scene.start('Dungeon', { floor: dd.startFloor, diff: 'normal', mode: 'xian' })
    } else if (['wanyao', 'tianjian', 'haishi', 'jiaolong', 'guzhan', 'loulan', 'bingyuan', 'shenyuan'].includes(dd.region)) {
      this.scene.start('Dungeon', { floor: dd.startFloor, diff: 'normal', regionOverride: dd.region })
    } else {
      this.scene.start('Dungeon', { floor: dd.startFloor, diff: 'normal' })
    }
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
      toast(`需要达到金丹期（境界${SECT_FOUND_REALM}）方可开宗立派`, '#f87171')
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
      '请为宗门命名：',
    ], [{ label: '开宗立派', value: 'found' }, { label: '容后再议', value: 'cancel' }])

    if (result !== 'found') {
      input.clearQueues()
      return
    }

    // 扣费并创建宗门
    this.state.gold -= SECT_FOUND_COST
    const sectName = this.state.heroName + '之宗'
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
      ...targets.map(t => `${t.name} (${p.description})`),
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
}
