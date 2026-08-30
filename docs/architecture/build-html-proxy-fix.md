# 构建诊断与历史修复记录：vite:html-inline-proxy「No matching HTML proxy module found」

- 任务：BUILD-FIX-001（已实施；本文保留为历史根因、修复与当前构建边界记录）
- 环境：Phaser 3.90 + Vite 5.4.21 + TypeScript + Vitest，像素修仙 roguelike，竖屏 9:16
- 实施状态：已将页面 CSS 外置至 `src/style.css`，并在 `src/main.ts` 顶部使用 `import './style.css'`；当前 `index.html` 不再包含内联 `<style>`。未在本记录中声明 Git 提交状态。
- 发布口径：此修复只关闭历史 `html-inline-proxy` 触发路径；它**不代表**标准构建、PRS QA 或发布签收已经通过。

---

## 1. 历史根因（已关闭的 html-inline-proxy 路径）

### 1.1 历史直接原因

此前 `vite build` 在 `vite:html-inline-proxy` 插件阶段失败：

```
[vite:html-inline-proxy] Could not load
C:/kimi/修仙与地上城/index.html?html-proxy&inline-css&index=0.css (imported by index.html):
No matching HTML proxy module found from
C:/kimi/修仙与地上城/index.html?html-proxy&inline-css&index=0.css
```

错误来自 Vite 内部 `htmlInlineProxyPlugin.load`。当构建处理内联 `<style>` 时，Vite 会将其转换为 `index.html?html-proxy&inline-css&index=0.css` 虚拟模块，并从基于配置实例的 HTML proxy cache 查找内容。Windows 路径大小写或模块实例身份不一致时，缓存填充与查询可能落入不同映射，从而造成 miss。

### 1.2 历史项目触发点

当时 `index.html` 含大段内联 `<style>`（包含 CSS 变量、`env(safe-area-inset-*)`、`linear-gradient`、HUD、触控、面板和标题规则）。该形式触发了 html-inline-proxy 虚拟模块路径，并呈现非确定性失败／成功表现。

### 1.3 历史定位证据

- 首次自动配置构建可在仅转换少量模块后报 html-inline-proxy 错。
- 诊断时 HTML transform 和虚拟 CSS load 使用同一工程路径，但同一会话中代理有时可解析、有时不能，符合实例／路径不一致造成的非确定性 cache miss。
- 使用相同 CSS 特性但不放入内联 `<style>` 的探针可以构建，说明 CSS token 本身不是根因。

---

## 2. 已实施修复

### 2.1 采用方案：外置 CSS（已完成）

以下方案已经实施：

1. 将原 `index.html` 内联样式移至 `src/style.css`；
2. 在 `src/main.ts` 顶部保留 `import './style.css'`；
3. 从 `index.html` 移除内联 `<style>`。

结果是 Vite 不再为主页面样式创建 `?html-proxy&inline-css` 虚拟模块，因而绕开该历史脆弱路径。当前工程事实为：`src/main.ts` 已导入 `./style.css`，`index.html` 无内联 `<style>`。

### 2.2 为什么采用此方案

- 消除了 Windows 上 html-inline-proxy 的触发面，而不是依赖 `node_modules` 临时补丁；
- 保留 Vite 的常规 CSS 管线与 `base: './'` 路径处理；
- 样式独立后更利于缓存与维护；
- 不需要升级 Vite 主版本或修改 Vite 内部实现。

### 2.3 历史探针验证（归档证据）

此前使用 `base: './'`、外部 CSS、独立输出目录和 `emptyOutDir: false` 的探针构建成功：34 个模块完成转换，无 html-inline-proxy 错。该记录证明外置 CSS 规避了历史触发路径；它不替代当前标准发布构建证据。

---

## 3. 当前构建边界（仍未关闭）

### 3.1 标准 `npm run build`：BLOCKED

当前标准构建仍可能在 `dist/` 清理阶段被 WorkBuddy `genie-safe-delete` shim 阻断：

```
[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]
... dist/sprites (... files > threshold 50)
```

该保护包裹 `fs.rmSync`；当 Vite `emptyOutDir` 需要批量清理 `dist/` 文件时，会要求环境侧确认。此阻断发生在 Vite 完成源码转换后、输出目录准备阶段：它不是 TypeScript 或 bundle transform 失败，但也意味着标准 `npm run build` **尚未形成可用于发布的成功证据**。

### 3.2 fresh outDir 构建：仅技术可行性证据

使用全新、无需清理的独立输出目录执行 `npx vite build --outDir <fresh-dir>` 可成功构建。该结果说明当前源代码和 Vite 打包路径可运行，但不替代：

- 标准 `dist/` 构建；
- 运行时／真机 QA；
- PRS 或整包发布签收；
- 对构建产物大小、分包和上线环境的最终验收。

最近两次 fresh outDir 构建均出现单个 JS chunk 超过 1600 kB 的警告，应作为 P1 性能／首包风险追踪，而非被表述为无警告构建全绿。

---

## 4. 风险与后续动作

| 项目 | 状态 | 后续动作／边界 |
|---|---|---|
| `html-inline-proxy` 内联 CSS 触发路径 | 已关闭 | 保持 CSS 通过 `src/main.ts` 导入；不要无评审地将主页面大量样式重新内联。 |
| `dist/` 批量清理确认 | BLOCKED | 需在获授权的环境清理路径下完成一次标准 `npm run build`；不得用 fresh outDir 结果替代。 |
| 单 chunk >1600 kB 警告 | P1 未关闭 | 在后续首包／分包优化中评估 dynamic import 或 Rollup chunk 策略，并以性能预算验收。 |
| 发布状态 | NO-GO | 仍需标准构建、稳定测试、运行时／真机 QA 与发布负责人显式签收。 |

---

## 5. 结论

CSS 外置修复已实施，历史 `vite:html-inline-proxy` 内联样式路径不再是当前工程的已知阻塞。当前发布阻塞是标准 `dist/` 清理受到环境 `safe-delete` 确认门限制，且仍存在独立于本修复的测试稳定性、QA、性能与发布签收前置。不得将本文的历史修复状态解释为任何发布通过结论。
