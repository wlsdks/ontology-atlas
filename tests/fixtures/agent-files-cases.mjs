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
      },
      drift: [],
    },
  },
  {
    // 자리 브리프 짝 — 스킬과 **다른 이유로** 존재한다. 한쪽은 서브에이전트
    // 소환 등록부이고, 다른 쪽은 서브에이전트가 없는 도구가 카운슬을 순차로
    // 돌 때 여는 참고 문서다. 목적이 달라도 내용은 같아야 한다.
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
      },
      drift: [
        { check: 'agent-copy', code: 'agent-copy-diverged', path: 'design-lead.md' },
      ],
    },
  },
  {
    // 한쪽에만 있는 자리는 스킬과 달리 informational 이 아니라 drift 다 —
    // 그 도구에서는 카운슬 프로토콜 자체가 성립하지 않기 때문이다.
    // 2026-08-04 실측: 자리 15개 전부가 이 상태였고 아무 신호도 없었다.
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
      },
      drift: [
        { check: 'agent-copy', code: 'agent-copy-file-missing', path: 'po-wedge.md' },
      ],
    },
  },
];
