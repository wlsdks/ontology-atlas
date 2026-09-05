import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { WIKI_PAGE_CASES, WIKI_PAGE_KNOWN_SOURCES } from '../fixtures/wiki-page-cases.mjs';
import {
  WIKI_CITATION_PATTERN as PATTERN_TS,
  WIKI_FIELDS as FIELDS_TS,
  WIKI_PAGE_TEMPLATE as TEMPLATE_TS,
  WIKI_REQUIRED_FIELDS as REQUIRED_TS,
  WIKI_SECTION_ORDER as SECTIONS_TS,
  validateWikiPage as validateTs,
} from '@/shared/lib/wiki-page-schema';
import {
  WIKI_CITATION_PATTERN as PATTERN_MCP,
  WIKI_FIELDS as FIELDS_MCP,
  WIKI_PAGE_TEMPLATE as TEMPLATE_MCP,
  WIKI_REQUIRED_FIELDS as REQUIRED_MCP,
  WIKI_SECTION_ORDER as SECTIONS_MCP,
  validateWikiPage as validateMcp,
} from '../../mcp/src/wiki-schema.mjs';

/**
 * **One format, however many things write a page.**
 *
 * A wiki page can come from an ACP agent, from a local model through the app's own LLM
 * path, or from a person typing. If the shape each of them is told differs by one field
 * from the shape a reader enforces, the format does not exist — every consumer is back
 * to guessing what it is holding. The owner's instruction on 2026-09-05 was exactly
 * this: whatever produces pages must write them in our format, and that format must
 * exist as a clear template of our own.
 *
 * The MCP package ships separately from the web bundle, so the contract lives in two
 * physical modules. This table is their unification, the same pattern as
 * `validate-vault-document.contract.test.ts`: messages may be worded differently,
 * **codes may not**, because the Docs sidebar, `wiki-validate`'s exit code, and an
 * agent's retry all branch on the code rather than on the sentence.
 *
 * The template is compared character for character rather than by shape. It is prompt
 * material: a writer told a slightly older template writes pages the current validator
 * rejects, and the rejection would look like a model failure rather than a drift between
 * two constants.
 */

interface Validator {
  (raw: string, options?: { knownSources?: Iterable<string> }): {
    ok: boolean;
    problems: Array<{ code: string; message: string; line?: number }>;
  };
}

const VALIDATORS: Record<string, Validator> = {
  'src/shared/lib (TS)': validateTs as Validator,
  'mcp/src/wiki-schema.mjs': validateMcp as Validator,
};

describe('the wiki page contract — both implementations agree', () => {
  for (const [name, validate] of Object.entries(VALIDATORS)) {
    describe(name, () => {
      for (const testCase of WIKI_PAGE_CASES) {
        it(testCase.name, () => {
          const result = validate(testCase.input);
          expect(result.problems.map((p) => p.code).sort()).toEqual(
            [...testCase.expectedCodes].sort(),
          );
          expect(result.ok).toBe(testCase.expectedOk);
        });
      }

      it('reports a citation naming a file that is not in the folder', () => {
        const complete = WIKI_PAGE_CASES.find((c) => c.expectedOk)!;
        const result = validate(complete.input, { knownSources: [] });
        expect(result.problems.map((p) => p.code)).toContain('citation-target-missing');
      });

      it('accepts the same page once the cited files exist', () => {
        const complete = WIKI_PAGE_CASES.find((c) => c.expectedOk)!;
        expect(validate(complete.input, { knownSources: WIKI_PAGE_KNOWN_SOURCES }).ok).toBe(true);
      });

      it('accepts its own template, which is what every writer is handed', () => {
        expect(validate(TEMPLATE_TS).ok).toBe(true);
      });
    });
  }

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
   * `init` writes the template into every new vault, so a hand-edit there would hand a
   * person — and the model reading it — a shape the validator no longer accepts. The
   * English file is the schema string byte for byte. The Korean one is a translation of
   * the placeholder prose only: keys, section headings and citation syntax are the
   * format itself and stay identical, which is why it is checked by validating it rather
   * than by comparing text.
   */
  it('the vault templates the CLI ships are the contract', () => {
    const repoRoot = resolve(__dirname, '../..');
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

describe('validation stays linear as a folder grows', () => {
  /**
   * The standing perf gates in this repository are set at 1,000 and 5,000 nodes, and a
   * library grows the same way — one page per document somebody brings in. Validation
   * has to stay something a list can do while it draws, so this measures the whole
   * thousand at once and the Docs sidebar then does it one row at a time, cached by
   * mtime.
   *
   * Measured 2026-09-05 on the development machine: **1,000 pages in 34 ms** through this
   * suite (median of three runs; the MCP twin run directly under node measured 10 ms)
   * against this 1.5 s budget. The budget is deliberately ~40× the measured number — it
   * exists to catch a change of *shape*, such as a validator that starts reading the
   * folder or re-scanning quadratically, not to police a few milliseconds across
   * machines.
   */
  it('validates 1,000 pages well under 1.5 s', () => {
    const complete = WIKI_PAGE_CASES.find((c) => c.expectedOk)!;
    const pages = Array.from({ length: 1000 }, (_, index) =>
      complete.input.replace('title: Quarter plan', `title: Quarter plan ${index}`),
    );
    const runs: number[] = [];
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now();
      for (const page of pages) validateTs(page);
      runs.push(performance.now() - started);
    }
    const median = runs.sort((a, b) => a - b)[1]!;
    expect(median).toBeLessThan(1500);
  });
});
