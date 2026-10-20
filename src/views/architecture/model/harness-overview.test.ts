import { describe, expect, it } from 'vitest';

import type { CoverageAreaInput, HarnessReport, ScopeDeclaration } from '@/entities/agent-files';

import { buildHarnessOverview, EVERYWHERE_ROW, overviewCellKey } from './harness-overview';

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
  it('puts a rule reaching the other pathed domains in everywhere, and leaves a pathless row uncounted', () => {
    const overview = buildHarnessOverview(
      report([declaration({ id: '.claude/rules/src.md', scopes: ['src'] })]),
      areas,
    );
    expect(overview.everywhere[0]!.entries.map((entry) => entry.id)).toEqual([
      '.claude/rules/src.md',
    ]);
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
    expect(overview.gaps).toHaveLength(marked);
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
