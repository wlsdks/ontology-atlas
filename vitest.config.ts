import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

import packageJson from './package.json' with { type: 'json' };

// Only these contract files render components; source/parser guards need no DOM.
const domContracts = [
  'tests/contract/brand-asset-parity.contract.test.ts',
  'tests/contract/node-kind-shape-parity.contract.test.ts',
];

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    /*
     * **A hang detector, not a budget** (2026-09-12).
     *
     * Vitest's default is 5,000 ms, and that default is what actually failed. Measured:
     * the two `FirstRunStarterModule` modal-close cases cost **152 ms and 15 ms** run
     * alone, and timed out at 5007 and 5002 ms on an oversubscribed two-core CI runner
     * (run 34693905255: environment 590 s against 421 s of wall clock) and again in a
     * 411 s pre-push `unit` lane on a branch that does not touch that file. Nothing
     * there is slow; 5,000 ms was simply the only ceiling in the suite with no headroom,
     * and a starved test with no headroom tips over first.
     *
     * The pre-push hook used to paper over this with a per-lane `--testTimeout=30000`,
     * which meant the suite had a different clock depending on who invoked it. One value
     * here instead, applying to every invocation including CI: ~200x the measured cost of
     * the slowest ordinary case, so only a genuine hang reaches it.
     *
     * This is not a wall-clock assertion. Nothing is asserted about it, no test may
     * narrow it at a call site, and a product timing claim belongs in a measured budget
     * with its number printed (`.claude/rules/testing.md`, "The timing rule").
     */
    testTimeout: 30_000,
    /*
     * ⚠️ Mirrors what `next.config.ts` does at build time. `/download` reads its version from
     * `package.json` rather than carrying a copy, and without this the tests would see the
     * deliberate `unknown` fallback and fail on a repair that is working correctly.
     */
    env: { NEXT_PUBLIC_RELEASE_VERSION: packageJson.version },
    projects: [
      {
        extends: true,
        test: {
          name: 'contract-node',
          environment: 'node',
          setupFiles: [],
          include: ['tests/contract/**/*.test.ts'],
          exclude: domContracts,
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: [
            'app/**/*.test.{ts,tsx}',
            'app/**/*.spec.{ts,tsx}',
            'src/**/*.test.{ts,tsx}',
            'src/**/*.spec.{ts,tsx}',
            ...domContracts,
          ],
          exclude: ['tests/e2e/**'],
        },
      },
    ],
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
