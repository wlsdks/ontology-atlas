#!/usr/bin/env node
// Vault validator CLI — frontmatter silent corruption 가시화.
//
// 사용법:
//   node scripts/validate-vault.mjs [vaultDir]
//   node scripts/validate-vault.mjs --help
//   pnpm vault:validate
//
// 기본 vaultDir = docs/ontology (이 프로젝트의 dogfood vault).
// error 가 한 건이라도 있으면 exit 1, warning 만 있으면 exit 0.

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
  // `broader` (is_a / SKOS) — 공방과 함께 도입됐는데 이 리스트에서 빠져
  // 있었다(감사 2026-07-25). 이 리스트는 canonical 정렬 검사와 dangling ref
  // 검사를 **동시에** 구동하므로, 누락은 "에이전트가 broader 에 오타 슬러그를
  // 써도 CI 는 green" 을 뜻했다. contract fixture 가 이 drift 를 고정한다.
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
        "frontmatter 시작 `---` 만 있고 끝 `---` 가 없습니다 — 노드로 인식되지 않습니다.",
    });
    return { ok: false, issues };
  }

  if (!startsWithDelim) {
    return { ok: true, issues };
  }

  const { frontmatter } = parseFrontmatter(raw);
  const keys = Object.keys(frontmatter);

  if (keys.length === 0) {
    issues.push({
      code: "parse-zero-keys",
      severity: "warning",
      message:
        "frontmatter 블록은 있지만 key 가 하나도 추출되지 않았습니다 — 들여쓰기 또는 콜론 누락 의심.",
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
        "frontmatter 에 `kind:` 가 없습니다 — graph 노드가 되려면 kind 가 필요합니다.",
    });
  } else if (typeof rawKind !== "string" || rawKind.trim() === "") {
    issues.push({
      code: "empty-kind",
      severity: "error",
      message: "`kind:` 값이 비어있습니다 — graph 노드로 인식되지 않습니다.",
    });
  } else if (!KNOWN_VAULT_KINDS.includes(rawKind.trim())) {
    issues.push({
      code: "unknown-kind",
      severity: "warning",
      message: `\`kind: ${rawKind.trim()}\` 는 인식되지 않는 값입니다. 인식되는 값: ${KNOWN_VAULT_KINDS.join(" / ")}.`,
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
          message: `\`${key}:\` 가 비어있습니다 — kind=${trimmedKind} 노드는 ${key} 가 있어야 트리에서 부모를 찾을 수 있습니다.`,
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
        message: "`uid:`가 없습니다 — 모든 ontology 노드는 lowercase UUIDv4 영구 식별자를 가져야 합니다.",
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
            message: "`merged_uids:`는 중복 없이 오름차순으로 정렬된 UUIDv4 set이어야 합니다.",
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
        message: `\`${key}:\` graph 배열이 정렬/중복제거된 canonical set 이 아닙니다 — add_relation 또는 patch_concept 로 다시 저장하면 정리됩니다.`,
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
    // NFC — `pathToSlug` 와 같은 식별자 규칙.
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
      `[validate-vault] ${files.length} 파일 스캔 — issue 0. vault clean ✓`,
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
    `\n[validate-vault] ${files.length} 파일 / ${reports.length} 문제 (error ${errorFiles} · warning ${warningFiles})`,
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
 * 두 문서가 같은 canonical slug 를 주장하는 상태 (2026-07-29 실측).
 *
 * **파일 단위 검사로는 원리적으로 못 잡는다** — 한 파일만 보면 완벽히
 * 정상이기 때문이다. 그래서 dangling 검사와 같은 자리(볼트 전수 패스)에 산다.
 *
 * 어떻게 생기나: `patch_concept` 이 `frontmatter.slug` 를 다른 노드가 이미
 * 가진 값으로 덮어써도 막지 않는다(`add_concept` 은 막고 `rename_concept` 은
 * `overwrite:true` 를 요구하는데 이 경로만 열려 있다). 그러면 두 파일이 같은
 * 이름을 주장하고, 그 이름을 가리키는 모든 관계가 **어느 쪽을 뜻하는지 알 수
 * 없게** 된다 — 컴파일러는 `ambiguous-alias` 로 보는데 `validate` 는 조용했다.
 *
 * error 로 올린다. dangling 은 "아직 안 만든 것" 일 수 있어 warning 이지만,
 * 중복 slug 는 **이미 있는 두 문서 사이의 모순**이라 그래프가 성립하지 않는다.
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
            `\`slug: ${declared}\` 를 다른 문서도 주장합니다 (${rest.join(', ')}). ` +
            `같은 이름을 가리키는 관계가 어느 쪽을 뜻하는지 정할 수 없습니다 — ` +
            `한쪽의 slug 를 바꾸거나 rename_concept 으로 합치세요.`,
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
          message: `UID ${uid}를 다른 문서도 정체성으로 주장합니다 (${others.join(", ")}).`,
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
    // 참조도 NFC 로 맞춘다 — 슬러그는 `pathToSlug` 가 이미 NFC 다.
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
          message: `\`${key}:\` graph reference "${ref}" 가 vault 의 어떤 node 로도 resolve 되지 않습니다.`,
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
