import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Clipboard, Pencil } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { buildNewNodeDoc, type VaultDoc } from "@/entities/docs-vault";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import type { AgentActivityStatus } from "@/features/docs-vault-local";
import { computeEditAge } from "@/shared/lib/edit-age";
import { looksLikeCodePath } from "@/shared/lib/humanize-code-path-title";
import { truncateMiddlePath } from "@/shared/lib/truncate-middle-path";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import {
  validateVaultDocFrontmatter,
  type VaultDocumentIssue,
  type VaultIssueCode,
} from "@/shared/lib/validate-vault-document";
import { mapVaultIssueCodeToPlainMessage } from "@/shared/lib/vault-issue-plain-message";
import {
  CompactCopyButton,
  IconButton,
  LastEditSubjectRow,
  MtimeConflictBadge,
  controlClass,
} from "@/shared/ui";
import { hasDocMtimeConflict, resolveDocLastEditSubject } from "../../lib/resolve-doc-edit-subject";
import { fieldClass, fieldLabel } from '@/shared/ui/control-class';

/**
 * Engraved frontmatter visualization — "frontmatter 가 곧 그래프" made literal
 * in the editor. Renders the ontology-shaped subset of `doc.frontmatter`
 * (kind/slug/title/domain/depends_on/relates_to/contains/belongs_to/evidence)
 * as a machined mono block, mirroring exactly what `deriveOntologyFromVault`
 * reads to build the topology graph.
 *
 * Only rendered when `frontmatter.kind` is present — plain guide docs (no
 * ontology kind) don't get an (empty, confusing) block.
 *
 * Collapsed by default (`<details open={false}>`) — long documents used to
 * have this block push the H1 below the first screen. Frontmatter is the
 * graph source so it's never deleted/hidden from the DOM, only collapsed;
 * the summary line still surfaces `kind` / `slug` / field count so the
 * reader knows what's inside before expanding. Caller mounts this component
 * with `key={doc.slug}` so switching documents remounts it and resets the
 * collapse state — no cross-document memory, no URL/session pollution.
 *
 * P5b — quick-patch action (.qa-scratch/docs-identity-2026-07/verdict.md
 * 더하기①, "문서함 = 의미 편집실"). When a writable local vault is loaded
 * (`canEdit` + `onPatch` supplied) and the doc's kind is one the vault
 * schema recognizes, an inline edit affordance lets the reader fix
 * kind/domain/title in place — typed fields get a typed (select) tool
 * instead of raw YAML hand-editing. Saves go through the same
 * `updateFrontmatter` conflict-guarded write path the 나침 무대
 * (`/ontology/studio`) uses for its relation writes — one write path, shared.
 */

// rank7 — 안정된 빈 Map 참조. props 로 안 넘어온 경우 매 렌더 새 Map 을
// 만들지 않도록(useMemo dep 안정성).
const EMPTY_SELF_EDIT_TIMESTAMPS: ReadonlyMap<string, number> = new Map();

const GRAPH_KEYS = [
  "kind",
  "slug",
  "title",
  "domain",
  "category",
  "status",
  "depends_on",
  "relates_to",
  "contains",
  "belongs_to",
  "evidence",
] as const;

// vault frontmatter schema 가 인식하는 편집 가능 kind 만 — vault-readme /
// unknown 같은 sentinel kind 는 이 select 로 건드리지 않는다.
const EDITABLE_KINDS = ["project", "domain", "capability", "element", "document"] as const;
type EditableKind = (typeof EDITABLE_KINDS)[number];

function isEditableKind(kind: string): kind is EditableKind {
  return (EDITABLE_KINDS as readonly string[]).includes(kind);
}

// 다른 vault 노드를 슬러그로 가리키는 참조 키 — 읽기 모드에서 해소 가능한
// 토큰은 클릭 내비게이션을 준다. evidence(파일 경로) / category / status(enum)
// 는 노드 참조가 아니라 제외한다.
const REFERENCE_KEYS = new Set<string>([
  "domain",
  "depends_on",
  "relates_to",
  "contains",
  "belongs_to",
]);

function toRefTokens(value: unknown): { tokens: string[]; isArray: boolean } {
  if (Array.isArray(value)) {
    return {
      tokens: value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean),
      isArray: true,
    };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return { tokens: trimmed ? [trimmed] : [], isArray: false };
  }
  return { tokens: [], isArray: false };
}

function formatValue(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return `[${value.join(", ")}]`;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export interface DocFrontmatterPatch {
  kind?: string;
  domain?: string | null;
  title?: string;
}

export interface DocFrontmatterBlockProps {
  doc: VaultDoc;
  /** local vault 가 쓰기 가능할 때만 true — 서버/샘플 볼트에선 읽기 전용. */
  canEdit?: boolean;
  /** capability/element 의 domain select 후보 — vault 의 `kind: domain` 문서들. */
  domainOptions?: Array<{ slug: string; title: string }>;
  /** 확정된 필드만 담아 호출 — 저장은 caller (updateFrontmatter conflict
   *  guard 경유) 책임. */
  onPatch?: (patch: DocFrontmatterPatch) => Promise<void>;
  /** 참조 슬러그를 클릭했을 때 해당 문서로 이동 — 없으면 참조는 평문. */
  onNavigate?: (slug: string) => void;
  /** 맨슬러그(frontmatter 참조 표기)를 실제 네비게이션 슬러그로 해소.
   *  null 이면 vault 에 없는 참조라 링크로 만들지 않는다. */
  resolveRef?: (token: string) => string | null;
  /** rank7 (design-council B5) — "마지막 편집 · AI 에이전트" 사실의 실데이터
   *  출처. 없으면(서버/샘플 볼트) AI 주체 행은 절대 렌더되지 않는다. */
  agentActivityStatus?: AgentActivityStatus | null;
  /** rank7 — "마지막 편집 · 나" 및 충돌 배지의 실데이터 출처. 이번 브라우저
   *  세션이 실제로 vault 쓰기 API 를 거쳐 쓴 slug 의 기록
   *  (`useLocalVault().selfEditTimestamps`). 없으면(서버/샘플 볼트) 둘 다
   *  절대 렌더되지 않는다. */
  selfEditTimestamps?: ReadonlyMap<string, number>;
}

export function DocFrontmatterBlock({
  doc,
  canEdit = false,
  domainOptions = [],
  onPatch,
  onNavigate,
  resolveRef,
  agentActivityStatus = null,
  selfEditTimestamps,
}: DocFrontmatterBlockProps) {
  const t = useTranslations("docsVault.frontmatterBlock");
  const tProvenance = useTranslations("editProvenance");
  const kindLabel = useOntologyKindLabel();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // rank7 — 이 문서를 "연" 시점의 mtime baseline + "지금" 스냅샷(렌더
  // purity — `useState(() => Date.now())` 지연 초기화는 이 앱의 기존
  // `updatedAgoNowMs` 계약과 같은 패턴, `Date.now()` 를 렌더 중 직접
  // 호출하지 않는다). 캐러가 `key={doc.slug}` 로 문서 전환마다 이 컴포넌트를
  // remount 하므로(파일 상단 docstring 참고) 둘 다 매 새 문서마다 자연스럽게
  // 새 baseline 으로 초기화된다.
  const openedMtimeRef = useRef(doc.mtime);
  const [viewOpenedAtMs] = useState(() => Date.now());
  const resolvedSelfEditTimestamps = selfEditTimestamps ?? EMPTY_SELF_EDIT_TIMESTAMPS;
  // rank7 — 실데이터 2종(heartbeat 매치 / 이번 세션 자기 쓰기)만 후보로
  // 넣는다. 둘 다 근거 없으면 null → 아래 렌더에서 주체 행 자체가 없다
  // (마케팅 칩 재탕 금지).
  const lastEditSubjectFact = useMemo(
    () =>
      resolveDocLastEditSubject({
        doc: { slug: doc.slug, path: doc.path },
        agentActivityStatus,
        selfEditTimestamps: resolvedSelfEditTimestamps,
      }),
    [doc.slug, doc.path, agentActivityStatus, resolvedSelfEditTimestamps],
  );
  const lastEditSubjectRow = (() => {
    if (!lastEditSubjectFact) return null;
    const age = computeEditAge(lastEditSubjectFact.atMs, viewOpenedAtMs);
    return {
      kind: lastEditSubjectFact.kind,
      prefixLabel: tProvenance("prefix"),
      subjectLabel: tProvenance(
        lastEditSubjectFact.kind === "agent" ? "subjectAgent" : "subjectHuman",
      ),
      ageLabel: tProvenance(`age.${age.key}`, { count: age.count }),
    };
  })();
  // rank7 — 실제 mtime mismatch 가 있을 때만 true(신호 인플레이션 금지).
  const mtimeConflict = hasDocMtimeConflict({
    doc: { slug: doc.slug, mtime: doc.mtime },
    baselineMtime: openedMtimeRef.current,
    baselineCapturedAtMs: viewOpenedAtMs,
    selfEditTimestamps: resolvedSelfEditTimestamps,
  });
  const currentKind = formatValue(doc.frontmatter?.kind);
  const currentDomain = formatValue(doc.frontmatter?.domain) ?? "";
  const currentTitle = formatValue(doc.frontmatter?.title) ?? doc.title;
  const [draftKind, setDraftKind] = useState(currentKind ?? "");
  const [draftDomain, setDraftDomain] = useState(currentDomain);
  const [draftTitle, setDraftTitle] = useState(currentTitle);

  // ② validator 진단 인라인 — 편집 중이면 draft(kind/domain), 아니면 저장된
  // frontmatter 를 대상으로 debounce(400ms) 후 검증.
  //
  // **오류도 보여 준다** (2026-08-04 정정). 종전엔 `severity === "warning"` 으로
  // 걸러서, `missing-uid`·`invalid-uid`·`empty-kind` 같은 **오류는 감추고 경고만**
  // 보여 주고 있었다 — 정확히 거꾸로다. 실측: 오류 5건짜리 폴더에서 파일 옆에
  // 뜬 것은 경고 3건뿐이었고, 노드를 지도에서 지우는 바로 그 오류들은 화면
  // 어디에도 없었다.
  const activeKind = editing ? draftKind : currentKind ?? "";
  const activeDomain = editing ? draftDomain : currentDomain;
  const [debouncedValidation, setDebouncedValidation] = useState({
    kind: activeKind,
    domain: activeDomain,
  });
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedValidation({ kind: activeKind, domain: activeDomain });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [activeKind, activeDomain]);

  const validationIssues = useMemo<VaultDocumentIssue[]>(() => {
    const stored = doc.frontmatter ?? {};
    // kind 가 아직 없으면 **저장된 frontmatter 를 그대로** 검사한다. 종전엔
    // `if (!kind) return []` 로 빠져나가서, kind 없음/빔이 노드가 사라지는 가장
    // 흔한 두 경로인데도 그 두 경우에만 화면이 침묵했다.
    const frontmatterForValidation: Record<string, unknown> = debouncedValidation.kind
      ? { ...stored, kind: debouncedValidation.kind, domain: debouncedValidation.domain }
      : stored;
    const issues = validateVaultDocFrontmatter(frontmatterForValidation).issues;
    // 오류 먼저 — 읽는 순서가 곧 손볼 순서다.
    return [
      ...issues.filter((issue) => issue.severity === "error"),
      ...issues.filter((issue) => issue.severity !== "error"),
    ];
  }, [doc.frontmatter, debouncedValidation]);

  const issueMessageDict = useMemo<Partial<Record<VaultIssueCode, string>>>(
    () => ({
      "unclosed-frontmatter": t("validatorIssues.unclosedFrontmatter"),
      "empty-kind": t("validatorIssues.emptyKind"),
      "missing-kind": t("validatorIssues.missingKind"),
      "unknown-kind": t("validatorIssues.unknownKind"),
      "missing-expected-field": t("validatorIssues.missingExpectedField"),
      "non-canonical-graph-array": t("validatorIssues.nonCanonicalGraphArray"),
      "parse-zero-keys": t("validatorIssues.parseZeroKeys"),
      // 오류 코드 넷 — 종전엔 사전에 없었다. 화면이 오류를 걸러 내고 있었으니
      // 평문도 필요 없었던 것이고, 그게 이 결함의 크기를 말해 준다.
      "missing-uid": t("validatorIssues.missingUid"),
      "invalid-uid": t("validatorIssues.invalidUid"),
      "duplicate-uid": t("validatorIssues.duplicateUid"),
      "invalid-merged-uids": t("validatorIssues.invalidMergedUids"),
      "non-canonical-merged-uids": t("validatorIssues.nonCanonicalMergedUids"),
    }),
    [t],
  );

  // ③ "규격 예시 보기" — 현재 문서 kind 의 완성 예시를, 새 문서 생성이 이미
  // 쓰는 스키마 스타터(NewDocKindDialog 선택 → buildNewNodeDoc →
  // buildVaultMarkdown)에서 그대로 파생한다. 복제 없음, 같은 원천 재사용.
  const [exampleOpen, setExampleOpen] = useState(false);
  const { state: exampleCopyState, copy: copyExample } = useCopyFeedback();
  const exampleDoc = useMemo(() => {
    if (!currentKind) return null;
    try {
      const exampleTitle = t("exampleTitleFor", { kind: kindLabel(currentKind) });
      const needsDomain = currentKind === "capability" || currentKind === "element";
      const domain = needsDomain ? domainOptions[0]?.slug ?? "example-domain" : undefined;
      return buildNewNodeDoc({ title: exampleTitle, kind: currentKind, domain }).markdown;
    } catch {
      return null;
    }
  }, [currentKind, domainOptions, kindLabel, t]);

  const fields = GRAPH_KEYS.map((key) => {
    const raw = doc.frontmatter?.[key];
    const ref = REFERENCE_KEYS.has(key) ? toRefTokens(raw) : null;
    return {
      key: key as string,
      value: formatValue(raw),
      refTokens: ref?.tokens ?? null,
      refIsArray: ref?.isArray ?? false,
    };
  }).filter(
    (f): f is {
      key: string;
      value: string;
      refTokens: string[] | null;
      refIsArray: boolean;
    } => f.value !== null,
  );

  // "코드 위치" — the REAL code evidence: raw file paths from frontmatter
  // `elements: [...]`. `elements` isn't in `GRAPH_KEYS` above (it's not a
  // single-line key:value fact, and its entries need a distinct visual
  // treatment — raw code paths are NOT vault-node references, so they must
  // not read as clickable like the `REFERENCE_KEYS` tokens above). Filtered
  // through `looksLikeCodePath` so a folder-prefixed vault ref accidentally
  // placed in `elements:` doesn't masquerade as a code path.
  const codeLocations: string[] = [];
  {
    const raw = doc.frontmatter?.elements;
    const seen = new Set<string>();
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (typeof entry !== "string") continue;
        const trimmed = entry.trim();
        if (!trimmed || seen.has(trimmed) || !looksLikeCodePath(trimmed)) continue;
        seen.add(trimmed);
        codeLocations.push(trimmed);
      }
    }
  }

  // C10 — the 공방/CREATE writer stores the node's meaning in a `definition:`
  // frontmatter key. It isn't in GRAPH_KEYS, so it used to be invisible in the
  // read view (a hidden typed fact = charter violation). Surface it as a plain,
  // always-visible lede at the top of the block so the reader sees the node's
  // meaning without expanding the frontmatter or hunting the body.
  const definitionValue = formatValue(doc.frontmatter?.definition);

  const kindValue = currentKind;

  // **kind 가 없는 문서도 자기 문제를 말한다** (2026-08-04).
  //
  // 종전에는 호출부(`DocsVaultPage`)가 `typeof kind === 'string' && kind` 로 막아
  // 블록 자체를 안 그렸다. 그런데 kind 없음/빔이 **노드가 지도에서 사라지는 가장
  // 흔한 두 경로**다 — 즉 설명이 가장 필요한 두 경우에만 화면이 침묵했다.
  //
  // 그렇다고 아무 문서에나 그리지는 않는다. 판정은 validator 가 이미 갖고 있는
  // 휴리스틱을 그대로 쓴다: `validateVaultDocFrontmatter` 는 ontology 의도가
  // 없는 문서(kind 도 없고 domain/capabilities/… 같은 시그널 키도 없는 안내
  // 문서)에는 이슈를 하나도 내지 않는다. 그래서 «이슈가 있다» 가 곧 «이 문서는
  // 노드가 되려다 실패했다» 다. 판정을 복제하지 않고 빌려 쓴다.
  const diagnosticOnly = !kindValue;
  if (diagnosticOnly && validationIssues.length === 0) return null;
  if (!diagnosticOnly && fields.length === 0 && codeLocations.length === 0 && !definitionValue) {
    return null;
  }

  const slugValue = formatValue(doc.frontmatter?.slug) ?? doc.slug;
  // kind 가 비어 있을 때도 고칠 수 있어야 한다 — 진단만 보여 주고 고칠 길이
  // 없으면 그건 막다른 문장이다.
  const canQuickPatch =
    canEdit && Boolean(onPatch) && (kindValue == null || isEditableKind(kindValue));

  function startEditing() {
    setDraftKind(currentKind ?? "");
    setDraftDomain(currentDomain);
    setDraftTitle(currentTitle);
    setError(null);
    setEditing(true);
    setOpen(true);
  }

  async function handleSave() {
    if (!onPatch) return;
    setSaving(true);
    setError(null);
    try {
      const patch: DocFrontmatterPatch = {};
      if (draftKind && draftKind !== currentKind) patch.kind = draftKind;
      if (draftTitle.trim() && draftTitle.trim() !== currentTitle) {
        patch.title = draftTitle.trim();
      }
      const nextDomain = draftDomain.trim();
      if (nextDomain !== currentDomain) {
        patch.domain = nextDomain || null;
      }
      if (Object.keys(patch).length > 0) {
        await onPatch(patch);
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  /**
   * 진단 행 — 심각도가 **색과 데이터 속성 둘 다**로 나온다.
   *
   * 색만으로 갈리면 색이 유일한 구분 채널이 되므로(헌장 위반), 오류 행은
   * 아이콘 자리의 `!` 와 라벨(「오류」/「경고」)을 함께 싣는다.
   */
  const issueRows =
    validationIssues.length > 0 ? (
      <div
        data-testid="doc-frontmatter-validator-warnings"
        aria-label={t("validatorWarningsAriaLabel")}
        className="mt-2 flex flex-col gap-1 font-sans"
      >
        {validationIssues.map((issue, index) => (
          <p
            key={`${issue.code}-${index}`}
            data-testid="doc-frontmatter-issue"
            data-severity={issue.severity}
            // 공통 기하는 한 줄로 — 심각도로 갈리는 것은 **톤뿐**이다.
            // (분기마다 클래스를 통째로 복사하면 off-ramp 유틸리티 래칫이 오른다.)
            className={`rounded-micro border px-2 py-1.5 text-label leading-label ${
              issue.severity === "error"
                ? "border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] text-[color:var(--color-status-danger)]"
                : "border-[color:var(--color-amber-docs-a18)] bg-[color:var(--color-amber-source-a08)] text-[color:var(--color-amber-docs-a92)]"
            }`}
          >
            <span className="mr-1.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)]">
              {issue.severity === "error" ? t("issueSeverityError") : t("issueSeverityWarning")}
            </span>
            {mapVaultIssueCodeToPlainMessage(issue.code, issueMessageDict)}
          </p>
        ))}
      </div>
    ) : null;

  const quickPatchSection = canQuickPatch ? (
    editing ? (
      <div className="mt-3 flex flex-col gap-2 border-t border-[color:var(--color-divider)] pt-3 font-sans">
        <label className={fieldLabel({ className: "flex flex-col gap-1" })}>
          {t("editKindLabel")}
          <select
            value={draftKind}
            onChange={(event) => setDraftKind(event.target.value)}
            disabled={saving}
            data-testid="doc-frontmatter-kind-select"
            className={fieldClass({ size: "xs" })}
          >
            {/* kind 가 아직 없는 문서는 draft 도 "" 다 — 자리표시자가 없으면
                브라우저가 첫 항목을 고른 것처럼 보여 «이미 정해졌다» 고
                거짓말한다. */}
            {draftKind === "" ? <option value="">{t("editKindUnset")}</option> : null}
            {EDITABLE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kindLabel(kind)}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldLabel({ className: "flex flex-col gap-1" })}>
          {t("editDomainLabel")}
          <select
            value={draftDomain}
            onChange={(event) => setDraftDomain(event.target.value)}
            disabled={saving}
            className={fieldClass({ size: "xs" })}
          >
            <option value="">{t("editDomainNone")}</option>
            {domainOptions.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.title}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldLabel({ className: "flex flex-col gap-1" })}>
          {t("editTitleLabel")}
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            disabled={saving}
            className={fieldClass({ size: "xs" })}
          />
        </label>
        {error ? (
          <p role="alert" className="text-label text-[color:var(--color-status-danger)]">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className={controlClass({
              shape: "chip",
              tone: "accentOnTint",
              className: "hover:bg-[color:var(--color-indigo-a16)]",
            })}
          >
            {saving ? t("editSaving") : t("editSave")}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className={controlClass({
              shape: "link",
              tone: "muted",
              className: "hover:text-[color:var(--color-text-secondary)]",
            })}
          >
            {t("editCancel")}
          </button>
        </div>
      </div>
    ) : (
      <button
        type="button"
        onClick={startEditing}
        data-testid="doc-frontmatter-edit-action"
        className={controlClass({
          shape: "link",
          className: "touch-hit-expand mt-2 font-sans hover:text-[color:var(--color-text-primary)]",
        })}
      >
        <Pencil size={ICON_SIZE.sm} aria-hidden />
        {diagnosticOnly ? t("setKindAction") : t("editAction")}
      </button>
    )
  ) : null;

  // 축약 진단 블록 — 각인 frontmatter 를 통째로 그리지 않는다. 이 문서는 아직
  // 노드가 아니라서 보여 줄 그래프 사실이 없고, 필요한 것은 «왜 지도에 없는가»
  // 한 줄과 «어디서 고치는가» 하나다.
  if (diagnosticOnly) {
    return (
      <section
        aria-label={t("diagnosticAriaLabel")}
        data-testid="doc-frontmatter-block"
        data-variant="diagnostic"
        className="mx-auto mt-4 max-w-[760px] px-6 md:px-10"
      >
        <div className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-4 py-3">
          <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t("notOnMapTitle")}
          </p>
          {/* `leading-*` 없음 — `text-label` 이 자기 행간을 싣는다. */}
          <p className="mt-1 text-label text-[color:var(--color-text-tertiary)]">
            {t("notOnMapBody")}
          </p>
          {issueRows}
          {quickPatchSection}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={t("ariaLabel")}
      data-testid="doc-frontmatter-block"
      data-variant="full"
      className="mx-auto mt-4 max-w-[760px] px-6 md:px-10"
    >
      {definitionValue ? (
        <div
          data-testid="doc-frontmatter-definition"
          className="mb-3 border-l-2 border-[color:var(--color-border-strong)] pl-3"
        >
          <div className="text-label text-[color:var(--color-text-quaternary)]">
            {t("definitionLabel")}
          </div>
          <p className="mt-0.5 text-body leading-body text-[color:var(--color-text-secondary)]">
            {definitionValue}
          </p>
        </div>
      ) : null}
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-4 py-3 font-mono text-body leading-prose text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]"
      >
        <summary
          data-testid="doc-frontmatter-summary"
          aria-label={open ? t("collapseAria") : t("expandAria")}
          className="flex list-none items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-line-a45)]"
        >
          <ChevronRight
            size={ICON_SIZE.sm}
            aria-hidden
            className="flex-none text-[color:var(--color-text-quaternary)] transition-transform group-open:rotate-90"
          />
          <span aria-hidden>---</span>
          {kindValue ? (
            <>
              <span className="text-[color:var(--color-text-quaternary)]">kind:</span>
              <span className="font-[var(--font-weight-emphasis)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
                {kindValue}
              </span>
            </>
          ) : null}
          <span className="min-w-0 truncate text-[color:var(--color-text-quaternary)]">
            slug: <span className="text-[color:var(--color-text-secondary)]">{slugValue}</span>
          </span>
          <span className="ml-auto flex-none text-[color:var(--color-text-quaternary)]">
            {t("collapsedSummary", { count: fields.length })}
          </span>
        </summary>
        <div className="mt-2 border-t border-[color:var(--color-divider)] pt-2">
          <div className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ---
          </div>
          {fields.map(({ key, value, refTokens }) => {
            const linkable =
              refTokens != null &&
              refTokens.length > 0 &&
              onNavigate != null &&
              refTokens.some((tok) => resolveRef?.(tok) != null);
            return (
              <div key={key} className="flex min-w-0 flex-wrap gap-x-1.5">
                <span className="text-[color:var(--color-text-quaternary)]">{key}:</span>
                {linkable ? (
                  <span className="min-w-0 break-words text-[color:var(--color-text-secondary)]">
                    {refTokens!.map((tok, index) => {
                      const target = resolveRef?.(tok) ?? null;
                      return (
                        <Fragment key={`${tok}-${index}`}>
                          {index > 0 ? <span aria-hidden>, </span> : null}
                          {target != null ? (
                            <button
                              type="button"
                              onClick={() => onNavigate!(target)}
                              data-testid={`doc-frontmatter-ref-${tok}`}
                              // 글줄 속 참조 컨트롤 — 종전 주석은 44 를 «WCAG 2.5.8» 이라 불렀지만
                              // 그건 2.5.5(AAA)/HIG 의 값이다(2026-08-04 바닥 재설정, 원장 「link 바닥 24」).
                              // 2.5.8(AA)의 바닥 24 를 min-h-6 으로 세운다 — 줄바꿈된 참조 행의 피치가
                              // 21 → 24 가 되어 24원 겹침(런타임 계기 실측)이 함께 풀린다. 값 층으로 못
                              // 옮기는 이유는 타입 상속이다: link 램프는 text-label 을 강제하는데 이 참조는
                              // 부모 글자 크기를 상속해야 한다(래칫 「타입 스텝을 안 내는 자리」 부채).
                              className={controlClass({ shape: "link", className: "min-h-6 rounded-chip text-[color:var(--color-indigo-pale-a90)] underline decoration-[color:var(--color-indigo-line-a35)] underline-offset-2 hover:text-[color:var(--color-text-primary)] hover:decoration-[color:var(--color-indigo-line-a45)]" })}
                            >
                              {tok}
                            </button>
                          ) : (
                            <span>{tok}</span>
                          )}
                        </Fragment>
                      );
                    })}
                  </span>
                ) : (
                  <span
                    className={
                      key === "kind"
                        ? "font-[var(--font-weight-emphasis)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
                        : "min-w-0 truncate text-[color:var(--color-text-secondary)]"
                    }
                  >
                    {value}
                  </span>
                )}
              </div>
            );
          })}
          <div className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ---
          </div>
        </div>
        {codeLocations.length > 0 ? (
          <div
            data-testid="doc-frontmatter-code-locations"
            className="mt-2 flex flex-col gap-1 border-t border-[color:var(--color-divider)] pt-2 font-sans"
          >
            <div className="flex items-center gap-1.5 text-label text-[color:var(--color-text-quaternary)]">
              <span>{t("codeLocationsHeading")}</span>
              <span className="font-mono">{codeLocations.length}</span>
            </div>
            <ul className="flex flex-col gap-0.5">
              {codeLocations.map((path) => (
                <CodeLocationRow
                  key={path}
                  path={path}
                  copyLabel={t("codeLocationsCopy")}
                  copiedLabel={t("codeLocationsCopied")}
                  copyAriaLabel={t("codeLocationsCopyAriaLabel", { path })}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {quickPatchSection}
        <p className="mt-2 flex items-center gap-1.5 text-label text-[color:var(--color-text-quaternary)]">
          <svg width="16" height="6" viewBox="0 0 16 6" aria-hidden="true" className="shrink-0">
            <line
              x1="1"
              y1="3"
              x2="15"
              y2="3"
              stroke="var(--topology-v2-edge-contains-mark, var(--color-border-strong))"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          {t("note")}
        </p>
        {/* 규격 예시는 **속성을 열었을 때** 자리를 얻는다 (2026-08-08).
            문서마다 달라지지 않는 가르치는 줄이 112개 문서 위에 상주하고
            있었다 — 읽으러 온 사람에게는 한 줄을 먹는 노이즈이고, 정작
            필요한 순간(속성이 뭘 받는지 알고 싶을 때)은 이 속성 블록을
            여는 순간이다. 그 순간으로 옮긴다. */}
        {exampleDoc ? (
          <div className="mt-2 font-sans">
            <button
              type="button"
              onClick={() => setExampleOpen((v) => !v)}
              aria-expanded={exampleOpen}
              aria-controls="doc-frontmatter-example"
              data-testid="doc-frontmatter-example-toggle"
              className={controlClass({
                shape: "link",
                tone: "muted",
                className: "touch-hit-expand hover:text-[color:var(--color-text-secondary)]",
              })}
            >
              <ChevronRight
                size={ICON_SIZE.sm}
                aria-hidden
                className={`transition-transform motion-reduce:transition-none ${
                  exampleOpen ? "rotate-90" : ""
                }`}
              />
              {t("exampleToggle")}
            </button>
            {exampleOpen ? (
              <div
                id="doc-frontmatter-example"
                data-testid="doc-frontmatter-example"
                className="mt-2 flex items-start gap-2 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2"
              >
                <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-label leading-label text-[color:var(--color-text-secondary)]">
                  {exampleDoc}
                </pre>
                <CompactCopyButton
                  copied={exampleCopyState === "copied"}
                  label={exampleCopyState === "copied" ? t("exampleCopied") : t("exampleCopy")}
                  ariaLabel={t("exampleCopyAriaLabel")}
                  onClick={() => void copyExample(exampleDoc)}
                  data-testid="doc-frontmatter-example-copy"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </details>
      {lastEditSubjectRow ? (
        <div className="mt-2 font-sans">
          <LastEditSubjectRow
            kind={lastEditSubjectRow.kind}
            prefixLabel={lastEditSubjectRow.prefixLabel}
            subjectLabel={lastEditSubjectRow.subjectLabel}
            ageLabel={lastEditSubjectRow.ageLabel}
          />
        </div>
      ) : null}
      {mtimeConflict ? (
        <div className="mt-2 font-sans">
          <MtimeConflictBadge message={tProvenance("conflictMessage")} />
        </div>
      ) : null}
      {issueRows}
    </section>
  );
}

/**
 * One "코드 위치" row — a raw code path (truncated middle, full path on
 * hover) + a per-row copy button. Deliberately plain text, not a `Link`/
 * button like the `REFERENCE_KEYS` ref tokens above — a code path isn't a
 * vault node, so it must not visually promise navigation it can't deliver.
 */
function CodeLocationRow({
  path,
  copyLabel,
  copiedLabel,
  copyAriaLabel,
}: {
  path: string;
  copyLabel: string;
  copiedLabel: string;
  copyAriaLabel: string;
}) {
  const { state, copy } = useCopyFeedback();
  return (
    <li className="flex items-center gap-2 py-0.5">
      <span
        title={path}
        className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-tertiary)]"
      >
        {truncateMiddlePath(path)}
      </span>
      <IconButton
        label={copyAriaLabel}
        size="sm"
        tone="muted"
        onClick={() => void copy(path)}
        title={state === "copied" ? copiedLabel : copyLabel}
        data-testid="doc-frontmatter-code-location-copy"
        className="hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]"
      >
        {state === "copied" ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
      </IconButton>
    </li>
  );
}
