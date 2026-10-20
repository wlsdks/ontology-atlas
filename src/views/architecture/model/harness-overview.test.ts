import { describe, expect, it } from 'vitest';

import type { CoverageAreaInput, HarnessReport, ScopeDeclaration } from '@/entities/agent-files';

import { buildHarnessOverview, EVERYWHERE_ROW, originCounts, overviewCellKey } from './harness-overview';

function declaration(
  overrides: Partial<ScopeDeclaration> & Pick<ScopeDeclaration, 'id'>,
): ScopeDeclaration {
  return {
    column: 'told',
    label: overrides.id,
    origin: 'rule',
    declaration: '',
    declaresPath: true,
    scopes: [],
    tools: [],
    ...overrides,
  };
}

function area(slug: string, path: string | null): CoverageAreaInput {
  return {
    slug,
    title: `Title ${slug}`,
    purpose: `Purpose of ${slug}`,
    capabilities: path ? [{ slug: `capabilities/${slug}`, title: slug, path }] : [],
  };
}

function report(
  coverage: ScopeDeclaration[],
  hookGroups: HarnessReport['hookGroups'] = [],
): Pick<HarnessReport, 'coverage' | 'testFiles' | 'hookGroups'> {
  return { coverage, testFiles: [], hookGroups };
}

const areas = [area('a', 'src/a'), area('b', 'src/b'), area('c', 'src/c'), area('d', null)];

describe('buildHarnessOverview', () => {
  it('fills the Told cells a rule reaches, keeps everywhere for pathless files, and leaves a pathless row uncounted', () => {
    const overview = buildHarnessOverview(
      report([
        declaration({ id: '.claude/rules/src.md', scopes: ['src'] }),
        declaration({ id: 'AGENTS.md', origin: 'root', declaresPath: false }),
      ]),
      areas,
    );
    expect(overview.everywhere[0]!.entries.map((entry) => entry.id)).toEqual(['AGENTS.md']);
    for (const row of overview.rows.slice(0, 3)) {
      expect(row.cells![0]!.entries.map((entry) => entry.id)).toEqual(['.claude/rules/src.md']);
    }
    expect(overview.gaps).toHaveLength(6);
    const pathless = overview.rows.find((row) => row.slug === 'd')!;
    expect(pathless.cells).toBeNull();
    expect(overview.gaps.some((gap) => gap.slug === 'd')).toBe(false);
    expect(overview.targets.get(overviewCellKey('d', 'path'))?.kind).toBe('no-path');
    expect(overview.targets.get(overviewCellKey(EVERYWHERE_ROW, 'told'))?.kind).toBe('everywhere');
  });

  it('counts gaps row-major with slug and paths, never a title', () => {
    const overview = buildHarnessOverview(
      report([
        declaration({ id: 'src/a/AGENTS.md', origin: 'nested-agents', scopes: ['src/a'] }),
        declaration({ id: 'g.sh', column: 'gated', origin: 'hook', scopes: ['src/b'] }),
      ]),
      areas,
    );
    const marked = overview.rows
      .flatMap((row) => row.cells ?? [])
      .filter((cell) => cell.gap).length;
    expect(marked).toBe(7);
    expect(overview.gaps).toHaveLength(7);
    expect(overview.gaps.map((gap) => `${gap.slug}:${gap.column}`)).toEqual([
      'a:gated',
      'a:watched',
      'b:told',
      'b:watched',
      'c:told',
      'c:gated',
      'c:watched',
    ]);
    expect(overview.gaps[0]).toEqual({ slug: 'a', column: 'gated', paths: ['src/a'] });
    expect(JSON.stringify(overview.gaps)).not.toContain('Title');
  });

  it('reports no gaps when every pathed cell is filled', () => {
    const filled: ScopeDeclaration[] = [];
    for (const slug of ['a', 'b', 'c']) {
      for (const column of ['told', 'gated', 'watched'] as const) {
        filled.push(declaration({ id: `${slug}-${column}`, column, scopes: [`src/${slug}`] }));
      }
    }
    const overview = buildHarnessOverview(report(filled), areas);
    expect(overview.gaps).toEqual([]);
    expect(overview.pathedDomainCount).toBe(3);
  });

  it('counts a script wired for pre and post that reaches no domain once', () => {
    const script = declaration({ id: '.claude/hooks/x.sh', origin: 'hook', scopes: ['elsewhere'] });
    const overview = buildHarnessOverview(
      report([
        { ...script, column: 'gated' },
        { ...script, column: 'watched' },
      ]),
      areas,
    );
    expect(overview.outsideCount).toBe(1);
    expect(overview.outsideFolders).toEqual(['elsewhere']);
  });

  it('lists a mirrored missing script once and names trust-gated configs', () => {
    const hook = (path: string) => ({
      events: 'PreToolUse',
      ref: { path, command: path },
      status: 'missing' as const,
    });
    const overview = buildHarnessOverview(
      report(
        [],
        [
          {
            configPath: '.claude/settings.json',
            approvalGate: false,
            hooks: [hook('.claude/hooks/block-npm-publish.sh')],
          },
          {
            configPath: '.codex/hooks.json',
            approvalGate: true,
            hooks: [hook('.codex/hooks/block-npm-publish.sh')],
          },
        ],
      ),
      areas,
    );
    expect(overview.missingHookScripts).toEqual(['block-npm-publish.sh']);
    expect([...overview.trustGatedConfigs]).toEqual(['.codex/hooks.json']);
  });
});

describe('originCounts', () => {
  it('orders origins by count, then by the fixed order', () => {
    const entries = [
      declaration({ id: '1', origin: 'workflow' }),
      declaration({ id: '2', origin: 'rule' }),
      declaration({ id: '3', origin: 'hook' }),
      declaration({ id: '4', origin: 'rule' }),
      declaration({ id: '5', origin: 'nested-agents' }),
    ];
    expect(originCounts(entries)).toEqual([
      { origin: 'rule', count: 2 },
      { origin: 'nested-agents', count: 1 },
      { origin: 'hook', count: 1 },
      { origin: 'workflow', count: 1 },
    ]);
    expect(originCounts([])).toEqual([]);
  });
});
