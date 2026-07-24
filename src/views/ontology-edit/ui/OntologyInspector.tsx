"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  FileText,
  FolderOpen,
  LayoutGrid,
  Plus,
  Waypoints,
  X,
} from "lucide-react";
import { vaultFolderForKind } from "@/entities/docs-vault";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { Link } from "@/i18n/navigation";
import { slugify } from "@/shared/lib/slugify";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import type { SimilarNodeMatch } from "@/shared/lib/similar-node-title";
import { SimilarNodeWarning, Tooltip, TopologyV2KindGlyph } from "@/shared/ui";
import type { EphemeralNode } from "../lib/use-ephemeral-nodes";
import type { VaultBacklinkMatch } from "../lib/find-vault-backlinks";
import {
  resolveRelationTraceMark,
  type RelationTraceMarkStyle,
} from "../lib/relation-trace-mark";
import type { BuilderSessionDiffLine } from "../lib/builder-write-confirm-bar";
import {
  buildRelationCandidates,
  type RelationCandidateNode,
} from "../lib/builder-relation-candidates";

// 디자인 헌장 + a11y — motion-reduce 사용자 보호. 짧은 fade 만 (transform 없음).
const FADE_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: [0.42, 0, 0.58, 1] as const },
};

/**
 * 우측 inspector 패널.
 *
 * 선택된 노드의 상세를 보여주고 편집 가능한 필드는 inline 편집.
 *
 * - ephemeral 노드: 이름 inline 편집 (local state, 저장 시 vault.md 작성)
 * - vault 노드: 이름 inline 편집, 저장 시 vault.updateFrontmatter
 * - 미선택: 안내 placeholder
 */
export type VaultArrayKey =
  | "domains"
  | "capabilities"
  | "elements"
  | "dependencies"
  | "contains"
  | "describes"
  | "relates";

export type VaultLiteralKey = "description" | "domain";

export interface VaultSelected {
  slug: string;
  kind: string;
  title: string;
  /** V1.2 vault-adaptation — frontmatter scalar literals. */
  description: string;
  domain: string;
  domains: string[];
  capabilities: string[];
  elements: string[];
  dependencies: string[];
  contains: string[];
  describes: string[];
  relates: string[];
}

export interface OntologyInspectorProps {
  ephemeralSelected: EphemeralNode | null;
  vaultSelected: VaultSelected | null;
  /** 선택된 vault 노드를 frontmatter array 로 가리키는 다른 vault 노드들. */
  vaultBacklinks?: VaultBacklinkMatch[];
  /** backlink chip 클릭 시 호출 — 인스펙터를 그 노드로 점프. */
  onSelectBacklink?: (slug: string) => void;
  /** true 면 vault 가 read-only (빌드타임 dogfood 매니페스트 기반). 인스펙터의
   *  rename/array/literal/delete 모두 disabled — disk 권한 없어 patch 불가. */
  vaultReadOnly?: boolean;
  /** true 면 데스크톱 앱 런타임이라 read-only 해소 CTA 가 folder picker 로 향함. */
  isDesktopRuntime?: boolean;
  /** ephemeral 노드 생성 시 부여된 placeholder 제목 — locale 별로 다르므로
   *  (\`(이름 입력)\` / \`(enter a name)\`) caller 가 그대로 전달. previewSlug /
   *  titleEmpty 가 placeholder vs 실제 title 을 구분하는 데 사용. */
  untitledPlaceholder?: string;
  onRenameEphemeral: (id: string, title: string) => void;
  onSaveEphemeral?: (id: string) => Promise<void> | void;
  isEphemeralSaveConflict?: (kind: string, title: string) => boolean;
  getEphemeralSaveSuggestion?: (
    kind: string,
    title: string,
  ) => { title: string; path: string } | null;
  /** design-council B2 rank4 — 지금 편집 중인 ephemeral 노드와 title-근접 +
   *  kind-일치하는 기존 vault 노드가 있으면 caller 가 debounce 후 채운다.
   *  null/undefined 는 "경고 없음". */
  similarNodeMatch?: SimilarNodeMatch | null;
  /** "그 노드 열기" — 실제 vault 노드로 점프. */
  onOpenSimilarNode?: (slug: string) => void;
  /** "그래도 새로 만들기" — 경고만 닫는다, 아무것도 막지 않는다. */
  onDismissSimilarNode?: () => void;
  onSaveVaultRename?: (slug: string, nextTitle: string) => Promise<void> | void;
  onEditVaultArrayKey?: (
    slug: string,
    key: VaultArrayKey,
    next: string[],
  ) => Promise<void> | void;
  onEditVaultLiteral?: (
    slug: string,
    key: VaultLiteralKey,
    next: string,
  ) => Promise<void> | void;
  onDeleteVault?: (slug: string) => Promise<void> | void;
  onClearSelection: () => void;
  saving?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  surface?: "sidebar" | "sheet";
  /** 이 세션에서 아직 vault 에 쓰지 않은 변경 미리보기 — 고정 사이드바에서만
   *  노출 (파일 diff 프리뷰). 빌더-final 스펙 §우측 인스펙터. */
  sessionDiffLines?: BuilderSessionDiffLine[];
  /** B-3 — 저장된 엣지 클릭 시 부모가 증가시키는 토큰. 값이 바뀌면 vault
   *  상세가 관계 탭으로 포커스한다(기존 관계 편집 진입로). */
  relationsFocusToken?: number;
  /** 읽기 전용(샘플) 소스에서 "내 폴더 열기"(vault 픽커) 트리거 — 감사 #2.
   *  ephemeral 저장 버튼/Enter 힌트가 이 콜백으로 진실을 말한다. */
  onConnectSource?: () => void;
  /** 관계 추가(비-드래그 경로)용 대상 후보 — 저장된 vault 노드 목록. 감사 #3. */
  relationCandidates?: RelationCandidateNode[];
  /** "+ 관계 추가"에서 대상을 고르면 호출 — 기존 pendingRelation preflight
   *  경로(connectVaultEdge)를 그대로 재사용한다. */
  onStartRelation?: (targetSlug: string) => void;
}

type InspectorTranslator = ReturnType<typeof useTranslations>;
type KindLabelResolver = (kind: string) => string;
type VaultDetailTab = "overview" | "relations" | "document";

export function OntologyInspector({
  ephemeralSelected,
  vaultSelected,
  vaultBacklinks = [],
  onSelectBacklink,
  vaultReadOnly = false,
  isDesktopRuntime = false,
  untitledPlaceholder,
  onRenameEphemeral,
  onSaveEphemeral,
  isEphemeralSaveConflict,
  getEphemeralSaveSuggestion,
  similarNodeMatch = null,
  onOpenSimilarNode,
  onDismissSimilarNode,
  onSaveVaultRename,
  onEditVaultArrayKey,
  onEditVaultLiteral,
  onDeleteVault,
  onClearSelection,
  saving,
  collapsed = false,
  onToggleCollapsed,
  surface = "sidebar",
  sessionDiffLines = [],
  relationsFocusToken = 0,
  onConnectSource,
  relationCandidates = [],
  onStartRelation,
}: OntologyInspectorProps) {
  const t = useTranslations("ontologyPages.edit.inspector");
  // canonical kind 라벨 — kinds.* i18n namespace 기반. 이전엔 inspector 자체
  // 의 kindLabel* 키로 중복 정의했으나 동일 값이라 정리.
  const kindLabel = useOntologyKindLabel();
  const selected = ephemeralSelected ?? vaultSelected;
  if (surface === "sidebar" && collapsed) {
    return (
      <aside
        aria-label={t("ariaLabel")}
        className="flex h-full w-11 shrink-0 flex-col items-center gap-2 border-l border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] py-3"
      >
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={t("expandAriaLabel")}
            title={t("expandAriaLabel")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
          >
            <ChevronLeft size={14} />
          </button>
        ) : null}
        {selected ? (
          <span
            aria-hidden
            className="rounded-full border border-[color:var(--color-indigo-border-a46)] bg-[color:var(--color-indigo-a18)] px-1.5 py-0.5 font-mono text-caption uppercase tracking-[0.1em] text-[color:var(--color-text-primary)]"
            title={selected.title}
          >
            ●
          </span>
        ) : null}
      </aside>
    );
  }
  return (
    <aside
      aria-label={t("ariaLabel")}
      className={
        surface === "sheet"
          ? "flex max-h-[min(78dvh,760px)] w-full flex-col gap-3 overflow-y-auto bg-[color:var(--color-panel)] p-3"
          : "flex h-full w-[340px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5"
      }
    >
      <header className="flex items-center justify-between gap-2 px-1">
        <div className="flex-1">
          <p className="font-mono text-caption uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
            {t("eyebrow")}
          </p>
          <p className="mt-0.5 text-label leading-4 text-[color:var(--color-text-quaternary)]">
            {t("subtitle")}
          </p>
        </div>
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={t("collapseAriaLabel")}
            title={t("collapseAriaLabel")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
          >
            <ChevronRight size={13} />
          </button>
        ) : null}
      </header>
      {surface === "sidebar" ? (
        <section
          aria-label={t("sessionDiffAriaLabel")}
          className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5"
        >
          <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("sessionDiffTitle")}
          </p>
          {sessionDiffLines.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-1 font-mono text-label leading-5">
              {sessionDiffLines.map((line) => (
                <li
                  key={`${line.changeType}-${line.path}`}
                  className="flex min-w-0 items-center gap-1.5"
                >
                  <span
                    className={
                      line.changeType === "add"
                        ? "shrink-0 text-[color:var(--color-indigo-accent)]"
                        : "shrink-0 text-[color:var(--color-text-secondary)]"
                    }
                  >
                    {line.changeType === "add"
                      ? t("sessionDiffAdd")
                      : t("sessionDiffRelation")}
                  </span>
                  <span className="min-w-0 truncate text-[color:var(--color-text-quaternary)]">
                    {line.path}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-label leading-4 text-[color:var(--color-text-quaternary)]">
              {t("sessionDiffEmpty")}
            </p>
          )}
        </section>
      ) : null}
      <AnimatePresence mode="wait">
        {!selected ? (
          <motion.div
            key="empty"
            {...FADE_MOTION}
            className="rounded-md border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] p-2.5"
          >
            <p className="text-label leading-4 text-[color:var(--color-text-quaternary)]">
              {t("emptyHint")}
            </p>
          </motion.div>
        ) : ephemeralSelected ? (
          <motion.div key={`eph-${ephemeralSelected.id}`} {...FADE_MOTION}>
            <EphemeralDetail
              t={t}
              kindLabel={kindLabel}
              node={ephemeralSelected}
              untitledPlaceholder={untitledPlaceholder}
              onRename={onRenameEphemeral}
              onSave={onSaveEphemeral}
              isSaveConflict={isEphemeralSaveConflict}
              getSaveSuggestion={getEphemeralSaveSuggestion}
              similarNodeMatch={similarNodeMatch}
              onOpenSimilarNode={onOpenSimilarNode}
              onDismissSimilarNode={onDismissSimilarNode}
              saving={Boolean(saving)}
              onDeselect={onClearSelection}
              readOnly={vaultReadOnly}
              onConnectSource={onConnectSource}
            />
          </motion.div>
        ) : vaultSelected ? (
          <motion.div key={`vault-${vaultSelected.slug}`} {...FADE_MOTION}>
            <VaultDetail
              t={t}
              kindLabel={kindLabel}
              node={vaultSelected}
              backlinks={vaultBacklinks}
              onSelectBacklink={onSelectBacklink}
              readOnly={vaultReadOnly}
              isDesktopRuntime={isDesktopRuntime}
              onSaveRename={onSaveVaultRename}
              onEditArrayKey={onEditVaultArrayKey}
              onEditLiteral={onEditVaultLiteral}
              onDelete={onDeleteVault}
              saving={Boolean(saving)}
              onDeselect={onClearSelection}
              relationsFocusToken={relationsFocusToken}
              relationCandidates={relationCandidates}
              onStartRelation={onStartRelation}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </aside>
  );
}

// 저장 시 실제로 생성되는 vault 파일 경로 미리보기.
function previewSlug(
  title: string,
  fallback: string,
  untitledPlaceholder?: string,
): string {
  const trimmed = title.trim();
  if (!trimmed) return fallback;
  if (untitledPlaceholder && trimmed === untitledPlaceholder) return fallback;
  return slugify(trimmed) || fallback;
}

function previewVaultPath(
  kind: string,
  title: string,
  fallback: string,
  untitledPlaceholder?: string,
): string {
  const tail = previewSlug(title, fallback, untitledPlaceholder);
  return `${vaultFolderForKind(kind)}/${tail}.md`;
}

function buildDraftAgentPacket({
  kind,
  title,
  path,
}: {
  kind: string;
  title: string;
  path: string;
}): string {
  const slug = path.endsWith(".md") ? path.slice(0, -3) : path;
  const addConceptArgs = {
    slug,
    kind,
    title,
  };
  return [
    "Ontology Atlas draft ontology concept",
    `kind: ${kind}`,
    `title: ${title}`,
    `vaultPath: ${path}`,
    "",
    "MCP add_concept args:",
    JSON.stringify(addConceptArgs, null, 2),
    "",
    "After saving, verify:",
    "- validate_vault({ repoRoot })",
    "- compile_ontology({ summary: true })",
  ].join("\n");
}

function EphemeralDetail({
  t,
  kindLabel,
  node,
  untitledPlaceholder,
  onRename,
  onSave,
  isSaveConflict,
  getSaveSuggestion,
  similarNodeMatch = null,
  onOpenSimilarNode,
  onDismissSimilarNode,
  saving,
  onDeselect,
  readOnly,
  onConnectSource,
}: {
  t: InspectorTranslator;
  kindLabel: KindLabelResolver;
  node: EphemeralNode;
  untitledPlaceholder?: string;
  onRename: (id: string, title: string) => void;
  onSave?: (id: string) => Promise<void> | void;
  isSaveConflict?: (kind: string, title: string) => boolean;
  getSaveSuggestion?: (
    kind: string,
    title: string,
  ) => { title: string; path: string } | null;
  similarNodeMatch?: SimilarNodeMatch | null;
  onOpenSimilarNode?: (slug: string) => void;
  onDismissSimilarNode?: () => void;
  saving: boolean;
  onDeselect: () => void;
  /** 샘플 읽기 전용 소스 — 저장 불가. 저장 대신 vault 연결을 안내한다(감사 #2). */
  readOnly: boolean;
  onConnectSource?: () => void;
}) {
  const titleEmpty =
    node.title.trim() === "" ||
    (untitledPlaceholder !== undefined && node.title === untitledPlaceholder);
  const fallbackPreview = t("previewSlugFallback");
  const savePath = previewVaultPath(
    node.kind,
    node.title,
    fallbackPreview,
    untitledPlaceholder,
  );
  const saveConflict = !titleEmpty && Boolean(isSaveConflict?.(node.kind, node.title));
  const saveSuggestion = saveConflict
    ? getSaveSuggestion?.(node.kind, node.title) ?? null
    : null;
  const canSave = !titleEmpty && !saveConflict && Boolean(onSave) && !saving;
  const saveState = titleEmpty ? "empty" : saveConflict ? "conflict" : "ready";
  const saveStateDotClass =
    saveState === "ready"
      ? "bg-[color:var(--color-indigo-brand)]"
      : saveState === "conflict"
        ? "bg-[color:var(--color-amber-muted-a90)]"
        : "bg-[color:var(--color-text-quaternary)]";
  const saveStateLabel =
    saveState === "ready"
      ? t("ephemeralStatusReady")
      : saveState === "conflict"
        ? t("ephemeralStatusConflict")
        : t("ephemeralStatusEmpty");
  const saveStateBody = readOnly
    ? t("ephemeralFooterReadOnly")
    : saveState === "ready"
      ? t("ephemeralFooterReady")
      : saveState === "conflict"
        ? t("ephemeralFooterConflict")
        : t("ephemeralFooterEmpty");
  const { state: pathCopyState, copy: copySavePath } = useCopyFeedback(1600);
  const { state: agentPacketCopyState, copy: copyAgentPacket } =
    useCopyFeedback(1600);
  const copyPathLabel =
    pathCopyState === "copied"
      ? t("copySavePathCopied")
      : pathCopyState === "failed"
        ? t("copySavePathFailed")
        : t("copySavePath");
  const copyPathIcon =
    pathCopyState === "copied" ? (
      <Check size={12} aria-hidden />
    ) : pathCopyState === "failed" ? (
      <X size={12} aria-hidden />
    ) : (
      <Clipboard size={12} aria-hidden />
    );
  const agentPacketLabel =
    agentPacketCopyState === "copied"
      ? t("copyDraftAgentPacketCopied")
      : agentPacketCopyState === "failed"
        ? t("copyDraftAgentPacketFailed")
        : t("copyDraftAgentPacket");
  const agentPacketIcon =
    agentPacketCopyState === "copied" ? (
      <Check size={12} aria-hidden />
    ) : agentPacketCopyState === "failed" ? (
      <X size={12} aria-hidden />
    ) : (
      <Clipboard size={12} aria-hidden />
    );
  // 새 ephemeral 노드가 select 되면 name input 에 즉시 focus + 전체 선택 →
  // 사용자가 P/D/C/E 단축키/버튼으로 노드 추가 후 바로 타이핑 시작 가능
  // (인스펙터 클릭 1단계 제거). node.id 별로 한 번만 발화.
  //
  // 결정론적 autofocus (persona QA — "노드 증발"): 인스펙터가 시트
  // 다이얼로그(모바일)나 애니메이션 컨테이너 안에서 마운트되면 첫 effect
  // 프레임에 ref 가 아직 null 이거나 요소가 focusable 하지 않아 focus 가
  // 붕 떠버린다. 그 공백 프레임에 타이핑한 키가 전역 단축키로 새어 나가
  // 엉뚱한 노드가 추가되거나 캔버스가 깜빡였다. ref 가 준비되고 실제로
  // 활성 요소가 될 때까지 rAF 로 몇 프레임 재시도해 창을 닫는다.
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    let raf = 0;
    let attempts = 0;
    const MAX_ATTEMPTS = 8; // ~8 프레임 (마운트/레이아웃 안정화 여유)
    const tryFocus = () => {
      const input = nameInputRef.current;
      if (input && input.isConnected) {
        input.focus({ preventScroll: true });
        // 포커스가 실제로 이 input 에 안착했을 때만 성공 처리. 안착 실패
        // (다른 오버레이가 훔침 등)면 다음 프레임 재시도.
        if (document.activeElement === input) {
          input.select();
          return;
        }
      }
      if (attempts++ < MAX_ATTEMPTS) {
        raf = requestAnimationFrame(tryFocus);
      }
    };
    raf = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(raf);
  }, [node.id]);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[color:var(--color-indigo-a32)] bg-[color:var(--color-indigo-a06)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <TopologyV2KindGlyph kind={node.kind} size={15} />
          <span className="inline-flex items-center rounded-full border border-[color:var(--color-indigo-border-a46)] bg-[color:var(--color-indigo-a18)] px-2 py-0.5 text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-primary)]">
            {t("ephemeralBadge")} · {kindLabel(node.kind)}
          </span>
        </span>
        <button
          type="button"
          onClick={onDeselect}
          aria-label={t("deselectAriaLabel")}
          title={t("deselectAriaLabel")}
          className="rounded-md p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t("nameLabel")}
        </span>
        <input
          ref={nameInputRef}
          name="node-title"
          type="text"
          value={node.title}
          onChange={(e) => onRename(node.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // 읽기 전용 소스에선 저장이 불가하다. 예전엔 Enter 가 곧바로
            // `/download` 로 라우팅해 vault 연결을 유도했는데(감사 #2), 이름을
            // 입력하다 Enter 를 누른 사용자가 작성 중이던 드래프트를 잃고
            // 강제로 페이지를 떠나는 치명적 체감 버그였다(persona QA). 이제
            // 읽기 전용에선 Enter 가 파괴적 동작을 하지 않는다 — 드래프트는
            // 그대로 유지되고, vault 연결은 별도의 명시적 어포던스(하단
            // 쓰기-확인 바 / 연결 버튼)로만 일어난다.
            if (readOnly) {
              e.preventDefault();
              return;
            }
            // Enter → 즉시 저장 (canSave 조건 통과 시). 빌더 productivity 핵심 단축.
            if (canSave && onSave) {
              e.preventDefault();
              void onSave(node.id);
            }
          }}
          placeholder={t("namePlaceholder")}
          className="rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2.5 py-1.5 text-body text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)]"
        />
      </label>
      {/* design-council B2 rank4 — 비차단 근접 중복 경고. 타이핑 포커스는
          위 input 에 그대로 남는다(autoFocus 없음) — 렌더만으로 activeElement
          가 바뀌지 않는다. */}
      <AnimatePresence>
        {similarNodeMatch ? (
          <SimilarNodeWarning
            key={similarNodeMatch.slug}
            message={t("similarNodeWarning", { title: similarNodeMatch.title })}
            openLabel={t("similarNodeOpen")}
            createAnywayLabel={t("similarNodeCreateAnyway")}
            onOpen={() => onOpenSimilarNode?.(similarNodeMatch.slug)}
            onCreateAnyway={() => onDismissSimilarNode?.()}
          />
        ) : null}
      </AnimatePresence>
      {/* 저장 시 실제 생성될 vault 파일 경로 미리보기. 좌표(감사 #8)는
          사용자에게 의미 없는 내부 캔버스 수치라 제거했다. 파일명은 길어도
          break-all 로 4줄씩 꺾이지 않게 truncate + 전체는 title 툴팁으로
          (감사 #7) — 복사 버튼으로 정확한 전체 경로를 얻는다. */}
      <div className="min-w-0 text-caption">
        <p className="font-mono uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t("saveIdLabel")}
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <p
            className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-tertiary)]"
            title={savePath}
          >
            {savePath}
          </p>
          <button
            type="button"
            onClick={() => {
              void copySavePath(savePath);
            }}
            aria-label={t("copySavePathAriaLabel", { path: savePath })}
            title={t("copySavePathAriaLabel", { path: savePath })}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-border-a46)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a38)] focus-visible:ring-inset"
          >
            {copyPathIcon}
            <span>{copyPathLabel}</span>
          </button>
        </div>
      </div>
      {saveConflict ? (
        <div
          role="status"
          className="rounded-md border border-[color:var(--color-amber-muted-a34)] bg-[color:var(--color-amber-muted-a10)] px-2.5 py-2 text-label leading-4 text-[color:var(--color-text-secondary)]"
        >
          <p>{t("ephemeralSaveConflict", { path: savePath })}</p>
          {saveSuggestion ? (
            <button
              type="button"
              onClick={() => onRename(node.id, saveSuggestion.title)}
              className="mt-2 inline-flex h-7 items-center rounded-md border border-[color:var(--color-amber-muted-a42)] bg-[color:var(--color-amber-muted-a12)] px-2.5 text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-amber-muted-a62)] hover:bg-[color:var(--color-amber-muted-a18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-amber-muted-a42)] focus-visible:ring-inset"
            >
              {t("ephemeralUseSuggestedName", {
                title: saveSuggestion.title,
                path: saveSuggestion.path,
              })}
            </button>
          ) : null}
        </div>
      ) : null}
      {readOnly ? (
        // 샘플 읽기 전용 — "저장" 대신 vault 연결(내 폴더 열기)로 유도한다.
        // 저장 버튼을 enabled 로 두면 데모 토스트로 튕겨 거짓 약속이 된다(감사 #2).
        <button
          type="button"
          onClick={() => onConnectSource?.()}
          aria-label={t("connectSourceAriaLabel")}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-indigo-border-a46)] bg-[color:var(--color-indigo-a18)] px-3 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a66)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
        >
          <FolderOpen size={13} aria-hidden />
          {t("connectSourceButton")}
        </button>
      ) : onSave ? (
        <button
          type="button"
          onClick={() => onSave(node.id)}
          disabled={!canSave}
          aria-label={t("saveButtonAriaLabel")}
          className="inline-flex h-9 items-center justify-center rounded-md border border-[color:var(--color-indigo-border-a46)] bg-[color:var(--color-indigo-a18)] px-3 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a66)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
        >
          {saving ? t("savingButton") : t("saveButton")}
        </button>
      ) : null}
      {!titleEmpty ? (
        <button
          type="button"
          onClick={() => {
            void copyAgentPacket(
              buildDraftAgentPacket({
                kind: node.kind,
                title: node.title.trim(),
                path: savePath,
              }),
            );
          }}
          aria-label={t("copyDraftAgentPacketAriaLabel", { path: savePath })}
          title={t("copyDraftAgentPacketAriaLabel", { path: savePath })}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-border-a46)] hover:bg-[color:var(--color-indigo-a08)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a38)] focus-visible:ring-inset"
        >
          {agentPacketIcon}
          <span>{agentPacketLabel}</span>
        </button>
      ) : null}
      <div className="flex items-start gap-2 rounded-md border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2.5 py-2">
        <span
          aria-hidden
          className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${saveStateDotClass}`}
        />
        <div className="min-w-0">
          <p className="text-label font-[var(--font-weight-signature)] leading-4 text-[color:var(--color-text-secondary)]">
            {saveStateLabel}
          </p>
          <p className="mt-0.5 text-label leading-4 text-[color:var(--color-text-quaternary)]">
            {saveStateBody}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * "+ 관계 추가" — 헌장의 "drag-only discovery 금지"를 해소하는 비-드래그
 * 관계 생성 경로(감사 #3). 대상 개념을 검색해 고르면 부모의 onStartRelation
 * 이 기존 pendingRelation preflight/미리보기(RelationWriteConfirm) 흐름을
 * 그대로 연다 — 여기서 새 쓰기 로직을 만들지 않는다. 관계 종류(key)는 그
 * 미리보기 모달이 추론값 + 대안 선택으로 이어받는다.
 */
function AddRelationPicker({
  t,
  kindLabel,
  sourceSlug,
  existingTargets,
  candidates,
  onStartRelation,
}: {
  t: InspectorTranslator;
  kindLabel: KindLabelResolver;
  sourceSlug: string;
  existingTargets: string[];
  candidates: RelationCandidateNode[];
  onStartRelation: (targetSlug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = buildRelationCandidates({
    sourceSlug,
    existingTargets,
    nodes: candidates,
    query,
  });
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("addRelationAriaLabel")}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-indigo-a38)] bg-[color:var(--color-indigo-a12)] px-2.5 text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a58)] hover:bg-[color:var(--color-indigo-a18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
      >
        <Plus size={13} aria-hidden />
        {t("addRelationButton")}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a06)] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t("addRelationTitle")}
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setQuery("");
          }}
          aria-label={t("addRelationCancelAriaLabel")}
          title={t("addRelationCancelAriaLabel")}
          className="rounded-md p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
      <input
        type="text"
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("addRelationSearchPlaceholder")}
        aria-label={t("addRelationSearchAriaLabel")}
        className="rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2.5 py-1.5 text-body text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)]"
      />
      {matches.length > 0 ? (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {matches.map((candidate) => (
            <li key={candidate.slug}>
              <button
                type="button"
                onClick={() => {
                  onStartRelation(candidate.slug);
                  setOpen(false);
                  setQuery("");
                }}
                aria-label={t("addRelationSelectAriaLabel", {
                  title: candidate.title,
                })}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-label text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a38)] focus-visible:ring-inset"
              >
                <TopologyV2KindGlyph kind={candidate.kind} size={13} />
                <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
                <span className="shrink-0 font-mono text-caption uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {kindLabel(candidate.kind)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2 py-1.5 text-label leading-4 text-[color:var(--color-text-quaternary)]">
          {t("addRelationNoMatch")}
        </p>
      )}
    </div>
  );
}

function VaultDetail({
  t,
  kindLabel,
  node,
  backlinks,
  onSelectBacklink,
  readOnly,
  isDesktopRuntime,
  onSaveRename,
  onEditArrayKey,
  onEditLiteral,
  onDelete,
  saving,
  onDeselect,
  relationsFocusToken,
  relationCandidates,
  onStartRelation,
}: {
  t: InspectorTranslator;
  kindLabel: KindLabelResolver;
  node: VaultSelected;
  backlinks: VaultBacklinkMatch[];
  onSelectBacklink?: (slug: string) => void;
  readOnly: boolean;
  isDesktopRuntime: boolean;
  relationCandidates?: RelationCandidateNode[];
  onStartRelation?: (targetSlug: string) => void;
  onSaveRename?: (slug: string, nextTitle: string) => Promise<void> | void;
  onEditArrayKey?: (
    slug: string,
    key: VaultArrayKey,
    next: string[],
  ) => Promise<void> | void;
  onEditLiteral?: (
    slug: string,
    key: VaultLiteralKey,
    next: string,
  ) => Promise<void> | void;
  onDelete?: (slug: string) => Promise<void> | void;
  saving: boolean;
  onDeselect: () => void;
  relationsFocusToken?: number;
}) {
  // local draft — 사용자가 입력 중에 patch 가 일어나지 않게 buffer.
  const [draftState, setDraftState] = useState(() => ({
    slug: node.slug,
    title: node.title,
    draft: node.title,
  }));
  const draft =
    draftState.slug === node.slug && draftState.title === node.title
      ? draftState.draft
      : node.title;
  const setDraft = (next: string) => {
    setDraftState({ slug: node.slug, title: node.title, draft: next });
  };
  const trimmed = draft.trim();
  const dirty = trimmed !== "" && trimmed !== node.title;
  const canSave = !readOnly && dirty && Boolean(onSaveRename) && !saving;
  const [activeTab, setActiveTab] = useState<VaultDetailTab>("overview");
  // B-3 — 캔버스에서 저장된 엣지를 클릭하면 부모가 relationsFocusToken 을
  // 증가시킨다. 그 신호를 받아 관계 탭으로 전환해, 방금 클릭한 관계를 바로
  // 보고 유형 변경·삭제로 이어갈 수 있게 한다. token 0(초기)에는 반응 안 함.
  const relationsFocusRef = useRef(relationsFocusToken);
  useEffect(() => {
    if (relationsFocusToken === undefined) return;
    if (relationsFocusToken === relationsFocusRef.current) return;
    relationsFocusRef.current = relationsFocusToken;
    setActiveTab("relations");
  }, [relationsFocusToken]);
  // 탭 아이콘 + 툴팁 — 레이블("개요"/"관계"/"문서")은 그대로 평문 유지하고,
  // 아이콘은 스캔 속도만 돕는 보조 신호. 툴팁은 짧은 레이블만으론 처음
  // 보는 사용자에게 모호할 수 있는 탭 의미를 hover 로 한 번 더 풀어준다.
  const tabs: Array<{
    id: VaultDetailTab;
    label: string;
    hint: string;
    Icon: typeof LayoutGrid;
  }> = [
    { id: "overview", label: t("tabOverview"), hint: t("tabOverviewHint"), Icon: LayoutGrid },
    { id: "relations", label: t("tabRelations"), hint: t("tabRelationsHint"), Icon: Waypoints },
    { id: "document", label: t("tabDocument"), hint: t("tabDocumentHint"), Icon: FileText },
  ];
  const sourceDocHref = `/docs/?slug=${encodeURIComponent(node.slug)}`;
  const hierarchyCount =
    node.domains.length + node.capabilities.length + node.elements.length;
  const relationCount =
    node.dependencies.length +
    node.contains.length +
    node.describes.length +
    node.relates.length;
  const outgoingCount = hierarchyCount + relationCount;
  // 인스펙터 헤더 mono 서브타이틀 — 지도(Topology) 시안의 "kind · domain ·
  // path" 문법 그대로. domain 이 빈 프로젝트/도메인 노드는 가운데 segment 생략.
  const kindPathLine = [kindLabel(node.kind), node.domain || null, node.slug]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <TopologyV2KindGlyph kind={node.kind} size={15} />
          <span className="inline-flex items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-2)] px-2 py-0.5 text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)]">
            {readOnly ? t("dogfoodBadge") : t("vaultBadge")} · {kindLabel(node.kind)}
          </span>
        </span>
        <button
          type="button"
          onClick={onDeselect}
          aria-label={t("deselectAriaLabel")}
          title={t("deselectAriaLabel")}
          className="rounded-md p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <p className="-mt-2 truncate pl-[22px] font-mono text-label tracking-[0.02em] text-[color:var(--color-text-quaternary)]">
        {kindPathLine}
      </p>
      <div
        role="tablist"
        aria-label={t("tabsAriaLabel")}
        className="grid grid-cols-3 gap-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-1"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.Icon;
          return (
            <Tooltip key={tab.id} content={tab.hint} side="bottom">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`vault-detail-${tab.id}`}
                id={`vault-detail-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={
                  active
                    ? "flex h-7 items-center justify-center gap-1 rounded-sm bg-[color:var(--color-indigo-a22)] px-2 text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
                    : "flex h-7 items-center justify-center gap-1 rounded-sm px-2 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
                }
              >
                <Icon size={12} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 truncate">{tab.label}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>
      {activeTab === "overview" ? (
        <div
          role="tabpanel"
          id="vault-detail-overview"
          aria-labelledby="vault-detail-tab-overview"
          className="flex flex-col gap-3"
        >
          <div className="rounded-md border border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a08)] p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-label font-[var(--font-weight-signature)] leading-4 text-[color:var(--color-text-secondary)]">
                  {t("objectProofLabel")}
                </p>
                <p className="mt-1 text-label leading-4 text-[color:var(--color-text-quaternary)]">
                  {t("objectProofBody")}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-[color:var(--color-indigo-a36)] bg-[color:var(--color-indigo-a14)] px-2 py-0.5 font-mono text-caption uppercase tracking-[0.1em] text-[color:var(--color-text-primary)]">
                {t("objectProofChip")}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <div className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5">
                <p className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("objectProofOutgoing")}
                </p>
                <p className="mt-0.5 font-mono text-title text-[color:var(--color-text-primary)]">
                  {outgoingCount}
                </p>
              </div>
              <div className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5">
                <p className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("objectProofIncoming")}
                </p>
                <p className="mt-0.5 font-mono text-title text-[color:var(--color-text-primary)]">
                  {backlinks.length}
                </p>
              </div>
              <div className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5">
                <p className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("objectProofSource")}
                </p>
                <p
                  className="mt-0.5 truncate font-mono text-label text-[color:var(--color-text-primary)]"
                  title={`${node.slug}.md`}
                >
                  {node.slug}.md
                </p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("relations")}
                className="inline-flex h-8 items-center justify-center rounded-md border border-[color:var(--color-indigo-a38)] bg-[color:var(--color-indigo-a12)] px-2 text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a58)] hover:bg-[color:var(--color-indigo-a18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
              >
                {t("objectProofRelationsAction")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("document")}
                className="inline-flex h-8 items-center justify-center rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2 text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-border-a46)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a38)] focus-visible:ring-inset"
              >
                {t("objectProofDocumentAction")}
              </button>
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("vaultTitleLabel")}
            </span>
            <input
              name="vault-title"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave && onSaveRename) {
                  e.preventDefault();
                  void onSaveRename(node.slug, draft);
                }
              }}
              disabled={readOnly}
              className="rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2.5 py-1.5 text-body text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)] disabled:opacity-60"
            />
          </label>
          <div>
            <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("vaultSlugLabel")}
            </p>
            <p className="mt-1 break-all font-mono text-label text-[color:var(--color-text-tertiary)]">
              {node.slug}
            </p>
          </div>
          {!readOnly && onSaveRename ? (
            <button
              type="button"
              onClick={() => onSaveRename(node.slug, draft)}
              disabled={!canSave}
              aria-label={t("vaultSaveAriaLabel")}
              className="inline-flex h-9 items-center justify-center rounded-md border border-[color:var(--color-indigo-border-a46)] bg-[color:var(--color-indigo-a18)] px-3 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a66)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
            >
              {saving
                ? t("vaultSavingButton")
                : dirty
                  ? t("vaultSaveButton")
                  : t("vaultNoChange")}
            </button>
          ) : null}
        </div>
      ) : null}
      {activeTab === "relations" ? (
        <div
          role="tabpanel"
          id="vault-detail-relations"
          aria-labelledby="vault-detail-tab-relations"
          className="flex flex-col gap-3"
        >
          {!readOnly && onStartRelation ? (
            <AddRelationPicker
              t={t}
              kindLabel={kindLabel}
              sourceSlug={node.slug}
              existingTargets={[
                ...node.domains,
                ...node.capabilities,
                ...node.elements,
                ...node.dependencies,
                ...node.contains,
                ...node.describes,
                ...node.relates,
              ]}
              candidates={relationCandidates ?? []}
              onStartRelation={onStartRelation}
            />
          ) : null}
          {!readOnly && onEditArrayKey ? (
            <div className="flex flex-col gap-2">
              <ArrayEditorGroup
                t={t}
                title={t("arrayGroupHierarchy")}
                keys={["domains", "capabilities", "elements"]}
                node={node}
                saving={saving}
                onEditArrayKey={onEditArrayKey}
                defaultOpen
              />
              <ArrayEditorGroup
                t={t}
                title={t("arrayGroupRelations")}
                keys={["dependencies", "contains", "describes", "relates"]}
                node={node}
                saving={saving}
                onEditArrayKey={onEditArrayKey}
              />
            </div>
          ) : readOnly ? (
            <ReadOnlyArraySummary t={t} node={node} />
          ) : null}
          {backlinks.length > 0 ? (
            <BacklinksSummary
              t={t}
              backlinks={backlinks}
              onSelectBacklink={onSelectBacklink}
            />
          ) : (
            <p className="rounded-md border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-2.5 text-label leading-4 text-[color:var(--color-text-quaternary)]">
              {t("backlinksEmpty")}
            </p>
          )}
        </div>
      ) : null}
      {activeTab === "document" ? (
        <div
          role="tabpanel"
          id="vault-detail-document"
          aria-labelledby="vault-detail-tab-document"
          className="flex flex-col gap-3"
        >
          <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5">
            <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("sourceDocumentLabel")}
            </p>
            <p className="mt-1 break-all font-mono text-label text-[color:var(--color-text-tertiary)]">
              {node.slug}.md
            </p>
            <p className="mt-2 text-label leading-4 text-[color:var(--color-text-quaternary)]">
              {t("sourceDocumentHint")}
            </p>
            <Link
              href={sourceDocHref}
              className="mt-2 inline-flex h-8 items-center justify-center rounded-md border border-[color:var(--color-indigo-a42)] bg-[color:var(--color-indigo-a12)] px-3 text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a62)] hover:bg-[color:var(--color-indigo-a18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
            >
              {t("sourceDocumentAction")}
            </Link>
          </div>
          <p className="text-label leading-4 text-[color:var(--color-text-quaternary)]">
            {readOnly
              ? t(
                  isDesktopRuntime
                    ? "vaultFooterReadOnlyPicker"
                    : "vaultFooterReadOnlyDownload",
                )
              : t("vaultFooterEditable")}
          </p>
          {!readOnly && onEditLiteral ? (
            <div className="flex flex-col gap-2">
              <LiteralEditor
                t={t}
                fieldKey="domain"
                value={node.domain}
                onCommit={(next) => onEditLiteral(node.slug, "domain", next)}
                disabled={saving}
                placeholder={t("literalDomainPlaceholder")}
                multiline={false}
              />
              <LiteralEditor
                t={t}
                fieldKey="description"
                value={node.description}
                onCommit={(next) => onEditLiteral(node.slug, "description", next)}
                disabled={saving}
                placeholder={t("literalDescriptionPlaceholder")}
                multiline
              />
            </div>
          ) : null}
          {!readOnly && onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(node.slug)}
              disabled={saving}
              aria-label={t("deleteAriaLabel")}
              className="inline-flex h-8 items-center justify-center rounded-md border border-[color:var(--color-danger-a32)] bg-transparent px-3 text-label text-[color:var(--color-danger-text)] transition-colors hover:border-[color:var(--color-danger-a50)] hover:bg-[color:var(--color-danger-a08)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-danger-a50)] focus-visible:ring-inset"
            >
              {t("deleteButton")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BacklinksSummary({
  t,
  backlinks,
  onSelectBacklink,
}: {
  t: InspectorTranslator;
  backlinks: VaultBacklinkMatch[];
  onSelectBacklink?: (slug: string) => void;
}) {
  // 참조 칩의 관계 키(describes / contains / dependencies …)는 프론트매터
  // array 키와 같은 집합이라 캔버스 엣지 라벨과 같은 사전에서 지역화한다 —
  // 이전엔 raw 키를 CSS uppercase 로 올려 ko 화면에도 "DESCRIBES" 가 영문으로
  // 노출됐다(감사 #8). useRelationVocabulary 는 KnowledgeEdgeType 만 알아
  // domains/capabilities/elements/dependencies/relates 를 못 덮으므로,
  // 그 전부를 담은 edgeLabels 네임스페이스를 쓴다.
  const tEdgeKeys = useTranslations("ontologyPages.edit.canvas.edgeLabels");
  const edgeKeyLabel = (key: string): string => {
    try {
      return tEdgeKeys(
        key as
          | "domains"
          | "capabilities"
          | "elements"
          | "dependencies"
          | "relates"
          | "contains"
          | "describes",
      );
    } catch {
      return key;
    }
  };
  return (
    <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5">
      <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {t("backlinksLabel", { count: backlinks.length })}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1">
        {backlinks.map((bl) => (
          <li key={bl.slug}>
            <button
              type="button"
              onClick={() => onSelectBacklink?.(bl.slug)}
              disabled={!onSelectBacklink}
              title={t("backlinkTooltip", {
                title: bl.title,
                keys: bl.matchedKeys.map(edgeKeyLabel).join(", "),
              })}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-indigo-a32)] bg-[color:var(--color-indigo-a08)] px-2 py-0.5 text-label text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a55)] hover:bg-[color:var(--color-indigo-a16)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
            >
              <span className="break-keep">{bl.title}</span>
              <span
                aria-hidden
                className="rounded-sm bg-[color:var(--color-indigo-a22)] px-1 font-mono text-caption uppercase tracking-[0.06em] text-[color:var(--color-indigo-text-strong)]"
              >
                {edgeKeyLabel(bl.matchedKeys[0])}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function literalLabel(t: InspectorTranslator, key: VaultLiteralKey): string {
  return key === "description" ? t("literalDescription") : t("literalDomain");
}

const TRACE_MARK_DASH: Record<RelationTraceMarkStyle, string | undefined> = {
  solid: undefined,
  dashed: "3.2 3.2",
  dotted: "1.4 3.2",
};

/**
 * trace-마크 문법 — 지도(Topology) 범례와 같은 언어를 관계 타입 라벨
 * 앞에 반복한다. 실선=포함 계층 · 파선=의존/느슨한 연관 · 점선=근거.
 * 새 채색 시스템을 만들지 않도록 항상 `currentColor` 로 그린다.
 */
function RelationTraceMarkIcon({ mark }: { mark: RelationTraceMarkStyle }) {
  const dash = TRACE_MARK_DASH[mark];
  return (
    <svg
      width="18"
      height="6"
      viewBox="0 0 18 6"
      aria-hidden="true"
      className="shrink-0 text-[color:var(--color-text-quaternary)]"
    >
      <line
        x1="1"
        y1="3"
        x2="17"
        y2="3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray={dash}
      />
    </svg>
  );
}

function arrayLabel(t: InspectorTranslator, key: VaultArrayKey): string {
  switch (key) {
    case "domains":
      return t("arrayDomains");
    case "capabilities":
      return t("arrayCapabilities");
    case "elements":
      return t("arrayElements");
    case "dependencies":
      return t("arrayDependencies");
    case "contains":
      return t("arrayContains");
    case "describes":
      return t("arrayDescribes");
    case "relates":
      return t("arrayRelates");
  }
}

function LiteralEditor({
  t,
  fieldKey,
  value,
  onCommit,
  disabled,
  placeholder,
  multiline,
}: {
  t: InspectorTranslator;
  fieldKey: VaultLiteralKey;
  value: string;
  onCommit: (next: string) => void;
  disabled: boolean;
  placeholder?: string;
  multiline?: boolean;
}) {
  // local draft — 입력 중엔 vault 에 patch 안 함. blur 또는 Enter (single-line)
  // 시 commit. 사용자 변경이 file write 빈도를 결정 — 너무 자주 쓰면 IDE/editor
  // 가 잡고 있을 때 race.
  const [draftState, setDraftState] = useState(() => ({
    fieldKey,
    value,
    draft: value,
  }));
  const draft =
    draftState.fieldKey === fieldKey && draftState.value === value
      ? draftState.draft
      : value;
  const setDraft = (next: string) => {
    setDraftState({ fieldKey, value, draft: next });
  };
  const dirty = draft !== value;
  const commit = () => {
    if (!dirty || disabled) return;
    onCommit(draft);
  };
  const sharedClass =
    "w-full rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2 py-1 text-body text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)] disabled:opacity-50";
  return (
    <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5">
      <label
        htmlFor={`literal-${fieldKey}`}
        className="block font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]"
      >
        {literalLabel(t, fieldKey)}
      </label>
      {multiline ? (
        <textarea
          id={`literal-${fieldKey}`}
          name={`literal-${fieldKey}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          disabled={disabled}
          placeholder={placeholder}
          rows={2}
          className={`mt-1.5 ${sharedClass} resize-y leading-snug`}
        />
      ) : (
        <input
          id={`literal-${fieldKey}`}
          name={`literal-${fieldKey}`}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          className={`mt-1.5 ${sharedClass}`}
        />
      )}
      <p className="mt-1 text-caption text-[color:var(--color-text-quaternary)]">
        {dirty ? t("literalAutoSaveDirty") : t("literalAutoSaveClean")}
      </p>
    </div>
  );
}

/**
 * 배열 에디터 그룹 아코디언 — 7개 array 키를 계층/관계 2 그룹으로 접어 인스펙터
 * 스크롤·시각 밀도를 줄인다. summary 에 그룹 내 총 항목 수 badge. native
 * <details> 사용(닫혀도 자식 DOM 유지 → 라벨-입력 연결 보존).
 */
function ArrayEditorGroup({
  t,
  title,
  keys,
  node,
  saving,
  onEditArrayKey,
  defaultOpen,
}: {
  t: InspectorTranslator;
  title: string;
  keys: readonly VaultArrayKey[];
  node: VaultSelected;
  saving: boolean;
  onEditArrayKey: (slug: string, key: VaultArrayKey, next: string[]) => void;
  defaultOpen?: boolean;
}) {
  const count = keys.reduce((sum, key) => sum + node[key].length, 0);
  return (
    <details
      open={defaultOpen}
      className="group rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-[color:var(--color-overlay-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset">
        <span className="flex items-center gap-2">
          <ChevronRight
            size={12}
            aria-hidden
            className="text-[color:var(--color-text-quaternary)] transition-transform group-open:rotate-90"
          />
          <span className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {title}
          </span>
        </span>
        <span className="rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-2)] px-1.5 font-mono text-caption tabular-nums text-[color:var(--color-text-tertiary)]">
          {count}
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-[color:var(--color-overlay-2)] px-2.5 pb-2.5 pt-2.5">
        {keys.map((key) => (
          <ArrayKeyEditor
            t={t}
            key={key}
            fieldKey={key}
            values={node[key]}
            onChange={(next) => onEditArrayKey(node.slug, key, next)}
            disabled={saving}
          />
        ))}
      </div>
    </details>
  );
}

function ArrayKeyEditor({
  t,
  fieldKey,
  values,
  onChange,
  disabled,
}: {
  t: InspectorTranslator;
  fieldKey: VaultArrayKey;
  values: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}) {
  // 노드 변경 시 입력 buffer 초기화 — 다른 노드의 입력이 새 노드에 새 옴 안 함.
  // 이전 deps 의 \`values.join("|")\` 가 복합 표현 (lint 경고) 이라 별도
  // signature 로 추출.
  const valuesSignature = values.join("|");
  const [inputState, setInputState] = useState(() => ({
    fieldKey,
    valuesSignature,
    input: "",
  }));
  const input =
    inputState.fieldKey === fieldKey && inputState.valuesSignature === valuesSignature
      ? inputState.input
      : "";
  const setInput = (next: string) => {
    setInputState({ fieldKey, valuesSignature, input: next });
  };
  // 새 항목 추가 (vault edge 캔버스 그리기 또는 inspector 직접 입력) 시
  // 해당 chip 에 amber 잠깐 highlight → '추가됐다' 시각 인지. 1200ms 후
  // 자동 fade. ref 로 prev 추적해 useEffect deps 만 valuesSignature.
  const prevValuesRef = useRef<string[]>(values);
  const [recentlyAdded, setRecentlyAdded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(() => {
    const prev = prevValuesRef.current;
    const newOnes = values.filter((v) => !prev.includes(v));
    prevValuesRef.current = values;
    if (newOnes.length === 0) return;
    setRecentlyAdded(new Set(newOnes));
    const timer = setTimeout(() => setRecentlyAdded(new Set()), 1200);
    return () => clearTimeout(timer);
  }, [valuesSignature, values]);
  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed || values.includes(trimmed) || disabled) return;
    onChange([...values, trimmed]);
    setInput("");
  };
  const remove = (slug: string) => {
    if (disabled) return;
    onChange(values.filter((v) => v !== slug));
  };
  return (
    <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5">
      <label
        htmlFor={`array-${fieldKey}`}
        className="flex items-center gap-1.5 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]"
      >
        <RelationTraceMarkIcon mark={resolveRelationTraceMark(fieldKey)} />
        {arrayLabel(t, fieldKey)}
      </label>
      {values.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1">
          {values.map((slug) => {
            const isNew = recentlyAdded.has(slug);
            return (
              <li key={slug}>
                <button
                  type="button"
                  onClick={() => remove(slug)}
                  disabled={disabled}
                  aria-label={t("arrayRemoveAriaLabel", { slug })}
                  className={
                    isNew
                      ? "inline-flex items-center gap-1 rounded-full border border-[color:var(--color-amber-signal-a60)] bg-[color:var(--color-amber-signal-a16)] px-2 py-0.5 text-label text-[color:var(--color-text-primary)] transition-[background,border] duration-1000 ease-out"
                      : "inline-flex items-center gap-1 rounded-full border border-[color:var(--color-indigo-a32)] bg-[color:var(--color-indigo-a10)] px-2 py-0.5 text-label text-[color:var(--color-text-primary)] transition-[background,border] duration-1000 ease-out hover:border-[color:var(--color-danger-a46)] hover:bg-[color:var(--color-danger-a10)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-danger-a46)] focus-visible:ring-inset"
                  }
                >
                  <span className="font-mono break-all">{slug}</span>
                  <span aria-hidden className="text-[color:var(--color-text-tertiary)]">
                    <X size={14} aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="mt-2 flex gap-1">
        <input
          id={`array-${fieldKey}`}
          name="array-item"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          placeholder={t("arrayInputPlaceholder")}
          className="flex-1 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2 py-1 font-mono text-label text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !input.trim() || values.includes(input.trim())}
          aria-label={t("arrayAddAriaLabel")}
          className="inline-flex h-7 items-center justify-center rounded-md border border-[color:var(--color-indigo-border-a46)] bg-[color:var(--color-indigo-a18)] px-2 text-label text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a66)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * read-only 모드 (dogfood 매니페스트 기반) 의 array 키 요약. 편집 input 없이
 * chip 만 노출 — 사용자에게 "이 노드는 어떤 의존/역량을 갖는지" 정보만 전달.
 */
function ReadOnlyArraySummary({
  t,
  node,
}: {
  t: InspectorTranslator;
  node: VaultSelected;
}) {
  const sections: Array<{ key: VaultArrayKey; values: string[] }> = (
    [
      "domains",
      "capabilities",
      "elements",
      "dependencies",
      "contains",
      "describes",
      "relates",
    ] as const
  )
    .map((key) => ({ key, values: node[key] }))
    .filter((s) => s.values.length > 0);
  if (sections.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {sections.map(({ key, values }) => (
        <div
          key={key}
          className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5"
        >
          <p className="flex items-center gap-1.5 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            <RelationTraceMarkIcon mark={resolveRelationTraceMark(key)} />
            {arrayLabel(t, key)}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1">
            {values.map((slug) => (
              <li
                key={slug}
                className="inline-flex items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2 py-0.5 font-mono text-label text-[color:var(--color-text-tertiary)]"
              >
                {slug}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
