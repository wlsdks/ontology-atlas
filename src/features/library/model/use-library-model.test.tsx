import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { VaultDoc } from '@/entities/docs-vault';

import { useLibraryModel, type LibraryUiModel } from './use-library-model';

/** A page's words as the Library keeps them, which say which version of its text was read. */
const wordsOf = (model: LibraryUiModel) => model.pageFacts.get('wiki/answer')?.retrieval.words.join(' ');

function handle(text: string): FileSystemFileHandle {
  return { getFile: async () => ({ text: async () => text }) } as unknown as FileSystemFileHandle;
}
const docs: VaultDoc[] = [{ slug: 'wiki/answer', title: 'Answer', path: 'wiki/answer.md', mtime: 1,
  frontmatter: {}, tags: [], linksOut: [], updatedAt: '' }];
const sourceHandles = new Map<string, FileSystemFileHandle>();
const sources: [] = [];

describe('Library page facts reused by local Compile retrieval', () => {
  it('never exposes a previous folder page when another vault has the same slug and mtime', async () => {
    const firstFiles = new Map([['wiki/answer', handle('Private first-folder text')]]);
    const { result, rerender } = renderHook(({ scope, files }) => useLibraryModel({ docs, sources, sourceHandles,
      fileHandles: files, vaultRootPath: null, vaultScope: scope, enabled: true }), {
      initialProps: { scope: 'local:first-handle', files: firstFiles },
    });
    await waitFor(() => expect(wordsOf(result.current)).toBe('private first folder text'));
    rerender({ scope: 'local:second-handle', files: new Map([['wiki/answer', handle('Second-folder text')]]) });
    expect(wordsOf(result.current)).not.toBe('private first folder text');
    await waitFor(() => expect(wordsOf(result.current)).toBe('second folder text'));
    rerender({ scope: 'local:first-handle', files: firstFiles });
    await waitFor(() => expect(wordsOf(result.current)).toBe('private first folder text'));
  });

  it('withholds an older page immediately when its page version changes', async () => {
    const { result, rerender } = renderHook(({ version, text }) => useLibraryModel({
      docs: [{ ...docs[0], mtime: version }], sources, sourceHandles,
      fileHandles: new Map([['wiki/answer', handle(text)]]), vaultRootPath: null, vaultScope: 'local:one', enabled: true,
    }), { initialProps: { version: 1, text: 'Earlier text' } });
    await waitFor(() => expect(wordsOf(result.current)).toBe('earlier text'));
    rerender({ version: 2, text: 'Updated text' });
    expect(wordsOf(result.current)).not.toBe('earlier text');
    await waitFor(() => expect(wordsOf(result.current)).toBe('updated text'));
  });

  it('rereads a page after its older version has left the current folder snapshot', async () => {
    const { result, rerender } = renderHook(({ version, text }) => useLibraryModel({
      docs: [{ ...docs[0], mtime: version }], sources, sourceHandles,
      fileHandles: new Map([['wiki/answer', handle(text)]]), vaultRootPath: null, vaultScope: 'local:one', enabled: true,
    }), { initialProps: { version: 1, text: 'First revision' } });
    await waitFor(() => expect(wordsOf(result.current)).toBe('first revision'));
    rerender({ version: 2, text: 'Second revision' });
    await waitFor(() => expect(wordsOf(result.current)).toBe('second revision'));
    rerender({ version: 1, text: 'Restored file bytes' });
    await waitFor(() => expect(wordsOf(result.current)).toBe('restored file bytes'));
  });

  it('releases a removed page before that slug is added again', async () => {
    const { result, rerender } = renderHook(({ present, text }) => useLibraryModel({
      docs: present ? docs : [], sources, sourceHandles,
      fileHandles: new Map([['wiki/answer', handle(text)]]), vaultRootPath: null, vaultScope: 'local:one', enabled: true,
    }), { initialProps: { present: true, text: 'Removed bytes' } });
    await waitFor(() => expect(wordsOf(result.current)).toBe('removed bytes'));
    rerender({ present: false, text: '' });
    expect(result.current.pageFacts.size).toBe(0);
    rerender({ present: true, text: 'Replacement bytes' });
    await waitFor(() => expect(wordsOf(result.current)).toBe('replacement bytes'));
  });
});
