// ---------- 音频系统：BGM + 音效 ----------
// 文件位于 public/audio/<key>.mp3；缺失文件自动静音兜底，不影响游戏运行。
// Phaser 的全局 SoundManager 会在首次触屏/点击时自动解锁 WebAudio（移动端安全）。

import Phaser from 'phaser'
import { synthSfx, unlockSynth } from './sfx-synth'

export const BGM_TITLE = 'bgm_title'
export const BGM_TOWN = 'bgm_town'
export const BGM_DUNGEON = 'bgm_dungeon'
export const BGM_SOUTH = 'bgm_south'
export const BGM_SOUTH_ALT = 'bgm_south_alt'
export const BGM_SWAMP = 'bgm_swamp'  // 幽冥沼泽（仅 m4a）
export const BGM_CENTRAL = 'bgm_central'  // 中域大地图
export const BGM_CITY = 'bgm_city'        // 天枢城
export const BGM_WEST = 'bgm_west'        // 西域大地图（仅 m4a）
export const BGM_EAST = 'bgm_east'        // 东域大地图（仅 m4a）
export const BGM_NORTH = 'bgm_north'      // 北域大地图
export const BGM_XIAN = 'bgm_xian'        // 破碎仙宫
export const BGM_SY1 = 'bgm_sy1'          // 无尽妖域 BGM 1
export const BGM_SY2 = 'bgm_sy2'          // 无尽妖域 BGM 2
export const BGM_SECT = 'bgm_sect'        // 宗门场景（仅 m4a）
export const BGM_ARENA = 'bgm_arena'      // 擂台
export const BGM_LADDER = 'bgm_ladder'    // 天梯
export const BGM_TRIBULATION = 'bgm_tribulation'  // 渡劫（仅 m4a）
export const BGM_HUANGLONG = 'bgm_huanglong'    // 黄龙山（仅 m4a）
export const BGM_WANYAO = 'bgm_wanyao'      // 万妖谷（仅 m4a）
export const BGM_TIANJIAN = 'bgm_tianjian'  // 天剑冢
export const BGM_HAISHI = 'bgm_haishi'      // 海市蜃楼（仅 m4a）
export const BGM_GUZHAN = 'bgm_guzhan'    // 古战场
export const BGM_LOULAN = 'bgm_loulan'    // 楼兰秘境（仅 m4a）
export const BGM_BINGYUAN = 'bgm_bingyuan'  // 冰原秘境

export const AUDIO_KEYS = [
  BGM_TITLE, BGM_TOWN, BGM_DUNGEON, BGM_SOUTH, BGM_SOUTH_ALT, BGM_SWAMP, BGM_CENTRAL, BGM_CITY, BGM_WEST, BGM_EAST, BGM_NORTH, BGM_XIAN, BGM_SY1, BGM_SY2, BGM_SECT, BGM_ARENA, BGM_LADDER, BGM_TRIBULATION, BGM_HUANGLONG, BGM_WANYAO, BGM_TIANJIAN, BGM_HAISHI, BGM_GUZHAN, BGM_LOULAN, BGM_BINGYUAN,
  'sfx_click', 'sfx_open', 'sfx_equip', 'sfx_skill',
  'sfx_swing', 'sfx_magic', 'sfx_art', 'sfx_hit', 'sfx_die',
  'sfx_pickup', 'sfx_chest', 'sfx_potion', 'sfx_levelup', 'sfx_portal',
] as const

/** 只有 m4a 格式的音频 key（mp3 缺失，避免 Phaser 加载 SPA fallback 的 HTML） */
const M4A_ONLY_KEYS = new Set<string>([BGM_TOWN, BGM_SWAMP, BGM_WEST, BGM_EAST, BGM_SECT, BGM_TRIBULATION, BGM_HUANGLONG, BGM_WANYAO, BGM_HAISHI, BGM_LOULAN])

/** 获取音频加载 URL 列表（按浏览器支持顺序排列） */
export function audioUrls(key: string): string[] {
  if (M4A_ONLY_KEYS.has(key)) {
    return [`audio/${key}.m4a`]
  }
  return [`audio/${key}.mp3`, `audio/${key}.m4a`]
}

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
  unlockSynth()
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

/** 播放一次性音效；文件音效优先，缺失时走合成器 */
export function sfx(key: string, volume = 1) {
  const vol = sfxVolume * volume
  // 先尝试 Phaser 缓存的音频文件
  if (sm) {
    try {
      if (sm.game.cache.audio.exists(key)) {
        sm.play(key, { volume: vol })
        return
      }
    } catch { /* 忽略 */ }
  }
  // 文件不存在时走程序化合成器
  synthSfx(key, vol)
}
