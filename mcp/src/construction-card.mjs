/**
 * The construction card — the one block that survives a truncating host.
 *
 * Measured in a live Claude Code session: that host keeps only the FIRST 2,048
 * CHARACTERS of an MCP server's `instructions` string. The ontology-atlas
 * instructions are ~39,000 characters, so the meta-model boundary (offset
 * 2,818), the construction lifecycle (4,621), the starting workflows (7,029),
 * write-tool safety (30,024) and the construction rules (35,606) never reached
 * an attached agent at all. Per-tool descriptions, by contrast, are delivered in
 * full, which is why the long-form rules are also reachable on demand through
 * `connection_info({guide})`.
 *
 * So this card is the contract for a model that reads NOTHING ELSE: it must fit
 * inside the surviving window together with one identity line, and it must be
 * enough to construct correctly on its own. `CONSTRUCTION_CARD_MAX_CHARS` and
 * `tests/contract/mcp-instructions-card.contract.test.ts` hold that budget.
 */

/** 1,900 leaves room for the identity line ahead of the card inside 2,048. */
export const CONSTRUCTION_CARD_MAX_CHARS = 1900;

/** The on-demand long-form topics `connection_info({guide})` accepts. */
export const CONSTRUCTION_GUIDE_TOPICS = Object.freeze([
  'meta_model',
  'construction',
  'lifecycle',
  'write_safety',
  'workflows',
]);

export const CONSTRUCTION_CARD_EN = `## Construction card — your host may cut what follows

1. Each \`.md\` with frontmatter \`kind:\` is one node; frontmatter is the graph. The person owns meaning: you propose, they decide.
2. Five authorable kinds, one admission test each. project = the outcome the code exists to create. domain = a stable responsibility boundary, not a folder or team. capability = an observable ability the product performs, with one implementation entry point. element = a distinct implementation role a capability uses, named by role, not by file. document = narrative that describes a concept. \`vault-readme\` is reserved; never author it. A folder, package, README heading or path is evidence, never a concept by itself.
3. Every node you create or patch: a definition sentence in the body; \`## Includes\` and \`## Excludes\` bullets stating product boundaries, and an Excludes bullet may not be an evidence limit like "not mentioned in this scan" — that is uncertainty; for capability and element one \`path:\` naming a FILE (a folder cannot be checked for drift) or an \`elements:\` role; \`why\` on every relation; \`labels\` for every locale the vault already uses.
4. Order: \`connection_info\` → \`list_kinds\` → \`find_evidence\` / \`query_ontology similar_nodes\` before any create → propose in plain sentences → the person approves → \`add_concepts\` in batches of at most 12 with bodies filled → \`add_relations\` with \`why\` → \`validate_vault\` → \`connect_project_source\` → \`finalize_project_meaning\`. Prefer \`patch_concept\` on a near-twin over a new node. Warnings never block a write; each names its repair call.
5. The bulk \`analyze_repo_structure\` writePlan needs an independent evaluator. With none here, do not fabricate one and do not stall — build in reviewed small batches.
6. Long rules on demand: \`connection_info({guide:"<topic>"})\`; topics \`meta_model\`, \`construction\`, \`lifecycle\`, \`write_safety\`, \`workflows\`.`;
