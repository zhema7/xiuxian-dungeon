# 美术提示词包 · 动画版（序列帧特效）v2.0

> 版本：v2.0（ART-ANIM-002，P0 美术线）
> 负责人：美术方向 · 林绘澄
> 状态：草稿，供用户经生图 AI 逐帧出图后交主理人（team-lead）嵌入游戏本体
> 范围：**只产出提示词与文档，不生成图片、不改代码、不注册 key**（key 注册与主理人嵌入时做）
> 定位：**v1 的动画补充层**。v1（`docs/art/prompt-pack.md`）的静态提示词仍适用于背景类与所有"不打算做序列帧"的资产；本文档只覆盖"要做真动画（序列帧播放）"的特效。
> 基线：`docs/art/prompt-pack.md`（v1.0 静态提示词包）、`docs/art/art-bible-and-iteration-plan.md`（v0.2 色板/描边 `#0A0E1A`/限色/品质双编码）、`docs/04-美术素材AI生成规范.md`（尺寸/命名/帧表）、`docs/art/ART-EMBED-001-slash-report.md`（48×48 先例：裁剪 + 最近邻缩放 + scale 重调）

---

## 0. 动画制作总规范（写给用户：如何制作 + 要求）

### 0.1 两种序列帧方案（首选逐帧 PNG）

| 方案 | 做法 | 一致性 | 结论 |
|---|---|---|---|
| **A. 一帧一张独立 PNG**（推荐） | 每帧单独出一张图，逐帧生成 | **最好**：每次只画一帧，AI 不会自作主张合并/漂移 | **主力方案**，本包全部按此交付 |
| B. 整张 sprite sheet（横向排布） | 让 AI 一次画出多帧排成一行 | 差：AI 一次性画多帧，帧间角色/位置/配色容易飘，且每帧宽度难以保证严格相等 | 不推荐做主力；仅当生图工具只能出整图时用，且必须人工切帧校验 |

> 若用方案 B：要求"水平一行排布、每帧等宽、帧与帧不重叠、整体无网格线/无边框"；交付时注明 `帧宽×帧高×帧数`（见 §3.2）。

### 0.2 帧数建议表（按特效类型）

| 特效类型 | 代表 key | 帧数 | 动作节奏（播放序） | 是否循环 | 建议帧率 |
|---|---|---|---|---|---|
| 挥砍类 | `slash` | **4–6 帧** | 起手 → 挥出 → 弧光 → 消散 | 否（一次播放） | 12 fps |
| 弹道类 | `sword_proj` / `bolt` / `proj` | **6–8 帧** | 凝聚/出鞘 → 飞行本体 → 剑芒拉长 → 命中爆闪 → 碎光 → 残影消散 | 飞行段可循环，命中段否 | 飞行 10 fps / 命中 12 fps |
| 爆炸/冲击类 | `fx_bloodnova` / `fx_aoe_*` / `magic_burst` | **6–8 帧** | 核心闪 → 扩散 → 衰减 → 烟尘 | 否 | 12 fps |
| 光环/领域类 | `fx_formation` / `fx_dan_halo` / `fx_aoe_*`（环） | **4–6 帧** | 张开 → 稳定呼吸 → 收缩 | **可循环** | 6–8 fps（呼吸感） |
| 拖尾类 | `fx_blade_trail` | **3–4 帧** | 满尾 → 变细 → 消散 | 否（跟随主体播放一次） | 12 fps |

> 规则：**帧数够用即可，别贪多**。每多 1 帧 = 多一次 AI 一致性风险 + 多一次人工校验。低于 4 帧观感像"闪"不像"动画"，高于 8 帧对 16×16~48×48 的小特效收益递减。

### 0.3 硬性规格（动画版专用，叠加 v1 全部像素规范）

**每条提示词的负向词里都要体现（见 §0.5）：**

1. **全部帧严格同尺寸，且为 16 的倍数**：挥砍/弹道 **48×48**（或 64×64）；爆炸类可 **96×96**；小弹体（bolt/proj）动画建议 **32×32** 画布即可（内容仍是小弹体，周围留透明）。
2. **透明背景 PNG**、**无抗锯齿**、**无渐变辉光**（发光/辉光由引擎粒子层补，不烤进 sprite）、**1px `#0A0E1A` 描边**、像素硬边。
3. **弹道/挥砍类统一朝右（facing RIGHT）绘制**，游戏内按角度旋转/翻转（沿用 v1 朝右约定）。
4. **帧与帧之间主体位置/形态连续**：相邻帧动作描述要衔接；帧间只允许"形态/亮度"变化，不允许"位置漂移"（见 §0.4 对齐技巧）。
5. **调色板限色**：每帧单独 ≤ 12 色（art-bible §2.3 粒子特效限色）；**整组动画共享同一套 ≤ 12 色**，帧间不许换配色。
6. **帧 1 必须是最弱/最收敛状态**，帧尾是消散/归零状态，首尾之间形成一条完整生命周期，方便引擎一次性播放或按需切段。

### 0.4 生图 AI 逐帧技巧（保证帧间一致性的核心方法）

```
1. 写一条「风格基础提示词」（公共段）：配色 / 描边 / 质感 / 画布尺寸 / 朝向 —— 全帧复用，永不改动。
2. 每帧只追加一句「动作/形态描述」（逐帧段）：描述这一帧长什么样、和上一帧差在哪。
3. 若工具支持固定 seed：锁死 seed，只改「动作/形态描述」重新生成。
4. 若工具不支持固定 seed：
   - 先出第 1 帧作为「风格锚点图」；
   - 后续帧用「图生图」以第 1 帧为参考（img2img / 垫图），提示词 = 基础段 + 本帧动作句；
   - 每帧多抽 2~3 张，挑与上一帧最连续的一张，不连续就重抽。
5. 帧间连续性检查（出图后必做）：
   - 主体锚点对齐：弹道以「刃尖」为锚、挥砍以「弧心」为锚，各帧导出前先对齐到同一基准位置，避免帧间抖动；
   - 形态衔接：第 N 帧的消散尾迹，应是第 N+1 帧的主体起点；
   - 亮度节奏：起手暗 → 中段最亮 → 尾段变淡，形成"蓄力-爆发-衰减"曲线。
```

### 0.5 动画版统一负向词（比 v1 负向词多三条：运动模糊/重复图案/位置漂移）

```
中文统一负向：白色背景，模糊边缘，抗锯齿，运动模糊，照片写实，3D渲染，渐变光晕，
多把剑/重复图案，帧偏移，位置漂移，文字，水印，阴影贴图
英文统一负向：white background, blurry edges, anti-aliasing, motion blur, photorealistic,
3D render, gradient glow, extra swords/duplicated shapes, frame offset, position drift,
text, watermark, shadow decal
```

> 各帧可在此统一负向上追加帧特定词（如爆闪帧加"no lens flare"、弧光帧加"no closed ring"）。

### 0.6 制作步骤 checklist（用户侧）

```
1. 打开支持负面提示词的生图 AI（沿用 v1 使用的工具即可）。
2. 复制 §1/§2 的「风格基础提示词 + 第 1 帧动作句」→ 生成第 1 帧（这是全组的风格锚点）。
3. 锁 seed（或图生图垫第 1 帧）→ 只替换动作句 → 依次生成 2~8 帧，逐帧对照上一帧检查连续性。
4. 后期处理（重要，参照 ART-EMBED-001 先例）：
   a. 每帧按 Alpha 包围盒裁剪，去除多余空白；
   b. 最近邻（nearest-neighbor）缩放到统一尺寸（48×48 等），禁用平滑缩放；
   c. 以锚点（刃尖/弧心）对齐各帧主体，防止帧间抖动；
   d. 缩放后检查 1px #0A0E1A 描边是否清晰，若被压糊，在 48×48 画布上手工补描边；
   e. 确认透明底、无残留白边。
5. 按 §3 命名（sword_proj_1.png … sword_proj_8.png），放入 public/sprites/。
6. 告知主理人"已放入 xxx"，主理人做注册 + anims.create + npm run build 验证。
```

---

## 1. `sword_proj` 飞剑弹道 · 动画版（8 帧 / 48×48 / 朝右）

### 1.1 风格锚点与公共基础提示词（全帧复用）

> 对齐 v1 `sword_proj` 条目：剑修蓝色剑气基调（`#7fd0ff` / `#9fd8ff` 系），银白剑身为主、青蓝剑芒点缀。
> **tint 友好提醒**：引擎当前会给 `sword_proj` 多处 `setTint`（金 0xffd54a / 淡金 0xffe9a8 / 冰蓝 0xcfe8ff），
> 所以**剑身主体必须保持银白/近白占主导**，青蓝色只作为拖尾/剑芒点缀——这样染色乘法不会把剑身染成脏色（见 §3.4）。

**风格基础提示词（公共段，每帧提示词 = 本段 + 动作句）：**

```
中文基础：像素风飞剑弹道特效，细长飞剑能量刃，水平居中，朝向画面右侧（朝右），
银白剑身（#E8F0FF）为主，剑青蓝剑芒点缀（#7fd0ff/#9fd8ff），锐利三角刃尖，
1px深色描边（#0A0E1A），透明背景，无抗锯齿，无渐变光晕，无文字水印，锐利像素，48x48画布
英文基础：pixel art flying sword projectile effect, slender sword energy blade,
horizontally centered, facing RIGHT, silver-white blade (#E8F0FF) dominant with
sword-cyan aura accents (#7fd0ff/#9fd8ff), sharp triangular tip, 1px dark outline
(#0A0E1A), transparent background, no anti-aliasing, no gradient glow, no text,
no watermark, crisp pixels, 48x48 canvas
```

**统一负向词：** §0.5（各帧追加项见下表）

### 1.2 逐帧动作设计（8 帧连续形态：凝聚 → 出鞘 → 飞行 → 拉芒 → 爆闪 → 碎光 → 残影 → 消散）

> 连续性约定：**刃尖的 x 坐标全程保持在画面偏右同一列附近**（约画布 40/48 处），主体不左右漂移，只有形态/亮度变化。

| 帧 | 动作 | 形态说明 | 亮度 |
|---|---|---|---|
| 1 | 凝聚 | 画面中央一个青白亮点，隐约凝成 1~2 px 的短小剑影 | 暗 |
| 2 | 出鞘 | 亮点中伸出约 1/2 长的短剑，剑尖朝右，尾部开始出现 2 px 青色剑芒 | 中 |
| 3 | 飞行本体 | 完整银白细剑，长度约占画布 60%，尾部青蓝短尾（3 px 递减） | 亮 |
| 4 | 剑芒拉长 | 剑身不变，后方青蓝剑芒拖尾拉长变细（约 10 px 递减尾迹），速度感 | 最亮 |
| 5 | 命中爆闪 | 剑尖前方出现亮白四角星芒爆闪，星芒与剑尖重叠，是全组最亮一帧 | 峰值 |
| 6 | 碎光 | 剑身碎裂成 3~4 块青白碎片，放射状散开，碎片带 1px 描边 | 高 |
| 7 | 残影 | 碎片消散大半，残留 2~3 道青蓝残影尾迹，渐淡 | 中 |
| 8 | 消散 | 残影淡去，仅剩零星 1~2 个像素光点 | 暗 |

### 1.3 逐帧完整提示词表（可直接复制）

> 每帧提示词 = §1.1 基础段 + 下表「动作句」。负向词 = §0.5 统一负向 + 下表「帧特定负向」。

| 帧 | 动作句（CN） | 动作句（EN） | 帧特定负向 | 嵌入说明 |
|---|---|---|---|---|
| 1 | 单帧：一个小型青白亮点在画布中心，隐约凝成极短剑影，周围干净留白 | single frame: one small cyan-white light dot at canvas center barely forming a tiny blade silhouette, clean empty surroundings | — | 播放序第 1 帧；飞剑飞行段起点（若拆段，属 `sword_proj_fly` 起点） |
| 2 | 单帧：短剑从光点向右伸出约半长，剑尖朝右，尾部出现 2 像素青色剑芒 | single frame: short sword emerging rightward from the dot at half length, tip pointing right, 2-px cyan aura at tail | — | 播放序第 2 帧 |
| 3 | 单帧：完整银白细飞剑，长约画布六成，剑尖朝右，尾部 3 像素递减青蓝短尾，标准飞行姿态 | single frame: complete silver-white slender flying sword, about 60% of canvas, tip pointing right, 3-px fading cyan tail, standard flight pose | no motion blur | 播放序第 3 帧；**飞行本体基准帧**，若做飞行循环可用 3/4 两帧循环 |
| 4 | 单帧：剑身不变，后方青蓝剑芒拖尾拉长变细约 10 像素，速度感强烈 | single frame: blade unchanged, cyan aura trail stretched long and thin behind about 10 px, strong sense of speed | no gradient glow（拖尾用色块阶梯，不用柔光） | 播放序第 4 帧；飞行段收尾帧 |
| 5 | 单帧：剑尖前方亮白四角星芒爆闪，星芒与剑尖重叠，全组最亮 | single frame: bright-white four-point star flash at the sword tip overlapping it, brightest frame of the set | no lens flare, no soft glow | 播放序第 5 帧；**命中触发帧**（若拆段，属 `sword_proj_hit` 起点） |
| 6 | 单帧：剑身碎裂成 3 至 4 块青白碎片，放射状散开，每块带深色描边 | single frame: blade shatters into 3-4 cyan-white shards radiating outward, each shard outlined | — | 播放序第 6 帧 |
| 7 | 单帧：碎片消散大半，残留 2 至 3 道青蓝残影尾迹，渐淡 | single frame: most shards gone, leaving 2-3 fading cyan afterimage trails | no motion blur | 播放序第 7 帧 |
| 8 | 单帧：残影完全淡去，仅剩零星 1 至 2 个像素光点 | single frame: afterimages fully faded, only 1-2 sparse pixel light dots remain | — | 播放序第 8 帧；播放完销毁 |

**第 1 帧完整样例（给主理人看质量用）：**

```
中文：像素风飞剑弹道特效，细长飞剑能量刃，水平居中，朝向画面右侧（朝右），银白剑身（#E8F0FF）为主，剑青蓝剑芒点缀（#7fd0ff/#9fd8ff），锐利三角刃尖，1px深色描边（#0A0E1A），透明背景，无抗锯齿，无渐变光晕，无文字水印，锐利像素，48x48画布。单帧：一个小型青白亮点在画布中心，隐约凝成极短剑影，周围干净留白
负向：白色背景，模糊边缘，抗锯齿，运动模糊，照片写实，3D渲染，渐变光晕，多把剑/重复图案，帧偏移，位置漂移，文字，水印，阴影贴图
```

### 1.4 `sword_proj` 嵌入说明（给主理人）

- **动画拆段建议**：8 帧是一条完整生命周期，但弹道实际飞行中「命中」发生在运动结束时。建议主理人拆两条 anim 用同一组帧：
  - `sword_proj_fly` = 帧 1–4（`repeat: -1` 或播放一次后停在帧 4，随弹道位移）
  - `sword_proj_hit` = 帧 5–8（命中时切换播放，播完销毁）
- **尺寸变化**：v1 是 12×6 单帧弹体，动画版升级为 48×48 画布。**所有 `add.image(…,'sword_proj')` 的 `setScale` 需按新尺寸重调**（参照 ART-EMBED-001 对 slash 的先例：新底图尺寸变化 → 所有引用点 scale 按比例修正）。
- **调用方式**：`add.image(x,y,'sword_proj')` → 改为 `add.sprite(x,y,'sword_proj_sheet')`（或逐帧 key）+ `.play('sword_proj_fly')`，命中时切换 `sword_proj_hit`。
- **tint 仍可用**：帧底以银白为主，`setTint` 染色（金/淡金/冰蓝）全帧生效。

---

## 2. `slash` 剑光弧 · 动画版（6 帧 / 48×48 / 朝右，可选但建议出）

> 现状：`slash` 已由用户生图并嵌入（`ART-EMBED-001`，48×48 静态单帧 + 引擎 tween 缩放/淡出模拟动画）。**若要真动画，需按本节约 6 帧重出**，主理人将把引擎侧从 tween 改为 `anims.play`。

### 2.1 公共基础提示词（全帧复用）

```
中文基础：像素风近战剑光特效，白色新月形剑弧，朝向画面右侧（朝右），锐利尖角，
外缘1px深色描边（#0A0E1A），内填寒白高光（#E8F0FF）带少量剑青点缀（#9fd8ff），
透明背景，无抗锯齿，无渐变光晕，无文字水印，锐利像素，48x48画布，弧心水平居中
英文基础：pixel art melee slash effect, white crescent sword arc facing RIGHT,
sharp pointed ends, 1px dark outline (#0A0E1A) on outer edge, inner icy-white
highlight (#E8F0FF) with a few sword-cyan accents (#9fd8ff), transparent background,
no anti-aliasing, no gradient glow, no text, no watermark, crisp pixels,
48x48 canvas, arc centered horizontally
```

**统一负向词：** §0.5 + 追加 `no closed ring, no full circle`（AI 容易把弧画成闭环圆圈）

### 2.2 逐帧完整提示词表（6 帧：起手 → 下劈 → 满弧 → 回弹 → 残影 → 消散）

> 连续性约定：**弧心 x 坐标固定在同一列**（画布中偏右，约 30/48 处），弧的旋转只做形态变化，不整体平移。

| 帧 | 动作句（CN） | 动作句（EN） | 帧特定负向 | 嵌入说明 |
|---|---|---|---|---|
| 1 | 单帧：细窄竖立的一线剑光，收束成光，亮度最低，占画布中心偏右 | single frame: one thin narrow vertical line of sword light, tight and dim, centered slightly right | — | 播放序第 1 帧（起手，最暗） |
| 2 | 单帧：剑光从右上向左下劈出，形成斜向短弧，弧长约画布三分之一 | single frame: sword light slashes from upper-right to lower-left, short diagonal arc about 1/3 canvas | — | 播放序第 2 帧 |
| 3 | 单帧：完整月牙形剑弧，弧光最饱满最亮，锐利尖角朝右 | single frame: complete crescent sword arc, fullest and brightest, sharp ends pointing right | no closed ring | 播放序第 3 帧（峰值帧，打击判定视觉点） |
| 4 | 单帧：主弧内侧出现缺口并变薄，旁生一道细短副弧，回弹感 | single frame: main arc gets a gap and thins, a thin short secondary arc beside it, recoil feel | — | 播放序第 4 帧 |
| 5 | 单帧：主弧明显变淡，后方残留 1 至 2 道残影弧 | single frame: main arc clearly fades, 1-2 afterimage arcs behind | no motion blur | 播放序第 5 帧 |
| 6 | 单帧：弧光碎裂成光点消散，仅剩零星像素 | single frame: arc shatters into light dots and dissolves, only sparse pixels remain | — | 播放序第 6 帧；播完销毁 |

### 2.3 `slash` 嵌入说明（给主理人，重要）

- **只迁移"剑光弧"用途**：`DungeonScene` 中 `slash` 既做近战剑光（`slashFx` / melee_arc，应改 anims.play），**也做冰环/旋风环的环形基底**（`frost_nova` / `whirlwind` 等 `add.image(…,'slash')` 旋转成环）。
  - 环形特效**不要**播放下劈序列帧（观感是"劈砍"不是"环"）；
  - 建议：环形用途保留静态单帧 + tween（继续用现成 48×48 单帧），或另出「环形专用 2~4 帧呼吸循环」（按 §0.2 光环类规则，可后续排期）。
- **tint 仍可用**：`slash` 全组以寒白为主，现有各色 tint（橙 0xff6b35 / 冰蓝 0x9fd8ff / 0x7fd0ff / 紫 0xb39dff / 0xcfe8ff）全帧生效。
- **scale 重调**：沿用 ART-EMBED-001 的 0.5 系数体系，动画版帧尺寸不变（仍 48×48），`slashFx` 的 scale 常量无需再改；但 tween 淡出逻辑要改为 `anims` 播放 + `onComplete` 销毁。

---

## 3. 命名与交付规范（与工程接入对齐）

### 3.1 逐帧独立 PNG（推荐，本包默认）

- 命名：`{key}_{帧号}.png`，**帧号从 1 起**，顺序 = 播放序。
- 示例：`sword_proj_1.png` … `sword_proj_8.png`（8 个文件）；`slash_1.png` … `slash_6.png`（6 个文件）。
- 放入：`public/sprites/`，与散图同一目录。

### 3.2 整张 sheet（备用方案）

- 命名：`{key}_sheet.png`。
- 必须注明：`帧宽 × 帧高 × 帧数`，如 **48×48×8**（横向一行排布 → 整图 384×48）。
- 要求：每帧严格等宽、无网格线/无边框/无帧间重叠。

### 3.3 主理人嵌入时的预期（注册 + anims.create）

- **逐帧方案**：每个 `{key}_{n}.png` 用 `load.image` 注册为独立纹理（key = `sword_proj_1`…`sword_proj_8`），然后：
  - `anims.create({ key: 'sword_proj_fly', frames: [{key:'sword_proj_1'},…,{key:'sword_proj_4'}], frameRate: 10, repeat: -1 })`
  - `anims.create({ key: 'sword_proj_hit', frames: [{key:'sword_proj_5'},…,{key:'sword_proj_8'}], frameRate: 12, repeat: 0 })`
  - 建议在 `BootScene` 增加一个 `FX_ANIMS` 配置数组（仿照现有 `ANIM_CLASSES` 循环），把逐帧 key 批量 load + anims 批量 create。
- **sheet 方案**：`load.spritesheet('sword_proj_sheet', 'sprites/sword_proj_sheet.png', { frameWidth: 48, frameHeight: 48 })` + `anims.create({ key:'sword_proj_fly', frames: this.anims.generateFrameNumbers('sword_proj_sheet', { start:0, end:3 }), frameRate:10, repeat:-1 })`。
- **使用**：`add.image(x,y,'sword_proj')` → `add.sprite(x,y,'sword_proj_sheet').play('sword_proj_fly')`；命中时切 `sword_proj_hit`，`onComplete` 销毁。
- **帧率约定**：挥砍/爆炸 12 fps、弹道飞行 10 fps、光环呼吸 6–8 fps（与 docs/04 §4.3 的 attack/cast 10fps 同口径）。

### 3.4 关键提醒（防止接入翻车）

1. **tint 友好**：动画版所有帧底色保持银白/寒白为主，`setTint` 染色才能全帧正确（sword_proj 被金/淡金/冰蓝 tint，slash 被橙/蓝/紫 tint）。
2. **scale 重调**：sword_proj 从 12×6 → 48×48，所有引用点 `setScale` 需按比例修正（参照 ART-EMBED-001 slash 先例）；slash 保持 48×48 不变。
3. **帧率**：别用 30 fps——小特效 10~12 fps 才有像素动画的"顿挫爽感"。
4. **不要注册 `sword_proj` 单帧为动画 key**：若保留旧 `sword_proj.png` 做静态兜底，动画 key 用 `sword_proj_fly` / `sword_proj_hit`，避免与散图 key 冲突。

---

## 4. 背景类资产（bg_*）正确路线（重要，避免浪费产能）

**明确结论：关卡背景（`bg_qingming` / `bg_youming` / `bg_chiyan` / `bg_tianji` / `bg_wujin` / `bg_dongfu` 等）不走帧动画。**

- 背景仍是**单张静态图**（360×640 不透明整图，按 v1 §2.1 出图），不要出多帧、不要出序列帧。
- 背景的"动态感"由**引擎侧动态**承担，不烤进 sprite：
  - 视差滚动（多层背景位移）
  - 粒子层（飘尘 / 鬼火 / 火星 / 星点）
  - 着色器光柱 / 闪烁 / 流动（`DungeonScene` 后处理层）
- 若以后想要"真动态背景"，正确路线是 **title_bg 同款图生视频**（`title_bg.mp4` 先例，见 docs/04 §3.2c：H.264、8~15s 无缝循环、≤8 MB），而不是逐帧 PNG。
- **产能守则**：序列帧产能只投给"战斗反馈"特效（§0.2 表内类型）；背景一律静态 + 引擎动态。避免用户把所有图都出成序列帧。

---

## 5. v2 交付汇总表 + 建议生成顺序

| key | 类型 | 帧数 | 单帧尺寸 | 朝右 | 交付形态 | anim key（主理人侧） | 建议帧率 |
|---|---|---|---|---|---|---|---|
| `sword_proj` | 弹道 | 8 | 48×48 | 是 | `sword_proj_1~8.png` | `sword_proj_fly`(1–4) / `sword_proj_hit`(5–8) | 10 / 12 fps |
| `slash` | 挥砍 | 6 | 48×48 | 是 | `slash_1~6.png` | `slash_anim`（一次播放） | 12 fps |

**建议生成顺序：**
1. **`sword_proj`（8 帧）优先**——飞剑是招牌意象，且 8 帧完整生命周期（含命中爆闪）一次出齐，观感跃升最大。
2. **`slash`（6 帧）次之**——真动画替换 tween，近战打击感再上一档（可选，用户时间紧可先缓）。

> 后续如需动画：`bolt`/`proj`（32×32、飞行 2 帧循环 + 命中爆闪 4 帧）、`fx_bloodnova` / `fx_aoe_*`（96×96、6–8 帧爆炸）、`fx_formation` / `fx_dan_halo`（48×48、4–6 帧呼吸循环）——按 §0.2 表出即可，本包不展开。

---

## 附录 · 与现有文档引用关系

- `docs/art/prompt-pack.md`（v1.0）：静态提示词包；v2 是**动画补充层**，v1 静态提示词仍适用于背景类与不做序列帧的资产。
- `docs/art/art-bible-and-iteration-plan.md`（v0.2）：色板（剑修霜白 #E8F0FF + 剑青 #4AC0D0）、描边 #0A0E1A、粒子特效限色 ≤12、品质双编码——本包全部引用。
- `docs/04-美术素材AI生成规范.md`：尺寸 16 倍数、命名、目录、朝右约定、帧表帧率（idle 8 / walk 12 / attack-hit-cast 10）——本包 §3 对齐。
- `docs/art/ART-EMBED-001-slash-report.md`：48×48 先例（裁剪 + 最近邻缩放 + scale 重调）——本包 §0.6 后期处理与 §3.4 scale 提醒直接引用。
- 嵌入与 key 注册：由主理人（team-lead）在 `BootScene.ts` / `textures.ts` / `DungeonScene.ts` 完成，不在本文档范围。

---

**END · v2.0 · 动画版提示词包（sword_proj 8 帧 + slash 6 帧 + 总规范）**
