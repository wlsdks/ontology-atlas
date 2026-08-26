import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    /*
     * ⚠️ Mirrors what `next.config.ts` does at build time. `/download` reads its version from
     * `package.json` rather than carrying a copy, and without this the tests would see the
     * deliberate `unknown` fallback and fail on a repair that is working correctly.
     */
    env: { NEXT_PUBLIC_RELEASE_VERSION: packageJson.version },
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'app/**/*.test.{ts,tsx}',
      'app/**/*.spec.{ts,tsx}',
      'src/**/*.test.{ts,tsx}',
      'src/**/*.spec.{ts,tsx}',
      'tests/contract/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**'],
    // Externalizing next-intl to Node ESM causes the `next/navigation` subpath
    // to fail resolving relative to the pnpm virtual store realpath, breaking
    // test file loading itself (manifested as 15 files failing simultaneously during 2026-07 refactoring). Vite
    // inlining allows the vite resolver to interpret the subpath.
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
  },
  resolve: {
    // @rollup/plugin-alias matches prefixes in registration order and adopts the first match.
    // Therefore, specific prefixes (`@/shared`, etc.) must be placed before general prefixes (`@`)
    // to correctly rewrite `@/shared/api` → `src/shared/api`.
    alias: {
      '@/app-providers': path.resolve(__dirname, './src/app'),
      '@/views': path.resolve(__dirname, './src/views'),
      '@/widgets': path.resolve(__dirname, './src/widgets'),
      '@/features': path.resolve(__dirname, './src/features'),
      '@/entities': path.resolve(__dirname, './src/entities'),
      '@/shared': path.resolve(__dirname, './src/shared'),
      // Consistent with tsconfig paths `@/i18n/*` — explicitly prevents vitest's fallback `@/*` →
      // `./*` from incorrectly resolving `@/i18n/foo` to `./i18n/foo` (non-existent). Currently, there
      // are no i18n alias imports in .test.{ts,tsx}, so this was a latent regression.
      '@/i18n': path.resolve(__dirname, './src/i18n'),
      '@': path.resolve(__dirname, './'),
    },
  },
});
