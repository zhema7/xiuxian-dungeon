// ---------- DOM UI：HUD、面板（装备/功法/天赋）、对话、结算、提示 ----------

import {
  CLASSES, ITEM_BASES, MOD_LABELS, QUALITY_NAMES, REALMS, REALM_STAT_BONUS, SETS, SKILLS, SKILL_TYPE_NAMES,
  SLOT_KEYS, SLOT_NAMES, TALENT_BRANCHES, type SlotKey,
} from './data'
import { calcStats, currentHp, equippedSetIds, isSetBonusActive, setPieceCount, SPIRIT_ORIFICES, orificeSuccessRate, orificeBonuses } from './effects'
import { expNeed, recordCodexItem, saveGame, applyPreset, snapshotPreset, PRESET_COUNT, type GameState, pushPlayerLog } from './state'
import {
  canUpgrade, equipSkill, isSkillEquipped, learnSkill, skillLevel, unequipSkill, upgradeCost, upgradeSkill, SKILL_MAX_LEVEL,
  mindModsAt, skillPowerAt,
} from './skills'
import { genDynamicSetFromSeed, genDynamicSkill, nextDynamicSetSequence, registerDynamicContent } from './lore'
import { addPoint, availablePoints, respec, RESPEC_COST, spentPoints } from './talents'
import { ENH_MAX, enhanceCost, makeItem, type EquipItem } from './core'
import { ARTIFACTS, artifactStats, artifactBuffValue, refineCost, totalArtifactStats, getArtifactBuff, SECT_RELIC_SLOTS, type ArtifactInstance } from './artifact-data'
import { V4_KIT_SETS } from './v4/kit-data'
import { gainExp } from './state'
import { classNameOf, getRecords, type RecordEntry } from './records'
import { sfx, getBgmVolume, getSfxVolume, setBgmVolume, setSfxVolume } from './audio'
import { listSaveSlots, loadSaveSlot, deleteSaveSlot, hasSaveSlot, MAX_SAVE_SLOTS, type SaveSlotMeta } from './state'
import { needsTribulation, getTribulation, canAscend, performAscension, ascensionBonus, ASCENSION_REQUIREMENTS } from './tribulation-data'
import { getDomainDef, type DomainId } from './world-map'
import { getMainQuest } from './storyline-data'
import { QUESTS } from './favor'

export interface SettingsCallbacks {
  onLoadSave?: (slotIndex: number) => void
  onReturnTitle?: () => void
  onBuildHome?: () => void
  onZoom?: (delta: number) => void
  onResetCamera?: () => void
  onToggleRenderMode?: () => void
}

let settingsCallbacks: SettingsCallbacks = {}

export function setSettingsCallbacks(cb: SettingsCallbacks) {
  settingsCallbacks = cb
}

let tribulationStartCallback: ((realmIndex: number) => void) | null = null

export function setTribulationCallback(cb: ((realmIndex: number) => void) | null) {
  tribulationStartCallback = cb
}

function el<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T
}

let state: GameState
let floorText = ''
let onPanelToggle: ((open: boolean) => void) | null = null
type Tab = 'equip' | 'skill' | 'talent' | 'artifact' | 'codex' | 'contacts' | 'log'
type SkillFilter = 'all' | 'style' | 'art' | 'mind'
let skillFilter: SkillFilter = 'all'
type InvFilter = 'all' | 'weapon' | 'armor' | 'accessory'

/** 背包筛选：当前选中的分类标签 */
let invFilter: InvFilter = 'all'

/** 日志筛选：当前选中的分类标签 */
type LogFilter = 'all' | 'news' | 'quest' | 'world' | 'karma'
let logFilter: LogFilter = 'all'

export function initUI(s: GameState, panelToggle: (open: boolean) => void) {
  state = s
  onPanelToggle = panelToggle
  // 点击面板外部（卡片之外）关闭（结算等模态面板除外，避免误关导致卡死）
  el('panel').addEventListener('pointerdown', (e) => {
    if (e.target === el('panel') && panelOpen() && !modalPanel()) closePanel()
  })
}

// ---------- GM 管理面板（隐藏入口：连续与商人告辞 5 次触发） ----------
export function openGmPanel() {
  const panel = el('panel')
  panel.classList.add('open')
  delete panel.dataset.modal
  onPanelToggle?.(true)

  let html = `<div class="card"><h3>GM 管理台</h3><p class="dim">测试工具 · 改动即时生效并自动存档</p>`
  html += `<p class="dim" style="margin:4px 0 2px">【套装】（玄品 · 按当前等级打造）</p>`
  for (const set of Object.values(SETS)) {
    html += `<div class="item"><span class="q3">${set.name}<span class="sub">${set.bonuses[set.bonuses.length - 1].desc}</span></span>
      <span><button data-gm-wear="${set.id}">穿整套</button> <button data-gm-bagset="${set.id}">入背包</button></span></div>`
  }
  html += `<div class="item"><span>强力散件（龙渊剑等 6 件）</span><button data-gm-bagsan>入背包</button></div>`
  html += `<p class="dim" style="margin:8px 0 2px">【机缘系统】</p>`
  html += `<div class="item"><span>生成造化套装（随机招式·神通·灵光）</span><button data-gm-dynset>生成</button></div>`
  html += `<div class="item"><span>参悟无名古卷（随机心法）</span><button data-gm-dynskill>参悟</button></div>`
  html += `<p class="dim" style="margin:8px 0 2px">【功法】</p>`
  for (const sk of SKILLS.values()) {
    const learned = state.skills[sk.id] ? `已习得 Lv.${state.skills[sk.id]}` : ''
    html += `<div class="item"><span class="q2">${sk.name} <span class="sub">${SKILL_TYPE_NAMES[sk.type]} · ${sk.class === 'any' ? '通用' : CLASSES[sk.class]?.name} ${learned}</span></span>
      <button data-gm-skill="${sk.id}" ${learned ? 'disabled' : ''}>学会</button></div>`
  }
  html += `<div class="item"><span>一键全功法</span><button data-gm-allskills>全学会</button></div>`
  html += `<p class="dim" style="margin:8px 0 2px">【资源 / 角色】</p>`
  html += `<div class="item"><span>灵石 +1000</span><button data-gm-res="gold">增加</button></div>`
  html += `<div class="item"><span>悟道 +300</span><button data-gm-res="insight">增加</button></div>`
  html += `<div class="item"><span>突破石 +5</span><button data-gm-res="tupo">增加</button></div>`
  html += `<div class="item"><span>灵草 +10</span><button data-gm-res="lingcao">增加</button></div>`
  html += `<div class="item"><span>等级 +5（含悟道/天赋点）</span><button data-gm-level>升级</button></div>`
  html += `<div class="item"><span>气血回满</span><button data-gm-heal>回血</button></div>`
  html += `<div style="text-align:right;margin-top:8px"><button data-close>关闭</button></div></div>`
  panel.innerHTML = html

  const after = (msg: string) => { saveGame(state); updateHUD(); toast(msg, '#e8c86a'); openGmPanel() }
  panel.querySelector('[data-close]')!.addEventListener('click', closePanel)

  panel.querySelectorAll('[data-gm-wear]').forEach((b) => b.addEventListener('click', (e) => {
    const setId = (e.target as HTMLElement).getAttribute('data-gm-wear')!
    for (const baseId of SETS[setId].pieces) {
      const it = makeItem(baseId, 3, state.level)
      if (!it) continue
      recordCodexItem(state, it)
      const cur = state.equipment[it.slot as SlotKey]
      if (cur) state.inventory.push(cur)
      state.equipment[it.slot as SlotKey] = it
    }
    sfx('sfx_equip')
    after(`已穿上「${SETS[setId].name}」整套（玄品）`)
  }))
  panel.querySelectorAll('[data-gm-bagset]').forEach((b) => b.addEventListener('click', (e) => {
    const setId = (e.target as HTMLElement).getAttribute('data-gm-bagset')!
    for (const baseId of SETS[setId].pieces) {
      const it = makeItem(baseId, 3, state.level)
      if (it) { recordCodexItem(state, it); state.inventory.push(it) }
    }
    sfx('sfx_pickup')
    after(`「${SETS[setId].name}」4 件已入背包`)
  }))
  panel.querySelector('[data-gm-bagsan]')?.addEventListener('click', () => {
    for (const baseId of ['w_dragon', 'h_phoenix', 'a_dragon', 'b_cloud', 'c_thunder', 'c_blood2']) {
      const it = makeItem(baseId, 3, state.level)
      if (it) { recordCodexItem(state, it); state.inventory.push(it) }
    }
    sfx('sfx_pickup')
    after('强力散件 ×6 已入背包')
  })
  panel.querySelector('[data-gm-dynset]')?.addEventListener('click', () => {
    const sets = state.dynamicSets ?? []
    const seed = Math.floor(Math.random() * 0x100000000) >>> 0
    const rec = genDynamicSetFromSeed(seed, nextDynamicSetSequence(sets), sets)
    state.dynamicSets = [...sets, rec]
    registerDynamicContent([rec], [])
    for (const baseId of rec.set.pieces) {
      const it = makeItem(baseId, 3, state.level)
      if (it) { recordCodexItem(state, it); state.inventory.push(it) }
    }
    sfx('sfx_pickup')
    after(`机缘套装【${rec.set.name}】已生成，4 件入背包`)
  })
  panel.querySelector('[data-gm-dynskill]')?.addEventListener('click', () => {
    const seq = (state.dynamicSkills?.length ?? 0) + 1
    const def = genDynamicSkill(Math.random, seq)
    state.dynamicSkills = [...(state.dynamicSkills ?? []), def]
    registerDynamicContent([], [def])
    learnSkill(state, def.id)
    sfx('sfx_skill')
    after(`悟得心法《${def.name}》（功法页装配）`)
  })
  panel.querySelectorAll('[data-gm-skill]').forEach((b) => b.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).getAttribute('data-gm-skill')!
    learnSkill(state, id)
    sfx('sfx_skill')
    after(`已习得《${SKILLS.get(id)?.name}》（背包 → 功法 装配）`)
  }))
  panel.querySelector('[data-gm-allskills]')?.addEventListener('click', () => {
    for (const sk of SKILLS.values()) learnSkill(state, sk.id)
    sfx('sfx_skill')
    after('全部功法学成！')
  })
  panel.querySelectorAll('[data-gm-res]').forEach((b) => b.addEventListener('click', (e) => {
    const kind = (e.target as HTMLElement).getAttribute('data-gm-res')!
    if (kind === 'gold') state.gold += 1000
    else if (kind === 'insight') state.insight += 300
    else state.materials[kind] = (state.materials[kind] ?? 0) + (kind === 'tupo' ? 5 : 10)
    sfx('sfx_pickup')
    after('资源已到账')
  }))
  panel.querySelector('[data-gm-level]')?.addEventListener('click', () => {
    let ups = 0
    for (let i = 0; i < 5; i++) ups += gainExp(state, expNeed(state.level))
    state.insight += 3 * ups
    state.hp = -1
    sfx('sfx_levelup')
    after(`连升 ${ups} 级 → Lv.${state.level}，悟道 +${3 * ups}，气血回满`)
  })
  panel.querySelector('[data-gm-heal]')?.addEventListener('click', () => {
    state.hp = -1
    sfx('sfx_potion')
    after('气血已回满')
  })
}

export function setFloorText(t: string) { floorText = t }

export function updateHUD() {
  const st = calcStats(state)
  const hp = currentHp(state)
  const ascTag = state.ascensionCount > 0 ? ` · 第${state.ascensionCount}世` : ''
  el('hudName').textContent = `${state.heroName} · ${CLASSES[state.classId]?.name ?? ''} · ${REALMS[state.realm]?.name ?? ''}${ascTag}`
  el('hudFloor').textContent = floorText
  const hpBar = el('hpbar')
  ;(hpBar.querySelector('i') as HTMLElement).style.width = `${(hp / st.maxHp) * 100}%`
  ;(hpBar.querySelector('b') as HTMLElement).textContent = `${hp} / ${st.maxHp}`
  el('hudLv').textContent = `Lv.${state.level}`
  el('hudGold').textContent = `灵石 ${state.gold}`
  el('hudInsight').textContent = `悟道 ${state.insight}`
  el('hudPot').textContent = `丹药 ${state.potions}`
  const expBar = el('expbar')
  const need = expNeed(state.level)
  ;(expBar.querySelector('i') as HTMLElement).style.width = `${(state.exp / need) * 100}%`
  ;(expBar.querySelector('b') as HTMLElement).textContent = `经验 ${state.exp} / ${need}`
}

// ---------- 提示 ----------
let toastTimer = 0
export function toast(text: string, color = '#f0d98c') {
  const t = el('toast')
  t.textContent = text
  t.style.color = color
  t.style.opacity = '1'
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { t.style.opacity = '0' }, 1600)
  if (state) pushPlayerLog(state, text)
}

// ---------- 对话（支持结尾选项分支） ----------
export interface DialogOption { label: string; value: string }

export function showDialog(name: string, lines: string[], options?: DialogOption[]): Promise<string | null> {
  const box = el('dialog')
  el('dialogName').textContent = name
  const optsBox = el('dialogOpts')
  optsBox.innerHTML = ''
  let i = 0
  el('dialogText').textContent = lines[0]
  el('dialogHint').style.display = lines.length > 1 || !options ? 'block' : 'none'
  box.classList.add('open')

  const cleanup = () => {
    box.classList.remove('open')
    box.removeEventListener('pointerdown', advance)
    optsBox.innerHTML = ''
  }
  const showOptions = () => {
    el('dialogHint').style.display = 'none'
    box.removeEventListener('pointerdown', advance)
    for (const o of options!) {
      const b = document.createElement('button')
      b.textContent = o.label
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        sfx('sfx_click', 0.4)
        cleanup()
        resolve(o.value)
      })
      optsBox.appendChild(b)
    }
  }
  let resolve: (v: string | null) => void = () => {}
  const advance = (e: Event) => {
    if ((e.target as HTMLElement).closest('#dialogOpts')) return
    sfx('sfx_click', 0.3)
    i++
    if (i >= lines.length) {
      if (options && options.length > 0) showOptions()
      else { cleanup(); resolve(null) }
    } else {
      el('dialogText').textContent = lines[i]
    }
  }
  box.addEventListener('pointerdown', advance)
  return new Promise<string | null>((r) => { resolve = r })
}
export function dialogOpen() { return el('dialog').classList.contains('open') }

/** 带文本输入的对话框，返回用户输入的文本或 null（取消） */
export function showInputDialog(name: string, lines: string[], defaultValue: string, placeholder?: string): Promise<string | null> {
  const box = el('dialog')
  el('dialogName').textContent = name
  const optsBox = el('dialogOpts')
  optsBox.innerHTML = ''
  const textBox = el('dialogText')
  const hintBox = el('dialogHint')
  textBox.textContent = lines[0]
  hintBox.style.display = 'none'
  box.classList.add('open')

  // 插入输入框
  const inputWrap = document.createElement('div')
  inputWrap.style.cssText = 'margin:8px 0;text-align:center'
  const input = document.createElement('input')
  input.type = 'text'
  input.value = defaultValue
  input.placeholder = placeholder ?? ''
  input.maxLength = 12
  input.style.cssText = 'width:80%;padding:6px 8px;font-size:14px;border:1px solid #5a6a8a;border-radius:4px;background:#1a1e2e;color:#e8e8f0;text-align:center'
  inputWrap.appendChild(input)
  textBox.appendChild(inputWrap)

  let resolve: (v: string | null) => void = () => {}
  const cleanup = () => {
    box.classList.remove('open')
    optsBox.innerHTML = ''
    textBox.textContent = ''
  }

  const confirmBtn = document.createElement('button')
  confirmBtn.textContent = '确认'
  confirmBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    sfx('sfx_click', 0.4)
    const val = input.value.trim()
    cleanup()
    resolve(val || null)
  })
  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = '取消'
  cancelBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    sfx('sfx_click', 0.3)
    cleanup()
    resolve(null)
  })
  optsBox.appendChild(confirmBtn)
  optsBox.appendChild(cancelBtn)

  input.focus()
  input.select()
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmBtn.dispatchEvent(new PointerEvent('pointerdown'))
  })

  return new Promise<string | null>((r) => { resolve = r })
}

// ---------- 面板 ----------
export function panelOpen() { return el('panel').classList.contains('open') }

/** 模态面板（死亡/通关结算）：只能通过面板内按钮关闭 */
export function modalPanel() { return el('panel').dataset.modal === '1' }

export function closePanel() {
  const panel = el('panel')
  panel.classList.remove('open')
  delete panel.dataset.modal
  panel.innerHTML = ''
  sfx('sfx_click', 0.35)
  onPanelToggle?.(false)
}

// ---------- NPC 信息面板 ----------
export interface NpcPanelData {
  name: string
  realmName: string
  profession: string
  personality: string[]
  daoPath: string
  physique: string
  moralityName: string
  moralityColor: string
  relationLevel: string
  favor: number
  trust: number
  fear: number
  story: string
  purpose: string
  activity: string
  socialLines: string[]
  lifeEvents: string[]
  hasSecret: boolean
  secretText?: string
  hp: number
  maxHp: number
  level: number
}

export function openNpcPanel(data: NpcPanelData) {
  const panel = el('panel')
  panel.classList.add('open')
  delete panel.dataset.modal
  onPanelToggle?.(true)
  sfx('sfx_open', 0.5)

  const moralityColor = data.moralityColor
  const favorColor = data.favor >= 50 ? '#4ade80' : data.favor >= 10 ? '#fbbf24' : data.favor < -20 ? '#f87171' : '#e2e8f0'

  let socialHtml = ''
  if (data.socialLines.length > 0) {
    socialHtml = `<div style="border-top:1px solid #3a4356;margin:6px 0;padding-top:4px">
      <div style="font-size:10px;color:#7c9cb0;margin-bottom:2px">社交关系</div>
      ${data.socialLines.map(s => `<div style="font-size:10px;color:#9a937f;margin-bottom:1px">${s}</div>`).join('')}
    </div>`
  }

  let eventsHtml = ''
  if (data.lifeEvents.length > 0) {
    eventsHtml = `<div style="border-top:1px solid #3a4356;margin:6px 0;padding-top:4px">
      <div style="font-size:10px;color:#7c9cb0;margin-bottom:2px">近期经历</div>
      ${data.lifeEvents.slice(-4).map(e => `<div style="font-size:10px;color:#9a937f;margin-bottom:1px">${e}</div>`).join('')}
    </div>`
  }

  let secretHtml = ''
  if (data.secretText) {
    secretHtml = `<div style="border-top:1px solid #3a4356;margin:6px 0;padding-top:4px">
      <div style="font-size:10px;color:#f87171;margin-bottom:2px">隐秘</div>
      <div style="font-size:10px;color:#c4b998">${data.secretText}</div>
    </div>`
  }

  panel.innerHTML = `<div class="card" style="max-width:300px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-size:14px;font-weight:bold;color:#e8d8a0">${data.name}</span>
      <span style="font-size:10px;color:${moralityColor};border:1px solid ${moralityColor};padding:1px 4px;border-radius:3px">${data.moralityName}</span>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:4px;font-size:11px">
      <span style="color:#fbbf24">${data.realmName}</span>
      <span style="color:#7c9cb0">Lv.${data.level}</span>
      <span style="color:#9a937f">${data.profession}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:#9a937f;margin-bottom:4px">
      <span>气血 ${data.hp}/${data.maxHp}</span>
      <span style="color:${favorColor}">好感 ${data.favor} · 信任 ${data.trust} · 畏惧 ${data.fear}</span>
    </div>
    <div style="border-top:1px solid #3a4356;margin:4px 0;padding-top:4px;font-size:10px;color:#9a937f">
      <div style="display:flex;justify-content:space-between;margin-bottom:1px"><span>性格</span><span style="color:#c4b998">${data.personality.join('、')}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:1px"><span>道途</span><span style="color:#c4b998">${data.daoPath}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:1px"><span>体质</span><span style="color:#c4b998">${data.physique}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:1px"><span>关系</span><span style="color:${favorColor}">${data.relationLevel}</span></div>
    </div>
    <div style="border-top:1px solid #3a4356;margin:6px 0;padding-top:4px">
      <div style="font-size:10px;color:#7c9cb0;margin-bottom:2px">行迹</div>
      <div style="font-size:10px;color:#c4b998;margin-bottom:2px">${data.story}</div>
      <div style="font-size:10px;color:#9a937f">「${data.purpose}」</div>
      <div style="font-size:10px;color:#7c9cb0;margin-top:2px">${data.activity}</div>
    </div>
    ${socialHtml}
    ${eventsHtml}
    ${secretHtml}
    <div style="text-align:right;margin-top:6px"><button data-close>关闭</button></div>
  </div>`

  panel.querySelector('[data-close]')!.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    closePanel()
  })
}

export function openInventory() { openPanel('equip') }

// ---------- 宗门看板 ----------
export interface BuildingProdInfo {
  id: string
  name: string
  level: number
  desc: string
  /** 产出资源名（如 '灵石'），无产出为 null */
  produces: string | null
  /** 每分钟产出量 */
  rate: number
  /** 产出加成百分比（弟子职务+天赋） */
  bonus: number
}

export interface SectDashboardData {
  sectName: string
  sectLevel: number
  resources: { stone: number; herb: number; ore: number; wood: number; insight: number; prestige: number }
  buildings: Array<{ id: string; name: string; level: number; desc: string }>
  /** 产出建筑详细信息 */
  productionBuildings: BuildingProdInfo[]
  /** 弟子职务加成汇总 */
  discipleBonuses: { stone: number; herb: number; ore: number; wood: number }
  discipleCount: number
  discipleCapacity: number
}

export interface SectDashboardCallbacks {
  onPlaceBuilding?: () => void
  onPlaceNpc?: () => void
  onManageDisciples?: () => void
  onDiplomacy?: () => void
}

let sectCallbacks: SectDashboardCallbacks = {}

export function setSectCallbacks(cb: SectDashboardCallbacks) {
  sectCallbacks = cb
}

/** 资源获取途径指引 */
const RESOURCE_GUIDES: Array<{ name: string; color: string; sources: string[] }> = [
  { name: '灵石', color: '#fbbf24', sources: ['灵脉阵产出', '世界资源点·灵石矿脉', '贸易协定收入', '附庸进贡', '宗门任务奖励'] },
  { name: '灵草', color: '#34d399', sources: ['灵田建筑产出', '灵田种植收获', '世界资源点·灵草野', '贸易协定收入', '采集任务奖励'] },
  { name: '矿石', color: '#a78bfa', sources: ['矽脉建筑产出', '世界资源点·矿石矿脉', '结盟收入', '挖掘任务奖励'] },
  { name: '木材', color: '#fb923c', sources: ['灵木林建筑产出', '世界资源点·灵木林', '结盟收入', '巡逻任务奖励'] },
  { name: '悟道', color: '#60a5fa', sources: ['宗门任务奖励', '藏经阁研修', '探索遗迹任务'] },
  { name: '声望', color: '#f87171', sources: ['宗门防御战胜利', '宗门战争胜利', '收服附庸', '宗门任务奖励'] },
]

export function openSectDashboard(data: SectDashboardData) {
  const panel = el('panel')
  panel.classList.add('open')
  delete panel.dataset.modal
  onPanelToggle?.(true)
  sfx('sfx_open', 0.5)

  const r = data.resources
  const resourceChips = [
    { label: '灵石', val: r.stone, color: '#fbbf24' },
    { label: '灵草', val: r.herb, color: '#34d399' },
    { label: '矿石', val: r.ore, color: '#a78bfa' },
    { label: '木材', val: r.wood, color: '#fb923c' },
    { label: '悟道', val: r.insight, color: '#60a5fa' },
    { label: '声望', val: r.prestige, color: '#f87171' },
  ].map(c => `<span class="resource-chip" style="color:${c.color}">${c.label} ${c.val}</span>`).join('')

  // 产出建筑列表（含每分钟产出和加成）
  const prodCards = data.productionBuildings.map(b => {
    const lvText = b.level > 0 ? `<span class="q1">Lv.${b.level}</span>` : '<span class="dim">未建</span>'
    if (b.produces && b.level > 0) {
      const actualRate = Math.floor(b.rate * (1 + b.bonus))
      const bonusText = b.bonus > 0 ? `<span class="stat-up"> +${Math.round(b.bonus * 100)}%</span>` : ''
      return `<div class="bldg-card" style="flex-direction:column;align-items:flex-start;gap:2px">
        <div style="display:flex;justify-content:space-between;width:100%"><span>${b.name}</span>${lvText}</div>
        <span class="sub" style="font-size:10px">${b.produces} ${actualRate}/分${bonusText}</span>
      </div>`
    }
    return `<div class="bldg-card"><span>${b.name}</span>${lvText}</div>`
  }).join('')

  // 资源获取指引
  const guideSections = RESOURCE_GUIDES.map(g => {
    const sources = g.sources.map(s => `<span class="dim" style="font-size:10px;margin-right:4px">·${s}</span>`).join('')
    return `<div style="margin-bottom:3px"><span style="color:${g.color};font-size:11px">${g.name}：</span>${sources}</div>`
  }).join('')

  let html = `<div class="card wide sect-dashboard">
    <div style="text-align:center;margin-bottom:6px">
      <span class="q3" style="font-size:15px">${data.sectName}</span>
      <span class="sub" style="display:inline;margin-left:4px">Lv.${data.sectLevel}</span>
    </div>
    <div class="resource-bar">${resourceChips}</div>
    <div style="text-align:center;margin:6px 0">
      <span class="dim">弟子 ${data.discipleCount}/${data.discipleCapacity}</span>
    </div>

    <div style="border-top:1px solid var(--line);margin:6px 0;padding-top:6px">
      <div style="font-size:12px;color:#f0d98c;margin-bottom:4px">资源产出（每5秒结算）</div>
      <div class="bldg-grid">${prodCards}</div>
      ${data.discipleBonuses.stone + data.discipleBonuses.herb + data.discipleBonuses.ore + data.discipleBonuses.wood > 0
        ? `<div style="margin-top:4px;font-size:10px;color:#9a937f">弟子职务加成：灵石+${Math.round(data.discipleBonuses.stone * 100)}% · 灵草+${Math.round(data.discipleBonuses.herb * 100)}% · 矿石+${Math.round(data.discipleBonuses.ore * 100)}% · 木材+${Math.round(data.discipleBonuses.wood * 100)}%</div>`
        : ''}
    </div>

    <div style="border-top:1px solid var(--line);margin:6px 0;padding-top:6px">
      <div style="font-size:12px;color:#f0d98c;margin-bottom:4px">资源获取途径</div>
      ${guideSections}
    </div>

    <div style="border-top:1px solid var(--line);margin:6px 0;padding-top:6px">
      <div style="font-size:12px;color:#f0d98c;margin-bottom:4px">管理事务</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
        <button data-sect-act="building" style="padding:6px;font-size:12px">建筑摆放</button>
        <button data-sect-act="npc" style="padding:6px;font-size:12px">NPC安排</button>
        <button data-sect-act="disciple" style="padding:6px;font-size:12px">弟子管理</button>
        <button data-sect-act="diplomacy" style="padding:6px;font-size:12px">外交</button>
      </div>
    </div>
    <div style="text-align:right;margin-top:8px"><button data-close>关闭</button></div>
  </div>`

  panel.innerHTML = html

  panel.querySelector('[data-sect-act="building"]')?.addEventListener('click', () => {
    sfx('sfx_click', 0.4)
    closePanel()
    sectCallbacks.onPlaceBuilding?.()
  })
  panel.querySelector('[data-sect-act="npc"]')?.addEventListener('click', () => {
    sfx('sfx_click', 0.4)
    closePanel()
    sectCallbacks.onPlaceNpc?.()
  })
  panel.querySelector('[data-sect-act="disciple"]')?.addEventListener('click', () => {
    sfx('sfx_click', 0.4)
    closePanel()
    sectCallbacks.onManageDisciples?.()
  })
  panel.querySelector('[data-sect-act="diplomacy"]')?.addEventListener('click', () => {
    sfx('sfx_click', 0.4)
    closePanel()
    sectCallbacks.onDiplomacy?.()
  })
  panel.querySelector('[data-close]')!.addEventListener('click', closePanel)
}

// ---------- 弟子看板 ----------
export interface DiscipleCardData {
  uid: string
  name: string
  rootName: string
  rootColor: string
  rootTierLabel: string
  realmName: string
  rankName: string
  roleName: string | null
  status: 'idle' | 'cultivating' | 'retreating' | 'dispatched'
  statusLabel: string
  power: number
  atk: number
  def: number
  maxHp: number
  crit: number
  exp: number
  expToNext: number
  loyalty: number
  affection: number
  talents: Array<{ name: string; desc: string; positive: boolean }>
  /** 闭关剩余秒数（仅闭关中） */
  retreatRemain?: number
  /** 任务名称和剩余秒数（仅派遣中） */
  questName?: string
  questRemain?: number
  /** 指点是否可用 */
  canGuide: boolean
  /** 是否可晋升 */
  canPromote: boolean
}

export interface RecruitCandidate {
  name: string
  rootName: string
  rootColor: string
  rootTierLabel: string
  talents: Array<{ name: string; desc: string; positive: boolean }>
  atk: number
  def: number
  maxHp: number
  crit: number
  loyalty: number
  affection: number
}

export interface DiscipleDashboardData {
  count: number
  capacity: number
  recruitCooldownRemain: number  // 秒
  disciples: DiscipleCardData[]
  candidate: RecruitCandidate | null  // 待招募人选
}

export interface DiscipleDashboardCallbacks {
  onCultivate?: (uid: string) => void
  onStopCultivate?: (uid: string) => void
  onRetreat?: (uid: string) => void
  onBreakRetreat?: (uid: string) => void
  onGuide?: (uid: string) => void
  onDispatch?: (uid: string) => void
  onEquip?: (uid: string) => void
  onPromote?: (uid: string) => void
  onRecruitAccept?: () => void
  onRecruitReject?: () => void
}

let discipleCallbacks: DiscipleDashboardCallbacks = {}

export function setDiscipleCallbacks(cb: DiscipleDashboardCallbacks) {
  discipleCallbacks = cb
}

export function openDiscipleDashboard(data: DiscipleDashboardData) {
  const panel = el('panel')
  panel.classList.add('open')
  delete panel.dataset.modal
  onPanelToggle?.(true)
  sfx('sfx_open', 0.5)

  const statusColor = (s: string) => s === 'idle' ? '#a3a3a3' : s === 'cultivating' ? '#60a5fa' : s === 'retreating' ? '#c4a2ff' : '#fbbf24'

  // 弟子卡片
  const discipleCards = data.disciples.map(d => {
    const talentHtml = d.talents.map(t =>
      `<span class="${t.positive ? 'stat-up' : 'stat-down'}" style="font-size:9px;margin-right:2px">${t.name}</span>`
    ).join('')
    const expBar = `<div style="background:#1a1a2e;height:3px;border-radius:2px;margin-top:2px"><div style="background:#60a5fa;height:3px;border-radius:2px;width:${Math.min(100, d.exp / d.expToNext * 100)}%"></div></div>`
    const roleTag = d.roleName ? `<span class="q2" style="font-size:9px;margin-left:2px">[${d.roleName}]</span>` : ''

    let actions = ''
    if (d.status === 'idle') {
      actions = `<button data-dact="cultivate:${d.uid}" style="font-size:10px;padding:2px 5px">修炼</button>
        <button data-dact="retreat:${d.uid}" style="font-size:10px;padding:2px 5px">闭关</button>
        ${d.canGuide ? `<button data-dact="guide:${d.uid}" style="font-size:10px;padding:2px 5px">指点</button>` : ''}
        <button data-dact="dispatch:${d.uid}" style="font-size:10px;padding:2px 5px">派遣</button>`
    } else if (d.status === 'cultivating') {
      actions = `<button data-dact="stop:${d.uid}" style="font-size:10px;padding:2px 5px">停止修炼</button>`
    } else if (d.status === 'retreating') {
      actions = `<span class="dim" style="font-size:9px">闭关中 ${d.retreatRemain ?? 0}s</span>
        <button data-dact="break:${d.uid}" style="font-size:10px;padding:2px 5px">出关</button>`
    } else if (d.status === 'dispatched') {
      actions = `<span class="dim" style="font-size:9px">${d.questName ?? '任务中'} ${d.questRemain ?? 0}s</span>`
    }
    actions += `<button data-dact="equip:${d.uid}" style="font-size:10px;padding:2px 5px">装备</button>`
    if (d.canPromote) actions += `<button data-dact="promote:${d.uid}" style="font-size:10px;padding:2px 5px">晋升</button>`

    return `<div class="compare-item" style="border-left:3px solid ${d.rootColor}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="q1" style="font-size:12px">${d.name}</span>
        <span style="font-size:10px;color:${statusColor(d.status)}">${d.statusLabel}</span>
      </div>
      <div style="font-size:10px;margin-top:1px">
        <span style="color:${d.rootColor}">${d.rootName}</span>
        <span class="dim">${d.rootTierLabel}</span>
        <span class="q3">${d.realmName}</span>
        <span class="dim">${d.rankName}</span>${roleTag}
        <span style="color:#f0d98c">战${d.power}</span>
      </div>
      <div style="font-size:9px;color:#9a937f;margin-top:1px">攻${d.atk} 防${d.def} 体${d.maxHp} 暴${d.crit}% 忠${d.loyalty} 好${d.affection}</div>
      <div style="margin-top:1px">${talentHtml}</div>
      ${expBar}
      <div style="display:flex;gap:2px;flex-wrap:wrap;margin-top:3px">${actions}</div>
    </div>`
  }).join('')

  // 招募区域
  let recruitSection = ''
  if (data.candidate) {
    const c = data.candidate
    const talentHtml = c.talents.map(t =>
      `<span class="${t.positive ? 'stat-up' : 'stat-down'}" style="font-size:9px;margin-right:2px">${t.name}</span>`
    ).join('')
    recruitSection = `<div style="border:1px dashed #f0d98c;padding:6px;margin-top:6px;border-radius:4px">
      <div style="font-size:11px;color:#f0d98c;margin-bottom:3px">待招募人选</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="q2" style="font-size:12px">${c.name}</span>
        <span style="font-size:10px;color:${c.rootColor}">${c.rootName} ${c.rootTierLabel}</span>
      </div>
      <div style="font-size:9px;color:#9a937f;margin-top:1px">攻${c.atk} 防${c.def} 体${c.maxHp} 暴${c.crit}% 忠${c.loyalty}</div>
      <div style="margin-top:1px">${talentHtml}</div>
      <div style="display:flex;gap:4px;margin-top:4px">
        <button data-dact="recruit_accept" style="flex:1;padding:4px;font-size:11px">收入门下</button>
        <button data-dact="recruit_reject" style="flex:1;padding:4px;font-size:11px">婉拒</button>
      </div>
    </div>`
  } else if (data.recruitCooldownRemain > 0) {
    recruitSection = `<div style="text-align:center;margin-top:6px;padding:6px;border:1px solid var(--line);border-radius:4px">
      <span class="dim" style="font-size:11px">招募冷却中 · ${data.recruitCooldownRemain}s 后可招募</span>
    </div>`
  } else if (data.count < data.capacity) {
    recruitSection = `<div style="text-align:center;margin-top:6px">
      <button data-dact="recruit_accept" style="padding:6px 16px;font-size:12px">广纳门徒</button>
    </div>`
  } else {
    recruitSection = `<div style="text-align:center;margin-top:6px">
      <span class="dim" style="font-size:11px">弟子房已满，升级弟子房可增加名额</span>
    </div>`
  }

  let html = `<div class="card wide sect-dashboard">
    <div style="text-align:center;margin-bottom:6px">
      <span class="q3" style="font-size:14px">弟子堂</span>
      <span class="sub" style="display:inline;margin-left:4px">${data.count} / ${data.capacity}</span>
    </div>
    <div style="max-height:55vh;overflow-y:auto">
      ${discipleCards || '<p class="dim" style="text-align:center">尚无弟子</p>'}
    </div>
    ${recruitSection}
    <div style="text-align:right;margin-top:8px"><button data-close>关闭</button></div>
  </div>`

  panel.innerHTML = html

  // 弟子操作按钮
  const handleDact = (action: string, uid?: string) => {
    sfx('sfx_click', 0.4)
    switch (action) {
      case 'cultivate': discipleCallbacks.onCultivate?.(uid!); break
      case 'stop': discipleCallbacks.onStopCultivate?.(uid!); break
      case 'retreat': discipleCallbacks.onRetreat?.(uid!); break
      case 'break': discipleCallbacks.onBreakRetreat?.(uid!); break
      case 'guide': discipleCallbacks.onGuide?.(uid!); break
      case 'dispatch': discipleCallbacks.onDispatch?.(uid!); break
      case 'equip': closePanel(); discipleCallbacks.onEquip?.(uid!); break
      case 'promote': closePanel(); discipleCallbacks.onPromote?.(uid!); break
      case 'recruit_accept': discipleCallbacks.onRecruitAccept?.(); break
      case 'recruit_reject': discipleCallbacks.onRecruitReject?.(); break
    }
  }

  panel.querySelectorAll('[data-dact]').forEach(b => b.addEventListener('click', (e) => {
    const raw = (e.target as HTMLElement).getAttribute('data-dact')!
    const [action, uid] = raw.split(':')
    handleDact(action, uid)
  }))
  panel.querySelector('[data-close]')!.addEventListener('click', closePanel)
}


export function openSettings() {
  const panel = el('panel')
  panel.classList.add('open')
  onPanelToggle?.(true)
  sfx('sfx_open', 0.5)

  const bgmVol = Math.round(getBgmVolume() * 100)
  const sfxVol = Math.round(getSfxVolume() * 100)
  const slots = listSaveSlots()

  let html = `<div class="card" style="max-width:320px">
    <div style="font-size:15px;font-weight:bold;text-align:center;margin-bottom:10px;color:#e8d8a0">修行设置</div>

    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:12px;color:#9a937f">仙音</span>
        <span id="bgmVolLabel" style="font-size:11px;color:#9a937f">${bgmVol}%</span>
      </div>
      <input type="range" id="bgmSlider" min="0" max="100" value="${bgmVol}" style="width:100%;accent-color:#7c9cb0">
    </div>

    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:12px;color:#9a937f">法音</span>
        <span id="sfxVolLabel" style="font-size:11px;color:#9a937f">${sfxVol}%</span>
      </div>
      <input type="range" id="sfxSlider" min="0" max="100" value="${sfxVol}" style="width:100%;accent-color:#7c9cb0">
    </div>

    <div style="border-top:1px solid #3a4356;margin:8px 0;padding-top:8px">
      <div style="font-size:12px;color:#9a937f;margin-bottom:6px">视野调节</div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <button id="zoomOutBtn" style="flex:1;padding:6px;font-size:14px">− 拉远</button>
        <button id="zoomResetBtn" style="flex:1;padding:6px;font-size:12px">默认</button>
        <button id="zoomInBtn" style="flex:1;padding:6px;font-size:14px">＋ 拉近</button>
      </div>
    </div>

    <div style="border-top:1px solid #3a4356;margin:8px 0;padding-top:8px">
      <div style="font-size:12px;color:#9a937f;margin-bottom:6px">大地图模式</div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <button id="render2DBtn" style="flex:1;padding:6px;font-size:13px${state.renderMode === '2d' ? ';background:#3a5a7a;color:#e8d8a0' : ''}">2D 平面</button>
        <button id="render3DBtn" style="flex:1;padding:6px;font-size:13px${state.renderMode === '3d' ? ';background:#3a5a7a;color:#e8d8a0' : ''}">3D 幻境</button>
      </div>
    </div>

    <div style="border-top:1px solid #3a4356;margin:8px 0;padding-top:8px">
      <button id="settingsLoadBtn" style="width:100%;margin-bottom:6px;padding:6px;font-size:12px">转劫重修</button>
      ${settingsCallbacks.onBuildHome ? '<button id="settingsBuildHomeBtn" style="width:100%;margin-bottom:6px;padding:6px;font-size:12px;color:#48e0d0">开辟新洞府</button>' : ''}
      <button id="settingsTitleBtn" style="width:100%;margin-bottom:6px;padding:6px;font-size:12px">返回山门</button>
    </div>

    <div style="text-align:right">
      <button data-close style="padding:6px 16px;font-size:12px">继续修行</button>
    </div>
  </div>`

  panel.innerHTML = html

  // 音量滑条
  const bgmSlider = el<HTMLInputElement>('bgmSlider')
  const sfxSlider = el<HTMLInputElement>('sfxSlider')
  const bgmLabel = el('bgmVolLabel')
  const sfxLabel = el('sfxVolLabel')

  bgmSlider.addEventListener('input', () => {
    const v = parseInt(bgmSlider.value, 10)
    setBgmVolume(v / 100)
    bgmLabel.textContent = `${v}%`
  })
  sfxSlider.addEventListener('input', () => {
    const v = parseInt(sfxSlider.value, 10)
    setSfxVolume(v / 100)
    sfxLabel.textContent = `${v}%`
    sfx('sfx_click', 0.3)
  })

  // 视野调节
  el('zoomInBtn').addEventListener('click', () => {
    sfx('sfx_click', 0.3)
    settingsCallbacks.onZoom?.(-100)
  })
  el('zoomOutBtn').addEventListener('click', () => {
    sfx('sfx_click', 0.3)
    settingsCallbacks.onZoom?.(100)
  })
  el('zoomResetBtn').addEventListener('click', () => {
    sfx('sfx_click', 0.3)
    settingsCallbacks.onResetCamera?.()
  })

  // 2D/3D 渲染模式切换
  el('render2DBtn').addEventListener('click', () => {
    sfx('sfx_click', 0.3)
    if (state.renderMode === '2d') return
    state.renderMode = '2d'
    saveGame(state)
    closePanel()
    settingsCallbacks.onToggleRenderMode?.()
  })
  el('render3DBtn').addEventListener('click', () => {
    sfx('sfx_click', 0.3)
    if (state.renderMode === '3d') return
    state.renderMode = '3d'
    saveGame(state)
    closePanel()
    settingsCallbacks.onToggleRenderMode?.()
  })

  // 转劫重修（读档）
  el('settingsLoadBtn').addEventListener('click', async () => {
    sfx('sfx_click', 0.4)
    if (slots.length === 0) {
      toast('暂无其他存档可读取', '#ff8888')
      return
    }
    const options = slots.map((m) => ({
      label: `[${m.index + 1}] ${m.heroName} · Lv.${m.level}（${new Date(m.updatedAt).toLocaleDateString()}）`,
      value: String(m.index),
    }))
    options.push({ label: '返回', value: 'back' })
    const choice = await showDialog('转劫重修', ['选择要读取的存档：'], options)
    if (choice === null || choice === 'back') return
    const slotIndex = parseInt(choice, 10)
    closePanel()
    settingsCallbacks.onLoadSave?.(slotIndex)
  })

  // 返回山门（退回标题）
  el('settingsTitleBtn').addEventListener('click', () => {
    sfx('sfx_click', 0.4)
    closePanel()
    settingsCallbacks.onReturnTitle?.()
  })

  // 开辟新洞府
  const buildHomeBtn = document.getElementById('settingsBuildHomeBtn')
  if (buildHomeBtn) {
    buildHomeBtn.addEventListener('click', () => {
      sfx('sfx_click', 0.4)
      closePanel()
      settingsCallbacks.onBuildHome?.()
    })
  }

  panel.querySelector('[data-close]')!.addEventListener('click', closePanel)
}

export function openPanel(tab: Tab) {
  const panel = el('panel')
  panel.classList.add('open')
  delete panel.dataset.modal
  onPanelToggle?.(true)
  sfx('sfx_open', 0.5)
  let html = `<div class="card${tab === 'equip' || tab === 'skill' ? ' wide' : ''}"><div class="tabs">
    <button data-tab="equip" class="${tab === 'equip' ? 'active' : ''}">装备</button>
    <button data-tab="skill" class="${tab === 'skill' ? 'active' : ''}">功法</button>
    <button data-tab="talent" class="${tab === 'talent' ? 'active' : ''}">天赋</button>
    <button data-tab="artifact" class="${tab === 'artifact' ? 'active' : ''}">法宝</button>
    <button data-tab="codex" class="${tab === 'codex' ? 'active' : ''}">图鉴</button>
    <button data-tab="contacts" class="${tab === 'contacts' ? 'active' : ''}">人脉</button>
    <button data-tab="log" class="${tab === 'log' ? 'active' : ''}">见闻录</button>
  </div><div id="tabBody"></div>
  <div style="text-align:right;margin-top:8px"><button data-close>关闭</button></div></div>`
  panel.innerHTML = html
  panel.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', (e) => openPanel((e.target as HTMLElement).getAttribute('data-tab') as Tab)))
  panel.querySelector('[data-close]')!.addEventListener('click', closePanel)
  renderTab(tab)
}

function body() { return el('tabBody') }
function refresh(tab: Tab) { saveGame(state); updateHUD(); renderTab(tab) }

function renderTab(tab: Tab) {
  if (tab === 'equip') renderEquipTab()
  else if (tab === 'skill') renderSkillTab()
  else if (tab === 'artifact') renderArtifactTab()
  else if (tab === 'codex') renderCodexTab()
  else if (tab === 'contacts') renderContactsTab()
  else if (tab === 'log') renderLogTab()
  else renderTalentTab()
}

/** 生成两件装备的属性对比（新装备 vs 旧装备） */
function compareItems(oldIt: EquipItem | null, newIt: EquipItem): string {
  const stats: Array<[string, number, number]> = []
  const oAtk = (oldIt?.atk ?? 0) + (oldIt?.enh ?? 0) * 2
  const nAtk = (newIt.atk ?? 0) + (newIt.enh ?? 0) * 2
  if (oAtk !== nAtk) stats.push(['攻', oAtk, nAtk])
  const oDef = (oldIt?.def ?? 0) + (oldIt?.enh ?? 0) * 2
  const nDef = (newIt.def ?? 0) + (newIt.enh ?? 0) * 2
  if (oDef !== nDef) stats.push(['防', oDef, nDef])
  const oSpd = oldIt?.speed ?? 0, nSpd = newIt.speed ?? 0
  if (oSpd !== nSpd) stats.push(['速', oSpd, nSpd])
  const oHp = oldIt?.maxHp ?? 0, nHp = newIt.maxHp ?? 0
  if (oHp !== nHp) stats.push(['气血', oHp, nHp])
  const oCrt = oldIt?.crit ?? 0, nCrt = newIt.crit ?? 0
  if (oCrt !== nCrt) stats.push(['会心', Math.round(oCrt * 100), Math.round(nCrt * 100)])
  if (stats.length === 0) return '<span class="sub" style="color:#9a937f">属性持平</span>'
  return stats.map(([label, oldV, newV]) => {
    const diff = newV - oldV
    const cls = diff > 0 ? 'stat-up' : diff < 0 ? 'stat-down' : ''
    const sign = diff > 0 ? '+' : ''
    return `<span class="${cls}">${label} ${oldV}→${newV}(${sign}${diff})</span>`
  }).join(' ')
}

/** 生成装备简要属性（对比面板紧凑显示） */
function itemStatsBrief(it: EquipItem): string {
  const parts: string[] = []
  if (it.atk) parts.push(`攻${it.atk + (it.enh ?? 0) * 2}`)
  if (it.def) parts.push(`防${it.def + (it.enh ?? 0) * 2}`)
  if (it.speed) parts.push(`速${it.speed}`)
  if (it.maxHp) parts.push(`血${it.maxHp}`)
  if (it.crit) parts.push(`会${(it.crit * 100).toFixed(0)}%`)
  return parts.join(' ')
}

function itemLabel(it: EquipItem) {
  const parts: string[] = []
  if (it.atk) parts.push(`攻+${it.atk}`)
  if (it.def) parts.push(`防+${it.def}`)
  if (it.speed) parts.push(`速+${it.speed}`)
  if (it.crit) parts.push(`会心+${(it.crit * 100).toFixed(0)}%`)
  if (it.maxHp) parts.push(`气血+${it.maxHp}`)
  const lv = it.itemLevel ?? 1
  const lvTag = `<span class="sub">Lv.${lv}</span>`
  const enhTag = (it.enh ?? 0) > 0 ? ` <span class="q3">+${it.enh}</span>` : ''
  const refineTag = (it.refine ?? 0) > 0 ? ` <span class="q2">精${it.refine}</span>` : ''
  const starTag = (it.star ?? 0) > 0 ? ` <span style="color:#ffd54a">${'★'.repeat(it.star!)}</span>` : ''
  const namedTag = it.named ? '<span style="color:#ffd54a">✦</span>' : ''
  return `[${QUALITY_NAMES[it.quality]}] ${namedTag}${it.name} ${lvTag}${enhTag}${refineTag}${starTag} ${parts.join(' ')}`
}

function affixLine(it: EquipItem) {
  if (it.affixes.length === 0) return ''
  const s = it.affixes.map((a) => {
    const txt = `${a.name}·${MOD_LABELS[a.stat](a.value)}`
    return a.lucky ? `<span style="color:#ffd54a">✦${txt}</span>` : txt
  }).join(' ')
  return `<span class="sub">${s}</span>`
}

function renderEquipTab() {
  const st = calcStats(state)
  const realm = REALMS[state.realm]
  const next = REALMS[state.realm + 1]
  let html = ''
  // 境界行
  html += `<div class="item"><span class="q3">【境界】${realm.name}${state.realm > 0 ? `（基础属性 +${(REALM_STAT_BONUS * state.realm * 100).toFixed(0)}%）` : ''}
    <span class="sub">${next ? `突破【${next.name}】需 Lv.${next.level} + 突破石×${next.stones}（现有 ${state.materials.tupo ?? 0}）` : '已达当前最高境界'}</span></span>`
  if (next) html += `<button data-breakthrough ${canBreakthrough() ? '' : 'disabled'}>突破</button>`
  else if (canAscend(state)) html += `<button data-ascend>飞升</button>`
  html += `</div>`
  if (state.ascensionCount > 0) {
    const ab = ascensionBonus(state.ascensionCount)
    html += `<div class="item"><span class="q4">【飞升】第${state.ascensionCount}世<span class="sub">属性 ×${ab.statMult.toFixed(2)} · 经验 ×${ab.expMult.toFixed(2)} · 额外技能点 +${ab.extraSkillPoints}</span></span></div>`
  }
  if (!next && !canAscend(state)) {
    html += `<div class="item"><span class="dim">飞升条件：破碎仙宫达到 ${ASCENSION_REQUIREMENTS.minXianFloor} 层（当前 ${state.xianMaxDepth}）</span></div>`
  }
  html += `<p class="dim">攻 ${st.atk} · 防 ${st.def} · 速 ${st.speed} · 会心 ${(st.crit * 100).toFixed(0)}% · 攻速 +${(st.aspd * 100).toFixed(0)}% · 吸血 ${(st.lifesteal * 100).toFixed(0)}%</p>`

  // 配装方案
  html += `<div class="item" style="flex-wrap:wrap;gap:4px">`
  for (let i = 0; i < PRESET_COUNT; i++) {
    const saved = !!state.presets[i]
    const active = state.activePreset === i
    html += `<span style="white-space:nowrap">
      <button data-preset-load="${i}" ${saved ? '' : 'disabled'} class="${active ? 'q3' : ''}">${active ? '▶' : ''}方案${i + 1}${saved ? '' : '·空'}</button><button data-preset-save="${i}">存</button></span>`
  }
  html += `</div>`

  // ===== 左右对比布局 =====
  html += `<div class="compare-grid">`

  // 左列：已装备
  html += `<div class="compare-col"><h5>已装备</h5><div class="compare-col-scroll">`
  for (const slot of SLOT_KEYS) {
    const it = state.equipment[slot]
    if (it) {
      const cost = enhanceCost(it)
      const enhTag = (it.enh ?? 0) > 0 ? ` <span class="q3">+${it.enh}</span>` : ''
      html += `<div class="compare-item" data-eq-slot="${slot}">
        <span class="q${it.quality}">【${SLOT_NAMES[slot]}】${it.name}${enhTag} Lv.${it.itemLevel ?? 1}</span>
        <span class="sub">${itemStatsBrief(it)}</span>
        ${affixLine(it) ? `<span class="sub">${affixLine(it)}</span>` : ''}
        <span class="sub">
          ${(it.enh ?? 0) < ENH_MAX ? `<button data-enh="equip:${slot}" ${state.gold >= cost ? '' : 'disabled'} style="font-size:10px;padding:2px 6px">强化(${cost})</button> ` : ''}
          <button data-unequip="${slot}" style="font-size:10px;padding:2px 6px">卸下</button>
        </span>
      </div>`
    } else {
      html += `<div class="compare-item"><span class="dim">【${SLOT_NAMES[slot]}】——</span></div>`
    }
  }
  // 套装信息
  for (const setId of equippedSetIds(state)) {
    const set = SETS[setId] ?? V4_KIT_SETS.get(setId)
    if (!set) continue
    const n = setPieceCount(state, setId)
    const lines = set.bonuses.map((bonus) => `<span class="${isSetBonusActive(n, bonus) ? 'q1' : 'dim'}">${bonus.desc}</span>`).join('<br>')
    html += `<div class="compare-item"><span class="q2">套装【${set.name}】${n}/${set.pieces.length}<span class="sub">${lines}</span></span></div>`
  }
  html += `</div></div>`

  // 右列：行囊
  const filterInventory = (it: EquipItem): boolean => {
    if (invFilter === 'all') return true
    if (invFilter === 'weapon') return it.slot === 'weapon'
    if (invFilter === 'armor') return it.slot === 'head' || it.slot === 'armor' || it.slot === 'boots'
    if (invFilter === 'accessory') return it.slot === 'charm'
    return true
  }
  const filtered: Array<{ it: EquipItem; idx: number }> = []
  state.inventory.forEach((it, idx) => { if (filterInventory(it)) filtered.push({ it, idx }) })

  const commonCount = state.inventory.filter((it) => it.quality === 0).length
  const commonTotal = state.inventory.filter((it) => it.quality === 0)
    .reduce((sum, it) => sum + it.price + (it.enh ?? 0) * 10, 0)

  html += `<div class="compare-col"><h5>行囊（${state.inventory.length}）</h5>`
  html += `<div style="display:flex;gap:2px;margin-bottom:4px;flex-wrap:wrap">
    <button data-inv-filter="all" class="${invFilter === 'all' ? 'q3' : 'dim'}" style="padding:2px 6px;font-size:10px;border:1px solid var(--line)">全</button>
    <button data-inv-filter="weapon" class="${invFilter === 'weapon' ? 'q3' : 'dim'}" style="padding:2px 6px;font-size:10px;border:1px solid var(--line)">武</button>
    <button data-inv-filter="armor" class="${invFilter === 'armor' ? 'q3' : 'dim'}" style="padding:2px 6px;font-size:10px;border:1px solid var(--line)">防</button>
    <button data-inv-filter="accessory" class="${invFilter === 'accessory' ? 'q3' : 'dim'}" style="padding:2px 6px;font-size:10px;border:1px solid var(--line)">饰</button>
    <button data-sell-all-common ${commonCount > 0 ? '' : 'disabled'} style="padding:2px 6px;font-size:10px;margin-left:auto">售凡×${commonCount}</button>
  </div><div class="compare-col-scroll">`
  if (filtered.length === 0) {
    html += `<p class="dim" style="font-size:11px">${state.inventory.length === 0 ? '空空如也' : '该分类无装备'}</p>`
  }
  filtered.forEach(({ it, idx }) => {
    // 找到对应槽位当前装备，生成对比
    const slotKey: SlotKey = it.slot === 'charm' ? 'charm1' : it.slot
    const currentEquipped = state.equipment[slotKey] ?? state.equipment[it.slot === 'charm' ? 'charm2' : it.slot] ?? null
    const cmp = compareItems(currentEquipped, it)
    const enhTag = (it.enh ?? 0) > 0 ? ` <span class="q3">+${it.enh}</span>` : ''
    html += `<div class="compare-item" data-inv-idx="${idx}">
      <span class="q${it.quality}">${it.name}${enhTag} <span class="sub" style="display:inline">Lv.${it.itemLevel ?? 1}</span></span>
      <span class="sub">${itemStatsBrief(it)}</span>
      ${affixLine(it) ? `<span class="sub">${affixLine(it)}</span>` : ''}
      <span class="sub" style="margin-top:1px">${cmp}</span>
      <span class="sub">
        <button data-equip="${idx}" style="font-size:10px;padding:2px 6px">装备</button>
        ${(it.enh ?? 0) < ENH_MAX ? `<button data-enh="inv:${idx}" ${state.gold >= enhanceCost(it) ? '' : 'disabled'} style="font-size:10px;padding:2px 6px">强化</button>` : ''}
        <button data-sell="${idx}" style="font-size:10px;padding:2px 6px">售</button>
      </span>
    </div>`
  })
  html += `</div></div></div>`

  body().innerHTML = html

  body().querySelectorAll('[data-preset-save]').forEach((b) => b.addEventListener('click', (e) => {
    const i = Number((e.target as HTMLElement).getAttribute('data-preset-save'))
    state.presets[i] = snapshotPreset(state)
    state.activePreset = i
    sfx('sfx_skill')
    toast(`当前配置已存入【方案${i + 1}】`, '#58d68d')
    refresh('equip')
  }))
  body().querySelectorAll('[data-preset-load]').forEach((b) => b.addEventListener('click', (e) => {
    const i = Number((e.target as HTMLElement).getAttribute('data-preset-load'))
    const p = state.presets[i]
    if (!p) return
    if (state.activePreset >= 0 && state.activePreset !== i) {
      state.presets[state.activePreset] = snapshotPreset(state)
    }
    applyPreset(state, p)
    state.activePreset = i
    sfx('sfx_skill')
    toast(`已切换至【方案${i + 1}】`, '#e8c86a')
    refresh('equip')
  }))
  body().querySelector('[data-breakthrough]')?.addEventListener('click', () => {
    if (!canBreakthrough()) return
    const next = REALMS[state.realm + 1]
    const realmIndex = state.realm + 1

    if (needsTribulation(realmIndex)) {
      if (!tribulationStartCallback) {
        toast('需返回洞府方可渡劫', '#ff8888')
        return
      }
      const trib = getTribulation(realmIndex)!
      const panel = el('panel')
      panel.classList.add('open')
      panel.dataset.modal = '1'
      onPanelToggle?.(true)
      panel.innerHTML = `<div class="card">
        <h3>${trib.name}</h3>
        <p>突破至【${next.name}】需经受天劫考验！</p>
        <p class="dim">天雷持续 ${Math.ceil(trib.durationMs / 1000)} 秒，共 ${trib.maxStrikesTotal} 道天雷。</p>
        <p class="dim">每道天雷造成 ${trib.damagePerStrike} 点伤害。</p>
        <div style="text-align:center">
          <button data-trib-start>开始渡劫</button>
          <button data-trib-cancel>再等等</button>
        </div>
      </div>`
      panel.querySelector('[data-trib-start]')!.addEventListener('click', () => {
        sfx('sfx_click')
        state.materials.tupo -= next.stones
        closePanel()
        tribulationStartCallback!(realmIndex)
      })
      panel.querySelector('[data-trib-cancel]')!.addEventListener('click', () => {
        sfx('sfx_click')
        closePanel()
      })
      return
    }

    state.materials.tupo -= next.stones
    state.realm++
    state.hp = -1
    sfx('sfx_levelup')
    toast(`突破成功！晋入【${next.name}】，气血回满`, '#e8c86a')
    refresh('equip')
  })
  body().querySelector('[data-ascend]')?.addEventListener('click', () => {
    if (!canAscend(state)) return
    const panel = el('panel')
    panel.classList.add('open')
    panel.dataset.modal = '1'
    onPanelToggle?.(true)
    const ab = ascensionBonus(state.ascensionCount + 1)
    panel.innerHTML = `<div class="card">
      <h3>飞升转世</h3>
      <p>飞升将重置境界至炼气，但保留等级、装备、功法等。</p>
      <p>第 ${state.ascensionCount + 1} 世永久加成：</p>
      <p class="dim">属性 ×${ab.statMult.toFixed(2)} · 经验 ×${ab.expMult.toFixed(2)} · 额外技能点 +${ab.extraSkillPoints}</p>
      <div style="text-align:center">
        <button data-ascend-ok>确认飞升</button>
        <button data-ascend-cancel>再想想</button>
      </div>
    </div>`
    panel.querySelector('[data-ascend-ok]')!.addEventListener('click', () => {
      sfx('sfx_breakthrough')
      performAscension(state)
      saveGame(state)
      closePanel()
      toast(`飞升成功！进入第${state.ascensionCount}世轮回`, '#c8a2ff')
      refresh('equip')
    })
    panel.querySelector('[data-ascend-cancel]')!.addEventListener('click', () => {
      sfx('sfx_click')
      closePanel()
    })
  })
  body().querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', (e) => {
    const idx = Number((e.target as HTMLElement).getAttribute('data-equip'))
    const it = state.inventory[idx]
    if (!it) return
    state.inventory.splice(idx, 1)
    const slotKey: SlotKey = it.slot === 'charm' ? (state.equipment.charm1 ? 'charm2' : 'charm1') : it.slot
    const old = state.equipment[slotKey]
    if (old) state.inventory.push(old)
    state.equipment[slotKey] = it
    sfx('sfx_equip')
    toast(`装备了 ${it.name}`, '#58d68d')
    refresh('equip')
  }))
  body().querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('click', (e) => {
    const idx = Number((e.target as HTMLElement).getAttribute('data-sell'))
    const [it] = state.inventory.splice(idx, 1)
    if (it) {
      const gain = it.price + (it.enh ?? 0) * 10
      state.gold += gain
      sfx('sfx_pickup', 0.5)
      toast(`出售 ${it.name}，+${gain} 灵石`)
    }
    refresh('equip')
  }))
  body().querySelectorAll('[data-enh]').forEach((b) => b.addEventListener('click', (e) => {
    const [kind, key] = (e.target as HTMLElement).getAttribute('data-enh')!.split(':')
    const it = kind === 'equip' ? state.equipment[key as SlotKey] : state.inventory[Number(key)]
    if (!it || (it.enh ?? 0) >= ENH_MAX) return
    const cost = enhanceCost(it)
    if (state.gold < cost) return
    state.gold -= cost
    it.enh = (it.enh ?? 0) + 1
    sfx('sfx_equip')
    toast(`${it.name} 强化至 +${it.enh}！`, '#e8c86a')
    refresh('equip')
  }))
  body().querySelectorAll('[data-unequip]').forEach((b) => b.addEventListener('click', (e) => {
    const slot = (e.target as HTMLElement).getAttribute('data-unequip') as SlotKey
    const it = state.equipment[slot]
    if (it) { state.equipment[slot] = null; state.inventory.push(it) }
    sfx('sfx_equip', 0.45)
    refresh('equip')
  }))
  body().querySelectorAll('[data-inv-filter]').forEach((b) => b.addEventListener('click', (e) => {
    invFilter = (e.target as HTMLElement).getAttribute('data-inv-filter') as InvFilter
    sfx('sfx_click', 0.3)
    refresh('equip')
  }))
  body().querySelector('[data-sell-all-common]')?.addEventListener('click', () => {
    const commons = state.inventory.filter((it) => it.quality === 0)
    if (commons.length === 0) return
    let total = 0
    state.inventory = state.inventory.filter((it) => {
      if (it.quality === 0) {
        total += it.price + (it.enh ?? 0) * 10
        return false
      }
      return true
    })
    state.gold += total
    sfx('sfx_pickup', 0.5)
    toast(`售出凡品 ${commons.length} 件，+${total} 灵石`)
    refresh('equip')
  })
}

// ---------- 功法页 ----------
/** 职业印记徽章颜色 */
const CLASS_BADGE: Record<string, { name: string; color: string; bg: string }> = {
  sword: { name: '剑修', color: '#fff', bg: '#5dade2' },
  fairy: { name: '仙子', color: '#fff', bg: '#af7ac5' },
  sword_new: { name: '道修', color: '#fff', bg: '#27ae60' },
  fairy_new: { name: '合欢', color: '#fff', bg: '#e84393' },
  mage: { name: '法修', color: '#fff', bg: '#f39c12' },
  any: { name: '通用', color: '#333', bg: '#f0d98c' },
}

/** 生成职业印记 HTML */
function classBadgeHtml(skillClass: string): string {
  const b = CLASS_BADGE[skillClass] ?? { name: skillClass, color: '#fff', bg: '#888' }
  return `<span class="class-badge" style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;color:${b.color};background:${b.bg};margin-right:4px;vertical-align:middle">${b.name}</span>`
}

/** 生成功法升级效果对比文本（当前等级 vs 下一等级） */
function skillUpgradeCompare(id: string, lv: number): string {
  const def = SKILLS.get(id)
  if (!def) return ''
  if (lv >= SKILL_MAX_LEVEL) return '<span class="sub" style="color:#ffd54a">已满级</span>'

  if (def.type === 'mind' && def.mods) {
    const cur = mindModsAt(id, lv)
    const nxt = mindModsAt(id, lv + 1)
    const parts: string[] = []
    for (const [k, v] of Object.entries(cur)) {
      const nv = (nxt as Record<string, number>)[k]
      if (nv !== undefined) {
        parts.push(`${MOD_LABELS[k as keyof typeof MOD_LABELS](v as number)} → ${MOD_LABELS[k as keyof typeof MOD_LABELS](nv)}`)
      }
    }
    return `<span class="sub">下级效果：${parts.join(' · ')}</span>`
  }

  if ((def.type === 'style' || def.type === 'art') && def.power) {
    const cur = skillPowerAt(state, id)
    const nxt = (def.power ?? 1) * (1 + 0.12 * lv)
    const delta = nxt - cur
    return `<span class="sub">威力：${cur.toFixed(2)} → ${nxt.toFixed(2)}（下级 +${delta.toFixed(2)}）</span>`
  }

  return ''
}

function renderSkillTab() {
  let html = `<p class="dim">悟道点 ${state.insight} · 升级消耗 = 当前等级 × 2</p>`

  // ===== 左右对比布局 =====
  html += `<div class="compare-grid">`

  // 左列：已装配
  html += `<div class="compare-col"><h5>已装配</h5><div class="compare-col-scroll">`
  const slots: Array<[string, string | null, string]> = [
    ['招式', state.skillSlots.style, 'style'],
    ['心法一', state.skillSlots.minds[0], 'mind'],
    ['心法二', state.skillSlots.minds[1], 'mind'],
    ['神通', state.skillSlots.art, 'art'],
  ]
  for (const [label, id, type] of slots) {
    if (id) {
      const def = SKILLS.get(id)
      const lv = state.skills[id] ?? 1
      const upCost = upgradeCost(lv)
      const badge = def ? classBadgeHtml(def.class) : ''
      html += `<div class="compare-item">
        <span class="q1">${badge}【${label}】《${def?.name ?? id}》 Lv.${lv}</span>
        <span class="sub">${def?.desc ?? ''}</span>
        ${def ? skillUpgradeCompare(id, lv) : ''}
        <span class="sub">
          <button data-unskill="${id}" style="font-size:10px;padding:2px 6px">卸下</button>
          ${lv < SKILL_MAX_LEVEL ? `<button data-upskill="${id}" ${canUpgrade(state, id) ? '' : 'disabled'} style="font-size:10px;padding:2px 6px">升级(${upCost})</button>` : ''}
        </span>
      </div>`
    } else {
      html += `<div class="compare-item"><span class="dim">【${label}】——</span></div>`
    }
  }
  html += `</div></div>`

  // 右列：已习得
  html += `<div class="compare-col"><h5>已习得</h5>`
  html += `<div style="display:flex;gap:2px;margin-bottom:4px;flex-wrap:wrap">
    <button data-skill-filter="all" class="${skillFilter === 'all' ? 'q3' : 'dim'}" style="padding:2px 6px;font-size:10px;border:1px solid var(--line)">全</button>
    <button data-skill-filter="style" class="${skillFilter === 'style' ? 'q3' : 'dim'}" style="padding:2px 6px;font-size:10px;border:1px solid var(--line)">招</button>
    <button data-skill-filter="art" class="${skillFilter === 'art' ? 'q3' : 'dim'}" style="padding:2px 6px;font-size:10px;border:1px solid var(--line)">神</button>
    <button data-skill-filter="mind" class="${skillFilter === 'mind' ? 'q3' : 'dim'}" style="padding:2px 6px;font-size:10px;border:1px solid var(--line)">心</button>
  </div><div class="compare-col-scroll">`
  const learned = Object.entries(state.skills).filter(([id]) => {
    const def = SKILLS.get(id)
    if (!def) return false
    if (skillFilter === 'all') return true
    return def.type === skillFilter
  })
  if (learned.length === 0) {
    html += `<p class="dim" style="font-size:11px">${skillFilter === 'all' ? '尚未习得功法' : '此分类无功法'}</p>`
  }
  for (const [id, lv] of learned) {
    const def = SKILLS.get(id)
    if (!def) continue
    const equipped = isSkillEquipped(state, id)
    const upCost = upgradeCost(lv)
    const badge = classBadgeHtml(def.class)
    html += `<div class="compare-item${equipped ? ' selected' : ''}">
      <span class="${equipped ? 'q1' : ''}">${badge}《${def.name}》 ${SKILL_TYPE_NAMES[def.type]} Lv.${lv}${equipped ? ' <span class="equipped-tag">已装</span>' : ''}
      <span class="sub">${def.desc}</span>
      ${skillUpgradeCompare(id, lv)}
      <span class="sub">
        ${equipped ? `<button data-unskill="${id}" style="font-size:10px;padding:2px 6px">卸下</button>` : `<button data-onskill="${id}" style="font-size:10px;padding:2px 6px">装配</button>`}
        ${lv < SKILL_MAX_LEVEL ? `<button data-upskill="${id}" ${canUpgrade(state, id) ? '' : 'disabled'} style="font-size:10px;padding:2px 6px">升级(${upCost})</button>` : ''}
      </span>
    </div>`
  }
  html += `</div></div></div>`

  body().innerHTML = html

  body().querySelectorAll('[data-skill-filter]').forEach((b) => b.addEventListener('click', (e) => {
    skillFilter = (e.target as HTMLElement).getAttribute('data-skill-filter') as SkillFilter
    refresh('skill')
  }))
  body().querySelectorAll('[data-onskill]').forEach((b) => b.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).getAttribute('data-onskill')!
    const r = equipSkill(state, id)
    if (r === 'full') toast('心法槽已满，请先卸下', '#ff8888')
    else if (r === 'ok') { sfx('sfx_skill'); toast(`装配了《${SKILLS.get(id)?.name}》`, '#58d68d') }
    refresh('skill')
  }))
  body().querySelectorAll('[data-unskill]').forEach((b) => b.addEventListener('click', (e) => {
    unequipSkill(state, (e.target as HTMLElement).getAttribute('data-unskill')!)
    sfx('sfx_skill', 0.45)
    refresh('skill')
  }))
  body().querySelectorAll('[data-upskill]').forEach((b) => b.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).getAttribute('data-upskill')!
    if (upgradeSkill(state, id)) { sfx('sfx_levelup', 0.6); toast(`《${SKILLS.get(id)?.name}》升至 Lv.${skillLevel(state, id)}`, '#e8c86a') }
    refresh('skill')
  }))
}

// ---------- 天赋页 ----------
function renderTalentTab() {
  const avail = availablePoints(state)
  let html = `<p class="dim">可用天赋点 ${avail}（每升 1 级获得 1 点，已投入 ${spentPoints(state)}）</p>`
  for (const br of TALENT_BRANCHES) {
    html += `<div class="tbranch"><h4>${br.name}</h4>`
    for (const n of br.nodes) {
      const pts = state.talents[n.id] ?? 0
      const pips = '●'.repeat(pts) + '○'.repeat(n.max - pts)
      html += `<div class="tnode"><span>${n.name} <span class="pips">${pips}</span><span class="sub">${n.desc}</span></span>
        <button data-talent="${n.id}" ${avail > 0 && pts < n.max ? '' : 'disabled'}>+</button></div>`
    }
    html += `</div>`
  }
  html += `<div style="margin-top:8px"><button data-respec ${state.gold >= RESPEC_COST && spentPoints(state) > 0 ? '' : 'disabled'}>洗点（${RESPEC_COST} 灵石）</button></div>`

  // 后天灵窍系统（金丹期解锁）
  if (state.realm >= 2) {
    const opened = state.spiritOrifices
    const orbTotal = orificeBonuses(state)
    html += `<div class="tbranch" style="margin-top:10px;border-color:#8b5cf6">
      <h4 style="color:#a78bfa">后天灵窍 <span class="dim" style="font-size:10px">已打通 ${opened}/${SPIRIT_ORIFICES.length}</span></h4>`
    if (opened > 0) {
      html += `<p class="sub" style="margin:2px 0 4px">当前加成：攻+${orbTotal.atk} 防+${orbTotal.def} 体+${orbTotal.maxHp} 暴+${(orbTotal.crit * 100).toFixed(0)}% 速+${orbTotal.speed}</p>`
    }
    if (opened < SPIRIT_ORIFICES.length) {
      const next = SPIRIT_ORIFICES[opened]
      const rate = orificeSuccessRate(state, opened)
      const canOpen = state.gold >= next.cost
      html += `<div class="tnode" style="border-color:#6d28d9">
        <span style="color:#c4b5fd">${next.name}
        <span class="sub" style="color:#9ca3af">攻+${next.atk} 防+${next.def} 体+${next.maxHp} 暴+${(next.crit * 100).toFixed(0)}% 速+${next.speed}</span>
        <span class="sub" style="color:${rate > 0.6 ? '#86efac' : rate > 0.4 ? '#fbbf24' : '#f87171'}">成功率 ${(rate * 100).toFixed(0)}%</span>
        <span class="sub">消耗 ${next.cost.toLocaleString()} 灵石</span>
        </span>
        <button data-orifice ${canOpen ? '' : 'disabled'}>打通</button>
      </div>`
    } else {
      html += `<p class="dim" style="color:#86efac">九窍皆通，灵窍大成！</p>`
    }
    html += `</div>`
  }

  body().innerHTML = html

  body().querySelectorAll('[data-talent]').forEach((b) => b.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).getAttribute('data-talent')!
    if (addPoint(state, id)) { sfx('sfx_click'); toast('天赋 +1', '#5dade2') }
    refresh('talent')
  }))
  body().querySelector('[data-respec]')?.addEventListener('click', () => {
    if (respec(state)) { sfx('sfx_skill'); toast('已洗点，返还全部天赋点', '#5dade2') }
    refresh('talent')
  })
  body().querySelector('[data-orifice]')?.addEventListener('click', () => {
    const idx = state.spiritOrifices
    if (idx >= SPIRIT_ORIFICES.length) return
    const o = SPIRIT_ORIFICES[idx]
    if (state.gold < o.cost) { toast('灵石不足', '#f87171'); return }
    state.gold -= o.cost
    const rate = orificeSuccessRate(state, idx)
    if (Math.random() < rate) {
      state.spiritOrifices++
      sfx('sfx_orifice', 0.6)
      toast(`灵窍「${o.name}」打通！属性大幅提升`, '#a78bfa')
      pushPlayerLog(state, `打通灵窍「${o.name}」，实力大增`)
    } else {
      sfx('sfx_hit', 0.3)
      toast(`灵窍「${o.name}」打通失败，灵石散去`, '#f87171')
      pushPlayerLog(state, `尝试打通灵窍「${o.name}」失败`)
    }
    saveGame(state)
    refresh('talent')
  })
}

// ---------- 法宝页 ----------
function renderArtifactTab() {
  const arts = state.artifacts ?? []
  const canCraft = state.realm >= 2
  let html = ''

  // 已有法宝列表
  html += `<h4 style="margin:0 0 6px">已炼法宝 ${arts.length} 件</h4>`
  if (arts.length > 0) {
    const totalArt = totalArtifactStats(arts)
    html += `<p class="sub" style="margin:2px 0 6px">总属性加成：攻+${totalArt.atk} 防+${totalArt.def} 体+${totalArt.maxHp} 暴+${(totalArt.crit * 100).toFixed(0)}% 速+${totalArt.speed}</p>`
    for (const a of arts) {
      const def = ARTIFACTS[a.defId]
      if (!def) continue
      const s = artifactStats(a)
      const buffVal = artifactBuffValue(a)
      const buffDesc = def.buffType === 'flying_sword' ? `攻击时额外召唤${Math.ceil(buffVal)}把飞剑`
        : def.buffType === 'spell_amplify' ? `法术伤害+${(buffVal * 100).toFixed(0)}%`
        : def.buffType === 'heal_boost' ? `治疗效果+${(buffVal * 100).toFixed(0)}%`
        : def.buffType === 'atk_pct' ? `攻击力+${(buffVal * 100).toFixed(0)}%`
        : def.buffType === 'def_pct' ? `减伤+${(buffVal * 100).toFixed(0)}%`
        : def.buffType === 'all_stats' ? `全属性+${(buffVal * 100).toFixed(0)}%`
        : def.buffType === 'lifesteal' ? `吸血+${(buffVal * 100).toFixed(0)}%`
        : def.buffType === 'crit_boost' ? `暴击+${(buffVal * 100).toFixed(0)}%`
        : ''
      const rCost = refineCost(def.refineCostBase, a.refineLevel)
      const canRefine = a.refineLevel < 9 && state.gold >= rCost
      html += `<div class="tnode" style="border-color:${def.tier === 'mythic' ? '#fbbf24' : def.tier === 'legendary' ? '#a78bfa' : '#6366f1'}">
        <span style="color:${def.tier === 'mythic' ? '#fbbf24' : def.tier === 'legendary' ? '#c4b5fd' : '#a5b4fc'}">${def.name} <span class="dim">+${a.refineLevel}</span>
        <span class="sub">攻+${s.atk} 防+${s.def} 体+${s.maxHp} 暴+${(s.crit * 100).toFixed(0)}% 速+${s.speed}</span>
        <span class="sub" style="color:#fbbf24">${buffDesc}</span>
        ${def.classId ? `<span class="sub">(${CLASSES[def.classId]?.name ?? def.classId}专属)</span>` : '<span class="sub">(全职业)</span>'}
        </span>
        <button data-refine="${a.defId}" ${canRefine ? '' : 'disabled'}>精炼(${rCost.toLocaleString()})</button>
      </div>`
    }
  } else {
    html += `<p class="dim" style="margin:2px 0 6px">尚未炼制任何法宝</p>`
  }

  // 炼制法宝
  html += `<h4 style="margin:10px 0 6px">炼制法宝</h4>`
  if (!canCraft) {
    html += `<p class="dim">需达到${REALMS[2].name}期方可炼制法宝</p>`
  } else {
    for (const def of Object.values(ARTIFACTS)) {
      const already = arts.some(a => a.defId === def.id)
      if (already) continue
      const realmOk = state.realm >= def.craftRealm
      const goldOk = state.gold >= def.craftCost
      const locked = !realmOk
      html += `<div class="tnode" style="border-color:${locked ? '#374151' : '#4b5563'}">
        <span style="color:${locked ? '#6b7280' : '#e5e7eb'}">${def.name}
        <span class="sub">${def.desc}</span>
        <span class="sub">攻+${def.stats.atk} 防+${def.stats.def} 体+${def.stats.maxHp}</span>
        ${def.classId ? `<span class="sub">(${CLASSES[def.classId]?.name ?? def.classId}专属)</span>` : ''}
        <span class="sub">消耗 ${def.craftCost.toLocaleString()} 灵石${def.craftRealm > 2 ? ` · 需${REALMS[def.craftRealm].name}期` : ''}</span>
        </span>
        <button data-craft="${def.id}" ${realmOk && goldOk ? '' : 'disabled'}>${locked ? '未解锁' : '炼制'}</button>
      </div>`
    }
  }

  // 宗门圣物装配
  if (state.sectUnlocked && state.sect) {
    const relics = state.sect.relics ?? []
    while (relics.length < SECT_RELIC_SLOTS) relics.push(null)
    html += `<h4 style="margin:10px 0 6px">宗门圣物（${relics.filter(Boolean).length}/${SECT_RELIC_SLOTS}）</h4>`
    html += `<p class="sub" style="margin:2px 0 6px">将法宝装配为宗门圣物，为宗门与全宗弟子提供属性加成</p>`
    for (let i = 0; i < SECT_RELIC_SLOTS; i++) {
      const r = relics[i]
      if (r) {
        const def = ARTIFACTS[r.defId]
        const s = artifactStats(r)
        html += `<div class="tnode">
          <span style="color:#fbbf24">${def?.name ?? '???'} +${r.refineLevel}
          <span class="sub">攻+${s.atk} 防+${s.def} 体+${s.maxHp}</span>
          </span>
          <button data-unrelic="${i}">卸下</button>
        </div>`
      } else {
        // 可装配的法宝
        const available = arts.filter(a => !relics.some((r2, j) => j !== i && r2?.defId === a.defId))
        if (available.length > 0) {
          html += `<div class="tnode" style="border-color:#374151">
            <span style="color:#9ca3af">空槽位</span>
            <select data-relic="${i}">
              <option value="">选择法宝...</option>
              ${available.map(a => `<option value="${a.defId}">${ARTIFACTS[a.defId]?.name ?? a.defId} +${a.refineLevel}</option>`).join('')}
            </select>
          </div>`
        } else {
          html += `<div class="tnode" style="border-color:#374151"><span style="color:#6b7280">空槽位（无可装配法宝）</span></div>`
        }
      }
    }
  }

  body().innerHTML = html

  // 精炼事件
  body().querySelectorAll('[data-refine]').forEach((b) => b.addEventListener('click', (e) => {
    const defId = (e.target as HTMLElement).getAttribute('data-refine')!
    const a = state.artifacts.find(x => x.defId === defId)
    if (!a) return
    const def = ARTIFACTS[defId]
    if (!def) return
    const cost = refineCost(def.refineCostBase, a.refineLevel)
    if (state.gold < cost) { toast('灵石不足', '#f87171'); return }
    if (a.refineLevel >= 9) { toast('已达最高精炼等级', '#f87171'); return }
    state.gold -= cost
    a.refineLevel++
    sfx('sfx_skill')
    toast(`${def.name} 精炼至 +${a.refineLevel}！`, '#fbbf24')
    pushPlayerLog(state, `精炼${def.name}至+${a.refineLevel}`)
    refresh('artifact')
  }))

  // 炼制事件
  body().querySelectorAll('[data-craft]').forEach((b) => b.addEventListener('click', (e) => {
    const defId = (e.target as HTMLElement).getAttribute('data-craft')!
    const def = ARTIFACTS[defId]
    if (!def) return
    if (state.gold < def.craftCost) { toast('灵石不足', '#f87171'); return }
    if (state.realm < def.craftRealm) { toast(`需${REALMS[def.craftRealm].name}期`, '#f87171'); return }
    state.gold -= def.craftCost
    state.artifacts.push({ defId, refineLevel: 0 })
    sfx('sfx_skill')
    toast(`炼制成功！获得「${def.name}」`, '#fbbf24')
    pushPlayerLog(state, `炼制法宝「${def.name}」`)
    refresh('artifact')
  }))

  // 圣物装配事件
  body().querySelectorAll('[data-relic]').forEach((s) => s.addEventListener('change', (e) => {
    const slotIdx = parseInt((e.target as HTMLElement).getAttribute('data-relic')!, 10)
    const defId = (e.target as HTMLSelectElement).value
    if (!defId || !state.sect) return
    const a = state.artifacts.find(x => x.defId === defId)
    if (!a) return
    if (!state.sect.relics) state.sect.relics = []
    while (state.sect.relics.length < SECT_RELIC_SLOTS) state.sect.relics.push(null)
    state.sect.relics[slotIdx] = { defId: a.defId, refineLevel: a.refineLevel }
    sfx('sfx_click')
    toast(`「${ARTIFACTS[defId]?.name}」已供奉为宗门圣物`, '#fbbf24')
    refresh('artifact')
  }))

  // 卸下圣物
  body().querySelectorAll('[data-unrelic]').forEach((b) => b.addEventListener('click', (e) => {
    const slotIdx = parseInt((e.target as HTMLElement).getAttribute('data-unrelic')!, 10)
    if (!state.sect?.relics) return
    state.sect.relics[slotIdx] = null
    sfx('sfx_click')
    refresh('artifact')
  }))
}

// ---------- 图鉴页（万象图鉴） ----------
function renderCodexTab() {
  const codex = state.codex ?? { items: [], skills: [], sets: [] }
  const baseNames = new Set(ITEM_BASES.map((b) => b.name))
  const namedFound = codex.items.filter((n) => !baseNames.has(n))

  // 装备：基座 + 名器
  const baseTotal = ITEM_BASES.length
  const baseFound = ITEM_BASES.filter((b) => codex.items.includes(b.name)).length
  let html = `<p class="dim">装备 ${baseFound + namedFound.length} / ${baseTotal}+ 种 · 功法 ${codex.skills.length} / ${SKILLS.size} 部 · 套装 ${codex.sets.length} / ${Object.keys(SETS).length} 套</p>`

  html += `<p class="dim" style="margin:6px 0 2px">—— 装备录 ——</p>`
  const bySlot = new Map<string, typeof ITEM_BASES>()
  for (const b of ITEM_BASES) {
    const arr = bySlot.get(b.slot) ?? []
    arr.push(b)
    bySlot.set(b.slot, arr)
  }
  const slotLabel: Record<string, string> = { weapon: '武器', head: '头部', armor: '衣甲', boots: '靴子', charm: '饰品' }
  for (const [slot, bases] of bySlot) {
    const names = bases.map((b) => {
      const got = codex.items.includes(b.name)
      return got ? `<span class="q1">${b.name}</span>` : '<span class="dim">？？？</span>'
    }).join(' · ')
    html += `<div class="item"><span><b class="dim">【${slotLabel[slot] ?? slot}】</b> ${names}</span></div>`
  }
  if (namedFound.length > 0) {
    html += `<div class="item"><span><b style="color:#ffd54a">【名器】</b> ${namedFound.map((n) => `<span style="color:#ffd54a">✦${n}</span>`).join(' · ')}</span></div>`
  }

  html += `<p class="dim" style="margin:6px 0 2px">—— 套装录 ——</p>`
  for (const set of Object.values(SETS)) {
    const got = codex.sets.includes(set.id)
    if (got) {
      const lines = set.bonuses.map((b) => b.desc).join('<br>')
      html += `<div class="item"><span class="q2">${set.name}<span class="sub">${lines}</span></span></div>`
    } else {
      html += `<div class="item"><span class="dim">？？？（尚未收集）</span></div>`
    }
  }

  html += `<p class="dim" style="margin:6px 0 2px">—— 功法录 ——</p>`
  for (const def of SKILLS.values()) {
    const got = codex.skills.includes(def.id)
    if (got) {
      html += `<div class="item"><span class="q3">《${def.name}》 <span class="sub">${SKILL_TYPE_NAMES[def.type]} · ${def.class === 'any' ? '通用' : CLASSES[def.class]?.name}｜${def.desc}</span></span></div>`
    } else {
      html += `<div class="item"><span class="dim">《？？？》 ${SKILL_TYPE_NAMES[def.type]}</span></div>`
    }
  }
  body().innerHTML = html
}

// ---------- 人脉页 ----------
function renderContactsTab() {
  const rels = state.playerNpcRelations ?? {}
  const npcIds = Object.keys(rels)
  let html = ''

  if (npcIds.length === 0) {
    html = `<p class="dim" style="text-align:center;padding:20px 0">尚未结识任何修士<br><span style="font-size:11px">在大地图上与NPC互动以建立人脉</span></p>`
    body().innerHTML = html
    return
  }

  // 收集NPC数据
  const contacts = npcIds.map(id => {
    const rel = rels[id]
    const npc = (state.proceduralNpcs ?? []).find(n => n.id === id)
    return { rel, npc, id }
  }).filter(c => c.npc) // 只显示仍存在的NPC

  // 按好感度排序
  contacts.sort((a, b) => b.rel.favor - a.rel.favor)

  html += `<p class="dim" style="margin:2px 0 4px">已结识 ${contacts.length} 位修士</p>`

  for (const { rel, npc } of contacts) {
    if (!npc) continue
    const realmName = REALMS[npc.realm]?.name ?? '未知'
    const domainName = getDomainDef(npc.location.domain as DomainId)?.name ?? npc.location.domain
    const status = !npc.alive ? '<span style="color:#f87171">已陨落</span>' : npc.isActive ? '<span style="color:#4ade80">附近</span>' : '<span class="dim">远方</span>'

    // 好感度条
    const favorColor = rel.favor > 50 ? '#4ade80' : rel.favor > 0 ? '#fbbf24' : rel.favor > -30 ? '#fb923c' : '#f87171'
    const favorLabel = rel.favor > 80 ? '莫逆' : rel.favor > 50 ? '友好' : rel.favor > 20 ? '相识' : rel.favor > 0 ? '泛交' : rel.favor > -30 ? '不睦' : '仇敌'

    html += `<div class="item" style="border-left:3px solid ${favorColor};padding-left:6px;margin:4px 0">
      <span><b style="color:${favorColor}">${npc.name}</b> <span class="sub">${realmName}境 · Lv${npc.level}</span> ${status}</span>
      <span class="sub" style="display:block;margin-top:2px">
        <span style="color:${favorColor}">好感 ${rel.favor}（${favorLabel}）</span> · 信任 ${rel.trust} · 相遇 ${rel.metCount}次
        <br>所在：${domainName}${rel.saved ? ' · <span style="color:#4ade80">曾救之</span>' : ''}
      </span>`

    // 最近经历
    const log = (npc.eventLog ?? []).slice(-5).reverse()
    if (log.length > 0) {
      html += `<div class="sub" style="margin-top:3px;font-size:10px;color:#888">`
      for (const e of log) {
        html += `<div>${e}</div>`
      }
      html += `</div>`
    }

    html += `</div>`
  }

  body().innerHTML = html
}

// ---------- 见闻录 ----------
function fmtLogTime(ts: number): string {
  const d = new Date(ts)
  const mo = d.getMonth() + 1
  const da = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${mo}/${da} ${h}:${m}`
}

function renderLogTab() {
  const logLabels: Record<LogFilter, string> = {
    all: '全部', news: '见闻', quest: '任务', world: '天道', karma: '因果',
  }

  let html = `<div class="tabs" style="margin-bottom:6px">`
  for (const k of ['all', 'news', 'quest', 'world', 'karma'] as LogFilter[]) {
    html += `<button data-log-filter="${k}" class="${logFilter === k ? 'active' : ''}" style="padding:3px 10px;font-size:11px">${logLabels[k]}</button>`
  }
  html += `</div>`

  interface LogEntry { time: number; html: string; category: LogFilter }
  const entries: LogEntry[] = []

  for (const e of (state.playerLog ?? [])) {
    entries.push({
      time: e.time,
      category: 'news',
      html: `<span class="sub" style="white-space:nowrap">${fmtLogTime(e.time)}</span>　${e.text}`,
    })
  }

  if (state.mainQuestId) {
    const q = getMainQuest(state.mainQuestId)
    if (q) {
      entries.push({
        time: Date.now(),
        category: 'quest',
        html: `<span style="color:#4ade80">[进行中]</span> <b>${q.title}</b> — ${q.objective}<br><span class="sub">提示：${q.hint}</span>`,
      })
    }
  }
  for (const qid of (state.mainQuestCompleted ?? [])) {
    const q = getMainQuest(qid)
    if (q) {
      entries.push({
        time: 0,
        category: 'quest',
        html: `<span style="color:#888">[已完成]</span> ${q.title} — ${q.objective}`,
      })
    }
  }

  for (const dq of (state.dailyQuests ?? [])) {
    const status = dq.claimed ? '已领取' : dq.progress >= dq.goal ? '可领取' : `${dq.progress}/${dq.goal}`
    const color = dq.claimed ? '#888' : dq.progress >= dq.goal ? '#4ade80' : '#fbbf24'
    entries.push({
      time: Date.now(),
      category: 'quest',
      html: `<span style="color:${color}">[日常]</span> ${dq.name} — ${status}<br><span class="sub">${dq.desc}</span>`,
    })
  }

  for (const [qid, status] of Object.entries(state.quests ?? {})) {
    const q = QUESTS.find(qx => qx.id === qid)
    if (q) {
      const color = status === 'done' ? '#888' : '#fbbf24'
      const tag = status === 'done' ? '已完成' : '进行中'
      entries.push({
        time: 0,
        category: 'quest',
        html: `<span style="color:${color}">[${tag}]</span> ${q.name} — ${q.desc}`,
      })
    }
  }

  for (const e of (state.annualEventLog ?? [])) {
    entries.push({
      time: e.timestamp ?? 0,
      category: 'world',
      html: `<span style="color:#af7ac5">[苍玄历${e.year}年]</span> ${e.result}`,
    })
  }
  for (const e of (state.npcLifeEventsLog ?? [])) {
    entries.push({
      time: e.timestamp ?? 0,
      category: 'world',
      html: `<span style="color:#7c9aff">[苍玄历${e.year}年]</span> <b>${e.npcName}</b>：${e.description}`,
    })
  }

  for (const e of (state.karmaLog ?? [])) {
    const color = e.type === 'good' ? '#4ade80' : '#f87171'
    const tag = e.type === 'good' ? '善业' : '恶业'
    entries.push({
      time: e.time,
      category: 'karma',
      html: `<span style="color:${color}">[${tag} ${e.amount > 0 ? '+' : ''}${e.amount}]</span> ${e.description}`,
    })
  }

  entries.sort((a, b) => b.time - a.time)
  const filtered = logFilter === 'all' ? entries : entries.filter(e => e.category === logFilter)

  if (filtered.length === 0) {
    html += `<p class="dim" style="text-align:center;padding:20px 0">暂无记录</p>`
  } else {
    html += `<div style="max-height:420px;overflow-y:auto;font-size:12px">`
    for (const e of filtered) {
      const catColor = e.category === 'news' ? '#a3e4d7' : e.category === 'quest' ? '#4ade80' : e.category === 'world' ? '#af7ac5' : '#fda4af'
      html += `<div style="padding:4px 6px;border-bottom:1px solid #2a2a35;line-height:1.6">
        <span style="color:${catColor};margin-right:3px">●</span>${e.html}
      </div>`
    }
    html += `</div>`
  }

  body().innerHTML = html

  body().querySelectorAll('[data-log-filter]').forEach((b) => b.addEventListener('click', (e) => {
    logFilter = (e.target as HTMLElement).getAttribute('data-log-filter') as LogFilter
    sfx('sfx_click', 0.3)
    renderLogTab()
  }))
}

// ---------- 境界突破 ----------
export function canBreakthrough(): boolean {
  const next = REALMS[state.realm + 1]
  if (!next) return false
  return state.level >= next.level && (state.materials.tupo ?? 0) >= next.stones
}

// ---------- 坊市商店 ----------
export interface ShopStock {
  potionPrice: number
  equips: Array<{ item: EquipItem; price: number }>
  book: { skillId: string; price: number } | null
}

export function openShop(shopName: string, stock: ShopStock) {
  const panel = el('panel')
  panel.classList.add('open')
  delete panel.dataset.modal
  onPanelToggle?.(true)

  let html = `<div class="card"><h3>${shopName}</h3><p class="dim">灵石 ${state.gold}</p>`
  html += `<div class="item"><span>回春丹 <span class="sub">恢复 40% 气血（现有 ${state.potions}）</span></span>
    <button data-buy-potion ${state.gold >= stock.potionPrice ? '' : 'disabled'}>${stock.potionPrice} 灵石</button></div>`
  stock.equips.forEach((e, i) => {
    html += `<div class="item"><span class="q${e.item.quality}">${itemLabel(e.item)}${affixLine(e.item)}</span>
      <button data-buy-equip="${i}" ${state.gold >= e.price ? '' : 'disabled'}>${e.price} 灵石</button></div>`
  })
  if (stock.book) {
    const def = SKILLS.get(stock.book.skillId)
    html += `<div class="item"><span class="q3">功法秘籍《${def?.name}》<span class="sub">${def?.desc}</span></span>
      <button data-buy-book ${state.gold >= stock.book.price ? '' : 'disabled'}>${stock.book.price} 灵石</button></div>`
  }
  html += `<div style="text-align:right;margin-top:8px"><button data-close>离开</button></div></div>`
  panel.innerHTML = html

  panel.querySelector('[data-close]')!.addEventListener('click', closePanel)
  panel.querySelector('[data-buy-potion]')?.addEventListener('click', () => {
    if (state.gold < stock.potionPrice) return
    state.gold -= stock.potionPrice
    state.potions++
    sfx('sfx_pickup', 0.5)
    toast('购入回春丹 ×1')
    saveGame(state); updateHUD(); openShop(shopName, stock)
  })
  panel.querySelectorAll('[data-buy-equip]').forEach((b) => b.addEventListener('click', (e) => {
    const i = Number((e.target as HTMLElement).getAttribute('data-buy-equip'))
    const entry = stock.equips[i]
    if (!entry || state.gold < entry.price) return
    state.gold -= entry.price
    state.inventory.push(entry.item)
    recordCodexItem(state, entry.item)
    stock.equips.splice(i, 1)
    sfx('sfx_equip')
    toast(`购入 ${entry.item.name}`, '#58d68d')
    saveGame(state); updateHUD(); openShop(shopName, stock)
  }))
  panel.querySelector('[data-buy-book]')?.addEventListener('click', () => {
    if (!stock.book || state.gold < stock.book.price) return
    state.gold -= stock.book.price
    learnSkill(state, stock.book.skillId)
    sfx('sfx_skill')
    toast(`习得功法《${SKILLS.get(stock.book.skillId)?.name}》！`, '#af7ac5')
    stock.book = null
    saveGame(state); updateHUD(); openShop(shopName, stock)
  })
}

// ---------- 结算 ----------
export function showResult(title: string, lines: string[], btnText: string, cb: () => void) {
  const panel = el('panel')
  panel.classList.add('open')
  panel.dataset.modal = '1'  // 模态：点外部/背包键都不可关，只能点按钮
  onPanelToggle?.(true)
  let html = `<div class="card"><h3>${title}</h3>`
  for (const l of lines) html += `<p>${l}</p>`
  html += `<div style="text-align:center"><button data-ok>${btnText}</button></div></div>`
  panel.innerHTML = html
  panel.querySelector('[data-ok]')!.addEventListener('click', () => { closePanel(); cb() })
}

// ---------- 开机画面菜单 ----------
export interface TitleMenuOpts {
  hasSave: boolean
  onNew: () => void
  onContinue: () => void
  onRecords: () => void
}

export function showTitleMenu(opts: TitleMenuOpts) {
  el('title').style.display = 'flex'
  el('controls').style.display = 'none'
  ;(el('btnContinue') as HTMLButtonElement).disabled = !opts.hasSave
  el('btnNew').onclick = () => { sfx('sfx_click'); opts.onNew() }
  el('btnContinue').onclick = () => { if (!(el('btnContinue') as HTMLButtonElement).disabled) sfx('sfx_click'); opts.onContinue() }
  el('btnRecords').onclick = () => { sfx('sfx_click'); opts.onRecords() }
}

export function hideTitleMenu() {
  el('title').style.display = 'none'
  el('controls').style.display = 'block'
  resetControls()
}

/** 恢复所有控制按钮到默认可见状态（离开宗战/天劫等特殊场景后调用） */
export function resetControls() {
  const controls = el('controls')
  controls.style.display = 'block'
  for (const id of ['btnBag', 'btnAtk', 'btnPot', 'btnSkill']) {
    const btn = document.getElementById(id)
    if (btn) {
      btn.style.display = 'flex'
      btn.textContent = id === 'btnBag' ? '背包'
        : id === 'btnAtk' ? '攻击'
        : id === 'btnPot' ? '丹药'
        : '神通'
    }
  }
  // btnAct 和 btnRetreat 默认隐藏，由场景按需显示
  const btnAct = document.getElementById('btnAct')
  if (btnAct) { btnAct.style.display = 'none' }
  const btnRetreat = document.getElementById('btnRetreat')
  if (btnRetreat) { btnRetreat.style.display = 'none' }
}

// ---------- 榜单（本地个人最佳） ----------
export function openRecords() {
  const panel = el('panel')
  panel.classList.add('open')
  delete panel.dataset.modal
  onPanelToggle?.(true)
  const r = getRecords()
  const row = (title: string, e: RecordEntry | null) => `<div class="item">
    <span class="q2">${title}<span class="sub">${e ? e.label : '暂无记录'}</span></span>
    <span class="dim" style="text-align:right;font-size:10px">${e ? `${e.heroName} · ${classNameOf(e.classId)}<br>${e.date}` : ''}</span>
  </div>`
  panel.innerHTML = `<div class="card"><h3>仙途榜单</h3>
    <p class="dim">个人历史最佳（开始新仙途不影响纪录）</p>
    ${row('修为榜', r.level)}
    ${row('除魔榜', r.kills)}
    ${row('妖域榜', r.depth)}
    ${row('天梯榜', r.ladder)}
    ${row('飞升榜', r.ascension)}
    <div style="text-align:right;margin-top:8px"><button data-close>关闭</button></div></div>`
  panel.querySelector('[data-close]')!.addEventListener('click', closePanel)
}
