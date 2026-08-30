# 美术提示词包 · 关卡地图与攻击特效（更炫酷版）

> 版本：v1.0（T-ART-PROMPTS，P0 美术线）
> 负责人：美术方向 · 林绘澄
> 状态：草稿，供用户经生图 AI 出图后交主理人（team-lead）嵌入游戏本体
> 范围：**只产出提示词与文档，不生成图片、不改代码、不注册 key**（key 注册与主理人嵌入时做，见 `docs/04` §5）
> 基线：`docs/04-美术素材AI生成规范.md`、`docs/art/art-bible-and-iteration-plan.md`（v0.2 色板/主题色/描边 `#0A0E1A`/品质双编码）、`docs/01-项目策划方案.md`（职业机制线）

---

## 0. 使用须知（必读）

1. **像素规范是硬约束（不可破）**：无抗锯齿、无渐变光晕、透明底（地图背景除外，可为不透明）、尺寸严格 16 倍数、俯视 3/4 视角、1px 深色描边（统一 `#0A0E1A`）。
2. **「更炫酷」的正确来源**：
   - **配色层次更丰富**：在主色/辅助/点缀三段式（见 `docs/art/...v0.2` §2.2）内加渐层饱和、强化主题色对比；
   - **主题色强化**：每个区域用其专属主题色（青冥苍青、幽冥幽紫、赤炎赤焰、天机天机金、无尽妖红、洞府暖木褐）；
   - **代码侧叠加（关键）**：光柱、震屏、拖尾、闪烁、粒子密度等"炫酷能量感"由**引擎粒子/着色器层在 `DungeonScene` 实现，不烤进 sprite**。sprite 自身保持干净锐利的像素；炫酷感 = 锐利 sprite + 代码特效。
3. **朝右约定**：所有投射物 / 刀光 / 刃类特效**一律朝画面右侧绘制**（程序按弹道角度旋转）。环形（冰环/阵纹/光环）为对称构图，无需朝向。
4. **尺寸**：地图背景 360×640（或 720×1280）；tile 16×16 无缝平铺；特效按 `docs/04` §3.7 约定（slash 24×24、proj/bolt 8×8、sword_proj 12×6 朝右）。
5. **交付流程**：用户出图 → 告知主理人"已放入 xxx" → 主理人在代码注册 key（`textures.ts` / `classes.json`）+ `npm run build` 验证。
6. **新增 key 命名约定**：区域背景 `bg_<region>`、区域地块 `floor_<region>`/`wall_<region>`、特效 `fx_<name>`（与 `docs/04` §5 一致，避免 key 漂移）。

---

## 1. 通用提示词后缀（所有条目默认叠加）

### 1.1 中文通用后缀（散图/特效）
```
像素风，16-bit 怀旧RPG风格，俯视3/4视角，干净剪影，1px深色描边，透明背景，无抗锯齿，无渐变光晕，无文字，无水印，锐利像素
```
> 地图背景版（不透明整图）：去掉"透明背景"；改为"不透明整图，无文字，无LOGO，无人物特写"。

### 1.2 英文通用后缀（散图/特效）
```
pixel art, 16-bit retro RPG style, top-down 3/4 view, clean silhouette,
1px dark outline, transparent background, no anti-aliasing, no gradient glow,
no text, no watermark, crisp pixels
```

### 1.3 通用负面提示词（中文 / 英文）
```
中文：白色背景，模糊边缘，抗锯齿，照片写实，3D渲染，渐变光晕，文字，水印，阴影贴图
英文：white background, blurry edges, anti-aliasing, photorealistic, 3D render, gradient glow, text, watermark, shadow decal
```
> 地图背景版负面（中文）：白色背景，模糊边缘，抗锯齿，照片写实，3D渲染，渐变光晕，文字，水印，LOGO，人物特写
> 下文每个条目默认叠加 §1.1/§1.2 + §1.3；**地图背景使用地图版后缀与负面**。

---

## 2. 关卡地图（更炫酷）

### 2.1 区域竖屏背景（360×640，对标 `cave_bg`，不透明整图）

升级要点：在夜色山水基调上**强化主题色与氛围层次**（赤炎熔岩流动感、幽冥鬼火、天机星图符纹、无尽妖域魂火），增加远中近景层次与能量点缀，但不破坏像素锐利与俯视 3/4 视角。

#### bg_qingming · 青冥山脉
- 贴图key：`bg_qingming`（新 key，需注册；现有 `cave_bg` 为洞府，本区域原用程序化铺地）
- 尺寸：360×640（不透明整图；建议 720×1280 双倍保清）
- 中文提示词：像素风竖屏游戏背景，青冥山脉夜景，云雾缭绕的青蓝山峦主峰剪影，远处飞瀑流泉与松林，近景山径石阶与微光灵草，深青蓝夜色调（主色 #3A6E8F、石青 #1F3D52、寒白点缀 #E8F0FF），星光与剑光掠过，俯视3/4视角，16-bit JRPG怀旧风，不透明整图，无文字，无LOGO，无人物特写，锐利像素
- 英文提示词：pixel art game background, vertical 360x640 portrait, misty qingming mountain range night scene, layered blue-teal mountain silhouettes with waterfalls and pine forest, stone path with glowing spirit herbs in foreground, deep teal night palette (main #3A6E8F, stone #1F3D52, highlight #E8F0FF), sword-light streaks and stars, top-down 3/4 view, 16-bit JRPG style, opaque full image, no text, no logo, no character close-up, crisp pixels
- 负面提示词：§1.3 地图版
- 嵌入说明：`DungeonScene` 按地区切换背景（`textures.ts` 注册 `bg_qingming` 后引用）；青冥山脉（1~层）主背景。

#### bg_youming · 幽冥沼泽
- 贴图key：`bg_youming`（新 key，需注册）
- 尺寸：360×640（不透明）
- 中文提示词：像素风竖屏游戏背景，幽冥沼泽夜景，紫黑色毒沼与枯骨浮岛，幽绿鬼火成群飘浮，腐木与白骨祭坛，远山雾霭，幽紫主色（#5A2E7A、暗赭 #2E1A3A、鬼火绿点缀 #7FE8B0），鬼火微光与雾气流动感，俯视3/4视角，16-bit JRPG怀旧风，不透明整图，无文字，无LOGO，无人物特写，锐利像素
- 英文提示词：pixel art game background, vertical 360x640 portrait, nether swamp night scene, violet-black toxic bog with bone islets, clusters of glowing green ghost-fire, rotten wood and bone altar, distant misty mountains, deep violet palette (#5A2E7A, #2E1A3A, ghost-green accent #7FE8B0), drifting ghost-fire and fog, top-down 3/4 view, 16-bit JRPG style, opaque full image, no text, no logo, no character close-up, crisp pixels
- 负面提示词：§1.3 地图版
- 嵌入说明：`DungeonScene` 幽冥沼泽（2~层）主背景。

#### bg_chiyan · 赤炎魔窟
- 贴图key：`bg_chiyan`（新 key，需注册）
- 尺寸：360×640（不透明）
- 中文提示词：像素风竖屏游戏背景，赤炎魔窟夜景，赤红熔岩裂隙与焦黑岩壁，岩浆流动感（用锐利像素块表现流动而非渐变），悬浮的熔金火屑与恶魔图腾，远处喷发火光，赤焰主色（#C03A2A、焦黑 #3A0E0A、熔金点缀 #FFB84A），俯视3/4视角，16-bit JRPG怀旧风，不透明整图，无文字，无LOGO，无人物特写，锐利像素
- 英文提示词：pixel art game background, vertical 360x640 portrait, crimson inferno cavern night scene, red lava fissures and charred rock walls, lava flow depicted with crisp pixel blocks (no gradient), floating molten-gold embers and demon totems, distant eruption glow, crimson palette (#C03A2A, #3A0E0A, molten-gold accent #FFB84A), top-down 3/4 view, 16-bit JRPG style, opaque full image, no text, no logo, no character close-up, crisp pixels
- 负面提示词：§1.3 地图版（**强调"无渐变光晕"**——熔岩流动用色块阶梯表现，不用柔光）
- 嵌入说明：`DungeonScene` 赤炎魔窟（3~层）主背景。

#### bg_tianji · 天机遗迹
- 贴图key：`bg_tianji`（新 key，需注册）
- 尺寸：360×640（不透明）
- 中文提示词：像素风竖屏游戏背景，天机遗迹夜景，古铜与金石构筑的悬浮星图祭坛，地面与穹顶刻满金色符纹与旋转星盘，天机金光纹流转（锐利像素描线，非柔光），远处星海与机械浮岛，天机金主色（#D4A04A、古铜 #6E4A1E、神辉白点缀 #FFF6D0），俯视3/4视角，16-bit JRPG怀旧风，不透明整图，无文字，无LOGO，无人物特写，锐利像素
- 英文提示词：pixel art game background, vertical 360x640 portrait, celestial relic night scene, bronze-and-gold suspended star-chart altar, floor and dome carved with golden talisman glyphs and rotating star-dials, celestial-gold light lines flowing (crisp pixel strokes, not soft glow), distant starfield and mechanical isles, celestial-gold palette (#D4A04A, #6E4A1E, divine-white accent #FFF6D0), top-down 3/4 view, 16-bit JRPG style, opaque full image, no text, no logo, no character close-up, crisp pixels
- 负面提示词：§1.3 地图版
- 嵌入说明：`DungeonScene` 天机遗迹（4~层）主背景。

#### bg_wujin · 无尽妖域
- 贴图key：`bg_wujin`（新 key，需注册）
- 尺寸：360×640（不透明）
- 中文提示词：像素风竖屏游戏背景，无尽妖域夜景，妖异红雾中的破碎妖塔与血色裂谷，魂火青焰在裂隙间升腾，扭曲妖骨与悬浮妖瞳，远处妖月，妖红主色（#8A1A4A、瘀黑 #2A0A1A、魂火青点缀 #4AE0E0），诡谲能量脉动感（锐利像素），俯视3/4视角，16-bit JRPG怀旧风，不透明整图，无文字，无LOGO，无人物特写，锐利像素
- 英文提示词：pixel art game background, vertical 360x640 portrait, endless demon realm night scene, broken demon towers and blood-red rifts in eerie red mist, soul-fire cyan flames rising from fissures, twisted demon bones and floating demon eyes, distant demon moon, demonic-red palette (#8A1A4A, #2A0A1A, soul-fire cyan accent #4AE0E0), uncanny energy pulsation (crisp pixels), top-down 3/4 view, 16-bit JRPG style, opaque full image, no text, no logo, no character close-up, crisp pixels
- 负面提示词：§1.3 地图版
- 嵌入说明：`DungeonScene` 无尽妖域（5~层）主背景。

#### bg_dongfu · 洞府（升级版，对标 `cave_bg`）
- 贴图key：`bg_dongfu`（新 key；现有 `cave_bg` 可覆盖或并列）
- 尺寸：360×640（不透明）
- 中文提示词：像素风竖屏游戏背景，修仙者山间洞府夜景，石板小院、药圃、木屋与炼丹炉，远处云雾山峰与暖灯火笼，暖木褐与草青主色（#7A4A2A、草青 #4A7A3A、灯火橙点缀 #FFA040），温馨暖光与夜蓝对比，俯视3/4视角，16-bit JRPG怀旧风，不透明整图，无文字，无LOGO，无人物特写，锐利像素
- 英文提示词：pixel art game background, vertical 360x640 portrait, xianxia cultivator mountain cave-dwelling night, stone courtyard, herb garden, wooden hut and alchemy furnace, distant misty peaks with warm lantern light, warm-wood palette (#7A4A2A, #4A7A3A, lantern-orange accent #FFA040), cozy warm light against night-blue, top-down 3/4 view, 16-bit JRPG style, opaque full image, no text, no logo, no character close-up, crisp pixels
- 负面提示词：§1.3 地图版
- 嵌入说明：`DungeonScene` 洞府（局外基地）主背景，替换/升级现有 `cave_bg`。

### 2.2 区域主题 tile 组（16×16，无缝平铺，与背景同源）

升级要点：比现有 `floor`/`wall` 更精致、对比更强、与 §2.1 背景同源配色；纯纹理无物体，四边可无缝拼接。

#### floor_qingming / wall_qingming · 青冥山脉地块（升级现有 floor/wall）
- 贴图key：`floor_qingming` + `wall_qingming`（新 key；建议覆盖现有 `floor`/`wall`）
- 尺寸：16×16（四边无缝）
- 中文提示词（floor）：无缝平铺像素贴图，青冥山脉石板地面，俯视正视角，16x16地块，苍青与石青色调（#3A6E8F/#1F3D52），细微裂纹与青苔高光，四边可无缝拼接，纯纹理不要物体，锐利像素
- 英文提示词（floor）：seamless tileable pixel art texture, qingming mountain stone floor, top-down view, 16x16 tile, teal palette (#3A6E8F/#1F3D52), subtle cracks and moss highlight, tileable all directions, pure texture no objects, crisp pixels
- 中文提示词（wall）：无缝平铺像素贴图，青冥山脉岩壁，俯视正视角，16x16地块，比地面深2~3色阶（#1F3D52），顶部一条寒白亮边表现厚度，四边可无缝拼接，纯纹理，锐利像素
- 英文提示词（wall）：seamless tileable pixel art texture, qingming mountain rock wall, top-down view, 16x16 tile, 2-3 shades darker than floor (#1F3D52), bright cyan-white top edge for thickness, tileable, pure texture, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`levelgen.ts` 关卡生成按地区取 tile；`DungeonScene` 拼接地图。需主理人替换现有 `floor`/`wall` 引用或新增 `floor_qingming`/`wall_qingming` key。

#### floor_youming / wall_youming · 幽冥沼泽地块（升级现有 floor2/wall2）
- 贴图key：`floor_youming` + `wall_youming`（新 key；建议覆盖 `floor2`/`wall2`）
- 尺寸：16×16
- 中文提示词（floor）：无缝平铺像素贴图，幽冥沼泽泥沼地面，暗紫泥泞带浅紫水洼与鬼火绿微光点，俯视正视角，16x16，幽紫与暗赭调（#5A2E7A/#2E1A3A），四边无缝，纯纹理，锐利像素
- 英文提示词（floor）：seamless tileable pixel art texture, nether swamp murky floor, dark violet mud with shallow purple puddles and faint ghost-green glow specks, top-down, 16x16, violet-dark palette (#5A2E7A/#2E1A3A), tileable, pure texture, crisp pixels
- 中文提示词（wall）：无缝平铺像素贴图，幽冥沼泽腐骨岩壁，比地面深，顶缘鬼火绿微光，16x16，四边无缝，纯纹理，锐利像素
- 英文提示词（wall）：seamless tileable pixel art texture, nether swamp bone-rotted wall, darker than floor, ghost-green glow on top edge, 16x16, tileable, pure texture, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`levelgen.ts` 幽冥沼泽 tile（覆盖 `floor2`/`wall2`）。

#### floor_chiyan / wall_chiyan · 赤炎魔窟地块（新增）
- 贴图key：`floor_chiyan` + `wall_chiyan`（新 key，需注册）
- 尺寸：16×16
- 中文提示词（floor）：无缝平铺像素贴图，赤炎魔窟熔岩石板地面，赤红裂纹中透出熔金光（用色块阶梯，无渐变），俯视正视角，16x16，赤焰与焦黑调（#C03A2A/#3A0E0A），四边无缝，纯纹理，锐利像素
- 英文提示词（floor）：seamless tileable pixel art texture, inferno cavern lava-stone floor, red cracks glowing molten-gold via stepped pixel blocks (no gradient), top-down, 16x16, crimson-charred palette (#C03A2A/#3A0E0A), tileable, pure texture, crisp pixels
- 中文提示词（wall）：无缝平铺像素贴图，赤炎魔窟焦黑岩壁带熔岩纹，顶缘熔金亮边，16x16，四边无缝，纯纹理，锐利像素
- 英文提示词（wall）：seamless tileable pixel art texture, inferno cavern charred wall with lava veins, molten-gold top edge, 16x16, tileable, pure texture, crisp pixels
- 负面提示词：§1.3（强调无渐变光晕）
- 嵌入说明：`levelgen.ts` 赤炎魔窟 tile（新增 key）。

#### floor_tianji / wall_tianji · 天机遗迹地块（新增）
- 贴图key：`floor_tianji` + `wall_tianji`（新 key，需注册）
- 尺寸：16×16
- 中文提示词（floor）：无缝平铺像素贴图，天机遗迹金石地面，刻有暗金符纹与星点，俯视正视角，16x16，天机金与古铜调（#D4A04A/#6E4A1E），四边无缝，纯纹理，锐利像素
- 英文提示词（floor）：seamless tileable pixel art texture, celestial relic gold-stone floor, engraved dim-gold talisman glyphs and star dots, top-down, 16x16, celestial-gold/bronze palette (#D4A04A/#6E4A1E), tileable, pure texture, crisp pixels
- 中文提示词（wall）：无缝平铺像素贴图，天机遗迹青铜符壁，暗金纹路，顶缘神辉白亮边，16x16，四边无缝，纯纹理，锐利像素
- 英文提示词（wall）：seamless tileable pixel art texture, celestial relic bronze glyph wall, dim-gold patterns, divine-white top edge, 16x16, tileable, pure texture, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`levelgen.ts` 天机遗迹 tile（新增 key）。

#### floor_wujin / wall_wujin · 无尽妖域地块（新增）
- 贴图key：`floor_wujin` + `wall_wujin`（新 key，需注册）
- 尺寸：16×16
- 中文提示词（floor）：无缝平铺像素贴图，无尽妖域血色裂谷地面，妖红碎石与魂火青裂隙微光，俯视正视角，16x16，妖红与瘀黑调（#8A1A4A/#2A0A1A），四边无缝，纯纹理，锐利像素
- 英文提示词（floor）：seamless tileable pixel art texture, endless demon realm blood-rift floor, demonic-red rubble with soul-fire cyan fissure glow, top-down, 16x16, demonic-red/black palette (#8A1A4A/#2A0A1A), tileable, pure texture, crisp pixels
- 中文提示词（wall）：无缝平铺像素贴图，无尽妖域妖骨壁垒，魂火青骨缝微光，顶缘暗红亮边，16x16，四边无缝，纯纹理，锐利像素
- 英文提示词（wall）：seamless tileable pixel art texture, endless demon realm bone bulwark, soul-fire cyan glow in bone seams, dim-red top edge, 16x16, tileable, pure texture, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`levelgen.ts` 无尽妖域 tile（新增 key；现有 `deco_sy1~3` 装饰可保留）。

#### floor_dongfu / wall_dongfu · 洞府地块（升级现有 grass/stone）
- 贴图key：`floor_dongfu` + `wall_dongfu`（新 key；建议覆盖 `grass`/`stone`）
- 尺寸：16×16
- 中文提示词（floor）：无缝平铺像素贴图，洞府石板小院地面，暖木褐与草青调（#7A4A2A/#4A7A3A），草叶与落英点缀，俯视正视角，16x16，四边无缝，纯纹理，锐利像素
- 英文提示词（floor）：seamless tileable pixel art texture, cave-dwelling stone yard floor, warm-wood and grass-green palette (#7A4A2A/#4A7A3A), grass and petal specks, top-down, 16x16, tileable, pure texture, crisp pixels
- 中文提示词（wall）：无缝平铺像素贴图，洞府木石围墙，暖木褐主调，顶缘灯火橙亮边，16x16，四边无缝，纯纹理，锐利像素
- 英文提示词（wall）：seamless tileable pixel art texture, cave-dwelling wood-stone wall, warm-wood palette, lantern-orange top edge, 16x16, tileable, pure texture, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`levelgen.ts` 洞府 tile（覆盖 `grass`/`stone`）。

### 2.3 可选 · 新区域概念背景（标注"可选"，供用户扩展秘境时选用）

#### bg_jiuyou · 九幽冰渊（可选）
- 贴图key：`bg_jiuyou`（新 key，需注册；**可选**）
- 尺寸：360×640（不透明）
- 中文提示词：像素风竖屏游戏背景，九幽冰渊夜景，深蓝冰封峡谷与悬浮冰棱，霜银星光与极光，远处冰封巨门，冰蓝主色（#2A5A8A、深蓝 #0F2A4A、霜银 #C8E0F0），冷冽通透感（锐利像素，无柔光），俯视3/4视角，16-bit JRPG怀旧风，不透明整图，无文字，无LOGO，无人物特写，锐利像素
- 英文提示词：pixel art game background, vertical 360x640 portrait, nine-nether ice abyss night, deep-blue frozen canyon with floating ice shards, frost-silver starlight and aurora, distant frozen gate, ice-blue palette (#2A5A8A, #0F2A4A, frost-silver #C8E0F0), cold clarity (crisp pixels, no soft glow), top-down 3/4 view, 16-bit JRPG style, opaque full image, no text, no logo, no character close-up, crisp pixels
- 负面提示词：§1.3 地图版
- 嵌入说明：`DungeonScene` 新秘境背景（可选，待策划确认区域）。

#### bg_leiyuan · 雷霄云海（可选）
- 贴图key：`bg_leiyuan`（新 key，需注册；**可选**）
- 尺寸：360×640（不透明）
- 中文提示词：像素风竖屏游戏背景，雷霄云海夜景，高空浮空岛与紫电云层，金色雷纹在云间游走（锐利像素描线），远处天宫剪影，青紫与金调（#5A4EA0、深蓝 #1A2A5A、雷金 #F0D040），俯视3/4视角，16-bit JRPG怀旧风，不透明整图，无文字，无LOGO，无人物特写，锐利像素
- 英文提示词：pixel art game background, vertical 360x640 portrait, thunder-skies cloud-sea night, floating sky-isles with violet lightning clouds, golden thunder-veins across clouds (crisp pixel lines), distant heavenly palace silhouette, violet-gold palette (#5A4EA0, #1A2A5A, thunder-gold #F0D040), top-down 3/4 view, 16-bit JRPG style, opaque full image, no text, no logo, no character close-up, crisp pixels
- 负面提示词：§1.3 地图版
- 嵌入说明：`DungeonScene` 新秘境背景（可选）。

---

## 3. 攻击特效（更炫酷）

> 守则：像素合规（无抗锯齿/无渐变光晕/透明底）、遵守**朝右约定**（投射物/刀光/刃类朝右，程序旋转）；环形/光环/阵纹为对称构图。炫酷能量感由 `DungeonScene` 粒子/着色器叠加，sprite 自身保持锐利。

### 3.1 现有 FX 重做提质

#### slash · 剑光弧（升级现有）
- 贴图key：`slash`（已存在，覆盖；24×24）
- 尺寸：24×24（弧可对称，若方向性则朝右）
- 朝向右：建议对称弧（无需旋转）
- 中文提示词：像素风剑光特效，白色新月形剑弧，锐利尖角，外缘1px深色描边，内填寒白高光，无柔光无渐变，24x24，透明背景，俯视3/4视角，锐利像素
- 英文提示词：pixel art melee slash effect, white crescent sword arc, sharp pointed ends, 1px dark outline on outer edge, inner icy-white highlight, no soft glow no gradient, 24x24, transparent background, top-down 3/4 view, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` `melee_arc`/`attack` 剑光基底（覆盖现有 `slash`）。

#### sword_proj · 飞剑（升级现有，朝右）
- 贴图key：`sword_proj`（已存在，覆盖；12×6）
- 尺寸：12×6，**朝右**
- 朝向右：是
- 中文提示词：像素风投射物，朝右的飞剑能量刃，银白剑身带青色拖尾（剑青 #4AC0D0），尖锐三角刃尖，后方3个渐小青尾像素，12x6，水平朝向，透明背景，1px深色描边，无柔光无渐变，锐利像素
- 英文提示词：pixel art projectile sprite, flying sword energy blade pointing RIGHT, silver-white blade with cyan-blue trail (#4AC0D0), sharp triangular tip, 3 small cyan trail pixels fading behind, 12x6, horizontal orientation, transparent background, 1px dark outline, no glow no gradient, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` `flying_sword`/`flying_sword_burst` 飞剑投射物（覆盖现有 `sword_proj`，必须朝右）。

#### bolt · 仙子火弹（升级现有，朝右）
- 贴图key：`bolt`（已存在，覆盖；8×8）
- 尺寸：8×8，**朝右**
- 朝向右：是
- 中文提示词：像素火弹特效，朝右的小型炽炎火球，橙红核心（#FFB84A/#C03A2A）带亮黄高光点，边缘锐利无柔光，8x8，水平朝向，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art fire projectile, small blazing fireball pointing RIGHT, orange-red core (#FFB84A/#C03A2A) with bright-yellow highlight pixel, crisp edges no glow, 8x8, horizontal orientation, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` `magic_bolt` 火弹（覆盖现有 `bolt`，朝右）。

#### proj · 毒弹（升级现有，朝右）
- 贴图key：`proj`（已存在，覆盖；8×8）
- 尺寸：8×8，**朝右**
- 朝向右：是
- 中文提示词：像素毒弹特效，朝右的小型毒泡，紫绿核心（毒绿 #4AC060/玄紫 #9050D0）带气泡高光，边缘锐利无柔光，8x8，水平朝向，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art poison projectile, small poison blob pointing RIGHT, violet-green core (#4AC060/#9050D0) with bubble highlight, crisp edges no glow, 8x8, horizontal orientation, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 敌方毒弹（覆盖现有 `proj`，朝右）。

#### frost_nova · 冰环（新增 key）
- 贴图key：`frost_nova`（新 key，需注册；24×24）
- 尺寸：24×24（对称环）
- 朝向右：否（对称）
- 中文提示词：像素冰环特效，圆形寒冰爆裂环，冰蓝（#4AC0D0/#4090E0）锐利环带 + 外缘冰晶尖刺，中心透明，无柔光无渐变，24x24，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art frost ring effect, circular ice-burst ring, icy-blue (#4AC0D0/#4090E0) crisp ring band with outer ice-spike teeth, transparent center, no glow no gradient, 24x24, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` `frost_nova`/`frost_nova_burst` 冰环减速（新增 key）。

#### thunder_chain · 雷链（新增 key，朝右）
- 贴图key：`thunder_chain`（新 key，需注册；16×8）
- 尺寸：16×8，**朝右**
- 朝向右：是
- 中文提示词：像素雷电特效，朝右的锯齿闪电段，雷金（#F0D040）亮芯 + 紫白外缘（#5A4EA0），锐利锯齿无柔光，16x8，水平朝向，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art lightning effect, jagged thunder bolt segment pointing RIGHT, thunder-gold (#F0D040) bright core with violet-white edge (#5A4EA0), crisp zigzag no glow, 16x8, horizontal orientation, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` `thunder_chain` 雷链跳跃（新增 key，程序在目标间连段）。

#### sword_array · 剑阵（新增 key）
- 贴图key：`sword_array`（新 key，需注册；48×48）
- 尺寸：48×48（地面对称纹）
- 朝向右：否（地面阵纹，俯视对称）
- 中文提示词：像素地面阵纹特效，万剑归宗剑阵地面符纹，青白剑影环列成阵（剑青 #4AC0D0），同心圆阵纹与放射剑气，俯视正视角，透明背景，1px深色描边，无柔光无渐变，锐利像素
- 英文提示词：pixel art ground formation glyph, ten-thousand-swords array floor sigil, cyan-white sword-shadows arranged in a ring (sword-cyan #4AC0D0), concentric circle glyphs with radial sword-qi, top-down view, transparent background, 1px dark outline, no glow no gradient, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` `sword_array` 万剑归宗（新增 key；程序在阵位生成飞剑 sprite）。

#### whirlwind · 横扫环（新增 key）
- 贴图key：`whirlwind`（新 key，需注册；32×32）
- 尺寸：32×32（对称环）
- 朝向右：否（对称）
- 中文提示词：像素旋风特效，360度横扫能量环，青白（#E8F0FF/#4AC0D0）锐利环带带旋转缺口，无柔光无渐变，32x32，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art whirlwind effect, 360-degree sweeping energy ring, cyan-white (#E8F0FF/#4AC0D0) crisp ring band with rotational gap, no glow no gradient, 32x32, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` `whirlwind` 横扫（新增 key）。

#### giant_sword · 巨剑术（新增 key，朝右）
- 贴图key：`giant_sword`（新 key，需注册；16×48）
- 尺寸：16×48，**朝右**
- 朝向右：是
- 中文提示词：像素巨剑特效，朝右的巨型剑气刃，银白剑身（#E8F0FF）带霜蓝拖影（#4AC0D0），锐利长刃无柔光，16x48，水平朝向，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art giant sword effect, huge sword-qi blade pointing RIGHT, silver-white blade (#E8F0FF) with frost-blue afterimage (#4AC0D0), crisp long blade no glow, 16x48, horizontal orientation, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` `giant_sword` 巨剑术（新增 key，朝右）。

#### melee_arc · 三连斩弧（新增 key，朝右）
- 贴图key：`melee_arc`（新 key，需注册；24×24）
- 尺寸：24×24，**朝右**
- 朝向右：是
- 中文提示词：像素近战弧光，朝右的白色三连斩月牙弧，锐利尖角外缘1px描边，内填寒白高光，无柔光无渐变，24x24，透明背景，俯视3/4视角，锐利像素
- 英文提示词：pixel art melee arc, white three-hit crescent slash pointing RIGHT, sharp pointed ends with 1px outline, inner icy-white highlight, no glow no gradient, 24x24, transparent background, top-down 3/4 view, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 近战三连斩（新增 key，朝右；与 `slash` 区分：更窄更快的月牙）。

#### magic_burst · 火弹爆发（新增 key）
- 贴图key：`magic_burst`（新 key，需注册；16×16）
- 尺寸：16×16（对称爆）
- 朝向右：否（对称爆裂）
- 中文提示词：像素爆炸特效，炽炎火球爆裂，橙红（#FFB84A/#C03A2A）放射火星与碎焰环，中心亮白，锐利无柔光无渐变，16x16，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art explosion effect, blazing fireball burst, orange-red (#FFB84A/#C03A2A) radial sparks and flame-ring, bright-white center, crisp no glow no gradient, 16x16, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 火弹命中爆发（新增 key）。

### 3.2 三职业招牌机制 FX（全部新 key，需注册；呼应 `docs/01` 机制线）

#### 丹修（丹炉/药杵 · 丹药buff/毒伤/召唤药灵 · 丹方）

##### fx_dan_halo · 丹炉光环
- 贴图key：`fx_dan_halo`（新 key，需注册；32×32）
- 尺寸：32×32（对称环）
- 朝向右：否
- 中文提示词：像素光环特效，丹修丹炉暖光环，丹红与药金（#D04030/#E8B040）同心圆药力光环带上升药气点，锐利无柔光无渐变，32x32，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art halo effect, alchemist furnace warm halo, crimson-gold (#D04030/#E8B040) concentric alchemy rings with rising herb-vapor specks, crisp no glow no gradient, 32x32, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 丹修 buff/持续药力光环（新 key）。

##### fx_poison_cloud · 毒云
- 贴图key：`fx_poison_cloud`（新 key，需注册；32×32）
- 尺寸：32×32（对称团）
- 朝向右：否
- 中文提示词：像素毒云特效，丹修毒伤紫绿毒雾团，毒绿与玄紫（#4AC060/#9050D0）翻滚毒泡带骷髅气点，锐利块面无柔光无渐变，32x32，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art poison cloud effect, alchemist venom violet-green fog blob, poison-green and purple (#4AC060/#9050D0) rolling venom bubbles with skull-mist specks, crisp blocks no glow no gradient, 32x32, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 丹修毒伤区域（新 key）。

##### fx_yaoling · 药灵
- 贴图key：`fx_yaoling`（新 key，需注册；16×16）
- 尺寸：16×16
- 朝向右：否（小精灵，可四向）
- 中文提示词：像素召唤精灵，丹修药灵小精怪，圆润丹红药金身躯（#D04030/#E8B040）带两片药叶翅与亮眼，可爱锐利无柔光，16x16，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art summoned sprite, alchemist spirit familiar, rounded crimson-gold body (#D04030/#E8B040) with two herb-leaf wings and bright eyes, cute crisp no glow, 16x16, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 丹修召唤药灵单位（新 key）。

#### 阵法师（阵盘/符笔 · 布阵/陷阱/范围压制 · 阵眼）

##### fx_formation · 阵法阵纹地面
- 贴图key：`fx_formation`（新 key，需注册；48×48）
- 尺寸：48×48（地面对称纹）
- 朝向右：否
- 中文提示词：像素地面阵纹，阵法师布阵发光符纹，阵蓝与符黄（#3060E0/#F0D040）同心圆 + 八卦/星角阵纹带旋转光点，俯视正视角，透明背景，1px深色描边，无柔光无渐变，锐利像素
- 英文提示词：pixel art ground formation glyph, formation master glowing talisman sigil, formation-blue and talisman-gold (#3060E0/#F0D040) concentric circle with star-corner glyphs and rotating light dots, top-down view, transparent background, 1px dark outline, no glow no gradient, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 阵法师阵法领域地面（新 key；`阵眼`联动触发）。

##### fx_talisman · 符箓爆发
- 贴图key：`fx_talisman`（新 key，需注册；24×24）
- 尺寸：24×24（对称爆）
- 朝向右：否
- 中文提示词：像素符箓爆发，阵法师符纸炸裂金光，符黄（#F0D040）放射符文碎片与阵蓝光屑，中心亮白，锐利无柔光无渐变，24x24，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art talisman burst, formation master paper-talisman explosion, talisman-gold (#F0D040) radial rune-shards with formation-blue sparks, bright-white center, crisp no glow no gradient, 24x24, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 阵法师符箓主动技（新 key）。

##### fx_trap_field · 困杀阵域
- 贴图key：`fx_trap_field`（新 key，需注册；48×48）
- 尺寸：48×48（地面对称域）
- 朝向右：否
- 中文提示词：像素困阵领域，阵法师困杀阵域地面封锁纹，阵蓝（#3060E0）锁链与符黄（#F0D040）封印角构成的封闭阵，俯视正视角，透明背景，1px深色描边，无柔光无渐变，锐利像素
- 英文提示词：pixel art trap domain, formation master sealing prison field, formation-blue (#3060E0) chains with talisman-gold (#F0D040) sealing corners forming a closed array, top-down view, transparent background, 1px dark outline, no glow no gradient, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 阵法师困杀/控制领域（新 key）。

#### 魔修（魔刃/骨器 · 高爆发/吸血/自残换伤 · 魔煞）

##### fx_blood_aura · 魔煞血气
- 贴图key：`fx_blood_aura`（新 key，需注册；32×32）
- 尺寸：32×32（对称环）
- 朝向右：否
- 中文提示词：像素血气光环，魔修魔煞环绕血气，魔紫与血黑（#6A1A8A/#1A0A1A）翻腾血雾带血红（#E04050）脉动点，锐利无柔光无渐变，32x32，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art blood aura, demonic cultivator surging blood-mist halo, demonic-purple and blood-black (#6A1A8A/#1A0A1A) with pulsing blood-red (#E04050) specks, crisp no glow no gradient, 32x32, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 魔修魔煞状态/低血脉动光环（新 key）。

##### fx_bloodnova · 血爆AoE
- 贴图key：`fx_bloodnova`（新 key，需注册；32×32）
- 尺寸：32×32（对称爆）
- 朝向右：否
- 中文提示词：像素血爆特效，魔修血气爆裂AoE，血红（#E04050）放射血刃与血雾环，中心亮白，锐利无柔光无渐变，32x32，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art blood explosion, demonic cultivator blood nova AoE, blood-red (#E04050) radial blood-blades and mist ring, bright-white center, crisp no glow no gradient, 32x32, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 魔修血爆范围技（新 key；呼应"斩杀回复"）。

##### fx_blade_trail · 魔刃拖尾（朝右）
- 贴图key：`fx_blade_trail`（新 key，需注册；24×8）
- 尺寸：24×8，**朝右**
- 朝向右：是
- 中文提示词：像素拖尾特效，魔修魔刃血色拖尾，朝右的魔紫（#6A1A8A）刃影带血红（#E04050）消散尾迹，锐利无柔光，24x8，水平朝向，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art trail effect, demonic blade blood-colored trail pointing RIGHT, demonic-purple (#6A1A8A) blade-shadow with blood-red (#E04050) fading tail, crisp no glow, 24x8, horizontal orientation, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 魔修魔刃攻击拖尾（新 key，朝右；配合 `slash`/`melee_arc`）。

### 3.3 通用炫酷元素（全部新 key，需注册）

#### fx_aoe_fire / fx_aoe_ice / fx_aoe_thunder / fx_aoe_poison · 元素 AoE 光环/域
- 贴图key：`fx_aoe_fire`、`fx_aoe_ice`、`fx_aoe_thunder`、`fx_aoe_poison`（新 key；各 32×32）
- 尺寸：32×32（对称环/域）
- 朝向右：否
- 中文提示词（火）：像素元素领域特效，炽炎 AoE 光环，橙红（#FFB84A/#C03A2A）火焰环带上升火星，锐利无柔光无渐变，32x32，透明背景，1px深色描边，锐利像素
- 英文提示词（火）：pixel art elemental AoE ring, blazing fire field, orange-red (#FFB84A/#C03A2A) flame ring with rising embers, crisp no glow no gradient, 32x32, transparent background, 1px dark outline, crisp pixels
- 中文提示词（冰）：像素元素领域特效，寒冰 AoE 光环，冰蓝（#4AC0D0/#4090E0）冰晶环带霜花，锐利无柔光无渐变，32x32，透明背景，1px深色描边，锐利像素
- 英文提示词（冰）：pixel art elemental AoE ring, freezing ice field, icy-blue (#4AC0D0/#4090E0) crystal ring with frost flowers, crisp no glow no gradient, 32x32, transparent background, 1px dark outline, crisp pixels
- 中文提示词（雷）：像素元素领域特效，雷霆 AoE 光环，雷金（#F0D040）电环带紫白（#5A4EA0）电弧，锐利无柔光无渐变，32x32，透明背景，1px深色描边，锐利像素
- 英文提示词（雷）：pixel art elemental AoE ring, thunder field, thunder-gold (#F0D040) electric ring with violet-white (#5A4EA0) arcs, crisp no glow no gradient, 32x32, transparent background, 1px dark outline, crisp pixels
- 中文提示词（毒）：像素元素领域特效，剧毒 AoE 光环，毒绿与玄紫（#4AC060/#9050D0）毒泡环带，锐利无柔光无渐变，32x32，透明背景，1px深色描边，锐利像素
- 英文提示词（毒）：pixel art elemental AoE ring, virulent poison field, poison-green and purple (#4AC060/#9050D0) venom-bubble ring, crisp no glow no gradient, 32x32, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 各元素 AoE 地面指示/持续域（新 key；与职业/功法元素标签对应）。

#### fx_crit · 会心闪光
- 贴图key：`fx_crit`（新 key，需注册；16×16）
- 尺寸：16×16（对称星爆）
- 朝向右：否
- 中文提示词：像素闪光特效，会心/暴击金色星爆，天机金（#D4A04A）四角星芒 + 亮白核心，锐利无柔光无渐变，16x16，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art crit flash, golden four-point star burst, celestial-gold (#D4A04A) star-rays with bright-white core, crisp no glow no gradient, 16x16, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 会心/暴击命中闪光（新 key；配合飘字 `★` 前缀，见 art-bible §5）。

#### fx_droplight · 掉落/拾取光柱
- 贴图key：`fx_droplight`（新 key，需注册；32×96）
- 尺寸：32×96（竖直光柱）
- 朝向右：否（竖直）
- 中文提示词：像素光柱特效，竖直掉落光柱，银白半透明光柱由地面升腾，锐利边缘无柔光无渐变，32x96，透明背景，1px深色描边，锐利像素
- 英文提示词：pixel art light pillar effect, vertical drop light beam, silver-white translucent pillar rising from ground, crisp edges no glow no gradient, 32x96, transparent background, 1px dark outline, crisp pixels
- 负面提示词：§1.3
- 嵌入说明：`DungeonScene` 掉落/拾取光柱（新 key）。**品质双编码**：sprite 为中性银白光柱，运行时按品质色（`docs/art/...v0.2` §5.2：白/绿/蓝/紫/橙/红）tint + 粒子密度递增，**不依赖颜色单一通道**；光柱着色与边框/角标由代码侧叠加。

---

## 4. Key 汇总表（便于主理人评审与注册）

| key | 类别 | 尺寸 | 朝右 | 状态 | 嵌入点 |
|---|---|---|---|---|---|
| `bg_qingming` | 区域背景 | 360×640 | — | 新key | DungeonScene 青冥背景 |
| `bg_youming` | 区域背景 | 360×640 | — | 新key | DungeonScene 幽冥背景 |
| `bg_chiyan` | 区域背景 | 360×640 | — | 新key | DungeonScene 赤炎背景 |
| `bg_tianji` | 区域背景 | 360×640 | — | 新key | DungeonScene 天机背景 |
| `bg_wujin` | 区域背景 | 360×640 | — | 新key | DungeonScene 无尽背景 |
| `bg_dongfu` | 区域背景 | 360×640 | — | 新key | DungeonScene 洞府背景 |
| `floor_*/wall_*`(6区) | 地块tile | 16×16 | — | 新key/覆盖 | levelgen.ts 拼接 |
| `bg_jiuyou` / `bg_leiyuan` | 区域背景(可选) | 360×640 | — | 可选新key | DungeonScene 新秘境 |
| `slash` | FX | 24×24 | 否 | 覆盖 | melee_arc |
| `sword_proj` | FX | 12×6 | 是 | 覆盖 | flying_sword |
| `bolt` | FX | 8×8 | 是 | 覆盖 | magic_bolt |
| `proj` | FX | 8×8 | 是 | 覆盖 | 敌方毒弹 |
| `frost_nova` | FX | 24×24 | 否 | 新key | frost_nova |
| `thunder_chain` | FX | 16×8 | 是 | 新key | thunder_chain |
| `sword_array` | FX | 48×48 | 否 | 新key | sword_array |
| `whirlwind` | FX | 32×32 | 否 | 新key | whirlwind |
| `giant_sword` | FX | 16×48 | 是 | 新key | giant_sword |
| `melee_arc` | FX | 24×24 | 是 | 新key | 近战三连斩 |
| `magic_burst` | FX | 16×16 | 否 | 新key | 火弹爆发 |
| `fx_dan_halo` / `fx_poison_cloud` / `fx_yaoling` | 丹修FX | 32/32/16 | 否 | 新key | 丹修机制 |
| `fx_formation` / `fx_talisman` / `fx_trap_field` | 阵法师FX | 48/24/48 | 否 | 新key | 阵法师机制 |
| `fx_blood_aura` / `fx_bloodnova` / `fx_blade_trail` | 魔修FX | 32/32/24 | 否/否/是 | 新key | 魔修机制 |
| `fx_aoe_fire/ice/thunder/poison` | 元素AoE | 32×32 | 否 | 新key | 元素域 |
| `fx_crit` | 通用FX | 16×16 | 否 | 新key | 会心闪光 |
| `fx_droplight` | 通用FX | 32×96 | 否 | 新key | 掉落光柱(品质双编码) |

---

## 5. 建议用户优先生成的前 5 项（性价比最高 / 最影响观感）

> 以下按"观感跃升 / 使用频次 / 落地成本"排序，建议用户先出这 5 张，回头交给主理人嵌入即可看到明显升级：

1. **`slash`（剑光弧，24×24，覆盖）** —— 核心战斗反馈，现状 C 档最拉低体验；重做后剑修/仙子普攻打击感直接起飞。
2. **`sword_proj`（飞剑，12×6，朝右，覆盖）** —— 飞剑是招牌意象，现状灰弹头不像剑；改银白剑+青尾后辨识度与炫酷感双升。
3. **`bg_chiyan`（赤炎魔窟背景，360×640）** —— 熔岩流动感 + 赤焰主题色最能制造"炫酷"第一印象，且是新区域（无旧资产可比对，自由度高）。
4. **`fx_bloodnova`（魔修血爆AoE，32×32）** —— 魔修是待补三职业之一，血爆是招牌爆发，炫酷且呼应"魔煞/斩杀回复"机制，出图即能体现职业差异。
5. **`fx_droplight`（掉落光柱，32×96）** —— 暗黑式光柱是掉落驱动游戏的核心爽点，配合品质双编码 tint，落地成本低、收益高。

> 次优先：`bg_qingming`/`bg_youming`（与现有 cave_bg 形成区域对比）、`frost_nova`/`thunder_chain`（补全现有攻击模式特效）、`fx_formation`（阵法师阵纹，最能体现"布阵"机制）。

---

## 附录 · 与现有文档引用关系

- `docs/04-美术素材AI生成规范.md`：尺寸/命名/目录/朝右约定/提示词后缀/角色帧表规范 —— 本包所有 key 与后缀均对齐。
- `docs/art/art-bible-and-iteration-plan.md`（v0.2）：色板（6 区域主题色、5 职业色、6 品质色、描边 `#0A0E1A`）、品质双编码、像素规范升级 —— 本包 HEX 取值与限色/描边/剪影规则全部引用之。
- `docs/01-项目策划方案.md`：五大职业机制线（丹修丹炉/毒/药灵、阵法师阵眼/布阵、魔修魔煞/血爆）—— 本包 §3.2 三职业 FX 呼应之。
- 嵌入与 key 注册：由主理人（team-lead）在 `textures.ts` / `classes.json` / `DungeonScene` / `levelgen.ts` 完成（见 `docs/04` §5），不在本文档范围。

---

**END · v1.0 · 提示词包（地图 + 特效，更炫酷版）**
