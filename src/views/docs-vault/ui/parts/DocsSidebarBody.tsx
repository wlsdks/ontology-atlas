import { Clock, FileText, Pin, PinOff, Star } from "lucide-react";
import type {
  VaultDoc,
  VaultManifest,
  VaultMode,
} from "@/entities/docs-vault";
import { DocsVaultTags } from "@/widgets/docs-vault/ui/DocsVaultTags";
import { DocsVaultTree } from "@/widgets/docs-vault/ui/DocsVaultTree";
import { Tooltip } from "@/shared/ui";

/**
 * DocsVaultPage 의 사이드바 본문 (Fire 4-d-2).
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
  audience: VaultMode | "all";
  audienceBySlug: Record<string, VaultMode>;
  activeTag: string | null;
  manifest: VaultManifest;
  developerActivitySlugs?: Set<string>;
  onSelect: (slug: string) => void;
  onTogglePin: (slug: string) => void;
  onTagSelect: (tag: string | null) => void;
}

export function DocsSidebarBody({
  pinnedSlugs,
  recentSlugs,
  selectedSlug,
  docsBySlug,
  audience,
  audienceBySlug,
  activeTag,
  manifest,
  developerActivitySlugs,
  onSelect,
  onTogglePin,
  onTagSelect,
}: DocsSidebarBodyProps) {
  return (
    <>
      {pinnedSlugs.length > 0 ? (
        <section className="flex-none border-b border-[color:var(--color-overlay-2)] px-2 py-2">
          <h3 className="mb-1 flex items-center gap-1.5 px-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            <Pin size={10} aria-hidden />
            고정 · {pinnedSlugs.length}
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
                      {active ? (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full bg-[color:var(--color-indigo-accent)]"
                        />
                      ) : null}
                      <Star
                        size={11}
                        className="flex-none text-[color:rgba(224,196,140,0.82)]"
                        aria-hidden
                        fill="currentColor"
                      />
                      <span className="truncate">{d.title}</span>
                    </button>
                    <Tooltip content="고정 해제" withProvider={false}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePin(slug);
                        }}
                        aria-label="고정 해제"
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
        <section className="flex-none border-b border-[color:var(--color-overlay-2)] px-2 py-2">
          <h3 className="mb-1 flex items-center gap-1.5 px-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            <Clock size={10} aria-hidden />
            최근 · {recentSlugs.length}
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
                    {active ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full bg-[color:var(--color-indigo-accent)]"
                      />
                    ) : null}
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
      <DocsVaultTree
        tree={manifest.tree}
        selectedSlug={selectedSlug}
        onSelect={onSelect}
        audience={audience}
        audienceBySlug={audienceBySlug}
        activeTag={activeTag}
        activeTagSlugs={
          activeTag ? new Set(manifest.tags[activeTag] ?? []) : undefined
        }
        activitySlugs={developerActivitySlugs}
      />
      <DocsVaultTags
        tags={manifest.tags}
        activeTag={activeTag}
        onSelect={onTagSelect}
      />
    </>
  );
}
