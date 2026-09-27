import { COLORS } from '../lib/colors.mjs';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { walkMd } from '../lib/walk-vault.mjs';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  dependencyWitnessFinding,
  folderOnlyEvidenceFinding,
  starterExampleFindings,
  validateVaultDocument,
  suppressLibraryKindIssues,
  suppressParentedExpectedFieldIssues,
} from '../lib/validate.mjs';
import {
  formatUnknownFlagError,
  parseCsvListFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--strict', '--list-codes', '--fail-on'];


// Every issue code `validateVaultDocument` can surface, for `--list-codes` and unknown `--fail-on`
// codes. Kept in step with cli/src/lib/validate.mjs by tests/contract/known-codes-drift.contract.test.ts.
export const KNOWN_CODES = [
  {
    code: 'unclosed-frontmatter',
    severity: 'error',
    description: '`---` never closes: the frontmatter at the head of the file has no end.',
  },
  {
    code: 'parse-zero-keys',
    severity: 'warning',
    description: 'frontmatter parsed to 0 keys: the YAML syntax is probably broken.',
  },
  {
    code: 'malformed-frontmatter-line',
    severity: 'error',
    description: 'a frontmatter declaration or indented list breaks key: value syntax.',
  },
  {
    code: 'malformed-quoted-scalar',
    severity: 'error',
    description: 'a scalar opens a quote it never closes as the last character, so the quote is kept as literal text.',
  },
  {
    code: 'missing-kind',
    severity: 'warning',
    description: 'no `kind:` key at all: the file is left out of the graph.',
  },
  {
    code: 'empty-kind',
    severity: 'error',
    description: '`kind:` is empty: the file is left out of the graph and invalid.',
  },
  {
    code: 'unknown-kind',
    severity: 'warning',
    description: 'a value other than project / domain / capability / element / document.',
  },
  {
    code: 'missing-uid',
    severity: 'error',
    description: 'the ontology node has no permanent `uid:`.',
  },
  {
    code: 'invalid-uid',
    severity: 'error',
    description: '`uid:` is not a lowercase UUIDv4.',
  },
  {
    code: 'invalid-merged-uids',
    severity: 'error',
    description: '`merged_uids:` breaks the absorbed UUIDv4 identity-alias format.',
  },
  {
    code: 'non-canonical-merged-uids',
    severity: 'warning',
    description: '`merged_uids:` is not a deduplicated, ascending canonical set.',
  },
  {
    code: 'missing-expected-field',
    severity: 'warning',
    description: 'a field strongly expected for this kind is missing (for example `domain:` on capability/element).',
  },
  {
    code: 'non-canonical-graph-array',
    severity: 'warning',
    description: 'a graph array is not a trimmed, deduplicated, sorted canonical set.',
  },
  {
    code: 'dangling-graph-reference',
    severity: 'warning',
    scope: 'vault',
    description: 'a graph reference resolves to no node in the vault.',
  },
  /*
   * The meaning findings are warnings: the Markdown is valid and the graph reads it. `--strict` and
   * `--fail-on` can hard-gate them; the default exit stays on errors.
   */
  {
    code: 'definition-missing',
    severity: 'warning',
    description: 'a domain, capability, or element whose body never says what it is, or only restates its title.',
  },
  {
    code: 'boundary-missing',
    severity: 'warning',
    description: 'a domain or capability with no `## Includes` or no `## Excludes` holding more than a placeholder.',
  },
  {
    code: 'epistemic-exclusion',
    severity: 'warning',
    description: 'an exclusion bullet that states what the writer did not read rather than what the product does not do.',
  },
  {
    code: 'uncertainty-missing',
    severity: 'warning',
    description: 'a node that records no unknown at all, so its body reads as complete when no vault is.',
  },
  {
    code: 'slug-outside-kind-folder',
    severity: 'warning',
    description: 'a domain, capability, or element written at the vault root instead of inside its kind folder.',
  },
  {
    code: 'folder-only-evidence',
    severity: 'warning',
    scope: 'vault',
    description: 'frontmatter `path:` names a directory, so this node\'s evidence can never be dated against the code.',
  },
  {
    code: 'dependency-unwitnessed',
    severity: 'warning',
    scope: 'vault',
    description: 'a declared dependency whose citing file never names the file the target cites, so nothing in the source witnesses the edge.',
  },
  {
    code: 'dependency-unjudged',
    severity: 'warning',
    scope: 'vault',
    description: 'a declared dependency whose citing file is too large to read, so no witness was looked for and the edge is not judged.',
  },
  {
    code: 'starter-example-node',
    severity: 'warning',
    scope: 'vault',
    description: 'a starter example the `init` scaffold wrote, still standing after real nodes of the same kind arrived.',
  },
  {
    code: 'duplicate-slug',
    severity: 'error',
    scope: 'vault',
    description: 'two documents claim the same canonical slug, so a relation cannot say which one it means.',
  },
  {
    code: 'duplicate-uid',
    severity: 'error',
    scope: 'vault',
    description: 'two nodes claim the same primary or merged UID as their permanent identity.',
  },
];

/**
 * `ontology-atlas validate [vault]`: frontmatter integrity; exits 1 on any error issue. `--strict`
 * also fails on warnings; `--fail-on=<codes>` fails on the listed codes only and overrides `--strict`.
 */
export function runValidate(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    return 1;
  }

  if (parsed.listCodes) {
    return printKnownCodes(parsed.json);
  }

  const { json, strict, failOn } = parsed;
  // An unknown code in --fail-on warns on stderr but still runs — an *explicit
  // warning* beats silently falling through to no match.
  if (failOn) {
    const known = new Set(KNOWN_CODES.map((c) => c.code));
    const unknown = failOn.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      process.stderr.write(
        `${COLORS.yellow}warning${COLORS.reset}  --fail-on names unknown codes: ${unknown.join(', ')}. ` +
          `List the available ones: ${COLORS.bold}ontology-atlas validate --list-codes${COLORS.reset}\n`,
      );
    }
  }
  const vaultPath = resolveVaultRoot(parsed.vault);
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
    const { frontmatter, body } = parseFrontmatter(raw);
    entries.push({ file, slug, frontmatter, body });
    // The slug travels with the raw text: `slug-outside-kind-folder` is a fact
    // about where the file sits, which the bytes alone never state.
    const report = validateVaultDocument(raw, { slug });
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

  // Count issues, not files: counting files with a problem hid a warning inside a file that also had
  // an error, and disagreed with `--json`. The exit code stays on file counts; only zero matters there.
  const allIssues = reports.flatMap(({ report }) => report.issues);
  const errorIssues = allIssues.filter((i) => i.severity === 'error').length;
  const warningIssues = allIssues.length - errorIssues;

  // JSON output always has the same shape (a clean vault still gets
  // `problems: []`), so a caller can branch on `.summary.errorFiles` alone —
  // one structure, unlike the branching text mode.
  const groups = groupIssuesByCode(reports);
  if (json) {
    const byCode = {};
    for (const g of groups) {
      byCode[g.code] = {
        severity: g.severity,
        count: g.count,
        files: g.files,
      };
    }
    process.stdout.write(
      JSON.stringify(
        {
          // Only a file we opened counts as "scanned". Unreadable ones are counted
          // separately, so `scanned` matches the scope of what is being certified.
          scanned: files.length - unreadable.length,
          unreadable: unreadable.map((u) => ({
            file: relative(vaultPath, u.file).replace(/\\/g, '/'),
            message: u.message,
          })),
          problems: reports.map(({ file, report }) => ({
            file,
            issues: report.issues.map((i) => ({
              code: i.code,
              severity: i.severity,
              message: i.message,
            })),
          })),
          summary: {
            problemFiles: reports.length,
            errorFiles,
            warningFiles,
            byCode,
            strict,
            failOn,
          },
        },
        null,
        2,
      ) + '\n',
    );
    return decideExit(errorFiles, warningFiles, strict, failOn, groups, unreadable.length);
  }

  // Unreadable files are named **before** declaring clean. Without this line,
  // "vault clean ✓" certifies files that were never opened.
  if (unreadable.length > 0) {
    console.log(
      `\n${COLORS.yellow}[validate] Could not read ${unreadable.length} file(s); excluded from validation scope:${COLORS.reset}`,
    );
    for (const { file, message } of unreadable) {
      console.log(`  ${COLORS.yellow}?${COLORS.reset} ${relative(vaultPath, file).replace(/\\/g, '/')} · ${message}`);
    }
  }

  if (reports.length === 0) {
    // Say the scope, not only "vault clean": this checks frontmatter and graph references, not whether
    // `elements:` / `path:` files exist, which is what `health` checks.
    console.log(
      `${COLORS.green}[validate] Scanned ${files.length - unreadable.length} files: 0 frontmatter or graph-reference issues ✓${COLORS.reset}`,
    );
    console.log(
      `${COLORS.dim}          Code-path existence for elements:/path: is outside this check; \`ontology-atlas health\` verifies it.${COLORS.reset}`,
    );
    return unreadable.length > 0 ? 1 : 0;
  }


  for (const { file, report } of reports) {
    console.log(`\n${file}`);
    for (const issue of report.issues) {
      const color =
        issue.severity === 'error' ? COLORS.red : COLORS.yellow;
      const tag = issue.severity === 'error' ? '✗ ERROR' : '▲ WARN ';
      console.log(`  ${color}${tag}${COLORS.reset}  [${issue.code}] ${issue.message}`);
    }
  }

  // Per-code summary for large vaults; only codes seen twice or more, since one occurrence is already
  // in the per-file output.
  const repeatedCodes = groups.filter((g) => g.count >= 2);
  if (repeatedCodes.length > 0) {
    console.log(`\n${COLORS.dim}── grouped by code ──${COLORS.reset}`);
    for (const g of repeatedCodes) {
      const color = g.severity === 'error' ? COLORS.red : COLORS.yellow;
      const tag = g.severity === 'error' ? '✗' : '▲';
      const head = g.files.slice(0, 3).join(', ');
      const tail = g.files.length > 3 ? ` (+${g.files.length - 3} more)` : '';
      console.log(
        `  ${color}${tag}${COLORS.reset} ${g.code} · ${g.count} occurrence${g.count === 1 ? '' : 's'}` +
          `\n     ${COLORS.dim}${head}${tail}${COLORS.reset}`,
      );
    }
  }

  let modeTag = '';
  if (failOn && failOn.length > 0) {
    const matched = failOn.filter((code) => groups.some((g) => g.code === code));
    if (matched.length > 0) {
      modeTag = ` ${COLORS.dim}[--fail-on=${failOn.join(',')}: matched ${matched.join(',')}]${COLORS.reset}`;
    } else {
      modeTag = ` ${COLORS.dim}[--fail-on=${failOn.join(',')}: no match → exit 0]${COLORS.reset}`;
    }
  } else if (strict && warningFiles > 0) {
    modeTag = ` ${COLORS.dim}[--strict: warnings also exit 1]${COLORS.reset}`;
  }
  console.log(
    `\n[validate] scanned ${files.length - unreadable.length} files / ` +
      `${allIssues.length} issues in ${reports.length} files ` +
      `(${COLORS.red}error ${errorIssues}${COLORS.reset} · ` +
      `${COLORS.yellow}warning ${warningIssues}${COLORS.reset})${modeTag}`,
  );
  return decideExit(errorFiles, warningFiles, strict, failOn, groups, unreadable.length);
}

function decideExit(errorFiles, warningFiles, strict, failOn, groups, unreadableCount = 0) {
  // A file that could not be opened was never validated, so no mode may certify the vault, --json
  // included, which is what CI consumes.
  if (unreadableCount > 0) return 1;
  if (failOn && failOn.length > 0) {
    return groups.some((g) => failOn.includes(g.code)) ? 1 : 0;
  }
  if (errorFiles > 0) return 1;
  if (strict && warningFiles > 0) return 1;
  return 0;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, strict: false, listCodes: false, failOn: null };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--strict') flags.strict = true;
    else if (a === '--list-codes') flags.listCodes = true;
    else if (a === '--fail-on') flags.failOn = parseCsvListFlag('--fail-on', args[++i], { itemName: 'issue code' });
    else if (a.startsWith('--fail-on=')) flags.failOn = parseCsvListFlag('--fail-on', a.slice('--fail-on='.length), { itemName: 'issue code' });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (flags.vault === false) return { error: '--vault requires a path' };
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return {
    vault: vaultResult.vault,
    json: flags.json,
    strict: flags.strict,
    listCodes: flags.listCodes,
    failOn: flags.failOn,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas validate [vault] [--json] [--strict]\n` +
      `  ontology-atlas validate [vault] [--fail-on code,...]\n` +
      `  ontology-atlas validate --list-codes [--json]\n\n` +
      `Validate ontology vault frontmatter integrity: frontmatter shape and graph\n` +
      `references only. It does NOT check whether elements:/path: point at files that\n` +
      `exist; \`ontology-atlas health\` runs that source-path check.\n`,
  );
}

function printKnownCodes(asJson) {
  if (asJson) {
    process.stdout.write(JSON.stringify({ codes: KNOWN_CODES }, null, 2) + '\n');
    return 0;
  }
  process.stdout.write(
    `${COLORS.bold}validate issue codes${COLORS.reset} ${COLORS.dim}(--fail-on=<code> fails on chosen codes only)${COLORS.reset}\n\n`,
  );
  for (const c of KNOWN_CODES) {
    const severityColor = c.severity === 'error' ? COLORS.red : COLORS.yellow;
    const severityTag = c.severity === 'error' ? '✗ error  ' : '▲ warning';
    process.stdout.write(
      `  ${severityColor}${severityTag}${COLORS.reset}  ${COLORS.bold}${c.code.padEnd(24)}${COLORS.reset}  ${COLORS.dim}${c.description}${COLORS.reset}\n`,
    );
  }
  process.stdout.write('\n');
  return 0;
}

/**
 * Groups reports by issue code. Severity is the max within a code; `files` is deduped in order;
 * `count` is files affected, not occurrences.
 */
function groupIssuesByCode(reports) {
  const map = new Map();
  for (const { file, report } of reports) {
    const seenInFile = new Set();
    for (const issue of report.issues) {
      const key = issue.code;
      if (seenInFile.has(key)) continue;
      seenInFile.add(key);
      if (!map.has(key)) {
        map.set(key, { code: key, severity: issue.severity, files: [], count: 0 });
      }
      const entry = map.get(key);
      if (issue.severity === 'error') entry.severity = 'error';
      entry.files.push(file);
      entry.count += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return b.count - a.count;
  });
}

const GRAPH_REFERENCE_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
];

function collectGraphRefs(frontmatter) {
  const refs = [];
  for (const key of GRAPH_REFERENCE_KEYS) {
    const value = frontmatter[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) refs.push({ key, ref });
  }
  const domain = frontmatter.domain;
  if (typeof domain === 'string' && domain.trim()) {
    refs.push({ key: 'domain', ref: domain });
  }
  return refs;
}

function attachVaultIssues(reportByFile, findings) {
  for (const { file, issue } of findings) {
    const report = reportByFile.get(file);
    if (!report) continue;
    report.issues.push(issue);
    report.ok = !report.issues.some((i) => i.severity === 'error');
  }
}

/**
 * Two documents claiming one canonical slug: invisible per file, so checked over the whole vault. An error,
 * since `patch_concept` can still write a taken slug and every relation naming it becomes unresolvable.
 */
function findDuplicateSlugIssues(entries) {
  const byDeclared = new Map();
  for (const entry of entries) {
    const declared = entry.frontmatter?.slug;
    const value = typeof declared === 'string' ? declared.trim() : '';
    if (!value) continue;
    if (!byDeclared.has(value)) byDeclared.set(value, []);
    byDeclared.get(value).push(entry);
  }
  const issues = [];
  for (const [declared, group] of byDeclared) {
    if (group.length < 2) continue;
    const others = group.map((entry) => entry.slug);
    for (const entry of group) {
      const rest = others.filter((slug) => slug !== entry.slug);
      issues.push({
        file: entry.file,
        slug: entry.slug,
        issue: {
          code: 'duplicate-slug',
          severity: 'error',
          message:
            `another document also claims \`slug: ${declared}\` (${rest.join(', ')}). ` +
            `A relation naming it cannot say which one it means: ` +
            `change one slug, or merge them with rename_concept.`,
        },
      });
    }
  }
  return issues;
}

function findDuplicateUidIssues(entries) {
  const claims = new Map();
  for (const entry of entries) {
    const primary = typeof entry.frontmatter?.uid === 'string' ? entry.frontmatter.uid.trim() : '';
    const merged = Array.isArray(entry.frontmatter?.merged_uids) ? entry.frontmatter.merged_uids : [];
    for (const uid of new Set([primary, ...merged].filter((value) => typeof value === 'string' && value))) {
      if (!claims.has(uid)) claims.set(uid, []);
      claims.get(uid).push(entry);
    }
  }
  const issues = [];
  for (const [uid, group] of claims) {
    if (group.length < 2) continue;
    for (const entry of group) {
      const others = group.filter((candidate) => candidate !== entry).map((candidate) => candidate.slug);
      issues.push({
        file: entry.file,
        slug: entry.slug,
        issue: {
          code: 'duplicate-uid',
          severity: 'error',
          message:
            `another document also claims UID ${uid} as its identity (${others.join(', ')}). ` +
            'That is a permanent identity collision: mint a new UID for the new node, and merge through merge_concepts.',
        },
      });
    }
  }
  return issues;
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
  const issues = [];
  for (const entry of entries) {
    const kind = typeof entry.frontmatter?.kind === 'string' ? entry.frontmatter.kind.trim() : '';
    if (!kind) continue;
    for (const finding of dependencyWitnessFinding({
      slug: entry.slug,
      frontmatter: entry.frontmatter,
      repoRoot,
      resolveTargetPath,
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

/**
 * A graph reference must resolve to a node, not to any `.md` in the vault: loose notes are allowed
 * in a vault, and counting them would contradict `compile`, which reports them unresolved.
 */
function findDanglingGraphReferenceIssues(entries) {
  const isNodeEntry = (entry) =>
    typeof entry.frontmatter?.kind === 'string' && entry.frontmatter.kind.trim() !== '';
  const nodeEntries = entries.filter(isNodeEntry);
  // Slugs of documents that are not nodes, held separately so «missing» and «not a
  // node» can be said apart. For a person those are entirely different tasks.
  const nonNodeSlugs = new Set(entries.filter((e) => !isNodeEntry(e)).map((e) => e.slug));
  const nonNodeTails = new Set(
    [...nonNodeSlugs].map((slug) => slug.split('/').pop()).filter(Boolean),
  );
  const slugs = new Set(nodeEntries.map((entry) => entry.slug));
  const tailToFull = new Map();
  const frontmatterSlugToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  for (const entry of nodeEntries) {
    const fmSlug = entry.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() && !frontmatterSlugToFull.has(fmSlug)) {
      frontmatterSlugToFull.set(fmSlug, entry.slug);
    }
  }
  const resolveRef = (rawRef) => {
    if (typeof rawRef !== 'string') return null;
    // Normalise references to NFC too — slugs are already NFC via `pathToSlug`.
    // Normalising one side only leaves characters that look identical but do not match.
    const ref = rawRef.normalize('NFC');
    if (slugs.has(ref)) return ref;
    if (frontmatterSlugToFull.has(ref)) return frontmatterSlugToFull.get(ref);
    if (tailToFull.has(ref)) return tailToFull.get(ref);
    for (const slug of slugs) {
      if (slug.endsWith(`/${ref}`)) return slug;
    }
    return null;
  };
  const issues = [];
  for (const entry of entries) {
    for (const { key, ref } of collectGraphRefs(entry.frontmatter)) {
      if (typeof ref !== 'string' || ref.trim() === '') continue;
      if (key === 'elements' && isPathLikeGraphRef(ref)) continue;
      if (resolveRef(ref)) continue;
      // A missing file and a file that is not a node are different tasks (create or fix a typo, versus
      // add a `kind:` or drop the relation); one sentence for both sends a person hunting.
      const normalized = ref.normalize('NFC');
      const isNonNodeDoc = nonNodeSlugs.has(normalized) || nonNodeTails.has(normalized);
      issues.push({
        file: entry.file,
        issue: {
          code: 'dangling-graph-reference',
          severity: 'warning',
          message: isNonNodeDoc
            ? `\`${key}:\` graph reference "${ref}" exists in the vault as a file but is **not a node** ` +
              '(no `kind:` -- notes and minutes stay outside the graph). Give it a `kind:` to raise it ' +
              'into one, or remove this relation.'
            : `\`${key}:\` graph reference "${ref}" resolves to no node in the vault.`,
        },
      });
    }
  }
  return issues;
}

function isPathLikeGraphRef(ref) {
  return (
    ref.startsWith('src/') ||
    ref.startsWith('mcp/') ||
    ref.startsWith('cli/') ||
    ref.startsWith('scripts/') ||
    ref.startsWith('.claude/') ||
    /\.[A-Za-z0-9]+$/.test(ref)
  );
}
