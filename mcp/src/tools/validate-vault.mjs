/**
 * The two validators an agent calls before trusting the vault: `validate_vault`
 * (frontmatter, dangling graph refs, duplicate slugs and uids) and
 * `validate_wiki`.
 */

import {
  detectVaultPathDrift,
  suggestPathReconciliations,
} from '../detect-drift.mjs';
import { listSourceFiles } from '../infer-imports.mjs';
import {
  REPO_ROOT,
  REPO_ROOT_IS_GROUNDED,
  VAULT_ROOT,
  assertScanRootAllowed,
} from '../server/runtime.mjs';
import { RESPONSE_TEXT_BUDGET_BYTES } from '../server/rpc.mjs';
import {
  requireOptionalNonBlankString,
  requireOptionalNonNegativeInteger,
  requireOptionalPositiveInteger,
} from '../server/validate.mjs';
import {
  suppressLibraryKindIssues,
  suppressParentedExpectedFieldIssues,
  validateVaultDocument,
} from '../validate.mjs';
import {
  createDependencyWitnessReads,
  dependencyWitnessFinding,
  folderOnlyEvidenceFinding,
  starterExampleFindings,
} from '../meaning-findings.mjs';
import { loadVaultDocs } from '../vault.mjs';
import { collectPathLastChanges } from '../git-tools.mjs';
import { evidenceConceptsFromDocs, resolveEvidenceStates } from '../evidence-drift.mjs';
import {
  WIKI_DIR,
  isWikiFurnitureSlug,
  validateWikiFolder,
  validateWikiPage,
} from '../wiki-schema.mjs';
import {
  buildSummaryFreshness,
  groupDanglingIssuesBySlug,
  listVaultSourcePaths,
} from './vault-nodes.mjs';
import { existsSync } from 'node:fs';
import { relative } from 'node:path';

/**
 * Judges wiki pages against their own contract, which `validate_vault` cannot: a
 * wiki page carries no `kind:` by contract. The output is the shape
 * `ontology-atlas wiki-validate --json` prints.
 */
function validateWikiTool({ paths } = {}) {
  if (paths !== undefined && !Array.isArray(paths)) {
    throw new Error('validate_wiki: `paths` must be an array of vault-relative page paths.');
  }
  const wikiPrefix = `${WIKI_DIR}/`;
  // Every raw source in the folder, so a citation naming a file nobody has is reported
  // rather than trusted. Listing only — no source is opened here or anywhere below.
  const knownSources = listVaultSourcePaths();
  const docs = loadVaultDocs(VAULT_ROOT);
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));

  const requested =
    paths === undefined
      ? docs
          .map((doc) => `${doc.slug}.md`)
          .filter((path) => path.startsWith(wikiPrefix) && !isWikiFurnitureSlug(path))
          .sort()
      : paths.map((path) => String(path));

  const pages = [];
  for (const path of requested) {
    if (!path.startsWith(wikiPrefix)) {
      // Named, not skipped: an agent that asked about the wrong file must learn that,
      // rather than reading an empty problem list as a pass.
      pages.push({
        path,
        ok: false,
        problems: [
          {
            code: 'not-a-wiki-page',
            message: `\`${path}\` is not under \`${wikiPrefix}\`, so the wiki page contract does not apply to it.`,
          },
        ],
      });
      continue;
    }
    const doc = bySlug.get(path.replace(/\.md$/, ''));
    if (!doc) {
      pages.push({
        path,
        ok: false,
        problems: [{ code: 'page-missing', message: `\`${path}\` is not in this folder.` }],
      });
      continue;
    }
    const { ok, problems } = validateWikiPage(doc.raw || '', { knownSources });
    pages.push({ path, ok, problems });
  }

  // The folder half is judged over every page in the folder, whatever `paths` narrowed
  // the report to: whether somebody links to a page is a fact about the other pages,
  // and a page asked about alone would otherwise always read as an orphan.
  const folderPages = docs
    .filter((doc) => doc.slug.startsWith(wikiPrefix) && !isWikiFurnitureSlug(doc.slug))
    .map((doc) => ({ path: `${doc.slug}.md`, raw: doc.raw || '' }));
  const folderByPath = new Map(validateWikiFolder(folderPages).map((entry) => [entry.path, entry.problems]));
  for (const page of pages) {
    const extra = folderByPath.get(page.path) ?? [];
    if (extra.length > 0) {
      page.problems.push(...extra);
      page.ok = false;
    }
  }

  return {
    pageCount: pages.length,
    failingCount: pages.filter((page) => !page.ok).length,
    pages,
  };
}

/** Problem files one `validate_vault` page returns unless `limit` says otherwise. */
const VALIDATION_PAGE_LIMIT = 100;
/** Problem files a brief (`health`, `workspace_brief`, `agent_brief`) carries. */
const BRIEF_PROBLEM_LIMIT = 20;
/** Files each `summary.byCode` entry names; its `count` stays the full number. */
const BY_CODE_FILE_SAMPLE = 20;
/** Path drifts one `validate_vault` answer lists; `driftsOmitted` counts the rest. */
const VALIDATION_DRIFT_LIMIT = 100;
/** Path drifts a brief carries. */
const BRIEF_DRIFT_LIMIT = 20;

/**
 * `validate_vault`: one page of the problem files (`offset`, `limit`, default 100)
 * with the whole-vault counts. A 12k-node vault's full report was 30 MB, and the
 * three briefs embedded it whole.
 */
function validateVaultTool({ repoRoot, offset, limit } = {}, loadedDocs = null) {
  requireOptionalNonNegativeInteger(offset, 'offset');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  return pageVaultValidation(validateVaultReport({ repoRoot }, loadedDocs), {
    offset: offset ?? 0,
    limit: limit ?? VALIDATION_PAGE_LIMIT,
    // A default page fits the response budget; an explicit `limit` is delivered as asked.
    textBudget: limit === undefined ? RESPONSE_TEXT_BUDGET_BYTES : null,
  });
}

/** Text a page keeps free for its hint and the response envelope. */
const PAGE_TEXT_RESERVE_BYTES = 4096;

const prettyBytes = (value) => Buffer.byteLength(JSON.stringify(value, null, 2), 'utf8');

/**
 * One page of a report: problem files from `offset`, errors first and then by
 * slug, so pages are stable while the vault is; `summary` keeps the whole-vault
 * counts and names at most `BY_CODE_FILE_SAMPLE` files per code, and `pathDrift`
 * lists at most `driftLimit` drifts and counts the rest in `driftsOmitted`. With
 * a `textBudget` the page also stops before its text would pass it (a problem
 * file is about 2 KB, so 100 of them could not fit), and `nextOffset` resumes there.
 */
function pageVaultValidation(report, { offset, limit, textBudget = null, driftLimit = VALIDATION_DRIFT_LIMIT }) {
  const total = report.problems.length;
  const start = Math.min(offset, total);
  const byCode = Object.fromEntries(Object.entries(report.summary.byCode).map(([code, entry]) => [code, {
    severity: entry.severity,
    count: entry.count,
    files: entry.files.slice(0, BY_CODE_FILE_SAMPLE),
    ...(entry.files.length > BY_CODE_FILE_SAMPLE ? { filesOmitted: entry.files.length - BY_CODE_FILE_SAMPLE } : {}),
  }]));
  const drifts = report.pathDrift?.drifts ?? [];
  const frame = {
    ...report,
    problems: [],
    problemsPagination: { offset: start, limit, total, returned: 0, hasMore: false, nextOffset: null },
    summary: { ...report.summary, byCode },
    ...(drifts.length > driftLimit
      ? { pathDrift: { ...report.pathDrift, drifts: drifts.slice(0, driftLimit), driftsOmitted: drifts.length - driftLimit } }
      : {}),
  };
  let problems = report.problems.slice(start, start + limit);
  let stoppedForSize = false;
  if (textBudget !== null) {
    let room = textBudget - prettyBytes(frame) - PAGE_TEXT_RESERVE_BYTES;
    let fitting = 0;
    for (const row of problems) {
      // Inside the answer every line of a row is indented four more spaces.
      const text = JSON.stringify(row, null, 2);
      const rowBytes = Buffer.byteLength(text, 'utf8') + 4 * (text.split('\n').length) + 2;
      if (fitting > 0 && rowBytes > room) break;
      room -= rowBytes;
      fitting += 1;
    }
    stoppedForSize = fitting < problems.length;
    problems = problems.slice(0, fitting);
  }
  const end = start + problems.length;
  const nextOffset = end < total ? end : null;
  return {
    ...frame,
    problems,
    problemsPagination: { offset: start, limit, total, returned: problems.length, hasMore: nextOffset !== null, nextOffset },
    ...(start > 0 || nextOffset !== null
      ? {
          problemsHint:
            (problems.length > 0
              ? `Problem files ${start + 1}-${end} of ${total}, files with errors first and then by slug`
              : `No problem files from offset ${start}; the vault has ${total}`)
            + (stoppedForSize ? `; the page stopped before ${limit} files to stay within the response size budget` : '')
            + (nextOffset !== null ? `. The next page: validate_vault({ offset: ${nextOffset} }).` : '.'),
        }
      : {}),
  };
}

/**
 * What a brief embeds: the whole-vault counts, the first problem files, the first
 * path drifts, and the `validate_vault` call that returns the rest.
 */
function briefVaultValidation(report) {
  const page = pageVaultValidation(report, { offset: 0, limit: BRIEF_PROBLEM_LIMIT, driftLimit: BRIEF_DRIFT_LIMIT });
  return {
    ...page,
    ...(page.problemsPagination.hasMore || page.pathDrift?.driftsOmitted > 0
      ? {
          nextCall: {
            tool: 'validate_vault',
            arguments: page.problemsPagination.hasMore ? { offset: page.problemsPagination.nextOffset } : {},
          },
        }
      : {}),
  };
}

/**
 * The whole report, every problem file included, for callers that judge the vault
 * (the briefs' checks, finalize, git_snapshot, index_project) rather than show it.
 */
function validateVaultReport({ repoRoot } = {}, loadedDocs = null) {
  requireOptionalNonBlankString(repoRoot, 'repoRoot');
  const docs = loadedDocs ?? loadVaultDocs(VAULT_ROOT);
  const docIssues = new Map();
  for (const doc of docs) {
    // The slug is passed because `slug-outside-kind-folder` is a fact about
    // where the file sits, and only this caller knows it. The loaded document
    // already holds the parse of these bytes.
    const result = validateVaultDocument(doc.raw || '', { slug: doc.slug, parsed: doc });
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
  // A single-file check cannot see a parent; this pass holds the whole vault, so it
  // never tells a node that has a parent that it has none.
  suppressParentedExpectedFieldIssues(docIssues, docs);
  suppressLibraryKindIssues(docIssues);
  const problems = [];
  let errorFiles = 0;
  let warningFiles = 0;
  // byCode aggregation: { code → { severity, count, files: Set<slug> } }
  const byCodeMap = new Map();
  // Files with an error first, then by slug: the order every page and brief shows.
  const problemDocs = docs
    .filter((doc) => (docIssues.get(doc.slug) || []).length > 0)
    .map((doc) => ({ doc, hasError: docIssues.get(doc.slug).some((issue) => issue.severity === 'error') }))
    .sort((left, right) => Number(right.hasError) - Number(left.hasError) || left.doc.slug.localeCompare(right.doc.slug))
    .map(({ doc }) => doc);
  for (const doc of problemDocs) {
    const issues = docIssues.get(doc.slug);
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
      // severity escalates if any issue of this code is error
      if (issue.severity === 'error') entry.severity = 'error';
      // count = file count (per-file), not per-issue
      if (!seenInDoc.has(issue.code)) {
        seenInDoc.add(issue.code);
        entry.count += 1;
        entry.files.add(doc.slug);
      }
    }
    if (hasError) errorFiles += 1;
    else warningFiles += 1;
    problems.push({
      slug: doc.slug,
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
  const reads = createDependencyWitnessReads();
  const issues = [];
  for (const doc of docs) {
    const kind = typeof doc?.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
    if (!kind) continue;
    for (const finding of dependencyWitnessFinding({
      slug: doc.slug,
      frontmatter: doc.frontmatter,
      repoRoot: root,
      resolveTargetPath,
      reads,
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
  return starterExampleFindings(
    docs.map((doc) => ({
      slug: doc.slug,
      kind: doc?.frontmatter?.kind,
      title: doc?.frontmatter?.title,
      body: doc?.body,
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
