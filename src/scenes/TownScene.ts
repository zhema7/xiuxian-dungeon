import Phaser from 'phaser'
import { Player } from '../entities'
import { input } from '../input'
import { makeRng, randInt, rollEquip, REFINE_MAX, STAR_MAX, refineCost, starUpCost, rollRefineAffix, type EquipItem } from '../core'
import { CLASSES, DIFFICULTIES, difficultyById, SKILLS, SLOT_KEYS, type SlotKey } from '../data'
import { calcStats } from '../effects'
import { saveGame, switchClass, loadSaveSlot, type GameState } from '../state'
import {
  addMemberToState, countActive, findMemberByRef, hasMemberRef, makeSisterMember,
  PARTY_RULES, removeMemberFromState, sortParty, toggleMemberInState,
} from '../party'
import { unlearnedSkills } from '../skills'
import { canEnterXianRealm, xianCheckpointFloor, XIAN_START_FLOOR } from '../xian-realm'
import {
  dialogOpen, modalPanel, openGmPanel, openInventory, openSettings, openShop, panelOpen, resetControls, setFloorText, setSettingsCallbacks, setTribulationCallback, showDialog, toast, updateHUD, closePanel,
  type ShopStock,
} from '../ui'
import { BGM_TOWN, playBgm, sfx, stopBgm } from '../audio'
import {
  addFavor, favorOf, giftFavor, GIFTS, NPC_PREFS, QUESTS,
  SISTER_JOIN_FAVOR, shopDiscount, tierOf,
} from '../favor'
import { initNpcStates, updateNpcGrowth } from '../npc-system'
import { tryCompleteQuest, initMainQuest, getQuestHudText, openQuestLog } from '../storyline-system'
import { ACHIEVEMENTS, checkAchievements, getAchievementProgress, getAchievementCount, categoryName, type AchievementCategory } from '../achievement-system'
import { refreshDailyQuests, claimDailyReward, getDailyQuestStats, updateDailyProgress, type DailyQuestType } from '../daily-quest'
import { createMerchant, shouldRefreshMerchant, getSellPrice, type MerchantData } from '../merchant-system'

const BOUNDS = { x: 16, y: 64, w: 328, h: 480 }

type NpcId = 'elder' | 'merchant' | 'sister' | 'blacksmith' | 'city'

interface TownNpc {
  id: NpcId
  name: string
  spr: Phaser.Physics.Arcade.Sprite
}

export class TownScene extends Phaser.Scene {
  private state!: GameState
  private player!: Player
  private npcs: TownNpc[] = []
  private portal!: Phaser.GameObjects.Sprite
  private cityPortal!: Phaser.GameObjects.Container
  private hlPortal!: Phaser.GameObjects.Container
  private worldPortal!: Phaser.GameObjects.Container
  private ladderPortal!: Phaser.GameObjects.Container
  private furnace!: Phaser.GameObjects.Image
  private entering = false
  private nearNpc: NpcId | null = null
  private shopStock!: ShopStock
  private talked = new Set<string>()  // 本次回城已寒暄过的 NPC
  private gmByeCount = 0              // 彩蛋计数：连续与商人告辞的次数
  private merchantData: MerchantData | null = null
  private npcGrowTimer = 0            // NPC 修炼成长计时器
  private questHudText: Phaser.GameObjects.Text | null = null
  private questLogShown = false

  constructor() { super('Town') }

  create() {
    this.state = this.registry.get('state')
    this.state.hp = -1 // 回城回满
    this.state.lastScene = 'Town'
    this.state.lastSceneData = {}
    saveGame(this.state)

    // 从大地图进入的地下城返回时，自动跳回大地图
    if (this.registry.get('dungeonReturnScene') === 'World') {
      this.registry.set('dungeonReturnScene', null)
      this.scene.start('World', { fromScene: 'dungeon' })
      return
    }

    playBgm(BGM_TOWN)
    setFloorText('洞府 · 青冥山脚')
    this.entering = false
    this.npcs = []

    // 商店库存（每次回城刷新，商人好感带来折扣）
    const rng = makeRng(Date.now() % 2147483647)
    const disc = shopDiscount(favorOf(this.state, 'merchant'))
    const equips = [0, 1, 2].map(() => {
      const item = rollEquip(rng, 2 + this.state.realm, 10, this.state.level)
      return { item, price: Math.round(item.price * 3 * disc) }
    })
    const unlearned = unlearnedSkills(this.state)
    this.shopStock = {
      potionPrice: Math.round(20 * disc),
      equips,
      book: unlearned.length > 0
        ? { skillId: unlearned[randInt(rng, 0, unlearned.length - 1)], price: Math.round(150 * disc) }
        : null,
    }

    // 地面（有洞府背景图时直接使用整图，否则程序化铺地）
    if (this.textures.exists('cave_bg')) {
      this.add.image(180, 320, 'cave_bg').setDepth(0)
    } else {
      const rt = this.add.renderTexture(0, 0, this.scale.gameSize.width, this.scale.gameSize.height).setOrigin(0).setDepth(0)
      for (let y = 0; y < this.scale.gameSize.height; y += 16)
        for (let x = 0; x < this.scale.gameSize.width; x += 16) rt.draw('grass', x + 8, y + 8)
      for (let y = 96; y < 560; y += 16) rt.draw('stone', 176, y + 8)
    }

    this.physics.world.setBounds(BOUNDS.x, BOUNDS.y, BOUNDS.w, BOUNDS.h)

    // 传送门（主殿入口台阶下）
    this.portal = this.add.sprite(76, 364, 'portal').setDepth(2)
    this.tweens.add({ targets: this.portal, alpha: 0.55, duration: 700, yoyo: true, repeat: -1 })
    this.add.text(76, 340, '历练传送门', { fontSize: '10px', color: '#a3e4d7' }).setOrigin(0.5).setDepth(2)

    // 黄龙山秘境入口（洞府右上方，环形绿色传送法阵）
    {
      const g = this.add.graphics()
      g.lineStyle(2, 0x48e08a, 0.9)
      g.strokeCircle(0, 0, 16)
      g.lineStyle(1, 0x48e08a, 0.55)
      g.strokeCircle(0, 0, 11)
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2
        g.fillStyle(0x9ff0c0, 0.95)
        g.fillCircle(Math.cos(a) * 16, Math.sin(a) * 16, 2)
      }
      const glow = this.add.graphics()
      glow.fillStyle(0x48e08a, 0.16)
      glow.fillCircle(0, 0, 13)
      this.hlPortal = this.add.container(316, 100, [glow, g]).setDepth(2)
      this.tweens.add({ targets: g, angle: 360, duration: 6000, repeat: -1 })
      this.tweens.add({ targets: glow, alpha: 0.4, scale: 1.15, duration: 900, yoyo: true, repeat: -1 })
      this.add.text(316, 72, '黄龙山秘境', { fontSize: '10px', color: '#7dffb0' }).setOrigin(0.5).setDepth(2)
    }

    // 天枢城入口（洞府左侧，金色传送法阵）
    {
      const g2 = this.add.graphics()
      g2.lineStyle(2, 0xffd54a, 0.9)
      g2.strokeCircle(0, 0, 16)
      g2.lineStyle(1, 0xffd54a, 0.55)
      g2.strokeCircle(0, 0, 11)
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2
        g2.fillStyle(0xfff3a0, 0.95)
        g2.fillCircle(Math.cos(a) * 16, Math.sin(a) * 16, 2)
      }
      const glow2 = this.add.graphics()
      glow2.fillStyle(0xffd54a, 0.16)
      glow2.fillCircle(0, 0, 13)
      this.cityPortal = this.add.container(316, 180, [glow2, g2]).setDepth(2)
      this.tweens.add({ targets: g2, angle: -360, duration: 5000, repeat: -1 })
      this.tweens.add({ targets: glow2, alpha: 0.4, scale: 1.15, duration: 800, yoyo: true, repeat: -1 })
      this.add.text(316, 152, '天枢城', { fontSize: '10px', color: '#ffd54a' }).setOrigin(0.5).setDepth(2)
    }

    // 大地图入口（洞府右侧，青蓝色传送法阵）
    {
      const g3 = this.add.graphics()
      g3.lineStyle(2, 0x48e0d0, 0.9)
      g3.strokeCircle(0, 0, 16)
      g3.lineStyle(1, 0x48e0d0, 0.55)
      g3.strokeCircle(0, 0, 11)
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2
        g3.fillStyle(0x7df0e0, 0.95)
        g3.fillCircle(Math.cos(a) * 16, Math.sin(a) * 16, 2)
      }
      const glow3 = this.add.graphics()
      glow3.fillStyle(0x48e0d0, 0.16)
      glow3.fillCircle(0, 0, 13)
      this.worldPortal = this.add.container(275, 530, [glow3, g3]).setDepth(2)
      this.tweens.add({ targets: g3, angle: 360, duration: 7000, repeat: -1 })
      this.tweens.add({ targets: glow3, alpha: 0.4, scale: 1.15, duration: 1000, yoyo: true, repeat: -1 })
      const unlockText = (this.state.level >= 5 || this.state.progress.qmCleared) ? '出山大地图' : '出山大地图(Lv5)'
      this.add.text(275, 502, unlockText, { fontSize: '9px', color: '#48e0d0' }).setOrigin(0.5).setDepth(2)
    }

    // 天梯入口（洞府右下方，紫色传送法阵）
    {
      const g4 = this.add.graphics()
      g4.lineStyle(2, 0xa855f7, 0.9)
      g4.strokeCircle(0, 0, 16)
      g4.lineStyle(1, 0xa855f7, 0.55)
      g4.strokeCircle(0, 0, 11)
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2
        g4.fillStyle(0xc084fc, 0.95)
        g4.fillCircle(Math.cos(a) * 16, Math.sin(a) * 16, 2)
      }
      const glow4 = this.add.graphics()
      glow4.fillStyle(0xa855f7, 0.16)
      glow4.fillCircle(0, 0, 13)
      this.ladderPortal = this.add.container(316, 260, [glow4, g4]).setDepth(2)
      this.tweens.add({ targets: g4, angle: -360, duration: 6000, repeat: -1 })
      this.tweens.add({ targets: glow4, alpha: 0.4, scale: 1.15, duration: 900, yoyo: true, repeat: -1 })
      const ladderLabel = this.state.realm >= 1 ? '天梯挑战' : '天梯(筑基)'
      this.add.text(316, 232, ladderLabel, { fontSize: '9px', color: '#c084fc' }).setOrigin(0.5).setDepth(2)
    }

    // NPC（按洞府背景图锚点摆放，分散布局避免拥挤）
    this.addNpc('merchant', '坊市商人', 200, 390, 'npc_merchant')  // 中央建筑前
    this.addAllyNpc('sister', '道友', 134, 452)                   // 中间走道（玩家对立职业形象）
    this.addNpc('elder', '守山老者', 115, 495, 'npc_elder')       // 左下方药圃旁
    this.addNpc('blacksmith', '锻造师', 275, 465, this.textures.exists('npc_blacksmith') ? 'npc_blacksmith' : 'npc_merchant') // 右下方

    // 炼丹炉（道友左下方，药圃西侧）
    this.furnace = this.add.image(70, 468, 'furnace').setDepth(2).setScale(1.4)
    this.tweens.add({ targets: this.furnace, alpha: 0.75, duration: 800, yoyo: true, repeat: -1 })
    this.add.text(70, 440, '炼丹炉', { fontSize: '9px', color: '#f0c987' }).setOrigin(0.5).setDepth(2)

    // 玩家（出生在中间走道上）
    this.player = new Player(this, 160, 445, this.state.classId)
    this.player.sprite.setCollideWorldBounds(true)
    // 洞府内角色放大（0.55 → 0.9）
    this.player.sprite.setScale(0.9)
    for (const n of this.npcs) this.physics.add.collider(this.player.sprite, n.spr)

    this.cameras.main.setBackgroundColor('#1a2b20')
    document.getElementById('hud')!.style.display = 'block'
    resetControls()
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
    setTribulationCallback((realmIndex: number) => {
      this.cameras.main.fadeOut(300, 0, 0, 0)
      this.time.delayedCall(320, () => this.scene.start('Tribulation', { realmIndex }))
    })
    updateHUD()

    initNpcStates(this.state)
    initMainQuest(this.state)
    checkAchievements(this.state)
    refreshDailyQuests(this.state)

    this.questHudText = this.add.text(4, 4, getQuestHudText(this.state), {
      fontSize: '8px', color: '#fbbf24', backgroundColor: '#00000088',
      padding: { x: 4, y: 2 },
    }).setOrigin(0, 0).setDepth(10)
    this.questHudText.setInteractive({ useHandCursor: true })
    this.questHudText.on('pointerdown', () => {
      if (!this.questLogShown) { this.questLogShown = true; this.openQuestLog() }
    })

    toast('回到洞府，气血已回满', '#a3e4d7')

    this.time.delayedCall(800, () => {
      tryCompleteQuest(this.state).then(() => {
        if (this.questHudText?.scene) this.questHudText.setText(getQuestHudText(this.state))
      })
    })
  }

  private async openQuestLog() {
    this.player?.halt()
    await openQuestLog(this.state)
    this.questLogShown = false
    if (this.questHudText) this.questHudText.setText(getQuestHudText(this.state))
    input.clearQueues()
  }

  private addNpc(id: NpcId, name: string, x: number, y: number, tex: string) {
    const key = this.textures.exists(tex) ? tex : 'npc'
    const spr = this.physics.add.staticSprite(x, y, key)
    const src = this.textures.get(key).getSourceImage() as HTMLImageElement
    const isLarge = src.width > 100
    if (isLarge) {
      const target = 40
      const maxDim = Math.max(src.width, src.height)
      spr.setScale(target / maxDim)
    } else {
      spr.setScale(1.25)
    }
    spr.refreshBody()
    spr.setDepth(2)
    const displayH = isLarge ? src.height * (40 / Math.max(src.width, src.height)) : 16 * 1.25
    this.add.text(x, y - displayH / 2 - 8, name, { fontSize: '9px', color: '#f0d98c', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(3)
    this.npcs.push({ id, name, spr })
  }

  /** 道友 NPC：使用玩家对立职业的动画形象（atlas 缺失时退回普通 NPC 贴图） */
  private addAllyNpc(id: NpcId, name: string, x: number, y: number) {
    const cls = this.state.classId === 'sword' ? 'fairy' : 'sword'
    if (this.anims.exists(`${cls}_down_idle`)) {
      const spr = this.physics.add.sprite(x, y, `${cls}_atlas`, `${cls}_down_idle_00`)
      spr.setScale(0.9) // 与玩家同规格
      spr.setImmovable(true)
      const body = spr.body as Phaser.Physics.Arcade.Body
      body.setAllowGravity(false)
      body.setSize(24, 14)
      body.setOffset(20, 48)
      spr.play(`${cls}_down_idle`)
      this.add.text(x, y - 35, name, { fontSize: '9px', color: '#f0d98c' }).setOrigin(0.5)
      this.npcs.push({ id, name, spr })
    } else {
      this.addNpc(id, name, x, y, 'npc_junior')
    }
  }

  // ---------- NPC 互动（好感度） ----------
  private static GREETINGS: Record<NpcId, Record<string, string[]>> = {
    elder: {
      low: ['小友面生得很，是初入青冥山的散修吧。', '山中妖气正盛，历练时多保重。'],
      mid: ['小友近日历练如何？山中路滑，当心脚下。', '最深处的守关魔将身上，带着成套的青冥剑宝。'],
      high: ['哈哈哈，小友来了！老夫新沏了灵茶，坐下聊聊。', '看你进境不俗，老夫甚是欣慰。'],
    },
    merchant: {
      low: ['哟，客官里边请！丹药、装备、功法秘籍，应有尽有。'],
      mid: ['老主顾来了！今日给你算便宜些，一律九折。'],
      high: ['财神爷驾到！店里的稀罕货随你挑，一律八折！'],
    },
    sister: {
      low: ['道友面生得很，也是来青冥山历练的？', '山下妖兽猖獗，道友独行可要多加小心。'],
      mid: ['道友近日修为精进不少，改日可否切磋一二？', '若有机缘，你我结伴下山，也好有个照应。'],
      high: ['道友来了！今日定要痛饮灵茶，论剑一番！', '与道友并肩而行，何愁妖魔不灭！'],
    },
    blacksmith: {
      low: ['炉火不歇，锻造不止。有什么要精炼升星的，尽管来。'],
      mid: ['又来了？正好炉温合适，随时可开工。'],
      high: ['老主顾来了！这炉火为你烧得正旺，尽管开口！'],
    },
    city: { low: [], mid: [], high: [] },
  }

  private greetLines(id: NpcId): string[] {
    const g = TownScene.GREETINGS[id]
    const f = favorOf(this.state, id)
    return f >= 160 ? g.high : f >= 30 ? g.mid : g.low
  }

  private bumpTalkFavor(id: NpcId) {
    if (this.talked.has(id)) return
    this.talked.add(id)
    const up = addFavor(this.state, id, 3)
    toast(`好感 +3（${tierOf(favorOf(this.state, id)).name} ${favorOf(this.state, id)}）`, '#f5b7d6')
    if (up) toast(`好感提升【${up}】！悟道 +10`, '#e8c86a')
    saveGame(this.state)
  }

  private async talkTo(id: NpcId) {
    this.player.halt()
    if (id === 'blacksmith') return this.forgeFlow()
    if (id === 'elder') return this.openElderDashboard()
    this.bumpTalkFavor(id)
    const names: Record<NpcId, string> = { elder: '守山老者', merchant: '坊市商人', sister: '道友', blacksmith: '锻造师', city: '天枢城' }
    const f = favorOf(this.state, id)
    const tier = tierOf(f)
    const statusLine = `—— 好感【${tier.name} · ${f}】 ——`

    // 特殊选项
    const disc = shopDiscount(favorOf(this.state, 'merchant'))
    const special: Array<{ label: string; value: string }> = []
    if (id === 'merchant') {
      special.push({ label: `看看货物${disc < 1 ? `（${Math.round(disc * 10)}折）` : ''}`, value: 'shop' })
      special.push({ label: '商会珍品', value: 'merchant_goods' })
      special.push({ label: '出售物品', value: 'sell' })
    }
    if (id === 'sister') {
      if (hasMemberRef(this.state.party, 'sister')) special.push({ label: '暂别同行', value: 'party_leave' })
      else special.push({ label: '结伴同行', value: 'join' })
    }
    special.push({ label: '队伍', value: 'party_manage' })

    updateDailyProgress(this.state, 'npc_talk', 1)
    const choice = await showDialog(names[id], [...this.greetLines(id), statusLine], [
      { label: '送礼', value: 'gift' },
      { label: '任务', value: 'quest' },
      ...special,
      { label: '告辞', value: 'bye' },
    ])

    if (choice === 'gift') await this.giftFlow(id, names[id])
    else if (choice === 'quest') await this.questFlow(id, names[id])
    else if (choice === 'class') await this.classFlow()
    else if (choice === 'achievements') await this.openAchievements()
    else if (choice === 'daily') await this.openDailyQuests()
    else if (choice === 'shop') openShop('坊市 · 百宝阁', this.shopStock)
    else if (choice === 'merchant_goods') await this.openMerchantGoods()
    else if (choice === 'sell') await this.openSellPanel()
    else if (choice === 'join') await this.joinFlow()
    else if (choice === 'party_leave') await this.partnerLeaveFlow()
    else if (choice === 'party_manage') await this.openPartyPanel()
    // 彩蛋：连续与商人告辞 5 次，开启 GM 管理台（选了商人其他选项则重新计数）
    if (id === 'merchant') {
      if (choice === 'bye') {
        this.gmByeCount++
        if (this.gmByeCount >= 5) {
          this.gmByeCount = 0
          sfx('sfx_open')
          await showDialog('坊市商人', [
            '「客官五次三番欲言又止……果然不是寻常买家。」',
            '「罢了，小店的管理秘台便借你一观——莫要外传！」',
          ])
          openGmPanel()
        }
      } else if (choice) {
        this.gmByeCount = 0
      }
    }
    input.clearQueues()
  }

  private getMerchant(): MerchantData {
    if (!this.merchantData || shouldRefreshMerchant(this.merchantData)) {
      const rng = makeRng(Date.now() % 2147483647)
      this.merchantData = createMerchant('town_merchant', '坊市商会', rng, 1, this.state.level)
    }
    return this.merchantData
  }

  private async openMerchantGoods() {
    input.clearQueues()
    const m = this.getMerchant()
    const available = m.goods.filter(g => !g.sold)
    const lines = [
      `商会珍品（${available.length} 件）  灵石 ${this.state.gold}`,
      '收购价倍率：' + Math.floor(m.buyRate * 100) + '%',
    ]
    const options: { label: string; value: string }[] = []
    for (let i = 0; i < m.goods.length; i++) {
      const g = m.goods[i]
      if (g.sold) continue
      lines.push(`${g.item.name} Lv${g.item.itemLevel}  ${g.price}灵石`)
      options.push({ label: `${g.item.name} ${g.price}灵石`, value: 'buy_' + i })
    }
    options.push({ label: '返回', value: 'back' })
    const result = await showDialog('商会珍品', lines, options)
    if (result && result.startsWith('buy_')) {
      const idx = parseInt(result.slice(4))
      const g = m.goods[idx]
      if (g && !g.sold && this.state.gold >= g.price) {
        this.state.gold -= g.price
        this.state.inventory.push(g.item)
        g.sold = true
        sfx('sfx_equip')
        toast(`购入 ${g.item.name}`, '#58d68d')
        saveGame(this.state)
        updateHUD()
        await this.openMerchantGoods()
      } else if (g && !g.sold) {
        toast('灵石不足', '#f87171')
        await this.openMerchantGoods()
      } else {
        input.clearQueues()
      }
    } else {
      input.clearQueues()
    }
  }

  private async openSellPanel() {
    input.clearQueues()
    const m = this.getMerchant()
    const inv = this.state.inventory
    if (inv.length === 0) {
      toast('背包空空如也', '#f0c987')
      input.clearQueues()
      return
    }
    const lines = [`出售物品（收购价 ${Math.floor(m.buyRate * 100)}%）  灵石 ${this.state.gold}`]
    const options: { label: string; value: string }[] = []
    for (let i = 0; i < inv.length; i++) {
      const item = inv[i]
      const sellPrice = getSellPrice(item, m.buyRate)
      lines.push(`${item.name} → ${sellPrice}灵石`)
      options.push({ label: `${item.name} ${sellPrice}灵石`, value: 'sell_' + i })
    }
    options.push({ label: '返回', value: 'back' })
    const result = await showDialog('出售物品', lines, options)
    if (result && result.startsWith('sell_')) {
      const idx = parseInt(result.slice(5))
      const item = inv[idx]
      if (item) {
        const sellPrice = getSellPrice(item, m.buyRate)
        this.state.gold += sellPrice
        this.state.totalGoldEarned = (this.state.totalGoldEarned ?? 0) + sellPrice
        inv.splice(idx, 1)
        sfx('sfx_pickup')
        toast(`出售 ${item.name}，获得 ${sellPrice} 灵石`, '#58d68d')
        saveGame(this.state)
        updateHUD()
        checkAchievements(this.state)
      }
      await this.openSellPanel()
    } else {
      input.clearQueues()
    }
  }

  private async giftFlow(id: NpcId, name: string) {
    const opts = GIFTS.map((g) => ({
      label: `${g.name}（+${NPC_PREFS[id]?.like === g.id ? g.base * 2 : g.base} 好感${NPC_PREFS[id]?.like === g.id ? '·喜爱' : ''}）`,
      value: g.id,
    }))
    const pick = await showDialog(name, ['想送点什么？', `（${NPC_PREFS[id]?.likeHint ?? ''}）`], [...opts, { label: '算了', value: 'bye' }])
    const gift = GIFTS.find((g) => g.id === pick)
    if (!gift) return
    if (!gift.pay(this.state)) {
      toast('身上没有这份礼', '#ff8888')
      return
    }
    const { amount, liked } = giftFavor(id, gift)
    const up = addFavor(this.state, id, amount)
    sfx('sfx_pickup')
    await showDialog(name, [
      liked ? '「这……正合我意！多谢道友！」' : '「多谢，我收下了。」',
      `好感 +${amount}`,
    ])
    if (up) toast(`好感提升【${up}】！悟道 +10`, '#e8c86a')
    saveGame(this.state)
    updateHUD()
  }

  private async questFlow(id: NpcId, name: string) {
    const quest = QUESTS.find((q) => q.npc === id)
    if (!quest) return
    const st = this.state.quests[quest.id]
    if (st === 'done') {
      await showDialog(name, ['之前的事，多谢你了。'])
      return
    }
    if (st === 'active') {
      if (quest.complete(this.state)) {
        const rewardText = quest.reward(this.state)
        this.state.quests[quest.id] = 'done'
        const up = addFavor(this.state, id, quest.rewardFavor)
        sfx('sfx_levelup')
        await showDialog(name, [
          '「好！事情办得漂亮！」',
          `任务【${quest.name}】完成：${rewardText}，好感 +${quest.rewardFavor}`,
        ])
        if (up) toast(`好感提升【${up}】！悟道 +10`, '#e8c86a')
        saveGame(this.state)
        updateHUD()
      } else {
        await showDialog(name, [`【${quest.name}】${quest.desc}`, `进度：${quest.progress(this.state)}`])
      }
      return
    }
    const accept = await showDialog(name, [`【${quest.name}】${quest.desc}`], [
      { label: '接下任务', value: 'yes' },
      { label: '再想想', value: 'bye' },
    ])
    if (accept === 'yes') {
      this.state.quests[quest.id] = 'active'
      saveGame(this.state)
      toast(`接下任务【${quest.name}】`, '#48c9b0')
    }
  }

  private async openElderDashboard() {
    this.bumpTalkFavor('elder')
    const f = favorOf(this.state, 'elder')
    const tier = tierOf(f)
    const greet = this.greetLines('elder')

    const achCount = getAchievementCount(this.state)
    const dailyStats = getDailyQuestStats(this.state)
    const questText = getQuestHudText(this.state)

    const lines = [
      ...greet,
      `—— 好感【${tier.name} · ${f}】 ——`,
      `境界：${['练气','筑基','金丹','元婴','化神','合体','大乘','渡劫'][this.state.realm]}　等级：Lv.${this.state.level}`,
      `成就：${achCount.unlocked}/${achCount.total}　日常：${dailyStats.completed}/${dailyStats.total}　主线：${questText}`,
    ]

    const choice = await showDialog('守山老者 · 修炼看板', lines, [
      { label: '请教修行（转职）', value: 'class' },
      { label: '成就回顾', value: 'achievements' },
      { label: '日常任务', value: 'daily' },
      { label: '送礼', value: 'gift' },
      { label: '任务', value: 'quest' },
      { label: '告辞', value: 'bye' },
    ])

    if (choice === 'class') await this.classFlow()
    else if (choice === 'achievements') await this.openAchievements()
    else if (choice === 'daily') await this.openDailyQuests()
    else if (choice === 'gift') await this.giftFlow('elder', '守山老者')
    else if (choice === 'quest') await this.questFlow('elder', '守山老者')
  }

  private async classFlow() {
    const choice = await showDialog('守山老者', [
      '若想改换修行路数，老夫也可为你指点一二。',
      '（转职将保留等级，习得新职业的默认招式）',
    ], [
      { label: '转修剑修', value: 'sword' },
      { label: '转修仙子', value: 'fairy' },
      { label: '转修法修', value: 'mage' },
      { label: '转修道修', value: 'sword_new' },
      { label: '转修合欢', value: 'fairy_new' },
      { label: '告辞', value: 'bye' },
    ])
    if (choice === 'sword' || choice === 'fairy' || choice === 'mage' || choice === 'sword_new' || choice === 'fairy_new') {
      if (choice === this.state.classId) {
        toast('你已是此道修士', '#ff8888')
      } else {
        switchClass(this.state, choice, CLASSES[choice].defaultStyle)
        sfx('sfx_levelup')
        toast(`转修【${CLASSES[choice].name}】成功！已习得默认招式`, '#e8c86a')
        saveGame(this.state)
        updateHUD()
        this.time.delayedCall(600, () => this.scene.restart())
      }
    }
  }

  private async openAchievements() {
    this.player?.halt()
    checkAchievements(this.state)
    const count = getAchievementCount(this.state)

    const categories: AchievementCategory[] = ['combat', 'exploration', 'sect', 'collection', 'special']
    const options: { label: string; value: string }[] = []
    const lines = [
      `已解锁 ${count.unlocked}/${count.total}`,
      '选择类别查看：',
    ]
    for (const cat of categories) {
      const catAch = ACHIEVEMENTS.filter(a => a.category === cat)
      const unlocked = catAch.filter(a => this.state.achievementsUnlocked?.includes(a.id)).length
      options.push({ label: `${categoryName(cat)} ${unlocked}/${catAch.length}`, value: cat })
    }
    options.push({ label: '关闭', value: 'close' })

    const result = await showDialog('成就回顾', lines, options)
    if (result && result !== 'close') {
      await this.showAchievementCategory(result as AchievementCategory)
    }
  }

  private async showAchievementCategory(cat: AchievementCategory) {
    const achs = ACHIEVEMENTS.filter(a => a.category === cat)
    const lines = [`【${categoryName(cat)}】`, '']
    const options: { label: string; value: string }[] = []

    for (const a of achs) {
      const unlocked = this.state.achievementsUnlocked?.includes(a.id) ?? false
      const progress = getAchievementProgress(this.state, a.condition.type)
      const pct = Math.min(100, Math.floor(progress / a.condition.target * 100))
      const icon = unlocked ? a.icon : '🔒'
      lines.push(`${icon} ${a.name}  ${unlocked ? '✓' : `${progress}/${a.condition.target}`}
  ${a.desc}  奖励：${a.reward.gold ? `灵石${a.reward.gold} ` : ''}${a.reward.insight ? `悟道${a.reward.insight} ` : ''}${a.reward.prestige ? `声望${a.reward.prestige} ` : ''}${a.reward.skillPoint ? `技能点${a.reward.skillPoint}` : ''}`)
    }
    options.push({ label: '返回', value: 'back' })

    await showDialog(`成就 · ${categoryName(cat)}`, lines, options)
    await this.openAchievements()
  }

  private async openDailyQuests() {
    this.player?.halt()
    refreshDailyQuests(this.state)
    const stats = getDailyQuestStats(this.state)

    if (!this.state.dailyQuests || this.state.dailyQuests.length === 0) {
      await showDialog('日常任务', ['今日暂无任务，明日再来。'])
      return
    }

    const lines = [
      `今日任务 ${stats.completed}/${stats.total}（已领 ${stats.claimed}）`,
      '',
    ]
    const options: { label: string; value: string }[] = []

    for (const q of this.state.dailyQuests) {
      const done = q.progress >= q.goal
      const status = q.claimed ? '已领' : done ? '可领' : `${q.progress}/${q.goal}`
      lines.push(`${q.name}  ${status}  ${q.desc}`)
      if (q.reward.gold) lines.push(`  奖励：灵石${q.reward.gold}`)
      if (q.reward.insight) lines.push(`  悟道${q.reward.insight}`)
      if (q.reward.prestige) lines.push(`  声望${q.reward.prestige}`)
      lines.push('')
      if (done && !q.claimed) {
        options.push({ label: `领取：${q.name}`, value: q.id })
      }
    }
    options.push({ label: '关闭', value: 'close' })

    const result = await showDialog('日常任务', lines, options)
    if (result && result !== 'close') {
      claimDailyReward(this.state, result)
      await this.openDailyQuests()
    }
  }

  private async furnaceFlow() {
    this.player.halt()
    const herbs = this.state.materials.lingcao ?? 0
    const choice = await showDialog('炼丹炉', [
      '炉中火焰正旺，可以灵草炼丹。',
      `（现有灵草 ×${herbs}，下本打怪可得）`,
    ], [
      { label: '回春丹（灵草×2）', value: 'potion' },
      { label: '聚灵参悟（灵草×3 → 悟道+2）', value: 'insight' },
      { label: '淬炼突破石（灵草×8）', value: 'tupo' },
      { label: '离开', value: 'bye' },
    ])
    input.clearQueues()
    const recipes: Record<string, [number, () => string]> = {
      potion: [2, () => { this.state.potions++; return '回春丹 +1' }],
      insight: [3, () => { this.state.insight += 2; return '悟道 +2' }],
      tupo: [8, () => { this.state.materials.tupo = (this.state.materials.tupo ?? 0) + 1; return '突破石 +1' }],
    }
    const recipe = recipes[choice ?? '']
    if (!recipe) return
    if (herbs < recipe[0]) {
      toast('灵草不足', '#ff8888')
      return
    }
    this.state.materials.lingcao -= recipe[0]
    const msg = recipe[1]()
    sfx('sfx_potion')
    toast(`炼成！${msg}`, '#e8c86a')
    saveGame(this.state)
    updateHUD()
  }

  private async joinFlow() {
    const f = favorOf(this.state, 'sister')
    if (f < SISTER_JOIN_FAVOR) {
      await showDialog('道友', [
        '结伴下山？此事还须从长计议，你我尚不算熟识。',
        `（好感达到【友好 · ${SISTER_JOIN_FAVOR}】后可邀请结伴，当前 ${f}）`,
      ])
      return
    }
    const choice = await showDialog('道友', [
      '道友相邀，岂有推辞之理！我的身手未必输你，这便同行吧。',
    ], [
      { label: '结伴同行', value: 'join' },
      { label: '再想想', value: 'bye' },
    ])
    if (choice === 'join') {
      const member = makeSisterMember(this.state.classId, Date.now())
      const res = addMemberToState(this.state, member)
      if (!res.ok) {
        toast(res.reason, '#f87171')
        return
      }
      saveGame(this.state)
      sfx('sfx_levelup')
      toast(`${member.displayName}加入队伍！下本时会与你并肩作战`, '#f5b7d6')
    }
  }

  /** 伙伴暂离（修复 v0.7「入队后无法解散」缺陷） */
  private async partnerLeaveFlow() {
    const choice = await showDialog('道友', [
      '你要独自下山？也好，洞府这边我替你守着。',
      '（她会退出队伍，随时可再来邀她同行）',
    ], [
      { label: '确认暂别', value: 'yes' },
      { label: '算了', value: 'no' },
    ])
    if (choice !== 'yes') return
    removeMemberFromState(this.state, 'sister')
    saveGame(this.state)
    toast('道友已退出队伍', '#a3e4d7')
  }

  /** 队伍管理面板：出战 / 待命 / 暂离 */
  private async openPartyPanel() {
    const party = sortParty(this.state.party)
    if (party.length === 0) {
      await showDialog('队伍', [
        '你如今仍是孤身一人。',
        '（洞府可与陆青鸢结伴；大世界中好感达友好的道友可邀入队伍）',
      ])
      return
    }
    const options: Array<{ label: string; value: string }> = []
    for (const m of party) {
      const tag = m.status === 'active' ? '出战' : m.status === 'downed' ? '重伤' : '待命'
      options.push({ label: `${m.displayName}（${tag}）`, value: `m_${m.refId}` })
    }
    options.push({ label: '告辞', value: 'bye' })

    const lines = party.map(m => {
      const pct = m.maxHp > 0 ? Math.round((m.hp / m.maxHp) * 100) : 100
      const role = m.kind === 'beast' ? '灵兽' : '道友'
      return `${m.displayName} · ${role} Lv.${m.level} · 气血 ${pct}% · 战力 ${(m.attackMult * 100).toFixed(0)}%`
    })
    lines.push(`<span class="dim">出战 ${countActive(this.state.party, 'cultivator')}/${PARTY_RULES.maxCultivator} 道友，${countActive(this.state.party, 'beast')}/${PARTY_RULES.maxBeast} 灵兽</span>`)

    const choice = await showDialog('队伍', lines, options)
    if (!choice || choice === 'bye') return
    const refId = choice.slice(2)
    const cur = findMemberByRef(this.state.party, refId)
    if (!cur) return

    const ops: Array<{ label: string; value: string }> = []
    if (cur.status === 'active') ops.push({ label: '转为待命', value: 'toggle' })
    else if (cur.status !== 'downed') ops.push({ label: '转为出战', value: 'toggle' })
    ops.push({ label: '移出队伍', value: 'remove' })
    ops.push({ label: '返回', value: 'back' })

    const act = await showDialog(cur.displayName, [
      cur.status === 'downed'
        ? '「……这一战着实凶险，容我调息片刻。」'
        : '「听你安排。」',
    ], ops)
    if (act === 'toggle') {
      const res = toggleMemberInState(this.state, refId)
      saveGame(this.state)
      toast(res.ok ? '已调整出战状态' : res.reason, res.ok ? '#4ade80' : '#f87171')
    } else if (act === 'remove') {
      removeMemberFromState(this.state, refId)
      saveGame(this.state)
      toast(`${cur.displayName}已离开队伍`, '#a3e4d7')
    }
  }

  // ---------- 锻造：精炼 / 升星 ----------
  private async forgeFlow() {
    this.player.halt()
    const choice = await showDialog('锻造师', [
      '炉火正旺，可为装备精炼升星。',
      '（精炼：+15% 基座数值/级，解锁词条槽；升星：全属性 ×1.05/级）',
    ], [
      { label: '精炼装备', value: 'refine' },
      { label: '升星装备', value: 'star' },
      { label: '告辞', value: 'bye' },
    ])
    input.clearQueues()
    if (choice === 'refine') await this.refineFlow()
    else if (choice === 'star') await this.starFlow()
  }

  /** 收集装备+背包中所有可选装备，返回选项列表 */
  private forgeItemOptions(
    costFn: (it: EquipItem) => number, max: number, prop: 'refine' | 'star', label: string,
  ): { label: string; value: string }[] {
    const opts: { label: string; value: string }[] = []
    const starTag = (it: EquipItem) => it.star && it.star > 0 ? '★'.repeat(it.star) : ''
    for (const slot of SLOT_KEYS) {
      const it = this.state.equipment[slot]
      if (!it) continue
      const lv = it[prop] ?? 0
      const cost = costFn(it)
      const tag = lv >= max ? '已满' : `${cost}灵石`
      opts.push({ label: `[装]${it.name}${starTag(it)} ${label}${lv}/${max}(${tag})`, value: `equip:${slot}` })
    }
    this.state.inventory.forEach((it, idx) => {
      const lv = it[prop] ?? 0
      const cost = costFn(it)
      const tag = lv >= max ? '已满' : `${cost}灵石`
      opts.push({ label: `${it.name}${starTag(it)} ${label}${lv}/${max}(${tag})`, value: `inv:${idx}` })
    })
    return opts
  }

  private resolveForgeItem(pick: string): EquipItem | null {
    const [kind, key] = pick.split(':')
    if (kind === 'equip') return this.state.equipment[key as SlotKey] ?? null
    return this.state.inventory[Number(key)] ?? null
  }

  private async refineFlow() {
    const opts = this.forgeItemOptions(refineCost, REFINE_MAX, 'refine', '精')
    if (opts.length === 0) { toast('没有可精炼的装备', '#ff8888'); return }
    opts.push({ label: '返回', value: 'bye' })
    const pick = await showDialog('锻造师 · 精炼', [
      '选择要精炼的装备：',
      `（现有灵石 ${this.state.gold}）`,
    ], opts)
    input.clearQueues()
    if (!pick || pick === 'bye') return

    const it = this.resolveForgeItem(pick)
    if (!it) return
    const r = it.refine ?? 0
    if (r >= REFINE_MAX) { toast(`${it.name} 已达精炼上限`, '#ff8888'); return }
    const cost = refineCost(it)
    if (this.state.gold < cost) { toast(`灵石不足（需 ${cost}）`, '#ff8888'); return }

    this.state.gold -= cost
    it.refine = r + 1
    const affix = rollRefineAffix(it, Math.random)
    if (affix) {
      it.affixes.push(affix)
      sfx('sfx_equip')
      toast(`${it.name} 精炼至 精${it.refine}！解锁词条：${affix.name}`, '#e8c86a')
    } else {
      sfx('sfx_equip')
      toast(`${it.name} 精炼至 精${it.refine}！`, '#e8c86a')
    }
    saveGame(this.state)
    updateHUD()
  }

  private async starFlow() {
    const opts = this.forgeItemOptions(starUpCost, STAR_MAX, 'star', '星')
    if (opts.length === 0) { toast('没有可升星的装备', '#ff8888'); return }
    opts.push({ label: '返回', value: 'bye' })
    const pick = await showDialog('锻造师 · 升星', [
      '选择要升星的装备：',
      `（现有灵石 ${this.state.gold}）`,
    ], opts)
    input.clearQueues()
    if (!pick || pick === 'bye') return

    const it = this.resolveForgeItem(pick)
    if (!it) return
    const s = it.star ?? 0
    if (s >= STAR_MAX) { toast(`${it.name} 已达升星上限`, '#ff8888'); return }
    const cost = starUpCost(it)
    if (this.state.gold < cost) { toast(`灵石不足（需 ${cost}）`, '#ff8888'); return }

    this.state.gold -= cost
    it.star = s + 1
    sfx('sfx_levelup')
    toast(`${it.name} 升星至 ${'★'.repeat(it.star)}！全属性 +5%`, '#ffd54a')
    saveGame(this.state)
    updateHUD()
  }

  update(time: number, delta: number) {
    input.poll()

    if (input.consumeBag()) {
      if (panelOpen()) { if (!modalPanel()) closePanel() }
      else { this.player.halt(); openInventory() }
    }
    if (input.consumeSettings()) { if (!panelOpen()) { this.player.halt(); openSettings() } }
    if (panelOpen() || dialogOpen()) { this.player.halt(); return }

    this.player.move(input, calcStats(this.state), time, delta)

    // 最近可交互对象（NPC + 传送门）
    let near: TownNpc | null = null
    let nearDist = 46
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, n.spr.x, n.spr.y)
      if (d < nearDist) { nearDist = d; near = n }
    }
    const portalDist = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, this.portal.x, this.portal.y)
    const furnaceDist = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, this.furnace.x, this.furnace.y)
    const hlDist = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, 316, 100)
    const nearPortal = portalDist < 44 && portalDist < nearDist
    const cityDist = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, 316, 180)
    const nearCity = !nearPortal && cityDist < 44 && cityDist < nearDist
    const nearHl = !nearPortal && !nearCity && hlDist < 44 && hlDist < nearDist
    const worldDist = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, 275, 530)
    const nearWorld = !nearPortal && !nearCity && !nearHl && worldDist < 44 && worldDist < nearDist
    const ladderDist = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, 316, 260)
    const nearLadder = !nearPortal && !nearCity && !nearHl && !nearWorld && ladderDist < 44 && ladderDist < nearDist
    const nearFurnace = !nearPortal && !nearCity && !nearHl && !nearWorld && !nearLadder && furnaceDist < 40 && furnaceDist < nearDist
    const nearId = nearPortal ? 'portal' : nearCity ? 'city' : nearHl ? 'hl' : nearWorld ? 'world' : nearLadder ? 'ladder' : nearFurnace ? 'furnace' : (near?.id ?? null)
    if (nearId !== this.nearNpc) {
      this.nearNpc = nearId as NpcId | null
      document.getElementById('btnAct')!.style.display = nearId ? 'flex' : 'none'
    }
    if (nearId && input.consumeAct()) {
      if (nearId === 'portal') this.chooseDungeon()
      else if (nearId === 'city') this.cityEnter()
      else if (nearId === 'hl') this.hlEnter()
      else if (nearId === 'world') this.worldEnter()
      else if (nearId === 'ladder') this.ladderEnter()
      else if (nearId === 'furnace') this.furnaceFlow()
      else this.talkTo(nearId as NpcId)
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

  /** 进入大地图：等级 5 或通关青冥山脉后解锁 */
  private async worldEnter() {
    if (this.entering) return
    this.player.halt()
    if (this.state.level < 5 && !this.state.progress.qmCleared) {
      await showDialog('出山大地图', [
        '法阵另一端是苍玄界南域的广阔天地。',
        '（需等级 5 或通关青冥山脉后方可踏足大地图）',
      ])
      input.clearQueues()
      return
    }
    this.state.worldUnlocked = true
    this.entering = true
    sfx('sfx_portal')
    saveGame(this.state)
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.time.delayedCall(420, () => {
      document.getElementById('btnAct')!.style.display = 'none'
      this.scene.start('World', { fromScene: 'town' })
    })
  }

  /** 进入黄龙山秘境：坚守 3 分钟，躲避火弹、借金雷护身（金丹期方可踏入） */
  private async hlEnter() {
    if (this.entering) return
    this.player.halt()
    if (this.state.realm < 2) {
      await showDialog('黄龙山秘境', [
        '法阵另一端威压如潮，神识稍一触及便被震得嗡嗡作响。',
        '（战场余波非金丹期修士不能承受——突破金丹后再来）',
      ])
      input.clearQueues()
      return
    }
    const peer = this.state.realm >= 3
    const lines = peer ? [
      '法阵另一端喊杀震天——韩道友正与乐上师在黄龙山巅激战，争夺元明灯！',
      '韩道友远远见你，朗声笑道：「道友你来了！帮我牵制一下兽群，乐上师交由我来应对！」',
      '（坚守 3 分钟不阵亡即胜；金雷可为你加持护盾，火弹沾身即伤）',
    ] : [
      '法阵另一端喊杀震天——韩前辈正与乐上师在黄龙山巅激战，争夺元明灯！',
      '韩前辈见你到来，沉声道：「小友来得正好，替老夫牵制兽群，乐上师交由老夫对付！」',
      '（坚守 3 分钟不阵亡即胜；金雷可为你加持护盾，火弹沾身即伤）',
    ]
    const choice = await showDialog('黄龙山秘境', lines, [
      { label: '踏入法阵', value: 'go' },
      { label: '再作准备', value: 'bye' },
    ])
    input.clearQueues()
    if (choice !== 'go') return
    this.entering = true
    sfx('sfx_portal')
    toast('踏入黄龙山……', '#7dffb0')
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.time.delayedCall(420, () => {
      document.getElementById('btnAct')!.style.display = 'none'
      this.registry.set('dungeonReturnScene', 'Town')
      this.scene.start('Dungeon', { mode: 'hl' })
    })
  }

  /** 进入天梯挑战：筑基期方可踏足，无尽攀升 */
  private async ladderEnter() {
    if (this.entering) return
    this.player.halt()
    if (this.state.realm < 1) {
      await showDialog('天梯挑战', [
        '紫色法阵散发着远古气息，神识触及便觉深不可测。',
        '（天梯为无尽挑战模式，需筑基期以上方可踏足）',
      ])
      input.clearQueues()
      return
    }
    const startFloor = Math.max(1, this.state.ladderFloor)
    const lines = [
      `紫色法阵直通天际——天梯是无尽攀升之路，每层妖魔渐强。`,
      `每 ${10} 层有守关首领，层数越高奖励越丰。`,
      `当前进度：第 ${startFloor} 层（历史最高：第 ${this.state.ladderMaxFloor} 层）`,
    ]
    const choice = await showDialog('天梯挑战', lines, [
      { label: '踏入天梯', value: 'go' },
      { label: '退回', value: 'no' },
    ])
    input.clearQueues()
    if (choice !== 'go') return
    this.entering = true
    sfx('sfx_portal')
    toast('踏入天梯……', '#c084fc')
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.time.delayedCall(420, () => {
      document.getElementById('btnAct')!.style.display = 'none'
      this.scene.start('Dungeon', { mode: 'ladder' })
    })
  }

  /** 进入天枢城：通关青冥山脉（或筑基）后解锁 */
  private async cityEnter() {
    if (this.entering) return
    this.player.halt()
    if (!this.state.cityUnlocked && !this.state.progress.qmCleared && this.state.realm < 1) {
      await showDialog('天枢城', [
        '金色法阵另一端，隐约可见巍峨城池。',
        '（需通关青冥山脉或突破筑基期方可入城）',
      ])
      input.clearQueues()
      return
    }
    if (!this.state.cityUnlocked) {
      this.state.cityUnlocked = true
      saveGame(this.state)
    }
    this.entering = true
    sfx('sfx_portal')
    toast('踏入天枢城……', '#ffd54a')
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.time.delayedCall(420, () => {
      document.getElementById('btnAct')!.style.display = 'none'
      this.scene.start('City')
    })
  }

  private async chooseDungeon() {
    if (this.entering) return
    this.player.halt()
    const ymUnlocked = this.state.progress.qmCleared || this.state.realm >= 1
    const syUnlocked = this.state.progress.ymCleared || this.state.realm >= 2
    const xianUnlocked = canEnterXianRealm(this.state.realm)
    const syCp = this.state.syCheckpoint ?? 7
    const xianCp = xianCheckpointFloor(this.state)
    const options: { label: string; value: string }[] = [
      { label: '青冥山脉（1~3 层）', value: 'qm' },
      { label: ymUnlocked ? '幽冥沼泽（4~6 层）' : '幽冥沼泽（需通关青冥山脉）', value: 'ym' },
      { label: syUnlocked ? `无尽妖域（第 ${syCp - 6} 层起 · 无尽模式）` : '无尽妖域（需通关幽冥沼泽）', value: 'sy' },
    ]
    if (xianUnlocked) {
      options.push({ label: `☁ 破碎仙宫（第 ${xianCp} 层起 · 化神秘境）`, value: 'xian' })
    }
    options.push({ label: '离开', value: 'bye' })
    const choice = await showDialog('地下城入口', [
      '前方妖气弥漫。选择要前往的区域：',
    ], options)
    input.clearQueues()
    // 仙界入口
    if (choice === 'xian') {
      if (!xianUnlocked) {
        toast('仙界高远——需化神期以上方可登临', '#ff8888')
        return
      }
      const diffChoice = await showDialog('破碎仙宫', [
        '踏入仙界秘境，与仙人灵兽论道切磋。难度越高，机缘越盛。',
      ], DIFFICULTIES.map((d) => ({ label: `${d.name}｜${d.desc}`, value: d.id })).concat([{ label: '再想想', value: 'bye' }]))
      input.clearQueues()
      if (diffChoice === 'bye' || !diffChoice) { this.entering = false; return }
      const diff = difficultyById(diffChoice)
      this.entering = true
      sfx('sfx_portal')
      toast('腾云而去……', '#aaddff')
      this.cameras.main.fadeOut(400, 0, 0, 0)
      this.time.delayedCall(420, () => {
        document.getElementById('btnAct')!.style.display = 'none'
        this.registry.set('dungeonReturnScene', 'Town')
        this.scene.start('Dungeon', { floor: XIAN_START_FLOOR + xianCp - 1, diff: diff.id, mode: 'xian' })
      })
      return
    }
    if (choice === 'qm' || choice === 'ym' || choice === 'sy') {
      if (choice === 'ym' && !ymUnlocked) {
        toast('妖气太盛——需先通关青冥山脉（或突破筑基）', '#ff8888')
        return
      }
      if (choice === 'sy' && !syUnlocked) {
        toast('妖域深不可测——需先通关幽冥沼泽（或突破金丹）', '#ff8888')
        return
      }
      this.entering = true
      const startFloor = choice === 'qm' ? 1 : choice === 'ym' ? 4 : syCp
      // 难度选择（掉落随难度提升）
      const diffChoice = await showDialog('选择难度', [
        '行前定夺历练难度——难度越高，妖魔越强，掉落越丰厚。',
      ], DIFFICULTIES.map((d) => ({ label: `${d.name}｜${d.desc}`, value: d.id })).concat([{ label: '再想想', value: 'bye' }]))
      input.clearQueues()
      if (diffChoice === 'bye' || !diffChoice) { this.entering = false; return }
      const diff = difficultyById(diffChoice)
      sfx('sfx_portal')
      toast(`踏入地下城（${diff.name}）……`, '#48c9b0')
      this.cameras.main.fadeOut(400, 0, 0, 0)
      this.time.delayedCall(420, () => {
        document.getElementById('btnAct')!.style.display = 'none'
        this.registry.set('dungeonReturnScene', 'Town')
        this.scene.start('Dungeon', { floor: startFloor, diff: diff.id })
      })
    }
  }
}
