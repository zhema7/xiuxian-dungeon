// ---------- 程序化音效合成器（Web Audio API）----------
// 无需音频文件，实时合成各种战斗/UI/系统音效

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
// 当前音效的音量缩放（由 synthSfx 设置，每个音效独立，不污染全局）
let currentVolScale = 1
const SYNTH_BASE_SCALE = 0.6 // 合成器基础音量，与文件音效对齐

function getCtx(): AudioContext | null {
  if (ctx) return ctx
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    masterGain = ctx.createGain()
    masterGain.gain.value = 1 // 总增益固定，单音效音量通过各自 gain 节点控制
    masterGain.connect(ctx.destination)
    return ctx
  } catch { return null }
}

/** 尝试解锁 AudioContext（需在用户交互后调用） */
export function unlockSynth() {
  const c = getCtx()
  if (c && c.state === 'suspended') c.resume()
}

// ---- 基础合成工具 ----

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, freqEnd?: number) {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime + delay
  const osc = c.createOscillator()
  const gain = c.createGain()
  const v = vol * currentVolScale * SYNTH_BASE_SCALE
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur)
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(v, t + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.connect(gain)
  gain.connect(masterGain ?? c.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

function noise(dur: number, vol: number, delay = 0, filterFreq = 1000, filterQ = 1) {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime + delay
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = filterFreq
  filter.Q.value = filterQ
  const gain = c.createGain()
  const v = vol * currentVolScale * SYNTH_BASE_SCALE
  gain.gain.setValueAtTime(v, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  src.connect(filter)
  filter.connect(gain)
  gain.connect(masterGain ?? c.destination)
  src.start(t)
  src.stop(t + dur + 0.05)
}

function sweep(fStart: number, fEnd: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime + delay
  const osc = c.createOscillator()
  const gain = c.createGain()
  const v = vol * currentVolScale * SYNTH_BASE_SCALE
  osc.type = type
  osc.frequency.setValueAtTime(fStart, t)
  osc.frequency.exponentialRampToValueAtTime(fEnd, t + dur)
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(v, t + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.connect(gain)
  gain.connect(masterGain ?? c.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

// ---- 音效定义 ----

const synthMap: Record<string, () => void> = {
  // === 攻击音效 ===
  sfx_sword_swing: () => {
    sweep(900, 200, 0.12, 'sawtooth', 0.12)
    noise(0.08, 0.06, 0, 2000, 0.5)
  },
  sfx_sword_hit: () => {
    tone(2200, 0.05, 'square', 0.12)
    tone(800, 0.1, 'triangle', 0.1, 0.02)
    noise(0.06, 0.08, 0, 3000, 2)
  },
  sfx_magic_cast: () => {
    tone(440, 0.15, 'sine', 0.1)
    tone(660, 0.15, 'sine', 0.08, 0.05)
    tone(880, 0.2, 'sine', 0.06, 0.1)
  },
  sfx_magic_hit: () => {
    sweep(800, 100, 0.2, 'sawtooth', 0.12)
    noise(0.12, 0.06, 0, 500, 1)
  },
  sfx_art_burst: () => {
    tone(110, 0.3, 'sawtooth', 0.15)
    tone(220, 0.25, 'square', 0.1, 0.02)
    sweep(880, 220, 0.3, 'sine', 0.08, 0.05)
    noise(0.2, 0.08, 0, 800, 0.5)
  },
  sfx_bow_shot: () => {
    sweep(1200, 400, 0.08, 'sine', 0.1)
    noise(0.04, 0.05, 0, 2500, 2)
  },

  // === 精英/Boss 出现 ===
  sfx_elite_spawn: () => {
    tone(150, 0.4, 'sawtooth', 0.14)
    tone(100, 0.5, 'sine', 0.1, 0.05)
    sweep(300, 150, 0.3, 'triangle', 0.08, 0.1)
    noise(0.3, 0.05, 0, 200, 0.5)
  },
  sfx_boss_spawn: () => {
    tone(80, 0.8, 'sawtooth', 0.18)
    tone(55, 1.0, 'sine', 0.12, 0.05)
    tone(110, 0.6, 'square', 0.08, 0.15)
    sweep(440, 110, 0.5, 'sawtooth', 0.1, 0.2)
    noise(0.5, 0.06, 0.2, 150, 0.5)
  },
  sfx_boss_enrage: () => {
    sweep(200, 600, 0.15, 'sawtooth', 0.14)
    tone(100, 0.4, 'square', 0.12, 0.15)
    tone(150, 0.3, 'sawtooth', 0.1, 0.2)
    noise(0.3, 0.06, 0.2, 300, 1)
  },

  // === 装备掉落 ===
  sfx_drop_rare: () => {
    tone(880, 0.1, 'sine', 0.1)
    tone(1320, 0.15, 'sine', 0.08, 0.08)
    tone(1760, 0.2, 'sine', 0.06, 0.16)
  },
  sfx_drop_epic: () => {
    tone(660, 0.12, 'sine', 0.1)
    tone(990, 0.12, 'sine', 0.09, 0.08)
    tone(1320, 0.12, 'sine', 0.08, 0.16)
    tone(1980, 0.3, 'sine', 0.07, 0.24)
    tone(2640, 0.35, 'triangle', 0.05, 0.32)
  },
  sfx_drop_legend: () => {
    tone(523, 0.15, 'sine', 0.12)
    tone(659, 0.15, 'sine', 0.1, 0.1)
    tone(784, 0.15, 'sine', 0.09, 0.2)
    tone(1047, 0.15, 'sine', 0.08, 0.3)
    tone(1568, 0.4, 'sine', 0.07, 0.4)
    tone(2093, 0.5, 'triangle', 0.05, 0.5)
  },

  // === 宗门音效 ===
  sfx_sect_build: () => {
    tone(220, 0.15, 'square', 0.1)
    tone(330, 0.15, 'square', 0.08, 0.1)
    tone(440, 0.25, 'sawtooth', 0.06, 0.2)
    noise(0.1, 0.05, 0, 500, 1)
  },
  sfx_sect_place: () => {
    tone(330, 0.08, 'sine', 0.1)
    tone(440, 0.08, 'sine', 0.08, 0.06)
    tone(550, 0.12, 'triangle', 0.06, 0.12)
  },
  sfx_sect_recruit: () => {
    tone(523, 0.1, 'sine', 0.1)
    tone(659, 0.1, 'sine', 0.08, 0.08)
    tone(784, 0.15, 'sine', 0.07, 0.16)
    tone(1047, 0.2, 'triangle', 0.05, 0.26)
  },
  sfx_sect_dispatch: () => {
    sweep(440, 880, 0.15, 'sine', 0.08)
    tone(660, 0.1, 'triangle', 0.06, 0.12)
  },
  sfx_sect_upgrade: () => {
    tone(440, 0.1, 'sawtooth', 0.1)
    tone(554, 0.1, 'sawtooth', 0.08, 0.08)
    tone(659, 0.12, 'sawtooth', 0.07, 0.16)
    tone(880, 0.25, 'sine', 0.06, 0.24)
    noise(0.08, 0.04, 0.24, 800, 1)
  },

  // === 系统音效 ===
  sfx_breakthrough: () => {
    sweep(200, 800, 0.4, 'sawtooth', 0.14)
    tone(400, 0.3, 'sine', 0.1, 0.1)
    tone(600, 0.3, 'sine', 0.08, 0.2)
    tone(800, 0.4, 'sine', 0.06, 0.3)
    noise(0.3, 0.06, 0.1, 500, 0.5)
  },
  sfx_teleport: () => {
    sweep(220, 1760, 0.25, 'sine', 0.1)
    tone(880, 0.15, 'triangle', 0.06, 0.2)
    noise(0.15, 0.04, 0, 2000, 2)
  },
  sfx_refine: () => {
    tone(330, 0.15, 'sawtooth', 0.1)
    tone(440, 0.15, 'square', 0.08, 0.1)
    sweep(880, 440, 0.2, 'sine', 0.06, 0.2)
    noise(0.1, 0.04, 0.2, 1000, 1)
  },
  sfx_orifice: () => {
    tone(440, 0.2, 'sine', 0.1)
    tone(554, 0.2, 'sine', 0.08, 0.1)
    tone(659, 0.3, 'sine', 0.07, 0.2)
    sweep(659, 1318, 0.4, 'triangle', 0.05, 0.3)
  },
  sfx_tribulation_warn: () => {
    tone(110, 0.5, 'sawtooth', 0.15)
    tone(82, 0.6, 'sine', 0.12, 0.1)
    sweep(220, 55, 0.8, 'sawtooth', 0.08, 0.2)
    noise(0.4, 0.06, 0.1, 200, 0.5)
  },
  sfx_cave_build: () => {
    tone(150, 0.2, 'sawtooth', 0.1)
    noise(0.15, 0.06, 0, 400, 1)
    tone(220, 0.2, 'triangle', 0.08, 0.15)
    tone(330, 0.3, 'sine', 0.06, 0.3)
  },
  sfx_disciple_sparring: () => {
    tone(880, 0.04, 'square', 0.08)
    tone(660, 0.04, 'square', 0.06, 0.04)
    tone(880, 0.04, 'square', 0.06, 0.08)
  },

  // === 任务/事件音效 ===
  sfx_quest_complete: () => {
    tone(523, 0.12, 'sine', 0.1)
    tone(659, 0.12, 'sine', 0.09, 0.1)
    tone(784, 0.12, 'sine', 0.08, 0.2)
    tone(1047, 0.3, 'triangle', 0.07, 0.3)
    tone(1568, 0.35, 'sine', 0.05, 0.42)
  },
  sfx_spirit_vein: () => {
    sweep(220, 880, 0.5, 'sine', 0.1)
    tone(440, 0.4, 'triangle', 0.08, 0.1)
    tone(660, 0.3, 'sine', 0.06, 0.25)
    noise(0.3, 0.04, 0.1, 800, 0.5)
  },
  sfx_enlightenment: () => {
    tone(880, 0.15, 'sine', 0.1)
    tone(1320, 0.15, 'sine', 0.08, 0.1)
    tone(1760, 0.2, 'triangle', 0.06, 0.2)
    tone(2640, 0.3, 'sine', 0.04, 0.35)
  },
  sfx_wandering_cultivator: () => {
    tone(440, 0.12, 'triangle', 0.08)
    tone(554, 0.12, 'triangle', 0.07, 0.08)
    tone(659, 0.15, 'sine', 0.06, 0.16)
    tone(880, 0.2, 'triangle', 0.05, 0.28)
  },
  sfx_treasure_find: () => {
    tone(659, 0.1, 'sine', 0.1)
    tone(880, 0.1, 'sine', 0.08, 0.08)
    tone(1047, 0.15, 'sine', 0.07, 0.16)
    tone(1319, 0.2, 'triangle', 0.06, 0.28)
    noise(0.1, 0.03, 0.28, 2000, 1)
  },
  sfx_spirit_beast: () => {
    sweep(180, 60, 0.3, 'sawtooth', 0.12)
    tone(80, 0.4, 'square', 0.1, 0.1)
    noise(0.25, 0.06, 0.05, 300, 0.5)
  },
  sfx_aura_rise: () => {
    sweep(330, 660, 0.4, 'sine', 0.08)
    tone(440, 0.3, 'triangle', 0.06, 0.1)
    tone(554, 0.3, 'sine', 0.05, 0.2)
    tone(880, 0.35, 'sine', 0.04, 0.35)
  },
  sfx_gold_drop: () => {
    tone(1318, 0.06, 'sine', 0.08)
    tone(988, 0.08, 'sine', 0.06, 0.04)
    tone(1318, 0.06, 'sine', 0.05, 0.1)
  },
  sfx_boss_death: () => {
    sweep(440, 55, 0.8, 'sawtooth', 0.16)
    tone(110, 0.6, 'square', 0.12, 0.1)
    tone(82, 0.8, 'sine', 0.1, 0.2)
    noise(0.5, 0.08, 0.1, 200, 0.5)
    noise(0.3, 0.06, 0.4, 500, 1)
  },
  sfx_barrier: () => {
    tone(2000, 0.08, 'sine', 0.08)
    sweep(2000, 800, 0.15, 'triangle', 0.06)
    noise(0.1, 0.04, 0, 3000, 2)
  },
  sfx_dodge: () => {
    sweep(1200, 2400, 0.08, 'sine', 0.06)
    noise(0.04, 0.03, 0, 4000, 2)
  },
  sfx_critical_hit: () => {
    tone(1760, 0.04, 'square', 0.12)
    tone(880, 0.08, 'sawtooth', 0.1, 0.03)
    noise(0.08, 0.08, 0, 2500, 2)
    tone(440, 0.1, 'square', 0.06, 0.06)
  },
  sfx_parry: () => {
    tone(3000, 0.03, 'sine', 0.1)
    tone(2000, 0.05, 'triangle', 0.08, 0.02)
    noise(0.06, 0.05, 0, 5000, 2)
  },
  sfx_levelup_alt: () => {
    tone(523, 0.1, 'sine', 0.1)
    tone(659, 0.1, 'sine', 0.08, 0.08)
    tone(784, 0.1, 'sine', 0.07, 0.16)
    tone(1047, 0.15, 'triangle', 0.06, 0.24)
    tone(880, 0.12, 'sine', 0.05, 0.36)
    tone(1047, 0.2, 'sine', 0.04, 0.46)
  },
  sfx_portal: () => {
    sweep(220, 1760, 0.25, 'sine', 0.1)
    tone(880, 0.15, 'triangle', 0.06, 0.2)
    noise(0.15, 0.04, 0, 2000, 2)
  },
  // === 基础UI音效（文件缺失时的合成兜底）===
  sfx_click: () => {
    tone(800, 0.04, 'square', 0.08)
  },
  sfx_open: () => {
    tone(523, 0.06, 'sine', 0.08)
    tone(784, 0.08, 'sine', 0.06, 0.04)
  },
  sfx_equip: () => {
    tone(660, 0.05, 'triangle', 0.08)
    tone(990, 0.08, 'sine', 0.06, 0.04)
    noise(0.04, 0.04, 0, 3000, 1)
  },
  sfx_skill: () => {
    sweep(440, 880, 0.1, 'sine', 0.08)
    tone(660, 0.08, 'triangle', 0.06, 0.05)
  },
  sfx_swing: () => {
    sweep(700, 150, 0.12, 'sawtooth', 0.1)
    noise(0.06, 0.05, 0, 1500, 0.5)
  },
  sfx_magic: () => {
    tone(440, 0.1, 'sine', 0.08)
    tone(660, 0.12, 'sine', 0.06, 0.05)
    tone(880, 0.15, 'sine', 0.04, 0.1)
  },
  sfx_art: () => {
    tone(110, 0.2, 'sawtooth', 0.12)
    sweep(660, 220, 0.25, 'sine', 0.08, 0.1)
    noise(0.15, 0.06, 0.1, 600, 0.5)
  },
  sfx_hit: () => {
    tone(200, 0.08, 'square', 0.1)
    noise(0.05, 0.07, 0, 2000, 1)
  },
  sfx_die: () => {
    sweep(330, 80, 0.4, 'sawtooth', 0.12)
    noise(0.3, 0.06, 0.1, 300, 0.5)
  },
  sfx_pickup: () => {
    tone(880, 0.06, 'sine', 0.08)
    tone(1320, 0.08, 'sine', 0.06, 0.05)
  },
  sfx_chest: () => {
    tone(440, 0.08, 'square', 0.08)
    tone(660, 0.1, 'sine', 0.06, 0.08)
    tone(880, 0.12, 'triangle', 0.05, 0.16)
    noise(0.08, 0.05, 0.2, 1000, 0.5)
  },
  sfx_potion: () => {
    sweep(330, 660, 0.15, 'sine', 0.08)
    tone(990, 0.1, 'sine', 0.05, 0.1)
  },
  sfx_levelup: () => {
    tone(523, 0.1, 'sine', 0.1)
    tone(659, 0.1, 'sine', 0.09, 0.08)
    tone(784, 0.1, 'sine', 0.08, 0.16)
    tone(1047, 0.2, 'triangle', 0.07, 0.24)
    tone(1568, 0.3, 'sine', 0.05, 0.34)
  },
}

/** 播放程序化合成音效 */
export function synthSfx(key: string, volume = 1) {
  const fn = synthMap[key]
  if (!fn) return
  const c = getCtx()
  if (!c || c.state === 'suspended') return
  currentVolScale = volume
  fn()
  currentVolScale = 1 // 恢复默认，避免污染后续音效
}
