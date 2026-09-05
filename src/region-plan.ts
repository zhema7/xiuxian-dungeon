// 大地图区域规划系统：每域定义 10-12 个特征区域
// 使用 Voronoi 分区 + 边界平滑混合，确保全图无死角覆盖、无重复
import type { DomainId } from './world-map'

export interface RegionDef {
  name: string
  cx: number           // 区域中心 X（世界坐标）
  cy: number           // 区域中心 Y
  rx: number           // X 影响半径
  ry: number           // Y 影响半径
  baseH: number        // 基座高度
  ampH: number         // 噪声振幅
  colors: {            // 区域地形配色
    water: number; sand: number; grass: number; forest: number; rock: number; snow: number
  }
  veg: string[]        // 该区域主要植被类型
  density: number      // 植被密度（0-1）
}

// ============================================================
// 南域·青冥域 1200×1700：12 个区域，Voronoi 全覆盖
// 从北到南依次：山脉→灵药谷→竹林海→碧波湖→荒原→洞府群→余脉
// ============================================================
const SOUTH_REGIONS: RegionDef[] = [
  {
    name: '青冥山脉', cx: 200, cy: 150, rx: 220, ry: 180,
    baseH: 75, ampH: 20,
    colors: { water: 0x1a3a4a, sand: 0x5a6a6a, grass: 0x2a4a3a, forest: 0x1a3a2a, rock: 0x4a4a44, snow: 0x9aa0a8 },
    veg: ['pine', 'pine', 'rock_l', 'rock_m', 'dead_tree'],
    density: 0.65,
  },
  {
    name: '灵药谷', cx: 600, cy: 120, rx: 280, ry: 150,
    baseH: 18, ampH: 8,
    colors: { water: 0x2a5a6a, sand: 0x8a7a4a, grass: 0x5a8a3a, forest: 0x3a6a2a, rock: 0x5a5a4a, snow: 0x9ab4a4 },
    veg: ['flower_r', 'flower_y', 'flower_b', 'mushroom', 'grass_1', 'bush_s'],
    density: 0.85,
  },
  {
    name: '落霞坪', cx: 1000, cy: 180, rx: 250, ry: 200,
    baseH: 28, ampH: 10,
    colors: { water: 0x2a4a6a, sand: 0x7a6a5a, grass: 0x4a6a3a, forest: 0x3a5a2a, rock: 0x5a5a4a, snow: 0x8a9aa4 },
    veg: ['round_tree', 'flower_r', 'bush_s', 'grass_1', 'pine'],
    density: 0.7,
  },
  {
    name: '碧波湖', cx: 980, cy: 500, rx: 180, ry: 140,
    baseH: -6, ampH: 3,
    colors: { water: 0x2a6a8a, sand: 0x8a7a5a, grass: 0x4a7a4a, forest: 0x3a6a3a, rock: 0x5a6a5a, snow: 0x8ab4a4 },
    veg: ['lotus_pond', 'willow', 'grass_1', 'rock_s'],
    density: 0.6,
  },
  {
    name: '青云径', cx: 150, cy: 500, rx: 200, ry: 280,
    baseH: 20, ampH: 8,
    colors: { water: 0x2a5a7a, sand: 0x7a6a4a, grass: 0x4a7a2a, forest: 0x3a5a1a, rock: 0x5a5a4a, snow: 0x8ab4a4 },
    veg: ['grass_1', 'grass_2', 'bush_s', 'round_tree', 'rock_s'],
    density: 0.55,
  },
  {
    name: '翠竹林海', cx: 550, cy: 650, rx: 320, ry: 280,
    baseH: 25, ampH: 10,
    colors: { water: 0x2a5a7a, sand: 0x6a5a3a, grass: 0x3a7a2a, forest: 0x1a5a1a, rock: 0x4a5a3a, snow: 0x8ab4a4 },
    veg: ['bamboo', 'bamboo', 'bamboo', 'willow', 'bush_s', 'grass_1'],
    density: 0.92,
  },
  {
    name: '归鹤泽', cx: 200, cy: 1000, rx: 200, ry: 220,
    baseH: 5, ampH: 6,
    colors: { water: 0x2a5a5a, sand: 0x6a6a4a, grass: 0x4a6a3a, forest: 0x2a4a2a, rock: 0x5a5a4a, snow: 0x8ab4a4 },
    veg: ['willow', 'lotus_pond', 'grass_1', 'mushroom', 'bush_s'],
    density: 0.7,
  },
  {
    name: '暮色荒原', cx: 550, cy: 1050, rx: 280, ry: 200,
    baseH: 22, ampH: 12,
    colors: { water: 0x2a4a5a, sand: 0x7a6a4a, grass: 0x5a5a3a, forest: 0x3a3a2a, rock: 0x6a5a3a, snow: 0x9ab49a },
    veg: ['dead_tree', 'rock_m', 'rock_l', 'grass_2', 'bush_l'],
    density: 0.4,
  },
  {
    name: '青冥河岸', cx: 950, cy: 850, rx: 150, ry: 250,
    baseH: 12, ampH: 6,
    colors: { water: 0x2a6a8a, sand: 0x8a8a5a, grass: 0x4a7a3a, forest: 0x3a5a2a, rock: 0x5a6a4a, snow: 0x8ab4a4 },
    veg: ['willow', 'bamboo', 'grass_1', 'rock_s', 'bush_s'],
    density: 0.75,
  },
  {
    name: '洞府群落', cx: 400, cy: 1450, rx: 280, ry: 200,
    baseH: 25, ampH: 8,
    colors: { water: 0x2a5a7a, sand: 0x6a5a3a, grass: 0x4a6a3a, forest: 0x3a5a2a, rock: 0x5a5a4a, snow: 0x8ab4a4 },
    veg: ['pine', 'round_tree', 'lantern_post', 'pagoda', 'bush_s', 'grass_1'],
    density: 0.68,
  },
  {
    name: '南境枫林', cx: 750, cy: 1450, rx: 250, ry: 200,
    baseH: 20, ampH: 8,
    colors: { water: 0x2a5a6a, sand: 0x7a5a4a, grass: 0x5a6a3a, forest: 0x4a3a2a, rock: 0x5a5a4a, snow: 0x8ab4a4 },
    veg: ['round_tree', 'round_tree', 'flower_r', 'bush_s', 'grass_1', 'lantern_post'],
    density: 0.72,
  },
  {
    name: '青冥余脉', cx: 1050, cy: 1400, rx: 200, ry: 250,
    baseH: 58, ampH: 18,
    colors: { water: 0x1a3a5a, sand: 0x6a7a7a, grass: 0x3a5a3a, forest: 0x2a4a2a, rock: 0x4a4a44, snow: 0x8a9aa8 },
    veg: ['pine', 'rock_l', 'rock_m', 'dead_tree'],
    density: 0.55,
  },
]

// ============================================================
// 中域·天枢域 1200×1700：10 个区域，Voronoi 全覆盖
// ============================================================
const CENTRAL_REGIONS: RegionDef[] = [
  {
    name: '北方松林', cx: 300, cy: 200, rx: 280, ry: 220,
    baseH: 38, ampH: 15,
    colors: { water: 0x1a4a6a, sand: 0x6a7a5a, grass: 0x3a5a2a, forest: 0x1a4a1a, rock: 0x4a5a4a, snow: 0x8ab4a4 },
    veg: ['pine', 'pine', 'round_tree', 'rock_m', 'mushroom'],
    density: 0.85,
  },
  {
    name: '东方梅园', cx: 900, cy: 200, rx: 280, ry: 220,
    baseH: 22, ampH: 10,
    colors: { water: 0x2a5a7a, sand: 0x7a6a5a, grass: 0x5a5a4a, forest: 0x4a3a2a, rock: 0x6a6a5a, snow: 0x9ab4a4 },
    veg: ['flower_r', 'flower_b', 'round_tree', 'lantern_post', 'bush_s'],
    density: 0.8,
  },
  {
    name: '西方丘陵', cx: 150, cy: 600, rx: 200, ry: 280,
    baseH: 30, ampH: 12,
    colors: { water: 0x2a4a6a, sand: 0x7a7a5a, grass: 0x4a6a3a, forest: 0x3a4a2a, rock: 0x5a5a4a, snow: 0x8a9aa4 },
    veg: ['round_tree', 'bush_s', 'rock_m', 'grass_1', 'flower_y'],
    density: 0.65,
  },
  {
    name: '天枢城', cx: 600, cy: 750, rx: 250, ry: 200,
    baseH: 15, ampH: 5,
    colors: { water: 0x2a5a7a, sand: 0x8a8a7a, grass: 0x5a6a4a, forest: 0x4a5a3a, rock: 0x6a7a6a, snow: 0xaab4b4 },
    veg: ['lantern_post', 'pagoda', 'bush_s', 'grass_1', 'flower_r', 'spirit_gate'],
    density: 0.75,
  },
  {
    name: '东方稻田', cx: 1000, cy: 650, rx: 200, ry: 250,
    baseH: 12, ampH: 4,
    colors: { water: 0x2a5a7a, sand: 0x8a8a5a, grass: 0x6a8a3a, forest: 0x4a6a2a, rock: 0x5a6a4a, snow: 0x9ab4a4 },
    veg: ['grass_1', 'grass_2', 'bush_s', 'flower_y', 'mushroom'],
    density: 0.7,
  },
  {
    name: '中央灵脉', cx: 600, cy: 750, rx: 60, ry: 50,
    baseH: 30, ampH: 6,
    colors: { water: 0x2a5a7a, sand: 0x8a8a7a, grass: 0x5a6a4a, forest: 0x4a5a3a, rock: 0x6a7a6a, snow: 0xaab4b4 },
    veg: ['crystal', 'spirit_gate', 'pagoda', 'lantern_post'],
    density: 0.5,
  },
  {
    name: '西南石林', cx: 200, cy: 1200, rx: 220, ry: 220,
    baseH: 42, ampH: 18,
    colors: { water: 0x1a4a5a, sand: 0x6a6a5a, grass: 0x4a5a4a, forest: 0x3a4a3a, rock: 0x5a6a5a, snow: 0x8a9aa4 },
    veg: ['rock_l', 'rock_m', 'dead_tree', 'pine'],
    density: 0.55,
  },
  {
    name: '南方灵田', cx: 600, cy: 1300, rx: 280, ry: 200,
    baseH: 16, ampH: 6,
    colors: { water: 0x2a5a7a, sand: 0x8a7a5a, grass: 0x6a8a3a, forest: 0x4a6a2a, rock: 0x5a6a4a, snow: 0x9ab4a4 },
    veg: ['grass_1', 'grass_2', 'bush_s', 'flower_y', 'mushroom'],
    density: 0.7,
  },
  {
    name: '东南竹林', cx: 1000, cy: 1200, rx: 220, ry: 220,
    baseH: 24, ampH: 10,
    colors: { water: 0x2a6a7a, sand: 0x7a6a4a, grass: 0x3a7a2a, forest: 0x2a5a1a, rock: 0x4a6a4a, snow: 0x8ab4a4 },
    veg: ['bamboo', 'bamboo', 'willow', 'bush_s', 'mushroom'],
    density: 0.85,
  },
  {
    name: '南境松原', cx: 600, cy: 1600, rx: 350, ry: 150,
    baseH: 30, ampH: 12,
    colors: { water: 0x1a4a6a, sand: 0x6a7a5a, grass: 0x3a5a2a, forest: 0x1a4a1a, rock: 0x4a5a4a, snow: 0x8ab4a4 },
    veg: ['pine', 'pine', 'round_tree', 'rock_m', 'grass_1'],
    density: 0.8,
  },
]

// ============================================================
// 东域·沧澜域 1200×1700：10 个区域，Voronoi 全覆盖
// ============================================================
const EAST_REGIONS: RegionDef[] = [
  {
    name: '蓬莱岛', cx: 850, cy: 250, rx: 150, ry: 150,
    baseH: 28, ampH: 12,
    colors: { water: 0x2a6a9a, sand: 0x8a8a5a, grass: 0x4a7a3a, forest: 0x2a6a2a, rock: 0x5a7a6a, snow: 0x8ac4e4 },
    veg: ['palm', 'palm', 'bamboo', 'lotus_pond', 'flower_r'],
    density: 0.85,
  },
  {
    name: '北域海', cx: 400, cy: 200, rx: 300, ry: 220,
    baseH: -8, ampH: 3,
    colors: { water: 0x1a5a8a, sand: 0x8a9a6a, grass: 0x3a7a5a, forest: 0x2a6a4a, rock: 0x4a7a6a, snow: 0x8ac4e4 },
    veg: ['coral', 'rock_s'],
    density: 0.25,
  },
  {
    name: '西岸椰林', cx: 200, cy: 550, rx: 200, ry: 280,
    baseH: 18, ampH: 8,
    colors: { water: 0x2a6a8a, sand: 0x8a8a4a, grass: 0x4a8a3a, forest: 0x2a6a2a, rock: 0x5a7a5a, snow: 0x8ac4e4 },
    veg: ['palm', 'palm', 'bamboo', 'lotus_pond', 'grass_1', 'rock_s'],
    density: 0.85,
  },
  {
    name: '珊瑚礁群', cx: 700, cy: 550, rx: 200, ry: 200,
    baseH: -4, ampH: 3,
    colors: { water: 0x2a7a9a, sand: 0x8a9a7a, grass: 0x4a8a5a, forest: 0x2a7a4a, rock: 0x5a8a6a, snow: 0x8ac4e4 },
    veg: ['coral', 'coral', 'coral', 'rock_s'],
    density: 0.65,
  },
  {
    name: '沧澜深海', cx: 1050, cy: 600, rx: 200, ry: 300,
    baseH: -12, ampH: 4,
    colors: { water: 0x1a4a7a, sand: 0x6a7a6a, grass: 0x3a6a4a, forest: 0x1a5a3a, rock: 0x4a6a5a, snow: 0x8ac4e4 },
    veg: ['coral', 'rock_s'],
    density: 0.15,
  },
  {
    name: '西岸竹林', cx: 200, cy: 1100, rx: 200, ry: 280,
    baseH: 24, ampH: 10,
    colors: { water: 0x2a6a7a, sand: 0x7a6a4a, grass: 0x3a7a2a, forest: 0x1a5a1a, rock: 0x4a6a4a, snow: 0x8ac4e4 },
    veg: ['bamboo', 'bamboo', 'willow', 'bush_s', 'mushroom'],
    density: 0.85,
  },
  {
    name: '瀛洲岛', cx: 900, cy: 1050, rx: 130, ry: 130,
    baseH: 22, ampH: 10,
    colors: { water: 0x2a6a9a, sand: 0x8a7a5a, grass: 0x4a6a3a, forest: 0x2a5a2a, rock: 0x5a6a5a, snow: 0x8ac4e4 },
    veg: ['palm', 'willow', 'bush_s', 'grass_1', 'bamboo'],
    density: 0.78,
  },
  {
    name: '南海湾', cx: 550, cy: 1300, rx: 300, ry: 250,
    baseH: -6, ampH: 3,
    colors: { water: 0x2a6a8a, sand: 0x8a9a6a, grass: 0x4a7a5a, forest: 0x2a6a4a, rock: 0x5a7a6a, snow: 0x8ac4e4 },
    veg: ['coral', 'rock_s', 'palm'],
    density: 0.3,
  },
  {
    name: '南岸椰林', cx: 200, cy: 1550, rx: 220, ry: 180,
    baseH: 16, ampH: 8,
    colors: { water: 0x2a6a8a, sand: 0x8a8a4a, grass: 0x4a8a3a, forest: 0x2a6a2a, rock: 0x5a7a5a, snow: 0x8ac4e4 },
    veg: ['palm', 'palm', 'bamboo', 'lotus_pond', 'grass_1'],
    density: 0.82,
  },
  {
    name: '东海深渊', cx: 1000, cy: 1550, rx: 250, ry: 200,
    baseH: -14, ampH: 5,
    colors: { water: 0x1a3a6a, sand: 0x5a6a5a, grass: 0x3a5a4a, forest: 0x1a3a2a, rock: 0x4a5a5a, snow: 0x8ac4e4 },
    veg: ['coral', 'rock_s'],
    density: 0.1,
  },
]

// ============================================================
// 西域·大漠域 1200×1700：10 个区域，Voronoi 全覆盖
// ============================================================
const WEST_REGIONS: RegionDef[] = [
  {
    name: '古战场', cx: 500, cy: 200, rx: 280, ry: 200,
    baseH: 18, ampH: 10,
    colors: { water: 0x2a4a5a, sand: 0x8a6a3a, grass: 0x6a5a2a, forest: 0x4a3a1a, rock: 0x7a6a4a, snow: 0xbab4a4 },
    veg: ['war_monument', 'wreck', 'wreck', 'dead_tree', 'rock_l'],
    density: 0.45,
  },
  {
    name: '风蚀岩柱群', cx: 150, cy: 400, rx: 180, ry: 250,
    baseH: 48, ampH: 22,
    colors: { water: 0x1a4a5a, sand: 0x9a8a4a, grass: 0x7a6a3a, forest: 0x5a4a2a, rock: 0x8a7a4a, snow: 0xbab4a4 },
    veg: ['rock_pillar', 'rock_l', 'rock_m', 'dead_tree', 'cactus'],
    density: 0.6,
  },
  {
    name: '北境荒山', cx: 900, cy: 350, rx: 250, ry: 250,
    baseH: 52, ampH: 20,
    colors: { water: 0x1a4a5a, sand: 0x8a7a4a, grass: 0x6a5a3a, forest: 0x5a4a2a, rock: 0x7a6a4a, snow: 0xbab4a4 },
    veg: ['rock_l', 'rock_pillar', 'dead_tree', 'cactus'],
    density: 0.4,
  },
  {
    name: '烽火台', cx: 350, cy: 700, rx: 150, ry: 180,
    baseH: 25, ampH: 8,
    colors: { water: 0x2a4a5a, sand: 0x9a7a4a, grass: 0x6a5a2a, forest: 0x4a4a1a, rock: 0x7a6a4a, snow: 0xbab4a4 },
    veg: ['beacon', 'rock_m', 'cactus', 'dead_tree'],
    density: 0.4,
  },
  {
    name: '大漠中央', cx: 700, cy: 750, rx: 300, ry: 300,
    baseH: 14, ampH: 8,
    colors: { water: 0x2a5a6a, sand: 0xca9a4a, grass: 0x9a8a3a, forest: 0x6a5a2a, rock: 0x8a7a4a, snow: 0xcab4a4 },
    veg: ['cactus', 'cactus', 'wreck', 'rock_m', 'grass_2', 'sand_dune'],
    density: 0.35,
  },
  {
    name: '南境荒山', cx: 150, cy: 1100, rx: 200, ry: 250,
    baseH: 48, ampH: 20,
    colors: { water: 0x1a4a5a, sand: 0x8a7a4a, grass: 0x6a5a3a, forest: 0x5a4a2a, rock: 0x7a6a4a, snow: 0xbab4a4 },
    veg: ['rock_l', 'rock_pillar', 'dead_tree', 'cactus'],
    density: 0.4,
  },
  {
    name: '绿洲', cx: 900, cy: 1100, rx: 130, ry: 130,
    baseH: 8, ampH: 5,
    colors: { water: 0x2a7a5a, sand: 0x8a8a4a, grass: 0x4a8a3a, forest: 0x2a6a2a, rock: 0x5a7a4a, snow: 0xcab4a4 },
    veg: ['palm', 'willow', 'lotus_pond', 'bush_s', 'grass_1'],
    density: 0.88,
  },
  {
    name: '西域沙海', cx: 500, cy: 1300, rx: 300, ry: 200,
    baseH: 10, ampH: 10,
    colors: { water: 0x2a5a6a, sand: 0xdaaa5a, grass: 0x9a8a3a, forest: 0x6a5a2a, rock: 0x8a7a4a, snow: 0xcab4a4 },
    veg: ['sand_dune', 'cactus', 'rock_s', 'grass_2', 'wreck'],
    density: 0.3,
  },
  {
    name: '南境沙丘', cx: 200, cy: 1550, rx: 250, ry: 180,
    baseH: 8, ampH: 12,
    colors: { water: 0x2a5a6a, sand: 0xdaaa5a, grass: 0x9a8a3a, forest: 0x6a5a2a, rock: 0x8a7a4a, snow: 0xcab4a4 },
    veg: ['sand_dune', 'cactus', 'rock_s', 'grass_2'],
    density: 0.3,
  },
  {
    name: '绿洲南域', cx: 950, cy: 1550, rx: 200, ry: 180,
    baseH: 12, ampH: 6,
    colors: { water: 0x2a7a5a, sand: 0x8a8a4a, grass: 0x4a7a3a, forest: 0x2a5a2a, rock: 0x5a7a4a, snow: 0xcab4a4 },
    veg: ['palm', 'bush_s', 'grass_1', 'cactus'],
    density: 0.55,
  },
]

// ============================================================
// 北域·玄冰域 1200×1700：10 个区域，Voronoi 全覆盖
// ============================================================
const NORTH_REGIONS: RegionDef[] = [
  {
    name: '北境冰墙', cx: 600, cy: 80, rx: 600, ry: 120,
    baseH: 68, ampH: 15,
    colors: { water: 0x3a6a8a, sand: 0x8aaac4, grass: 0xaac4d4, forest: 0x9ab4c4, rock: 0x6a8a9a, snow: 0xe8f4ff },
    veg: ['ice_wall', 'ice_crystal', 'snow_patch'],
    density: 0.5,
  },
  {
    name: '西方雪原', cx: 200, cy: 450, rx: 250, ry: 280,
    baseH: 20, ampH: 8,
    colors: { water: 0x4a7a9a, sand: 0x9ab4c4, grass: 0xb4d4e4, forest: 0x9ac4d4, rock: 0x7a9aaa, snow: 0xe8f4ff },
    veg: ['snow_patch', 'ice_crystal', 'dead_tree', 'rock_m'],
    density: 0.35,
  },
  {
    name: '东方雪原', cx: 1000, cy: 450, rx: 250, ry: 280,
    baseH: 22, ampH: 8,
    colors: { water: 0x4a7a9a, sand: 0x9ac4e4, grass: 0xb4d4e4, forest: 0xaac4d4, rock: 0x7a9aaa, snow: 0xe8f4ff },
    veg: ['snow_patch', 'ice_crystal', 'frozen_beast', 'dead_tree'],
    density: 0.4,
  },
  {
    name: '南方冻土', cx: 500, cy: 450, rx: 250, ry: 200,
    baseH: 18, ampH: 8,
    colors: { water: 0x4a7a9a, sand: 0xaac4d4, grass: 0xb4c4d4, forest: 0x9ab4c4, rock: 0x7a8a9a, snow: 0xd4e8f4 },
    veg: ['frozen_beast', 'frozen_beast', 'dead_tree', 'ice_crystal'],
    density: 0.5,
  },
  {
    name: '冰河谷', cx: 600, cy: 820, rx: 500, ry: 50,
    baseH: -8, ampH: 3,
    colors: { water: 0x5a8aba, sand: 0xaac4e4, grass: 0xb4d4e4, forest: 0xaac4d4, rock: 0x8aaaba, snow: 0xe8f4ff },
    veg: ['ice_crystal', 'snow_patch', 'rock_s'],
    density: 0.2,
  },
  {
    name: '西方冻原', cx: 200, cy: 1000, rx: 220, ry: 250,
    baseH: 24, ampH: 10,
    colors: { water: 0x4a7a9a, sand: 0x9ab4c4, grass: 0xaac4d4, forest: 0x8aaab4, rock: 0x6a8a9a, snow: 0xd4e8f4 },
    veg: ['dead_tree', 'rock_l', 'snow_patch', 'frozen_beast'],
    density: 0.4,
  },
  {
    name: '东方冰晶林', cx: 1000, cy: 1000, rx: 220, ry: 250,
    baseH: 30, ampH: 12,
    colors: { water: 0x4a7a9a, sand: 0x9ac4e4, grass: 0xb4d4e4, forest: 0x9ad4e4, rock: 0x7a9aaa, snow: 0xe8f4ff },
    veg: ['ice_crystal', 'ice_crystal', 'frozen_beast', 'snow_patch'],
    density: 0.65,
  },
  {
    name: '玄冰原', cx: 500, cy: 1000, rx: 250, ry: 200,
    baseH: 16, ampH: 6,
    colors: { water: 0x4a7a9a, sand: 0xaac4d4, grass: 0xb4d4e4, forest: 0x9ac4d4, rock: 0x7a9aaa, snow: 0xe8f4ff },
    veg: ['snow_patch', 'ice_crystal', 'dead_tree', 'frozen_beast'],
    density: 0.35,
  },
  {
    name: '中央冻湖', cx: 500, cy: 1350, rx: 200, ry: 150,
    baseH: -3, ampH: 2,
    colors: { water: 0x3a6a9a, sand: 0xb4d4e4, grass: 0xc4e4f4, forest: 0xaac4d4, rock: 0x8aaaba, snow: 0xe8f4ff },
    veg: ['ice_crystal', 'snow_patch'],
    density: 0.25,
  },
  {
    name: '南境冰原', cx: 900, cy: 1500, rx: 300, ry: 200,
    baseH: 20, ampH: 8,
    colors: { water: 0x4a7a9a, sand: 0x9ab4c4, grass: 0xb4d4e4, forest: 0x9ac4d4, rock: 0x7a9aaa, snow: 0xe8f4ff },
    veg: ['snow_patch', 'ice_crystal', 'frozen_beast', 'dead_tree'],
    density: 0.4,
  },
]

export const REGION_PLANS: Record<DomainId, RegionDef[]> = {
  south: SOUTH_REGIONS,
  central: CENTRAL_REGIONS,
  east: EAST_REGIONS,
  west: WEST_REGIONS,
  north: NORTH_REGIONS,
}

// ============================================================
// Voronoi 分区：每个点属于最近的 1-3 个区域，确保全图无死角
// 使用归一化椭圆距离找最近区域，边界处平滑混合
// ============================================================
export function getRegionWeights(x: number, y: number, domain: DomainId): { region: RegionDef; w: number }[] {
  const regions = REGION_PLANS[domain] ?? SOUTH_REGIONS
  // 计算到所有区域的归一化距离
  const dists = regions.map(r => {
    const dx = (x - r.cx) / r.rx
    const dy = (y - r.cy) / r.ry
    return { region: r, d2: dx * dx + dy * dy }
  })
  // 按距离排序
  dists.sort((a, b) => a.d2 - b.d2)

  // 取最近 3 个区域
  const near = dists.slice(0, 3)
  // 计算权重：距离越近权重越大，使用反距离加权
  let totalW = 0
  const weights: { region: RegionDef; w: number }[] = []
  for (const { region, d2 } of near) {
    // 防止除零
    const d = Math.sqrt(d2) + 0.01
    // 反距离加权，幂次 3.0 让最近区域占绝对主导
    const w = 1 / Math.pow(d, 3.0)
    weights.push({ region, w })
    totalW += w
  }
  // 归一化
  if (totalW > 0) {
    for (const item of weights) item.w /= totalW
  }
  return weights
}

// 混合区域高度
export function blendRegionHeight(x: number, z: number, domain: DomainId, noiseFn: (x: number, z: number) => number): number {
  const weights = getRegionWeights(x, z, domain)
  let h = 0
  for (const { region, w } of weights) {
    h += (region.baseH + noiseFn(x, z) * region.ampH) * w
  }
  return h
}

// 混合区域颜色
export function blendRegionColor(x: number, z: number, h: number, domain: DomainId): [number, number, number] {
  const weights = getRegionWeights(x, z, domain)
  const toRGB = (c: number): [number, number, number] => [(c >> 16 & 0xff) / 255, (c >> 8 & 0xff) / 255, (c & 0xff) / 255]
  let r = 0, g = 0, b = 0
  for (const { region, w } of weights) {
    const pal = region.colors
    let col: [number, number, number]
    if (h < 0) col = toRGB(pal.water)
    else if (h < 8) col = toRGB(pal.sand)
    else if (h < 25) col = toRGB(pal.grass)
    else if (h < 55) col = toRGB(pal.forest)
    else if (h < 90) col = toRGB(pal.rock)
    else col = toRGB(pal.snow)
    r += col[0] * w
    g += col[1] * w
    b += col[2] * w
  }
  return [r, g, b]
}

// 获取某点主要区域的植被类型（基于坐标哈希，确保同位置返回同类型）
export function getRegionVegType(x: number, y: number, domain: DomainId): string | null {
  const weights = getRegionWeights(x, y, domain)
  if (weights.length === 0) return null
  // 找权重最大的区域
  let best = weights[0]
  for (const item of weights) {
    if (item.w > best.w) best = item
  }
  const vegList = best.region.veg
  // 使用坐标哈希选择植被类型，确保同位置返回同类型但不同位置有变化
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0
  return vegList[h % vegList.length]
}

// 获取某点主要区域的植被密度
export function getRegionDensity(x: number, y: number, domain: DomainId): number {
  const weights = getRegionWeights(x, y, domain)
  if (weights.length === 0) return 0.4
  let d = 0
  for (const { region, w } of weights) {
    d += region.density * w
  }
  return d
}

// 获取区域规划列表
export function getRegionPlan(domain: DomainId): RegionDef[] {
  return REGION_PLANS[domain] ?? SOUTH_REGIONS
}
