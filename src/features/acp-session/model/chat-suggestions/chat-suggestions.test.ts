import { describe, expect, it } from 'vitest';

import { chatSuggestions, subjectSuggestions, SUGGESTION_LIMIT } from './chat-suggestions';
import { capabilitiesWithoutDependency, codeShapedTitles, readsLikeCode } from './measured-facts';

/** A row exists only when its number was counted from the map and is above zero. */

const built = {
  nodeCount: 40,
  sourceState: 'bound' as const,
  islands: [] as string[][],
  withoutDependency: [] as string[],
  codeShaped: [] as string[],
  changedSource: null as string[] | null,
};

type Input = Parameters<typeof chatSuggestions>[0];
const kinds = (input: Input) => chatSuggestions(input).map(({ kind }) => kind);

describe('next steps come only from measured facts', () => {
  it('a built map with no measured fact offers no choice, only the quiet line', () => {
    expect(chatSuggestions(built)).toEqual([{ kind: 'nothingLeft', params: {} }]);
    expect(chatSuggestions({ ...built, changedSource: [] })).toEqual([{ kind: 'nothingLeft', params: {} }]);
  });

  it('a starter map offers the build, and connecting first when no code folder is bound', () => {
    expect(kinds({ ...built, nodeCount: 5 })).toEqual(['build']);
    expect(chatSuggestions({ ...built, nodeCount: 0 })[0]?.params).toEqual({ count: 0 });
    expect(kinds({ ...built, nodeCount: 5, sourceState: 'unbound' })).toEqual(['connectSource']);
  });

  it('offers nothing while the source connection is still being read', () => {
    expect(chatSuggestions({ ...built, nodeCount: 5, sourceState: 'loading' })).toEqual([]);
    expect(chatSuggestions({ ...built, nodeCount: 5, sourceState: 'unavailable' })).toEqual([]);
  });

  it('each fact gives its row with its own count and names its slugs', () => {
    const first = (patch: Partial<Input>) => chatSuggestions({ ...built, ...patch })[0];
    expect(first({ withoutDependency: ['capabilities/b', 'capabilities/a'] })).toEqual({
      kind: 'dependencies',
      params: { count: 2, slugs: 'capabilities/a, capabilities/b', rest: 0 },
    });
    expect(first({ islands: [['capabilities/x', 'elements/y'], ['domains/z']] })).toEqual({
      kind: 'standAlone',
      params: { count: 3, slugs: 'capabilities/x, domains/z, elements/y', rest: 0 },
    });
    expect(first({ codeShaped: ['elements/vault-service'] })).toEqual({
      kind: 'rename',
      params: { count: 1, slugs: 'elements/vault-service', rest: 0 },
    });
    expect(first({ changedSource: ['capabilities/export', 'capabilities/export'] })).toEqual({
      kind: 'update',
      params: { count: 1, slugs: 'capabilities/export', rest: 0 },
    });
  });

  it('a long list names twelve slugs and counts the rest', () => {
    const many = Array.from({ length: 15 }, (_, index) => `capabilities/c${String(index).padStart(2, '0')}`);
    const [row] = chatSuggestions({ ...built, withoutDependency: many });
    expect(row?.params.count).toBe(15);
    expect(row?.params.rest).toBe(3);
    expect(String(row?.params.slugs).split(', ')).toHaveLength(12);
  });

  it('keeps a fixed order with the read-only check last, whatever order the facts arrive in', () => {
    expect(kinds({ ...built, changedSource: ['capabilities/a'], islands: [['capabilities/b']] }))
      .toEqual(['standAlone', 'update', 'check']);
    expect(kinds({ ...built, codeShaped: ['elements/a'] })).toEqual(['rename', 'check']);
    expect(chatSuggestions({ ...built, codeShaped: ['elements/a'] }).at(-1)).toEqual({ kind: 'check', params: { count: 40 } });
  });

  it('shows at most three', () => {
    const out = kinds({
      ...built,
      withoutDependency: ['capabilities/a'],
      islands: [['capabilities/b']],
      codeShaped: ['elements/c'],
      changedSource: ['capabilities/d'],
    });
    expect(out).toEqual(['dependencies', 'standAlone', 'rename']);
    expect(out).toHaveLength(SUGGESTION_LIMIT);
  });
});

describe('the measured facts', () => {
  const doc = (slug: string, frontmatter: Record<string, unknown>) => ({
    slug: `ontology/${slug}`,
    frontmatter: { slug, ...frontmatter },
  });

  it('a capability needs a depends_on or an element to leave the dependency list', () => {
    expect(capabilitiesWithoutDependency([
      doc('capabilities/alone', { kind: 'capability', path: 'src/a.ts' }),
      doc('capabilities/empty-lists', { kind: 'capability', depends_on: [], elements: [''] }),
      doc('capabilities/depends', { kind: 'capability', depends_on: ['capabilities/alone'] }),
      doc('capabilities/built', { kind: 'capability', elements: ['elements/x'] }),
      doc('elements/x', { kind: 'element' }),
    ])).toEqual(['capabilities/alone', 'capabilities/empty-lists']);
  });

  it('reads paths, file names, camelCase, snake_case and joined class suffixes as code', () => {
    for (const title of ['src/billing/invoice.ts', 'invoice.ts', 'useVaultHealth', 'vault_health', 'InvoiceService', 'Payment via PaymentHandler']) {
      expect(readsLikeCode(title), title).toBe(true);
    }
    for (const title of ['Issue an invoice', 'Customer Service', 'GitHub sync', 'macOS app shell', 'Next.js routing', '결제 처리']) {
      expect(readsLikeCode(title), title).toBe(false);
    }
  });

  it('checks only domains, capabilities and elements, by their canonical slug', () => {
    expect(codeShapedTitles([
      doc('elements/a', { kind: 'element', title: 'VaultManager' }),
      doc('a-doc', { kind: 'document', title: 'README.md' }),
      doc('domains/b', { kind: 'domain', title: 'Billing' }),
    ])).toEqual(['elements/a']);
  });
});

describe('a picked concept', () => {
  it('asks about that concept, carrying its record slug for the request', () => {
    const out = subjectSuggestions({ slug: 'capabilities/checkout', label: 'Checkout' });
    expect(out.map((suggestion) => suggestion.kind)).toEqual(['explainSubject', 'subjectImpact']);
    expect(out.every((suggestion) => suggestion.params.slug === 'capabilities/checkout' && suggestion.params.subject === 'Checkout')).toBe(true);
  });
});
