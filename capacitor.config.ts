import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.zhemgame.xiuxiandungeon',
  appName: '修仙与地下城',
  webDir: 'dist',
  android: {
    backgroundColor: '#0b0e14',
    webContentsDebuggingEnabled: false,
  },
}

export default config
