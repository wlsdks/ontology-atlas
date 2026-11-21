import { describe, expect, it } from 'vitest';

import { buildHarnessSetup } from '@/widgets/harness-setup';

import { EXAMPLE_FILES, readExample } from './harness-example';

/**
 * The film plays what the app's scanner answers for the example, so a change to either the
 * scanner or the example's files changes the film. These are the facts its captions promise.
 */
describe('the harness film example', () => {
  it('counts 21 files the agent reads, 4 guardrails and 9 checks', async () => {
    const { report } = await readExample();
    const setup = buildHarnessSetup(report, null);
    expect(Object.fromEntries(setup.sections.map((section) => [section.id, section.total]))).toEqual({
      context: 21,
      guardrails: 4,
      verification: 9,
    });
  });

  it('holds exactly one problem, the hook script the disk lacks', async () => {
    const setup = buildHarnessSetup((await readExample()).report, null);
    expect(setup.problems.map((problem) => [problem.kind, problem.kind === 'hook-missing' ? problem.path : null])).toEqual([
      ['hook-missing', '.claude/hooks/block-force-push.sh'],
    ]);
  });

  it('marks both reviewer copies as differing and leaves the planner copies alone', async () => {
    const setup = buildHarnessSetup((await readExample()).report, null);
    const subagents = setup.sections.flatMap((section) => section.groups).find((group) => group.id === 'subagents')!.items;
    expect(subagents.filter((item) => item.differsFrom).map((item) => item.path).sort()).toEqual([
      '.agents/agents/reviewer.md',
      '.claude/agents/reviewer.md',
    ]);
    const reviewer = (path: string) => EXAMPLE_FILES[path]!.split('\n').filter(Boolean);
    expect(reviewer('.claude/agents/reviewer.md')).toHaveLength(6);
    const [claude, codex] = [reviewer('.claude/agents/reviewer.md'), reviewer('.agents/agents/reviewer.md')];
    expect(claude.filter((line, index) => line !== codex[index])).toEqual(['tools: Read, Grep, Glob']);
  });

  it('under Codex lists no problem, rule, MCP server, permission or blocking hook', async () => {
    const setup = buildHarnessSetup((await readExample()).report, 'codex');
    expect(setup.problems).toEqual([]);
    const count = (id: string) => setup.sections.flatMap((section) => section.groups).find((group) => group.id === id)?.items.length ?? 0;
    expect(['rules', 'mcp', 'permissions', 'blockingHooks'].map(count)).toEqual([0, 0, 0, 0]);
  });

  it('keeps every progress event the scan reported', async () => {
    const { progress } = await readExample();
    expect(progress.length).toBeGreaterThan(0);
    expect(new Set(progress.map((event) => event.stage))).toEqual(new Set(['roots', 'nested', 'agent-directories', 'hooks']));
  });
});
