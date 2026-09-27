// The three contracts of an opening line: it comes from real data, the slot priority is
// fixed, and three are never forced.
import { describe, expect, it } from 'vitest';

import type { ConceptDocFacts } from '@/entities/knowledge-graph';

import {
  buildFirstWords,
  nodeIntent,
  parseNodeIntentKind,
  screenIntentFor,
  sentenceForIntent,
  type FirstWordsLabels,
  type FirstWordsNode,
} from './first-words';

const labels: FirstWordsLabels = {
  missingDefinition: (title) => `def:${title}`,
  missingDomain: (title) => `domain:${title}`,
  missingRelations: (title) => `rel:${title}`,
  mapReview: 'map',
  emptyVault: 'empty',
};

function node(overrides: Partial<FirstWordsNode> & { title: string }): FirstWordsNode {
  return {
    id: `capability:${overrides.title}`,
    kind: 'capability',
    evidenceIds: [`capabilities/${overrides.title}`],
    hasOwnDocument: true,
    agentSlug: `capabilities/${overrides.title}`,
    ref: null,
    ...overrides,
  } as FirstWordsNode;
}

function facts(
  entries: Record<string, Partial<ConceptDocFacts>>,
): Map<string, ConceptDocFacts> {
  return new Map(
    Object.entries(entries).map(([slug, value]) => [
      slug,
      { findings: [], domainRef: 'billing', mtime: null, ...value },
    ]),
  );
}

describe('buildFirstWords', () => {
  it('offers a single chip in an empty folder without naming concepts', () => {
    const chips = buildFirstWords(
      { nodes: [], docFacts: new Map(), focusedRef: null },
      labels,
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].intent.kind).toBe('empty-vault');
    expect(chips[0].text).toBe('empty');
  });

  it('puts the screen slot first with the largest gap of the focused concept', () => {
    const chips = buildFirstWords(
      {
        nodes: [node({ title: 'pay' }), node({ title: 'refund' })],
        docFacts: facts({
          'capabilities/pay': { findings: ['definition-missing'] },
          'capabilities/refund': { domainRef: null },
        }),
        focusedRef: 'capabilities/pay',
      },
      labels,
    );
    expect(chips.map((chip) => chip.slot)).toEqual(['screen', 'queue', 'standing']);
    expect(chips[0].text).toBe('def:pay');
    expect(chips[1].text).toBe('domain:refund');
    expect(chips[2].text).toBe('map');
  });

  it('creates no screen slot without a focus', () => {
    const chips = buildFirstWords(
      {
        nodes: [node({ title: 'refund' })],
        docFacts: facts({ 'capabilities/refund': { domainRef: null } }),
        focusedRef: null,
      },
      labels,
    );
    expect(chips.map((chip) => chip.slot)).toEqual(['queue', 'standing']);
  });

  it('keeps only the standing slots in a folder with no defects', () => {
    const chips = buildFirstWords(
      {
        nodes: [node({ title: 'pay' })],
        docFacts: facts({ 'capabilities/pay': {} }),
        focusedRef: null,
      },
      labels,
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].slot).toBe('standing');
  });

  it('skips in the queue the concept the screen slot already named', () => {
    const chips = buildFirstWords(
      {
        nodes: [node({ title: 'pay' })],
        docFacts: facts({ 'capabilities/pay': { findings: ['definition-missing'] } }),
        focusedRef: 'capabilities/pay',
      },
      labels,
    );
    expect(chips.map((chip) => chip.slot)).toEqual(['screen', 'standing']);
  });

  it('does not name a derived concept without its own document', () => {
    const derived = node({ title: 'derived', hasOwnDocument: false });
    const chips = buildFirstWords(
      {
        nodes: [derived],
        docFacts: facts({ 'capabilities/derived': { findings: ['definition-missing'] } }),
        focusedRef: 'capabilities/derived',
      },
      labels,
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].intent.kind).toBe('empty-vault');
    expect(screenIntentFor(derived, facts({}))).toBeNull();
  });

  it('asks a question instead of a claim for a healthy concept', () => {
    const intent = screenIntentFor(
      node({ title: 'pay' }),
      facts({ 'capabilities/pay': {} }),
    );
    expect(intent?.kind).toBe('missing-relations');
    expect(sentenceForIntent(intent!, labels)).toBe('rel:pay');
  });

  it('orders chips by name so the same folder yields the same order', () => {
    const input = {
      nodes: [node({ title: 'zulu' }), node({ title: 'alpha' })],
      docFacts: facts({
        'capabilities/zulu': { findings: ['definition-missing'] },
        'capabilities/alpha': { findings: ['definition-missing'] },
      }),
      focusedRef: null,
    };
    expect(buildFirstWords(input, labels)[0].text).toBe('def:alpha');
    expect(buildFirstWords(input, labels)[0].text).toBe('def:alpha');
  });
});

describe('shared generator for queue rows and first chips', () => {
  it('passes only intent kinds carried by the URL', () => {
    expect(parseNodeIntentKind('missing-definition')).toBe('missing-definition');
    expect(parseNodeIntentKind('map-review')).toBeNull();
    expect(parseNodeIntentKind('drop database')).toBeNull();
    expect(parseNodeIntentKind(null)).toBeNull();
  });

  it('produces the same sentence for a queue row and the first chip of an empty chat', () => {
    const target = node({ title: 'pay' });
    const docFacts = facts({ 'capabilities/pay': { findings: ['definition-missing'] } });
    const fromChip = buildFirstWords(
      { nodes: [target], docFacts, focusedRef: 'capabilities/pay' },
      labels,
    )[0].text;
    const fromSeam = sentenceForIntent(
      nodeIntent(target, 'missing-definition')!,
      labels,
    );
    expect(fromSeam).toBe(fromChip);
  });
});
