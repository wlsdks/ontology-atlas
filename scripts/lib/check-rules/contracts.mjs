/** Cross-package contracts: the architecture profile and the contract suite that scans UI files from disk. */

export const rules = [
  {
    order: 410,
    command: 'pnpm test:architecture',
    reason: 'architecture profile, conformance, agent packet, and cross-surface parity changed',
    matches: [
      /^docs\/ontology\/architecture\//,
      /^mcp\/src\/architecture-profile\.(?:mjs|test\.mjs)$/,
      /^cli\/src\/(?:commands\/repo-analysis\/architecture|lib\/analysis-results\/architecture-results)\.mjs$/,
      /^src\/entities\/architecture-profile\//,
      /^src\/views\/architecture\//,
      /^tests\/contract\/harness\/architecture-profile\.contract\.test\.ts$/,
      /^tests\/fixtures\/architecture-profile-cases\.mjs$/,
    ],
  },
  {
    order: 440,
    command: 'pnpm test:contracts',
    reason:
      'cross-package parser/schema contract, or a UI file the design-system and a11y contracts scan from disk',
    matches: [
      // Several gates in `tests/contract/` read the file system directly (ramp coverage, ratchets,
      // forbidden classes, `audited-route-coverage`), so a newly created UI file is their input.
      /^(?:src|app)\/.*\.tsx$/,
      /^tests\/contract\/(?:vault-format|design-tokens|agent-chat|security|desktop|control-adoption|layout|routes|controls|harness|agent-instructions|mcp|analysis|architecture|brand|vault-data|map|typography|messages|ci-gates|cli|library|copy|motion|settings|release\/)?/,
      /^tests\/fixtures\/(?:frontmatter|frontmatter-writer|validate-vault|vault-schema)-cases\.mjs$/,
      /^mcp\/src\/(?:parser|schema|validate)\.mjs$/,
      /^cli\/src\/lib\/mcp-bridge\/(?:parse-frontmatter|schema|validate)\.mjs$/,
      /^cli\/src\/commands\/local-vault\/validate\.mjs$/,
      /^scripts\/lib\/parse-frontmatter\.mjs$/,
      /^src\/shared\/lib\/vault-document\/(?:parse-frontmatter|validate-vault-document)\.ts$/,
      /^scripts\/vault\/migrate-vault\.mjs$/,
      /^scripts\/migrations\/[^/]+\.mjs$/,
    ],
  },
  {
    order: 445,
    command: 'pnpm exec vitest run tests/contract/controls/ime-enter-guard.contract.test.ts',
    reason: 'a TypeScript source can hold an Enter handler, which must wait for IME composition to end',
    matches: [/^(?:src|app)\/(?!.*\.(?:test|spec)\.ts$).*\.ts$/],
  },
];
