import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  WIKI_FOLDER_CASES,
  WIKI_PAGE_CASES,
  WIKI_PAGE_KNOWN_SOURCES,
  generatedWikiFolder,
} from '../../fixtures/wiki-page-cases.mjs';
import {
  WIKI_CITATION_PATTERN as PATTERN_TS,
  WIKI_FIELDS as FIELDS_TS,
  WIKI_PAGE_TEMPLATE as TEMPLATE_TS,
  WIKI_REQUIRED_FIELDS as REQUIRED_TS,
  WIKI_SECTION_ORDER as SECTIONS_TS,
  validateWikiFolder as validateFolderTs,
  validateWikiFolderFromFacts as fromFactsTs,
  validateWikiPage as validateTs,
  wikiPageCodes as codesTs,
  wikiPageFacts as factsTs,
} from '@/shared/lib/library/wiki-page-schema';
import {
  WIKI_CITATION_PATTERN as PATTERN_MCP,
  WIKI_FIELDS as FIELDS_MCP,
  WIKI_PAGE_TEMPLATE as TEMPLATE_MCP,
  WIKI_REQUIRED_FIELDS as REQUIRED_MCP,
  WIKI_SECTION_ORDER as SECTIONS_MCP,
  validateWikiFolder as validateFolderMcp,
  validateWikiPage as validateMcp,
  wikiPageCodes as codesMcp,
  wikiPageFacts as factsMcp,
} from '../../../mcp/src/library/wiki-schema.mjs';

/**
 * One format however many things write a page: the TS and MCP validators must share the same codes
 * (messages may differ), since the Docs sidebar, `wiki-validate` exit code and agent retries branch
 * on the code. The template is compared character for character because it is prompt material.
 */

interface Validator {
  (raw: string, options?: { knownSources?: Iterable<string>; nodes?: Iterable<{ slug: string; kind?: unknown; alias?: unknown }> }): {
    ok: boolean;
    problems: Array<{ code: string; message: string; line?: number }>;
  };
}

const VALIDATORS: Record<string, Validator> = {
  'src/shared/lib (TS)': validateTs as Validator,
  'mcp/src/library/wiki-schema.mjs': validateMcp as Validator,
};

describe('the wiki page contract — both implementations agree', () => {
  for (const [name, validate] of Object.entries(VALIDATORS)) {
    describe(name, () => {
      for (const testCase of WIKI_PAGE_CASES) {
        it(testCase.name, () => {
          const result = validate(testCase.input, testCase.nodes ? { nodes: testCase.nodes } : {});
          expect(result.problems.map((p) => p.code).sort()).toEqual(
            [...testCase.expectedCodes].sort(),
          );
          expect(result.ok).toBe(testCase.expectedOk);
        });
      }

      it('reports a citation naming a file that is not in the folder', () => {
        const complete = WIKI_PAGE_CASES.find((c) => c.expectedOk)!;
        const result = validate(complete.input, { knownSources: new Set<string>() });
        expect(result.problems.map((p) => p.code)).toContain('citation-target-missing');
      });

      it('accepts the same page once the cited files exist', () => {
        const complete = WIKI_PAGE_CASES.find((c) => c.expectedOk)!;
        expect(validate(complete.input, { knownSources: new Set(WIKI_PAGE_KNOWN_SOURCES) }).ok).toBe(true);
      });

      it('accepts its own template, which is what every writer is handed', () => {
        expect(validate(TEMPLATE_TS).ok).toBe(true);
      });
    });
  }

  it('both implementations return the same verdict on every describes row, word for word', () => {
    for (const testCase of WIKI_PAGE_CASES.filter((c) => c.nodes)) {
      expect(JSON.stringify(validateMcp(testCase.input, { nodes: testCase.nodes }))).toBe(
        JSON.stringify(validateTs(testCase.input, { nodes: testCase.nodes })),
      );
    }
  });

  it('neither implementation knows the retired describes-needs-approval code', () => {
    const sources = ['mcp/src/library/wiki-schema.mjs', 'src/shared/lib/library/wiki-page-schema.ts'];
    const repoRoot = resolve(__dirname, '../../..');
    for (const file of sources) expect(readFileSync(resolve(repoRoot, file), 'utf8')).not.toContain('describes-needs-approval');
    for (const locale of ['en', 'ko', 'ja', 'zh']) {
      expect(readFileSync(resolve(repoRoot, `messages/${locale}/library.json`), 'utf8')).not.toContain('describes-needs-approval');
    }
  });

  it('both implementations ship the identical template text', () => {
    expect(TEMPLATE_TS).toBe(TEMPLATE_MCP);
  });

  it('both implementations name the same fields, in the same order', () => {
    expect(FIELDS_TS.map((field) => [field.key, field.required])).toEqual(
      (FIELDS_MCP as typeof FIELDS_TS).map((field) => [field.key, field.required]),
    );
    expect([...REQUIRED_TS]).toEqual([...REQUIRED_MCP]);
  });

  it('both implementations fix the same section order', () => {
    expect([...SECTIONS_TS]).toEqual([...SECTIONS_MCP]);
  });

  it('both implementations use one citation syntax', () => {
    expect(PATTERN_TS).toBe(PATTERN_MCP);
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
 * The folder half: three facts only the whole folder can tell are judged by both implementations on
 * the same cases, since the page validator alone stays green.
 */
describe('the wiki folder contract — both implementations agree', () => {
  const FOLDER_VALIDATORS = {
    'src/shared/lib (TS)': validateFolderTs,
    'mcp/src/library/wiki-schema.mjs': validateFolderMcp,
  } as const;
  for (const [name, validate] of Object.entries(FOLDER_VALIDATORS)) {
    describe(name, () => {
      for (const testCase of WIKI_FOLDER_CASES) {
        it(testCase.name, () => {
          const result = (validate as typeof validateFolderTs)(testCase.pages);
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
    });
  }

  it('both implementations return byte-identical verdicts on every case', () => {
    for (const testCase of WIKI_FOLDER_CASES) {
      expect(JSON.stringify(validateFolderMcp(testCase.pages))).toBe(
        JSON.stringify(validateFolderTs(testCase.pages)),
      );
    }
  });
});

/**
 * Page facts stand in for page text once a page has been read, so judging from facts must answer
 * exactly what judging from text answers: the folder half byte for byte, a page's codes as a set.
 * The MCP folder half judges from facts only, so the text-based reference is the web twin's.
 */
describe('wiki page facts — judging from facts equals judging from text', () => {
  const generated = generatedWikiFolder();
  const folders = [...WIKI_FOLDER_CASES.map((testCase) => testCase.pages), generated.pages];
  type FolderPages = Parameters<typeof validateFolderTs>[0];
  const IMPLEMENTATIONS = {
    'src/shared/lib (TS)': {
      facts: factsTs,
      folderFromFacts: (pages: FolderPages) => fromFactsTs(pages.map((page) => ({ path: page.path, facts: factsTs(page.raw) }))),
      page: validateTs,
      codes: codesTs,
    },
    'mcp/src/library/wiki-schema.mjs': {
      facts: factsMcp as typeof factsTs,
      folderFromFacts: validateFolderMcp,
      page: validateMcp,
      codes: codesMcp as typeof codesTs,
    },
  } as const;
  const distinct = (codes: readonly string[]) => [...new Set(codes)].sort();

  it('the generated folder exercises every folder code and most page codes', () => {
    const codes = new Set(validateFolderMcp(generated.pages).flatMap((entry) => entry.problems.map((p) => p.code)));
    for (const page of generated.pages) {
      for (const p of validateMcp(page.raw, { knownSources: generated.knownSources, nodes: generated.nodes }).problems) codes.add(p.code);
    }
    expect([...codes].sort()).toEqual([
      'bad-citation', 'bad-describes', 'bad-truncation-record', 'citation-target-missing', 'dangling-wikilink',
      'describes-target-missing', 'kind-present', 'missing-field:compiled_at', 'missing-field:created_by',
      'missing-field:source_hash', 'missing-field:sources', 'missing-field:status', 'missing-field:summary',
      'missing-field:title', 'orphan-page', 'section-order', 'shared-source-unlinked', 'uncited-fact',
    ]);
  });

  for (const [name, implementation] of Object.entries(IMPLEMENTATIONS)) {
    describe(name, () => {
      it('the folder half from facts is byte-identical to the folder half from text on every folder', () => {
        for (const pages of folders) {
          expect(JSON.stringify(implementation.folderFromFacts(pages))).toBe(JSON.stringify(validateFolderTs(pages)));
        }
      });

      it('a page\'s codes from facts are the codes its text reports, with and without the folder', () => {
        const pages = [...WIKI_PAGE_CASES.map((testCase) => testCase.input), ...generated.pages.map((page) => page.raw)];
        const optionSets = [{}, { knownSources: new Set(generated.knownSources), nodes: generated.nodes }];
        for (const raw of pages) {
          const facts = implementation.facts(raw);
          for (const options of optionSets) {
            const codes = implementation.page(raw, options).problems.map((p) => p.code);
            expect(distinct(implementation.codes(facts, options))).toEqual(distinct(codes));
          }
        }
      });
    });
  }

  it('both implementations derive the same facts from every page', () => {
    const pages = [...WIKI_PAGE_CASES.map((testCase) => testCase.input), ...folders.flat().map((page) => page.raw)];
    for (const raw of pages) expect(JSON.stringify(factsMcp(raw))).toBe(JSON.stringify(factsTs(raw)));
  });
});
