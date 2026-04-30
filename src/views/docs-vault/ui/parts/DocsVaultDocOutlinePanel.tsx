import { Check, ChevronDown, Link2, Pencil, Printer, Star, Trash2 } from "lucide-react";
import type { VaultBacklinkEntry, VaultDoc } from "@/entities/docs-vault";
import { DocsVaultBacklinks } from "@/widgets/docs-vault/ui/DocsVaultBacklinks";
import { Tooltip } from "@/shared/ui";

/**
 * DocsVaultPage 의 우측 outline + 공유 + 파일 관리 + backlinks 패널 (Fire 4-d-3).
 *
 * 편집 중 (`editing=true`) 일 때는 caller 가 마운트 안 함 — Editor 가 자체 툴바
 * 사용. 따라서 본 컴포넌트는 view-only mode 전제.
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
  backlinksDetail: VaultBacklinkEntry[];
  docsBySlug: Map<string, VaultDoc>;
  onTogglePin: (slug: string) => void;
  onStartEditing: () => void;
  onCopyUrl: (slug: string) => void;
  onDeleteCurrent: () => void | Promise<void>;
  onNavigate: (slug: string) => void;
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
  backlinksDetail,
  docsBySlug,
  onTogglePin,
  onStartEditing,
  onCopyUrl,
  onDeleteCurrent,
  onNavigate,
  onHeadingClick,
}: DocsVaultDocOutlinePanelProps) {
  return (
    <aside className="hidden w-[240px] flex-none flex-col gap-6 overflow-auto border-l border-[color:var(--color-overlay-2)] px-4 py-8 lg:flex">
      <section className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onTogglePin(selectedDoc.slug)}
          className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] transition-colors ${
            pinnedSet.has(selectedDoc.slug)
              ? "border-[color:rgba(224,196,140,0.45)] bg-[color:rgba(224,196,140,0.08)] text-[color:rgba(232,200,148,0.95)]"
              : "border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(224,196,140,0.35)] hover:text-[color:rgba(232,200,148,0.9)]"
          }`}
          aria-pressed={pinnedSet.has(selectedDoc.slug)}
          title={pinnedSet.has(selectedDoc.slug) ? "고정 해제" : "이 문서 고정"}
        >
          <Star
            size={12}
            fill={pinnedSet.has(selectedDoc.slug) ? "currentColor" : "none"}
            aria-hidden
          />
          {pinnedSet.has(selectedDoc.slug) ? "고정됨" : "고정"}
        </button>
        {canEditCurrent ? (
          <Tooltip content="이 파일 편집 (로컬 볼트에 직접 저장)" withProvider={false}>
            <button
              type="button"
              onClick={onStartEditing}
              className="inline-flex items-center gap-1.5 rounded-sm border border-[color:rgba(139,151,255,0.35)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[11px] text-[color:rgba(200,210,255,0.9)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] hover:bg-[color:rgba(94,106,210,0.14)]"
            >
              <Pencil size={12} aria-hidden />
              편집
            </button>
          </Tooltip>
        ) : null}
      </section>
      <details className="group border-t border-[color:var(--color-overlay-2)] pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-sm py-1 text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.45)]">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
            공유 · 출력
          </span>
          <ChevronDown
            size={12}
            aria-hidden
            className="transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Tooltip content="이 문서로 오는 URL 을 클립보드에 복사" withProvider={false}>
            <button
              type="button"
              onClick={() => onCopyUrl(selectedDoc.slug)}
              className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] transition-colors ${
                copiedSlug === selectedDoc.slug
                  ? "border-[color:rgba(139,151,255,0.45)] bg-[color:rgba(139,151,255,0.08)] text-[color:rgba(200,210,255,0.95)]"
                  : "border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:rgba(200,210,255,0.9)]"
              }`}
            >
              {copiedSlug === selectedDoc.slug ? (
                <>
                  <Check size={12} aria-hidden />
                  복사됨
                </>
              ) : (
                <>
                  <Link2 size={12} aria-hidden />
                  링크 복사
                </>
              )}
            </button>
          </Tooltip>
          <Tooltip content="브라우저 인쇄 다이얼로그 열기 (PDF 로 저장 가능)" withProvider={false}>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") window.print();
              }}
              className="inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--color-divider)] px-2 py-1 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]"
            >
              <Printer size={12} aria-hidden />
              인쇄
            </button>
          </Tooltip>
        </div>
      </details>
      {canEditCurrent ? (
        <details className="group border-t border-[color:var(--color-overlay-2)] pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-sm py-1 text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.45)]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
              파일 관리
            </span>
            <ChevronDown
              size={12}
              aria-hidden
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="mt-3">
            <Tooltip content="이 문서를 로컬 볼트에서 삭제" withProvider={false}>
              <button
                type="button"
                onClick={() => void onDeleteCurrent()}
                className="inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--color-divider)] px-2 py-1 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(220,120,120,0.45)] hover:text-[color:rgba(240,180,180,0.95)]"
              >
                <Trash2 size={12} aria-hidden />
                삭제
              </button>
            </Tooltip>
          </div>
        </details>
      ) : null}
      {outlineHeadings.length > 0 ? (
        <section>
          {activeOutlineHeading ? (
            <div className="mb-3 rounded-md border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(94,106,210,0.06)] px-3 py-2">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                현재 섹션
              </p>
              <p
                className="mt-1 truncate text-[12px] font-medium text-[color:var(--color-text-primary)]"
                title={activeOutlineHeading.text}
              >
                {activeOutlineHeading.text}
                {activeOutlineHeading.duplicate
                  ? ` #${activeOutlineHeading.occurrence}`
                  : ""}
              </p>
            </div>
          ) : null}
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            목차
          </h3>
          <ul className="flex flex-col gap-1 text-[12px]">
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
                        ? `${h.text}, ${h.occurrence}번째 섹션`
                        : undefined
                    }
                    className={`relative block truncate rounded-sm px-1.5 py-0.5 transition-colors ${
                      isActive
                        ? "bg-[color:rgba(94,106,210,0.12)] text-[color:var(--color-text-primary)]"
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
                          aria-label={`${h.text} ${h.occurrence}번째 섹션`}
                          title={`${h.text} ${h.occurrence}번째 섹션`}
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
        </section>
      ) : null}
      {backlinksDetail.length > 0 ? (
        <details className="group border-t border-[color:var(--color-overlay-2)] pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-sm py-1 text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
              참조 · {backlinksDetail.length}
            </span>
            <ChevronDown
              size={12}
              aria-hidden
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="mt-3">
            <DocsVaultBacklinks
              entries={backlinksDetail}
              docsBySlug={docsBySlug}
              onNavigate={onNavigate}
              hideHeading
            />
          </div>
        </details>
      ) : null}
    </aside>
  );
}
