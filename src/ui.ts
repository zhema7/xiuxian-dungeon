// ---------- DOM UI：HUD、面板（装备/功法/天赋）、对话、结算、提示 ----------

import {
  CLASSES, ITEM_BASES, MOD_LABELS, QUALITY_NAMES, REALMS, REALM_STAT_BONUS, SETS, SKILLS, SKILL_TYPE_NAMES,
  SLOT_KEYS, SLOT_NAMES, TALENT_BRANCHES, type SlotKey,
} from './data'
import { calcStats, currentHp, equippedSetIds, isSetBonusActive, setPieceCount } from './effects'
import { expNeed, recordCodexItem, saveGame, applyPreset, snapshotPreset, PRESET_COUNT, type GameState } from './state'
import {
  canUpgrade, equipSkill, isSkillEquipped, learnSkill, skillLevel, unequipSkill, upgradeCost, upgradeSkill, SKILL_MAX_LEVEL,
  mindModsAt, skillPowerAt,
} from './skills'
import { genDynamicSetFromSeed, genDynamicSkill, nextDynamicSetSequence, registerDynamicContent } from './lore'
import { addPoint, availablePoints, respec, RESPEC_COST, spentPoints } from './talents'
import { ENH_MAX, enhanceCost, makeItem, type EquipItem } from './core'
import { gainExp } from './state'
import { classNameOf, getRecords, type RecordEntry } from './records'
import { sfx, getBgmVolume, getSfxVolume, setBgmVolume, setSfxVolume } from './audio'
import { listSaveSlots, loadSaveSlot, deleteSaveSlot, hasSaveSlot, MAX_SAVE_SLOTS, type SaveSlotMeta } from './state'

export interface SettingsCallbacks {
  onLoadSave?: (slotIndex: number) => void
  onReturnTitle?: () => void
}

let settingsCallbacks: SettingsCallbacks = {}

export function setSettingsCallbacks(cb: SettingsCallbacks) {
  settingsCallbacks = cb
}

function el<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T
}

let state: GameState
let floorText = ''
let onPanelToggle: ((open: boolean) => void) | null = null
type Tab = 'equip' | 'skill' | 'talent' | 'codex'
type SkillFilter = 'all' | 'style' | 'art' | 'mind'
let skillFilter: SkillFilter = 'all'
type InvFilter = 'all' | 'weapon' | 'armor' | 'accessory'

/** 背包筛选：当前选中的分类标签 */
let invFilter: InvFilter = 'all'

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
  el('hudName').textContent = `${state.heroName} · ${CLASSES[state.classId]?.name ?? ''} · ${REALMS[state.realm]?.name ?? ''}`
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

export function openInventory() { openPanel('equip') }

/** 打开修行设置面板 */
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
      <button id="settingsLoadBtn" style="width:100%;margin-bottom:6px;padding:6px;font-size:12px">转劫重修</button>
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

  panel.querySelector('[data-close]')!.addEventListener('click', closePanel)
}

export function openPanel(tab: Tab) {
  const panel = el('panel')
  panel.classList.add('open')
  delete panel.dataset.modal
  onPanelToggle?.(true)
  sfx('sfx_open', 0.5)
  let html = `<div class="card"><div class="tabs">
    <button data-tab="equip" class="${tab === 'equip' ? 'active' : ''}">装备</button>
    <button data-tab="skill" class="${tab === 'skill' ? 'active' : ''}">功法</button>
    <button data-tab="talent" class="${tab === 'talent' ? 'active' : ''}">天赋</button>
    <button data-tab="codex" class="${tab === 'codex' ? 'active' : ''}">图鉴</button>
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
  else if (tab === 'codex') renderCodexTab()
  else renderTalentTab()
}

// ---------- 装备页 ----------
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
  html += `</div>`
  html += `<p class="dim">攻击 ${st.atk} · 防御 ${st.def} · 速度 ${st.speed} · 会心 ${(st.crit * 100).toFixed(0)}% · 攻速 +${(st.aspd * 100).toFixed(0)}% · 吸血 ${(st.lifesteal * 100).toFixed(0)}%</p>`

  // 配装方案（装备+功法+天赋 一键切换）
  html += `<div class="item"><span class="q2">【配装方案】<span class="sub">读取时会把当前配置自动存回你离开的方案槽</span></span></div>`
  html += `<div class="item" style="flex-wrap:wrap;gap:4px">`
  for (let i = 0; i < PRESET_COUNT; i++) {
    const saved = !!state.presets[i]
    const active = state.activePreset === i
    html += `<span style="white-space:nowrap">
      <button data-preset-load="${i}" ${saved ? '' : 'disabled'} class="${active ? 'q3' : ''}">${active ? '▶' : ''}方案${i + 1}${saved ? '' : '·空'}</button><button data-preset-save="${i}">存</button></span>`
  }
  html += `</div>`

  for (const slot of SLOT_KEYS) {
    const it = state.equipment[slot]
    html += `<div class="item"><span class="${it ? 'q' + it.quality : 'dim'}">【${SLOT_NAMES[slot]}】${it ? itemLabel(it) + affixLine(it) : '——'}</span>`
    if (it) {
      const cost = enhanceCost(it)
      html += `<span style="white-space:nowrap">`
      if ((it.enh ?? 0) < ENH_MAX) html += `<button data-enh="equip:${slot}" ${state.gold >= cost ? '' : 'disabled'}>强化(${cost})</button>`
      html += `<button data-unequip="${slot}">卸下</button></span>`
    }
    html += `</div>`
  }

  // 套装信息
  for (const setId of equippedSetIds(state)) {
    const set = SETS[setId]
    const n = setPieceCount(state, setId)
    const lines = set.bonuses.map((bonus) => `<span class="${isSetBonusActive(n, bonus) ? 'q1' : 'dim'}">${bonus.desc}</span>`).join('<br>')
    html += `<div class="item"><span class="q2">套装【${set.name}】${n}/${set.pieces.length}<span class="sub">${lines}</span></span></div>`
  }

  // 背包分类筛选 + 一键售卖
  const filterLabels: Record<InvFilter, string> = { all: '全部', weapon: '武器', armor: '防具', accessory: '饰品' }
  const filterInventory = (it: EquipItem): boolean => {
    if (invFilter === 'all') return true
    if (invFilter === 'weapon') return it.slot === 'weapon'
    if (invFilter === 'armor') return it.slot === 'head' || it.slot === 'armor' || it.slot === 'boots'
    if (invFilter === 'accessory') return it.slot === 'charm'
    return true
  }
  const filtered: Array<{ it: EquipItem; idx: number }> = []
  state.inventory.forEach((it, idx) => { if (filterInventory(it)) filtered.push({ it, idx }) })

  // 凡品数量（用于一键售卖按钮）
  const commonCount = state.inventory.filter((it) => it.quality === 0).length
  const commonTotal = state.inventory.filter((it) => it.quality === 0)
    .reduce((sum, it) => sum + it.price + (it.enh ?? 0) * 10, 0)

  html += `<p class="dim" style="margin-top:10px">—— 行囊（${state.inventory.length}）——</p>`
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
    <div class="tabs" style="margin-bottom:0">
      <button data-inv-filter="all" class="${invFilter === 'all' ? 'active' : ''}" style="padding:3px 10px;font-size:11px">全部</button>
      <button data-inv-filter="weapon" class="${invFilter === 'weapon' ? 'active' : ''}" style="padding:3px 10px;font-size:11px">武器</button>
      <button data-inv-filter="armor" class="${invFilter === 'armor' ? 'active' : ''}" style="padding:3px 10px;font-size:11px">防具</button>
      <button data-inv-filter="accessory" class="${invFilter === 'accessory' ? 'active' : ''}" style="padding:3px 10px;font-size:11px">饰品</button>
    </div>
    <button data-sell-all-common ${commonCount > 0 ? '' : 'disabled'} style="padding:3px 8px;font-size:11px">售卖凡品×${commonCount}(${commonTotal})</button>
  </div>`
  if (filtered.length === 0) {
    html += `<p class="dim">${state.inventory.length === 0 ? '空空如也' : '该分类暂无装备'}</p>`
  }
  filtered.forEach(({ it, idx }) => {
    const cost = enhanceCost(it)
    html += `<div class="item"><span class="q${it.quality}">${itemLabel(it)}${affixLine(it)}</span>
      <span style="white-space:nowrap">
        ${(it.enh ?? 0) < ENH_MAX ? `<button data-enh="inv:${idx}" ${state.gold >= cost ? '' : 'disabled'}>强化(${cost})</button>` : ''}
        <button data-equip="${idx}">装备</button><button data-sell="${idx}">出售</button></span></div>`
  })
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
      state.presets[state.activePreset] = snapshotPreset(state) // 当前配置存回原槽位
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
    state.materials.tupo -= next.stones
    state.realm++
    state.hp = -1
    sfx('sfx_levelup')
    toast(`突破成功！晋入【${next.name}】，气血回满`, '#e8c86a')
    refresh('equip')
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
  // 背包分类筛选
  body().querySelectorAll('[data-inv-filter]').forEach((b) => b.addEventListener('click', (e) => {
    invFilter = (e.target as HTMLElement).getAttribute('data-inv-filter') as InvFilter
    sfx('sfx_click', 0.3)
    refresh('equip')
  }))
  // 一键售卖凡品
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

  const slotName = (id: string | null) => (id ? SKILLS.get(id)?.name ?? id : '——')
  html += `<div class="item"><span>【招式】${slotName(state.skillSlots.style)}</span></div>`
  html += `<div class="item"><span>【心法一】${slotName(state.skillSlots.minds[0])}</span></div>`
  html += `<div class="item"><span>【心法二】${slotName(state.skillSlots.minds[1])}</span></div>`
  html += `<div class="item"><span>【神通】${slotName(state.skillSlots.art)}</span></div>`

  html += `<p class="dim" style="margin-top:10px">—— 已习得功法 ——</p>`
  html += `<div style="display:flex;gap:4px;margin-bottom:6px">`
  html += `<button data-skill-filter="all" class="${skillFilter === 'all' ? 'active' : ''}" style="padding:3px 10px;font-size:11px">全部</button>`
  html += `<button data-skill-filter="style" class="${skillFilter === 'style' ? 'active' : ''}" style="padding:3px 10px;font-size:11px">招式</button>`
  html += `<button data-skill-filter="art" class="${skillFilter === 'art' ? 'active' : ''}" style="padding:3px 10px;font-size:11px">神通</button>`
  html += `<button data-skill-filter="mind" class="${skillFilter === 'mind' ? 'active' : ''}" style="padding:3px 10px;font-size:11px">心法</button>`
  html += `</div>`
  const learned = Object.entries(state.skills).filter(([id]) => {
    const def = SKILLS.get(id)
    if (!def) return false
    if (skillFilter === 'all') return true
    return def.type === skillFilter
  })
  if (learned.length === 0) html += `<p class="dim">${skillFilter === 'all' ? '尚未习得任何功法' : '此分类暂无功法'}</p>`
  for (const [id, lv] of learned) {
    const def = SKILLS.get(id)
    if (!def) continue
    const equipped = isSkillEquipped(state, id)
    const upCost = upgradeCost(lv)
    const badge = classBadgeHtml(def.class)
    const upgradeCompare = skillUpgradeCompare(id, lv)
    html += `<div class="item"><span class="${equipped ? 'q1' : ''}">${badge}《${def.name}》 ${SKILL_TYPE_NAMES[def.type]} Lv.${lv}${equipped ? ' <span class="equipped-tag">已装配</span>' : ''}
      <span class="sub">${def.desc}</span>
      ${upgradeCompare}</span>
      <span style="white-space:nowrap">
        ${equipped ? `<button data-unskill="${id}">卸下</button>` : `<button data-onskill="${id}">装配</button>`}
        ${lv < SKILL_MAX_LEVEL ? `<button data-upskill="${id}" ${canUpgrade(state, id) ? '' : 'disabled'}>升级(${upCost})</button>` : ''}
      </span></div>`
  }
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
  ;(el('btnContinue') as HTMLButtonElement).disabled = !opts.hasSave
  el('btnNew').onclick = () => { sfx('sfx_click'); opts.onNew() }
  el('btnContinue').onclick = () => { if (!(el('btnContinue') as HTMLButtonElement).disabled) sfx('sfx_click'); opts.onContinue() }
  el('btnRecords').onclick = () => { sfx('sfx_click'); opts.onRecords() }
}

export function hideTitleMenu() { el('title').style.display = 'none' }

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
    <div style="text-align:right;margin-top:8px"><button data-close>关闭</button></div></div>`
  panel.querySelector('[data-close]')!.addEventListener('click', closePanel)
}
