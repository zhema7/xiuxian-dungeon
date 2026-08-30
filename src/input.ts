// ---------- 输入抽象：虚拟摇杆 + 按钮 + 键盘 ----------

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
  attackHeld = false           // 攻击键/按钮是否处于按住状态（v4 charge 原语用）
  private attackHeldAt = 0     // 按住起始时间戳（performance.now()）

  constructor() {
    this.bindJoystick()
    this.bindAttackButton()
    this.bindButton('btnPot', () => { this.potionQueue++ })
    this.bindButton('btnBag', () => { this.bagQueue++ })
    this.bindButton('btnAct', () => { this.actQueue++ })
    this.bindButton('btnSkill', () => { this.skillQueue++ })
    this.bindButton('btnRetreat', () => { this.retreatQueue++ })
    this.bindButton('btnSettings', () => { this.settingsQueue++ })
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true
      if ((e.code === 'KeyJ' || e.code === 'Space') && !e.repeat) {
        this.attackHeld = true
        this.attackHeldAt = performance.now()
      }
    })
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false
      if (e.code === 'KeyJ' || e.code === 'Space') this.attackHeld = false
    })
  }

  private bindAttackButton() {
    const el = document.getElementById('btnAtk')!
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.attackHeld = true
      this.attackHeldAt = performance.now()
      this.attackQueue++
    })
    const release = () => { this.attackHeld = false }
    el.addEventListener('pointerup', release)
    el.addEventListener('pointercancel', release)
    el.addEventListener('pointerleave', release)
  }

  /** 返回当前攻击键按住时长（ms），未按住返回 0 */
  attackHoldMs(): number {
    return this.attackHeld ? performance.now() - this.attackHeldAt : 0
  }

  private bindJoystick() {
    const joy = document.getElementById('joy')!
    const knob = document.getElementById('joyKnob')!
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
    const el = document.getElementById(id)!
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
    if (this.keys['KeyJ'] || this.keys['Space']) { this.attackQueue++; this.keys['KeyJ'] = false; this.keys['Space'] = false }
    if (this.keys['KeyK']) { this.potionQueue++; this.keys['KeyK'] = false }
    if (this.keys['KeyB'] || this.keys['KeyI']) { this.bagQueue++; this.keys['KeyB'] = false; this.keys['KeyI'] = false }
    if (this.keys['KeyE'] || this.keys['KeyF']) { this.actQueue++; this.keys['KeyE'] = false; this.keys['KeyF'] = false }
    if (this.keys['KeyL']) { this.skillQueue++; this.keys['KeyL'] = false }
  }

  consumeAttack() { const v = this.attackQueue > 0; this.attackQueue = 0; return v }
  consumePotion() { const v = this.potionQueue > 0; this.potionQueue = 0; return v }
  consumeBag() { const v = this.bagQueue > 0; this.bagQueue = 0; return v }
  consumeAct() { const v = this.actQueue > 0; this.actQueue = 0; return v }
  consumeSkill() { const v = this.skillQueue > 0; this.skillQueue = 0; return v }
  consumeRetreat() { const v = this.retreatQueue > 0; this.retreatQueue = 0; return v }
  consumeSettings() { const v = this.settingsQueue > 0; this.settingsQueue = 0; return v }
  clearQueues() { this.attackQueue = 0; this.potionQueue = 0; this.actQueue = 0; this.skillQueue = 0; this.retreatQueue = 0; this.settingsQueue = 0 }
}

export const input = new InputPort()
