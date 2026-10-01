import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { VaultDoc } from '@/entities/docs-vault';

import { useLibraryModel } from './use-library-model';

function handle(text: string): FileSystemFileHandle {
  return { getFile: async () => ({ text: async () => text }) } as unknown as FileSystemFileHandle;
}
const docs: VaultDoc[] = [{ slug: 'wiki/answer', title: 'Answer', path: 'wiki/answer.md', mtime: 1,
  frontmatter: {}, tags: [], headings: [], excerpt: '', linksOut: [], updatedAt: '', wordCount: 0 }];
const sourceHandles = new Map<string, FileSystemFileHandle>();
const sources: [] = [];

describe('Library bodies reused by local Compile retrieval', () => {
  it('never exposes a previous folder body when another vault has the same slug and mtime', async () => {
    const firstFiles = new Map([['wiki/answer', handle('Private first-folder text')]]);
    const { result, rerender } = renderHook(({ scope, files }) => useLibraryModel({ docs, sources, sourceHandles,
      fileHandles: files, vaultRootPath: null, vaultScope: scope, enabled: true }), {
      initialProps: { scope: 'local:first-handle', files: firstFiles },
    });
    await waitFor(() => expect(result.current.pageTexts.get('wiki/answer')).toBe('Private first-folder text'));
    rerender({ scope: 'local:second-handle', files: new Map([['wiki/answer', handle('Second-folder text')]]) });
    expect(result.current.pageTexts.get('wiki/answer')).not.toBe('Private first-folder text');
    await waitFor(() => expect(result.current.pageTexts.get('wiki/answer')).toBe('Second-folder text'));
    rerender({ scope: 'local:first-handle', files: firstFiles });
    await waitFor(() => expect(result.current.pageTexts.get('wiki/answer')).toBe('Private first-folder text'));
  });

  it('withholds an older body immediately when its page version changes', async () => {
    const { result, rerender } = renderHook(({ version, text }) => useLibraryModel({
      docs: [{ ...docs[0], mtime: version }], sources, sourceHandles,
      fileHandles: new Map([['wiki/answer', handle(text)]]), vaultRootPath: null, vaultScope: 'local:one', enabled: true,
    }), { initialProps: { version: 1, text: 'Earlier text' } });
    await waitFor(() => expect(result.current.pageTexts.get('wiki/answer')).toBe('Earlier text'));
    rerender({ version: 2, text: 'Updated text' });
    expect(result.current.pageTexts.get('wiki/answer')).not.toBe('Earlier text');
    await waitFor(() => expect(result.current.pageTexts.get('wiki/answer')).toBe('Updated text'));
  });

  it('rereads a page after its older version has left the current folder snapshot', async () => {
    const { result, rerender } = renderHook(({ version, text }) => useLibraryModel({
      docs: [{ ...docs[0], mtime: version }], sources, sourceHandles,
      fileHandles: new Map([['wiki/answer', handle(text)]]), vaultRootPath: null, vaultScope: 'local:one', enabled: true,
    }), { initialProps: { version: 1, text: 'First revision' } });
    await waitFor(() => expect(result.current.pageTexts.get('wiki/answer')).toBe('First revision'));
    rerender({ version: 2, text: 'Second revision' });
    await waitFor(() => expect(result.current.pageTexts.get('wiki/answer')).toBe('Second revision'));
    rerender({ version: 1, text: 'Restored file bytes' });
    await waitFor(() => expect(result.current.pageTexts.get('wiki/answer')).toBe('Restored file bytes'));
  });

  it('releases a removed page before that slug is added again', async () => {
    const { result, rerender } = renderHook(({ present, text }) => useLibraryModel({
      docs: present ? docs : [], sources, sourceHandles,
      fileHandles: new Map([['wiki/answer', handle(text)]]), vaultRootPath: null, vaultScope: 'local:one', enabled: true,
    }), { initialProps: { present: true, text: 'Removed bytes' } });
    await waitFor(() => expect(result.current.pageTexts.get('wiki/answer')).toBe('Removed bytes'));
    rerender({ present: false, text: '' });
    expect(result.current.pageTexts.size).toBe(0);
    rerender({ present: true, text: 'Replacement bytes' });
    await waitFor(() => expect(result.current.pageTexts.get('wiki/answer')).toBe('Replacement bytes'));
  });
});
