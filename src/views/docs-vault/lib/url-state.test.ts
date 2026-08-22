import { afterEach, describe, expect, it, vi } from 'vitest';
import { replaceDocsVaultUrlState } from './url-state';

// jsdom allows only same-origin replaceState — the fixture URL is built from
// `window.location.origin`.
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

  // Since folder-topology was removed, 'doc' is the only view value, so it is always removed from
  // the query as the default. With no non-default view value, the "?view=X is set" case no longer
  // exists.
  it('view=doc → query 제거 (default)', () => {
    window.history.replaceState({}, '', `${ORIGINAL_HREF}?view=doc`);
    replaceDocsVaultUrlState({ view: 'doc' });
    expect(currentSearch()).toBe('');
  });

  it('slug + view 동시 갱신 — view 는 default 라 query 에 안 남음', () => {
    replaceDocsVaultUrlState({ slug: 'foo', view: 'doc' });
    const params = new URL(window.location.href).searchParams;
    expect(params.get('slug')).toBe('foo');
    expect(params.get('view')).toBeNull();
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
    replaceDocsVaultUrlState({ view: 'doc' });
    const params = new URL(window.location.href).searchParams;
    expect(params.get('slug')).toBe('foo');
    expect(params.get('view')).toBeNull();
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

  it('source=server → packaged docs deep-link source를 명시한다', () => {
    replaceDocsVaultUrlState({
      source: 'server',
      sample: 'dogfood',
      slug: 'AGENT-GRAPH-WORKFLOW',
    });
    expect(currentSearch()).toBe(
      '?source=server&sample=dogfood&slug=AGENT-GRAPH-WORKFLOW',
    );
  });

  it('source=null → 사용자가 source를 바꿀 때 deep-link override를 지운다', () => {
    window.history.replaceState(
      {},
      '',
      `${ORIGINAL_HREF}?source=server&sample=dogfood&slug=AGENT-GRAPH-WORKFLOW`,
    );
    replaceDocsVaultUrlState({ source: null, sample: null, slug: null });
    expect(currentSearch()).toBe('');
  });

  it('기본 순서는 URL 에 안 남는다 — 공유 링크를 짧게', () => {
    window.history.replaceState({}, '', `${ORIGINAL_HREF}?sort=recent&group=docs`);
    replaceDocsVaultUrlState({ sort: 'name', group: 'folders' });
    expect(currentSearch()).toBe('');
  });

  it('기본이 아닌 순서는 URL 에 남아 공유·재현된다', () => {
    replaceDocsVaultUrlState({ slug: 'README', sort: 'recent', group: 'docs' });
    const params = new URL(window.location.href).searchParams;
    expect(params.get('slug')).toBe('README');
    expect(params.get('sort')).toBe('recent');
    expect(params.get('group')).toBe('docs');
  });

  it('한 축만 바꿔도 다른 축은 그대로 남는다', () => {
    window.history.replaceState({}, '', `${ORIGINAL_HREF}?group=docs`);
    replaceDocsVaultUrlState({ sort: 'recent' });
    const params = new URL(window.location.href).searchParams;
    expect(params.get('group')).toBe('docs');
    expect(params.get('sort')).toBe('recent');
  });
});
