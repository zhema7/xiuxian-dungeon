import { defineConfig } from 'vite'

// 小红书小工具构建配置：输出 IIFE 经典脚本（非 ESM module）
// 容器 CSP 不支持 type="module" 且无 HTTP 服务，需单文件经典脚本
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-minitool',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'game.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
})
