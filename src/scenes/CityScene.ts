// ---------- 大城池 · 天枢城：坊市拍卖 / 擂台PK / 荣誉兑换 / 任务NPC ----------

import Phaser from 'phaser'
import { Player } from '../entities'
import { input } from '../input'
import { makeRng, randInt, rollEquip, rollSetPiece, type EquipItem } from '../core'
import { CLASSES, ITEM_BASES, ITEM_BASE_MAP, QUALITY_NAMES, SETS, SLOT_KEYS, type SlotKey } from '../data'
import { calcStats, currentHp } from '../effects'
import { saveGame, type GameState } from '../state'
import {
  dialogOpen, modalPanel, openInventory, panelOpen, resetControls, setFloorText, showDialog, toast, updateHUD, closePanel,
} from '../ui'
import { BGM_CITY, playBgm, sfx } from '../audio'
import { initNpcStates, updateNpcGrowth } from '../npc-system'
import { tryCompleteQuest, getQuestHudText } from '../storyline-system'

const WORLD_W = 720
const WORLD_H = 960
const BOUNDS = { x: 8, y: 8, w: WORLD_W - 16, h: WORLD_H - 16 }

type CityNpcId = 'auctioneer' | 'arena' | 'honor' | 'quest1' | 'quest2' | 'quest3' | 'city_lord' | 'champion'

interface CityNpc {
  id: CityNpcId
  name: string
  spr: Phaser.Physics.Arcade.Sprite
}

interface CityQuest {
  id: string
  npc: CityNpcId
  name: string
  desc: string
  req: { kills?: number; arenaWins?: number; level?: number; gold?: number }
  progress: (s: GameState) => string
  complete: (s: GameState) => boolean
  reward: (s: GameState) => string
  rewardHonor: number
  rewardGold: number
}

const CITY_QUESTS: CityQuest[] = [
  {
    id: 'cq_kill50', npc: 'quest1', name: '妖兽清剿令',
    desc: '累计击杀 50 只妖兽，维护天枢城周边治安。',
    req: { kills: 50 },
    progress: (s) => `${s.totalKills} / 50 击杀`,
    complete: (s) => s.totalKills >= 50,
    reward: (s) => { const r = '灵石+500'; return r },
    rewardHonor: 30,
    rewardGold: 500,
  },
  {
    id: 'cq_arena5', npc: 'quest2', name: '擂台新秀',
    desc: '在擂台赛中获胜 5 场，证明你的实力。',
    req: { arenaWins: 5 },
    progress: (s) => `${s.arenaWins} / 5 胜场`,
    complete: (s) => s.arenaWins >= 5,
    reward: (s) => '荣誉+50',
    rewardHonor: 50,
    rewardGold: 300,
  },
  {
    id: 'cq_level20', npc: 'quest3', name: '境界突破',
    desc: '将修为提升至 20 级（金丹期），方有资格领取此令。',
    req: { level: 20 },
    progress: (s) => `Lv.${s.level} / Lv.20`,
    complete: (s) => s.level >= 20,
    reward: (s) => '荣誉+40, 灵石+800',
    rewardHonor: 40,
    rewardGold: 800,
  },
  {
    id: 'cq_kill200', npc: 'quest1', name: '百战之修',
    desc: '累计击杀 200 只妖兽，成为天枢城认可的战修。',
    req: { kills: 200 },
    progress: (s) => `${s.totalKills} / 200 击杀`,
    complete: (s) => s.totalKills >= 200,
    reward: (s) => '荣誉+60',
    rewardHonor: 60,
    rewardGold: 600,
  },
  {
    id: 'cq_arena15', npc: 'quest2', name: '擂台高手',
    desc: '在擂台赛中获胜 15 场，名震天枢。',
    req: { arenaWins: 15 },
    progress: (s) => `${s.arenaWins} / 15 胜场`,
    complete: (s) => s.arenaWins >= 15,
    reward: (s) => '荣誉+80',
    rewardHonor: 80,
    rewardGold: 500,
  },
  {
    id: 'cq_level40', npc: 'quest3', name: '元婴大道',
    desc: '将修为提升至 40 级，触摸元婴大道之境。',
    req: { level: 40 },
    progress: (s) => `Lv.${s.level} / Lv.40`,
    complete: (s) => s.level >= 40,
    reward: (s) => '荣誉+100, 灵石+2000',
    rewardHonor: 100,
    rewardGold: 2000,
  },
]

const RANK_NAMES = ['初入擂台', '铜牌斗士', '银牌斗士', '金牌斗士', '王者斗士']
const RANK_HONOR = [10, 20, 35, 55, 80]  // 每段位胜利奖励荣誉点

const HONOR_SETS: { id: string; name: string; cost: number; pieces: string[]; desc: string }[] = [
  { id: 'set_honor_warrior', name: '斗战圣铠', cost: 200, pieces: ['w_honor1', 'h_honor1', 'a_honor1', 'b_honor1'], desc: '2件: 攻击+15% / 4件: 攻击化为烈焰斩（前方扇形范围灼烧）' },
  { id: 'set_honor_guardian', name: '守护灵铠', cost: 200, pieces: ['w_honor2', 'h_honor2', 'a_honor2', 'b_honor2'], desc: '2件: 防御+20%, 气血+15% / 4件: 受击反弹（荆棘反伤）' },
  { id: 'set_honor_hunter', name: '猎神之翼', cost: 250, pieces: ['w_honor3', 'h_honor3', 'a_honor3', 'b_honor3'], desc: '2件: 攻速+20%, 会心+8% / 4件: 攻击化为穿甲连射（穿透敌阵）' },
]

export class CityScene extends Phaser.Scene {
  private state!: GameState
  private player!: Player
  private npcs: CityNpc[] = []
  private portal!: Phaser.GameObjects.Sprite
  private nearNpc: CityNpcId | null = null
  private entering = false
  private walls: Phaser.GameObjects.Rectangle[] = []
  private npcGrowTimer = 0

  constructor() { super('City') }

  create() {
    this.state = this.registry.get('state')
    this.state.hp = -1
    this.state.lastScene = 'City'
    this.state.lastSceneData = {}
    saveGame(this.state)
    playBgm(BGM_CITY)
    setFloorText('天枢城')
    this.entering = false
    this.npcs = []
    this.walls = []
    this.npcGrowTimer = 0
    initNpcStates(this.state)

    const questHud = this.add.text(4, 4, getQuestHudText(this.state), {
      fontSize: '8px', color: '#fbbf24', backgroundColor: '#00000088',
      padding: { x: 4, y: 2 },
    }).setOrigin(0, 0).setDepth(10)

    this.time.delayedCall(800, () => {
      tryCompleteQuest(this.state).then(() => {
        questHud.setText(getQuestHudText(this.state))
      })
    })

    // 背景：俯视RPG城池大地图 (720×960)
    if (this.textures.exists('city_map')) {
      const mapImg = this.add.image(WORLD_W / 2, WORLD_H / 2, 'city_map').setDepth(0)
      mapImg.setDisplaySize(WORLD_W, WORLD_H)
    } else if (this.textures.exists('city_bg')) {
      this.add.image(WORLD_W / 2, WORLD_H / 2, 'city_bg').setDepth(0)
    } else {
      this.drawCityBackground()
    }

    // 区域标签
    const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '11px', color: '#f0e8d0',
      stroke: '#000', strokeThickness: 3,
    }
    this.add.text(WORLD_W / 2, 50, '城主府', labelStyle).setOrigin(0.5).setDepth(1)
    this.add.text(120, 190, '悬赏堂', { ...labelStyle, fontSize: '10px' }).setOrigin(0.5).setDepth(1)
    this.add.text(600, 190, '荣誉阁', { ...labelStyle, fontSize: '10px' }).setOrigin(0.5).setDepth(1)
    this.add.text(150, 560, '坊  市', { ...labelStyle, fontSize: '10px', color: '#e8c86a' }).setOrigin(0.5).setDepth(1)
    this.add.text(570, 560, '擂  台', { ...labelStyle, fontSize: '10px', color: '#ff8866' }).setOrigin(0.5).setDepth(1)
    this.add.text(WORLD_W / 2, 460, '中央广场', { ...labelStyle, fontSize: '9px', color: '#a3e4d7' }).setOrigin(0.5).setDepth(1)

    this.physics.world.setBounds(BOUNDS.x, BOUNDS.y, BOUNDS.w, BOUNDS.h)
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)

    // 建筑物理碰撞体积
    this.addBuildingColliders()

    // 传送阵（城门方向，底部中央）
    this.portal = this.add.sprite(WORLD_W / 2, 880, 'portal').setDepth(2)
    this.tweens.add({ targets: this.portal, alpha: 0.55, duration: 700, yoyo: true, repeat: -1 })
    this.add.text(WORLD_W / 2, 856, '传送阵', { fontSize: '10px', color: '#a3e4d7' }).setOrigin(0.5).setDepth(2)

    // NPC 布局（按俯视大地图功能区域定位）
    // 城主府（正北中轴）
    this.addCityNpc('city_lord', '天枢城主', WORLD_W / 2, 280, this.npcTex('npc_city_lord'))
    // 悬赏堂（西北）
    this.addCityNpc('quest1', '悬赏长老', 120, 300, this.npcTex('npc_quest1'))
    this.addCityNpc('quest2', '游历散人', 120, 480, this.npcTex('npc_quest2'))
    this.addCityNpc('quest3', '宗门执事', 180, 680, this.npcTex('npc_quest3'))
    // 荣誉阁（东北）
    this.addCityNpc('honor', '荣誉商人', 600, 300, this.npcTex('npc_honor'))
    // 坊市（西南）
    this.addCityNpc('auctioneer', '坊市拍卖师', 230, 680, this.npcTex('npc_auctioneer'))
    // 擂台（东南）
    this.addCityNpc('arena', '擂台裁判', 540, 680, this.npcTex('npc_arena'))
    this.addCityNpc('champion', '擂台霸主', 540, 480, this.npcTex('npc_arena_champion'))

    // 玩家（出生在城门入口）
    this.player = new Player(this, WORLD_W / 2, 820, this.state.classId)
    // 城池中角色放大一倍
    const baseScale = this.player.sprite.scaleX
    this.player.sprite.setScale(baseScale * 2)
    this.player.sprite.setCollideWorldBounds(true)
    for (const n of this.npcs) this.physics.add.collider(this.player.sprite, n.spr)
    for (const w of this.walls) this.physics.add.collider(this.player.sprite, w)

    // 相机跟随玩家
    this.cameras.main.startFollow(this.player.sprite, true, 0.08, 0.08)

    this.cameras.main.setBackgroundColor('#0e1a2e')
    document.getElementById('hud')!.style.display = 'block'
    resetControls()
    document.getElementById('btnSkill')!.style.display = 'none'
    document.getElementById('btnRetreat')!.style.display = 'none'
    updateHUD()
    toast('天枢城：坊市、擂台、悬赏，一应俱全', '#a3e4d7')
  }

  /** 添加建筑/装饰碰撞体积 */
  private addBuildingColliders() {
    // 城主府建筑群
    this.addCollider(WORLD_W / 2, 110, 280, 120)
    // 城主府台阶/石狮
    this.addCollider(310, 190, 30, 20)
    this.addCollider(410, 190, 30, 20)
    // 悬赏堂
    this.addCollider(120, 240, 130, 90)
    // 荣誉阁
    this.addCollider(600, 240, 130, 90)
    // 中央纪念碑
    this.addCollider(WORLD_W / 2, 460, 50, 50)
    // 坊市摊位群（多个小碰撞体）
    this.addCollider(100, 620, 60, 40)
    this.addCollider(200, 620, 60, 40)
    this.addCollider(100, 720, 60, 40)
    this.addCollider(200, 720, 60, 40)
    this.addCollider(150, 670, 50, 40)
    // 擂台圆形竞技场
    this.addCollider(565, 650, 180, 150)
    // 城门墙体
    this.addCollider(WORLD_W / 2, 910, 220, 50)
    // 周边城墙
    this.addCollider(4, WORLD_H / 2, 8, WORLD_H)
    this.addCollider(WORLD_W - 4, WORLD_H / 2, 8, WORLD_H)
    this.addCollider(WORLD_W / 2, 4, WORLD_W, 8)
    // 水景（左下角池塘）
    this.addCollider(80, 800, 60, 50)
    // 大树
    this.addCollider(660, 100, 30, 30)
    this.addCollider(60, 400, 30, 30)
    this.addCollider(660, 400, 30, 30)
  }

  /** 创建一个隐形的静态碰撞矩形 */
  private addCollider(x: number, y: number, w: number, h: number) {
    const rect = this.add.rectangle(x, y, w, h, 0x000000, 0).setDepth(0)
    this.physics.add.existing(rect, true)
    this.walls.push(rect)
  }

  private npcTex(key: string): string {
    return this.textures.exists(key) ? key : 'npc'
  }

  /** 程序化绘制城池背景 */
  private drawCityBackground() {
    const g = this.add.graphics().setDepth(0)
    // 夜空渐变
    g.fillStyle(0x0a1530, 1); g.fillRect(0, 0, WORLD_W, WORLD_H)
    g.fillStyle(0x0e1a2e, 0.8); g.fillRect(0, 300, WORLD_W, WORLD_H - 300)
    // 远山轮廓
    g.fillStyle(0x1a2a4a, 0.6)
    g.beginPath()
    g.moveTo(0, 280)
    for (let x = 0; x <= WORLD_W; x += 40) {
      const h = 200 + Math.sin(x * 0.02) * 60 + Math.cos(x * 0.05) * 30
      g.lineTo(x, 280 - (h - 200) * 0.5)
    }
    g.lineTo(WORLD_W, 300); g.lineTo(0, 300); g.closePath(); g.fillPath()
    // 建筑（中式阁楼轮廓）
    const buildings = [
      { x: 40, w: 100, h: 120, y: 420 },
      { x: 200, w: 120, h: 150, y: 400 },
      { x: 380, w: 140, h: 180, y: 380 },
      { x: 580, w: 90, h: 100, y: 430 },
    ]
    for (const b of buildings) {
      g.fillStyle(0x1a2848, 1); g.fillRect(b.x, b.y, b.w, b.h)
      g.fillStyle(0x2a4878, 1)
      g.beginPath()
      g.moveTo(b.x - 6, b.y); g.lineTo(b.x + b.w / 2, b.y - 30); g.lineTo(b.x + b.w + 6, b.y)
      g.closePath(); g.fillPath()
      g.fillStyle(0xffd54a, 0.15)
      g.fillRect(b.x + 12, b.y + 18, b.w - 24, b.h - 30)
      g.fillStyle(0xffd54a, 0.3)
      for (let wy = b.y + 24; wy < b.y + b.h - 12; wy += 20) {
        for (let wx = b.x + 12; wx < b.x + b.w - 12; wx += 18) {
          g.fillRect(wx, wy, 12, 12)
        }
      }
    }
    // 石板地面
    g.fillStyle(0x1a2030, 1); g.fillRect(0, 600, WORLD_W, WORLD_H - 600)
    g.fillStyle(0x222a40, 0.5)
    for (let y = 600; y < WORLD_H; y += 32) {
      for (let x = 0; x < WORLD_W; x += 32) {
        if ((x + y) % 64 === 0) g.fillRect(x, y, 30, 30)
      }
    }
    // 灯笼
    const lanterns = [{ x: 100, y: 300 }, { x: 620, y: 300 }, { x: WORLD_W / 2, y: 360 }]
    for (const l of lanterns) {
      g.fillStyle(0xff6b35, 0.8); g.fillCircle(l.x, l.y, 6)
      g.fillStyle(0xffd54a, 0.2); g.fillCircle(l.x, l.y, 15)
    }
  }

  private addCityNpc(id: CityNpcId, name: string, x: number, y: number, tex: string) {
    const key = this.textures.exists(tex) ? tex : 'npc'
    const spr = this.physics.add.staticSprite(x, y, key)
    const src = this.textures.get(key).getSourceImage() as HTMLImageElement
    const isLarge = src.width > 100
    if (isLarge) {
      const target = 64
      const maxDim = Math.max(src.width, src.height)
      spr.setScale(target / maxDim)
    } else {
      spr.setScale(1.5)
    }
    spr.refreshBody()
    spr.setDepth(2)
    const displayH = isLarge ? src.height * (64 / Math.max(src.width, src.height)) : 16 * 1.5
    this.add.text(x, y - displayH / 2 - 10, name, { fontSize: '10px', color: '#f0d98c', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(3)
    this.npcs.push({ id, name, spr })
  }

  update(time: number, delta: number) {
    input.poll()

    if (input.consumeBag()) {
      if (panelOpen()) { if (!modalPanel()) closePanel() }
      else { this.player.halt(); openInventory() }
    }
    if (panelOpen() || dialogOpen()) { this.player.halt(); return }

    this.player.move(input, calcStats(this.state), time, delta)

    // 最近可交互对象
    let near: CityNpc | null = null
    let nearDist = 46
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, n.spr.x, n.spr.y)
      if (d < nearDist) { nearDist = d; near = n }
    }
    const portalDist = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, this.portal.x, this.portal.y)
    const nearPortal = portalDist < 44 && portalDist < nearDist
    const nearId = nearPortal ? 'portal' : (near?.id ?? null)
    if (nearId !== this.nearNpc) {
      this.nearNpc = nearId as CityNpcId | null
      document.getElementById('btnAct')!.style.display = nearId ? 'flex' : 'none'
    }
    if (nearId && input.consumeAct()) {
      if (nearId === 'portal') this.usePortal()
      else this.talkTo(nearId as CityNpcId)
    }

    updateHUD()

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
  }

  private async usePortal() {
    if (this.entering) return
    this.player.halt()

    const options: { label: string; value: string }[] = [
      { label: '返回洞府', value: 'town' },
      { label: '前往大地图', value: 'world' },
    ]
    if (this.state.sectUnlocked) {
      options.push({ label: '返回宗门', value: 'sect' })
    }

    const choice = await showDialog('传送阵', ['一道幽蓝的传送阵在此闪烁，你想要前往何处？'], options)
    if (!choice) return

    this.entering = true
    sfx('sfx_portal')
    const destText: Record<string, string> = {
      town: '返回洞府……',
      world: '前往大地图……',
      sect: '返回宗门……',
    }
    toast(destText[choice] ?? '传送中……', '#a3e4d7')
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.time.delayedCall(420, () => {
      document.getElementById('btnAct')!.style.display = 'none'
      if (choice === 'world') {
        this.scene.start('World', { fromScene: 'city' })
      } else if (choice === 'sect') {
        this.scene.start('Sect', { fromScene: 'city' })
      } else {
        this.scene.start('Town')
      }
    })
  }

  // ---------- NPC 交互入口 ----------
  private async talkTo(id: CityNpcId) {
    this.player.halt()
    if (id === 'auctioneer') await this.auctionFlow()
    else if (id === 'arena') await this.arenaFlow()
    else if (id === 'honor') await this.honorFlow()
    else if (id === 'city_lord') await this.cityLordFlow()
    else if (id === 'champion') await this.championFlow()
    else await this.cityQuestFlow(id)
    input.clearQueues()
  }

  // ---------- 坊市拍卖 ----------
  private auctionStock: EquipItem[] = []
  private auctionRng = makeRng(0)

  private refreshAuctionStock() {
    this.auctionRng = makeRng((Date.now() % 2147483647) ^ 0xa5c)
    this.auctionStock = []
    // 3 件随机装备 + 1 件高品质套装件
    for (let i = 0; i < 3; i++) {
      this.auctionStock.push(rollEquip(this.auctionRng, 3 + this.state.realm, 15 + this.state.level, this.state.level))
    }
    const setId = ['set_qm', 'set_ym', 'set_zx'][randInt(this.auctionRng, 0, 2)]
    const piece = rollSetPiece(this.auctionRng, setId, 3 + this.state.realm, 15, this.state.level)
    if (piece) this.auctionStock.push(piece)
  }

  private async auctionFlow() {
    if (this.auctionStock.length === 0) this.refreshAuctionStock()
    const lines = [
      '「天枢坊市，珍宝荟萃！每件拍卖品限时独售。」',
      `现有灵石 ${this.state.gold}，荣誉 ${this.state.honor}`,
      '（每次回城自动刷新拍卖品）',
    ]
    const opts = this.auctionStock.map((it, i) => {
      const price = Math.round(it.price * 2.5)
      const affix = it.affixes.length > 0 ? ` [${it.affixes.length}词条]` : ''
      const star = it.star ? ` ${'★'.repeat(it.star)}` : ''
      return { label: `[${QUALITY_NAMES[it.quality]}] ${it.name}${star}${affix} — ${price}灵石`, value: String(i) }
    })
    opts.push({ label: '刷新拍卖品（100灵石）', value: 'refresh' })
    opts.push({ label: '告辞', value: 'bye' })
    const pick = await showDialog('坊市拍卖师', lines, opts)
    input.clearQueues()
    if (!pick || pick === 'bye') return
    if (pick === 'refresh') {
      if (this.state.gold < 100) { toast('灵石不足', '#ff8888'); return }
      this.state.gold -= 100
      this.refreshAuctionStock()
      sfx('sfx_open')
      toast('拍卖品已刷新', '#a3e4d7')
      saveGame(this.state)
      updateHUD()
      await this.auctionFlow()
      return
    }
    const idx = Number(pick)
    const item = this.auctionStock[idx]
    if (!item) return
    const price = Math.round(item.price * 2.5)
    if (this.state.gold < price) { toast(`灵石不足（需 ${price}）`, '#ff8888'); return }
    this.state.gold -= price
    this.state.inventory.push(item)
    this.auctionStock.splice(idx, 1)
    sfx('sfx_equip')
    toast(`购得 ${item.name}！`, '#e8c86a')
    saveGame(this.state)
    updateHUD()
  }

  // ---------- 擂台PK ----------
  private async arenaFlow() {
    const rank = this.state.arenaRank
    const rankName = RANK_NAMES[rank]
    const honorReward = RANK_HONOR[rank]
    const lines = [
      `「来得好！你当前段位：【${rankName}】」`,
      `（1v1：单挑精英敌手，胜者获 ${honorReward} 荣誉点）`,
      `（1vN：群战波次，越往后奖励越高）`,
      `累计胜场：${this.state.arenaWins}（1v1: ${this.state.arena1v1Wins} / 1vN: ${this.state.arena1vNWins}）`,
    ]
    const pick = await showDialog('擂台裁判', lines, [
      { label: `1v1 单挑（${honorReward}荣誉）`, value: '1v1' },
      { label: `1vN 群战（${honorReward * 2}荣誉）`, value: '1vN' },
      { label: '查看段位说明', value: 'rank' },
      { label: '告辞', value: 'bye' },
    ])
    input.clearQueues()
    if (!pick || pick === 'bye') return
    if (pick === 'rank') {
      const rankLines = RANK_NAMES.map((n, i) => `${n}：胜 ${i * 3}场可进阶，胜场奖励 ${RANK_HONOR[i]} 荣誉`)
      await showDialog('擂台段位', rankLines)
      input.clearQueues()
      await this.arenaFlow()
      return
    }
    const subMode = pick as '1v1' | '1vN'
    this.entering = true
    sfx('sfx_portal')
    toast('踏入擂台……', '#ffd54a')
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.time.delayedCall(420, () => {
      document.getElementById('btnAct')!.style.display = 'none'
      this.scene.start('Dungeon', { mode: 'arena', subMode, rank: this.state.arenaRank })
    })
  }

  // ---------- 荣誉兑换 ----------
  private async honorFlow() {
    const lines = [
      '「荣誉点可兑换稀世套装，擂台胜场累积荣誉。」',
      `现有荣誉 ${this.state.honor}`,
    ]
    const opts = HONOR_SETS.map((s) => {
      const owned = this.state.inventory.some((it) => it.setId === s.id) || Object.values(this.state.equipment).some((it) => it?.setId === s.id)
      return { label: `${s.name}（${s.cost}荣誉）${owned ? ' ✓' : ''}`, value: s.id }
    })
    opts.push({ label: '告辞', value: 'bye' })
    const pick = await showDialog('荣誉商人', lines, opts)
    input.clearQueues()
    if (!pick || pick === 'bye') return
    const set = HONOR_SETS.find((s) => s.id === pick)
    if (!set) return
    if (this.state.honor < set.cost) { toast(`荣誉不足（需 ${set.cost}）`, '#ff8888'); return }
    // 检查是否已拥有全套
    const hasAll = set.pieces.every((pid) => {
      const base = ITEM_BASE_MAP.get(pid)
      return base && (this.state.inventory.some((it) => it.baseId === pid) || Object.values(this.state.equipment).some((it) => it?.baseId === pid))
    })
    if (hasAll) { toast('已拥有此套全部部件', '#ff8888'); return }
    // 兑换：随机给一件未拥有的部件
    const missing = set.pieces.filter((pid) => {
      return !this.state.inventory.some((it) => it.baseId === pid) && !Object.values(this.state.equipment).some((it) => it?.baseId === pid)
    })
    if (missing.length === 0) { toast('已拥有此套全部部件', '#ff8888'); return }
    const baseId = missing[randInt(makeRng(Date.now() % 2147483647), 0, missing.length - 1)]
    const base = ITEM_BASE_MAP.get(baseId)
    if (!base) { toast('兑换出错', '#ff8888'); return }
    // 生成装备：品质为灵品（1），使用玩家等级
    const rng = makeRng(Date.now() % 2147483647)
    const item = rollSetPiece(rng, set.id, 3 + this.state.realm, 15, this.state.level)
    if (!item) { toast('兑换出错', '#ff8888'); return }
    this.state.honor -= set.cost
    this.state.inventory.push(item)
    sfx('sfx_equip')
    toast(`兑换获得 ${item.name}！`, '#e8c86a')
    saveGame(this.state)
    updateHUD()
  }

  // ---------- 城池任务系统 ----------
  private async cityQuestFlow(npcId: CityNpcId) {
    const quests = CITY_QUESTS.filter((q) => q.npc === npcId)
    if (quests.length === 0) {
      await showDialog('路人', ['此处无事。'])
      input.clearQueues()
      return
    }
    // 找到第一个未完成的任务
    const quest = quests.find((q) => this.state.quests[q.id] !== 'done') ?? quests[0]
    const st = this.state.quests[quest.id]
    const names: Record<CityNpcId, string> = {
      auctioneer: '拍卖师', arena: '裁判', honor: '商人',
      quest1: '悬赏长老', quest2: '游历散人', quest3: '宗门执事',
      city_lord: '城主', champion: '霸主',
    }
    if (st === 'done') {
      // 检查是否有下一个任务
      const next = quests.find((q) => q !== quest && this.state.quests[q.id] !== 'done')
      if (next) {
        await showDialog(names[npcId], [
          `【${quest.name}】已完成。`,
          `新悬赏：【${next.name}】${next.desc}`,
          `奖励：${next.rewardHonor}荣誉 ${next.rewardGold > 0 ? `+${next.rewardGold}灵石` : ''}`,
        ], [{ label: '接下任务', value: 'yes' }, { label: '再想想', value: 'bye' }])
        input.clearQueues()
        // 简化处理：直接接下
      } else {
        await showDialog(names[npcId], ['当前所有悬赏已完成，多谢道友！'])
        input.clearQueues()
      }
      return
    }
    if (st === 'active') {
      if (quest.complete(this.state)) {
        // 领取奖励
        this.state.quests[quest.id] = 'done'
        this.state.honor += quest.rewardHonor
        this.state.gold += quest.rewardGold
        sfx('sfx_levelup')
        await showDialog(names[npcId], [
          '「好！事情办得漂亮！」',
          `任务【${quest.name}】完成！`,
          `获得 ${quest.rewardHonor} 荣誉点${quest.rewardGold > 0 ? `，${quest.rewardGold} 灵石` : ''}`,
        ])
        toast(`任务完成！荣誉 +${quest.rewardHonor}`, '#e8c86a')
        saveGame(this.state)
        updateHUD()
      } else {
        await showDialog(names[npcId], [
          `【${quest.name}】${quest.desc}`,
          `进度：${quest.progress(this.state)}`,
        ])
      }
      input.clearQueues()
      return
    }
    // 新任务
    const accept = await showDialog(names[npcId], [
      `【${quest.name}】${quest.desc}`,
      `奖励：${quest.rewardHonor} 荣誉${quest.rewardGold > 0 ? ` + ${quest.rewardGold} 灵石` : ''}`,
    ], [{ label: '接下任务', value: 'yes' }, { label: '再想想', value: 'bye' }])
    input.clearQueues()
    if (accept === 'yes') {
      this.state.quests[quest.id] = 'active'
      saveGame(this.state)
      toast(`已接下任务【${quest.name}】`, '#a3e4d7')
    }
  }

  // ---------- 天枢城主 ----------
  private async cityLordFlow() {
    const lordQuest = 'cq_demon_general'
    const st = this.state.quests[lordQuest]
    const done = st === 'done'
    const lines = [
      '「天枢城能有今日之安宁，皆赖诸位道友浴血奋战。」',
      done
        ? '「魔将已诛，天枢城铭记你的功勋。日后若有需要，城门永远为你敞开。」'
        : '「近日擂台方向魔气冲天，有魔将潜伏其中为祸。若道友能在擂台中斩杀魔将，本城主必有重赏。」',
      `当前荣誉：${this.state.honor} ｜ 擂台段位：【${RANK_NAMES[this.state.arenaRank]}】`,
    ]
    if (done) {
      await showDialog('天枢城主', lines)
      input.clearQueues()
      return
    }
    if (st === 'active') {
      const killed = this.state.arena1v1Wins >= 10
      if (killed) {
        this.state.quests[lordQuest] = 'done'
        this.state.honor += 150
        this.state.gold += 3000
        sfx('sfx_levelup')
        await showDialog('天枢城主', [
          '「好！魔将授首，天枢城之患已除！」',
          `任务【讨伐魔将】完成！`,
          `获得 150 荣誉点，3000 灵石！`,
        ])
        toast('任务完成！荣誉 +150，灵石 +3000', '#e8c86a')
        saveGame(this.state)
        updateHUD()
      } else {
        await showDialog('天枢城主', [
          '「魔将尚未伏诛，道友尚需在擂台中多多历练。」',
          `（需在擂台1v1累计获胜10场）当前：${this.state.arena1v1Wins} / 10`,
        ])
      }
      input.clearQueues()
      return
    }
    const accept = await showDialog('天枢城主', [
      ...lines,
      '奖励：150 荣誉 + 3000 灵石',
    ], [{ label: '接下任务', value: 'yes' }, { label: '再想想', value: 'bye' }])
    input.clearQueues()
    if (accept === 'yes') {
      this.state.quests[lordQuest] = 'active'
      saveGame(this.state)
      toast('已接下任务【讨伐魔将】', '#ffd54a')
    }
  }

  // ---------- 擂台霸主 ----------
  private async championFlow() {
    const lines = [
      '「你就是最近在天枢城闯出名号的那位？」',
      '「我在这擂台守了三年，无人能胜。你有胆量来挑战我吗？」',
      `（挑战霸主需 3 胜场门槛，胜则获 200 荣誉 + 特殊装备）`,
      `当前1v1胜场：${this.state.arena1v1Wins}`,
    ]
    const canChallenge = this.state.arena1v1Wins >= 3
    const pick = await showDialog('擂台霸主', lines, [
      { label: canChallenge ? '挑战霸主' : '需3场1v1胜场', value: 'challenge' },
      { label: '告辞', value: 'bye' },
    ])
    input.clearQueues()
    if (pick !== 'challenge' || !canChallenge) return
    this.entering = true
    sfx('sfx_portal')
    toast('霸主挑战开始！', '#ff6b35')
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.time.delayedCall(420, () => {
      document.getElementById('btnAct')!.style.display = 'none'
      this.scene.start('Dungeon', { mode: 'arena', subMode: '1v1', rank: 4 })
    })
  }
}
