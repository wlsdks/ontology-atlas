import {
  buildDepthFindings,
  dependencyWitnessFinding,
  folderOnlyEvidenceFinding,
  repositorySurvey,
  starterExampleFindings,
} from '../../../lib/mcp-bridge/validate.mjs';
import {
  findDanglingGraphReferenceIssues,
  findDuplicateSlugIssues,
  findDuplicateUidIssues,
} from './graph-reference-checks.mjs';

function attachVaultIssues(reportByFile, findings) {
  for (const { file, issue } of findings) {
    const report = reportByFile.get(file);
    if (!report) continue;
    report.issues.push(issue);
    report.ok = !report.issues.some((i) => i.severity === 'error');
  }
}

/**
 * Evidence naming a folder instead of one file. Needs a repository root (`OATLAS_REPO_ROOT`, as the MCP
 * server reads it); unset, it stays silent (not looked at), hence a vault-scope code in `--list-codes`.
 */
function findFolderOnlyEvidenceIssues(entries) {
  const repoRoot = typeof process.env.OATLAS_REPO_ROOT === 'string'
    ? process.env.OATLAS_REPO_ROOT.trim()
    : '';
  if (!repoRoot) return [];
  const issues = [];
  for (const entry of entries) {
    const kind = typeof entry.frontmatter?.kind === 'string' ? entry.frontmatter.kind.trim() : '';
    if (!kind) continue;
    const finding = folderOnlyEvidenceFinding({
      kind,
      slug: entry.slug,
      frontmatter: entry.frontmatter,
      repoRoot,
    });
    if (!finding) continue;
    issues.push({
      file: entry.file,
      issue: { code: finding.code, severity: 'warning', message: finding.message },
    });
  }
  return issues;
}

/**
 * The build-depth warnings `validate_vault` reports, from the same implementation. The CLI holds no session reads,
 * so the relation-note check reads Uncertainty wording and the rule check asks only for cited lines that hold a
 * condition; the entry-path checks and the cited lines need `OATLAS_REPO_ROOT`, as the MCP server reads it.
 */
function findBuildDepthIssues(entries, vaultPath) {
  const repoRoot = typeof process.env.OATLAS_REPO_ROOT === 'string'
    ? process.env.OATLAS_REPO_ROOT.trim()
    : '';
  const fileBySlug = new Map(entries.map((entry) => [entry.slug, entry.file]));
  const collection = repoRoot ? repositorySurvey(repoRoot, vaultPath)?.collection ?? null : null;
  return buildDepthFindings(entries, { repoRoot: repoRoot || null, collection })
    .filter((finding) => fileBySlug.has(finding.slug))
    .map((finding) => ({
      file: fileBySlug.get(finding.slug),
      issue: { code: finding.code, severity: 'warning', message: finding.message },
    }));
}

/**
 * Which implementation file each node cites: full slug, then a typed tail only when it names exactly one
 * node, since a guess would accuse the wrong file.
 */
function evidencePathIndex(entries) {
  const bySlug = new Map();
  const tailCounts = new Map();
  for (const entry of entries) {
    const path = typeof entry.frontmatter?.path === 'string' ? entry.frontmatter.path.trim() : '';
    if (!path) continue;
    bySlug.set(entry.slug, path);
    const tail = entry.slug.split('/').pop();
    if (tail && tail !== entry.slug) tailCounts.set(tail, (tailCounts.get(tail) ?? 0) + 1);
  }
  const byTail = new Map();
  for (const [slug, path] of bySlug) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && tailCounts.get(tail) === 1) byTail.set(tail, path);
  }
  return (ref) => bySlug.get(ref) ?? byTail.get(ref) ?? null;
}

/**
 * A declared dependency the citing file never mentions. Needs `OATLAS_REPO_ROOT` and the far node's `path:`,
 * so it is vault scope and silent when unset; every declared edge is judged, not only new ones.
 */
function findDependencyWitnessIssues(entries) {
  const repoRoot = typeof process.env.OATLAS_REPO_ROOT === 'string'
    ? process.env.OATLAS_REPO_ROOT.trim()
    : '';
  if (!repoRoot) return [];
  const resolveTargetPath = evidencePathIndex(entries);
  const moduleNamesByPath = new Map();
  const issues = [];
  for (const entry of entries) {
    const kind = typeof entry.frontmatter?.kind === 'string' ? entry.frontmatter.kind.trim() : '';
    if (!kind) continue;
    for (const finding of dependencyWitnessFinding({
      slug: entry.slug,
      frontmatter: entry.frontmatter,
      repoRoot,
      resolveTargetPath,
      moduleNamesByPath,
    })) {
      issues.push({
        file: entry.file,
        issue: { code: finding.code, severity: 'warning', message: finding.message },
      });
    }
  }
  return issues;
}

/**
 * Starter examples the vault has outgrown. The one whole-vault meaning pass with no environment
 * condition, so it always speaks after `init` and a real map.
 */
function findStarterExampleIssues(entries) {
  const fileBySlug = new Map(entries.map((entry) => [entry.slug, entry.file]));
  return starterExampleFindings(
    entries.map((entry) => ({
      slug: entry.slug,
      kind: entry.frontmatter?.kind,
      title: entry.frontmatter?.title,
      body: entry.body,
    })),
  )
    .filter((finding) => fileBySlug.has(finding.slug))
    .map((finding) => ({
      file: fileBySlug.get(finding.slug),
      issue: { code: finding.code, severity: 'warning', message: finding.message },
    }));
}

/** Runs every whole-vault pass and attaches what each finds to the report of its file. */
export function attachVaultWideIssues(reportByFile, entries, vaultPath) {
  for (const findVaultIssues of [
    findDuplicateSlugIssues,
    findDuplicateUidIssues,
    findDanglingGraphReferenceIssues,
    findFolderOnlyEvidenceIssues,
    findDependencyWitnessIssues,
    findStarterExampleIssues,
  ]) {
    attachVaultIssues(reportByFile, findVaultIssues(entries));
  }
  attachVaultIssues(reportByFile, findBuildDepthIssues(entries, vaultPath));
}
