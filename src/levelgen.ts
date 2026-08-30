// ---------- 程序化关卡生成：多房间 + 通道 + 石柱障碍 + 水域 + 装饰点 ----------

export const TILE = 16
export const COLS = 50           // 800px 宽（相机跟随，不整屏显示）
export const ROWS = 60           // 960px 高
export const OX = 16             // 地图原点（像素）
export const OY = 64

export const T_ROCK = 0          // 岩石（实心）
export const T_FLOOR = 1         // 地面
export const T_WATER = 2         // 水域（可走，减速）
export const T_PILLAR = 3        // 石柱（实心障碍）

export interface Room { x: number; y: number; w: number; h: number; cx: number; cy: number }
export interface Pt { x: number; y: number }

/** 地面装饰点：无碰撞，纯视觉点缀 */
export interface FloorDeco {
  x: number   // 像素
  y: number
  type: number // 1~4：碎石/草丛/水晶/符文
  flipX: boolean
}

/** 墙面装饰点：挂在墙面上的视觉元素（火把/藤蔓/水晶） */
export interface WallDeco {
  x: number
  y: number
  type: number // 1~3：火把/藤蔓/水晶
  flipX: boolean
}

export interface LevelMap {
  tiles: Uint8Array              // 行主序，长度 COLS*ROWS
  rooms: Room[]
  spawn: Pt                      // 玩家出生点（像素）
  portal: Pt                     // 下一层传送门（像素）
  wallRects: Array<{ x: number; y: number; w: number; h: number }>  // 合并后的实心碰撞盒（像素）
  floorDecos: FloorDeco[]        // 地面装饰点
  wallDecos: WallDeco[]          // 墙面装饰点
}

export function tileAtPixel(m: LevelMap, px: number, py: number): number {
  const cx = Math.floor((px - OX) / TILE)
  const cy = Math.floor((py - OY) / TILE)
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return T_ROCK
  return m.tiles[cy * COLS + cx]
}

export function isSolidPixel(m: LevelMap, px: number, py: number): boolean {
  const t = tileAtPixel(m, px, py)
  return t === T_ROCK || t === T_PILLAR
}

export function isWalkable(t: number) { return t === T_FLOOR || t === T_WATER }

/** 确定性格位散列（用于地面变体选择等） */
export function tileHash(cx: number, cy: number): number {
  return ((cx * 73856093) ^ (cy * 19349663)) >>> 0
}

/** 在可行走格中随机取一点（像素坐标，格中心），要求距 from 至少 minDist */
export function randomFloorPoint(m: LevelMap, rng: () => number, minDist: number, from: Pt): Pt | null {
  const cells: Pt[] = []
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      if (!isWalkable(m.tiles[cy * COLS + cx])) continue
      const px = OX + cx * TILE + TILE / 2
      const py = OY + cy * TILE + TILE / 2
      if (Math.hypot(px - from.x, py - from.y) >= minDist) cells.push({ x: px, y: py })
    }
  }
  if (cells.length === 0) return null
  return cells[Math.floor(rng() * cells.length)]
}

/** 判断岩石格是否为边缘岩（与可行走区域相邻，或位于地图边界） */
export function isEdgeRockTile(tiles: Uint8Array, cx: number, cy: number): boolean {
  // 地图边界格始终渲染为墙壁贴图，确保四面对称
  if (cx === 0 || cy === 0 || cx === COLS - 1 || cy === ROWS - 1) return true
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
      if (isWalkable(tiles[ny * COLS + nx])) return true
    }
  return false
}

/**
 * 墙面拼接类型：根据上方/左方是否为岩石，决定用哪块墙面瓷砖
 *  - 'top'：顶面（上方是空气/地面）
 *  - 'side'：侧面
 *  - 'corner_tl' / 'corner_tr' / 'corner_bl' / 'corner_br'：墙角
 * 注意：仅对边缘岩石格有意义
 */
export function wallTileType(tiles: Uint8Array, cx: number, cy: number): 'top' | 'side' | 'corner_tl' | 'corner_tr' | 'corner_bl' | 'corner_br' {
  const above = cy > 0 ? tiles[(cy - 1) * COLS + cx] : T_ROCK
  const below = cy < ROWS - 1 ? tiles[(cy + 1) * COLS + cx] : T_ROCK
  const left = cx > 0 ? tiles[cy * COLS + cx - 1] : T_ROCK
  const right = cx < COLS - 1 ? tiles[cy * COLS + cx + 1] : T_ROCK

  const aboveWalk = isWalkable(above)
  const belowWalk = isWalkable(below)
  const leftWalk = isWalkable(left)
  const rightWalk = isWalkable(right)

  // 顶面：上方是可行走区域
  if (aboveWalk) {
    if (leftWalk && !rightWalk) return 'corner_tr'
    if (!leftWalk && rightWalk) return 'corner_tl'
    return 'top'
  }

  // 底面：下方是可行走区域（从下方看是顶面，但我们是俯视视角，底面也显示为顶面）
  if (belowWalk) {
    if (leftWalk && !rightWalk) return 'corner_br'
    if (!leftWalk && rightWalk) return 'corner_bl'
    return 'top'
  }

  // 左右两侧是可行走区域 → 侧面
  if (leftWalk || rightWalk) {
    if (leftWalk && rightWalk) return 'side'
    if (leftWalk) return 'corner_tr' // 右侧是墙，左侧是地面 → 显示为右侧面
    return 'corner_tl' // 左侧是墙，右侧是地面 → 显示为左侧面
  }

  return 'side'
}

/** 生成地面装饰点 */
function generateFloorDecos(tiles: Uint8Array, rooms: Room[], rng: () => number, spawn: Pt, portal: Pt): FloorDeco[] {
  const decos: FloorDeco[] = []
  const ri = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1))

  // 每个房间放置 2~5 个装饰
  for (const r of rooms) {
    const count = ri(2, 5)
    let attempts = 0
    let placed = 0
    while (placed < count && attempts < 30) {
      attempts++
      const cx = ri(r.x + 1, r.x + r.w - 2)
      const cy = ri(r.y + 1, r.y + r.h - 2)
      const idx = cy * COLS + cx
      if (tiles[idx] !== T_FLOOR) continue

      const px = OX + cx * TILE + TILE / 2 + ri(-3, 3)
      const py = OY + cy * TILE + TILE / 2 + ri(-2, 2)

      // 避开出生点和传送门
      if (Math.hypot(px - spawn.x, py - spawn.y) < 40) continue
      if (Math.hypot(px - portal.x, py - portal.y) < 40) continue

      decos.push({
        x: px,
        y: py,
        type: ri(1, 4),
        flipX: rng() < 0.5,
      })
      placed++
    }
  }

  return decos
}

/** 生成墙面装饰点 */
function generateWallDecos(tiles: Uint8Array, rooms: Room[], rng: () => number): WallDeco[] {
  const decos: WallDeco[] = []
  const ri = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1))

  // 收集所有边缘岩石格（且在房间周围）
  const edgeRocks: Array<{ cx: number; cy: number; side: 'top' | 'bottom' | 'left' | 'right' }> = []

  for (const r of rooms) {
    // 房间顶部墙面
    for (let cx = r.x; cx < r.x + r.w; cx++) {
      const cy = r.y - 1
      if (cy >= 0 && tiles[cy * COLS + cx] === T_ROCK) {
        edgeRocks.push({ cx, cy, side: 'top' })
      }
    }
    // 房间底部墙面
    for (let cx = r.x; cx < r.x + r.w; cx++) {
      const cy = r.y + r.h
      if (cy < ROWS && tiles[cy * COLS + cx] === T_ROCK) {
        edgeRocks.push({ cx, cy, side: 'bottom' })
      }
    }
    // 房间左侧墙面
    for (let cy = r.y; cy < r.y + r.h; cy++) {
      const cx = r.x - 1
      if (cx >= 0 && tiles[cy * COLS + cx] === T_ROCK) {
        edgeRocks.push({ cx, cy, side: 'left' })
      }
    }
    // 房间右侧墙面
    for (let cy = r.y; cy < r.y + r.h; cy++) {
      const cx = r.x + r.w
      if (cx < COLS && tiles[cy * COLS + cx] === T_ROCK) {
        edgeRocks.push({ cx, cy, side: 'right' })
      }
    }
  }

  // 随机选择一些位置放置墙面装饰（火把/藤蔓/水晶）
  const targetCount = Math.min(Math.floor(edgeRocks.length * 0.08), 20)
  for (let i = 0; i < targetCount; i++) {
    if (edgeRocks.length === 0) break
    const idx = ri(0, edgeRocks.length - 1)
    const rock = edgeRocks[idx]
    edgeRocks.splice(idx, 1)

    const px = OX + rock.cx * TILE + TILE / 2
    const py = OY + rock.cy * TILE + TILE / 2

    decos.push({
      x: px,
      y: py,
      type: ri(1, 3),
      flipX: rng() < 0.3,
    })
  }

  return decos
}

export function generateLevel(rng: () => number, opts: { water: boolean }): LevelMap {
  const tiles = new Uint8Array(COLS * ROWS) // 全岩石
  const rooms: Room[] = []

  // 1. 放置 8~11 个互不重叠的房间
  const ri = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
  const target = ri(8, 11)
  for (let t = 0; t < 200 && rooms.length < target; t++) {
    const w = ri(5, 10), h = ri(5, 9)
    const x = ri(1, COLS - w - 1), y = ri(1, ROWS - h - 1)
    const overlap = rooms.some((r) => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y)
    if (overlap) continue
    rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) })
  }
  // 兜底：保证至少一个大房间
  if (rooms.length === 0) rooms.push({ x: 10, y: 26, w: 16, h: 10, cx: 18, cy: 31 })

  // 2. 开凿房间
  const carve = (cx: number, cy: number) => {
    if (cx >= 1 && cy >= 1 && cx < COLS - 1 && cy < ROWS - 1) tiles[cy * COLS + cx] = T_FLOOR
  }
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) carve(x, y)
  }

  // 3. 通道：按纵向排序串联 + 50% 概率加一条环路（宽度 2，保证走位空间）
  const ordered = [...rooms].sort((a, b) => a.cy - b.cy)
  const corridor = (x1: number, y1: number, x2: number, y2: number) => {
    const xs = Math.min(x1, x2), xe = Math.max(x1, x2)
    const ys = Math.min(y1, y2), ye = Math.max(y1, y2)
    for (let x = xs; x <= xe; x++) { carve(x, y1); carve(x, y1 + 1) }       // 水平段
    for (let y = ys; y <= ye; y++) { carve(x2, y); carve(x2 + 1, y) }       // 垂直段
  }
  for (let i = 1; i < ordered.length; i++) corridor(ordered[i - 1].cx, ordered[i - 1].cy, ordered[i].cx, ordered[i].cy)
  // 额外环路（大地图 2~3 条，制造绕行与风筝路线）
  const loops = ri(2, 3)
  for (let i = 0; i < loops && rooms.length > 2; i++) {
    const a = rooms[ri(0, rooms.length - 1)]
    const b = rooms[ri(0, rooms.length - 1)]
    if (a !== b) corridor(a.cx, a.cy, b.cx, b.cy)
  }

  // 4. 石柱障碍（每个非出生房 1~4 根，单格，制造掩体与卡点）
  for (const r of rooms) {
    const n = ri(1, 4)
    for (let i = 0; i < n; i++) {
      const x = ri(r.x + 1, r.x + r.w - 2)
      const y = ri(r.y + 1, r.y + r.h - 2)
      if (tiles[y * COLS + x] === T_FLOOR) tiles[y * COLS + x] = T_PILLAR
    }
  }

  // 5. 水域（沼泽/妖域：35% 房间有小水潭，踩上减速）
  if (opts.water) {
    for (const r of rooms) {
      if (rng() > 0.35) continue
      const n = ri(2, 5)
      const wx = ri(r.x, r.x + r.w - 1), wy = ri(r.y, r.y + r.h - 1)
      for (let i = 0; i < n; i++) {
        const x = Math.max(r.x, Math.min(r.x + r.w - 1, wx + ri(-1, 1)))
        const y = Math.max(r.y, Math.min(r.y + r.h - 1, wy + ri(-1, 1)))
        if (tiles[y * COLS + x] === T_FLOOR) tiles[y * COLS + x] = T_WATER
      }
    }
  }

  // 6. 出生房（最靠下）与传送门房（离出生点最远）
  const spawnRoom = [...rooms].sort((a, b) => b.cy - a.cy)[0]
  const center = (r: Room): Pt => ({ x: OX + r.cx * TILE + TILE / 2, y: OY + r.cy * TILE + TILE / 2 })
  const spawn = center(spawnRoom)
  let portalRoom = rooms[0]
  let best = -1
  for (const r of rooms) {
    if (r === spawnRoom) continue
    const d = Math.hypot(r.cx - spawnRoom.cx, r.cy - spawnRoom.cy)
    if (d > best) { best = d; portalRoom = r }
  }
  const portal = center(portalRoom)
  // 出生点与传送门周围清出平地
  for (const r of [spawnRoom, portalRoom]) {
    for (let y = r.cy - 1; y <= r.cy + 1; y++)
      for (let x = r.cx - 1; x <= r.cx + 1; x++)
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) tiles[y * COLS + x] = T_FLOOR
  }

  // 7. 合并实心碰撞盒（所有实心格都加入碰撞，防止卡入内部岩石）
  // 注意：以前只加边缘岩石，内部岩石无碰撞体但isSolidPixel会判定为实心，导致角色卡死
  const solidAt = (cx: number, cy: number) => {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false
    const t = tiles[cy * COLS + cx]
    return t === T_ROCK || t === T_PILLAR
  }
  const wallRects: LevelMap['wallRects'] = []
  for (let cy = 0; cy < ROWS; cy++) {
    let runStart = -1
    for (let cx = 0; cx <= COLS; cx++) {
      const solid = cx < COLS && solidAt(cx, cy)
      if (solid && runStart < 0) runStart = cx
      if (!solid && runStart >= 0) {
        wallRects.push({ x: OX + runStart * TILE, y: OY + cy * TILE, w: (cx - runStart) * TILE, h: TILE })
        runStart = -1
      }
    }
  }

  // 8. 生成装饰点
  const floorDecos = generateFloorDecos(tiles, rooms, rng, spawn, portal)
  const wallDecos = generateWallDecos(tiles, rooms, rng)

  return { tiles, rooms, spawn, portal, wallRects, floorDecos, wallDecos }
}

/** 黄龙山开放竞技场：长方形平地，无房间，仅边缘岩壁 + 少量石柱群 */
export function generateArena(rng: () => number): LevelMap {
  const tiles = new Uint8Array(COLS * ROWS)
  // 全部开凿为地面，外圈两格岩壁
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      tiles[cy * COLS + cx] = (cx < 2 || cy < 2 || cx >= COLS - 2 || cy >= ROWS - 2) ? T_ROCK : T_FLOOR
    }
  }
  // 零星石柱群（6~9 群，每群 2~4 根，作为走位掩体），避开顶部对战区与底部出生区
  const ri = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
  const clusters = ri(6, 9)
  for (let c = 0; c < clusters; c++) {
    const bx = ri(5, COLS - 6), by = ri(14, ROWS - 12)
    const n = ri(2, 4)
    for (let i = 0; i < n; i++) {
      const x = bx + ri(-1, 1), y = by + ri(-1, 1)
      tiles[y * COLS + x] = T_PILLAR
    }
  }
  const spawn: Pt = { x: OX + (COLS / 2) * TILE, y: OY + (ROWS - 6) * TILE }
  const portal: Pt = { x: OX + (COLS / 2) * TILE, y: OY + 5 * TILE }  // 未使用，占位

  const solidAt = (cx: number, cy: number) => {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false
    const t = tiles[cy * COLS + cx]
    return t === T_ROCK || t === T_PILLAR
  }
  const wallRects: LevelMap['wallRects'] = []
  for (let cy = 0; cy < ROWS; cy++) {
    let runStart = -1
    for (let cx = 0; cx <= COLS; cx++) {
      const solid = cx < COLS && solidAt(cx, cy)
      if (solid && runStart < 0) runStart = cx
      if (!solid && runStart >= 0) {
        wallRects.push({ x: OX + runStart * TILE, y: OY + cy * TILE, w: (cx - runStart) * TILE, h: TILE })
        runStart = -1
      }
    }
  }

  // 竞技场装饰
  const floorDecos: FloorDeco[] = []
  const wallDecos: WallDeco[] = []
  // 竞技场地面放一些碎石装饰
  for (let i = 0; i < 15; i++) {
    const cx = ri(4, COLS - 5)
    const cy = ri(8, ROWS - 10)
    if (tiles[cy * COLS + cx] !== T_FLOOR) continue
    const px = OX + cx * TILE + TILE / 2 + ri(-3, 3)
    const py = OY + cy * TILE + TILE / 2 + ri(-2, 2)
    if (Math.hypot(px - spawn.x, py - spawn.y) < 60) continue
    if (Math.hypot(px - portal.x, py - portal.y) < 60) continue
    floorDecos.push({ x: px, y: py, type: ri(1, 2), flipX: rng() < 0.5 })
  }

  return { tiles, rooms: [], spawn, portal, wallRects, floorDecos, wallDecos }
}
