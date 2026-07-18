import { parseFrontmatter } from "./parse-frontmatter";

/**
 * Vault frontmatter 의 silent corruption 을 가시화.
 *
 * parseFrontmatter 는 lenient by-design — `---` 닫힘이 빠져도, key 가 비어
 * 있어도 조용히 빈 frontmatter 를 돌려준다. 사용자가 .md 에 frontmatter 잘못
 * 쓰면 노드가 graph 에서 *조용히 사라지고* 왜 그런지 모른다. (R9 changelog
 * Scenario 3 가 이걸 명시적으로 deferred 처리.)
 *
 * 이 validator 는 raw .md 문자열을 보고 "사용자가 frontmatter 의도했는데
 * 망가진" 패턴만 감지한다. frontmatter 자체가 아예 없는 docs 파일은 정상.
 */

export type VaultIssueSeverity = "error" | "warning";

export type VaultIssueCode =
  | "unclosed-frontmatter"
  | "empty-kind"
  | "missing-kind"
  | "unknown-kind"
  | "missing-expected-field"
  | "non-canonical-graph-array"
  | "parse-zero-keys";

/**
 * R14 — kind 별 "있어야 좋은" 필드 dict. mcp/src/schema.mjs &
 * cli/src/lib/schema.mjs 의 `requiredExtras` 와 일치 — contract test 가
 * 동기화 강제. UI/Web 측에서 advisory warning 출력에 쓰인다 (hard error
 * 아님 — pre-existing vault 호환).
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
  /** error severity 가 0 이면 true. warning 만 있으면 ok. */
  ok: boolean;
  issues: VaultDocumentIssue[];
}

/**
 * vault frontmatter 의 canonical kind 값. derive-ontology-from-vault 가
 * 인식하는 5 종과 일치. unknown 은 시스템이 만드는 stub 이라 사용자가 직접
 * 쓸 일이 없으므로 validator 에서 unknown 입력은 unknown-kind warning.
 */
export const KNOWN_VAULT_KINDS = [
  "project",
  "domain",
  "capability",
  "element",
  "document",
  "vault-readme",
] as const;

const GRAPH_ARRAY_KEYS = [
  "domains",
  "capabilities",
  "elements",
  "dependencies",
  "depends_on",
  "relates",
  "contains",
  "describes",
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

  const { frontmatter } = parseFrontmatter(raw);
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
    // R14 — kind 별 expected 필드 (capability/element 의 domain 등) 누락
    // 시 advisory warning. parser 가 raw 도 봤으니 frontmatter 객체 그대로 검사.
    const trimmedKind = rawKind.trim();
    pushMissingExpectedExtrasIssues(trimmedKind, frontmatter, issues);
  }

  pushNonCanonicalGraphArrayIssues(frontmatter, issues);

  return { ok: issuesHaveNoErrors(issues), issues };
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
 * 이미 parsed 된 frontmatter 객체만 보고 검증. UI 측 (LocalVaultProvider 의
 * VaultManifest.docs) 가 각 .md 의 raw 를 다시 안 읽고 빠르게 검증할 수 있게.
 *
 * 정밀도 차이 (vs validateVaultDocument):
 *   - unclosed-frontmatter / parse-zero-keys 는 이미 parser 가 lenient 하게
 *     처리한 결과만 보므로 *검출 불가*. CLI (scripts/validate-vault.mjs) 가
 *     raw 측 검증을 cover — 이 함수는 fast UI path.
 *   - missing-kind / empty-kind / unknown-kind 는 그대로 검출.
 *
 * 휴리스틱: frontmatter 가 비어있거나 (`kind` 가 없고 ontology 시그널 키도
 * 없으면) docs-only 파일로 간주해 skip — noise 회피. ontology 시그널 키:
 * `domain` / `domains` / `capabilities` / `elements` / `relates` / `dependencies`.
 * 이 중 하나라도 있는데 kind 가 없으면 missing-kind warning.
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
    // docs-only — 의도가 ontology 노드가 아니라 noise 회피.
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
    // R14 — kind 별 expected 필드 누락 시 advisory warning. parser
    // 결과만 보는 fast path 에서도 동일 동작.
    const trimmedKind = rawKind.trim();
    pushMissingExpectedExtrasIssues(trimmedKind, frontmatter, issues);
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
  /** error 가 0 이면 true (warning 만 있어도 ok). */
  ok: boolean;
  total: number;
  errorCount: number;
  warningCount: number;
  /** slug + 첫 issue. UI 가 풀 list 가 아닌 representative 표시에 사용. */
  issuesBySlug: Array<{ slug: string; issues: VaultDocumentIssue[] }>;
}

/**
 * 여러 vault 문서의 frontmatter 를 한번에 검증하고 합산. UI 가 banner / chip
 * 에 표시할 수치를 한 번에 받을 수 있게.
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
  return {
    ok: errorCount === 0,
    total: errorCount + warningCount,
    errorCount,
    warningCount,
    issuesBySlug,
  };
}
