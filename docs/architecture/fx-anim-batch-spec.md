# 批量特效序列帧接入规格（Tier1+2 五套）

- 承接文档：`docs/architecture/anim-integration-spec.md`（slash / sword_proj 的 stage0 骨架，本文件**完全沿用其模式**）
- 本文件性质：**工程接入架构 spec（只写文档，不改源码）**。源码实现待用户交付 PNG 后按 §5 执行。
- 环境基线：Phaser 3.90 + Vite 5.4 + TS；`BootScene` 已有 `FX_ANIMS` 数组 + `fxFramesReady(key, frames)` 守卫 + 逐条 `!anims.exists` 守卫；`DungeonScene` 调用点已有 `anims.exists` 分支模式（见 `slashFx` L939、`destroySwordProj` L930、`spawnPlayerProj` L1078）。
- 关联美术包：art-director 的 v3 特效包（帧数/画布/配色需按 §6 对齐）
- 范围：**Tier1 + Tier2 五套** = `fx_ring` / `fx_splash` / `fx_spark` / `bolt_fly` / `proj_fly`
- 排除：`fx_firevortex`（暴走火焰漩涡 `fireVortexFx` L565–571，带 `angle: 540` 旋转补间）属 Tier3，**本轮暂缓**，继续走现有 `slash` 贴图旋转补间。

---

## 0. TL;DR

1. **5 个动画 key**：`fx_ring`(8帧,once) / `fx_splash`(8帧,once) / `fx_spark`(6帧,once) / `bolt_fly`(8帧,loop) / `proj_fly`(8帧,loop)。动画 key **等于帧前缀 key**（帧文件 `{key}_{n}.png`），比 slash/sword_proj 的多段拆分更简单——这 5 套都是**单段动画**。
2. **注册**：扩展 `BootScene.FX_ANIMS`，给新条目加 `anim: { frameRate, repeat }` 字段，`create()` 里用**一个数据驱动循环**批量注册；`sword_proj`/`slash` 的现有硬编码块**原样保留不动**（它们是多段拆分，特殊）。仍复用 `fxFramesReady` + `!anims.exists` 双守卫。
3. **零回归**：11 个调用点全部 `anims.exists('<key>') ? sprite+play : <现状>`。PNG 未交付 → 动画未注册 → 100% 走现状路径，游戏表现与今天逐像素一致。
4. **关键设计点（与 slash/sword_proj 不同）**：ring/splash/spark 现状是**"静态贴图 + scale 放大补间"**假扮的。切动画后**放大过程由美术帧烘烤**，所以 sprite 的 scale 要设成"**当前补间峰值**"而不是当前起始值（`0.25`→`1.6` 应设 `≈1.6`，不是 `0.25`）。这是本轮最易踩的坑，已在 §3.2 给出全表。
5. **方向 vs 径向**：`bolt_fly`/`proj_fly` 是方向性弹道，沿用 sword_proj 的 `setRotation(angle)`（美术按**朝右**出图）；`fx_ring`/`fx_splash`/`fx_spark` 是径向爆发，**不旋转、不 flip**，颜色靠 `setTint` 派生（冰蓝/火橙/紫）。
6. **tint 纪律**：ring/splash/spark 必须出**中性白/寒白**帧（引擎负责染色，一套帧复用 6 种色）；`bolt_fly` 建议**烘烤火色**并去掉现有 `0xff6b35` tint（它两个调用点都是火，无复用需求）——此项需 lead 拍板，见 §4.1。
7. **性能**：无需对象池，无需 sheet 合并。新增 38 帧 × 48×48 RGBA ≈ 350KB 显存，可忽略；draw call 与现状持平（`add.image` → `add.sprite` 一对一替换）。
8. **不动的东西**：所有 AoE 判定半径、伤害、减速、震屏、音效、depth、物理体半径**一律不改**。本轮是纯表现层替换。

---

## 1. 动画注册设计（BootScene）

### 1.1 帧资产命名契约

| 动画 key | 帧文件 | 帧数（暂定） | 画布 | 交付路径 |
|---|---|---|---|---|
| `fx_ring` | `fx_ring_1.png` … `fx_ring_8.png` | 8 | 48×48 | `public/sprites/` |
| `fx_splash` | `fx_splash_1.png` … `fx_splash_8.png` | 8 | 48×48 | `public/sprites/` |
| `fx_spark` | `fx_spark_1.png` … `fx_spark_6.png` | 6 | 48×48 | `public/sprites/` |
| `bolt_fly` | `bolt_fly_1.png` … `bolt_fly_8.png` | 8 | 48×48 | `public/sprites/` |
| `proj_fly` | `proj_fly_1.png` … `proj_fly_8.png` | 8 | 48×48 | `public/sprites/` |

- **逐帧独立 PNG**，不用 spritesheet：与前两套交付形态一致，且单帧缺失可被 `fxFramesReady` 精确拦截。
- 帧号从 **1** 开始、连续、无空号（`fxFramesReady` 按 `1..frames` 逐个 `textures.exists`）。
- 这 36 个 key **不进 `SPRITE_KEYS`**（它们是动画帧，不是程序化兜底 key；`textures.ts` 的 `DEFS` 无定义，`generateMissing` 会静默跳过 —— 这正是必须靠**守卫**而非兜底贴图的原因）。
- 现有静态 key `slash`(48×48) / `bolt`(8×8) / `proj`(8×8) **全部保留**，继续作为兜底路径贴图。

### 1.2 FX_ANIMS 扩展（推荐形态）

`src/scenes/BootScene.ts` 现状（L11–14）：

```ts
const FX_ANIMS = [
  { key: 'sword_proj', frames: 8, frameSize: 48 },
  { key: 'slash', frames: 6, frameSize: 48 },
] as const
```

**扩展为**（新增 `anim` 可选字段承载单段动画定义）：

```ts
// 序列帧特效：逐帧独立 PNG，仅在所有帧加载成功时注册动画
// - 无 anim 字段者为多段动画（sword_proj/slash），沿用下方硬编码注册块
// - 有 anim 字段者为单段动画，动画 key 即帧前缀 key，由数据驱动循环批量注册
const FX_ANIMS = [
  { key: 'sword_proj', frames: 8, frameSize: 48 },
  { key: 'slash',      frames: 6, frameSize: 48 },
  // ---- Tier1+2 批量特效（本轮新增）----
  { key: 'fx_ring',    frames: 8, frameSize: 48, anim: { frameRate: 20, repeat: 0 } },  // once 径向环
  { key: 'fx_splash',  frames: 8, frameSize: 48, anim: { frameRate: 24, repeat: 0 } },  // once 溅射爆
  { key: 'fx_spark',   frames: 6, frameSize: 48, anim: { frameRate: 24, repeat: 0 } },  // once 小火花
  { key: 'bolt_fly',   frames: 8, frameSize: 48, anim: { frameRate: 12, repeat: -1 } }, // loop 火弹弹道
  { key: 'proj_fly',   frames: 8, frameSize: 48, anim: { frameRate: 10, repeat: -1 } }, // loop 基础弹道
] as const
```

> `preload()`（L32–36）的逐帧 `load.image` 循环**无需任何改动**，自动覆盖新增 38 帧。
> `frameSize` 仍只作元数据（现有代码未消费），保留以备后续校准脚本使用。

### 1.3 create() 注册块（追加在现有 slash 块之后）

`fxFramesReady`（L81–86）**原样复用**。在 `if (fxFramesReady('slash', 6)) { … }`（L104–110）之后追加：

```ts
// 批量单段特效动画：帧齐全才注册；未注册时调用点自动降级到静态兜底
for (const fx of FX_ANIMS) {
  const cfg = (fx as { anim?: { frameRate: number; repeat: number } }).anim
  if (!cfg) continue                                  // 多段动画由上方硬编码块处理
  if (!fxFramesReady(fx.key, fx.frames)) continue     // 帧缺失 → 不注册 → 零回归
  if (this.anims.exists(fx.key)) continue             // 幂等守卫
  this.anims.create({
    key: fx.key,
    frames: Array.from({ length: fx.frames }, (_, i) => ({ key: `${fx.key}_${i + 1}` })),
    frameRate: cfg.frameRate,
    repeat: cfg.repeat,
  })
}
```

**守卫纪律（三层，不可省）**：
1. `fxFramesReady(key, frames)` —— 任一帧纹理缺失即整套不注册；
2. `!this.anims.exists(key)` —— 幂等，防重复注册/泄漏；
3. `anims.create` **只在 `BootScene.create` 执行一次** —— 严禁在 spawn 时创建（同 anim-integration-spec §5）。

### 1.4 单段 vs 多段 / once vs loop

| key | 段数 | 播放模式 | repeat | 时长（估） | 销毁方式 |
|---|---|---|---|---|---|
| `fx_ring` | 单段 8 帧 | **once** | `0` | 8/20 = **400ms** | `animationcomplete` → `destroy()` |
| `fx_splash` | 单段 8 帧 | **once** | `0` | 8/24 = **333ms** | `animationcomplete` → `destroy()` |
| `fx_spark` | 单段 6 帧 | **once** | `0` | 6/24 = **250ms** | `animationcomplete` → `destroy()` |
| `bolt_fly` | 单段 8 帧 | **loop** | `-1` | 8/12 = 667ms/圈 | 随弹道生命周期 `destroy()` |
| `proj_fly` | 单段 8 帧 | **loop** | `-1` | 8/10 = 800ms/圈 | 随弹道生命周期 `destroy()` |

- **为什么不拆段**：这 5 套语义单一（环扩散 / 爆散 / 闪一下 / 匀速飞 / 匀速飞），没有 sword_proj 那种"飞行段 + 命中段"的双生命周期，拆段只增复杂度。
- **loop 类不需要 hit 段**：`bolt_fly` 命中时的表现由 `fx_splash` 承担（L1478 溅射爆），`proj_fly` 命中玩家无特效（现状即无），所以**不建 `bolt_hit`/`proj_hit`**。
- **frameRate 与现状时长对齐**：现有补间 `duration` 为 200/240/300/380（环）、160/220（爆）、120（火花）。once 动画时长取中位并略偏长（帧动画本身有内容，稍长更耐看）。**帧率是交付后最容易调的旋钮**，可在 §5 阶段 3 微调。
- ⚠️ `fx_spark` 现状仅 120ms，新动画 250ms。飞剑触敌是**高频事件**（每把剑对每敌 350ms 冷却），250ms 特效可能视觉堆叠。缓解见 §4.5。

---

## 2. 调用点映射表（DungeonScene.ts）

### 2.1 总表（11 个调用点）

| # | 行号 | 场景/方法 | 现状代码要点 | → 动画 key | 播放 | 静态兜底（保留） |
|---|---|---|---|---|---|---|
| 1 | **L803** | `attack` / `whirlwind` 旋风环 | `add.image('slash')` d15 scale .25 a.85 → tween scale 1.6 / a 0 / **angle 180** / 200ms | `fx_ring` | once | `slash` + tween（原样） |
| 2 | **L819** | `attack` / `frost_nova` 冰环 | `add.image('slash')` d15 scale .25 a.9 tint `0x9fd8ff` → tween scale 1.8 / a 0 / 240ms | `fx_ring` | once | `slash` + tween（原样） |
| 3 | **L836** | `frost_nova_burst` 玄冥冰爆主环 | `add.image('slash')` d15 scale .3 a.95 tint `0x7fd0ff` → tween scale 2.6 / a 0 / 300ms | `fx_ring` | once | `slash` + tween（原样） |
| 4 | **L838** | `frost_nova_burst` 副环 | `add.image('slash')` d15 scale .2 a.7 tint `0xd8f0ff` → tween scale 2.0 / a 0 / 380ms | `fx_ring` | once | `slash` + tween（原样） |
| 5 | **L1125** | `castArt` / `thunder_strike` 神通紫爆 | `add.image('slash')` d15 scale .25 a.9 tint `0xb39dff` → tween scale 1.2 / a 0 / 220ms | `fx_splash` | once | `slash` + tween（原样） |
| 6 | **L1478** | pprojs 循环 / `bolt` 爆裂溅射 | `add.image('slash')` d14 scale .2 a.8 tint `0xe67e22` → tween scale 0.8 / a 0 / 160ms | `fx_splash` | once | `slash` + tween（原样） |
| 7 | **L1071** | `swordArrayTick` 飞剑触敌火花 | `add.image('slash')` d15 scale .25 a.8 tint `0xcfe8ff` → tween scale 0.45 / a 0 / 120ms | `fx_spark` | once | `slash` + tween（原样） |
| 8 | **L588** | `spawnHlBullet`（`kind==='fire'` 分支） | `add.image('bolt')` d10 `setRotation(angle)` tint `0xff6b35` scale 1.4；手动位移，`hlBulletTick` L614 命中 → `hlFireHit` | `bolt_fly` | loop | 静态 `bolt`（原样） |
| 9 | **L1080** | `spawnPlayerProj`（`kind==='bolt'` 分支） | `add.image('bolt')` d12 `setRotation(angle)` scale 1；手动位移，命中走 L1475 爆裂 | `bolt_fly` | loop | 静态 `bolt`（原样） |
| 10 | **L1265** | `spawnProj`（敌方投射物） | `add.image('proj')` d8，**physics.add.existing + body.setVelocity**；L1417 循环回收 | `proj_fly` | loop | 静态 `proj`（原样） |
| 11 | — | `fireVortexFx` **L566** | `add.image('slash')` tint `0xff6b35` → tween **angle 540** scale 1.2 / 900ms | *（Tier3）* | — | **本轮不动** |

> 汇总：`fx_ring` × 4（L803/L819/L836/L838）、`fx_splash` × 2（L1125/L1478）、`fx_spark` × 1（L1071）、`bolt_fly` × 2（L588/L1080）、`proj_fly` × 1（L1265）。**共 10 处切换 + 1 处暂缓**。

### 2.2 once 类（ring / splash / spark）改造模板

三套 once 特效的现状是同一模式（`add.image` + `tweens.add` 放大淡出），因此**建议抽一个私有 helper**，把 10 处重复分支收敛成 1 处，降低回归面：

```ts
/**
 * 径向爆发特效：有序列帧动画时播放（放大/淡出已烘进帧），否则降级为静态贴图 + 放大淡出补间（现状）。
 * @param animKey  fx_ring / fx_splash / fx_spark
 * @param peakScale 动画路径的固定 scale = 兜底路径补间的**峰值** scale（见 §3.2）
 * @param fb       兜底参数（保持与改造前逐参数一致，确保零回归）
 */
private burstFx(
  animKey: 'fx_ring' | 'fx_splash' | 'fx_spark',
  x: number, y: number,
  o: { depth: number; peakScale: number; alpha: number; tint?: number },
  fb: { scale: number; toScale: number; duration: number; toAngle?: number },
) {
  if (this.anims.exists(animKey)) {
    const s = this.add.sprite(x, y, `${animKey}_1`)
      .setDepth(o.depth).setScale(o.peakScale).setAlpha(o.alpha)
    if (o.tint !== undefined) s.setTint(o.tint)
    s.play(animKey)
    s.on('animationcomplete', () => s.destroy())
    return
  }
  // 静态兜底：与改造前完全一致
  const img = this.add.image(x, y, 'slash').setDepth(o.depth).setScale(fb.scale).setAlpha(o.alpha)
  if (o.tint !== undefined) img.setTint(o.tint)
  this.tweens.add({
    targets: img, scale: fb.toScale, alpha: 0,
    ...(fb.toAngle !== undefined ? { angle: fb.toAngle } : {}),
    duration: fb.duration,
    onComplete: () => img.destroy(),
  })
}
```

调用点改造示例（L803 旋风环）：

```ts
// 改造前
const ring = this.add.image(px, py, 'slash').setDepth(15).setScale(0.25).setAlpha(0.85)
this.tweens.add({ targets: ring, scale: 1.6, alpha: 0, angle: 180, duration: 200, onComplete: () => ring.destroy() })

// 改造后（行为等价 + 动画增强）
this.burstFx('fx_ring', px, py,
  { depth: 15, peakScale: 1.6, alpha: 0.85 },
  { scale: 0.25, toScale: 1.6, duration: 200, toAngle: 180 })
```

**注意点**：
- **不写 `setRotation` / `setFlipX`**：径向特效无朝向，避免 `slashFx` 那种 flip 二次翻转陷阱（anim-integration-spec §2.5）。
- 兜底路径的 `angle: 180`（仅 L803 旋风环有）通过 `fb.toAngle` 保留；动画路径不加 angle 补间（旋转感由帧内容表达；若交付帧偏"静止"，可在 §5 阶段 3 追加一个轻微 `angle` 补间，与动画并行不冲突）。
- `alpha` 保留现值（0.7–0.95）。若新帧自带 alpha 渐隐，动画路径的 `alpha` 可上调到 1.0 —— 列为交付后微调项。

### 2.3 loop 类（bolt_fly）改造模板

**L588 `spawnHlBullet`** —— 现状已是三元分支（gold 走 `sword_proj_fly`），只需把 fire 分支也接上：

```ts
// 改造前（L586–590）
const spr = kind === 'gold' && this.anims.exists('sword_proj_fly')
  ? this.add.sprite(x, y, 'sword_proj_3').setDepth(10).setRotation(angle).setTint(0xffd54a).play('sword_proj_fly')
  : this.add.image(x, y, kind === 'gold' ? 'sword_proj' : 'bolt')
      .setDepth(10).setRotation(angle).setTint(kind === 'gold' ? 0xffd54a : 0xff6b35)
spr.setScale(kind === 'gold' ? 1.05 : 1.4)

// 改造后（新增 fire+bolt_fly 分支；scale 也要按分支取值，见 §3.3）
const spr = kind === 'gold' && this.anims.exists('sword_proj_fly')
  ? this.add.sprite(x, y, 'sword_proj_3').setDepth(10).setRotation(angle).setTint(0xffd54a).play('sword_proj_fly')
  : kind === 'fire' && this.anims.exists('bolt_fly')
    ? this.add.sprite(x, y, 'bolt_fly_1').setDepth(10).setRotation(angle).play('bolt_fly')   // tint 见 §4.1
    : this.add.image(x, y, kind === 'gold' ? 'sword_proj' : 'bolt')
        .setDepth(10).setRotation(angle).setTint(kind === 'gold' ? 0xffd54a : 0xff6b35)
spr.setScale(/* gold: 1.05 / fire+anim: FIRE_ANIM_SCALE / fire 静态: 1.4 */)
```

**L1080 `spawnPlayerProj`** —— 同构，`kind === 'bolt'` 分支加 `bolt_fly`：

```ts
const spr = kind !== 'bolt' && this.anims.exists('sword_proj_fly')
  ? this.add.sprite(x, y, 'sword_proj_3').setDepth(12).setRotation(angle).setScale(0.9).play('sword_proj_fly')
  : kind === 'bolt' && this.anims.exists('bolt_fly')
    ? this.add.sprite(x, y, 'bolt_fly_1').setDepth(12).setRotation(angle).setScale(BOLT_ANIM_SCALE).play('bolt_fly')
    : this.add.image(x, y, kind === 'bolt' ? 'bolt' : 'sword_proj').setDepth(12).setRotation(angle).setScale(kind === 'bolt' ? 1 : 0.9)
```

**类型/生命周期确认（已核对，无需改动）**：
- `hlBullets[].spr` 与 `pprojs[].spr` 声明为 `Phaser.GameObjects.Image`；`Sprite extends Image`，赋值**类型安全**（现有 gold 分支已依赖此性质）。
- 位移只读写 `.x/.y`（L600/L1449），loop 动画不受影响。
- `homing` 分支的 `pp.spr.setRotation(ang)`（L1446）对 Sprite 同样有效。
- 回收：L1455 `destroySwordProj(pp.spr)` 内部对 `sword_proj_hit` 判定 —— `bolt_fly` sprite 不满足 `anims.exists('sword_proj_hit') && instanceof Sprite` 的**语义**（instanceof 会为真！）。
  ⚠️ **必须处理**：`destroySwordProj` 当前判据是 `instanceof Sprite`，`bolt_fly` 也是 Sprite → 会被错误地 `play('sword_proj_hit')`，火弹变成剑光碎裂。
  **修正方案**：把判据改为按当前动画归属判断，例如
  ```ts
  private destroySwordProj(spr: Phaser.GameObjects.Image) {
    const isSwordAnim = spr instanceof Phaser.GameObjects.Sprite
      && spr.anims.currentAnim?.key?.startsWith('sword_proj')
    if (isSwordAnim && this.anims.exists('sword_proj_hit')) {
      spr.play('sword_proj_hit')
      spr.on('animationcomplete', () => spr.destroy())
    } else spr.destroy()
  }
  ```
  影响面：L616（hlBullet 命中）、L1456（pproj 超时/出界）、L1472（大庚命中）。**这是本轮唯一必须改的既有 helper**，属回归风险点，实现时优先写单测覆盖。
- L1486 `pp.spr.destroy()`（bolt 爆裂命中）为直接销毁，**不经 helper**，无需改动。

### 2.4 loop 类（proj_fly）改造模板

**L1265 `spawnProj`** —— 带物理体，注意顺序（先建对象再挂 body）：

```ts
// 改造前
const spr = this.add.image(x, y, 'proj').setDepth(8)

// 改造后
const spr = this.anims.exists('proj_fly')
  ? this.add.sprite(x, y, 'proj_fly_1').setDepth(8).setRotation(angle).setScale(PROJ_ANIM_SCALE).play('proj_fly')
  : this.add.image(x, y, 'proj').setDepth(8)
// 以下原样不动
this.physics.add.existing(spr)
const body = spr.body as Phaser.Physics.Arcade.Body
body.setAllowGravity(false)
body.setVelocity(Math.cos(angle) * v, Math.sin(angle) * v)
```

- `physics.add.existing` 对 Sprite/Image 同样适用；`this.projs[].spr` 类型同上兼容。
- ⚠️ **物理体尺寸**：`physics.add.existing` 按**纹理尺寸**建 body。静态 `proj` 是 8×8 → body 8×8；换 48×48 帧后 body 变 48×48。虽然 L1421 的命中判定用的是**距离**（`Distance.Between < 12`）而非 body 重叠，且 L1420 撞墙判定用 `isSolidPixel`（点采样），**当前逻辑不读 body 尺寸**，但为稳妥建议动画路径显式 `body.setSize(8, 8)` 或 `setCircle(4)` 锁定判定体积，避免未来引入 overlap 时行为漂移。列为实现时的**必做项**。
- `setRotation(angle)` 是**新增**行为（静态 `proj` 未旋转，8×8 圆点无所谓朝向）。动画帧若为方向性（拖尾）则必须旋转；若为球状无方向则可省。待与 art-director 确认（§6）。

---

## 3. 尺寸校准方案

### 3.1 基线尺寸（实测，非假设）

| 静态资产 | 实测尺寸 | 用途 |
|---|---|---|
| `public/sprites/slash.png` | **48×48**（2059 B） | ring/splash/spark 的现状兜底贴图 |
| `public/sprites/bolt.png` | **8×8**（156 B） | 火弹现状贴图 |
| `public/sprites/proj.png` | **8×8**（183 B） | 敌方弹道现状贴图 |
| `public/sprites/sword_proj.png` | 32×12（1316 B） | 参考（anim-spec §3.1 已纠正） |
| 新交付帧 | **48×48**（约定） | 5 套 × 38 帧 |

> `textures.ts` 的 `DEFS` 里 `proj: [8,8]`、`bolt: [8,8]` 与实测一致（`sword_proj: [12,6]` 是唯一不一致项，已在 anim-spec 纠正）。

### 3.2 once 类校准（**核心：scale 取补间峰值，不取起始值**）

**原理**：现状 ring/splash/spark 的"扩散"是 `tweens` 把 scale 从 0.2 拉到 1.6~2.6 做出来的；新序列帧把扩散**烘进帧内容**，sprite scale 应保持**恒定**。若照抄起始值 `0.25`，环会小到看不见（这是最容易犯的错）。

**校准公式**：

```
peakScale = 现状视觉峰值直径(px) / (48 × contentFillRatio)
现状视觉峰值直径 = 48（slash 基准） × 兜底补间的 toScale
contentFillRatio = 新帧"最大那一帧"的内容包围盒 / 48，交付后实测（预设 0.95）
```

| # | 行号 | 用途 | 现状 scale（起→峰） | 现状峰值直径 | **animPeakScale（初值）** | tint |
|---|---|---|---|---|---|---|
| 1 | L803 | 旋风环 | 0.25 → **1.6** | 76.8 px | **1.60** | 无（保持无 tint） |
| 2 | L819 | 冰环 | 0.25 → **1.8** | 86.4 px | **1.90** | `0x9fd8ff` |
| 3 | L836 | 玄冥冰爆主环 | 0.30 → **2.6** | 124.8 px | **2.70** | `0x7fd0ff` |
| 4 | L838 | 玄冥冰爆副环 | 0.20 → **2.0** | 96.0 px | **2.10** | `0xd8f0ff` |
| 5 | L1125 | 神通紫爆 | 0.25 → **1.2** | 57.6 px | **1.25** | `0xb39dff` |
| 6 | L1478 | 爆裂溅射 | 0.20 → **0.8** | 38.4 px | **0.85** | `0xe67e22` |
| 7 | L1071 | 飞剑火花 | 0.25 → **0.45** | 21.6 px | **0.47** | `0xcfe8ff` |

> 上表 `animPeakScale` = 峰值直径 / 45.6（即 fillRatio 预设 0.95）。**交付后统一校准**：实测最大帧内容包围盒宽 `W`，则统一因子 `k = 45.6 / W`，全表 × k 一次改完（对应 sword_proj 那一轮的 0.88× / 1.10× 思路）。
> 副环 L838 与主环 L836 时长不同（380 vs 300ms）用于制造"双环错位"层次；改动画后两环时长同为 400ms，层次会变弱 → 建议副环用 `delayedCall(80, …)` 错开起播，保留层次感（列为交付后微调项，不影响判定）。

### 3.3 loop 类校准（弹道）

现状是 8×8 小贴图，新帧 48×48 且内容填充率更低（火球本体约占画布 55–65%）。**不能照抄 scale 1.0**（会得到 ~30px 的巨型火球，遮挡视野）。

```
projScale = 目标视觉直径(px) / (48 × contentFillRatio)
```

| # | 行号 | 用途 | 现状 | 现状视觉直径 | 目标视觉直径 | **anim scale（初值）** | 旋转 | tint |
|---|---|---|---|---|---|---|---|---|
| 8 | L588 | 韩前辈火弹 | `bolt` scale **1.4** | 11.2 px | 14–16 px | **0.50** | `setRotation(angle)` | 见 §4.1 |
| 9 | L1080 | 玩家/道友火弹 | `bolt` scale **1.0** | 8.0 px | 12–14 px | **0.42** | `setRotation(angle)` | 见 §4.1 |
| 10 | L1265 | 敌方弹道 | `proj` scale 1（默认） | 8.0 px | 11–13 px | **0.38** | `setRotation(angle)`（待确认） | 无 |

> 初值按 `contentFillRatio ≈ 0.6` 估：`0.50 × 48 × 0.6 ≈ 14.4px`。**目标视觉直径刻意略大于现状**（8px 太小，序列帧细节完全看不出，白做）。放大幅度控制在 +50~75%，避免遮挡与"火球比怪物大"的观感失衡。
> **判定不变**：L603 `< 14`（hlBullet 命中玩家）、L1421 `< 12`（敌弹命中玩家）、L1067 `> 22`（飞剑触敌）等阈值**一律不动** —— 视觉略大于判定是弹幕游戏的通行做法（对玩家友好）。

### 3.4 方向与翻转纪律

| 类别 | key | 旋转 | 翻转 | 出图朝向要求 |
|---|---|---|---|---|
| 方向性弹道 | `bolt_fly` / `proj_fly` | **`setRotation(angle)`** | **不 flip** | **朝右**（+X 方向，同 `sword_proj`） |
| 径向爆发 | `fx_ring` / `fx_splash` / `fx_spark` | **不旋转** | **不 flip** | 上下左右对称、圆心居中 |

- `sword_proj` 的经验：帧按"剑尖朝右"绘制 → `setRotation(angle)` 直接可用，**不加 flip**。`bolt_fly`/`proj_fly` 严格照此。
- `slash` 的教训（anim-spec §2.5）：静态贴图尖角朝左导致 `slashFx` 有 `setFlipX(true)`，动画路径必须区分处理。**径向特效天然规避此坑** —— 但前提是**美术必须出圆心居中、上下对称的帧**。若 ring 帧偏心，`setTint` + 无旋转的路径无法补救，只能返工。写进 §5 验收清单。
- ⚠️ 若 art-director 交付的 `proj_fly` 是**球状无方向**（无拖尾），则 L1265 的 `setRotation(angle)` 应省略（旋转一个对称球体是空转，虽无害但无意义）。§6 待确认。

---

## 4. 已知风险 + 缓解

### 4.1 tint 乘法 vs 烘烤色（最高优先）

`setTint` 是**逐通道乘法**：帧上任何非白像素都会被 tint 进一步压暗。

| key | 复用色数 | 结论 | 出图硬约束 |
|---|---|---|---|
| `fx_ring` | **4 种**（无 tint / 冰蓝 ×3） | **必须中性** | 寒白 `#E8F0FF` 主体 >85% 面积，仅极淡青灰 `#c8d8f0` 做暗部；**禁止**烘任何饱和色 |
| `fx_splash` | **2 种**（火橙 `0xe67e22` / 紫 `0xb39dff`） | **必须中性** | 同上。橙与紫跨度极大，任何烘烤色都会脏一边 |
| `fx_spark` | 1 种（冰蓝 `0xcfe8ff`） | 建议中性 | 中性白即可，未来复用不吃亏 |
| `bolt_fly` | 1 种（火橙 `0xff6b35`，两处同色） | **建议烘烤火色 + 去 tint** | 见下 |
| `proj_fly` | 0 种（现状无 tint） | **可自由烘烤** | 敌方能量弹，暗紫/污绿等按美术定 |

**`bolt_fly` 的决策（需 lead 拍板）**：
- **方案 A（推荐）**：帧烘烤完整火焰渐变（外橙 `#ff6b35` → 内黄白 `#ffe9a8`），调用点**去掉 `setTint(0xff6b35)`**。优点：火焰的"外冷内热"层次是白帧 + 单色 tint **做不出来的**（tint 会把内芯白也染成橙，火球变成一坨橙）。两个调用点同色，无复用损失。
- **方案 B（保守）**：出中性白帧，保留 `setTint(0xff6b35)`。优点：改动最小、可复用为冰弹/毒弹；缺点：火球缺乏内芯高光，观感平。
- **判据**：若 art-director 的 v3 包已按"火"出图 → 走 A（并在 L588 显式移除 tint、L1080 本就无 tint）；若出中性帧 → 走 B。**两方案的代码差异仅一行 `setTint`，可在交付后按实际帧决定，不阻塞骨架。**

**通用缓解**：所有中性帧遵循 anim-spec §4.3 的"近白亮部多、彩色暗部少"原则，保证任意 tint 后仍有发光感。

### 4.2 美术包帧数 ≠ 注册表帧数（会导致整套静默失效）

- 机制：`fxFramesReady` 要求 `1..frames` **全部存在**。若注册表写 8 帧、美术只交 6 帧 → 第 7 帧 `textures.exists` 为 false → **整套不注册** → 静默降级到静态兜底。
- 症状隐蔽：游戏不报错、不崩、表现与今天一致 —— 很容易被误判为"美术资产没生效但不知道为什么"。
- **缓解**：
  1. §1.1 帧数表在 art-director v3 包定稿后**立即回填**（这是本 spec 唯一的硬耦合点）；
  2. 实现时在 `fxFramesReady` 失败分支加一条 **dev-only 告警**（`import.meta.env.DEV` 下 `console.warn('[fx] ${key} 帧不全，已降级：缺 ${missing}')`），把静默失败变成显式提示；
  3. §5 验收清单加"控制台无 `[fx]` 告警"一条。
- 反向情况（美术交 10 帧、注册表写 8）：多出的帧被忽略，动画少 2 帧、结尾突兀 —— 同样靠回填帧数解决。

### 4.3 辉光混合模式（ADD）

- 现状：只有 `giant_sword`（L875 附近）用 ADD；ring/splash/spark/bolt/proj **全部是 NORMAL**。
- 风险：ADD 会让特效在亮色地面上**过曝发白**、在暗色洞穴里**过亮抢焦**，且叠加多发火弹时累积爆白。
- **决策：默认不改混合模式**（保持 NORMAL），理由是零回归优先、且新帧本身自带亮部。
- 可选增强（交付后 A/B）：`fx_spark`（小、短、稀疏）与 `bolt_fly` 内芯最适合 ADD。若试，建议**只对 `fx_spark` 开 ADD**，并把 alpha 从 0.8 降到 0.6 补偿。列为 §5 阶段 3 可选项，**不进本轮基线**。

### 4.4 "扩散补间 → 烘烤帧"的语义迁移（§3.2 已述，此处记风险）

- 若实现时照抄起始 scale（0.2~0.3），环/爆会小到几乎不可见，且**没有任何报错**。
- 缓解：§3.2 给出 `animPeakScale` 全表，helper 参数名刻意叫 `peakScale`（自解释）；实现后**必须人眼过一遍 4 个环 + 2 个爆 + 1 个火花**（§5 阶段 3 清单）。

### 4.5 高频特效的视觉堆叠（fx_spark）

- `fx_spark` 调用点 L1071 在 `swordArrayTick` 内：万剑归宗最多同时存在多把剑 × 多敌人，350ms/敌冷却 → 峰值可能每秒十余次。
- 现状 120ms 补间几乎不重叠；新动画 250ms 会**明显重叠**，可能糊成一片光。
- 缓解（按优先级）：
  1. `fx_spark` frameRate 提到 **30**（6 帧 = 200ms），更贴近现状；
  2. 若仍糊，在 helper 里对 `fx_spark` 加**并发上限**（如场上同时 ≤ 6 个，超出则跳过创建）——纯表现层裁剪，不影响伤害；
  3. 降 alpha 到 0.65。
- 本轮基线取措施 1（frameRate 24→可调 30），措施 2/3 作为交付后备选。

### 4.6 `destroySwordProj` 的 instanceof 误判（§2.3 已述）

- **这是本轮最实质的回归风险**：`bolt_fly` 变成 Sprite 后会命中 `spr instanceof Sprite` 判据，被错误播放 `sword_proj_hit`。
- 缓解：按 §2.3 改为 `currentAnim?.key?.startsWith('sword_proj')` 判据；**先写单测**（构造 bolt_fly sprite → 调 destroySwordProj → 断言未播 sword_proj_hit 且已 destroy），再改实现。

### 4.7 物理体尺寸漂移（`proj_fly`，§2.4 已述）

- 48×48 纹理会让 `physics.add.existing` 建出 48×48 body（现状 8×8）。当前判定不读 body，无即时 bug，但属**埋雷**。
- 缓解：动画路径显式 `body.setCircle(4)`（或 `setSize(8,8)`），把判定体积锁回现状。**必做**。

### 4.8 性能与显存（低风险，记录备查）

- 新增 36 帧 × 48×48 × RGBA ≈ **332 KB** 显存，可忽略；36 张独立小纹理在 WebGL 多纹理单元下无压力。
- draw call：`add.image` → `add.sprite` **一对一替换**，总数不变（Phaser anims 是逐实例帧指针 + 共享纹理）。
- **无需对象池**（同 anim-spec §5）。若后续 `fire_rain`（7 发）/ `dageng`（大量）出现 GC 抖动，再单独评估 `bolt_fly` 池化。
- 纪律：`anims.create` 仅在 `BootScene.create`；调用点**只 `play`**。

---

## 5. PNG 到位后的验收清单（对齐 stage1）

### 阶段 0（现在）— 铺骨架，零回归
> 状态：**本 spec 完成即可开工**（待 lead 批准动源码）。
1. `BootScene.ts`：FX_ANIMS 加 5 条（带 `anim` 字段）+ create() 追加数据驱动注册循环（§1.2 / §1.3）+ dev-only 帧不全告警（§4.2）。
2. `DungeonScene.ts`：新增 `burstFx` helper（§2.2）→ 改造 7 个 once 调用点；改造 L588 / L1080 / L1265 三个 loop 调用点（§2.3 / §2.4）。
3. `destroySwordProj` 判据修正（§2.3 / §4.6）+ `proj_fly` body 锁定（§4.7）。
4. scale 按 §3.2 / §3.3 初值写入（**不是**照抄现状起始 scale）。
5. 验证：`npm run typecheck` → `npm test` 全绿。此时 PNG 未交付 → 动画未注册 → **表现与今天完全一致**。

### 阶段 1 — 用户交付 PNG，自动生效
1. 用户把 36 个文件放入 `public/sprites/`：
   `fx_ring_1..8.png` / `fx_splash_1..8.png` / `fx_spark_1..6.png` / `bolt_fly_1..8.png` / `proj_fly_1..8.png`
2. **无需改任何代码**：`BootScene.preload` 自动加载 → `fxFramesReady` 检测帧齐全 → `anims.create` 注册 → 10 个调用点的 `anims.exists` 守卫自动转真 → 全部切到动画路径。
3. 若某套帧不全 → 该套静默降级（其余 4 套照常生效），控制台出 `[fx]` 告警。

### 阶段 2 — 交付即时核对（美术契约验收）
- [ ] **文件名/帧号**：严格 `{key}_{n}.png`，n 从 1 连续到帧数，**无空号**、无 `_0`、无零填充（`fx_ring_01` 会被判为缺失）。
- [ ] **帧数一致**：实际帧数 == §1.1 表 == `FX_ANIMS` 里的 `frames`（不一致则回填注册表并复跑）。
- [ ] **画布**：48×48（用 §5 校验脚本批量确认）。
- [ ] **朝向**：`bolt_fly` / `proj_fly` 头部**朝右**（+X）。若出成朝左 → 需在两处 spawn 补 `setFlipX(true)`（或退回美术镜像，**优先退回美术**，避免代码分支增生）。
- [ ] **居中对称**：`fx_ring` / `fx_splash` / `fx_spark` 圆心在画布正中，上下左右对称（偏心无法用代码补救）。
- [ ] **中性配色**：`fx_ring` / `fx_splash` 帧为寒白/中性（§4.1）。用 `setTint(0xe67e22)` 与 `setTint(0xb39dff)` 各看一眼 `fx_splash`，两色都不脏才算过。
- [ ] **透明通道**：帧四周为全透明（非黑底），否则会出现方块黑边。
- [ ] **控制台无 `[fx]` 告警**。

### 阶段 3 — 尺寸/节奏校准（一次性，改完不再动）
- [ ] 实测每套"最大那一帧"的内容包围盒宽 `W` → 算统一因子 `k = 45.6 / W` → §3.2 表 `animPeakScale` × k 一次性改完。
- [ ] 弹道类实测火球本体直径 → 按 §3.3 目标视觉直径（14–16 / 12–14 / 11–13 px）反解 scale。
- [ ] 人眼逐项过（**防 §4.4 的静默小环**）：旋风环 / 冰环 / 玄冥冰爆双环 / 神通紫爆 / 爆裂溅射 / 飞剑火花 / 韩前辈火弹 / 玩家火弹 / 敌方弹道 = **9 项**。
- [ ] frameRate 微调：ring 20（400ms）、splash 24（333ms）、spark 24→按 §4.5 可提到 30、bolt 12、proj 10。
- [ ] 玄冥冰爆副环 `delayedCall(80)` 错位（§3.2 注）。
- [ ] 可选：`fx_spark` ADD 混合 A/B（§4.3）；`bolt_fly` tint 方案 A/B 定稿（§4.1）。

### 验证命令（每阶段收尾必跑）
```bash
npm run typecheck          # tsc --noEmit
npm test                   # vitest run
npm run build              # tsc --noEmit && vite build（含 validate-data 预检）
```
帧资产批量校验（尺寸/存在性，建议加进 `scripts/`）：
```bash
node -e "const fs=require('fs');
for (const [k,n] of [['fx_ring',8],['fx_splash',8],['fx_spark',6],['bolt_fly',8],['proj_fly',8]])
  for (let i=1;i<=n;i++){const p=\`public/sprites/\${k}_\${i}.png\`;
    if(!fs.existsSync(p)){console.log('MISSING',p);continue}
    const b=fs.readFileSync(p);console.log(p,b.readUInt32BE(16)+'x'+b.readUInt32BE(20))}"
```

### 阶段 4（可选，稳定后）
- 移除 once 类的静态兜底分支（但**保留 `slash`/`bolt`/`proj` 三个静态 key** —— `fireVortexFx` L566 仍在用 `slash`，Tier3 未迁移前不可删）。

---

## 6. 待确认项

### 给 lead（游承峰）
1. **阶段 0 是否现在开工**？（铺骨架零回归，可在 PNG 到位前落地。需批准动源码。）
2. **`bolt_fly` 走 tint 方案 A（烘烤火色 + 去 tint）还是 B（中性 + 保留 tint）**？我推荐 A（火焰内外层次 tint 做不出来）。
3. `destroySwordProj` 判据修正（§4.6）是既有 helper 的行为变更，**是否同意在本轮一并改 + 补单测**？（不改则火弹命中会播剑光碎裂，属实际 bug。）
4. §3.3 弹道视觉直径刻意放大 50–75%（8px → 12–16px）**是否认可**？（不放大则序列帧细节完全看不出。）
5. `fx_firevortex` Tier3 暂缓已按指示写入，**后续是否单开一轮**（它需要"帧内旋转 vs 代码 `angle` 补间"的额外决策）。

### 给 art-director（林绘澄）— 硬耦合，需回填
1. **帧数确认**：`fx_ring` 8 / `fx_splash` 8 / `fx_spark` 6 / `bolt_fly` 8 / `proj_fly` 8 —— v3 包是否一致？**任何差异必须回填 §1.1 与 `FX_ANIMS`，否则整套静默失效**（§4.2）。
2. **画布确认**：统一 48×48？弹道类（`bolt_fly`/`proj_fly`）现状仅 8×8，48×48 画布下内容填充率偏低；若你更倾向 24×24 交付，请告知 —— 我按 `contentFillRatio` 重算 §3.3 的 scale 即可，两种都能接。
3. **`fx_ring` / `fx_splash` 必须中性寒白**（引擎要用 tint 派生 4 种环色 + 火橙/紫两种爆色，§4.1）。烘饱和色会导致其中一色发脏。
4. **`bolt_fly` 出中性还是出火色**？决定 §4.1 的 A/B 方案。
5. **`proj_fly` 是否方向性**（带拖尾/头部朝右）**还是对称球状**？方向性 → 引擎加 `setRotation(angle)`；球状 → 省略。
6. **`bolt_fly` / `proj_fly` 一律朝右（+X）**；`fx_ring` / `fx_splash` / `fx_spark` **圆心居中、上下左右对称**（偏心代码无法补救）。
7. `fx_ring` 的**最大那一帧建议填满画布**（fillRatio ≈ 0.95），这样 §3.2 的 scale 初值可直接用、少一轮返工。
