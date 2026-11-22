import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../messages/en.json';
import { AnswerRevisionComparison } from './AnswerRevisionComparison';

function Comparison({
  after,
  knownOriginalPaths,
  onOpenSource,
}: {
  after: string;
  knownOriginalPaths?: ReadonlySet<string>;
  onOpenSource: (path: string, anchor?: string) => void;
}) {
  const t = useTranslations('library');
  return (
    <AnswerRevisionComparison
      open
      question="Where is the source?"
      before="The previous answer."
      after={after}
      problems={[]}
      error={null}
      saving={false}
      onClose={() => {}}
      onSave={() => {}}
      onOpenSource={onOpenSource}
      knownOriginalPaths={knownOriginalPaths}
      t={t}
    />
  );
}

function renderComparison(props: Omit<ComponentProps<typeof Comparison>, 'onOpenSource'> & {
  onOpenSource?: (path: string, anchor?: string) => void;
}) {
  const onOpenSource = props.onOpenSource ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <Comparison {...props} onOpenSource={onOpenSource} />
    </NextIntlClientProvider>,
  );
  return { onOpenSource };
}

describe('AnswerRevisionComparison source citations', () => {
  it('opens a known citation with its exact path and anchor', async () => {
    const { onOpenSource } = renderComparison({
      after: 'A measured fact [[src:sources/%EC%84%A4%EA%B3%84.md#l2|원문]]',
      knownOriginalPaths: new Set(['sources/설계.md']),
    });

    const citation = await screen.findByRole('button', {
      name: 'Open original source sources/설계.md · line 2',
    });
    expect(citation).toHaveTextContent(/^원문$/);
    expect(citation).toHaveAttribute('data-source-path', 'sources/설계.md');
    expect(citation).toHaveAttribute('data-source-anchor', 'l2');

    fireEvent.click(citation);
    expect(onOpenSource).toHaveBeenCalledWith('sources/설계.md', 'l2');
  });

  it('keeps citation filenames with spaces and parentheses operable in raw and encoded forms', async () => {
    const { onOpenSource } = renderComparison({
      after: [
        'Raw [[src:sources/Team notes (v2).md#l2]]',
        'Encoded [[src:sources/Team%20notes%20(v2).md#l2]]',
      ].join('\n\n'),
      knownOriginalPaths: new Set(['sources/Team notes (v2).md']),
    });

    const citations = await screen.findAllByRole('button', {
      name: 'Open original source sources/Team notes (v2).md · line 2',
    });
    expect(citations).toHaveLength(2);
    // Unlabelled: the place in words, and the file, since no head names it here.
    for (const citation of citations) expect(citation).toHaveTextContent(/^Team notes \(v2\)\.md · line 2$/);

    fireEvent.click(citations[0]!);
    fireEvent.click(citations[1]!);
    expect(onOpenSource).toHaveBeenNthCalledWith(1, 'sources/Team notes (v2).md', 'l2');
    expect(onOpenSource).toHaveBeenNthCalledWith(2, 'sources/Team notes (v2).md', 'l2');
  });

  it('says only the place for the one original the column head already names', async () => {
    renderComparison({
      after: ['---', 'sources:', '  - sources/plan.md', '---', 'The freeze is on 2026-10-06 [[src:sources/plan.md#l7]]'].join('\n'),
      knownOriginalPaths: new Set(['sources/plan.md']),
    });

    const citation = await screen.findByRole('button', { name: 'Open original source sources/plan.md · line 7' });
    expect(citation).toHaveTextContent(/^line 7$/);
  });

  it('marks a citation missing when the allow-list excludes its path', async () => {
    const { onOpenSource } = renderComparison({
      after: 'A fact [[src:sources/missing.md#l1]]',
      knownOriginalPaths: new Set(['sources/storage.md']),
    });

    const citation = await screen.findByText('missing.md · line 1');
    expect(citation.tagName).toBe('SPAN');
    expect(citation).toHaveAttribute(
      'title',
      'Original source not in this folder: sources/missing.md',
    );
    expect(screen.queryByRole('button', { name: /Open original source/ })).toBeNull();
    expect(onOpenSource).not.toHaveBeenCalled();
  });

  it('keeps the citation visibly unavailable without a source allow-list', async () => {
    renderComparison({
      after: 'A fact [[src:sources/storage.md#l1]]',
    });

    const citation = await screen.findByText('storage.md · line 1');
    expect(citation.tagName).toBe('SPAN');
    expect(citation).toHaveAttribute(
      'title',
      'Source navigation is unavailable: sources/storage.md',
    );
    expect(screen.queryByRole('button', { name: /Open original source/ })).toBeNull();
  });
});
