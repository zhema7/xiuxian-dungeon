// 安卓打包自动化脚本
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const root = process.cwd()
const androidDir = join(root, 'android')

function run(cmd) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: root })
}

console.log('=== 修仙与地下城 · 安卓打包流程 ===\n')

if (!existsSync(join(root, 'node_modules', '@capacitor', 'cli'))) {
  console.error('错误：@capacitor/cli 未安装，请先运行 npm install')
  process.exit(1)
}

console.log('[1/4] 检查 Capacitor 依赖... OK')

console.log('\n[2/4] 构建 Web 资源 (vite build)...')
run('npx vite build')

if (!existsSync(androidDir)) {
  console.log('\n[3/4] Android 平台尚未添加，跳过 cap sync')
  console.log('  首次使用请先运行：npx cap add android')
  console.log('  然后重新运行：node scripts/build-android.mjs')
} else {
  console.log('\n[3/4] 同步到 Android 项目 (cap sync android)...')
  run('npx cap sync android')
}

console.log(`
[4/4] 后续步骤：
  1. 打开 Android Studio：npx cap open android
  2. 等待 Gradle 同步完成
  3. Build > Build Bundle(s) / APK(s) > Build APK(s)
  4. APK 输出路径：android/app/build/outputs/apk/debug/app-debug.apk

竖屏锁定（添加 Android 平台后）：
  编辑 android/app/src/main/AndroidManifest.xml，
  在 <activity> 标签添加：
    android:screenOrientation="portrait"
    android:resizeableActivity="false"

签名发布 APK：
  Android Studio > Build > Generate Signed Bundle / APK
`)
