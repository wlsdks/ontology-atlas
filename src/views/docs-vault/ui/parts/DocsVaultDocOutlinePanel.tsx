import { Check, ChevronDown, Link2, Pencil, Printer, Star, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { VaultDoc } from "@/entities/docs-vault";
import { Tooltip } from "@/shared/ui";

/**
 * DocsVaultPage 의 우측 outline + 공유 + 파일 관리 패널.
 *
 * 편집 중 (`editing=true`) 일 때는 caller 가 마운트 안 함 — Editor 가 자체 툴바
 * 사용. 따라서 본 컴포넌트는 view-only mode 전제.
 *
 * docs-vault-final 스킨부터 backlinks 는 이 패널이 아니라 pane 하단의 항상
 * 보이는 backlinks 스트립이 단일 진실원 (DocsVaultPage 의 backlinks strip).
 * 이 패널에 중복 렌더하지 않는다 — "frontmatter 가 곧 그래프" 를 한 곳에서만
 * 증명해야 스킨이 두 소스로 갈라지지 않는다.
 */

export interface OutlineHeading {
  slug: string;
  text: string;
  depth: number;
  occurrence: number;
  duplicate: boolean;
}

export interface DocsVaultDocOutlinePanelProps {
  selectedDoc: VaultDoc;
  pinnedSet: Set<string>;
  copiedSlug: string | null;
  canEditCurrent: boolean;
  outlineHeadings: OutlineHeading[];
  activeOutlineHeading: OutlineHeading | undefined;
  activeHeadingSlug: string | null;
  onTogglePin: (slug: string) => void;
  onStartEditing: () => void;
  onClose: () => void;
  onCopyUrl: (slug: string) => void;
  onDeleteCurrent: () => void | Promise<void>;
  onHeadingClick: (slug: string) => void;
}

export function DocsVaultDocOutlinePanel({
  selectedDoc,
  pinnedSet,
  copiedSlug,
  canEditCurrent,
  outlineHeadings,
  activeOutlineHeading,
  activeHeadingSlug,
  onTogglePin,
  onStartEditing,
  onClose,
  onCopyUrl,
  onDeleteCurrent,
  onHeadingClick,
}: DocsVaultDocOutlinePanelProps) {
  const t = useTranslations("vaultWidgets.parts.outline");
  const isPinned = pinnedSet.has(selectedDoc.slug);
  return (
    <aside className="hidden w-[220px] flex-none flex-col overflow-auto border-l border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-3 py-3 lg:flex">
      <section className="flex items-center justify-between gap-1.5 border-b border-[color:var(--color-overlay-2)] pb-3">
        <div className="min-w-0">
          <span className="block truncate text-[12px] font-medium text-[color:var(--color-text-secondary)]">
            {t("inspectorLabel")}
          </span>
          {activeOutlineHeading ? (
            <span className="mt-0.5 block truncate text-[10.5px] text-[color:var(--color-text-quaternary)]">
              {activeOutlineHeading.text}
            </span>
          ) : null}
        </div>
        <div className="flex flex-none items-center gap-1">
          <button
            type="button"
            onClick={() => onTogglePin(selectedDoc.slug)}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-sm border transition-colors ${
              isPinned
                ? "border-[color:rgba(224,196,140,0.45)] bg-[color:rgba(224,196,140,0.08)] text-[color:rgba(232,200,148,0.95)]"
                : "border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(224,196,140,0.35)] hover:text-[color:rgba(232,200,148,0.9)]"
            }`}
            aria-pressed={isPinned}
            aria-label={isPinned ? t("unpinTooltip") : t("pinTooltip")}
            title={isPinned ? t("unpinTooltip") : t("pinTooltip")}
          >
            <Star
              size={13}
              fill={isPinned ? "currentColor" : "none"}
              aria-hidden
            />
          </button>
          {canEditCurrent ? (
            <Tooltip content={t("editTooltip")} withProvider={false}>
              <button
                type="button"
                onClick={onStartEditing}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a08)] text-[color:rgba(200,210,255,0.9)] transition-colors hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a14)]"
                aria-label={t("edit")}
              >
                <Pencil size={13} aria-hidden />
              </button>
            </Tooltip>
          ) : null}
          <Tooltip content={t("closeTooltip")} withProvider={false}>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
              aria-label={t("closeTooltip")}
            >
              <X size={13} aria-hidden />
            </button>
          </Tooltip>
        </div>
      </section>
      {outlineHeadings.length > 0 ? (
        <details className="group border-b border-[color:var(--color-overlay-2)] py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-sm py-1 text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-line-a45)]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
              {t("tableOfContents")} · {outlineHeadings.length}
            </span>
            <ChevronDown
              size={12}
              aria-hidden
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <ul className="mt-3 flex max-h-[42vh] flex-col gap-1 overflow-auto pr-1 text-[12px]">
            {outlineHeadings.map((h, index) => {
              const isActive = activeHeadingSlug === h.slug;
              return (
                <li
                  key={`${h.slug}:${index}`}
                  style={{ paddingLeft: `${(h.depth - 2) * 10}px` }}
                >
                  <a
                    href={`#${h.slug}`}
                    onClick={(event) => {
                      event.preventDefault();
                      onHeadingClick(h.slug);
                    }}
                    aria-label={
                      h.duplicate
                        ? t("duplicateAria", { text: h.text, n: h.occurrence })
                        : undefined
                    }
                    className={`relative block truncate rounded-sm px-1.5 py-0.5 transition-colors ${
                      isActive
                        ? "bg-[color:var(--color-indigo-a12)] text-[color:var(--color-text-primary)]"
                        : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
                    }`}
                  >
                    {isActive ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0.5 left-0 w-[2px] rounded-full bg-[color:var(--color-indigo-accent)]"
                      />
                    ) : null}
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{h.text}</span>
                      {h.duplicate ? (
                        <span
                          className="inline-flex h-4 min-w-4 flex-none items-center justify-center rounded-sm border border-[color:var(--color-divider)] px-1 font-mono text-[9px] text-[color:var(--color-text-quaternary)]"
                          aria-label={t("duplicateAria", { text: h.text, n: h.occurrence })}
                          title={t("duplicateAria", { text: h.text, n: h.occurrence })}
                        >
                          #{h.occurrence}
                        </span>
                      ) : null}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
      <details className="group border-b border-[color:var(--color-overlay-2)] py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-sm py-1 text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-line-a45)]">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
            {t("shareSection")}
          </span>
          <ChevronDown
            size={12}
            aria-hidden
            className="transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Tooltip content={t("copyTooltip")} withProvider={false}>
            <button
              type="button"
              onClick={() => onCopyUrl(selectedDoc.slug)}
              className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] transition-colors ${
                copiedSlug === selectedDoc.slug
                  ? "border-[color:var(--color-indigo-line-a45)] bg-[color:var(--color-indigo-line-a06)] text-[color:rgba(200,210,255,0.95)]"
                  : "border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:rgba(200,210,255,0.9)]"
              }`}
            >
              {copiedSlug === selectedDoc.slug ? (
                <>
                  <Check size={12} aria-hidden />
                  {t("copied")}
                </>
              ) : (
                <>
                  <Link2 size={12} aria-hidden />
                  {t("copyLink")}
                </>
              )}
            </button>
          </Tooltip>
          <Tooltip content={t("printTooltip")} withProvider={false}>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") window.print();
              }}
              className="inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--color-divider)] px-2 py-1 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
            >
              <Printer size={12} aria-hidden />
              {t("print")}
            </button>
          </Tooltip>
        </div>
      </details>
      {canEditCurrent ? (
        <details className="group border-b border-[color:var(--color-overlay-2)] py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-sm py-1 text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-line-a45)]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
              {t("fileSection")}
            </span>
            <ChevronDown
              size={12}
              aria-hidden
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="mt-3">
            <Tooltip content={t("deleteTooltip")} withProvider={false}>
              <button
                type="button"
                onClick={() => void onDeleteCurrent()}
                className="inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--color-divider)] px-2 py-1 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-danger-a46)] hover:text-[color:var(--color-danger-text-strong)]"
              >
                <Trash2 size={12} aria-hidden />
                {t("deleteAction")}
              </button>
            </Tooltip>
          </div>
        </details>
      ) : null}
    </aside>
  );
}
