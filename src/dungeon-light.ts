// ---------- 关卡动态光照系统 ----------
// 使用 RenderTexture 实现黑暗遮罩 + 径向渐变光源挖洞效果

import Phaser from 'phaser'

interface LightSource {
  x: number
  y: number
  radius: number
  color: number
  flicker?: boolean
}

const TEX_SMALL = '__light_circle_128'
const TEX_LARGE = '__light_circle_256'

export class DungeonLightSystem {
  private scene: Phaser.Scene
  private rt: Phaser.GameObjects.RenderTexture
  private lightSources: LightSource[] = []
  private ambientAlpha = 0.35
  private playerLightRadius = 80

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.scene = scene
    this.rt = scene.add.renderTexture(0, 0, width, height).setOrigin(0).setDepth(2.5)
    this.rt.setScrollFactor(1)
    this.generateLightTextures()
  }

  private generateLightTextures(): void {
    this.makeRadialTexture(TEX_SMALL, 128)
    this.makeRadialTexture(TEX_LARGE, 256)
  }

  private makeRadialTexture(key: string, size: number): void {
    if (this.scene.textures.exists(key)) return
    const canvas = this.scene.textures.createCanvas(key, size, size)
    if (!canvas) return
    const ctx = canvas.getContext()
    const half = size / 2
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)')
    gradient.addColorStop(0.8, 'rgba(255,255,255,0.15)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    canvas.refresh()
  }

  setAmbientAlpha(alpha: number): void {
    this.ambientAlpha = alpha
  }

  setPlayerLightRadius(radius: number): void {
    this.playerLightRadius = radius
  }

  addLight(x: number, y: number, radius: number, color: number = 0xffaa33, flicker: boolean = false): void {
    this.lightSources.push({ x, y, radius, color, flicker })
  }

  clearLights(): void {
    this.lightSources = []
  }

  update(playerX: number, playerY: number): void {
    const camView = this.scene.cameras.main.worldView
    this.rt.clear()

    // 填充黑暗遮罩
    this.rt.fill(0x000000, this.ambientAlpha, camView.x, camView.y, camView.width, camView.height)

    // 玩家光源（使用大纹理 256×256，半径 128）
    const pTex = TEX_LARGE
    const pHalf = 128
    this.rt.erase(pTex, playerX - pHalf, playerY - pHalf)

    // 其他光源（火把等，使用小纹理 128×128，半径 64）
    for (const light of this.lightSources) {
      const r = light.flicker ? light.radius * (0.85 + Math.random() * 0.3) : light.radius
      // 根据半径选择纹理
      const tex = r > 80 ? TEX_LARGE : TEX_SMALL
      const half = tex === TEX_LARGE ? 128 : 64
      this.rt.erase(tex, light.x - half, light.y - half)
    }
  }

  setVisible(visible: boolean): void {
    this.rt.setVisible(visible)
  }

  destroy(): void {
    this.rt.destroy()
  }
}
