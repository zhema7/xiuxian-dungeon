# 《修仙与地下城》机制线 · 技术可行性 / 重构规划

> 文档类型：规划与方案评估（**只规划，不写实现代码**）
> 作者：技术方向 / 主程序（程基岩）
> 关联里程碑：M3🔶（三职业缺口）/ M4🔶（平衡 / 性能未落地）
> 约束：技术选型不变（Phaser 3.90 + Vite 5 + TS 5.6）；优先复用现有纯 TS 核心；lean 轻量评审。

---

## 0. 现状基线（已读代码确认）

| 维度 | 现状（实测） | 对机制线的影响 |
|---|---|---|
| 核心玩法 | `core.ts` / `effects.ts` / `skills.ts` / `talents.ts` / `favor.ts` / `levelgen.ts` / `lore.ts` 均为**纯 TS，不 import Phaser** | ✅ 可头less 复用，是模拟器与重构的基石 |
| 攻击模式解析 | `resolveAttackMode()` 已在 `effects.ts`（纯 TS）求值；但**模式执行**在 `DungeonScene.doAttack()` 的 `if (mode===...)` 长链（约 777–908 行） | ⚠️ 加新攻击模式必须改场景分支 |
| 攻击模式数量 | 10 种（melee_arc / whirlwind / flying_sword / flying_sword_burst / magic_bolt / frost_nova / frost_nova_burst / thunder_chain / sword_array / giant_sword） | 三职业会带来 4–6 个新模式 + 3 个签名机制 |
| 套装/效果 | `aggregateMods()` 已聚合装备/词缀/套装/心法/天赋 → `Mods`；`SetBonus` 支持 `mods` / `attackMode` / `artMode`（JSON） | ✅ 纯数值套装已可纯 JSON 加；缺「触发器类」效果 |
| 神通执行 | `castArt()` 同样是 `if (artMode===...)` 链（1055–1107 行） | ⚠️ 同攻击模式问题 |
| 实体 | `entities.ts` 传统 class（`Player`/`Enemy`/`Ally`），AI 与战斗在 `update()` 内（Phaser 耦合） | ⚠️ 模拟器无法直接复用战斗循环 |
| 配置表 | `src/data/*.json`（8 张）+ `validate-data.mjs` 构建期校验 | ✅ 加职业/套装/技能基本是加 JSON |
| 测试 | `tests/` 下仅 `core.test.ts` / `state.test.ts`（2 个 Vitest） | ⚠️ 无平衡模拟器，无战斗回归 |
| 包体 | `dist/` = **5.3MB**；`public/sprites` 49 张 PNG ≈ 5.3MB（主体）；`public/audio` 17 mp3 ≈ 1.4MB；JS 包（Phaser+游戏）较小 | ⚠️ 已逼近 <5MB 目标，且散图无图集、无对象池、无分包 |
| 引擎 | Phaser 3.90（`DungeonScene.ts` 1564 行「上帝场景」） | 重构重点是**把逻辑从场景抽回纯 TS** |

> 结论先讲：本迭代真正的杠杆点是**「把战斗逻辑从 `DungeonScene` 抽成纯 TS 的攻击模式注册表 + 战斗解算层」**。这一步同时解决【三职业接入低侵入】与【平衡模拟器可复用】，是两份交付物的最大公约数。

---

## 1. 三职业接入技术方案

### 1.1 攻击模式：两条路线对比

| 路线 | 做法 | 加一个新攻击模式要动哪里 | 侵入性 | 推荐度 |
|---|---|---|---|---|
| **A. 攻击模式注册表**（配置 + 行为注册） | `AttackModeDef`（数据，描述几何/数值/特效 key）+ 纯 TS `attackModel.ts`（按 `kind` 分发的**解算函数**）+ `DungeonScene` 薄适配层只负责把解算结果渲染成特效/投射物 | JSON 加 1 条 `AttackModeDef`；若复用已有 `kind` 则**场景 0 行新增**；仅当形状全新才在 `attackModel.ts` 加 1 个 `kind` handler | **低** | ⭐⭐⭐ 推荐 |
| **B. 现状场景分支**（维持 `if` 链） | 继续在 `doAttack()` 里加 `if (mode==='xxx')` | 每个模式在 `DungeonScene` 加 15–40 行分支 + 改 `AttackMode` union | **高**（场景继续膨胀） | 不推荐 |

**关键认知**：`doAttack()` 里的每类模式本质都是「索敌 → 生成伤害事件 → 渲染特效」三步。其中「索敌+伤害」是**纯逻辑**，只有「渲染」依赖 Phaser。把前两步抽成 `resolveAttack(mode, attacker, enemies, stats, rng) → HitEvent[]`，场景只遍历 `HitEvent[]` 做 `dealDamage` + 画特效，即可让「加模式」与「改场景」解耦。

> `HitEvent` 形态示例：`{ target: Enemy; dmg: number; crit: boolean; slowMs?: number; isSkill: boolean; fromX; fromY }`

### 1.2 套装 / 效果：两条路线对比

| 路线 | 做法 | 加一个新套装要动哪里 | 侵入性 | 推荐度 |
|---|---|---|---|---|
| **X. 扩展声明式 bonus 形状**（推荐） | 在现有 `SetBonus` 上扩展有限几种 `effect` 种类：`onHit` / `onKill` / `aura` / `zone` / `resource`（各自由 `mechanics.ts` 薄分发处理，且**同时被运行时与模拟器复用**） | 纯数值/已有模式的套装 = **纯 JSON**；带签名机制的套装 = JSON + 可能 1 个 `effect` handler | **低–中** | ⭐⭐⭐ 推荐 |
| **Y. 完整 JSON 效果 DSL**（如 `on_equip_count(6) → apply(atk+0.2)`） | 自研解释器 + 沙箱 + 校验 | 无需改代码 | 但需**解释器 + 校验 + 安全边界** | ⭐ 暂不做（ROI 低，本游戏效果种类 ~10 种，解释器复杂度不划算） |

**结论**：套装走 **X（扩展声明式，不做完整 DSL）**。现有 `aggregateMods` 已能处理 `mods` 与 `attackMode`/`artMode`，本就不必改代码；唯一缺口是「非数值类签名机制」，用有限 `effect` 种类覆盖即可，避免引入解释器。

### 1.3 推荐方案 · 具体改动点（文件级）

**新增（纯 TS，无 Phaser）：**
- `src/combat/attackModel.ts`：导出 `AttackModeDef` 类型 + `resolveAttack(mode, ctx) → HitEvent[]`；按 `kind` 分发：
  - `melee_arc` / `whirlwind` / `projectile` / `chain` / `self_array` / `lob` / `zone`（后两者为新形状，承载丹修/阵法师）
- `src/combat/mechanics.ts`：声明式 `effect` 薄分发（`onHit`/`onKill`/`aura`/`zone`/`resource`）；被 `DungeonScene` 与 `sim` 共用。
- `src/combat/ai.ts`：把 `entities.ts` 中 `Enemy.update()` 的 AI/索敌抽成纯函数 `stepEnemy(enemy, ctx, dt)`，供运行时与模拟器共用。
- `src/data/attackModes.json`：10 个现有模式 + 新模式的参数表（从 `doAttack` 链里「翻译」出来）。

**改造（低侵入）：**
- `src/data.ts`：`AttackMode` union 改为 `string`（或保留 union + 注册表交叉校验）；`SetBonus` 增加可选 `effects?: EffectSpec[]`。
- `src/effects.ts`：`resolveAttackMode()` 不变（已纯 TS）；新增 `resolveAttackDef(state)` 返回 `AttackModeDef`。
- `src/scenes/DungeonScene.ts`：`doAttack()` 重写为 `const hits = resolveAttack(def, ctx); for (h of hits) this.dealDamage(...)` + `renderAttack(def, hits)`（特效适配）。**现有 10 个模式搬入注册表后，场景攻击相关代码预计从 ~130 行降到 ~25 行。**
- `src/entities.ts`：`Enemy.update()` 内部改为调用 `stepEnemy()`（行为不变，仅挪位）。

**加一个新职业（如丹修）的标准动作：**
1. `classes.json` 加 `danxiu` 定义（base/growth/defaultStyle）。
2. `skills.json` 加招式（指向新 `AttackModeDef` id）。
3. `attackModes.json` 加丹修模式（复用 `projectile`/`lob`/`zone` kind → **0 新 handler**）。
4. 若带签名机制（丹炉 aura）→ `mechanics.ts` 加 1 个 `aura` effect（已是现成 kind）。
5. **`DungeonScene.ts` 0 行改动**（除非引入全新 `kind`）。

### 1.4 侵入性评估（加「一个职业 + 其全部攻击模式」）

| 指标 | 路线 B（现状分支） | 路线 A+X（推荐） |
|---|---|---|
| `DungeonScene.ts` 新增行数 | +120~200（分支 + 特效） | **0**（除非新 `kind`） |
| 需改的纯逻辑文件 | 无（都堆场景里） | `attackModes.json`（数据）+ 偶发 `attackModel.ts`/`mechanics.ts` 1 个 handler |
| 回归风险面 | 大（改 1564 行场景） | 小（纯 TS 模块有单测覆盖） |
| 模拟器能否复用 | ❌ 需重写战斗 | ✅ 直接复用 `resolveAttack`/`stepEnemy` |
| 三职业累计改动 | 场景 +360~600 行 | 场景 ≈ 0；逻辑层 +~80 行 handler（覆盖 3 职业新形状） |

**结论：路线 A+X 侵入性显著更低，且一次性解决模拟器复用，强烈推荐。**

### 1.5 三职业 · 签名机制设计草案（供机制线评审）

| 职业 | 新攻击模式（建议 kind） | 签名机制（建议 effect kind） | 模拟器建模要点 |
|---|---|---|---|
| **丹修** | `alchemy_bomb`（lob，落点 AoE）、`poison_cloud`（zone，持续 DoT） | `aura`：丹炉光环周期回血/增伤；`onKill`：击杀叠毒伤 | zone 需「地面持续区」实体（运行时 + sim 都建 zone 列表，按 tick 结算） |
| **阵法师** | `formation_drop`（zone，部署阵法）、`talisman_burst`（chain/explosion） | `zone`：可部署静止阵法（控场/伤害）；`resource`：阵眼充能 | 同上 zone 实体；部署物是「持久化战斗对象」，sim 需建模生命周期 |
| **魔修** | `demon_drain`（近战吸血 beam）、`soul_scythe`（大范围 cleave） | `resource`：杀意/魔元叠层（击杀涨、超时衰减），层数放大伤害 | 需要「状态资源」小状态机（kill→+stack；timeout→decay）；sim 复用同一状态机 |

> 三职业真正「形状全新」的只有 **zone（地面/部署持久区）** 与 **resource（叠层资源）** 两类——每个只需在 `attackModel.ts`/`mechanics.ts` 加 1 个 handler，并被 sim 复用。其余全是 `projectile`/`chain`/`melee_arc` 的变参。

---

## 2. 平衡模拟器 `scripts/sim` 脚手架方案

### 2.1 定位与复用关系

- **目标**：无头跑千局战斗，量化 Build 强度，数值膨胀前建立平衡基线 + CI 门禁。
- **核心约束**：不依赖 Phaser；**直接复用**现有纯 TS 核心 + 第 1 节抽出的 `resolveAttack` / `stepEnemy`。
- **复用清单（已确认均为纯 TS）**：
  - `core.ts`：`makeRng` / `randInt` / `calcDamage` / `rollEquip` / `rollDrop`
  - `effects.ts`：`calcStats` / `aggregateMods` / `resolveAttackMode` / `resolveAttackDef` / `stylePower`
  - `combat/attackModel.ts`（新）：`resolveAttack`
  - `combat/ai.ts`（新）：`stepEnemy`
  - `data.ts`：`spawnTableFor` / `MONSTERS` / `difficultyById` / `REGIONS`
  - `skills.ts`：`mindModsAt` / `skillPowerAt` / `artCooldown`

### 2.2 输入（BuildConfig + RunConfig）

```jsonc
// scripts/sim/builds/example.json
{
  "build": {
    "classId": "sword",
    "level": 30, "realm": 2,
    "equipment": { "weapon": "w_dragon", "head": "h_phoenix", "armor": "a_dragon", "boots": "b_cloud", "charm1": "c_thunder", "charm2": "c_blood2" },
    "skills": { "sk_sanlian": 5, "sk_taiyi": 5 },
    "skillSlots": { "style": "sk_sanlian", "minds": ["sk_taiyi", "sk_xuanwu"], "art": "sk_jianqi" },
    "talents": { "t_jifeng": 2 }
  },
  "run": {
    "difficulty": "hell",
    "floors": [1, 12],          // 模拟楼层范围
    "seed": 20260821,
    "samples": 1000,            // 千局
    "stepMs": 33                // 固定步长 ≈30fps 战斗tick
  }
}
```

> 也可由脚本扫描 `equipment` 用 `makeItem`/`rollEquip` 随机生成 Build 做蒙特卡洛扫描。

### 2.3 输出（指标 + 阈值）

```jsonc
{
  "buildId": "sword_30_hell",
  "samples": 1000,
  "DPS_mean": 1840, "DPS_p50": 1790, "DPS_p90": 2310,
  "clearTime_sec_p50": 96, "clearTime_sec_p90": 142,
  "winRate": 0.82,
  "surviveHp_p50": 0.41,        // 清层时剩余血量比例
  "killDist": {"min":380,"p50":612,"max":1402},
  "perFloor": [ {"floor":1,"winRate":1.0,"avgSec":22}, ... ]
}
```

**建议阈值（写入 CI gate，初版宽松、随数据收敛）：**
- `winRate`（hell, 12 层）落在 `[0.55, 0.95]` → 过；过高=过强，过低=折磨。
- `clearTime_p50` 单局 60–180s 为健康区间。
- 任意 Build 间 `DPS_mean` 比值不超过 **3×**（防止单一 Build 碾压）。

### 2.4 实现骨架（模块，伪代码级）

```
scripts/sim/
  index.mjs            # CLI 入口：读 builds/*.json → 跑 → 写 report.json + 打印表格
  harness.ts           # 纯 TS：Simulator 类（固定步长循环，无 Phaser）
  combatant.ts         # 由 BuildConfig 构造「战斗者」(复用 calcStats)
  wave.ts              # 由 spawnTableFor 生成怪物波次（复用 MONSTERS + difficultyById）
  metrics.ts           # 聚合 DPS/胜率/时间分布/分位
  thresholds.ts        # 阈值定义 + 通过/失败判定（CI 用）
```

`Simulator` 主循环（无头）：
```
for sample in samples:
  state = buildCombatant(build)          // calcStats(state)
  for floor in floors:
    wave = spawnWave(floor, difficulty)  // 纯数据
    while alive(enemies) && state.hp>0:
      step(state, enemies, dt, rng)      // 玩家攻击→resolveAttack→HitEvent→calcDamage；敌人→stepEnemy
      accumulateDPS(...)
    if state.hp<=0: recordLoss(floor); break
  record(clearTime, kills, surviveHp)
emit(metrics.aggregate(), thresholds.check())
```

### 2.5 CI 门禁

- `package.json` 加 `"sim": "tsx scripts/sim/index.mjs"`（或 `vite-node`）。
- 预提交 / CI 跑 `npm run sim -- --ci`，`thresholds.ts` 判定失败则非零退出。
- 初版仅「跑通 + 基线报告」；阈值随迭代数据逐步收紧。

---

## 3. 性能与包体优化路线（按优先级）

| 优先级 | 项 | 做法 | 预计收益 | lean 阶段 |
|---|---|---|---|---|
| **P0-1** | **PNG 压缩 / 量化** | `oxipng`/`pngquant` 跑 `public/sprites`（49 张 ≈5.3MB） | 5.3MB → ~2.0–2.5MB（最大单点杠杆，零代码风险） | **必做**（上 TapTap/首发前） |
| **P0-2** | **首包分包 / 懒加载** | `DungeonScene` 用 `import()` 动态加载；按 `REGIONS` 在进层时加载该区图集（`levelgen` 已知 region） | 首屏下载 <5MB（标题/洞府 + 1 区），其余按需 | **必做**（达标 <5MB 关键） |
| **P0-3** | **对象池** | `pprojs`/`projs` 投射物池 + 飘字 `floatText` 池（现 `DungeonScene` 每击 `add.image` 后 `destroy`） | 消除 GC 尖刺，移动端帧率更稳 | **必做**（移动端体验） |
| **P1-1** | **纹理图集** | TexturePacker 合并散图 + 生成 atlas JSON，改 `textures.ts` 引用 | 降 draw call / 纹理切换；与 P0-1 协同 | 可选（视真机帧率） |
| **P1-2** | **PWA manifest** | `manifest.json` + 轻量 service worker（缓存静态） | 可加桌面图标 / 离线 | 可选（低优先） |
| **P1-3** | **低端机降档** | 检测 `deviceMemory`/`hardwareConcurrency` 或设置开关 → 60→30fps + 降粒子/特效密度 + 可选降分辨率 | 低端机可玩 | 可选（视真机反馈） |

> **关于 <5MB 的精确口径**：`dist/` 当前 5.3MB，已接近目标。首包达标靠 **P0-1（压缩）+ P0-2（懒加载）** 组合：首屏只含 JS（~1.2MB）+ 压缩后标题/洞府精灵（~0.5MB）+ UI，稳定 <5MB；总资源可超（懒加载）。**最大风险点是美术线持续往 `public/sprites` 塞未压缩散图**——需与美术线约定「出图即过压缩 / 走图集」工作流。

---

## 4. 现有技术债影响评估 + 「够用则不改」清单

| 技术债 | 对本次迭代的影响 | 决策 |
|---|---|---|
| **localStorage 单 key** | 装备实例多时体积大才需迁；当前规模无感 | **不改**（仅当存档读写出现卡顿再迁 IndexedDB） |
| **扁平 `src/` 结构** | 本次会在 `src/` 下新增 `combat/` 子目录放抽出的纯逻辑；不强制重排旧文件 | **不改旧结构**，新模块按 `src/combat/` 归位即可 |
| **传统 class 实体（Player/Enemy/Ally）** | 不改为 ECS；但**抽出 AI/攻击解算为纯函数**（`combat/ai.ts`、`attackModel.ts`）——这是定向重构，不是整体 ECS 化 | **改（定向抽逻辑），不改（实体形态）** |
| **无 ECS** | 本游戏规模不需要 | **不改** |
| **无对象池** | 移动端 GC 尖刺 | **改（P0-3）** |
| **webm/ogg 双格式音频** | 仅 mp3，iOS Safari 需真机验证 | **暂不改**（先验证，出问题再补） |
| **PWA manifest** | 无 | **可选（P1-2）** |
| **ESLint + Prettier** | 低成本，建议补 | **建议补**（可与 sim/CI 同批） |

**「够用则不改」清单**：localStorage、扁平 src 结构、传统 class 实体、无 ECS、音频双格式、PWA。
**本次必须做的定向重构**：把战斗逻辑（攻击解算 + 敌人 AI）从 `DungeonScene` 抽成纯 TS——它是三职业低侵入与模拟器复用的前提。

---

## 5. 冲刺级技术任务拆分（双线并行 · 对齐机制/美术）

> 节奏：每冲刺 1–2 周，lean 评审。技术交付与机制/美术线对齐。

### S1 · 解耦地基 + 模拟器 MVP（技术主线，无新内容）
- [ ] 抽 `src/combat/attackModel.ts`：把现有 10 个攻击模式从 `doAttack` 翻译进注册表；`DungeonScene.doAttack` 改为遍历 `HitEvent[]`（**零回归验证**：用现有存档/手测比对手感）。
- [ ] 抽 `src/combat/ai.ts`：`stepEnemy()` 从 `Enemy.update` 剥离。
- [ ] 搭 `scripts/sim` MVP：复用 `core`/`effects`/`attackModel`/`ai`，跑剑修/仙子 vs 1–12 层，出基线报告 + `thresholds.ts` v0。
- [ ] 补 `tests/`：`attackModel.test.ts`（各模式伤害事件正确）、`ai.test.ts`（敌人索敌/出招确定可复现）。
- **风险**：重构期战斗手感回归 → 缓解：手测 A/B + sim 基线对比。
- **对齐**：机制线可同步定义三职业数值草案；美术线可启动三职业原画。

### S2 · 三职业接入（机制 + 美术并行）
- [ ] `classes.json` / `skills.json` / `attackModes.json` 加丹修/阵法师/魔修（默认招式 + 新模式，多复用现有 `kind`）。
- [ ] `mechanics.ts` 加 `zone` / `resource` 两个新 effect handler（承载签名机制），**运行时 + sim 双实现**。
- [ ] `DungeonScene` 仅加 `renderAttack` 对新 `fx` key 的适配（攻击逻辑 0 改）。
- [ ] 美术：三职业精灵帧表 + 签名机制特效（丹炉/阵法/魔气）。
- **风险**：`zone`/`resource` 是全新形状，需同时建模运行时与 sim → 风险中，S1 先把 `combat/` 接口定稳可降险。

### S3 · 深化 Build（以数据为主，低风险）
- [ ] 加 2–3 套新套装（`sets.json`，多纯 `mods`/已有模式）、2–3 词缀（`affixes.json`）、2–3 心法（`skills.json` mind）、天赋分支节点（`talents.json`）。
- [ ] 至多 1–2 个套装用 `mechanics.ts` 的 `effect` 做签名联动。
- [ ] 跑 `sim` 全 Build 扫描，调数值至阈值内。
- **风险**：低（多为 JSON）；主要风险是**数值膨胀** → sim 门禁兜底。
- **对齐**：美术出套装/词缀图标。

### S4 · 性能/包体 + 平衡收口（上线前）
- [ ] P0-1 PNG 压缩；P0-2 动态 import 分包 + 区域懒加载；P0-3 对象池。
- [ ] （可选）P1-1 图集、P1-2 PWA、P1-3 低端机降档。
- [ ] 全 Build `sim` 扫描 + 阈值收紧，固化平衡基线；sim 接入 CI 门禁。
- **风险**：懒加载资源未就绪导致黑屏（真机验证）；iOS 音频兼容性。
- **对齐**：美术线确认出图走压缩/图集流程，守住包体预算。

---

## 附录 · 给主理人的 3 个最大技术风险

1. **战斗逻辑深埋于 1564 行 `DungeonScene`（Phaser 耦合）**——模拟器无法复用、加职业必改场景。这是最高杠杆也是最高风险点：**必须先做 S1 的纯 TS 抽取（攻击注册表 + 战斗解算层）**，否则三职业会变成「每职业往场景加一堆分支」，且模拟器被迫重写战斗逻辑（与游戏实现漂移）。
2. **三职业签名机制（丹修 DoT/阵法师 zone/魔修 叠层）需要一套「运行时 + 模拟器共用」的有限声明式 effect 系统**——这部分超出攻击模式注册表与现有套装 `mods` 的覆盖。低估它，会让「加职业」退化为「每职业写定制场景代码」。已在 `mechanics.ts` 用 `zone`/`resource` 两个 handler 收敛。
3. **包体/首包 <5MB 与低端机**：`dist` 已 5.3MB（49 张散图 PNG 占 5.3MB 主体）。首包达标依赖 **PNG 压缩 + 区域懒加载 + 对象池** 三件套；若美术线持续塞未压缩散图，预算必爆——需与美术线约定出图压缩/图集工作流（已在 S4 标注协调点）。

---
*文档状态：v1（规划评审稿）。下一步：主理人确认 S1 抽取范围与 sim 阈值初值后，进入实现。*
