# ART-EMBED-001 slash 特效贴图嵌入报告

## 任务概述
将用户生成的新 `slash` 攻击特效贴图嵌入 Phaser 3.90 + Vite + TypeScript 项目，替换原有的程序化占位贴图，并确保构建与测试无回归。

## 源文件校验
- **源路径**: `C:\Users\roy18\Downloads\slash.png.png`
- **格式**: PNG（签名 `\x89PNG\r\n\x1a\n` 正确）
- **尺寸**: 2048 × 2048
- **色彩模式**: RGBA（8 bit/通道）
- **透明通道**: Alpha 范围 0–255，存在有效透明区域
- **内容包围盒**: (362, 278, 1716, 1641)，实际内容约 1354 × 1363，为一道弧形剑光/月牙特效

## 处理与输出
1. **裁剪**: 按 Alpha 非零区域裁剪，去除多余空白。
2. **缩放**: 使用最近邻插值缩放至 **48 × 48**。
   - 原因：README 原建议 24×24，但 2048 源图缩至 24×24 会丢失月牙轮廓；48×48 能在保持像素锐利的同时保留弧形细节。
3. **输出**: `public/sprites/slash.png`
   - 文件大小：约 2 KB
   - 格式：PNG RGBA，透明背景

## 代码改动
### 1. 贴图注册（`src/textures.ts`）
- `SPRITE_KEYS` 中 `slash` key 已存在，无需新增。
- 将程序化兜底定义从 24×24 同步调整为 48×48，避免外部文件缺失时尺寸不一致：
  ```ts
  slash: [48, 48, [
    [8, 20, 32, 6, 0xe8f4ff], [12, 12, 24, 6, 0xaaccee], [16, 28, 20, 4, 0x88aacc],
  ]],
  ```

### 2. 场景特效尺寸调校（`src/scenes/DungeonScene.ts`）
贴图基底从 24×24 变为 48×48，若保持原 `setScale` 数值，所有 slash 特效会放大 2 倍。为保留原有视觉尺寸，将所有 `slash` 相关 `setScale` 与 tween target scale 乘以 0.5：

| 位置（功能） | 原 scale | 新 scale | 备注 |
|---|---|---|---|
| `fireVortexFx` 初始 / 目标 | 0.4 / 2.4 | 0.2 / 1.2 | 暴走环境演出 |
| `whirlwind` 初始 / 目标 | 0.5 / 3.2 | 0.25 / 1.6 | 旋风斩 |
| `frost_nova` 初始 / 目标 | 0.5 / 3.6 | 0.25 / 1.8 | 冰环 |
| `frost_nova_burst` ring1 初始 / 目标 | 0.6 / 5.2 | 0.3 / 2.6 | 玄冥冰爆外环 |
| `frost_nova_burst` ring2 初始 / 目标 | 0.4 / 4.0 | 0.2 / 2.0 | 玄冥冰爆内环 |
| `slashFx` 近战剑光 | 1 / 1.5 | 0.5 / 0.75 | 普通/三段斩击 |
| 飞剑命中 spark 初始 / 目标 | 0.5 / 0.9 | 0.25 / 0.45 | 剑阵命中 |
| 雷链落点 boom 初始 / 目标 | 0.5 / 2.4 | 0.25 / 1.2 | 紫霄雷链 |
| 爆裂 bolt 初始 / 目标 | 0.4 / 1.6 | 0.2 / 0.8 | 爆裂溅射 |

- 未改动特效逻辑、生命周期、颜色染色（tint）、旋转角度或位移偏移，仅调整 scale 常量。

### 3. 文档更新（`public/sprites/README.md`）
- 将 `slash.png` 建议尺寸从 24×24 更新为 48×48。

## 验证结果
### 类型检查
```bash
npm run typecheck
```
- **状态**: ✅ 通过（`tsc --noEmit` 0 错误）

### 构建
```bash
npm run build
```
- **状态**: ❌ 失败
- **失败原因**: TypeScript 编译通过，Vite 在清理 `dist/` 目录时被 WorkBuddy 的 `genie-safe-delete` shim 拦截，报错 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，属于当前运行环境的文件删除保护机制，与代码改动无关。
- **补充验证**: 使用全新输出目录可正常构建：
  ```bash
  npx vite build --outDir dist-slash-test
  ```
  - **状态**: ✅ 成功（34 模块转换，输出 index.html + assets）
  - 临时目录 `dist-slash-test/` 因同样的 safe-delete 限制未能自动清理，需手动删除。

### 测试
```bash
npm test
```
- **状态**: ✅ 通过
- **结果**: 2 个测试文件，29 个测试用例全部通过
  - `tests/state.test.ts`: 7 passed
  - `tests/core.test.ts`: 22 passed

## 变更文件清单
1. `public/sprites/slash.png`（新增/替换，48×48 RGBA）
2. `src/textures.ts`（同步兜底贴图尺寸为 48×48）
3. `src/scenes/DungeonScene.ts`（按比例 0.5 调整所有 slash 特效 scale）
4. `public/sprites/README.md`（更新 slash 建议尺寸）
5. `docs/art/ART-EMBED-001-slash-report.md`（本报告）

## 风险与后续建议
1. **Safe-delete 环境限制**: `npm run build` 因无法清理 `dist/` 失败，建议团队 lead 在本地非 WorkBuddy 环境或关闭文件删除保护后重跑一次完整 `npm run build` 以做最终确认。
2. **美术视觉偏移**: 新贴图为非中心对称的月牙，绕中心旋转时视觉重心可能与旧贴图不同；建议实际运行游戏观察 `slashFx`  melee 斩击与 `whirlwind`/`frost_nova` 环形特效表现，必要时由 art-director 微调贴图重心或尺寸。
3. **未提交**: 本次改动未执行 git commit，等待团队 lead 审批。
