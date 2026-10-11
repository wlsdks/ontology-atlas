import { defineConfig } from 'vitest/config';
import { parseCLI } from 'vitest/node';
import react from '@vitejs/plugin-react';
import path from 'path';

import packageJson from './package.json' with { type: 'json' };

// Only these contract files render components; source/parser guards need no DOM.
const domContracts = [
  'tests/contract/brand-asset-parity.contract.test.ts',
  'tests/contract/node-kind-shape-parity.contract.test.ts',
];
// Vitest 4 does not forward CLI exclude options into inline projects.
// Use its own parser and carry the exclusions into both project inventories.
const cliExcludes = parseCLI(['vitest', ...process.argv.slice(2)], { allowUnknownOptions: true }).options.exclude ?? [];

/** Measurement files, owned by the `perf` project below and kept out of every sharded sweep. */
const PERF_FILES = ['app/**/*.perf.test.{ts,tsx}', 'src/**/*.perf.test.{ts,tsx}'];

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    /*
     * A hang detector, not a budget: the 5,000 ms default has no headroom on starved runners. One value
     * for every invocation including CI; no test narrows it, and product timing claims belong in a
     * measured budget (`.claude/rules/testing.md`).
     */
    testTimeout: 30_000,
    /*
     * ⚠️ Mirrors what `next.config.ts` does at build time. `/download` reads its version from
     * `package.json` rather than carrying a copy, and without this the tests would see the
     * deliberate `unknown` fallback and fail on a repair that is working correctly.
     */
    env: { NEXT_PUBLIC_RELEASE_VERSION: packageJson.version },
    // Composes messages/<locale>.json from its parts before any test imports it.
    globalSetup: ['./scripts/build-messages.mjs'],
    projects: [
      {
        extends: true,
        test: {
          name: 'contract-node',
          environment: 'node',
          setupFiles: [],
          include: ['tests/contract/**/*.test.ts'],
          exclude: [...domContracts, ...cliExcludes],
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
          exclude: ['tests/e2e/**', ...PERF_FILES, ...cliExcludes],
        },
      },
      /*
       * A performance file runs alone: its result is a ratio and the side holding memory pays for company
       * in GC. `fileParallelism: false` keeps sibling workers off the machine.
       */
      {
        extends: true,
        test: {
          name: 'perf',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: [...PERF_FILES],
          exclude: ['tests/e2e/**', ...cliExcludes],
          fileParallelism: false,
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
