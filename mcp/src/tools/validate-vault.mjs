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
import {
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

function validateVaultTool({ repoRoot } = {}, loadedDocs = null) {
  requireOptionalNonBlankString(repoRoot, 'repoRoot');
  const docs = loadedDocs ?? loadVaultDocs(VAULT_ROOT);
  const docIssues = new Map();
  for (const doc of docs) {
    // The slug is passed because `slug-outside-kind-folder` is a fact about
    // where the file sits, and only this caller knows it.
    const result = validateVaultDocument(doc.raw || '', { slug: doc.slug });
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
 * Evidence that names a folder rather than the one file to open.
 *
 * **Why it is here and not in `validateVaultDocument`.** The judgement asks the
 * filesystem whether one cited `path:` is a directory, and the answer only means
 * anything relative to a repository root. A per-document validator has neither,
 * so it would either guess a root — comparing this vault against whichever
 * directory the process started in, the exact mistake `REPO_ROOT_IS_GROUNDED`
 * exists to prevent — or say nothing. It says nothing, and this pass, which does
 * hold the root, answers instead. Merged per slug exactly like the dangling
 * references above, because both are whole-vault facts that no single file
 * reveals.
 *
 * Silent when the root is not grounded. Not looking is not the same as finding
 * nothing, and `pathDrift` already states which of the two happened.
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
 * Declared dependencies the citing file never mentions.
 *
 * The same judgement the write door makes, read at a different moment: the door
 * asks about the edge somebody just added, this asks about every edge in the
 * vault. It is here rather than in `validateVaultDocument` for the reason the
 * folder-only pass above states — it opens a file on disk, and a path only means
 * something against a repository root — with one more reason of its own: it has
 * to know what the node at the *other* end of the edge cites, which no single
 * document reveals.
 *
 * Silent when the root is not grounded. `pathDrift` already says which of "found
 * nothing" and "did not look" happened.
 */
function findDependencyWitnessIssues(docs, repoRoot) {
  const grounded = Boolean(repoRoot) || REPO_ROOT_IS_GROUNDED;
  if (!grounded) return [];
  const root = repoRoot ? assertScanRootAllowed(repoRoot, 'repoRoot') : REPO_ROOT;
  const resolveTargetPath = evidencePathIndex(docs);
  const issues = [];
  for (const doc of docs) {
    const kind = typeof doc?.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
    if (!kind) continue;
    for (const finding of dependencyWitnessFinding({
      slug: doc.slug,
      frontmatter: doc.frontmatter,
      repoRoot: root,
      resolveTargetPath,
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
 * Starter examples the vault has outgrown.
 *
 * Unlike the two passes above this one needs **no repository root and no
 * filesystem** — a slug, a kind and a title decide it — so it never goes silent,
 * and it runs on every call. It is still a whole-vault pass rather than a
 * per-document check for one reason: the question is not "is this a starter" but
 * "is this starter still the only node of its kind", and one document cannot see
 * the other.
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
  validateWikiTool,
  validateVaultTool,
};
