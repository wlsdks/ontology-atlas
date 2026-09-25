import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultDoc } from '@/entities/docs-vault';
import enMessages from '../../../../messages/en.json';
import { LibraryConstellations } from './LibraryConstellations';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  reload: vi.fn(async () => undefined),
  useSavedConstellations: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/features/saved-constellations', () => ({
  useSavedConstellations: (handle: FileSystemDirectoryHandle | null) => mocks.useSavedConstellations(handle),
}));

const HANDLE = {} as FileSystemDirectoryHandle;
const UID = '11111111-1111-4111-8111-111111111111';
const MISSING_UID = '22222222-2222-4222-8222-222222222222';

const DOCUMENT: VaultDoc = {
  slug: 'capabilities/checkout',
  path: 'capabilities/checkout.md',
  title: 'Checkout',
  tags: [],
  frontmatter: { uid: UID, kind: 'capability', display_ko: '결제' },
  headings: [],
  excerpt: '',
  wordCount: 0,
  updatedAt: '2026-09-15T00:00:00.000Z',
  linksOut: [],
};

function renderView(documents: readonly VaultDoc[] = [DOCUMENT]) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LibraryConstellations handle={HANDLE} documents={documents} />
    </NextIntlClientProvider>,
  );
}

describe('LibraryConstellations', () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.reload.mockClear();
    mocks.useSavedConstellations.mockReset();
  });

  it('opens the current document and full saved set while keeping missing concepts and attachments explicit', async () => {
    mocks.useSavedConstellations.mockReturnValue({
      status: 'ready',
      error: null,
      reload: mocks.reload,
      saveConstellation: vi.fn(),
      deleteConstellation: vi.fn(),
      constellations: [{
        folder: {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Ontology write review',
          purpose: 'Review evidence before changing meaning.',
          parentId: null,
          order: 0,
          presentation: 'constellation',
          createdAt: '2026-09-15T00:00:00.000Z',
          updatedAt: '2026-09-15T00:00:00.000Z',
        },
        items: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            folderId: '33333333-3333-4333-8333-333333333333',
            order: 0,
            label: 'Checkout',
            target: { kind: 'ontology', uid: UID, lastKnownPath: 'capabilities/checkout.md' },
          },
          {
            id: '55555555-5555-4555-8555-555555555555',
            folderId: '33333333-3333-4333-8333-333333333333',
            order: 1,
            label: 'Removed approval flow',
            target: { kind: 'ontology', uid: MISSING_UID, lastKnownPath: 'capabilities/approval.md' },
          },
          {
            id: '66666666-6666-4666-8666-666666666666',
            folderId: '33333333-3333-4333-8333-333333333333',
            order: 2,
            label: 'Decision notes.pdf',
            target: { kind: 'source', path: 'sources/Decision notes.pdf' },
          },
        ],
      }],
    });

    renderView();

    expect(await screen.findByText('Capability')).toBeInTheDocument();
    expect(screen.getByText('2 concepts')).toBeInTheDocument();
    expect(screen.getByText('1 reference')).toBeInTheDocument();
    expect(screen.getByText('Removed approval flow')).toBeInTheDocument();
    expect(screen.getByText('Missing')).toBeInTheDocument();
    expect(screen.getByText('Source reference')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('library-constellation-member-44444444-4444-4444-8444-444444444444'));
    expect(mocks.push).toHaveBeenLastCalledWith('/library/?tab=ontology&slug=capabilities%2Fcheckout');

    fireEvent.click(screen.getByRole('button', { name: 'View Ontology write review on the map' }));
    expect(mocks.push).toHaveBeenLastCalledWith(
      '/topology/?constellation=33333333-3333-4333-8333-333333333333',
    );
  });

  it('routes the empty state to the existing Galaxy constellation editor', () => {
    mocks.useSavedConstellations.mockReturnValue({
      status: 'ready',
      constellations: [],
      error: null,
      reload: mocks.reload,
      saveConstellation: vi.fn(),
      deleteConstellation: vi.fn(),
    });

    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Pick on the map' }));

    expect(mocks.useSavedConstellations).toHaveBeenCalledWith(HANDLE);
    expect(mocks.push).toHaveBeenCalledWith('/topology/?constellation=new');
  });

  it('with no concept to pick, the primary door adds concepts on the map instead', () => {
    mocks.useSavedConstellations.mockReturnValue({
      status: 'ready',
      constellations: [],
      error: null,
      reload: mocks.reload,
      saveConstellation: vi.fn(),
      deleteConstellation: vi.fn(),
    });

    renderView([]);
    expect(screen.queryByRole('button', { name: 'Pick on the map' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add concepts on the map' }));

    expect(mocks.push).toHaveBeenCalledWith('/topology/');
  });
});
