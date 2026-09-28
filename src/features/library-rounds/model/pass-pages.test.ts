import { describe, expect, it, vi } from 'vitest';

import { WIKI_PAGE_TEMPLATE } from '@/shared/lib/wiki-page-schema';

import {
  createLandings,
  createPassPages,
  pageIdentity,
  readOrMissing,
  roundDraftProblem,
  scanWikiFolder,
  settlePassPages,
} from './pass-pages';

const DRAFT = WIKI_PAGE_TEMPLATE.replace(/sources\/<file>/g, 'sources/plan.pdf');
const withLine = (line: string) => DRAFT.replace('status: draft\n', `status: draft\n${line}\n`);
const NODE = '---\nkind: capability\ntitle: Checkout\n---\nA cart becomes an order.\n';
const notFound = () => Object.assign(new Error('not found'), { name: 'NotFoundError' });

describe('what reads as a round draft', () => {
  it('accepts the template draft and nothing that could read otherwise', () => {
    expect(roundDraftProblem(DRAFT)).toBeNull();
    expect(roundDraftProblem(DRAFT.replace('\n', '\r\n'))).toBeNull();
    expect(roundDraftProblem(DRAFT.replace('status: draft', 'status: reviewed'))).toEqual({ reason: 'not-draft' });
    expect(roundDraftProblem(DRAFT.replace('status: draft', 'status: "draft"'))).toEqual({ reason: 'not-draft' });
    expect(roundDraftProblem(DRAFT.replace('status: draft\n', ''))).toEqual({ reason: 'not-draft' });
    expect(roundDraftProblem('# Plan\n')).toEqual({ reason: 'no-frontmatter' });
  });

  it('refuses a key written twice, in any case or indentation, and the keys only a person may add', () => {
    expect(roundDraftProblem(withLine('status: reviewed'))).toEqual({ reason: 'duplicate-key', key: 'status' });
    expect(roundDraftProblem(withLine('  status: draft'))).toEqual({ reason: 'duplicate-key', key: 'status' });
    expect(roundDraftProblem(withLine('Status: reviewed'))).toEqual({ reason: 'duplicate-key', key: 'status' });
    expect(roundDraftProblem(withLine('describes: [capabilities/checkout]'))).toEqual({ reason: 'forbidden-key', key: 'describes' });
    expect(roundDraftProblem(withLine('kind: capability'))).toEqual({ reason: 'forbidden-key', key: 'kind' });
  });
});

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

  it('scans the files on disk under wiki/, at any depth, and reads each one', async () => {
    const files: Record<string, string> = { 'wiki/plan.md': DRAFT, 'wiki/team/checkout.md': NODE, 'wiki/.trash/old.md': 'x', 'wiki/logo.png': 'png', 'notes.md': 'y' };
    const dir = (prefix: string): unknown => ({
      kind: 'directory',
      getDirectoryHandle: async (name: string) => {
        if (!Object.keys(files).some((path) => path.startsWith(`${prefix}${name}/`))) throw notFound();
        return dir(`${prefix}${name}/`);
      },
      entries: async function* () {
        const names = new Set(Object.keys(files).filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length).split('/')[0]));
        for (const name of names) {
          const nested = Object.keys(files).some((path) => path.startsWith(`${prefix}${name}/`));
          yield [name, nested ? dir(`${prefix}${name}/`) : { kind: 'file', getFile: async () => ({ text: async () => files[`${prefix}${name}`] }) }];
        }
      },
    });
    const scanned = await scanWikiFolder(dir('') as FileSystemDirectoryHandle);
    expect(scanned).toEqual([{ path: 'wiki/plan.md', text: DRAFT }, { path: 'wiki/team/checkout.md', text: NODE }]);
    await expect(scanWikiFolder({ getDirectoryHandle: async () => { throw notFound(); } } as unknown as FileSystemDirectoryHandle)).resolves.toEqual([]);
  });

  it('records the text an allowed write left when its tool call completes, and nothing for one that failed', async () => {
    const pages = createPassPages({ complete: true, pages: [{ path: 'wiki/plan.md', text: 'start' }] });
    const landings = createLandings(pages, async (path) => (path === 'wiki/plan.md' ? 'landed' : 'other'));
    pages.commit('wiki/plan.md', 'judged');
    landings.expect('call-1', 'wiki/plan.md');
    landings.settled('call-2', 'completed');
    pages.commit('wiki/other.md', 'judged');
    landings.expect('call-3', 'wiki/other.md');
    landings.settled('call-3', 'failed');
    landings.settled('call-1', 'completed');
    await landings.done();
    expect(pages.touched()).toEqual([{ path: 'wiki/plan.md', start: 'start', own: 'landed' }, { path: 'wiki/other.md', start: null, own: 'judged' }]);
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

  it('leaves a page someone else changed after the pass wrote it, reviewed or not, and does not undo it', async () => {
    const pages = createPassPages({ complete: true, pages: [{ path: 'wiki/plan.md', text: DRAFT }] });
    pages.commit('wiki/plan.md', withLine('# kept'));
    pages.land('wiki/plan.md', withLine('# kept'));
    pages.commit('wiki/new.md', DRAFT);
    const theirs = DRAFT.replace('status: draft', 'status: reviewed');
    const io = disk({ 'wiki/plan.md': theirs, 'wiki/new.md': theirs });
    expect(await settlePassPages({ pages, ...io })).toEqual({ undone: [], leftAsIs: ['wiki/plan.md', 'wiki/new.md'] });
    expect(io.files).toEqual({ 'wiki/plan.md': theirs, 'wiki/new.md': theirs });
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

  it('reads a file that is not there as missing, and any other read failure as a failure', async () => {
    const missing = Object.assign(new Error('gone'), { name: 'NotFoundError' });
    const vault = {
      getDirectoryHandle: async () => vault,
      getFileHandle: async (name: string) => {
        if (name === 'gone.md') throw missing;
        return {};
      },
    } as unknown as FileSystemDirectoryHandle;
    const read = readOrMissing(vault, async () => {
      throw 'No such file or directory (os error 2)';
    });
    await expect(read('wiki/gone.md')).resolves.toBeNull();
    await expect(read('wiki/here.md')).rejects.toBe('No such file or directory (os error 2)');
  });
});
