# 程序化随机套装 v4 — 工程架构决策记录（ADR）

> **版本**：v0.1（落盘草案，待主理人签收）
> **范围**：v4 三十套独立 Kit 的工程轨 —— `schema4` / `generator3` / typed executor / 资源 Manifest / 30 Kit 白名单 / 旧路由永久旁路
> **基线事实**：本文 file:line 均来自对当前代码的只读核对（见 §1）。本文件**只规划不实现**，不动代码。

---

## 1. 现状基线（只读核对）

| 项 | 现状 | 位置 |
|---|---|---|
| schema/generator 版本 | `DYNAMIC_SET_SCHEMA_VERSION = 3`、`DYNAMIC_SET_GENERATOR_VERSION = 2`；v2=2/1 | `src/lore.ts:204-207` |
| 生成 | `generateDynamicSetV3` 24 主题 × 8 固定 profile，4 件（weapon/head/armor/boots） | `src/lore.ts:352-434`；profiles `lore.ts:71-128`；themes `lore.ts:38-42` |
| 存档 | `SAVE_VERSION = 6`；load 时 normalize→register | `src/state.ts:54,182-214` |
| 归一化 | `normalizeDynamicSetRecords` 仅接受 legacy/v2/v3，显式拒绝其它 | `src/lore.ts:893-967`，schema 门 `951-955` |
| 注册 | `registerDynamicContent` 写入共享 `SETS`/`ITEM_BASE_MAP`/`ITEM_BASES`/`SKILLS` | `src/lore.ts:969-985` |
| 运行时分派 | `resolveAttackMode`（set→skill→默认）、`resolveSetArtOverride` | `src/effects.ts:341-349,472-489` |
| 套效果运行时 | `resolveSetEffectRuntime` 映射 fxTags→布尔 | `src/effects.ts:189-202`；tag 白名单 `170-173` |
| 4 件门 | `activeSetBonuses`（`SET_BONUS_MIN_PIECES=4`） | `src/effects.ts:141,284-299` |
| 攻击/神通分支 | DungeonScene `doAttack`（9 模式分支）、`castArt`（4 模式分支） | `src/scenes/DungeonScene.ts:868-1064,1366-1446` |
| 四 hook | `refreshSetFx` / `doAttack` / `castArt` / `update` | `DungeonScene.ts:150-160,868-874,1366-1446,1693-1701` |
| 资产注册轨 | BootScene `FX_ANIMS`→`SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS`→四层 | `src/scenes/BootScene.ts:31-46,63-68,115-155`；`src/fx/sequence-contract.ts:71-124` |
| 模块 FX | `playModularOnce` + 特征 flag（SWORD_SPLIT/FIRE_BURST/...） | `src/fx/modularFx.ts:175-193` |
| Palette V1 | 仅 schema v3/generator v2 + transformId 的动态套着色 | `src/palette-v1.ts:7-8,78-113` |
| validate 常量 | `ATTACK_MODES`(10)/`ART_MODES`(4)/`SET_EFFECT_TAGS`(9)/`MOD_KEYS`(12)/`SKILL_CLASSES`(sword/fairy/any) | `scripts/validate-data.mjs:12-24` |
| 既有帧池 | 13 组 / 82 通用帧（slash/sword_proj/fx_*/mod_*/bolt_fly/proj_fly） | `public/sprites/` |

---

## 2. v4 旁路缝（精确，不改动既有函数）

v4 必须在以下 8 处**分支旁路**，而非改动既有 v2/v3/legacy 函数。旧路由保持原样。

| # | 旁路点 | 既有实现（不改） | v4 做法 |
|---|---|---|---|
| S1 | `activeSetBonuses` | `effects.ts:284-299` 从 `SETS`/动态记录收 4 件 bonus | v4 Kit 走**独立 entry 列表**，不进同一 entry 池；在调用方加 v4 分支 |
| S2 | `resolveSetAttackSource`/`resolveSetArtSource` | `effects.ts:333-339` 按 attackMode/artMode 选最高件数源 | v4 用独立选择器，不共用 |
| S3 | `selectSetAttackSource`/`selectSetArtSource` | `effects.ts:325-331` 以 attackMode/artMode 为路由键 | v4 不以旧联合为唯一路由键，用 Kit id |
| S4 | `resolveAttackMode` | `effects.ts:341-349` set→skill→默认 | v4 不改此函数；场景层加 v4 gate，命中 v4 Kit 时走 v4 executor |
| S5 | `resolveSetArtOverride` | `effects.ts:472-489` 读 artMode/artPower/... | v4 用独立 art 解析器 + 独立 palette |
| S6 | `resolveSetEffectRuntime` | `effects.ts:189-202` fxTags→布尔 | v4 不复用 `SetEffectRuntime` 为唯一旗标；加 `KitFxRuntime` 独立结构 |
| S7 | `registerDynamicContent` | `lore.ts:969-985` 写共享 `SETS`/`ITEM_BASE_MAP` | v4 记录**不进共享 SETS**，用 v4 命名空间 `V4_KITS` 或独立注册器 |
| S8 | `normalizeDynamicSetRecords` | `lore.ts:893-967` 仅 legacy/v2/v3 | v4 记录用**独立 schema 版本门**（schema4/generator3），独立 normalize 路径 |

**资产注册旁路**：v4 Kit 帧走独立 `KIT_MANIFEST_REGISTRATION_CONTRACTS`（`sequence-contract.ts` 新增），不并入 `FX_ANIMS`/`SEQUENCE_RESOURCE_BUNDLE_REGISTRATION_CONTRACTS`（既有 82 帧池仅服务旧路由）。注入点：`BootScene.ts:63-68`（预加载）、`115-124`（完整性）、`143-155`（创建），各加 v4 独立循环。

---

## 3. 新增类型与接口（草案）

```ts
// src/data.ts —— 不改既有 AttackMode/ArtMode 联合，v4 原语独立枚举
export type KitPrimitive =
  | 'roundtrip' | 'refract' | 'mark' | 'fixedpoint'
  | 'thundernet' | 'thunderstake' | 'charge' | 'boomerang';

export type KitId = `k${string}`; // k01..k30，白名单

// v4 Kit 能力档案（固定，非随机）
export interface KitAbility {
  kitId: KitId;
  normalPrimitive: KitPrimitive;
  artPrimitive: KitPrimitive;
  element: string;        // 命名/调性，不引入克制
  artPower: number;       // 神通倍率
  artCooldownMs: number;
  // 数值参数由 typed executor 读取
}

// v4 资源 Manifest（每 Kit 独占帧，no-tint，不跨 Kit 借用）
export interface KitResourceManifest {
  kitId: KitId;
  icons: readonly string[];          // 4 件 32px 图标 key
  normalFrames: { start: string[]; main: string[]; mid: string[] };
  artFrames:    { start: string[]; main: string[]; mid: string[] };
  tintPolicy: 'no-tint';
}
```

- **typed executor**：以 `KitPrimitive` 为判别联合，每个原语一个分支函数，**禁 DSL / 禁自由字符串**。executor 输入 `KitAbility` + 战斗上下文，输出行为描述（不直接 mutate 场景，由场景适配层落地）。
- **30 Kit 白名单**：`V4_KIT_WHITELIST: readonly KitId[]`（k01..k30）；非白名单 id 一律拒绝进 v4 路由。
- **生成器 generator3**：从 32-bit 显式 seed + 序列号派生 Kit 选择（不引入 `Math.random`/`Date.now`）；生成结果为 v4 schema 记录。
- **schema4 记录**：`schemaVersion=4`、`generatorVersion=3`，含 `kitId`（白名单）、`seed`、`sequence`、`generation`；**不写** `attackMode`/`artMode`/`fxTags`（避免与旧联合耦合，满足 D8）。

---

## 4. 存档与确定性

- v4 记录用 `schemaVersion=4` 独立门（S8），与 v2/v3/legacy 隔离；`SAVE_VERSION` 是否 bump 至 7 待决（若 v4 记录进 `dynamicSets` 数组则须 bump + 迁移用例；若独立存 `v4Kits` 字段亦须 bump）。**建议**：独立 `state.v4Kits: V4KitRecord[]` 字段 + `SAVE_VERSION` bump 至 7，附迁移链测试（legacy→v5→v6→v7，未知高版本回退新游戏）。
- 确定性边界（D10）：`calcDamage`（`core.ts:38`）、掉落（`core.ts:146,195-201`）、`ui.ts:106` 用 live RNG。v4 只保证 **Kit 选择与生成**可复现（显式 seed），**不保证**全局战斗可复现。文档与对外描述不得宣称全局确定性。

---

## 5. 旧路由零回归校验

- `registerDynamicContent` 不得注册 v4 Kit 进 `SETS`/`ITEM_BASE_MAP`（S7）。
- `normalizeDynamicSetRecords` 的 schema 门（`lore.ts:951-955`）**不得**接受 `schemaVersion=4`（v4 走独立 normalize），防止 v4 记录误入旧池。
- `resolveAttackMode`/`resolveSetArtOverride`/`resolveSetEffectRuntime` 行为不变；既有 13 文件/138 测试须全绿。
- Palette V1（`palette-v1.ts:7-8`）只认 v3/v2，v4 Kit **不触发** Palette V1（v4 资产 no-tint）。

---

## 6. validate-data.mjs 同步与硬校验

- 新增 v4 Kit 白名单常量 `V4_KIT_IDS`（k01..k30）与 `KIT_PRIMITIVES`（8 原语）。
- 新增校验：Kit 定义文件（`src/data/v4-kits.json`）每条 `kitId∈白名单`、`normalPrimitive/artPrimitive∈8 原语`、`artPower/artCooldownMs` 在数值上限内。
- **原语计数硬校验**：脚本断言 30 Kit 的普攻原语分布 = §2 表（往返5/折射5/标记5/定点3/雷网1/雷桩2/蓄力2/回旋7）、神通原语分布 =（往返2/折射1/标记4/定点3/雷网5/雷桩5/蓄力4/回旋6），两侧各精确 30。不等则 `validate:data` 非零退出。这是 GDD §3 草案表回填的校验门。
- 不新增 `AttackMode`/`ArtMode`/`SET_EFFECT_TAGS` 值（v4 不复用旧联合，D8）。
- `SKILL_CLASSES` 不动（v4 Kit 不挂职业）。

---

## 7. 风险与待决

- **R1**：v4 Kit 不进共享 `SETS`，但掉落/装备/背包 UI 是否复用既有路径？需工程评估掉落链（`core.ts:rollSetPiece`）如何分发 v4 Kit。
- **R2**：typed executor 与场景适配层边界——executor 输出行为描述，场景适配层（DungeonScene 新增 v4 分支）落地。须防 executor 直接依赖 Phaser（保持可单测，沿用 `core.ts`/`effects.ts` 解耦原则）。
- **R3**：资产 1140 PNG 全缺，B1 须先用程序化占位帧（Graphics/静态）跑通轨，资产到位后切换，**不新增伤害/碰撞**。
- **R4**：雷网/雷桩持久实体须帧上限/数量上限，防爆栈/死循环（QA 门）。

---

*文档结束。主理人签收后，由本 ADR 派生 B1 基础设施实施：schema4 类型 → generator3 → typed executor → 资源 Manifest → 白名单 → 旁路缝 → 首个 Kit 垂直切片。*
