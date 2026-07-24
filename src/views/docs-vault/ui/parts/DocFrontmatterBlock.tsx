import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Clipboard, Pencil } from "lucide-react";
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
import { CompactCopyButton, LastEditSubjectRow, MtimeConflictBadge } from "@/shared/ui";
import { hasDocMtimeConflict, resolveDocLastEditSubject } from "../../lib/resolve-doc-edit-subject";

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

  // ② validator warning 인라인 — 편집 중이면 draft(kind/domain), 아니면
  // 저장된 frontmatter 를 대상으로 debounce(400ms) 후 검증. "missing-expected-
  // field" 같은 warning 만 조용한 인라인 행으로 보여준다(error 는 별개 —
  // 이 슬라이스는 validator *warning* 만 다룬다).
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

  const validationWarnings = useMemo<VaultDocumentIssue[]>(() => {
    if (!debouncedValidation.kind) return [];
    const frontmatterForValidation: Record<string, unknown> = {
      ...(doc.frontmatter ?? {}),
      kind: debouncedValidation.kind,
      domain: debouncedValidation.domain,
    };
    return validateVaultDocFrontmatter(frontmatterForValidation).issues.filter(
      (issue) => issue.severity === "warning",
    );
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

  if (fields.length === 0 && codeLocations.length === 0) return null;

  const kindValue = currentKind;
  const slugValue = formatValue(doc.frontmatter?.slug) ?? doc.slug;
  const canQuickPatch =
    canEdit && Boolean(onPatch) && kindValue != null && isEditableKind(kindValue);

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

  return (
    <section
      aria-label={t("ariaLabel")}
      data-testid="doc-frontmatter-block"
      className="mx-auto mt-4 max-w-[760px] px-6 md:px-10"
    >
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-4 py-3 font-mono text-body leading-[1.85] text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]"
      >
        <summary
          data-testid="doc-frontmatter-summary"
          aria-label={open ? t("collapseAria") : t("expandAria")}
          className="flex cursor-pointer list-none items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-line-a45)]"
        >
          <ChevronRight
            size={11}
            aria-hidden
            className="flex-none text-[color:var(--color-text-quaternary)] transition-transform group-open:rotate-90"
          />
          <span aria-hidden>---</span>
          {kindValue ? (
            <>
              <span className="text-[color:var(--color-text-quaternary)]">kind:</span>
              <span className="font-semibold text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
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
                              className="rounded-sm text-[color:var(--color-indigo-pale-a90)] underline decoration-[color:var(--color-indigo-line-a35)] underline-offset-2 transition-colors hover:text-[color:var(--color-text-primary)] hover:decoration-[color:var(--color-indigo-line-a45)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[color:var(--color-indigo-line-a45)]"
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
                        ? "font-semibold text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
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
        {canQuickPatch ? (
          editing ? (
            <div className="mt-3 flex flex-col gap-2 border-t border-[color:var(--color-divider)] pt-3 font-sans">
              <label className="flex flex-col gap-1 text-label text-[color:var(--color-text-tertiary)]">
                {t("editKindLabel")}
                <select
                  value={draftKind}
                  onChange={(event) => setDraftKind(event.target.value)}
                  disabled={saving}
                  className="rounded-sm border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-body text-[color:var(--color-text-primary)]"
                >
                  {EDITABLE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kindLabel(kind)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-label text-[color:var(--color-text-tertiary)]">
                {t("editDomainLabel")}
                <select
                  value={draftDomain}
                  onChange={(event) => setDraftDomain(event.target.value)}
                  disabled={saving}
                  className="rounded-sm border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-body text-[color:var(--color-text-primary)]"
                >
                  <option value="">{t("editDomainNone")}</option>
                  {domainOptions.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-label text-[color:var(--color-text-tertiary)]">
                {t("editTitleLabel")}
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  disabled={saving}
                  className="rounded-sm border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-body text-[color:var(--color-text-primary)]"
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
                  className="rounded-sm border border-[color:var(--color-indigo-a42)] bg-[color:var(--color-indigo-a10)] px-2.5 py-1 text-label text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-indigo-a16)] disabled:opacity-60"
                >
                  {saving ? t("editSaving") : t("editSave")}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="text-label text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                >
                  {t("editCancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className="mt-2 inline-flex items-center gap-1.5 font-sans text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              <Pencil size={11} aria-hidden />
              {t("editAction")}
            </button>
          )
        ) : null}
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
      {validationWarnings.length > 0 ? (
        <div
          data-testid="doc-frontmatter-validator-warnings"
          aria-label={t("validatorWarningsAriaLabel")}
          className="mt-2 flex flex-col gap-1 font-sans"
        >
          {validationWarnings.map((issue, index) => (
            <p
              key={`${issue.code}-${index}`}
              className="rounded-sm border border-[color:var(--color-amber-docs-a18)] bg-[color:var(--color-amber-source-a08)] px-2 py-1.5 text-label leading-4 text-[color:var(--color-amber-docs-a92)]"
            >
              {mapVaultIssueCodeToPlainMessage(issue.code, issueMessageDict)}
            </p>
          ))}
        </div>
      ) : null}
      {exampleDoc ? (
        <div className="mt-2 font-sans">
          <button
            type="button"
            onClick={() => setExampleOpen((v) => !v)}
            aria-expanded={exampleOpen}
            aria-controls="doc-frontmatter-example"
            data-testid="doc-frontmatter-example-toggle"
            className="flex items-center gap-1 text-label text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
          >
            <ChevronRight
              size={11}
              aria-hidden
              className={`transition-transform duration-150 motion-reduce:transition-none ${
                exampleOpen ? "rotate-90" : ""
              }`}
            />
            {t("exampleToggle")}
          </button>
          {exampleOpen ? (
            <div
              id="doc-frontmatter-example"
              data-testid="doc-frontmatter-example"
              className="mt-2 flex items-start gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2"
            >
              <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-label leading-[1.6] text-[color:var(--color-text-secondary)]">
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
      <button
        type="button"
        onClick={() => void copy(path)}
        aria-label={copyAriaLabel}
        title={state === "copied" ? copiedLabel : copyLabel}
        data-testid="doc-frontmatter-code-location-copy"
        className="shrink-0 rounded-sm p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]"
      >
        {state === "copied" ? <Check size={11} aria-hidden /> : <Clipboard size={11} aria-hidden />}
      </button>
    </li>
  );
}
