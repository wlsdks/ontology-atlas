// Shared fixture matrix for the agent-files detection contract —
// `cli/src/lib/agent-files.mjs` (developer CLI, full-fs scanner) and
// `src/views/docs-vault/lib/agent-files.ts` (web docs workbench, FSA scanner)
// must produce identical structural verdicts for every case below.
// Consumed by tests/contract/agent-files.contract.test.ts (R11 pattern).
//
// `expected` pins the *structural contract*: classified records (path, rule,
// kind, tools, bytes, per-file drift codes), per-check statuses, and drift
// findings (check/code/path). Human message phrasing is NOT pinned.

export const CASES = [
  {
    name: 'clean bridge — CLAUDE.md imports @AGENTS.md and AGENTS.md exists',
    input: {
      files: [
        { path: 'CLAUDE.md', content: '# CLAUDE.md\n\n@AGENTS.md\n' },
        { path: 'AGENTS.md', content: '# AGENTS.md\n\nguide body\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: 'AGENTS.md', ruleId: 'agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: [] },
        { path: 'CLAUDE.md', ruleId: 'claude-md', kind: 'instructions', tools: ['claude-code'], drift: [] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'ok',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        atRefs: 'ok',
        codexSizeCap: 'ok',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [],
    },
  },
  {
    name: 'bridge drift — both files exist but CLAUDE.md never imports @AGENTS.md',
    input: {
      files: [
        { path: 'CLAUDE.md', content: '# CLAUDE.md\n\nno bridge here\n' },
        { path: 'AGENTS.md', content: '# AGENTS.md\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: 'AGENTS.md', ruleId: 'agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: [] },
        { path: 'CLAUDE.md', ruleId: 'claude-md', kind: 'instructions', tools: ['claude-code'], drift: ['missing-agents-import'] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'drift',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        atRefs: 'not-applicable',
        codexSizeCap: 'ok',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [{ check: 'claude-agents-bridge', code: 'missing-agents-import', path: 'CLAUDE.md' }],
    },
  },
  {
    name: 'bridge drift — a backticked `@AGENTS.md` mention is not a working import',
    input: {
      files: [
        { path: 'CLAUDE.md', content: 'add the `@AGENTS.md` line below\n' },
        { path: 'AGENTS.md', content: '# AGENTS.md\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: 'AGENTS.md', ruleId: 'agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: [] },
        { path: 'CLAUDE.md', ruleId: 'claude-md', kind: 'instructions', tools: ['claude-code'], drift: ['missing-agents-import'] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'drift',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        // the backticked ref still resolves as an @reference target (AGENTS.md
        // exists) — only the *import bridge* treats code spans as non-imports
        atRefs: 'ok',
        codexSizeCap: 'ok',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [{ check: 'claude-agents-bridge', code: 'missing-agents-import', path: 'CLAUDE.md' }],
    },
  },
  {
    name: 'bridge drift — import points at a missing AGENTS.md',
    input: {
      files: [{ path: 'CLAUDE.md', content: '@AGENTS.md\n' }],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: 'CLAUDE.md', ruleId: 'claude-md', kind: 'instructions', tools: ['claude-code'], drift: ['broken-agents-import', 'at-ref-missing'] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'drift',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        atRefs: 'drift',
        codexSizeCap: 'not-applicable',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [
        { check: 'claude-agents-bridge', code: 'broken-agents-import', path: 'CLAUDE.md' },
        { check: 'at-refs', code: 'at-ref-missing', path: 'CLAUDE.md' },
      ],
    },
  },
  {
    name: 'skill copy in sync — identical bytes in both duplicated trees',
    input: {
      files: [
        { path: '.claude/skills/ontology-sync/SKILL.md', content: '# skill\nsame bytes\n' },
        { path: '.agents/skills/ontology-sync/SKILL.md', content: '# skill\nsame bytes\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: '.agents/skills/ontology-sync/SKILL.md', ruleId: 'agents-skills', kind: 'skill', tools: ['codex'], drift: [] },
        { path: '.claude/skills/ontology-sync/SKILL.md', ruleId: 'claude-skills', kind: 'skill', tools: ['claude-code'], drift: [] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'ok',
        agentCopy: 'not-applicable',
        atRefs: 'not-applicable',
        codexSizeCap: 'not-applicable',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [],
    },
  },
  {
    name: 'skill copy drift — the two copies diverged byte-for-byte (this repo\'s own audit scenario)',
    input: {
      files: [
        { path: '.claude/skills/ontology-sync/SKILL.md', content: '# skill\nversion A\n' },
        { path: '.agents/skills/ontology-sync/SKILL.md', content: '# skill\nversion B (edited only here)\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: '.agents/skills/ontology-sync/SKILL.md', ruleId: 'agents-skills', kind: 'skill', tools: ['codex'], drift: ['skill-copy-diverged'] },
        { path: '.claude/skills/ontology-sync/SKILL.md', ruleId: 'claude-skills', kind: 'skill', tools: ['claude-code'], drift: ['skill-copy-diverged'] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'drift',
        agentCopy: 'not-applicable',
        atRefs: 'not-applicable',
        codexSizeCap: 'not-applicable',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [{ check: 'skill-copy', code: 'skill-copy-diverged', path: 'ontology-sync/SKILL.md' }],
    },
  },
  {
    name: 'skill copy drift — a file exists in only one copy of a shared skill',
    input: {
      files: [
        { path: '.claude/skills/ontology-sync/SKILL.md', content: 'same\n' },
        { path: '.agents/skills/ontology-sync/SKILL.md', content: 'same\n' },
        { path: '.claude/skills/ontology-sync/helper.sh', content: 'echo only-here\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: '.agents/skills/ontology-sync/SKILL.md', ruleId: 'agents-skills', kind: 'skill', tools: ['codex'], drift: [] },
        { path: '.claude/skills/ontology-sync/SKILL.md', ruleId: 'claude-skills', kind: 'skill', tools: ['claude-code'], drift: [] },
        { path: '.claude/skills/ontology-sync/helper.sh', ruleId: 'claude-skills', kind: 'skill', tools: ['claude-code'], drift: ['skill-copy-file-missing'] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'drift',
        agentCopy: 'not-applicable',
        atRefs: 'not-applicable',
        codexSizeCap: 'not-applicable',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [{ check: 'skill-copy', code: 'skill-copy-file-missing', path: 'ontology-sync/helper.sh' }],
    },
  },
  {
    name: 'skill in one tree only — informational, not drift',
    input: {
      files: [{ path: '.claude/skills/claude-only/SKILL.md', content: 'x' }],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: '.claude/skills/claude-only/SKILL.md', ruleId: 'claude-skills', kind: 'skill', tools: ['claude-code'], drift: [] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        atRefs: 'not-applicable',
        codexSizeCap: 'not-applicable',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [],
    },
  },
  {
    name: '@refs resolve — existingPaths and scanned files both satisfy refs; emails/npm scopes ignored',
    input: {
      files: [
        {
          path: 'AGENTS.md',
          content: [
            '@docs/DESIGN-SYSTEM.md and @CLAUDE.md',
            'mail devqamain@gmail.com · uses @modelcontextprotocol/sdk · @media (x) {}',
          ].join('\n'),
        },
        { path: 'CLAUDE.md', content: '@AGENTS.md\n' },
      ],
      existingPaths: ['docs/DESIGN-SYSTEM.md'],
    },
    expected: {
      records: [
        { path: 'AGENTS.md', ruleId: 'agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: [] },
        { path: 'CLAUDE.md', ruleId: 'claude-md', kind: 'instructions', tools: ['claude-code'], drift: [] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'ok',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        atRefs: 'ok',
        codexSizeCap: 'ok',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [],
    },
  },
  {
    name: '@ref missing — a dangling reference is drift when the scanner can verify it',
    input: {
      files: [{ path: 'AGENTS.md', content: 'read @docs/GONE.md first\n' }],
      existingPaths: ['docs/OTHER.md'],
    },
    expected: {
      records: [
        { path: 'AGENTS.md', ruleId: 'agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: ['at-ref-missing'] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        atRefs: 'drift',
        codexSizeCap: 'ok',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [{ check: 'at-refs', code: 'at-ref-missing', path: 'AGENTS.md' }],
    },
  },
  {
    name: 'web scanner honesty — dot-path and non-md refs report unverified, never false missing',
    input: {
      files: [
        {
          path: 'AGENTS.md',
          content: '@.claude/rules/design.md and @scripts/run.sh and @docs/REAL.md\n',
        },
      ],
      existingPaths: ['docs/REAL.md'],
      unverifiablePrefixes: ['.'],
      verifiableExtensions: ['.md'],
    },
    expected: {
      records: [
        { path: 'AGENTS.md', ruleId: 'agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: [] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        atRefs: 'ok',
        codexSizeCap: 'ok',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [],
    },
  },
  {
    name: 'Codex cap — AGENTS.md over 32 KiB is drift',
    input: {
      files: [
        { path: 'AGENTS.md', content: 'x'.repeat(32 * 1024 + 1) },
        { path: 'CLAUDE.md', content: '@AGENTS.md\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: 'AGENTS.md', ruleId: 'agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: ['agents-md-over-codex-cap'] },
        { path: 'CLAUDE.md', ruleId: 'claude-md', kind: 'instructions', tools: ['claude-code'], drift: [] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'ok',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        atRefs: 'ok',
        codexSizeCap: 'drift',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [{ check: 'codex-size-cap', code: 'agents-md-over-codex-cap', path: 'AGENTS.md' }],
    },
  },
  {
    name: 'classification sweep — every known format maps; ordinary files are ignored',
    input: {
      files: [
        { path: 'GEMINI.md', content: 'g' },
        { path: '.cursorrules', content: 'c' },
        { path: '.cursor/rules/base.mdc', content: 'm' },
        { path: '.github/copilot-instructions.md', content: 'co' },
        { path: '.codex/config.toml', content: 't' },
        { path: '.mcp.json', content: '{}' },
        { path: 'README.md', content: 'not an agent file' },
        { path: 'docs/GUIDE.md', content: 'not an agent file' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: '.codex/config.toml', ruleId: 'codex-dir', kind: 'config', tools: ['codex'], drift: [] },
        { path: '.cursor/rules/base.mdc', ruleId: 'cursor-rules', kind: 'rules', tools: ['cursor'], drift: [] },
        { path: '.cursorrules', ruleId: 'cursorrules', kind: 'rules', tools: ['cursor'], drift: [] },
        { path: '.github/copilot-instructions.md', ruleId: 'copilot-instructions', kind: 'instructions', tools: ['copilot'], drift: [] },
        { path: '.mcp.json', ruleId: 'mcp-json', kind: 'mcp-config', tools: ['claude-code', 'cursor'], drift: [] },
        { path: 'GEMINI.md', ruleId: 'gemini-md', kind: 'instructions', tools: ['gemini-cli'], drift: [] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        atRefs: 'not-applicable',
        codexSizeCap: 'not-applicable',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [],
    },
  },
  {
    // The seat-brief pair exists for a **different reason** than the skills: one is the
    // registry a subagent is summoned from, the other is the reference a tool without
    // subagents opens while walking the council sequentially. Different purposes, but the
    // contents must match.
    name: 'agent brief copy in sync — identical bytes in both duplicated trees',
    input: {
      files: [
        { path: '.claude/agents/po-evidence.md', content: '# seat\nsame bytes\n' },
        { path: '.agents/agents/po-evidence.md', content: '# seat\nsame bytes\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: '.agents/agents/po-evidence.md', ruleId: 'agents-agents', kind: 'agent', tools: ['codex'], drift: [] },
        { path: '.claude/agents/po-evidence.md', ruleId: 'claude-agents', kind: 'agent', tools: ['claude-code'], drift: [] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'not-applicable',
        agentCopy: 'ok',
        atRefs: 'not-applicable',
        codexSizeCap: 'not-applicable',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [],
    },
  },
  {
    name: 'agent brief copy drift — the two copies diverged byte-for-byte',
    input: {
      files: [
        { path: '.claude/agents/design-lead.md', content: '# seat\nversion A\n' },
        { path: '.agents/agents/design-lead.md', content: '# seat\nversion B (edited only here)\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: '.agents/agents/design-lead.md', ruleId: 'agents-agents', kind: 'agent', tools: ['codex'], drift: ['agent-copy-diverged'] },
        { path: '.claude/agents/design-lead.md', ruleId: 'claude-agents', kind: 'agent', tools: ['claude-code'], drift: ['agent-copy-diverged'] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'not-applicable',
        agentCopy: 'drift',
        atRefs: 'not-applicable',
        codexSizeCap: 'not-applicable',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [
        { check: 'agent-copy', code: 'agent-copy-diverged', path: 'design-lead.md' },
      ],
    },
  },
  {
    // Unlike skills, a seat present on only one side is drift rather than informational
    // — the council protocol does not hold at all in that tool.
    // Measured 2026-08-04: all 15 seats were in this state with no signal at all.
    name: 'agent brief one-sided — a seat that exists in only one tree is drift, not informational',
    input: {
      files: [
        { path: '.claude/agents/po-wedge.md', content: '# seat\nclaude only\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: '.claude/agents/po-wedge.md', ruleId: 'claude-agents', kind: 'agent', tools: ['claude-code'], drift: ['agent-copy-file-missing'] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'not-applicable',
        agentCopy: 'drift',
        atRefs: 'not-applicable',
        codexSizeCap: 'not-applicable',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [
        { check: 'agent-copy', code: 'agent-copy-file-missing', path: 'po-wedge.md' },
      ],
    },
  },
  {
    name: 'agent language — non-English text is drift wherever it sits, string literals included',
    input: {
      files: [
        { path: 'AGENTS.md', content: '# AGENTS.md\n' },
        { path: '.claude/hooks/block-unsafe-git.sh', content: 'REASON="\uD798\uB0B4"\n' },
        { path: '.claude/settings.json', content: '{"_comment": "\uBA54\uBAA8"}\n' },
      ],
      existingPaths: [],
      requireEnglish: true,
    },
    expected: {
      records: [
        { path: '.claude/hooks/block-unsafe-git.sh', ruleId: 'claude-hooks', kind: 'config', tools: ['claude-code'], drift: ['non-english-agent-text'] },
        { path: '.claude/settings.json', ruleId: 'claude-settings', kind: 'config', tools: ['claude-code'], drift: ['non-english-agent-text'] },
        { path: 'AGENTS.md', ruleId: 'agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: [] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        atRefs: 'not-applicable',
        codexSizeCap: 'ok',
        agentLanguage: 'drift',
        mcpGrants: 'not-applicable',
      },
      drift: [
        { check: 'agent-language', code: 'non-english-agent-text', path: '.claude/hooks/block-unsafe-git.sh' },
        { check: 'agent-language', code: 'non-english-agent-text', path: '.claude/settings.json' },
      ],
    },
  },
  {
    name: 'nested AGENTS.md — one level is instruction surface, a starter-vault template is not',
    input: {
      files: [
        { path: 'AGENTS.md', content: '# AGENTS.md\n' },
        { path: 'src/AGENTS.md', content: '# src pointer\n' },
        { path: 'cli/templates/vault/AGENTS.md', content: '# starter vault\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: 'AGENTS.md', ruleId: 'agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: [] },
        { path: 'src/AGENTS.md', ruleId: 'nested-agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: [] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        atRefs: 'not-applicable',
        codexSizeCap: 'ok',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [],
    },
  },
  {
    name: 'Codex cap — the merge is root plus the largest nested file, and the nested file is blamed',
    input: {
      files: [
        { path: 'AGENTS.md', content: 'x'.repeat(32 * 1024 - 10) },
        { path: 'src/AGENTS.md', content: 'x'.repeat(11) },
        { path: 'cli/AGENTS.md', content: 'x'.repeat(5) },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: 'AGENTS.md', ruleId: 'agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: [] },
        { path: 'cli/AGENTS.md', ruleId: 'nested-agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: [] },
        { path: 'src/AGENTS.md', ruleId: 'nested-agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], drift: ['agents-md-over-codex-cap'] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'not-applicable',
        agentCopy: 'not-applicable',
        atRefs: 'not-applicable',
        codexSizeCap: 'drift',
        agentLanguage: 'not-applicable',
        mcpGrants: 'not-applicable',
      },
      drift: [
        { check: 'codex-size-cap', code: 'agents-md-over-codex-cap', path: 'src/AGENTS.md' },
      ],
    },
  },
  {
    name: 'mcp grants — a seat may only name servers .mcp.json declares',
    input: {
      files: [
        { path: '.mcp.json', content: '{"mcpServers":{"ontology-atlas":{"command":"node"}}}' },
        { path: '.claude/agents/design-lead.md', content: '---\nname: design-lead\ntools: Read, mcp__ontology-atlas__get_concept, mcp__chrome-devtools__evaluate_script\n---\nbody\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: '.claude/agents/design-lead.md', ruleId: 'claude-agents', kind: 'agent', tools: ['claude-code'], drift: ['agent-copy-file-missing', 'undeclared-mcp-server'] },
        { path: '.mcp.json', ruleId: 'mcp-json', kind: 'mcp-config', tools: ['claude-code', 'cursor'], drift: [] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'not-applicable',
        agentCopy: 'drift',
        atRefs: 'not-applicable',
        codexSizeCap: 'not-applicable',
        agentLanguage: 'not-applicable',
        mcpGrants: 'drift',
      },
      drift: [
        { check: 'agent-copy', code: 'agent-copy-file-missing', path: 'design-lead.md' },
        { check: 'mcp-grants', code: 'undeclared-mcp-server', path: '.claude/agents/design-lead.md' },
      ],
    },
  },
  {
    name: 'mcp grants — an unparseable .mcp.json is drift, never a quiet pass',
    input: {
      files: [
        { path: '.mcp.json', content: '{ broken' },
        { path: '.claude/agents/po-wedge.md', content: '---\nname: po-wedge\ntools: Read, Grep\n---\nbody\n' },
        { path: '.agents/agents/po-wedge.md', content: '---\nname: po-wedge\ntools: Read, Grep\n---\nbody\n' },
      ],
      existingPaths: [],
    },
    expected: {
      records: [
        { path: '.agents/agents/po-wedge.md', ruleId: 'agents-agents', kind: 'agent', tools: ['codex'], drift: [] },
        { path: '.claude/agents/po-wedge.md', ruleId: 'claude-agents', kind: 'agent', tools: ['claude-code'], drift: [] },
        { path: '.mcp.json', ruleId: 'mcp-json', kind: 'mcp-config', tools: ['claude-code', 'cursor'], drift: ['mcp-config-unparseable'] },
      ],
      checkStatuses: {
        claudeAgentsBridge: 'not-applicable',
        skillCopy: 'not-applicable',
        agentCopy: 'ok',
        atRefs: 'not-applicable',
        codexSizeCap: 'not-applicable',
        agentLanguage: 'not-applicable',
        mcpGrants: 'drift',
      },
      drift: [
        { check: 'mcp-grants', code: 'mcp-config-unparseable', path: '.mcp.json' },
      ],
    },
  },
];
