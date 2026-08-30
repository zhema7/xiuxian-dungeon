// ---------- 实体：玩家与怪物（Phaser 绑定层） ----------

import Phaser from 'phaser'
import { CLASSES, type MonsterDef } from './data'
import type { Stats } from './effects'
import type { InputPort } from './input'

export interface CombatCtx {
  time: number
  px: number
  py: number
  damagePlayer: (dmg: number, fromX: number, fromY: number) => void
  spawnProj: (x: number, y: number, angle: number, atk: number) => void
  enemyId?: string  // 可选：当前行动的敌人 ID（用于仙界敌人特殊投射物）
  // 敌人神通（仙界敌人复用玩家神通效果）
  spawnEnemyArt?: (enemyId: string, artMode: string, x: number, y: number, atk: number, targetX: number, targetY: number) => void
}

export type Facing = 'down' | 'left' | 'right' | 'up'

export class Player {
  sprite: Phaser.Physics.Arcade.Sprite
  dir = new Phaser.Math.Vector2(0, 1)
  facing: Facing = 'down'
  attackCdUntil = 0
  comboStage = 0
  comboResetAt = 0
  hurtUntil = 0
  private animLockUntil = 0
  private classId: string
  private animated: boolean

  constructor(scene: Phaser.Scene, x: number, y: number, classId = 'sword') {
    this.classId = classId
    this.animated = scene.anims.exists(`${classId}_down_idle`)
    if (this.animated) {
      this.sprite = scene.physics.add.sprite(x, y, `${classId}_atlas`, `${classId}_down_idle_00`)
      this.sprite.setScale(0.55) // 64px 帧 → 约 35px 显示高度
      const body = this.sprite.body as Phaser.Physics.Arcade.Body
      // 碰撞体：窄型脚部碰撞（缩放后约 8.8×5.5px），比瓦片窄很多，避免卡墙角
      body.setSize(16, 10)
      body.setOffset(24, 53)
      this.playAnim('idle')
    } else {
      this.sprite = scene.physics.add.sprite(x, y, 'player')
      const body = this.sprite.body as Phaser.Physics.Arcade.Body
      body.setSize(10, 8)
      body.setOffset(3, 8)
    }
    // 职业专属着色
    const tint = CLASSES[classId]?.tint
    if (tint != null && tint !== 0) this.sprite.setTint(tint)
    this.sprite.setDepth(10)
  }

  /** 动画使用的朝向（按职业配置修正素材方向标反的情况） */
  private animFacing(): Facing {
    return (CLASSES[this.classId]?.dirRemap?.[this.facing] ?? this.facing) as Facing
  }

  private playAnim(action: 'idle' | 'walk' | 'attack' | 'hit' | 'cast') {
    if (!this.animated) return
    const key = `${this.classId}_${this.animFacing()}_${action}`
    if (this.sprite.scene.anims.exists(key)) this.sprite.play(key, true)
    this.sprite.setFlipX(this.facing === 'left')
  }

  move(input: InputPort, stats: Stats, time: number, dt = 16) {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    const { x, y } = input.move
    const moving = x !== 0 || y !== 0
    if (moving) {
      this.dir.set(x, y).normalize()
      // 速度平滑过渡（lerp），避免启停生硬，dt 归一化到 60fps
      const lerpFactor = Math.min(1, 0.25 * (dt / 16))
      const targetVx = x * stats.speed
      const targetVy = y * stats.speed
      const curVx = body.velocity.x
      const curVy = body.velocity.y
      this.sprite.setVelocity(
        curVx + (targetVx - curVx) * lerpFactor,
        curVy + (targetVy - curVy) * lerpFactor
      )
      if (!this.animated) {
        if (x !== 0) this.sprite.setFlipX(x < 0)
      } else {
        this.facing = Math.abs(x) >= Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down')
        this.sprite.setFlipX(this.facing === 'left')
      }
    } else {
      // 减速到停止：更快的减速系数，保持手感灵敏
      const lerpFactor = Math.min(1, 0.4 * (dt / 16))
      this.sprite.setVelocity(
        body.velocity.x * (1 - lerpFactor),
        body.velocity.y * (1 - lerpFactor)
      )
      // 速度足够小时直接归零，防止微速漂移
      if (Math.abs(body.velocity.x) < 2) body.velocity.x = 0
      if (Math.abs(body.velocity.y) < 2) body.velocity.y = 0
    }
    if (time < this.animLockUntil) return
    const isMoving = Math.abs(body.velocity.x) > 5 || Math.abs(body.velocity.y) > 5
    this.playAnim(isMoving ? 'walk' : 'idle')
  }

  halt() { this.sprite.setVelocity(0, 0) }

  /** 返回连击段数（1~3），未准备好返回 0；aspd 为攻速加成（0~0.4） */
  tryAttack(time: number, aspd = 0): number {
    if (time < this.attackCdUntil) return 0
    this.comboStage = time < this.comboResetAt ? (this.comboStage % 3) + 1 : 1
    this.comboResetAt = time + 950
    this.attackCdUntil = time + 370 * (1 - aspd)
    this.animLockUntil = time + 360
    this.playAnim('attack')
    return this.comboStage
  }

  playHit(time: number) {
    this.animLockUntil = Math.max(this.animLockUntil, time + 280)
    this.playAnim('hit')
  }

  /** 神通施法动画（剑修有 cast 序列；无 cast 动画的职业退化为 attack） */
  playCast(time: number) {
    this.animLockUntil = Math.max(this.animLockUntil, time + 500)
    const key = `${this.classId}_${this.animFacing()}_cast`
    this.playAnim(this.sprite.scene.anims.exists(key) ? 'cast' : 'attack')
  }
}

export type EnemyState = 'idle' | 'chase' | 'windup' | 'dash' | 'dead'

export type EliteAffix = 'berserk' | 'armored' | 'swift' | 'vampiric' | 'explosive'

export const ELITE_AFFIX_NAMES: Record<EliteAffix, string> = {
  berserk: '狂暴',
  armored: '坚甲',
  swift: '迅捷',
  vampiric: '嗜血',
  explosive: '爆裂',
}

const ELITE_AFFIX_TINT: Record<EliteAffix, number> = {
  berserk: 0xff4444,
  armored: 0x4488ff,
  swift: 0x44ff88,
  vampiric: 0xff44aa,
  explosive: 0xff8800,
}

export const ELITE_AFFIXES: EliteAffix[] = ['berserk', 'armored', 'swift', 'vampiric', 'explosive']

export function rollEliteAffix(rng: () => number): EliteAffix {
  return ELITE_AFFIXES[Math.floor(rng() * ELITE_AFFIXES.length)]
}

export function applyEliteAffix(e: Enemy, affix: EliteAffix) {
  e.eliteAffix = affix
  switch (affix) {
    case 'berserk':
      e.atk = Math.round(e.atk * 1.8); e.def = Math.round(e.def * 0.8)
      break
    case 'armored':
      e.def = Math.round(e.def * 2.2); e.maxHp = Math.round(e.maxHp * 1.3); e.hp = e.maxHp
      break
    case 'swift':
      e.speed = Math.round(e.speed * 1.5); e.atk = Math.round(e.atk * 1.2)
      break
    case 'vampiric':
      e.atk = Math.round(e.atk * 1.3); e.maxHp = Math.round(e.maxHp * 1.2); e.hp = e.maxHp
      break
    case 'explosive':
      e.atk = Math.round(e.atk * 1.2); e.maxHp = Math.round(e.maxHp * 0.9); e.hp = e.maxHp
      break
  }
  e.sprite.setTint(ELITE_AFFIX_TINT[affix])
}

export class Enemy {
  sprite: Phaser.Physics.Arcade.Sprite
  cfg: MonsterDef
  hp: number
  maxHp: number
  elite = false   // 精英：更高属性，必掉装备
  eliteAffix?: EliteAffix
  atk: number
  def: number
  speed: number
  exp: number
  gold: [number, number]
  isBoss: boolean
  homeX: number
  homeY: number
  state: EnemyState = 'idle'
  slowUntil = 0
  private cdUntil = 0
  private windupUntil = 0
  private wanderUntil = 0
  private wanderDir = new Phaser.Math.Vector2(0, 0)
  private dashUntil = 0
  private nextDashAt = 0
  private dashHit = false
  private lastX = 0
  private lastY = 0
  private stuckCheckAt = 0
  private unstuckUntil = 0
  private hasAnim = false           // 是否有精灵动画（仙界敌人）
  private currentAnim = ''         // 当前播放的动画名
  // 敌人神通（仙界敌人专用）
  private artCdUntil = 0
  private artWindupUntil = 0
  private artMode: string | null = null
  private artCasting = false

  /** 播放指定后缀的动画（如 idle/walk/attack/hit），不存在则静默忽略 */
  private playAnim(suffix: string) {
    if (!this.hasAnim) return
    const key = `${this.cfg.tex}_${suffix}`
    if (this.currentAnim === key) return
    if (this.sprite.scene.anims.exists(key)) {
      this.sprite.anims.play(key)
      this.currentAnim = key
    }
  }

  constructor(scene: Phaser.Scene, cfg: MonsterDef, x: number, y: number, scale: number) {
    this.cfg = cfg
    this.homeX = x
    this.homeY = y
    this.maxHp = Math.round(cfg.hp * scale)
    this.hp = this.maxHp
    this.atk = Math.round(cfg.atk * (0.8 + scale * 0.2))
    this.def = cfg.def + Math.floor((scale - 1) * 2)
    this.speed = cfg.speed
    this.exp = Math.round(cfg.exp * scale)
    this.gold = cfg.gold
    this.isBoss = cfg.ai === 'boss'
    this.sprite = scene.physics.add.sprite(x, y, cfg.tex)
    this.sprite.setDepth(9)
    const srcImg = scene.textures.get(cfg.tex).getSourceImage() as HTMLImageElement
    const isLargeTex = srcImg.width > 100
    if (isLargeTex) {
      this.sprite.setScale((24 / srcImg.width) * (cfg.scale ?? 1))
    } else {
      this.sprite.setScale(cfg.scale ?? 1)
    }
    this.sprite.setCollideWorldBounds(true)   // 世界边界硬阻挡，防止被击退/冲撞挤出地图
    // 仙界敌人播放 idle 动画
    const idleKey = `${cfg.tex}_idle`
    if (scene.anims.exists(idleKey)) {
      this.sprite.anims.play(idleKey)
      this.hasAnim = true
    }
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    // 碰撞体按贴图帧尺寸自适应：水平居中、底部对齐（16px 帧 = offset(2,6)，32px Boss 帧 = offset(10,22)）
    const fw = this.sprite.frame.width
    const fh = this.sprite.frame.height
    const bw = Math.min(12, fw)
    const bh = Math.min(10, fh)
    body.setSize(bw, bh)
    body.setOffset((fw - bw) / 2, fh - bh)
  }

  get x() { return this.sprite.x }
  get y() { return this.sprite.y }
  get alive() { return this.state !== 'dead' }

  /** 设置敌人神通模式（仙界敌人专用） */
  setArtMode(mode: string) {
    this.artMode = mode
  }

  /** 减速（冰霜类效果） */
  applySlow(ms: number, time: number) {
    if (!this.alive) return
    this.slowUntil = Math.max(this.slowUntil, time + ms)
    this.sprite.setTint(0x9fd8ff)
    this.sprite.scene.time.delayedCall(ms, () => {
      if (this.alive && this.state !== 'windup' && time + ms >= this.slowUntil) this.sprite.clearTint()
    })
  }

  takeDamage(dmg: number, fromX: number, fromY: number): boolean {
    if (!this.alive) return false
    this.hp -= dmg
    this.sprite.setTintFill(0xffffff)
    this.sprite.scene.time.delayedCall(70, () => { if (this.alive) this.sprite.clearTint() })
    // 仙界敌人播放受击动画
    this.playAnim('hit')
    this.currentAnim = '' // 强制下次重新播放
    // 轻微击退
    const kb = new Phaser.Math.Vector2(this.x - fromX, this.y - fromY).normalize().scale(this.isBoss ? 20 : 70)
    this.sprite.setVelocity(kb.x, kb.y)
    if (this.hp <= 0) { this.die(); return true }
    return false
  }

  private die() {
    this.state = 'dead'
    this.sprite.setVelocity(0, 0)
    this.sprite.anims.stop()
    this.sprite.setTint(0x555555)
    if (this.eliteAffix === 'explosive') {
      this.sprite.scene.events.emit('enemy_explode', this.x, this.y, this.atk)
    }
    this.sprite.scene.tweens.add({
      targets: this.sprite, alpha: 0, y: this.sprite.y + 6, duration: 380,
      onComplete: () => this.sprite.destroy(),
    })
  }

  update(ctx: CombatCtx) {
    if (!this.alive) return
    if (this.cfg.id) ctx.enemyId = this.cfg.id
    const { time, px, py } = ctx
    const dist = Phaser.Math.Distance.Between(this.x, this.y, px, py)
    const toPlayer = new Phaser.Math.Vector2(px - this.x, py - this.y)
    const aggro = dist < 210 || this.hp < this.maxHp

    // 卡墙检测：追击中 350ms 位移不足 3px，则随机侧移 450ms 脱困
    if (time >= this.stuckCheckAt) {
      const moved = Phaser.Math.Distance.Between(this.x, this.y, this.lastX, this.lastY)
      if (this.state === 'chase' && this.speed > 0 && aggro && moved < 3) {
        this.unstuckUntil = time + 450
        this.wanderDir.set(Math.random() * 2 - 1, Math.random() * 2 - 1).normalize()
      }
      this.lastX = this.x
      this.lastY = this.y
      this.stuckCheckAt = time + 350
    }

    if (this.x < px - 2) this.sprite.setFlipX(false)
    else if (this.x > px + 2) this.sprite.setFlipX(true)

    // 出招中
    if (this.state === 'windup') {
      this.sprite.setVelocity(0, 0)
      this.playAnim('attack')
      if (time >= this.windupUntil) {
        this.state = 'chase'
        this.sprite.clearTint()
        this.cdUntil = time + (this.cfg.cd ?? 1200)
        if (this.cfg.ai === 'ranged') {
          ctx.spawnProj(this.x, this.y - 4, toPlayer.angle(), this.atk)
        } else {
          const reach = this.isBoss ? 48 : 32
          if (dist < reach) {
            ctx.damagePlayer(this.atk, this.x, this.y)
            if (this.eliteAffix === 'vampiric') this.hp = Math.min(this.maxHp, this.hp + Math.round(this.atk * 0.3))
          }
        }
      }
      return
    }

    // 神通施法中（仙界敌人专用）
    if (this.artCasting) {
      this.sprite.setVelocity(0, 0)
      this.playAnim('attack')
      if (time >= this.artWindupUntil) {
        this.artCasting = false
        this.sprite.clearTint()
        // 神通冷却：普通敌人 5~8秒，Boss 3~5秒
        const artCd = this.isBoss ? 3000 + Math.random() * 2000 : 5000 + Math.random() * 3000
        this.artCdUntil = time + artCd
        // 释放神通
        if (this.artMode && ctx.spawnEnemyArt) {
          ctx.spawnEnemyArt(this.cfg.id, this.artMode, this.x, this.y, this.atk, px, py)
        }
      }
      return
    }

    // Boss 冲撞
    if (this.state === 'dash') {
      if (!this.dashHit && dist < 40) {
        this.dashHit = true
        const dashDmg = Math.round(this.atk * 1.4)
        ctx.damagePlayer(dashDmg, this.x, this.y)
        if (this.eliteAffix === 'vampiric') this.hp = Math.min(this.maxHp, this.hp + Math.round(dashDmg * 0.3))
      }
      if (time >= this.dashUntil) { this.state = 'chase'; this.sprite.clearTint() }
      return
    }

    if (!aggro) {
      // 游荡
      this.playAnim('idle')
      const sp = this.speed * (time < this.slowUntil ? 0.5 : 1)
      if (time > this.wanderUntil) {
        this.wanderUntil = time + 1200 + Math.random() * 1800
        if (Math.random() < 0.45) this.wanderDir.set(0, 0)
        else this.wanderDir.set(Math.random() * 2 - 1, Math.random() * 2 - 1).normalize()
      }
      this.sprite.setVelocity(this.wanderDir.x * sp * 0.35, this.wanderDir.y * sp * 0.35)
      return
    }

    // Boss 冲撞触发
    if (this.isBoss && time > this.nextDashAt && dist > 70 && dist < 240) {
      this.nextDashAt = time + 6500
      this.dashHit = false
      this.state = 'dash'
      this.dashUntil = time + 520
      this.sprite.setTint(0xff6666)
      const dash = toPlayer.clone().normalize().scale(280)
      this.sprite.setVelocity(dash.x, dash.y)
      return
    }

    const cdReady = time >= this.cdUntil
    const artReady = this.artMode && time >= this.artCdUntil && ctx.spawnEnemyArt
    const sp = this.speed * (time < this.slowUntil ? 0.5 : 1)

    // 脱困移动中：径直侧移，绕开障碍
    if (time < this.unstuckUntil) {
      this.playAnim('walk')
      this.sprite.setVelocity(this.wanderDir.x * sp, this.wanderDir.y * sp)
      return
    }

    // 神通触发检测（仙界敌人）：有一定概率优先释放神通
    if (artReady && aggro && dist < 200 && Math.random() < 0.35) {
      this.artCasting = true
      this.artWindupUntil = time + (this.isBoss ? 500 : 600)
      this.sprite.setTint(0xaa88ff) // 紫色表示神通
      this.playAnim('attack')
      return
    }

    if (this.cfg.ai === 'ranged') {
      const range = this.cfg.range ?? 160
      if (dist < 70) {
        this.playAnim('walk')
        const away = toPlayer.clone().normalize().scale(-sp)
        this.sprite.setVelocity(away.x, away.y)
      } else if (dist <= range && cdReady) {
        this.state = 'windup'
        this.windupUntil = time + 420
        this.sprite.setTint(0xffe08a)
        this.playAnim('attack')
      } else if (dist > range) {
        this.playAnim('walk')
        const t = toPlayer.clone().normalize().scale(sp)
        this.sprite.setVelocity(t.x, t.y)
      } else {
        this.playAnim('idle')
        this.sprite.setVelocity(0, 0)
      }
      return
    }

    // 近战（含 Boss 常态）
    const reach = this.isBoss ? 46 : 28
    if (dist <= reach && cdReady) {
      this.state = 'windup'
      this.windupUntil = time + (this.isBoss ? 420 : 320)
      this.sprite.setTint(0xffe08a)
      this.playAnim('attack')
    } else if (dist > reach - 4) {
      this.playAnim('walk')
      const t = toPlayer.clone().normalize().scale(sp)
      this.sprite.setVelocity(t.x, t.y)
    } else {
      this.playAnim('idle')
      this.sprite.setVelocity(0, 0)
    }
  }
}

// ---------- 道友（AI 队友，职业为玩家对立面；灵体护体不受伤害） ----------
// 剑修道友近战，仙子道友远程火弹；攻击力为玩家的 80%
export class Ally {
  sprite: Phaser.Physics.Arcade.Sprite
  classId: string
  attackMult = 0.8
  private cdUntil = 0
  private animated: boolean
  private facing: Facing = 'down'
  private animLockUntil = 0

  constructor(scene: Phaser.Scene, x: number, y: number, classId: string) {
    this.classId = classId
    this.animated = scene.anims.exists(`${classId}_down_idle`)
    if (this.animated) {
      // 与玩家同规格的职业动画形象
      this.sprite = scene.physics.add.sprite(x, y, `${classId}_atlas`, `${classId}_down_idle_00`)
      this.sprite.setScale(0.55)
      const body = this.sprite.body as Phaser.Physics.Arcade.Body
      body.setSize(16, 10)
      body.setOffset(24, 53)
      this.playAnim('idle')
    } else {
      this.sprite = scene.physics.add.sprite(x, y, 'npc_junior')
      this.sprite.setScale(1.25)
      const body = this.sprite.body as Phaser.Physics.Arcade.Body
      body.setSize(10, 8)
      body.setOffset(3, 8)
    }
    this.sprite.setDepth(9)
    this.sprite.setCollideWorldBounds(true)
  }

  get x() { return this.sprite.x }
  get y() { return this.sprite.y }
  get ranged() { return this.classId === 'fairy' || this.classId === 'fairy_new' || this.classId === 'mage' }
  get attackCd() { return this.ranged ? 1300 : 950 }

  private animFacing(): Facing {
    return (CLASSES[this.classId]?.dirRemap?.[this.facing] ?? this.facing) as Facing
  }

  private playAnim(action: 'idle' | 'walk' | 'attack') {
    if (!this.animated) return
    const key = `${this.classId}_${this.animFacing()}_${action}`
    if (this.sprite.scene.anims.exists(key)) this.sprite.play(key, true)
  }

  private face(x: number, y: number) {
    if (!this.animated) {
      if (Math.abs(x) > 2) this.sprite.setFlipX(x < 0)
      return
    }
    this.facing = Math.abs(x) >= Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down')
  }

  /** 返回要攻击的目标（本帧出招），否则 null */
  updateAI(time: number, px: number, py: number, enemies: Enemy[]): Enemy | null {
    // 索敌：玩家附近 220 内最近的活怪
    let target: Enemy | null = null
    let best = 220
    for (const e of enemies) {
      if (!e.alive) continue
      const d = Phaser.Math.Distance.Between(px, py, e.x, e.y)
      if (d < best) { best = d; target = e }
    }

    const range = this.ranged ? 150 : 30
    if (target) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y)
      if (dist > range) {
        const t = new Phaser.Math.Vector2(target.x - this.x, target.y - this.y).normalize().scale(150)
        this.sprite.setVelocity(t.x, t.y)
        this.face(t.x, t.y)
        if (time >= this.animLockUntil) this.playAnim('walk')
      } else {
        this.sprite.setVelocity(0, 0)
        this.face(target.x - this.x, target.y - this.y)
        if (time >= this.cdUntil) {
          this.cdUntil = time + this.attackCd
          this.animLockUntil = time + 380
          this.playAnim('attack')
          return target
        }
        if (time >= this.animLockUntil) this.playAnim('idle')
      }
      return null
    }

    // 跟随玩家
    const followDist = Phaser.Math.Distance.Between(this.x, this.y, px, py)
    if (followDist > 44) {
      const t = new Phaser.Math.Vector2(px - this.x, py - this.y).normalize().scale(140)
      this.sprite.setVelocity(t.x, t.y)
      this.face(t.x, t.y)
      if (time >= this.animLockUntil) this.playAnim('walk')
    } else {
      this.sprite.setVelocity(0, 0)
      if (time >= this.animLockUntil) this.playAnim('idle')
    }
    return null
  }
}
