import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '../../../../../messages/en.json';
import { useTranslations } from 'next-intl';
import { retainedAnswerHeads } from '@/features/library';
import { LibraryQuestions } from './LibraryQuestions';

function Fixture({ onOpen, hashes }: { onOpen: (slug: string) => void; hashes: Map<string, string> }) {
  const t = useTranslations('library');
  const answers = retainedAnswerHeads([
    { slug: 'wiki/answers/base', title: 'Which policy?', frontmatter: {} },
    ...['one', 'two'].map((name) => ({ slug: `wiki/answers/${name}`, title: `Which policy? (${name})`, frontmatter: { answer_thread: 'wiki/answers/base', answer_previous: 'wiki/answers/base', sources: ['sources/policy.md'], answer_source_observations: { 'sources/policy.md': 'a'.repeat(64) } } })),
  ]);
  return <LibraryQuestions answers={answers} knownSources={new Set(['sources/policy.md'])} hashes={hashes} onOpen={onOpen} onAsk={null} askBlockedReason={null} t={t} />;
}

describe('the retained question entrance', () => {
  it('keeps alternative heads reachable and reports changed evidence on both', () => {
    const onOpen = vi.fn();
    render(<NextIntlClientProvider locale="en" messages={en}><Fixture onOpen={onOpen} hashes={new Map([['sources/policy.md', 'b'.repeat(64)]])} /></NextIntlClientProvider>);
    expect(screen.getAllByText('2 alternative revisions')).toHaveLength(2);
    expect(screen.getAllByText('Cited originals changed')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Which policy? (two)' })).toHaveAccessibleDescription('Cited originals changed 2 alternative revisions');
    fireEvent.click(screen.getByRole('button', { name: 'Which policy? (two)' }));
    expect(onOpen).toHaveBeenCalledWith('wiki/answers/two');
  });
});
