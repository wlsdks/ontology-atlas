/** The ontology vault: validation, audit, migration, meaning corpus, the gateway specimen, and section shape. */

export const rules = [
  {
    order: 280,
    command: 'pnpm test:meaning-corpus',
    reason: 'business meaning corpus evaluator or its fixtures changed',
    matches: [
      /^scripts\/evaluate-meaning-corpus(?:\.test)?\.mjs$/,
      /^tests\/fixtures\/meaning-corpus\//,
    ],
  },
  {
    order: 290,
    command: 'pnpm test:vault:validate',
    reason: 'vault validator script changed',
    matches: [/^scripts\/validate-vault(?:-script)?\.test\.mjs$/, /^scripts\/validate-vault\.mjs$/],
  },
  {
    order: 300,
    command: 'pnpm test:vault:audit',
    reason: 'vault path audit script changed',
    matches: [/^scripts\/audit-vault-paths\.(?:mjs|test\.mjs)$/],
  },
  {
    order: 390,
    command: 'pnpm test:vault:migrate',
    reason: 'vault migration behavior changed',
    matches: [
      /^scripts\/migrate-vault\.(?:mjs|test\.mjs)$/,
      /^scripts\/migrate-node-uids\.(?:mjs|test\.mjs)$/,
      /^scripts\/migrations\/[^/]+\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    order: 400,
    command: 'pnpm vault:migrate --list',
    reason: 'vault migration inventory or runner changed',
    matches: [
      /^scripts\/migrate-vault\.mjs$/,
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
    reason: 'dogfood ontology or MCP/CLI dogfood surface changed',
    matches: [/^docs\/ontology\//, /^mcp\//, /^cli\//, /^scripts\/dogfood/],
  },
  {
    order: 1320,
    /*
     * **The gateway shows one vault file verbatim.** `/download`'s evidence section renders the
     * frontmatter of a pinned node and claims it is a file you can open in this repository. That
     * claim is only true while the committed generated copy matches the vault, so editing either
     * side has to re-run the generator.
     *
     * The specimen file itself is the obvious trigger, but so is **any** vault edit: the caption
     * states how many `kind:` nodes exist, which every added or deleted node changes.
     */
    command: 'pnpm gateway:specimen:check',
    reason: 'the vault feeds the gateway evidence specimen (file shown verbatim + node count)',
    matches: [
      /^docs\/ontology\//,
      /^scripts\/generate-evidence-specimen\.mjs$/,
      /^src\/views\/download\/model\/evidence-specimen\.generated\.ts$/,
    ],
  },
  {
    order: 1340,
    /*
     * A vault section that outgrows its cap holds more than one idea; neither `vault:validate`
     * (frontmatter) nor the em-dash ratchet (copy) sees body shape.
     */
    command: 'pnpm test:run tests/contract/vault-section-shape.contract.test.ts',
    reason: 'vault node bodies changed — a section may now hold more than one idea',
    matches: [/^docs\/ontology\/.*\.md$/],
  },
];

export const directTests = {
  script: [
    ['scripts/audit-vault-paths.mjs', 'scripts/audit-vault-paths.test.mjs'],
    ['scripts/audit-vault-paths.test.mjs', 'scripts/audit-vault-paths.test.mjs'],
    ['scripts/validate-vault.mjs', 'scripts/validate-vault-script.test.mjs'],
    ['scripts/validate-vault-script.test.mjs', 'scripts/validate-vault-script.test.mjs'],
  ],
};
