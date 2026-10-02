import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { OntologyChangeItem, OntologyChangeSet } from '@/entities/knowledge-graph';
import { OntologyChangeReview } from './OntologyChangeReview';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
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

    /* The raw key is the mono line under the plain name; `contextual-meaning-editor.spec.ts` reads it. */
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
      // An unknown key must never get an invented friendly name.
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

    /* The fold marker sits on the text block. */
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

/** A sentence map reads as one row per target. */
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

/** Never draw a previous value the request did not carry. */
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

/** A field left holding nothing says so in words. */
describe('an emptied or deleted value reads as none', () => {
  const item = (fields: OntologyChangeItem['fields']): OntologyChangeItem => ({
    key: 'patch_concept:0:capabilities/wiki-pages',
    target: 'capabilities/wiki-pages',
    exact: true,
    relation: null,
    fields,
  });

  it('an emptied list', () => {
    renderReview(item([{ key: 'relates', before: ['capabilities/library'], after: [] }]), 'remove');

    const value = screen.getByTestId('ontology-change-review-field-value');
    expect(value).toHaveTextContent('capabilities/library');
    expect(value).toHaveTextContent('valueEmptyList');
    expect(value.textContent).not.toContain('[]');
  });

  it('a deleted key, and an empty previous value', () => {
    renderReview(item([
      { key: 'domain', before: 'domains/checkout', after: null },
      { key: 'relates', before: [], after: ['capabilities/library'] },
    ]));

    const [deleted, added] = screen.getAllByTestId('ontology-change-review-field-value');
    expect(deleted).toHaveTextContent('valueRemoved');
    expect(deleted.textContent).not.toContain('null');
    expect(added).toHaveTextContent('valueEmptyList');
    expect(added.textContent).not.toContain('[]');
  });

  it('a reason that is removed', () => {
    renderReview(item([
      { key: 'relation_notes', before: { 'capabilities/library': 'The library reads pages.' }, after: {} },
    ]), 'remove');

    const row = screen.getByTestId('ontology-change-review-entry-row');
    expect(row).toHaveAttribute('data-change', 'removed');
    expect(row).toHaveTextContent('The library reads pages.');
    expect(row).toHaveTextContent('afterLabel');
    expect(row).toHaveTextContent('noValue');
  });
});

describe('complete selected-item field inspection', () => {
  const fields = (prefix: string) => Array.from({ length: 10 }, (_, index) => ({
    key: `${prefix}_field_${index + 1}`,
    after: `${prefix} value ${index + 1}`,
  }));

  it('reveals every field through a labelled native button and reports honest coverage', () => {
    renderReview({
      key: 'patch_concept:0:capabilities/task-review',
      target: 'capabilities/task-review',
      exact: true,
      relation: null,
      fields: fields('first'),
    });

    expect(screen.getAllByTestId('ontology-change-review-field-row')).toHaveLength(8);
    expect(screen.queryByText('first value 10')).not.toBeInTheDocument();
    const coverage = screen.getByTestId('ontology-change-review-field-coverage');
    expect(coverage).toHaveAttribute('data-visible', '8');
    expect(coverage).toHaveAttribute('data-total', '10');
    expect(coverage).toHaveAttribute('data-hidden', '2');
    const toggle = screen.getByTestId('ontology-change-review-fields-toggle');
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', expect.stringContaining('ontology-change-fields-'));

    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByTestId('ontology-change-review-field-row')).toHaveLength(10);
    expect(screen.getByText('first value 10')).toBeVisible();
    expect(coverage).toHaveAttribute('data-visible', '10');
    expect(coverage).toHaveAttribute('data-hidden', '0');
  });

  it('preserves controlled batch selection and resets disclosure for each selected item', async () => {
    const items: OntologyChangeItem[] = ['first', 'second'].map((prefix, index) => ({
      key: `patch_concept:${index}:capabilities/${prefix}`,
      target: `capabilities/${prefix}`,
      exact: true,
      relation: null,
      fields: fields(prefix),
    }));
    const changeSet: OntologyChangeSet = {
      toolName: 'patch_concepts', operation: 'update', target: items[0].target,
      exact: true, destructive: false, relation: null, fields: items[0].fields,
      itemCount: items.length, items,
    };
    const onActiveItemChange = vi.fn();
    const view = render(<OntologyChangeReview changeSet={changeSet} activeItemIndex={0} onActiveItemChange={onActiveItemChange} />);
    fireEvent.click(screen.getByTestId('ontology-change-review-fields-toggle'));
    expect(screen.getByText('first value 10')).toBeVisible();

    fireEvent.click(screen.getByTestId('acp-ontology-change-item-1'));
    expect(onActiveItemChange).toHaveBeenCalledWith(1);
    view.rerender(<OntologyChangeReview changeSet={changeSet} activeItemIndex={1} onActiveItemChange={onActiveItemChange} />);
    await waitFor(() => expect(screen.queryByText('first value 10')).not.toBeInTheDocument());
    expect(screen.queryByText('second value 10')).not.toBeInTheDocument();
    expect(screen.getByTestId('ontology-change-review-field-coverage')).toHaveAttribute('data-hidden', '2');

    fireEvent.click(screen.getByTestId('acp-ontology-change-item-0'));
    view.rerender(<OntologyChangeReview changeSet={changeSet} activeItemIndex={0} onActiveItemChange={onActiveItemChange} />);
    await waitFor(() => expect(screen.queryByText('second value 10')).not.toBeInTheDocument());
    expect(screen.queryByText('first value 10')).not.toBeInTheDocument();
  });

  it('reports full scope only after hidden fields and folded long values are available', async () => {
    const onFullScopeAvailableChange = vi.fn();
    const item: OntologyChangeItem = {
      key: 'patch_concept:0:capabilities/full-scope', target: 'capabilities/full-scope',
      exact: true, relation: null,
      fields: [...fields('scope').slice(0, 9), { key: 'body', after: Array.from({ length: 12 }, (_, index) => `Complete rule ${index + 1}.`).join('\n') }],
    };
    const changeSet: OntologyChangeSet = {
      toolName: 'patch_concept', operation: 'update', target: item.target, exact: true,
      destructive: false, relation: null, fields: item.fields, itemCount: 1, items: [item],
    };
    render(<OntologyChangeReview changeSet={changeSet} onFullScopeAvailableChange={onFullScopeAvailableChange} />);
    await waitFor(() => expect(onFullScopeAvailableChange).toHaveBeenLastCalledWith(false));
    fireEvent.click(screen.getByTestId('ontology-change-review-fields-toggle'));
    expect(onFullScopeAvailableChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByTestId('ontology-change-review-field-toggle'));
    await waitFor(() => expect(onFullScopeAvailableChange).toHaveBeenLastCalledWith(true));
  });
});
