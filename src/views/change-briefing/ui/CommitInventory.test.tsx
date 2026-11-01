import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
import { CommitInventory } from './CommitInventory';

const data: ChangeBriefing = { status: 'measured', sourceRoot: '/source', head: 'head', snapshot: 'period', base: null, tip: 'tip', netPaths: [], limit: 10, partialReasons: [], commits: [
  { hash: 'a'.repeat(40), subject: 'First commit', message: 'first original', messageComplete: true, committedAt: '2026-01-01T00:00:00Z', paths: [] },
  { hash: 'b'.repeat(40), subject: 'Incomplete commit', message: 'truncated', messageComplete: false, committedAt: '2026-01-02T00:00:00Z', paths: [] },
] };

it('shows only the selected commit original and restores focus to its list row', async () => {
  render(<CommitInventory data={data} onExplain={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /First commit/ }));
  expect(screen.getByText('first original')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Incomplete commit/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'backToCommit' }));
  expect(screen.getByRole('button', { name: /Incomplete commit/ })).toBeVisible();
  await waitFor(() => expect(screen.getByRole('button', { name: /First commit/ })).toHaveFocus());
});

it('does not show an incomplete commit body as the complete author original', () => {
  render(<CommitInventory data={data} onExplain={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Incomplete commit/ }));
  expect(screen.getByText('sourceUnavailableInline')).toBeVisible();
  expect(screen.queryByText('truncated')).toBeNull();
});

it('drops the selected commit on a new period', () => {
  const view = render(<CommitInventory data={data} onExplain={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /First commit/ }));
  view.rerender(<CommitInventory data={{ ...data, snapshot: 'next', commits: [] }} onExplain={vi.fn()} />);
  expect(screen.queryByText('first original')).toBeNull();
  expect(screen.queryByRole('button', { name: 'commitPrepare' })).toBeNull();
});
