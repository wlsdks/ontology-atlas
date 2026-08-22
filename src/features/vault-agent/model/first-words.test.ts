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
      { hasDefinition: true, domainRef: 'billing', mtime: null, ...value },
    ]),
  );
}

describe('buildFirstWords', () => {
  it('빈 폴더에서는 칩 하나만 — 지목할 개념이 없는데 개념 이야기를 하지 않는다', () => {
    const chips = buildFirstWords(
      { nodes: [], docFacts: new Map(), focusedRef: null },
      labels,
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].intent.kind).toBe('empty-vault');
    expect(chips[0].text).toBe('empty');
  });

  it('화면 슬롯이 1번 — 보고 있는 개념의 가장 큰 틈을 먼저 말한다', () => {
    const chips = buildFirstWords(
      {
        nodes: [node({ title: 'pay' }), node({ title: 'refund' })],
        docFacts: facts({
          'capabilities/pay': { hasDefinition: false },
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

  it('포커스가 없으면 화면 슬롯을 만들지 않는다 — 없는 것을 있다고 말하지 않는다', () => {
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

  it('결함 0 폴더에서는 상비 슬롯만 남는다', () => {
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

  it('같은 개념을 두 번 말하지 않는다 — 화면 슬롯이 집은 개념은 큐가 건너뛴다', () => {
    const chips = buildFirstWords(
      {
        nodes: [node({ title: 'pay' })],
        docFacts: facts({ 'capabilities/pay': { hasDefinition: false } }),
        focusedRef: 'capabilities/pay',
      },
      labels,
    );
    expect(chips.map((chip) => chip.slot)).toEqual(['screen', 'standing']);
  });

  it('자기 문서가 없는 파생 개념은 지목하지 않는다 — 고칠 파일이 없다', () => {
    const derived = node({ title: 'derived', hasOwnDocument: false });
    const chips = buildFirstWords(
      {
        nodes: [derived],
        docFacts: facts({ 'capabilities/derived': { hasDefinition: false } }),
        focusedRef: 'capabilities/derived',
      },
      labels,
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].intent.kind).toBe('empty-vault');
    expect(screenIntentFor(derived, facts({}))).toBeNull();
  });

  it('멀쩡한 개념에는 주장 대신 질문이 붙는다', () => {
    const intent = screenIntentFor(
      node({ title: 'pay' }),
      facts({ 'capabilities/pay': {} }),
    );
    expect(intent?.kind).toBe('missing-relations');
    expect(sentenceForIntent(intent!, labels)).toBe('rel:pay');
  });

  it('칩 순서는 폴더가 같으면 같다 — 이름순 고정', () => {
    const input = {
      nodes: [node({ title: 'zulu' }), node({ title: 'alpha' })],
      docFacts: facts({
        'capabilities/zulu': { hasDefinition: false },
        'capabilities/alpha': { hasDefinition: false },
      }),
      focusedRef: null,
    };
    expect(buildFirstWords(input, labels)[0].text).toBe('def:alpha');
    expect(buildFirstWords(input, labels)[0].text).toBe('def:alpha');
  });
});

describe('S7 이음새 — 같은 생성기', () => {
  it('URL 이 나른 의도 종류만 통과시킨다', () => {
    expect(parseNodeIntentKind('missing-definition')).toBe('missing-definition');
    expect(parseNodeIntentKind('map-review')).toBeNull();
    expect(parseNodeIntentKind('drop database')).toBeNull();
    expect(parseNodeIntentKind(null)).toBeNull();
  });

  it('큐 행에서 건너온 문장과 빈 대화 1번 칩이 같은 문장이다', () => {
    const target = node({ title: 'pay' });
    const docFacts = facts({ 'capabilities/pay': { hasDefinition: false } });
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
