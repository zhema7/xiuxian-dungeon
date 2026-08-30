// ---------- Vitest 配置 ----------
// 说明：本机环境的 node_modules 受写保护（删除/覆盖被拦截），vitest 无法直接装进项目。
// 因此在项目外独立目录（../vitest-env）安装 vitest@3，通过 resolve.alias 指向它。
// 运行：node ../vitest-env/node_modules/vitest/vitest.mjs run --config ./vitest.config.ts

import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = fileURLToPath(new URL('.', import.meta.url))
const VITEST_ENV = path.resolve(here, '..', 'vitest-env')

export default {
  resolve: {
    alias: [
      // 让测试文件里的 import 'vitest' 解析到外部独立环境中的 vitest@3
      { find: 'vitest', replacement: path.join(VITEST_ENV, 'node_modules/vitest/dist/index.js') },
    ],
  },
  server: {
    fs: { allow: [VITEST_ENV] },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // WorkBuddy hosts can over-provision file workers; cap to two to retain parallel coverage
    // while preventing the intermittent process-level nonzero exit seen at default worker count.
    pool: 'threads',
    minWorkers: 2,
    maxWorkers: 2,
  },
}
