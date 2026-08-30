# 美术提示词包 · 动画版（序列帧特效）v3.0

> 版本：v3.0（ART-ANIM-003，P0 美术线）
> 负责人：美术方向 · 林绘澄
> 状态：草稿，供用户经生图 AI 逐帧出图后交主理人（team-lead）嵌入游戏本体
> 范围：**只产出提示词与文档，不生成图片、不改代码、不注册 key**（key 注册与主理人嵌入时做）
> 定位：**v2 的第二批序列帧扩充**。v2（`docs/art/prompt-pack-anim-v2.md`）已交付 `sword_proj`（8 帧）+ `slash`（6 帧）并集成；本包再补 5 套**可复用**序列帧，用「银白基色 + 引擎 setTint 派生」策略一图多色，覆盖冰环/火溅/紫爆/飞剑火花/火弹/敌弹等一批当前仍用 `slash`/`bolt`/`proj` 静态图凑合的调用点。
> 基线（全部沿用，不重述）：`docs/art/prompt-pack-anim-v2.md`（§0 动画总规范、§0.4 逐帧一致性技巧、§0.5 统一负向词、§3 命名与交付）、`docs/art/art-bible-and-iteration-plan.md`（色板/描边 `#0A0E1A`/限色 ≤12/品质双编码）、`docs/04-美术素材AI生成规范.md`（尺寸 16 倍数/命名/帧率）、`docs/art/ART-EMBED-001-slash-report.md`（48×48 先例：裁剪 + 最近邻缩放 + scale 重调）

---

## 0. 本包总览（先读这里）

### 0.1 五套特效一览

| # | key | 类型 | 帧数 | 单帧尺寸 | 朝向 | 是否循环 | 基础色（务必） | 引擎 tint 派生 | 建议帧率 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `fx_ring` | 扩散环/冲击波光环 | 8 | 48×48 | 无（径向对称） | 否（一次性） | **银白** `#E8F0FF` | 冰蓝 / 火橙 | 12 fps |
| 2 | `fx_splash` | 径向溅射 + 碎屑爆点 | 8 | 48×48 | 无（径向对称） | 否（一次性） | **银白** `#E8F0FF` | 火橙 / 神通紫 | 12 fps |
| 3 | `fx_spark` | 小火花（快速亮爆） | 6 | 48×48 | 无（放射） | 否（一次性、快） | **银白** `#E8F0FF` | 剑青 | 14 fps（快） |
| 4 | `bolt_fly` | 飞行火弹/能量弹 | 8 | 48×48 | **朝右** | 飞行中循环 | **烘焙火色**（外橙→内黄白） | 动画分支不加 tint | 10 fps |
| 5 | `proj_fly` | 基础弹道（敌方子弹） | 6 | 48×48 | **朝右** | 循环 | **银白** `#E8F0FF` | 按敌种可选 tint | 10 fps |

> `fx_firevortex`（火焰漩涡，Tier3）本次**不做**，附在 §9「后续可选」占位，待排期。

### 0.2 核心策略：一图多色（务必遵守）

**基色一律画银白/寒白**（仅 `bolt_fly` 是例外，走烘焙火色、动画分支不加 tint，见 §7.2），运行时其余四套用 Phaser `setTint` 乘法染色派生冰蓝 / 火橙 / 紫 / 青。**不要每种颜色单独出一套图**——那既浪费产能又难保证帧间一致。

- `setTint` 是**乘法**：底色越白，染色后越接近目标色且不脏；底色若本身带蓝，染成橙会变脏灰。**所以基色必须以近白为主导，颜色只作点缀。**（详见 §7）
- 例：`fx_ring` 出一套银白 → 旋风环不 tint（保持银白）、冰环 `setTint(0x9fd8ff)`、玄冥冰爆 `setTint(0x7fd0ff)`。一套图覆盖三处。

### 0.3 硬规则（全 5 套复用 v2 §0.3，不重述，只强调差异点）

沿用 v2 §0.3 全部像素规范，本包**特别强调**：

1. **逐帧独立透明 PNG**，命名 `{key}_{n}.png`，帧号从 1 起 = 播放序。
2. **尺寸严格 16 的倍数**：**全部 5 套统一 48×48**（原 v2 概念中的 32×32 小弹体本案已统一升 48×48，内容仍居中、四周留透明）。全套帧同尺寸。
3. **透明底、无抗锯齿、无渐变辉光**（辉光/发光交给引擎粒子层与后处理着色器叠加，**绝不烘烤进 sprite**）、**1px `#0A0E1A` 描边**、像素硬边。
4. **方向性特效尖角/飞行朝右**（`bolt_fly`/`proj_fly`）：引擎用 `setRotation`/`setFlipX` 转向；径向对称特效（`fx_ring`/`fx_splash`/`fx_spark`）无朝向。
5. **调色板限色**：每帧 ≤12 色，**整组共享同一套 ≤12 色**，帧间不换配色（art-bible §2.3 粒子特效限色）。
6. **帧 1 = 最弱/最收敛，帧尾 = 消散/归零**，首尾构成一条完整生命周期。
7. **别烤辉光**：需要"发光感"的（`bolt_fly` 的火焰、`fx_spark` 的亮爆），用**限色色块阶梯**表现明暗层次，不要柔光渐变——发光由引擎 additive 粒子补。

### 0.4 统一负向词

全 5 套复用 v2 §0.5 统一负向词（此处不重述）。各套的**帧特定负向**在各节表格内标注。环形/径向类额外强调 `no square frame border, no grid lines`（AI 容易给径向特效加外框）。

---

## 1. `fx_ring` 扩散环 / 冲击波光环（8 帧 / 48×48 / 无朝向 / 一次性）

### 1.1 帧数与尺寸
- **8 帧**，一次性（扩张到最大后即消散，不循环）。
- **48×48**，径向对称（圆心 = 画布中心，各帧圆心不漂移）。
- 建议帧率 **12 fps**。

### 1.2 用途与色彩派生
- **旋风环**（whirlwind，`DungeonScene` L803）：不 tint，保持银白。
- **冰环**（frost_nova，L819）：`setTint(0x9fd8ff)` → 冰蓝。
- **玄冥冰爆**（frost_nova_burst，L836 主环 + L838 副环）：双层叠放，主环 `setTint(0x7fd0ff)`、副环 `setTint(0xd8f0ff)`，两层用同一套 `fx_ring` 帧、不同 scale/delay 播放。
- 视觉必须读作**"向外扩张的能量环 / 冲击波"**——一圈锐利的环带向外推、边缘越推越薄越淡，中心镂空透明（不是实心圆盘）。

### 1.3 硬规则
复用 §0.3。本套额外：
- **中心镂空**：环是"圆环带"不是"实心圆"，中心透明，方便叠在角色/地面上不糊成一坨。
- **径向对称**：圆环上下左右一致，不带方向尖角。
- 帧特定负向追加：`no solid disk, no filled circle, no square frame border, no grid lines`。

### 1.4 逐帧技术（帧间变化什么：扩张 + 变薄 + 变淡）

> 连续性约定：**圆心固定在画布中心（24,24）**，各帧只有"半径变大、环带变薄、亮度变淡"三个量在变，圆心绝不漂移。

| 帧 | 半径（占 48 画布） | 环带粗细 | 形态 | 亮度 |
|---|---|---|---|---|
| 1 | 极小（约 6px 直径） | 粗（3px） | 中心一个亮白小实点将裂开成环，起手最收敛 | 暗 |
| 2 | 小（约 14px） | 粗（3px） | 明确的银白细环，边缘锐利，最亮一圈 | 峰值 |
| 3 | 中（约 22px） | 中（2~3px） | 环继续外扩，环带开始变薄 | 亮 |
| 4 | 中大（约 30px） | 中（2px） | 环外扩，出现 4~6 个向外的短放射刺（冲击感） | 亮 |
| 5 | 大（约 38px） | 细（2px） | 环接近画布边，环带明显变薄，放射刺变淡 | 中 |
| 6 | 更大（约 44px，贴边） | 细（1~2px） | 环几乎抵边，开始出现断口（不再完整闭合） | 中低 |
| 7 | 贴边（约 46px） | 极细（1px） | 环碎成 6~8 段弧片向外散，间隙透明 | 低 |
| 8 | 边缘外 | — | 仅剩零星 1~3 个像素光点，环基本消散 | 极低 |

### 1.5 逐帧完整提示词（可直接复制）

**风格基础提示词（公共段，每帧 = 本段 + 动作句）：**
```
中文基础：像素风扩散冲击波光环特效，圆心居中，银白色能量圆环（#E8F0FF）为主，
中心镂空透明，锐利像素环带，1px深色描边（#0A0E1A），径向对称，
透明背景，无抗锯齿，无渐变光晕，无外框，无文字水印，48x48画布
英文基础：pixel art expanding shockwave ring effect, centered, silver-white
energy ring (#E8F0FF) dominant, hollow transparent center, crisp pixel ring band,
1px dark outline (#0A0E1A), radially symmetric, transparent background,
no anti-aliasing, no gradient glow, no frame border, no text, no watermark, 48x48 canvas
```
**统一负向：** v2 §0.5 + `no solid disk, no filled circle, no square frame border, no grid lines`

| 帧 | 动作句（CN） | 动作句（EN） | 帧特定负向 |
|---|---|---|---|
| 1 | 单帧：画布正中一个约6像素的银白亮实点，即将裂开成环，四周干净透明 | single frame: a ~6px silver-white bright dot at exact center about to split into a ring, clean transparent surroundings | no ring yet too large |
| 2 | 单帧：一个约14像素直径的银白细圆环，环带清晰锐利，全组最亮，中心镂空 | single frame: a ~14px diameter silver-white thin ring, crisp sharp band, brightest of the set, hollow center | no solid disk |
| 3 | 单帧：圆环外扩到约22像素，环带略变薄，亮度略降，中心仍镂空 | single frame: ring expanded to ~22px, band slightly thinner, slightly dimmer, still hollow | no filled circle |
| 4 | 单帧：圆环外扩到约30像素，环上生出4到6根向外短放射刺，冲击感强 | single frame: ring expanded to ~30px with 4-6 short outward radial spikes, strong impact feel | — |
| 5 | 单帧：圆环外扩到约38像素接近画布边缘，环带变细，放射刺变淡 | single frame: ring at ~38px near canvas edge, band thinner, spikes fading | no motion blur |
| 6 | 单帧：圆环贴近画布边约44像素，环带极细并出现1到2处断口 | single frame: ring ~44px near border, very thin band with 1-2 gaps opening | — |
| 7 | 单帧：圆环碎裂成6到8段弧片向外飞散，段与段之间透明间隙 | single frame: ring shatters into 6-8 arc fragments flying outward, transparent gaps between | — |
| 8 | 单帧：仅剩零星1到3个像素光点，圆环基本消散 | single frame: only 1-3 sparse pixel dots remain, ring mostly dissolved | — |

**第 1 帧完整样例：**
```
中文：像素风扩散冲击波光环特效，圆心居中，银白色能量圆环（#E8F0FF）为主，中心镂空透明，锐利像素环带，1px深色描边（#0A0E1A），径向对称，透明背景，无抗锯齿，无渐变光晕，无外框，无文字水印，48x48画布。单帧：画布正中一个约6像素的银白亮实点，即将裂开成环，四周干净透明
负向：白色背景，模糊边缘，抗锯齿，运动模糊，照片写实，3D渲染，渐变光晕，多把剑/重复图案，帧偏移，位置漂移，文字，水印，阴影贴图，实心圆盘，方形外框，网格线
```

### 1.6 命名 + 交付
- 逐帧透明 PNG：`fx_ring_1.png` … `fx_ring_8.png`（8 个文件），48×48，不烘烤辉光。
- 落地目录：`public/sprites/`。
- 主理人侧（参考）：注册 `fx_ring_1..8` 为独立纹理 → `anims.create({ key:'fx_ring', frames:[fx_ring_1..8], frameRate:12, repeat:0 })`；把 L803/L819/L836/L838 的 `add.image(...,'slash')` + tween 缩放 改为 `add.sprite(...,'fx_ring_1').play('fx_ring')` + `setTint`；玄冥冰爆双环用两个 sprite（不同 scale/delay）。

---

## 2. `fx_splash` 径向溅射 + 碎屑爆点（8 帧 / 48×48 / 无朝向 / 一次性）

### 2.1 帧数与尺寸
- **8 帧**，一次性（爆开 → 碎屑飞散 → 消散）。
- **48×48**，径向放射（爆心 = 画布中心）。
- 建议帧率 **12 fps**。

### 2.2 用途与色彩派生
- **爆裂溅射**（火弹 40% 溅射，`DungeonScene` L1478）：`setTint(0xe67e22)` → 火橙。
- **神通紫爆**（雷电类神通落点，L1125）：`setTint(0xb39dff)` → 紫。
- 视觉读作**"一个点爆开、向四周甩出碎屑与溅射条"**——比 `fx_ring` 更"脏"更有颗粒（碎块 + 溅点 + 短放射条），不是干净圆环。

### 2.3 硬规则
复用 §0.3。本套额外：
- **放射不对称允许**：溅射条长短可略有随机（更自然），但**爆心必须居中不漂移**。
- **碎屑带描边**：每块碎屑/溅点都是有 1px 深色描边的小色块，不是柔化噪点。
- 帧特定负向追加：`no smooth spray, no soft particles, no square frame border`。

### 2.4 逐帧技术（帧间变化什么：核心闪 → 放射溅出 → 碎屑外飞 → 衰减）

> 连续性约定：**爆心固定画布中心**；帧间变化为"核心亮点 → 放射溅射条伸长 → 断成碎屑 → 碎屑外飞变淡"。

| 帧 | 形态 | 亮度 |
|---|---|---|
| 1 | 中心一个银白亮实点，周围极短的 4 个方向小凸起，蓄势 | 中 |
| 2 | 中心爆亮，向 8 个方向甩出短溅射条（约 8px），全组最亮 | 峰值 |
| 3 | 溅射条伸长到约 14px，条末端开始崩出 1~2 px 碎屑点 | 亮 |
| 4 | 溅射条末端断裂，碎屑点脱离主体向外飞（约 6~10 个碎块） | 亮 |
| 5 | 主体核心变暗收缩，碎屑继续外飞并散开，间距变大 | 中 |
| 6 | 核心几乎熄灭，碎屑飞到画布外围，数量减少、变淡 | 中低 |
| 7 | 仅剩 3~4 个外围碎屑残点，拖出极短淡尾 | 低 |
| 8 | 仅剩零星 1~2 个像素点，溅射消散 | 极低 |

### 2.5 逐帧完整提示词（可直接复制）

**风格基础提示词（公共段）：**
```
中文基础：像素风径向溅射爆点特效，爆心居中，银白色（#E8F0FF）能量碎屑与放射溅射条，
每块碎屑带1px深色描边（#0A0E1A），颗粒感硬边像素，径向放射，
透明背景，无抗锯齿，无渐变光晕，无外框，无文字水印，48x48画布
英文基础：pixel art radial splash burst effect, centered burst core, silver-white
(#E8F0FF) energy debris and radial splash streaks, each shard with 1px dark outline
(#0A0E1A), gritty hard-edge pixels, radial spread, transparent background,
no anti-aliasing, no gradient glow, no frame border, no text, no watermark, 48x48 canvas
```
**统一负向：** v2 §0.5 + `no smooth spray, no soft particles, no square frame border`

| 帧 | 动作句（CN） | 动作句（EN） | 帧特定负向 |
|---|---|---|---|
| 1 | 单帧：画布中心一个银白亮实点，四个方向各一小凸起，蓄势待爆 | single frame: silver-white bright dot at center with 4 tiny directional bumps, about to burst | — |
| 2 | 单帧：中心爆亮向8个方向甩出约8像素短溅射条，全组最亮 | single frame: center flashes and throws 8 short ~8px splash streaks radially, brightest of the set | no soft glow |
| 3 | 单帧：溅射条伸长到约14像素，末端崩出1到2像素碎屑点 | single frame: streaks stretch to ~14px, tips breaking into 1-2px debris dots | — |
| 4 | 单帧：溅射条末端断裂，6到10块碎屑脱离主体向外飞散 | single frame: streak tips detach, 6-10 debris shards fly outward from core | no smooth spray |
| 5 | 单帧：核心变暗收缩，碎屑继续外飞散开、间距变大 | single frame: core darkens and shrinks, debris keeps flying outward with wider spacing | — |
| 6 | 单帧：核心几乎熄灭，碎屑到达画布外围、数量减少变淡 | single frame: core nearly extinguished, debris at outer edge, fewer and dimmer | no motion blur |
| 7 | 单帧：仅剩3到4个外围碎屑残点，拖出极短淡尾 | single frame: only 3-4 outer debris remain with very short faint trails | — |
| 8 | 单帧：仅剩零星1到2个像素点，溅射消散 | single frame: only 1-2 sparse pixel dots remain, splash dissolved | — |

**第 1 帧完整样例：**
```
中文：像素风径向溅射爆点特效，爆心居中，银白色（#E8F0FF）能量碎屑与放射溅射条，每块碎屑带1px深色描边（#0A0E1A），颗粒感硬边像素，径向放射，透明背景，无抗锯齿，无渐变光晕，无外框，无文字水印，48x48画布。单帧：画布中心一个银白亮实点，四个方向各一小凸起，蓄势待爆
负向：白色背景，模糊边缘，抗锯齿，运动模糊，照片写实，3D渲染，渐变光晕，多把剑/重复图案，帧偏移，位置漂移，文字，水印，阴影贴图，柔化喷雾，柔光粒子，方形外框
```

### 2.6 命名 + 交付
- 逐帧透明 PNG：`fx_splash_1.png` … `fx_splash_8.png`（8 个文件），48×48，不烘烤辉光。
- 落地目录：`public/sprites/`。
- 主理人侧（参考）：`anims.create({ key:'fx_splash', frames:[fx_splash_1..8], frameRate:12, repeat:0 })`；L1478 火弹溅射 `setTint(0xe67e22)`、L1125 神通紫爆 `setTint(0xb39dff)`；替换现有 `add.image(...,'slash')` + tween。

---

## 3. `fx_spark` 小火花（快速亮爆）（6 帧 / 48×48 / 无朝向 / 一次性、快）

### 3.1 帧数与尺寸
- **6 帧**，一次性、**快**（生命周期短，"啪"一下）。
- **48×48**（原拟 32×32，已按用户决策统一升 48×48；内容居中于约 24×24 区域、四周留透明）。
- 建议帧率 **14 fps**（比其他快一档，强调脆亮）。

### 3.2 用途与色彩派生
- **飞剑触敌火花**（`DungeonScene` L1071）：`setTint(0xcfe8ff)` → 剑青偏白（与飞剑蓝气呼应）。
- 视觉读作**"命中瞬间的一小簇脆亮火花"**——几根短放射亮线 + 几点飞溅火星，快闪即逝。

### 3.3 硬规则
复用 §0.3。本套额外：
- **小而脆**：内容不要占满 48×48，控制在中心约 24×24 区域内，四周透明（命中点用）。
- **放射亮线**：3~5 根短直亮线从中心射出（星芒感），不是圆环。
- 帧特定负向追加：`no big explosion, no ring, no square frame border`。

### 3.4 逐帧技术（帧间变化什么：闪现 → 放射 → 飞星 → 熄）

> 连续性约定：**中心点固定（24,24）**，6 帧走"暗→爆亮→放射→飞星→淡→熄"的快速曲线。

| 帧 | 形态 | 亮度 |
|---|---|---|
| 1 | 中心一个 2px 银白亮点，起手 | 中 |
| 2 | 亮点爆开成 3~5 根短放射亮线（星芒），全组最亮 | 峰值 |
| 3 | 放射亮线末端崩出 3~5 个 1px 飞溅火星，亮线变短 | 亮 |
| 4 | 亮线基本消失，飞星向外飞、间距变大 | 中 |
| 5 | 飞星变淡，仅剩 2~3 个外围火星残点 | 低 |
| 6 | 仅剩 1 个像素残点，火花熄灭 | 极低 |

### 3.5 逐帧完整提示词（可直接复制）

**风格基础提示词（公共段）：**
```
中文基础：像素风小型命中火花特效，中心居中，银白色（#E8F0FF）短放射亮线与飞溅火星，
1px深色描边（#0A0E1A），锐利硬边像素，内容集中于画布中心中范围、四周透明，
透明背景，无抗锯齿，无渐变光晕，无外框，无文字水印，48x48画布
英文基础：pixel art small hit-spark effect, centered, silver-white (#E8F0FF) short
radial spark lines and flying sparks, 1px dark outline (#0A0E1A), crisp hard-edge
pixels, content concentrated at canvas center with transparent margins,
transparent background, no anti-aliasing, no gradient glow, no frame border, no text,
no watermark, 48x48 canvas
```
**统一负向：** v2 §0.5 + `no big explosion, no ring, no square frame border`

| 帧 | 动作句（CN） | 动作句（EN） | 帧特定负向 |
|---|---|---|---|
| 1 | 单帧：画布中心一个约2像素银白亮点，起手 | single frame: a ~2px silver-white bright dot at center, initial | — |
| 2 | 单帧：亮点爆开成3到5根短放射亮线（星芒状），全组最亮 | single frame: dot bursts into 3-5 short radial spark lines (star burst), brightest of the set | no soft glow |
| 3 | 单帧：放射亮线末端崩出3到5个1像素飞溅火星，亮线变短 | single frame: spark-line tips break into 3-5 one-pixel flying sparks, lines shorter | — |
| 4 | 单帧：亮线基本消失，飞星向外飞散、间距变大 | single frame: lines mostly gone, sparks fly outward with wider spacing | no motion blur |
| 5 | 单帧：飞星变淡，仅剩2到3个外围火星残点 | single frame: sparks fade, only 2-3 outer sparks remain | — |
| 6 | 单帧：仅剩1个像素残点，火花熄灭 | single frame: only 1 pixel dot remains, spark extinguished | — |

**第 1 帧完整样例：**
```
中文：像素风小型命中火花特效，中心居中，银白色（#E8F0FF）短放射亮线与飞溅火星，1px深色描边（#0A0E1A），锐利硬边像素，内容集中于画布中心中范围、四周透明，透明背景，无抗锯齿，无渐变光晕，无外框，无文字水印，48x48画布。单帧：画布中心一个约2像素银白亮点，起手
负向：白色背景，模糊边缘，抗锯齿，运动模糊，照片写实，3D渲染，渐变光晕，多把剑/重复图案，帧偏移，位置漂移，文字，水印，阴影贴图，大爆炸，圆环，方形外框
```

### 3.6 命名 + 交付
- 逐帧透明 PNG：`fx_spark_1.png` … `fx_spark_6.png`（6 个文件），48×48，不烘烤辉光。
- 落地目录：`public/sprites/`。
- 主理人侧（参考）：`anims.create({ key:'fx_spark', frames:[fx_spark_1..6], frameRate:14, repeat:0 })`；L1071 飞剑触敌 `setTint(0xcfe8ff)`；替换现有 `add.image(...,'slash')` + tween。

---

## 4. `bolt_fly` 飞行火弹 / 能量弹（8 帧 / 48×48 / 朝右 / 飞行中循环）

### 4.1 帧数与尺寸
- **8 帧**，飞行中**循环**（类比 v2 的 `sword_proj_fly`，但主体是火球/能量弹，不是剑）。
- **48×48**（给拖尾留空间，与 `sword_proj` 同画布）。
- **朝右**（弹头朝画面右侧，尾焰在左）；引擎 `setRotation` 按角度转向、`setFlipX` 镜像。
- 建议帧率 **10 fps**（飞行循环）。
- **色彩方案（方案 A · 烘焙火色）**：本套**帧内直接烘烤完整火焰渐变**——外焰橙（`#FF8C42`/`#FF6B35`）→ 中焰橙黄（`#FFB84A`）→ 内焰黄白（`#FFF0D8`/`#FFF6D0`），全帧共享同一套暖色阶。运行时**动画分支不加 `setTint`**（烘焙火色直接生效）；仅静态兜底 `bolt.png` 保留 `setTint(0xff6b35)`。基色不再画银白——本套是唯一"烘焙真实色"的特效。

### 4.2 用途与色彩派生
- **火弹弹道**：法修火弹（`spawnHlBullet` fire 分支，L588）、玩家火 proj（`spawnPlayerProj` bolt 分支，L1080）。
- **方案 A · 烘焙火色**：帧内直接画完整"外橙→内黄白"火焰渐变（限色色块阶梯，非柔光），动画分支**不加 `setTint`**；静态兜底 `bolt.png` 仍 `setTint(0xff6b35)`。
- 视觉读作**"一颗带尾焰的飞行火球/能量弹，朝右飞"**：圆核 + 向左拖出的火星/火焰尾 + 跨帧的核心明暗（辉光变化用色块阶梯，不烤柔光）。

### 4.3 硬规则
复用 §0.3。本套额外：
- **朝右**：火球核心偏画布右侧（约 30/48 处），尾焰向左拖（引擎按角度旋转）。
- **核心稳定、尾焰变化**：8 帧里火球核心大小/位置基本稳定（循环不能让核心忽大忽小抖动），主要变化在**尾焰长短翻卷 + 核心内焰明暗呼吸 + 飞散火星位置**，形成"燃烧+飞行"的循环律动。
- **辉光变化用限色色块**：核心内焰用 2~3 阶亮度色块（外焰暖白→内焰更亮白），不要柔光渐变。
- 帧特定负向追加：`no gradient glow, no soft blur trail, no square frame border`（尾焰用色块阶梯，不用柔光）。

### 4.4 逐帧技术（8 帧飞行循环：尾焰翻卷 + 内焰呼吸 + 火星飞散）

> 连续性约定：**火球核心 x 固定在约 30/48 处、y 居中**，核心大小全程稳定；**只让尾焰长度/翻卷方向、内焰亮度、飞散火星在变**，保证循环时核心不抖。帧 8 尾焰状态应能自然接回帧 1（无缝循环）。

| 帧 | 尾焰 | 内焰核心 | 飞散火星 |
|---|---|---|---|
| 1 | 短尾（约 8px），向左直拖 | 内焰中亮 | 1~2 点，近核 |
| 2 | 尾焰变长（约 12px），末端微上翘 | 内焰变亮 | 2~3 点，散开 |
| 3 | 尾焰最长（约 16px），末端翻卷 | 内焰最亮（呼吸峰） | 3~4 点 |
| 4 | 尾焰略收（约 13px），末端下翻 | 内焰中亮 | 2~3 点，外飞 |
| 5 | 短尾（约 9px） | 内焰略暗（呼吸谷） | 1~2 点 |
| 6 | 尾焰再变长（约 13px），末端上翻 | 内焰回亮 | 2~3 点 |
| 7 | 尾焰中长（约 14px），翻卷方向与帧 3 相反 | 内焰亮 | 3 点 |
| 8 | 尾焰收到约 9px，末端状态接近帧 1（衔接循环） | 内焰中亮 | 1~2 点，回收 |

### 4.5 逐帧完整提示词（可直接复制）

**风格基础提示词（公共段）：**
```
中文基础：像素风飞行火弹能量弹特效，圆形火球核心朝向画面右侧（朝右）、位于画布中右部，
烘烤完整火焰渐变（外焰橙#FF8C42→中焰橙黄#FFB84A→内焰黄白#FFF6D0），向左拖出翻卷火焰尾与飞溅火星，
1px深色描边（#0A0E1A），锐利硬边像素、火焰明暗用限色色块阶梯表现，
透明背景，无抗锯齿，无渐变光晕，无外框，无文字水印，48x48画布
英文基础：pixel art flying fireball energy bolt effect, round fireball core facing
RIGHT positioned right-of-center, baked full fire gradient (outer flame orange #FF8C42
to mid orange-yellow #FFB84A to inner yellow-white #FFF6D0), curling flame tail and
flying embers trailing to the LEFT, 1px dark outline (#0A0E1A), crisp hard-edge pixels,
flame shading as stepped limited-color blocks, transparent background, no anti-aliasing,
no gradient glow, no frame border, no text, no watermark, 48x48 canvas
```
**统一负向：** v2 §0.5 + `no gradient glow, no soft blur trail, no square frame border`

| 帧 | 动作句（CN） | 动作句（EN） | 帧特定负向 |
|---|---|---|---|
| 1 | 单帧：火球核心在画布中右，黄白内焰外裹橙焰，向左拖出约8像素短直火焰尾，内焰中亮，近核1到2点火星 | single frame: fireball core right-of-center, yellow-white inner flame wrapped by orange outer flame, ~8px short straight flame tail to the left, medium inner flame, 1-2 embers near core | — |
| 2 | 单帧：核心不变，火焰尾变长到约12像素末端微上翘，黄白内焰变亮，2到3点火星散开 | single frame: core unchanged, flame tail lengthens to ~12px with tip curling up, brighter yellow-white inner flame, 2-3 embers spreading | no soft blur trail |
| 3 | 单帧：火焰尾最长约16像素末端翻卷，黄白内焰最亮（呼吸峰），外焰橙分明，3到4点火星 | single frame: flame tail longest ~16px with curling tip, brightest yellow-white inner flame (breath peak), distinct orange outer flame, 3-4 embers | no gradient glow |
| 4 | 单帧：火焰尾略收约13像素末端下翻，黄白内焰中亮，2到3点火星外飞 | single frame: flame tail retracts to ~13px with tip curling down, medium yellow-white inner flame, 2-3 embers flying out | — |
| 5 | 单帧：火焰尾收短约9像素，黄白内焰略暗（呼吸谷），外焰橙仍清晰，1到2点火星 | single frame: flame tail short ~9px, slightly dimmer yellow-white inner flame (breath trough), orange outer flame still distinct, 1-2 embers | no motion blur |
| 6 | 单帧：火焰尾再变长约13像素末端上翻，黄白内焰回亮，2到3点火星 | single frame: flame tail lengthens again ~13px tip curling up, yellow-white inner flame brightening, 2-3 embers | — |
| 7 | 单帧：火焰尾中长约14像素、翻卷方向与第3帧相反，黄白内焰亮，3点火星 | single frame: flame tail ~14px curling opposite to frame 3, bright yellow-white inner flame, 3 embers | — |
| 8 | 单帧：火焰尾收到约9像素、末端状态接近第1帧以便循环衔接，黄白内焰中亮，1到2点火星 | single frame: flame tail retracts to ~9px with tip state close to frame 1 for seamless loop, medium yellow-white inner flame, 1-2 embers | no frame offset |

**第 1 帧完整样例：**
```
中文：像素风飞行火弹能量弹特效，圆形火球核心朝向画面右侧（朝右）、位于画布中右部，暖白偏金核心（#FFF0D8）内焰更亮白，向左拖出翻卷火焰尾与飞溅火星，1px深色描边（#0A0E1A），锐利硬边像素、内焰用限色色块阶梯表现明暗，透明背景，无抗锯齿，无渐变光晕，无外框，无文字水印，48x48画布。单帧：火球核心在画布中右，向左拖出约8像素短直火焰尾，内焰中亮，近核1到2点火星
负向：白色背景，模糊边缘，抗锯齿，运动模糊，照片写实，3D渲染，渐变光晕，多把剑/重复图案，帧偏移，位置漂移，文字，水印，阴影贴图，柔光拖尾，方形外框
```

### 4.6 命名 + 交付
- 逐帧透明 PNG：`bolt_fly_1.png` … `bolt_fly_8.png`（8 个文件），48×48，朝右，不烘烤辉光。
- 落地目录：`public/sprites/`。
- 主理人侧（参考）：`anims.create({ key:'bolt_fly', frames:[bolt_fly_1..8], frameRate:10, repeat:-1 })`；把 L588（fire 分支）、L1080（bolt 分支）的 `add.image(...,'bolt')` 改为 `add.sprite(...,'bolt_fly_1').setRotation(angle).play('bolt_fly')`，**动画分支不加 setTint**（火色已烘焙进帧），仅静态兜底 `bolt.png` 保留 `setTint(0xff6b35)`；**注意 scale 重调**——`bolt` 原为 8×8，`bolt_fly` 为 48×48，所有引用点 setScale 需按比例缩小（参照 ART-EMBED-001 slash 先例）。

---

## 5. `proj_fly` 基础弹道（敌方子弹）（6 帧 / 48×48 / 朝右 / 循环）

### 5.1 帧数与尺寸
- **6 帧**，**循环**（敌方子弹持续飞行）。
- **48×48**（原拟 32×32，已按用户决策统一升 48×48；内容居中偏右、四周留透明）。
- **朝右**（弹头朝右，短尾在左）；引擎 `setRotation` 按角度转向。
- 建议帧率 **10 fps**。

### 5.2 用途与色彩派生
- **基础弹道**（敌方子弹，`spawnProj`，`DungeonScene` L1265）：当前 `add.image(...,'proj')` 无 tint。
- 基础画**银白**，保留 tint 余量——后续若想按敌种区分（毒弹绿 / 妖弹红），引擎 `setTint` 即可派生，本套只出一套银白弹。
- 视觉读作**"一颗朴素的能量弹，朝右飞、带一点点短尾脉动"**——比 `bolt_fly` 简单、无火焰翻卷，只是个稳定飞行的小弹体。

### 5.3 硬规则
复用 §0.3。本套额外：
- **小而稳**：弹体核心约 8~10px，位于画布中右（约 20/32 处），四周透明。
- **循环平稳**：6 帧只做"核心亮度轻微脉动 + 短尾长度小幅变化"，**核心大小/位置全程稳定**，循环无抖动、无位移（位移由引擎给速度）。
- 帧特定负向追加：`no flame, no big trail, no square frame border`（这是朴素能量弹，不是火球）。

### 5.4 逐帧技术（6 帧飞行循环：亮度脉动 + 短尾微变）

> 连续性约定：**弹体核心 x 固定约 30/48、y 居中，核心大小全程不变**；只让核心亮度、短尾长度、1~2 点尾星在轻微变化。帧 6 接回帧 1 无缝。

| 帧 | 核心亮度 | 短尾（向左） | 尾星 |
|---|---|---|---|
| 1 | 中亮 | 约 5px | 1 点 |
| 2 | 变亮 | 约 7px | 1~2 点 |
| 3 | 最亮（脉冲峰） | 约 8px | 2 点 |
| 4 | 中亮 | 约 6px | 1~2 点 |
| 5 | 略暗（脉冲谷） | 约 5px | 1 点 |
| 6 | 回中亮（接回帧 1） | 约 5px | 1 点 |

### 5.5 逐帧完整提示词（可直接复制）

**风格基础提示词（公共段）：**
```
中文基础：像素风基础能量子弹特效，小型圆形弹体核心朝向画面右侧（朝右）、位于画布中右部，
银白色核心（#E8F0FF）向左拖出极短尾迹，1px深色描边（#0A0E1A），锐利硬边像素，
内容集中于画布中右中范围、四周透明，无火焰翻卷、朴素弹体，
透明背景，无抗锯齿，无渐变光晕，无外框，无文字水印，48x48画布
英文基础：pixel art basic energy projectile effect, small round bullet core facing
RIGHT positioned right-of-center, silver-white core (#E8F0FF) with a very short tail
trailing left, 1px dark outline (#0A0E1A), crisp hard-edge pixels, content concentrated
right-of-center with transparent margins, no curling flame, plain bullet,
transparent background, no anti-aliasing, no gradient glow, no frame border, no text,
no watermark, 48x48 canvas
```
**统一负向：** v2 §0.5 + `no flame, no big trail, no square frame border`

| 帧 | 动作句（CN） | 动作句（EN） | 帧特定负向 |
|---|---|---|---|
| 1 | 单帧：银白小弹体在画布中右，向左约5像素短尾，核心中亮，1点尾星 | single frame: silver-white small bullet right-of-center, ~5px short tail to the left, medium core, 1 tail spark | — |
| 2 | 单帧：核心变亮，短尾伸长到约7像素，1到2点尾星 | single frame: core brightens, tail extends to ~7px, 1-2 tail sparks | — |
| 3 | 单帧：核心最亮（脉冲峰），短尾约8像素，2点尾星 | single frame: core brightest (pulse peak), tail ~8px, 2 tail sparks | no big trail |
| 4 | 单帧：核心回中亮，短尾收到约6像素，1到2点尾星 | single frame: core back to medium, tail retracts to ~6px, 1-2 tail sparks | — |
| 5 | 单帧：核心略暗（脉冲谷），短尾约5像素，1点尾星 | single frame: core slightly dim (pulse trough), tail ~5px, 1 tail spark | no motion blur |
| 6 | 单帧：核心回中亮、短尾约5像素、状态接近第1帧以便循环衔接 | single frame: core back to medium, tail ~5px, state close to frame 1 for seamless loop | no frame offset |

**第 1 帧完整样例：**
```
中文：像素风基础能量子弹特效，小型圆形弹体核心朝向画面右侧（朝右）、位于画布中右部，银白色核心（#E8F0FF）向左拖出极短尾迹，1px深色描边（#0A0E1A），锐利硬边像素，内容集中于画布中右小范围、四周透明，无火焰翻卷、朴素弹体，透明背景，无抗锯齿，无渐变光晕，无外框，无文字水印，32x32画布。单帧：银白小弹体在画布中右，向左约5像素短尾，核心中亮，1点尾星
负向：白色背景，模糊边缘，抗锯齿，运动模糊，照片写实，3D渲染，渐变光晕，多把剑/重复图案，帧偏移，位置漂移，文字，水印，阴影贴图，火焰，大拖尾，方形外框
```

### 5.6 命名 + 交付
- 逐帧透明 PNG：`proj_fly_1.png` … `proj_fly_6.png`（6 个文件），48×48，朝右，不烘烤辉光。
- 落地目录：`public/sprites/`。
- 主理人侧（参考）：`anims.create({ key:'proj_fly', frames:[proj_fly_1..6], frameRate:10, repeat:-1 })`；把 L1265 的 `add.image(...,'proj')` 改为 `add.sprite(...,'proj_fly_1').setRotation(angle).play('proj_fly')`；**注意 scale 重调**——`proj` 原为 8×8，`proj_fly` 为 48×48，setScale 需按比例缩小（参照 ART-EMBED-001 slash 先例）。

---

## 6. 这些特效对应游戏里哪些调用点（帮用户理解覆盖范围）

> 行号基于当前 `src/scenes/DungeonScene.ts`（已实地核对，行号可能随代码改动漂移，以函数名为准）。当前这些点大多用 `slash`/`bolt`/`proj` 静态图 + tween 凑合，v3 序列帧就是来替换它们的。

| 调用点（行号） | 所在函数 / 场景 | 当前实现 | 本包对应 key | 运行时 tint |
|---|---|---|---|---|
| **L803** | `whirlwind` 旋风环 | `add.image(...,'slash')` scale 0.25→1.6 tween | `fx_ring` | 不 tint（银白） |
| **L819** | `frost_nova` 冰环 | `add.image(...,'slash')` tint `0x9fd8ff` tween | `fx_ring` | `0x9fd8ff` 冰蓝 |
| **L836** | `frost_nova_burst` 玄冥冰爆 · 主环 | `add.image(...,'slash')` tint `0x7fd0ff` scale→2.6 | `fx_ring` | `0x7fd0ff` 冰蓝 |
| **L838** | `frost_nova_burst` 玄冥冰爆 · 副环 | `add.image(...,'slash')` tint `0xd8f0ff` scale→2.0 | `fx_ring`（第二层） | `0xd8f0ff` 淡冰 |
| **L1478** | 爆裂溅射（火弹 40% 溅射） | `add.image(...,'slash')` tint `0xe67e22` tween | `fx_splash` | `0xe67e22` 火橙 |
| **L1125** | 神通紫爆（雷电类神通落点） | `add.image(...,'slash')` tint `0xb39dff` tween | `fx_splash` | `0xb39dff` 紫 |
| **L1071** | 飞剑触敌火花 | `add.image(...,'slash')` tint `0xcfe8ff` tween | `fx_spark` | `0xcfe8ff` 剑青白 |
| **L588** | 火弹弹道（`spawnHlBullet` fire 分支） | `add.image(...,'bolt')` tint `0xff6b35` | `bolt_fly` | 动画分支不加 tint（烘焙火色）；静态兜底 `bolt.png` 仍 `0xff6b35` |
| **L1080** | 火弹弹道（`spawnPlayerProj` bolt 分支） | `add.image(...,'bolt')` | `bolt_fly` | 动画分支不加 tint（烘焙火色）；静态兜底 `bolt.png` 仍 `0xff6b35` |
| **L1265** | 基础弹道（`spawnProj` 敌方子弹） | `add.image(...,'proj')` | `proj_fly` | 无（可按敌种可选） |

> 说明：`sword_proj` 弹道（L586/L1078 的 `sword_proj_fly` 分支）已在 v2 覆盖并集成，本包不重复。`slash` 作为近战剑光的用途（`slash_anim`）也已在 v2 覆盖；本包只接管 `slash` 被"借用来画环/溅射/火花"的那些调用点——迁移后这些点不再依赖 `slash`，`slash` 回归纯近战剑光语义，职责更清晰。

---

## 7. 颜色策略：银白基色 + 运行时 setTint 派生

### 7.1 为什么基色画银白（不逐色出图）

- Phaser `setTint(color)` 是**逐像素乘法**：`结果 = 底色 × tint`。底色越接近纯白（`0xFFFFFF`），乘完越接近 `tint` 目标色、且保留明暗层次；底色若本身带色相（如蓝），乘上橙 tint 会得到脏灰。
- 所以：**基色以银白/寒白 `#E8F0FF` 为绝对主导，色相只作极少点缀**。这样一套图能被染成冰蓝、火橙、紫、青等任意色，且都干净。
- **产能收益**：`fx_ring` 一套图覆盖旋风环/冰环/玄冥冰爆双层共 4 个调用点；`fx_splash` 一套覆盖火溅 + 紫爆 2 处。5 套图覆盖 10 个调用点，避免逐色出 10+ 套。

### 7.2 各套基色与派生对照

| key | 基色（出图时画） | 运行时派生（引擎 setTint） |
|---|---|---|
| `fx_ring` | 银白 `#E8F0FF` | 银白(不tint) / 冰蓝 `0x9fd8ff` `0x7fd0ff` / 淡冰 `0xd8f0ff` / （可扩火橙 `0xff8c42`） |
| `fx_splash` | 银白 `#E8F0FF` | 火橙 `0xe67e22` / 紫 `0xb39dff` |
| `fx_spark` | 银白 `#E8F0FF` | 剑青白 `0xcfe8ff` |
| `bolt_fly` | **烘焙火色**（外橙 `#FF8C42`→中橙黄 `#FFB84A`→内黄白 `#FFF6D0`） | 动画分支不加 tint（烘焙火色生效）；静态兜底 `bolt.png` 仍 tint 炽橙 `0xff6b35` |
| `proj_fly` | 银白 `#E8F0FF` | 无（可按敌种 tint：毒绿 / 妖红 等） |

> 例外说明：`bolt_fly` 是唯一**烘焙真实火色**的套件——帧内直接画"外橙→内黄白"完整火焰渐变，动画分支**不加 `setTint`**（火色已烤进帧），只有静态兜底 `bolt.png` 保留 `setTint(0xff6b35)`。其余四套（`fx_ring`/`fx_splash`/`fx_spark`/`proj_fly`）一律银白基色，保留运行时 `setTint` 派生自由度。

---

## 8. v3 交付汇总表 + 建议生成顺序

| key | 类型 | 帧数 | 单帧尺寸 | 朝右 | 循环 | 交付文件 | anim key（主理人侧） | 帧率 |
|---|---|---|---|---|---|---|---|---|
| `fx_ring` | 扩散环 | 8 | 48×48 | 否 | 否 | `fx_ring_1~8.png` | `fx_ring`（一次播放） | 12 fps |
| `fx_splash` | 径向溅射 | 8 | 48×48 | 否 | 否 | `fx_splash_1~8.png` | `fx_splash`（一次播放） | 12 fps |
| `fx_spark` | 小火花 | 6 | 48×48 | 否 | 否 | `fx_spark_1~6.png` | `fx_spark`（一次播放） | 14 fps |
| `bolt_fly` | 飞行火弹 | 8 | 48×48 | 是 | 是 | `bolt_fly_1~8.png` | `bolt_fly`（`repeat:-1`） | 10 fps |
| `proj_fly` | 基础敌弹 | 6 | 48×48 | 是 | 是 | `proj_fly_1~6.png` | `proj_fly`（`repeat:-1`） | 10 fps |

**建议生成顺序（性价比排序）：**
1. **`fx_ring`（8 帧）优先**——一套覆盖 4 个调用点（旋风/冰环/冰爆双层），替换收益最大，观感从"缩放的月牙 slash"升级为真正的冲击波环。
2. **`fx_splash`（8 帧）次之**——覆盖火溅 + 紫爆 2 处，让"爆点"读作爆点而非缩放光斑。
3. **`bolt_fly`（8 帧）**——火弹是高频弹道，飞行循环让火球"燃烧感"到位。
4. **`fx_spark`（6 帧）**——飞剑触敌反馈锦上添花，6 帧短平快，产能低。
5. **`proj_fly`（6 帧）**——敌弹优先级最低（朴素弹体，静态 `proj` 也能凑合），有余力再做。

> 产能守则（延续 v2 §4）：序列帧只投"战斗反馈"特效；背景一律静态 + 引擎动态。本包 5 套全部属战斗反馈，符合守则。

---

## 9. 后续可选（Tier3，本次不做）

### `fx_firevortex` 火焰漩涡（占位）

- **定位**：Tier3，本次**排除**，待排期。
- **预期规格（草案，正式出图前再细化）**：旋转类火焰漩涡，**48×48 或 64×64**，**6~8 帧循环**（旋转 + 火舌翻卷），基色暖白偏金（同 `bolt_fly` 逻辑，引擎 tint 火橙 / 或做魔窟区红焰）。旋转类要点：帧间做"整体旋转一个固定角度增量"（如每帧转 45°，8 帧转满一圈无缝循环），火舌向外翻卷。
- **对应潜在调用点**：赤炎魔窟区域的持续火焰领域 / 火系 Boss 技能——需先与文策渊（玩法）确认是否有对应技能需求，再决定是否排产。

---

## 附录 · 与现有文档引用关系

- `docs/art/prompt-pack-anim-v2.md`（v2.0）：**本包直接继承其 §0 动画总规范、§0.4 一致性技巧、§0.5 统一负向词、§3 命名与交付**，未重述部分一律以 v2 为准。
- `docs/art/prompt-pack.md`（v1.0）：静态提示词包，仍适用于背景类与不做序列帧的资产。
- `docs/art/art-bible-and-iteration-plan.md`（v0.2）：色板（霜白 `#E8F0FF` / 剑青 `#4AC0D0` / 描边 `#0A0E1A`）、粒子特效限色 ≤12、品质双编码——本包引用。
- `docs/04-美术素材AI生成规范.md`：尺寸 16 倍数、命名、目录、朝右约定、帧率口径——本包 §0.3/§8 对齐。
- `docs/art/ART-EMBED-001-slash-report.md`：48×48 先例（裁剪 + 最近邻缩放 + scale 重调）——本包各套「命名+交付」的 scale 重调提醒直接引用（`bolt_fly`/`proj_fly` 从 8×8 升 48×48，务必重调 setScale）。
- 嵌入与 key 注册：由主理人（team-lead）在 `BootScene.ts`（可扩现有 `FX_ANIMS` 数组批量 load + anims.create）/ `textures.ts` / `DungeonScene.ts` 完成，不在本文档范围。

---

**END · v3.0 · 动画版提示词包（fx_ring 8 + fx_splash 8 + fx_spark 6 + bolt_fly 8 + proj_fly 6 = 5 套 36 帧 · 一图多色 setTint 策略）**
