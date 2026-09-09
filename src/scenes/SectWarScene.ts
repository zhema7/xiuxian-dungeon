// ---------- 宗门塔防战 ----------
// 进攻方 vs 防守方，弟子参战、法阵加成、策略部署

import Phaser from 'phaser'
import { input } from '../input'
import { saveGame, type GameState } from '../state'
import { toast, showDialog, dialogOpen, panelOpen, resetControls, setFloorText, updateHUD } from '../ui'
import { sfx, playBgm, stopBgm, BGM_SECT_WAR } from '../audio'
import { BUILDINGS, BUILDING_IDS, type SectData, type BuildingId } from '../sect-data'
import { evaluateSectPower } from '../sect-war'
import type { AiSect } from '../ai-sect-data'
import { getDiplomacyStatus, diplomacyStatusName } from '../ai-sect-data'
import { aggregateSectBuffs, type Disciple } from '../disciple-data'
import { FORMATIONS, type FormationDef } from '../formation-data'

const TILE = 32
const COLS = 13
const ROWS = 18
const WAR_W = COLS * TILE  // 416
const WAR_H = ROWS * TILE  // 576

// 路径（敌人行进路线，从顶部到主殿）
const PATH: { x: number; y: number }[] = [
  { x: 6, y: 0 }, { x: 6, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 7 },
  { x: 10, y: 7 }, { x: 10, y: 11 }, { x: 6, y: 11 }, { x: 6, y: 17 },
]

interface TowerUnit {
  sprite: Phaser.GameObjects.Rectangle
  rangeCircle: Phaser.GameObjects.Arc
  hpBar: Phaser.GameObjects.Rectangle
  hp: number
  maxHp: number
  id: string
  name: string
  atk: number
  range: number
  fireRate: number   // ms per shot
  lastFire: number
  gridX: number
  gridY: number
  type: 'building' | 'disciple' | 'formation' | 'player'
}

interface EnemyUnit {
  sprite: Phaser.GameObjects.Rectangle
  hpBar: Phaser.GameObjects.Rectangle
  hp: number
  maxHp: number
  speed: number
  atk: number
  pathIndex: number
  name: string
}

interface Projectile {
  sprite: Phaser.GameObjects.Arc
  target: EnemyUnit | null
  dmg: number
  speed: number
}

export class SectWarScene extends Phaser.Scene {
  private state!: GameState
  private sect!: SectData
  private enemySect!: AiSect
  private isDefense: boolean = true  // true=防守方 false=进攻方

  private towers: TowerUnit[] = []
  private enemies: EnemyUnit[] = []
  private projectiles: Projectile[] = []
  private waveTimer = 0
  private waveIndex = 0
  private totalWaves = 5
  private enemiesPerWave = 8
  private spawnedInWave = 0
  private waveSpawnTimer = 0
  private warOver = false
  private result = ''
  private selectedDisciple: Disciple | null = null
  private placementMode = false
  private ghost: Phaser.GameObjects.Rectangle | null = null
  private infoText!: Phaser.GameObjects.Text
  private warTime = 0

  constructor() { super('SectWar') }

  create(data: { state: GameState; enemySect: AiSect; isDefense: boolean }) {
    this.state = data.state
    this.sect = data.state.sect!
    this.enemySect = data.enemySect
    this.isDefense = data.isDefense

    sfx('sfx_boss_spawn', 0.6)
    playBgm(BGM_SECT_WAR) // 宗门战专属BGM：仙魔血战
    setFloorText(`宗门防御战 · vs ${this.enemySect.name}`)

    document.getElementById('hud')!.style.display = 'block'
  resetControls()
  document.getElementById('btnAct')!.style.display = 'flex'
    document.getElementById('btnAct')!.textContent = '部署'
    document.getElementById('btnBag')!.style.display = 'none'
    document.getElementById('btnAtk')!.style.display = 'none'
    document.getElementById('btnPot')!.style.display = 'none'
    document.getElementById('btnSkill')!.style.display = 'none'
    document.getElementById('btnRetreat')!.style.display = 'flex'
    document.getElementById('btnRetreat')!.textContent = '撤退'

    this.cameras.main.setBackgroundColor('#1a1a2e')
    this.physics.world.setBounds(0, 0, WAR_W, WAR_H)
    this.cameras.main.setBounds(0, 0, WAR_W, WAR_H)

    this.renderMap()
    this.renderPath()
    this.deployAutoTowers()

    this.infoText = this.add.text(WAR_W / 2, 20, '', {
      fontSize: '12px', color: '#fbbf24', stroke: '#000', strokeThickness: 2, align: 'center',
    }).setOrigin(0.5).setDepth(100).setScrollFactor(0)

    this.updateInfoText()
    toast(`${this.isDefense ? '防守' : '进攻'}战开始！共 ${this.totalWaves} 波`, '#f87171')

    // 首次教学
    if (!this.state.sectWarTutorialSeen) {
      this.state.sectWarTutorialSeen = true
      saveGame(this.state)
      this.time.delayedCall(500, () => this.showTutorial())
    }
  }

  private async showTutorial() {
    await showDialog('宗门战教学', [
      '【宗门战规则】',
      '1. 敌方从地图上方沿路径进攻主殿',
      '2. 点击「部署」可派遣弟子或亲自上阵',
      '3. 已建造的建筑自动防御（有血量，可被摧毁）',
      '4. 击退所有波次即为胜利',
      '5. 弟子被击败不会真正死亡，仅退场',
      '提示：将弟子部署在路径拐角处效果最佳！',
    ], [{ label: '明白了', value: 'ok' }])
    input.clearQueues()
  }

  private renderMap() {
    const g = this.add.graphics().setDepth(0)
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const isAlt = (x + y) % 2 === 0
        g.fillStyle(isAlt ? 0x1e2e1e : 0x1a281a, 1)
        g.fillRect(x * TILE, y * TILE, TILE, TILE)
      }
    }
    // 主殿位置（终点）
    const hall = this.add.rectangle(6 * TILE + TILE / 2, 17 * TILE + TILE / 2, TILE * 1.5, TILE * 1.5, 0xfbbf24, 0.4)
    hall.setStrokeStyle(2, 0xfbbf24).setDepth(1)
    this.add.text(6 * TILE + TILE / 2, 17 * TILE + TILE / 2, '主殿', {
      fontSize: '10px', color: '#fff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(2)
  }

  private renderPath() {
    const g = this.add.graphics().setDepth(1)
    g.lineStyle(3, 0x8b4513, 0.5)
    g.beginPath()
    for (let i = 0; i < PATH.length; i++) {
      const p = PATH[i]
      const px = p.x * TILE + TILE / 2
      const py = p.y * TILE + TILE / 2
      if (i === 0) g.moveTo(px, py)
      else g.lineTo(px, py)
    }
    g.strokePath()
  }

  private deployAutoTowers() {
    // 已建造建筑自动部署为防御塔
    for (const id of BUILDING_IDS) {
      const lv = this.sect.buildings[id] ?? 0
      if (lv === 0) continue
      const def = BUILDINGS[id]
      const pos = this.state.customBuildingPos?.[id] ?? { x: def.gridX, y: def.gridY }
      const gx = Math.max(0, Math.min(COLS - 1, pos.x))
      const gy = Math.max(0, Math.min(ROWS - 1, pos.y))
      this.placeTower(id, def.name, gx, gy, lv)
    }
  }

  private placeTower(id: string, name: string, gx: number, gy: number, level: number) {
    const cx = gx * TILE + TILE / 2
    const cy = gy * TILE + TILE / 2
    const color = id === 'main_hall' ? 0xfbbf24
      : id === 'guard_array' ? 0x14b8a6
      : id === 'training_ground' ? 0xef4444
      : 0x60a5fa
    const atk = 15 + level * 8
    const range = TILE * (2 + level * 0.3)
    const fireRate = Math.max(400, 1200 - level * 80)
    const maxHp = id === 'main_hall' ? 500 + level * 200 : 150 + level * 50

    const sprite = this.add.rectangle(cx, cy, TILE * 0.8, TILE * 0.8, color, 0.7)
      .setDepth(5).setStrokeStyle(1, 0xffffff, 0.5)
    const rangeCircle = this.add.arc(cx, cy, range, 0x00ff00, 0.05)
      .setStrokeStyle(1, 0x00ff00, 0.2).setDepth(4)
    const hpBar = this.add.rectangle(cx, cy - TILE * 0.5, TILE * 0.7, 3, 0x00ff00)
      .setDepth(6).setOrigin(0.5)

    const tower: TowerUnit = {
      sprite, rangeCircle, hpBar, hp: maxHp, maxHp, id, name, atk, range, fireRate, lastFire: 0,
      gridX: gx, gridY: gy, type: 'building',
    }
    this.towers.push(tower)

    this.add.text(cx, cy - TILE * 0.7, name, {
      fontSize: '7px', color: '#fff', stroke: '#000', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(6)
  }

  private deployDisciple(d: Disciple, gx: number, gy: number, isPlayer = false) {
    const cx = gx * TILE + TILE / 2
    const cy = gy * TILE + TILE / 2
    const atk = (d.atk ?? 20) + (d.realm ?? 0) * 10
    const range = TILE * 2.5
    const fireRate = 600
    const maxHp = d.maxHp ?? 200

    const color = isPlayer ? 0xfbbf24 : 0xa78bfa
    const sprite = this.add.rectangle(cx, cy, TILE * 0.6, TILE * 0.6, color, 0.8)
      .setDepth(5).setStrokeStyle(1, 0xffffff, 0.5)
    const rangeCircle = this.add.arc(cx, cy, range, 0xff00ff, 0.05)
      .setStrokeStyle(1, 0xff00ff, 0.2).setDepth(4)
    const hpBar = this.add.rectangle(cx, cy - TILE * 0.5, TILE * 0.6, 3, 0x00ff00)
      .setDepth(6).setOrigin(0.5)

    const tower: TowerUnit = {
      sprite, rangeCircle, hpBar, hp: maxHp, maxHp, id: isPlayer ? 'player' : d.uid,
      name: isPlayer ? `${this.state.classId === 'sword' ? '剑修' : this.state.classId === 'fairy' ? '仙子' : '道修'}(你)` : d.name,
      atk, range, fireRate, lastFire: 0,
      gridX: gx, gridY: gy, type: isPlayer ? 'player' : 'disciple',
    }
    this.towers.push(tower)

    this.add.text(cx, cy - TILE * 0.7, isPlayer ? '你' : d.name, {
      fontSize: '7px', color: isPlayer ? '#fbbf24' : '#a3e4d7', stroke: '#000', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(6)
  }

  update(_t: number, delta: number) {
    if (this.warOver) return
    if (dialogOpen() || panelOpen()) return

    this.warTime += delta
    input.poll()

    // 撤退
    if (input.consumeRetreat()) {
      this.endWar(false, '主动撤退')
      return
    }

    // 部署弟子
    if (input.consumeAct()) {
      this.openDeployPanel()
      return
    }

    // 摆放模式下跟随
    if (this.placementMode && this.ghost) {
      const pointer = this.input.activePointer
      const wx = pointer.worldX
      const wy = pointer.worldY
      this.ghost.setPosition(wx, wy)
      if (pointer.isDown) {
        const gx = Math.floor(wx / TILE)
        const gy = Math.floor(wy / TILE)
        if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS && this.selectedDisciple) {
          this.deployDisciple(this.selectedDisciple, gx, gy, this.selectedDisciple.uid === 'player')
          this.placementMode = false
          this.ghost?.destroy()
          this.ghost = null
          this.selectedDisciple = null
          toast('弟子部署成功！', '#a3e4d7')
        }
      }
    }

    // 波次生成
    this.handleWaves(delta)
    // 塔射击
    this.handleTowers(delta)
    // 敌人移动
    this.handleEnemies(delta)
    // 弹道
    this.handleProjectiles(delta)
    // 胜负判定
    this.checkWinLose()
    this.updateInfoText()
  }

  private handleWaves(delta: number) {
    if (this.waveIndex >= this.totalWaves) return
    this.waveSpawnTimer += delta
    if (this.spawnedInWave >= this.enemiesPerWave && this.enemies.length === 0) {
      this.waveIndex++
      this.spawnedInWave = 0
      if (this.waveIndex < this.totalWaves) {
        toast(`第 ${this.waveIndex + 1} 波来袭！`, '#f87171')
      }
      return
    }
    if (this.spawnedInWave < this.enemiesPerWave && this.waveSpawnTimer >= 1500) {
      this.waveSpawnTimer = 0
      this.spawnEnemy()
      this.spawnedInWave++
    }
  }

  private spawnEnemy() {
    const power = evaluateSectPower(this.state, this.enemySect.id)
    const waveMult = 1 + this.waveIndex * 0.3
    const hp = Math.floor(80 * waveMult + power * 0.5)
    const start = PATH[0]
    const cx = start.x * TILE + TILE / 2
    const cy = start.y * TILE + TILE / 2
    const sprite = this.add.rectangle(cx, cy, TILE * 0.7, TILE * 0.7, 0xef4444, 0.8)
      .setDepth(7).setStrokeStyle(1, 0xffffff, 0.5)
    const hpBar = this.add.rectangle(cx, cy - TILE * 0.5, TILE * 0.6, 3, 0x00ff00)
      .setDepth(8).setOrigin(0.5)

    const enemy: EnemyUnit = {
      sprite, hpBar, hp, maxHp: hp, speed: 30 + Math.random() * 20,
      atk: Math.floor(10 * waveMult), pathIndex: 0,
      name: `${this.enemySect.name}·妖兵${this.spawnedInWave + 1}`,
    }
    this.enemies.push(enemy)
  }

  private handleTowers(delta: number) {
    for (const t of this.towers) {
      t.lastFire += delta
      if (t.lastFire < t.fireRate) continue
      let nearest: EnemyUnit | null = null
      let minDist = t.range
      for (const e of this.enemies) {
        const d = Phaser.Math.Distance.Between(t.sprite.x, t.sprite.y, e.sprite.x, e.sprite.y)
        if (d < minDist) { minDist = d; nearest = e }
      }
      if (nearest) {
        t.lastFire = 0
        this.fireProjectile(t, nearest)
      }
    }
  }

  private fireProjectile(t: TowerUnit, target: EnemyUnit) {
    const proj = this.add.arc(t.sprite.x, t.sprite.y, 3, 0xffff00, 1).setDepth(9)
    this.projectiles.push({ sprite: proj, target, dmg: t.atk, speed: 200 })
  }

  private handleEnemies(delta: number) {
    for (const e of this.enemies) {
      if (e.pathIndex >= PATH.length - 1) {
        // 到达主殿
        this.endWar(false, '主殿被攻破')
        return
      }
      // 检查附近是否有防御塔可攻击
      let blockingTower: TowerUnit | null = null
      for (const t of this.towers) {
        const td = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, t.sprite.x, t.sprite.y)
        if (td < TILE * 0.8) { blockingTower = t; break }
      }
      if (blockingTower) {
        // 攻击防御塔
        blockingTower.hp -= e.atk * (delta / 1000)
        if (blockingTower.hp <= 0) {
          toast(`${blockingTower.name} 被摧毁！`, '#f87171')
          blockingTower.sprite.destroy()
          blockingTower.rangeCircle.destroy()
          blockingTower.hpBar.destroy()
          this.towers.splice(this.towers.indexOf(blockingTower), 1)
        }
      } else {
        // 向下一路径点移动
        const next = PATH[e.pathIndex + 1]
        const tx = next.x * TILE + TILE / 2
        const ty = next.y * TILE + TILE / 2
        const dx = tx - e.sprite.x
        const dy = ty - e.sprite.y
        const dist = Math.hypot(dx, dy)
        if (dist < 5) {
          e.pathIndex++
        } else {
          const vx = (dx / dist) * e.speed * (delta / 1000)
          const vy = (dy / dist) * e.speed * (delta / 1000)
          e.sprite.x += vx
          e.sprite.y += vy
        }
      }
      // 敌人血条
      const ratio = e.hp / e.maxHp
      e.hpBar.width = TILE * 0.6 * ratio
      e.hpBar.fillColor = ratio > 0.5 ? 0x00ff00 : ratio > 0.25 ? 0xffff00 : 0xff0000
      e.hpBar.setPosition(e.sprite.x, e.sprite.y - TILE * 0.5)
    }
    // 更新防御塔血条
    for (const t of this.towers) {
      const ratio = t.hp / t.maxHp
      t.hpBar.width = (t.type === 'building' ? TILE * 0.7 : TILE * 0.6) * ratio
      t.hpBar.fillColor = ratio > 0.5 ? 0x00ff00 : ratio > 0.25 ? 0xffff00 : 0xff0000
    }
  }

  private handleProjectiles(delta: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]
      if (!p.target || p.target.hp <= 0 || !this.enemies.includes(p.target)) {
        p.sprite.destroy()
        this.projectiles.splice(i, 1)
        continue
      }
      const dx = p.target.sprite.x - p.sprite.x
      const dy = p.target.sprite.y - p.sprite.y
      const dist = Math.hypot(dx, dy)
      if (dist < 8) {
        p.target.hp -= p.dmg
        sfx('sfx_hit', 0.2)
        if (p.target.hp <= 0) {
          p.target.sprite.destroy()
          p.target.hpBar.destroy()
          this.enemies.splice(this.enemies.indexOf(p.target), 1)
        }
        p.sprite.destroy()
        this.projectiles.splice(i, 1)
      } else {
        const vx = (dx / dist) * p.speed * (delta / 1000)
        const vy = (dy / dist) * p.speed * (delta / 1000)
        p.sprite.x += vx
        p.sprite.y += vy
      }
    }
  }

  private checkWinLose() {
    if (this.waveIndex >= this.totalWaves && this.enemies.length === 0) {
      this.endWar(true, '击退所有来犯之敌')
    }
  }

  private async openDeployPanel() {
    input.clearQueues()
    const disciples = this.sect.disciples.filter(d => d.status === 'idle')
    const playerDeployed = this.towers.some(t => t.type === 'player')
    const lines = [`空闲弟子：${disciples.length} 人　${playerDeployed ? '（你已上阵）' : '你可亲自上阵'}`]
    const options: { label: string; value: string }[] = []
    // 玩家自己角色
    if (!playerDeployed) {
      const stats = this.state
      lines.push(`你：${['练气','筑基','金丹','元婴','化神','合体','大乘','渡劫'][stats.realm]} Lv.${stats.level}`)
      options.push({ label: '亲自上阵', value: 'player' })
    }
    for (let i = 0; i < disciples.length; i++) {
      const d = disciples[i]
      lines.push(`${i + 1}. ${d.name} 攻${d.atk} 防${d.def} 气血${d.maxHp}`)
      options.push({ label: d.name, value: d.uid })
    }
    if (options.length === 0) {
      await showDialog('部署', ['无可部署人员'], [{ label: '关闭', value: 'close' }])
      input.clearQueues()
      return
    }
    options.push({ label: '关闭', value: 'close' })
    const result = await showDialog('部署 · 宗门战', lines, options)
    if (result === 'close' || result === null) { input.clearQueues(); return }
    if (result === 'player') {
      // 玩家自己角色作为弟子部署
      const playerDisc: Disciple = {
        uid: 'player', name: '你', gender: 'male', daoPath: '剑道',
        background: '散修传承', physique: '天灵根', lifeGoal: '飞升长生',
        profession: '散修', personality: ['好战'], appearanceSeed: 12345,
        root: 'gold', rootTier: 'common',
        realm: Math.max(0, Math.min(6, this.state.realm)) as any,
        exp: 0, expToNext: 100, talents: [], loyalty: 100, affection: 100,
        skills: [], status: 'idle', questId: null, questStartTime: 0,
        retreatEndTime: 0, guidanceCooldown: 0, sparCooldown: 0,
        cultivateStartTime: 0, fatigue: 0,
        atk: Math.floor(50 + this.state.level * 5), def: Math.floor(20 + this.state.level * 3),
        maxHp: 500 + this.state.level * 50, crit: 10,
        equipment: { weapon: null, head: null, armor: null, boots: null, charm: null },
        rank: 4, role: null,
      }
      this.selectedDisciple = playerDisc
      this.placementMode = true
      this.ghost = this.add.rectangle(0, 0, TILE * 0.6, TILE * 0.6, 0xfbbf24, 0.4)
        .setStrokeStyle(2, 0xfbbf24, 0.8).setDepth(50)
      toast('点击地图位置部署（你）', '#fbbf24')
    } else {
      const d = disciples.find(d => d.uid === result)
      if (d) {
        this.selectedDisciple = d
        this.placementMode = true
        this.ghost = this.add.rectangle(0, 0, TILE * 0.6, TILE * 0.6, 0xa78bfa, 0.4)
          .setStrokeStyle(2, 0xa78bfa, 0.8).setDepth(50)
        toast('点击地图位置部署弟子', '#a3e4d7')
      }
    }
    input.clearQueues()
  }

  private updateInfoText() {
    this.infoText.setText(
      `波次 ${Math.min(this.waveIndex + 1, this.totalWaves)}/${this.totalWaves}` +
      `  敌兵 ${this.enemies.length}` +
      `  防御塔 ${this.towers.length}`
    )
  }

  private endWar(victory: boolean, reason: string) {
    this.warOver = true
    this.result = victory ? '胜利' : '失败'
    this.placementMode = false
    this.ghost?.destroy()
    this.ghost = null

    // 奖惩
    if (victory) {
      this.sect.resources.prestige += 20
      this.state.sect!.resources.stone += Math.floor(this.enemySect.power * 0.1)
      toast(`击败${this.enemySect.name}来犯之敌！+20声望 +灵石`, '#fbbf24')
    } else {
      this.sect.resources.stone = Math.floor(this.sect.resources.stone * 0.8)
      this.sect.resources.prestige = Math.max(0, this.sect.resources.prestige - 10)
      toast(`宗门防御战败于${this.enemySect.name}：${reason} -20%灵石`, '#f87171')
    }
    saveGame(this.state)

    this.time.delayedCall(2000, () => {
      stopBgm()
      this.scene.start('Sect', { fromScene: 'world' })
    })
  }
}
