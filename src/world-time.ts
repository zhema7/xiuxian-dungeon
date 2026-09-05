// ---------- 苍玄历 · 世界时间系统 ----------

export interface WorldTime {
  year: number      // 年（苍玄历 X 年）
  month: number     // 月（1-12）
  day: number       // 日（1-30）
  hour: number      // 时辰（0-11，0=子时）
  /** 累计经过的现实秒数（用于计算时间流逝） */
  elapsed: number
}

export const SHICHEN_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

export const SEASONS = ['春', '夏', '秋', '冬'] as const
export type Season = typeof SEASONS[number]

export const MONTH_NAMES = [
  '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '冬月', '腊月',
]

/** 现实 5 分钟 = 游戏内 1 天（静止时的基础流逝速度） */
const REAL_MS_PER_GAME_DAY = 5 * 60 * 1000
/** 现实 1 秒 = 游戏内时辰数 */
const GAME_HOURS_PER_REAL_SEC = 12 / (REAL_MS_PER_GAME_DAY / 1000)

/** 移动时时间加速基础倍率 */
const MOVE_TIME_BASE_MULT = 4.0
/** 速度参考值（基础速度约 110-180，取 120 为基准） */
const SPEED_REF = 120

/** 计算移动时的时间加速倍率：速度越高，赶路越快，时间消耗越少 */
export function getMoveTimeMultiplier(effectiveSpeed: number): number {
  // 速度 120 → 倍率 4.0；速度 180 → 倍率约 2.67；速度 100 → 倍率 4.8
  return MOVE_TIME_BASE_MULT * (SPEED_REF / Math.max(60, effectiveSpeed))
}

export function newWorldTime(): WorldTime {
  return { year: 1, month: 1, day: 1, hour: 4, elapsed: 0 }
}

export function seasonOf(month: number): Season {
  return SEASONS[Math.floor((month - 1) / 3)]
}

/** 当前是否白天（辰时~申时 = hour 4~9） */
export function isDaytime(t: WorldTime): boolean {
  return t.hour >= 4 && t.hour <= 9
}

/** 当前是否夜晚（戌时~寅时 = hour 10,11,0,1,2,3） */
export function isNight(t: WorldTime): boolean {
  return !isDaytime(t)
}

/** 季节加成倍率 */
export function seasonModifier(season: Season): { herbGrowth: number; encounterRate: number; resourceRate: number; cultivateRate: number } {
  switch (season) {
    case '春': return { herbGrowth: 1.3, encounterRate: 1.0, resourceRate: 1.0, cultivateRate: 1.0 }
    case '夏': return { herbGrowth: 1.0, encounterRate: 1.3, resourceRate: 1.0, cultivateRate: 1.0 }
    case '秋': return { herbGrowth: 1.0, encounterRate: 1.0, resourceRate: 1.3, cultivateRate: 1.0 }
    case '冬': return { herbGrowth: 0.8, encounterRate: 0.8, resourceRate: 0.8, cultivateRate: 1.2 }
  }
}

/** 推进时间，传入现实毫秒增量 */
export function advanceTime(t: WorldTime, deltaMs: number): WorldTime {
  const newElapsed = t.elapsed + deltaMs
  const hoursAdvanced = Math.floor(newElapsed * GAME_HOURS_PER_REAL_SEC / 1000) - Math.floor(t.elapsed * GAME_HOURS_PER_REAL_SEC / 1000)

  if (hoursAdvanced <= 0) {
    return { ...t, elapsed: newElapsed }
  }

  let { year, month, day, hour } = t
  hour += hoursAdvanced

  while (hour >= 12) {
    hour -= 12
    day++
    if (day > 30) {
      day = 1
      month++
      if (month > 12) {
        month = 1
        year++
      }
    }
  }

  return { year, month, day, hour, elapsed: newElapsed }
}

/** 推进指定天数（用于传送/闭关等跳跃） */
export function advanceDays(t: WorldTime, days: number): WorldTime {
  const deltaMs = days * REAL_MS_PER_GAME_DAY
  return advanceTime(t, deltaMs)
}

/** 格式化为显示文本 */
export function formatTime(t: WorldTime): string {
  const season = seasonOf(t.month)
  const shichen = SHICHEN_NAMES[t.hour]
  const dn = isDaytime(t) ? '白昼' : '夜'
  return `苍玄历${t.year}年 ${season}${MONTH_NAMES[t.month - 1]}${t.day}日 ${shichen}时·${dn}`
}

/** 简短日期 */
export function formatDate(t: WorldTime): string {
  const season = seasonOf(t.month)
  return `${season}${MONTH_NAMES[t.month - 1]}${t.day}日`
}

/** 时辰段名称 */
export function timeOfDayName(t: WorldTime): string {
  if (t.hour >= 5 && t.hour <= 7) return '清晨'
  if (t.hour >= 8 && t.hour <= 9) return '午后'
  if (t.hour === 10 || t.hour === 11) return '黄昏'
  if (t.hour === 0 || t.hour === 1) return '深夜'
  if (t.hour >= 2 && t.hour <= 4) return '拂晓'
  return '日间'
}
