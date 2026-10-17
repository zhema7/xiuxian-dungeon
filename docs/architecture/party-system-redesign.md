# 队伍系统重做设计（Party System Redesign）

> 版本：v1.0（设计冻结稿）
> 日期：2026-09-09
> 决策依据：主理人 2026-09-09 选定「方案 C —— 统一 `PartyMember[]` 模型，取代三份并存」
> 适用代码基线：`SAVE_VERSION = 11`（`src/state.ts:189`）、产品版本 v0.7
> 状态：**待主理人签收 → 签收后方可动代码**（遵守「设计文档钉死后再实现」红线）

---

## 0. 结论先行

| 项 | 内容 |
|---|---|
| **问题** | v0.7 没有组队系统，只有三条互不相通的伴随线，其中大世界组队链路在最后一米断裂（邀了人进本不参战） |
| **方案** | 引入唯一真源 `state.party: PartyMember[]`，把三种伴随统一为「队员」，旧字段降级为只读兼容层 |
| **破坏性** | 是。`SAVE_VERSION` 11 → **12**，所有旧档走 `migrate()` 重建，需在迁移内合成 party |
| **玩家可见收益** | ①组队 NPC 真正参战 ②队伍可扩到 2 修士 + 1 灵兽 ③能受伤、会倒下、会离队 ④有队伍面板可管理 |
| **不做（本期）** | 队员独立装备页 / 功法配置 / 阵型站位 —— 列为 P2、P3，见 §7 |

---

## 1. 现状三条线（已 code-truth 核对）

### 1.1 线 A：洞府道友（`companion: boolean`）

| 事实 | 位置 | 备注 |
|---|---|---|
| 字段声明 `companion: boolean` | `src/state.ts:48` | 布尔，**无等级/无血量/无装备** |
| 入队写入 `state.companion = true` | `src/scenes/TownScene.ts:742` | 唯一写入点；条件 NPC `sister`（陆青鸢）好感达标，`TownScene.ts:368` 出「结伴同行」选项 |
| 参战生成 `new Ally(...)` | `src/scenes/DungeonScene.ts:419-423` | 硬编码单人；`private ally: Ally \| null`（`:151`）是单值不是数组 |
| 职业取反 `sword ? fairy : sword` | `src/scenes/DungeonScene.ts:420` | ❌ 现有 5 套职业动画（sword / fairy / sword_new / fairy_new / mage），后三者全落到 `sword`，已与职业体系脱节 |
| 战力 `attackMult = 0.8` | `src/entities.ts:478` | 固定，不可成长 |
| 不受伤害 | `src/entities.ts:473` 注释「灵体护体不受伤害」 | 类内无 hp / takeDamage，实为永动炮台 |
| **无法解散** | 全项目检索 | 只有 `TownScene.ts:742` 置 true，**无任何处置 false** |

### 1.2 线 B：大世界组队 NPC（`activeCompanionNpcId: string | null`）— **断链**

| 事实 | 位置 | 备注 |
|---|---|---|
| 字段声明 | `src/state.ts:138` | 与 `companion` 完全独立，两者互不同步 |
| 三个 API 已实现 | `src/secret-realm.ts:205-230` | `canBringNpcToRealm` / `bringNpcToRealm` / `dismissCompanion` |
| UI 入口「邀入队伍」 | `src/scenes/WorldScene.ts:2816-2817` | 条件：好感 ≥ 50 且当前无组队 NPC |
| 秘境口显示 + 「让 XX 等候」 | `src/scenes/WorldScene.ts:3646-3673` | UI 完整可用 |
| **传递时被丢掉** | `WorldScene.ts:3686` 写入 registry → `DungeonScene.ts:649-650` 只读 `realmName` | ❌ **`companionNpc` 字段无人读取**，组队的 NPC 进本后不出现、不参战、不加成、不结算 |
| `dismissCompanion` 是死函数 | `src/secret-realm.ts:227` | 全项目零调用；`WorldScene.ts:3715` 直接 `= null` |

### 1.3 线 C：灵兽（`activePetUid: string | null`）— 第三套管理

| 事实 | 位置 | 备注 |
|---|---|---|
| 字段声明 | `src/state.ts:109` | 与上述两条又是一套 |
| 参战跟随 + 自动索敌 | `src/scenes/DungeonScene.ts:4594-4623` | **真参战**，`dealDamage(..., 0.6, ...)`（60% 战力，冷却 800ms） |
| 无统一队伍概念 | — | 不能受伤（beast 有 hp 字段但未参战消耗） |

### 1.4 当年规划对照（`docs/01-项目策划方案.md:185` §8.3）

| 规划条目 | 落地情况 |
|---|---|
| 最多携带 **2 名** NPC 伙伴 | ❌ 实际各线各 1，且互不通用 |
| 伙伴有**独立等级** | ❌ |
| 伙伴有**装备页** | ❌ |
| 伙伴有**功法配置** | ❌ |
| 伙伴重伤则本局离队、回洞府休养 | ❌（道友干脆不受伤） |

> `docs/v0.7版本说明.md` 全文未提组队；`index.html` 无队伍管理面板。

---

## 2. 目标模型：`PartyMember[]`

### 2.1 类型定义（新增 `src/party.ts`）

```ts
/** 队员来源：决定外观、羁绊口径与 UI 分组 */
export type PartySource = 'sectSibling' | 'worldNpc' | 'beast'

/** 队员种族大类：决定能否装备 / 能否学功法 / 消费哪套数值 */
export type PartyMemberKind = 'cultivator' | 'beast'

/** 出战状态 */
export type PartyMemberStatus = 'active' | 'reserve' | 'downed'

export interface PartyMember {
  /** 队内唯一 ID，形如 pm_<source>_<npcId|beastUid> */
  uid: string
  kind: PartyMemberKind
  source: PartySource
  status: PartyMemberStatus

  // ---- 身份 ----
  displayName: string
  /** 修士：proceduralNpc.id；灵兽：beast.uid。source='sectSibling' 时为 'sister' */
  refId: string
  /** 修士外形与近/远战判定 */
  classId: string

  // ---- 数值（独立成长，P1 只做等级，P2 扩装备/功法）----
  level: number
  realm: number
  hp: number          // 当前气血
  maxHp: number
  attackMult: number  // 相对玩家 stats 的伤害倍率
  /** 承伤系数：0 = 灵体护体（维持 v0.7 陆青鸢手感）；1 = 正常承伤 */
  damageTakenRatio: number
  /** 灵兽专用：速度倍率，影响跟随/追敌移动速度 */
  speedMult: number

  joinedAt: number    // 时间戳，UI 排序用
}
```

**关键设计取舍**

| 取舍点 | 决策 | 理由 |
|---|---|---|
| 灵兽要不要进同一数组？ | **进**（`kind='beast'`） | 否则仍是「两套队伍」，不符方案 C 初衷；且 DungeonScene 可统一遍历 |
| `attackMult` 还是独立 atk？ | **保留倍率模型** | 现有 `dealDamage(target, mult, stats, ...)` 就是倍率语义，改动面最小；P2 再换独立数值 |
| 道友「灵体护体」还留不留？ | **留，但参数化为 `damageTakenRatio`** | 统一模型（都有 hp、都能死），同时保住 v0.7 既有手感不引发体感回退 |
| 装备/功法本期做不做？ | **不做**，列 P2 | 独立装备页涉及 item 池/槽位/序列化，硬塞进 P1 会让迁移风险翻倍 |

### 2.2 出战名额（`PARTY_RULES`）

```ts
export const PARTY_RULES = {
  maxActive: 3,          // 总出战位
  maxCultivator: 2,      // 其中修士最多 2（对齐 GDD §8.3 "2 名伙伴"）
  maxBeast: 1,           // 灵兽最多 1
  slotByIndex: [         // DungeonScene 生成时的站位偏移（相对玩家）
    { dx: -20, dy:  10 },
    { dx:  20, dy:  10 },
    { dx:   0, dy:  26 },
  ],
  downedReviveRatio: 0.3, // 倒地后恢复到 30% 气血
}
```

> `maxCultivator = 2` 直接落实当年 §8.3 的规划；线 A 的道友与线 B 的组队 NPC 可以同时出场。

---

## 3. 旧三字段的去留（兼容策略）

| 旧字段 | 处置 | 说明 |
|---|---|---|
| `state.companion: boolean` | **保留字段、降级为派生** | 不再作为真源。读取统一走 `hasActiveMember(state, 'sister')`；写入只在 TownScene 结伴时同步两侧（短期双写），P2 移除字段 |
| `state.activeCompanionNpcId: string \| null` | **同上** | WorldScene/secret-realm 内部改走 party；对外保留字段避免一次性炸串 |
| `state.activePetUid: string \| null` | **同上** | 灵兽面板仍读它，party 为出战真源，二者由 `syncPetSelection()` 单向对齐 |
| `secretRealmData.companionNpc` | **彻底作废** | 统一后 DungeonScene 直接读 `state.party`，registry 传参不再承载组队信息 |

> ⚠️ **双写窗口**：P1 期间旧字段与新 party 保持一致，由 `src/party.ts` 的 `syncLegacyFields(state)` 强制对齐（每次写 party 后调用）。这是为了让 UI 侧不必一次改完，降低风险。**禁止业务代码直接写旧字段。**

---

## 4. 存档迁移（破坏性变更，重点）

### 4.1 版本号

```
SAVE_VERSION: 11 → 12
```

**影响**：`loadGame` 判定 `parsed.version < SAVE_VERSION` → 走 `migrate(raw)`（`src/state.ts:745`）。而 `migrate()` 是 **`newGame()` 重建 + 逐字段拷贝**（`src/state.ts:452-577`），**任何没显式拷贝的字段都会静默丢失**。因此必须在 `migrate()` 内增加 party 合成，同步检查其余字段无遗漏。

### 4.2 迁移函数：`partyFromLegacy(raw)`

```ts
/** 由旧三字段合成 party；幂等，重复调用不产生重复成员 */
export function partyFromLegacy(raw: Record<string, unknown>): PartyMember[] {
  const out: PartyMember[] = []
  // 1) 洞府道友 → source='sectSibling'，damageTakenRatio=0（保住灵体护体手感）
  if (raw.companion) out.push(makeCultivator('sister', '陆青鸢', pickCounterClass(raw.classId), 0, 0.8))
  // 2) 大世界组队 NPC → source='worldNpc'，damageTakenRatio=1
  if (typeof raw.activeCompanionNpcId === 'string') {
    const npc = (raw.proceduralNpcs as ProceduralNpc[] ?? []).find(n => n.id === raw.activeCompanionNpcId)
    if (npc) out.push(npcToMember(npc, raw))
  }
  // 3) 灵兽 → kind='beast'
  const uid = raw.activePetUid
  if (typeof uid === 'string') {
    const b = (raw.beasts as Beast[] ?? []).find(x => x.uid === uid)
    if (b) out.push(beastToMember(b))
  }
  return enforceRules(out)
}
```

**迁移矩阵（必须全部覆盖）**

| 旧档情形 | 迁移后 party | 备注 |
|---|---|---|
| `companion=true, 无其他` | `[sister]` | 最常见，绝大多数老存档 |
| `activeCompanionNpcId='xxx'` | `[worldNpc:xxx]` | 组队 NPC 若已陨落则丢弃 |
| `activePetUid='bbb'` | `[beast:bbb]` | |
| 三者全有 | `[sister, worldNpc, beast]` | 正好 3 席满员，符合 §2.2 上限 |
| 全空 | `[]` | |
| NPC 已陨落 / 灵兽已丢失 | 跳过该条 | **不产生幽灵队员** |

### 4.3 校验义务

- `tests/` 需补：`legacy → v12` 往返；三种来源组合；幽灵引用（NPC 死/兽丢）不入库；重复幂等。
- `npm run validate:data` 与 `npx tsc --noEmit` 必须双绿才可签收。

---

## 5. 战斗规则变更

### 5.1 DungeonScene 改造

| 现状 | 改后 |
|---|---|
| `private ally: Ally \| null`（`:151`） | `private allies: Map<string, Ally>` |
| 单人硬编码生成 `:419-423` | 遍历 `state.party.filter(status==='active')`，按 `PARTY_RULES.slotByIndex` 落位 |
| 职业取反 `:420` | 取 `member.classId`；若为残缺值则 `normalizeClassId()` 归一到现有 5 套之一 |
| 攻击倍率固定 0.8 | `member.attackMult`（P1 默认：道友 0.8 / 组队 NPC 按等级 0.5~1.2 / 灵兽 0.6） |
| 无受伤 | Ally 增 `hp / maxHp / takeDamage()`；受击时按 `damageTakenRatio` 折算，0 则免伤 |
| 无离队 | `hp<=0` → `status='downed'`，销毁 sprite，UI 提示「XX 已力竭退回」；本局结束统一按 `downedReviveRatio` 复原为 `reserve` |

### 5.2 敌怪是否攻击队员

**P1 决定：敌人不主动索敌队员**（保持现有怪物 AI 只打玩家，避免推倒 Quest enemy targeting）。但队员会被 **AOE / 溅射 / 范围技能** 波及（`damageTakenRatio` 生效）。

> 理由：改敌人 AI 是独立高风险项；先用 AOE 承伤让「会死」这件事成立，即可兑现 GDD §8.3 的「重伤离队」。敌人主动索敌队员列为 P2。

### 5.3 经验与成长

- 队员参与击杀 → 按玩家获得经验的 **50%** 累积到 `member.level`（P1 仅等级，不改 maxHp/attackMult 之外的派生物）
- 升级公式：`attackMult += 0.02`、`maxHp += 20`（每级），上限 `attackMult ≤ 1.3`
- **P2** 再做完整成长曲线 + 装备/功法

---

## 6. 三个入口改写

| 入口 | 现状 | 改后 |
|---|---|---|
| **TownScene 结伴同行** `:368 / :726-742` | `state.companion = true` | `addPartyMember(state, makeCultivator('sister', ...))`，再 `syncLegacyFields()`；派生出可「暂离」选项（解开「无法解散」缺陷） |
| **WorldScene 邀入队伍** `:2816 → :3543` | `bringNpcToRealm()` 写 `activeCompanionNpcId` | `canBringNpcToRealm` 改为校验 `countActiveCultivators(state) < 2`；成功后写 party |
| **WorldScene 让 XX 等候** `:3673 → :3715` | 直接置 null | `removePartyMember(state, uid)`，`dismissCompanion` 死函数转正 |
| **灵兽出战** | `activePetUid` | `setActiveBeast(state, uid)`，内部同步 party 的 beast 成员 |
| **DungeonScene 读本数据** `:649-650` | 只读 `realmName` | 不再依赖 registry 传递组队；统一读 `state.party` |

### 6.1 队伍面板（新增）

在 `index.html` 增加**队伍面板**，提供：

- 成员卡片：头像 / 姓名 / 来源标签 / 等级 / 气血条 / 出战状态
- 操作：**出战 ↔ 待命**、**暂离（移除）**
- 名额提示：`出战 2/3（修士 1/2，灵兽 0/1）`

> 入口位置 **待主理人指定**（建议：洞府 TownScene + 大世界 WorldScene 各一个入口，共用一个 DOM 面板）。

---

## 7. 分阶段路线图

| 阶段 | 范围 | 增量产出 | 风险 |
|---|---|---|---|
| **P1（本次）** | §2 模型 + §3 兼容 + §4 迁移 + §5.1/§5.3 + §6 三入口 + §6.1 面板 | 组队真正生效、统一模型、可管理、会受伤会离队 | 中（存档破坏性） |
| **P2** | 独立装备页 + 功法槽、敌人主动索敌队员、XP 曲线完整化、移除旧三字段 | 落实 GDD §8.3 全部条款 | 中 |
| **P3** | 阵型站位、阵法（`formation-data.ts`）联动、羁绊加成、队员剧情 | 深度养成 | 高 |

---

## 8. 验收清单（签收前置）

- [ ] `SAVE_VERSION = 12`，`migrate()` 内 party 合成成立
- [ ] 老存档（companion=true）加载后洞府道友仍在，参战行为与 v0.7 一致
- [ ] WorldScene 邀 NPC → 进秘境 → **该 NPC 实际出现并输出伤害**（修复断链）
- [ ] 灵兽出战仍正常，且同时可带 2 修士（共 3 单位同屏）
- [ ] 队员可被 AOE 打死后离队，本局结束复原 30%
- [ ] 队伍面板可出战/待命/暂离
- [ ] `npx tsc --noEmit` = 0
- [ ] `npm run test` 全绿（含新增 party 迁移测试 ≥ 6 例）
- [ ] `npm run validate:data` = 0
- [ ] 未改动任何掉落/经济/势力数值

---

## 9. 风险与双轨备选

| 风险 | 影响 | 缓解 / 备选 |
|---|---|---|
| **存档迁移丢字段**（`migrate()` 是 newGame 重建模式） | 老玩家丢进度 | P1 落地前对 `migrate()` 做全字段 diff 复核；产出 `docs/qa/` 迁移用例表。**备选**：不 bump 版本，改为「首次读档时惰性合成 party」（`version===11` 时 `normalizeGameState` 内补齐），风险更低但违反既有版本治理约定 |
| UI 面板入口位置未定 | 交互不统一 | 双入口共用同一 DOM 面板组件 |
| 「道友灵体护体」与新「会受伤」冲突 | 老玩家体感回退 | 参数化为 `damageTakenRatio`，道友保持 0 |
| 修士职业只有 5 套动画，多个队员可能同外形 | 视觉重复 | `pickCounterClass()` 优先选玩家未使用的职业；不足时允许重复（P2 补差异化染色） |

---

## 10. 决策请求

> **2026-09-09 主理人指令「按 C 进行」= 批准执行。以下 4 项按推荐项默认落地（可回滚）：**
>
> | # | 决策 | 落地选择 |
> |---|---|---|
> | 1 | SAVE_VERSION | **bump 至 12，接受破坏性迁移**（并额外增加 §9 备选的惰性回填作为双保险） |
> | 2 | 出战名额 | **2 修士 + 1 灵兽**（`PARTY_RULES`） |
> | 3 | 道友承伤 | **保留 `damageTakenRatio=0`**，其余队员正常承伤 |
> | 4 | 面板入口 | **A. 洞府 + 大世界双入口** |

---

## 11. 实现记录（P1，2026-09-09）

| 层 | 改动 | 位置 |
|---|---|---|
| 核心 | 新增统一模型与全部纯函数（去重/名额/承伤/成长/迁移/旧字段同步） | `src/party.ts`（新建） |
| 状态 | `GameState.party: PartyMember[]` 真源；`SAVE_VERSION` 11→**12**；`migrate()` 内合成 party；`normalizeGameState()` 双保险惰性回填 | `src/state.ts` |
| 实体 | `Ally` 支持多实例、`hp/maxHp`、`takeDamage()`、`damageTakenRatio`、`speedMult` | `src/entities.ts` |
| 战斗 | `private allies: Map<string, Ally>` 取代单值 `ally`；`spawnPartyAllies()` 按 `PARTY_RULES.slotOffsets` 落位；`damagePlayer()` 内挂 `splashAllies()` 溅射承伤；`grantPartyExp()` 分享经验；`onDeath()` → `settlePartyAfterRun()` 结算 | `src/scenes/DungeonScene.ts` |
| 入口 A | 结伴 → `addMemberToState`；新增「暂别同行」；新增队伍管理面板 | `src/scenes/TownScene.ts` |
| 入口 B | `canBringNpcToRealm/bringNpcToRealm/dismissCompanion` 全部改写至 party（修复死函数）；秘境面板显示全队并新增「队伍」入口 | `src/secret-realm.ts`、`src/scenes/WorldScene.ts` |
| 入口 C | 出战灵兽统一走 `setActiveBeast()`（含收回/放生） | `src/scenes/SectScene.ts` |
| 测试 | 新增 40 项单测（含 v11→v12 迁移 6 种形态、幽灵引用、关键修复回归） | `tests/party.test.ts` |

**与设计的偏差（已记录）**

- §6.1 的队伍面板本期**不新增 index.html DOM 面板**，改由现有 `showDialog` 复用实现（洞府 NPC 交互 + 大世界秘境面板双入口）。功能等价，避免引入新 UI 组件风险；若需常驻面板可于 P2 补。
- §5.3 灵兽未走 `Ally` 渲染管线，保留原有 `petSprite` 表现，仅由 party 统一管理出战/承伤/战力倍率——**管理已统一，渲染暂分轨**（P2 合并）。

**验收结果**

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 0 |
| `npm run validate:data` | ✅ 0（5 职业/22 怪物/63 装备/10 词缀/67 功法/9 天赋/30 v4Kit） |
| `tests/party.test.ts` | ✅ 40/40 |
| 全量回归 | ✅ **599 passed / 5 failed —— 与 HEAD 基线完全一致，零回归**（5 项既有失败：asset-manifest 3 + state.test.ts 2，属 PRESET_COUNT=6 等遗留问题，非本次引入） |

---

## 12. 实现记录（P2，2026-09-09 · 补齐 GDD §8.3 全部条款）

| 条款 | 改动 | 位置 |
|---|---|---|
| 独立装备页 | `PartyMember.equipment` 四槽（武器/头/甲/靴，无饰品槽）；装备从**玩家行囊共享池**授予，卸下即退回行囊，不产生复制 | `src/party.ts` `MemberEquipment` / `equipMemberItem` / `unequipMemberSlot` / `normalizeMemberEquipment` |
| 装备生效 | 攻 → `flatAtk` 直接加在玩家攻击之上；防 → 半值减伤；气血 → `effectiveMaxHp`；速 → `effectiveSpeedMult` | `src/party.ts` `memberEquipBonus`；`src/entities.ts` `Ally.flatAtk/def`；`src/scenes/DungeonScene.ts` `dealDamage(..., flatAtk)` |
| 独立功法槽 | `PartyMember.skillSlots` 四槽（招式/心法一/心法二/神通），与玩家**共享已习得功法池、不独占**；同功法不得占两槽（装配前先清其它槽） | `src/party.ts` `MemberSkillSlots` / `getMemberSkillSlot` / `setMemberSkillSlot` |
| 敌人主动索敌队员 | `CombatCtx.damageTarget` 新增；每帧为敌人挑目标：**玩家享 15% 距离加权**（队员需近出 15% 以上才改锁，避免抖动），锁定半径 260；`damageTakenRatio=0` 的灵体护体者**不可被锁定**；敌人投射物也能命中队员，避免远程改锁后弹道白飞 | `src/entities.ts`；`src/scenes/DungeonScene.ts` `applyEnemyTarget` / `damageAlly` |
| 灵兽并入 Ally 管线 | `Ally` 增 `kind:'beast'` 分支（图集/动画/缩放）；`spawnPartyAllies()` 统一生成修士 + 灵兽；删除 `petSprite`/`petBeast`/`petAtk`/`petCdUntil` 旧路径；队员头顶名牌跟随移动 | `src/entities.ts`；`src/scenes/DungeonScene.ts` |
| 彻底删除旧三字段 | `companion` / `activeCompanionNpcId` / `activePetUid` 从 `GameState` 摘除；读写点改由 `hasSectSibling` / `activeCompanionRef` / `activeBeastRef` 三个查询函数承担；`syncLegacyFields` 删除 | `src/state.ts`、`src/party.ts`、三个场景 + `secret-realm.ts` |
| 常驻队伍面板 | `openPanel` 新增**「队伍」页签**（常驻，背包面板内随时可达）；左列成员列表 + 右侧装备/功法分页，全部复用 `compare-grid`/`compare-item`/`q*`/`sub`/`dim`/`equipped-tag` 既有样式类 | `src/ui.ts` `renderPartyTab` / `wirePartyEvents` |

**SAVE_VERSION 未 bump（仍为 12）**：删除的是三个派生存字段，v12 存档的 party 真源不受影响；`partyFromLegacy()` 仍从旧档 raw 读取三字段用于 v11 及以下迁移，行为不变。

**关键行为变更（需知会）**

- 灵兽原本无敌（无血量逻辑），现并入 Ally 后**可承伤、可力竭退场**。本局力竭后自动归队（不改为待命），玩家主动收回仍按待命处理。
- 修士队员原本只吃溅射伤害，现**会被敌人主动锁定**。陆青鸢保留 `damageTakenRatio=0`，敌人对她无从下手，手感不回退。

**验收结果**

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 0 |
| `npm run validate:data` | ✅ 0 |
| `tests/party.test.ts` | ✅ **50/50**（新增 10 项：装备加成/槽位读写/脏数据规范化/索敌判定） |
| 全量回归 | ✅ **609 passed / 5 failed —— 与 HEAD 干净基线逐条同名比对，零回归**（5 项既有失败：asset-manifest 3 + state.test.ts 2，均为 `PRESET_COUNT=6` 遗留问题） |

**仍属 P3 的开放项**

- 队员装备的套装效果（当前只计基础数值，不触发 2/4 件套装加成）
- 队员天赋树（GDD §8.3 未要求，暂不立项）
- 队员装备的强化/精炼（当前沿用玩家强化后的数值，面板内不提供二次强化入口）

*P2 收口。GDD §8.3 的「独立等级、独立装备页、独立功法配置、重伤离队」四项已全部落地。*
