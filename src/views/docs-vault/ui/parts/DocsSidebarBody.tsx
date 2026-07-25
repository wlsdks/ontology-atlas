import { useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Bot,
  ChevronDown,
  Clock,
  FileText,
  Files,
  Hash,
  PinOff,
  Plus,
  Search,
  Star,
  Waypoints,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";
import { selectRecentVaultDocs } from "@/shared/lib/ontology-tree";
import { AGENT_TOOL_LABELS, type AgentFilesUiModel } from "../../lib/agent-files";
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
  /**
   * [D-4] 트리 상단 "새 문서" 진입점 — 지도(topology)와 같은 kind-first
   * 다이얼로그를 연다(DocsVaultPage.handleOpenNewDocDialog). 샘플(읽기
   * 전용) 모드에서는 canCreateNewDoc=false 로 비활성 + 툴팁 힌트만 노출해
   * 기능 존재 자체를 알린다 — 이전엔 진입점이 통째로 사라져 있었다.
   */
  onCreateNewDoc: () => void;
  canCreateNewDoc: boolean;
  /**
   * "에이전트 파일" 그룹 — vault 가 repo 루트를 포함할 때만
   * (CLAUDE.md/AGENTS.md 존재, `useAgentFilesModel` 게이트) non-null.
   * 파일별 "어느 도구가 읽나" 배지 + drift 배지(amber warning — 미결 주의).
   * 읽기 전용 감지: 클릭은 기존 에디터로 여는 것이 전부, 변환/수리 없음.
   */
  agentFiles?: AgentFilesUiModel | null;
}

// "최근 바뀐 문서" 스트립에 노출할 최대 행 수. 7일 창은 대량 커밋일에
// 수십 건을 통과시켜(dogfood 샘플 27건) 스트립이 아래 트리와 겹치는 두 번째
// 전체 목록 + 독립 스크롤이 됐다(사이드바에 스크롤 영역 2~3개 = "어디를
// 드래그하지" 혼란). 최근 5건만 미리보기로 남기고 스크롤을 제거해 주
// 스크롤을 트리 하나로 단일화한다 — 나머지는 트리가 이미 전부 담는다.
const RECENTLY_CHANGED_STRIP_MAX = 5;

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex-none px-3 pb-1.5 pt-3 font-mono text-caption uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
      {children}
    </h3>
  );
}

/**
 * #22 — 옵시디언식 상단 아이콘 행의 단일 버튼. hover 툴팁(평문) + active
 * 인디고. a11y: title(툴팁) + aria-label + aria-pressed 로 스크린리더 도달.
 */
function RailIconButton({
  icon,
  label,
  active,
  disabled = false,
  onClick,
  testId,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        data-testid={testId}
        className={`inline-flex h-8 w-8 flex-none items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          active
            ? "border-[color:var(--color-indigo-line-a45)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-pale-a95)]"
            : "border-[color:var(--color-overlay-2)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
        }`}
      >
        {icon}
      </button>
    </Tooltip>
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
  onCreateNewDoc,
  canCreateNewDoc,
  agentFiles = null,
}: DocsSidebarBodyProps) {
  const t = useTranslations("vaultWidgets.parts.sidebar");
  const tAgentFiles = useTranslations("agentFiles");
  const [treeQuery, setTreeQuery] = useState("");
  // #22 — 검색 입력은 상단 아이콘 행의 토글로 열고 닫는다(옵시디언식 밀도
  // 축소). 쿼리가 남아 있으면 강제로 열어 둔다(사라진 필터가 안 보이는 결함 방지).
  const [searchOpen, setSearchOpen] = useState(false);
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
  // #22 — 최근 바뀐 문서는 목록 안의 조용한 섹션으로 강등, 기본 접힘.
  const [recentlyChangedOpen, setRecentlyChangedOpen] = useState(false);
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
  const collectionOptions: DocsVaultCollection[] = ["all", "guides", "ontology"];
  const collectionIcons: Record<DocsVaultCollection, ReactNode> = {
    all: <Files size={15} aria-hidden />,
    guides: <BookOpen size={15} aria-hidden />,
    ontology: <Waypoints size={15} aria-hidden />,
  };
  const searchExpanded = searchOpen || Boolean(treeQuery);
  const activeCollectionCount =
    collection === "all"
      ? manifest.docs.length
      : collectionCounts[collection];
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* #22 — 옵시디언식 단일 아이콘 행: 전체/가이드/지도 문서 뷰 전환 +
          검색 토글 + 새 문서. 큰 헤더·세그먼트·상시 검색창을 걷어내 밀도를
          낮춘다. active 는 인디고, hover 툴팁이 평문으로 뜻을 설명한다. */}
      <div
        role="tablist"
        aria-label={t("collectionAriaLabel")}
        className="flex flex-none items-center gap-1 border-b border-[color:var(--color-overlay-2)] px-2 py-2"
      >
        {collectionOptions.map((option) => (
          <RailIconButton
            key={option}
            testId={`docs-sidebar-collection-${option}`}
            icon={collectionIcons[option]}
            label={t(`collection.${option}.tooltip`, {
              count: collectionCounts[option],
            })}
            active={collection === option}
            onClick={() => onCollectionChange(option)}
          />
        ))}
        <span aria-hidden className="mx-0.5 h-5 w-px bg-[color:var(--color-overlay-2)]" />
        <RailIconButton
          testId="docs-sidebar-search-toggle"
          icon={<Search size={15} aria-hidden />}
          label={t("searchLabel")}
          active={searchExpanded}
          onClick={() => {
            if (searchExpanded) {
              setTreeQuery("");
              setSearchOpen(false);
            } else {
              setSearchOpen(true);
            }
          }}
        />
        <span className="flex-1" />
        {/* [D-4] "새 문서" 진입점 — 샘플(읽기 전용) 모드에서도 버튼 + 툴팁으로
            기능 존재를 알린다(지도와 같은 kind-first 다이얼로그). */}
        <RailIconButton
          testId="docs-sidebar-new-doc"
          icon={<Plus size={15} aria-hidden />}
          label={canCreateNewDoc ? t("newDocButtonLabel") : t("newDocDisabledHint")}
          active={false}
          disabled={!canCreateNewDoc}
          onClick={onCreateNewDoc}
        />
      </div>
      <p className="flex-none px-3 pt-1.5 text-caption text-[color:var(--color-text-quaternary)]">
        {normalizedTreeQuery
          ? t("treeSearchCount", { count: queryMatchCount })
          : activeTag
            ? t("treeFiltered", { tag: activeTag })
            : t("treeCount", { count: activeCollectionCount })}
      </p>
      {searchExpanded ? (
        <label className="mx-3 mt-1.5 flex h-8 flex-none items-center gap-2 rounded-md border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2 text-[color:var(--color-text-quaternary)] focus-within:border-[color:var(--color-indigo-line-a45)] focus-within:text-[color:var(--color-text-secondary)]">
          <Search size={12} aria-hidden />
          <span className="sr-only">{t("searchLabel")}</span>
          <input
            value={treeQuery}
            onChange={(event) => setTreeQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-body text-[color:var(--color-text-secondary)] placeholder:text-[color:var(--color-text-quaternary)] focus:outline-none"
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
      ) : null}
      {(activeTag || normalizedTreeQuery) ? (
        <div className="mx-3 mt-2 flex flex-none items-center justify-between gap-2 rounded-sm border border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-indigo-a06)] px-2 py-1 text-label text-[color:var(--color-indigo-pale-a90)]">
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

      {/* 항상 보이는 섹션 — 최근 바뀐 문서(조용, 기본 접힘) / 에이전트 파일 /
          Pinned / Vault 트리 / Recent. 트리(Vault)만 남는 공간을 채우며
          스크롤한다 (flex-1 min-h-0). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* #22 — "최근 바뀐 문서"는 이제 목록 안의 조용한 섹션(기본 접힘).
            별도 스택으로 상단을 차지하지 않는다. `recentSlugs`(세션 중 방문)
            와는 다른, 실제 mtime 7일 창 문서다. */}
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
              <span className="flex-1 font-mono text-caption uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
                {t("recentlyChangedHeader", { count: recentlyChangedDocs.length })}
              </span>
              <ChevronDown
                size={11}
                aria-hidden
                className={`flex-none text-[color:var(--color-text-quaternary)] transition-transform ${recentlyChangedOpen ? "rotate-180" : ""}`}
              />
            </button>
            {recentlyChangedOpen ? (
              <>
                <ul
                  data-testid="docs-sidebar-recently-changed-list"
                  className="flex flex-col gap-0.5 px-2"
                >
                  {recentlyChangedDocs
                    .slice(0, RECENTLY_CHANGED_STRIP_MAX)
                    .map((doc) => {
                      const active = selectedSlug === doc.slug;
                      return (
                        <li key={doc.slug}>
                          <button
                            type="button"
                            onClick={() => onSelect(doc.slug)}
                            className={`group relative flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-body transition-colors ${
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
                {recentlyChangedDocs.length > RECENTLY_CHANGED_STRIP_MAX ? (
                  <p className="px-3 pt-1 text-caption text-[color:var(--color-text-quaternary)]">
                    {t("recentlyChangedMore", {
                      count: recentlyChangedDocs.length - RECENTLY_CHANGED_STRIP_MAX,
                    })}
                  </p>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}

        {/* "에이전트 파일" 그룹 — 트리 상단 고정. vault 가 repo 루트일 때만
            (useAgentFilesModel 게이트) 나타난다. FSA 는 상위 폴더에 접근할 수
            없으므로 docs/ontology 같은 하위 vault 에서는 그룹 자체를 렌더하지
            않는 것이 정직하다. drift 배지는 신호 톤 warning(amber) — 미결
            주의 상태. 읽기 전용: 클릭 = 기존 에디터로 열기. */}
        {agentFiles && agentFiles.records.length > 0 ? (
          <section
            data-testid="docs-sidebar-agent-files"
            className="flex-none border-b border-[color:var(--color-overlay-2)] pb-1"
          >
            <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-3" title={tAgentFiles("headerHint")}>
              <Bot size={10} className="flex-none text-[color:var(--color-text-quaternary)]" aria-hidden />
              <span className="flex-1 font-mono text-caption uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
                {tAgentFiles("header")}
              </span>
              {agentFiles.driftCount > 0 ? (
                <span
                  data-testid="docs-sidebar-agent-files-drift-count"
                  className="flex-none rounded-full border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] px-1.5 font-mono text-caption tabular-nums text-[color:var(--color-amber-source-a90)]"
                >
                  {tAgentFiles("driftCount", { count: agentFiles.driftCount })}
                </span>
              ) : null}
            </div>
            <ul aria-label={tAgentFiles("listAria")} className="flex flex-col gap-0.5 px-2">
              {agentFiles.records.map((record) => {
                const active = selectedSlug === record.slug;
                const driftTitle = record.drift
                  .map((code) => tAgentFiles(`drift.${code}`))
                  .join("\n");
                return (
                  <li key={record.path}>
                    <button
                      type="button"
                      onClick={() => onSelect(record.slug)}
                      title={driftTitle || undefined}
                      aria-current={active ? "true" : undefined}
                      className={`group relative flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-body transition-colors ${
                        active
                          ? "bg-[color:var(--color-indigo-a14)] text-[color:var(--color-text-primary)]"
                          : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                      }`}
                    >
                      <FileText size={11} className="flex-none opacity-60" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{record.path}</span>
                      <span className="flex-none font-mono text-caption text-[color:var(--color-text-quaternary)]">
                        {record.tools.map((tool) => AGENT_TOOL_LABELS[tool] ?? tool).join(" · ")}
                      </span>
                      {record.drift.length > 0 ? (
                        <span
                          data-testid={`docs-sidebar-agent-file-drift-${record.slug}`}
                          className="flex-none rounded-sm border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] px-1 font-mono text-caption text-[color:var(--color-amber-source-a90)]"
                        >
                          {tAgentFiles("driftBadge")}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

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
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1 pr-7 text-left text-body transition-colors ${
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
                      className={`group relative flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-body transition-colors ${
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
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-label text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]">
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
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label transition-colors ${
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
