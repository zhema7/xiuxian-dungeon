// ---------- 输入抽象：虚拟摇杆 + 按钮 + 键盘 + 鼠标 ----------

export class InputPort {
  move = { x: 0, y: 0 }
  private attackQueue = 0
  private potionQueue = 0
  private bagQueue = 0
  private actQueue = 0
  private skillQueue = 0
  private retreatQueue = 0
  private settingsQueue = 0
  private keys: Record<string, boolean> = {}
  attackHeld = false           // 攻击键/按钮是否处于按住状态
  private attackHeldAt = 0     // 按住起始时间戳（performance.now()）

  // ---- 鼠标指向攻击（PC宽屏）----
  /** 鼠标在世界坐标系中的指向方向（单位向量），PC模式下攻击方向取自鼠标而非移动方向 */
  aim = { x: 1, y: 0 }
  /** 鼠标左键是否按住 */
  mouseAttackHeld = false
  /** 是否使用鼠标指向（PC宽屏模式） */
  useMouseAim = false
  /** 配装方案切换队列（F1-F6） */
  private presetQueue = 0
  private pendingPreset = -1
  /** 地图快捷键队列（M） */
  private mapQueue = 0
  /** 天赋面板快捷键队列（Tab / T） */
  private talentQueue = 0

  constructor() {
    this.bindJoystick()
    this.bindAttackButton()
    this.bindButton('btnPot', () => { this.potionQueue++ })
    this.bindButton('btnBag', () => { this.bagQueue++ })
    this.bindButton('btnAct', () => { this.actQueue++ })
    this.bindButton('btnSkill', () => { this.skillQueue++ })
    this.bindButton('btnRetreat', () => { this.retreatQueue++ })
    this.bindButton('btnSettings', () => { this.settingsQueue++ })
    this.bindKeyboard()
    this.bindMouse()
  }

  private bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true
      // 攻击键按住
      if ((e.code === 'KeyJ' || e.code === 'Space') && !e.repeat) {
        this.attackHeld = true
        this.attackHeldAt = performance.now()
      }
      // 鼠标左键攻击由 mousedown 处理
      // 数字键 1-6：配装方案快速切换
      if (e.code.startsWith('Digit') && !e.repeat) {
        const n = parseInt(e.code.replace('Digit', ''), 10)
        if (n >= 1 && n <= 6) {
          this.pendingPreset = n - 1
          this.presetQueue++
        }
      }
      // F1-F6：配装方案
      if (e.code.startsWith('F') && !e.repeat) {
        const n = parseInt(e.code.replace('F', ''), 10)
        if (n >= 1 && n <= 6) {
          this.pendingPreset = n - 1
          this.presetQueue++
        }
      }
      // 单按键面板切换（避免与文本输入冲突，仅在非输入框时生效）
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.code === 'KeyM' && !e.repeat) this.mapQueue++
      if ((e.code === 'Tab' || e.code === 'KeyT') && !e.repeat) {
        e.preventDefault()
        this.talentQueue++
      }
    })
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false
      if (e.code === 'KeyJ' || e.code === 'Space') this.attackHeld = false
    })
  }

  private bindMouse() {
    // 鼠标左键攻击
    const gameEl = document.getElementById('game')
    if (gameEl) {
      gameEl.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          this.mouseAttackHeld = true
          this.attackHeld = true
          this.attackHeldAt = performance.now()
          this.attackQueue++
        }
      })
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
          this.mouseAttackHeld = false
          // 只有键盘攻击键也没按住时才释放 attackHeld
          if (!this.keys['KeyJ'] && !this.keys['Space']) {
            this.attackHeld = false
          }
        }
      })
      // 鼠标移动更新瞄准方向（由场景每帧基于 worldX 计算，这里不处理）
    }
  }

  private bindAttackButton() {
    const el = document.getElementById('btnAtk')
    if (!el) return
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.attackHeld = true
      this.attackHeldAt = performance.now()
      this.attackQueue++
    })
    const release = () => {
      // 只有鼠标和键盘都没按住时才真正释放
      if (!this.mouseAttackHeld && !this.keys['KeyJ'] && !this.keys['Space']) {
        this.attackHeld = false
      }
    }
    el.addEventListener('pointerup', release)
    el.addEventListener('pointercancel', release)
    el.addEventListener('pointerleave', release)
  }

  /** 返回当前攻击键按住时长（ms），未按住返回 0 */
  attackHoldMs(): number {
    return this.attackHeld ? performance.now() - this.attackHeldAt : 0
  }

  private bindJoystick() {
    const joy = document.getElementById('joy')
    if (!joy) return
    const knob = document.getElementById('joyKnob')
    if (!knob) return
    let active = false
    const R = 40
    const setKnob = (dx: number, dy: number) => {
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
    }
    const update = (clientX: number, clientY: number) => {
      const rect = joy.getBoundingClientRect()
      let dx = clientX - (rect.left + rect.width / 2)
      let dy = clientY - (rect.top + rect.height / 2)
      const len = Math.hypot(dx, dy)
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R }
      setKnob(dx, dy)
      const dead = 8
      this.move.x = Math.abs(dx) < dead ? 0 : dx / R
      this.move.y = Math.abs(dy) < dead ? 0 : dy / R
    }
    joy.addEventListener('pointerdown', (e) => { active = true; joy.setPointerCapture(e.pointerId); update(e.clientX, e.clientY) })
    joy.addEventListener('pointermove', (e) => { if (active) update(e.clientX, e.clientY) })
    const end = () => { active = false; this.move.x = 0; this.move.y = 0; setKnob(0, 0) }
    joy.addEventListener('pointerup', end)
    joy.addEventListener('pointercancel', end)
  }

  private bindButton(id: string, fn: () => void) {
    const el = document.getElementById(id)
    if (!el) return
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); fn() })
  }

  /** 每帧调用：合并键盘方向 */
  poll() {
    let kx = 0, ky = 0
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) kx -= 1
    if (this.keys['KeyD'] || this.keys['ArrowRight']) kx += 1
    if (this.keys['KeyW'] || this.keys['ArrowUp']) ky -= 1
    if (this.keys['KeyS'] || this.keys['ArrowDown']) ky += 1
    if (kx !== 0 || ky !== 0) {
      const len = Math.hypot(kx, ky)
      this.move.x = kx / len; this.move.y = ky / len
    }
    // 鼠标左键按住：持续攻击（由CD控制频率）
    if (this.mouseAttackHeld) { this.attackQueue++ }
    // 键盘攻击键按住：持续攻击
    if (this.keys['KeyJ'] || this.keys['Space']) { this.attackQueue++ }
    if (this.keys['KeyK']) { this.potionQueue++; this.keys['KeyK'] = false }
    if (this.keys['KeyB'] || this.keys['KeyI']) { this.bagQueue++; this.keys['KeyB'] = false; this.keys['KeyI'] = false }
    if (this.keys['KeyE'] || this.keys['KeyF']) { this.actQueue++; this.keys['KeyE'] = false; this.keys['KeyF'] = false }
    if (this.keys['KeyL']) { this.skillQueue++; this.keys['KeyL'] = false }
    if (this.keys['Escape']) { this.settingsQueue++; this.keys['Escape'] = false }
    if (this.keys['KeyQ']) { this.skillQueue++; this.keys['KeyQ'] = false }
    if (this.keys['KeyR']) { this.skillQueue++; this.keys['KeyR'] = false }
  }

  consumeAttack() { const v = this.attackQueue > 0; this.attackQueue = 0; return v }
  consumePotion() { const v = this.potionQueue > 0; this.potionQueue = 0; return v }
  consumeBag() { const v = this.bagQueue > 0; this.bagQueue = 0; return v }
  consumeAct() { const v = this.actQueue > 0; this.actQueue = 0; return v }
  consumeSkill() { const v = this.skillQueue > 0; this.skillQueue = 0; return v }
  consumeRetreat() { const v = this.retreatQueue > 0; this.retreatQueue = 0; return v }
  consumeSettings() { const v = this.settingsQueue > 0; this.settingsQueue = 0; return v }
  consumeMap() { const v = this.mapQueue > 0; this.mapQueue = 0; return v }
  consumeTalent() { const v = this.talentQueue > 0; this.talentQueue = 0; return v }
  consumePreset(): number { const v = this.presetQueue > 0 ? this.pendingPreset : -1; this.presetQueue = 0; this.pendingPreset = -1; return v }

  clearQueues() {
    this.attackQueue = 0; this.potionQueue = 0; this.actQueue = 0; this.skillQueue = 0
    this.retreatQueue = 0; this.settingsQueue = 0; this.mapQueue = 0; this.talentQueue = 0
    this.presetQueue = 0; this.pendingPreset = -1
  }
}

export const input = new InputPort()
