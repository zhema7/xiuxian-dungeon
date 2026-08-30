# 《修仙与地下城》冲刺质量门与测试规划（lean 版）

> 版本：**v0.5** · 作者：严守真（测试/QA） · 适用范围：本轮双线冲刺、程序化随机套装（PRS）与**新增 17 个系统模块**当前候选
> 机制线（三职业 + Build/平衡）｜ 美术线（美术圣经 + 素材缺口）｜ 技术线（解耦 / 配置校验）｜ **系统线（宗门/弟子/灵兽/阵法/商会/世界/剧情/成就/日常/NPC/外交/AI宗门）**
> 原则：**只规划不实现**；勾选清单优先、少长文；质量门为**建议性门控**，最终放行由主理人审批。
> 当前自动化／源码门：**PASS（含 P0/P1 五项修复的 QA 独立复验）**。整体候选／发布门仍为 **FAIL / 发布 NO-GO**：
> ① 浏览器真实播放、Phaser 场景 E2E、实际缺帧降级、设备／可读性／性能、标准构建、手工烟雾与 Playtest 尚未签收；
> ② **v0.5 状态：B22 / B27 / B28 / B2 / B1 五项缺陷已修复并通过 QA 独立复验（含变异测试反证），P0 内容阻塞在单测层面已解除；但全部修复均未经浏览器／真机验证，故发布门维持 NO-GO。**
> 历史归档仅可作历史证据，不能替代当前候选签收。
>
> **v0.5 变更摘要**（本轮为 Task #83 独立复验 + 文档增量更新，**未改动 `src/` 或 `tests/` 任何代码**）：
> 1. 自动化基线更新：**20 files / 529 tests → 20 files / 535 tests**（QA 独立连跑 5 轮，exit 0，无 flaky）；
> 2. 新增 §9「修复复验与变异测试记录」：5 项修复逐条验证结论 + **6 组独立变异测试**（还原旧代码验证测试是否真红），全部反证有效；
> 3. §7 缺陷状态更新：B22 / B27 / B28 / B2 / B1 由「待修复」改为「**已修复·待浏览器验证**」，B28-G 关闭；其余 **25 个中/低优先级缺陷维持「待修复」**；
> 4. 新增 §9.4「复验新发现风险」：5 项低优先级风险（N1–N5），均不阻塞；
> 5. §8 发布门结论重写：**单测层面 P0 阻塞可解除；整体发布门维持 NO-GO**，并给出解除 NO-GO 的具体门槛。


---

## 0. 当前候选盘点与证据边界（只读确认，不改动）

| 项 | 当前事实与质量口径 |
|---|---|
| 自动化测试 | **【v0.5 事实更新】** 默认 `npm test` 已由 QA 独立连续跑通 5 轮：每轮均为 **20 files / 535 tests passed**、exit 0（耗时 ≈2.7–3.5s）。基线演进：13 files / 138 tests（历史）→ 20 files / 529 tests（v0.4）→ **20 files / 535 tests（v0.5，净增 6 例）**。此前 9 文件／92 测试、默认 file-parallel 交替 PASS/5 FAIL 的记录均为**历史证据**，已被 superseded。**当前自动化稳定性门为 PASS**；仍不得将自动化 PASS 升格为浏览器、构建、设备或发布 PASS。 |
| **P0/P1 五项缺陷修复（v0.5）** | B22 / B27 / B28 / B2 / B1 **已修复并经 QA 独立复验 PASS**（详见 §9）。复验方式为读源码 + 反例推演 + **6 组变异测试反证**（还原旧代码确认测试真红）。**B27 旧存档迁移路径经重点复核确认可执行**——不会被"旧存档玩家仍看不到 3 条故事线"的情形打脸（见 §9.2）。**全部修复均未经浏览器／真机验证。** |
| **新增系统模块测试（v0.4）** | 17 个系统模块**全部**进入自动化测试覆盖（详见 §6）：此前零覆盖 → 现由 6 个新增测试文件承载 351 例。**测试质量复验结论：ADEQUATE（真测试，非空壳）**——无 `.skip`/`.only`/`.todo`、无占位断言、断言密度 3.3–4.7/例、随机性全部经注入 rng 驱动因而确定性无 flaky。但覆盖仅限**纯逻辑层**：`npc-system`/`storyline-system` 的 UI 编排路径与场景集成（`SectScene`/`CityScene` 调用链）仍为零覆盖。 |
| 配置校验 | `npm run validate:data` 已实际通过，exit 0（`5 职业 / 22 怪物 / 63 装备基座 / 10 词缀 / 67 功法 / 9 天赋节点 / 30 v4Kit`）。`scripts/validate-data.mjs`（`predev`/`prebuild` 自动跑，失败非零退出）仍为当前数据质量门。 |
| 类型检查 | `npm run typecheck`（`tsc --noEmit`）已实际通过，exit 0。 |
| 存档版本 | `src/state.ts` 当前 `SAVE_VERSION = 6`；PRS current-schema 使用版本化记录并须复验 legacy／历史版本隔离、完整往返和重复注册边界。 |
| PRS／Palette V1 源码自动化 | current-schema 严格校验、对抗覆盖与 Palette V1／`sword_proj` 专项自动化已通过；**源码／自动化 P0：PASS，`sword_proj` P0 已关闭**。这不替代浏览器真实播放、Phaser 场景 E2E、实际缺帧降级或手工验收。 |
| 标准构建 | `npm run build` 尚未作为当前候选的标准构建门完成签收；不以任何历史或替代构建证据关闭标准 build 或发布门。 |
| 发布体验缺口 | 浏览器真实播放、Phaser 场景 E2E、实际缺帧降级、核心手动烟雾、低端 Android / 中端 Android / iOS Safari 三档设备（或浏览器）验证、可读性／性能，以及结构化 Playtest 与平衡模拟报告均待签收。 |
| Historical evidence | `release/archives/BASELINE-20260823-RUNBOOK.md` 的 75/78、3 failures、NO-GO，旧测试计数（9 文件/92、**13 files / 138 tests**）与旧 flakiness 记录均为历史归档或历史证据；**不得与当前 20 files / 529 tests 的候选结果混用、覆盖或作为发布依据**。 |

> 旧版“仅 2 个 Vitest / `SAVE_VERSION = 4`”、9 文件／92 测试、默认 file-parallel 交替 PASS/5 FAIL，以及 `SAVE_VERSION = 5` 均为历史盘点，已 superseded，不能作为当前候选或发布证据。

`core.ts` 已解耦（纯函数、不依赖 Phaser），可直接单测：
`makeRng / randInt / pickWeighted / calcDamage / expNeed / enhanceCost / enhMult / normalizeItem / rollEquip / rollSetPiece / rollDrop` + 内部 `rollAffixes / rollLuckyAffixes / buildItem / makeNamed`。

---

## 1. 每冲刺质量门清单（lean）

三道子门：**设计评审 / 架构评审 / 烟雾测试**。每冲刺结束前逐行勾选；任一 P0 未过 = 质量门 **FAIL**（建议不进下一冲刺）。

### 1.1 设计评审门（机制线 / 美术线）

- [ ] Story 有可勾选验收标准（AC），且每条 AC 可转测试或人工核验
- [ ] 新机制（丹方 / 阵眼 / 魔煞）有明确数值定义与边界（触发条件 / 上限 / 持续时间），非「感觉」
- [ ] 配置表 schema 变更已登记（新增字段 / 枚举 / 攻击模式 / 职业 id）
- [ ] 存档破坏性变更已规划：`SAVE_VERSION` 升级 + 迁移用例（见 §2.5、§3.3）
- [ ] 美术圣经（本轮新立）已覆盖新职业 / 新套装 / 新特效的像素规范与命名

### 1.2 架构评审门（技术线）

- [ ] 新增纯逻辑**不依赖 Phaser**（可单测，保持 `core.ts` / `effects.ts` 解耦）
- [ ] 新增配置表字段已在 `validate-data.mjs` 加约束，或写明豁免
- [ ] `validate-data.mjs` 常量（`MOD_KEYS` / `ATTACK_MODES` / `SKILL_CLASSES`）已同步
- [ ] 无回归：既有 Story 测试仍 PASS
- [ ] 随机可复现契约未破坏（`calcDamage` / `rollDrop` / `rollEquip` 的 rng 消费次数未改）

### 1.3 烟雾测试与发布前硬门（每冲刺必跑）

**PASS 判定：以下全绿；任一红 = FAIL（未达 QA）。** 当前自动化／源码 P0 子门已 PASS；标准构建、浏览器／Phaser E2E、实际缺帧降级、核心手动烟雾、三档设备、可读性／性能与 Playtest 仍是发布前硬门。不得用历史记录、选择性 suite、替代构建或自动化 PASS 降低发布门槛。

- [x] `npm run validate:data` → exit 0（当前候选已实际通过）
- [x] `npm run typecheck`（`tsc --noEmit`）→ exit 0（当前候选已实际通过）
- [x] **默认 `npm test` 连续运行两次** → **【v0.5 更新】** 两次均为 **20 files / 535 tests passed**、exit 0；当前自动化稳定性／源码门 PASS。（历史：v0.4 = 20/529，v0.3 = 13/138，均 superseded）
- [x] **【v0.4 新增】** 新增 17 个系统模块测试质量复验 → **ADEQUATE**（无跳过、无占位断言、无 flaky、边界覆盖到位）；28/30 缺陷有特征化用例如实锁定（详见 §6）
- [x] **【v0.4 新增】** 5 个 P0/P1 严重缺陷已由 QA 读源码独立核验 → **5/5 确认真实**（B22 / B27 / B28 / B2 / B1，详见 §7）
- [x] **【v0.5 新增】** 五项缺陷修复的独立复验 → **5/5 PASS**（B22 / B27 / B28 / B2 / B1，含反例推演与端到端证据，详见 §9.1）
- [x] **【v0.5 新增】** 变异测试反证（还原旧代码验证测试是否真红）→ **6/6 有效**：M1–M4 与 M6 产生具名失败，M5 复现挂死；每次变异后均已逐字节还原（详见 §9.3）
- [x] **【v0.5 新增】** 回归风险扫描：`npm run typecheck` PASS / `npm run validate:data` PASS / 无循环依赖 / 无新增 flaky / 无 `.skip`/`.only` / 无降级回退（详见 §9.4）
- [ ] `npm run build` → 当前候选尚未完成标准命令构建签收；未签收前不得记 PASS 或关闭发布门
- [x] PRS current-schema 对抗测试、存档／注册／旧静态套语义的源码自动化覆盖，以及 Palette V1／`sword_proj` P0 自动化复验 → **PASS**；`sword_proj` P0 已关闭
- [ ] 浏览器真实播放与 Phaser 场景 E2E：PRS 生成 → 阈值前/后 → 攻击／神通／VFX → 卸装 → 重载 → 旧静态套；留存实例证据，且不得把源码／磁盘／预加载／注册写成已播放
- [ ] 实际缺失任一必需帧、动画键或实例时的降级：确认无报错、无伪造路径、无战斗逻辑变化
- [ ] 核心手动烟雾（建角色 → 下本 → 击杀 → 掉落 → 回城 → 存档 → 重载）通过并留证
- [ ] 三档设备/浏览器：低端 Android、中端 Android、iOS Safari 的触控、战斗/VFX、异常横幅与适配验证通过并留证
- [ ] 可读性／无障碍与性能：灰度／减闪／减动／高对比、P95 帧时间、对象峰值、回收稳定性和实际掉帧降级均已实测签收
- [ ] 结构化 Playtest 已归档：新玩家 3 人、中盘玩家 3 人、高层玩家 3 人；无证据不得以“手感不错”替代
- [ ] 本次改动有对应回归用例；任何豁免均书面登记审批范围，且不得豁免未签收的标准构建、浏览器／Phaser E2E、实际缺帧降级、核心烟雾、真机或 Playtest

> 当前自动化子门顺序及事实：`npm run validate:data && npm run typecheck && npm test（默认，连续两次）` 已通过。完整发布门仍须追加标准 `npm run build`、浏览器／Phaser E2E、实际缺帧降级、手动烟雾、设备、可读性／性能与 Playtest；历史归档、单文件、重试或替代构建不得作为发布 PASS 证据。

---

## 2. 核心回归用例扩充计划（基于 `core.ts`，Vitest）

优先级：**P0 = 必过（本轮回填）｜ P1 = 重要 ｜ P2 = 增强**。

### 2.1 伤害 / 随机（P0）

**calcDamage**
- [P0] rng 消费契约：每次调用**恰好消费 2 个 rng**（①判会心 ②算浮动），用计数 spy 断言
- [P0] `critRate=0` 永不暴击；`critRate=1` 必暴击（边界）
- [P0] 防御 ≥ 攻击×倍率 → 保底 1，且不为负 / NaN
- [P0] fuzz 1e4 次：`dmg` 恒为 ≥1 整数、有限数、无 NaN/Infinity
- [P1] `atk≤0` / `mult≤0` 健壮性（不崩、不 NaN）

**pickWeighted**
- [P0] 权重 = 0 的条目永不被选
- [P0] 大样本（1e5）分布 ≈ 权重占比（chi-square 宽松阈值）——「掉落权重分布」核心
- [P1] 全 0 权重行为定义（抛错或安全返回末项）

**randInt**
- [P0] `min==max` 恒等；500 次不越界（已有，保留）
- [P1] 负数区间处理（如不需，断言拒绝负数）

### 2.2 经验 / 强化（P0 / P1）

**expNeed**
- [P0] 单调递增（1..50）且与 `40·level^1.45` 一致（已有，保留）
- [P1] `level≤0` 健壮性

**enhanceCost / enhMult / ENH_MAX**
- [P0] `enhMult` 在 0..5 线性 1.0~1.5；`ENH_MAX=5` 边界（再强化应无效 / 拒付）
- [P0] `enhanceCost` 随 enh 与 quality 单调上升（已有，保留）

**normalizeItem**
- [P1] 缺省字段补全且不改已存在字段

### 2.3 装备 roll（P0 / P1）

**rollEquip**
- [P0] 大批量（1000）结构完整、`quality∈[0,3]`、`slot` 合法、`affixes≥保底`、`price>0`（已有，扩样本）
- [P0] 名器（`named`）：`quality≥1` 且触发时 `boost∈[1.15,1.30]`、`named=true`
- [P0] 机缘词缀：`lucky` 最多 1~2 条、`lucky=true`、`id` 不与基础词缀重复
- [P0] 池截断：高 floor 仅取前 `6+floor*2` 个 base，且不越界
- [P0] 词缀数值缩放随 floor / quality 单调（验证 `scale` 公式）
- [P1] 品质权重随 `luckBonus` 偏移（灵 / 玄品概率上升，统计）
- [P2] uid 唯一性 ⚠️ 提示：`uid = Date.now()+seq`，极端 1ms 内并发可能碰撞——建议加随机后缀

**makeItem**
- [P0] 已知基座造指定品质（已有）
- [P1] `quality` 边界（0 / 3）

**rollSetPiece**
- [P0] 未知 `setId` → null；部件来自 `set.pieces`；`quality∈[1,3]`
- [P1] `luck` 提高高品质权重（统计）

### 2.4 掉落（P0）

**rollDrop**
- [P0] 药水概率：普通 0.14 / Boss 0.9（边界值）
- [P0] `goldMult` 与 boss 翻倍叠加正确：`gold = randInt·(boss?2:1)·goldMult`
- [P0] 装备掉率随 `luck` 上升（已有，扩展统计）
- [P0] rng 消费次数契约（影响可复现性与 sim 基线）
- [P1] 大批量（1e4）无 NaN / 负数 gold

### 2.5 存档迁移链（P0，最高优先）

> 当前 `SAVE_VERSION = 6`。三职业或未来 PRS schema/生成器演进若引入新存档字段（丹方 / 阵眼 / 魔煞状态、新套装 / 功法、`classId∈5类` 等），必须明确版本策略、迁移路径和回归夹具。

- [P0] `SAVE_VERSION` 当前 = 6；任何破坏性结构变更须 **bump** 并断言，不可重写已落盘 PRS 结果
- [P0] 逐步迁移链需覆盖已有历史版本至 v6；至少验证 legacy 动态记录、历史版本（含 v5）与 v6 current-schema、未知高版本和损坏记录的隔离/回退边界
- [P0] 新增字段写入 → 读取往返一致（`dynamicSets` / `dynamicSkills` / `codex` 模式复用）；PRS 须同时断言已装备状态、路由、图鉴和注册内容不丢失
- [P0] `registerDynamicContent()` 重复调用不得污染 `SETS` / `ITEM_BASE_MAP` / `SKILLS`，不得覆盖官方/测试内容
- [P0] 未知高版本号仍安全回退新游戏；非法 PRS current-schema 必须隔离且不损坏有效同伴记录
- [P1] 损坏 JSON / 缺字段的静默补全路径仍安全，并有可诊断记录

---

## 3. 三职业新增测试策略（丹方 / 阵眼 / 魔煞）

新增三职业属机制线主交付。下列为**正确性校验点** + `validate-data` 需新增约束。

### 3.1 丹修 · 丹方

- [ ] 丹方配方数据合法（材料 id 存在、效果 `mods` ∈ 合法集、触发条件枚举合法）
- [ ] 战前配药：配方组合有效、材料消耗正确扣除
- [ ] 投丹触发：效果（buff / 毒伤 / 召唤药灵）施加到正确目标，持续时间 / 回合正确
- [ ] 毒伤 tick 计算正确、可叠加 / 不可叠加按定义；非 NaN
- [ ] 召唤药灵：实体生成 / 攻击 / 消失生命周期正确，不参与存档溢出
- [ ] 丹药数量 / 冷却限制生效
- 🔧 若丹方数据驱动，新增 `danfang.json` 校验（材料引用、mods、触发枚举）—— 见 §3.4

### 3.2 阵法师 · 阵眼

- [ ] 阵法布设：场上阵法数 ≤ 上限 N（阵眼上限），超出拒布或按策略替换
- [ ] 联动触发：条件满足连锁触发，且**不无限递归**（防爆栈 / 死循环——必须有跳数 / 帧上限）
- [ ] 范围 / 陷阱判定：命中目标与伤害计算正确
- [ ] 阵法状态持久化（存档需存阵法）→ 迁移链覆盖（§2.5）
- [ ] 新增攻击模式：`ATTACK_MODES` + `DungeonScene` 分支 + `resolveAttackMode` 求值（套装4件改写 > 招式 > 默认）正确
- 🔧 若阵法数据驱动，新增 `formations.json` 校验（范围 / 联动条件枚举）

### 3.3 魔修 · 魔煞

- [ ] 魔煞：伤害随血量下降而升（线性或分段）；满血 = 基础倍率、1 血 = 最大倍率（边界）
- [ ] 自残换伤：消耗血量触发爆发，数值不越界（不会主动技能致死，按定义）
- [ ] 斩杀回复：目标血量低于阈值击杀后正确回血结算
- [ ] 吸血：伤害百分比回血，有上限、不超当前缺失血量
- [ ] 魔修默认招式 / 攻击模式正确（`classes.json` + `skills.json` 一致）
- 🔧 `validate-data` 新增魔煞倍率 / 吸血上限等数值上限约束

### 3.4 `validate-data.mjs` 需新增 / 同步的约束（汇总）

- [ ] `SKILL_CLASSES` 增加新职业 id（dan / array / demon 或实际 id），否则新功法 `class` 校验直接失败
- [ ] `ATTACK_MODES` 常量同步新增职业攻击模式（如 poison / summon / formation 等），否则 sets / skills 引用报「未知攻击模式」
- [ ] `classes.json` 新增三职业条目校验：`base` / `growth` / `defaultStyle` 存在且合法、`dirRemap` 合法
- [ ] `MOD_KEYS` 若引入新修饰（`poisonDmg` / `summonCount` / `formationBuff` 等）须**同时**同步 `validate-data.mjs` 与 `core.ts` 的 `pctStats` / 聚合（两份独立常量易失同步——⚠️ 高风险点）
- [ ] 跨表引用一致性：新套装 `setId` ↔ `items.set` ↔ `sets.pieces`；新功法 `skillSlots` 引用合法
- [ ] 数值上限约束：丹方毒伤、魔煞倍率、阵眼数量等设上下限，防配置溢出
- [ ] 职业↔功法↔套装绑定：每职业 ≥1 默认招式（已有），新增职业专属套装 / 功法 `class` 标记正确
- [ ] ⚠️ **AI 队友「相反职业」假设**：现有「道友职业永远与你相反（剑修↔仙子）」是 1:1 映射，新增 3 职业后失效 → 设计评审必须重定义映射并补测试

---

## 4. 真机验证流程（lean）

目标：移动端**触控 / 帧率 / 包体首屏**轻量验证。发布前必过（见 §4.2）。

### 4.1 轻量验证步骤

**设备（最低）**：① 低端安卓（骁龙 4 系 / 4GB）② iOS Safari ③ 中端安卓。可用 TapTap 真机或浏览器远程调试。

**触控**
- [ ] 虚拟摇杆：死区 / 灵敏度合理，松手回中
- [ ] 攻击大键：连点 10 次不丢输入、不误触
- [ ] 神通 / 丹药 / 背包快捷键在 `safe-area` 内，不被刘海 / 小白条遮挡（`viewport-fit=cover` + `env()`）
- [ ] 竖屏锁定；`touch-action:none` 生效、不误滚动页面

**帧率**（dev tools 帧率面板 / stats.js 记录 60s）
- [ ] 洞府场景 ≥ 目标
- [ ] 战斗（多怪）≥ 目标
- [ ] Boss 层 ≥ 目标
- [ ] 无尽深层（怪多 / 特效多）≥ 目标；低端若掉帧应已开动态降档（30fps）

**包体 / 首屏**
- [ ] 首屏可交互时间 **TTI < 3s**（4G）
- [ ] 首屏资源体积 ≤ 目标（当前单包 6.8MB，目标 <5MB——若不达标须记录并审批，评估分包 / lazy load）
- [ ] `title_bg` 缺失时程序化兜底正常（无白屏）
- [ ] iOS Safari 音频可播放（仅 mp3，无 webm / ogg 兼容）；缺失静音兜底

**错误捕获**
- [ ] 真机未捕获异常显示红色横幅（`main.ts` 全局捕获），便于反馈；无横幅或已记录可接受

### 4.2 发布前必过清单（Release Gate）

以下为最终发布硬门，必须与 §1.3 的当前候选证据链一并签收；当前自动化／源码 P0 已 PASS，但任何历史归档记录、选择性 suite、替代构建或自动化 PASS 都不能代替以下未完成项：

- [x] `npm run validate:data` exit 0、`npm run typecheck` exit 0，且默认 `npm test` 连续两次均为 **20 files / 535 tests passed**（**自动化／源码门 PASS，不等同发布 PASS**）
- [~] **【v0.4 新增 · v0.5 更新】** 三个 P0 严重缺陷（B22 / B27 / B28）+ 两个 P1 缺陷（B2 / B1）：**单测层面已修复并经 QA 独立复验 PASS，P0 内容阻塞在自动化层面可视为解除**；但 **5 项修复全部未经浏览器／真机验证**，故此发布清单项记为 **部分通过（[~]）**，须在浏览器烟雾中逐条目视确认后方可勾为 [x]（见 §8.4）
- [ ] 标准 `npm run build` 成功并作为当前候选签收；未完成前一律 NO-GO
- [ ] 浏览器真实播放与 Phaser 场景 E2E：PRS／Palette V1 生成、4 件阈值、攻击／神通／VFX、卸装、存档／重载、旧静态套均留截图／录屏
- [ ] 实际缺帧、动画键缺失或实例不可用时的降级：在浏览器／Phaser 场景中确认安全回退且不改变战斗逻辑
- [ ] 三档设备触控全通过（摇杆 / 大键 / 快捷键 / 安全区）
- [ ] 可读性与帧率达标（灰度／减闪／减动／高对比；中端 ≥50fps / 低端 ≥30fps 或已验证实际降档）
- [ ] 首屏 TTI < 3s，首屏资源 ≤ 目标包体（否则记录 + 审批）
- [ ] iOS Safari 音频可播放 + 静音兜底
- [ ] 无未捕获异常横幅（或已记录可接受项）
- [ ] 刘海 / 安全区适配无遮挡
- [ ] 核心手动烟雾完成：建角色 → 下本 → 击杀 → 掉落 → 回城 → 存档 → 重载；PRS／Palette V1 关键路径均留证
- [ ] 结构化 Playtest（新玩家/中盘/高层各 3 人）和候选平衡结论归档；无 Playtest／模拟报告不得宣称全量数值平衡 PASS
- [ ] 包体体积确认（TapTap 上传通过）

---

## 5. 质量风险登记（Top Risks）

| # | 风险 | 影响 | 缓解（本规划对应项） |
|---|---|---|---|
| **R1** | **存档迁移链**：当前 `SAVE_VERSION=6`；未来字段或 PRS schema 演进可能破坏 legacy／历史版本/current-schema、重复注册或完整往返 | Block（玩家存档损坏 / 官方内容被污染） | §2.5 版本化迁移、隔离夹具、往返/幂等回归 + §1.1 设计门「迁移规划」 |
| **R2** | **浏览器／Phaser 运行时证据缺失**：自动化 P0 已 PASS，但尚未验证真实播放、场景 E2E 与实际缺帧降级 | Block（route、回退或实例生命周期在运行时失效而未被发现） | §1.3、§4.2 留存浏览器实例、Phaser 场景 E2E 与主动缺帧降级证据；未完成前 NO-GO |
| **R3** | **标准构建未签收** | Block（无当前候选的标准构建产物与可复验发布门） | 运行标准 `npm run build` 并留存当前候选证据；历史或替代构建不得关闭发布门 |
| **R4** | **PRS／Palette V1 手工运行时边界未签收** | Block（视觉、路由／降级、静态套回归、可读性与生命周期未最终签收） | §1.3、§2.5、浏览器／Phaser E2E、实际缺帧降级与手动烟雾范围 |
| **R5** | **配置表校验静默缺口**：`MOD_KEYS` 双份常量易失同步；丹方 / 阵眼数据驱动时缺表校验；无数值上限 | Major（引用悬空 / 数值溢出未拦） | §3.4 `validate-data` 约束扩展 + 数值上限 |
| **R6** | **AI 队友「相反职业」1:1 假设破裂**（新增 3 职业） | Major（组队逻辑 / 存档 `normalize` 错误） | §3.4 设计评审重定义映射 + 补测试 |
| **R7** | **手动、三档设备、Playtest 与平衡证据缺失** | Block（真实设备体验与玩家理解未经签收） | §1.3、§4.2 完整留证；无证据保持 NO-GO |
| **R8（v0.5 更新）** | **主线断裂（B22）** | **已修复·待浏览器验证**（原 Block） | 已新增 `sect_level` 判定 + `mq_4_1→mq_4_7` 端到端回归；变异测试 M1 反证有效。**残留风险：未经浏览器实跑。** |
| **R9（v0.5 更新）** | **NPC 故事线死内容（B27）** | **已修复·待浏览器验证**（原 Block） | 已按 `STORIES` 表解锁 + 新增 `syncNpcStoryAvailability()` 迁移；**旧存档迁移路径经重点复核确认可执行**；5 条故事线端到端 `available → completed` 已覆盖。**残留风险：未经浏览器实跑。** |
| **R10（v0.5 更新）** | **同步死循环（B28）** | **已修复·待浏览器验证**（原 Block） | 已删除无上限 `while`，改为 `pickIndex` + 偏移落位；400 组退化 rng 穷举零撞号零越界。**残留风险：未经浏览器实跑。** |
| **R11（v0.5 关闭）** | ~~P0 缺陷无回归保护（B28-G）~~ | **已关闭** | 新增 2 条直接调用 `generateTradeOffer` 的可执行用例；变异测试 M6 证明 **6ms 内产生具名失败**（非仅挂死），M5 复现挂死。**回归保护 ADEQUATE。** |
| **R12（v0.4）** | **17 个模块覆盖仅限纯逻辑层，场景集成与 UI 编排路径零覆盖（Q2）** | Major（B22 类缺陷无法在集成层被提前拦截） | §7.4 Q2、§8.3 P1-3：补 `showDialog` 多分支与 `SectScene`/`CityScene` 调用链测试 |
| **R13（v0.5 新增）** | **旧存档成就污染（N1）**：修复前 `pvp_1` target=1，凡 `arenaRank ≥ 1` 的旧存档已误获「天下第一」，门槛提到 4 后无回收逻辑 | 低（数据一致性，不影响可玩性） | §9.4 N1：如需运营口径一致，在下个 `SAVE_VERSION` 迁移中做一次性回收；否则书面接受 |
| **R14（v0.5 新增）** | **B27 迁移未即时落盘（N2）**：`CityScene.ts:129` 的 `saveGame` 在 `initNpcStates`（:136）之前 | 低（每个会话自愈，无用户可见影响） | §9.4 N2：把 `saveGame` 挪到 `initNpcStates` 之后，一次固化迁移结果 |

---

## 6. 新增系统模块测试覆盖（v0.4 新增）

### 6.1 覆盖总览

17 个新增系统模块此前**零测试覆盖**；Task #80 补齐后由 6 个新增测试文件 + 1 个公共夹具承载，QA 独立复验结果如下。

| 测试文件 | 用例数 | 断言数 | 密度 |
|---|---:|---:|---:|
| `tests/quest-system.test.ts` | 89 → **92**（+3） | 235 → **263** | 2.9 |
| `tests/npc-diplomacy.test.ts` | 80 → **83**（+3） | 287 → **298** | 3.6 |
| `tests/disciple-beast-formation.test.ts` | 61 | 247 | 4.0 |
| `tests/sect-system.test.ts` | 53 | 176 | 3.3 |
| `tests/world-system.test.ts` | 46 | 159 | 3.5 |
| `tests/merchant-system.test.ts` | 22 | 73 → **79** | 3.6 |
| **合计（6 文件 / v0.5 = 357 例）** | **357**（v0.4 为 351，净增 6） | **1222** | **3.4** |

| `tests/system-test-helpers.ts` | — | — | 公共夹具（非用例） |

### 6.2 17 个模块 ↔ 测试文件映射

| # | 模块（源文件） | 覆盖测试文件 | 状态 |
|---|---|---|---|
| 1 | 宗门数据 `src/sect-data.ts` | `sect-system.test.ts` | ✅ 已覆盖 |
| 2 | 宗门生产 `src/sect-production.ts` | `sect-system.test.ts` | ✅ 已覆盖 |
| 3 | 弟子 `src/disciple-data.ts` | `disciple-beast-formation.test.ts` | ✅ 已覆盖 |
| 4 | 灵兽 `src/beast-data.ts` | `disciple-beast-formation.test.ts` | ✅ 已覆盖 |
| 5 | 阵法 `src/formation-data.ts` | `disciple-beast-formation.test.ts` | ✅ 已覆盖 |
| 6 | 商会 `src/merchant-system.ts` | `merchant-system.test.ts` | ✅ 已覆盖 |
| 7 | 世界地图 `src/world-map.ts` | `world-system.test.ts` | ✅ 已覆盖 |
| 8 | 世界时间 `src/world-time.ts` | `world-system.test.ts`、`sect-system.test.ts` | ✅ 已覆盖 |
| 9 | 世界事件 `src/world-events.ts` | `world-system.test.ts` | ✅ 已覆盖 |
| 10 | 剧情数据 `src/storyline-data.ts` | `quest-system.test.ts`、`world-system.test.ts` | ✅ 已覆盖 |
| 11 | 剧情系统 `src/storyline-system.ts` | `quest-system.test.ts` | ✅ 已覆盖 |
| 12 | 成就 `src/achievement-system.ts` | `quest-system.test.ts` | ✅ 已覆盖 |
| 13 | 日常任务 `src/daily-quest.ts` | `quest-system.test.ts` | ✅ 已覆盖 |
| 14 | NPC 数据 `src/npc-data.ts` | `npc-diplomacy.test.ts` | ✅ 已覆盖 |
| 15 | NPC 系统 `src/npc-system.ts` | `npc-diplomacy.test.ts` | ✅ 已覆盖 |
| 16 | 外交 `src/diplomacy.ts` | `npc-diplomacy.test.ts` | ✅ 已覆盖 |
| 17 | AI 宗门 `src/ai-sect-data.ts` | `npc-diplomacy.test.ts` | ✅ 已覆盖 |

> **17/17 模块已覆盖，无遗漏。**

### 6.3 测试质量复验结论：**ADEQUATE（真测试，非空壳）**

| 复验维度 | 结论 | 证据 |
|---|---|---|
| 真实断言 | ✅ PASS | 6 文件共 1177 条断言；全仓扫描 `expect(true).toBe(true)` 类占位断言 **0 处**；空体用例 **0 处** |
| 边界与异常 | ✅ PASS | 覆盖 rng 退化（恒定 0 / 1.0）、索引越界、负数入参、NaN 传播、空集合、等于边界（如 `refreshTime === now` 视为到期）、非法 id、uid 唯一性 |
| 被排除的用例 | ✅ PASS | `.skip` / `.only` / `.todo` / `xit` / `xdescribe` 扫描结果 **0 处**，无静默排除 |
| 确定性 / flaky | ✅ PASS | 断言路径**无** `Math.random`（全仓仅 1 处命中，且位于 `world-system.test.ts:466` 的缺陷说明**注释**内，非可执行代码）；随机性一律由 `constRng` / `seqRng` 注入；v0.5 连跑 5 轮结果一致（20/535） |
| 环境隔离 | ✅ PASS | Node 环境可用，不触碰 Phaser；`localStorage` 经 `installLocalStorageStub()` 隔离；夹具返回全新实例，无并行 worker 串扰 |
| 特征化用例诚实性 | ✅ PASS | 28/30 缺陷的用例**如实锁定当前错误行为**，均附「复现 / 后果 / 建议」三段注释，且断言指向错误结果（如 B22 断言 `level:999` 时 `isQuestCompleted === false`），**未把 bug 伪装成正确** |

> **【v0.5 更新 · B28-G 保护缺口已关闭】** v0.4 记录的唯一可执行保护缺口（B28 为「代理断言」）**已由 Task #82 补齐**：新增 2 条直接调用 `generateTradeOffer` 的可执行用例（`merchant-system.test.ts:241` / `:254`）。QA 本轮以变异测试独立反证（§9.3 的 M5 / M6）：
> - **M6（仅跑 `:241` 的 rng 预算用例）**：换回旧代码 → **6ms 内产生具名失败** `AssertionError: expected 77 to be 63`，exit 1。**说明 B28 复发会在毫秒级被一条具名断言拦下，并非只能靠超时发现。**
> - **M5（跑整个 merchant 文件）**：换回旧代码 → **EXIT=124 挂死**（90s timeout 强杀），复现死循环。该用例（`:254`）是第二道哨兵，代价是复发时会同步挂死 worker，测试内已注释说明。
>
> **结论：B28 回归保护等级由「缺口」升为 ADEQUATE。** 遗留改进项见 §9.4 N4（建议把 `:254` 的 `constRng` 换成有调用预算的 rng，把「挂死」转化为「具名失败」）。

### 6.4 `vi.mock` 影响评估（结论：未削弱验证价值）

主理人关注的 5 个模块（`storyline-system` / `achievement-system` / `daily-quest` / `npc-system` / `diplomacy`）实际集中在 **2 个测试文件**中使用 mock：

- `tests/quest-system.test.ts` → 覆盖 `storyline-system`、`achievement-system`、`daily-quest`
- `tests/npc-diplomacy.test.ts` → 覆盖 `npc-system`、`diplomacy`

被 mock 的对象**仅为 I/O 边界**——`ui`（`toast` / `showDialog` / `dialogOpen`）、`audio`（`sfx`）、`input`（`input.clearQueues`），用于让模块在 Node 环境下可加载；**被测的业务逻辑本身未被替换**。

**假通过风险评估：低。** 判定依据——两个文件**均未对 mock 自身做断言**（`toHaveBeenCalled` 扫描为 0），不存在「断言 mock 被调用」式的自证通过；断言全部指向真实状态变更与返回值。

**已知削弱点（登记为覆盖缺口，非假通过）：** `showDialog` 被固定为 `async () => 'ok'`，因此**对话的多分支选择路径（用户选不同选项的走向）未被覆盖**；`npc-system` / `storyline-system` 中依赖对话返回值的编排逻辑未被真实验证。

---

## 7. 缺陷登记（v0.4 新增 · QA 独立核验）

> 工程（Task #80）报告 30 个缺陷。QA **只读 `src/` 源码独立核验**，本节登记核验结论。核验方式：逐条定位源码行、追踪调用链、确认触发条件与影响面，**不采信报告结论**。
> 状态图例：**已确认** = QA 读源码确认真实 ｜ **待修复** = 尚未修复 ｜ **已修复·待浏览器验证** = 已修复并经 QA 独立复验 PASS，但**未经浏览器／真机验证**
>
> **【v0.5 状态总览】** 30 个工程中，已修复 **5** 个（B22 / B27 / B28 / B2 / B1）+ QA 补充项 B28-G 关闭 → **其余 25 个中／低优先级缺陷维持「待修复」，本轮未处理，状态不变**。

### 7.1 P0 严重缺陷（3 项 · 全部经源码确认真实 · **全部已修复并复验 PASS**）

| ID | 缺陷 | QA 核验 | 源码证据 | 影响范围 | 状态 |
|---|---|---|---|---|---|
| **B22** | 主线在第四卷第三章断裂，游戏无结局 | **确认真实**<br>严重度：严重（P0） | `storyline-data.ts:641-642`：`objectiveType='reach_level'`，`objectiveTarget='sect_5'`。`storyline-system.ts:34-35` 走 `state.level >= parseInt('sect_5')` → **NaN** → 恒 `false`。全仓无 `sect_` 分支兜底。 | **玩家永远无法通关。** `mq_4_3` 不可完成 → 前置链阻断 `mq_4_4`/`4_5`/`4_6`/`4_7`；31 条主线中 5 条（16%）不可达，终章「第四卷·终章·飞升」无法触发。UI 侧 `getQuestProgressInfo` 显示 `Lv.X / NaN`。 | **✅ 已修复·待浏览器验证**<br>（复验见 §9.1-B22） |
| **B27** | NPC 故事线 3/5 为死内容 | **确认真实**<br>严重度：严重（P0） | `npc-data.ts:321`：`storyStage: def.id === 'npc_elder' \|\| def.id === 'npc_sister' ? 'available' : 'locked'`。`npc-system.ts:70` 仅在 `'available'`/`'active'` 时才给出「故事」选项。全仓 grep **无任何 `locked → available` 迁移**。 | 20 个 NPC 中 **18 个**恒为 `locked`；5 条故事线（`story_elder`/`sister`/`city_lord`/`rival`/`hermit`）中「城主的考验」「宿敌的觉悟」「隐士的传承」**永远无法开启**。已实测：即使 `favor=999`、`level=99` 并调用 `updateNpcGrowth`，状态仍为 `locked`。 | **✅ 已修复·待浏览器验证**<br>含旧存档迁移，见 §9.2 |
| **B28** | 商会交易生成存在无上限重试循环，可冻结主线程 | **确认真实**<br>严重度：严重（P0） | `merchant-system.ts:105`：`while (recvIdx === giveIdx) recvIdx = Math.floor(rng() * resourceTypes.length)` —— **无迭代上限、无回退分支**。 | 同步死循环 → **直接冻结游戏主线程**（非抛错，无恢复路径）。生产用 `Math.random` 时概率性终止故暂未触发；但任何退化／常量／种子化 rng 必中。工程已在套件外用 `rng=()=>0` 实测 100 万次迭代未退出。 | **✅ 已修复·待浏览器验证**<br>（复验见 §9.1-B28） |

### 7.2 P1 中等缺陷（经源码确认真实 · **B2 / B1 已修复** · B28-G 已关闭）

| ID | 缺陷 | QA 核验 | 源码证据 | 影响范围 | 状态 |
|---|---|---|---|---|---|
| **B2** | 成就「擂台新秀 · 排名达到 5」为死成就 | **确认真实**<br>严重度：中（P1） | `achievement-system.ts:64-65`：`pvp_5` 的 `condition.target = 5`。`achievement-system.ts:142`：`case 'pvp_rank': return state.arenaRank`。而 `RANK_NAMES`（`CityScene.ts:105`）仅 5 项 → `arenaRank ∈ [0,4]`，**最大 4，target 5 不可达**。 | 该成就及其奖励（3000 金）**永久不可获得**。 | **✅ 已修复·待浏览器验证**<br>target 5 → **1**（铜牌斗士）<br>（§9.1-B2/B3） |
| **B1** | 成就「仙途圆满 · 完成全部主线」提前一章解锁 | **确认真实**<br>严重度：中（P1） | `achievement-system.ts:113`：`quest_all` 的 `condition.target = 30`。实测 `MAIN_QUESTS` 共 **31** 条（4 卷）。 | 完成第 30 章即解锁「完成全部主线任务」成就，此时终章「飞升」尚未完成，成就文案与实际不符；数据表增删时会再次失同步。 | **✅ 已修复·待浏览器验证**<br>target 30 → **`MAIN_QUESTS.length`**<br>（§9.1-B1） |
| **B28-G** | **（QA 补充·报告外）** B28 无可执行回归测试 | **确认真实**<br>严重度：中（P1） | `merchant-system.test.ts:250-267` 采用代理断言，未直接调用 `generateTradeOffer`。 | P0 缺陷 B28 **无回归保护**：复发不会被拦截，修复后也无法自动验证。 | **✅ 已关闭**<br>新增 2 条可执行用例；<br>变异测试 M5/M6 反证有效<br>（§6.3、§9.3） |

### 7.3 严重度复核与差异说明

| 项 | 工程报告 | QA 复核 | 差异说明 |
|---|---|---|---|
| B22 | 严重 | **严重（P0）** | 一致。补充量化：31 条主线中 5 条不可达，含终章——**游戏不存在可完成的结局**。 |
| B27 | 严重 | **严重（P0）** | 一致，但影响面**大于报告口径**：报告为「3/5 故事线」，实测底层是 **20 个 NPC 中 18 个恒 locked**（仅 5 个有故事线，故表现为 3/5 死内容）。 |
| B28 | 严重 | **严重（P0）** | 一致。补充性质判定：同步死循环冻结主线程，**无抛错、无恢复路径**，比普通异常更危险。 |
| B2 | 严重 | **中（P1）** ⬇ | **QA 下调**。原因为死成就仅损失 3000 金与一项成就，不影响主线与存档，不阻塞发布；且与之配对的 B3 同在，应并案处理。 |
| B1 | 中 | **中（P1）** | 一致。 |

### 7.4 QA 独立发现的补充问题（报告外）

| # | 问题 | 严重度 | 说明 |
|---|---|---|---|
| **Q1** | `pvp_rank` 成就语义整体错乱（B2 与 B3 成对反向出错） | 中（P1） | B2「擂台新秀」target=5 **不可达**；同时 B3「天下第一」target=1 在 **arenaRank=1（铜牌斗士，第 2 低段位）即解锁**。两个成就朝相反方向同时出错，说明 `pvp_rank` 条件是「按 index 直接比较」而段位是「index 越大越高」的语义未对齐。**应并案重设计，而非分别改数值。** |
| **Q2** | 17 个模块的测试仅限纯逻辑层，场景集成零覆盖 | 中（P1） | `npc-system` / `storyline-system` 的 UI 编排路径（依赖 `showDialog` 返回值的多分支）未被覆盖；`SectScene` / `CityScene` 调用这些系统的集成路径零覆盖。**B22 主线断裂这类缺陷本可在场景集成测试中被更早发现。** |
| **Q3** | 30 个缺陷中 **B17、B26 无特征化用例** | 低（P2） | 28/30 已锁定，缺 B17、B26。未锁定的缺陷在修复时无回归依据。 |

### 7.5 未逐条核验项说明

工程报告的 30 个缺陷中，QA 本轮**逐条读源码深度核验了 5 个严重/中等项（B22 / B27 / B28 / B2 / B1）**，均判定为**确认真实**。其余 25 项（B3–B21、B23–B26、B29、B30）本次仅做**存在性验证**——确认其在测试套件中有对应特征化用例且用例如实锁定错误行为（见 §6.3），**未逐条回读源码，故对其严重度不作背书**，状态一律记为「**待复核**」，需下一轮补齐。

---

## 8. v0.5 发布门结论

### 8.1 判定

> ## **单测层面质量门：PASS —— P0 内容阻塞可解除**
> ## **整体发布门：FAIL —— 维持 NO-GO**

> **【v0.5 变更】** v0.4 的三项 P0 阻塞（B22 主线断裂 / B27 故事线死内容 / B28 商会死循环）已全部修复，并经 QA **独立复验 + 变异测试反证**确认生效。因此**「游戏无法通关」这一内容级阻塞在源码／单测层面已不复存在**。
> **但发布门不因此翻案**：所有修复均只在 Node 单测层验证过，**没有一条经过浏览器或真机实跑**；且 §4.2 中标准构建、浏览器/Phaser E2E、缺帧降级、手动烟雾、三档设备、可读性/性能、Playtest 等硬门仍**全部未签收**。

### 8.2 判定依据

**自动化门 PASS，且 P0 内容阻塞已解除。** 三道自动化子门全绿：`validate:data` ✅ / `typecheck` ✅ / `npm test` **20 files / 535 tests** ✅（连续 5 轮，exit 0，无 flaky）。五项修复（B22 / B27 / B28 / B2 / B1）逐条复验 **5/5 PASS**，并追加 **6 组变异测试**证明新增测试真能拦住复发（详见 §9）。

**但发布门维持 NO-GO，由两类独立原因共同决定：**

1. **修复未经运行时验证（v0.5 新增的剩余风险）**：B22 / B27 / B28 的修复全部只在 **Node 纯逻辑层**验证。B27 依赖 `initNpcStates` 在 Phaser 场景 `create()` 中被真实调用；B22 依赖宗门场景实际能把 `sect.level` 升到 5；B28 依赖商会 UI 实际调用 `generateTradeOffer`。**这三条链路在浏览器中的集成路径仍是零覆盖（R12 / Q2）**，单测绿不代表 UI 上玩家真的能走到。
2. **既有未签收硬门（v0.3 沿用，仍全部未过）**：标准 `npm run build`、浏览器真实播放与 Phaser 场景 E2E、实际缺帧降级、核心手动烟雾、三档设备、可读性／性能、结构化 Playtest 均未完成。

> **特别提示（防止误读 v0.5）**：535 个测试全绿 + 5 个 P0/P1 缺陷修复复验通过，**依然不等于**游戏可发布。本轮复验证明的是「源码层的五个已知缺陷确实被修好了」，**不是**「产品在浏览器里跑通了」。二者之间隔着标准构建、Phaser 场景集成、真机三档设备与 Playtest 四道未签收的门。**任何以「P0 已修复 + 测试全绿」为由申请放行的请求，QA 仍建议驳回。**

### 8.3 建议修复优先级（v0.5 刷新）

| 优先级 | 缺陷 | 状态 | 遗留动作 |
|---|---|---|---|
| **P0-1** | **B22** 主线断裂 | **✅ 已修复·复验 PASS** | 仅剩浏览器烟雾目测：主线 HUD 进度文案显示「宗门 Lv.3 / Lv.5」且无 NaN |
| **P0-2** | **B27** 故事线死内容 | **✅ 已修复·复验 PASS**（含旧存档迁移） | 仅剩浏览器烟雾目测：与城主／宿敌／隐士对话时「故事」选项出现 |
| **P0-3** | **B28** 死循环 | **✅ 已修复·复验 PASS** | 仅剩浏览器烟雾目测：宗门通商面板连续生成 20 次不卡顿 |
| **P1-1** | **B2 + B3（Q1）** `pvp_rank` 语义错乱 | **✅ 已修复·复验 PASS** | 遗留 N1（旧存档成就污染，见 §9.4）为可选处理 |
| **P1-2** | **B1** 主线成就提前解锁 | **✅ 已修复·复验 PASS** | 无 |
| **P1-3** | **Q2** 场景集成零覆盖 | ⬆ **升级为最高未决项** | 补 `SectScene` / `CityScene` 调用链集成测试 ≥ 1 条（建宗门 → 推进主线 → 完成章节）；这五个修复的浏览器验证缺口正来自此项 |
| **P2** | **Q3** B17 / B26 未锁定 | 待修复 | 补特征化用例，30/30 缺陷全部有回归依据 |
| **P2** | **25 个中/低优先级缺陷** | 待修复 | 维持原状，本轮未处理，不阻塞发布门 |

### 8.4 放行条件（NO-GO → GO 的门槛）

同时满足以下全部条件，QA 方可将发布门建议由 NO-GO 改为 CONCERNS/PASS：

1. ~~P0-1 / P0-2 / P0-3 三项全部修复~~ → **✅ 已于 v0.5 满足**（源码层）；
2. ~~端到端验证主线可通关~~ → **✅ 已于 v0.5 满足**（单测层 `mq_4_1 → mq_4_7` 全链跑通，`getOverallProgress === 1`）；**❗ 仍缺浏览器实跑**；
3. ~~端到端验证 5 条 NPC 故事线均可开启并完成~~ → **✅ 已于 v0.5 满足**（单测层走真实 `talkToNpc` 入口，5/5 走完 `available → completed`）；**❗ 仍缺浏览器实跑**；
4. **【新增·v0.5 最小放行集】** 至少完成一次**核心手动烟雾**并在其中目测确认以下 5 条：① 主线 HUD 宗门等级进度无 NaN；② 城主／宿敌／隐士对话出现「故事」选项；③ 宗门通商面板可正常生成；④ 擂台段位成就在预期段位弹出；⑤ 主线通关至终章「飞升」可触发；
5. §1.3 与 §4.2 中既有的未签收硬门（标准 `npm run build`、浏览器/Phaser E2E、缺帧降级、核心手动烟雾、三档设备、可读性/性能、Playtest）**按清单补齐并留证**——**第 5 项未完成时，仅凭第 1–4 项不得放行。**

---

## 9. v0.5 修复复验与变异测试记录（QA 独立执行）

> 复验原则：**不采信工程自测结论**。方式为读源码定位 → 反例推演 → 跑测试取证 → **还原旧代码做变异反证**。
> 执行范围：只读审读 `src/` 与 `tests/`；仅更新本文档。变异测试期间曾**临时**还原旧代码，**每次均已逐字节还原并复核**（见 §9.5）。

### 9.1 五项修复逐条验证结论

| ID | 判定 | 关键证据 |
|---|---|---|
| **B22** | **PASS** | ① 数据侧 `storyline-data.ts:641-642` 由 `reach_level`/`sect_5` → `sect_level`/`5`；② 逻辑侧 `storyline-system.ts:36-42` 新增 `case 'sect_level'`，读 `state.sect?.level ?? 0` 且带 `Number.isFinite` 守卫，`:96-100` 同步进度显示；③ **反例全部成立**：角色 999 级 + 宗门 4 级 → `false`（不被角色等级误触发）、角色 1 级 + 宗门 5 级 → `true`、`state.sect = null` → `false` 且不抛错；④ 语义核对 `sect-data.ts:53`「`level: number // 宗门等级 = 主殿等级`」，与目标文案「宗门等级达到 5 级（主殿Lv.5）」**完全吻合**；⑤ `'sect_level'` 已加入 `MainQuestObjective` 联合类型（`storyline-data.ts:18`），类型安全；⑥ **全表扫描**：31 条任务共 11 种 `objectiveType`，**全部**在 `isQuestCompleted` 有对应分支，无孤儿类型；⑦ 端到端 `mq_4_1 → mq_4_7` 全链跑通，`getOverallProgress === 1`。 |
| **B27** | **PASS**（旧存档迁移已确认可执行，详见 §9.2） | ① `npc-data.ts:327` → `getStory(def.id) ? 'available' : 'locked'`；② `npc-system.ts:39-46` 新增 `syncNpcStoryAvailability()`；③ **迁移路径无条件执行**（`npc-system.ts:27` 位于 for 循环之外），旧存档必然走到；④ 触发面覆盖 4 个场景 + 4 个 npc-system 入口；⑤ **单向性确认**：`if (!ns \|\| ns.storyStage !== 'locked') continue` → 不触碰 `active`/`completed`，测试已锁定；⑥ 端到端走真实 `talkToNpc` 入口，**5 条故事线（含原死内容 3 条）全部 `available → completed`**；⑦ 修复后 20 NPC = 5 `available` + 15 `locked`，**15 个 locked 是正确的**（它们本就没有故事线）。 |
| **B28** | **PASS** | ① 无上限 `while` 已删除，新实现**无循环、无递归、无分支重试**；② `pickIndex()` 对 `n<=0` / NaN / Infinity / 负数 / 超界 全部钳制到 `[0, n-1]`，不可用时回落 0；③ `recvIdx ≠ giveIdx` **恒成立**：`offset ∈ [0,2]`，`recvIdx = offset < giveIdx ? offset : offset + 1`，穷举 `giveIdx ∈ [0,3] × offset ∈ [0,2]` 共 12 种组合无一撞号；④ **rng 边界推演**（主理人指定）：`0` → stone/herb、`0.999` → wood/ore、`1.0` → 钳到 wood/ore、`NaN` → stone/herb，全部合法且互异；⑤ **400 组退化 rng 穷举**（含 `0 / 1e-9 / 0.5 / 1.0 / 2 / 100 / -0.0001 / -100 / NaN / Infinity / -Infinity / undefined`）：撞号 0、undefined 0、越界 0；⑥ 12 种有序组合全可达；⑦ 120000 次真随机抽样 min 9877 / max 10150（期望 10000，偏差 <1.5%），**保持均匀分布**。 |
| **B2 / B3** | **PASS** | ① `pvp_5` target `5 → 1`（铜牌斗士）、`pvp_1` target `1 → 4`（王者斗士），`desc` 同步改写（原「擂台排名达到 5」/「擂台排名第一」语义错误已修）；② 与 `CityScene.ts:105 RANK_NAMES = ['初入擂台','铜牌斗士','银牌斗士','金牌斗士','王者斗士']` **索引语义一致**；③ 两个 target 均落在 `[0,4]` 且 `champion(4) > novice(1)`；④ 可达性上界确认：`DungeonScene.ts:1291` `if (state.arenaWins >= needed && state.arenaRank < 4) arenaRank++` → `arenaRank ∈ [0,4]`，**最高段位 4 可达**；⑤ 五档行为测试：rank 0 两不解锁 / rank 1 只解锁新秀 / rank 3 仍不解锁天下第一 / rank 4 两者皆解锁。 |
| **B1** | **PASS** | ① `quest_all` target `30 → MAIN_QUESTS.length`；② **`MAIN_QUESTS.length` 实测 = 31**（两种口径 grep 均为 31）；③ **无循环依赖**：`storyline-data.ts` 全文 **0 条 import**，是纯叶子模块（只导出类型与常量），import 图为 `achievement-system → storyline-data` 与 `storyline-system → storyline-data`，**无环**；④ **无副作用**：storyline-data 无顶层副作用，`ACHIEVEMENTS` 在模块求值时读 `MAIN_QUESTS.length`，无 TDZ 风险（535 测试 + typecheck 实证）；⑤ 30/31 不解锁、31/31 才解锁。 |

### 9.2 【重点】B27 旧存档迁移路径复核结论

> 主理人指定重点怀疑项：**「`syncNpcStoryAvailability()` 只在 `initNpcStates()` 里调用，如果玩家读的是旧存档（initNpcStates 已跑过），迁移路径是否真的会执行？」**

**结论：不会出问题，B27 修完整了。旧存档玩家不会仍有 3 条故事线锁死。**

复核过程：

1. **调用位置在守卫之外**。`npc-system.ts:19-28` 的结构是：
   ```
   export function initNpcStates(state) {
     if (!state.npcStates) state.npcStates = {}
     for (const def of NPC_DEFS) {
       if (!state.npcStates[def.id]) { state.npcStates[def.id] = createNpcState(def) }   // ← 只有这一句是守卫内的
     }
     syncNpcStoryAvailability(state)   // ← 第 27 行，for 循环之外、无条件执行
   }
   ```
   `syncNpcStoryAvailability()` **不在** `if (!state.npcStates[def.id])` 分支内，因此**无论存档新旧，每次调用 `initNpcStates` 都会执行迁移**。旧存档的 NPC 状态已存在 → 跳过创建 → **仍然走到迁移**。

2. **触发面足够宽**。`initNpcStates` 的调用点：`CityScene.ts:136`、`WorldScene.ts:62`、`TownScene.ts:212`、`SectScene.ts:172`，以及 `npc-system.ts` 内的 `talkToNpc`(68) / `progressStory`(157) / `getNpcDisplayInfo`(237) / `getLocationNpcs`(247)。**任何一次进城／进城市场景或与 NPC 交互都会触发迁移**，玩家无需任何额外操作。

3. **顺序正确**。`talkToNpc` 在 `initNpcStates(state)`（:68）**之后**才读 `ns.storyStage` 决定是否显示「故事」选项（:90），迁移结果当次对话即生效。

4. **单向、幂等，不会误伤进度**。迁移只把 `locked → available`；`active`（进行中）与 `completed`（已完成）**一律跳过**。测试 `npc-diplomacy.test.ts:302-309` 已锁定：把 `npc_elder` 置 `completed`、`npc_rival` 置 `active` 后跑迁移，两者状态保持不变。

5. **未即时落盘不影响体验（登记为 N2）**。`CityScene.ts:129` 的 `saveGame` 在 `initNpcStates`（:136）**之前**，故迁移结果要等后续 `saveGame` 才写盘；但因迁移幂等且每次进场景重跑，**玩家每个会话都能正常开启故事线**，无用户可见影响。建议在下次改动时把 `saveGame` 挪到 `initNpcStates` 之后一次固化。

### 9.3 变异测试（独立反证：还原旧代码，验证测试是否真红）

> 目的：证明新增测试**真的能拦住回归**，而不是"改没改都绿"。方法：从 `backup/20260830-p0p1-fix/` 换回旧文件 → 跑测试 → 观察 → **立即还原并逐字节复核**。

| # | 换回的旧文件 | 测试表现 | 判定 |
|---|---|---|---|
| **M1** | `storyline-data.ts`（撤 B22） | **5 failed** / 530 passed，exit 1。`expected 'reach_level' to be 'sect_level'`；`expected [ 'mq_4_3' ] to deeply equal []`；`expected false to be true`（满级+宗门4 误判为完成路径断链）；`expected 1 to be 3`；端到端 `mq_4_3 的目标应已达成: expected false to be true` | ✅ **真红，5 条独立拦截** |
| **M2** | `npc-data.ts`（撤 B27 数据侧） | **2 failed** / 533 passed，exit 1。`npc_city_lord 的初始故事状态: expected 'locked' to be 'available'` | ✅ **真红** |
| **M3** | `npc-system.ts`（撤 B27 迁移函数） | **1 failed** / 534 passed，exit 1。`TypeError: syncNpcStoryAvailability is not a function` | ✅ **真红**（迁移路径有专属拦截） |
| **M4** | `achievement-system.ts`（撤 B1/B2/B3） | **3 failed** / 532 passed，exit 1。`expected 30 to be 31`（B1）；`expected 5 to be 1`（B2）；`expected [ 'pvp_1' ] to include 'pvp_5'`（B3，段位 1 时误解锁天下第一） | ✅ **真红，三项各自独立拦截** |
| **M5** | `merchant-system.ts`（撤 B28，跑整个文件） | **EXIT=124 挂死**（90s `timeout` 强杀），无任何测试输出 | ✅ **复现死循环**（工程结论吻合） |
| **M6** | `merchant-system.ts`（撤 B28，**仅跑 `:241` 的 rng 预算用例**） | **1 failed**，耗时 **6ms**，`AssertionError: expected 77 to be 63`，exit 1 | ✅ **具名失败，毫秒级拦截** |

**M6 是本次复验最有价值的发现（工程未区分）：** v0.4 曾担心「B28 复发只能靠超时发现，CI 信号差」。实测证明 **`:241` 的「恒定消耗 2 次 rng」用例会在 6ms 内产生一条具名断言失败**——因为旧实现的重试循环会耗尽 `seqRng` 的预算并落到错误资源上，直接撞断言。因此：

- **B28 的回归保护是「具名红 + 挂死哨兵」双层**，主信号是具名红，CI 可正常捕获；
- §6.3 记录的「B28-G 可执行保护缺口」**正式关闭**；
- §5 的 R11 由 Major 降为**已关闭**；
- 遗留改进建议见 §9.4 N4（把 `:254` 的挂死哨兵也转为具名失败）。

**测试卫生扫描（复验）：** `.skip` / `.only` / `.todo` / `xit` / `xdescribe` 在测试代码中 **0 处**（仅在本类 QA 文档中作为判据文字出现）；断言路径 `Math.random()` **0 处**（全仓唯一命中位于 `world-system.test.ts:466` 的缺陷说明注释内，非可执行代码）；占位断言 `expect(true).toBe(true)` **0 处**。

### 9.4 复验新发现的风险（均为低优先级，不阻塞发布门）

| # | 风险 | 优先级 | 说明与建议 |
|---|---|---|---|
| **N1** | **旧存档成就污染** | P2 | 修复前 `pvp_1` target=1，凡 `arenaRank ≥ 1` 的**旧存档已误获「天下第一」**。修复把门槛提到 4，但 `achievementsUnlocked` 是永久列表且**无回收逻辑**，已误发的成就不会被撤销（不属回归，是历史数据一致性问题）。建议：若在意运营口径，在下个 `SAVE_VERSION` 迁移中做一次性回收；否则书面接受。 |
| **N2** | **B27 迁移未即时落盘** | P2 | `CityScene.ts:129` 的 `saveGame` 在 `initNpcStates`（:136）之前执行。迁移幂等且每次进场景重跑，**无用户可见影响**。建议：把 `saveGame` 挪到 `initNpcStates` 之后，一次固化。 |
| **N3** | **存档反序列化无字段校验** | P2 | `state.ts:397` `s.npcStates = (raw.npcStates as Record<string, NpcState>) ?? {}` 是裸 cast。若某条记录的 `storyStage` 为 `undefined`，`syncNpcStoryAvailability` 的 `!== 'locked'` 判断会 `continue` 跳过，该 NPC 故事线仍不可开启。当前 `createNpcState` 恒写入该字段，**实际不可达**。建议：反序列化时补全默认值，或把守卫改为 `!== 'available' && !== 'active'`。 |
| **N4** | **B28 挂死哨兵影响 CI 信号** | P3 | `merchant-system.test.ts:254` 一旦复发会**同步挂死整个 worker**（vitest 的 `testTimeout` 中断不了同步循环），CI 表现为超时强杀而非具名失败。已被 `:241` 兜底且测试内已注释说明。建议：把该用例的 `constRng` 换成**有调用预算的 rng**（超出抛错），即可把「挂死」转化为「具名失败」。 |
| **N5** | **`pickIndex` 在 n=1 时的理论退化** | P3 | 若 `resourceTypes` 未来缩减到 1 项，则 `offset = pickIndex(rng, 0) = 0`，`recvIdx = 0 < 0 ? 0 : 1` → 索引 1 越界取到 `undefined`。当前 `resourceTypes` 硬编码 4 项，**不可达**。仅作为未来改表时的提醒（建议在改表时同步给 `generateTradeOffer` 加 `length >= 2` 守卫）。 |

### 9.5 复验执行声明与还原确认

**已执行的验证动作：** 读源码定位 6 个文件 + 对照备份 diff 核对改动范围；跑 `npm test` **5 轮**（基线 1 轮 + 变异 4 轮 + 稳定性复跑 2 轮，另含定向用例 1 轮）；跑 `npm run typecheck` 2 次、`npm run validate:data` 2 次；rng 退化穷举与分布均匀性脚本 1 次。

**改动范围核对（diff vs `backup/20260830-p0p1-fix/`）：** 6 个文件的改动内容与工程声称**完全一致，无夹带、无额外数值改动**——`achievement-system.ts` 仅 3 处 `target` 变更（pvp_5 / pvp_1 / quest_all）+ 1 条 import + 注释；`CityScene.ts` 与 `DungeonScene.ts` 与备份**逐字节一致，未被改动**（备份属预防性留存）。

**还原确认：** 每次变异后立即从项目外临时还原点拷回，并在结束时用 `cmp` 逐字节比对 6 个文件**全部回到「已修复态」**（6/6 IDENTICAL）；临时还原点已清理，项目目录内**未新增任何文件**。

**合规声明：** 本轮（Task #83）执行范围为**只读审读 `src/` 与 `tests/` + 仅更新本文档 + 变异测试期间的临时还原/还原**。**未修改 `src/` 或 `tests/` 的任何代码，未执行 build、发布、提交动作；最终 `src/` 状态 = 工程交付的已修复态。**

---

> 附录：本规划**不改动任何代码 / 配置**，仅作为冲刺质量门与测试扩充的落地清单。所有 checkbox 由对应冲刺负责人在门控时勾选，最终放行由主理人审批。
>
> **v0.4 执行声明**：本轮为 Task #81，执行范围为**只读审读 `src/` 与 `tests/` + 仅更新本文档**。已确认 **`src/` 与 `tests/` 未作任何改动**（`src/` mtime 保持 8-29 21:35 及以前，与工程交付时一致），未执行构建或发布动作。
>
> **v0.5 执行声明**：见 §9.5。本轮为 Task #83，同样**未修改 `src/` / `tests/` 代码、未构建、未发布、未提交**；文档为唯一写入文件。
