/**
 * The construction card: the block that survives a host truncating the
 * instructions string (Claude Code keeps only its first 2,048 characters). It must
 * fit that window with the identity line and suffice alone; long-form rules are
 * on demand through `connection_info({guide})`. The contract test
 * tests/contract/mcp-instructions-card.contract.test.ts holds the budget.
 */

/**
 * A 97-character identity line and a blank line precede the card, so 1,949 would
 * end on the 2,048th character; 1,940 leaves a margin, and the contract test
 * measures the real offset.
 */
export const CONSTRUCTION_CARD_MAX_CHARS = 1940;

/** The on-demand long-form topics `connection_info({guide})` accepts. */
export const CONSTRUCTION_GUIDE_TOPICS = Object.freeze([
  'meta_model',
  'construction',
  'lifecycle',
  'write_safety',
  'workflows',
  'competency',
]);

export const CONSTRUCTION_CARD_EN = `## Construction card

1. Each \`.md\` with frontmatter \`kind:\` is a node; frontmatter is the graph. You propose, the person decides.
2. Five authorable kinds: project = the outcome the code exists to create. domain = a stable responsibility boundary, not a folder or team. capability = an observable ability the product performs, with one entry point. element = a distinct implementation role a capability uses, named by role not file. document = narrative describing a concept. Never author \`vault-readme\`. A folder, package, README heading or path is evidence, not a concept.
3. On every create or patch: a slug under the kind folder (\`domains/x\`, \`capabilities/x\`, \`elements/x\`; project/document at root), flat, never a code path; a definition sentence in the body; \`## Includes\` / \`## Excludes\` bullets stating product boundaries, an Excludes bullet may not be an evidence limit; an \`## Uncertainty\` line naming what you did not read or could not check ("not mentioned in this scan" goes there; a node with no stated unknown claims completeness); for capability/element one \`path:\` naming a FILE (a folder cannot be drift-checked) or an \`elements:\` role; \`why\` on every relation; \`labels\` for every locale the vault uses.
4. Order: \`connection_info\` → \`list_kinds\` → \`find_evidence\` / \`query_ontology similar_nodes\` before any create → propose in sentences, they approve → \`add_concepts\` in batches of ≤12 with bodies → \`add_relations\` with \`why\` → \`validate_vault\` → \`connect_project_source\` → \`finalize_project_meaning\`. Prefer \`patch_concept\` on a near-twin. Warnings never block a write; each names its repair call.
5. The bulk \`analyze_repo_structure\` writePlan needs an independent evaluator; with none here, do not fabricate one or stall; build in small reviewed batches.
6. Long rules on demand: \`connection_info({guide:"<topic>"})\`; topics \`meta_model\`, \`construction\`, \`lifecycle\`, \`write_safety\`, \`workflows\`, \`competency\`.`;

/**
 * The layout reminder appended to the finalize_project_meaning refusal, beside
 * the guide it points at; `tools/project-source.mjs` imports it.
 */
export const COMPETENCY_SECTION_HINT_EN = 'The project body needs exactly one `## Competency answers` section holding five `### <id>: answered|partial|visible-gap` rows in the order scope, domains, abilities, evidence, impact; each row repeats its fixed question verbatim, then a blank line, then the answer, then optional `- Concepts:` / `- Relations:` / `- Evidence:` / `- Paths:` / `- Gap:` rows in that order. Call **connection_info**({guide:"competency"}) for the exact layout and a complete example.';

/**
 * The `## Competency answers` layout for the `competency`
 * guide. `parseProjectCompetencyMarkdown` accepts only
 * what `renderProjectCompetencyMarkdown` emits, and `construction-card.test.mjs`
 * feeds this example through the real parser so it cannot drift.
 */
export const COMPETENCY_ANSWERS_GUIDE_EN = `## Competency answers — the exact section finalize_project_meaning parses

\`finalize_project_meaning\` reads one \`## Competency answers\` section from the
project node's body. The parser is exact: anything else fails with
\`Invalid project competency Markdown: <reason>\` and nothing is written.

1. Exactly one \`## Competency answers\` heading in the body, followed by a blank line.
2. Exactly five rows, in this order, each \`### <id>: <status>\`:
   \`scope\`, \`domains\`, \`abilities\`, \`evidence\`, \`impact\`.
3. \`<status>\` is \`answered\`, \`partial\`, or \`visible-gap\`.
4. Each row is: the heading, a blank line, the row's fixed question copied
   verbatim, a blank line, then your answer prose.
5. Witness rows, if any, follow the answer after one blank line, in this order
   and at most once each: \`- Concepts:\`, \`- Relations:\`, \`- Evidence:\`,
   \`- Paths:\`, \`- Gap:\`.
6. \`Concepts\`, \`Evidence\`, and \`Paths\` are backticked values joined by
   \`, \`. \`Relations\` rows are \`\\\`from\\\` --type--> \\\`to\\\`\`. \`Gap\` is one line of
   plain prose and must be the last row.
7. An \`answered\` row must not declare a \`Gap\`; a \`partial\` or \`visible-gap\` row
   must. An \`answered\` row must also have witnesses that still resolve against
   the current graph, or finalize refuses by name.
8. An \`Evidence\` value is a repository-relative path, or a pinned citation
   \`source:<path>#L<start>-L<end>@sha256:<64 hex>\`. \`Paths\` takes plain paths only.

The five questions are fixed. Copy them exactly:

- \`scope\` — What product/system outcome and user problem define the ontology scope?
- \`domains\` — Which stable business responsibilities or decision boundaries form its domains?
- \`abilities\` — Which observable abilities realize those outcomes inside each domain?
- \`evidence\` — Which source artifacts provide implementation evidence for each ability?
- \`impact\` — Which typed dependencies explain change impact across the model?

A complete section, showing both an answered row and a declared gap:

\`\`\`markdown
## Competency answers

### scope: answered

What product/system outcome and user problem define the ontology scope?

Billing exists so an operator can invoice a customer and see what was charged.

- Concepts: \`billing\`
- Evidence: \`README.md\`

### domains: answered

Which stable business responsibilities or decision boundaries form its domains?

Invoicing owns what a customer is charged; delivery owns when the order ships.

- Concepts: \`domains/invoicing\`
- Relations: \`billing\` --contains--> \`domains/invoicing\`
- Evidence: \`README.md\`

### abilities: answered

Which observable abilities realize those outcomes inside each domain?

Invoicing issues one invoice per completed order.

- Concepts: \`capabilities/issue-invoice\`
- Relations: \`domains/invoicing\` --contains--> \`capabilities/issue-invoice\`
- Evidence: \`src/billing/issue-invoice.ts\`

### evidence: answered

Which source artifacts provide implementation evidence for each ability?

Issuing an invoice enters at the one file the capability's path names.

- Concepts: \`capabilities/issue-invoice\`
- Evidence: \`src/billing/issue-invoice.ts\`
- Paths: \`src/billing/issue-invoice.ts\`

### impact: visible-gap

Which typed dependencies explain change impact across the model?

Invoicing declares one dependency on the tax table; nothing else is declared yet.

- Concepts: \`capabilities/issue-invoice\`
- Relations: \`capabilities/issue-invoice\` --depends_on--> \`elements/tax-table\`
- Evidence: \`src/billing/issue-invoice.ts\`
- Gap: delivery declares no dependency, so its change impact stays unknown.
\`\`\`
`;
