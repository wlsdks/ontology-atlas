/** Agent instructions and harness: hooks, agent files, PO and skill routing instruments. */

export const rules = [
  {
    order: 590,
    command: 'pnpm test:claude:hooks',
    reason: 'agent hook wiring, a guard, or the commit-message gate changed',
    /*
     * This list named two of the four hook scripts, so editing the Git guard or
     * the generated-output guard recommended nothing that tests them (measured
     * 2026-08-24). A gate that covers half its own subject set is the shape this
     * repository keeps finding; match the directories instead of enumerating
     * files, so a new hook is covered the day it lands.
     */
    matches: [
      /^\.claude\/hooks\/.+\.sh$/,
      /^\.claude\/settings\.json$/,
      /^\.codex\/hooks\.json$/,
      /^\.codex\/hooks\/.+\.sh$/,
      /^\.githooks\/(?:commit-msg|commit-msg-language\.mjs)$/,
      /^\.gitignore$/,
      /^scripts\/claude-hooks\.test\.mjs$/,
    ],
  },
  {
    order: 600,
    command: 'pnpm agents:check',
    reason: 'agent instructions changed: per-harness integrity, references, MCP grants, and the Codex cap',
    /*
     * CI has run this since it existed, but nothing recommended it locally, so
     * the answer to "did I break the mirror" cost an eight-minute CI round
     * instead of the fifty milliseconds it actually takes (measured
     * 2026-08-24).
     */
    matches: [
      /^CLAUDE\.md$/,
      /^AGENTS\.md$/,
      /^[^/]+\/AGENTS\.md$/,
      /^\.claude\/(?:agents|skills|hooks|rules)\/.+/,
      /^\.claude\/settings\.json$/,
      /^\.agents\/.+/,
      /^\.codex\/.+/,
      /^\.mcp\.json$/,
      /^cli\/src\/lib\/agent-files\.mjs$/,
      /^cli\/src\/commands\/agent-files\.mjs$/,
    ],
  },
  {
    order: 610,
    command: 'pnpm exec vitest run tests/contract/agent-files.contract.test.ts tests/contract/nested-agents-pointers.contract.test.ts tests/contract/skill-routing.contract.test.ts tests/contract/rules-path-scope.contract.test.ts tests/contract/secret-read-guard.contract.test.ts tests/contract/node-test-reachability.contract.test.ts tests/contract/agent-file-citations.contract.test.ts',
    reason: 'one side of the agent-files pair, or a rule glob the nested pointers derive from, changed',
    /*
     * `cli/src/lib/agent-files.mjs` and `src/views/docs-vault/lib/agent-files.ts`
     * are two implementations of one contract, and the nested `AGENTS.md`
     * pointers derive their expected rule set from `.claude/rules/` frontmatter.
     * Editing either side alone recommended neither contract, which is how a
     * mirror silently diverged for a full iteration (measured 2026-08-24).
     */
    matches: [
      /^cli\/src\/lib\/agent-files\.mjs$/,
      /^src\/views\/docs-vault\/lib\/agent-files\.ts$/,
      /^tests\/fixtures\/agent-files-cases\.mjs$/,
      /^\.claude\/rules\/[^/]+\.md$/,
      /^[^/]+\/AGENTS\.md$/,
      /^AGENTS\.md$/,
      /^CLAUDE\.md$/,
      /^\.claude\/skills\/[^/]+\/SKILL\.md$/,
      /^\.agents\/skills\/[^/]+\/SKILL\.md$/,
      /^tests\/contract\/rules-path-scope\.contract\.test\.ts$/,
      /^tests\/contract\/secret-read-guard\.contract\.test\.ts$/,
      /^\.gitignore$/,
      /^\.claude\/settings\.json$/,
      /^package\.json$/,
      /^\.github\/workflows\/[^/]+\.ya?ml$/,
      /^tests\/contract\/node-test-reachability\.contract\.test\.ts$/,
      /^tests\/contract\/agent-file-citations\.contract\.test\.ts$/,
    ],
  },
  {
    order: 650,
    command: 'pnpm test:po',
    reason: 'Atlas outcome routing, reviewer map, or measured pilot contract changed',
    matches: [
      /^scripts\/(?:lib\/po-(?:risk-router|pilot)|po-(?:risk-router|pilot))\.mjs$/,
      /^scripts\/check-decision-record\.mjs$/,
      /^tests\/contract\/po-council\.contract\.test\.ts$/,
      /^docs\/(?:PRODUCT-OWNER-OPERATING-SYSTEM|PO-PILOT)\.md$/,
      /^docs\/records\/po-(?:runs|updates|policy)\//,
      /^scripts\/(?:lib\/po-pilot-records|po-record)(?:\.test)?\.mjs$/,
      /^\.(?:claude|agents)\/skills\/po-(?:pass|council)\/SKILL\.md$/,
      /^\.(?:claude|agents)\/agents\/(?:chief|po-(?:evidence|steward|wedge|leverage|craft))\.md$/,
      /^AGENTS\.md$/,
      /^package\.json$/,
    ],
  },
  {
    order: 660,
    command: 'pnpm po:pilot -- --check',
    reason: 'Atlas PO pilot policy or register changed — validate metrics and the forced sunset',
    matches: [
      /^scripts\/(?:lib\/po-(?:risk-router|pilot)|po-(?:risk-router|pilot))\.mjs$/,
      /^scripts\/check-decision-record\.mjs$/,
      /^tests\/contract\/po-council\.contract\.test\.ts$/,
      /^docs\/(?:PRODUCT-OWNER-OPERATING-SYSTEM|PO-PILOT)\.md$/,
      /^docs\/records\/po-(?:runs|updates|policy)\//,
      /^scripts\/(?:lib\/po-pilot-records|po-record)(?:\.test)?\.mjs$/,
      /^\.(?:claude|agents)\/skills\/po-(?:pass|council)\/SKILL\.md$/,
      /^\.(?:claude|agents)\/agents\/(?:chief|po-(?:evidence|steward|wedge|leverage|craft))\.md$/,
      /^AGENTS\.md$/,
      /^package\.json$/,
    ],
  },
  {
    order: 700,
    /*
     * The skill-integrity instrument. It is a discovery tool rather than a product
     * feature, but its verdict logic is a pure function and has tests. A check the tool
     * cannot point at is a check that does not exist.
     */
    command: 'pnpm test:skills:audit',
    reason: 'Claude skill integrity instrument changed',
    matches: [/^scripts\/audit-claude-skills\.(?:mjs|test\.mjs)$/],
  },
];
