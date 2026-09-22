import { describe, expect, it } from 'vitest';
import type {
  AgentTool,
  CoverageAreaRow,
  CoverageCapability,
  CoverageColumn,
  ScopeDeclaration,
} from '@/entities/agent-files';
import { projectHarnessCoverageEvidence } from './harness-detail';

const capability = (slug: string, path: string): CoverageCapability => ({ slug, title: slug, path });
const declaration = ({
  id,
  column = 'told',
  label = id,
  scopes = [],
  declaresPath = true,
  tools = [],
}: {
  id: string;
  column?: CoverageColumn;
  label?: string;
  scopes?: string[];
  declaresPath?: boolean;
  tools?: AgentTool[];
}): ScopeDeclaration => ({
  id,
  column,
  label,
  origin: 'rule',
  declaration: `paths: ${scopes.join(', ')}`,
  declaresPath,
  scopes,
  tools,
});

const area = ({
  capabilities,
  told = [],
  gated = [],
  watched = [],
}: {
  capabilities: CoverageCapability[];
  told?: ScopeDeclaration[];
  gated?: ScopeDeclaration[];
  watched?: ScopeDeclaration[];
}): CoverageAreaRow => ({
  slug: 'domains/guidance',
  title: 'Guidance',
  purpose: 'Make repository guidance inspectable.',
  capabilities,
  told,
  gated,
  watched,
  discoveredTests: 3,
});

const emptyColumns = (): Record<CoverageColumn, ScopeDeclaration[]> => ({
  told: [],
  gated: [],
  watched: [],
});

describe('projectHarnessCoverageEvidence', () => {
  it('pairs one scoped declaration only with the capability entrypoint it actually reaches', () => {
    const overview = capability('capabilities/overview', 'src/views/ontology-insights');
    const scanner = capability('capabilities/scanner', 'src/entities/agent-files');
    const guide = declaration({ id: 'insights/AGENTS.md', scopes: ['src/views/ontology-insights'] });
    const result = projectHarnessCoverageEvidence({
      areas: [area({ capabilities: [overview, scanner], told: [guide] })],
      everywhere: emptyColumns(),
      outsideAreas: [],
      unreachedCapabilities: [],
    });
    expect(result.areas[0]?.roles.told.declarations[0]).toEqual({
      declaration: guide,
      matchedCapabilities: [overview],
    });
  });

  it('preserves same-label declarations as separate source and tool identities', () => {
    const overview = capability('capabilities/overview', 'src/views/ontology-insights');
    const scanner = capability('capabilities/scanner', 'src/entities/agent-files');
    const codex = declaration({ id: '.agents/hooks/check.mjs', column: 'gated', label: 'check.mjs', scopes: ['src/views'], tools: ['codex'] });
    const claude = declaration({ id: '.claude/hooks/check.mjs', column: 'gated', label: 'check.mjs', scopes: ['src/entities'], tools: ['claude-code'] });
    const result = projectHarnessCoverageEvidence({
      areas: [area({ capabilities: [overview, scanner], gated: [codex, claude] })],
      everywhere: emptyColumns(),
      outsideAreas: [],
      unreachedCapabilities: [],
    });
    expect(result.areas[0]?.roles.gated.declarations).toEqual([
      { declaration: codex, matchedCapabilities: [overview] },
      { declaration: claude, matchedCapabilities: [scanner] },
    ]);
  });

  it('keeps global evidence once while a zero scoped role stays empty', () => {
    const global = declaration({ id: 'AGENTS.md', column: 'gated', declaresPath: false, tools: ['codex'] });
    const everywhere = emptyColumns();
    everywhere.gated.push(global);
    const result = projectHarnessCoverageEvidence({
      areas: [area({ capabilities: [capability('capabilities/overview', 'src/views/ontology-insights')] })],
      everywhere,
      outsideAreas: [],
      unreachedCapabilities: [],
    });
    expect(result.areas[0]?.roles.gated.declarations).toEqual([]);
    expect(result.everywhere.gated).toEqual([global]);
  });

  it('retains outside mappings and unreached capabilities without promoting either to global', () => {
    const outside = declaration({ id: '.claude/rules/testing.md', scopes: ['tests'] });
    const unreached = capability('capabilities/scanner', 'src/entities/agent-files');
    const result = projectHarnessCoverageEvidence({
      areas: [area({ capabilities: [unreached] })],
      everywhere: emptyColumns(),
      outsideAreas: [outside],
      unreachedCapabilities: [unreached],
    });
    expect(result.outsideAreas).toEqual([outside]);
    expect(result.unreachedCapabilities).toEqual([unreached]);
    expect(result.everywhere.told).toEqual([]);
  });

  it('reconciles every role count with the exact projected member list', () => {
    const cap = capability('capabilities/overview', 'src/views/ontology-insights');
    const told = declaration({ id: 'AGENTS.md#insights', scopes: ['src/views/ontology-insights'] });
    const gate = declaration({ id: '.githooks/pre-commit#insights', column: 'gated', scopes: ['src/views/ontology-insights'] });
    const watch = declaration({ id: 'package.json#test:insights', column: 'watched', scopes: ['src/views/ontology-insights'] });
    const source = area({ capabilities: [cap], told: [told], gated: [gate], watched: [watch] });
    const result = projectHarnessCoverageEvidence({
      areas: [source],
      everywhere: emptyColumns(),
      outsideAreas: [],
      unreachedCapabilities: [],
    });
    const projected = result.areas[0]!;
    for (const column of ['told', 'gated', 'watched'] as const) {
      expect(projected.roles[column].declarations).toHaveLength(source[column].length);
      expect(projected.roles[column].declarations.map((entry) => entry.declaration.id)).toEqual(
        source[column].map((entry) => entry.id),
      );
    }
  });
});
