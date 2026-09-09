import Phaser from 'phaser'
import { Player } from '../entities'
import { input } from '../input'
import { calcStats, type Stats } from '../effects'
import { REALMS } from '../data'
import { saveGame, type GameState } from '../state'
import { getTribulation, type TribulationDef, type TribulationRecord } from '../tribulation-data'
import type { EnhancedTribulationDef } from '../tribulation-v2'
import { calculateTribulationReward, calculateTribulationFailure } from '../tribulation-v2'
import { showResult, setFloorText, setSettingsCallbacks, resetControls } from '../ui'
import { BGM_TRIBULATION, playBgm, stopBgm, sfx } from '../audio'

interface LightningStrike {
  x: number
  y: number
  warnAt: number
  strikeAt: number
  struck: boolean
  warnGfx?: Phaser.GameObjects.Graphics
  boltGfx?: Phaser.GameObjects.Graphics
}

const ARENA = { x: 16, y: 80, w: 328, h: 484 }
const PLAYER_SPEED = 140

export class TribulationScene extends Phaser.Scene {
  private state!: GameState
  private player!: Player
  private def!: TribulationDef
  private enhancedDef: EnhancedTribulationDef | null = null
  private stats!: Stats
  private curHp = 0
  private maxHp = 0
  private startTime = 0
  private strikes: LightningStrike[] = []
  private strikesFired = 0
  private nextWaveAt = 0
  private over = false
  private hpBar!: Phaser.GameObjects.Graphics
  private timerText!: Phaser.GameObjects.Text
  private strikeText!: Phaser.GameObjects.Text
  private titleText!: Phaser.GameObjects.Text
  private flashGfx!: Phaser.GameObjects.Graphics
  private realmIndex = 0
  private attempts = 0

  constructor() { super('Tribulation') }

  init(data: { realmIndex: number }) {
    this.realmIndex = data.realmIndex
    this.over = false
    this.strikes = []
    this.strikesFired = 0
  }

  create() {
    this.state = this.registry.get('state')
    // Phase 6: 检查是否有增强天劫数据
    const enhanced = this.registry.get('enhancedTribulation') as EnhancedTribulationDef | undefined
    if (enhanced && enhanced.realmIndex === this.realmIndex) {
      this.enhancedDef = enhanced
      this.def = enhanced
    } else {
      this.def = getTribulation(this.realmIndex)!
    }
    this.stats = calcStats(this.state)
    this.maxHp = this.stats.maxHp
    this.curHp = this.maxHp
    this.state.hp = -1
    this.attempts = (this.state.tribulationRecords[this.realmIndex]?.attempts ?? 0) + 1

    this.cameras.main.setBackgroundColor('#0a0a1a')

    this.physics.world.setBounds(ARENA.x, ARENA.y, ARENA.w, ARENA.h)

    this.drawBackground()
    playBgm(BGM_TRIBULATION)
    sfx('sfx_tribulation_warn', 0.7)

    this.player = new Player(this, 180, 320, this.state.classId)
    this.player.sprite.setCollideWorldBounds(true)

    this.hpBar = this.add.graphics().setDepth(50)
    this.timerText = this.add.text(180, 36, '', { fontSize: '14px', color: '#f0d98c', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(50)
    this.strikeText = this.add.text(180, 56, '', { fontSize: '10px', color: '#aaa', stroke: '#000', strokeThickness: 1 }).setOrigin(0.5).setDepth(50)
    this.titleText = this.add.text(180, 100, this.def.name, { fontSize: '18px', color: '#ff4444', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(50).setAlpha(0)
    this.flashGfx = this.add.graphics().setDepth(40).setScrollFactor(0)

    this.tweens.add({ targets: this.titleText, alpha: 1, duration: 400, yoyo: true, hold: 800, onComplete: () => this.titleText.setAlpha(0) })

    document.getElementById('hud')!.style.display = 'none'
    resetControls()
    document.getElementById('btnSkill')!.style.display = 'none'
    document.getElementById('btnRetreat')!.style.display = 'none'
    document.getElementById('btnAct')!.style.display = 'none'
    document.getElementById('btnPot')!.style.display = 'none'
    document.getElementById('btnBag')!.style.display = 'none'
    document.getElementById('btnSettings')!.style.display = 'block'

    setFloorText('天劫考验')
    setSettingsCallbacks({
      onReturnTitle: () => { this.failTribulation(true) },
    })

    this.startTime = this.time.now
    this.nextWaveAt = this.time.now + this.def.warningMs + 500
  }

  private drawBackground() {
    const bg = this.add.graphics().setDepth(0)
    bg.fillStyle(0x0a0a1a, 1)
    bg.fillRect(0, 0, this.scale.gameSize.width, this.scale.gameSize.height)
    for (let i = 0; i < 80; i++) {
      const sx = Phaser.Math.Between(0, this.scale.gameSize.width)
      const sy = Phaser.Math.Between(0, this.scale.gameSize.height)
      const sz = Phaser.Math.FloatBetween(0.3, 1)
      bg.fillStyle(0xffffff, sz * 0.6)
      bg.fillCircle(sx, sy, 0.5)
    }
    bg.lineStyle(2, 0x1a1a3a, 1)
    bg.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h)
    for (let i = 1; i < 4; i++) {
      const y = ARENA.y + (ARENA.h * i) / 4
      bg.lineStyle(1, 0x1a1a3a, 0.3)
      bg.beginPath()
      bg.moveTo(ARENA.x, y)
      bg.lineTo(ARENA.x + ARENA.w, y)
      bg.stroke()
    }
  }

  update(time: number, delta: number) {
    if (this.over) return
    input.poll()
    const dt = delta

    this.player.move(input, { ...this.stats, speed: PLAYER_SPEED } as Stats, time, dt)

    if (time >= this.nextWaveAt && this.strikesFired < this.def.maxStrikesTotal && time - this.startTime < this.def.durationMs) {
      this.spawnWave(time)
      this.nextWaveAt = time + this.def.strikeIntervalMs
    }

    this.updateStrikes(time)

    this.updateHUD(time)

    if (time - this.startTime >= this.def.durationMs && this.strikesFired > 0 && this.strikes.every(s => s.struck)) {
      this.successTribulation()
    }
    // 安全超时：超过1.5倍时长后强制结束（防止卡死）
    if (time - this.startTime >= this.def.durationMs * 1.5) {
      this.successTribulation()
    }
    if (this.curHp <= 0) {
      this.failTribulation(false)
    }
  }

  private spawnWave(now: number) {
    const remaining = this.def.maxStrikesTotal - this.strikesFired
    const count = Math.min(this.def.strikesPerWave, remaining)
    for (let i = 0; i < count; i++) {
      const px = this.player.sprite.x
      const py = this.player.sprite.y
      const offset = Phaser.Math.Between(20, 80)
      const angle = Math.random() * Math.PI * 2
      const sx = Phaser.Math.Clamp(px + Math.cos(angle) * offset, ARENA.x + 16, ARENA.x + ARENA.w - 16)
      const sy = Phaser.Math.Clamp(py + Math.sin(angle) * offset, ARENA.y + 16, ARENA.y + ARENA.h - 16)

      const warnGfx = this.add.graphics().setDepth(30)
      const strike: LightningStrike = {
        x: sx, y: sy,
        warnAt: now,
        strikeAt: now + this.def.warningMs,
        struck: false,
        warnGfx,
      }
      this.strikes.push(strike)
      this.strikesFired++
    }
    sfx('sfx_hit')
  }

  private updateStrikes(now: number) {
    for (const s of this.strikes) {
      if (!s.struck && now >= s.strikeAt) {
        this.executeStrike(s)
      }
      if (s.warnGfx && !s.struck) {
        const progress = Math.min(1, (now - s.warnAt) / this.def.warningMs)
        const radius = this.def.strikeRadius
        const alpha = 0.2 + 0.4 * Math.sin(progress * Math.PI * 4)
        s.warnGfx.clear()
        s.warnGfx.lineStyle(2, 0xff4444, alpha)
        s.warnGfx.strokeCircle(s.x, s.y, radius)
        s.warnGfx.fillStyle(0xff0000, 0.08 + 0.12 * progress)
        s.warnGfx.fillCircle(s.x, s.y, radius)
        const shrinkR = radius * (1 - progress * 0.7)
        s.warnGfx.lineStyle(1, 0xff8888, 0.5)
        s.warnGfx.strokeCircle(s.x, s.y, shrinkR)
      }
    }
    this.strikes = this.strikes.filter(s => {
      if (s.struck && s.boltGfx && now > s.strikeAt + 400) {
        s.boltGfx.destroy()
        if (s.warnGfx) s.warnGfx.destroy()
        return false
      }
      return true
    })
  }

  private executeStrike(s: LightningStrike) {
    s.struck = true
    if (s.warnGfx) s.warnGfx.destroy()

    const bolt = this.add.graphics().setDepth(35)
    s.boltGfx = bolt

    const segments = Phaser.Math.Between(4, 7)
    const points: Phaser.Math.Vector2[] = []
    const topY = s.y - 60 - Math.random() * 30
    points.push(new Phaser.Math.Vector2(s.x + (Math.random() - 0.5) * 10, topY))
    for (let i = 1; i < segments; i++) {
      const t = i / segments
      const py = topY + (s.y - topY) * t
      const jitter = (1 - t) * 12
      const px = s.x + (Math.random() - 0.5) * jitter
      points.push(new Phaser.Math.Vector2(px, py))
    }
    points.push(new Phaser.Math.Vector2(s.x, s.y))

    bolt.lineStyle(3, 0xffffaa, 1)
    bolt.beginPath()
    bolt.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) bolt.lineTo(points[i].x, points[i].y)
    bolt.strokePath()

    bolt.lineStyle(6, 0xffffdd, 0.3)
    bolt.beginPath()
    bolt.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) bolt.lineTo(points[i].x, points[i].y)
    bolt.strokePath()

    const flash = this.add.graphics().setDepth(34)
    flash.fillStyle(0xffffaa, 0.4)
    flash.fillCircle(s.x, s.y, this.def.strikeRadius * 1.5)
    flash.fillStyle(0xffffff, 0.6)
    flash.fillCircle(s.x, s.y, this.def.strikeRadius * 0.6)
    this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() })

    this.cameras.main.flash(80, 255, 255, 200)
    sfx('sfx_art_burst', 0.5)

    const dx = this.player.sprite.x - s.x
    const dy = this.player.sprite.y - s.y
    const dist = Math.hypot(dx, dy)
    if (dist <= this.def.strikeRadius) {
      const dmg = this.def.damagePerStrike
      this.curHp = Math.max(0, this.curHp - dmg)
      this.player.hurtUntil = this.time.now + 400
      this.floatDamage(this.player.sprite.x, this.player.sprite.y - 20, dmg)
      sfx('sfx_hit')
      this.cameras.main.shake(100, 0.01)
    }
  }

  private floatDamage(x: number, y: number, dmg: number) {
    const t = this.add.text(x, y, `-${dmg}`, { fontSize: '12px', color: '#ff4444', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(60)
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 600, onComplete: () => t.destroy() })
  }

  private updateHUD(now: number) {
    const elapsed = now - this.startTime
    const remaining = Math.max(0, this.def.durationMs - elapsed)
    const secs = Math.ceil(remaining / 1000)
    this.timerText.setText(`天劫剩余 ${secs}s`)

    this.strikeText.setText(`天雷 ${this.strikes.filter(s => s.struck).length}/${this.def.maxStrikesTotal}`)

    this.hpBar.clear()
    const barW = 200, barH = 10, barX = 80, barY = 14
    this.hpBar.fillStyle(0x222222, 1)
    this.hpBar.fillRoundedRect(barX, barY, barW, barH, 3)
    const hpPct = Math.max(0, this.curHp / this.maxHp)
    const hpColor = hpPct > 0.5 ? 0x44ff44 : hpPct > 0.25 ? 0xffaa00 : 0xff4444
    this.hpBar.fillStyle(hpColor, 1)
    this.hpBar.fillRoundedRect(barX, barY, barW * hpPct, barH, 3)
    this.hpBar.lineStyle(1, 0x444444, 1)
    this.hpBar.strokeRoundedRect(barX, barY, barW, barH, 3)
  }

  private successTribulation() {
    if (this.over) return
    this.over = true
    this.player.halt()

    const next = REALMS[this.realmIndex]
    this.state.realm = this.realmIndex
    this.state.hp = -1
    const record: TribulationRecord = {
      success: true,
      timestamp: Date.now(),
      attempts: this.attempts,
    }
    this.state.tribulationRecords[this.realmIndex] = record

    // Phase 6: 增强天劫奖励
    const resultLines: string[] = [
      `天雷散去，你成功渡过${this.def.name}！`,
      `晋入【${next.name}】境界，气血回满。`,
    ]
    if (this.enhancedDef) {
      const reward = calculateTribulationReward(this.state, this.enhancedDef)
      if (reward.insight > 0) {
        this.state.insight = (this.state.insight || 0) + reward.insight
      }
      if (reward.bonusGold > 0) {
        this.state.gold += reward.bonusGold
      }
      if (reward.demonReduction > 0) {
        // 减轻所有心魔
        const demons = this.state.innerDemons as any[]
        if (demons) {
          for (const d of demons) {
            if (!d.sealed) {
              d.intensity = Math.max(0, d.intensity - reward.demonReduction)
            }
          }
          this.state.innerDemons = demons.filter((d: any) => d.intensity > 0)
        }
      }
      if (reward.karmaReduction > 0) {
        this.state.karma = (this.state.karma || 0) + reward.karmaReduction
      }
      resultLines.push(...reward.messages)
    }
    resultLines.push(`<span class="dim">尝试次数：${this.attempts}</span>`)

    saveGame(this.state)

    stopBgm()
    sfx('sfx_levelup')

    showResult(`${this.def.name} · 渡劫成功`, resultLines, '返回洞府', () => {
      this.registry.remove('enhancedTribulation')
      this.scene.start('Town')
    })
  }

  private failTribulation(fled: boolean) {
    if (this.over) return
    this.over = true
    this.player.halt()

    const next = REALMS[this.realmIndex]
    this.state.materials.tupo = (this.state.materials.tupo ?? 0) + next.stones
    const record: TribulationRecord = {
      success: false,
      timestamp: Date.now(),
      attempts: this.attempts,
    }
    this.state.tribulationRecords[this.realmIndex] = record
    this.state.hp = -1

    // Phase 6: 增强天劫失败惩罚
    const failLines: string[] = []
    if (this.enhancedDef && !fled) {
      const failure = calculateTribulationFailure(this.state, this.enhancedDef)
      this.state.exp = Math.max(0, (this.state.exp || 0) - failure.expLoss)
      if (failure.demonIncrease > 0) {
        const demons = this.state.innerDemons as any[]
        const demon = demons?.find((d: any) => d.type === 'fear')
        if (demon) {
          demon.intensity = Math.min(100, demon.intensity + failure.demonIncrease)
        } else {
          demons?.push({ type: 'fear', intensity: failure.demonIncrease, accumulatedMs: 0, lastTrigger: Date.now(), sealed: false })
        }
      }
      failLines.push(...failure.messages)
    }

    saveGame(this.state)

    stopBgm()

    if (fled) {
      showResult('放弃渡劫', [
        `你选择了暂避天劫。`,
        `<span class="dim">突破石已退回，可择日再试。</span>`,
      ], '返回洞府', () => {
        this.registry.remove('enhancedTribulation')
        this.scene.start('Town')
      })
    } else {
      showResult(`${this.def.name} · 渡劫失败`, [
        `天雷轰体，你不支倒地……`,
        ...failLines,
        `突破石已退回，可择日再试。`,
      ], '返回洞府', () => {
        this.registry.remove('enhancedTribulation')
        this.scene.start('Town')
      })
    }
  }

  shutdown() {
    document.getElementById('hud')!.style.display = 'block'
    resetControls()
    this.registry.remove('enhancedTribulation')
  }
}
