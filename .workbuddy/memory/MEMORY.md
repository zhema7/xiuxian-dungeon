# 修仙与地上城 — 项目长期记忆

## 技术栈与项目约定
- 项目：`修仙与地上城`（xiuxian-dungeon），Phaser 3.90 + Vite 5.4 + TypeScript 5.6 + Vitest，竖屏 9:16 像素风修仙 Roguelike。
- 仓库路径：`C:\kimi\修仙与地上城`（注意是「地上城」）。

## 关键环境限制
- **npm run build / npm run dev 必须在 WorkBuddy 沙箱外运行**。沙箱中的 `genie-safe-delete` shim 会拦截 Vite 对 `dist/` 的批量清理，报错 `SAFE_DELETE_BULK_GUARD_ERROR`。
- PowerShell 若提示 `ExecutionPolicy` 阻止 `npm.ps1`，执行：`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`。
- Git Bash 下切换中文目录需用引号：`cd "C:\kimi\修仙与地上城"`。

## 验证命令
- 类型检查：`npm run typecheck`（沙箱内可运行）
- 单元测试：`npm run test`（沙箱内可运行）
- 生产构建：`npm run build`（沙箱外运行）

## 动画/特效资源规范
- 序列帧特效：逐帧独立 PNG，命名 `public/sprites/{key}_{n}.png`（如 `sword_proj_1.png` … `sword_proj_8.png`）。
- 目标尺寸：48×48，RGBA，透明底，尖角/剑尖朝右。
- BootScene 已配置 `FX_ANIMS`，所有帧加载成功时自动注册动画；缺失则回退到静态 `sword_proj.png` / `slash.png`。
- 新图嵌入后需执行：typecheck → test → build（沙箱外）。
