import { parseFrontmatter } from "./parse-frontmatter";
import {
  meaningFindings,
  slugOutsideKindFolderFinding,
  type MeaningFinding,
} from "./meaning-findings";

/**
 * `parseFrontmatter` is lenient, so broken frontmatter silently drops a node from the graph. This
 * reports only patterns where the author intended frontmatter and broke it; none at all is normal.
 */

type VaultIssueSeverity = "error" | "warning";

export type VaultIssueCode =
  | "unclosed-frontmatter"
  | "malformed-frontmatter-line"
  | "malformed-quoted-scalar"
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
  | "parse-zero-keys"
  /*
   * `folder-only-evidence` is absent: it asks the filesystem whether a path is a directory, which a
   * browser cannot do; `validate_vault` reports it.
   */
  | "definition-missing"
  | "boundary-missing"
  | "epistemic-exclusion"
  | "uncertainty-missing"
  | "slug-outside-kind-folder";

/**
 * Matches `requiredExtras` in `mcp/src/schema.mjs` (a contract test keeps them in sync). Advisory warnings only, so existing vaults stay valid.
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
  ok: boolean;
  issues: VaultDocumentIssue[];
}

/** `unknown` is a stub the system mints, never user input, so as input it is an unknown kind. */
const KNOWN_VAULT_KINDS = [
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
  // This list drives both the canonical-sort check and the dangling-ref check; a contract fixture
  // pins it against drift.
  "broader",
] as const;

export interface VaultDocumentOptions {
  /** Only `slug-outside-kind-folder` needs it; a caller holding only text is never told a node is misplaced. */
  slug?: string;
}

export function validateVaultDocument(
  raw: string,
  options: VaultDocumentOptions = {},
): VaultDocumentReport {
  const issues: VaultDocumentIssue[] = [];

  // Same normalization as the parser: a BOM or CRLF file must not fail `startsWith("---")` and skip
  // every check.
  raw = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
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

  const { frontmatter, body = "", diagnostics = [] } = parseFrontmatter(raw);
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
  const isArchitectureProfile =
    frontmatter.architecture_schema === "architecture-profile/v1";

  if (!hasKindKey) {
    if (!isArchitectureProfile) {
      issues.push({
        code: "missing-kind",
        severity: "warning",
        message:
          "frontmatter 에 `kind:` 가 없습니다 — graph 노드가 되려면 kind 가 필요합니다.",
      });
    }
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
    const trimmedKind = rawKind.trim();
    pushMissingExpectedExtrasIssues(trimmedKind, frontmatter, issues);
  }

  if (typeof rawKind === "string" && rawKind.trim()) {
    pushUidIssues(frontmatter, issues);
  }

  pushNonCanonicalGraphArrayIssues(frontmatter, issues);
  pushMeaningIssues(frontmatter, body, resolveDocumentSlug(frontmatter, options), issues);

  return { ok: issuesHaveNoErrors(issues), issues };
}

/** The caller's value is the file's real position, so it wins over the document's own `slug:` claim. */
function resolveDocumentSlug(
  frontmatter: Record<string, unknown>,
  options: VaultDocumentOptions,
): string {
  const given = typeof options.slug === "string" ? options.slug.trim() : "";
  if (given) return given;
  const declared = typeof frontmatter.slug === "string" ? frontmatter.slug.trim() : "";
  return declared;
}

/**
 * Messages are composed here, not imported from `mcp/src/construction/construction-rules.mjs`,
 * which addresses an agent; the parity contract holds the code sets, not the sentences.
 */
function pushMeaningIssues(
  frontmatter: Record<string, unknown>,
  body: string,
  slug: string,
  issues: VaultDocumentIssue[],
): void {
  const rawKind = frontmatter.kind;
  const kind = typeof rawKind === "string" ? rawKind.trim() : "";
  if (!kind || !(KNOWN_VAULT_KINDS as readonly string[]).includes(kind)) return;
  const title = typeof frontmatter.title === "string" ? frontmatter.title : "";
  for (const finding of meaningFindings({ kind, slug, title, body })) {
    issues.push({
      code: finding.code,
      severity: "warning",
      message: meaningFindingMessage(finding, kind, slug),
    });
  }
}

/** The one sentence each meaning finding says to a person reading a screen. */
function meaningFindingMessage(
  finding: MeaningFinding,
  kind: string,
  slug: string,
): string {
  switch (finding.code) {
    case "definition-missing":
      return `본문이 이 ${kind} 가 무엇인지 말하지 않습니다 — 첫 \`##\` 앞이나 \`## Definition\` 아래에, 제목을 되풀이하지 않는 한 문장을 쓰세요.`;
    case "boundary-missing":
      return finding.key === "excludes"
        ? "`## Excludes` 에 내용이 없습니다 — 이 개념과 혼동되지만 아닌 것을 한 줄 적으세요. 코드에는 남지 않는 절반입니다."
        : "`## Includes` 에 내용이 없습니다 — 이 개념이 실제로 무엇을 포함하는지 한 줄 적으세요.";
    case "uncertainty-missing":
      return "`## Uncertainty` 가 비어 있어 본문이 완결된 것처럼 읽힙니다 — 읽지 않은 파일이나 확인하지 못한 것을 적으세요. (`## Open questions` · `## Unknowns` · `## Not checked` · `## Confidence` 도 같은 칸입니다.)";
    case "epistemic-exclusion":
      return `\`## Excludes\` 의 ${finding.refs.length}개 항목이 제품의 경계가 아니라 "확인하지 못했다"는 사실을 말합니다 (${finding.refs[0] ?? ""}). \`## Uncertainty\` 로 옮기세요.`;
    case "slug-outside-kind-folder":
      return `\`${slug}\` 는 kind=${kind} 인데 종류 폴더 밖 vault 루트에 있습니다 — 다른 ${kind} 들은 \`${finding.refs[0] ?? ""}\` 처럼 읽힙니다. 유효하지만 어떤 묶음에도 들어가지 않습니다.`;
    default:
      return "";
  }
}

/**
 * Parser diagnostics that are vault issues in their own right. Both mean the
 * author wrote frontmatter the reader cannot honour, so both are errors — the
 * same set `mcp/src/validate.mjs` surfaces.
 */
const SURFACED_DIAGNOSTIC_CODES = new Set<VaultIssueCode>([
  "malformed-frontmatter-line",
  "malformed-quoted-scalar",
]);

function pushFrontmatterDiagnostics(
  diagnostics: ReadonlyArray<{ code: string; message: string }>,
  issues: VaultDocumentIssue[],
): void {
  for (const diagnostic of diagnostics) {
    if (!SURFACED_DIAGNOSTIC_CODES.has(diagnostic.code as VaultIssueCode)) continue;
    issues.push({
      code: diagnostic.code as VaultIssueCode,
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
 * Parsed frontmatter alone cannot show unclosed frontmatter or a zero-key parse; the raw
 * validators cover those. Neither `kind` nor any signal key below means a docs-only file.
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
  diagnostics: ReadonlyArray<{ code: string; message: string }> = [],
  options: VaultDocumentOptions = {},
): VaultDocumentReport {
  const issues: VaultDocumentIssue[] = [];
  /*
   * The caller passes the parser's diagnostics so the file is not parsed twice; unreadable lines
   * surface as issues on the document.
   */
  pushFrontmatterDiagnostics(diagnostics, issues);
  const hasKindKey = "kind" in frontmatter;
  const rawKind = frontmatter.kind;
  const isArchitectureProfile =
    frontmatter.architecture_schema === "architecture-profile/v1";
  const hasOntologySignal = ONTOLOGY_SIGNAL_KEYS.some(
    (key) => key in frontmatter,
  );
  const isOntologyIntent = hasKindKey || (hasOntologySignal && !isArchitectureProfile);

  if (!isOntologyIntent) {
    // Docs-only: nothing here claims to be an ontology node, so staying quiet is correct — except
    // about a line that could not be read, which is broken whatever the file was meant to be.
    return { ok: issuesHaveNoErrors(issues), issues };
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
    const trimmedKind = rawKind.trim();
    pushMissingExpectedExtrasIssues(trimmedKind, frontmatter, issues);
  }

  if (typeof rawKind === "string" && rawKind.trim()) {
    pushUidIssues(frontmatter, issues);
  }

  pushNonCanonicalGraphArrayIssues(frontmatter, issues);
  pushPositionIssue(frontmatter, resolveDocumentSlug(frontmatter, options), issues);

  return { ok: issuesHaveNoErrors(issues), issues };
}

/**
 * The only meaning finding without the body: the manifest's flattened excerpt would make the
 * others answer a different question under the same code, and the app would contradict `validate_vault`.
 */
function pushPositionIssue(
  frontmatter: Record<string, unknown>,
  slug: string,
  issues: VaultDocumentIssue[],
): void {
  const rawKind = frontmatter.kind;
  const kind = typeof rawKind === "string" ? rawKind.trim() : "";
  if (!kind || !(KNOWN_VAULT_KINDS as readonly string[]).includes(kind)) return;
  const finding = slugOutsideKindFolderFinding({ kind, slug });
  if (!finding) return;
  issues.push({
    code: finding.code,
    severity: "warning",
    message: meaningFindingMessage(finding, kind, slug),
  });
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
  ok: boolean;
  total: number;
  errorCount: number;
  warningCount: number;
  /** Slug plus its issues, so the UI can show a representative sample rather than the full list. */
  issuesBySlug: Array<{ slug: string; issues: VaultDocumentIssue[] }>;
}

export function summarizeVaultValidation(
  items: ReadonlyArray<{
    slug: string;
    frontmatter: Record<string, unknown>;
    /** What the parser could not read in this document, straight from the manifest it built. */
    diagnostics?: ReadonlyArray<{ code: string; message: string }>;
  }>,
): VaultValidationSummary {
  let errorCount = 0;
  let warningCount = 0;
  const issuesBySlug: VaultValidationSummary["issuesBySlug"] = [];
  for (const item of items) {
    const report = validateVaultDocFrontmatter(item.frontmatter, item.diagnostics);
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
  let firstIssueBySlug: Map<string, (typeof issuesBySlug)[number]> | null = null;
  for (const [uid, owners] of claims) {
    if (owners.length < 2) continue;
    if (firstIssueBySlug === null) {
      firstIssueBySlug = new Map();
      for (const row of issuesBySlug) {
        if (!firstIssueBySlug.has(row.slug)) firstIssueBySlug.set(row.slug, row);
      }
    }
    for (const slug of owners) {
      const issue: VaultDocumentIssue = {
        code: "duplicate-uid",
        severity: "error",
        message: `UID ${uid}를 다른 노드도 정체성으로 주장합니다 (${owners.filter((owner) => owner !== slug).join(", ")}).`,
      };
      const existing = firstIssueBySlug.get(slug);
      if (existing) existing.issues.push(issue);
      else {
        const row = { slug, issues: [issue] };
        issuesBySlug.push(row);
        firstIssueBySlug.set(slug, row);
      }
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
