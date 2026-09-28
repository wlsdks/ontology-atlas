import { describe, expect, it, vi } from 'vitest';

import { WIKI_PAGE_TEMPLATE } from '@/shared/lib/wiki-page-schema';

import { createPassPages, pageIdentity, readOrMissing, roundDraftProblem, settlePassPages } from './pass-pages';

const DRAFT = WIKI_PAGE_TEMPLATE.replace(/sources\/<file>/g, 'sources/plan.pdf');
const withLine = (line: string) => DRAFT.replace('status: draft\n', `status: draft\n${line}\n`);

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
    expect(pages.touched()).toEqual([{ path: 'wiki/plan.md', start: 'start' }]);
  });

  it('refuses a spelling that differs from a known page only by case or Unicode form, a page two files share, and a page it could not read', () => {
    const nfc = 'wiki/결제.md';
    const pages = createPassPages([
      { path: 'wiki/plan.md', text: 'a' },
      { path: nfc, text: 'b' },
      { path: 'wiki/twin.md', text: 'c' },
      { path: 'wiki/Twin.md', text: 'd' },
      { path: 'wiki/locked.md', text: null },
    ]);
    expect(pages.conflict('wiki/plan.md')).toBe(false);
    expect(pages.conflict('wiki/Plan.md')).toBe(true);
    expect(pages.conflict(nfc)).toBe(false);
    expect(pages.conflict(nfc.normalize('NFD'))).toBe(true);
    expect(pages.conflict('wiki/twin.md')).toBe(true);
    expect(pages.conflict('wiki/locked.md')).toBe(true);
    pages.commit('wiki/new.md', 'fresh');
    expect(pages.conflict('wiki/new.md')).toBe(false);
    expect(pages.conflict('wiki/New.md')).toBe(true);
    expect(pages.touched()).toEqual([{ path: 'wiki/new.md', start: null }]);
  });
});

describe('after the turn, every page the pass wrote is read back', () => {
  function disk(files: Record<string, string>) {
    return {
      files,
      read: vi.fn(async (path: string) => files[path] ?? null),
      restore: vi.fn(async (path: string, text: string) => {
        files[path] = text;
      }),
      remove: vi.fn(async (path: string) => {
        delete files[path];
      }),
    };
  }

  it('puts an existing page back and removes a page the pass created when either does not read as a draft', async () => {
    const pages = createPassPages([{ path: 'wiki/plan.md', text: DRAFT }]);
    pages.commit('wiki/plan.md', DRAFT);
    pages.commit('wiki/new.md', DRAFT);
    const io = disk({ 'wiki/plan.md': DRAFT.replace('status: draft', 'status: reviewed'), 'wiki/new.md': withLine('describes: [x]') });
    const undone = await settlePassPages({ pages, ...io });
    expect(undone).toEqual([
      { path: 'wiki/plan.md', reason: 'not-draft', action: 'restored' },
      { path: 'wiki/new.md', reason: 'forbidden-key', key: 'describes', action: 'removed' },
    ]);
    expect(io.files).toEqual({ 'wiki/plan.md': DRAFT });
  });

  it('leaves a draft, an unchanged page and a page that never landed alone', async () => {
    const reviewed = DRAFT.replace('status: draft', 'status: reviewed');
    const pages = createPassPages([{ path: 'wiki/kept.md', text: reviewed }, { path: 'wiki/plan.md', text: 'old' }]);
    for (const path of ['wiki/kept.md', 'wiki/plan.md', 'wiki/never.md']) pages.commit(path, DRAFT);
    const io = disk({ 'wiki/kept.md': reviewed, 'wiki/plan.md': DRAFT });
    expect(await settlePassPages({ pages, ...io })).toEqual([]);
    expect(io.restore).not.toHaveBeenCalled();
    expect(io.remove).not.toHaveBeenCalled();
  });

  it('puts back a page it cannot read, and says so when the page will not go back', async () => {
    const pages = createPassPages([{ path: 'wiki/plan.md', text: DRAFT }, { path: 'wiki/other.md', text: DRAFT }]);
    pages.commit('wiki/plan.md', DRAFT);
    pages.commit('wiki/other.md', DRAFT);
    const io = disk({ 'wiki/other.md': 'no frontmatter' });
    io.read.mockImplementationOnce(async () => {
      throw new Error('permission denied');
    });
    io.restore.mockImplementation(async (path: string) => {
      if (path === 'wiki/other.md') throw new Error('read-only volume');
      io.files[path] = DRAFT;
    });
    expect(await settlePassPages({ pages, ...io })).toEqual([
      { path: 'wiki/plan.md', reason: 'unreadable', action: 'restored' },
      { path: 'wiki/other.md', reason: 'no-frontmatter', action: 'failed' },
    ]);
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
