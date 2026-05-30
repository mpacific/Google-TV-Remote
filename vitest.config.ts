import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/__tests__/**/*.test.{ts,js}'],
    environmentMatchGlobs: [
      ['src/__tests__/app.test.js', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      include: ['src/appUtils.ts', 'src/adbUtils.ts', 'src/public/app.js'],
    },
  },
});
