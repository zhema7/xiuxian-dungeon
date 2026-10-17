# 《修仙与地下城》机制迭代规划文档

> **版本**：v0.1（规划草案，不含实现）
> **范围**：机制线 —— 补全「丹修 / 阵法师 / 魔修」三职业 + 深化 Build/平衡 + 补平衡验证
> **负责人**：文策渊（机制/系统策划，design-strategist）
> **协作约束**：仅规划；代码/美术/音频分别交 engineering-lead / art-director / 待定；平衡模拟器需 engineering-lead 落地
> **设计哲学红线**：杜绝主导策略、杜绝经济失衡、控制认知过载（竖屏单手 ≤ 2 主动按钮）、不漂移核心支柱（Build 自由度 / 掉落驱动 / 修仙沉浸 / Roguelike 节奏）

---

## 0. 基线约束（来自对实际代码与配置表的阅读）

下列是已落地的「硬事实」，本规划所有扩展都以此为边界，不臆造：

| 项 | 现状（实测） | 对规划的含义 |
|---|---|---|
| 职业 | `classes.json` 仅 `sword`/`fairy`，字段 `{id,name,base{hp,atk,def,speed,crit},growth{hp,atk,def},defaultStyle,tint,dirRemap}` | 三新职业直接加 3 个同结构对象 |
| 修饰键 | `Mods` 共 **12 键**：`atk,def,maxHp,speed,crit,aspd,atkPct,defPct,hpPct,lifesteal,skillPct,cdPct`；clamp：`aspd≤0.4`、`lifesteal≤0.35`、`cdPct≤0.5` | 新机制若需新修饰（毒/控/低血），须**扩 `Mods` 类型 + `calcStats/calcDamage`** |
| 攻击模式 | 已实现 10 种（`melee_arc/whirlwind/flying_sword/flying_sword_burst/magic_bolt/frost_nova/frost_nova_burst/thunder_chain/sword_array/giant_sword`）；`resolveAttackMode` 顺序：套装4件 > 同职业招式 > 职业默认 | 新职业基础攻击**优先复用现有 10 模式**；仅必要新增 2~3 个新模式（需 `AttackMode` 联合类型 + `DungeonScene` 行为分支） |
| 套装阶梯 | `aggregateMods` 对所有 `bonuses` 按 `count ≤ 已穿件数` 累加 → **2/4/6 已原生支持**（无需改聚合逻辑） | 新增 6 件套只需在 `sets.json` 写 `count:6` + 6 个 `pieces` |
| 装备槽 | **仅 6 槽**：`weapon/head/armor/boots/charm1/charm2`，**无「法宝」槽** | 6 件套 = 6 槽全穿；本轮**不引入法宝槽**（避免 SlotKey 架构改动） |
| 丹药系统 | 已存在：`potions` 计数 + `btnPot`/`consumePotion` + 回血 40% | 丹修「丹方」**复用该按钮 + 扩充丹药品类**，低成本 |
| 境界 | `REALMS`（炼气→金丹L20→元婴L30→…），每次突破 `REALM_STAT_BONUS=+12%` 基础属性（乘算） | 三职业与现有两职业走同一境界乘区，无需改 |
| 掉落 | `core.ts::rollDrop`：非 Boss 掉丹 14%、Boss 90%；装备/金币另算 | 经济校准见 §4 |
| 模拟器 | **完全缺失**（`scripts/sim` 未建，`tests/` 无 Vitest） | 见 §4.3 —— 是本规划的**硬依赖**，须前置 |
| 伤害管线 | `core.ts::calcDamage`：`攻击×倍率 → 会心×1.6 → ±10% → 减防御 → 保底1` | 魔修「魔煞」低血加成在 calcDamage 加钩子；毒伤/阵域走独立 DoT/ZONE 层 |

> **结论先讲**：三职业的「数据录入」（classes/skills/sets/talents/items/affixes）可在 1~2 冲刺内纯配置完成；但**丹修「丹方」与阵法师「阵眼」是新增子系统（非纯配置）**，魔修「魔煞」近似纯被动钩子（最便宜）。模拟器缺失使数值在真机前不可验证，必须并行建设。

---

## 1. 三职业设计规格

> 设计原则：每职业有「默认攻击（复用现有模式）+ 1 个招牌机制 + 3 分支天赋」；竖屏单手操作下，主动按钮（攻击/技能/丹药/布阵）**每种职业 ≤ 2 个额外按钮**，避免认知过载。

### 1.1 丹修（alchemy）— 辅助 / 毒伤 / 召唤药灵

| 维度 | 规格 |
|---|---|
| **定位** | 持续毒伤（DoT）+ 战前配药增益 + 可召唤药灵（简化召唤） |
| **战斗风格** | 远程投掷药丸（复用 `magic_bolt` 表现），靠毒层叠满 + 投丹触发团队增益/控场 |
| **基础属性（提案）** | `base{hp:100, atk:13, def:5, speed:110, crit:0.06}`；`growth{hp:13, atk:3.0, def:1.0}`（介于剑/仙子之间，偏肉辅） |
| **defaultStyle** | `sk_dan_pellet`（新增 `style`，`attackMode:"magic_bolt"`，`power:0.9`，表现替换为药丸贴图） |
| **招牌机制·丹方** | **战前**在洞府配置最多 3 枚「丹」（如：回春丹/蚀毒丹/聚灵丹）；**战中**复用 `btnPot` 投丹，按配置触发效果（heal / 上毒 / 自身增益），消耗 `potions` 计数（丹修有更高丹药上限与冷却缩减）。→ 复用现有丹药按钮，**零新增输入** |
| **召唤·药灵** | 以「神通」形式召唤 1 个简化药灵（继承怪物 AI 模板 `melee`，随丹修属性缩放）；作为 `art` 实现，避免独立实体系统 |
| **境界衔接** | 走统一 `REALM_STAT_BONUS`；毒伤/药灵强度随境界乘区放大；突破解锁第 2 神通槽 |
| **新增依赖（子系统）** | `pills.json`（丹定义：id/type/effect/value/cd）+ 丹药效果分发器（在 `consumePotion` 处按职业读配置）；`potions` 上限与丹修专属丹药产出来源 |

**天赋树 3 分支（草案，沿用 `talents.json` 结构 `{id,name,max:3,per,desc}`）**
- **毒经**：`蚀毒`(per `poisonPct:0.05` 毒伤+5%/级) · `淬毒`(per `dotPct:0.04` DoT+4%) · `万毒`(per `skillPct:0.06` 毒系神通+6%)
- **丹道**：`炼丹`(per `cdPct:0.05` 投丹冷却-5%) · `回春`(per `hpPct:0.05`) · `灵丹`(per `atkPct:0.04`)
- **药灵**：`召灵`(per `summonPct:0.05` 药灵强度+5%) · `共生`(per `lifesteal:0.02`) · `灵卫`(per `defPct:0.05`)

> 需新增 `Mods` 键：`poisonPct`、`dotPct`、`summonPct`（见 §2.7）。

### 1.2 阵法师（arraymaster）— 控制 / 阵地 / 范围压制

| 维度 | 规格 |
|---|---|
| **定位** | 场上布阵（Zone），控场 + 区域持续伤害/减速，阵地战核心 |
| **战斗风格** | 远程符弹（复用 `magic_bolt`/`frost_nova` 表现）；主力输出来自「阵眼」区域效果 |
| **基础属性（提案）** | `base{hp:95, atk:15, def:4, speed:104, crit:0.05}`；`growth{hp:12, atk:3.4, def:0.9}` |
| **defaultStyle** | `sk_talisman`（新增 `style`，`attackMode:"magic_bolt"`，`power:0.85`，符箓贴图） |
| **招牌机制·阵眼** | 攻击/专属按钮在脚下或瞄准点放置「阵」（Zone 实体，最多 `formationCap=3` 个）；阵按类型生效：**困阵**（减速/定身）、**杀阵**（区域 DoT）、**引阵**（聚怪/增伤）。阵位可被套装/天赋强化。 |
| **境界衔接** | 统一境界乘区；阵数上限/阵强随境界与天赋提升 |
| **新增依赖（子系统，最重）** | **Zone/阵实体层**：在 `DungeonScene` 增加 `formations[]` 管理（类似 `drops[]`/投射物），每帧对范围内敌人施加 `slowPct`/`dotPct`/`pull`；新增 `AttackMode:"place_formation"` 分支或独立 `act` 按钮。**风险最高**，见 §6 |

**天赋树 3 分支（草案）**
- **困阵**：`缚灵`(per `slowPct:0.06` 减速+6%) · `锁元`(per `ctrlPct:0.05` 控制+5%) · `镇魂`(per `defPct:0.05`)
- **杀阵**：`阵焰`(per `atkPct:0.05`) · `裂阵`(per `skillPct:0.06`) · `绝阵`(per `crit:0.03`)
- **引阵**：`聚灵`(per `aspd:0.05`) · `布阵`(per `cdPct:0.05` 布阵冷却-5%) · `阵眼`(per `formationBonus:0.08` 阵效+8%)

> 需新增 `Mods` 键：`slowPct`、`ctrlPct`、`formationBonus`（见 §2.7）。`formationCap` 建议作为 `classes.json` 的 `passive` 字段（类级常量，非 Mods）。

### 1.3 魔修（demonic）— 爆发 / 换血 / 斩杀

| 维度 | 规格 |
|---|---|
| **定位** | 低血高爆发、吸血续航、斩杀回血；高风险高回报 |
| **战斗风格** | 近战猛攻（复用 `melee_arc`/`whirlwind`/`giant_sword` 表现），血量越低伤害越高 |
| **基础属性（提案）** | `base{hp:85, atk:18, def:4, speed:112, crit:0.10}`；`growth{hp:10, atk:3.8, def:0.8}`（最高攻、最低血，典型玻璃大炮） |
| **defaultStyle** | `sk_demonic_slash`（新增 `style`，`attackMode:"melee_arc"`，`power:1.1`） |
| **招牌机制·魔煞** | **类级被动**（写入 `classes.json` 的 `passive`）：`lowHpDmg`——伤害随 `(1-血线)` 放大（如满血 +0%、1% 血 +90%）；`executeHealPct`——斩杀（击杀）回复 `maxHp` 比例（如 5%）。在 `calcDamage` 加一段乘区 + `DungeonScene` 击杀时回血。**无新增输入、近似纯被动钩子** |
| **境界衔接** | 统一境界乘区；魔煞系数随突破提升（突破奖励中给 `lowHpDmg` 增量） |
| **新增依赖（轻）** | `classes.json` 增加 `passive:{lowHpDmg, executeHealPct}`；`calcDamage` 读取 `passive.lowHpDmg`（按当前 `hp/maxHp`）；`DungeonScene` 击杀分支调用 `executeHealPct` |

**天赋树 3 分支（草案）**
- **嗜血**：`饮血`(per `lifesteal:0.02`) · `噬魂`(per `atkPct:0.05`) · `血祭`(per `crit:0.03`)
- **焚血**：`燃血`(per `lowHpDmg:0.05` 魔煞+5%) · `血怒`(per `atkPct:0.04`) · `狂煞`(per `aspd:0.05`)
- **戮魂**：`斩魂`(per `executeHealPct:0.01` 斩杀回复+1%) · `戮生`(per `skillPct:0.06`) · `修罗`(per `crit:0.03`)

> 需新增 `Mods` 键：`lowHpDmg`、`executeHealPct`（见 §2.7，魔修主线基本只依赖这两个 + 既有键）。

---

## 2. JSON 配置扩展衔接点清单

> 所有扩展均「加字段/加条目」，尽量不改现有结构。星标（★）为需改 TS 类型/引擎的硬耦合点。

### 2.1 `classes.json`
- 新增 `alchemy` / `arraymaster` / `demonic` 三个对象，沿用现有结构（`base/growth/defaultStyle/tint/dirRemap`）。
- 新增可选类级字段（不破坏旧对象）：
  - `alchemy.pillSlots: 3`（丹方格数）
  - `arraymaster.formationCap: 3`（阵眼上限，类级常量）
  - `demonic.passive: { lowHpDmg: 0.9, executeHealPct: 0.05 }`（魔煞参数）

### 2.2 `skills.json`（16 → 约 28 条）
- 三职业各补 **1 默认 style**（`class` 取 `"alchemy"/"arraymaster"/"demonic"`，`attackMode` 优先复用现有 10 种）。
- 各补 **2~3 个 mind**（心法，按 §1 天赋涉及的 `Mods` 新键补配套 mind，如 `sk_dujing` 毒经心法 `mods:{poisonPct:0.1}`）。
- 各补 **1~2 个 art**（神通，如丹修「万毒噬」`artMode:"poison_burst"`★、阵法师「天罗地网」`artMode:"formation_burst"`★、魔修「血魔大法」`artMode:"blood_nova"`）。
- ★ 新增 `attackMode`/`artMode` 值（如需 `pellet`/`place_formation`/`poison_burst` 等）须同步改 `data.ts` 联合类型 + `DungeonScene` 行为分支。

### 2.3 `sets.json`（4 → 7+ 套）
- **3 套职业套**（丹/阵/魔），每套 **6 pieces**（`w/h/a/b/c1/c2`）+ **2/4/6 三档**（见 §3）。
- **2~3 套通用套**（毒王套 / 血煞套 / 天机套），同样 2/4/6。
- 现有 4 套（青冥/玄冥/紫霄/凡人）保持 4 件不变（避免重平衡），**不强制升级 6 件**（待决，见 §6）。

### 2.4 `talents.json`（结构改造）
- **现状**：单文件仅存剑修 3 分支，结构 `{branches:[...]}`。
- **改造**：改为**按职业分树** `{ "sword":{branches}, "fairy":{branches}, "alchemy":{branches}, "arraymaster":{branches}, "demonic":{branches} }`。
- 三新职业各填 3 分支 × 3 节点（按 §1 草案），`per` 引用既有 + 新增 `Mods` 键。
- ★ 需改 `talents.ts` 读取逻辑按 `classId` 取树。

### 2.5 `monsters.json`（12 → 12+，主要加标签）
- **加 `tags`/`elements` 数组**（当前完全缺失）：如 `["毒"]`、`["雷"]`、`["boss"]`，支撑**元素克制**与**套装/天赋联动**（策划案 §4.2 有金木水火土雷风毒魔剑标签，但代码侧未落地）。
- 可选：新增 1~2 个「精英/咒术」模板（如降抗诅咒怪）丰富控制/毒主题对抗（非必须，留待平衡后）。
- 不改既有数值（沿用现有 3 地区 + 无尽）。

### 2.6 `items.json`（37 → 约 60+ 条）
- **三职业武器基座**：丹炉/药杵（丹修）、阵盘/符笔（阵法师）、魔刃/骨器（魔修），`slot:"weapon"`，数值对齐现有同档。
- **三套职业套部件**：每套 6 件（`w_xx/h_xx/a_xx/b_xx/c1_xx/c2_xx`），`set:"set_xx"`；含 2 个 charm 件（补齐 6 槽）。
- **通用套部件**：毒王/血煞/天机各 6 件。
- **散件（独特机制）**：2~3 件极限 Build 散件（如「噬魂骨匕：暴击时叠加中毒」「引灵阵盘：布阵冷却-30%」），`mods` 引用新键。

### 2.7 `affixes.json`（10 → 约 16 种）
- 补齐既有 `Mods` 键中**尚无词缀**者：`atkPct`、`defPct`、`hpPct`、`cdPct`（现有仅 skills 用，无掉落词缀）。
- 新增机制词缀（需先扩 `Mods` 类型★）：`poisonPct`(毒伤)、`dotPct`(持续伤)、`slowPct`(减速)、`ctrlPct`(控制)、`lowHpDmg`(魔煞)、`executeHealPct`(斩杀回复)、`summonPct`(药灵)、`formationBonus`(阵效)。
- 每条沿用 `{id,name,stat,min,max}`，`stat` 指向上述键。

### 2.8 新增 `pills.json`（仅丹修需要）
- 结构：`{ id, name, type:"heal|poison|buff", value, cd, desc }`。
- 由丹修「丹方」战前配置引用；战中 `consumePotion` 分发。
- ★ 需 `consumePotion` 逻辑按 `classId==='alchemy'` 走丹方分发而非固定回血。

---

## 3. Build 深度方案

### 3.1 联动模型（统一口径）
```
Build = 职业(决定可穿/可学) × 招式(attackMode) × 心法(mods) × 神通(art) × 套装(2/4/6) × 散件(独特) × 天赋(3分支) × 境界(乘区)
```
- **套装改机制**（4/6 件置换 `attackMode`/`artMode`）、**散件改极端数值/独特触发**、**天赋补垂直深度**、**心法铺水平面板** → 四象限组合保证 Build 自由度（支柱①）。
- **防主导策略**：每职业至少 2 条可行路径（如魔修「纯低血爆发」vs「吸血续航」；丹修「毒叠」vs「投丹辅助」），避免单套 6 件通吃。

### 3.2 本轮建议新增套装清单草案（2/4/6 方向）

**职业套（各 6 件 = 2/4/6 全阶梯）**

| 套装 | 2 件（属性） | 4 件（特殊能力） | 6 件（改变机制/终极） |
|---|---|---|---|
| **丹修·百毒套** | 毒伤 +12% | 投丹不耗次数（每 8s 一次） | 攻击附加「蚀毒」层，叠 5 层引爆（中毒爆发） |
| **阵法·天罗套** | 阵效 +12% | 阵眼上限 +1（4 个） | 攻击化为「天罗地网」：在周身生成困杀阵域 |
| **魔修·血煞套** | 魔煞 +12% | 斩杀回复翻倍 | 攻击化为「血魔大法」：低血时攻击附带血爆 AoE |

**通用套（跨职业，2/4/6）**

| 套装 | 2 件 | 4 件 | 6 件 |
|---|---|---|---|
| **毒王套**（毒/DoT 流） | 毒伤 +10% | 中毒目标受创 +15% | 击杀中毒目标触发毒爆（链式） |
| **血煞散套**（换血流） | 吸血 +8% | 低血时攻速 +12% | 受致命伤保留 1 血（每局 1 次） |
| **天机套**（CD/功能流） | 神通冷却 -10% | 技能伤害 +12% | 神通命中刷新攻击模式冷却 |

> 6 件套的 `attackMode`/`artMode` 若为全新值（如 `poison_burst`/`formation_burst`/`blood_nova`），需 §2.2 的 ★ 类型扩展 + `DungeonScene` 分支。

### 3.3 散件（独特机制）草案
- 「噬魂骨匕」（魔修向）：暴击时叠加 1 层中毒（2s），可叠 5 层。
- 「引灵阵盘」（阵法师向）：布阵冷却 -30%，但阵眼上限 -1。
- 「万毒珠」（丹修向）：投丹额外对目标施加当前毒层 ×50% 的即时毒伤。
- 设计意图：散件提供「反常规 combo」，支撑极限 Build（支柱②掉落驱动）。

### 3.4 心法联动
- 每职业补 2~3 个 `mind`（如丹修「毒经心法」`poisonPct+0.1`、阵法师「天罗真诀」`formationBonus+0.1`、魔修「焚血诀」`lowHpDmg+0.1`），与天赋/套装形成「水平铺面板 + 垂直特化」双轴。

---

## 4. 经济与平衡框架

### 4.1 资源循环校准方向
| 资源 | 现状来源 | 本轮校准 |
|---|---|---|
| 灵石 | 打怪/卖装/任务 | 维持；新增职业套散件提供灵石 sink（强化/洗炼） |
| 悟道点 | 升级/论道 | 三职业天赋点随等级发放，保持 1 级 1 点节奏 |
| 丹材 | 采集/掉落 | **丹修专属**：新增「灵草」掉落（非 Boss 8%、Boss 保底），供洞府炼丹与丹方配置 |
| 阵图 | 无 | **阵法师专属**：新增「残阵图」掉落，作为布阵/升阵资源（sink） |
| 魔气 | 无 | **魔修专属**：新增「魔煞结晶」，低血触发/击杀掉落，强化魔煞系数（sink） |
| 突破材 | Boss/事件 | 不变 |

> 校准原则：三职业各有 1 条「专属材料」掉落 + 对应 sink，避免经济失衡（红线②）；专属材料**不与通用资源互斥**，旧两职业不受影响。

### 4.2 掉落权重校准建议
- **对齐策划案 v4 目标权重**（当前 `core.ts` 需核对是否已落地）：白 50% / 绿 28% / 蓝 15% / 紫 5.5% / 橙 1.4% / 红 0.1%；Boss 房整体提一档 + 保底蓝。
- **分层缩放**：高层（无尽妖域 / 第 4+ 地区）紫橙权重小幅上浮（如橙 1.4%→2.2%），维持「刷高层凑套」目标感。
- **专属材料**：非 Boss 8%、Boss 保底 1 个；不占装备权重池，独立 roll。
- 校验方式：用 §4.3 模拟器跑 N 局，统计各品质实际占比是否在目标 ±1.5% 内。

### 4.3 平衡模拟器需求（硬依赖，需 engineering-lead 落地）
> **为什么必须有**：三职业数值在真机前不可验证，现有 `core.ts`/`effects.ts` 已解耦为纯 TS（不依赖 Phaser），模拟器可直接复用，**成本可控**。

- **输入**：`Build`（class/skills/sets/affixes/talents/realm/level）+ `怪物配置`（floor 或 region 或 monster 列表）+ `层数`。
- **输出**：DPS 分布（均值/P25/P75）、通关时间分布（均值/P25/P75）、胜率（对 Boss/对层）、死亡节点分布。
- **运行**：无头跑 N=1000 局（复用 `calcDamage`/`aggregateMods`/`rollDrop`），纯函数、可 CI。
- **指标阈值（验收红线）**：
  1. 同层三职业通关时间差异 ≤ **25%**（防主导策略 / 职业失衡）。
  2. Boss 战时长落在 **60~180s**（节奏支柱）。
  3. 任一 Build 胜率 **40%~80%**；单 Build 胜率不得高于其他职业同层平均 **±20%**。
  4. 经济：千局后各品质实际占比落在目标权重 **±1.5%**。
  5. 魔修最低血线时 DPS 不得超过同 Build 满血时 **2.2×**（防魔煞碾压）。
- **交付物**：`scripts/sim/index.ts` + 配置读取 + 报告输出（JSON/CSV）。

---

## 5. 冲刺拆分草案（2 周/冲刺，建议 5 冲刺收口）

| 冲刺 | 目标 | 退出标准（lean） |
|---|---|---|
| **S1 · 数据骨架 + 魔修 + 丹方雏形** | `classes.json` 三职业录入；魔修「魔煞」`passive` + `calcDamage` 钩子；`pills.json` + 丹药分发（丹修）；新 `Mods` 键（lowHpDmg/executeHealPct/poisonPct/dotPct…）类型扩展 | 三职业可进本战斗；魔修低血伤害可见提升、斩杀回血生效；丹修投丹触发 1 种效果；`validate-data` 通过 |
| **S2 · 阵法师阵眼 + 三职业技能/心法/神通** | Zone/阵实体层（`formations[]` + 减速/DoT/pull）；三职业 style/mind/art 录入；新增必要 `attackMode`/`artMode` 值 + `DungeonScene` 分支 | 阵法师可布阵并对范围内敌人生效；三职业各至少 1 神通可放；真机竖屏操作 ≤ 2 额外按钮 |
| **S3 · 套装/散件/天赋/词缀 + 怪物标签** | 3 职业套 + 3 通用套（2/4/6 全配）；散件 3 件；`talents.json` 改按职业分树；`affixes.json` 扩至 16；`monsters.json` 加 `tags` | 6 件套 attackMode 置换生效；三职业天赋树可加点并生效；元素克制/标签可被套装/天赋引用 |
| **S4 · 平衡模拟器 + 首轮校准** | 建 `scripts/sim`（复用 core/effects）；跑三职业 × 多 Build × 多层；按 §4.3 阈值校准数值 | 模拟器产出 DPS/通关/胜率报告；5 条阈值中除「真机手感」外全部达标或给出偏差说明 |
| **S5 · 集成验证 + lean 评审收口** | 边界用例（满血魔修/空阵/无丹/套件缺失）；与旧两职业共存验证；文档定稿（GDD 由本规划派生） | 无控制台报错；旧职业 Build 数值回归在阈值内；规划文档→可落地 GDD 清单输出 |

> 风险重镇：**S2（阵眼子系统）** 与 **S4（模拟器）** 最易超时，建议 S4 与 S1~S3 并行起步（模拟器不依赖全部内容，先用旧职业验证管线）。

---

## 6. 风险与待决事项（提交主理人）

**最大风险 Top 3（详见上方正文）**
1. **阵法师「阵眼」是全新 Zone 子系统**（非纯配置），工程量最不可控 → 建议 MVP 先用「攻击即布阵」（复用 `act` 按钮触发放置）降低范围，S2 再深化。
2. **平衡模拟器完全缺失** → 三职业数值上线前无法验证，存在「主导策略 / 经济失衡」红线击穿风险 → 须 S1 即并行启动 `scripts/sim`。
3. **魔修「魔煞」低血换伤的系数易失控**（既可能碾压其他职业、又可能反噬竖屏单手手感）→ 已在 §4.3 设硬阈值（低血 DPS ≤ 满血 2.2×、胜率 40~80%）。

**待主理人拍板的决策点**
- **A. 现有 4 套（青冥/玄冥/紫霄/凡人）是否统一升级为 6 件？** 建议：本轮不升，新套才用 6 件，避免重平衡旧内容。
- **B. 是否引入「法宝」专属槽？** 建议：本轮**不引入**（SlotKey 架构改动 + 需新资产），6 件套 = 6 槽全穿即可满足 2/4/6。
- **C. 三职业美术资产（丹炉/阵盘/魔刃贴图、阵/丹特效）排期** → 交 art-director 评估，不阻塞机制数据录入（先用程序化兜底贴图占位）。

**设计哲学自检**
- 主导策略：每职业 ≥2 路径、模拟器阈值兜底 ✅（待验证）
- 经济失衡：专属材料独立 roll + sink ✅
- 认知过载：竖屏主动按钮 ≤2 额外/职业 ✅
- 支柱漂移：所有扩展围绕 Build 自由度/掉落/修仙沉浸，未引入偏离核心的新支柱 ✅

---
*文档结束。下一步：待主理人确认 A/B/C 三项决策后，由本规划派生逐职业 GDD 与配置表扩展 PRD。*
