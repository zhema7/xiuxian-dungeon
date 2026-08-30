# 序列帧动画接入规格（sword_proj / slash）

- 对应美术包：`docs/art/prompt-pack-anim-v2.md`（ART-ANIM-002，sword_proj 8 帧 + slash 6 帧，逐帧独立 PNG `{key}_{n}.png`，48×48，朝右）
- 本文件：**工程接入评估与精确规格**（只评估不改代码）
- 环境基线：Phaser 3.90 + Vite 5.4.21；`BootScene` 现有 `SPRITE_KEYS` 批量 `load.image` + `ANIM_CLASSES` atlas 动画 + `textures.generateMissing` 程序化兜底

---

## 0. TL;DR

1. **注册**：推荐逐帧 `load.image` ×8（`sword_proj_1..8`）/ ×6（`slash_1..6`），在 `BootScene` 增加 `FX_ANIMS` 配置数组（仿 `ANIM_CLASSES` 模式）；**不要**用 spritesheet（与美术包交付形态一致、且各帧可独立失败兜底）。
2. **兜底**：动画帧缺失时**守卫降级**到现有静态路径（`add.image` + tween），游戏行为与今天完全一致；`generateMissing` 不会为 `sword_proj_1` 等生成兜底（DEFS 无定义，`bake` 静默返回），所以**必须靠守卫而非兜底贴图**。
3. **拆段**：`sword_proj_fly`（帧1–4）+ `sword_proj_hit`（帧5–8）**合理**；细化建议：持续飞行（环绕剑阵）用帧3–4 两帧子循环，避免反复"凝聚"。
4. **scale**：**关键纠正**——当前 `sword_proj.png` 实际是 **32×12**（不是美术包假设的 12×6；12×6 只是 `textures.ts` DEFS 兜底）。因此 scale 重调系数≈**×1.10（内容等比）**，远轻于美术包暗示的 ×0.25。slash 48×48→48×48，scale 不变。
5. **tint**：sword_proj 被金/淡金/冰蓝 tint（TitleScene 1 处 + DungeonScene 6 处），slash 被橙/蓝/紫/冰蓝 tint。动画帧**银白/寒白为主**可兼容；青蓝点缀在金色 tint 下会被染成脏橄榄，须约束在拖尾/剑芒薄层。
6. **性能**：**无需对象池**。Phaser anims 是逐实例帧推进 + 共享纹理，draw call 数与现在 `add.image` 持平；8×48×48 纹理内存 ~74KB 可忽略；`anims.create` **只注册一次**（BootScene），禁止每次 spawn 创建。
7. **顺序**：**现在就能铺骨架**（注册 + 守卫 + 调用点分支），在用户出图前落地零回归；用户交付后仅需按实际内容包围盒校准 scale + 核对朝向。

---

## 1. 注册方案（BootScene + textures.ts 共存与兜底）

### 1.1 现有流程（已确认）
- `BootScene.preload()`：`for (const key of SPRITE_KEYS) this.load.image(key, 'sprites/${key}.png')`；`loaderror` 收集进 `this.failedKeys`。
- `BootScene.create()`：`generateMissing(this, this.failedKeys)` 只为**缺失的 SPRITE_KEYS** 程序化兜底；随后按 `ANIM_CLASSES` 从 atlas+json 批量 `anims.create`。
- `textures.generateMissing` → `bake(scene, key)`：`DEFS[key]` 无定义则静默 return（安全）。

### 1.2 建议：`FX_ANIMS` 配置数组（逐帧方案，推荐）
在 `BootScene.ts` 仿 `ANIM_CLASSES` 增加：

```ts
const FX_ANIMS = [
  { key: 'sword_proj', frames: 8, frameSize: 48 },
  { key: 'slash',      frames: 6, frameSize: 48 },
] as const
```

- `preload()` 追加：
  ```ts
  for (const fx of FX_ANIMS)
    for (let n = 1; n <= fx.frames; n++)
      this.load.image(`${fx.key}_${n}`, `sprites/${fx.key}_${n}.png`)
  ```
- 这 8+6 个 key **不进 `SPRITE_KEYS`**（它们是动画帧，不是静态兜底 key）；`sword_proj` / `slash` 两个静态 key 保留（既是静态兜底、又被环形特效继续使用）。

### 1.3 兜底行为（动画帧缺失时）
- 若 `sword_proj_3.png` 缺失 → `failedKeys` 记录 → `generateMissing` 调 `bake(scene,'sword_proj_3')` → DEFS 无定义 → 静默返回 → **该帧纹理不存在**。
- 因此 anims 创建**必须守卫**：仅当 `sword_proj_1..8` 全部 `this.textures.exists` 时才 `anims.create('sword_proj_fly'/'sword_proj_hit')`；slash 同理（1..6 → `slash_anim`）。
- 调用点**分支**：`this.anims.exists('sword_proj_fly') ? add.sprite(...).play(...) : add.image(...)`（现状）。帧未交付时 100% 走现状，**零回归**。

---

## 2. anims.create 配置 + 用法分类

### 2.1 拆段（sword_proj_fly / sword_proj_hit）——合理
按美术包 §1.4/§3.3 定义，8 帧完整生命周期拆两条：
```ts
// 仅当 8 帧全部存在时创建
this.anims.create({ key: 'sword_proj_fly',
  frames: ['sword_proj_1','sword_proj_2','sword_proj_3','sword_proj_4'].map(k => ({ key: k })),
  frameRate: 10, repeat: -1 })
this.anims.create({ key: 'sword_proj_hit',
  frames: ['sword_proj_5','sword_proj_6','sword_proj_7','sword_proj_8'].map(k => ({ key: k })),
  frameRate: 12, repeat: 0 })
```
- 判断：**合理**。帧1–4 是"凝聚→出鞘→飞行本体→拉芒"的飞行生命周期，帧5–8 是"爆闪→碎光→残影→消散"的命中生命周期，语义边界清晰，命中切换 + 播完销毁最自然。
- **细化建议**：帧1–2 是"凝聚/出鞘"，对**长时间持续飞行**（万剑归宗环绕剑阵）反复循环会不停"重新凝聚"，观感不稳。建议为环绕剑阵另建 `sword_proj_loop`（帧3–4，frameRate 10，repeat -1），普通短命弹道（普攻/剑阵/金雷）用 `sword_proj_fly`（1–4）即可（寿命 <1s，凝聚脉冲几乎不可见）。

### 2.2 slash_anim（一次性，12fps）
```ts
this.anims.create({ key: 'slash_anim',
  frames: ['slash_1','slash_2','slash_3','slash_4','slash_5','slash_6'].map(k => ({ key: k })),
  frameRate: 12, repeat: 0 })
```
帧6 本身是"碎裂消散"，播放完 `onComplete` 销毁，可替代现有 alpha/scale tween 的淡出段。

### 2.3 sword_proj 全部引用点（7 处）→ 分类
| 行号 | 场景/方法 | 现状（add.image 参数） | 迁移建议 |
|---|---|---|---|
| `TitleScene.ts:139` | 标题页"剑光掠过"装饰 | scale 1.4 / tint 0xf0d98c / rotation 0 / 横向 tween 掠过 | **可切** `sword_proj_fly`（或 `sword_proj_loop` 3–4）；低优先，装饰性 |
| `DungeonScene.ts:586` | spawnHlBullet（韩前辈金雷） | scale 1.2 / rotation / tint 0xffd54a | **切 fly**；命中（hlBulletTick 内）切 hit 后销毁 |
| `DungeonScene.ts:732` | castDageng 大庚剑阵 | scale 1.3 / rotation / tint 0xffd54a | **切 fly**；命中（pprojs 更新循环 homing 分支 ~1435）切 hit 后销毁 |
| `DungeonScene.ts:875-876` | giant_sword 巨剑术 | scale 4.2 / rotation / tint 0xffe9a8 / ADD | **切 fly**；2s 后自然消失处切 hit |
| `DungeonScene.ts:974` | toggleSwordArray 环绕飞剑 | scale 0.9 / tint 0xcfe8ff | **切 `sword_proj_loop`（3–4）**，持续环绕 |
| `DungeonScene.ts:1000` | updateSwordArray 补剑 | scale 0.9 / tint 0xcfe8ff | **切 `sword_proj_loop`（3–4）** |
| `DungeonScene.ts:1046` | spawnPlayerProj 玩家普攻剑气 | 默认 scale 1 / rotation | **切 fly**；命中（bolt 溅射分支 / sword 直接命中 ~1441）切 hit |

- 最小改动路径：每处把 `this.add.image(x,y,'sword_proj')` 换成一个**分支 helper**（见 §6 骨架），返回 `Sprite | Image` 统一继续链式 `.setDepth/.setRotation/.setTint/.setScale`；命中销毁路径加 `if (spr instanceof Phaser.GameObjects.Sprite) spr.play('sword_proj_hit')`，并 `spr.on('animationcomplete', () => spr.destroy())`（仅 hit/一次性）。
- 命中处理集中在 `pprojs` 更新循环（约 1400–1455）与 `hlBulletTick`（594+）。

### 2.4 slash 全部引用点（9 处）→ 分类（关键）
| 行号 | 用途 | 分类 | 是否切 anim |
|---|---|---|---|
| `DungeonScene.ts:923` | `slashFx` 定义（剑光弧核心） | **剑光弧** | **切 `slash_anim`** |
| `DungeonScene.ts:783` | melee_arc 调用 slashFx | **剑光弧** | **切 `slash_anim`**（经 slashFx） |
| `DungeonScene.ts:1468` | 道友近战调用 slashFx | **剑光弧** | **切 `slash_anim`**（经 slashFx） |
| `DungeonScene.ts:799` | whirlwind 旋风环 | 环形基底 | 保留静态 + tween |
| `DungeonScene.ts:815` | frost_nova 冰环 | 环形基底 | 保留静态 + tween |
| `DungeonScene.ts:832` | frost_nova_burst 冰环 | 环形基底 | 保留静态 + tween |
| `DungeonScene.ts:834` | frost_nova_burst 副环 | 环形基底 | 保留静态 + tween |
| `DungeonScene.ts:566` | fireVortexFx 火焰漩涡（旋转 540°） | 环境旋转 | 保留静态 + tween |
| `DungeonScene.ts:1039` | 剑阵触敌 spark | 溅射小闪 | 保留静态 + tween |
| `DungeonScene.ts:1091` | 天雷 boom | 爆闪 | 保留静态 + tween |
| `DungeonScene.ts:1444` | 火弹溅射 boom | 爆闪 | 保留静态 + tween |

> 结论：**只有 `slashFx`（剑光弧，经 783/1468 两处调用）切动画**；其余 8 处（环形 ×4 + 环境旋转 ×1 + 溅射/爆闪 ×3）**一律保留静态 + tween**。环形用途若想增强，后续可另出「环形专用 2–4 帧呼吸循环」（按 §0.2 光环类），不在本次范围。

### 2.5 迁移 slashFx 的**朝向陷阱（务必处理）**
- 当前 `slashFx` 为修复方向反转已加 `.setFlipX(true)`（`DungeonScene.ts:924`），因为**现有静态 slash.png 是"尖角朝左"**。
- 美术包 §2.1/§2.2 的动画帧约定是**"锐利尖角朝右"**（与修复后朝向一致）。
- 因此：**anim 路径不得再 setFlipX**（否则二次翻转又反了）；静态兜底路径保留 `setFlipX(true)`。切 anim 时代码需按"是否 anim"分支 flip。
- 交付后**必须核对** `slash_1..6` 实际朝向；若 AI 出成尖角朝左，则在 anim 路径补 `setFlipX(true)`。

---

## 3. 尺寸连锁（scale 重调）

### 3.1 关键纠正：当前 sword_proj 实际尺寸
- `public/sprites/sword_proj.png` 实测 **32×12**（1316 B）。
- `textures.ts` DEFS 兜底是 12×6（美术包按此假设 v1=12×6，**有误**）。
- 结论：**现有所有 setScale 都是按 32×12 调好的**；美术包"按 12×6→48×48 需 ×0.25"的推论不成立。

### 3.2 重调公式（按内容等比，非画布等比）
- 新 48×48 画布内，剑身内容仅占约 60% 宽（美术包 §1.2 帧3"长约画布六成"≈29px）。
- 正确标定：**保持剑的视觉长度不变** → `new = old × 32 / contentWidth_new`；contentWidth_new≈29 → **系数 ≈ ×1.10**。
- 若按画布比（32/48=×0.667）会把剑明显缩小，**不推荐**。
- 最终精确值待用户交付后按实际内容包围盒校准（公式见上）。

### 3.3 sword_proj scale 表（现值 → 建议值，×1.10 估算）
| 行号 | 现值 | 建议值 | 备注 |
|---|---|---|---|
| `TitleScene.ts:139` | 1.4 | ≈1.5 | 装饰掠剑，可后调 |
| `DungeonScene.ts:586` | 1.2 | ≈1.3 | 金雷 |
| `DungeonScene.ts:732` | 1.3 | ≈1.4 | 大庚剑阵 |
| `DungeonScene.ts:876` | 4.2 | ≈4.6 | 巨剑术（本就很巨大） |
| `DungeonScene.ts:974` | 0.9 | ≈1.0 | 环绕飞剑 |
| `DungeonScene.ts:1000` | 0.9 | ≈1.0 | 环绕飞剑补剑 |
| `DungeonScene.ts:1046` | 1（默认） | ≈1.1 | 玩家普攻 |

> 骨架阶段建议**先保持现值不动**（新旧视觉差 ~9%，几乎无感），出图后再按公式一次性校准，避免二次改动。

### 3.4 slash scale
- 48×48 → 48×48，**scale 不变**（`slashFx` 的 0.5/0.75、环形 0.2~0.3 均保持），与美术包 §2.3 一致。

---

## 4. tint 兼容 + 用户图约束

### 4.1 现有 tint 汇总（已确认）
- `sword_proj`：`TitleScene:139` 0xf0d98c（淡金）、`586/732` 0xffd54a（金）、`876` 0xffe9a8（淡金）、`974/1000` 0xcfe8ff（冰蓝）、`1046` 无 tint。
- `slash`：`566` 0xff6b35（橙）、`815` 0x9fd8ff（冰蓝）、`832` 0x7fd0ff（蓝）、`834` 0xd8f0ff（浅蓝）、`1039` 0xcfe8ff（冰蓝）、`1091` 0xb39dff（紫）、`1444` 0xe67e22（橙）、`slashFx stage3` 0x9fd8ff（冰蓝）。

### 4.2 tint 乘法风险
`setTint` 是逐通道乘法：金色 tint（0xffd54a 蓝通道≈0.29）会把**青蓝色**（如 #7fd0ff）压成暗橄榄色。动画帧若剑身大量青蓝，金/淡金 tint 下会"染脏"。
- 约束：**剑身/弧身主体保持银白/寒白（#E8F0FF 系）占绝对主导，青蓝只出现在拖尾/剑芒薄层/点缀像素**；深色剑身、彩色剑身一律禁止（会污染全部 4 种 tint）。

### 4.3 给用户的出图配色硬约束（写进验收清单）
1. `sword_proj_1..8`：银白剑身（#E8F0FF）>90% 面积；青蓝（#7fd0ff/#9fd8ff）仅限尾迹/剑芒；**不做**金/蓝/紫剑身（引擎 tint 会叠加）。
2. `slash_1..6`：寒白高光（#E8F0FF）为主、剑青（#9fd8ff）点缀 ≤10%；不要出现橙/紫主色（引擎 tint 负责上色）。
3. 帧底尽量"近白亮部多、彩色暗部少"，保证任意 tint 后仍有"发光"感。
4. 朝向必须**尖角朝右**（slash）/ **剑尖朝右**（sword_proj），否则要引擎补 flip。

---

## 5. 性能结论

- **无需对象池**。Phaser anims 是逐实例帧推进（每 sprite 只存 currentFrame 引用），draw call 数与现在 `add.image` **完全持平**（72 发大庚剑阵 = 72 个 sprite = 72 draw call，现状相同）。
- 纹理成本：8×48×48 RGBA ≈ 74KB 显存，可忽略；8 张独立小纹理在 WebGL 多纹理单元内无压力（若介意可后续合成 sheet，非必须）。
- **关键纪律**：`anims.create` 只能在 `BootScene.create`（或首次使用时一次性）注册；**严禁**在每次 spawn 时 `anims.create`（会重复注册/泄漏）。
- 若后续真出现 GC 抖动（快速创建/销毁 72 弹），再考虑 `sword_proj_fly` sprite 小对象池；本次**不做**，避免提前复杂化。

---

## 6. 接入顺序（骨架先行）

**结论：等用户出图前就能先铺好 anims 骨架，且零回归（守卫降级到现状）。**

- **阶段 0（现在，等图前）——铺骨架**：
  1. `BootScene.ts` 加 `FX_ANIMS` 数组 + preload 逐帧 load + create 守卫式 `anims.create`（帧缺失时静默跳过）。
  2. 调用点分支 helper：`const spr = this.anims.exists('sword_proj_fly') ? this.add.sprite(x,y,'sword_proj_3').play('sword_proj_fly') : this.add.image(x,y,'sword_proj')`（后续链式参数共用）；slash 同理（anim 时**不 flip**、静态时 flip）。
  3. 命中销毁路径加 `sword_proj_hit` 播放 + `onComplete` 销毁。
  4. scale **保持现值**（见 §3.3 注）。
  - 此阶段用户未出图时：anims 不存在 → 100% 走静态路径，游戏表现与今天一致。
- **阶段 1**：用户按美术包交付 `sword_proj_1..8.png` / `slash_1..6.png` 到 `public/sprites/` → 骨架自动生效（无需再改代码）。
- **阶段 2**：核对（a）slash 朝向是否尖角朝右（否则补 flip）、（b）sword_proj 内容包围盒 → 按公式 `new = old × 32 / contentWidth` 校准 scale、fine-tune 帧率观感。
- **阶段 3（可选）**：稳定后移除静态兜底分支（保留静态 key 供环形特效使用）。

---

## 7. 待团队 lead 确认项

1. `sword_proj_fly` 采用美术包默认（1–4，repeat -1）还是加 `sword_proj_loop`（3–4）子循环给环绕剑阵？建议**两条都建**（loop 仅剑阵用）。
2. scale 校准：骨架阶段保持现值、出图后再按公式校准——是否认可？
3. 阶段 0（铺骨架）是否现在就开工？若开工，我会按 §6 落实并跑 `npm run typecheck` + `npm test`（不跑 build/dev）。
4. slash 动画交付后朝向校验，是否需要我在验收清单里加一条"尖角必须朝右"（建议加，防 AI 镜像）。
5. TitleScene 装饰掠剑是否纳入本次 anim 迁移（低优先，可后置）。
