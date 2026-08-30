// ---------- 开机画面：标题 + 开始仙途 / 继续前缘 / 查看榜单 ----------

import Phaser from 'phaser'
import { BGM_TITLE, playBgm } from '../audio'
import {
  hasSave, loadGame, newGame, saveGame, switchClass, type GameState,
  listSaveSlots, loadSaveSlot, saveToSlot, deleteSaveSlot, hasSaveSlot,
  MAX_SAVE_SLOTS, getActiveSlot, setActiveSlot, type SaveSlotMeta,
} from '../state'
import { hideTitleMenu, openRecords, showDialog, showInputDialog, showTitleMenu } from '../ui'
import { hasRegisteredSequenceAnimationPlayback } from '../fx/sequence-contract'
import { CLASSES } from '../data'

export class TitleScene extends Phaser.Scene {
  private state!: GameState

  constructor() { super('Title') }

  create() {
    this.state = this.registry.get('state')
    this.buildBackground()
    this.tryVideoBackground()
    playBgm(BGM_TITLE)

    // 隐藏游戏内 HUD 与触控层
    document.getElementById('hud')!.style.display = 'none'
    document.getElementById('controls')!.style.display = 'none'
    document.getElementById('btnSkill')!.style.display = 'none'
    document.getElementById('btnAct')!.style.display = 'none'
    document.getElementById('btnRetreat')!.style.display = 'none'

    showTitleMenu({
      hasSave: hasSave(),
      onNew: () => this.onNewGame(),
      onContinue: () => this.onContinue(),
      onRecords: () => openRecords(),
    })
    this.cameras.main.fadeIn(400, 0, 0, 0)
  }

  /** 继续游戏：显示存档槽列表，选择后加载 */
  private async onContinue() {
    const slots = listSaveSlots()
    if (slots.length === 0) {
      // 向后兼容：无槽位但有旧存档
      Object.assign(this.state, loadGame())
      setActiveSlot(-1)
      this.startGame()
      return
    }
    const options = slots.map((m) => ({
      label: `[${m.index + 1}] ${m.heroName} · ${CLASSES[m.classId]?.name ?? m.classId} · Lv.${m.level}（${new Date(m.updatedAt).toLocaleDateString()}）`,
      value: String(m.index),
    }))
    options.push({ label: '返回', value: 'back' })
    const choice = await showDialog('继续仙途', ['选择要继续的存档：'], options)
    if (choice === null || choice === 'back') return
    const slotIndex = parseInt(choice, 10)
    const loaded = loadSaveSlot(slotIndex)
    if (loaded) {
      Object.assign(this.state, loaded)
      this.startGame()
    }
  }

  private async onNewGame() {
    // 选择存档槽位
    const slots = listSaveSlots()
    const slotOptions: Array<{ label: string; value: string }> = []
    for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
      const existing = slots.find((s) => s.index === i)
      if (existing) {
        slotOptions.push({
          label: `[${i + 1}] ${existing.heroName} · ${CLASSES[existing.classId]?.name ?? existing.classId} · Lv.${existing.level}（覆盖）`,
          value: String(i),
        })
      } else {
        slotOptions.push({ label: `[${i + 1}] 空位`, value: String(i) })
      }
    }
    slotOptions.push({ label: '返回', value: 'back' })
    const slotChoice = await showDialog('选择存档位', ['请选择新角色的存档槽位：'], slotOptions)
    if (slotChoice === null || slotChoice === 'back') return
    const slotIndex = parseInt(slotChoice, 10)

    // 如果覆盖已有存档，确认
    if (hasSaveSlot(slotIndex)) {
      const c = await showDialog('覆盖存档', [
        `此操作将覆盖槽位 ${slotIndex + 1} 的存档，确定继续？`,
        '（仙途榜单的历史纪录会保留）',
      ], [
        { label: '确认覆盖', value: 'yes' },
        { label: '再想想', value: 'no' },
      ])
      if (c !== 'yes') return
      deleteSaveSlot(slotIndex)
    }

    // 选择职业
    const classChoice = await showDialog('选择仙途', [
      '你即将踏上修仙之路，请选择本命修行道统：',
    ], [
      { label: '剑修 — 刚猛近战，均衡成长', value: 'sword' },
      { label: '仙子 — 高攻灵法，脆皮爆发', value: 'fairy' },
      { label: '法修 — 符箓通玄，法术绵长', value: 'mage' },
      { label: '道修 — 厚血重防，稳如泰山', value: 'sword_new' },
      { label: '合欢 — 极限输出，会心致命', value: 'fairy_new' },
      { label: '随机结缘', value: 'random' },
    ])
    if (classChoice === null) return
    let picked = classChoice
    if (picked === 'random') {
      const ids = Object.keys(CLASSES)
      picked = ids[Math.floor(Math.random() * ids.length)]
    }
    if (!picked || !CLASSES[picked]) return

    // 输入角色名称
    const nameInput = await showInputDialog('道号', [
      `请为你的${CLASSES[picked].name}取一个道号：`,
    ], '', '无名散修')
    const heroName = nameInput || '无名散修'

    // 创建新角色并保存到槽位
    Object.assign(this.state, newGame())
    switchClass(this.state, picked, CLASSES[picked].defaultStyle)
    this.state.heroName = heroName
    saveToSlot(slotIndex, this.state)
    this.startGame()
  }

  private startGame() {
    hideTitleMenu()
    this.stopVideoBackground()
    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.time.delayedCall(320, () => this.scene.start('Town'))
  }

  /**
   * 视频背景（可选增强）：存在 sprites/title_bg.mp4 时静音循环播放。
   * 三级兜底：视频 → title_bg.png → 程序化夜景；探测失败或自动播放被拦截时保持下层背景。
   */
  private tryVideoBackground() {
    const video = document.getElementById('titleVideo') as HTMLVideoElement | null
    if (!video) return
    video.src = 'sprites/title_bg.mp4'
    video.addEventListener('playing', () => { video.style.display = 'block' }, { once: true })
    video.addEventListener('error', () => { /* 视频文件不存在或加载失败：保持静态背景 */ }, { once: true })
    video.play().catch(() => { /* 自动播放被拦截：保持静态背景 */ })
  }

  private stopVideoBackground() {
    const video = document.getElementById('titleVideo') as HTMLVideoElement | null
    if (!video) return
    video.pause()
    video.style.display = 'none'
  }

  /** 背景：优先用外部 title_bg.png；缺失时程序化绘制像素夜景 */
  private buildBackground() {
    if (this.textures.exists('title_bg')) {
      const img = this.add.image(180, 320, 'title_bg').setDepth(0)
      const s = Math.max(360 / img.width, 640 / img.height)  // cover 竖屏视口
      img.setScale(s)
      return
    }
    const g = this.add.graphics().setDepth(0)
    // 夜空渐变（上深下浅）
    const steps = 32
    for (let i = 0; i < steps; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        new Phaser.Display.Color(7, 10, 24), new Phaser.Display.Color(43, 58, 96), steps - 1, i)
      g.fillStyle(Phaser.Display.Color.GetColor(Math.round(c.r), Math.round(c.g), Math.round(c.b)), 1)
      g.fillRect(0, (i / steps) * 640, 360, 640 / steps + 1)
    }
    // 星点
    for (let i = 0; i < 70; i++) {
      g.fillStyle(0xffffff, 0.15 + Math.random() * 0.65)
      const s = Math.random() < 0.12 ? 2 : 1
      g.fillRect(Math.floor(Math.random() * 360), Math.floor(Math.random() * 380), s, s)
    }
    // 圆月与月晕
    g.fillStyle(0xf5e6b8, 0.15).fillCircle(282, 104, 40)
    g.fillStyle(0xf5e6b8, 1).fillCircle(282, 104, 24)
    g.fillStyle(0xe0cd94, 1).fillCircle(275, 98, 5)
    g.fillCircle(289, 110, 3)
    // 远山剪影（三重）
    g.fillStyle(0x141b2e, 1)
    g.fillTriangle(-20, 640, 70, 360, 180, 640)
    g.fillTriangle(120, 640, 230, 400, 340, 640)
    g.fillStyle(0x0e1424, 1)
    g.fillTriangle(40, 640, 150, 440, 270, 640)
    g.fillTriangle(220, 640, 310, 460, 400, 640)
    // 主峰（青冥山）与山门灯火
    g.fillStyle(0x0a0f1d, 1)
    g.fillTriangle(90, 640, 195, 330, 310, 640)
    g.fillStyle(0xf0c987, 0.9)
    g.fillRect(193, 420, 3, 3)
    g.fillRect(188, 468, 2, 2)
    g.fillRect(200, 462, 2, 2)
    // 飘云（缓动氛围）
    for (const [x, y, w, d] of [[40, 150, 90, 26], [220, 210, 110, 34], [90, 300, 70, 22]] as const) {
      const cloud = this.add.graphics().setDepth(1)
      cloud.fillStyle(0x8fa4c8, 0.12)
      cloud.fillEllipse(0, 0, w, d)
      cloud.x = x; cloud.y = y
      this.tweens.add({ targets: cloud, x: x + 26, duration: 6000 + Math.random() * 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    }
    // 偶有剑光掠过
    const swordFramesReady = hasRegisteredSequenceAnimationPlayback('sword_proj_fly', {
      animationRegistered: this.anims.exists('sword_proj_fly'),
      textureExists: (key) => this.textures.exists(key),
    })
    const bolt = swordFramesReady
      ? this.add.sprite(-30, 0, 'sword_proj_3').setDepth(1).setAlpha(0.85).setTint(0xf0d98c).setScale(1.23).play('sword_proj_fly')
      : this.add.image(-30, 0, 'sword_proj').setDepth(1).setAlpha(0.85).setTint(0xf0d98c).setScale(1.23)
    const flyAcross = () => {
      const y = 90 + Math.random() * 220
      bolt.setPosition(-30, y).setRotation(0).setAlpha(0.85)
      this.tweens.add({
        targets: bolt, x: 400, duration: 1400, ease: 'Cubic.easeIn',
        onComplete: () => this.time.delayedCall(2600 + Math.random() * 3000, flyAcross),
      })
    }
    this.time.delayedCall(1500, flyAcross)
  }
}
