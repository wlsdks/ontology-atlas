import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { vaultVectorSource } from './vault-vector-source';

const RUNNER = { kind: 'runner', baseUrl: 'http://127.0.0.1:11434/v1', model: 'bge-m3:latest' } as const;
const BUILTIN = { kind: 'builtin' } as const;

afterEach(() => window.localStorage.clear());

describe('vaultVectorSource', () => {
  it('keeps one choice per folder and clears only that folder', () => {
    vaultVectorSource.write('/vaults/a', BUILTIN);
    vaultVectorSource.write('/vaults/b', RUNNER);

    expect(vaultVectorSource.read('/vaults/a')).toEqual({ source: BUILTIN, paused: false });
    expect(vaultVectorSource.read('/vaults/b')).toEqual({ source: RUNNER, paused: false });

    vaultVectorSource.clear('/vaults/a');
    expect(vaultVectorSource.read('/vaults/a')).toBeNull();
    expect(vaultVectorSource.read('/vaults/b')?.source).toEqual(RUNNER);

    vaultVectorSource.clearAll();
    expect(vaultVectorSource.read('/vaults/b')).toBeNull();
    expect(window.localStorage.getItem(vaultVectorSource.key)).toBeNull();
  });

  it('keeps a stop across reads until Resume or a new choice releases it', () => {
    vaultVectorSource.write('/vaults/a', BUILTIN);
    vaultVectorSource.setPaused('/vaults/a', true);
    expect(vaultVectorSource.read('/vaults/a')).toEqual({ source: BUILTIN, paused: true });

    vaultVectorSource.setPaused('/vaults/a', false);
    expect(vaultVectorSource.read('/vaults/a')?.paused).toBe(false);

    vaultVectorSource.setPaused('/vaults/a', true);
    vaultVectorSource.write('/vaults/a', RUNNER);
    expect(vaultVectorSource.read('/vaults/a')).toEqual({ source: RUNNER, paused: false });
  });

  it('holds no pause for a folder without a choice', () => {
    vaultVectorSource.setPaused('/vaults/a', true);
    expect(vaultVectorSource.read('/vaults/a')).toBeNull();
  });

  it.each([
    ['not JSON', '{'],
    ['an array', '[]'],
    ['a bare source', JSON.stringify({ '/vaults/a': BUILTIN })],
    ['an unknown kind', JSON.stringify({ '/vaults/a': { source: { kind: 'remote' }, paused: false } })],
    ['a runner without a model', JSON.stringify({ '/vaults/a': { source: { kind: 'runner', baseUrl: 'http://127.0.0.1:11434', model: '' } } })],
    ['a runner without an address', JSON.stringify({ '/vaults/a': { source: { kind: 'runner', model: 'bge-m3' } } })],
  ])('reads %s as no choice', (_case, raw) => {
    window.localStorage.setItem(vaultVectorSource.key, raw);
    expect(vaultVectorSource.read('/vaults/a')).toBeNull();
  });

  it('keeps the folders that parse when another entry does not, and reads only a true pause', () => {
    window.localStorage.setItem(vaultVectorSource.key, JSON.stringify({
      '/vaults/a': 7,
      '/vaults/b': { source: { kind: 'builtin', extra: true }, paused: 'yes' },
    }));
    expect(vaultVectorSource.read('/vaults/a')).toBeNull();
    expect(vaultVectorSource.read('/vaults/b')).toEqual({ source: BUILTIN, paused: false });
  });

  it("re-renders a folder's hook on a write and keeps the same value between writes", () => {
    const { result, rerender } = renderHook(({ root }) => vaultVectorSource.use(root), { initialProps: { root: '/vaults/a' as string | null } });
    expect(result.current).toBeNull();

    act(() => vaultVectorSource.write('/vaults/a', RUNNER));
    const first = result.current;
    expect(first).toEqual({ source: RUNNER, paused: false });
    rerender({ root: '/vaults/a' });
    expect(result.current).toBe(first);

    act(() => vaultVectorSource.setPaused('/vaults/a', true));
    expect(result.current?.paused).toBe(true);

    act(() => vaultVectorSource.clear('/vaults/a'));
    expect(result.current).toBeNull();

    rerender({ root: null });
    expect(result.current).toBeNull();
  });
});
