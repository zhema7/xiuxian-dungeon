// ---------- 大地图迷雾系统 ----------
// 玩家走过的区域被永久照亮

import type { GameState } from './state'

const TILE_SIZE = 48  // 大地图每个迷雾格的像素大小

export function exploreTile(state: GameState, domain: string, x: number, y: number): void {
  const cx = Math.floor(x / TILE_SIZE)
  const cy = Math.floor(y / TILE_SIZE)
  const key = `${domain}:${cx}:${cy}`
  if (!state.worldFogData[key]) {
    state.worldFogData[key] = true
    // 同时照亮周围1格
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = `${domain}:${cx + dx}:${cy + dy}`
        state.worldFogData[k] = true
      }
    }
  }
}

export function isExplored(state: GameState, domain: string, x: number, y: number): boolean {
  const cx = Math.floor(x / TILE_SIZE)
  const cy = Math.floor(y / TILE_SIZE)
  return !!state.worldFogData[`${domain}:${cx}:${cy}`]
}

export function getExploredTiles(state: GameState, domain: string): { cx: number; cy: number }[] {
  const tiles: { cx: number; cy: number }[] = []
  for (const key of Object.keys(state.worldFogData)) {
    const parts = key.split(':')
    if (parts[0] === domain) {
      tiles.push({ cx: parseInt(parts[1]), cy: parseInt(parts[2]) })
    }
  }
  return tiles
}

export function getVisionRadius(playerRealm: number): number {
  return 120 + playerRealm * 20  // 境界越高视野越大
}

// 清除某域迷雾（debug/作弊用）
export function revealAllDomain(state: GameState, domain: string): void {
  for (let cx = 0; cx < 40; cx++) {
    for (let cy = 0; cy < 60; cy++) {
      state.worldFogData[`${domain}:${cx}:${cy}`] = true
    }
  }
}
