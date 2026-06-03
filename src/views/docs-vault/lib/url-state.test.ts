import { afterEach, describe, expect, it, vi } from 'vitest';
import { replaceDocsVaultUrlState } from './url-state';

// jsdom 의 same-origin replaceState 만 허용 — window.location.origin 으로
// fixture URL 구성.
const ORIGINAL_HREF = `${window.location.origin}/docs/`;

afterEach(() => {
  window.history.replaceState({}, '', ORIGINAL_HREF);
});

function currentSearch(): string {
  return new URL(window.location.href).search;
}

describe('replaceDocsVaultUrlState', () => {
  it('slug 추가 → ?slug=foo 셋', () => {
    replaceDocsVaultUrlState({ slug: 'foo' });
    expect(currentSearch()).toBe('?slug=foo');
  });

  it('slug=null → query 제거', () => {
    window.history.replaceState({}, '', `${ORIGINAL_HREF}?slug=foo`);
    replaceDocsVaultUrlState({ slug: null });
    expect(currentSearch()).toBe('');
  });

  it('view=folder-topology → ?view=folder-topology', () => {
    replaceDocsVaultUrlState({ view: 'folder-topology' });
    expect(currentSearch()).toBe('?view=folder-topology');
  });

  it('view=doc → query 제거 (default)', () => {
    window.history.replaceState({}, '', `${ORIGINAL_HREF}?view=folder-topology`);
    replaceDocsVaultUrlState({ view: 'doc' });
    expect(currentSearch()).toBe('');
  });

  it('slug + view 동시 갱신', () => {
    replaceDocsVaultUrlState({ slug: 'foo', view: 'folder-topology' });
    const params = new URL(window.location.href).searchParams;
    expect(params.get('slug')).toBe('foo');
    expect(params.get('view')).toBe('folder-topology');
  });

  it('app:urlchange event dispatch', () => {
    const listener = vi.fn();
    window.addEventListener('app:urlchange', listener);
    replaceDocsVaultUrlState({ slug: 'bar' });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('app:urlchange', listener);
  });

  it("'slug' 키 없으면 기존 slug 유지", () => {
    window.history.replaceState({}, '', `${ORIGINAL_HREF}?slug=foo`);
    replaceDocsVaultUrlState({ view: 'folder-topology' });
    const params = new URL(window.location.href).searchParams;
    expect(params.get('slug')).toBe('foo');
    expect(params.get('view')).toBe('folder-topology');
  });

  it("intent=null → local 진입 query 제거", () => {
    window.history.replaceState(
      {},
      '',
      `${ORIGINAL_HREF}?intent=local&slug=README`,
    );
    replaceDocsVaultUrlState({ intent: null });
    const params = new URL(window.location.href).searchParams;
    expect(params.get('intent')).toBeNull();
    expect(params.get('slug')).toBe('README');
  });

  it("intent=local → local 진입 query 설정", () => {
    replaceDocsVaultUrlState({ intent: 'local' });
    expect(currentSearch()).toBe('?intent=local');
  });
});
