import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import koMessages from '../../../../messages/ko.json';
import type { VaultTreeNode } from '@/entities/docs-vault';
import { DocsVaultTree } from './DocsVaultTree';

const tree: VaultTreeNode = {
  name: 'root',
  path: '',
  type: 'dir',
  children: [
    {
      name: 'README',
      path: 'README.md',
      type: 'doc',
      slug: 'README',
      title: 'README',
    },
    {
      name: 'archive',
      path: 'archive',
      type: 'dir',
      children: [
        {
          name: 'old-note',
          path: 'archive/old-note.md',
          type: 'doc',
          slug: 'archive/old-note',
          title: 'Old Note',
        },
      ],
    },
  ],
};

function renderTree({
  selectedSlug = 'README',
  activeTagSlugs,
}: {
  selectedSlug?: string | null;
  activeTagSlugs?: Set<string>;
} = {}) {
  const onSelect = vi.fn();
  rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <DocsVaultTree
        tree={tree}
        selectedSlug={selectedSlug}
        onSelect={onSelect}
        activeTag={activeTagSlugs ? 'archive' : null}
        activeTagSlugs={activeTagSlugs}
      />
    </NextIntlClientProvider>,
  );
  return { onSelect };
}

describe('DocsVaultTree', () => {
  it('starts unrelated folders closed so large worktrees show top-level structure first', () => {
    renderTree({ selectedSlug: 'README' });

    expect(screen.getByRole('button', { name: /archive/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: 'Old Note' })).not.toBeInTheDocument();
  });

  it('opens the folder path that contains the selected source record', () => {
    renderTree({ selectedSlug: 'archive/old-note' });

    expect(screen.getByRole('button', { name: /archive/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Old Note' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('keeps tag-filtered matches discoverable even inside closed folders', () => {
    renderTree({ selectedSlug: 'README', activeTagSlugs: new Set(['archive/old-note']) });

    expect(screen.getByRole('button', { name: /archive/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Old Note' })).toBeInTheDocument();
  });

  it('selects a visible source record', () => {
    const { onSelect } = renderTree({ selectedSlug: 'archive/old-note' });

    fireEvent.click(screen.getByRole('button', { name: 'Old Note' }));

    expect(onSelect).toHaveBeenCalledWith('archive/old-note');
  });
});
