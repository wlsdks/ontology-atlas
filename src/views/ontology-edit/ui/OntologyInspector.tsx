"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import type { EphemeralNode } from "../lib/use-ephemeral-nodes";
import type { VaultBacklinkMatch } from "../lib/find-vault-backlinks";

// 헌장 §11 + a11y — motion-reduce 사용자 보호. 짧은 fade 만 (transform 없음).
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
}

type InspectorTranslator = ReturnType<typeof useTranslations>;
type KindLabelResolver = (kind: string) => string;

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
  onSaveVaultRename,
  onEditVaultArrayKey,
  onEditVaultLiteral,
  onDeleteVault,
  onClearSelection,
  saving,
  collapsed = false,
  onToggleCollapsed,
}: OntologyInspectorProps) {
  const t = useTranslations("ontologyPages.edit.inspector");
  // canonical kind 라벨 — kinds.* i18n namespace 기반. 이전엔 inspector 자체
  // 의 kindLabel* 키로 중복 정의했으나 동일 값이라 정리.
  const kindLabel = useOntologyKindLabel();
  const selected = ephemeralSelected ?? vaultSelected;
  if (collapsed) {
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
            className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-elevated)]"
          >
            <ChevronLeft size={14} />
          </button>
        ) : null}
        {selected ? (
          <span
            aria-hidden
            className="rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.18)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-text-primary)]"
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
      className="flex h-full w-[320px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5 xl:w-[360px]"
    >
      <header className="flex items-center justify-between gap-2 px-1">
        <div className="flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
            {t("eyebrow")}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
            {t("subtitle")}
          </p>
        </div>
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={t("collapseAriaLabel")}
            title={t("collapseAriaLabel")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
          >
            <ChevronRight size={13} />
          </button>
        ) : null}
      </header>
      <AnimatePresence mode="wait">
        {!selected ? (
          <motion.div
            key="empty"
            {...FADE_MOTION}
            className="rounded-md border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] p-2.5"
          >
            <p className="text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
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
              saving={Boolean(saving)}
              onDeselect={onClearSelection}
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
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </aside>
  );
}

// canonical id 미리보기 — 저장 후 실제 id 와 일치. kind.{slug}.
function previewSlug(
  title: string,
  fallback: string,
  untitledPlaceholder?: string,
): string {
  const trimmed = title.trim();
  if (!trimmed) return fallback;
  if (untitledPlaceholder && trimmed === untitledPlaceholder) return fallback;
  return (
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 32) || fallback
  );
}

function EphemeralDetail({
  t,
  kindLabel,
  node,
  untitledPlaceholder,
  onRename,
  onSave,
  saving,
  onDeselect,
}: {
  t: InspectorTranslator;
  kindLabel: KindLabelResolver;
  node: EphemeralNode;
  untitledPlaceholder?: string;
  onRename: (id: string, title: string) => void;
  onSave?: (id: string) => Promise<void> | void;
  saving: boolean;
  onDeselect: () => void;
}) {
  const titleEmpty =
    node.title.trim() === "" ||
    (untitledPlaceholder !== undefined && node.title === untitledPlaceholder);
  const canSave = !titleEmpty && Boolean(onSave) && !saving;
  const fallbackPreview = t("previewSlugFallback");
  // 새 ephemeral 노드가 select 되면 name input 에 즉시 focus + 전체 선택 →
  // 사용자가 P/D/C/E 단축키로 노드 추가 후 바로 타이핑 시작 가능 (인스펙터
  // 클릭 1단계 제거). node.id 별로 한 번만 발화.
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const input = nameInputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, [node.id]);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.06)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.18)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-primary)]">
          {t("ephemeralBadge")} · {kindLabel(node.kind)}
        </span>
        <button
          type="button"
          onClick={onDeselect}
          aria-label={t("deselectAriaLabel")}
          title={t("deselectAriaLabel")}
          className="rounded-md p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
        >
          ×
        </button>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t("nameLabel")}
        </span>
        <input
          ref={nameInputRef}
          name="node-title"
          type="text"
          value={node.title}
          onChange={(e) => onRename(node.id, e.target.value)}
          onKeyDown={(e) => {
            // Enter → 즉시 저장 (canSave 조건 통과 시). 빌더 productivity 핵심 단축.
            if (e.key === "Enter" && canSave && onSave) {
              e.preventDefault();
              void onSave(node.id);
            }
          }}
          placeholder={t("namePlaceholder")}
          className="rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2.5 py-1.5 text-[13px] text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)]"
        />
      </label>
      {/* 캔버스 좌표 + 저장 시 canonical ID 미리보기 (kind.{slug 추정}) */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <p className="font-mono uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("saveIdLabel")}
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-[color:var(--color-text-tertiary)]">
            {node.kind}.{previewSlug(node.title, fallbackPreview, untitledPlaceholder)}
          </p>
        </div>
        <div>
          <p className="font-mono uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("coordinateLabel")}
          </p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-[color:var(--color-text-tertiary)]">
            ({Math.round(node.x)}, {Math.round(node.y)})
          </p>
        </div>
      </div>
      {onSave ? (
        <button
          type="button"
          onClick={() => onSave(node.id)}
          disabled={!canSave}
          aria-label={t("saveButtonAriaLabel")}
          className="inline-flex h-9 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.18)] px-3 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
        >
          {saving ? t("savingButton") : t("saveButton")}
        </button>
      ) : null}
      <p className="text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
        {titleEmpty ? t("ephemeralFooterEmpty") : t("ephemeralFooterReady")}
      </p>
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
}: {
  t: InspectorTranslator;
  kindLabel: KindLabelResolver;
  node: VaultSelected;
  backlinks: VaultBacklinkMatch[];
  onSelectBacklink?: (slug: string) => void;
  readOnly: boolean;
  isDesktopRuntime: boolean;
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
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-2)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)]">
          {readOnly ? t("dogfoodBadge") : t("vaultBadge")} · {kindLabel(node.kind)}
        </span>
        <button
          type="button"
          onClick={onDeselect}
          aria-label={t("deselectAriaLabel")}
          title={t("deselectAriaLabel")}
          className="rounded-md p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
        >
          ×
        </button>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t("vaultTitleLabel")}
        </span>
        <input
          name="vault-title"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter → 변경사항 있으면 저장 — ephemeral 인스펙터와 동일 패턴.
            if (e.key === "Enter" && canSave && onSaveRename) {
              e.preventDefault();
              void onSaveRename(node.slug, draft);
            }
          }}
          disabled={readOnly}
          className="rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2.5 py-1.5 text-[13px] text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)] disabled:opacity-60"
        />
      </label>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t("vaultSlugLabel")}
        </p>
        <p className="mt-1 break-all font-mono text-[11px] text-[color:var(--color-text-tertiary)]">
          {node.slug}
        </p>
      </div>
      {!readOnly && onSaveRename ? (
        <button
          type="button"
          onClick={() => onSaveRename(node.slug, draft)}
          disabled={!canSave}
          aria-label={t("vaultSaveAriaLabel")}
          className="inline-flex h-9 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.18)] px-3 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
        >
          {saving
            ? t("vaultSavingButton")
            : dirty
              ? t("vaultSaveButton")
              : t("vaultNoChange")}
        </button>
      ) : null}
      <p className="text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
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
      {!readOnly && onEditArrayKey ? (
        <div className="flex flex-col gap-3">
          {(
            [
              "domains",
              "capabilities",
              "elements",
              "dependencies",
              "contains",
              "describes",
              "relates",
            ] as const
          ).map((key) => (
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
      ) : readOnly ? (
        <ReadOnlyArraySummary t={t} node={node} />
      ) : null}
      {backlinks.length > 0 ? (
        <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
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
                    keys: bl.matchedKeys.join(", "),
                  })}
                  className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.55)] hover:bg-[color:rgba(94,106,210,0.16)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-elevated)]"
                >
                  <span className="break-keep">{bl.title}</span>
                  <span
                    aria-hidden
                    className="rounded-sm bg-[color:rgba(94,106,210,0.22)] px-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[color:rgba(159,170,235,0.95)]"
                  >
                    {bl.matchedKeys[0]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!readOnly && onDelete ? (
        <button
          type="button"
          onClick={() => onDelete(node.slug)}
          disabled={saving}
          aria-label={t("deleteAriaLabel")}
          className="inline-flex h-8 items-center justify-center rounded-md border border-[color:rgba(229,72,77,0.32)] bg-transparent px-3 text-[11px] text-[color:rgba(236,116,116,0.92)] transition-colors hover:border-[color:rgba(229,72,77,0.5)] hover:bg-[color:rgba(229,72,77,0.08)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(229,72,77,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-elevated)]"
        >
          {t("deleteButton")}
        </button>
      ) : null}
    </div>
  );
}

function literalLabel(t: InspectorTranslator, key: VaultLiteralKey): string {
  return key === "description" ? t("literalDescription") : t("literalDomain");
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
    "w-full rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2 py-1 text-[12px] text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)] disabled:opacity-50";
  return (
    <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2.5">
      <label
        htmlFor={`literal-${fieldKey}`}
        className="block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]"
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
      <p className="mt-1 text-[10px] text-[color:var(--color-text-quaternary)]">
        {dirty ? t("literalAutoSaveDirty") : t("literalAutoSaveClean")}
      </p>
    </div>
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
        className="block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]"
      >
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
                      ? "inline-flex items-center gap-1 rounded-full border border-[color:rgba(255,179,71,0.6)] bg-[color:rgba(255,179,71,0.16)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-primary)] transition-[background,border] duration-1000 ease-out"
                      : "inline-flex items-center gap-1 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-primary)] transition-[background,border] duration-1000 ease-out hover:border-[color:rgba(229,72,77,0.46)] hover:bg-[color:rgba(229,72,77,0.10)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(229,72,77,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-elevated)]"
                  }
                >
                  <span className="font-mono break-all">{slug}</span>
                  <span aria-hidden className="text-[color:var(--color-text-tertiary)]">
                    ×
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
          className="flex-1 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-2 py-1 font-mono text-[11px] text-[color:var(--color-text-primary)] outline-none transition-colors focus:border-[color:var(--color-indigo-brand)] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !input.trim() || values.includes(input.trim())}
          aria-label={t("arrayAddAriaLabel")}
          className="inline-flex h-7 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.18)] px-2 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-elevated)]"
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
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {arrayLabel(t, key)}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1">
            {values.map((slug) => (
              <li
                key={slug}
                className="inline-flex items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2 py-0.5 font-mono text-[11px] text-[color:var(--color-text-tertiary)]"
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
