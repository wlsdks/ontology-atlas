import { parseFrontmatter } from "./parse-frontmatter";

/**
 * Makes silent frontmatter corruption visible.
 *
 * `parseFrontmatter` is lenient by design: a missing closing `---` or an empty key still
 * returns empty frontmatter rather than throwing. So malformed frontmatter makes the node
 * *disappear from the graph without a word*, and the user has no way to learn why.
 *
 * This validator reads the raw `.md` text and reports only the patterns that mean "the
 * author intended frontmatter and it is broken". A docs file with no frontmatter at all is
 * normal.
 */

export type VaultIssueSeverity = "error" | "warning";

export type VaultIssueCode =
  | "unclosed-frontmatter"
  | "malformed-frontmatter-line"
  | "empty-kind"
  | "missing-kind"
  | "unknown-kind"
  | "missing-uid"
  | "invalid-uid"
  | "invalid-merged-uids"
  | "non-canonical-merged-uids"
  | "duplicate-uid"
  | "missing-expected-field"
  | "non-canonical-graph-array"
  | "parse-zero-keys";

/**
 * R14 — per-kind fields that ought to be present. Matches `requiredExtras` in
 * `mcp/src/schema.mjs` and `cli/src/lib/schema.mjs`; a contract test keeps the three in
 * sync. These drive advisory warnings only, never hard errors, so pre-existing vaults stay
 * valid.
 */
export const KIND_EXPECTED_EXTRAS: Readonly<Record<string, readonly string[]>> = {
  project: [],
  domain: [],
  capability: ["domain"],
  element: ["domain"],
  document: [],
};

export interface VaultDocumentIssue {
  code: VaultIssueCode;
  severity: VaultIssueSeverity;
  message: string;
}

export interface VaultDocumentReport {
  /** True when there are zero error-severity issues. Warnings alone are still ok. */
  ok: boolean;
  issues: VaultDocumentIssue[];
}

/**
 * The canonical `kind` values for vault frontmatter — the same five that
 * derive-ontology-from-vault recognises. `unknown` is a stub the system mints, never
 * something a user writes, so `unknown` as input is reported as an unknown-kind warning.
 */
export const KNOWN_VAULT_KINDS = [
  "project",
  "domain",
  "capability",
  "element",
  "document",
  "vault-readme",
] as const;

const NODE_UID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const GRAPH_ARRAY_KEYS = [
  "domains",
  "capabilities",
  "elements",
  "dependencies",
  "depends_on",
  "relates",
  "contains",
  "describes",
  // `broader` (is_a / SKOS) was introduced with the Studio surface but left out of this
  // list (found in the 2026-07-25 audit). This list drives **both** the canonical-sort
  // check and the dangling-ref check, so the omission meant an agent could write a typo'd
  // slug in `broader` and CI stayed green. A contract fixture pins the list against drift.
  "broader",
] as const;

export function validateVaultDocument(raw: string): VaultDocumentReport {
  const issues: VaultDocumentIssue[] = [];

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

  const { frontmatter, diagnostics = [] } = parseFrontmatter(raw);
  pushFrontmatterDiagnostics(diagnostics, issues);
  const keys = Object.keys(frontmatter);

  if (keys.length === 0) {
    issues.push({
      code: "parse-zero-keys",
      severity: "warning",
      message:
        "frontmatter 블록은 있지만 key 가 하나도 추출되지 않았습니다 — 들여쓰기 또는 콜론 누락 의심.",
    });
    return { ok: issuesHaveNoErrors(issues), issues };
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
  } else if (
    !(KNOWN_VAULT_KINDS as readonly string[]).includes(rawKind.trim())
  ) {
    issues.push({
      code: "unknown-kind",
      severity: "warning",
      message: `\`kind: ${rawKind.trim()}\` 는 인식되지 않는 값입니다. 인식되는 값: ${KNOWN_VAULT_KINDS.join(" / ")}.`,
    });
  } else {
    // R14 — advisory warning for a missing expected field (e.g. `domain` on a capability
    // or element). The parser already read the raw text, so check the object directly.
    const trimmedKind = rawKind.trim();
    pushMissingExpectedExtrasIssues(trimmedKind, frontmatter, issues);
  }

  if (typeof rawKind === "string" && rawKind.trim()) {
    pushUidIssues(frontmatter, issues);
  }

  pushNonCanonicalGraphArrayIssues(frontmatter, issues);

  return { ok: issuesHaveNoErrors(issues), issues };
}

function pushFrontmatterDiagnostics(
  diagnostics: ReadonlyArray<{ code: string; message: string }>,
  issues: VaultDocumentIssue[],
): void {
  for (const diagnostic of diagnostics) {
    if (diagnostic.code !== "malformed-frontmatter-line") continue;
    issues.push({
      code: "malformed-frontmatter-line",
      severity: "error",
      message: diagnostic.message,
    });
  }
}

function pushUidIssues(
  frontmatter: Record<string, unknown>,
  issues: VaultDocumentIssue[],
): void {
  const uid = frontmatter.uid;
  if (uid === undefined || uid === null || uid === "") {
    issues.push({
      code: "missing-uid",
      severity: "error",
      message:
        "`uid:`가 없습니다 — 모든 ontology 노드는 생성 후 바뀌지 않는 lowercase UUIDv4 영구 식별자를 가져야 합니다.",
    });
    return;
  }
  if (typeof uid !== "string" || !NODE_UID_RE.test(uid)) {
    issues.push({
      code: "invalid-uid",
      severity: "error",
      message:
        "`uid:`는 생성 후 바뀌지 않는 lowercase UUIDv4여야 합니다. slug, title, path에서 파생하지 마세요.",
    });
    return;
  }
  const merged = frontmatter.merged_uids;
  if (merged === undefined) return;
  if (
    !Array.isArray(merged) ||
    merged.some((value) => typeof value !== "string" || !NODE_UID_RE.test(value) || value === uid)
  ) {
    issues.push({
      code: "invalid-merged-uids",
      severity: "error",
      message:
        "`merged_uids:`는 흡수된 노드의 lowercase UUIDv4 배열이어야 하며 현재 `uid:`를 반복하면 안 됩니다.",
    });
    return;
  }
  const canonical = [...new Set(merged)].sort((a, b) => a.localeCompare(b, "en"));
  if (
    canonical.length !== merged.length ||
    canonical.some((value, index) => value !== merged[index])
  ) {
    issues.push({
      code: "non-canonical-merged-uids",
      severity: "warning",
      message:
        "`merged_uids:`는 중복 없이 오름차순으로 정렬된 UUIDv4 set이어야 합니다.",
    });
  }
}

function pushMissingExpectedExtrasIssues(
  kind: string,
  frontmatter: Record<string, unknown>,
  issues: VaultDocumentIssue[],
): void {
  const expected = KIND_EXPECTED_EXTRAS[kind] ?? [];
  for (const key of expected) {
    const value = frontmatter[key];
    const isMissing =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "");
    if (isMissing) {
      issues.push({
        code: "missing-expected-field",
        severity: "warning",
        message: `\`${key}:\` 가 비어있습니다 — kind=${kind} 노드는 ${key} 가 있어야 트리에서 부모를 찾을 수 있습니다.`,
      });
    }
  }
}

function issuesHaveNoErrors(issues: readonly VaultDocumentIssue[]): boolean {
  return !issues.some((issue) => issue.severity === "error");
}

/**
 * Validates an already-parsed frontmatter object, so the UI (LocalVaultProvider's
 * `VaultManifest.docs`) can check every file without re-reading each `.md` raw.
 *
 * Precision differs from `validateVaultDocument`:
 *   - unclosed-frontmatter and parse-zero-keys are **undetectable** here, because this only
 *     sees what the lenient parser already produced. The CLI
 *     (`scripts/validate-vault.mjs`) covers the raw side; this is the fast UI path.
 *   - missing-kind / empty-kind / unknown-kind are detected as usual.
 *
 * Heuristic for skipping noise: frontmatter that is empty, or has neither `kind` nor any
 * ontology signal key (`domain`, `domains`, `capabilities`, `elements`, `relates`,
 * `dependencies`), is treated as a docs-only file. A signal key present without `kind`
 * raises missing-kind.
 */
const ONTOLOGY_SIGNAL_KEYS = [
  "domain",
  "domains",
  "capabilities",
  "elements",
  "relates",
  "dependencies",
];

export function validateVaultDocFrontmatter(
  frontmatter: Record<string, unknown>,
): VaultDocumentReport {
  const issues: VaultDocumentIssue[] = [];
  const hasKindKey = "kind" in frontmatter;
  const rawKind = frontmatter.kind;
  const hasOntologySignal = ONTOLOGY_SIGNAL_KEYS.some(
    (key) => key in frontmatter,
  );
  const isOntologyIntent = hasKindKey || hasOntologySignal;

  if (!isOntologyIntent) {
    // Docs-only: nothing here claims to be an ontology node, so staying quiet is correct.
    return { ok: true, issues };
  }

  if (!hasKindKey) {
    issues.push({
      code: "missing-kind",
      severity: "warning",
      message:
        "frontmatter 에 ontology 시그널 키 (domain/capabilities/elements 등) 가 있지만 `kind:` 가 없습니다 — graph 노드로 인식되지 않습니다.",
    });
  } else if (typeof rawKind !== "string" || rawKind.trim() === "") {
    issues.push({
      code: "empty-kind",
      severity: "error",
      message: "`kind:` 값이 비어있습니다 — graph 노드로 인식되지 않습니다.",
    });
  } else if (
    !(KNOWN_VAULT_KINDS as readonly string[]).includes(rawKind.trim())
  ) {
    issues.push({
      code: "unknown-kind",
      severity: "warning",
      message: `\`kind: ${rawKind.trim()}\` 는 인식되지 않는 값입니다. 인식되는 값: ${KNOWN_VAULT_KINDS.join(" / ")}.`,
    });
  } else {
    // R14 — same advisory warning for a missing expected field on this parsed-only path.
    const trimmedKind = rawKind.trim();
    pushMissingExpectedExtrasIssues(trimmedKind, frontmatter, issues);
  }

  if (typeof rawKind === "string" && rawKind.trim()) {
    pushUidIssues(frontmatter, issues);
  }

  pushNonCanonicalGraphArrayIssues(frontmatter, issues);

  return { ok: issuesHaveNoErrors(issues), issues };
}

function pushNonCanonicalGraphArrayIssues(
  frontmatter: Record<string, unknown>,
  issues: VaultDocumentIssue[],
): void {
  for (const key of GRAPH_ARRAY_KEYS) {
    const value = frontmatter[key];
    if (!Array.isArray(value)) continue;
    const refs = value
      .filter((item): item is string => typeof item === "string")
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

export interface VaultValidationSummary {
  /** True when there are zero errors; warnings alone are still ok. */
  ok: boolean;
  total: number;
  errorCount: number;
  warningCount: number;
  /** Slug plus its issues, so the UI can show a representative sample rather than the full list. */
  issuesBySlug: Array<{ slug: string; issues: VaultDocumentIssue[] }>;
}

/**
 * Validates many vault documents' frontmatter at once and aggregates the result, so the UI
 * gets every number a banner or chip needs in one call.
 */
export function summarizeVaultValidation(
  items: ReadonlyArray<{ slug: string; frontmatter: Record<string, unknown> }>,
): VaultValidationSummary {
  let errorCount = 0;
  let warningCount = 0;
  const issuesBySlug: VaultValidationSummary["issuesBySlug"] = [];
  for (const item of items) {
    const report = validateVaultDocFrontmatter(item.frontmatter);
    if (report.issues.length === 0) continue;
    issuesBySlug.push({ slug: item.slug, issues: report.issues });
    for (const issue of report.issues) {
      if (issue.severity === "error") errorCount += 1;
      else warningCount += 1;
    }
  }
  const claims = new Map<string, string[]>();
  for (const item of items) {
    const uid = item.frontmatter.uid;
    const merged = item.frontmatter.merged_uids;
    const values = [
      ...(typeof uid === "string" && NODE_UID_RE.test(uid) ? [uid] : []),
      ...(Array.isArray(merged)
        ? merged.filter((value): value is string => typeof value === "string" && NODE_UID_RE.test(value))
        : []),
    ];
    for (const value of new Set(values)) {
      const owners = claims.get(value) ?? [];
      owners.push(item.slug);
      claims.set(value, owners);
    }
  }
  for (const [uid, owners] of claims) {
    if (owners.length < 2) continue;
    for (const slug of owners) {
      const issue: VaultDocumentIssue = {
        code: "duplicate-uid",
        severity: "error",
        message: `UID ${uid}를 다른 노드도 정체성으로 주장합니다 (${owners.filter((owner) => owner !== slug).join(", ")}).`,
      };
      const existing = issuesBySlug.find((entry) => entry.slug === slug);
      if (existing) existing.issues.push(issue);
      else issuesBySlug.push({ slug, issues: [issue] });
      errorCount += 1;
    }
  }
  return {
    ok: errorCount === 0,
    total: errorCount + warningCount,
    errorCount,
    warningCount,
    issuesBySlug,
  };
}
