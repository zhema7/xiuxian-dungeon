// ---------- 本地榜单：个人历史最佳纪录（修为 / 除魔 / 妖域深度） ----------
// 独立于存档存储，开始新仙途不会清空纪录。

import { CLASSES, REALMS } from './data'
import type { GameState } from './state'

const REC_KEY = 'xiuxian_records_v1'

export interface RecordEntry {
  heroName: string
  classId: string
  score: number
  label: string
  date: string
}

export interface Records {
  level: RecordEntry | null   // 修为榜：历史最高等级+境界
  kills: RecordEntry | null   // 除魔榜：历史最多累计击杀
  depth: RecordEntry | null   // 妖域榜：历史最深层数
  ladder: RecordEntry | null  // 天梯榜：历史最高层数
  ascension: RecordEntry | null // 飞升榜：飞升次数
}

export function getRecords(): Records {
  try {
    const raw = localStorage.getItem(REC_KEY)
    if (raw) {
      const r = JSON.parse(raw) as Records
      return { level: r.level ?? null, kills: r.kills ?? null, depth: r.depth ?? null, ladder: r.ladder ?? null, ascension: r.ascension ?? null }
    }
  } catch { /* 忽略 */ }
  return { level: null, kills: null, depth: null, ladder: null, ascension: null }
}

/** 每次存档时刷新三类个人最佳（只升不降） */
export function updateRecords(s: GameState) {
  try {
    const r = getRecords()
    const date = new Date().toLocaleDateString('zh-CN')
    const mk = (score: number, label: string): RecordEntry =>
      ({ heroName: s.heroName, classId: s.classId, score, label, date })

    const levelScore = s.level * 100 + s.realm
    if (!r.level || levelScore > r.level.score) {
      r.level = mk(levelScore, `Lv.${s.level} · ${REALMS[s.realm]?.name ?? ''}`)
    }
    if (!r.kills || s.totalKills > r.kills.score) {
      r.kills = mk(s.totalKills, `累计除魔 ${s.totalKills}`)
    }
    const depth = s.syMaxDepth ?? 0
    if (depth > 0 && (!r.depth || depth > r.depth.score)) {
      r.depth = mk(depth, `无尽妖域 第 ${depth} 层`)
    }
    const ladderFloor = s.ladderMaxFloor ?? 0
    if (ladderFloor > 0 && (!r.ladder || ladderFloor > r.ladder.score)) {
      r.ladder = mk(ladderFloor, `天梯 第 ${ladderFloor} 层`)
    }
    if (s.ascensionCount > 0 && (!r.ascension || s.ascensionCount > r.ascension.score)) {
      r.ascension = mk(s.ascensionCount, `飞升 ${s.ascensionCount} 世`)
    }
    localStorage.setItem(REC_KEY, JSON.stringify(r))
  } catch { /* 忽略 */ }
}

export function classNameOf(classId: string): string {
  return CLASSES[classId]?.name ?? classId
}
