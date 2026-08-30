// ---------- 音频系统：BGM + 音效 ----------
// 文件位于 public/audio/<key>.mp3；缺失文件自动静音兜底，不影响游戏运行。
// Phaser 的全局 SoundManager 会在首次触屏/点击时自动解锁 WebAudio（移动端安全）。

import Phaser from 'phaser'

export const BGM_TITLE = 'bgm_title'
export const BGM_TOWN = 'bgm_town'
export const BGM_DUNGEON = 'bgm_dungeon'

export const AUDIO_KEYS = [
  BGM_TITLE, BGM_TOWN, BGM_DUNGEON,
  'sfx_click', 'sfx_open', 'sfx_equip', 'sfx_skill',
  'sfx_swing', 'sfx_magic', 'sfx_art', 'sfx_hit', 'sfx_die',
  'sfx_pickup', 'sfx_chest', 'sfx_potion', 'sfx_levelup', 'sfx_portal',
] as const

let sm: Phaser.Sound.BaseSoundManager | null = null
let bgmSound: Phaser.Sound.BaseSound | null = null
let bgmKey = ''
let bgmVolume = 0.32
let sfxVolume = 0.6

const BGM_VOL_KEY = 'xiuxian_bgm_vol'
const SFX_VOL_KEY = 'xiuxian_sfx_vol'

/** Boot 时绑定全局 SoundManager，加载持久化音量 */
export function audioInit(sound: Phaser.Sound.BaseSoundManager) {
  sm = sound
  try {
    const bgmRaw = localStorage.getItem(BGM_VOL_KEY)
    if (bgmRaw !== null) bgmVolume = parseFloat(bgmRaw)
    const sfxRaw = localStorage.getItem(SFX_VOL_KEY)
    if (sfxRaw !== null) sfxVolume = parseFloat(sfxRaw)
  } catch { /* 忽略 */ }
}

export function getBgmVolume() { return bgmVolume }
export function getSfxVolume() { return sfxVolume }

export function setBgmVolume(v: number) {
  bgmVolume = Math.max(0, Math.min(1, v))
  try { localStorage.setItem(BGM_VOL_KEY, String(bgmVolume)) } catch { /* 忽略 */ }
  if (bgmSound) {
    try { (bgmSound as Phaser.Sound.WebAudioSound).setVolume(bgmVolume) } catch { /* 忽略 */ }
  }
}

export function setSfxVolume(v: number) {
  sfxVolume = Math.max(0, Math.min(1, v))
  try { localStorage.setItem(SFX_VOL_KEY, String(sfxVolume)) } catch { /* 忽略 */ }
}

/** 播放循环 BGM（同 key 重复调用为无操作） */
export function playBgm(key: string) {
  if (!sm || bgmKey === key) return
  stopBgm()
  try {
    if (!sm.game.cache.audio.exists(key)) return
    bgmKey = key
    bgmSound = sm.add(key, { loop: true, volume: bgmVolume })
    bgmSound.play()
  } catch { /* 忽略 */ }
}

export function stopBgm() {
  try { bgmSound?.stop() } catch { /* 忽略 */ }
  bgmSound = null
  bgmKey = ''
}

/** 播放一次性音效；文件缺失或音频未解锁时静默跳过 */
export function sfx(key: string, volume = 1) {
  if (!sm) return
  try {
    if (sm.game.cache.audio.exists(key)) sm.play(key, { volume: sfxVolume * volume })
  } catch { /* 忽略 */ }
}
