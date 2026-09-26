/** Whole-repository quality gates: source language, dead code, TypeScript, ESLint, and the Vitest harness. */

export const rules = [
  {
    order: 200,
    command: 'pnpm test:source:language',
    reason: 'source-comment language inventory or ratchet implementation changed',
    matches: [/^scripts\/quality\/source-language\//],
  },
  {
    order: 210,
    command: 'pnpm knip',
    reason: 'dead-code analyzer scope, configuration, package, or implementation changed',
    matches: [
      /^(?:app|src)\/.+\.(?:[cm]?[jt]sx?|css)$/,
      /^scripts\/(?:quality\/dead-code\/.+|.+\.(?:mjs|js))$/,
      /^cli\/(?:src\/|package(?:-lock)?\.json$|pnpm-lock\.yaml$)/,
      /^mcp\/(?:src\/|scripts\/|package(?:-lock)?\.json$|pnpm-lock\.yaml$)/,
      /^(?:package(?:-lock)?\.json|pnpm-lock\.yaml|next\.config\.ts|tsconfig(?:\.[^/]+)?\.json|vitest\.config\.ts|playwright\.config\.ts|postcss\.config\.mjs)$/,
    ],
  },
  {
    order: 710,
    command: 'pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-schema.contract.test.ts',
    reason: 'Vitest config, setup, or test discovery changed',
    matches: [/^vitest\.config\.ts$/, /^vitest\.setup\.ts$/],
  },
  {
    order: 970,
    command: 'pnpm exec tsc --noEmit',
    reason: 'TypeScript or Next.js static export config changed',
    /*
     * ⚠️ **Do not exclude test files** (corrected 2026-08-21).
     *
     * This used to exclude `.test.`/`.spec.` under `src/**` with a negative lookahead
     * and never looked at `tests/**` at all, presumably on the premise that tests do
     * not affect product types. But **`tsconfig.json`'s `include` is all of
     * `**\/*.ts`**, so CI's `tsc --noEmit` checks them — and **vitest does not check
     * types**. Anyone who edited only tests therefore had no way to meet a type error
     * locally, and it first went red in the `Types · Lint · Docs` job.
     *
     * It broke exactly that way (2026-08-21, `#1180`): a fake `spawn` stub added to a
     * contract test did not match `SpawnSyncReturns`. All 25 unit tests were green.
     *
     * This is what the repository already decided about gates: **wherever the check's
     * reach differs from the advisor's reach, that difference surfaces only in CI.**
     */
    matches: [
      /^app\/.*\.(?:ts|tsx)$/,
      /^next\.config\.ts$/,
      /^next-env\.d\.ts$/,
      /^src\/.*\.(?:ts|tsx)$/,
      /^tests\/.*\.(?:ts|tsx)$/,
      /^tsconfig\.json$/,
    ],
  },
  {
    order: 1010,
    command: 'pnpm lint',
    reason: 'ESLint boundary or style rules changed',
    matches: [/^eslint\.config\.mjs$/],
  },
];
