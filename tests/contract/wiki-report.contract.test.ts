import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  WIKI_REPORT_EXPECTED,
  WIKI_REPORT_EXPECTED_BLOCKING_PAGES,
  WIKI_REPORT_EXPECTED_FIT_PAGES,
  WIKI_REPORT_EXPECTED_GROUPS,
  WIKI_REPORT_FOLDER,
  WIKI_REPORT_SOURCES,
} from '../fixtures/wiki-report-folder.mjs';
import {
  validateWikiFolder as validateFolderTs,
  validateWikiPage as validatePageTs,
} from '@/shared/lib/wiki-page-schema';
import { aggregateWikiFindings as aggregateBridged } from '@/shared/lib/wiki-report.mjs';
import {
  validateWikiFolder as validateFolderMcp,
  validateWikiPage as validatePageMcp,
} from '../../mcp/src/wiki-schema.mjs';
import { aggregateWikiFindings as aggregateMcp } from '../../mcp/src/wiki-report.mjs';

/**
 * **One folder, three surfaces, one enumeration.**
 *
 * `docs/DECISIONS.md` 2026-09-11 ("The Library keeps its spine, and computes the
 * structural check itself") licenses the app to compute the structural check itself, and
 * names the risk in its own falsifier: *"a structural finding differs between the app's
 * report and `wiki-validate`"*. A person is expected to be able to hold the Check-results
 * page beside a terminal and see the same folder described the same way. This file is that
 * promise, run on every change to either side.
 *
 * The three arms are the three things a person or an agent can actually ask:
 *
 * 1. **`ontology-atlas wiki-validate --json`** — the command's own code path, executed
 *    against a real folder written to a temp directory. Not a stand-in: `runWikiValidate`
 *    walks the directory, reads the bytes, lists the sources and prints the payload.
 * 2. **`validate_wiki`'s validators** — `validateWikiPage` + `validateWikiFolder` from
 *    `mcp/src/wiki-schema.mjs`, which is literally what `validateWikiTool` calls (see
 *    `mcp/src/index.js`). The tool itself resolves its vault from `OATLAS_VAULT` at
 *    import time, so spawning the server inside a unit run would test the harness rather
 *    than the contract; the module under it is the shared half either way. The CLI arm
 *    above *does* execute a whole command, which is what keeps this from being a
 *    self-comparison.
 * 3. **The app** — the TypeScript twin in `src/shared/lib/wiki-page-schema.ts`, fed
 *    through the aggregator the way `use-library-model.ts` feeds it, reached by the
 *    bridge module the Library imports.
 *
 * Message wording may differ between the twin and the canonical module
 * (`wiki-page-schema.contract.test.ts` owns that rule). **Codes, page lists, group order
 * and the advisory split may not** — those are what the report draws and what an agent
 * branches on.
 *
 * The expected set is stated whole, so the check fails closed. A surface that quietly
 * drops an advisory row would otherwise pass a subset assertion, which is exactly the hole
 * both PO seats found in the slice's hand-written proof list on 2026-09-12.
 */

let vaultRoot: string;

beforeAll(() => {
  vaultRoot = mkdtempSync(join(tmpdir(), 'atlas-wiki-report-'));
  for (const page of WIKI_REPORT_FOLDER) {
    const absolute = join(vaultRoot, page.path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, page.raw, 'utf8');
  }
  for (const source of WIKI_REPORT_SOURCES) {
    const absolute = join(vaultRoot, source);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, 'source bytes\n', 'utf8');
  }
});

afterAll(() => {
  if (vaultRoot) rmSync(vaultRoot, { recursive: true, force: true });
});

/** `<code>\t<page>` for every finding, sorted — the shape the expectation is written in. */
function rows(pages: ReadonlyArray<{ page: string; problems: ReadonlyArray<{ code: string }> }>): string[] {
  return pages
    .flatMap((entry) => entry.problems.map((problem) => `${problem.code}\t${entry.page}`))
    .sort();
}

/** One page's problems merged with its folder problems, the way every surface does it. */
function judge(
  validatePage: (raw: string, options?: { knownSources?: Iterable<string> }) => {
    problems: Array<{ code: string; message: string; line?: number }>;
  },
  validateFolder: (
    pages: Array<{ path: string; raw: string }>,
  ) => Array<{ path: string; problems: Array<{ code: string; message: string; line?: number }> }>,
): Array<{ page: string; problems: Array<{ code: string; message: string; line?: number }> }> {
  const folder = new Map(
    validateFolder(WIKI_REPORT_FOLDER.map((page) => ({ path: page.path, raw: page.raw }))).map(
      (entry) => [entry.path, entry.problems] as const,
    ),
  );
  return WIKI_REPORT_FOLDER.map((page) => ({
    page: page.path,
    problems: [
      ...validatePage(page.raw, { knownSources: WIKI_REPORT_SOURCES }).problems,
      ...(folder.get(page.path) ?? []),
    ],
  }));
}

describe('the structural check — the CLI, the MCP validators and the app enumerate one folder', () => {
  it('the CLI command prints exactly the expected findings', async () => {
    const { runWikiValidate } = await import('../../cli/src/commands/wiki-validate.mjs');
    const written: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    let code: number;
    try {
      code = await runWikiValidate(['--vault', vaultRoot, '--json']);
    } finally {
      process.stdout.write = write;
    }
    // Exit 1: at least one page does not fit. Zero pages would also be an answer, and a
    // green run here would mean the fixture never reached the validator.
    expect(code).toBe(1);
    const payload = JSON.parse(written.join('')) as {
      pageCount: number;
      pages: Array<{ page: string; problems: Array<{ code: string }> }>;
    };
    expect(payload.pageCount).toBe(WIKI_REPORT_FOLDER.length);
    expect(rows(payload.pages)).toEqual([...WIKI_REPORT_EXPECTED]);
  });

  it("the MCP validators — what `validate_wiki` calls — agree", () => {
    expect(rows(judge(validatePageMcp, validateFolderMcp))).toEqual([...WIKI_REPORT_EXPECTED]);
  });

  it('the app’s TypeScript twin agrees', () => {
    expect(rows(judge(validatePageTs, validateFolderTs))).toEqual([...WIKI_REPORT_EXPECTED]);
  });

  it('the aggregator groups the app’s verdicts exactly as the report draws them', () => {
    const report = aggregateBridged({
      pages: judge(validatePageTs, validateFolderTs).map((entry) => ({
        path: entry.page,
        problems: entry.problems,
      })),
    });
    expect(report.groups.map((group) => ({
      code: group.code,
      advisory: group.advisory,
      count: group.count,
      pages: group.pages,
    }))).toEqual([...WIKI_REPORT_EXPECTED_GROUPS]);
    expect(report.findingCount).toBe(WIKI_REPORT_EXPECTED.length);
    expect(report.pageCount).toBe(WIKI_REPORT_FOLDER.length);
    // The one number the app and the CLI used to disagree about: `wiki-validate` calls
    // every page with any finding off-template, and a page whose only findings are
    // advisory fits. Both are true; only one may be called "off-template" on a screen.
    expect(report.blockingPageCount).toBe(WIKI_REPORT_EXPECTED_BLOCKING_PAGES);
    expect(report.fitPageCount).toBe(WIKI_REPORT_EXPECTED_FIT_PAGES);
  });

  it('the bridge and the canonical module are the same function, not a twin', async () => {
    expect(aggregateBridged).toBe(aggregateMcp);
    const bridge = resolve(__dirname, '../../src/shared/lib/wiki-report.mjs');
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(bridge, 'utf8')).toContain('export * from "../../../mcp/src/wiki-report.mjs"');
  });

  it('groups and rows are ordered deterministically, whatever order the pages arrive in', () => {
    const forward = judge(validatePageTs, validateFolderTs).map((entry) => ({
      path: entry.page,
      problems: entry.problems,
    }));
    const shuffled = [...forward].reverse();
    expect(JSON.stringify(aggregateBridged({ pages: shuffled }).groups)).toBe(
      JSON.stringify(aggregateBridged({ pages: forward }).groups),
    );
  });

  it('names the sources of a shared-source finding in one order on every surface', () => {
    // The one divergence measured on 2026-09-12 before this slice: `shared` was built from
    // whichever page the caller's input order made `first`, so the CLI and `validate_wiki`
    // printed the two paths in opposite orders. Codes and pages agreed, so the older
    // contract passed, while a person read one finding worded two ways.
    const sentence = (
      pages: Array<{ page: string; problems: Array<{ code: string; message: string }> }>,
    ) =>
      pages
        .flatMap((entry) => entry.problems)
        .filter((problem) => problem.code === 'shared-source-unlinked')
        .map((problem) => problem.message)
        .sort();
    expect(sentence(judge(validatePageMcp, validateFolderMcp))).toEqual(
      sentence(judge(validatePageTs, validateFolderTs)),
    );
  });

  it('reports pages it has not read as unread rather than as findings it did not find', () => {
    const report = aggregateBridged({
      pages: [{ path: 'wiki/merchant-onboarding.md', problems: [] }],
      unmeasured: ['wiki/settlement.md', 'wiki/refund-timing.md'],
    });
    expect(report.groups).toEqual([]);
    // Sorted, and counted into `pageCount`: a report that said "1 page, 0 findings" about
    // a three-page folder would be a true sentence read as a false one.
    expect(report.unmeasured).toEqual(['wiki/refund-timing.md', 'wiki/settlement.md']);
    expect(report.pageCount).toBe(3);
  });
});
