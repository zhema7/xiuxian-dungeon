/**
 * Three.js 全量渲染器 — 直显模式
 *
 * 原理：Three.js canvas 直接挂 DOM（z-index:0），Phaser canvas 透明覆盖（z-index:1）
 * 所有世界元素（地形/建筑/装饰/玩家/NPC）都在 3D 空间中渲染
 * Phaser 仅负责 UI 覆盖层
 *
 * 参考 Octopath Traveler 的 HD-2D 技术：
 * - 低角度透视相机营造 diorama 微缩世界
 * - THREE.Sprite billboard 始终面向相机
 * - UnrealBloomPass + BokehPass 景深后处理
 * - ACESFilmic 色调映射
 * - fBm 多层噪声地形 + 海拔分层着色
 */

import * as THREE from 'three'
import Phaser from 'phaser'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

export interface HD2DCameraConfig {
  pitch: number
  yaw: number
  distance: number
  fov: number
}

export const DEFAULT_HD2D_CAMERA: HD2DCameraConfig = {
  pitch: 28,
  yaw: 0,
  distance: 600,
  fov: 36,
}

interface BillboardEntry {
  sprite: THREE.Sprite
  shadowMesh: THREE.Mesh | null
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  lastTextureKey: string
  lastFrameName: string
  lastFlip: boolean
  width: number
  height: number
}

/** 整数哈希 — 无周期性，基于大质数乘法 */
function hash2(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263
  h = (h ^ (h >>> 13)) | 0
  h = Math.imul(h, 1274126177)
  h = h ^ (h >>> 16)
  return ((h >>> 0) & 0x7fffffff) / 0x7fffffff
}

/** 平滑值噪声 — 双线性插值 + smoothstep */
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

/** fBm 噪声（分形布朗运动）— 多层八度叠加，无周期性 */
export function fbm(x: number, y: number, octaves = 5, lacunarity = 2.1, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise(x * freq, y * freq) * 2 - 1
    sum += n * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

export class ThreeBridge {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private canvas: HTMLCanvasElement
  private phaserScene: Phaser.Scene
  private ambientLight: THREE.AmbientLight
  private hemisphereLight: THREE.HemisphereLight
  private directionalLight: THREE.DirectionalLight
  private fillLight: THREE.DirectionalLight
  private moonLight: THREE.DirectionalLight
  private terrainMesh: THREE.Mesh | null = null
  private waterMesh: THREE.Mesh | null = null
  private followTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
  private cameraOffset: THREE.Vector3 = new THREE.Vector3()
  private composer: EffectComposer | null = null
  private bokehPass: BokehPass | null = null
  private bloomPass: UnrealBloomPass | null = null
  private standingSprites: THREE.Mesh[] = []
  private heightFn: ((x: number, z: number) => number) | null = null
  private billboards: THREE.Mesh[] = []
  private billboardMap: Map<string, BillboardEntry> = new Map()
  private domActive = false
  private syncHandler: (() => void) | null = null
  private wheelHandler: ((e: WheelEvent) => void) | null = null
  private touchHandler: ((e: TouchEvent) => void) | null = null
  private pinchDist = 0
  private camConfig: HD2DCameraConfig = { ...DEFAULT_HD2D_CAMERA }
  private terrainW = 1400
  private terrainD = 1800

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.phaserScene = scene

    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a2b20)
    this.scene.fog = new THREE.Fog(0x1a2b20, 600, 2200)

    const aspect = width / height
    this.camera = new THREE.PerspectiveCamera(DEFAULT_HD2D_CAMERA.fov, aspect, 1, 5000)
    this.applyCameraConfig(DEFAULT_HD2D_CAMERA)

    // 半球光：天空色从上方、地面色从下方，营造自然环境光
    this.hemisphereLight = new THREE.HemisphereLight(0x9bb8d8, 0x5a6a3a, 0.85)
    this.scene.add(this.hemisphereLight)

    this.ambientLight = new THREE.AmbientLight(0x7a8a9a, 0.45)
    this.scene.add(this.ambientLight)

    // 主光：暖色太阳光，带高质量阴影
    this.directionalLight = new THREE.DirectionalLight(0xfff5d0, 1.8)
    this.directionalLight.position.set(400, 600, 300)
    this.directionalLight.castShadow = true
    this.directionalLight.shadow.mapSize.width = 4096
    this.directionalLight.shadow.mapSize.height = 4096
    this.directionalLight.shadow.camera.near = 100
    this.directionalLight.shadow.camera.far = 3000
    this.directionalLight.shadow.camera.left = -800
    this.directionalLight.shadow.camera.right = 800
    this.directionalLight.shadow.camera.top = 800
    this.directionalLight.shadow.camera.bottom = -800
    this.directionalLight.shadow.bias = -0.0005
    this.directionalLight.shadow.normalBias = 0.08
    this.scene.add(this.directionalLight)

    // 补光：冷色侧光，柔化阴影
    this.fillLight = new THREE.DirectionalLight(0xa0c0e0, 0.55)
    this.fillLight.position.set(-300, 400, -200)
    this.scene.add(this.fillLight)

    // 月光：夜晚启用，冷蓝从高处斜照
    this.moonLight = new THREE.DirectionalLight(0xb4c8e8, 0)
    this.moonLight.position.set(-200, 700, -300)
    this.scene.add(this.moonLight)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.3, 0.35, 0.85,
    )
    this.composer.addPass(this.bloomPass)

    this.bokehPass = new BokehPass(this.scene, this.camera, {
      focus: DEFAULT_HD2D_CAMERA.distance,
      aperture: 0.0003,
      maxblur: 0.002,
    })
    this.composer.addPass(this.bokehPass)
    this.composer.addPass(new OutputPass())
  }

  /** 将 Three.js canvas 挂到 DOM，定位在 Phaser canvas 下方 */
  showInDOM(): void {
    if (this.domActive) return
    const gameCanvas = this.phaserScene.game.canvas

    // 清除 Phaser canvas 的背景色，使其完全透明
    gameCanvas.style.backgroundColor = 'transparent'

    this.canvas.style.position = 'fixed'
    this.canvas.style.zIndex = '0'
    this.canvas.style.pointerEvents = 'none'
    this.canvas.style.objectFit = 'contain'

    // #app 包含所有 UI 元素（HUD/按钮/面板），必须高于 Three.js canvas
    // Three.js canvas 是 body 的直接子节点，与 #app 平级
    const appDiv = document.getElementById('app')
    if (appDiv) {
      appDiv.style.zIndex = '1'
    }

    const sync = () => {
      const rect = gameCanvas.getBoundingClientRect()
      this.canvas.style.left = rect.left + 'px'
      this.canvas.style.top = rect.top + 'px'
      this.canvas.style.width = rect.width + 'px'
      this.canvas.style.height = rect.height + 'px'
    }
    sync()
    document.body.appendChild(this.canvas)
    this.syncHandler = sync
    window.addEventListener('resize', sync)
    this.phaserScene.scale.on('resize', sync)

    // 滚轮缩放
    this.wheelHandler = (e: WheelEvent) => {
      if (!this.domActive) return
      e.preventDefault()
      this.zoom(e.deltaY * 0.3)
    }
    window.addEventListener('wheel', this.wheelHandler, { passive: false })

    // 双指捏合缩放
    this.touchHandler = (e: TouchEvent) => {
      if (!this.domActive || e.touches.length !== 2) {
        this.pinchDist = 0
        return
      }
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      if (this.pinchDist > 0) {
        this.zoom((this.pinchDist - dist) * 1.5)
      }
      this.pinchDist = dist
    }
    window.addEventListener('touchstart', this.touchHandler, { passive: false })
    window.addEventListener('touchmove', this.touchHandler, { passive: false })

    this.domActive = true
  }

  hideFromDOM(): void {
    if (!this.domActive) return
    this.canvas.remove()
    if (this.syncHandler) {
      window.removeEventListener('resize', this.syncHandler)
      this.phaserScene.scale.off('resize', this.syncHandler)
      this.syncHandler = null
    }
    if (this.wheelHandler) {
      window.removeEventListener('wheel', this.wheelHandler)
      this.wheelHandler = null
    }
    if (this.touchHandler) {
      window.removeEventListener('touchstart', this.touchHandler)
      window.removeEventListener('touchmove', this.touchHandler)
      this.touchHandler = null
    }
    this.pinchDist = 0
    this.domActive = false
  }

  private applyCameraConfig(config: HD2DCameraConfig) {
    this.camConfig = { ...config }
    const pitchRad = (config.pitch * Math.PI) / 180
    const yawRad = (config.yaw * Math.PI) / 180
    const d = config.distance
    this.cameraOffset.set(
      d * Math.cos(pitchRad) * Math.sin(yawRad),
      d * Math.sin(pitchRad),
      d * Math.cos(pitchRad) * Math.cos(yawRad),
    )
    this.camera.fov = config.fov
    this.camera.position.copy(this.followTarget).add(this.cameraOffset)
    this.camera.lookAt(this.followTarget)
    this.camera.updateProjectionMatrix()
  }

  setCamera(config: Partial<HD2DCameraConfig>) {
    this.applyCameraConfig({ ...this.camConfig, ...config })
  }

  /** 滚轮/触屏缩放：distance 范围 200–900 */
  zoom(delta: number): void {
    const d = Math.max(200, Math.min(900, this.camConfig.distance + delta))
    if (d === this.camConfig.distance) return
    this.applyCameraConfig({ ...this.camConfig, distance: d })
    // 雾距随相机距离等比缩放，避免拉远后黑雾过深
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = d * 1.5
      this.scene.fog.far = d * 5.0
    }
    if (this.bokehPass) {
      const u = this.bokehPass.uniforms as Record<string, { value: number }>
      u['focus'].value = this.cameraOffset.length()
    }
  }

  /** 重置相机到默认距离 */
  resetCamera(): void {
    const d = DEFAULT_HD2D_CAMERA.distance
    this.applyCameraConfig({ ...this.camConfig, distance: d })
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = d * 1.5
      this.scene.fog.far = d * 5.0
    }
    if (this.bokehPass) {
      const u = this.bokehPass.uniforms as Record<string, { value: number }>
      u['focus'].value = this.cameraOffset.length()
    }
  }

  setLightColor(ambient: number, directional: number, intensity = 1.0, isNight = false) {
 this.ambientLight.color.setHex(ambient)
 this.directionalLight.color.setHex(directional)
 this.directionalLight.intensity = intensity
 this.hemisphereLight.color.setHex(directional)
 this.hemisphereLight.intensity = intensity * 0.55
 this.fillLight.intensity = intensity * 0.33
 // 夜晚月光：冷蓝补光，强度提升确保夜间可见度
 this.moonLight.intensity = isNight ? 1.0 : 0
 if (isNight) {
 this.moonLight.color.setHex(0xc4d0f0)
 // 夜晚提升环境光，避免黑成一片
 this.ambientLight.intensity = 0.6
 this.hemisphereLight.intensity = Math.max(0.55, intensity * 0.55 + 0.25)
 this.fillLight.intensity = Math.max(0.35, intensity * 0.33 + 0.15)
 } else {
 this.ambientLight.intensity = 0.45
 }
 }

  setFogColor(color: number, near = 600, far = 2000) {
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(color)
      this.scene.fog.near = near
      this.scene.fog.far = far
    }
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.setHex(color)
    }
  }

  setBloom(strength: number, radius: number, threshold: number) {
    if (this.bloomPass) {
      this.bloomPass.strength = strength
      this.bloomPass.radius = radius
      this.bloomPass.threshold = threshold
    }
  }

  setDoF(focus: number, aperture: number, maxblur: number) {
    if (this.bokehPass) {
      const u = this.bokehPass.uniforms as Record<string, { value: number }>
      u['focus'].value = focus
      u['aperture'].value = aperture
      u['maxblur'].value = maxblur
    }
  }

  createTerrain(
    width: number,
    depth: number,
    segments: number,
    heightFn: (x: number, z: number) => number,
    colorFn?: (x: number, z: number, h: number) => [number, number, number],
  ) {
    this.terrainW = width
    this.terrainD = depth
    const geo = new THREE.PlaneGeometry(width, depth, segments, segments)
    geo.rotateX(-Math.PI / 2)
    this.heightFn = heightFn

    const positions = geo.attributes.position
    const colors = new Float32Array(positions.count * 3)

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i)
      const z = positions.getZ(i)
      const h = heightFn(x, z)
      positions.setY(i, h)
      if (colorFn) {
        const [r, g, b] = colorFn(x, z, h)
        colors[i * 3] = r
        colors[i * 3 + 1] = g
        colors[i * 3 + 2] = b
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false })
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh)
      this.terrainMesh.geometry.dispose()
    }
    this.terrainMesh = new THREE.Mesh(geo, mat)
    this.terrainMesh.receiveShadow = true
    this.terrainMesh.castShadow = true
    this.scene.add(this.terrainMesh)
  }

  /** 将 2D 地面贴图烘焙到 3D 地形上（支持多地貌分层 + 高度过渡融合） */
  applyGroundTexture(
    grassKey: string,
    stoneKey: string,
    waterKey?: string,
    extra?: { sand?: string; snow?: string; forest?: string },
  ): void {
    if (!this.terrainMesh || !this.heightFn) return

    const TEX_SIZE = 2048
 const TILE = 4
    const canvas = document.createElement('canvas')
    canvas.width = TEX_SIZE
    canvas.height = TEX_SIZE
    const ctx = canvas.getContext('2d')!

    // 获取 Phaser 纹理源
    const getImg = (key: string): HTMLCanvasElement | HTMLImageElement | null => {
      const tex = this.phaserScene.textures.get(key)
      if (!tex || !tex.source || !tex.source[0]) return null
      return tex.source[0].image as HTMLCanvasElement | HTMLImageElement
    }
    const grassImg = getImg(grassKey)
    const stoneImg = getImg(stoneKey)
    const sandImg = extra?.sand ? getImg(extra.sand) : null
    const snowImg = extra?.snow ? getImg(extra.snow) : null
    const forestImg = extra?.forest ? getImg(extra.forest) : null
    const waterImg = waterKey ? getImg(waterKey) : null
    if (!grassImg && !stoneImg) return

    // 高度区间定义：[bottom, top, image]
    type Zone = { lo: number; hi: number; img: HTMLCanvasElement | HTMLImageElement | null }
    const zones: Zone[] = []
    if (waterImg) zones.push({ lo: -999, hi: -3, img: waterImg })
    if (sandImg) zones.push({ lo: -3, hi: 6, img: sandImg })
    zones.push({ lo: 6, hi: 28, img: grassImg || forestImg || sandImg || stoneImg })
    if (forestImg) zones.push({ lo: 28, hi: 52, img: forestImg })
    zones.push({ lo: 52, hi: 75, img: stoneImg || grassImg })
    if (snowImg) zones.push({ lo: 75, hi: 999, img: snowImg })
    else zones.push({ lo: 75, hi: 999, img: stoneImg || grassImg })

    // 预填充底色防止黑点
    ctx.fillStyle = '#3a5a3a'
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)

    const BLEND = 8 // 高度过渡融合范围

    // 判断是否在过渡带，返回主图 + 副图 + 混合比例
    const pickBlend = (h: number): [HTMLCanvasElement | HTMLImageElement | null, HTMLCanvasElement | HTMLImageElement | null, number] => {
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i]
        if (h >= z.lo && h < z.hi) {
          // 靠近下边界 → 混合上一区
          if (h - z.lo < BLEND && i > 0) {
            const t = (h - z.lo) / BLEND
            return [z.img, zones[i - 1].img, t]
          }
          // 靠近上边界 → 混合下一区
          if (z.hi - h < BLEND && i < zones.length - 1) {
            const t = (z.hi - h) / BLEND
            return [z.img, zones[i + 1].img, t]
          }
          return [z.img, null, 1]
        }
      }
      return [zones[zones.length - 1]?.img ?? null, null, 1]
    }

    // 第一遍：绘制基础贴图
    for (let py = 0; py < TEX_SIZE; py += TILE) {
      for (let px = 0; px < TEX_SIZE; px += TILE) {
        const tx = (px / TEX_SIZE - 0.5) * this.terrainW
        const tz = (py / TEX_SIZE - 0.5) * this.terrainD
        const h = this.heightFn(tx, tz)

        const [mainImg, blendImg, blendT] = pickBlend(h)
        let img = mainImg
        if (!img) img = grassImg || stoneImg
        if (!img) continue

        const ox = Math.floor(hash2(px, py) * Math.max(1, img.width - TILE))
        const oy = Math.floor(hash2(px + 137, py + 251) * Math.max(1, img.height - TILE))
        ctx.drawImage(img, ox, oy, TILE, TILE, px, py, TILE, TILE)

        // 过渡带：叠加副图
        if (blendImg && blendT < 0.85) {
          const alpha = 1 - blendT
          const bx = Math.floor(hash2(px + 500, py + 700) * Math.max(1, blendImg.width - TILE))
          const by = Math.floor(hash2(px + 900, py + 300) * Math.max(1, blendImg.height - TILE))
          ctx.globalAlpha = alpha * 0.6
          ctx.drawImage(blendImg, bx, by, TILE, TILE, px, py, TILE, TILE)
          ctx.globalAlpha = 1
        }

        // 微亮度变化 — 让地面有自然明暗
        const brightness = hash2(px + 31, py + 17)
        if (brightness > 0.7) {
          ctx.fillStyle = `rgba(255,255,255,${(brightness - 0.7) * 0.5})`
          ctx.fillRect(px, py, TILE, TILE)
        } else if (brightness < 0.3) {
          ctx.fillStyle = `rgba(0,0,0,${(0.3 - brightness) * 0.5})`
          ctx.fillRect(px, py, TILE, TILE)
        }
      }
    }

    // 第二遍：细节装饰（草叶、碎石、花点等）
    const DETAIL_STEP = 6
    for (let py = 0; py < TEX_SIZE; py += DETAIL_STEP) {
      for (let px = 0; px < TEX_SIZE; px += DETAIL_STEP) {
        const tx = (px / TEX_SIZE - 0.5) * this.terrainW
        const tz = (py / TEX_SIZE - 0.5) * this.terrainD
        const h = this.heightFn(tx, tz)
        const r = hash2(px + 7, py + 13)
        if (r < 0.3) continue // 只在 70% 位置添加细节

        if (h > 6 && h < 28) {
          // 草地区域：小草叶和花点
          if (r > 0.85) {
            // 小花
            const fc = r > 0.93 ? '#f0e0a0' : r > 0.89 ? '#e0a0c0' : '#c0d0f0'
            ctx.fillStyle = fc
            ctx.fillRect(px, py, 2, 2)
            ctx.fillStyle = '#8a8a2a'
            ctx.fillRect(px, py + 2, 1, 2)
          } else if (r > 0.5) {
            // 草叶
            ctx.fillStyle = r > 0.75 ? '#3a7a2a' : '#4a8a3a'
            ctx.fillRect(px, py, 1, 3)
            ctx.fillRect(px + 1, py + 1, 1, 2)
          }
        } else if (h >= 28 && h < 52) {
          // 森林区：深色落叶和苔藓
          if (r > 0.7) {
            ctx.fillStyle = r > 0.85 ? '#2a3a1a' : '#3a5a2a'
            ctx.fillRect(px, py, 2, 1)
          }
        } else if (h >= 52 && h < 75) {
          // 岩石区：碎石和裂纹
          if (r > 0.8) {
            ctx.fillStyle = r > 0.9 ? '#3a3a34' : '#6a6a64'
            ctx.fillRect(px, py, 2, 2)
          }
        } else if (h < -3 && h > -999) {
          // 水边：反光点
          if (r > 0.92) {
            ctx.fillStyle = 'rgba(180,220,255,0.4)'
            ctx.fillRect(px, py, 2, 1)
          }
        } else if (h >= 75) {
          // 雪区：闪光点
          if (r > 0.9) {
            ctx.fillStyle = 'rgba(255,255,255,0.8)'
            ctx.fillRect(px, py, 1, 1)
          }
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.magFilter = THREE.LinearFilter
 tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true

    const mat = this.terrainMesh.material as THREE.MeshLambertMaterial
    mat.map = tex
    mat.vertexColors = true
    mat.flatShading = false
    mat.needsUpdate = true
  }

  createWater(width: number, depth: number, level: number, color: number) {
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh)
      this.waterMesh.geometry.dispose()
    }
    const geo = new THREE.PlaneGeometry(width, depth)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshLambertMaterial({
      color, transparent: true, opacity: 0.65,
      flatShading: false,
      emissive: color,
      emissiveIntensity: 0.08,
    })
    this.waterMesh = new THREE.Mesh(geo, mat)
    this.waterMesh.position.set(0, level, 0)
    this.waterMesh.receiveShadow = true
    this.scene.add(this.waterMesh)
  }

  /** 在 3D 地形上放置竖直立面精灵（建筑/装饰） */
  addStandingSprite(
    textureKey: string,
    x: number, z: number,
    width: number, height: number,
    yOffset = 0,
  ): THREE.Mesh | null {
    const phaserTex = this.phaserScene.textures.get(textureKey)
    if (!phaserTex || !phaserTex.source || !phaserTex.source[0]) return null
    const sourceImage = phaserTex.source[0].image as HTMLCanvasElement | HTMLImageElement
    if (!sourceImage) return null

    const tex = new THREE.Texture(sourceImage)
    tex.needsUpdate = true
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.colorSpace = THREE.SRGBColorSpace

    const geo = new THREE.PlaneGeometry(width, height)
    const mat = new THREE.MeshLambertMaterial({
      map: tex, transparent: true, side: THREE.DoubleSide,
      alphaTest: 0.1, depthWrite: true,
    })
    const mesh = new THREE.Mesh(geo, mat)
    const groundY = this.heightFn ? this.heightFn(x, z) : 0
    mesh.position.set(x, groundY + height / 2 + yOffset, z)
    mesh.renderOrder = 10
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.scene.add(mesh)
    this.standingSprites.push(mesh)
    return mesh
  }

  /** 在地形表面放置平贴花（道路/地面标记），跟随地形起伏 */
  addTerrainDecal(
    textureKey: string,
    x3d: number, z3d: number,
    width: number, depth: number,
    rotation = 0,
  ): THREE.Mesh | null {
    const phaserTex = this.phaserScene.textures.get(textureKey)
    if (!phaserTex || !phaserTex.source || !phaserTex.source[0]) return null
    const sourceImage = phaserTex.source[0].image as HTMLCanvasElement | HTMLImageElement
    if (!sourceImage) return null

    const tex = new THREE.Texture(sourceImage)
    tex.needsUpdate = true
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.colorSpace = THREE.SRGBColorSpace

    const geo = new THREE.PlaneGeometry(width, depth)
    geo.rotateX(-Math.PI / 2)

    const mat = new THREE.MeshLambertMaterial({
      map: tex, transparent: true,
      opacity: 0.85, depthWrite: false,
      alphaTest: 0.1,
    })
    const mesh = new THREE.Mesh(geo, mat)
    const groundY = this.heightFn ? this.heightFn(x3d, z3d) : 0
    mesh.position.set(x3d, groundY + 1.0, z3d)
    mesh.receiveShadow = true
    mesh.rotation.y = rotation
    mesh.renderOrder = 5
    this.scene.add(mesh)
    this.standingSprites.push(mesh)
    return mesh
  }

  clearStandingSprites() {
    for (const m of this.standingSprites) {
      this.scene.remove(m)
      m.geometry.dispose()
      const mat = m.material as THREE.MeshBasicMaterial
      mat.map?.dispose()
      mat.dispose()
    }
    this.standingSprites = []
  }

  // ─── Billboard 系统（THREE.Sprite，始终面向相机） ───

  /** 添加一个 billboard 精灵（用于玩家/NPC） */
  addBillboard(
    id: string,
    textureKey: string,
    frameName: string | undefined,
    x3d: number, z3d: number,
    width: number, height: number,
    yOffset = 0,
  ): void {
    if (this.billboardMap.has(id)) this.removeBillboard(id)

    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const texture = new THREE.CanvasTexture(canvas)
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.colorSpace = THREE.SRGBColorSpace

    const mat = new THREE.SpriteMaterial({
      map: texture, transparent: true, depthWrite: false,
      alphaTest: 0.05,
    })
    const sprite = new THREE.Sprite(mat)
    const groundY = this.heightFn ? this.heightFn(x3d, z3d) : 0
    sprite.position.set(x3d, groundY + height / 2 + yOffset, z3d)
    sprite.scale.set(width, height, 1)
    sprite.renderOrder = 20
    this.scene.add(sprite)

    const entry: BillboardEntry = {
      sprite, shadowMesh: null, canvas, texture,
      lastTextureKey: '', lastFrameName: '', lastFlip: false,
      width, height,
    }
    this.billboardMap.set(id, entry)
    this.drawBillboardFrame(id, textureKey, frameName)
  }

  /** 从 Phaser 纹理绘制当前帧到 billboard canvas */
  private drawBillboardFrame(id: string, textureKey: string, frameName: string | undefined): void {
    const entry = this.billboardMap.get(id)
    if (!entry) return
    if (entry.lastTextureKey === textureKey && entry.lastFrameName === (frameName ?? '')) return
    entry.lastTextureKey = textureKey
    entry.lastFrameName = frameName ?? ''

    const phaserTex = this.phaserScene.textures.get(textureKey)
    if (!phaserTex || !phaserTex.source || !phaserTex.source[0]) return
    const sourceImage = phaserTex.source[0].image as HTMLCanvasElement | HTMLImageElement
    if (!sourceImage) return

    const ctx = entry.canvas.getContext('2d')!
    ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height)

    let sx = 0, sy = 0, sw = sourceImage.width, sh = sourceImage.height
    if (frameName) {
      const frame = this.phaserScene.textures.getFrame(textureKey, frameName)
      if (frame) {
        sx = frame.cutX; sy = frame.cutY
        sw = frame.cutWidth; sh = frame.cutHeight
      }
    }
    const dw = entry.canvas.width
    const dh = entry.canvas.height
    // flip 镜像绘制
    ctx.save()
    if (entry.lastFlip) {
      ctx.scale(-1, 1)
      ctx.translate(-dw, 0)
    }
    ctx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, dw, dh)
    ctx.restore()
    entry.texture.needsUpdate = true
  }

  /** 更新 billboard 的纹理帧 */
  updateBillboardFrame(id: string, textureKey: string, frameName: string | undefined): void {
    this.drawBillboardFrame(id, textureKey, frameName)
  }

  /** 设置 billboard 贴图翻转（向左移动时） */
  setBillboardFlip(id: string, flip: boolean): void {
    const entry = this.billboardMap.get(id)
    if (!entry || entry.lastFlip === flip) return
    entry.lastFlip = flip
    // 强制重绘：清除缓存标记后重绘
    const texKey = entry.lastTextureKey
    const frameName = entry.lastFrameName
    entry.lastTextureKey = ''
    entry.lastFrameName = ''
    this.drawBillboardFrame(id, texKey, frameName || undefined)
  }

  /** 更新 billboard 的 3D 位置 */
  updateBillboardPosition(id: string, x3d: number, z3d: number, yOffset = 0): void {
    const entry = this.billboardMap.get(id)
    if (!entry) return
    const groundY = this.heightFn ? this.heightFn(x3d, z3d) : 0
    entry.sprite.position.set(x3d, groundY + entry.height / 2 + yOffset, z3d)
    if (entry.shadowMesh) {
      entry.shadowMesh.position.set(x3d, groundY + 0.5, z3d)
    }
  }

  /** 更新 billboard 缩放 */
  updateBillboardScale(id: string, width: number, height: number): void {
    const entry = this.billboardMap.get(id)
    if (!entry) return
    entry.width = width
    entry.height = height
    entry.sprite.scale.set(width, height, 1)
  }

  hasBillboard(id: string): boolean {
    return this.billboardMap.has(id)
  }

  removeBillboard(id: string): void {
    const entry = this.billboardMap.get(id)
    if (!entry) return
    this.scene.remove(entry.sprite)
    if (entry.shadowMesh) {
      this.scene.remove(entry.shadowMesh)
      entry.shadowMesh.geometry.dispose()
      ;(entry.shadowMesh.material as THREE.Material).dispose()
    }
    entry.texture.dispose()
    ;(entry.sprite.material as THREE.SpriteMaterial).dispose()
    this.billboardMap.delete(id)
  }

  clearBillboards(): void {
    for (const id of [...this.billboardMap.keys()]) {
      this.removeBillboard(id)
    }
  }

  /** 2D 世界坐标 → 3D 地形坐标 */
  worldTo3D(worldX: number, worldY: number, mapW: number, mapH: number): [number, number] {
    return [
      (worldX / mapW - 0.5) * this.terrainW,
      (worldY / mapH - 0.5) * this.terrainD,
    ]
  }

  /** 3D 地形坐标 → Phaser 游戏坐标投影（用于 2D 标签定位） */
  project3DTo2D(x3d: number, z3d: number, yOffset = 0): { x: number; y: number } | null {
    const groundY = this.heightFn ? this.heightFn(x3d, z3d) : 0
    const pos = new THREE.Vector3(x3d, groundY + yOffset, z3d)
    pos.project(this.camera)
    if (pos.z > 1) return null
    const w = this.phaserScene.scale.width
    const h = this.phaserScene.scale.height
    return {
      x: (pos.x + 1) * 0.5 * w,
      y: (1 - pos.y) * 0.5 * h,
    }
  }

  clearObjects() {
    for (const child of [...this.scene.children]) {
      if (child === this.ambientLight || child === this.directionalLight ||
          child === this.hemisphereLight || child === this.fillLight) continue
      this.scene.remove(child)
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose()
    }
    this.terrainMesh = null
    this.waterMesh = null
    this.billboards = []
    this.standingSprites = []
    this.heightFn = null
    this.clearBillboards()
  }

  render() {
    try {
      if (this.composer) {
        this.composer.render()
      } else {
        this.renderer.render(this.scene, this.camera)
      }
    } catch { /* noop */ }
  }

  follow(
    worldX: number, worldY: number,
    mapW: number, mapH: number,
    terrainW: number, terrainD: number,
    lerp = 0.08,
  ) {
    const tx = (worldX / mapW - 0.5) * terrainW
    const tz = (worldY / mapH - 0.5) * terrainD
    this.followTarget.x += (tx - this.followTarget.x) * lerp
    this.followTarget.z += (tz - this.followTarget.z) * lerp
    // 跟踪地形高度：避免相机看到地形内侧
    const groundY = this.heightFn ? this.heightFn(this.followTarget.x, this.followTarget.z) : 0
    this.followTarget.y += (groundY - this.followTarget.y) * lerp
    const camPos = this.followTarget.clone().add(this.cameraOffset)
    // 确保相机在地面以上：检查相机位置处的地形高度
    const camGroundY = this.heightFn ? this.heightFn(camPos.x, camPos.z) : 0
    const minCamY = camGroundY + 60
    if (camPos.y < minCamY) camPos.y = minCamY
    this.camera.position.copy(camPos)
    this.camera.lookAt(this.followTarget)
    this.camera.updateProjectionMatrix()

    if (this.bokehPass) {
      const u = this.bokehPass.uniforms as Record<string, { value: number }>
      u['focus'].value = this.cameraOffset.length()
    }
  }

  destroy() {
    this.hideFromDOM()
    try {
      this.composer?.dispose()
      this.bloomPass?.dispose()
      this.bokehPass?.dispose()
      this.clearBillboards()
      for (const child of [...this.scene.children]) {
        const mesh = child as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose())
          else mesh.material.dispose()
        }
        this.scene.remove(child)
      }
      this.renderer.dispose()
    } catch { /* noop */ }
  }
}
