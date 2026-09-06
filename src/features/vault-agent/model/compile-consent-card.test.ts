import { describe, expect, it } from 'vitest';

import { buildCompileConsentCard } from './compile-consent-card';
import { applyProposal, type VaultWritePort } from './proposal-applier';
import type { WikiPageProposal } from './wiki-proposal';

const LABELS = {
  createFile: (path: string) => `create ${path}`,
  modifyFile: (path: string) => `edit ${path}`,
};

function proposal(overrides: Partial<WikiPageProposal> = {}): WikiPageProposal {
  return {
    path: 'wiki/quarter-plan.md',
    slug: 'wiki/quarter-plan',
    title: 'Quarter plan',
    page: '---\ntitle: "Quarter plan"\n---\n\n## Summary\n',
    existing: null,
    ok: true,
    problems: [],
    sections: [
      { name: 'Summary', entries: 1 },
      { name: 'Facts', entries: 3 },
      { name: 'Decisions', entries: 1 },
      { name: 'Open questions', entries: 0 },
      { name: 'Not in sources', entries: 2 },
    ],
    citationCount: 4,
    sourcesRead: ['sources/quarter-plan.md'],
    sourcesUnreadable: [{ path: 'sources/finance.pdf', refusal: 'needs-a-parser', truncated: false }],
    sourcesTruncated: [],
    ...overrides,
  };
}

function writePort(log: string[]): VaultWritePort {
  return {
    createDoc: async (slug) => {
      log.push(`create:${slug}`);
    },
    saveDoc: async (slug) => {
      log.push(`save:${slug}`);
    },
    currentMtime: () => undefined,
    refresh: async () => undefined,
    snapshot: async () => null,
  };
}

describe('buildCompileConsentCard — the three facts in front of the button', () => {
  it('names the page, its sections, its citations, and both source lists', () => {
    const card = buildCompileConsentCard([proposal()], { vaultIsGit: true, labels: LABELS });

    expect(card.rows).toHaveLength(1);
    expect(card.rows[0]).toMatchObject({
      path: 'wiki/quarter-plan.md',
      title: 'Quarter plan',
      ok: true,
      replaces: false,
      citationCount: 4,
      sourcesRead: ['sources/quarter-plan.md'],
    });
    expect(card.rows[0].sections.map((section) => `${section.name}:${section.entries}`)).toEqual([
      'Summary:1',
      'Facts:3',
      'Decisions:1',
      'Open questions:0',
      'Not in sources:2',
    ]);
    expect(card.rows[0].sourcesUnreadable).toEqual([
      { path: 'sources/finance.pdf', refusal: 'needs-a-parser' },
    ]);
  });

  it('says which sources it read only in part', () => {
    const card = buildCompileConsentCard(
      [proposal({ sourcesTruncated: ['sources/long.md'] })],
      { vaultIsGit: false, labels: LABELS },
    );
    expect(card.rows[0].sourcesTruncated).toEqual(['sources/long.md']);
  });

  it('carries the exact bytes that would be written — the card and the applier read one value', () => {
    const card = buildCompileConsentCard([proposal()], { vaultIsGit: false, labels: LABELS });
    expect(card.rows[0].page).toBe(card.proposal!.changes[0].files[0].after);
  });

  it('defaults the save point to on for a git folder and off otherwise', () => {
    expect(
      buildCompileConsentCard([proposal()], { vaultIsGit: true, labels: LABELS }).proposal
        ?.snapshotRequested,
    ).toBe(true);
    expect(
      buildCompileConsentCard([proposal()], { vaultIsGit: false, labels: LABELS }).proposal
        ?.snapshotRequested,
    ).toBe(false);
  });

  it('turns an existing page into a modify with its mtime, so a concurrent edit blocks the write', () => {
    const card = buildCompileConsentCard(
      [proposal({ existing: { text: 'older page', mtime: 4242 } })],
      { vaultIsGit: false, labels: LABELS },
    );

    expect(card.rows[0].replaces).toBe(true);
    expect(card.proposal!.changes[0]).toMatchObject({
      summary: 'edit wiki/quarter-plan.md',
      expectedMtime: 4242,
    });
    expect(card.proposal!.changes[0].files[0]).toMatchObject({
      kind: 'modify',
      before: 'older page',
    });
  });
});

describe('a page that fails validation offers nothing to write', () => {
  const refused = proposal({
    ok: false,
    page: '',
    problems: [
      { code: 'citation-anchor-unresolvable', message: '`#p47` does not exist in `sources/quarter-plan.md`.' },
    ],
  });

  it('shows the exact failure and no page', () => {
    const card = buildCompileConsentCard([refused], { vaultIsGit: false, labels: LABELS });
    expect(card.rows[0].ok).toBe(false);
    expect(card.rows[0].problems[0].code).toBe('citation-anchor-unresolvable');
    expect(card.rows[0].page).toBeNull();
  });

  it('has no proposal at all — "Allow" has nothing to call', () => {
    const card = buildCompileConsentCard([refused], { vaultIsGit: false, labels: LABELS });
    expect(card.proposal).toBeNull();
    expect(card.writableCount).toBe(0);
    expect(card.refusedCount).toBe(1);
  });

  it('writes the good page and not the refused one when a turn produced both', async () => {
    const card = buildCompileConsentCard([proposal(), refused], {
      vaultIsGit: false,
      labels: LABELS,
    });
    expect(card.writableCount).toBe(1);
    expect(card.refusedCount).toBe(1);

    const log: string[] = [];
    const outcome = await applyProposal(card.proposal!, writePort(log), {
      snapshotLabel: 'compile',
    });

    expect(outcome.status).toBe('applied');
    expect(log).toEqual(['create:wiki/quarter-plan']);
  });
});
