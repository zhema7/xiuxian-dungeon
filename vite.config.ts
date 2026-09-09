/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { host: true },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Three.js 及其插件单独分块（仅在 3D 模式下才需要）
          three: [
            'three',
            'three/examples/jsm/postprocessing/EffectComposer.js',
            'three/examples/jsm/postprocessing/RenderPass.js',
            'three/examples/jsm/postprocessing/UnrealBloomPass.js',
            'three/examples/jsm/postprocessing/BokehPass.js',
            'three/examples/jsm/postprocessing/OutputPass.js',
          ],
          // Phaser 游戏引擎单独分块
          phaser: ['phaser'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
