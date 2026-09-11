/**
 * The wiki check, grouped into a report — **one aggregator, three surfaces.**
 *
 * `wiki-schema.mjs` decides the facts: `validateWikiPage` judges one page against its own
 * bytes, `validateWikiFolder` judges what no page can know about itself. Both answer
 * *per page*. A report a person reads is the other way round: one heading per finding
 * *kind*, and under it the pages that carry it. Until now three surfaces did that
 * regrouping separately — `wiki-validate` prints per page, `validate_wiki` returns per
 * page, and the Library drew a per-page block beside each page and nothing at all for the
 * folder — so the app could say "2 pages do not fit the template" on the same screen
 * where `wiki-validate` said `0/6 pages fit the contract`, and both numbers were
 * correctly computed from different rules.
 *
 * `docs/DECISIONS.md` 2026-09-11 ("The Library keeps its spine, and computes the
 * structural check itself") makes that disagreement a falsifier: *"a structural finding
 * differs between the app's report and `wiki-validate`"*. So the regrouping is written
 * once, here, beside the module that owns the verdict, and the app reaches it through
 * `src/shared/lib/wiki-report.mjs` — a re-export, not a twin. The web bundle and the MCP
 * package ship separately and `wiki-schema.mjs` therefore needs a TypeScript twin; a
 * *pure* module with no runtime dependency does not, and one file cannot drift from
 * itself.
 *
 * ## Advisory is a field, not a caller's opinion
 *
 * `orphan-page` and `shared-source-unlinked` are true of a wiki's youth rather than of a
 * page: on a folder whose pages do not link each other yet, the first is true of every
 * page and the second of every pair that shares a document. The Library already refused
 * to let them mark a row off-template, and the CLI already counted them as
 * off-template — the same split, decided twice, in opposite directions.
 *
 * It is now one field on the group. Nothing here drops an advisory finding: it is
 * reported, counted, and ordered last, and a surface that wants a blocking-only number
 * reads `blockingPageCount` instead of inventing its own filter.
 *
 * ## Deterministic, because a person holds two screens side by side
 *
 * Groups sort by `(advisory, code)` and rows by `(page, line, code)`. Every list this
 * module emits is sorted, so the app's report and a terminal's output enumerate one
 * folder in one order — which is the only way a person can check the record's falsifier
 * themselves.
 */

/**
 * Findings that describe the **folder's shape** rather than one page's own text.
 *
 * Kept here rather than in the app so that `isWikiFolderCode`, the row's mark, the header
 * clause and this report all read one set. `wiki-schema.mjs` documents what each means.
 */
export const WIKI_FOLDER_CODES = Object.freeze([
  'dangling-wikilink',
  'orphan-page',
  'shared-source-unlinked',
]);

/**
 * Folder findings that are **advisory** — true of a young wiki rather than of a page.
 *
 * A wiki nobody has cross-linked yet makes `orphan-page` true of every page, so a mark on
 * every row says nothing (library e2e, 2026-09-07). They stay in the report, counted and
 * last; they do not decide whether a page fits the template.
 */
export const WIKI_ADVISORY_CODES = Object.freeze(['orphan-page', 'shared-source-unlinked']);

const FOLDER = new Set(WIKI_FOLDER_CODES);
const ADVISORY = new Set(WIKI_ADVISORY_CODES);

/** Whether a code describes the folder's shape rather than one page's own text. */
export function isWikiFolderCode(code) {
  return FOLDER.has(wikiFindingCode(code));
}

/** Whether a code is advisory: reported and counted, but never "this page is malformed". */
export function isWikiAdvisoryCode(code) {
  return ADVISORY.has(wikiFindingCode(code));
}

/**
 * The **kind** a finding belongs to, which is its code without the part that names the
 * instance.
 *
 * Only `missing-field:<key>` carries one today (`missing-field:title`,
 * `missing-field:sources`, …). A reader wants one "a required field is missing" heading
 * over the pages and fields, not seven headings; the row keeps the full code, because
 * that is the token `wiki-validate` prints and an agent branches on.
 */
export function wikiFindingCode(code) {
  const text = String(code ?? '');
  const at = text.indexOf(':');
  return at < 0 ? text : text.slice(0, at);
}

function comparePages(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Group per-page verdicts into the report a person reads.
 *
 * @param {{
 *   pages?: ReadonlyArray<{ page?: string, path?: string, problems?: ReadonlyArray<{ code: string, message?: string, line?: number, detail?: unknown }> }>,
 *   unmeasured?: ReadonlyArray<string>,
 * }} input `pages` is every page that was judged, `page`/`path` vault-relative
 *   (`wiki/<slug>.md`) — the shape `wiki-validate --json` and `validate_wiki` already
 *   return. `unmeasured` names pages that exist in the folder but have **not** been
 *   judged: the app reads a page's bytes lazily, and "not read yet" must never be drawn
 *   as "nothing found". A caller that judged the whole folder up front passes none.
 * @returns {{
 *   pageCount: number,
 *   fitPageCount: number,
 *   blockingPageCount: number,
 *   findingCount: number,
 *   unmeasured: string[],
 *   groups: Array<{ code: string, advisory: boolean, folder: boolean, count: number, pages: string[], rows: Array<{ page: string, code: string, message: string, line?: number, detail?: unknown }> }>,
 * }}
 */
export function aggregateWikiFindings({ pages = [], unmeasured = [] } = {}) {
  const byCode = new Map();
  let findingCount = 0;
  let fitPageCount = 0;
  let blockingPageCount = 0;

  for (const entry of pages) {
    const page = String(entry?.page ?? entry?.path ?? '');
    const problems = entry?.problems ?? [];
    if (problems.length === 0) fitPageCount += 1;
    if (problems.every((problem) => isWikiAdvisoryCode(problem.code))) {
      // A page whose only findings are advisory fits the template: the folder around it
      // is young, and nothing in the page's own bytes is wrong. This is the rule the app
      // and the CLI disagreed about; it now lives in one place.
    } else {
      blockingPageCount += 1;
    }
    for (const problem of problems) {
      const kind = wikiFindingCode(problem.code);
      if (!byCode.has(kind)) byCode.set(kind, []);
      const row = {
        page,
        code: String(problem.code ?? ''),
        message: String(problem.message ?? ''),
      };
      if (problem.line !== undefined) row.line = problem.line;
      if (problem.detail !== undefined) row.detail = problem.detail;
      byCode.get(kind).push(row);
      findingCount += 1;
    }
  }

  const groups = [...byCode]
    .map(([code, rows]) => {
      rows.sort(
        (left, right) =>
          comparePages(left.page, right.page) ||
          (left.line ?? 0) - (right.line ?? 0) ||
          comparePages(left.code, right.code),
      );
      return {
        code,
        advisory: isWikiAdvisoryCode(code),
        folder: isWikiFolderCode(code),
        count: rows.length,
        pages: [...new Set(rows.map((row) => row.page))],
        rows,
      };
    })
    // Blocking kinds first — they are about a page's own bytes and a person can fix them
    // by editing that page — then advisory, each block alphabetical by code so two
    // screens showing one folder enumerate it identically.
    .sort(
      (left, right) =>
        Number(left.advisory) - Number(right.advisory) || comparePages(left.code, right.code),
    );

  return {
    pageCount: pages.length + unmeasured.length,
    fitPageCount,
    blockingPageCount,
    findingCount,
    unmeasured: [...unmeasured].sort(comparePages),
    groups,
  };
}
