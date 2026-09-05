// ---------- 大地图天气粒子系统 ----------
// 按域 + 季节 + 昼夜生成天气粒子效果

import type { DomainId } from './world-map'
import type { WorldTime } from './world-time'
import { isNight, seasonOf, type Season } from './world-time'

export type WeatherType = 'clear' | 'rain' | 'snow' | 'sand' | 'mist' | 'leaves'

export interface WeatherConfig {
  type: WeatherType
  particleCount: number
  speed: { min: number; max: number }
  angle: { min: number; max: number }
  lifespan: number
  alpha: { start: number; end: number }
  scale: { start: number; end: number }
  color: number
  frequency: number
  quantity: number
}

/** 根据域 + 季节 + 昼夜确定天气类型 */
export function getWeatherType(domain: DomainId, time: WorldTime): WeatherType {
  const season = seasonOf(time.month)
  const night = isNight(time)

  switch (domain) {
    case 'south':
      if (season === '春') return 'rain'
      if (season === '冬') return 'snow'
      if (night && season === '秋') return 'mist'
      return 'clear'
    case 'central':
      if (season === '夏' && !night) return 'clear'
      if (season === '冬') return 'snow'
      if (night) return 'mist'
      return 'clear'
    case 'east':
      if (night) return 'mist'
      if (season === '冬') return 'rain'
      return 'mist'
    case 'west':
      return 'sand'
    case 'north':
      return 'snow'
    default:
      return 'clear'
  }
}

/** 获取天气配置 */
export function getWeatherConfig(type: WeatherType, night: boolean): WeatherConfig | null {
  switch (type) {
    case 'rain':
      return {
        type,
        particleCount: 60,
        speed: { min: 350, max: 500 },
        angle: { min: 85, max: 95 },
        lifespan: 1500,
        alpha: { start: night ? 0.3 : 0.4, end: 0.05 },
        scale: { start: 0.6, end: 0.6 },
        color: 0x8899bb,
        frequency: 15,
        quantity: 2,
      }
    case 'snow':
      return {
        type,
        particleCount: 40,
        speed: { min: 50, max: 120 },
        angle: { min: 80, max: 100 },
        lifespan: 4000,
        alpha: { start: night ? 0.5 : 0.7, end: 0.1 },
        scale: { start: 0.8, end: 0.3 },
        color: 0xffffff,
        frequency: 50,
        quantity: 1,
      }
    case 'sand':
      return {
        type,
        particleCount: 50,
        speed: { min: 200, max: 400 },
        angle: { min: 170, max: 190 },
        lifespan: 2000,
        alpha: { start: 0.25, end: 0.05 },
        scale: { start: 0.5, end: 0.5 },
        color: 0xc8a86a,
        frequency: 20,
        quantity: 2,
      }
    case 'mist':
      return {
        type,
        particleCount: 15,
        speed: { min: 10, max: 40 },
        angle: { min: 0, max: 360 },
        lifespan: 5000,
        alpha: { start: 0.12, end: 0.02 },
        scale: { start: 2.0, end: 3.0 },
        color: night ? 0x6677aa : 0xaabbcc,
        frequency: 200,
        quantity: 1,
      }
    case 'leaves':
      return {
        type,
        particleCount: 20,
        speed: { min: 30, max: 80 },
        angle: { min: 70, max: 110 },
        lifespan: 4000,
        alpha: { start: 0.6, end: 0.1 },
        scale: { start: 0.7, end: 0.7 },
        color: 0xd4a055,
        frequency: 100,
        quantity: 1,
      }
    case 'clear':
    default:
      return null
  }
}
