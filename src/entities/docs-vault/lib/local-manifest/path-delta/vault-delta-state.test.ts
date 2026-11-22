import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '../../../model/vault-manifest';
import type { BuiltVaultEntry } from '../md-entry';
import { indexEntry, mdSlug, resolverOf, takeState } from './vault-delta-state';

const handle = {} as FileSystemFileHandle;

function note(slug: string): BuiltVaultEntry {
  return { relativePath: `${slug}.md`, lastModified: 1, handle, kind: 'md', doc: { slug } as VaultDoc };
}

function image(relativePath: string): BuiltVaultEntry {
  return { relativePath, lastModified: 1, handle, kind: 'image' };
}

describe('mdSlug', () => {
  it('is the slug of a document entry and null for anything else', () => {
    expect(mdSlug(note('domains/a'))).toBe('domains/a');
    expect(mdSlug(image('domains/a.png'))).toBeNull();
  });
});

describe('takeState', () => {
  it('counts the walked files beneath every folder, not the folders themselves', () => {
    const state = takeState([note('a/b/one'), note('a/two'), image('a/b/pic.png'), note('root')]);
    expect(state.dirCounts.get('a')).toBe(3);
    expect(state.dirCounts.get('a/b')).toBe(2);
    expect(state.dirCounts.has('root')).toBe(false);
    expect(state.byPath.get('a/two.md')?.doc?.slug).toBe('a/two');
  });

  it('hands back the same state for the same entries array', () => {
    const entries = [note('a/one')];
    expect(takeState(entries)).toBe(takeState(entries));
  });
});

describe('indexEntry', () => {
  it('forgets a folder when its last file is removed', () => {
    const entry = note('a/b/one');
    const state = takeState([entry, note('a/two')]);
    indexEntry(state, entry, -1);
    expect(state.dirCounts.has('a/b')).toBe(false);
    expect(state.dirCounts.get('a')).toBe(1);
    expect(state.byPath.has('a/b/one.md')).toBe(false);
  });

  it('keeps one slug per tail, then a set once two documents share it, then one slug again', () => {
    const state = takeState([note('domains/auth')]);
    expect(state.tails.get('auth')).toBe('domains/auth');
    indexEntry(state, note('capabilities/auth'), 1);
    expect(state.tails.get('auth')).toEqual(new Set(['domains/auth', 'capabilities/auth']));
    indexEntry(state, note('elements/auth'), 1);
    expect((state.tails.get('auth') as Set<string>).size).toBe(3);
    indexEntry(state, note('elements/auth'), -1);
    indexEntry(state, note('capabilities/auth'), -1);
    expect(state.tails.get('auth')).toBe('domains/auth');
    indexEntry(state, note('domains/auth'), -1);
    expect(state.tails.has('auth')).toBe(false);
  });
});

describe('resolverOf', () => {
  it('resolves a full slug, and a bare tail only while exactly one document has it', () => {
    const state = takeState([note('domains/auth'), note('capabilities/pay')]);
    const resolve = resolverOf(state);
    expect(resolve('domains/auth')).toBe('domains/auth');
    expect(resolve('pay')).toBe('capabilities/pay');
    expect(resolve('missing')).toBeNull();
    indexEntry(state, note('elements/pay'), 1);
    expect(resolverOf(state)('pay')).toBeNull();
  });
});
