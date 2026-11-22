import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { parseFrontmatter } from '../../../lib/mcp-bridge/parse-frontmatter.mjs';
import {
  rawSourceKindIssues,
  suppressLibraryKindIssues,
  suppressParentedExpectedFieldIssues,
  validateVaultDocument,
} from '../../../lib/mcp-bridge/validate.mjs';
import { walkMd } from '../../../lib/vault-files/walk-vault.mjs';
import { attachVaultWideIssues } from './mcp-vault-checks.mjs';

/** Reads and validates every document of the vault, then runs the whole-vault passes. */
export function scanVault(vaultPath) {
  const files = walkMd(vaultPath);
  const entries = [];
  const reportByFile = new Map();
  const reports = [];
  let errorFiles = 0;
  let warningFiles = 0;

  const unreadable = [];
  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(file, 'utf-8');
    } catch (error) {
      // A file we could not read is not counted as scanned, or the run would certify a file it never opened.
      unreadable.push({
        file,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    // NFC — the same identifier rule as `pathToSlug` (its comment carries the reason).
    const slug = relative(vaultPath, file)
      .replace(/\\/g, '/')
      .replace(/\.md$/, '')
      .normalize('NFC');
    // The body travels with the frontmatter so the whole-vault passes can say
    // exactly what `validate_vault` says about the same node — one vault must
    // not be described two ways by the two tools that read it.
    const parsed = parseFrontmatter(raw);
    const { frontmatter, body } = parsed;
    entries.push({ file, slug, frontmatter, body });
    // The slug travels with the raw text: `slug-outside-kind-folder` is a fact
    // about where the file sits, which the bytes alone never state.
    const report = validateVaultDocument(raw, { slug, parsed });
    reportByFile.set(file, report);
  }

  /*
   * Never tell a node that already has a parent that it has none; a check that sees one file cannot
   * know, so this narrows like `validate_vault` on the MCP side.
   */
  const issuesBySlugForParents = new Map();
  const fileBySlug = new Map();
  for (const { file, slug } of entries) {
    const report = reportByFile.get(file);
    if (!report) continue;
    issuesBySlugForParents.set(slug, report.issues);
    fileBySlug.set(slug, file);
  }
  suppressParentedExpectedFieldIssues(issuesBySlugForParents, entries);
  // A wiki page carries no `kind:` by contract, so the absence is not a finding here.
  suppressLibraryKindIssues(issuesBySlugForParents);
  for (const [slug, issues] of issuesBySlugForParents) {
    const report = reportByFile.get(fileBySlug.get(slug));
    if (report) report.issues = issues;
  }


  attachVaultWideIssues(reportByFile, entries, vaultPath);

  for (const file of files) {
    const report = reportByFile.get(file);
    if (!report || report.issues.length === 0) continue;
    reports.push({
      file: relative(vaultPath, file).replace(/\\/g, '/'),
      report,
    });
    if (report.issues.some((i) => i.severity === 'error')) errorFiles += 1;
    else warningFiles += 1;
  }
  for (const { path, issue } of rawSourceKindIssues(vaultPath)) {
    reports.push({ file: path, report: { ok: true, issues: [issue] } });
    warningFiles += 1;
  }
  return { files, unreadable, reports, errorFiles, warningFiles };
}
