/** The ontology vault: validation, audit, migration, and section shape. */

export const rules = [
  {
    order: 290,
    command: 'pnpm test:vault:validate',
    reason: 'vault validator script changed',
    matches: [/^scripts\/vault\/validate-vault(?:-script)?\.test\.mjs$/, /^scripts\/vault\/validate-vault\.mjs$/],
  },
  {
    order: 300,
    command: 'pnpm test:vault:audit',
    reason: 'vault path audit script changed',
    matches: [/^scripts\/vault\/audit-vault-paths\.(?:mjs|test\.mjs)$/],
  },
  {
    order: 390,
    command: 'pnpm test:vault:migrate',
    reason: 'vault migration behavior changed',
    matches: [
      /^scripts\/vault\/migrate-vault\.(?:mjs|test\.mjs)$/,
      /^scripts\/vault\/migrate-node-uids\.(?:mjs|test\.mjs)$/,
      /^scripts\/migrations\/[^/]+\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    order: 400,
    command: 'pnpm vault:migrate --list',
    reason: 'vault migration inventory or runner changed',
    matches: [
      /^scripts\/vault\/migrate-vault\.mjs$/,
      /^scripts\/migrations\/(?:README\.md|[^/]+\.mjs)$/,
    ],
  },
  {
    order: 1310,
    /*
     * Do not use a readout as a gate: `dogfood:status` exits 1 on an immature graph, which would block
     * unrelated pushes. `vault:validate` speaks only when frontmatter or references are broken.
     */
    command: 'pnpm vault:validate',
    reason: 'dogfood ontology or MCP dogfood surface changed',
    matches: [/^docs\/ontology\//, /^mcp\//, /^cli\//, /^scripts\/dogfood\/dogfood/],
  },
  {
    order: 1340,
    /*
     * A vault section that outgrows its cap holds more than one idea; neither `vault:validate`
     * (frontmatter) nor the em-dash ratchet (copy) sees body shape.
     */
    command: 'pnpm test:run tests/contract/vault-data/vault-section-shape.contract.test.ts',
    reason: 'vault node bodies changed — a section may now hold more than one idea',
    matches: [/^docs\/ontology\/.*\.md$/],
  },
  {
    order: 1345,
    /*
     * Two MCP tests read the dogfood vault itself: the drift test resolves every `path:` against
     * the repository and the receipt test reads the project node. A vault edit is their input.
     */
    command: 'pnpm exec node --test mcp/src/drift/detect-drift.test.mjs mcp/src/project-meaning/project-meaning-receipt.test.mjs',
    reason: 'the dogfood vault changed — the MCP tests that read it run',
    matches: [/^docs\/ontology\//],
  },
];

export const directTests = {
  script: [
    ['scripts/vault/audit-vault-paths.mjs', 'scripts/vault/audit-vault-paths.test.mjs'],
    ['scripts/vault/audit-vault-paths.test.mjs', 'scripts/vault/audit-vault-paths.test.mjs'],
    ['scripts/vault/validate-vault.mjs', 'scripts/vault/validate-vault-script.test.mjs'],
    ['scripts/vault/validate-vault-script.test.mjs', 'scripts/vault/validate-vault-script.test.mjs'],
  ],
};
