import { describe, expect, it } from 'vitest';

import { buildCoverageMatrix, type CoverageAreaInput } from './coverage-matrix';
import type { ScopeDeclaration } from './coverage-scopes';

function declaration(overrides: Partial<ScopeDeclaration> & Pick<ScopeDeclaration, 'id'>): ScopeDeclaration {
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

const areas: CoverageAreaInput[] = [
  {
    slug: 'domains/map',
    title: 'Topology Map Navigation',
    purpose: 'Walking the graph.',
    capabilities: [{ slug: 'capabilities/browsing', title: 'Browsing', path: 'src/widgets/ontology-map' }],
  },
  {
    slug: 'domains/agents',
    title: 'AI Agent Integration',
    purpose: 'Agents read and write the same folder a person reads.',
    capabilities: [{ slug: 'capabilities/mcp-server', title: 'MCP Server', path: 'mcp/src' }],
  },
];

describe('buildCoverageMatrix — a declaration lands where its declared path reaches', () => {
  it('puts a scoped guide in the area its path reaches, and nowhere else', () => {
    const matrix = buildCoverageMatrix(
      [declaration({ id: 'mcp/AGENTS.md', origin: 'nested-agents', scopes: ['mcp'] })],
      areas,
    );
    expect(matrix.areas[0]!.told).toHaveLength(0);
    expect(matrix.areas[1]!.told.map((entry) => entry.id)).toEqual(['mcp/AGENTS.md']);
  });

  it('holds a path-less declaration once instead of repeating it down the column', () => {
    /* Always-loaded rules go to the strip once, not into every row. */
    const matrix = buildCoverageMatrix(
      [declaration({ id: '.claude/rules/forbidden.md', declaresPath: false, scopes: [] })],
      areas,
    );
    expect(matrix.everywhere.told.map((entry) => entry.id)).toEqual(['.claude/rules/forbidden.md']);
    expect(matrix.areas.every((area) => area.told.length === 0)).toBe(true);
  });

  it('does not promote a narrow scope that reaches nothing into a universal one', () => {
    /* `tests/**` reaches no capability path, so it is not universal like an always-loaded rule. */
    const matrix = buildCoverageMatrix(
      [declaration({ id: '.claude/rules/testing.md', scopes: ['tests'] })],
      areas,
    );
    expect(matrix.everywhere.told).toHaveLength(0);
    expect(matrix.areas.every((area) => area.told.length === 0)).toBe(true);
    expect(matrix.outsideAreas.map((entry) => entry.id)).toEqual(['.claude/rules/testing.md']);
  });

  it('counts the areas nothing in the Watched column names', () => {
    const matrix = buildCoverageMatrix(
      [
        declaration({
          id: 'package.json#test:mcp:unit',
          column: 'watched',
          origin: 'script',
          scopes: ['mcp/src'],
        }),
        declaration({
          id: 'package.json#test:run',
          column: 'watched',
          origin: 'script',
          declaresPath: false,
          scopes: [],
        }),
      ],
      areas,
    );
    /* A repository-wide lane does not fill an area's Watched cell. */
    expect(matrix.unwatchedAreas).toEqual(['domains/map']);
    expect(matrix.everywhere.watched.map((entry) => entry.id)).toEqual(['package.json#test:run']);
  });

  it('names the capabilities no scoped guide reaches', () => {
    const matrix = buildCoverageMatrix(
      [declaration({ id: 'mcp/AGENTS.md', origin: 'nested-agents', scopes: ['mcp'] })],
      areas,
    );
    expect(matrix.unreachedCapabilities.map((capability) => capability.slug)).toEqual([
      'capabilities/browsing',
    ]);
  });

  it('produces no rows and no counts from an empty vault', () => {
    /* No ontology means no areas, which is a designed empty state. */
    const matrix = buildCoverageMatrix(
      [declaration({ id: 'src/AGENTS.md', origin: 'nested-agents', scopes: ['src'] })],
      [],
    );
    expect(matrix.areas).toHaveLength(0);
    expect(matrix.unwatchedAreas).toHaveLength(0);
    expect(matrix.unreachedCapabilities).toHaveLength(0);
  });
});
