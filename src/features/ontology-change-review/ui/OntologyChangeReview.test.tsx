import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { OntologyChangeItem, OntologyChangeSet } from '@/entities/knowledge-graph';
import { OntologyChangeReview } from './OntologyChangeReview';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderReview(
  item: OntologyChangeItem,
  operation: OntologyChangeSet['operation'] = 'update',
) {
  const changeSet: OntologyChangeSet = {
    toolName: 'patch_concept',
    operation,
    target: item.target,
    exact: item.exact,
    destructive: false,
    relation: item.relation,
    fields: item.fields,
    itemCount: 1,
    items: [item],
  };

  return render(<OntologyChangeReview changeSet={changeSet} />);
}

describe('OntologyChangeReview text fit', () => {
  it('keeps readable field keys in a 96px key track while retaining emergency wrapping', () => {
    renderReview({
      key: 'patch_concept:0:elements/cart-session',
      target: 'elements/cart-session',
      exact: true,
      relation: null,
      fields: [{ key: 'dependencies', after: ['capabilities/account-closure'] }],
    });

    /*
     * ⚠️ Adapted 2026-09-06 with the plain-name redesign. The key used to be the whole `dt`; it is
     * now the mono line **under** the field's plain name, because a frontmatter key alone is not
     * something a person can weigh at a permission checkpoint. Both halves stay: the plain name
     * leads, and the raw key remains because that is the word that will be in the file.
     *
     * The measured property is unchanged and is what `contextual-meaning-editor.spec.ts` reads:
     * the `dt` still carries the testid, still sits in the 6rem track, and still wraps on words.
     */
    const key = screen.getByText('dependencies');
    const term = key.closest('dt');
    expect(term, 'the raw key must stay inside its own field term').not.toBeNull();
    expect(term).toHaveAttribute('data-testid', 'ontology-change-review-field-key');
    expect(term?.textContent).toContain('fieldName.dependencies');
    expect(term?.parentElement).toHaveClass('grid-cols-[6rem_minmax(0,1fr)]');
    expect(term).toHaveClass('break-words');
    expect(term).not.toHaveClass('break-all');
    expect(key).toHaveClass('font-mono');
  });

  it('names a key it cannot name in plain words with the key itself, and nothing else', () => {
    renderReview({
      key: 'patch_concept:0:elements/cart-session',
      target: 'elements/cart-session',
      exact: true,
      relation: null,
      // Not in the schema's plain-word list. Inventing a friendly name for a key we do not know
      // would show a person one thing and write another — the single failure this card cannot have.
      fields: [{ key: 'x_custom_key', after: 'value' }],
    });

    const term = screen.getByTestId('ontology-change-review-field-key');
    expect(term.textContent).toBe('x_custom_key');
    expect(term.querySelector('span')).toHaveClass('font-mono');
  });

  it('wraps values at word boundaries and keeps emergency wrapping for unbroken slugs', () => {
    const { container } = renderReview({
      key: 'add_relation:0:elements/cart-session',
      target: 'elements/cart-session',
      exact: true,
      relation: {
        from: 'elements/cart-session',
        type: 'depends_on',
        to: 'capabilities/account-closure',
        why: 'Acceptance review only; this change will be cancelled.',
      },
      fields: [{ key: 'relation_notes', after: 'Keep whole words readable in the review.' }],
    });

    for (const value of [
      ...screen.getAllByText('elements/cart-session'),
      screen.getByText('depends_on'),
      screen.getByText('capabilities/account-closure'),
      screen.getByText('Keep whole words readable in the review.'),
    ]) {
      expect(value).toHaveClass('break-words');
    }
    expect(container.querySelectorAll('.break-all')).toHaveLength(0);
  });

  it('folds a long body behind show more and unfolds it whole on request', () => {
    const body = Array.from({ length: 12 }, (_, i) => `- src/views/agents/ui/File${i}.tsx: what it carries and why it is cited`).join('\n');
    renderReview({
      key: 'add_concept:0:capabilities/agent-runtime',
      target: 'capabilities/agent-runtime',
      exact: true,
      relation: null,
      fields: [
        { key: 'title', after: 'Agent runtime' },
        { key: 'body', after: body },
      ],
    });

    /*
     * ⚠️ Adapted 2026-09-06. The fold marker moved from the field row onto the text block itself,
     * because one row can now carry a previous value beside the new one and a sentence map carries
     * one text block per target. 「Is this folded?」 became a fact about a block of text rather than
     * about a field. The behaviour under test — first lines only, unclamped whole on request — is
     * unchanged.
     */
    const texts = screen.getAllByTestId('ontology-change-review-text');
    expect(texts[0]).not.toHaveAttribute('data-long');
    expect(screen.queryAllByTestId('ontology-change-review-field-toggle')).toHaveLength(1);

    const folded = texts[1];
    expect(folded).toHaveAttribute('data-folded', 'true');
    expect(folded).toHaveClass('line-clamp-6');

    const toggle = screen.getByTestId('ontology-change-review-field-toggle');
    expect(toggle).toHaveTextContent('showMore');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(folded).toHaveAttribute('data-folded', 'false');
    expect(folded).not.toHaveClass('line-clamp-6');
    expect(toggle).toHaveTextContent('showLess');
    expect(folded).toHaveTextContent('File11.tsx');
  });
});

/**
 * ⚠️ **A map of sentences is a list of decisions, not one value** (owner, installed app, 2026-09-06:
 * *"can this design be improved? … something is lacking"*).
 *
 * `relation_notes` carries one sentence per target. It reached this card first as a single JSON
 * string on one line and then as one text block of alternating lines — in both shapes a person had
 * to parse the value before they could judge any part of it, at a checkpoint that stops the agent.
 * One row per target, the target quiet and the sentence at reading size, is what makes 「is this
 * right?」 answerable line by line.
 */
describe('sentence maps read as one row per target', () => {
  const NOTES = {
    'domains/checkout': 'Checkout owns the basket, so the session hangs off it.',
    'capabilities/payment-capture': 'Capture reads the same session id.',
    'elements/cart-store': 'The store is where the session is persisted.',
  };

  it('gives every target its own row and never prints the map as JSON', () => {
    renderReview({
      key: 'patch_concept:0:elements/cart-session',
      target: 'elements/cart-session',
      exact: true,
      relation: null,
      fields: [{ key: 'relation_notes', after: NOTES }],
    });

    const rows = screen.getAllByTestId('ontology-change-review-entry-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('domains/checkout');
    expect(rows[0]).toHaveTextContent('Checkout owns the basket, so the session hangs off it.');

    const review = screen.getByTestId('acp-ontology-change-review');
    expect(review.textContent, 'a person must never be asked to read JSON here').not.toContain('{"');
    // The sentence is the point of the row, so it is set at reading size, not at label size.
    expect(screen.getByText(NOTES['elements/cart-store'])).toHaveClass('text-body');
  });

  it('shows the sentence a target already had when the change set carried one', () => {
    renderReview({
      key: 'patch_concept:0:elements/cart-session',
      target: 'elements/cart-session',
      exact: true,
      relation: null,
      fields: [
        {
          key: 'relation_notes',
          before: { 'domains/checkout': 'An older reason nobody rewrote.' },
          after: { 'domains/checkout': NOTES['domains/checkout'] },
        },
      ],
    });

    const row = screen.getByTestId('ontology-change-review-entry-row');
    expect(row).toHaveTextContent('An older reason nobody rewrote.');
    expect(row).toHaveTextContent('beforeLabel');
  });
});

/**
 * ⚠️ **Never draw a previous value the request did not carry.** `before` is populated only by an
 * editor that already holds the document; an ACP request carries the requested after-values alone.
 * Rendering a bare value with no note lets a person read it as 「this replaces nothing」, which is a
 * claim nobody made. The card says which of the two situations it is in instead.
 */
describe('before and after are drawn only from what the change set carries', () => {
  const item = (fields: OntologyChangeItem['fields']): OntologyChangeItem => ({
    key: 'patch_concept:0:elements/cart-session',
    target: 'elements/cart-session',
    exact: true,
    relation: null,
    fields,
  });

  it('stacks the previous value above the new one when it exists', () => {
    renderReview(item([{ key: 'title', before: 'Cart session', after: 'Checkout session' }]));

    const value = screen.getByTestId('ontology-change-review-field-value');
    expect(value).toHaveAttribute('data-has-before', 'true');
    expect(value).toHaveTextContent('Cart session');
    expect(value).toHaveTextContent('Checkout session');
    expect(value).toHaveTextContent('beforeLabel');
    expect(value).toHaveTextContent('afterLabel');
    expect(screen.queryByTestId('ontology-change-review-value-note')).toBeNull();
  });

  it('says the values are new when the whole concept is being created', () => {
    renderReview(item([{ key: 'title', after: 'Checkout session' }]), 'create');

    const note = screen.getByTestId('ontology-change-review-value-note');
    expect(note).toHaveAttribute('data-note', 'new');
    expect(note).toHaveTextContent('allValuesNew');
  });

  it('says only the after-values are known when the request carried no previous value', () => {
    renderReview(item([{ key: 'title', after: 'Checkout session' }]));

    const note = screen.getByTestId('ontology-change-review-value-note');
    expect(note).toHaveAttribute('data-note', 'after-only');
    expect(screen.getByTestId('ontology-change-review-field-value')).not.toHaveAttribute(
      'data-has-before',
    );
  });
});
