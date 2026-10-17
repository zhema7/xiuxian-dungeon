import Phaser from 'phaser'
import { generateMissing, SPRITE_KEYS } from '../textures'
import { AUDIO_KEYS, audioInit, BGM_TITLE, playBgm, audioUrls } from '../audio'
import { REGIONS } from '../data'
import { loadGame } from '../state'
import { initUI } from '../ui'
import {
  SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS,
  SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS,
  hasCompleteSequenceResourceBundleForRegistration,
  type SequenceResourceBundleRegistrationKey,
} from '../fx/sequence-contract'

const ANIM_CLASSES = ['sword', 'fairy', 'mage', 'sword_new', 'fairy_new']

// 灵兽动画种类（8 只灵兽，每只 1 个 idle 动画）
const BEAST_ANIM_IDS = ['wolf', 'turtle', 'fox', 'bear', 'eagle', 'serpent', 'qilin', 'dragon']
// 阵法动画种类（3 种类型，每类 1 个 spin 动画）
const FORMATION_ANIM_TYPES = ['attack', 'defense', 'trap']

// 序列帧特效动画：逐帧独立 PNG，仅在所有帧加载成功时注册动画
// - 无 anim 字段者为多段动画（sword_proj / slash），沿用下方硬编码注册块
// - 有 anim 字段者为单段动画（Tier1+2 批量特效），由数据驱动循环批量注册
type MultiSegmentFxBundleDef = {
  key: 'sword_proj' | 'slash'
  frameSize: number
  anim?: undefined
}
type SingleSegmentFxAnimDef = {
  key: Exclude<SequenceResourceBundleRegistrationKey, 'sword_proj' | 'slash'>
  frameSize: number
  anim: { frameRate: number; repeat: number }
}
type FxAnimDef = MultiSegmentFxBundleDef | SingleSegmentFxAnimDef

const FX_ANIMS: readonly FxAnimDef[] = [
  { key: 'mod_blade', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },
  { key: 'mod_burst', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },
  { key: 'mod_charge', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },
  { key: 'mod_field', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },
  { key: 'mod_hit', frameSize: 48, anim: { frameRate: 14, repeat: 0 } },
  { key: 'mod_rune', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },
  { key: 'sword_proj', frameSize: 48 },
  { key: 'slash', frameSize: 48 },
  // ---- Tier1+2 批量特效（fx-anim-batch-spec.md §1）----
  { key: 'fx_ring', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },   // 径向环，once
  { key: 'fx_splash', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },  // 爆裂溅射，once
  { key: 'fx_spark', frameSize: 48, anim: { frameRate: 14, repeat: 0 } },  // 飞剑火花，once
  { key: 'bolt_fly', frameSize: 48, anim: { frameRate: 10, repeat: -1 } }, // 火弹弹道，loop
  { key: 'proj_fly', frameSize: 48, anim: { frameRate: 10, repeat: -1 } }, // 祛础弹道，loop
  // ---- Tier3 新增招式贴图（10种）----
  { key: 'fx_shadow', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },   // 暗影刃
  { key: 'fx_chain', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },    // 灵锁链
  { key: 'fx_wind', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },      // 风刃连
  { key: 'fx_spike', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },     // 地刺术
  { key: 'fx_scythe', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },   // 血镰斩
  { key: 'fx_star', frameSize: 48, anim: { frameRate: 14, repeat: 0 } },    // 星雨弩
  { key: 'fx_claw', frameSize: 48, anim: { frameRate: 14, repeat: 0 } },     // 毒爪裂
  { key: 'fx_light', frameSize: 48, anim: { frameRate: 14, repeat: 0 } },    // 圣光束
  { key: 'fx_soul', frameSize: 48, anim: { frameRate: 10, repeat: 0 } },    // 魂火弹
  { key: 'fx_crystal', frameSize: 48, anim: { frameRate: 12, repeat: 0 } }, // 晶碎刃
  // ---- Tier3 新增神通贴图（10种）----
  { key: 'fx_meteor', frameSize: 48, anim: { frameRate: 10, repeat: 0 } },   // 陨石天降
  { key: 'fx_void', frameSize: 48, anim: { frameRate: 10, repeat: 0 } },     // 虚空裂
  { key: 'fx_blood', frameSize: 48, anim: { frameRate: 10, repeat: 0 } },   // 血域降
  { key: 'fx_pillar', frameSize: 48, anim: { frameRate: 12, repeat: 0 } }, // 圣光柱
  { key: 'fx_frozen', frameSize: 48, anim: { frameRate: 12, repeat: 0 } }, // 冰封域
  { key: 'fx_vortex', frameSize: 48, anim: { frameRate: 12, repeat: 0 } }, // 元神旋
  { key: 'fx_orbit', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },   // 剑环舞
  { key: 'fx_poison', frameSize: 48, anim: { frameRate: 10, repeat: 0 } },  // 万毒瘴
  { key: 'fx_gravity', frameSize: 48, anim: { frameRate: 10, repeat: 0 } },// 重力渊
  { key: 'fx_phoenix', frameSize: 48, anim: { frameRate: 12, repeat: 0 } },// 凤凰涅
]

export class BootScene extends Phaser.Scene {
  private failedKeys = new Set<string>()
  private readonly isMinitool = typeof window !== 'undefined' && (window as any).__MINITOOL__ === true
  // 加载进度条相关
  private progressBarBg: Phaser.GameObjects.Graphics | null = null
  private progressBar: Phaser.GameObjects.Graphics | null = null
  private progressText: Phaser.GameObjects.Text | null = null
  private loadingText: Phaser.GameObjects.Text | null = null
  private titleText: Phaser.GameObjects.Text | null = null
  // 资源加载占整个启动过程的 80%，create() 阶段占 20%
  private static readonly LOAD_RATIO = 0.8
  private static readonly CREATE_RATIO = 0.2
  private static readonly CREATE_STEPS = 8
  private createStep = 0

  constructor() { super('Boot') }

  preload() {
    // 创建加载界面
    this.createLoadingScreen()

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.failedKeys.add(file.key)
    })

    // 监听加载进度（映射到 0 ~ LOAD_RATIO）
    this.load.on('progress', (value: number) => {
      this.updateProgress(value * BootScene.LOAD_RATIO)
    })

    // 加载完成
    this.load.on('complete', () => {
      this.updateProgress(BootScene.LOAD_RATIO)
    })

    if (this.isMinitool) {
      this.preloadMinitool()
      return
    }
    this.preloadStandard()
  }

  /** 创建加载界面 */
  private createLoadingScreen() {
    const w = this.cameras.main.width
    const h = this.cameras.main.height
    const cx = w / 2
    const cy = h / 2

    // 深色背景
    this.add.rectangle(0, 0, w, h, 0x0a0a14).setOrigin(0, 0)

    // 星空装饰（简单的随机星点）
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const size = Math.random() * 2 + 0.5
      const alpha = Math.random() * 0.6 + 0.2
      this.add.circle(x, y, size, 0xffffff, alpha)
    }

    // 游戏标题
    this.titleText = this.add.text(cx, cy - 100, '修仙与地下城', {
      fontSize: '32px',
      color: '#ffd54a',
      fontStyle: 'bold',
      stroke: '#2a1a0a',
      strokeThickness: 4,
    }).setOrigin(0.5)

    // 副标题
    this.add.text(cx, cy - 60, '像素修仙 · 肉鸽探秘', {
      fontSize: '14px',
      color: '#aabbdd',
    }).setOrigin(0.5)

    // 加载文字
    this.loadingText = this.add.text(cx, cy + 10, '正在汲取天地灵气...', {
      fontSize: '14px',
      color: '#cccccc',
    }).setOrigin(0.5)

    // 进度条背景
    const barWidth = Math.min(280, w * 0.7)
    const barHeight = 12
    const barX = cx - barWidth / 2
    const barY = cy + 40

    this.progressBarBg = this.add.graphics()
    this.progressBarBg.fillStyle(0x222233, 0.8)
    this.progressBarBg.fillRoundedRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4, 4)
    this.progressBarBg.lineStyle(2, 0x445577, 0.6)
    this.progressBarBg.strokeRoundedRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4, 4)

    // 进度条
    this.progressBar = this.add.graphics()

    // 进度百分比文字
    this.progressText = this.add.text(cx, cy + 70, '0%', {
      fontSize: '12px',
      color: '#88aacc',
    }).setOrigin(0.5)
  }

  /** 更新加载进度 */
  private updateProgress(value: number) {
    if (!this.progressBar || !this.progressText) return

    const w = this.cameras.main.width
    const barWidth = Math.min(280, w * 0.7)
    const barHeight = 12
    const barX = w / 2 - barWidth / 2
    const barY = this.cameras.main.height / 2 + 40

    this.progressBar.clear()
    const fillWidth = Math.max(0, Math.min(barWidth, barWidth * value))
    // 渐变效果：从蓝到金到橙红
    // 使用分段矩形模拟渐变
    const segments = 20
    const segWidth = fillWidth / segments
    for (let i = 0; i < segments; i++) {
      const t = i / segments
      // 颜色插值：0% = 蓝，50% = 金，100% = 橙红
      let r: number, g: number, b: number
      if (t < 0.5) {
        const lt = t * 2
        r = Math.round(0x6b + (0xff - 0x6b) * lt)
        g = Math.round(0x8f + (0xd5 - 0x8f) * lt)
        b = Math.round(0xff + (0x4a - 0xff) * lt)
      } else {
        const lt = (t - 0.5) * 2
        r = Math.round(0xff + (0xff - 0xff) * lt)
        g = Math.round(0xd5 + (0x88 - 0xd5) * lt)
        b = Math.round(0x4a + (0x66 - 0x4a) * lt)
      }
      const color = Phaser.Display.Color.GetColor(r, g, b)
      this.progressBar.fillStyle(color, 1)
      this.progressBar.fillRect(barX + i * segWidth, barY, segWidth + 0.5, barHeight)
    }
    // 圆角末端
    if (fillWidth > 6) {
      this.progressBar.fillStyle(0xff8866, 1)
      this.progressBar.fillRoundedRect(barX + fillWidth - 6, barY, 6, barHeight, 2)
    }

    const percent = Math.round(value * 100)
    this.progressText.setText(`${percent}%`)

    // 加载完成时的文字变化
    if (value >= 0.99 && this.loadingText) {
      this.loadingText.setText('灵气充盈，仙途将启...')
    }
  }

  /** create() 阶段进度推进 */
  private advanceCreateProgress() {
    this.createStep++
    const ratio = BootScene.LOAD_RATIO + (this.createStep / BootScene.CREATE_STEPS) * BootScene.CREATE_RATIO
    this.updateProgress(Math.min(1, ratio))
  }

  private preloadMinitool() {
    const atlasFiles = [
      'atlas_main', 'atlas_v4_1', 'atlas_v4_2',
      'atlas_xian', 'atlas_terrain',
    ]
    for (const name of atlasFiles) {
      this.load.atlas(name, `sprites/${name}.png`, `sprites/${name}.json`)
    }
    for (const cls of ANIM_CLASSES) {
      this.load.atlas(`${cls}_atlas`, `sprites/${cls}_spritesheet.png`, `sprites/${cls}_atlas.json`)
      this.load.json(`${cls}_anims`, `sprites/${cls}_anims.json`)
    }
    for (const key of AUDIO_KEYS) {
      this.load.audio(key, audioUrls(key))
    }
  }

  private preloadStandard() {
    // 静态贴图：外部文件优先，失败用程序化兜底
    for (const key of SPRITE_KEYS) {
      this.load.image(key, `sprites/${key}.png`)
    }
    // v2 地形瓷砖集（每区域一套完整瓷砖）
    const terrainTiles = [
      'floor_base', 'floor_var1', 'floor_var2', 'floor_var3', 'floor_edge',
      'wall_top', 'wall_side', 'wall_corner_tl', 'wall_corner_tr', 'wall_corner_bl', 'wall_corner_br', 'wall_pillar',
      'water_1', 'water_2', 'water_3', 'water_4',
      'floor_deco_1', 'floor_deco_2', 'floor_deco_3', 'floor_deco_4',
      'wall_deco_1', 'wall_deco_2', 'wall_deco_3',
    ]
    for (const r of REGIONS) {
      for (const tile of terrainTiles) {
        this.load.image(`terrain_${r.terrainPrefix}_${tile}`, `sprites/terrain/${r.terrainPrefix}_${tile}.png`)
      }
    }
    // 角色帧动画（atlas + 动画定义）
    for (const cls of ANIM_CLASSES) {
      this.load.atlas(`${cls}_atlas`, `sprites/${cls}_spritesheet.png`, `sprites/${cls}_atlas.json`)
      this.load.json(`${cls}_anims`, `sprites/${cls}_anims.json`)
    }
    // 灵兽帧动画（atlas + 动画定义）
    for (const id of BEAST_ANIM_IDS) {
      this.load.atlas(`beast_${id}_atlas`, `sprites/beast_${id}_sheet.png`, `sprites/beast_${id}_atlas.json`)
      this.load.json(`beast_${id}_anims`, `sprites/beast_${id}_anims.json`)
    }
    // 阵法帧动画（atlas + 动画定义）
    for (const t of FORMATION_ANIM_TYPES) {
      this.load.atlas(`formation_${t}_atlas`, `sprites/formation_${t}_spin.png`, `sprites/formation_${t}_atlas.json`)
      this.load.json(`formation_${t}_anims`, `sprites/formation_${t}_anims.json`)
    }
    // Sequence texture keys come from registration bundles; missing assets retain static fallback paths.
    for (const fx of FX_ANIMS) {
      for (const textureKey of SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS[fx.key].requiredTextureKeysForRegistration) {
        this.load.image(textureKey, `sprites/${textureKey}.png`)
      }
    }
    // 音频：BGM + 音效（缺失文件走 loaderror 兜底，不影响游戏）
    for (const key of AUDIO_KEYS) {
      this.load.audio(key, audioUrls(key))
    }
    // 黄龙山 NPC 立绘（韩前辈 / 施法光翼 / 乐上师）
    this.load.image('hanli_base', 'sprites/hanli_base.png')
    this.load.image('hanli_cast', 'sprites/hanli_cast.png')
    this.load.image('leshangshi', 'sprites/leshangshi.png')
    // 洞府NPC（统一像素风）
    this.load.image('npc_merchant', 'sprites/npc_merchant.png')
    this.load.image('npc_elder', 'sprites/npc_elder.png')
    this.load.image('npc_blacksmith', 'sprites/npc_blacksmith.png')
    this.load.image('npc', 'sprites/npc.png')
    // 新怪物
    this.load.image('m_spirit_fox', 'sprites/m_spirit_fox.png')
    this.load.image('m_demon_general', 'sprites/m_demon_general.png')
    this.load.image('m_stone_guardian', 'sprites/m_stone_guardian.png')
    // Phase 7: 剧情线 NPC 立绘（64x64 PNG 透明背景）
    this.load.image('npc_sword_sage', 'sprites/story/npc_sword_sage.png')
    this.load.image('npc_alchemist_grandma', 'sprites/story/npc_alchemist_grandma.png')
    this.load.image('npc_demon_sealer', 'sprites/story/npc_demon_sealer.png')
    this.load.image('npc_wandering_cloud', 'sprites/story/npc_wandering_cloud.png')
    this.load.image('npc_spirit_tamer', 'sprites/story/npc_spirit_tamer.png')
    // Phase 7: 坐骑灵驹（基础图 + 4帧序列 + 精灵表）
    this.load.image('mount_spirit_horse', 'sprites/mount_spirit_horse.png')
    this.load.spritesheet('mount_spirit_horse_anim', 'sprites/mount_spirit_horse_sheet.png', { frameWidth: 64, frameHeight: 64 })
    // Phase 7: 秘境原住民部落精灵（基础图 + 4帧序列 + 精灵表）
    for (const tribe of ['spirit_beast', 'ancient_human', 'elemental', 'shadow_folk', 'crystal_people']) {
      this.load.image(`tribe_${tribe}`, `sprites/tribes/tribe_${tribe}.png`)
      this.load.spritesheet(`tribe_${tribe}_anim`, `sprites/tribes/tribe_${tribe}_sheet.png`, { frameWidth: 64, frameHeight: 64 })
    }
  }

  private extractAtlasFrames() {
    const atlasKeys = ['atlas_main', 'atlas_v4_1', 'atlas_v4_2', 'atlas_xian', 'atlas_terrain']
    for (const atlasKey of atlasKeys) {
      if (!this.textures.exists(atlasKey)) continue
      const atlas = this.textures.get(atlasKey)
      const sourceImage = atlas.getSourceImage() as HTMLImageElement | HTMLCanvasElement
      const frameNames = atlas.getFrameNames()
      for (const name of frameNames) {
        if (this.textures.exists(name)) continue
        const frame = atlas.get(name)
        const canvas = document.createElement('canvas')
        canvas.width = frame.cutWidth
        canvas.height = frame.cutHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(sourceImage, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, frame.cutWidth, frame.cutHeight)
        this.textures.addCanvas(name, canvas)
      }
    }
  }

  create() {
    // 将 create() 分为 10 个步骤，每步之间延迟一帧让进度条可见
    const steps: (() => void)[] = [
      // Step 1: 生成缺失贴图
      () => {
        if (this.isMinitool) {
          this.extractAtlasFrames()
          const missing = SPRITE_KEYS.filter(k => !this.textures.exists(k))
          generateMissing(this, missing)
        } else {
          generateMissing(this, this.failedKeys)
        }
        this.setLoadingText('正在凝聚灵脉...')
      },
      // Step 2: 音频初始化 + 贴图变体
      () => {
        audioInit(this.sound)
        playBgm(BGM_TITLE)
    // 预生成地面/墙体暗色变体贴图（canvas 合成，WebGL 下安全；丰富地面层次用）
    const variantOf = (src: string) => {
      const key = `${src}_d`
      if (this.textures.exists(key) || !this.textures.exists(src)) return
      const img = this.textures.get(src).getSourceImage() as HTMLImageElement | HTMLCanvasElement
      const c = document.createElement('canvas')
      c.width = img.width as number
      c.height = img.height as number
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = '#b8c0d8'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(img, 0, 0)
      this.textures.addCanvas(key, c)
    }
    for (const r of REGIONS) { variantOf(r.floorTex); variantOf(r.wallTex) }
        this.setLoadingText('正在炼化法阵...')
      },
      // Step 3: AI 贴图背景移除
      () => {
    // AI 生成装饰物背景移除（.jpg → 透明 .png 效果）
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
      // 采样四角颜色作为背景色
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
          px[i + 3] = 0 // 透明
        } else if (dr + dg + db < threshold * 6) {
          // 边缘半透明过渡
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
        this.setLoadingText('正在注册剑灵...')
      },
      // Step 4: 角色动画 + 灵兽动画注册
      () => {
    // 注册角色动画（atlas 与动画定义都成功加载时）
    for (const cls of ANIM_CLASSES) {
      if (!this.textures.exists(`${cls}_atlas`)) { console.warn(`[anim] ${cls}_atlas missing`); continue }
      const tex = this.textures.get(`${cls}_atlas`)
      const testFrame = `${cls}_down_idle_00`
      const hasFrame = tex && tex.has ? tex.has(testFrame) : false
      if (!hasFrame) { console.warn(`[anim] ${cls} frame ${testFrame} NOT in texture!`); continue }
      const defs = this.cache.json.get(`${cls}_anims`) as Record<string, Phaser.Types.Animations.Animation> | undefined
      if (!defs) { console.warn(`[anim] ${cls}_anims missing`); continue }
      for (const def of Object.values(defs)) {
        if (!this.anims.exists(def.key!)) this.anims.create(def)
      }
    }
    // 注册灵兽动画
    for (const id of BEAST_ANIM_IDS) {
      const atlasKey = `beast_${id}_atlas`
      const animsKey = `beast_${id}_anims`
      if (!this.textures.exists(atlasKey)) { console.warn(`[beast-anim] ${atlasKey} missing`); continue }
      const tex = this.textures.get(atlasKey)
      const testFrame = `beast_${id}_idle_00`
      const hasFrame = tex && tex.has ? tex.has(testFrame) : false
      if (!hasFrame) { console.warn(`[beast-anim] ${id} frame ${testFrame} NOT in texture!`); continue }
      const defs = this.cache.json.get(animsKey) as Record<string, Phaser.Types.Animations.Animation> | undefined
      if (!defs) { console.warn(`[beast-anim] ${animsKey} missing`); continue }
      for (const def of Object.values(defs)) {
        if (!this.anims.exists(def.key!)) this.anims.create(def)
      }
    }
        this.setLoadingText('正在唤醒灵兽...')
      },
      // Step 5: 阵法动画注册
      () => {
    // 注册阵法动画
    for (const t of FORMATION_ANIM_TYPES) {
      const atlasKey = `formation_${t}_atlas`
      const animsKey = `formation_${t}_anims`
      if (!this.textures.exists(atlasKey)) { console.warn(`[form-anim] ${atlasKey} missing`); continue }
      const tex = this.textures.get(atlasKey)
      const testFrame = `formation_${t}_spin_00`
      const hasFrame = tex && tex.has ? tex.has(testFrame) : false
      if (!hasFrame) { console.warn(`[form-anim] ${t} frame ${testFrame} NOT in texture!`); continue }
      const defs = this.cache.json.get(animsKey) as Record<string, Phaser.Types.Animations.Animation> | undefined
      if (!defs) { console.warn(`[form-anim] ${animsKey} missing`); continue }
      for (const def of Object.values(defs)) {
        if (!this.anims.exists(def.key!)) this.anims.create(def)
      }
    }
        this.setLoadingText('正在布设阵法...')
      },
      // Step 6: 坐骑 + 部落动画
      () => {
    // Phase 7: 注册坐骑灵驹奔跑动画（4帧）
    if (this.textures.exists('mount_spirit_horse_anim')) {
      const mountFrames: { key: string; frame: number }[] = []
      for (let f = 0; f < 4; f++) mountFrames.push({ key: 'mount_spirit_horse_anim', frame: f })
      if (!this.anims.exists('mount_spirit_horse_gallop')) {
        this.anims.create({ key: 'mount_spirit_horse_gallop', frames: mountFrames, frameRate: 8, repeat: -1 })
      }
    }
    // Phase 7: 注册部落待机动画（5类 × 4帧）
    for (const tribe of ['spirit_beast', 'ancient_human', 'elemental', 'shadow_folk', 'crystal_people']) {
      const ssKey = `tribe_${tribe}_anim`
      if (!this.textures.exists(ssKey)) continue
      const animKey = `tribe_${tribe}_idle`
      if (this.anims.exists(animKey)) continue
      const frames: { key: string; frame: number }[] = []
      for (let f = 0; f < 4; f++) frames.push({ key: ssKey, frame: f })
      this.anims.create({ key: animKey, frames, frameRate: 4, repeat: -1 })
    }
        this.setLoadingText('正在铭刻神通...')
      },
      // Step 7: 序列帧特效动画注册
      () => {
    // Registration bundles and runtime playback contracts are intentionally separate.
    // Sword registration remains atomic over sword_proj_1..8, while each runtime
    // route validates only the frames the target animation actually consumes.
    const resourceBundleReadyForRegistration = (resourceBundleKey: SequenceResourceBundleRegistrationKey) => {
      const bundle = SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS[resourceBundleKey]
      if (hasCompleteSequenceResourceBundleForRegistration(resourceBundleKey, (textureKey) => this.textures.exists(textureKey))) return true
      const missingTextureKey = bundle.requiredTextureKeysForRegistration
        .find((textureKey) => !this.textures.exists(textureKey))
      if (missingTextureKey && import.meta.env.DEV) {
        console.warn(`[fx] ${resourceBundleKey} 注册资源包不完整（缺 ${missingTextureKey}），已降级到静态兜底`)
      }
      return false
    }
    const createSequenceAnimation = (animationKey: keyof typeof SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS, frameRate: number, repeat: number) => {
      if (this.anims.exists(animationKey)) return
      this.anims.create({
        key: animationKey,
        frames: SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS[animationKey]
          .requiredTextureKeysForPlayback
          .map((key) => ({ key })),
        frameRate,
        repeat,
      })
    }
    if (resourceBundleReadyForRegistration('sword_proj')) {
      createSequenceAnimation('sword_proj_fly', 10, -1)
      createSequenceAnimation('sword_proj_loop', 10, -1)
      createSequenceAnimation('sword_proj_hit', 12, 0)
    }
    if (resourceBundleReadyForRegistration('slash')) createSequenceAnimation('slash_anim', 12, 0)
    // 批量单段特效动画（Tier1+2）：帧齐全才注册；未注册时调用点自动降级到静态兜底（零回归）
    for (const fx of FX_ANIMS) {
      if (!('anim' in fx) || !fx.anim) continue              // 多段动画由上方硬编码块处理
      if (!resourceBundleReadyForRegistration(fx.key)) continue // 帧缺失 → 不注册 → 零回归
      if (this.anims.exists(fx.key)) continue                 // 幂等守卫
      this.anims.create({
        key: fx.key,
        frames: SEQUENCE_ANIMATION_PLAYBACK_CONTRACTS[fx.key]
          .requiredTextureKeysForPlayback
          .map((key) => ({ key })),
        frameRate: fx.anim.frameRate,
        repeat: fx.anim.repeat,
      })
    }
        this.setLoadingText('正在注入仙法...')
      },
      // Step 8: 加载存档 + 初始化 UI + 启动标题
      () => {
        const state = loadGame()
        this.registry.set('state', state)
        initUI(state, () => {})
        this.setLoadingText('灵气充盈，仙途将启...')
        this.updateProgress(1)
        this.time.delayedCall(200, () => {
          this.scene.start('Title')
        })
      },
    ]

    // 逐步执行，每步之间延迟一帧让进度条可见
    let stepIndex = 0
    const runNextStep = () => {
      if (stepIndex >= steps.length) return
      steps[stepIndex]()
      this.advanceCreateProgress()
      stepIndex++
      if (stepIndex < steps.length) {
        this.time.delayedCall(1, runNextStep)
      }
    }
    runNextStep()
  }

  /** 更新加载文字 */
  private setLoadingText(text: string) {
    if (this.loadingText) this.loadingText.setText(text)
  }
}
