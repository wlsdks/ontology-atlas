import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { OntologyChangeItem, OntologyChangeSet } from '@/entities/knowledge-graph';
import { OntologyChangeReview } from './OntologyChangeReview';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderReview(item: OntologyChangeItem) {
  const changeSet: OntologyChangeSet = {
    toolName: 'patch_concept',
    operation: 'update',
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

    const key = screen.getByText('dependencies');
    expect(key.tagName).toBe('DT');
    expect(key.parentElement).toHaveClass('grid-cols-[6rem_minmax(0,1fr)]');
    expect(key).toHaveClass('break-words');
    expect(key).not.toHaveClass('break-all');
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

    const values = screen.getAllByTestId('ontology-change-review-field-value');
    expect(values[0]).not.toHaveAttribute('data-long');
    expect(screen.queryAllByTestId('ontology-change-review-field-toggle')).toHaveLength(1);

    const folded = values[1];
    expect(folded).toHaveAttribute('data-folded', 'true');
    expect(folded.querySelector('span')).toHaveClass('line-clamp-6');

    const toggle = screen.getByTestId('ontology-change-review-field-toggle');
    expect(toggle).toHaveTextContent('showMore');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(folded).toHaveAttribute('data-folded', 'false');
    expect(folded.querySelector('span')).not.toHaveClass('line-clamp-6');
    expect(toggle).toHaveTextContent('showLess');
    expect(folded).toHaveTextContent('File11.tsx');
  });
});
