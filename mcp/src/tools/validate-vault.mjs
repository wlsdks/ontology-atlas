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
import { requireOptionalNonBlankString } from '../server/validate.mjs';
import {
  suppressLibraryKindIssues,
  suppressParentedExpectedFieldIssues,
  validateVaultDocument,
} from '../validate.mjs';
import { loadVaultDocs } from '../vault.mjs';
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
 * Judge the wiki pages against their own contract.
 *
 * `validate_vault` cannot answer this and should not try: a wiki page carries no `kind:`
 * **by contract**, so to that validator it is a document with nothing to check, and
 * `suppressLibraryKindIssues` deliberately drops the one issue it would raise. Whether a
 * page fits the shape every writer was handed is a separate question with its own codes,
 * and this tool is where an agent asks it — after writing a page, and before claiming a
 * compile finished.
 *
 * The output is the shape `ontology-atlas wiki-validate --json` prints, so a person
 * reading a terminal and an agent reading a tool result are reading one report.
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

function validateVaultTool({ repoRoot } = {}) {
  requireOptionalNonBlankString(repoRoot, 'repoRoot');
  const docs = loadVaultDocs(VAULT_ROOT);
  const docIssues = new Map();
  for (const doc of docs) {
    const result = validateVaultDocument(doc.raw || '');
    docIssues.set(doc.slug, result.issues || []);
  }
  for (const [slug, danglingIssues] of groupDanglingIssuesBySlug(docs)) {
    const issues = docIssues.get(slug) || [];
    issues.push(...danglingIssues);
    docIssues.set(slug, issues);
  }
  /*
   * Never tell a node that already has a parent that it has none (2026-08-11).
   * A single-file check cannot know; this one holds the whole vault.
   */
  suppressParentedExpectedFieldIssues(docIssues, docs);
  suppressLibraryKindIssues(docIssues);
  const problems = [];
  let errorFiles = 0;
  let warningFiles = 0;
  // byCode aggregation: { code → { severity, count, files: Set<slug> } }
  const byCodeMap = new Map();
  for (const doc of docs) {
    const issues = docIssues.get(doc.slug) || [];
    if (issues.length === 0) continue;
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
  // Atlas roadmap Track A #2 — vault→code path drift: frontmatter path:/elements:
  // entries that no longer exist on disk. Read-only; resolves against repoRoot
  // (default: active resolved repository root). Surfaced here because it is a vault-health signal the
  // agent already runs validate_vault for at first-contact. The agent fixes via
  // patch_concept (correct the path) or by removing the stale entry.
  const driftRoot = repoRoot ? assertScanRootAllowed(repoRoot, 'repoRoot') : REPO_ROOT;
  // **Do not measure against an ungrounded repo root.** Measuring would flag every
  // file missing from a directory unrelated to the vault as "drift", turning a
  // healthy vault into `needs_attention`. Not looking is not zero — it is *not
  // looked at* — so it reports `checked: false` and how to make it look.
  const driftGrounded = Boolean(repoRoot) || REPO_ROOT_IS_GROUNDED;
  if (!driftGrounded) {
    return {
      scanned: docs.length,
      problems,
      summary: { problemFiles: problems.length, errorFiles, warningFiles, byCode },
      summaryFreshness: buildSummaryFreshness(docs),
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
  // Atlas roadmap Track A #3 — reconcile suggestion. A drifted path is usually a
  // MOVE; when exactly one existing repo source file shares the missing file's
  // basename, annotate the drift with `suggestedPath` so the fix is "did you
  // mean X?". Only walk the repo when there IS drift (zero cost on a clean vault),
  // and only suggest on a unique basename match (ambiguous names never guess).
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

export {
  validateWikiTool,
  validateVaultTool,
};
