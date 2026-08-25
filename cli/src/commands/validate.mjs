import { COLORS } from '../lib/colors.mjs';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { walkMd } from '../lib/walk-vault.mjs';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { validateVaultDocument, suppressParentedExpectedFieldIssues } from '../lib/validate.mjs';
import {
  formatUnknownFlagError,
  parseCsvListFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--strict', '--list-codes', '--fail-on'];


// The canonical list of issue codes `validateVaultDocument` can surface. Used for
// `--list-codes` output and for detecting an unknown code in `--fail-on`. Kept in
// step with the codes in cli/src/lib/validate.mjs (the 3-way contract);
// tests/contract/known-codes-drift.contract.test.ts blocks drift immediately.
//
// Exported so the contract test can import the canonical list.
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
 * `ontology-atlas validate [vault]`
 *
 * Verifies the vault's frontmatter integrity. Exits 1 on one or more error issues.
 *
 * `--json` gives machine-readable output, so CI, scripts, and agents parse issue
 * rows without stripping ANSI.
 *
 * `--strict` makes warnings exit 1 as well, for CI that also wants to block
 * missing-expected-field (a capability or element without its domain). The
 * default fails on errors only.
 *
 * `--fail-on=<code1,code2,...>` fails on the listed issue codes only and takes
 * precedence over `--strict`: one or more matching issues exit 1, everything else
 * is ignored. This is how CI hard-gates specific violations incrementally.
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

  // --list-codes prints immediately without looking at the vault, ignoring any other option.
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
      // **A file we could not read is not counted as "scanned"** (measured 2026-07-29).
      //
      // It used to `continue` silently while still counting the file in `scanned`.
      // With one unreadable `.md`, this answered `6 files scanned — 0 issues. vault
      // clean ✓` while `compile` on the same vault exited 2 with EACCES. It was
      // **certifying a file it never managed to open**.
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
    const { frontmatter } = parseFrontmatter(raw);
    entries.push({ file, slug, frontmatter });
    const report = validateVaultDocument(raw);
    reportByFile.set(file, report);
  }

  /*
   * Never tell a node that already has a parent that it has none (2026-08-11) —
   * the same narrowing as `validate_vault` on the MCP side. A check that sees one
   * file cannot know.
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
  for (const [slug, issues] of issuesBySlugForParents) {
    const report = reportByFile.get(fileBySlug.get(slug));
    if (report) report.issues = issues;
  }

  for (const { file, issue } of findDuplicateSlugIssues(entries)) {
    const report = reportByFile.get(file);
    if (!report) continue;
    report.issues.push(issue);
    report.ok = !report.issues.some((i) => i.severity === 'error');
  }

  for (const { file, issue } of findDuplicateUidIssues(entries)) {
    const report = reportByFile.get(file);
    if (!report) continue;
    report.issues.push(issue);
    report.ok = false;
  }

  for (const { file, issue } of findDanglingGraphReferenceIssues(entries)) {
    const report = reportByFile.get(file);
    if (!report) continue;
    report.issues.push(issue);
    report.ok = !report.issues.some((i) => i.severity === 'error');
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

  // **An issue count and a file count are different things** (correction measured
  // 2026-08-04).
  //
  // The final summary line printed `reports.length` (the number of **files** with
  // a problem) as "problems", and `errorFiles`/`warningFiles` (file counts) as
  // "error/warning". So a vault with 5 errors and 4 warnings was called
  // `9 files / 8 problems (error 5 · warning 3)` — one warning **vanished entirely
  // because it sat inside a file that also had an error** (files count only into
  // errorFiles). The same command's `--json` counted per issue and answered 5/4.
  // When two outputs give one folder two different numbers, neither is believable.
  //
  // The exit code stays on file counts — only zero vs non-zero matters, so the
  // value is the same.
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
    return decideExit(errorFiles, warningFiles, strict, failOn, groups);
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
    // **Do not say only "vault clean ✓"** (measured 2026-08-01).
    //
    // This command looks at frontmatter and graph references only — it **does not
    // check whether the code files `elements:` / `path:` point at exist**. The
    // wording did not say so, so on one vault `validate` answered "clean" while
    // `health` answered "needs_attention", with no way to tell which was right.
    // Once the sentence states the scope, the two answers stop contradicting each
    // other and become two different checks.
    console.log(
      `${COLORS.green}[validate] Scanned ${files.length - unreadable.length} files: 0 frontmatter or graph-reference issues ✓${COLORS.reset}`,
    );
    console.log(
      `${COLORS.dim}          Code-path existence for elements:/path: is outside this check; \`ontology-atlas health\` verifies it.${COLORS.reset}`,
    );
    return unreadable.length > 0 ? 1 : 0;
  }

  // The strict-mode notice is handled by the final summary line.

  for (const { file, report } of reports) {
    console.log(`\n${file}`);
    for (const issue of report.issues) {
      const color =
        issue.severity === 'error' ? COLORS.red : COLORS.yellow;
      const tag = issue.severity === 'error' ? '✗ ERROR' : '▲ WARN ';
      console.log(`  ${color}${tag}${COLORS.reset}  [${issue.code}] ${issue.message}`);
    }
  }

  // Per-issue-code group summary: on a large vault where 30+ lines of the same
  // warning scroll past, this shows *which code and how many* at a glance. Only
  // codes appearing 2+ times are listed — a single occurrence is already covered
  // by the per-file output above.
  // (`groups` was built once above and is shared by JSON, fail-on, and text.)
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
  return decideExit(errorFiles, warningFiles, strict, failOn, groups);
}

// Precedence: --fail-on (when present, it alone) > --strict > default (errors only).
function decideExit(errorFiles, warningFiles, strict, failOn, groups) {
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

// --list-codes output: a human-readable table in text mode, machine-readable in
// --json mode so CI can discover the codes dynamically.
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
 * Groups reports by issue code. Severity within a code is the max (error >
 * warning), so a code appearing as both shows the higher one. `files` is deduped
 * in order of appearance. `count` counts one per file even when the same code
 * recurs in it — "how many files are affected" is the more useful number.
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
    // Errors first, then by descending count
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

/**
 * Two documents claiming the same canonical slug (measured 2026-07-29).
 *
 * **A per-file check cannot catch this in principle** — either file alone looks
 * perfectly fine, which is why this lives in the same place as the dangling check
 * (the whole-vault pass).
 *
 * How it arises: `patch_concept` does not stop `frontmatter.slug` being overwritten
 * with a value another node already holds (`add_concept` blocks it and
 * `rename_concept` demands `overwrite:true`; only this path is open). Two files
 * then claim one name, and every relation naming it becomes **impossible to
 * resolve to one side** — the compiler saw `ambiguous-alias` while `validate`
 * stayed silent.
 *
 * Raised as an error. A dangling reference may be "not built yet", hence a
 * warning; a duplicate slug is a **contradiction between two documents that both
 * already exist**, and the graph does not hold.
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
 * ⚠️ **A graph reference must resolve to a «node»** (measured 2026-08-08).
 *
 * Resolution used to target «every .md file in the vault». Markdown that is not a
 * node (meeting notes, memos, drafts) legitimately lives in a vault — that is by
 * design — and counting those as «an existing slug» let node → loose-document
 * relations pass.
 *
 * That was worse than silence: in that state this command printed, in green,
 * *"frontmatter · graph reference issues 0 ✓"* while `compile` on the same vault
 * reported `unresolved 1`. **Two tools said opposite things about one vault, and
 * the one a person reads first was the wrong one.** Claiming to have run a check
 * that did not happen is the worst kind.
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
      // «The file is missing» and «the file exists but is not a node» are different
      // tasks: the first means creating it or fixing a typo, the second means giving
      // that document a `kind:` (promoting it) or deleting the relation. Saying both
      // in one sentence sends a person hunting for a file that is right in front of them.
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
