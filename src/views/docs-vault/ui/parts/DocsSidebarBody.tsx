import { useMemo } from "react";
import { Clock, FileText, Pin, PinOff, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";
import { DocsVaultTags } from "@/widgets/docs-vault/ui/DocsVaultTags";
import { DocsVaultTree } from "@/widgets/docs-vault/ui/DocsVaultTree";
import { Tooltip } from "@/shared/ui";

/**
 * DocsVaultPage 의 사이드바 본문.
 *
 * 핀 / 최근 / 트리 / 태그 4 영역. 모바일은 drawer 안, 데스크톱은 left rail.
 *
 * onSelect 콜백은 caller 가 `setMobileTreeOpen(false)` 와 함께 wrapping —
 * 컴포넌트 내부엔 mobile 가시 상태 의존 없음 (자립적).
 */
export interface DocsSidebarBodyProps {
  pinnedSlugs: string[];
  recentSlugs: string[];
  selectedSlug: string | null;
  docsBySlug: Map<string, VaultDoc>;
  activeTag: string | null;
  manifest: VaultManifest;
  onSelect: (slug: string) => void;
  onTogglePin: (slug: string) => void;
  onTagSelect: (tag: string | null) => void;
}

export function DocsSidebarBody({
  pinnedSlugs,
  recentSlugs,
  selectedSlug,
  docsBySlug,
  activeTag,
  manifest,
  onSelect,
  onTogglePin,
  onTagSelect,
}: DocsSidebarBodyProps) {
  const t = useTranslations("vaultWidgets.parts.sidebar");
  // 활성 태그가 매치하는 slug 집합 — DocsVaultTree 가 매 노드 재귀 시 .has()
  // 로 조회. 매 render 새 Set 만들면 트리 내부 useMemo 들이 활성/해제 무관
  // invalidate 되므로 부모에서 안정화. activeTag 가 null 이면 undefined
  // (트리가 필터 자체 skip).
  const activeTagSlugs = useMemo(
    () =>
      activeTag ? new Set(manifest.tags[activeTag] ?? []) : undefined,
    [activeTag, manifest.tags],
  );
  const hasCollections = pinnedSlugs.length > 0 || recentSlugs.length > 0;
  const collectionSummary = [
    pinnedSlugs.length > 0 ? t("pinnedHeader", { count: pinnedSlugs.length }) : null,
    recentSlugs.length > 0 ? t("recentHeader", { count: recentSlugs.length }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-none items-center justify-between gap-2 border-b border-[color:var(--color-overlay-2)] px-3 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-[12px] font-medium text-[color:var(--color-text-primary)]">
              {t("treeHeader")}
            </h2>
            <p className="mt-0.5 truncate text-[10.5px] text-[color:var(--color-text-quaternary)]">
              {activeTag
                ? t("treeFiltered", { tag: activeTag })
                : t("treeCount", { count: manifest.docs.length })}
            </p>
          </div>
          {activeTag ? (
            <button
              type="button"
              onClick={() => onTagSelect(null)}
              className="flex-none rounded-sm border border-[color:rgba(139,151,255,0.24)] px-1.5 py-0.5 text-[10px] text-[color:rgba(200,210,255,0.9)] transition-colors hover:border-[color:rgba(139,151,255,0.42)] hover:text-[color:var(--color-text-primary)]"
            >
              {t("clearFilter")}
            </button>
          ) : null}
        </div>
        <DocsVaultTree
          tree={manifest.tree}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          activeTag={activeTag}
          activeTagSlugs={activeTagSlugs}
        />
      </section>
      <div className="flex-none border-t border-[color:rgba(255,255,255,0.06)]">
        {hasCollections ? (
          <details className="group border-b border-[color:rgba(255,255,255,0.05)]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:rgba(255,255,255,0.025)] hover:text-[color:var(--color-text-secondary)]">
              <Star size={11} aria-hidden />
              <span className="font-medium">{t("collectionsHeader")}</span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-[color:var(--color-text-quaternary)]">
                {collectionSummary}
              </span>
            </summary>
            <div className="grid max-h-[34vh] gap-2 overflow-auto px-2 pb-2">
              {pinnedSlugs.length > 0 ? (
                <section>
                  <h3 className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-medium text-[color:var(--color-text-quaternary)]">
                    <Pin size={10} aria-hidden />
                    {t("pinnedHeader", { count: pinnedSlugs.length })}
                  </h3>
                  <ul className="flex flex-col gap-0.5">
                    {pinnedSlugs.map((slug) => {
                      const d = docsBySlug.get(slug);
                      if (!d) return null;
                      const active = selectedSlug === slug;
                      return (
                        <li key={slug} className="group">
                          <div className="relative flex items-stretch">
                            <button
                              type="button"
                              onClick={() => onSelect(slug)}
                              className={`flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1 pr-7 text-left text-[12px] transition-colors ${
                                active
                                  ? "bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-text-primary)]"
                                  : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                              }`}
                            >
                              <Star
                                size={11}
                                className="flex-none text-[color:rgba(224,196,140,0.82)]"
                                aria-hidden
                                fill="currentColor"
                              />
                              <span className="truncate">{d.title}</span>
                            </button>
                            <Tooltip content={t("unpinTooltip")} withProvider={false}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTogglePin(slug);
                                }}
                                aria-label={t("unpinTooltip")}
                                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-1 text-[color:var(--color-text-quaternary)] opacity-0 transition-opacity hover:text-[color:var(--color-text-primary)] group-hover:opacity-100"
                              >
                                <PinOff size={10} aria-hidden />
                              </button>
                            </Tooltip>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
              {recentSlugs.length > 0 ? (
                <section>
                  <h3 className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-medium text-[color:var(--color-text-quaternary)]">
                    <Clock size={10} aria-hidden />
                    {t("recentHeader", { count: recentSlugs.length })}
                  </h3>
                  <ul className="flex flex-col gap-0.5">
                    {recentSlugs.map((slug) => {
                      const d = docsBySlug.get(slug);
                      if (!d) return null;
                      const active = selectedSlug === slug;
                      return (
                        <li key={slug}>
                          <button
                            type="button"
                            onClick={() => onSelect(slug)}
                            className={`group relative flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] transition-colors ${
                              active
                                ? "bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-text-primary)]"
                                : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                            }`}
                          >
                            <FileText
                              size={11}
                              className="flex-none opacity-60"
                              aria-hidden
                            />
                            <span className="truncate">{d.title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </div>
          </details>
        ) : null}
        <DocsVaultTags
          tags={manifest.tags}
          activeTag={activeTag}
          onSelect={onTagSelect}
        />
      </div>
    </div>
  );
}
