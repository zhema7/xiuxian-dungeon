// ---------- 大地图兴趣点图标程序化生成器 ----------
// 生成 48×48 高质量像素风图标，替换旧的小尺寸 PNG

import Phaser from 'phaser'

const S = 48

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function shade(hex: number, delta: number): string {
  const r = Math.max(0, Math.min(255, ((hex >> 16) & 0xff) + delta))
  const g = Math.max(0, Math.min(255, ((hex >> 8) & 0xff) + delta))
  const b = Math.max(0, Math.min(255, (hex & 0xff) + delta))
  return `rgb(${r},${g},${b})`
}

function hexStr(hex: number): string { return `#${hex.toString(16).padStart(6, '0')}` }

// ---------- 洞府 ----------
function drawHome(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, S, S)
  const base = 0x6b5d4f, dark = 0x4a3f35, roof = 0x8b6f47, roofDark = 0x5a4a30
  // 山体背景
  px(ctx, 10, 30, 28, 10, shade(base, -15))
  px(ctx, 8, 32, 32, 8, shade(base, -25))
  // 洞口
  px(ctx, 18, 28, 12, 12, '#1a1a1a')
  px(ctx, 19, 29, 10, 10, '#0d0d0d')
  // 洞口光晕
  ctx.fillStyle = 'rgba(72,224,138,0.15)'
  ctx.beginPath(); ctx.arc(24, 34, 6, 0, Math.PI * 2); ctx.fill()
  // 屋顶（洞府门檐）
  px(ctx, 14, 26, 20, 3, hexStr(roof))
  px(ctx, 12, 28, 24, 2, hexStr(roofDark))
  // 两侧树木
  px(ctx, 6, 24, 3, 10, '#2a4a2a')
  px(ctx, 5, 22, 5, 4, '#3a6a3a')
  px(ctx, 7, 20, 3, 3, '#4a7a4a')
  px(ctx, 39, 24, 3, 10, '#2a4a2a')
  px(ctx, 38, 22, 5, 4, '#3a6a3a')
  px(ctx, 40, 20, 3, 3, '#4a7a4a')
  // 石阶
  px(ctx, 16, 40, 16, 2, shade(base, -30))
  px(ctx, 14, 42, 20, 2, shade(base, -40))
  // 灵气光点
  px(ctx, 24, 8, 1, 1, '#48e08a')
  px(ctx, 20, 12, 1, 1, '#48e08a')
  px(ctx, 28, 10, 1, 1, '#48e08a')
  px(ctx, 16, 16, 1, 1, '#5df0a0')
  px(ctx, 32, 14, 1, 1, '#5df0a0')
}

// ---------- 城市 ----------
function drawCity(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, S, S)
  const wall = 0x8a7a5a, wallDark = 0x5a4a35, roof = 0xc4953a, roofDark = 0x8a6520
  // 城墙基座
  px(ctx, 6, 28, 36, 14, hexStr(wallDark))
  px(ctx, 8, 26, 32, 16, hexStr(wall))
  // 城垛
  for (let i = 0; i < 5; i++) px(ctx, 10 + i * 7, 22, 4, 4, hexStr(wall))
  // 城门
  px(ctx, 20, 30, 8, 12, '#1a1a1a')
  px(ctx, 21, 31, 6, 11, '#0d0d0d')
  // 城门上方匾额
  px(ctx, 19, 26, 10, 3, hexStr(roof))
  px(ctx, 20, 27, 8, 1, hexStr(roofDark))
  // 中央高塔
  px(ctx, 21, 8, 6, 18, hexStr(wall))
  px(ctx, 20, 6, 8, 4, hexStr(roof))
  px(ctx, 19, 4, 10, 3, hexStr(roofDark))
  // 塔窗
  px(ctx, 23, 14, 2, 3, '#ffdd44')
  px(ctx, 23, 20, 2, 3, '#ffdd44')
  // 两侧旗帜
  px(ctx, 12, 16, 1, 8, '#5a3a1a')
  px(ctx, 13, 16, 4, 3, '#c0392b')
  px(ctx, 35, 16, 1, 8, '#5a3a1a')
  px(ctx, 31, 16, 4, 3, '#c0392b')
  // 地面阴影
  px(ctx, 4, 42, 40, 2, 'rgba(0,0,0,0.3)')
  px(ctx, 6, 44, 36, 1, 'rgba(0,0,0,0.2)')
}

// ---------- 秘境入口 ----------
function drawDungeon(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, S, S)
  const rock = 0x5a4a3a, rockDark = 0x3a2f25
  // 山体
  for (let y = 0; y < S; y++) {
    const halfW = y < 8 ? Math.floor((y + 1) * 1.2) : Math.floor(10 + Math.sin(y * 0.3) * 2)
    px(ctx, 24 - halfW, y, halfW * 2, 1, shade(rock, y < 12 ? -5 : 0))
  }
  // 山体暗面
  for (let y = 8; y < S; y++) {
    const halfW = Math.floor(10 + Math.sin(y * 0.3) * 2)
    px(ctx, 24, y, halfW, 1, hexStr(rockDark))
  }
  // 裂隙洞口
  px(ctx, 18, 18, 12, 24, '#0a0a0a')
  px(ctx, 19, 19, 10, 22, '#050505')
  // 洞口红光
  ctx.fillStyle = 'rgba(255,107,107,0.2)'
  ctx.beginPath(); ctx.ellipse(24, 30, 7, 12, 0, 0, Math.PI * 2); ctx.fill()
  // 红色眼眸
  px(ctx, 21, 26, 2, 2, '#ff4444')
  px(ctx, 25, 26, 2, 2, '#ff4444')
  px(ctx, 21, 26, 1, 1, '#ff8888')
  px(ctx, 25, 26, 1, 1, '#ff8888')
  // 苔藓
  px(ctx, 12, 20, 2, 1, '#3a5a2a')
  px(ctx, 34, 24, 2, 1, '#3a5a2a')
  px(ctx, 10, 30, 3, 1, '#2a4a2a')
  px(ctx, 36, 32, 3, 1, '#2a4a2a')
  // 顶部尖锐岩石
  px(ctx, 22, 2, 4, 6, hexStr(rock))
  px(ctx, 20, 4, 2, 4, shade(rock, -10))
  px(ctx, 26, 4, 2, 4, shade(rock, -10))
  // 地面阴影
  px(ctx, 8, 44, 32, 2, 'rgba(0,0,0,0.3)')
}

// ---------- 资源点 ----------
function drawResource(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, S, S)
  // 灵石结晶
  const gem = 0x5dade2, gemLight = 0x7dc8eb, gemDark = 0x3a8db8
  // 底部岩石
  px(ctx, 10, 36, 28, 8, '#4a4035')
  px(ctx, 12, 38, 24, 6, '#3a3530')
  // 主水晶
  ctx.fillStyle = hexStr(gem)
  ctx.beginPath()
  ctx.moveTo(24, 6); ctx.lineTo(36, 30); ctx.lineTo(24, 38); ctx.lineTo(12, 30)
  ctx.closePath(); ctx.fill()
  // 水晶暗面
  ctx.fillStyle = hexStr(gemDark)
  ctx.beginPath()
  ctx.moveTo(24, 6); ctx.lineTo(24, 38); ctx.lineTo(12, 30)
  ctx.closePath(); ctx.fill()
  // 水晶亮面
  ctx.fillStyle = hexStr(gemLight)
  ctx.beginPath()
  ctx.moveTo(24, 6); ctx.lineTo(20, 18); ctx.lineTo(24, 20)
  ctx.closePath(); ctx.fill()
  // 高光
  px(ctx, 23, 10, 1, 8, '#bdeaff')
  px(ctx, 22, 12, 1, 4, '#e0f4ff')
  // 小水晶
  ctx.fillStyle = hexStr(gem)
  ctx.beginPath()
  ctx.moveTo(8, 28); ctx.lineTo(13, 36); ctx.lineTo(3, 36)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = hexStr(gemDark)
  ctx.beginPath()
  ctx.moveTo(8, 28); ctx.lineTo(8, 36); ctx.lineTo(3, 36)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = hexStr(gem)
  ctx.beginPath()
  ctx.moveTo(40, 28); ctx.lineTo(45, 36); ctx.lineTo(35, 36)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = hexStr(gemLight)
  ctx.beginPath()
  ctx.moveTo(40, 28); ctx.lineTo(42, 32); ctx.lineTo(38, 32)
  ctx.closePath(); ctx.fill()
  // 灵气光点
  px(ctx, 24, 4, 1, 1, '#bdeaff')
  px(ctx, 18, 8, 1, 1, '#7dc8eb')
  px(ctx, 30, 6, 1, 1, '#7dc8eb')
  // 地面阴影
  px(ctx, 8, 44, 32, 2, 'rgba(0,0,0,0.3)')
}

// ---------- 传送阵 ----------
function drawTeleport(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, S, S)
  const rune = 0xbb8fce, runeBright = 0xd4a8e8, runeDark = 0x8a6ba0
  // 外圈法阵
  ctx.strokeStyle = hexStr(runeDark)
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(24, 24, 20, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = hexStr(rune)
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(24, 24, 18, 0, Math.PI * 2); ctx.stroke()
  // 六芒星
  ctx.strokeStyle = hexStr(runeBright)
  ctx.lineWidth = 1.5
  for (let i = 0; i < 6; i++) {
    const a1 = (i * Math.PI) / 3
    const a2 = a1 + Math.PI
    ctx.beginPath()
    ctx.moveTo(24 + Math.cos(a1) * 16, 24 + Math.sin(a1) * 16)
    ctx.lineTo(24 + Math.cos(a2) * 16, 24 + Math.sin(a2) * 16)
    ctx.stroke()
  }
  // 中心光球
  ctx.fillStyle = 'rgba(187,143,206,0.4)'
  ctx.beginPath(); ctx.arc(24, 24, 8, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = hexStr(runeBright)
  ctx.beginPath(); ctx.arc(24, 24, 4, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath(); ctx.arc(24, 24, 2, 0, Math.PI * 2); ctx.fill()
  // 四角符文点
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4
    const x = 24 + Math.cos(a) * 20
    const y = 24 + Math.sin(a) * 20
    px(ctx, Math.round(x) - 1, Math.round(y) - 1, 3, 3, hexStr(rune))
    px(ctx, Math.round(x), Math.round(y), 1, 1, hexStr(runeBright))
  }
  // 旋转光环（静态帧，动画在 WorldScene 中处理）
  ctx.strokeStyle = 'rgba(212,168,232,0.5)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(24, 24, 12, 0, Math.PI * 1.5); ctx.stroke()
}

// ---------- 地标 ----------
function drawLandmark(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, S, S)
  const stone = 0x8a8070, stoneDark = 0x5a5040, gold = 0xf0c987
  // 碑体
  px(ctx, 16, 8, 16, 34, hexStr(stone))
  px(ctx, 18, 6, 12, 4, hexStr(stoneDark))
  px(ctx, 14, 10, 2, 32, hexStr(stoneDark))
  px(ctx, 32, 10, 2, 32, hexStr(stoneDark))
  // 碑面刻纹
  px(ctx, 20, 14, 8, 1, hexStr(gold))
  px(ctx, 20, 14, 1, 8, hexStr(gold))
  px(ctx, 27, 14, 1, 8, hexStr(gold))
  // 符文中心
  px(ctx, 23, 18, 2, 2, '#ffdd66')
  px(ctx, 22, 22, 4, 1, hexStr(gold))
  px(ctx, 23, 26, 2, 2, '#ffdd66')
  // 底座
  px(ctx, 10, 40, 28, 4, hexStr(stoneDark))
  px(ctx, 8, 42, 32, 2, '#3a3530')
  // 灵气光点
  px(ctx, 24, 4, 1, 1, '#ffe0a0')
  px(ctx, 18, 8, 1, 1, '#f0c987')
  px(ctx, 30, 8, 1, 1, '#f0c987')
  // 地面阴影
  px(ctx, 6, 44, 36, 2, 'rgba(0,0,0,0.3)')
}

// ---------- 宗门山门 ----------
function drawSect(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, S, S)
  const pillar = 0x9a8a6a, pillarDark = 0x6a5a40, roof = 0xc0392b, roofDark = 0x8a2820, gold = 0xfbbf24
  // 屋顶（中式飞檐）
  ctx.fillStyle = hexStr(roof)
  ctx.beginPath()
  ctx.moveTo(6, 18); ctx.lineTo(24, 6); ctx.lineTo(42, 18); ctx.lineTo(38, 20); ctx.lineTo(24, 10); ctx.lineTo(10, 20)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = hexStr(roofDark)
  ctx.beginPath()
  ctx.moveTo(6, 18); ctx.lineTo(10, 20); ctx.lineTo(24, 10); ctx.lineTo(24, 6)
  ctx.closePath(); ctx.fill()
  // 飞檐翘角
  px(ctx, 4, 17, 3, 2, hexStr(roof))
  px(ctx, 41, 17, 3, 2, hexStr(roof))
  // 匾额
  px(ctx, 16, 20, 16, 5, hexStr(gold))
  px(ctx, 17, 21, 14, 3, '#d4a020')
  px(ctx, 22, 21, 4, 3, '#8a6010')
  // 左柱
  px(ctx, 10, 25, 5, 17, hexStr(pillar))
  px(ctx, 10, 25, 1, 17, hexStr(pillarDark))
  px(ctx, 14, 25, 1, 17, shade(pillar, -15))
  // 右柱
  px(ctx, 33, 25, 5, 17, hexStr(pillar))
  px(ctx, 33, 25, 1, 17, hexStr(pillarDark))
  px(ctx, 37, 25, 1, 17, shade(pillar, -15))
  // 门洞
  px(ctx, 16, 28, 16, 14, '#1a1a1a')
  px(ctx, 17, 29, 14, 12, '#0a0a0a')
  // 门内光晕
  ctx.fillStyle = 'rgba(251,191,36,0.12)'
  ctx.beginPath(); ctx.arc(24, 36, 5, 0, Math.PI * 2); ctx.fill()
  // 台阶
  px(ctx, 8, 42, 32, 2, hexStr(pillarDark))
  px(ctx, 6, 44, 36, 2, '#3a3025')
  // 灯笼
  px(ctx, 8, 22, 3, 4, '#c0392b')
  px(ctx, 8, 21, 3, 1, '#5a3a1a')
  px(ctx, 37, 22, 3, 4, '#c0392b')
  px(ctx, 37, 21, 3, 1, '#5a3a1a')
  px(ctx, 9, 24, 1, 1, '#ffdd44')
  px(ctx, 38, 24, 1, 1, '#ffdd44')
}

// ---------- 域门 ----------
function drawDomainGate(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, S, S)
  const blue = 0x60a5fa, blueBright = 0x93c5fd, blueDark = 0x3b6fd6
  // 外圈
  ctx.strokeStyle = hexStr(blueDark)
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(24, 24, 20, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = hexStr(blue)
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(24, 24, 17, 0, Math.PI * 2); ctx.stroke()
  // 六个符文节点
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2
    const x = 24 + Math.cos(a) * 17
    const y = 24 + Math.sin(a) * 17
    ctx.fillStyle = hexStr(blue)
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = hexStr(blueBright)
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill()
  }
  // 中心漩涡
  ctx.fillStyle = 'rgba(96,165,250,0.3)'
  ctx.beginPath(); ctx.arc(24, 24, 10, 0, Math.PI * 2); ctx.fill()
  // 螺旋纹
  ctx.strokeStyle = hexStr(blueBright)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let t = 0; t < Math.PI * 4; t += 0.1) {
    const r = t * 1.2
    const x = 24 + Math.cos(t) * r
    const y = 24 + Math.sin(t) * r
    if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke()
  // 中心亮点
  ctx.fillStyle = '#ffffff'
  ctx.beginPath(); ctx.arc(24, 24, 2, 0, Math.PI * 2); ctx.fill()
  // 外圈光点
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6
    const x = 24 + Math.cos(a) * 20
    const y = 24 + Math.sin(a) * 20
    px(ctx, Math.round(x), Math.round(y), 1, 1, hexStr(blueBright))
  }
}

// ---------- 主生成函数 ----------

const DRAWERS: Record<string, (ctx: CanvasRenderingContext2D) => void> = {
  home: drawHome,
  city: drawCity,
  dungeon: drawDungeon,
  resource: drawResource,
  teleport: drawTeleport,
  landmark: drawLandmark,
  sect: drawSect,
  domain_gate: drawDomainGate,
}

export function generateWorldIcons(scene: Phaser.Scene): void {
  for (const [type, draw] of Object.entries(DRAWERS)) {
    const key = `world_icon_v2_${type}`
    if (scene.textures.exists(key)) continue
    const canvas = scene.textures.createCanvas(key, S, S)
    if (!canvas) continue
    const ctx = canvas.getContext()
    ctx.imageSmoothingEnabled = false
    draw(ctx)
    canvas.refresh()
  }
}

/** 获取兴趣点图标纹理 key（优先使用程序化生成的 v2 版本） */
export function getWorldIconKey(type: string): string {
  return `world_icon_v2_${type}`
}

