import { describe, expect, it } from 'vitest';

import { isGuideRecord, type HarnessReport } from '@/entities/agent-files';

import {
  ANATOMY_ORDER,
  buildHarnessAnatomy,
  declaresPathScope,
  mcpServerNames,
  permissionCounts,
  type AnatomySlotId,
} from './harness-anatomy';

type Record_ = HarnessReport['analysis']['records'][number];

function record(partial: Partial<Record_> & Pick<Record_, 'path' | 'kind'>): Record_ {
  return {
    ruleId: partial.ruleId ?? 'claude-md',
    tools: partial.tools ?? ['claude-code'],
    bytes: partial.bytes ?? 100,
    drift: partial.drift ?? [],
    ...partial,
  } as Record_;
}

function report(partial: Partial<HarnessReport> = {}): HarnessReport {
  return {
    analysis: { records: [], checks: {} as never, findings: [] } as never,
    hookGroups: [],
    times: [],
    contents: new Map(),
    checks: { wiredHooks: 0, gitHooks: 0, scripts: [], total: 0 },
    guideDocumentCount: 0,
    coverage: [],
    documentReach: { total: 0 } as never,
    testFiles: [],
    gitHookFiles: [],
    workflowFiles: [],
    timesAreFileMtime: true,
    ...partial,
  } as HarnessReport;
}

function slotOf(anatomy: ReturnType<typeof buildHarnessAnatomy>, id: AnatomySlotId) {
  const found = anatomy.slots.find((entry) => entry.id === id);
  if (!found) throw new Error(`no slot ${id}`);
  return found;
}

describe('buildHarnessAnatomy', () => {
  it('returns every slot in reading order even when the repository is empty', () => {
    const anatomy = buildHarnessAnatomy(report());
    expect(anatomy.slots.map((slot) => slot.id)).toEqual([...ANATOMY_ORDER]);
    expect(slotOf(anatomy, 'always').status).toBe('absent');
  });

  it('never prints the agent loop as a count of zero', () => {
    /* The distinction the screen exists to keep: "this repository has none" and "this repository
       does not decide this" are different answers, and only one of them is a gap. */
    const loop = slotOf(buildHarnessAnatomy(report()), 'loop');
    expect(loop.status).toBe('tool-owned');
    expect(loop.count).toBe(0);
  });

  it('splits rules by whether their frontmatter declares paths', () => {
    const anatomy = buildHarnessAnatomy(
      report({
        analysis: {
          records: [
            record({ path: 'CLAUDE.md', kind: 'instructions' }),
            record({ path: '.claude/rules/forbidden.md', kind: 'rules', ruleId: 'claude-rules' }),
            record({ path: '.claude/rules/design.md', kind: 'rules', ruleId: 'claude-rules' }),
          ],
        } as never,
        contents: new Map([
          ['.claude/rules/forbidden.md', '# Forbidden\n\npaths: not frontmatter\n'],
          ['.claude/rules/design.md', '---\npaths:\n  - src/**\n---\n\n# Design\n'],
        ]),
      }),
    );
    expect(slotOf(anatomy, 'always').items).toEqual(['.claude/rules/forbidden.md', 'CLAUDE.md']);
    expect(slotOf(anatomy, 'scoped').items).toEqual(['.claude/rules/design.md']);
  });

  it('files a nested AGENTS.md under what attaches by path', () => {
    const anatomy = buildHarnessAnatomy(
      report({
        analysis: {
          records: [
            record({ path: 'mcp/AGENTS.md', kind: 'instructions', ruleId: 'nested-agents-md' }),
          ],
        } as never,
      }),
    );
    expect(slotOf(anatomy, 'scoped').items).toEqual(['mcp/AGENTS.md']);
    expect(slotOf(anatomy, 'always').count).toBe(0);
  });

  it('counts skills and briefs by name, and keeps them in separate rows', () => {
    /* Folding at the directory put this repository's 18 skills and 15 briefs on screen as "4
       folders" — true, and useless. The reader is asking what can be called. */
    const anatomy = buildHarnessAnatomy(
      report({
        analysis: {
          records: [
            record({ path: '.claude/skills/po-pass/SKILL.md', kind: 'skill' }),
            record({ path: '.claude/skills/po-pass/reference.md', kind: 'skill' }),
            record({ path: '.agents/skills/po-pass/SKILL.md', kind: 'skill' }),
            record({ path: '.claude/skills/design-build/SKILL.md', kind: 'skill' }),
            record({ path: '.claude/agents/chief.md', kind: 'agent' }),
          ],
        } as never,
      }),
    );
    /* One name per thing a person can call: the Codex copy of a skill is the same skill. */
    expect(slotOf(anatomy, 'skills').items).toEqual(['design-build', 'po-pass']);
    expect(slotOf(anatomy, 'subagents').items).toEqual(['chief']);
  });

  it('separates hooks that can refuse from hooks that only watch', () => {
    const anatomy = buildHarnessAnatomy(
      report({
        hookGroups: [
          {
            configPath: '.claude/settings.json',
            approvalGate: false,
            hooks: [
              {
                events: 'PreToolUse',
                ref: { path: '.claude/hooks/block-publish.sh', command: 'x' },
                status: 'wired',
              },
              {
                events: 'PostToolUse · Stop',
                ref: { path: '.claude/hooks/report-drift.sh', command: 'x' },
                status: 'wired',
              },
              {
                events: 'PreToolUse',
                ref: { path: '.claude/hooks/gone.sh', command: 'x' },
                status: 'missing',
              },
            ],
          },
          {
            configPath: '.codex/hooks.json',
            approvalGate: true,
            hooks: [
              {
                events: 'beforeToolUse',
                ref: { path: '.codex/hooks/block-secret-read.sh', command: 'x' },
                status: 'wired',
              },
            ],
          },
        ] as never,
      }),
    );
    /* One guard, one name: the Claude and Codex copies of a mirrored hook are the same guard. */
    expect(slotOf(anatomy, 'toolGates').items).toEqual([
      'block-publish.sh',
      'block-secret-read.sh',
    ]);
    expect(slotOf(anatomy, 'watchers').items).toEqual(['report-drift.sh']);
    expect(anatomy.approvalGates).toEqual(['.codex/hooks.json']);
  });

  it('counts a mirrored hook once, because it is one guard', () => {
    const anatomy = buildHarnessAnatomy(
      report({
        hookGroups: [
          {
            configPath: '.claude/settings.json',
            approvalGate: false,
            hooks: [
              {
                events: 'PreToolUse',
                ref: { path: '.claude/hooks/block-unsafe-git.sh', command: 'x' },
                status: 'wired',
              },
            ],
          },
          {
            configPath: '.codex/hooks.json',
            approvalGate: false,
            hooks: [
              {
                events: 'beforeToolUse',
                ref: { path: '.codex/hooks/block-unsafe-git.sh', command: 'x' },
                status: 'wired',
              },
            ],
          },
        ] as never,
      }),
    );
    expect(slotOf(anatomy, 'toolGates').count).toBe(1);
    expect(slotOf(anatomy, 'toolGates').items).toEqual(['block-unsafe-git.sh']);
  });

  it('counts and names git hooks without the coverage pass', () => {
    /* The coverage pass runs only when the vault records implementation paths. Neither the number
       nor the names may depend on that, or a repository with no ontology reads as having a
       commit-time guard nobody can open. */
    const anatomy = buildHarnessAnatomy(
      report({
        checks: { wiredHooks: 0, gitHooks: 3, scripts: [], total: 3 },
        gitHookFiles: ['commit-msg', 'pre-commit', 'pre-push'],
      }),
    );
    expect(slotOf(anatomy, 'gitGates').count).toBe(3);
    expect(slotOf(anatomy, 'gitGates').items).toEqual(['commit-msg', 'pre-commit', 'pre-push']);
  });

  it('shows the MCP config path when its servers cannot be read', () => {
    const anatomy = buildHarnessAnatomy(
      report({
        analysis: {
          records: [record({ path: '.mcp.json', kind: 'mcp-config', ruleId: 'mcp-json' })],
        } as never,
        contents: new Map([['.mcp.json', '{ not json']]),
      }),
    );
    expect(slotOf(anatomy, 'tools').items).toEqual(['.mcp.json']);
  });

  it('names MCP servers when the config parses', () => {
    const anatomy = buildHarnessAnatomy(
      report({
        analysis: {
          records: [record({ path: '.mcp.json', kind: 'mcp-config', ruleId: 'mcp-json' })],
        } as never,
        contents: new Map([
          ['.mcp.json', JSON.stringify({ mcpServers: { 'ontology-atlas': {}, codegraph: {} } })],
        ]),
      }),
    );
    expect(slotOf(anatomy, 'tools').items).toEqual(['codegraph', 'ontology-atlas']);
    expect(slotOf(anatomy, 'tools').count).toBe(2);
  });

  it('counts a permission decision only when the settings file parsed', () => {
    const withSettings = buildHarnessAnatomy(
      report({
        contents: new Map([
          [
            '.claude/settings.json',
            JSON.stringify({ permissions: { allow: ['a', 'b'], deny: ['c'], ask: [] } }),
          ],
        ]),
      }),
    );
    expect(withSettings.permissions).toEqual({ allow: 2, deny: 1, ask: 0 });
    expect(slotOf(withSettings, 'permissions').count).toBe(1);

    const without = buildHarnessAnatomy(report());
    expect(without.permissions).toBeNull();
    expect(slotOf(without, 'permissions').status).toBe('absent');
  });

  it('folds discovered tests to the folder the runner walks, not to every subtree', () => {
    /* Depth three produced 689 names for 1471 files on this repository; the citation became a list
       nobody reads. Where the runner finds them is the answer. */
    const anatomy = buildHarnessAnatomy(
      report({
        testFiles: [
          'src/a/b/x.test.ts',
          'src/c/d/y.test.ts',
          'mcp/src/z.test.mjs',
          'tests/contract/w.contract.test.ts',
        ],
      }),
    );
    expect(slotOf(anatomy, 'discoveredTests').items).toEqual(['mcp/', 'src/', 'tests/']);
    expect(slotOf(anatomy, 'discoveredTests').count).toBe(4);
  });

  it('caps the names a slot prints and says how many are left', () => {
    const anatomy = buildHarnessAnatomy(
      report({
        checks: { wiredHooks: 0, gitHooks: 0, scripts: ['a', 'b', 'c', 'd', 'e', 'f'], total: 6 },
      }),
    );
    expect(slotOf(anatomy, 'checks').items).toHaveLength(4);
    expect(slotOf(anatomy, 'checks').overflow).toBe(2);
    expect(slotOf(anatomy, 'checks').count).toBe(6);
  });
});

describe('declaresPathScope', () => {
  it('reads only the frontmatter block', () => {
    expect(declaresPathScope('---\npaths: ["src/**"]\n---\n')).toBe(true);
    expect(declaresPathScope('---\nname: x\n---\n\npaths: are discussed here\n')).toBe(false);
    expect(declaresPathScope(undefined)).toBe(false);
  });
});

describe('mcpServerNames', () => {
  it('tells an unreadable config apart from one with no servers', () => {
    expect(mcpServerNames('{ broken')).toBeNull();
    expect(mcpServerNames('{}')).toBeNull();
    expect(mcpServerNames(JSON.stringify({ mcpServers: {} }))).toEqual([]);
  });
});

describe('permissionCounts', () => {
  it('returns null rather than zeroes when there is nothing to read', () => {
    expect(permissionCounts(undefined)).toBeNull();
    expect(permissionCounts('{}')).toBeNull();
    expect(permissionCounts(JSON.stringify({ permissions: {} }))).toEqual({
      allow: 0,
      deny: 0,
      ask: 0,
    });
  });
});

describe('the pipeline slot', () => {
  it('names workflow files without their directory, and counts them from the scan', () => {
    /* The phase the first build of this view had no row for at all: a repository whose only gate
       is a pipeline was drawn with nothing watching it. */
    const anatomy = buildHarnessAnatomy(
      report({
        workflowFiles: ['.github/workflows/ci.yml', '.github/workflows/release.yml'],
      }),
    );
    const pipeline = slotOf(anatomy, 'pipeline');
    expect(pipeline.band).toBe('watches');
    expect(pipeline.items).toEqual(['ci.yml', 'release.yml']);
    expect(pipeline.count).toBe(2);
  });

  it('says none yet when the repository has no workflows', () => {
    expect(slotOf(buildHarnessAnatomy(report()), 'pipeline').status).toBe('absent');
  });
});

describe('the always-read weight', () => {
  it('sums only what every turn pays, not the conditional guides', () => {
    /* The number a count cannot carry: three 2 KB documents and three 40 KB documents are both
       "3", and the difference is the standing cost of a turn in this repository. */
    const anatomy = buildHarnessAnatomy(
      report({
        analysis: {
          records: [
            record({ path: 'AGENTS.md', kind: 'instructions', bytes: 20_480 }),
            record({ path: 'CLAUDE.md', kind: 'instructions', bytes: 5_120 }),
            record({
              path: '.claude/rules/forbidden.md',
              kind: 'rules',
              ruleId: 'claude-rules',
              bytes: 4_096,
            }),
            record({
              path: '.claude/rules/design.md',
              kind: 'rules',
              ruleId: 'claude-rules',
              bytes: 60_000,
            }),
            /* Attached by path, so it is not part of what every turn pays. */
            record({ path: 'src/AGENTS.md', kind: 'instructions', ruleId: 'nested-agents-md', bytes: 9_000 }),
          ],
        } as never,
        contents: new Map([
          ['.claude/rules/design.md', '---\npaths:\n  - src/**\n---\n'],
          ['.claude/rules/forbidden.md', '# Forbidden\n'],
        ]),
      }),
    );
    expect(anatomy.alwaysBytes).toBe(20_480 + 5_120 + 4_096);
  });

  it('is zero when nothing is read unconditionally', () => {
    expect(buildHarnessAnatomy(report()).alwaysBytes).toBe(0);
  });
});

describe('what the repository keeps out of sight', () => {
  it('files an exclusion under what gates, with the name each product actually uses', () => {
    /* `.aiexclude` is Gemini Code Assist's and `.geminiignore` is Gemini CLI's. Naming the wrong
       product is the failure this row exists to avoid, so the classifier's mapping is asserted
       here as well as in the cross-implementation contract. */
    const anatomy = buildHarnessAnatomy(
      report({
        analysis: {
          records: [
            record({ path: '.cursorignore', kind: 'exclusion', ruleId: 'cursor-ignore' }),
            record({ path: '.geminiignore', kind: 'exclusion', ruleId: 'gemini-ignore' }),
          ],
        } as never,
      }),
    );
    const blind = slotOf(anatomy, 'blind');
    expect(blind.band).toBe('gates');
    expect(blind.items).toEqual(['.cursorignore', '.geminiignore']);
  });

  it('offers no address to fill it, because the right name depends on the tool', () => {
    expect(slotOf(buildHarnessAnatomy(report()), 'blind').fillPath).toBeNull();
  });

  it('does not count an exclusion as a document the repository speaks through', () => {
    /* `isGuideRecord` feeds the census sentence. A file that says what an agent may not see is the
       opposite of a thing the repository says. */
    expect(isGuideRecord({ kind: 'exclusion' })).toBe(false);
    expect(isGuideRecord({ kind: 'instructions' })).toBe(true);
  });
});

describe('a guard that fails in silence', () => {
  it('keeps a missing script out of the count and names it anyway', () => {
    /* A `settings.json` entry whose path does not resolve produces no block and no error. The
       count of wired hooks stays honest; the absence is stated beside it rather than hidden. */
    const anatomy = buildHarnessAnatomy(
      report({
        hookGroups: [
          {
            configPath: '.claude/settings.json',
            approvalGate: false,
            hooks: [
              {
                events: 'PreToolUse',
                ref: { path: '.claude/hooks/block-publish.sh', command: 'x' },
                status: 'wired',
              },
              {
                events: 'PreToolUse',
                ref: { path: '.claude/hooks/block-npm-publish.sh', command: 'x' },
                status: 'missing',
              },
              {
                events: 'Stop',
                ref: { path: null, command: 'node -e "process.exit(0)"' },
                status: 'unresolved',
              },
            ],
          },
        ] as never,
      }),
    );
    expect(slotOf(anatomy, 'toolGates').count).toBe(1);
    expect(anatomy.silentGuards.missing).toEqual(['block-npm-publish.sh']);
    expect(anatomy.silentGuards.unresolved).toHaveLength(1);
  });

  it('says nothing when every script a config names is on disk', () => {
    expect(buildHarnessAnatomy(report()).silentGuards.missing).toEqual([]);
  });
});

