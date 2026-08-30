# 程序随机套装系统（PRS）技术方案

> 状态：`schemaVersion === 2` 的 P0 存档边界修复已实施（严格规范化与针对性回归用例均已落地），但**发布状态为 NO-GO**。  
> 工程证据（不等同于 QA 或发布签收）：`npm run validate:data`、`npm run typecheck` 已通过；单 worker Vitest 为 **9 files / 92 tests passed**。  
> 默认并行 `npm test` 曾在历史／环境复现中出现 Vitest file-parallel module-graph 分裂；根因仍由 Task #6 调查，单次并行绿不能关闭该发布前置。标准 `npm run build` 仍在 `dist/` 清理的 WorkBuddy `safe-delete` 确认阶段 **BLOCKED**。  
> 两次使用全新独立 `--outDir` 的 Vite 构建成功，仅证明技术可行性；它们不能替代标准构建、运行时 QA 或发布负责人签收。  
> 范围：在既有 Phaser 3.90 + TypeScript 运行时中，为「机缘套装」补齐可复现随机生成、独立招式/神通命名、受约束的行为组合、模块化 VFX 路由与存档兼容。  
> 非目标：不修改既有官方套装、测试套装或既有攻击/神通模式的战斗语义；不引入脚本解释器或新战斗机制。

---

## 1. 已确认的集成边界

| 责任 | 现有接缝 | PRS 接入方式 |
|---|---|---|
| 生成与内容注册 | `src/lore.ts::genDynamicSet/registerDynamicContent` | 保持旧入口可用，新增带显式种子的生成入口与记录规范化。 |
| 存档 | `src/state.ts::dynamicSets/dynamicSkills` | `SAVE_VERSION` 升级；旧记录按兼容路径规范化、再注册；无效记录隔离而非影响整档。 |
| 套装变身 | `src/effects.ts::resolveAttackMode/resolveSetArtOverride` | `SetBonus` 增加可选生成招式/神通显示名和 VFX recipe；官方套装缺字段时维持原有默认。 |
| 神通展示 | `src/art-cast.ts::resolveEffectiveArtCast` | 套装覆写可携带生成神通名；没有名字时回退到既有 `ART_MODE_NAMES`。 |
| 场景执行 | `src/scenes/DungeonScene.ts` | 仅在既有模式执行前/神通施放时调用 `playProceduralVfx` 路由有限 recipe；它复用模块化动画键契约，伤害、投射物、冷却分支不改。 |
| VFX | `src/procedural-vfx.ts`、`src/fx/modularFx.ts` | 当前正式 recipe 仅使用既有 `rune/blade/burst/charge/hit` 动画；不使用 `field`，因为持久 `mod_field` 循环/生命周期尚未实现。recipe 是有限白名单，不接受存档中的任意资源 key。 |

## 2. 已交付范围与 Task #20 边界

- **当前已交付且有验证证据的范围**：显式 seed 驱动的确定性生成、中文招式/神通命名、版本化存档记录，以及攻击/神通 VFX 路由；后者只覆盖四个已实现并复用既有战斗分支的有限变身族：飞剑 `flying_sword_burst` / `sword-comet`、冰环 `frost_nova_burst` / `frost-bloom`、雷链 `thunder_chain` / `thunder-sigil`、巨剑 `giant_sword` / `giant-crest`。
- **未交付范围**：GDD 所述更广泛、彼此独立的九族完整程序化战斗语法。这是后续 Task #20 的工作，不在当前已实施系统或现有验证结论内。

## 3. 数据模型与版本策略

新生成的 `DynamicSetRecord` 持久化以下信息：

```ts
{
  schemaVersion: 2,
  generation: {
    generatorVersion: 1,
    seed: 1234567890,
    sequence: 3,
    theme: "紫灵",
    profileId: "tianjie-chuanlei",
    move: { id, name, mode, behavior },
    art: { id, name, mode, behavior },
    vfxRecipe: "thunder-sigil"
  },
  set: { /* 已完整落盘的 SetDef */ },
  bases: [ /* 已完整落盘的 ItemBase */ ]
}
```

- **存档内容为权威副本**：种子用于审计、重放和测试；加载时不依据当前词库重掷，防止补丁改变旧装备。
- **生成器版本化**：当前仅接受 `generatorVersion: 1`。未来词池、权重或数值规则升级时，必须先交付相应的 validator／migration 分支并保留旧记录的已落盘结果；仅提升常量会使新版本记录被当前严格边界隔离。
- **旧记录兼容**：只有**完全不存在 `schemaVersion` 属性**的历史 `{ set, bases }` 记录才视作 legacy；它们仍须通过既有结构与运行时安全白名单检查后才可注册。
- **无效记录隔离**：加载时过滤未知模式、未知 VFX recipe、非法槽位和重复动态 ID；不能覆盖 `SETS`/`ITEM_BASE_MAP` 内的官方或测试内容。

### schema 判别与严格隔离边界（P0 已实施）

- **legacy 路径仅限属性缺失**：`Object.prototype.hasOwnProperty.call(record, 'schemaVersion')` 为 false 才能走 legacy。显式 `schemaVersion: undefined` 不是 legacy。
- **current schema 必须整体严格验证**：`schemaVersion === 2` 的记录要求顶层、`generation`、`set`、2 件／4 件 bonus 与四个 `bases` 的字段集合和交叉关系全部成立。验证覆盖 `generatorVersion`、32 位 `seed`、`sequence ↔ set_dyN/base ID`、`profile ↔ theme/move/art/recipe`、受控命名、数值范围与取整、`fxTags === ['procedural_vfx']`、模式与 recipe 兼容性，以及四槽件完整对应。
- **显式 schema 不允许降级**：显式 `undefined`、未知版本、残缺或伪造的 schema 2 都隔离整条动态记录；不得删除字段、局部修补、读档重掷或降级为 legacy。合法同档记录与基础 `GameState` 继续加载。
- **双重入口防线**：`SAVE_VERSION = 5` 的当前读档与旧档迁移都会调用 `normalizeDynamicSetRecords()`；`registerDynamicContent()` 再次规范化。动态内容不得覆盖模块加载时冻结的静态／测试 `SETS` 和 `ITEM_BASE_MAP` ID 边界。

## 3. 随机但受限的行为语法

随机化不创造未经实现的机制。生成器先从白名单 `DynamicSetCombatProfile` 选择一条行为档案，再在主题、词缀、装备部位名称、招式名和神通名中取样。

| 行为档案族 | 攻击模式（既有） | 神通模式（既有） | 可用模块 VFX |
|---|---|---|---|
| 飞剑 | `flying_sword_burst` | `sword_fan` / `dageng` | `sword-comet` |
| 冰环 | `frost_nova_burst` | `thunder_strike` / `dageng` | `frost-bloom` |
| 雷链 | `thunder_chain` | `thunder_strike` / `dageng` | `thunder-sigil` |
| 巨剑 | `giant_sword` | `fire_rain` / `dageng` | `giant-crest` |

每条 profile 同时定义安全的 `attackMode + artMode + artPower + artCooldownMs + vfxRecipe`。因此随机内容只会复用 `DungeonScene` 已实现、已经过回归测试的战斗分支；不会让存档数据驱动任意代码、对象 key 或未知机制。

### 当前已交付范围与后续扩展

- **当前已交付（本 PRS）**：生成器只使用上表四个已验证变身家族——飞剑齐射、玄冰爆发、紫霄雷链、巨剑术——及其锁定的既有四种神通组合；正式 VFX recipe 仅为 `sword-comet`、`frost-bloom`、`thunder-sigil`、`giant-crest`。随机性体现在 seed/sequence、主题、中文招式与神通名称、词缀、已落盘结果和白名单 recipe；不创造新的战斗语义。
- **后续独立全语法（Task #20）**：扩展独立的完整 v2 程序化战斗语法／原型池是后续工作，不属于当前已交付 PRS。它在具备独立纯逻辑解算、场景适配、模拟器模型、白名单、回归测试和数值验收前，不得加入当前生成器候选池或对外表述为已实现。

## 4. 命名与展示

每套新记录生成一组独立的中文：

- **招式**：主题 + 行为词根 + 招式尾缀；落盘到 `SetBonus.attackName` 和 `generation.move`。
- **神通**：主题 + 意象词根 + 神通尾缀；落盘到 `SetBonus.artName` 和 `generation.art`。
- **说明文本**：仅输出中文语义、数值与上述命名，不泄露内部 `AttackMode`/`ArtMode` id。
- **施放按钮/提示**：神通覆写优先展示生成神通名；旧套装继续显示 `ART_MODE_NAMES`。

## 5. VFX 路由

`SetBonus.vfxRecipe` 是枚举值，而不是文件名。`effects.ts` 只从当前实际胜出的攻击覆写中解析 recipe；若混穿套装发生优先级竞争，VFX 始终与 `resolveAttackMode()` 选中的模式一致。

场景层通过 `playProceduralVfx()` 将 recipe 映射到静态模块步骤表，并直接创建／播放对应的 `mod_<kind>` 动画；动画或首帧纹理未注册时，该步骤安全跳过。`playModularOnce()` 仍服务于旧效果标签分支，但不是当前 PRS recipe 的直接调用链。这确保：

1. 不新增或依赖未交付素材；
2. 不使用旧 `test_*` 标签作为正式随机内容；
3. 官方套装仍走既有 `fxTags` 分支；
4. 未注册动画／纹理时 `playProceduralVfx()` 只降级该步骤的视觉，不影响战斗结算。

## 6. 验证矩阵与发布证据边界

| 风险／门项 | 证据路径 | 当前证据状态 |
|---|---|---|
| P0：种子可复现、中文展示与行为白名单 | `tests/procedural-random-sets.test.ts`、`tests/dynamic-attack-mode.test.ts` | 覆盖 seed replay、受限攻击／神通／recipe、中文名称与内部 ID 不泄露；单 worker 通过。 |
| P0：current-schema 伪造或降级绕过 | `tests/procedural-random-sets.test.ts` | 覆盖缺失／伪造 `generation`、sequence/profile/recipe 不匹配、bonus／base 篡改、显式 `undefined`、未知 schema、valid v2、64-record corpus 与 v5 load 隔离；单 worker 通过。 |
| P0：legacy 兼容与静态边界保护 | `tests/procedural-random-sets.test.ts`、`src/lore.ts::normalizeDynamicSetRecords/registerDynamicContent` | legacy `{ set, bases }` 可继续加载；显式 schema 不降级；静态 ID 碰撞与非法动态记录隔离；单 worker 通过。 |
| P0：VFX／模式错配及混穿 | `tests/procedural-random-sets.test.ts`、`tests/modular-fx.test.ts`、`tests/set-art-override.test.ts` | 覆盖 recipe 兼容、胜出覆写与缺资源安全降级的纯逻辑边界；单 worker 通过。 |
| 默认并行测试稳定性 | `npm test`（不附加单线程参数） | 历史／环境复现仍有 Vitest file-parallel module-graph 分裂，Task #6 调查中。单次并行绿只是一条瞬时工程证据，不能关闭稳定性或发布前置。 |
| 标准发行构建 | `npm run build` | **BLOCKED**：Vite 在完成 transform 后，`dist/` 清理由 WorkBuddy `safe-delete` 批量确认门拦截；这不是类型或 bundle transform 成功的替代结论。 |
| 独立输出目录构建可行性 | `npx vite build --outDir <fresh-dir>` | 两次 fresh outDir 构建成功，仅证明当前代码可构建；不替代标准 `dist` 构建、运行时 QA 或发布签收。两次均有 chunk 超过 1600 kB 的警告。 |

### 最终放行条件

最终放行必须同时满足：默认并行测试稳定性已复现、定位并以获批准的方式处理；标准发行构建在获授权的清理路径下完成；运行时／真机 QA 和发布负责人给出显式签收。本技术文档不代表任何 QA 或发布签收已完成。

## 7. 决策记录（ADR 摘要）

### ADR-PRS-001：使用「有限 profile + 显式元数据」而非自由文本/DSL

- **上下文**：需要随机性，但场景仅支持有限攻击、神通和特效分支。
- **备选**：A) 允许存档任意 mode/tag；B) 自研可执行 DSL；C) 有限 profile 白名单。
- **决定**：C。随机化在已实现的 mode、数值区间、词池和 recipe 内进行。
- **后果**：安全、可测试、可平衡；新增真正的新机制仍须先实现引擎分支并加入 profile 白名单。

### ADR-PRS-002：落盘完整产物，种子仅作审计/重放

- **上下文**：词库与权重会随版本迭代，重掷会改变玩家已获得的套装。
- **备选**：A) 只存种子；B) 只存最终结果；C) 两者都存。
- **决定**：C。
- **后果**：存档略增大，但升级不会改写旧物；可以定位和复现实例。未来提升 `generatorVersion` 或存档 schema 前，必须先发布能识别旧／新记录的 validator／migration，不能仅修改版本常量。

### ADR-PRS-003：VFX recipe 枚举化

- **上下文**：动态内容来自存档，不能允许任意动画/资源 key。
- **备选**：A) 自由资源路径；B) 复用 `test_*` 标签；C) 白名单 recipe 映射既有 modular FX。
- **决定**：C。
- **后果**：新美术接入需增加一个 recipe 定义及测试，但不产生存档注入或静态内容串扰风险。

## 8. 程序员执行清单与已知工程风险

1. 新随机记录必须包含 `schemaVersion: 2`、`generation.seed` 与 `generatorVersion`。
2. 只能从 `DynamicSetCombatProfile`、`ProceduralVfxRecipe` 白名单生成行为。
3. 不修改 `sets.json` 中官方／测试套装的字段或 `fxTags` 行为。
4. legacy 回退仅适用于**不存在** `schemaVersion` 属性的记录；不得用显式 `undefined`、未知 schema 或删除 `generation` 绕过 current-schema 校验。
5. `schemaVersion: 2` 记录必须在注册前完成全量、交叉一致性验证；失败时隔离整条记录，不得局部修补、重掷或降级。
6. 当前读档、迁移和动态注册入口都必须规范化；动态内容不得覆盖冻结的官方／测试 `SETS` 与 `ITEM_BASE_MAP` ID 边界。
7. 升级 `generatorVersion` 或存档 schema 前，先交付对应 validator／migration、旧记录兼容用例和新旧版本交叉测试；不得只改版本常量。
8. 所有新增纯逻辑都写 Vitest：确定性、模式／recipe 约束、legacy 兼容、损坏隔离与 schema 降级拒绝。
9. 每次变更如实记录 `validate:data`、`typecheck`、单 worker 测试、默认并行测试、标准构建与 fresh outDir 构建的实际结果；失败、确认阻断或不稳定复现均是未关闭发布前置，不能由替代命令掩盖。

### 当前未关闭风险

- **P0｜发布证据未闭环**：默认并行 Vitest 的 file-parallel module-graph 分裂仍在调查；标准 `dist` 构建仍受环境 `safe-delete` 清理确认阻断。保持 NO-GO，单 worker 或单次并行成功均不构成放行。
- **P1｜性能／首包风险**：两次 fresh outDir 构建均警告单个 JS chunk 超过 1600 kB。它不否定 P0 schema 修复，但应进入后续代码分包／首包预算工作，不能写成无警告的构建全绿。
- **P1｜版本演进风险**：当前严格 validator 仅接受 `generatorVersion: 1`；未经对应 validator／migration 的未来版本记录会按设计被隔离。
