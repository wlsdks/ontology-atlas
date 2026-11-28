import { describe, expect, it } from 'vitest';

import { buildWikiNodeIndex, validateWikiPage } from '@/shared/lib/library/wiki-page-schema';
import { validateWikiFolder, wikiPageFacts } from '@/shared/lib/library/wiki-folder';
import { generatedWikiFolder } from '../../../../tests/fixtures/wiki-page-cases.mjs';
import { judgeLibraryWiki, libraryWikiReport } from './library-wiki-judgement';
import { mergeWikiVerdict } from './merge-wiki-verdict';

const folder = generatedWikiFolder();
const slugOf = (path: string) => path.slice(0, -3);
const nodes = buildWikiNodeIndex(folder.nodes);

/** The verdicts as the Library drew them while it kept every page's text. */
function verdictsFromTexts(pages: typeof folder.pages, knownSources: ReadonlySet<string>) {
  const folderProblems = new Map(validateWikiFolder(pages).map((entry) => [entry.path, entry.problems] as const));
  return new Map(pages.map(({ path, raw }) => {
    const { ok, problems } = validateWikiPage(raw, { knownSources, nodes });
    return [slugOf(path), mergeWikiVerdict({
      ok, firstProblem: problems[0]?.code ?? null, firstProblemMessage: problems[0]?.message ?? null,
      problemCount: problems.length, problems,
    }, folderProblems.get(path) ?? [])] as const;
  }));
}

const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

describe('Library wiki verdicts from page facts', () => {
  const facts = folder.pages.map(({ path, raw }) => ({ slug: slugOf(path), facts: wikiPageFacts(raw) }));

  it.each([
    ['every source known', new Set(folder.knownSources)],
    ['no source known', new Set<string>()],
  ])('equal page and folder validation of the texts, %s', (_name, knownSources) => {
    const expected = verdictsFromTexts(folder.pages, knownSources);
    const verdicts = judgeLibraryWiki(facts, { knownSources, nodes });
    expect(verdicts.size).toBe(folder.pages.length);
    expect([...expected.values()].filter((verdict) => !verdict.ok).length, 'the folder has no failing page').toBeGreaterThan(0);
    expect(plain([...verdicts])).toEqual(plain([...expected]));
    expect(plain(libraryWikiReport(verdicts, []))).toEqual(plain(libraryWikiReport(expected, [])));
  });

  it('judges the pages read so far among themselves, as a folder of only those pages', () => {
    const knownSources = new Set(folder.knownSources);
    const half = folder.pages.slice(0, folder.pages.length / 2);
    const verdicts = judgeLibraryWiki(facts.slice(0, half.length), { knownSources, nodes });
    expect(plain([...verdicts])).toEqual(plain([...verdictsFromTexts(half, knownSources)]));
  });
});
