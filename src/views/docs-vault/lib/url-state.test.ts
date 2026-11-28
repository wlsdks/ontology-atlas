import { afterEach, describe, expect, it } from 'vitest';
import { replaceDocsVaultUrlState, settleDocsVaultAddress } from './url-state';

// jsdom allows only same-origin replaceState.
const ORIGINAL_HREF = `${window.location.origin}/docs/`;

afterEach(() => {
  window.history.replaceState({}, '', ORIGINAL_HREF);
});

function currentSearch(): string {
  return new URL(window.location.href).search;
}

describe('replaceDocsVaultUrlState', () => {
  it('sets ?slug=foo when a slug is given', () => {
    replaceDocsVaultUrlState({ slug: 'foo' });
    expect(currentSearch()).toBe('?slug=foo');
  });

  it('removes the slug query for null', () => {
    window.history.replaceState({}, '', `${ORIGINAL_HREF}?slug=foo`);
    replaceDocsVaultUrlState({ slug: null });
    expect(currentSearch()).toBe('');
  });

  it('removes the view query for the default doc view', () => {
    window.history.replaceState({}, '', `${ORIGINAL_HREF}?view=doc`);
    replaceDocsVaultUrlState({ view: 'doc' });
    expect(currentSearch()).toBe('');
  });

  it('updates slug and view together and omits the default view', () => {
    replaceDocsVaultUrlState({ slug: 'foo', view: 'doc' });
    const params = new URL(window.location.href).searchParams;
    expect(params.get('slug')).toBe('foo');
    expect(params.get('view')).toBeNull();
  });

  it("keeps the existing slug when the slug key is absent", () => {
    window.history.replaceState({}, '', `${ORIGINAL_HREF}?slug=foo`);
    replaceDocsVaultUrlState({ view: 'doc' });
    const params = new URL(window.location.href).searchParams;
    expect(params.get('slug')).toBe('foo');
    expect(params.get('view')).toBeNull();
  });

  it('omits the default order from the URL', () => {
    window.history.replaceState({}, '', `${ORIGINAL_HREF}?sort=recent&group=docs`);
    replaceDocsVaultUrlState({ sort: 'name', group: 'folders' });
    expect(currentSearch()).toBe('');
  });

  it('keeps a non-default order in the URL', () => {
    replaceDocsVaultUrlState({ slug: 'README', sort: 'recent', group: 'docs' });
    const params = new URL(window.location.href).searchParams;
    expect(params.get('slug')).toBe('README');
    expect(params.get('sort')).toBe('recent');
    expect(params.get('group')).toBe('docs');
  });

  it('keeps the other order axis when changing one', () => {
    window.history.replaceState({}, '', `${ORIGINAL_HREF}?group=docs`);
    replaceDocsVaultUrlState({ sort: 'recent' });
    const params = new URL(window.location.href).searchParams;
    expect(params.get('group')).toBe('docs');
    expect(params.get('sort')).toBe('recent');
  });
});

describe('settleDocsVaultAddress', () => {
  it('names the settled document in the address and keeps the entry the router owns', () => {
    const routerEntry = { __TSR_index: 1, __TSR_key: 'docs' };
    window.history.replaceState(routerEntry, '', `${ORIGINAL_HREF}?tab=ontology`);
    settleDocsVaultAddress('/docs/', 'README');
    expect(currentSearch()).toBe('?tab=ontology&slug=README');
    expect(window.history.state).toEqual(routerEntry);
  });

  it('leaves the address alone once it belongs to another route', () => {
    settleDocsVaultAddress('/library/', 'README');
    expect(currentSearch()).toBe('');
  });
});
