import { parseFrontmatter } from "./parse-frontmatter";
import {
  meaningFindings,
  slugOutsideKindFolderFinding,
  type MeaningFinding,
} from "./meaning-findings";

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
   * The meaning findings — the half of a node the frontmatter checks never
   * opened. They joined the three validators on 2026-09-22: the write door had
   * reported them to the agent since 2026-09-21, and nothing the *person* could
   * run said a word, so "validation is clean" and "this vault says nothing" were
   * true at the same time with only the agent able to tell.
   *
   * `folder-only-evidence` is not here. It asks the filesystem whether a cited
   * path is a directory, which a browser cannot do and a guessed repository root
   * would answer wrongly; `validate_vault` and the CLI report it where a root is
   * known.
   */
  | "definition-missing"
  | "boundary-missing"
  | "epistemic-exclusion"
  | "uncertainty-missing"
  | "slug-outside-kind-folder";

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
  // `broader` (is_a / SKOS) was introduced with the Studio surface but left out of this
  // list (found in the 2026-07-25 audit). This list drives **both** the canonical-sort
  // check and the dangling-ref check, so the omission meant an agent could write a typo'd
  // slug in `broader` and CI stayed green. A contract fixture pins the list against drift.
  "broader",
] as const;

export interface VaultDocumentOptions {
  /**
   * The document's vault-relative slug, when the caller knows where the file
   * sits. Only `slug-outside-kind-folder` needs it, and that code is a fact
   * about position rather than about bytes — so a caller holding only the text
   * is never told a node is in the wrong place.
   */
  slug?: string;
}

export function validateVaultDocument(
  raw: string,
  options: VaultDocumentOptions = {},
): VaultDocumentReport {
  const issues: VaultDocumentIssue[] = [];

  // The same normalization the parser applies (bug sweep 2026-09-01): a
  // Windows-authored `﻿---` file failed `startsWith("---")`, so this
  // validator returned ok with zero issues — missing-uid, empty-kind, even an
  // unclosed frontmatter all skipped — while the manifest and graph treated the
  // same bytes as a live node.
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
    // R14 — advisory warning for a missing expected field (e.g. `domain` on a capability
    // or element). The parser already read the raw text, so check the object directly.
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

/**
 * The slug this document is addressed by, when anybody knows it.
 *
 * The caller's value wins: it is the file's real position in the vault, while
 * `slug:` in frontmatter is a claim the document makes about itself, and a
 * document can claim the wrong one.
 */
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
 * The body half, read from the same raw text the frontmatter came out of.
 *
 * Message text is composed here rather than imported, because the two sides of
 * this port write for different readers: `mcp/src/construction-rules.mjs`
 * answers an agent mid-write and names the tool call that repairs it, while this
 * validator's messages sit beside the Korean ones this file has always spoken to
 * the person reading a screen. What the parity contract holds is the *judgement*
 * — identical code sets for identical bodies — not the sentence.
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
  diagnostics: ReadonlyArray<{ code: string; message: string }> = [],
  options: VaultDocumentOptions = {},
): VaultDocumentReport {
  const issues: VaultDocumentIssue[] = [];
  /*
   * ⚠️ **A line the parser could not read is an issue about this document** (census state 3e,
   * 2026-08-31). `parseFrontmatter` records `malformed-frontmatter-line` and
   * `malformed-quoted-scalar`, `build-local-manifest` keeps them on the doc, and
   * `validateVaultDocument` (the raw-text path, used by the CLI) reports them — but this fast
   * path never saw them, so on every screen in the app a broken line was silently dropped and
   * the document simply lost a field with nothing said. The parse already happened; the caller
   * passes what it produced rather than reading the file a second time.
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
    // R14 — same advisory warning for a missing expected field on this parsed-only path.
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
 * The only meaning finding this fast path can answer.
 *
 * ⚠️ **The other four need the body, and this function never sees one.** It
 * exists so the UI can check a whole manifest without re-reading every `.md`,
 * and the manifest keeps a flattened excerpt rather than the prose — headings,
 * placeholders and section boundaries are all gone by then, and a definition
 * check run on an excerpt would answer a different question under the same code
 * name. Half an answer under a shared code is worse than no answer: it would put
 * the app and the CLI into disagreement about one document while both claimed to
 * run "the validator". Those four stay with `validateVaultDocument`,
 * `validate_vault`, and the CLI's own validate command, which all hold the raw
 * text.
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
