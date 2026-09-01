import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReviewQueueSection } from './ReviewQueueSection';

type T = Parameters<typeof ReviewQueueSection>[0]['t'];

/** The real catalogue is exercised by the i18n contract; here only the shape matters. */
const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${Object.values(values).join(',')}` : key) as unknown as T;

describe('ReviewQueueSection', () => {
  it('draws nothing at all when nothing is waiting', () => {
    // Not an empty-state card. A permanently present "0 waiting" panel spends the
    // top of the document list on a fact nobody needs to act on.
    const { container } = render(
      <ReviewQueueSection rows={[]} selectedSlug={null} onSelect={vi.fn()} t={t} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('keeps the two reasons in separate groups with their own counts', () => {
    render(
      <ReviewQueueSection
        rows={[
          { slug: 'capabilities/a', title: 'A', reason: 'raised', note: 'Who owns this boundary?' },
          { slug: 'capabilities/b', title: 'B', reason: 'changed-since-review', reviewedBy: 'dana' },
        ]}
        selectedSlug={null}
        onSelect={vi.fn()}
        t={t}
      />,
    );
    // Merging them into one number would hide that they are different work: one
    // is a question waiting for an answer, the other is an approval that stopped
    // describing its node.
    expect(screen.getByText('review.raisedHeader:1')).toBeInTheDocument();
    expect(screen.getByText('review.changedHeader:1')).toBeInTheDocument();
  });

  it("shows the agent's own sentence so a row can be triaged without opening it", () => {
    render(
      <ReviewQueueSection
        rows={[{ slug: 'capabilities/a', title: 'A', reason: 'raised', note: 'Who owns this boundary?' }]}
        selectedSlug={null}
        onSelect={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('Who owns this boundary?')).toBeInTheDocument();
  });

  it('names who confirmed a drifted node, because that is who has to look again', () => {
    render(
      <ReviewQueueSection
        rows={[{ slug: 'capabilities/b', title: 'B', reason: 'changed-since-review', reviewedBy: 'dana' }]}
        selectedSlug={null}
        onSelect={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('review.changedBy:dana')).toBeInTheDocument();
  });

  it('selects the document the row names', async () => {
    const onSelect = vi.fn();
    render(
      <ReviewQueueSection
        rows={[{ slug: 'capabilities/a', title: 'A', reason: 'raised' }]}
        selectedSlug={null}
        onSelect={onSelect}
        t={t}
      />,
    );
    screen.getByRole('button', { name: /A/ }).click();
    expect(onSelect).toHaveBeenCalledWith('capabilities/a');
  });

  it('marks the open row as current so the list and the canvas agree', () => {
    render(
      <ReviewQueueSection
        rows={[{ slug: 'capabilities/a', title: 'A', reason: 'raised' }]}
        selectedSlug="capabilities/a"
        onSelect={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByRole('button', { name: /A/ })).toHaveAttribute('aria-current', 'true');
  });
});
