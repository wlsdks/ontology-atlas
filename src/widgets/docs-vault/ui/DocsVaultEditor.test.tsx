import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import { DocsVaultEditor } from './DocsVaultEditor';

const doc: VaultDoc = {
  slug: 'ARCHITECTURE',
  path: 'docs/ARCHITECTURE.md',
  title: 'Architecture',
  description: 'Architecture doc',
  tags: ['architecture'],
  frontmatter: {},
  headings: [],
  excerpt: 'Architecture overview',
  wordCount: 10,
  updatedAt: '2026-04-23',
  mode: 'engineer',
  linksOut: [],
};

describe('DocsVaultEditor', () => {
  it('saves edited content and shows saved feedback', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <DocsVaultEditor
        doc={doc}
        getDocContent={async () => 'initial'}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    const editor = await screen.findByDisplayValue('initial');
    fireEvent.change(editor, { target: { value: 'updated' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(doc.slug, 'updated'));
    expect(await screen.findByText('저장됨')).toBeInTheDocument();
  });

  it('asks before closing with unsaved changes', async () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <DocsVaultEditor
        doc={doc}
        getDocContent={async () => 'initial'}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );

    const editor = await screen.findByDisplayValue('initial');
    fireEvent.change(editor, { target: { value: 'unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: /취소/ }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /취소/ }));
    expect(onClose).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
