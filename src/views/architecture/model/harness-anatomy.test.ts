import { describe, expect, it } from 'vitest';

import type { HarnessReport } from '@/entities/agent-files';

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

  it('folds a directory of skills into one name per skill', () => {
    const anatomy = buildHarnessAnatomy(
      report({
        analysis: {
          records: [
            record({ path: '.claude/skills/po-pass/SKILL.md', kind: 'skill' }),
            record({ path: '.claude/skills/po-pass/reference.md', kind: 'skill' }),
            record({ path: '.claude/agents/chief.md', kind: 'agent' }),
          ],
        } as never,
      }),
    );
    expect(slotOf(anatomy, 'onDemand').items).toEqual(['.claude/agents/', '.claude/skills/']);
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
    expect(slotOf(anatomy, 'toolGates').items).toEqual([
      '.claude/hooks/block-publish.sh',
      '.codex/hooks/block-secret-read.sh',
    ]);
    expect(slotOf(anatomy, 'watchers').items).toEqual(['.claude/hooks/report-drift.sh']);
    expect(anatomy.approvalGates).toEqual(['.codex/hooks.json']);
  });

  it('counts git hooks from the census, not from the coverage pass', () => {
    /* The coverage pass runs only when the vault records implementation paths. The number must not
       depend on that, or a repository with no ontology reads as having no commit-time guard. */
    const anatomy = buildHarnessAnatomy(
      report({ checks: { wiredHooks: 0, gitHooks: 3, scripts: [], total: 3 } }),
    );
    expect(slotOf(anatomy, 'gitGates').count).toBe(3);
    expect(slotOf(anatomy, 'gitGates').items).toEqual([]);
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
