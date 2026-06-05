import { describe, expect, it } from 'vitest';
import {
  compactOntologyDescription,
  pruneRuntimeRecentSlugs,
} from './ontology-description';

describe('compactOntologyDescription', () => {
  it('keeps a concise first sentence for topology labels', () => {
    expect(
      compactOntologyDescription(
        'MCP server exposes graph tools. The rest of the document contains setup details and verification notes.',
      ),
    ).toBe('MCP server exposes graph tools.');
  });

  it('normalizes whitespace and clamps long body excerpts', () => {
    const text = compactOntologyDescription(
      '  Long body excerpt\n\nwithout an early sentence boundary that would otherwise fill the topology tooltip with too much prose and make the node hard to scan. Extra detail follows.  ',
      72,
    );

    expect(text).toBe(
      'Long body excerpt without an early sentence boundary that would other...',
    );
  });
});

describe('pruneRuntimeRecentSlugs', () => {
  it('removes expired recent markers without mutating the input set', () => {
    const current = new Set(['a', 'b', 'c']);
    const next = pruneRuntimeRecentSlugs(current, ['b', 'x']);

    expect([...next]).toEqual(['a', 'c']);
    expect([...current]).toEqual(['a', 'b', 'c']);
  });
});
