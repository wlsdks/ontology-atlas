import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Clock,
  FileText,
  Hash,
  PinOff,
  Search,
  Star,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";
import { selectRecentVaultDocs } from "@/shared/lib/ontology-tree";
import type { DocsVaultCollection } from "../../lib/docs-vault-collection";
import { DocsVaultTree } from "@/widgets/docs-vault/ui/DocsVaultTree";
import { Tooltip } from "@/shared/ui";

/**
 * DocsVaultPage 의 사이드바 본문 — machined 파일 트리 (docs-vault-final spec).
 *
 * 세 섹션이 항상 보인다: **Pinned** (고정) → **Vault** (전체 트리, kind 글리프
 * + 폴더별 음각 count) → **Recent** (최근). 이전 라운드는 Pinned/Recent 를
 * "필터와 저장" 이라는 접이식 details 안에 숨겼는데, 옵시디언식 vault 워크스페이스
 * 에서 고정/최근은 트리 자체만큼 자주 쓰는 진입점이라 항상 보이는 게 맞다
 * (approved docs-vault-final.html 프로토타입 §좌 파일 목록).
 *
 * 태그 필터만 여전히 접이식 — 이 화면의 1차 목적은 아니므로.
 *
 * 모바일은 drawer 안, 데스크톱은 left rail. onSelect 콜백은 caller 가
 * `setMobileTreeOpen(false)` 와 함께 wrapping — 컴포넌트 내부엔 mobile 가시
 * 상태 의존 없음 (자립적).
 */
export interface DocsSidebarBodyProps {
  pinnedSlugs: string[];
  recentSlugs: string[];
  selectedSlug: string | null;
  docsBySlug: Map<string, VaultDoc>;
  activeTag: string | null;
  manifest: VaultManifest;
  collection: DocsVaultCollection;
  collectionCounts: Record<DocsVaultCollection, number>;
  visibleDocSlugs: Set<string>;
  onSelect: (slug: string) => void;
  onCollectionChange: (collection: DocsVaultCollection) => void;
  onTogglePin: (slug: string) => void;
  onTagSelect: (tag: string | null) => void;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex-none px-3 pb-1.5 pt-3 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
      {children}
    </h3>
  );
}

export function DocsSidebarBody({
  pinnedSlugs,
  recentSlugs,
  selectedSlug,
  docsBySlug,
  activeTag,
  manifest,
  collection,
  collectionCounts,
  visibleDocSlugs,
  onSelect,
  onCollectionChange,
  onTogglePin,
  onTagSelect,
}: DocsSidebarBodyProps) {
  const t = useTranslations("vaultWidgets.parts.sidebar");
  const [treeQuery, setTreeQuery] = useState("");
  // P4a — "최근 바뀐 문서" 진입점. `selectRecentVaultDocs` 는 INDEX 지도 렌즈
  // (`useRecentChanges`)와 같은 mtime 7일 창 산수(`recent-changes.ts`)를
  // 공유한다 — 문서함은 `VaultDoc.updatedAt` 을 직접 갖고 있어 온톨로지
  // 노드처럼 evidenceIds 간접 조회가 필요 없다. 세션 스냅샷 시각 —
  // `updatedAgoNowMs`(HomePage)와 같은 렌더-purity 이유로 mount 시 1회.
  const [recentNowMs] = useState(() => Date.now());
  const recentlyChangedDocs = useMemo(
    () => selectRecentVaultDocs(manifest.docs, recentNowMs),
    [manifest.docs, recentNowMs],
  );
  const [recentlyChangedOpen, setRecentlyChangedOpen] = useState(true);
  const normalizedTreeQuery = treeQuery.trim().toLowerCase();
  // 활성 태그가 매치하는 slug 집합 — DocsVaultTree 가 매 노드 재귀 시 .has()
  // 로 조회. 매 render 새 Set 만들면 트리 내부 useMemo 들이 활성/해제 무관
  // invalidate 되므로 부모에서 안정화. activeTag 가 null 이면 undefined
  // (트리가 필터 자체 skip).
  const activeTagSlugs = useMemo(
    () =>
      activeTag ? new Set(manifest.tags[activeTag] ?? []) : undefined,
    [activeTag, manifest.tags],
  );
  const tagEntries = useMemo(
    () =>
      Object.entries(manifest.tags).sort((a, b) => b[1].length - a[1].length),
    [manifest.tags],
  );
  const visibleTagEntries = useMemo(() => {
    if (
      activeTag &&
      tagEntries.every(([tag]) => tag !== activeTag)
    ) {
      return tagEntries.slice(0, 12);
    }
    return tagEntries
      .filter(([tag], index) => index < 12 || tag === activeTag)
      .sort((a, b) => {
        if (a[0] === activeTag) return -1;
        if (b[0] === activeTag) return 1;
        return b[1].length - a[1].length;
      });
  }, [activeTag, tagEntries]);
  const queryMatchCount = useMemo(() => {
    if (!normalizedTreeQuery) return manifest.docs.length;
    return manifest.docs.filter((doc) =>
      [doc.title, doc.slug, doc.path]
        .join(" ")
        .toLowerCase()
        .includes(normalizedTreeQuery),
    ).length;
  }, [manifest.docs, normalizedTreeQuery]);
  const collectionOptions: DocsVaultCollection[] = ["guides", "ontology"];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center justify-between gap-2 border-b border-[color:var(--color-overlay-2)] px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-[12px] font-medium text-[color:var(--color-text-primary)]">
            {t("treeHeader")}
          </h2>
          <p className="mt-0.5 truncate text-[10.5px] text-[color:var(--color-text-quaternary)]">
            {normalizedTreeQuery
              ? t("treeSearchCount", { count: queryMatchCount })
              : activeTag
                ? t("treeFiltered", { tag: activeTag })
                : t("treeCount", { count: manifest.docs.length })}
          </p>
        </div>
        <span
          data-token="engraved-numeral"
          className="flex-none font-mono text-[13px] tabular-nums text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
        >
          {manifest.docs.length}
        </span>
      </div>
      <div
        className="mx-3 mt-2 grid flex-none grid-cols-2 gap-1 rounded-lg border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] p-1"
        role="tablist"
        aria-label={t("collectionAriaLabel")}
      >
        {collectionOptions.map((option) => {
          const active = collection === option;
          return (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onCollectionChange(option)}
              className={`min-w-0 rounded-md px-2 py-1.5 text-left transition-[background-color,color,transform,border-color] duration-150 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99] ${
                active
                  ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]"
                  : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
              }`}
            >
              <span className="block truncate text-[11.5px] font-medium">
                {t(`collection.${option}.label`)}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-[color:var(--color-text-quaternary)]">
                {t(`collection.${option}.count`, {
                  count: collectionCounts[option],
                })}
              </span>
            </button>
          );
        })}
      </div>
      <label className="mx-3 mt-2 flex h-8 flex-none items-center gap-2 rounded-md border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2 text-[color:var(--color-text-quaternary)] focus-within:border-[color:var(--color-indigo-line-a45)] focus-within:text-[color:var(--color-text-secondary)]">
        <Search size={12} aria-hidden />
        <span className="sr-only">{t("searchLabel")}</span>
        <input
          value={treeQuery}
          onChange={(event) => setTreeQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-[color:var(--color-text-secondary)] placeholder:text-[color:var(--color-text-quaternary)] focus:outline-none"
          type="text"
          autoComplete="off"
        />
        {treeQuery ? (
          <button
            type="button"
            onClick={() => setTreeQuery("")}
            className="rounded-sm p-0.5 text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            aria-label={t("clearSearch")}
          >
            <X size={11} aria-hidden />
          </button>
        ) : null}
      </label>
      {(activeTag || normalizedTreeQuery) ? (
        <div className="mx-3 mt-2 flex flex-none items-center justify-between gap-2 rounded-sm border border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-indigo-a06)] px-2 py-1 text-[10.5px] text-[color:var(--color-indigo-pale-a90)]">
          <span className="truncate">
            {activeTag ? t("activeTagSummary", { tag: activeTag }) : t("treeSearchCount", { count: queryMatchCount })}
          </span>
          <button
            type="button"
            onClick={() => {
              setTreeQuery("");
              onTagSelect(null);
            }}
            className="flex-none rounded-sm px-1.5 py-0.5 transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            {t("clearFilter")}
          </button>
        </div>
      ) : null}

      {/* P4a — "최근 바뀐 문서" 접이식 스트립. `recentSlugs`(아래, 세션 중
          방문한 문서)와는 다른 개념 — 이건 실제 mtime 이 최근 7일 안인
          문서다. 새로 열 때마다 "지난 7일 뭐가 바뀌었나"에 클릭 0회로
          답하도록 기본 펼침. */}
      {recentlyChangedDocs.length > 0 ? (
        <section className="flex-none border-b border-[color:var(--color-overlay-2)] pb-1">
          <button
            type="button"
            onClick={() => setRecentlyChangedOpen((open) => !open)}
            aria-expanded={recentlyChangedOpen}
            data-testid="docs-sidebar-recently-changed-toggle"
            className="flex w-full items-center gap-1.5 px-3 pb-1.5 pt-3 text-left transition-colors hover:text-[color:var(--color-text-secondary)]"
          >
            <Clock size={10} className="flex-none text-[color:var(--color-text-quaternary)]" aria-hidden />
            <span className="flex-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
              {t("recentlyChangedHeader", { count: recentlyChangedDocs.length })}
            </span>
            <ChevronDown
              size={11}
              aria-hidden
              className={`flex-none text-[color:var(--color-text-quaternary)] transition-transform ${recentlyChangedOpen ? "rotate-180" : ""}`}
            />
          </button>
          {recentlyChangedOpen ? (
            <ul
              data-testid="docs-sidebar-recently-changed-list"
              className="flex max-h-[22vh] flex-col gap-0.5 overflow-auto px-2"
            >
              {recentlyChangedDocs.map((doc) => {
                const active = selectedSlug === doc.slug;
                return (
                  <li key={doc.slug}>
                    <button
                      type="button"
                      onClick={() => onSelect(doc.slug)}
                      className={`group relative flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] transition-colors ${
                        active
                          ? "bg-[color:var(--color-indigo-a14)] text-[color:var(--color-text-primary)]"
                          : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                      }`}
                    >
                      <FileText size={11} className="flex-none opacity-60" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* 항상 보이는 3 섹션 — Pinned / Vault / Recent. 트리(Vault)만 남는 공간을
          채우며 스크롤한다 (flex-1 min-h-0); Pinned/Recent 는 목록이 짧으므로
          flex-none + 자체 max-height 스크롤. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {pinnedSlugs.length > 0 ? (
          <section className="flex-none border-b border-[color:var(--color-overlay-2)] pb-1">
            <SectionLabel>{t("pinnedHeader", { count: pinnedSlugs.length })}</SectionLabel>
            <ul className="flex max-h-[22vh] flex-col gap-0.5 overflow-auto px-2">
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
                            ? "bg-[color:var(--color-indigo-a14)] text-[color:var(--color-text-primary)]"
                            : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                        }`}
                      >
                        <Star
                          size={11}
                          className="flex-none text-[color:var(--color-amber-docs-a82)]"
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

        <section className="flex min-h-0 flex-1 flex-col">
          <DocsVaultTree
            tree={manifest.tree}
            selectedSlug={selectedSlug}
            onSelect={onSelect}
            query={treeQuery}
            activeTag={activeTag}
            activeTagSlugs={activeTagSlugs}
            visibleDocSlugs={visibleDocSlugs}
            docsBySlug={docsBySlug}
          />
        </section>

        {recentSlugs.length > 0 ? (
          <section className="flex-none border-t border-[color:var(--color-overlay-2)] pb-2">
            <SectionLabel>{t("recentHeader", { count: recentSlugs.length })}</SectionLabel>
            <ul className="flex max-h-[22vh] flex-col gap-0.5 overflow-auto px-2">
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
                          ? "bg-[color:var(--color-indigo-a14)] text-[color:var(--color-text-primary)]"
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

      {tagEntries.length > 0 ? (
        <div className="flex-none border-t border-[color:var(--color-overlay-2)]">
          <details
            className="group"
            open={activeTag !== null ? true : undefined}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]">
              <Hash size={11} aria-hidden />
              <span className="font-medium">{t("tagsHeader", { count: tagEntries.length })}</span>
              <ChevronDown
                size={11}
                aria-hidden
                className="ml-auto transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="flex max-h-[24vh] flex-wrap gap-1 overflow-auto px-3 pb-2">
              {visibleTagEntries.map(([tag, slugs]) => {
                const active = activeTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onTagSelect(active ? null : tag)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] transition-colors ${
                      active
                        ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-pale-a95)]"
                        : "bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-indigo-line-a06)] hover:text-[color:var(--color-text-primary)]"
                    }`}
                    title={t("tagTitle", { tag, count: slugs.length })}
                  >
                    {active ? <X size={9} aria-hidden /> : null}
                    {tag}
                    <span className="opacity-60">{slugs.length}</span>
                  </button>
                );
              })}
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
