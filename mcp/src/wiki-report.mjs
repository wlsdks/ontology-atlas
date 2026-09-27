/**
 * Groups per-page wiki verdicts into the per-kind report every surface shows
 * (`wiki-validate`, `validate_wiki`, the Library), so their numbers cannot
 * disagree (`docs/DECISIONS.md`, "The Library keeps its spine, and computes the
 * structural check itself"). The app imports it
 * through `src/shared/lib/wiki-report.mjs`, a re-export rather than a twin: this module
 * is pure. Advisory is a field on the group, never a caller's filter: advisory
 * findings are reported, counted and ordered last, and `blockingPageCount` is
 * the blocking-only number. Every list is sorted (groups by advisory then code,
 * rows by page, line, code) so two screens enumerate one folder identically.
 */

/** Findings about the folder's shape rather than one page's text (meanings in `wiki-schema.mjs`). */
export const WIKI_FOLDER_CODES = Object.freeze([
  'dangling-wikilink',
  'orphan-page',
  'shared-source-unlinked',
]);

/**
 * Folder findings true of a young, uncross-linked wiki rather than of a page:
 * reported and counted, but they never decide whether a page fits the template.
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
 * The finding kind: the code without its instance part.
 * Only `missing-field:<key>` has one, so a reader gets one "required field missing"
 * heading; the row keeps the full code, which agents branch on.
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
 * Groups per-page verdicts into the report a person reads.
 *
 * @param {{
 *   pages?: ReadonlyArray<{ page?: string, path?: string, problems?: ReadonlyArray<{ code: string, message?: string, line?: number, detail?: unknown }> }>,
 *   unmeasured?: ReadonlyArray<string>,
 * }} input `pages` were judged (vault-relative, the `wiki-validate --json` shape);
 *   pages in `unmeasured` exist but were not judged yet (the app reads lazily),
 *   and must never be drawn as "nothing found".
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
    const onlyAdvisory = problems.every((problem) => isWikiAdvisoryCode(problem.code));
    if (!onlyAdvisory) blockingPageCount += 1;
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
    // Blocking kinds first (fixable by editing that page), then advisory, each
    // alphabetical by code.
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
