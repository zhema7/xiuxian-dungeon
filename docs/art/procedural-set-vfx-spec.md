# 随机套装 Palette V1 与程序化 VFX 实施规格

> 版本：v1.5
> 文档状态：**Palette V1 源码／自动化 P0：PASS（`sword_proj` P0 已关闭）／浏览器、手动 QA 与发布验收待签收**
> 范围：随机套装的 Palette V1 源码事实、现有序列帧的四层资源状态（磁盘／预加载／条件注册／浏览器播放）；其中序列帧源码合同必须分开记录“注册 bundle 前置”与“目标动画播放门禁”。范围还包括资源缺失时的安全降级，以及对应的可访问性、性能和验收合同。
> 本次边界：不新增或伪造图片资产；不构建、发布或提交；不修改静态套的既有视觉；不改变伤害、碰撞、投射物数量、冷却、敌人材质或敌人颜色。

---

## 0. 审计结论与事实边界

### 0.1 当前状态：四层资源事实

**四层必须分开：** ①磁盘文件存在；②BootScene 发起预加载；③满足注册 bundle 前置时条件动画注册；④浏览器真实实例播放。源码和文件系统可证明前三层，不能替代第四层。对已注册的目标动画，生产运行时 API `hasRegisteredSequenceAnimationPlayback()` 还会检查“目标动画已注册 + 该动画真实播放帧齐全”；它不等同于注册 bundle 1..8 前置。下表的“调用／route”只描述源码存在的门禁路径，**不等于浏览器已播放或 QA 已签收**。

| 项目 | 磁盘存在 | BootScene 预加载 | 条件注册与调用／route | 浏览器真实实例播放 |
|---|---|---|---|---|
| Palette V1 | 不适用（逻辑模块） | 不适用 | `src/palette-v1.ts` resolver 与攻击／神通独立来源调用已存在；仅合格 v3/generator v2 动态记录可得色板 | **待签收** |
| 静态套、v2、legacy | 不适用 | 不适用 | Palette resolver 对这些来源返回无覆盖，既有固定色路径保留 | **待签收；不得称重着色** |
| `slash_1..6` | 6 帧存在 | 请求 1..6 | 完整帧才注册 `slash_anim`（1..6）；`slashFx` 仅在 `hasRegisteredSequenceAnimationPlayback()` 确认目标动画已注册且播放帧 1..6 齐全时播放，否则静态回退 | **待浏览器签收** |
| `sword_proj_1..8` | 8 帧存在 | 请求 1..8 | bundle 1..8 是三段动画注册前置；目标动画播放由 `hasRegisteredSequenceAnimationPlayback()` 分别检查注册状态与真实播放帧完整性：`fly` 1..4、`loop` 3..4、`hit` 5..8。Palette V1 源码／自动化 P0 已 PASS，`sword_proj` P0 已关闭 | **浏览器真实播放待签收**；不得称已播放或发布可用 |
| `mod_*` | `mod_blade/burst/charge/field/hit/rune` 的声明帧存在 | 对应全帧请求 | 全帧才注册同名动画；`playModularOnce()` 以 `hasRegisteredSequenceAnimationPlayback()` 检查目标动画注册＋播放帧完整性；源码存在 `rune/charge/burst/hit` 调用 | **待浏览器签收** |
| `fx_ring_*` / `fx_splash_*` / `fx_spark_*` | `8 / 8 / 6` 帧存在 | 对应全帧请求 | 全帧才注册同名动画；`burstFx()` 仅在 `hasRegisteredSequenceAnimationPlayback()` 确认目标动画已注册且其播放帧齐全时创建并播放，否则静态＋补间回退 | **待浏览器签收** |
| `bolt_fly_1..8` | 8 帧存在 | 请求 1..8 | 全帧才注册 `bolt_fly`；玩家火弹与黄龙山火弹 route 均以 `hasRegisteredSequenceAnimationPlayback()` 检查目标动画注册＋播放帧完整性后选择，否则回退静态 `bolt` | **待浏览器签收** |
| `proj_fly_1..8` | 8 帧存在 | 请求 1..8 | 全帧才注册 `proj_fly`；敌方基础投射物 route 以 `hasRegisteredSequenceAnimationPlayback()` 检查目标动画注册＋播放帧完整性后选择，否则回退静态 `proj` | **待浏览器签收** |

**事实判定原则：** 当前工程不再将 `mod/fx/bolt/proj` 写作“完全未部署”；它们已有磁盘资源、BootScene 预加载、注册 bundle／完整帧条件注册、目标播放门禁和源码调用／选择逻辑。反之，这些源码与前三层事实仍不足以声明任何资源已在浏览器真实实例中播放、视觉可用、性能达标或已完成手工 QA。

### 0.2 实施与发布判断

- 当前自动化／源码质量门为 **PASS**（Palette V1 P0 与此前 `sword_proj` P0 均已关闭）；这不是浏览器、手动 QA 或发布签收。当前候选仍不是可发布状态，发布结论维持 **FAIL / NO-GO**。
- Palette、序列帧接入、Graphics 降级、模块资源接入和可访问性设置均须按本文件验收后才可升级状态。
- Palette V1 不新增部件、槽位、掉落或套装阶梯；随机套装仍固定生成 `weapon/head/armor/boots` 4 件，`charm1/charm2` 与 6 件内容仍不在本期范围。
- 缺失资源、未注册动画、颜色合同缺失、预算超限或 route 不可用时，只能降低附加表现；不得伪造投射物、命中、范围或伤害。

---

## 1. 目标、边界与术语

### 1.1 目标

1. 仅为合格动态 v3/generator v2 随机套使用 Palette V1：攻击、神通、投射物、子体、火弹与命中反馈分别沿各自胜出来源传播色板；不得把混穿简化成“同一随机套全链路同色”。
2. 以四层事实记录 `slash`、`sword_proj`、`mod`、`fx`、`bolt`、`proj`：先确认文件、预加载与条件注册，再由浏览器实测签收；缺帧、动画不可用或 route 不匹配时安全回退。
3. 取消大庚（`dageng`）中“所有随机套固定金黄”的旧规则；剑阵仍必须通过稳定几何、节点和方向保持可读。
4. 通过颜色以外的形状、运动、描边和中文行为语义保障可访问性。
5. 静态套、schema v2 与 legacy 不被重着色、不被重路由、不被本次改动改变表现。

### 1.2 表现层硬边界

- Palette V1 只作用于玩家来源的随机套表现层：攻击、神通、玩家投射物、玩家子体、玩家火弹及其命中视觉。
- Palette V1 **不得**修改敌人 sprite、敌人材质、敌人投射物、敌方预警、敌方血条、敌人状态色或敌人命中颜色。
- VFX 只消费战斗逻辑已创建并确认的对象与命中；不得创建子剑 / 火弹、改变其轨迹、生成额外碰撞或暗示不存在的伤害。
- 缺资源时不以无关元素资源、临时改色图片、全屏闪白或虚假飞行路径替代。
- 本文件是实施规格，不是当前运行时功能证明；所有“应”“必须”“目标”均需工程实现和 QA 实证。

### 1.3 术语

| 术语 | 定义 |
|---|---|
| 随机套 | 仅通过 v3/generator v2 资格与持久化 identity 校验的动态随机套可获得 Palette V1。 |
| 静态套 | 保留作者指定的现有颜色 / 表现的套装；Palette V1 必须旁路。schema v2 与 legacy 同样旁路。 |
| 攻击／神通根源 | 每次攻击与神通各自按独立胜出来源解析 Palette；混穿时不得借用另一通道颜色。 |
| 同源 | 同一个胜出能力来源及其真实派生对象形成的表现链；颜色相同不代表同源。 |
| 派生着色 | 子剑与受控首中火弹继承父攻击来源；神通投射物继承神通来源；不得二次随机或跨通道借色。 |
| Graphics 降级 | 使用引擎 Graphics 的几何轮廓、线段、弧形或节点绘制维持读法；不新建图片资产。 |
| 模块化资源 | `mod_*`、`fx_*`、`bolt_fly_*`、`proj_fly_*` 等序列资源。当前已存在预加载、注册 bundle／完整帧条件注册或调用路径的事实，不等于浏览器已播放。 |
| 注册 bundle 前置 | 创建某资源族动画所需的完整帧集；例如 `sword_proj_1..8` 必须齐全，才创建 `fly`、`loop`、`hit` 三段动画。它不是任一段的实际播放帧集合。 |
| 目标动画播放门禁 | 生产 API `hasRegisteredSequenceAnimationPlayback()`：确认指定目标动画已注册，且该动画真实播放帧齐全；例如 `sword_proj_fly` 仅检查 1..4、`loop` 仅检查 3..4、`hit` 仅检查 5..8。 |

---

## 2. Palette V1：主题族、稳定性与全链路合同

### 2.1 Palette 数据形态（当前源码事实）

Palette V1 是**运行时渲染信息**，不新增存档字段。当前 `src/palette-v1.ts` 只从通过资格校验的持久化 `identity.setId`、`identity.profileId`、`identity.transformId` 与 `generation.theme` 派生；固定算法版本为 `palette-v1`。不得从逐帧时间、投射物序号、敌人 ID、命中位置或每次施放的随机数重新抽色。

```ts
// 当前源码形态摘要；不是新的持久化 schema。
type PaletteV1 = {
  algorithmVersion: 'palette-v1'
  identity: { setId: string; profileId: string; transformId: string; theme: string }
  identityKey: string // palette-v1|setId|profileId|transformId|theme
  primary: number
  highlight: number
  darkOutline: number
}
```

- 家族索引由 `FNV-1a-32(identityKey) mod 8` 得到；当前为 8 个固定受控色板。
- 攻击与神通由各自独立胜出来源解析；子剑与首中火弹继承父攻击来源。不得因同套或同色而跨通道借色。
- 资格或 identity 交叉匹配失败时，resolver 返回无 Palette 覆盖；不得临时掷骰、猜测中性色或用其他套补色。
- 静态套、schema v2、legacy 直接旁路 Palette V1，维持其原始素材和作者颜色。

### 2.2 当前 8 个受控色板

| familyIndex | `primary` | `highlight` | `darkOutline` | 非颜色识别要求 |
|---:|---:|---:|---:|---|
| 0 | `#2D7F9D` | `#9AD7E6` | `#153F52` | 剑形、前进方向、短时序。 |
| 1 | `#3C70BD` | `#A9C9F5` | `#1C3A70` | 轮廓、方向和命中时序。 |
| 2 | `#6B5EB4` | `#C7BDF0` | `#342D68` | 轮廓、方向和命中时序。 |
| 3 | `#8A6098` | `#D8BFDC` | `#482C54` | 轮廓、方向和命中时序。 |
| 4 | `#A0684D` | `#E5BF9C` | `#5B3426` | 前核后尾、单向运动与轮廓。 |
| 5 | `#8C7A3E` | `#DED397` | `#4A401F` | 轮廓与节点；不等于固定金黄默认。 |
| 6 | `#397D6A` | `#9BD9C4` | `#1B4539` | 轮廓、方向和命中时序。 |
| 7 | `#547B98` | `#B5D1E4` | `#29465C` | 轮廓、方向和命中时序。 |

颜色使用规则：

1. `primary` 是主填充 / 主线色，`highlight` 仅用于内芯、端点或关键边缘，`darkOutline` 用于背景分离；当前代码不定义额外 `core/accent/trail/outline` 四角色字段。
2. 每个表现事件只使用其同源 Palette；不把多套主题色堆在同一个攻击上制造强度错觉。
3. 大庚（`dageng`）不得把 `#FFD54A` 或任何金黄色作为所有随机套的固定默认色；family 5 的色板也不构成全局默认。
4. 剑阵仍须由多边形闭合路径、顶点节点、线段方向、先成形后触发的时序辨认；颜色仅作辅助。
5. 不使用敌人已有颜色、敌方红色预警或敌方异常状态色来决定 Palette，也不向敌人对象写入 tint / material 参数。浏览器中的实际视觉效果仍待签收。

### 2.3 攻击、神通与派生对象的同源传播

攻击与神通**不共用一个整套根源**：当前 `resolveAttackPaletteV1()` 只取攻击胜出来源，`resolveArtPaletteV1()` 只取神通胜出来源。相同 `setId` 可以相同；混穿 A 攻击 + B 神通时则必须分别使用 A 与 B。任何派生对象不得因独立动画、二段效果或不同命中点重新抽取 family。

| 表现节点 | Palette 获取方式 | 必须遵守的规则 |
|---|---|---|
| 根攻击 | 由攻击胜出来源解析一次 | 一次施放期间固定；不按帧、按命中或按敌人重新选择。 |
| 根神通 | 由神通胜出来源解析一次 | 不读取攻击胜出来源；混穿时可与攻击色不同。 |
| `slash` 近战序列 | 继承根攻击 Palette | 仅在完整预加载帧＋条件注册＋`hasRegisteredSequenceAnimationPlayback()` 对 `slash_anim` 的播放门禁均满足时可走动画；否则静态／Graphics 降级。 |
| `sword_proj` 主投射物 | 继承根攻击 Palette | bundle 1..8 是三段动画的注册前置；各 route 再由 `hasRegisteredSequenceAnimationPlayback()` 检查目标动画注册＋对应真实播放帧（fly 1..4／loop 3..4／hit 5..8）。真实播放仍待浏览器签收。方向、寿命与碰撞完全跟随真实投射物。 |
| 剑阵 | 继承**神通**胜出来源 Palette | 不再锁金黄；必须保留稳定多边形、节点与方向读法。 |
| 子剑 | **继承父攻击 Palette** | 不能重新抽色；仅在战斗逻辑真实创建子剑时显示；不递归生成视觉链。 |
| 受控首中火弹 | **继承父攻击 Palette** | 不能强制橙红，也不能覆写敌人颜色；仅在真实火弹对象存在时显示。 |
| 神通火弹 | 继承根神通 Palette | 不读取攻击来源；烘焙 `bolt_fly` 帧的显示仍受运行时门禁与浏览器验收限制。 |
| 命中反馈 | 继承对应的玩家来源 Palette | 只做短确认层；不把目标敌人本体染为玩家主题色。 |

当前传播边界：

```text
攻击胜出来源 → 攻击 Palette → slash / sword_proj / 子剑 / 受控首中火弹 / 对应命中反馈
神通胜出来源 → 神通 Palette → dageng / 神通剑气或火弹 / 对应命中反馈
```

**禁止行为：**

- 子剑、火弹、二段神通、命中火花各自抽取新主题；
- 用攻击 palette 覆盖独立胜出神通，或反向借用神通色给攻击／首中联动；
- 以目标敌人所属阵营、血条颜色、皮肤颜色或命中位置作为 Palette 输入；
- 在火弹无法使用候选图片时，将敌人、敌方弹体或无关图片直接改色充当火弹；
- 通过 Palette 改写火弹 / 子剑的伤害、命中范围、数量、CD、物理体或飞行轨迹。

### 2.4 剑阵（`dageng`）的几何读法保留

取消固定金黄后，剑阵仍须在灰度、减闪与高对比条件下可辨认：

1. **主轮廓：** 固定三角、六边或八角之一；同一根攻击过程中不得中途换形。
2. **节点：** 顶点保留离散节点，至少能从闭合线段和节点数量识别为阵法。
3. **方向：** 通过入射线、顶点点亮顺序或收束方向表达施放方向；不得只靠颜色区分。
4. **时序：** 先显示稳定几何，再触发短确认；不以瞬时闪白替代成形过程。
5. **高对比：** 使用 `darkOutline` 包住线段 / 节点；必要时以实线 + 间隔节点的双层线表达，不增加第二个屏幕焦点。

---

## 3. 序列帧审计与资源配置合同

### 3.1 当前源码已核对的四层状态

| 资源族 | 磁盘文件 | BootScene 预加载请求 | 条件动画注册 | 源码 route 与浏览器状态 |
|---|---|---|---|---|
| `slash` | `slash_1..6` 完整存在 | 1..6 | 完整纹理时才注册 `slash_anim`（1..6） | `slashFx` 以 `hasRegisteredSequenceAnimationPlayback()` 检查该动画注册＋播放帧 1..6；否则静态回退；**浏览器待签收**。 |
| `sword_proj` | `sword_proj_1..8` 完整存在 | 1..8 | bundle 1..8 完整时创建 `sword_proj_fly`、`sword_proj_loop`、`sword_proj_hit` 三段动画 | 飞行／环绕／命中调用点均由 `hasRegisteredSequenceAnimationPlayback()` 分别检查目标动画注册＋真实播放帧（fly 1..4／loop 3..4／hit 5..8）；Palette V1 源码／自动化 P0 PASS，`sword_proj` P0 已关闭；**浏览器真实播放待签收**。 |
| `mod_*` | `blade` 1..6、`burst` 1..6、`charge` 1..4、`field` 1..6、`hit` 1..4、`rune` 1..4 均存在 | 每类请求完整声明帧 | 每类完整纹理才注册同名动画 | `playModularOnce` 以 `hasRegisteredSequenceAnimationPlayback()` 检查目标动画注册＋播放帧完整性；存在 `rune/charge/burst/hit` 调用；**浏览器待签收**。 |
| `fx_ring` | 1..8 完整存在 | 1..8 | 完整纹理才注册 `fx_ring` | `burstFx` 以 `hasRegisteredSequenceAnimationPlayback()` 检查目标动画注册＋播放帧完整性；否则静态＋补间；**浏览器待签收**。 |
| `fx_splash` | 1..8 完整存在 | 1..8 | 完整纹理才注册 `fx_splash` | `burstFx` 以 `hasRegisteredSequenceAnimationPlayback()` 检查目标动画注册＋播放帧完整性；否则静态＋补间；**浏览器待签收**。 |
| `fx_spark` | 1..6 完整存在 | 1..6 | 完整纹理才注册 `fx_spark` | `burstFx` 以 `hasRegisteredSequenceAnimationPlayback()` 检查目标动画注册＋播放帧完整性；否则静态＋补间；**浏览器待签收**。 |
| `bolt_fly` | 1..8 完整存在 | 1..8 | 完整纹理才注册 `bolt_fly` | 玩家火弹与黄龙山火弹均以 `hasRegisteredSequenceAnimationPlayback()` 检查目标动画注册＋播放帧完整性后选择；否则静态 `bolt`；**浏览器待签收**。 |
| `proj_fly` | 1..8 完整存在 | 1..8 | 完整纹理才注册 `proj_fly` | 敌方基础投射物以 `hasRegisteredSequenceAnimationPlayback()` 检查目标动画注册＋播放帧完整性后选择；否则静态 `proj`；**浏览器待签收**。 |

旧序列帧 API 已删除，不得再作为当前生产门禁或文档事实引用。当前生产 API 为 `hasRegisteredSequenceAnimationPlayback()`：它检查“目标动画已注册 + 该目标动画真实播放帧齐全”。因此，配置中存在 key、磁盘存在 PNG、BootScene 已发起加载，或仅满足创建多段动画的注册 bundle 前置中的任何一项，均不足以单独证明该目标动画实例可以播放。

### 3.2 `sword_proj` 当前双层合同与待签收边界

- **注册 bundle 前置：** `sword_proj_1..8` 必须完整，才创建全部三段动画；这是一项共同注册前置，不是任一具体动画已经在浏览器播放的证据。
- **目标动画播放合同：** `sword_proj_fly` 真实播放帧为 **1..4**；`sword_proj_loop` 为 **3..4**；`sword_proj_hit` 为 **5..8**。`src/fx/sequence-contract.ts` 将 bundle 注册前置与三段真实播放契约分开，BootScene 与专项测试已对应更新。
- **生产 route 门禁：** 调用点仅在 `hasRegisteredSequenceAnimationPlayback()` 对目标动画确认“已注册 + 真实播放帧齐全”后创建 sprite 并 `.play()`；不满足时回退静态 `sword_proj`。已删除的旧序列帧 API 不能用于描述当前语义。
- **已通过与未签收的边界：** Palette V1 源码／自动化 P0 门为 **PASS**，此前 `sword_proj` P0 已关闭；强制命令 `npm run validate:data`、`npm run typecheck` 均 exit 0，默认 `npm test` 连续两轮均为 **13 files／138 tests passed**。这些仅为源码／自动化回归证据，不能等同浏览器播放、Phaser 场景 E2E、缺帧降级、设备／可读性／性能、标准构建、手工烟雾或 Playtest 签收；发布仍为 **FAIL / NO-GO**。

### 3.3 配置合同最小字段

每个后续资产族在进入 route 前必须提供同一份可审计合同：

```text
assetFamily:
filePattern: <family>_1..N
expectedFrames: N
bootSceneLoaderKey: <exact key>
animationKey: <exact key or N/A>
fps / duration: <value>
frameSize + origin: <value>
tintPolicy: palette-safe | authored-only | no-tint
allowedRoutes: <explicit list>
renderOwner: player-origin only | other
fallback: sequence -> Graphics -> existing static / skip
qaEvidence: <test case reference>
```

尚未取得浏览器实例证据的资源不得因为“文件存在”“已预加载”“已条件注册”或 `hasRegisteredSequenceAnimationPlayback()` 通过被视作浏览器已播放资源。`mod_field_*` 的当前文件、预加载、条件注册与目标播放门禁事实不授权持续领域语义；持续区域仍须另行定义拥有者、时长、销毁、叠加、无障碍和性能合同。

---

## 4. 路由与安全降级

### 4.1 总体优先级

```text
静态套
  → 原有静态表现（不改、不染色、不重路由）

随机套
  → 注册 bundle 前置与 `hasRegisteredSequenceAnimationPlayback()` 目标播放门禁均满足的 slash / sword_proj 序列
  → Palette V1 的 Graphics 几何降级
  → 既有静态表现或跳过附加视觉

模块化／批量序列资源
  → 当前只在各自注册 bundle／完整帧条件、条件注册、`hasRegisteredSequenceAnimationPlayback()` 目标播放门禁与 route 满足时进入对应既有分支；浏览器未签收前不扩写为可用完成
```

该顺序是安全降级规范；当前源码已存在 `slash/sword_proj/mod/fx/bolt/proj` 的相应预加载、注册 bundle／完整帧条件注册、`hasRegisteredSequenceAnimationPlayback()` 目标播放门禁或调用选择路径，但这不表示浏览器真实实例已经播放。任何 fallback 都不得改变战斗结果。

### 4.2 静态套策略

- 静态套进入原有静态表现分支后立即结束 Palette V1 处理。
- 不对静态套的 PNG、动画、Graphics、shader、颜色、混合模式或现有路由做本次调整。
- 静态套当前有或没有什么手测效果，不由本规格推断；本次验收只检查“Palette V1 没有改变静态套”。

### 4.3 条件序列帧策略

1. `slash_1..6`：只有六帧在纹理管理器、`slash_anim` 已注册、`hasRegisteredSequenceAnimationPlayback()` 确认该目标动画播放帧 1..6 齐全且当前 route 明确选择时，才以该序列渲染。保持攻击来源 Palette，保留方向和切线读法；浏览器实际播放仍待签收。
2. `sword_proj_1..8`：bundle 1..8 是三段动画注册前置；三段真实播放合同为 `fly` 1..4、`loop` 3..4、`hit` 5..8。只有 bundle 完整、对应动画已注册，且 `hasRegisteredSequenceAnimationPlayback()` 确认目标动画的对应播放帧齐全时才进入相应 route；位置、旋转、生命周期和销毁完全跟随真实对象。Palette V1 源码／自动化 P0 已 PASS、`sword_proj` P0 已关闭；浏览器真实播放仍待签收。
3. `mod_*`、`fx_*`、`bolt_fly_*` 与 `proj_fly_*` 也有注册 bundle／完整帧条件注册及特定调用 route；它们不是“自动补救”资源。route 必须以 `hasRegisteredSequenceAnimationPlayback()` 确认目标动画注册＋播放帧齐全。缺帧、加载失败、动画键缺失、route 不匹配或实例不可用时，必须走各自既有静态／Graphics 回退。
4. 预加载、注册 bundle、条件注册或源码 `.play()` 路径只能证明前三层或调用意图；动画观感、帧速、染色正确性、无障碍表现、资源释放、高频稳定性和真实实例播放仍须浏览器 QA。

### 4.4 Graphics 降级策略

Graphics 只承担最小可读性，不创建新图片资产，不伪装成未部署序列帧。

| 场景 | Graphics 最小表现 | Palette 应用 | 禁止事项 |
|---|---|---|---|
| 近战 `slash` 缺序列 | 单一道向弧 / 切线，短时显示后销毁 | `primary` 主线、`highlight` 内缘、`darkOutline` 外缘 | 不补造多段动画、全屏闪白或额外命中 |
| 剑形投射物缺序列 | 沿真实对象方向的细长菱形 / 线段 | 同源 Palette；深描边保持轮廓 | 不自建轨迹、不修改真实对象速度或碰撞 |
| 剑阵缺专用资源 | 一个稳定多边形 + 顶点节点 + 方向线 | 同源 Palette；几何优先于颜色 | 不强制金黄、不循环叠层、不伪称持续领域 |
| 子剑 | 仅跟随真实子剑对象的较小剑形轮廓 | 继承父攻击 Palette | 不重抽色、不画不存在的子剑路径 |
| 火弹 | 仅跟随真实火弹对象的前核后尾轮廓 | 受控首中火弹继承父攻击 Palette；神通火弹继承神通来源 | 不使用敌方弹体或未满足运行门禁的 `bolt_fly` 冒充；不强制橙红 |
| 命中反馈 | 小型叉点 / 短环 / 碎裂线，单次短确认 | 继承来源 Palette | 不向敌人 sprite 写 tint；不表示范围持续效果 |

Graphics 的销毁条件必须绑定真实对象销毁、既有一次性动画结束或明确的短时表现结束。不能以持续 timer 为对象续命，也不能在命中未确认时提前播放。

### 4.5 模块化与批量序列资源策略

- `mod_*`、`fx_ring_*`、`fx_splash_*`、`fx_spark_*`、`bolt_fly_*` 和 `proj_fly_*` 当前都不是**无条件**可选的降级层；但它们不再是“完全未部署”：源码已包含相应文件请求、注册 bundle／完整帧条件注册和特定调用／选择路径。
- 当前门禁顺序为：磁盘帧集 → BootScene loader 请求 → 注册 bundle／纹理完整 → 动画注册 → `hasRegisteredSequenceAnimationPlayback()` 确认目标动画注册＋真实播放帧完整 → route 映射／实例选择 → Palette tint 或 overlay 安全性 → 缺资源回退 → 浏览器 QA。
- `mod_*` 的 `playModularOnce()`、`fx_*` 的 `burstFx()`、`bolt_fly` 的火弹 route、`proj_fly` 的敌方投射物 route 均以 `hasRegisteredSequenceAnimationPlayback()` 对目标动画作选择条件；已删除的旧序列帧 API 不再存在。未满足时保留各自静态／Graphics 路径。
- 对烘焙火色 `bolt_fly`，当前源码不直接施加 Palette tint；合格 v3 来源只允许使用既有的紧凑 Palette overlay。其实际视觉仍待浏览器验收。
- 模块资源即使文件存在，也不能覆盖静态套、v2 或 legacy 的既有表现；浏览器实测前不得将 `.play()` 调用写成“已播放”。

---

## 5. 性能、生命周期与降级预算（实施目标，未签收）

### 5.1 局部预算

| 表现 | 初始上限 | 首先裁剪 | 永不因预算改变的内容 |
|---|---:|---|---|
| 根近战 `slash` | 1 个主序列或 1 个 Graphics 弧 + 1 个短确认 | 高光内缘、装饰碎屑 | 攻击、伤害、命中、冷却 |
| 根剑投射物 | 1 个主序列或 1 个 Graphics 轮廓 + 1 个短尾迹 | 尾迹、余像、装饰火花 | 投射物位置、方向、生命周期、碰撞 |
| 子剑 | 最多 2 个、且只对应真实子剑 | 余像、第二层高光、非必要命中花 | 子剑真实数量、伤害与不可递归规则 |
| 火弹 | 最多 1 个、且只对应真实火弹 | 启动尾、余烬、装饰火花 | 火弹真实数量、伤害、CD、碰撞 |
| 剑阵 | 1 个主多边形 + 顶点节点 | 内部装饰线、重复亮点 | 几何主轮廓、方向读法 |

### 5.2 全局实现要求

1. 优先复用序列实例或 Graphics 对象；不得在每帧 / 每个伤害 tick 无上限分配新对象。
2. 初始全局保护目标为：同屏短命中 / 装饰层不超过 6 个、250 ms 内大确认层不超过 3 个；超额时只跳过新装饰层。
3. 不增加全屏闪白、全屏 shader、无限粒子、持续相机震动或未经验证的 ADD 混合叠层。
4. 实例必须跟随真实攻击 / 投射物生命周期销毁或回池；场景切换后不能遗留 tint、Graphics、计时器或引用。
5. 目标平台帧时间阈值尚未在本文件确认。QA 必须先记录同场景基线，再评估 Palette V1 的 P95 帧时间、对象峰值和回收稳定性；没有实测数据不得声称性能达标。

---

## 6. 可访问性：Standard 目标与双编码合同（未签收）

Palette V1 的目标等级为 **Standard**。色彩是辅助通道，所有有意义的攻击 / 神通信息至少还要保留一个非颜色通道；推荐最小双编码为“颜色 + 轮廓 / 几何 / 方向 / 时序 / 中文行为标签”中的任意两项。

| 特性 | 实施要求 | 降级后的最低读法 | 当前状态 |
|---|---|---|---|
| 色觉可辨 | 每个 family 保留不同轮廓、几何或运动；剑阵靠多边形 / 节点，非靠金黄 | 灰度下仍能区分剑形、火弹前核后尾、阵法多边形和命中短确认 | 待实现、待 QA |
| 减少闪烁 | 不用全屏闪白；不以高频亮灭告知子剑、火弹或命中；高光只作为短辅助层 | 移除 / 合并装饰高亮后，保留轮廓、方向与命中位置 | 待实现、待 QA |
| 减少动态 | 关闭余像、非必要旋转、装饰抖动和相机震动；真实投射物位置仍正常跟随 | 单个主轮廓 + 关键节点 / 方向线 | 待实现、待 QA |
| 高对比 VFX | 使用 `darkOutline`；必要时加深至 2 px，并强化节点、端点和主方向 | 深描边 + 明确形状；不改变对象、伤害或碰撞 | 待实现、待 QA |
| 中文行为语义 | UI / 提示使用“剑阵成形”“二子剑”“火弹出发”等行为词，不用“蓝色 / 紫色效果”作为唯一描述 | 行为词与形状共同保留 | 待实现、待 QA |
| 敌我分离 | 玩家 Palette 只写入玩家来源表现，敌方保留原有颜色 / 预警体系 | 即使 Palette 失效，也不得以敌方颜色替代玩家读法 | 待实现、待 QA |

### 6.1 三个设置的具体回退

| 设置 | 必须关闭 / 收敛 | 必须保留 | 禁止改变 |
|---|---|---|---|
| `reducedFlash` | 全屏闪白、重复高亮、装饰闪烁、强 ADD 瞬爆 | 1 个稳定主轮廓、短命中确认、方向 / 几何 | 命中时机、伤害、对象数量 |
| `reducedMotion` | 余像、循环旋转、装饰尾焰、相机震动、非必要位移 | 静态 / 短时剑形、火弹前核后尾、剑阵节点 | 真实投射物的物理移动与生命周期 |
| `highContrastVfx` | 不必额外增加特效层 | 深描边、清晰端点、顶点节点、主方向与行为标签 | Palette 归属、敌我颜色、判定逻辑 |

---

## 7. QA 验收清单（自动化 P0 已通过；以下运行时／发布项待签收）

Palette V1 源码／自动化 P0 门为 **PASS**，此前 `sword_proj` P0 已关闭；但以下项目在真实战斗场景、目标分辨率和目标性能环境中完成前，候选仍为 **FAIL / NO-GO**，不得将源码、磁盘、预加载、注册或 `.play()` 路径升级写成浏览器播放或发布可用。

### 7.1 资源与 route 验收

- [ ] 逐资源记录四层证据：磁盘帧清单、BootScene 预加载结果、条件注册表、浏览器真实实例帧捕获／录屏；前三层不替代第四层。
- [ ] 验证 `slash_1..6`：完整六帧、`slash_anim` 注册、`hasRegisteredSequenceAnimationPlayback()` 的目标播放门禁、route、帧序、染色、销毁／回池与浏览器实际播放。
- [ ] 验证 `sword_proj_1..8`：确认 bundle 1..8 仅作为三段动画注册前置；分别捕获 `sword_proj_fly` 1..4、`sword_proj_loop` 3..4、`sword_proj_hit` 5..8 的浏览器实例、`hasRegisteredSequenceAnimationPlayback()` 播放门禁、帧序、染色、真实投射物方向与销毁／回池。自动化 P0 PASS／`sword_proj` P0 关闭不替代浏览器真实播放签收。
- [ ] 主动缺失任一 `slash`／`sword_proj`／`mod`／`fx`／`bolt`／`proj` 必需帧、动画键或实例，确认 `hasRegisteredSequenceAnimationPlayback()` 拒绝对应目标动画并进入各自静态／Graphics 回退，无报错、无伪造路径、无战斗逻辑变化。
- [ ] 验证 `mod_*`、`fx_ring_*`、`fx_splash_*`、`fx_spark_*`、`bolt_fly_*`、`proj_fly_*` 的注册 bundle／完整帧条件注册、`hasRegisteredSequenceAnimationPlayback()` 目标播放门禁、实际 route 与浏览器播放；不得因 loader、注册或 `.play()` 源码存在而跳过浏览器验收。

### 7.2 Palette 全链路验收

- [ ] 同一合格 v3/generator v2 来源在重复攻击、重复神通、重进场景和重新读取持久化 identity 后，解析到相同 `palette-v1|setId|profileId|transformId|theme` 与同一 `primary / highlight / darkOutline`。
- [ ] 攻击和神通分别使用各自胜出来源 Palette；混穿时攻击不得借神通色、神通不得借攻击色，不发生二次随机或按敌人取色。
- [ ] 子剑和受控首中火弹在真实对象创建时继承父攻击颜色；神通火弹继承神通来源；不存在对象时不画出可被误读为真实攻击的视觉路径。
- [ ] 大庚（`dageng`）随机套不再全体固定金黄；剑阵在灰度截图中仍可由闭合几何、节点和触发顺序识别。
- [ ] 静态套的截图、颜色值和原有表现与改动前一致。
- [ ] 敌人 sprite、敌人投射物、敌方预警、血条和状态色在所有 Palette family 下均保持不变。

### 7.3 可访问性验收

- [ ] 在灰度 / 色觉差异观察下，剑形、火弹前核后尾、剑阵多边形、命中确认均不依赖单一颜色。
- [ ] 开启 `reducedFlash` 后，去除强闪与装饰高亮，仍能读到攻击方向、剑阵成形、二子剑和火弹出发。
- [ ] 开启 `reducedMotion` 后，去除余像、旋转、装饰尾焰和相机震动，真实对象与关键读法仍在。
- [ ] 开启 `highContrastVfx` 后，深描边、节点与主方向清晰，且不改变敌我颜色与战斗判定。
- [ ] 行为提示不以颜色命名替代机制说明。

### 7.4 性能与稳定性验收

- [ ] 高攻速、多随机套、剑阵、二子剑和火弹并发场景下，记录 P95 帧时间、同屏对象峰值、Graphics 数量和回收结果，并与未接 Palette 的基线对比。
- [ ] 压力场景超过局部 / 全局预算时，只裁剪余像、尾迹、余烬和装饰火花；真实攻击、子剑、火弹和命中逻辑不受影响。
- [ ] 连续触发与场景切换后，没有残留的 Graphics、tint、动画实例、计时器或对已销毁对象的引用。
- [ ] route 失败、资源缺失或设置切换时没有异常日志、黑块、全屏闪白、错误替代图片或敌人被改色。

---

## 8. 资产交付清单与缺口

### 8.1 本次不交付的内容

- 本次不新增、生成、重绘、补帧或伪造任何 PNG / 序列帧。
- 本次不把源码预加载、注册 bundle、条件注册、`hasRegisteredSequenceAnimationPlayback()` 或 `.play()` 调用写成浏览器已接入／已播放；不新增、补帧或伪造任何图片资源。
- `slash_1..6`、`sword_proj_1..8`、`mod_*`、`fx_*`、`bolt_fly_*` 与 `proj_fly_*` 的磁盘、预加载、注册 bundle／条件注册、目标播放门禁和源码 route 事实已在 §3 记录；它们仍需浏览器 route 与 QA 验收。

### 8.2 阻塞浏览器签收的证据缺口

| 优先级 | 缺口 | 已核实源码事实 | 未解决前的处置 |
|---|---|---|---|
| P0 | 浏览器／Phaser 场景 E2E：`sword_proj` 三段播放与降级 | 注册 bundle 1..8、目标播放帧 `fly` 1..4／`loop` 3..4／`hit` 5..8，以及 `hasRegisteredSequenceAnimationPlayback()` 当前合同已由源码／自动化 P0 PASS 覆盖；`sword_proj` P0 已关闭 | **仍须浏览器真实实例与 Phaser 场景 E2E、实际缺帧降级证据；不签收为已播放或发布可用。** |
| P0 | `mod_*` 浏览器播放证据 | 各声明帧、BootScene 预加载、条件注册、`hasRegisteredSequenceAnimationPlayback()` 目标播放门禁与部分调用已存在 | 逐 route 采集真实实例、帧序和回退证据；此前不称已播放。 |
| P0 | `fx_ring/splash/spark` 浏览器播放证据 | 各帧、预加载、条件注册、`hasRegisteredSequenceAnimationPlayback()` 与 `burstFx()` 选择路径已存在 | 逐 route 采集真实实例、帧序、销毁和静态回退证据；此前不称已播放。 |
| P0 | `bolt_fly_*`／`proj_fly_*` 浏览器播放证据 | 均为 1..8；预加载、条件注册、`hasRegisteredSequenceAnimationPlayback()` 与火弹／敌方投射物 route 已存在 | 分别验证真实对象、烘焙 tint 边界、帧序、销毁及回退；此前不称已播放。 |
| P1 | Palette 稳定身份与 8-family 浏览器可读性 | resolver 使用 `setId/profileId/transformId/theme`，算法 `palette-v1`，FNV-1a-32，8 个受控 family | 验证混穿来源、静态/v2/legacy 旁路、色觉／低端条件；资格失败保持无覆盖。 |
| P1 | 性能目标平台阈值待确认 | 源码有局部对象／回退策略，但没有本轮浏览器基线 | 工程提供目标设备／浏览器与基线测量口径；此前不声称性能已达标。 |

### 8.3 后续资产提示词约束

如未来新增不同于当前已存在帧集的资产，资产制作 / AI 提示词必须包含以下限制：

```text
像素画；透明背景；精确文件范围 <family>_1..N；
N 与对应源码的实际帧契约完全一致；不额外补帧；
硬边、可读轮廓、至少 1 px 深描边；
明确 primary / highlight / darkOutline 的 palette-safe 或 authored-only 标记；
不得绘制敌人、敌方预警、全屏闪白、持续领域或未授权的伤害范围。
```

当前 `proj_fly` 的工程契约已为 `proj_fly_1..8`（磁盘、预加载、条件注册、`hasRegisteredSequenceAnimationPlayback()` 目标播放门禁与敌方 route 均已核对）；不得再把它写成“帧数待裁决”，也不得凭此宣称浏览器已播放。

---

## 9. 风险、待确认项与维护规则

### 9.1 当前风险

1. **四层事实或目标播放门禁被错误升级：** 将文件存在、预加载、注册 bundle、条件注册、`hasRegisteredSequenceAnimationPlayback()` 或源码 `.play()` 当作浏览器已播放，会导致 route 静默失败或错误签收。
2. **双层合同与证据边界：** `sword_proj` 的注册 bundle 1..8 与三段目标播放合同（fly 1..4／loop 3..4／hit 5..8）均已由当前 `hasRegisteredSequenceAnimationPlayback()` 语义和自动化 P0 覆盖，`sword_proj` P0 已关闭；但这不等于浏览器真实播放、Phaser 场景 E2E 或实际缺帧降级完成，后三者仍需验收。
3. **Palette 漂移或串源：** 若攻击、神通、子剑和火弹分别随机取色，或混穿时跨通道借色，会失去身份稳定性。
4. **敌我污染：** 若 tint 写入目标或全局材质，敌方预警与敌人颜色会被覆盖，破坏战斗可读性。
5. **固定金黄回归：** 若 `dageng` 仍以金黄作为随机套默认，会压平主题差异并使剑阵只剩颜色识别。
6. **视觉伪造：** 缺资源时画出不存在的子剑 / 火弹路径，会使玩家误以为发生了真实伤害。
7. **设置名大于实际功能：** 减闪、减动、高对比若未测试就宣称可用，实际无障碍体验会失真。

### 9.2 待确认

- `sword_proj` 在真实浏览器／Phaser 场景中的三段实例、帧序与实际缺帧降级行为；自动化 P0 已 PASS、`sword_proj` P0 已关闭，但确认前仍保持“浏览器待签收”。
- `slash`、`mod`、`fx`、`bolt`、`proj` 在真实浏览器场景中的实例创建、帧序、销毁、回退和性能证据。
- Palette V1 在混穿、静态/v2/legacy 旁路、目标平台和色觉／减闪／减动条件下的可读性与性能基线。
- 目标平台和性能基线的测量口径；完成前不声明帧率或性能通过。

### 9.3 文档维护

1. 文档必须逐层标注资源事实，并将注册 bundle 前置与目标动画播放门禁分开记录；只有浏览器实例证据和签收记录才能把第四层写为“已播放／已验收”。
2. `sword_proj` 的注册 bundle 1..8 与目标播放 `fly` 1..4／`loop` 3..4／`hit` 5..8 必须同时维护；运行时门禁固定写为 `hasRegisteredSequenceAnimationPlayback()` 的“目标动画已注册 + 该动画真实播放帧齐全”，不得回写已删除的旧序列帧 API 名称，也不得把自动化 P0 PASS 写成浏览器真实播放已完成。
3. `mod/fx/bolt/proj` 已有的磁盘、预加载、条件注册、目标播放门禁和源码 route 不能被回写成“完全未部署”，也不能被夸写成浏览器已播放。
4. 任何新增资源都必须先定义 Palette 安全性、敌我隔离、缺失回退、减闪 / 减动 / 高对比行为与性能预算。
5. 本文件在浏览器、手动 QA 与发布门全部签收前持续标记为：**源码／自动化 P0 PASS；浏览器、手动 QA 与发布验收待签收（FAIL / NO-GO）**。
