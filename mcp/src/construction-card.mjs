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

/**
 * The identity line ahead of the card is 97 characters plus a blank line, so a
 * card of 1,949 would end exactly on the 2,048th character. 1,940 keeps a small
 * margin under that ceiling; the contract test measures the real end offset in
 * the rendered instructions rather than trusting this number.
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
 * The `## Competency answers` layout, for the `competency` guide topic.
 *
 * `finalize_project_meaning` parses that section with
 * `parseProjectCompetencyMarkdown` in `project-meaning-receipt.mjs`, which
 * accepts only the exact shape `renderProjectCompetencyMarkdown` emits. A trial
 * run on an unfamiliar repository had to read that parser's source to learn the
 * shape, because no error and no guide stated it — so it is stated here, and
 * `construction-card.test.mjs` feeds the example below back through the real
 * parser so this text cannot drift away from what the parser accepts.
 */
/**
 * The one- or two-sentence layout reminder appended to the `finalize_project_meaning`
 * refusal. It lives beside the guide it points at so the refusal and the guide
 * cannot describe two different layouts, and `tools/project-source.mjs` imports
 * it rather than retyping the sentence.
 */
export const COMPETENCY_SECTION_HINT_EN = 'The project body needs exactly one `## Competency answers` section holding five `### <id>: answered|partial|visible-gap` rows in the order scope, domains, abilities, evidence, impact; each row repeats its fixed question verbatim, then a blank line, then the answer, then optional `- Concepts:` / `- Relations:` / `- Evidence:` / `- Paths:` / `- Gap:` rows in that order. Call **connection_info**({guide:"competency"}) for the exact layout and a complete example.';

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
