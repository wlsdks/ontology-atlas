import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider, useTranslations } from 'next-intl';

import messages from '../../../../../messages/en.json';
import type { LocalCompileSession } from '@/features/vault-agent';
import { LocalCompileCard } from './LocalCompileCard';

const BEFORE = '---\ntitle: Prior page\n---\n\nPersonal note: wait for Morgan.\n';
const AFTER = '---\ntitle: Revised page\n---\n\nPersonal note: wait for Morgan.\nMigration is unconfirmed.\n';

function Harness({ existing = true }: { existing?: boolean }) {
  const t = useTranslations('library');
  const session = {
    status: 'waiting',
    allow: vi.fn(), dismiss: vi.fn(),
    card: {
      writableCount: 1, refusedCount: 0,
      rows: [{ path: 'wiki/records.md', title: 'Records', ok: true, replaces: existing,
        sections: [], citationCount: 1, sourcesRead: ['sources/records.md'],
        sourcesTruncated: [], sourcesUnreadable: [], problems: [], page: AFTER }],
      proposal: { changes: [{ files: [{ path: 'wiki/records.md', before: existing ? BEFORE : null, after: AFTER }] }] },
    },
  } as unknown as LocalCompileSession;
  return <LocalCompileCard session={session} model="local" t={t} />;
}

describe('local Compile review text', () => {
  it('lets the person inspect the exact replacement and the complete prior page before Allow', () => {
    render(<NextIntlClientProvider locale="en" messages={messages}><Harness /></NextIntlClientProvider>);
    expect(screen.getByTestId('library-local-compile-preview').textContent).toBe(AFTER);
    fireEvent.click(screen.getByRole('radio', { name: 'Previous page' }));
    expect(screen.getByTestId('library-local-compile-preview').textContent).toBe(BEFORE);
    fireEvent.click(screen.getByRole('radio', { name: 'Proposed page' }));
    expect(screen.getByTestId('library-local-compile-preview').textContent).toBe(AFTER);
    expect(screen.getByTestId('library-local-compile-allow')).toBeEnabled();
  });

  it('offers a new page preview without inventing a previous version', () => {
    render(<NextIntlClientProvider locale="en" messages={messages}><Harness existing={false} /></NextIntlClientProvider>);
    fireEvent.click(screen.getByTestId('library-local-compile-review-toggle'));
    expect(screen.getByTestId('library-local-compile-preview').textContent).toBe(AFTER);
    expect(screen.queryByRole('radio', { name: 'Previous page' })).not.toBeInTheDocument();
  });
});
