/** Whole-repository quality gates: source language, dead code, TypeScript, ESLint, and the Vitest harness. */

export const rules = [
  {
    order: 200,
    command: 'pnpm test:source:language',
    reason: 'source-comment language inventory or ratchet implementation changed',
    matches: [/^scripts\/quality\/source-language\//],
  },
  {
    order: 205,
    command:
      'pnpm exec vitest run tests/contract/ci-gates/test-title-language.contract.test.ts tests/contract/ci-gates/source-comment-bytes.contract.test.ts',
    reason: 'a test source changed — its titles, assertion messages and comment bytes are judged against the merge base',
    matches: [/\.(?:test|spec)\.[cm]?[jt]sx?$/],
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
    command: 'pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-format/vault-schema.contract.test.ts',
    reason: 'Vitest config, setup, or test discovery changed',
    matches: [/^vitest\.config\.ts$/, /^vitest\.setup\.ts$/],
  },
  {
    order: 970,
    command: 'pnpm typecheck',
    reason: 'TypeScript or Next.js static export config changed',
    /*
     * Do not exclude test files: `tsconfig.json` includes every .ts file, so CI's `tsc --noEmit`
     * checks them, and vitest does not check types.
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
