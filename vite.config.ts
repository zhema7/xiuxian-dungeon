/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { host: true },
  build: {
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
