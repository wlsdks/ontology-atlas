/** Agent instructions and harness: hooks, agent files, PO and skill routing instruments. */

export const rules = [
  {
    order: 585,
    command: 'pnpm exec vitest run tests/contract/agent-instructions/field-trial-replay-scripts.contract.test.ts',
    reason: 'the construction replay or its prompt extractor changed',
    matches: [/^\.claude\/skills\/ontology-field-trial\/scripts\//,
      /^scripts\/lib\/benchmark\/construction-prompts(?:\.test)?\.mjs$/],
  },
  {
    order: 590,
    command: 'pnpm test:claude:hooks',
    reason: 'agent hook wiring, a guard, or the commit-message gate changed',
    /* Match the hook directories, not an enumerated file list, so a new hook is covered the day it lands. */
    matches: [
      /^\.claude\/hooks\/.+\.sh$/,
      /^\.claude\/settings\.json$/,
      /^\.codex\/hooks\.json$/,
      /^\.codex\/hooks\/.+\.sh$/,
      /^\.githooks\/(?:commit-msg|commit-msg-language\.mjs)$/,
      /^\.gitignore$/,
      /^scripts\/harness\/claude-hooks\.test\.mjs$/,
    ],
  },
  {
    order: 600,
    command: 'pnpm agents:check',
    reason: 'agent instructions changed: per-harness integrity, references, MCP grants, and the Codex cap',
    matches: [
      /^CLAUDE\.md$/,
      /^AGENTS\.md$/,
      /^[^/]+\/AGENTS\.md$/,
      /^\.claude\/(?:agents|skills|hooks|rules)\/.+/,
      /^\.claude\/settings\.json$/,
      /^\.agents\/.+/,
      /^\.codex\/.+/,
      /^\.mcp\.json$/,
      /^cli\/src\/lib\/agent-setup\/agent-files\.mjs$/,
      /^cli\/src\/commands\/agent-setup\/agent-files\.mjs$/,
    ],
  },
  {
    order: 610,
    command: 'pnpm exec vitest run tests/contract/harness/agent-files.contract.test.ts tests/contract/agent-instructions/nested-agents-pointers.contract.test.ts tests/contract/agent-instructions/skill-routing.contract.test.ts tests/contract/agent-instructions/rules-path-scope.contract.test.ts tests/contract/security/secret-read-guard.contract.test.ts tests/contract/ci-gates/node-test-reachability.contract.test.ts tests/contract/agent-instructions/agent-file-citations.contract.test.ts',
    reason: 'one side of the agent-files pair, or a rule glob the nested pointers derive from, changed',
    /*
     * The two agent-files implementations are one contract, and nested `AGENTS.md` pointers derive
     * their rule set from `.claude/rules/` frontmatter; editing either side must recommend both
     * contracts.
     */
    matches: [
      /^cli\/src\/lib\/agent-setup\/agent-files\.mjs$/,
      /^src\/entities\/agent-files\/model\/agent-files\.ts$/,
      /^tests\/fixtures\/agent-files-cases\.mjs$/,
      /^\.claude\/rules\/[^/]+\.md$/,
      /^[^/]+\/AGENTS\.md$/,
      /^AGENTS\.md$/,
      /^CLAUDE\.md$/,
      /^\.claude\/skills\/[^/]+\/(?:SKILL|workflow)\.md$/,
      /^\.agents\/skills\/[^/]+\/(?:SKILL|workflow)\.md$/,
      /^tests\/contract\/agent-instructions\/rules-path-scope\.contract\.test\.ts$/,
      /^tests\/contract\/security\/secret-read-guard\.contract\.test\.ts$/,
      /^\.gitignore$/,
      /^\.claude\/settings\.json$/,
      /^package\.json$/,
      /^\.github\/workflows\/[^/]+\.ya?ml$/,
      /^tests\/contract\/ci-gates\/node-test-reachability\.contract\.test\.ts$/,
      /^tests\/contract\/agent-instructions\/agent-file-citations\.contract\.test\.ts$/,
    ],
  },
  {
    order: 650,
    command: 'pnpm test:po',
    reason: 'Atlas outcome routing, reviewer lenses, or measured pilot contract changed',
    matches: [
      /^scripts\/(?:lib\/)?records\/po-(?:risk-router|pilot)\.mjs$/,
      /^scripts\/records\/check-decision-record\.mjs$/,
      /^tests\/contract\/agent-instructions\/(?:po-route|reviewer-wiring)\.contract\.test\.ts$/,
      /^docs\/(?:PRODUCT-OWNER-OPERATING-SYSTEM|PO-PILOT)\.md$/,
      /^docs\/records\/po-(?:runs|updates|policy)\//,
      /^scripts\/lib\/records\/po-pilot-records(?:\.test)?\.mjs$/,
      /^\.(?:claude|agents)\/skills\/product-check\/(?:SKILL|workflow)\.md$/,
      /^\.(?:claude|agents)\/agents\/reviewer\.md$/,
      /^AGENTS\.md$/,
      /^package\.json$/,
    ],
  },
  {
    order: 660,
    command: 'pnpm po:pilot -- --check',
    reason: 'Atlas PO pilot policy or register changed — validate metrics and the forced sunset',
    matches: [
      /^scripts\/(?:lib\/)?records\/po-(?:risk-router|pilot)\.mjs$/,
      /^scripts\/records\/check-decision-record\.mjs$/,
      /^tests\/contract\/agent-instructions\/(?:po-route|reviewer-wiring)\.contract\.test\.ts$/,
      /^docs\/(?:PRODUCT-OWNER-OPERATING-SYSTEM|PO-PILOT)\.md$/,
      /^docs\/records\/po-(?:runs|updates|policy)\//,
      /^scripts\/lib\/records\/po-pilot-records(?:\.test)?\.mjs$/,
      /^\.(?:claude|agents)\/skills\/product-check\/(?:SKILL|workflow)\.md$/,
      /^\.(?:claude|agents)\/agents\/reviewer\.md$/,
      /^AGENTS\.md$/,
      /^package\.json$/,
    ],
  },
  {
    order: 700,
    command: 'pnpm test:skills:audit',
    reason: 'Claude skill integrity instrument changed',
    matches: [/^scripts\/harness\/audit-claude-skills\.(?:mjs|test\.mjs)$/],
  },
];
