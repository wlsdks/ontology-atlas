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
     * ⚠️ **Do not use a readout as a gate** (corrected by measurement, 2026-08-21).
     *
     * What used to be here was `pnpm dogfood:status`. That command exits **1 even when
     * the graph is merely immature** — its `health` child reports `needs_attention` for
     * "this project's competency answers are not filled in yet", while the output
     * itself says ***"Nothing is broken"***.
     *
     * Measured: **it is 1 on main too.** So every push that edited the vault was
     * blocked **for an unrelated reason** (this rule is wired into the pre-push hook,
     * and it really did block). Clearing that state (`finalize_project_meaning`) is
     * something the tool itself pins as **not to be done without human approval**, so an
     * agent cannot quietly step past it either.
     *
     * Instead the gate is **a check that only speaks when something is broken**:
     * `vault:validate` measures frontmatter integrity and graph references and fails
     * only when they are actually broken (CI uses it too). `dogfood:status` remains a
     * readout for a person — it is not removed, it is **taken out of the gate slot**.
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
     * **A vault section that outgrows its cap is holding more than one idea.**
     *
     * Measured 2026-08-25: `capabilities/mcp-server.md` carried a single
     * `## Core Flow` of 12,865 bytes — five lines of flow followed by twenty-two
     * paragraphs of hard limits and fail-closed rules. Nothing there was wrong;
     * an agent simply had to read 12 KB named "Core Flow" to reach any rule.
     *
     * `vault:validate` checks frontmatter integrity and the em-dash ratchet
     * checks copy, so neither can see body shape. This is a third measurement.
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
