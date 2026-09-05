// ---------- 五域生物群系色调系统 ----------
// 统一定义各域的颜色板，用于地面/河流/装饰/迷雾/天气等渲染

import type { DomainId } from './world-map'

export interface BiomePalette {
  /** 地面亮色 */
  groundLight: number
  /** 地面暗色 */
  groundDark: number
  /** 河流颜色 */
  river: number
  /** 河流亮色（高光） */
  riverHighlight: number
  /** 装饰主色（树/草） */
  deco: number
  /** 装饰次色 */
  decoSecondary: number
  /** 边框色 */
  border: number
  /** 迷雾色（未探索区域） */
  fog: number
  /** 天气粒子色 */
  weatherParticle: number
  /** 远景山脉色 */
  mountain: number
  /** 云层色 */
  cloud: number
  /** 环境光色（昼夜基础） */
  ambientDay: number
  ambientNight: number
}

export const BIOME_PALETTES: Record<DomainId, BiomePalette> = {
  south: {
    groundLight: 0x2a5a3a,
    groundDark: 0x1a3a2a,
    river: 0x2a5a6a,
    riverHighlight: 0x4a8a9a,
    deco: 0x3a6a4a,
    decoSecondary: 0x5a8a6a,
    border: 0x1a2a1a,
    fog: 0x0a1a0a,
    weatherParticle: 0x8899bb,
    mountain: 0x5a8a6a,
    cloud: 0xaabbcc,
    ambientDay: 0x4a5a6a,
    ambientNight: 0x1a2a3a,
  },
  central: {
    groundLight: 0x4a4a3a,
    groundDark: 0x2a2a1a,
    river: 0x3a4a5a,
    riverHighlight: 0x5a6a7a,
    deco: 0x5a5a3a,
    decoSecondary: 0x7a7a5a,
    border: 0x2a2a1a,
    fog: 0x1a1a0a,
    weatherParticle: 0xaabbcc,
    mountain: 0x7a7a5a,
    cloud: 0xbbccdd,
    ambientDay: 0x5a5a4a,
    ambientNight: 0x2a2a3a,
  },
  east: {
    groundLight: 0x2a4a5a,
    groundDark: 0x1a2a3a,
    river: 0x3a6a8a,
    riverHighlight: 0x5a8aaa,
    deco: 0x3a5a7a,
    decoSecondary: 0x5a7a9a,
    border: 0x1a2a2a,
    fog: 0x0a1a2a,
    weatherParticle: 0xaabbcc,
    mountain: 0x5a7a8a,
    cloud: 0xaaccdd,
    ambientDay: 0x4a6a7a,
    ambientNight: 0x1a2a3a,
  },
  west: {
    groundLight: 0x5a4a2a,
    groundDark: 0x3a2a1a,
    river: 0x4a3a2a,
    riverHighlight: 0x6a5a3a,
    deco: 0x6a4a2a,
    decoSecondary: 0x8a6a3a,
    border: 0x2a1a0a,
    fog: 0x1a0a00,
    weatherParticle: 0xc8a86a,
    mountain: 0x8a5a3a,
    cloud: 0xc8bbaa,
    ambientDay: 0x6a5a4a,
    ambientNight: 0x3a2a1a,
  },
  north: {
    groundLight: 0x3a4a5a,
    groundDark: 0x1a2a3a,
    river: 0x4a6a8a,
    riverHighlight: 0x6a8aaa,
    deco: 0x4a5a7a,
    decoSecondary: 0x6a7a9a,
    border: 0x1a2a2a,
    fog: 0x0a1a2a,
    weatherParticle: 0xffffff,
    mountain: 0x5a5a7a,
    cloud: 0xddeeff,
    ambientDay: 0x4a5a6a,
    ambientNight: 0x1a1a3a,
  },
}

export function getBiomePalette(domain: DomainId): BiomePalette {
  return BIOME_PALETTES[domain] ?? BIOME_PALETTES.south
}
