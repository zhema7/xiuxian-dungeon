# 安卓打包指南

## 前置条件

### 1. Node.js
- 版本要求：18.0 或更高
- 下载：https://nodejs.org/

### 2. Android Studio
- 版本要求：Hedgehog (2023.1) 或更高
- 下载：https://developer.android.com/studio
- 安装时勾选 Android SDK、Android SDK Platform-Tools、Android Virtual Device

### 3. JDK (Java Development Kit)
- 版本要求：JDK 17
- Android Studio 内置 JDK，通常无需单独安装
- 如需单独安装，推荐 Eclipse Temurin 17：https://adoptium.net/

### 4. Android SDK
- 通过 Android Studio > SDK Manager 安装
- 最低 API 级别：24（Android 7.0）
- 目标 API 级别：34（Android 14）

## 初始化

```bash
# 安装依赖
npm install

# 添加 Android 平台（仅需执行一次）
npx cap add android
```

## 构建步骤

### 方式一：一键脚本
```bash
node scripts/build-android.mjs
```
脚本会自动执行：vite build → cap sync android → 打印后续指引

### 方式二：手动命令
```bash
# 构建 Web 资源并同步
npm run cap:sync

# 打开 Android Studio
npm run cap:open

# 或仅复制资源（不同步原生插件）
npm run build:android
```

### 在 Android Studio 中构建 APK
1. 运行 `npx cap open android` 打开 Android Studio
2. 等待 Gradle 同步完成（右下角进度条消失）
3. 菜单栏 Build > Build Bundle(s) / APK(s) > Build APK(s)
4. 构建完成后点击通知栏 locate 链接找到 APK
5. APK 路径：`android/app/build/outputs/apk/debug/app-debug.apk`

### 签名发布 APK
1. 菜单栏 Build > Generate Signed Bundle / APK
2. 选择 APK，下一步
3. 首次创建 keystore：
   - 点击 Create new
   - 选择安全路径保存 .jks 文件
   - 填写 alias、密码、有效期（建议 25 年）
   - 填写开发者信息
4. 选择 release 变体，完成构建
5. 发布 APK 路径：`android/app/build/outputs/apk/release/app-release.apk`

## 竖屏锁定

添加 Android 平台后，需手动设置竖屏。

编辑 `android/app/src/main/AndroidManifest.xml`，在 `<activity>` 标签中添加：
```xml
android:screenOrientation="portrait"
android:resizeableActivity="false"
```

完整示例：
```xml
<activity
    android:name=".MainActivity"
    android:screenOrientation="portrait"
    android:resizeableActivity="false"
    android:exported="true">
```

## 常见问题

### Q: `npx cap add android` 报错 "Unable to find webDir"
**A:** 先运行 `npm run build` 生成 dist/ 目录，再执行 cap add android。

### Q: Gradle 同步失败，提示 SDK 版本不匹配
**A:** 打开 Android Studio > SDK Manager，安装对应版本的 SDK Platform。检查 `android/variables.gradle` 中的 `compileSdkVersion` 和 `targetSdkVersion`。

### Q: 白屏 / 资源加载 404
**A:** 确认 `vite.config.ts` 中 `base: './'`（相对路径）。运行 `npx cap sync android` 重新同步资源。

### Q: 触控不灵敏或画面拉伸
**A:** 确认 `index.html` 的 viewport 设置正确（已配置 `viewport-fit=cover`）。竖屏锁定见上文。

### Q: APK 体积过大
**A:** 检查 assets 是否有未压缩的大文件。Vite 构建会自动 tree-shaking，但图片/音频资源需手动优化。

### Q: 状态栏 / 安全区遮挡
**A:** 使用 `viewport-fit=cover` + CSS `env(safe-area-inset-*)` 处理刘海屏。主题色 `#0b0e14` 已在 Capacitor 配置中设置。

### Q: 每次修改代码后如何更新到手机
**A:** 运行 `npm run cap:sync`（或 `node scripts/build-android.mjs`），然后在 Android Studio 中重新 Run。

## 项目配置说明

| 配置项 | 值 |
|--------|-----|
| appId | com.zhemgame.xiuxiandungeon |
| appName | 修仙与地下城 |
| webDir | dist |
| 背景色 | #0b0e14 |
| 方向 | 竖屏 (portrait) |
