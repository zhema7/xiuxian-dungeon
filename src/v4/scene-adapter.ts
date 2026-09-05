// ---------- v4 场景适配层（ADR R2：executor 输出 → Phaser 落地） ----------
// 依赖 Phaser，但不改 executor（executor 保持纯函数可单测）
// 缺帧降级：全部用 Graphics 兜底，不新增伤害/碰撞（GDD §5）

import Phaser from 'phaser'
import type { Enemy } from '../entities'
import type { Stats } from '../effects'
import type { KitNormalBehavior, KitArtBehavior } from './executor'

export interface V4SceneContext {
  scene: Phaser.Scene
  playerX: number
  playerY: number
  dirAngle: number
  stats: Stats
  enemies: Enemy[]
  dealDamage: (e: Enemy, mult: number, isSkill: boolean, fromX?: number, fromY?: number) => void
  floatText: (x: number, y: number, text: string, color: string, size: number) => void
  buffAtkPct: number
  kitId?: string
}

function hitEnemiesInRange(
  ctx: V4SceneContext, cx: number, cy: number, radius: number,
  damageMult: number, isSkill: boolean, maxTargets = 999,
) {
  let hit = 0
  for (const e of ctx.enemies) {
    if (!e.alive) continue
    if (hit >= maxTargets) break
    const dist = Phaser.Math.Distance.Between(cx, cy, e.x, e.y)
    if (dist <= radius + (e.isBoss ? 14 : 0)) {
      ctx.dealDamage(e, damageMult, isSkill, cx, cy)
      hit++
    }
  }
  return hit
}

function flashCircle(ctx: V4SceneContext, x: number, y: number, radius: number, color: number, duration = 200) {
  const g = ctx.scene.add.graphics().setDepth(80)
  g.lineStyle(2, color, 0.8)
  g.strokeCircle(x, y, radius)
  g.fillStyle(color, 0.12)
  g.fillCircle(x, y, radius)
  ctx.scene.tweens.add({
    targets: g, alpha: 0, duration,
    onComplete: () => g.destroy(),
  })
}

function flashRing(ctx: V4SceneContext, x: number, y: number, radOuter: number, radInner: number, color: number, duration = 250) {
  const g = ctx.scene.add.graphics().setDepth(80)
  g.lineStyle(3, color, 0.85)
  g.strokeCircle(x, y, radOuter)
  g.lineStyle(1.5, color, 0.5)
  g.strokeCircle(x, y, radInner)
  ctx.scene.tweens.add({
    targets: g, alpha: 0, duration,
    onComplete: () => g.destroy(),
  })
}

function flashLine(ctx: V4SceneContext, x1: number, y1: number, x2: number, y2: number, color: number, duration = 150) {
  const g = ctx.scene.add.graphics().setDepth(80)
  g.lineStyle(2, color, 0.8)
  g.lineBetween(x1, y1, x2, y2)
  ctx.scene.tweens.add({
    targets: g, alpha: 0, duration,
    onComplete: () => g.destroy(),
  })
}

function flashRect(ctx: V4SceneContext, x: number, y: number, w: number, h: number, color: number, duration = 200) {
  const g = ctx.scene.add.graphics().setDepth(80)
  g.fillStyle(color, 0.25)
  g.fillRect(x - w / 2, y - h / 2, w, h)
  g.lineStyle(1.5, color, 0.6)
  g.strokeRect(x - w / 2, y - h / 2, w, h)
  ctx.scene.tweens.add({
    targets: g, alpha: 0, duration,
    onComplete: () => g.destroy(),
  })
}

function createPersistentZone(
  ctx: V4SceneContext, x: number, y: number, radius: number,
  color: number, durationMs: number, tickMs: number,
  damageMultPerTick: number, isSkill: boolean, maxTargets = 999,
) {
  const g = ctx.scene.add.graphics().setDepth(70)
  g.lineStyle(1.5, color, 0.4)
  g.strokeCircle(x, y, radius)
  g.fillStyle(color, 0.06)
  g.fillCircle(x, y, radius)
  const pulse = ctx.scene.add.graphics().setDepth(71)
  let elapsed = 0
  const timer = ctx.scene.time.addEvent({
    delay: tickMs,
    repeat: Math.floor(durationMs / tickMs) - 1,
    callback: () => {
      elapsed += tickMs
      hitEnemiesInRange(ctx, x, y, radius, damageMultPerTick, isSkill, maxTargets)
      // Pulse visual
      pulse.clear()
      pulse.lineStyle(2, color, 0.5)
      pulse.strokeCircle(x, y, radius * (0.5 + 0.5 * Math.sin(elapsed / 200)))
      ctx.scene.tweens.add({ targets: pulse, alpha: 0, duration: tickMs * 0.8 })
    },
  })
  ctx.scene.time.delayedCall(durationMs, () => {
    timer.remove()
    g.destroy()
    pulse.destroy()
  })
}

// ---------- v4 神通动画精灵（atlas 覆盖层） ----------

function playKitArtSprite(ctx: V4SceneContext, scale = 1.5): void {
  if (!ctx.kitId) return
  const atlasKey = `v4_${ctx.kitId}_atlas`
  const animKey = `v4_${ctx.kitId}_art_main`
  const { scene, playerX: px, playerY: py } = ctx
  if (!scene.textures.exists(atlasKey) || !scene.anims.exists(animKey)) return
  const sprite = scene.add.sprite(px, py, atlasKey, `${ctx.kitId}_art_main_1`)
    .setDepth(76)
    .setScale(scale)
  sprite.play(animKey)
  sprite.on('animationcomplete', () => sprite.destroy())
}

// ---------- 普攻侧行为落地 ----------

export function executeV4NormalInScene(ctx: V4SceneContext, b: KitNormalBehavior): void {
  const { scene, playerX: px, playerY: py } = ctx

  switch (b.primitive) {
    case 'boomerang': {
      flashRing(ctx, px, py, b.radius + 6, b.radius - 4, 0x88ddff)
      hitEnemiesInRange(ctx, px, py, b.radius, b.damageMult, false)
      scene.cameras.main.shake(30, 0.001)
      break
    }
    case 'roundtrip': {
      const dx = b.direction.x, dy = b.direction.y
      const endX = px + dx * b.range, endY = py + dy * b.range
      // Outgoing
      flashCircle(ctx, endX, endY, 8, 0x88ddff, 150)
      hitEnemiesInRange(ctx, endX, endY, 20, b.damageMult, false)
      // Return (delayed)
      scene.time.delayedCall(150, () => {
        flashCircle(ctx, px, py, 8, 0x66bbff, 150)
        hitEnemiesInRange(ctx, px, py, 20, b.returnDamageMult, false)
      })
      scene.cameras.main.shake(25, 0.001)
      break
    }
    case 'refract': {
      const dx = b.direction.x, dy = b.direction.y
      const startX = px + dx * 20, startY = py + dy * 20
      let prevX = startX, prevY = startY
      const hit = hitEnemiesInRange(ctx, startX, startY, 16, b.damageMult, false, 1)
      flashCircle(ctx, startX, startY, 10, 0x88ddff, 120)
      // Chain to up to maxTargets-1 more enemies
      const chainTargets = ctx.enemies.filter((e) => e.alive && e.x !== startX)
        .sort((a, b2) => Phaser.Math.Distance.Between(startX, startY, a.x, a.y) - Phaser.Math.Distance.Between(startX, startY, b2.x, b2.y))
        .slice(0, b.maxTargets - 1)
      for (let i = 0; i < chainTargets.length; i++) {
        const e = chainTargets[i]
        const falloff = Math.max(0.3, 1 - b.falloffPerTarget * (i + 1))
        flashLine(ctx, prevX, prevY, e.x, e.y, 0x88ddff, 100)
        ctx.dealDamage(e, b.damageMult * falloff, false, prevX, prevY)
        prevX = e.x; prevY = e.y
      }
      break
    }
    case 'mark': {
      const dx = b.direction.x, dy = b.direction.y
      const hitX = px + dx * 30, hitY = py + dy * 30
      flashCircle(ctx, hitX, hitY, 12, 0xff8866, 150)
      const hit = hitEnemiesInRange(ctx, hitX, hitY, 20, b.damageMult, false)
      // Apply mark visual
      for (const e of ctx.enemies) {
        if (!e.alive) continue
        const dist = Phaser.Math.Distance.Between(hitX, hitY, e.x, e.y)
        if (dist <= 20) flashCircle(ctx, e.x, e.y - 4, 6, 0xff6644, 200)
      }
      break
    }
    case 'fixedpoint': {
      flashCircle(ctx, b.target.x, b.target.y, b.radius + 4, 0xddaa44, 200)
      hitEnemiesInRange(ctx, b.target.x, b.target.y, b.radius, b.damageMult, false)
      scene.cameras.main.shake(40, 0.002)
      break
    }
    case 'thundernet': {
      createPersistentZone(ctx, px, py, b.radius, 0x66ccff, b.durationMs, b.tickMs, b.damageMultPerTick, false, b.maxNets * 5)
      break
    }
    case 'thunderstake': {
      flashRect(ctx, b.target.x, b.target.y, 6, 20, 0x66aaff, 200)
      createPersistentZone(ctx, b.target.x, b.target.y, b.radius, 0x66aaff, b.durationMs, b.tickMs, b.damageMultPerTick, false, 5)
      break
    }
    case 'charge': {
      const colors = [0x66aaff, 0x88ddff, 0xffdd44]
      const color = colors[b.tier]
      const radius = 8 + b.tier * 8
      flashCircle(ctx, px, py, radius, color, 200)
      const dx = b.direction.x, dy = b.direction.y
      const range = 20 + b.tier * 30
      hitEnemiesInRange(ctx, px + dx * range * 0.5, py + dy * range * 0.5, range, b.damageMult, false)
      scene.cameras.main.shake(20 + b.tier * 15, 0.001 + b.tier * 0.001)
      break
    }
  }
}

// ---------- 神通侧行为落地 ----------

export function executeV4ArtInScene(ctx: V4SceneContext, b: KitArtBehavior): void {
  const { scene, playerX: px, playerY: py } = ctx

  playKitArtSprite(ctx)

  switch (b.primitive) {
    case 'boomerang': {
      // Spinning orbiting artifact
      const g = scene.add.graphics().setDepth(75)
      let elapsed = 0
      const timer = scene.time.addEvent({
        delay: 50, repeat: Math.floor(b.durationMs / 50) - 1,
        callback: () => {
          elapsed += 50
          const angle = (elapsed / 1000) * (b.rotationSpeed * Math.PI / 180)
          const ox = px + Math.cos(angle) * b.radius
          const oy = py + Math.sin(angle) * b.radius
          g.clear()
          g.lineStyle(3, 0x88ddff, 0.8)
          g.strokeCircle(ox, oy, 8)
          hitEnemiesInRange(ctx, ox, oy, 12, b.damageMultPerTick, true, 3)
        },
      })
      scene.time.delayedCall(b.durationMs, () => { timer.remove(); g.destroy() })
      break
    }
    case 'roundtrip': {
      const dx = b.direction.x, dy = b.direction.y
      const endX = px + dx * b.range, endY = py + dy * b.range
      flashCircle(ctx, endX, endY, 14, 0xff88ff, 200)
      hitEnemiesInRange(ctx, endX, endY, 30, b.damageMult, true)
      scene.time.delayedCall(200, () => {
        flashCircle(ctx, px, py, 14, 0xff66ff, 200)
        hitEnemiesInRange(ctx, px, py, 30, b.returnDamageMult, true)
      })
      scene.cameras.main.shake(50, 0.003)
      break
    }
    case 'refract': {
      flashCircle(ctx, px, py, 16, 0x88ddff, 200)
      const targets = ctx.enemies.filter((e) => e.alive)
        .sort((a, c) => Phaser.Math.Distance.Between(px, py, a.x, a.y) - Phaser.Math.Distance.Between(px, py, c.x, c.y))
        .slice(0, b.maxTargets)
      let prevX = px, prevY = py
      for (let i = 0; i < targets.length; i++) {
        const e = targets[i]
        const falloff = Math.max(0.2, 1 - b.falloffPerTarget * i)
        flashLine(ctx, prevX, prevY, e.x, e.y, 0x88ddff, 120)
        ctx.dealDamage(e, b.damageMult * falloff, true, prevX, prevY)
        prevX = e.x; prevY = e.y
      }
      scene.cameras.main.shake(40, 0.002)
      break
    }
    case 'mark': {
      flashCircle(ctx, px, py, b.radius, 0xff6644, 250)
      const targets = ctx.enemies.filter((e) => e.alive && Phaser.Math.Distance.Between(px, py, e.x, e.y) <= b.radius)
      for (const e of targets) {
        flashCircle(ctx, e.x, e.y - 4, 8, 0xff4422, 300)
        ctx.dealDamage(e, b.detonationMult, true, px, py)
      }
      break
    }
    case 'fixedpoint': {
      flashCircle(ctx, b.target.x, b.target.y, b.radius + 8, 0xffaa44, 300)
      hitEnemiesInRange(ctx, b.target.x, b.target.y, b.radius, b.damageMult, true)
      scene.cameras.main.shake(60, 0.004)
      break
    }
    case 'thundernet': {
      createPersistentZone(ctx, px, py, b.radius, 0x66ccff, b.durationMs, b.tickMs, b.damageMultPerTick, true, 99)
      break
    }
    case 'thunderstake': {
      // Deploy multiple stakes with chain lightning
      for (const t of b.targets) {
        flashRect(ctx, t.x, t.y, 8, 24, 0x66aaff, 200)
        createPersistentZone(ctx, t.x, t.y, b.radius, 0x66aaff, b.durationMs, b.tickMs, b.damageMultPerTick, true, 5)
      }
      // Chain lightning between stakes
      for (let i = 0; i < b.targets.length - 1; i++) {
        flashLine(ctx, b.targets[i].x, b.targets[i].y, b.targets[i + 1].x, b.targets[i + 1].y, 0x88ccff, 200)
        // Chain damage
        for (const e of ctx.enemies) {
          if (!e.alive) continue
          const dist = Phaser.Math.Distance.Between(
            (b.targets[i].x + b.targets[i + 1].x) / 2,
            (b.targets[i].y + b.targets[i + 1].y) / 2,
            e.x, e.y,
          )
          if (dist <= b.radius) ctx.dealDamage(e, b.chainDamageMult, true)
        }
      }
      scene.cameras.main.shake(50, 0.003)
      break
    }
    case 'charge': {
      const colors = [0x66aaff, 0x88ddff, 0xffdd44]
      const color = colors[b.tier]
      const radius = 16 + b.tier * 20
      flashCircle(ctx, px, py, radius, color, 300)
      const dx = b.direction.x, dy = b.direction.y
      hitEnemiesInRange(ctx, px + dx * b.range * 0.3, py + dy * b.range * 0.3, b.range, b.damageMult, true)
      scene.cameras.main.shake(40 + b.tier * 20, 0.002 + b.tier * 0.002)
      break
    }
  }
}
