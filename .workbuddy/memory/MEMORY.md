# 修仙与地下城 — 项目长期记忆

## 概览
`修仙与地下城`（xiuxian-dungeon），Phaser 3.90 + Vite 5.4 + TS 5.6 + Vitest，竖屏 360×640 像素修仙。仓库 `C:\kimi\修仙与地下城`；远程 GitCode `philocoding/xiuxian-dungeon`（私有）。实际是**大型复合游戏**（宗门经营 + 大世界 + 弟子养成 + 战斗 VFX + 外交 + 渡劫/心魔 + 程序化 NPC），非单纯 Roguelike。

## 环境限制（踩坑必读）
- 沙箱内**禁止 `npm run build`**：`genie-safe-delete` 拦截 Vite 清理 `dist/`（`SAFE_DELETE_BULK_GUARD_ERROR`），且失败那次已清空旧 dist。改 `npx vite build --outDir dist-fix` → `mv dist dist-old && mv dist-fix dist`。
- **PowerShell 覆盖已存在的大 zip 同样触发该守卫** → 先 `Move-Item` 改名腾位再打包（不加 `-Force`）。
- Bash stdout 偶发为空 → 输出重定向到文件再 Read；PowerShell stdout 也会被吞。
- **AI 侧无法 push git**（Bash 沙箱阻断 HTTPS；PowerShell 里 git 不可用）→ 主理人外部终端执行。
- 打包只能用 PowerShell `Compress-Archive`（Git Bash 无 `zip`）；PS 的 `Add-Type` 被安全策略禁用，校验 zip 用 Git Bash `unzip -p/-l/-t`。
- ⚠️ 并行 Edit 同一文件会静默丢失改动 → 串行；批量文案替换改用「node split/join + 命中数断言」脚本。

## 验证命令
`npm run typecheck`；单测 `node ../vitest-env/node_modules/vitest/vitest.mjs run --config ./vitest.config.ts`（vitest 在项目外 `../vitest-env`，`npx vitest` 会误报无测试）；`npm run validate:data` / `validate:assets`。
**基线 653 测试 / 6 项既有失败**（asset-manifest 3 + state.test 2 的 PRESET_COUNT 漂移 + B18 sectLevel 未用），非回归。
数量事实权威源 `node scripts/validate-data.mjs`（5 职业 / 22 怪物 / 63 装备基座 / 10 词缀 / 67 功法 / 30 v4Kit）。
提交前必查：`git status --porcelain | grep '^??'` + `du -h`。

## 发布 / 版本号
- **当前版本 v0.9**（2026-09-11 出包）。**游戏内版本唯一真源**：`index.html` 的 `<div id="titleVer">`（样式 `src/style.css:164`）。改版本须同步三处：`package.json.version` / `index.html` titleVer / release 包文件名。
- **TapTap H5 包结构（铁律，打错就不可用）**：解压后**只有单个顶层文件夹 `xiuxian-dungeon/`**，index.html 在其内；条目路径必须**正斜杠**；带目录条目。核对依据：release 里 v0.5/v0.6/v0.7 历史包 + `.trae/skills/xiuxian-release/SKILL.md` + `docs/v0.7版本说明.md`（写明「正斜杠 Linux 兼容」）。
- ⚠️ **绝不能用 PowerShell `Compress-Archive` 打这个包**（会写出 `assets\index.js` 反斜杠 + 无顶层文件夹 → TapTap 解析异常）。统一用 **`python scripts/pack-taptap-zip.py <输出zip> --src dist`**。
- 产物 `release/修仙与地下城-taptap-YYYYMMDD-vX.Y.zip` + 上传用 `dist-taptap-h5.zip`（约 250MB，2123 文件 / 2134 条目，上限 300MB 警戒）。
- **已验证可用的样本包**（结构无从查证时直接对比它）：`release/修仙与地下城-taptap-20260908-v0.7.zip`、`release/修仙与地下城-taptap-20260910-v0.8.zip`（**用户已确认可用**）、`...20260911-v0.9.zip`（结构与前两者一致，待实机验证）。
- 出包后一行校验：`unzip -l 包 | sed -n '4,6p'`（顶层 `xiuxian-dungeon/`）+ `unzip -l 包 | grep -c '\\'`（须为 0）+ `unzip -l 包 | grep index.html`（须 `xiuxian-dungeon/index.html`）+ `unzip -t 包 | tail -1`（No errors）。
- 完整流程见 skill `taptap-h5-release`；崩溃定位见 skill `phaser-h5-crash-triage`。项目另有 `.trae/skills/`（xiuxian-release / xiuxian-game-dev / xiuxian-audio-workflow）——**改发布相关前先看它**，那里是历史权威口径。

## 核心系统真源
- **队伍**：`state.party: PartyMember[]`（`src/party.ts` 与 state.ts 刻意零运行时依赖，只许 `import type`）。旧三字段已删，等价查询 `hasSectSibling()/activeCompanionRef()/activeBeastRef()`。名额 2 修士 + 1 灵兽；道友 `damageTakenRatio=0` 免伤。**SAVE_VERSION = 14**（v14：天赋树改五职业体系，旧档天赋清空免费重置），多槽位 `MAX_SAVE_SLOTS=4`，旧档 `migrate()` + `normalizeGameState()` 回填。P3 开放：队员套装/天赋/装备强化。
- **NPC 修为档案**：`src/npc-progression.ts`（修为 × 经历 × 时间）。装备为真实 EquipItem 四槽，uid 前缀 `npcgear_`，`isNpcOwnedItem()` 拦入包；宗门 20 位固定 NPC 走 `sectNpcProfile()` 派生不入库。`power = 血*0.35+攻*6+防*4+身法*2+会心*300+神通威力*90`，组队倍率 clamp(0.45, 2.2)。详见 `docs/architecture/npc-progression.md`。
- **弟子合轨**：`state.disciples: Disciple[]` 唯一真源，`sect.disciples` 已删；战力统一 `sectDisciplePower()`。
- **天赋树（v0.9 已重做）**：`src/data/talents.json` 结构 `{trees:{classId:{name,branches}}}`，**5 职业各 1 棵 × 3 分支 × 6 节点 = 90 节点**（每分支 3 基础 max8 + 2 进阶 max6 + 1 顶点 max1 = 37 点，全树 111 点 > 100 级 99 点 → 强制取舍）。顶点需本分支先投 24 点（`CAPSTONE_REQ`）。15 流派见 `docs/design/职业天赋树设计方案.md`。运行时 `src/talents.ts`（`canAddPoint/addPoint/autoAssignBranch/savePreset/applyPreset`），UI 按 `state.classId` 渲染。**改天赋数据后必须同步 `scripts/validate-data.mjs` 的 `MOD_KEYS` 与 trees 结构校验**，否则 validate:data 与 set-four-piece-gate 测试直接挂。
- **6 个新战斗机制（v0.9）**：`Mods` 由 12 键扩到 18 键 —— `critDmg/thorns/dodge/dotPct/execute/shieldPct`。接入点：critDmg→`core.calcDamage` 第 6 参；thorns/dodge→`DungeonScene.damagePlayer`；dotPct→`Enemy.applyDot/tickDot`(半秒一跳,3s,每秒=攻击×dotPct×0.2)；execute→`dealDamage` 斩杀(boss 免疫)；shieldPct→层初始化写 `shieldHp`。上限 critDmg≤3/thorns≤0.6/dodge≤0.5/execute≤0.3/shieldPct≤0.6。
- 功法 67 个跨职业零重名/零 attackMode 重复（唯一完全重复：法修·元素精通 ≡ 剑修·剑心通明）。
- **建筑升级**统一 `sect-building-v2.upgradeBuilding(state, id)`（sect-data 旧函数仅供单测）。
- 9 个场景 + anim-guard；DungeonScene / WorldScene / SectScene 巨大；UI 全在 `src/ui.ts` 程序化生成。

## 玩家可见文案铁律
- 内部 key/id 禁入玩家文案，统一走 **`src/labels.ts`**（`resourceLabel/materialLabel/buildingLabel/sectLabel/primitiveLabel`，'player'→你方），缺失给中文兜底；禁止 `ai_sect_4`、`wood×63`、`boomerang`。术语用「气血」不写 HP。
- **v4 八原语是英文 key**（roundtrip/refract/mark/fixedpoint/thundernet/thunderstake/charge/boomerang），v0.9 前直接插值进套装 4 件描述 → 玩家看到「【环斩·boomerang】」。已加 `primitiveLabel()`（往返/折射/标记/定点/雷网/雷桩/蓄力/回旋），`kit-data.ts` 描述必须走它。
- **门禁 `npm run validate:i18n`**（`scripts/scan-cjk-english.mjs`，命中即 exit 1）覆盖三处：`src/**/*.ts` 字面量 + **`index.html` 静态文案**（去 script/style 取标签间文本）+ `src/**/*.json` 显示字段（name/desc/title/label/text/story…）。误报过滤：配对括号剥离 `${三元}`、`{{占位符}}`、注释、`console.*`、`Lv+数字`。**当前 0 命中**。
  - ⚠️ **白名单别乱加**：曾把 `NPC/AI/HP` 放进 ALLOW，直接掩盖 13 处真泄漏（v0.9 第二轮才揪出）。现 ALLOW 仅 `Lv/GM/ID/UI/OK`+版本画质缩写；另有 `ALLOW_HTML` 只放行键盘物理键名（WASD/Esc）与版本号。
  - 改完文案**必须跑负向探针**（临时塞回一个英文词确认被抓到），否则门禁可能因过滤过宽形同虚设。
- 术语对照（v0.9 已全量替换，勿再写旧词）：HP→**气血**、NPC→**修士**、AI 势力→**他方势力**、BOSS→**首领**；1v1→**单人论剑**、1vN→**群战演武**（内部 value 仍 '1v1'/'1vN'）；VS→**对阵**/**迎战**；tick→**每 5 分钟**（`WorldScene` diplomacyTimer=300000ms）；ROGUELIKE→**肉鸽探秘**。
- **有意保留的英文仅两处**：① `Lv` 等级缩写 81 处（HUD `Lv.1`、「当前等级 Lv.3 / 12」）；② `index.html` PC 键位提示条 `WASD/Q/L/K/I/B/E/M/T/Esc`（键帽印刷字符，中文化玩家反而找不到键）。
- Phaser 场景 shutdown 会 destroy 全部对象（`GameObject.destroy()` 置空 `scene`，`Frame.destroy()` 置空 `data`）。跨场景残留引用 = 崩溃（`setTexture` 报 `reading 'sys'`，`setText` 报 `reading 'drawImage'`）。规律：① 按需创建的字段（如 `mountSprite`）必须在 create 清理块置 null；② 异步回调（`tryCompleteQuest().then(...)`）写 UI 前判活 `if (!obj.scene) return`。

## 美术/资产
- 序列帧特效 `public/sprites/{key}_{n}.png`，48×48 RGBA 尖角朝右；BootScene `FX_ANIMS` 全帧齐才注册动画否则回退静态图。**在屏特效源图须低饱和灰度**（`burstFx()` 会 setTint）。
- v4 三十套 1140 张 = 零渲染负债（表现 100% 走 `scene-adapter.ts` Graphics）。28 张特效内嵌抖音 tEXt 元数据，用户裁定沿用不动。
- ⚠️ 计数/分布核对禁止手工点数，用脚本读 JSON 比对 EXPECT。盘点方法见 `docs/art/art-gap-backlog.md`。
- `art-director` 角色无 Bash，派发时须声明「禁用 Bash，只用 Read/Grep/Glob」。

## UI 新增面板约定
面板全在 `src/ui.ts` + `src/style.css`；变量 `--ink/--dim/--line/--bg`，品质色 `.q0~.q4`；双列 `.compare-grid > .compare-col > .compare-col-scroll > .compare-item`（选中 `.selected`）；页签 `.tabs + .active`。新页签同步三处：`type Tab` 联合、`openPanel()` tabs HTML（宽页签加 `wide`）、`renderTab()` 派发。

## 项目分档与文件归档（2026-09-12 起生效）
- **基线不用 git**（主理人裁定）。改用**物理冻结快照 + SHA-256 清单 + CHANGELOG_AI**。`01-baseline/v0.9-frozen-20260912/`（205 文件 / 2.82MB）+ `MANIFEST.json`；校验 `node 01-baseline/gen-manifest.mjs <dir> now.json` 比对 sha256。快照只读，不可就地改。
- **两档物理隔离**：档 A = `C:\kimi\修仙与地下城`（2D v0.9，维护中出 TapTap 包）；档 B = `C:\kimi\修仙与地下城3D`（Godot 重制）。红线：不共享源码 / **不共享存档** / 不共享构建产物；档 B 只能只读引档 A 快照，档 A 不得反向依赖档 B。但 **id 命名空间沿用 v0.9**（kit/装备/功法/套装 id），留单向导入口子。
- **档 B 目录契约**：`00-admin`（总纲+归档规则+5 份状态文档）/ `01-baseline` / `02-plan` / `03-godot` / `04-analysis` / `99-legacy-reference`。**各阶段文件归属表见 `00-admin/文件归档规则.md` §3.1**，新增文件按它落位，禁止扔根目录。
- **Session 开工先读**：`00-admin/PROJECT_STATE.md` + `CURRENT_PHASE.md`，不要重读全仓。
- **档 A 根目录已收敛**：9 文件 + 16 目录（`_archive/` 收全部历史产物，只移不删）。
  - ⚠️ `vite.config.minitool.ts` **必须在根目录**（minitool 入口是根 `index.html`，移走破坏小红书构建链路）。
  - `scripts/_deprecated/build-taptap.mjs` 已废弃，用 `pack-taptap-zip.py`。
  - 根目录活跃文件：index.html / package.json / package-lock.json / tsconfig.json / vite.config.ts / vite.config.minitool.ts / vitest.config.ts / capacitor.config.ts / dist-taptap-h5.zip。

## 3D 重制子项目（`C:\kimi\修仙与地下城3D\`）
- 总纲 `修仙与地下城 3D Godot 重制开发总纲与 GPT 开发规范 v1.0.txt`（64 节），**评级 PASS 可直接开工**；研究报告 `重制计划研究_v1.md`（2026-09-12 出）。
- 定位铁律：**保留机制资产、重建表现资产、重设计 3D 战斗**。机制（属性/伤害/装备/词缀/掉落/Kit/原语/功法/神通/境界/宗门/弟子/外交/存档）KEEP·PORT·REFACTOR；表现（Canvas/Sprite/2D Tile/旧动画/旧特效/2D 控制器）REBUILD。
- 引擎 Godot 4.x **GDScript 优先**；数据驱动 + 组合优于继承 + 事件驱动，**禁深层继承树**；数据/逻辑严格分离（禁 `if kit=="k17"` 硬编码）。
- ⚠️ **v0.9 事实更正（旧记忆写 6 境界是错的）**：实际 **7 境界**（炼气/筑基/金丹/元婴/化神/炼虚/合体，`src/data.ts: REALMS`）。数量一律以 `node scripts/validate-data.mjs` 为准，别信历史文档。
- 家底：5 职业 / 22 怪 / 63 装备基座 / **11 套装** / 10 词缀 / 67 功法 / 90 天赋节点 / 30 v4Kit / 地牢 6 层 / 大世界 5 域 69 点位。
- **v0.9 只用了 8 个原语**（总纲却列 18 个）→ 纵切先做 8 + Projectile + Nova，其余 DEFER，防范围爆炸。
- **v0.9 无机制型词缀**（10 个全是纯数值）；"机制改变"实际由 **套装 4 件 attackMode + Kit** 承担 → 3D 的 Legendary 层是新建不是迁移。
- v0.9 战斗为 2D 方向角制：**无鼠标瞄准、无 Dash/闪避、无目标锁定** → 3D 三项全部新建。
- 已知缺陷：30 Kit 中 **k02≡k26、k03≡k09** 机制重复，PHASE 8 迁移前必须消重。
- 环境：Godot 4.7.1-stable 已装（Downloads）；**导出模板目录空**，出包前需下 ~1GB；**Blender 5.2 已装**（`C:\Program Files\Blender Foundation\Blender 5.2`）；uv/uvx 0.12.13 已装（`~/.local/bin/uvx.exe`）。
- **工具链（2026-09-12 已预装）**：详见 `00-admin/3D重制工具链说明.md`。
  - Skill：`godot-dev-guide`（**autoInvoke+high，写 Godot 代码会自动触发**，首条讲 .gd/.tscn/.tres 别混淆）、`godot-mcp`、`blender`、`blender-mcp`。
  - MCP：`~/.workbuddy/mcp.json` → `godot` 走 `http://127.0.0.1:3000/mcp`；插件已预置 `03-godot/addons/godot_mcp/`。**启用要手动**：Godot 开工程→项目设置→插件启用→WorkBuddy 连接器页点 Trust。
  - ⚠️ **连接器市场没有 Godot MCP**（只有中望3D等工业CAD）→ 只能手动配 mcp.json，别再去找连接器。
  - ⚠️ Godot MCP 插件**与 4.7.1 兼容性未实测**（plugin.cfg 无最低版本），PHASE 1 首次启用要验证；备选 `Coding-Solo/godot-mcp`。
  - **Blender MCP 已端到端实测打通（2026-09-12）**：addon **v1.6/protocol 5** ↔ server `blender-mcp 1.9.1`（PyPI 官方 ahujasid，MIT），`get_addon_status` 返回 `up_to_date: true`，27 个工具，`execute_blender_code` 实跑成功。`~/.workbuddy/mcp.json` 已加 `blender` 条目（stdio → `C:\Users\roy18\.local\bin\uvx.exe blender-mcp`）。
  - **AI 侧调 Blender 首选桥接脚本**（不依赖 MCP 加载时机）：`python 03-godot/_external-tools/blender-bridge.py {ping|scene|obj X|code -f x.py|shot out.png|snapshot}`。
  - ⚠️ **协议坑**：addon 响应**不带换行**，按 `\n` 分帧会阻塞到超时 → 必须读满缓冲再 `json.loads`；命令须 `{"type":..,"params":{...}}` 包裹。
  - ⚠️ **连接器市场没有 Godot MCP**（只有中望3D等工业CAD）→ 只能手动配 mcp.json，别再去找连接器。
  - ⚠️ Godot MCP 插件**与 4.7.1 兼容性未实测**（plugin.cfg 无最低版本），PHASE 1 首次启用要验证；备选 `Coding-Solo/godot-mcp`。
  - ⚠️ 素材版权：**PolyHaven 是 CC0 可商用**（优先用）；`download_sketchfab_model` 有**版权风险**，总纲 §30 要登记 License。
- ⚠️ **基线不用 git**（主理人裁定）：改用 `01-baseline/v0.9-frozen-20260912/`（205 文件）+ `MANIFEST.json`（sha256 锚点）物理冻结；两档隔离红线见 `00-admin/文件归档规则.md`（不共享源码/存档/构建产物，档 B 只读引用档 A 快照）。
- 阶段硬门禁：PHASE 2 战斗原型必须"连续打 10 分钟不别扭"，否则禁止进入后续；PHASE 6 青冥纵切是首个真里程碑（约 6–10 周）。
