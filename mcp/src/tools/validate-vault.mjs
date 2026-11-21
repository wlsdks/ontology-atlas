/**
 * The two validators an agent calls before trusting the vault: `validate_vault`
 * (frontmatter, dangling graph refs, duplicate slugs and uids) and
 * `validate_wiki`.
 */

import {
  detectVaultPathDrift,
  suggestPathReconciliations,
} from '../drift/detect-drift.mjs';
import { listSourceFiles } from '../infer-imports/source-files.mjs';
import {
  REPO_ROOT,
  REPO_ROOT_IS_GROUNDED,
  VAULT_ROOT,
  assertScanRootAllowed,
} from '../server/runtime.mjs';
import {
  requireOptionalNonBlankString,
  requireOptionalNonNegativeInteger,
  requireOptionalPositiveInteger,
} from '../server/validate.mjs';
import {
  rawSourceKindIssues,
  suppressLibraryKindIssues,
  suppressParentedExpectedFieldIssues,
} from '../validate.mjs';
import {
  dependencyWitnessFinding,
  folderOnlyEvidenceFinding,
  starterExampleFindings,
} from '../meaning/meaning-findings.mjs';
import { buildDepthFindings, measureBuildDepth, repositorySurvey } from '../construction/build-depth.mjs';
import { sessionReads } from '../construction/session-reads.mjs';
import { validateLoadedVaultDocument } from '../vault/doc-facts.mjs';
import { loadVaultDocs } from '../vault/documents.mjs';
import { collectPathLastChanges } from '../git/git-tools.mjs';
import { evidenceConceptsFromDocs, resolveEvidenceStates } from '../drift/evidence-drift.mjs';
import { okResponseBytes } from '../server/rpc.mjs';
import { repoText } from '../analyze/repo-text.mjs';
import { foldRepeatedGuidance } from './validate-page-fold.mjs';
import { WIKI_ADVISORY_CODES } from '../library/wiki-schema.mjs';
import { judgeLoadedWikiPages } from '../library/wiki-judgement.mjs';
import {
  buildSummaryFreshness,
  groupDanglingIssuesBySlug,
  listVaultSourcePaths,
} from './vault-nodes.mjs';
import { existsSync } from 'node:fs';
import { relative } from 'node:path';

/**
 * Judges wiki pages against their own contract, which `validate_vault` cannot: a
 * wiki page carries no `kind:` by contract. Page and problem objects are the ones
 * `ontology-atlas wiki-validate --json` prints; the whole-folder answer is paged
 * like `validate_vault`'s problems, because a folder of tens of thousands of pages
 * would otherwise be one reply no agent can read.
 *
 * Cost per call: O(bytes of pages changed since the last call) read once each, then
 * O(pages + documents) over kept page facts (`wiki-judgement.mjs`); only the pages a reply
 * shows are read again for their problem text. Failing pages keep the path order the
 * pages were judged in, so ordering them is O(failing).
 */
function validateWikiTool({ paths, offset, limit, afterPath } = {}) {
  if (paths !== undefined && !Array.isArray(paths)) {
    throw new Error('validate_wiki: `paths` must be an array of vault-relative page paths.');
  }
  requireOptionalNonNegativeInteger(offset, 'offset');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  const cursor = readWikiCursor(afterPath);
  if (cursor && offset !== undefined) {
    throw new Error('validate_wiki: `afterPath` resumes where the last reply stopped and `offset` counts from the start; pass one or the other.');
  }
  if (paths !== undefined && (offset !== undefined || limit !== undefined || cursor)) {
    throw new Error('validate_wiki: `offset`, `limit` and `afterPath` page the whole folder; with `paths` every named page is returned, so pass one or the other.');
  }
  const judged = judgeWikiPages(paths);
  if (paths !== undefined) {
    return {
      pageCount: judged.length,
      failingCount: judged.filter((page) => !page.ok).length,
      pages: judged.map((page) => shownPage(page)),
    };
  }
  return pageWikiValidation(judged, {
    offset: offset ?? 0,
    cursor,
    limit: limit ?? VALIDATION_PAGE_LIMIT,
    textBudget: limit === undefined ? WIKI_VALIDATION_PAGE_TEXT_BYTES : null,
    callerArguments: limit === undefined ? {} : { limit },
  });
}

function readWikiCursor(afterPath) {
  if (afterPath === undefined) return null;
  if (typeof afterPath !== 'string' || afterPath.length === 0) {
    throw new Error('validate_wiki: `afterPath` is a page path, copied from the last reply\'s `nextCall`.');
  }
  return afterPath;
}

/** Problems shown per page; the rest are counted, so one page cannot fill a reply. */
const WIKI_PAGE_PROBLEM_LIMIT = 20;
/** Longest message shown; a longer one names repository text (a page or source path) at length. */
const WIKI_MESSAGE_CHARS = 2000;

/**
 * A page as a reply shows it: `blocking` says whether any problem is more than advisory
 * (the walk itself goes by path), at most `keep` problems with the rest counted, and each
 * message escaped by `repoText`, since it quotes page and source names verbatim. Paths and
 * `detail.values` stay exact: they are data a caller passes back, not prose.
 */
function shownPage(page, keep = WIKI_PAGE_PROBLEM_LIMIT) {
  const shown = page.problems.slice(0, keep).map((entry) => ({ ...entry, message: repoText(entry.message, WIKI_MESSAGE_CHARS) }));
  return {
    path: page.path,
    ok: page.ok,
    blocking: page.blocking,
    problems: shown,
    ...(page.problems.length > keep ? { problemsOmitted: page.problems.length - keep } : {}),
  };
}

/**
 * The last resort for a page whose single first problem is larger than a reply: its
 * repository text (a list of shared source paths can run to megabytes) is cut, with
 * the cut counted, so a walk always moves forward.
 */
function cutPageToOneProblem(page) {
  const [first] = page.problems;
  const cut = { code: first.code, message: repoText(first.message, 1000) };
  if (first.line !== undefined) cut.line = first.line;
  if (first.detail !== undefined) {
    cut.detail = { key: first.detail.key };
    if (first.detail.values) {
      cut.detail.values = Object.fromEntries(Object.entries(first.detail.values)
        .map(([key, value]) => [key, repoText(value, 200)]));
    }
  }
  return { ...shownPage(page, 1), problems: [cut] };
}

function judgeWikiPages(paths) {
  // Every raw source in the folder, so a citation naming a file nobody has is reported
  // rather than trusted. Listing only — no source is opened here or anywhere below.
  // One Set for the whole folder: handed an array, every page would copy it.
  const knownSources = new Set(listVaultSourcePaths());
  return judgeLoadedWikiPages(loadVaultDocs(VAULT_ROOT), knownSources, paths);
}

const isWikiAdvisoryCode = (code) => WIKI_ADVISORY_CODES.includes(code);

/**
 * One page of failing wiki pages, in path order. OK pages are counted, never listed;
 * each listed page says whether it is `blocking`, and the summary samples blocking pages
 * first. The walk goes by path alone because a page's own state cannot move it: a repair
 * elsewhere (a deleted page leaving another orphaned) changes blocking status, never a
 * path. `nextCall` resumes after the last page shown (`afterPath`), so every page that
 * fails for the whole walk is listed once; a page renamed during the walk appears under
 * its new name only if that sorts after the cursor. Each page shows at most 20 problems.
 * A page left at the default `limit` stops before the whole reply would pass 128 KiB,
 * measured as the bytes `ok()` sends, and always holds at least one page, cut if a
 * single page is larger than that.
 */
function pageWikiValidation(judged, { offset, cursor = null, limit, textBudget = null, callerArguments = {} }) {
  // `judged` is in path order already.
  const failing = judged.filter((page) => !page.ok);
  const blockingList = failing.filter((page) => page.blocking);
  const blockingPages = blockingList.length;
  const blockingFirst = [...blockingList, ...failing.filter((page) => !page.blocking)];
  const byCodeMap = new Map();
  for (const page of blockingFirst) {
    // `codes` are distinct, so each page counts once under each of its codes.
    for (const code of page.codes) {
      let row = byCodeMap.get(code);
      if (!row) {
        row = { severity: isWikiAdvisoryCode(code) ? 'warning' : 'error', count: 0, files: [] };
        byCodeMap.set(code, row);
      }
      row.count += 1;
      if (row.files.length < BY_CODE_FILE_SAMPLE) row.files.push(page.path);
    }
  }
  const byCode = Object.fromEntries([...byCodeMap.keys()].sort().map((code) => {
    const row = byCodeMap.get(code);
    return [code, {
      severity: row.severity,
      count: row.count,
      files: row.files,
      ...(row.count > row.files.length ? { filesOmitted: row.count - row.files.length } : {}),
    }];
  }));

  const total = failing.length;
  let start = Math.min(offset, total);
  if (cursor !== null) {
    start = failing.findIndex((page) => page.path > cursor);
    if (start < 0) start = total;
  }
  const window = failing.slice(start, start + limit);
  const slice = window.map((page) => shownPage(page));
  const build = (count, pages = slice.slice(0, count)) => {
    const end = start + count;
    const nextOffset = end < total ? end : null;
    // A next page exists only after a page shown (`limit` ≥ 1), so `window[count - 1]` is set.
    const nextArguments = nextOffset === null ? null : { afterPath: window[count - 1].path, ...callerArguments };
    const stoppedForSize = count < slice.length || pages[0] !== slice[0];
    // Prose only: no page name is spliced in, so nothing a file is called can shape it.
    const hint = (count > 0
      ? `Failing pages ${start + 1}-${end} of ${total}, by path`
      : `No failing pages from position ${start}; the folder has ${total}`)
      + (stoppedForSize ? '; the reply stopped short to stay within 128 KiB' : '')
      + (nextArguments
        ? '. Call nextCall.arguments next: it resumes after the last page shown, so every page failing for the whole walk is listed once. A page renamed during the walk appears under its new path only if that path sorts after the last page shown; run the walk again to be complete. The folder is clean only when failingCount is 0.'
        : '.');
    return {
      pageCount: judged.length,
      failingCount: total,
      pagination: { offset: start, limit, total, returned: count, hasMore: nextOffset !== null, nextOffset },
      ...(nextArguments ? { nextCall: { tool: 'validate_wiki', arguments: nextArguments } } : {}),
      ...(start > 0 || nextOffset !== null ? { pagesHint: repoText(hint, 1000) } : {}),
      summary: { blockingPages, advisoryOnlyPages: total - blockingPages, byCode },
      pages,
    };
  };
  if (textBudget === null || slice.length === 0) return build(slice.length);
  const fitsBudget = (reply) => okResponseBytes(reply) <= textBudget;
  if (fitsBudget(build(slice.length))) return build(slice.length);
  // The reply grows with every page it keeps, so the largest count that fits is
  // found by bisection: O(log limit) serializations of at most one page of text.
  let fits = 0;
  let over = slice.length;
  while (over - fits > 1) {
    const middle = Math.floor((fits + over) / 2);
    if (fitsBudget(build(middle))) fits = middle;
    else over = middle;
  }
  if (fits > 0) return build(fits);
  // Even one page is too large: keep as many of its problems as fit, else cut its first.
  const first = window[0];
  let kept = 0;
  let tooMany = Math.min(first.problems.length, WIKI_PAGE_PROBLEM_LIMIT) + 1;
  while (tooMany - kept > 1) {
    const middle = Math.floor((kept + tooMany) / 2);
    if (fitsBudget(build(1, [shownPage(first, middle)]))) kept = middle;
    else tooMany = middle;
  }
  return build(1, [kept > 0 ? shownPage(first, kept) : cutPageToOneProblem(first)]);
}

const VALIDATION_PAGE_LIMIT = 100;
const WIKI_VALIDATION_PAGE_TEXT_BYTES = 128 * 1024;
/** A host stops forwarding a tool answer near 56,000 characters; 43,935 was delivered. */
const VALIDATION_PAGE_TEXT_BYTES = 40_000;
const BRIEF_PROBLEM_LIMIT = 20;
const BY_CODE_FILE_SAMPLE = 20;

function validateVaultTool({ repoRoot, offset, limit } = {}, loadedDocs = null) {
  requireOptionalNonNegativeInteger(offset, 'offset');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  return pageVaultValidation(validateVaultReport({ repoRoot }, loadedDocs), {
    offset: offset ?? 0,
    limit: limit ?? VALIDATION_PAGE_LIMIT,
    textBudget: limit === undefined ? VALIDATION_PAGE_TEXT_BYTES : null,
    callerArguments: { ...(repoRoot === undefined ? {} : { repoRoot }), ...(limit === undefined ? {} : { limit }) },
  });
}

const PAGE_HINT_AND_ENVELOPE_BYTES = 4096;
const PROBLEM_ROW_INDENT_BYTES = 4;

const prettyBytes = (value) => Buffer.byteLength(JSON.stringify(value, null, 2), 'utf8');

function problemRowBytes(row) {
  const text = JSON.stringify(row, null, 2);
  return Buffer.byteLength(text, 'utf8') + PROBLEM_ROW_INDENT_BYTES * text.split('\n').length + ',\n'.length;
}

function pageVaultValidation(report, { offset, limit, textBudget = null, callerArguments = {} }) {
  const total = report.problems.length;
  const start = Math.min(offset, total);
  const byCode = Object.fromEntries(Object.entries(report.summary.byCode).map(([code, entry]) => [code, {
    severity: entry.severity,
    count: entry.count,
    files: entry.files.slice(0, BY_CODE_FILE_SAMPLE),
    ...(entry.files.length > BY_CODE_FILE_SAMPLE ? { filesOmitted: entry.files.length - BY_CODE_FILE_SAMPLE } : {}),
  }]));
  const frame = { ...report, problems: [], summary: { ...report.summary, byCode } };
  let problems = foldRepeatedGuidance(report.problems.slice(start, start + limit));
  let stoppedForSize = false;
  if (textBudget !== null) {
    let room = textBudget - prettyBytes(frame) - PAGE_HINT_AND_ENVELOPE_BYTES;
    let fitting = 0;
    for (const row of problems) {
      const rowBytes = problemRowBytes(row);
      if (fitting > 0 && rowBytes > room) break;
      room -= rowBytes;
      fitting += 1;
    }
    stoppedForSize = fitting < problems.length;
    problems = problems.slice(0, fitting);
  }
  const end = start + problems.length;
  const nextOffset = end < total ? end : null;
  const nextArguments = { offset: nextOffset, ...callerArguments };
  return {
    problemsPagination: { offset: start, limit, total, returned: problems.length, hasMore: nextOffset !== null, nextOffset },
    ...(start > 0 || nextOffset !== null
      ? {
          problemsHint:
            (problems.length > 0
              ? `Problem files ${start + 1}-${end} of ${total}, files with errors first and then by slug`
              : `No problem files from offset ${start}; the vault has ${total}`)
            + (stoppedForSize ? `; the page stopped before ${limit} files to stay within 40,000 characters` : '')
            + (nextOffset !== null ? `. The next page: validate_vault(${JSON.stringify(nextArguments)}).` : '.'),
        }
      : {}),
    ...frame,
    problems,
  };
}

function briefVaultValidation(report) {
  const page = pageVaultValidation(report, { offset: 0, limit: BRIEF_PROBLEM_LIMIT });
  const { hasMore, nextOffset } = page.problemsPagination;
  return {
    ...(hasMore ? { nextCall: { tool: 'validate_vault', arguments: { offset: nextOffset } } } : {}),
    ...page,
  };
}

function validateVaultReport({ repoRoot } = {}, loadedDocs = null) {
  requireOptionalNonBlankString(repoRoot, 'repoRoot');
  // A directory walk lists files in whatever order the runtime returns them.
  const docs = [...(loadedDocs ?? loadVaultDocs(VAULT_ROOT))].sort((left, right) => (left.slug < right.slug ? -1 : 1));
  const docIssues = new Map();
  for (const doc of docs) {
    // The slug is passed because `slug-outside-kind-folder` is a fact about
    // where the file sits, and only this caller knows it.
    const result = validateLoadedVaultDocument(doc, { slug: doc.slug });
    docIssues.set(doc.slug, result.issues || []);
  }
  for (const [slug, danglingIssues] of groupDanglingIssuesBySlug(docs)) {
    const issues = docIssues.get(slug) || [];
    issues.push(...danglingIssues);
    docIssues.set(slug, issues);
  }
  for (const { slug, issue } of findFolderOnlyEvidenceIssues(docs, repoRoot)) {
    const issues = docIssues.get(slug) || [];
    issues.push(issue);
    docIssues.set(slug, issues);
  }
  for (const { slug, issue } of findDependencyWitnessIssues(docs, repoRoot)) {
    const issues = docIssues.get(slug) || [];
    issues.push(issue);
    docIssues.set(slug, issues);
  }
  for (const { slug, issue } of findStarterExampleIssues(docs)) {
    const issues = docIssues.get(slug) || [];
    issues.push(issue);
    docIssues.set(slug, issues);
  }
  const depthRoot = repoRoot ? assertScanRootAllowed(repoRoot, 'repoRoot') : (REPO_ROOT_IS_GROUNDED ? REPO_ROOT : null);
  const repo = repositorySurvey(depthRoot, VAULT_ROOT);
  const reads = depthRoot ? sessionReads(depthRoot) : null;
  for (const finding of buildDepthFindings(docs, { repoRoot: depthRoot, collection: repo?.collection ?? null, reads })) {
    const issues = docIssues.get(finding.slug) || [];
    issues.push({ code: finding.code, severity: 'warning', message: finding.message });
    docIssues.set(finding.slug, issues);
  }
  const coverage = measureBuildDepth(docs, repo, reads).line;
  // A single-file check cannot see a parent; this pass holds the whole vault, so it
  // never tells a node that has a parent that it has none.
  suppressParentedExpectedFieldIssues(docIssues, docs);
  suppressLibraryKindIssues(docIssues);
  const rawSourceSlugs = [];
  for (const { path, issue } of rawSourceKindIssues(VAULT_ROOT)) {
    const slug = path.replace(/\.md$/, '');
    docIssues.set(slug, [issue]);
    rawSourceSlugs.push(slug);
  }
  const problems = [];
  let errorFiles = 0;
  let warningFiles = 0;
  // byCode aggregation: { code → { severity, count, files: Set<slug> } }
  const byCodeMap = new Map();
  const problemSlugsInPageOrder = [...docs.map((doc) => doc.slug), ...rawSourceSlugs]
    .filter((slug) => (docIssues.get(slug) || []).length > 0)
    .map((slug) => ({ slug, hasError: docIssues.get(slug).some((issue) => issue.severity === 'error') }))
    .sort((left, right) => Number(right.hasError) - Number(left.hasError) || left.slug.localeCompare(right.slug))
    .map(({ slug }) => slug);
  for (const slug of problemSlugsInPageOrder) {
    const issues = docIssues.get(slug);
    let hasError = false;
    const seenInDoc = new Set();
    for (const issue of issues) {
      if (issue.severity === 'error') hasError = true;
      if (!byCodeMap.has(issue.code)) {
        byCodeMap.set(issue.code, {
          severity: issue.severity,
          count: 0,
          files: new Set(),
        });
      }
      const entry = byCodeMap.get(issue.code);
      if (issue.severity === 'error') entry.severity = 'error';
      // count = file count (per-file), not per-issue
      if (!seenInDoc.has(issue.code)) {
        seenInDoc.add(issue.code);
        entry.count += 1;
        entry.files.add(slug);
      }
    }
    if (hasError) errorFiles += 1;
    else warningFiles += 1;
    problems.push({
      slug,
      issues: issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        message: i.message,
      })),
    });
  }
  const byCode = {};
  for (const [code, entry] of byCodeMap.entries()) {
    byCode[code] = {
      severity: entry.severity,
      count: entry.count,
      files: [...entry.files],
    };
  }
  // Vault-to-code path drift: `path:`/`elements:` entries missing on disk, resolved
  // against the active repository root. The agent fixes them with patch_concept.
  const driftRoot = repoRoot ? assertScanRootAllowed(repoRoot, 'repoRoot') : REPO_ROOT;
  // Never measure against an ungrounded repo root: not looking is not zero, so it
  // reports `checked: false` and how to make it look.
  const driftGrounded = Boolean(repoRoot) || REPO_ROOT_IS_GROUNDED;
  if (!driftGrounded) {
    return {
      scanned: docs.length,
      ...(coverage ? { coverage } : {}),
      problems,
      summary: { problemFiles: problems.length, errorFiles, warningFiles, byCode },
      summaryFreshness: buildSummaryFreshness(docs),
      evidenceDrift: buildEvidenceDrift(docs, null, VAULT_ROOT),
      pathDrift: {
        repoRoot: driftRoot,
        checked: false,
        nodesScanned: 0,
        pathsChecked: 0,
        drifts: [],
        hint:
          'Source paths were NOT checked. This vault is not inside a git repository and no repoRoot was given, so the repository it describes is unknown — anything measured against the process working directory would be noise, not drift. Pass repoRoot to validate_vault (or set OATLAS_REPO_ROOT) to check implementation paths.',
      },
    };
  }
  const drift = detectVaultPathDrift({
    docs,
    repoRoot: driftRoot,
    fileExists: existsSync,
  });
  // A drifted path is usually a move: when exactly one repo file shares its basename,
  // add `suggestedPath`. Walk the repo only when there is drift; ambiguous names
  // never guess.
  let drifts = drift.drifts;
  let suggestedCount = 0;
  if (drifts.length > 0) {
    try {
      const repoFiles = listSourceFiles(driftRoot).map((abs) => relative(driftRoot, abs));
      drifts = suggestPathReconciliations(drift.drifts, repoFiles);
      suggestedCount = drifts.filter((d) => typeof d.suggestedPath === 'string').length;
    } catch {
      // walk failure (perms / not a dir) — keep plain drifts, never break validate.
      drifts = drift.drifts;
    }
  }
  return {
    scanned: docs.length,
    ...(coverage ? { coverage } : {}),
    problems,
    summary: {
      problemFiles: problems.length,
      errorFiles,
      warningFiles,
      byCode,
    },
    summaryFreshness: buildSummaryFreshness(docs),
    evidenceDrift: buildEvidenceDrift(docs, driftRoot, VAULT_ROOT),
    pathDrift: {
      repoRoot: drift.repoRoot,
      checked: true,
      nodesScanned: drift.nodesScanned,
      pathsChecked: drift.pathsChecked,
      drifts,
      hint:
        drift.drifts.length > 0
          ? `${drift.drifts.length} frontmatter path(s) point at files missing under repoRoot — fix the .md (patch_concept) or remove the stale entry.${suggestedCount > 0 ? ` ${suggestedCount} have a same-named file elsewhere in the repo (see suggestedPath — likely a move).` : ''} If repoRoot is wrong, re-run validate_vault with the correct repoRoot.`
          : drift.pathsChecked > 0
            ? `all ${drift.pathsChecked} frontmatter source path(s) exist under repoRoot (no code drift).`
            : 'no frontmatter path:/elements: source paths to check.',
    },
  };
}

/**
 * Evidence that names a folder rather than one file. Whole-vault because the answer
 * needs a grounded repository root, which a per-document validator lacks
 * (`REPO_ROOT_IS_GROUNDED`); silent when the root is not grounded.
 */
function findFolderOnlyEvidenceIssues(docs, repoRoot) {
  const grounded = Boolean(repoRoot) || REPO_ROOT_IS_GROUNDED;
  if (!grounded) return [];
  const root = repoRoot ? assertScanRootAllowed(repoRoot, 'repoRoot') : REPO_ROOT;
  const issues = [];
  for (const doc of docs) {
    const kind = typeof doc?.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
    if (!kind) continue;
    const finding = folderOnlyEvidenceFinding({
      kind,
      slug: doc.slug,
      frontmatter: doc.frontmatter,
      repoRoot: root,
    });
    if (!finding) continue;
    issues.push({
      slug: doc.slug,
      issue: { code: finding.code, severity: 'warning', message: finding.message },
    });
  }
  return issues;
}

/**
 * Which implementation file does each node cite? Full slug first, then the tail
 * every author actually types — and only when that tail is unambiguous, because
 * a guess here becomes an accusation about the wrong file.
 */
function evidencePathIndex(docs) {
  const bySlug = new Map();
  const tailCounts = new Map();
  for (const doc of docs) {
    const path = typeof doc?.frontmatter?.path === 'string' ? doc.frontmatter.path.trim() : '';
    if (!path) continue;
    bySlug.set(doc.slug, path);
    const tail = doc.slug.split('/').pop();
    if (tail && tail !== doc.slug) tailCounts.set(tail, (tailCounts.get(tail) ?? 0) + 1);
  }
  const byTail = new Map();
  for (const [slug, path] of bySlug) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && tailCounts.get(tail) === 1) byTail.set(tail, path);
  }
  return (ref) => bySlug.get(ref) ?? byTail.get(ref) ?? null;
}

/**
 * Declared dependencies the citing file never mentions: the write door's check,
 * applied to every edge. It needs a grounded repository root and what the other end
 * cites, so it is whole-vault and silent when the root is not grounded.
 */
function findDependencyWitnessIssues(docs, repoRoot) {
  const grounded = Boolean(repoRoot) || REPO_ROOT_IS_GROUNDED;
  if (!grounded) return [];
  const root = repoRoot ? assertScanRootAllowed(repoRoot, 'repoRoot') : REPO_ROOT;
  const resolveTargetPath = evidencePathIndex(docs);
  const moduleNamesByPath = new Map();
  const issues = [];
  for (const doc of docs) {
    const kind = typeof doc?.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
    if (!kind) continue;
    for (const finding of dependencyWitnessFinding({
      slug: doc.slug,
      frontmatter: doc.frontmatter,
      repoRoot: root,
      resolveTargetPath,
      moduleNamesByPath,
    })) {
      issues.push({
        slug: doc.slug,
        issue: { code: finding.code, severity: 'warning', message: finding.message },
      });
    }
  }
  return issues;
}

/**
 * Starter examples the vault has outgrown. Needs no repository root, so it runs on
 * every call; whole-vault because the question is whether a starter is still the
 * only node of its kind.
 */
function findStarterExampleIssues(docs) {
  // `body` is read only for a starter the vault has outgrown, not for every document.
  return starterExampleFindings(
    docs.map((doc) => ({
      slug: doc.slug,
      kind: doc?.frontmatter?.kind,
      title: doc?.frontmatter?.title,
      get body() {
        return doc?.body;
      },
    })),
  ).map((finding) => ({
    slug: finding.slug,
    issue: { code: finding.code, severity: 'warning', message: finding.message },
  }));
}

const EVIDENCE_ROW_LIMIT = 50;
const ZERO_EVIDENCE_COUNTS = Object.freeze({ current: 0, stale: 0, missing: 0, unknown: 0, folderOnly: 0 });

/**
 * Does the meaning still stand on the code it cites? One Git walk dates every cited
 * `path:` and every concept document; `resolveEvidenceStates` says per concept whether the
 * code moved after the meaning was last touched. `checked: false` names why nothing was
 * measured — it never means nothing moved.
 */
function buildEvidenceDrift(docs, repoRoot, vaultRoot) {
  const concepts = evidenceConceptsFromDocs(docs);
  const repoPaths = [...new Set(concepts.flatMap((concept) => concept.evidencePaths))];
  const vaultPaths = concepts.map((concept) => concept.docPath);
  const unmeasured = (reason, hint) => ({
    checked: false,
    reason,
    counts: { ...ZERO_EVIDENCE_COUNTS },
    stale: [],
    missing: [],
    folderOnly: [],
    hint,
  });
  if (!repoRoot) {
    return unmeasured('no-repo-root', 'Evidence was NOT dated: no repository root. Pass repoRoot to validate_vault.');
  }
  if (repoPaths.length === 0) {
    return unmeasured('no-evidence-paths', 'No concept cites an implementation path, so there is nothing to date against Git.');
  }
  let walk = null;
  try {
    walk = collectPathLastChanges({ repoRoot, vaultRoot, repoPaths, vaultPaths });
  } catch {
    walk = null;
  }
  if (!walk?.ok) {
    return unmeasured(
      walk?.reason ?? 'git-unavailable',
      'Evidence was NOT dated: the vault is not inside a Git repository this process can read, so no concept is called current here.',
    );
  }
  const states = resolveEvidenceStates(concepts, walk.changes);
  const folderOnly = states.unknown.filter((row) => row.reason === 'folder-only').length;
  const counts = {
    current: states.current.length,
    stale: states.stale.length,
    missing: states.missing.length,
    unknown: states.unknown.length,
    folderOnly,
  };
  const hint =
    counts.stale + counts.missing > 0
      ? `${counts.stale} concept(s) have a cited file that changed after their document was last touched and ${counts.missing} cite a path that is gone: read those files before trusting the recorded meaning, then update the document (patch_concept) or the path. ${counts.folderOnly} more cite only a folder that changed underneath (unknown, not stale): name a file in path: to make them checkable.`
      : counts.current > 0
        ? `all ${counts.current} dated concept(s) still stand on unchanged code; ${counts.unknown} could not be dated (no evidence path, or no commit in the walk window).`
        : `no concept could be dated (${counts.unknown} unknown): commits may be missing or older than the walk window.`;
  return {
    checked: true,
    repoRoot: walk.repoRoot,
    counts,
    stale: states.stale.slice(0, EVIDENCE_ROW_LIMIT),
    missing: states.missing.slice(0, EVIDENCE_ROW_LIMIT),
    folderOnly: states.unknown.filter((row) => row.reason === 'folder-only').slice(0, EVIDENCE_ROW_LIMIT).map((row) => ({ slug: row.slug, kind: row.kind, docChangedAt: row.docChangedAt ?? null, folders: row.folders ?? [] })),
    hint,
  };
}

export {
  briefVaultValidation,
  validateWikiTool,
  validateVaultReport,
  validateVaultTool,
};
