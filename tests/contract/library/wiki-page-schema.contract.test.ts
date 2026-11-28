import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import GOLDEN from '../../fixtures/wiki-validation-golden.json';
import {
  WIKI_FOLDER_CASES,
  WIKI_PAGE_CASES,
  WIKI_PAGE_KNOWN_SOURCES,
  generatedWikiFolder,
} from '../../fixtures/wiki-page-cases.mjs';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import {
  WIKI_CITATION_PATTERN as PATTERN_TS,
  WIKI_FIELDS as FIELDS_TS,
  WIKI_PAGE_TEMPLATE as TEMPLATE_TS,
  WIKI_REQUIRED_FIELDS as REQUIRED_TS,
  WIKI_SECTION_ORDER as SECTIONS_TS,
  buildWikiNodeIndex,
  validateWikiPage as validateTs,
} from '@/shared/lib/library/wiki-page-schema';
import {
  validateWikiFolder as validateFolderTs,
  wikiFolderJudgement as folderJudgementTs,
  wikiPageCodes as wikiPageCodesTs,
  wikiPageFacts as wikiPageFactsTs,
  wikiPageProblems,
} from '@/shared/lib/library/wiki-folder';
import { WIKI_ADVISORY_CODES } from '@/shared/lib/library/wiki-report.mjs';

/**
 * One format however many things write a page: the app's validators give the codes and words the
 * `validate_wiki` tool gave when `tests/fixtures/wiki-validation-golden.json` was recorded from it;
 * the Docs sidebar and agent retries branch on the code. The template is compared character for
 * character because it is prompt material.
 */

const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const distinct = (codes: readonly string[]) => [...new Set(codes)].sort();

describe('the wiki page contract', () => {
  for (const testCase of WIKI_PAGE_CASES) {
    it(testCase.name, () => {
      const result = validateTs(testCase.input, testCase.nodes ? { nodes: testCase.nodes } : {});
      expect(result.problems.map((p) => p.code).sort()).toEqual([...testCase.expectedCodes].sort());
      expect(result.ok).toBe(testCase.expectedOk);
    });
  }

  it('reports a citation naming a file that is not in the folder', () => {
    const complete = WIKI_PAGE_CASES.find((c) => c.expectedOk)!;
    const result = validateTs(complete.input, { knownSources: new Set<string>() });
    expect(result.problems.map((p) => p.code)).toContain('citation-target-missing');
  });

  it('accepts the same page once the cited files exist', () => {
    const complete = WIKI_PAGE_CASES.find((c) => c.expectedOk)!;
    expect(validateTs(complete.input, { knownSources: new Set(WIKI_PAGE_KNOWN_SOURCES) }).ok).toBe(true);
  });

  it('accepts its own template, which is what every writer is handed', () => {
    expect(validateTs(TEMPLATE_TS).ok).toBe(true);
  });

  it('returns the recorded verdict on every describes row, word for word', () => {
    for (const testCase of WIKI_PAGE_CASES.filter((c) => c.nodes)) {
      const recorded = (GOLDEN.describesRows as Record<string, unknown>)[testCase.name];
      expect(recorded, testCase.name).toBeDefined();
      expect(JSON.stringify(validateTs(testCase.input, { nodes: testCase.nodes }))).toBe(JSON.stringify(recorded));
    }
  });

  it('does not know the retired describes-needs-approval code', () => {
    const repoRoot = resolve(__dirname, '../../..');
    expect(readFileSync(resolve(repoRoot, 'src/shared/lib/library/wiki-page-schema.ts'), 'utf8')).not.toContain('describes-needs-approval');
    for (const locale of ['en', 'ko', 'ja', 'zh']) {
      expect(readFileSync(resolve(repoRoot, `messages/${locale}/library.json`), 'utf8')).not.toContain('describes-needs-approval');
    }
  });

  it('names the recorded fields in the recorded order, the sections in order, and one citation syntax', () => {
    expect(FIELDS_TS.map((field) => [field.key, field.required])).toEqual(GOLDEN.fields);
    expect([...REQUIRED_TS]).toEqual(GOLDEN.requiredFields);
    expect([...SECTIONS_TS]).toEqual(GOLDEN.sectionOrder);
    expect(PATTERN_TS).toBe(GOLDEN.citationPattern);
  });

  /**
   * `init` writes the template into every new vault. The English file is the schema string byte for
   * byte; the Korean one translates placeholder prose only, so it is validated rather than compared as
   * text.
   */
  it('the vault templates the CLI ships are the contract', () => {
    const repoRoot = resolve(__dirname, '../../..');
    expect(readFileSync(resolve(repoRoot, 'cli/templates/vault/wiki/_template.md'), 'utf8')).toBe(
      TEMPLATE_TS,
    );
    const korean = readFileSync(
      resolve(repoRoot, 'cli/templates/vault-ko/wiki/_template.md'),
      'utf8',
    );
    expect(validateTs(korean).ok).toBe(true);
    for (const key of REQUIRED_TS) expect(korean).toContain(`${key}:`);
    for (const section of SECTIONS_TS) expect(korean).toContain(`## ${section}`);
  });

  /**
   * The template is not decoration: it is the frontmatter a page must carry and the
   * sections it must have. A field added to the contract without reaching the template
   * would be a rule nobody writing a page has been told.
   */
  it('the template contains every required field and every section', () => {
    for (const key of REQUIRED_TS) expect(TEMPLATE_TS).toContain(`${key}:`);
    for (const section of SECTIONS_TS) expect(TEMPLATE_TS).toContain(`## ${section}`);
    expect(TEMPLATE_TS).not.toContain('kind:');
  });
});

/**
 * The folder half: three facts only the whole folder can tell are judged on the same cases, since
 * the page validator alone stays green.
 */
describe('the wiki folder contract', () => {
  for (const testCase of WIKI_FOLDER_CASES) {
    it(testCase.name, () => {
      const result = validateFolderTs(testCase.pages);
      const got = Object.fromEntries(
        result.map((entry) => [entry.path, entry.problems.map((p) => p.code).sort()]),
      );
      const want = Object.fromEntries(
        Object.entries(testCase.expected).map(([path, codes]) => [path, [...codes].sort()]),
      );
      expect(got).toEqual(want);
      if (!testCase.partners) return;
      const partners = Object.fromEntries(
        result.map((entry) => [
          entry.path,
          entry.problems
            .filter((p) => p.code === 'shared-source-unlinked')
            .map((p) => p.detail?.values?.other),
        ]),
      );
      expect(partners).toEqual(testCase.partners);
    });
  }

  it('returns the recorded verdicts on every case, byte for byte', () => {
    for (const testCase of WIKI_FOLDER_CASES) {
      const recorded = (GOLDEN.folderCases as Record<string, unknown>)[testCase.name];
      expect(recorded, testCase.name).toBeDefined();
      expect(JSON.stringify(validateFolderTs(testCase.pages))).toBe(JSON.stringify(recorded));
    }
  });
});

/**
 * `validate_wiki` judges from page facts kept per file version, so it must answer what judging every
 * page's text answers.
 */
describe('wiki page facts — judging from facts equals judging from text', () => {
  const generated = generatedWikiFolder();
  const optionSets = [
    {},
    { knownSources: new Set(generated.knownSources) },
    { nodes: generated.nodes },
    { knownSources: new Set(generated.knownSources), nodes: generated.nodes },
  ];

  it('the generated folder exercises every folder code and most page codes', () => {
    const codes = new Set<string>(validateFolderTs(generated.pages).flatMap((entry) => entry.problems.map((p) => p.code)));
    for (const page of generated.pages) {
      for (const p of validateTs(page.raw, { knownSources: new Set(generated.knownSources), nodes: generated.nodes }).problems) codes.add(p.code);
    }
    expect([...codes].sort()).toEqual([
      'bad-citation', 'bad-describes', 'bad-truncation-record', 'citation-target-missing', 'dangling-wikilink',
      'describes-target-missing', 'kind-present', 'missing-field:compiled_at', 'missing-field:created_by',
      'missing-field:source_hash', 'missing-field:sources', 'missing-field:status', 'missing-field:summary',
      'missing-field:title', 'orphan-page', 'section-order', 'shared-source-unlinked', 'uncited-fact',
    ]);
  });

  it('the folder verdicts of the generated folder are the recorded ones', () => {
    expect(generated.pages.length).toBe(GOLDEN.generatedFolder.count);
    expect(sha256(validateFolderTs(generated.pages))).toBe(GOLDEN.generatedFolder.folderVerdictsSha256);
  });

  it("each page's verdicts, with and without the folder, are the recorded ones", () => {
    const withOptions = [{}, optionSets[3]];
    expect(sha256(generated.pages.map((page) => withOptions.map((options) => validateTs(page.raw, options))))).toBe(
      GOLDEN.generatedFolder.pageVerdictsSha256,
    );
  });

  it("a page's facts rebuild the problems and codes its text reports, whatever the options", () => {
    const pages = [...WIKI_PAGE_CASES.map((testCase) => testCase.input), ...generated.pages.map((page) => page.raw)];
    for (const raw of pages) {
      const facts = wikiPageFactsTs(raw);
      for (const options of optionSets) {
        const expected = validateTs(raw, options).problems;
        expect(JSON.stringify(wikiPageProblems(facts, options))).toBe(JSON.stringify(expected));
        expect(distinct(wikiPageCodesTs(facts, options))).toEqual(distinct(expected.map((p) => p.code)));
      }
    }
  });

  it('the folder judgement asked page by page equals the folder verdicts on the generated folder', () => {
    const judgement = folderJudgementTs(
      generated.pages.map((page) => ({ path: page.path, facts: wikiPageFactsTs(page.raw) })),
    );
    const verdicts = validateFolderTs(generated.pages);
    verdicts.forEach((verdict, index) => {
      expect(JSON.stringify(judgement.problemsOf(index))).toBe(JSON.stringify(verdict.problems));
      expect(distinct(judgement.codesOf(index))).toEqual(distinct(verdict.problems.map((p) => p.code)));
    });
  });

  it('judging every page text with its folder problems gives the pages `validate_wiki` returned for the folder', () => {
    const knownSources = new Set(generated.knownSources);
    // The index the server built from the folder on disk: the concepts and every page, a page by
    // its own `kind:` and `slug:`.
    const nodes = buildWikiNodeIndex([
      ...generated.nodes.filter((node) => !node.slug.startsWith('wiki/')),
      ...generated.pages.map((page) => {
        const { frontmatter } = parseFrontmatter(page.raw);
        return { slug: page.path.slice(0, -'.md'.length), kind: frontmatter.kind, alias: frontmatter.slug };
      }),
      { slug: 'wiki/_template' },
    ]);
    // The server reads the folder in path order, and which partners a page names depends on it.
    const inPathOrder = [...generated.pages].sort((left, right) => (left.path < right.path ? -1 : 1));
    const folder = new Map(validateFolderTs(inPathOrder).map((entry) => [entry.path, entry.problems]));
    const judged = inPathOrder
      .map((page) => {
        const problems = [
          ...validateTs(page.raw, { knownSources, nodes }).problems,
          ...(folder.get(page.path) ?? []),
        ];
        return { path: page.path, ok: problems.length === 0, problems };
      });
    expect(sha256(judged)).toBe(GOLDEN.generatedFolder.judgedPagesSha256);
    expect(judged.some((page) => page.problems.some((p) => !WIKI_ADVISORY_CODES.includes(p.code)))).toBe(true);
  });
});
