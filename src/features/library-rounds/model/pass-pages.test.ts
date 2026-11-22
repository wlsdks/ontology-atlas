import { describe, expect, it, vi } from 'vitest';

import { WIKI_PAGE_TEMPLATE } from '@/shared/lib/library/wiki-page-schema';

import {
  createLandings,
  createPassPages,
  pageIdentity,
  settlePassPages,
} from './pass-pages';

const DRAFT = WIKI_PAGE_TEMPLATE.replace(/sources\/<file>/g, 'sources/plan.pdf');
const withLine = (line: string) => DRAFT.replace('status: draft\n', `status: draft\n${line}\n`);
const NODE = '---\nkind: capability\ntitle: Checkout\n---\nA cart becomes an order.\n';

describe('the pages of one pass', () => {
  it('keys a page by its file identity: letter case and Unicode form name one file', () => {
    expect(pageIdentity('wiki/Plan.md')).toBe(pageIdentity('wiki/plan.md'));
    expect(pageIdentity('wiki/결제.md'.normalize('NFD'))).toBe(pageIdentity('wiki/결제.md'));
    expect(pageIdentity('wiki/STRASSE.md')).toBe(pageIdentity('wiki/straße.md'));
  });

  it('judges a write against the text the last allowed write left, under any spelling of the page', () => {
    const pages = createPassPages([{ path: 'wiki/plan.md', text: 'start' }]);
    expect(pages.current('wiki/PLAN.md')).toBe('start');
    pages.commit('wiki/plan.md', 'second');
    expect(pages.current('wiki/Plan.md')).toBe('second');
    pages.land('wiki/plan.md', 'as it landed');
    expect(pages.current('wiki/plan.md')).toBe('as it landed');
    expect(pages.touched()).toEqual([{ path: 'wiki/plan.md', start: 'start', own: 'as it landed' }]);
  });

  it('refuses a spelling that differs from a known page only by case or Unicode form, a page two files share, and a page it could not read', () => {
    const nfc = 'wiki/결제.md';
    const pages = createPassPages({ complete: true, pages: [
      { path: 'wiki/plan.md', text: 'a' },
      { path: nfc, text: 'b' },
      { path: 'wiki/twin.md', text: 'c' },
      { path: 'wiki/Twin.md', text: 'd' },
      { path: 'wiki/locked.md', text: null },
    ] });
    expect(pages.conflict('wiki/plan.md')).toBe(false);
    expect(pages.conflict('wiki/Plan.md')).toBe(true);
    expect(pages.conflict(nfc)).toBe(false);
    expect(pages.conflict(nfc.normalize('NFD'))).toBe(true);
    expect(pages.conflict('wiki/twin.md')).toBe(true);
    expect(pages.conflict('wiki/locked.md')).toBe(true);
    expect(pages.conflict('wiki/new.md')).toBe(false);
    pages.commit('wiki/new.md', 'fresh');
    expect(pages.conflict('wiki/New.md')).toBe(true);
    expect(pages.touched()).toEqual([{ path: 'wiki/new.md', start: null, own: 'fresh' }]);
  });

  it('counts a path as new only when the scan saw every file, and never writes over an ontology node', () => {
    expect(createPassPages([{ path: 'wiki/plan.md', text: DRAFT }]).conflict('wiki/unseen.md')).toBe(true);
    const pages = createPassPages({ complete: true, pages: [{ path: 'wiki/checkout.md', text: NODE }], nodes: ['sources/Pricing.md'] });
    expect(pages.conflict('wiki/unseen.md')).toBe(false);
    expect(pages.conflict('wiki/checkout.md')).toBe(true);
    expect(pages.node('wiki/Checkout.md')).toBe(true);
    expect(pages.node('sources/pricing.md')).toBe(true);
    expect(pages.node('sources/notes.md')).toBe(false);
  });

  it('refuses a write through a link, into a folder the scan did not see as a real folder, or anywhere under a linked folder', () => {
    const pages = createPassPages({ complete: true, pages: [{ path: 'wiki/plan.md', text: DRAFT }], dirs: ['wiki', 'wiki/team', 'sources'], links: ['wiki/escape.md', 'wiki/elsewhere'] });
    expect(pages.unsafe('wiki/new.md')).toBe(false);
    expect(pages.unsafe('wiki/team/new.md')).toBe(false);
    expect(pages.unsafe('sources/new.md')).toBe(false);
    for (const path of ['wiki/escape.md', 'wiki/Escape.md', 'wiki/elsewhere/x.md', 'wiki/unseen/x.md', 'sources/unseen/x.md']) {
      expect(pages.unsafe(path)).toBe(true);
      expect(pages.conflict(path)).toBe(true);
    }
    expect(createPassPages({ complete: true, pages: [], links: ['wiki'] }).conflict('wiki/new.md')).toBe(true);
  });

  it('records the text a write left when its tool call ends, even when it reports a failure, and only for the latest write to the page', async () => {
    const pages = createPassPages({ complete: true, pages: [{ path: 'wiki/plan.md', text: 'start' }] });
    const disk: Record<string, string> = { 'wiki/plan.md': 'first' };
    const gates: Array<() => void> = [];
    const landings = createLandings(pages, async (path) => {
      const text = disk[path] ?? null;
      if (gates.length === 0) await new Promise<void>((release) => gates.push(release));
      return text;
    });
    pages.commit('wiki/plan.md', 'judged first');
    landings.expect('call-1', 'wiki/plan.md');
    landings.settled('call-1', 'completed');
    pages.commit('wiki/plan.md', 'judged second');
    landings.expect('call-2', 'wiki/plan.md');
    disk['wiki/plan.md'] = 'second as it landed';
    landings.settled('call-2', 'failed');
    landings.settled('call-9', 'completed');
    const finished = landings.done();
    await Promise.resolve();
    gates[0]();
    await finished;
    expect(pages.touched()).toEqual([{ path: 'wiki/plan.md', start: 'start', own: 'second as it landed' }]);
  });

  it('waits for a landing read that starts while it is already waiting', async () => {
    const pages = createPassPages({ complete: true, pages: [{ path: 'wiki/plan.md', text: 'start' }, { path: 'wiki/other.md', text: 'start' }] });
    const gates: Record<string, () => void> = {};
    const landings = createLandings(pages, (path) => new Promise((resolve) => {
      gates[path] = () => resolve(`landed ${path}`);
    }));
    pages.commit('wiki/plan.md', 'judged');
    pages.commit('wiki/other.md', 'judged');
    landings.expect('call-1', 'wiki/plan.md');
    landings.expect('call-2', 'wiki/other.md');
    landings.settled('call-1', 'completed');
    let finished = false;
    const done = landings.done().then(() => {
      finished = true;
    });
    landings.settled('call-2', 'cancelled');
    gates['wiki/plan.md']();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(finished).toBe(false);
    gates['wiki/other.md']();
    await done;
    expect(pages.touched().map((page) => page.own)).toEqual(['landed wiki/plan.md', 'landed wiki/other.md']);
  });
});

describe('after the turn, every page the pass wrote is read back', () => {
  function disk(files: Record<string, string>) {
    return {
      files,
      read: vi.fn(async (path: string) => files[path] ?? null),
      keep: vi.fn(async (path: string, text: string) => {
        files[`.ontology-atlas/undone/p1/${path}`] = text;
        return `.ontology-atlas/undone/p1/${path}`;
      }),
      restore: vi.fn(async (path: string, text: string) => {
        files[path] = text;
      }),
      remove: vi.fn(async (path: string) => {
        delete files[path];
      }),
    };
  }

  it('keeps a revision that carries the page\'s links unchanged and undoes one that adds a link', async () => {
    const linked = withLine('describes:\n  - capabilities/checkout');
    const kept = linked.replace('## Summary\n', '## Summary\n\nRevised.\n');
    const added = kept.replace('  - capabilities/checkout', '  - capabilities/checkout\n  - capabilities/login');
    const pages = createPassPages({ complete: true, pages: [{ path: 'wiki/kept.md', text: linked }, { path: 'wiki/added.md', text: linked }] });
    pages.commit('wiki/kept.md', kept);
    pages.land('wiki/kept.md', kept);
    pages.commit('wiki/added.md', added);
    pages.land('wiki/added.md', added);
    const io = disk({ 'wiki/kept.md': kept, 'wiki/added.md': added });
    expect(await settlePassPages({ pages, ...io })).toEqual({
      undone: [{ path: 'wiki/added.md', reason: 'forbidden-key', key: 'describes', action: 'restored', copy: '.ontology-atlas/undone/p1/wiki/added.md' }],
      leftAsIs: [],
    });
    expect(io.files['wiki/kept.md']).toBe(kept);
    expect(io.files['wiki/added.md']).toBe(linked);
  });

  it('puts back its own page, removes its own new page, and keeps a copy of what it took out', async () => {
    const reviewed = DRAFT.replace('status: draft', 'status: reviewed');
    const pages = createPassPages({ complete: true, pages: [{ path: 'wiki/plan.md', text: DRAFT }] });
    pages.commit('wiki/plan.md', DRAFT);
    pages.land('wiki/plan.md', reviewed);
    pages.commit('wiki/new.md', DRAFT);
    pages.land('wiki/new.md', withLine('describes: [x]'));
    const io = disk({ 'wiki/plan.md': reviewed, 'wiki/new.md': withLine('describes: [x]') });
    expect(await settlePassPages({ pages, ...io })).toEqual({
      undone: [
        { path: 'wiki/plan.md', reason: 'not-draft', action: 'restored', copy: '.ontology-atlas/undone/p1/wiki/plan.md' },
        { path: 'wiki/new.md', reason: 'forbidden-key', key: 'describes', action: 'removed', copy: '.ontology-atlas/undone/p1/wiki/new.md' },
      ],
      leftAsIs: [],
    });
    expect(io.files).toEqual({
      'wiki/plan.md': DRAFT,
      '.ontology-atlas/undone/p1/wiki/plan.md': reviewed,
      '.ontology-atlas/undone/p1/wiki/new.md': withLine('describes: [x]'),
    });
  });

  it('leaves a page that changed after the pass wrote it, and names it and fails the pass when it no longer reads as a draft', async () => {
    const pages = createPassPages({ complete: true, pages: [{ path: 'wiki/plan.md', text: DRAFT }, { path: 'wiki/kept.md', text: DRAFT }] });
    pages.commit('wiki/plan.md', withLine('# ours'));
    pages.land('wiki/plan.md', withLine('# ours'));
    pages.commit('wiki/new.md', DRAFT);
    pages.commit('wiki/kept.md', withLine('# ours'));
    const reviewed = DRAFT.replace('status: draft', 'status: reviewed');
    const io = disk({ 'wiki/plan.md': reviewed, 'wiki/new.md': reviewed, 'wiki/kept.md': withLine('# theirs') });
    expect(await settlePassPages({ pages, ...io })).toEqual({
      undone: [
        { path: 'wiki/plan.md', reason: 'not-draft', action: 'left' },
        { path: 'wiki/new.md', reason: 'not-draft', action: 'left' },
      ],
      leftAsIs: ['wiki/kept.md'],
    });
    expect(io.files).toEqual({ 'wiki/plan.md': reviewed, 'wiki/new.md': reviewed, 'wiki/kept.md': withLine('# theirs') });
    expect(io.keep).not.toHaveBeenCalled();
  });

  it('leaves a draft, an unchanged page and a page that never landed alone', async () => {
    const reviewed = DRAFT.replace('status: draft', 'status: reviewed');
    const pages = createPassPages({ complete: true, pages: [{ path: 'wiki/kept.md', text: reviewed }, { path: 'wiki/plan.md', text: 'old' }] });
    for (const path of ['wiki/kept.md', 'wiki/plan.md', 'wiki/never.md']) pages.commit(path, DRAFT);
    const io = disk({ 'wiki/kept.md': reviewed, 'wiki/plan.md': DRAFT });
    expect(await settlePassPages({ pages, ...io })).toEqual({ undone: [], leftAsIs: [] });
    expect(io.restore).not.toHaveBeenCalled();
    expect(io.remove).not.toHaveBeenCalled();
  });

  it('touches nothing it cannot copy first, and says so', async () => {
    const pages = createPassPages({ complete: true, pages: [{ path: 'wiki/plan.md', text: DRAFT }, { path: 'wiki/other.md', text: DRAFT }] });
    pages.commit('wiki/plan.md', DRAFT);
    pages.commit('wiki/other.md', DRAFT);
    pages.land('wiki/other.md', 'no frontmatter');
    const io = disk({ 'wiki/other.md': 'no frontmatter' });
    io.read.mockImplementationOnce(async () => {
      throw new Error('permission denied');
    });
    io.keep.mockImplementation(async () => {
      throw new Error('read-only volume');
    });
    expect(await settlePassPages({ pages, ...io })).toEqual({
      undone: [
        { path: 'wiki/plan.md', reason: 'unreadable', action: 'failed' },
        { path: 'wiki/other.md', reason: 'no-frontmatter', action: 'failed' },
      ],
      leftAsIs: [],
    });
    expect(io.restore).not.toHaveBeenCalled();
    expect(io.files['wiki/other.md']).toBe('no frontmatter');
  });
});
