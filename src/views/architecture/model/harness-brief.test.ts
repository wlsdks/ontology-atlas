import { describe, expect, it } from 'vitest';

import type { HarnessReport } from '@/entities/agent-files';

import { buildHarnessAnatomy } from './harness-anatomy';
import { buildHarnessBrief } from './harness-brief';

/**
 * The handover's job is to be **usable and un-overclaimable**. An agent handed a count with no
 * qualifier will tell its user the repository is protected, so the limits are asserted here as
 * firmly as the contents.
 */

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

function brief(value: HarnessReport, root = '/repo'): string {
  return buildHarnessBrief(buildHarnessAnatomy(value), value, root, '2026-09-20');
}

describe('buildHarnessBrief', () => {
  it('names the repository and the day it was read, because a report without either ages badly', () => {
    expect(brief(report(), '/work/storefront')).toContain(
      'Agent harness of /work/storefront, read from files on 2026-09-20',
    );
  });

  it('always carries the limits, even for an empty repository', () => {
    const text = brief(report());
    expect(text).toContain('Every number is a declaration found in a file');
    expect(text).toContain('belong to the tool, not to this folder');
    expect(text).toContain('Nothing above is a recommendation');
  });

  it('lists an absent part with the address one lives at, and never as a task', () => {
    const text = brief(report());
    expect(text).toContain('MCP servers: none (one lives at .mcp.json)');
    /* The body carries no imperative. The limits paragraph below it is allowed the word
       "recommendation" precisely because it is denying one, so the check stops where it starts. */
    const body = text.slice(0, text.indexOf('Limits of this report:'));
    expect(body).not.toMatch(/should|must|recommend|need to|TODO/i);
  });

  it('puts a guard the disk does not have under what is worth knowing', () => {
    const text = brief(
      report({
        hookGroups: [
          {
            configPath: '.claude/settings.json',
            approvalGate: false,
            hooks: [
              {
                events: 'PreToolUse',
                ref: { path: '.claude/hooks/block-npm-publish.sh', command: 'x' },
                status: 'missing',
              },
            ],
          },
        ] as never,
      }),
    );
    expect(text).toContain('block-npm-publish.sh, and the file is not on disk');
    expect(text).toContain('no block and no error');
  });

  it('states what a turn costs, including the folder that costs the most', () => {
    const text = brief(
      report({
        analysis: {
          records: [
            { path: 'AGENTS.md', kind: 'instructions', ruleId: 'agents-md', tools: [], bytes: 10_240, drift: [] },
            { path: 'mcp/AGENTS.md', kind: 'instructions', ruleId: 'nested-agents-md', tools: [], bytes: 5_120, drift: [] },
          ],
        } as never,
      }),
    );
    expect(text).toContain('10.0 KB is read on every turn');
    expect(text).toContain('Working inside mcp adds 5.0 KB, for 15.0 KB a turn');
  });

  it('leaves the agent loop out of the counts and says why once', () => {
    const text = brief(report());
    expect(text).not.toContain('the agent loop and the model: 0');
    expect(text).toContain('The agent loop, the model, and what gets dropped');
  });
});
