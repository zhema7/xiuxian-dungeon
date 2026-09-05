# 修仙与地上城 — 项目长期记忆

## 技术栈与项目约定
- 项目：`修仙与地上城`（xiuxian-dungeon），Phaser 3.90 + Vite 5.4 + TypeScript 5.6 + Vitest，竖屏 9:16 像素风修仙 Roguelike。
- 仓库路径：`C:\kimi\修仙与地上城`（注意是「地上城」）。

## 关键环境限制
- **npm run build / npm run dev 必须在 WorkBuddy 沙箱外运行**。沙箱中的 `genie-safe-delete` shim 会拦截 Vite 对 `dist/` 的批量清理，报错 `SAFE_DELETE_BULK_GUARD_ERROR`。
- PowerShell 若提示 `ExecutionPolicy` 阻止 `npm.ps1`，执行：`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`。
- Git Bash 下切换中文目录需用引号：`cd "C:\kimi\修仙与地上城"`。
- **Bash 工具 stdout 偶发返回空**（已知问题）：改为「命令输出重定向到文件 + Read 工具读取」。
- **git 的 HTTPS 操作（push/ls-remote）在 Bash 沙箱下被阻断**——TCP 能建立但请求无响应、exit 1 且无输出。**必须用 PowerShell 工具执行 git 远程操作**，并用 `Out-File` 写日志再 Read（PowerShell 的 stdout 也可能被吞）。

## Git 与远程仓库
- **2026-08-30 已初始化 Git 并推送到 GitCode**：`https://gitcode.com/philocoding/xiuxian-dungeon`（显示名「修仙与地下城」，**私有仓库**）。
- 归属：`philocoding` 命名空间；默认分支 `main`；首次提交 `eec4a58`（2534 文件）。
- **GitCode API 要点**：
  - 认证必须用 **header `private-token: <令牌>`**，不是 body 里的 `access_token`（否则报「Invalid header parameter: private-token, required」）。
  - 创建仓库：`POST https://gitcode.com/api/v5/user/repos`
  - **仓库路径(path)不能含中文**，只允许字母/数字/`_`/`-`/`.`；需用 `name`（中文显示名）+ `path`（英文）分离传参。
- ⚠️ **安全提示**：`.git/config` 的 remote URL 中明文含访问令牌。若令牌泄露或需共享仓库，应立即到 GitCode 轮换令牌并更新 remote。

## 仓库内容边界（.gitignore）
已排除：`node_modules/`、`dist/`、`dist-*/`、`archive/`、`backup/`、`release/*.zip`、`release/archives/`、`promo/*.mp4|webm`、`marketing/*.mp4`、`game/`、`assets/source` 之外的临时产物、`*.log`、`_qa-*.json`、`.trae-html-share-packages/`、`.vitest-asset-gate-tmp/`。
**注意**：`game/`（103MB，与 public/sprites 290 个文件 100% 同名）是历史打包副本，仅不入库，**本地未删除**。

## 验证命令
- 类型检查：`npm run typecheck`（沙箱内可运行）
- 单元测试：`npm run test`（沙箱内可运行，当前 21 files / 562 tests）
- 资源校验：`npm run validate:assets`（沙箱内可运行）；`validate:assets:strict` 严格模式
- 一键校验：`npm run validate`（data + assets）
- 生产构建：`npm run build`（沙箱外运行）
- 推送：`git push`（**必须用 PowerShell，Bash 沙箱会阻断**）

## 动画/特效资源规范
- 序列帧特效：逐帧独立 PNG，命名 `public/sprites/{key}_{n}.png`（如 `sword_proj_1.png` … `sword_proj_8.png`）。
- 目标尺寸：48×48，RGBA，透明底，尖角/剑尖朝右。
- BootScene 已配置 `FX_ANIMS`，所有帧加载成功时自动注册动画；缺失则回退到静态 `sword_proj.png` / `slash.png`。
- 新图嵌入后需执行：typecheck → test → build（沙箱外）。
- **灰度基底约定**：`burstFx()` 内部会 `setTint()` 上色，因此在屏特效（fx_ring/fx_splash/fx_spark 等）的源图应保持**低饱和灰度**（饱和度 < 0.2），否则 tint 后颜色会脏。实测 fx_ring 0.168 / fx_splash 0.185 / fx_spark 0.058。

## 美术资产盘点（2026-08-30 完成，结论见 docs/art/art-gap-backlog.md）
- **清单落盘**：`docs/art/art-gap-backlog.md`（354 行）。含 5 项正式清单、1 项已关闭、10 项待研究疑问、执行路线图、已知风险。**疑问项按用户要求保留，不擅自解答，研究后回填。**
- **总预算 18-28 人天**（v4 重画 270 张 11-16 / fx 缩放整改 4-8 / sect_bg 0.5-1 / npc.png 0.5-1 / player.png 0.5 可选）。
- **v4 三十套 1140 张 = 零渲染负债**：`src/v4/` 零渲染调用，`scene-adapter.ts` 100% 走 Graphics，`BootScene.ts:387-398` 却逐张 `load.image` 全部 1140 张。**评估 v4 必须先决定"接不接渲染管线"，再谈画工。** 若决定不接，应移除该加载循环。
- **抖音 28 张已裁定沿用**（2026-08-30 用户）：不删不换不重画，合规项关闭。注意 douyin 只存在于 PNG 内嵌 tEXt 元数据，**项目内无任何文件名含 douyin**。若日后要降险，可写脚本剥离 tEXt 块（不改像素，约 5 分钟），需用户批准。

## 资产盘点可复用方法（本库已验证有效）
1. **PNG 溯源**：直接 `open(f,'rb').read()` 搜 `douyin|comfyui|Software|tEXt|Author` 等字节串，可挖出素材真实来源（本次据此查出 28 张抖音来源图）。
2. **占位图判定**：单图字节数 + 颜色数 + 尺寸三元组。真实美术 2-5 MB / 上千色；程序化占位 1-5 KB / 数十色，差三个数量级。
3. **形状差异 vs 仅换色**：转灰度并按 Alpha 加权后做跨样本平均绝对差（0-255）。<2 基本同形状，2-6 相近，>6 明显不同。本项目 v4 实测均值 25.33 → 形状确实不同。
4. **静止帧检测**：对同一动画组各帧算 md5，全同 = 该动画不会动。
5. **零渲染负债检测**：grep 资源 key 时**必须同时查两种形式**——直接 `.play('key')` / `add.image('key')`，以及经辅助方法传参（如 `burstFx('fx_ring',...)`）。只查前者会严重漏判（本次据此一度误判 28 张"零渲染"，实际 28 处在屏）。
6. **饱和度判断 tint 基底**：`sat = (max-min)/max`，低饱和灰图才是合格的 `setTint` 基底。

## Agent 派发约束
- **`art-director` 角色没有 Bash 工具**（启动即报 `Bash not found in agent art-director`，首次尝试仅存活 4 秒）。派发时必须在 prompt 中显式声明「禁止调用 Bash / TaskList，只能用 Read / Grep / Glob」，并把已采集的数据直接喂给它，让它只做专业判断层。
