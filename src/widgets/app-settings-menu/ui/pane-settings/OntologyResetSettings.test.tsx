import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../messages/en.json';
import { OntologyResetSettings } from './OntologyResetSettings';

const state = vi.hoisted(() => ({
  docs: [] as Array<{ slug: string; path: string; frontmatter: Record<string, unknown> }>,
  handle: {
    getDirectoryHandle: vi.fn(),
    getFileHandle: vi.fn(),
    removeEntry: vi.fn(),
  },
  refresh: vi.fn(async () => undefined),
}));

vi.mock('@/entities/vault-session', () => ({
  useLocalVault: () => ({
    status: 'loaded',
    handle: state.handle,
    manifest: { docs: state.docs },
    refresh: state.refresh,
    markSelfWrite: vi.fn(),
  }),
}));
vi.mock('@/shared/ui/toast/toast', () => ({ useToast: () => ({ show: vi.fn() }) }));

const doc = (path: string, kind?: string) => ({
  slug: path.replace(/\.md$/, ''),
  path,
  frontmatter: kind ? { kind } : {},
});

function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <OntologyResetSettings />
    </NextIntlClientProvider>,
  );
}

describe('OntologyResetSettings', () => {
  it('is hidden when the folder holds no concept document', () => {
    state.docs = [doc('README.md', 'vault-readme'), doc('wiki/page.md', 'document'), doc('notes/plain.md')];
    mount();
    expect(screen.queryByTestId('app-settings-reset')).not.toBeInTheDocument();
  });

  it('asks with the concept count and moves nothing on Cancel', async () => {
    state.docs = [doc('project.md', 'project'), doc('domains/orders.md', 'domain'), doc('wiki/page.md', 'document')];
    mount();
    fireEvent.click(screen.getByTestId('app-settings-reset-open'));
    const dialog = await screen.findByTestId('app-settings-reset-dialog');
    expect(dialog).toHaveTextContent(/\b2\b/);
    fireEvent.click(screen.getByTestId('app-settings-reset-cancel'));
    await waitFor(() => expect(screen.queryByTestId('app-settings-reset-dialog')).not.toBeInTheDocument());
    expect(state.handle.getDirectoryHandle).not.toHaveBeenCalled();
    expect(state.handle.getFileHandle).not.toHaveBeenCalled();
    expect(state.handle.removeEntry).not.toHaveBeenCalled();
    expect(state.refresh).not.toHaveBeenCalled();
  });
});
