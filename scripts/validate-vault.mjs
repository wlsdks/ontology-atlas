#!/usr/bin/env node
// Vault validator CLI — makes silent frontmatter corruption visible.
//
// Usage:
//   node scripts/validate-vault.mjs [vaultDir]
//   node scripts/validate-vault.mjs --help
//   pnpm vault:validate
//
// Default vaultDir = docs/ontology (this project's dogfood vault).
// Exits 1 if there is any error; exits 0 when only warnings were found.

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./lib/parse-frontmatter.mjs";
import { inspectMergedUids, nodeUidIssue } from "../cli/src/lib/schema.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const KNOWN_VAULT_KINDS = [
  "project",
  "domain",
  "capability",
  "element",
  "document",
  "vault-readme",
];

const GRAPH_ARRAY_KEYS = [
  "domains",
  "capabilities",
  "elements",
  "dependencies",
  "depends_on",
  "relates",
  "contains",
  "describes",
  // `broader` (is_a / SKOS) was introduced alongside the studio but was missing
  // from this list (audit, 2026-07-25). This list drives **both** the canonical
  // ordering check and the dangling-reference check, so the omission meant "an
  // agent can put a typo slug in broader and CI stays green". A contract fixture
  // pins this drift.
  "broader",
];

const KIND_EXPECTED_EXTRAS = {
  project: [],
  domain: [],
  capability: ["domain"],
  element: ["domain"],
  document: [],
  "vault-readme": [],
};

export function validateVaultUsage() {
  return [
    "Usage: node scripts/validate-vault.mjs [vaultDir]",
    "",
    "Validates markdown frontmatter integrity for an ontology vault.",
    "",
    "Arguments:",
    "  vaultDir     Vault folder to scan. Defaults to docs/ontology.",
    "",
    "Options:",
    "  -h, --help   Show this help text.",
  ].join("\n");
}

export function parseValidateVaultArgs({
  argv = process.argv,
  cwd = process.cwd(),
} = {}) {
  const args = argv.slice(2);
  if (args[0] === "--") {
    args.shift();
  }
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }
  if (args.length > 1) {
    return {
      error: `Unexpected argument: ${args[1]}`,
      exitCode: 2,
    };
  }
  if (args[0]?.startsWith("-")) {
    return {
      error: `Unknown option: ${args[0]}`,
      exitCode: 2,
    };
  }
  return {
    vaultDir: args[0]
      ? path.resolve(cwd, args[0])
      : path.join(ROOT, "docs", "ontology"),
  };
}

async function validateVaultDir(vaultDir) {
  try {
    const info = await stat(vaultDir);
    if (!info.isDirectory()) {
      return `Vault path is not a directory: ${vaultDir}`;
    }
    return null;
  } catch (err) {
    if (err?.code === "ENOENT") {
      return `Vault path does not exist: ${vaultDir}`;
    }
    throw err;
  }
}

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function validate(raw) {
  const issues = [];

  const startsWithDelim = raw.startsWith("---");
  const closingIndex = startsWithDelim ? raw.indexOf("\n---", 3) : -1;

  if (startsWithDelim && closingIndex === -1) {
    issues.push({
      code: "unclosed-frontmatter",
      severity: "error",
      message:
        "frontmatter opens with `---` but never closes: this file is not read as a node.",
    });
    return { ok: false, issues };
  }

  if (!startsWithDelim) {
    return { ok: true, issues };
  }

  const { frontmatter, diagnostics = [] } = parseFrontmatter(raw);
  pushFrontmatterDiagnostics(diagnostics, issues);
  const keys = Object.keys(frontmatter);

  if (keys.length === 0) {
    issues.push({
      code: "parse-zero-keys",
      severity: "warning",
      message:
        "the frontmatter block yielded no keys: check the indentation and the colons.",
    });
    return { ok: true, issues };
  }

  const rawKind = frontmatter.kind;
  const hasKindKey = "kind" in frontmatter;

  if (!hasKindKey) {
    issues.push({
      code: "missing-kind",
      severity: "warning",
      message:
        "frontmatter has no `kind:`: a graph node needs one.",
    });
  } else if (typeof rawKind !== "string" || rawKind.trim() === "") {
    issues.push({
      code: "empty-kind",
      severity: "error",
      message: "`kind:` is empty, so this is not read as a graph node.",
    });
  } else if (!KNOWN_VAULT_KINDS.includes(rawKind.trim())) {
    issues.push({
      code: "unknown-kind",
      severity: "warning",
      message: `\`kind: ${rawKind.trim()}\` is not a known kind. Known kinds: ${KNOWN_VAULT_KINDS.join(" / ")}.`,
    });
  } else {
    const trimmedKind = rawKind.trim();
    for (const key of KIND_EXPECTED_EXTRAS[trimmedKind] ?? []) {
      const value = frontmatter[key];
      const isMissing =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "");
      if (isMissing) {
        issues.push({
          code: "missing-expected-field",
          severity: "warning",
          message: `\`${key}:\` is empty; a kind=${trimmedKind} node needs ${key} to find its parent in the tree.`,
        });
      }
    }
  }

  if (typeof rawKind === "string" && rawKind.trim()) {
    const uid = frontmatter.uid;
    if (uid === undefined || uid === null || uid === "") {
      issues.push({
        code: "missing-uid",
        severity: "error",
        message: "`uid:` is missing; every ontology node needs a permanent lowercase UUIDv4.",
      });
    } else {
      const uidIssue = nodeUidIssue(uid);
      if (uidIssue) {
        issues.push({ code: "invalid-uid", severity: "error", message: uidIssue });
      } else {
        const merged = inspectMergedUids(uid, frontmatter.merged_uids);
        if (merged.invalidIssue) {
          issues.push({ code: "invalid-merged-uids", severity: "error", message: merged.invalidIssue });
        } else if (merged.nonCanonical) {
          issues.push({
            code: "non-canonical-merged-uids",
            severity: "warning",
            message: "`merged_uids:` must be an ascending, duplicate-free set of UUIDv4 values.",
          });
        }
      }
    }
  }

  pushNonCanonicalGraphArrayIssues(frontmatter, issues);

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
  };
}

function pushFrontmatterDiagnostics(diagnostics, issues) {
  for (const diagnostic of diagnostics) {
    if (!diagnostic || diagnostic.code !== "malformed-frontmatter-line") continue;
    issues.push({
      code: diagnostic.code,
      severity: "error",
      message: diagnostic.message,
    });
  }
}

function pushNonCanonicalGraphArrayIssues(frontmatter, issues) {
  for (const key of GRAPH_ARRAY_KEYS) {
    const value = frontmatter[key];
    if (!Array.isArray(value)) continue;
    const refs = value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim());
    const canonical = [...new Set(refs.filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
    if (
      refs.length !== canonical.length ||
      refs.some((item, index) => item !== canonical[index])
    ) {
      issues.push({
        code: "non-canonical-graph-array",
        severity: "warning",
        message: `\`${key}:\` is not a sorted, duplicate-free canonical set; re-saving through add_relation or patch_concept normalises it.`,
      });
    }
  }
}

export async function main({ argv = process.argv, cwd = process.cwd() } = {}) {
  const parsed = parseValidateVaultArgs({ argv, cwd });
  if (parsed.help) {
    console.log(validateVaultUsage());
    return 0;
  }
  if (parsed.error) {
    console.error(parsed.error);
    console.error(validateVaultUsage());
    return parsed.exitCode;
  }
  const vaultDir = parsed.vaultDir;
  const vaultDirFailure = await validateVaultDir(vaultDir);
  if (vaultDirFailure) {
    console.error(vaultDirFailure);
    return 2;
  }

  const files = await walk(vaultDir);
  const entries = [];
  const reportByFile = new Map();
  const reports = [];
  let errorFiles = 0;
  let warningFiles = 0;

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const { frontmatter } = parseFrontmatter(raw);
    // NFC — the same identifier rule as `pathToSlug`.
    const slug = path
      .relative(vaultDir, file)
      .replace(/\\/g, "/")
      .replace(/\.md$/, "")
      .normalize("NFC");
    entries.push({ file, slug, frontmatter });
    const report = validate(raw);
    reportByFile.set(file, report);
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
    report.ok = !report.issues.some((i) => i.severity === "error");
  }

  for (const file of files) {
    const report = reportByFile.get(file);
    if (!report) continue;
    if (report.issues.length === 0) continue;
    reports.push({ file: path.relative(ROOT, file), report });
    if (report.issues.some((i) => i.severity === "error")) errorFiles += 1;
    else warningFiles += 1;
  }

  if (reports.length === 0) {
    console.log(
      `[validate-vault] ${files.length} files scanned — 0 issues. vault clean ✓`,
    );
    return 0;
  }

  for (const { file, report } of reports) {
    console.log(`\n${file}`);
    for (const issue of report.issues) {
      const tag = issue.severity === "error" ? "✗ ERROR" : "▲ WARN ";
      console.log(`  ${tag}  [${issue.code}] ${issue.message}`);
    }
  }

  console.log(
    `\n[validate-vault] ${files.length} files / ${reports.length} issues (error ${errorFiles} · warning ${warningFiles})`,
  );

  return errorFiles > 0 ? 1 : 0;
}

function collectGraphRefs(frontmatter) {
  const refs = [];
  for (const key of GRAPH_ARRAY_KEYS) {
    const value = frontmatter[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) refs.push({ key, ref });
  }
  const domain = frontmatter.domain;
  if (typeof domain === "string" && domain.trim()) {
    refs.push({ key: "domain", ref: domain });
  }
  return refs;
}

/**
 * Two documents claiming the same canonical slug (measured 2026-07-29).
 *
 * **A per-file check cannot catch this in principle** — each file on its own is
 * perfectly valid. So it lives in the same place as the dangling check: the
 * whole-vault pass.
 *
 * How it happens: `patch_concept` does not block overwriting `frontmatter.slug`
 * with a value another node already holds (`add_concept` blocks it and
 * `rename_concept` requires `overwrite:true`; only this path is open). Two files
 * then claim the same name and every relation pointing at that name becomes
 * **ambiguous** — the compiler sees `ambiguous-alias` while `validate` stayed
 * silent.
 *
 * Raised as an error. A dangling reference may just be "not created yet", hence a
 * warning; a duplicate slug is **a contradiction between two documents that both
 * exist**, so the graph does not hold.
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
            `\`slug: ${declared}\` is claimed by other documents too (${rest.join(', ')}). ` +
            `A relation naming it cannot say which one it means: ` +
            `rename one slug, or merge them with rename_concept.`,
        },
      });
    }
  }
  return issues;
}

function findDuplicateUidIssues(entries) {
  const claims = new Map();
  for (const entry of entries) {
    const primary = typeof entry.frontmatter?.uid === "string" ? entry.frontmatter.uid.trim() : "";
    const merged = Array.isArray(entry.frontmatter?.merged_uids) ? entry.frontmatter.merged_uids : [];
    for (const uid of new Set([primary, ...merged].filter((value) => typeof value === "string" && value))) {
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
        issue: {
          code: "duplicate-uid",
          severity: "error",
          message: `UID ${uid} is claimed as identity by other documents too (${others.join(", ")}).`,
        },
      });
    }
  }
  return issues;
}

function findDanglingGraphReferenceIssues(entries) {
  const slugs = new Set(entries.map((entry) => entry.slug));
  const tailToFull = new Map();
  const frontmatterSlugToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split("/").pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  for (const entry of entries) {
    const fmSlug = entry.frontmatter.slug;
    if (typeof fmSlug === "string" && fmSlug.trim() && !frontmatterSlugToFull.has(fmSlug)) {
      frontmatterSlugToFull.set(fmSlug, entry.slug);
    }
  }
  const resolveRef = (rawRef) => {
    if (typeof rawRef !== "string") return null;
    // References are normalised to NFC too — slugs are already NFC via `pathToSlug`.
    const ref = rawRef.normalize("NFC");
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
      if (typeof ref !== "string" || ref.trim() === "") continue;
      if (key === "elements" && isPathLikeGraphRef(ref)) continue;
      if (resolveRef(ref)) continue;
      issues.push({
        file: entry.file,
        issue: {
          code: "dangling-graph-reference",
          severity: "warning",
          message: `\`${key}:\` graph reference "${ref}" resolves to no node in the vault.`,
        },
      });
    }
  }
  return issues;
}

function isPathLikeGraphRef(ref) {
  return (
    ref.startsWith("src/") ||
    ref.startsWith("mcp/") ||
    ref.startsWith("cli/") ||
    ref.startsWith("scripts/") ||
    ref.startsWith(".claude/") ||
    /\.[A-Za-z0-9]+$/.test(ref)
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exit(code);
  }).catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
