# 资产目录规范（Asset Directory Spec）

> 生效日期：2026-08-30 ｜ 维护人：程基岩（工程）／林绘澄（美术）
> 适用范围：`修仙与地上城`（Phaser 3.90 + Vite 5.4 + TS + Vitest）

---

## 0. 一句话原则

> **`public/` 是唯一的运行时资源源。任何脚本不得直接写 `dist/`。**

Vite 的行为决定了这条原则不是偏好，而是硬约束：

| 场景 | Vite 行为 | 后果 |
|---|---|---|
| `npm run dev` | 只服务 `public/`（publicDir 默认 `public`） | 放在 `dist/` 的资源**根本取不到**，请求命中 SPA fallback 返回 `index.html` |
| `npm run build` | 先 `emptyOutDir` 清空 `dist/`，再把 `public/` 复制进去 | 放在 `dist/` 的资源**被直接删除** |

两种情况都会让 Phaser 的 `load.json` 把 HTML 当 JSON 解析，抛
`Unexpected token '<'` 并冒泡到 `window.onerror` → **首屏红色错误横幅**。

只要资源在 `public/`，dev 与 build 就**结构上不可能**不一致。

---

## 1. 目录职责表

| 目录 | 职责 | 谁写 | 是否进版本/发布包 | 当前规模 |
|---|---|---|---|---|
| `public/sprites/` | **运行时资源**：PNG 帧表、atlas/anims JSON | 生成脚本（唯一出口） | ✅ 随构建进 dist | 2083 文件 / 159 MB |
| `public/audio/` | **运行时资源**：MP3（BGM + 音效） | 手工放入 | ✅ | 17 文件 |
| `assets/source/` | **源素材**（原始、未处理、只读） | 美术/AI 产出，**代码绝不写这里** | ⬜ 不进发布包 | 119 文件 / 80.9 MB |
| `dist/` | **构建产物**（`vite build` 输出） | 只有 Vite | ✅ 发布用 | — |
| `dist-minitool/` | **小工具构建产物**（`vite build --config vite.config.minitool.ts` 的 outDir） | 只有 Vite | ✅ 小工具专用 | — |
| `archive/` | **归档**：历史构建产物、被替换的旧素材 | 治理操作 | ⬜ | 116 MB |
| `backup/` | **改动前备份** | 治理操作 | ⬜ | — |
| `release/` | 历史 TapTap 打包 zip 记录 | 手工 | ⬜ | — |
| `scripts/` | 生成/校验脚本 | 工程 | ⬜ | 37 个 |

> ⚠️ **`dist-minitool/` 是活跃构建产物**，不是历史垃圾——它是 `npm run build:minitool`
> 的 outDir（`vite.config.minitool.ts`）。**不要归档它。**

### 1.1 `assets/source/` 子目录（2026-08-30 统一后）

历史上存在四个极易混淆的源素材目录（其中两个仅差一个字符 `-` / `_`），现已全部合并：

| 子目录 | 内容 | 原目录 | 文件数 / 体积 |
|---|---|---|---:|
| `ai-sheets/` | AI 生成的原始精灵表（仙界敌人 / 特效），**去水印前** | `ai-assets/` | 21 / 14 MB |
| `ai-categories/` | AI 生成的分类素材：灵兽、阵法、NPC、建筑、场景（**去水印前**） | `assets/`（9 个分类子目录） | 35 / 22 MB |
| `class-sheets/` | 职业精灵表原始 + `v2/` `v3/` 中间产物 | `assets-src/` | 60 / 38 MB |
| `portraits/` | NPC 立绘原始（韩前辈 / 乐上师，黄龙山） | `assets_src/` | 3 / 6.9 MB |

**用途标注（重要）**：`ai-sheets/` 与 `ai-categories/` 里的 `.jpg` 是 **AI 生成、尚未去水印/去背**的
原始素材。`scripts/remove-ai-watermark.mjs`、`scripts/slice-ai-sheets.mjs` 等脚本从这里读取，
产物写入 `public/sprites/`。**不要把原始素材直接拷进 `public/`**——会带水印进游戏。

---

## 2. 新资源该放哪

按下面三步走，不需要猜：

1. **这是给游戏运行时用的吗？**
   - 是 → 最终产物必须落在 `public/sprites/`（或 `public/audio/`）
   - 否（原始素材 / 中间产物 / 参考图）→ 放 `assets/source/` 下对应子目录

2. **是原始素材吗？**（AI 出图、手绘稿、去背前的图）
   - 是 → `assets/source/<对应子目录>/`，并且**先在这里留档**，再去处理

3. **是脚本生成的中间产物吗？**（切片帧、检查图、临时 atlas）
   - 是 → 也放 `assets/source/`（不要放 `public/`，否则会被打进发布包）

**决策表：**

| 你手上的东西 | 放这里 |
|---|---|
| AI 生成的原始 jpg 精灵表 | `assets/source/ai-sheets/` 或 `ai-categories/` |
| 职业/NPC 立绘原始图 | `assets/source/portraits/` 或 `class-sheets/` |
| 去背后 / 切片后的 PNG 帧 | `public/sprites/` |
| atlas JSON / anims JSON | `public/sprites/` |
| MP3 音频 | `public/audio/` |
| 脚本中间产物、检查图 | `assets/source/`（**不要**放 `public/`） |
| 被替换下来的旧资源 | `archive/<日期>-<原因>/` |

---

## 3. 生成脚本必须输出到哪个目录

**唯一出口：`public/sprites/`**（音频为 `public/audio/`）。

已有脚本的输出目录（均已确认合规）：

| 脚本 | 输入 | 输出 |
|---|---|---|
| `scripts/slice-ai-sheets.mjs` | `assets/source/ai-sheets/` | `public/sprites/` |
| `scripts/jpg-to-png-transparent.mjs` | `assets/source/` | `public/sprites/` |
| `scripts/build-atlas-from-frames.mjs` | `public/sprites/frames/` | `public/sprites/` |
| `scripts/build-class-atlas*.mjs` | `assets/source/class-sheets/` | `public/sprites/` |
| `scripts/split-npc-sheet*.mjs` | `assets/source/ai-categories/npcs/` | `public/sprites/` |
| `scripts/remove-bg.py` | `assets/source/class-sheets/` | `public/sprites/` |
| `scripts/rebuild-fairy-sheet.py` | `assets/source/class-sheets/v3/` | `public/sprites/` |
| `tools/make_hl_sprites.py` | `assets/source/portraits/` | `public/sprites/` |
| `scripts/generate-*.mjs` | 程序化生成 | `public/sprites/` |

**自动拦截**：`scripts/validate-assets.mjs` 有两道闸门会挡住违规写入——

1. **脚本卫生**：扫描 `scripts/` 与 `tools/` 下所有 `.mjs/.js/.py`，若脚本里出现
   `dist/...` 路径字面量且不在白名单内 → **校验失败**。
   白名单仅限发布链路脚本（`minitool-postbuild.mjs`、`build-taptap.mjs`、
   `optimize-minitool-assets.mjs`、`pack-atlas.mjs`、`check-png-sizes.mjs`）
   与迁移/校验脚本本身。**新增白名单必须写明理由。**
2. **dist 纯度**：比对 `dist/sprites/` 与 `public/sprites/`，若 dist 里有 public 之外的文件
   → **校验失败**。当前差异为 **0**。

---

## 4. 命名约定

| 资源类型 | 命名 | 示例 |
|---|---|---|
| 职业帧表 | `{class}_spritesheet.png` + `{class}_atlas.json` + `{class}_anims.json` | `sword_spritesheet.png` |
| 灵兽 | `beast_{id}_sheet.png` + `beast_{id}_atlas.json` + `beast_{id}_anims.json` | `beast_qilin_sheet.png` |
| 阵法 | `formation_{type}_spin.png` + `formation_{type}_atlas.json` + `_anims.json` | `formation_attack_spin.png` |
| NPC/弟子 | `npc_{id}_sheet.png` + `npc_{id}_atlas.json` + `npc_{id}_anims.json` | `npc_elder_sheet.png` |
| 宗门建筑 | `sect_buildings_{group}.png` + `building_{id}.json` | `sect_buildings_core.png` |
| 序列帧特效 | `{prefix}_{n}.png`（n 从 1 起，见 `src/fx/sequence-contract.ts`） | `fx_meteor_3.png` |
| v4 Kit | `v4/{kit}_{channel}_{phase}_{n}.png`、`v4/{kit}_icon_{i}.png`（**icon 从 0 起**） | `v4/k01_art_main_5.png` |
| 地形瓷砖 | `terrain/{prefix}_{tile}.png` | `terrain/qm_floor_base.png` |
| 仙界敌人 | `xian/{enemy}_{n}.png`（n: 1..16） | `xian/boss_xianzun_7.png` |
| 音频 | `audio/{key}.mp3` | `audio/bgm_title.mp3` |

**atlas JSON 格式**：TexturePacker **JSON-Array**（`textures[0]`）与 **JSON-Hash**（`frames{}` + `meta.image`）
都支持——校验器两种都认。但**同一批资源请保持一种格式**。

**anims JSON 的帧 `key` 必须与 BootScene 传给 `this.load.atlas()` 的 key 一致**
（如 `sword_atlas`、`beast_wolf_atlas`）。这是历史上一度误报的原因，现在校验器按 BootScene 的实际 key 校验。

---

## 5. 如何跑资源校验

```bash
npm run validate:assets          # 资源校验（默认：可选资源缺失仅告警）
npm run validate:assets:strict   # 严格模式：可选资源缺失也判失败
npm run validate                 # 配置表 + 资源，一起跑
npm test                         # 含 tests/asset-manifest.test.ts，资源缺失会红
```

**自动触发点（已接线）：**

| 时机 | 命令 | 行为 |
|---|---|---|
| `npm run dev` | `predev` → `validate-data` + `validate-assets` | 失败则**不启动** dev server |
| `npm run build` | `prebuild` → 同上 | 失败则**不构建** |
| `npm test` | `tests/asset-manifest.test.ts` | 资源缺失 → 测试用例失败 |

> 三层保险的意义：即使有人绕过 `predev` 直接跑 `npm test`，资源缺失依然会被拦下。

### 5.1 校验覆盖什么

清单**从源码解析**，不在校验器里抄一份常量表：

| 来源 | 内容 |
|---|---|
| `src/scenes/BootScene.ts` | `ANIM_CLASSES`(5)、`BEAST_ANIM_IDS`(8)、`FORMATION_ANIM_TYPES`(3)、`NPC_ANIM_IDS`(4)、`BUILDING_IDS`(14)、`BUILDING_SHEET_MAP`、`BUILDING_SHEET_FILES`、`FX_ANIMS`(31)、`terrainTiles`(22)、`xianEnemies`(13)、`aiEffectSheets`(6) |
| `src/audio.ts` | `AUDIO_KEYS`(17)（含 `BGM_TITLE` 等常量解析） |
| `src/textures.ts` | `SPRITE_KEYS`(46) |
| `src/data.ts` | `REGIONS.terrainPrefix`(4)、`V4_KIT_WHITELIST`(30) |
| `src/fx/sequence-contract.ts` | `numberedTextureKeys()` 注册包 |
| `src/v4/manifest.ts` | `FRAME_BUDGET`、通道/阶段映射、命名模板、`iconKeys` 数量 |

**检查项：**

1. **存在性**：必需资源 **303 项**逐个断言 `public/` 下文件存在（`severity=required`，缺失即失败）
2. **可选资源**：1614 项（有程序化兜底，缺失仅告警；`--strict` 下升级为失败）
3. **atlas ↔ anims 一致性**（34 个资源包）：atlas 引用的图片存在且与 BootScene 加载的一致；
   anims 的每一帧 key/frame 都能在 atlas 里找到
4. **命名模板防漂移**：每个分组的命名模板必须原样出现在 BootScene.ts 中，否则报错
5. **清单解析防漂移**：任何常量解析不出来 → 直接报错，**绝不静默跳过**
6. **dist 纯度**：`dist/sprites` ⊄ `public/sprites` 的文件数必须为 0
7. **脚本卫生**：37 个脚本扫描，禁止违规引用构建产物目录

### 5.2 已知的可选资源缺失基线

登记在 `tests/asset-manifest.test.ts` 的 `APPROVED_OPTIONAL_MISSING`，
**新增缺失必须登记理由，已补齐的条目必须删除**（测试双向校验）：

| 文件 | 原因 |
|---|---|
| `sprites/player.png`、`sprites/npc.png` | `src/textures.ts` 的 `generateMissing` 程序化兜底，属预期设计 |
| `sprites/sect_bg.jpg` | 宗门背景：AI 源素材在 `assets/source/ai-categories/scenes/sect_bg.jpg`，尚未合成进 `public/`；`SectScene` 有 Graphics 兜底（**待决策，见 §8**） |

---

## 6. 红线（违反即校验失败）

1. ❌ **任何脚本不得直接写 `dist/`、`dist-minitool/` 或其他构建产物目录**
   （例外：发布链路脚本 + 显式白名单 + 写明理由）
2. ❌ 不得把原始素材（带水印/未去背）拷进 `public/`
3. ❌ 不得在校验器里硬编码资源清单——必须从源码解析
4. ❌ 不得用 `emptyOutDir: false` 绕过 dist 被清空的问题——那只是把故障推迟到下一次清理
5. ❌ 不得删除文件——一律移动进 `archive/<日期>-<原因>/`（本项目非 Git 仓库，删除不可逆）

---

## 7. 2026-08-30 治理记录

| 操作 | 内容 | 数量 / 体积 |
|---|---|---:|
| 归档历史构建目录 | `dist-check`、`dist-p0-verify`、`dist-p0-verify-2`、`dist-probe`、`dist-probe-anim`、`dist-procedural-qa`、`dist-procedural-qa-final`、`dist-procedural-qa-release`、`dist-prs-architecture-review-a`、`dist-prs-architecture-review-b`、`dist-qa`、`dist-slash-test` → `archive/20260830-dist-history/` | 12 目录 / 102 MB |
| 保留 | `dist-minitool/`（活跃 outDir，非历史） | — |
| 统一源素材目录 | `ai-assets/` → `assets/source/ai-sheets/`<br>`assets/`（9 分类） → `assets/source/ai-categories/`<br>`assets-src/` → `assets/source/class-sheets/`<br>`assets_src/` → `assets/source/portraits/` | 119 文件 / 80.9 MB |
| 归档冗余 jpg | `dist/sprites/` 下 20 个已转 PNG 的残留 jpg → `archive/20260830-dist-redundant-jpg/` | 20 文件 / 14 MB |
| 接线防回归 | `validate:assets` 挂到 `predev`/`prebuild`；新增 `tests/asset-manifest.test.ts` | — |
| 备份 | 所有被改动文件 → `backup/20260830-asset-governance/` | 8 文件 |

**未删除任何文件**，全部为移动归档，可随时回溯。

---

## 8. 待用户决策项（需批准，未擅自处理）

| # | 事项 | 影响 | 建议 |
|---|---|---|---|
| 1 | `public/sprites/frames/`（150 文件 / **34.6 MB**）**未被任何代码引用**，却会整包打进每个 dist | 发布包体积 | 确认无引用后移入 `archive/`。**改动 `public/` 内容属行为变更，需用户批准** |
| 2 | `sprites/sect_bg.jpg` 缺失（宗门背景） | 宗门场景走 Graphics 兜底 | 源素材在 `assets/source/ai-categories/scenes/sect_bg.jpg`，需经去背/尺寸处理后写入 `public/sprites/`。**属内容变更，需用户批准** |
| 3 | `public/sprites/_tmp_atlas/` 空目录 | 可忽略 | 可归档，无风险 |
| 4 | 归档目录累计 116 MB | 磁盘占用 | 确认无回溯需求后可整体外迁或删除 |

---

## 9. 新人 30 秒速查

```
要加一个新灵兽动画？
  1. AI 出图（原始 jpg）        → assets/source/ai-categories/beasts/
  2. 去背 / 切片 / 生成 atlas   → 脚本输出 public/sprites/beast_xxx_sheet.png
                                            public/sprites/beast_xxx_atlas.json
                                            public/sprites/beast_xxx_anims.json
  3. 在 src/scenes/BootScene.ts 的 BEAST_ANIM_IDS 里加 id
  4. npm run validate:assets    → 校验器自动从 BEAST_ANIM_IDS 读到新 id 并断言文件存在
  5. npm test                   → tests/asset-manifest.test.ts 再兜一道
```
