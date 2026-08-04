"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useReducedMotion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import type { Project } from "@/entities/project";
import { cn } from "@/shared/lib/cn";
import {
  MEANINGFUL_ONTOLOGY_KINDS,
  type MeaningfulOntologyKind,
} from "@/shared/lib/ontology-tree";
import { controlClass, HighlightedText } from "@/shared/ui";
import { isPathLikeTitle, matchOntologyNodes, matchProjects } from "../lib/match";

export interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ontology 노드 — 첫 검색 source (vault frontmatter / 빌드타임 dogfood 통합). */
  nodes: readonly KnowledgeGraphNode[];
  /** ontology 노드 선택 콜백. */
  onSelectNode: (node: KnowledgeGraphNode) => void;
  /**
   * projects — 옵션. ⌘K 한 번에 ontology/프로젝트 통합 검색.
   * `onSelectProject` 와 함께 와야 함.
   */
  projects?: readonly Project[];
  onSelectProject?: (project: Project) => void;
}

/**
 * 글로벌 검색 (cmdk 기반).
 *
 * 우리 자체 매처 (`matchOntologyNodes`, `matchProjects`) 로 score / 정렬
 * → cmdk 는 `shouldFilter={false}` 로 표시·키보드 nav 만 담당. 한·영 혼합 매치 의도.
 *
 * Source 두 개 (ontology + projects) 를 별도 그룹으로 노출. cmdk Item value 는
 * `<source>:<id>` 로 prefix 충돌 회피. 빈 query 일 때는 두 source 모두 sample 표시
 * (ontology = lastApprovedAt desc / projects = updatedAt desc).
 */
export function GlobalSearch({
  open,
  onOpenChange,
  nodes,
  onSelectNode,
  projects,
  onSelectProject,
}: GlobalSearchProps) {
  const t = useTranslations("searchWidgets.globalSearch");
  const kindLabel = useOntologyKindLabel();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // rank18 — 트리거로 포커스 복귀. Radix Dialog/FocusScope 가 기본으로도
  // 복귀시키지만(내부 activeElement 캡처), 어떤 트리거 경로(버튼 클릭 ·
  // ⌘K 단축키)로 열렸든 명시적으로 보장하기 위해 자체 ref 로도 캡처한다.
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    } else {
      previousFocusRef.current?.focus?.({ preventScroll: true });
    }
  }, [open]);
  const [query, setQuery] = useState("");
  // kind / project filter chip 으로 ontology 결과 좁히기. set 으로
  // 다중 선택 (toggle) 모델. 닫을 때 query 와 함께 초기화.
  const [selectedKinds, setSelectedKinds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selectedProjectIds, setSelectedProjectIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleKind = useCallback((kind: MeaningfulOntologyKind) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const toggleProjectId = useCallback((projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  const ontologyResults = useMemo(
    () =>
      matchOntologyNodes(query, nodes, 20, {
        kinds: selectedKinds,
        projectIds: selectedProjectIds,
      }),
    [query, nodes, selectedKinds, selectedProjectIds],
  );
  const projectResults = useMemo(
    () => (projects ? matchProjects(query, projects, 20) : []),
    [query, projects],
  );

  const isEmptyQuery = query.trim() === "";
  const ontologySize = nodes.length;
  const projectSize = projects?.length ?? 0;
  // M-6 — project 카드는 ontology 의 kind:project 노드와 같은 실체다.
  // 그대로 더하면 정본 census(295)보다 1 큰 "296 색인"이 나온다 (P0c 지도
  // 이중 가산과 동종). 노드로 이미 세어진 project 는 빼고 합산한다.
  const projectNodeCount = useMemo(
    () => nodes.filter((node) => node.kind === "project").length,
    [nodes],
  );
  const totalCorpus = ontologySize + Math.max(0, projectSize - projectNodeCount);
  const totalMatches = ontologyResults.length + projectResults.length;
  const hasFilter = selectedKinds.size > 0 || selectedProjectIds.size > 0;

  // workspace project chip row 의 source — projects prop 이 있으면 그대로
  // (slug + name), 없으면 nodes 에서 발견된 distinct projectIds 만으로 fallback
  // (slug 만 표시) — projects prop 이 흐를 때와 nodes 만 흐를 때 양쪽 호환.
  //
  // \`@tanstack/react-virtual\` horizontal virtualizer 로 큰 vault 에서도
  // viewport 안 chip 만 렌더 (~10-15 개). ontology 빈도 가중 정렬은 유지 —
  // 첫 화면에 가장 관련 있는 chip 이 먼저 보이도록.
  const projectChipSource = useMemo<Array<{ slug: string; label: string }>>(() => {
    const ontologyFreq = new Map<string, number>();
    for (const node of nodes) {
      for (const pid of node.projectIds) {
        ontologyFreq.set(pid, (ontologyFreq.get(pid) ?? 0) + 1);
      }
    }

    if (projects && projects.length > 0) {
      return projects
        .slice()
        .sort((a, b) => {
          const fa = ontologyFreq.get(a.slug) ?? 0;
          const fb = ontologyFreq.get(b.slug) ?? 0;
          if (fa !== fb) return fb - fa;
          return a.name.localeCompare(b.name, "ko");
        })
        .map((p) => ({ slug: p.slug, label: p.name }));
    }
    return Array.from(ontologyFreq.keys())
      .sort((a, b) => (ontologyFreq.get(b) ?? 0) - (ontologyFreq.get(a) ?? 0))
      .map((slug) => ({ slug, label: slug }));
  }, [projects, nodes]);

  // horizontal virtualizer — chip 너비는 한국어 라벨이라 가변. estimateSize 는
  // 평균값 (10~16 자 chip 의 padding 포함 ~110 px). measureElement 가 실제
  // 크기를 보정. overscan 4 는 좌우 스크롤 시 끊김 회피.
  const projectScrollRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns imperative measurement functions; this component does not pass the virtualizer through memoized children.
  const projectVirtualizer = useVirtualizer({
    count: projectChipSource.length,
    horizontal: true,
    overscan: 4,
    getScrollElement: () => projectScrollRef.current,
    estimateSize: () => 110,
  });

  const closeAndClear = () => {
    onOpenChange(false);
    setQuery("");
    setSelectedKinds(new Set());
    setSelectedProjectIds(new Set());
  };

  // cmdk 의 내장 Command.Dialog 는 Radix Dialog 를 wrapping 하지만 Title /
  // Description 노드를 제공하지 않아 Radix 가 console error 를 띄움. 직접
  // Radix Dialog 를 wrapping 해서 VisuallyHidden Title/Description 을 박는다.
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Esc · 스크림 클릭 · 닫기 버튼이 모두 같은 자리로 수렴한다 — 푸터가
        // 약속하는 "ESC 닫기" 한 번에 창이 닫히고 입력·필터가 함께 비워진다.
        // (예전엔 Esc 경로만 query 는 비우고 kind/project 필터는 남겨, 다시
        // 열었을 때 이유 없이 좁혀진 결과를 보여줬다.)
        if (!next) {
          closeAndClear();
          return;
        }
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          data-overlay-spring="true"
          className={cn(
            "fixed inset-0 z-50 bg-[color:var(--overlay-scrim)]",
            reducedMotion ? "overlay-fade-only" : "overlay-spring-scrim",
          )}
        />
        <Dialog.Content
          aria-label={t('dialogAriaLabel')}
          // Radix 는 형제 노드에 `aria-hidden` 을 거는 방식이라 `aria-modal` 을
          // 스스로 붙이지 않는다. 그런데 이 앱의 전역 Esc 규율은 "지금 모달이
          // 떠 있는가"를 `[role="dialog"][aria-modal="true"]` 로 판정한다
          // (첫 실행 카드의 캡처 핸들러 · 자동 투어 발화 가드 등). 선언이
          // 없으니 저 판정들이 이 검색창을 못 보고, 첫 Esc 를 첫 실행 카드가
          // 가로채 preventDefault 해버려 **첫 타에 아무 일도 일어나지
          // 않았다**(2026-07-26 실측: Esc 1회에 입력값도 그대로, 다이얼로그도
          // 그대로 — 두 번째에야 닫힘). 앱의 다른 모달들(SearchPalette ·
          // 공방 진입 선택 · 문서함 팔레트 …)은 전부 이 속성을 명시하고 있고,
          // 이 검색창만 빠져 있었다. 스크림 + 포커스 트랩 + 바깥 클릭 닫기를
          // 갖춘 진짜 모달이므로 선언이 사실과도 맞는다.
          aria-modal="true"
          data-overlay-spring="true"
          data-global-search-responsive-contract="mobile-sheet-md-floating"
          data-global-search-floating-width-token="--topology-search-sheet-floating-width"
          data-global-search-radius-token="--radius-sheet"
          data-global-search-mobile-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
          // 애니메이션 클래스는 Dialog.Content 자신에 건다 — Radix Presence
          // 는 자신이 렌더한 노드(target === node)의 animationend 만 듣고
          // 자식 노드에서 버블된 이벤트는 무시하므로, 자식(Command)에 걸면
          // 퇴장 애니메이션이 끝나기 전에 언마운트돼버린다.
          className={cn(
            "fixed inset-0 z-50 flex items-stretch justify-center md:items-start md:px-4 md:pt-[12vh]",
            reducedMotion ? "overlay-fade-only" : "overlay-spring-surface",
          )}
          // rank18 — 열릴 때 첫 입력(검색창)에 포커스. Radix 기본 동작(첫
          // focusable 엘리먼트)과 결과는 같지만, preventScroll 을 명시적으로
          // 보장하기 위해 직접 지정한다.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus({ preventScroll: true });
          }}
          // 바깥 클릭 = 닫기 (커맨드 팔레트의 사실상 표준: Linear · VS Code ·
          // Raycast · Spotlight). Radix 의 `onPointerDownOutside` 는 여기서
          // 발화하지 않는다 — 이 `Dialog.Content` 자체가 `fixed inset-0` 로
          // 화면 전체를 덮는 flex 래퍼라서, 스크림처럼 보이는 영역이 실은
          // Content **내부**이고 Radix 에게는 "바깥" 이 존재하지 않는다
          // (소유자 실보고 2026-07-25: "바깥 클릭하면 닫혀야하는데 안닫힘").
          // 그래서 래퍼 자신이 눌린 대상일 때만 닫는다 — 패널(Command)은 이미
          // stopPropagation 하므로 내부 클릭은 여기 도달하지 않는다.
          // `onPointerDown` 은 설정 시트(`AppSettingsMenu`)의 기존 스크림 계약과
          // 같은 문법이면서 마우스·터치·펜을 함께 덮는다.
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeAndClear();
          }}
        >
          <VisuallyHidden>
            <Dialog.Title>{t('dialogTitle')}</Dialog.Title>
            <Dialog.Description>
              {t('dialogDescription')}
            </Dialog.Description>
          </VisuallyHidden>
          <Command
            label={t('commandLabel')}
            shouldFilter={false}
            className="flex h-[calc(100dvh-var(--topology-mobile-bottom-tab-reserve))] w-full flex-col overflow-hidden border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-2)] md:h-auto md:max-w-[var(--topology-search-sheet-floating-width)] md:rounded-sheet"
            onClick={(event) => event.stopPropagation()}
          >
        <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-4 py-3">
          <Search size={14} className="shrink-0 text-[color:var(--color-text-quaternary)]" />
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={
              projects && projects.length > 0
                ? t('placeholderWithProjects')
                : t('placeholderOntologyOnly')
            }
            className="flex-1 bg-transparent text-body-lg text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded-micro border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-2)] px-1.5 py-0.5 font-mono text-caption text-[color:var(--color-text-tertiary)] sm:inline-block">
            ESC
          </kbd>
          <button
            type="button"
            onClick={closeAndClear}
            aria-label={t('closeAriaLabel')}
            data-testid="global-search-close"
            data-global-search-close-contract="touch-visible"
            data-global-search-close-size-token="--overlay-close-size"
            className="flex h-[var(--overlay-close-size)] w-[var(--overlay-close-size)] shrink-0 items-center justify-center rounded-chip text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        {/* kind / project chip filter row — ontology 결과 좁히기 전용
            (documents / projects 결과는 영향 없음). 기본 펼침이라 사용자가
            "어떻게 좁힐 수 있는지" 한눈에 인지. 다중 선택 toggle. */}
        <div
          className="flex flex-col gap-1 border-b border-[color:var(--color-border-soft)] px-3 py-2"
          aria-label={t('filterAriaLabel')}
        >
          <div className="flex items-center gap-2 overflow-x-auto">
            <span
              className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]"
              aria-hidden
            >
              {t('kindLabel')}
            </span>
            {MEANINGFUL_ONTOLOGY_KINDS.map((kind) => {
              const active = selectedKinds.has(kind);
              return (
                <button
                  key={`kind-${kind}`}
                  type="button"
                  onClick={() => toggleKind(kind)}
                  aria-pressed={active}
                  className={controlClass({
                    shape: "pill",
                    size: "sm",
                    active,
                    className: cn(
                      "shrink-0 uppercase tracking-[var(--tracking-caps-10)]",
                      !active &&
                        "hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]",
                    ),
                  })}
                >
                  {kindLabel(kind)}
                </button>
              );
            })}
            {hasFilter ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedKinds(new Set());
                  setSelectedProjectIds(new Set());
                }}
                className="ml-auto shrink-0 rounded-full px-2 py-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
              >
                {t('clearFilter')}
              </button>
            ) : null}
          </div>
          {projectChipSource.length > 0 ? (
            <div className="flex items-center gap-2">
              <span
                className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]"
                aria-hidden
              >
                {t('projectLabel', { count: projectChipSource.length })}
              </span>
              {/* @tanstack/react-virtual horizontal virtualizer — 1,979
                  project 같은 큰 워크스페이스 에서도 viewport 안 chip 만 렌더
                  (~10-15 개). overflow-x-auto + relative + abs 자식 패턴. */}
              <div
                ref={projectScrollRef}
                className="relative flex-1 overflow-x-auto"
                style={{ height: 24 }}
              >
                <div
                  className="relative"
                  style={{
                    width: `${projectVirtualizer.getTotalSize()}px`,
                    height: "100%",
                  }}
                >
                  {projectVirtualizer.getVirtualItems().map((virtualItem) => {
                    const item = projectChipSource[virtualItem.index];
                    if (!item) return null;
                    const { slug, label } = item;
                    const active = selectedProjectIds.has(slug);
                    return (
                      <button
                        key={`project-${slug}`}
                        type="button"
                        onClick={() => toggleProjectId(slug)}
                        aria-pressed={active}
                        title={slug !== label ? slug : undefined}
                        ref={projectVirtualizer.measureElement}
                        data-index={virtualItem.index}
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          transform: `translateX(${virtualItem.start}px)`,
                        }}
                        className={controlClass({
                          shape: "pill",
                          size: "sm",
                          active,
                          className: cn(
                            "mr-1.5 whitespace-nowrap",
                            !active &&
                              "hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]",
                          ),
                        })}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <Command.List className="flex-1 overflow-y-auto overscroll-y-contain px-2 py-2 md:max-h-[52vh] md:flex-none">
          <Command.Empty className="px-3 py-6 text-center text-body-lg text-[color:var(--color-text-tertiary)]">
            {isEmptyQuery
              ? totalCorpus === 0
                ? t('emptyNoCorpus')
                : t('emptyIndexed', { count: totalCorpus })
              : hasFilter
                ? t('emptyNoMatchFiltered', { query })
                : t('emptyNoMatch', { query })}
          </Command.Empty>

          {ontologyResults.length > 0 ? (
            <Command.Group
              heading={
                <span className="px-2 pb-1 pt-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                  {isEmptyQuery ? t('groupConceptRecent') : t('groupConceptMatch')} · {ontologyResults.length}
                  {isEmptyQuery && ontologySize > ontologyResults.length ? ` / ${ontologySize}` : ""}
                </span>
              }
            >
              {/* R10 후 vault 가 유일 모드 — node.evidenceCount 가 영구
                  undefined 이라 'Evidence N' chip 도 cycle 16 의
                  구 상세 패널 정리와 같은 정책으로 제거(현행 FullDetailA1). 같은 정보가
                  필요해지면 cycle 6 의 ontology→docs 점프 chip 이 더
                  풍부하게 보여 줌. */}
              {ontologyResults.map(({ node }) => {
                // N12 (persona-ux-2026-07 report) — element titles that are
                // literal file paths ("mcp/src/ontology-engine.mjs") read as
                // body-text noise at full title weight next to plain-language
                // capability/domain titles in the same list. Demote to mono +
                // quaternary tone instead of hiding the row — the path is
                // still the row's only identifying label.
                // 지도·INDEX 가 그리는 이름과 같은 이름으로 결과를 부른다.
                // 결과 행만 원문 title 을 보이면, 방금 화면에서 읽은 이름으로
                // 찾아 놓고도 "이게 그 노드가 맞나" 를 다시 대조해야 한다.
                const label = node.display ?? node.title;
                const pathLike = node.kind === "element" && isPathLikeTitle(label);
                return (
                  <Command.Item
                    key={`ontology:${node.id}`}
                    value={`ontology:${node.id}`}
                    onSelect={() => {
                      onSelectNode(node);
                      closeAndClear();
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-chip px-3 py-2 text-body-lg text-[color:var(--color-text-secondary)] aria-selected:bg-[color:var(--color-indigo-a14)] aria-selected:text-[color:var(--color-text-primary)]"
                  >
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-tertiary)]">
                      {kindLabel(node.kind)}
                    </span>
                    <span
                      data-search-result-path-like={pathLike ? "true" : undefined}
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        pathLike
                          ? "font-mono text-body text-[color:var(--color-text-tertiary)]"
                          : "text-[color:var(--color-text-primary)]",
                      )}
                    >
                      <HighlightedText text={label} query={isEmptyQuery ? undefined : query} />
                    </span>
                    {node.summary ? (
                      <span className="hidden min-w-0 max-w-[14rem] truncate text-body text-[color:var(--color-text-tertiary)] md:block">
                        {node.summary}
                      </span>
                    ) : null}
                  </Command.Item>
                );
              })}
            </Command.Group>
          ) : null}

          {projects && projectResults.length > 0 && onSelectProject ? (
            <Command.Group
              heading={
                <span className="px-2 pb-1 pt-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                  {isEmptyQuery ? t('groupProjectRecent') : t('groupProjectMatch')} · {projectResults.length}
                  {isEmptyQuery && projectSize > projectResults.length ? ` / ${projectSize}` : ""}
                </span>
              }
            >
              {projectResults.map(({ project }) => (
                <Command.Item
                  key={`project:${project.slug}`}
                  value={`project:${project.slug}`}
                  onSelect={() => {
                    onSelectProject(project);
                    closeAndClear();
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-chip px-3 py-2 text-body-lg text-[color:var(--color-text-secondary)] aria-selected:bg-[color:var(--color-indigo-a14)] aria-selected:text-[color:var(--color-text-primary)]"
                >
                  <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-indigo-a20)] bg-[color:var(--color-indigo-a06)] px-1.5 py-[1px] font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-indigo-text-strong)]">
                    {project.isHub ? t('hub') : t('project')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                    {project.name}
                  </span>
                  <span className="hidden shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-tertiary)] md:inline">
                    {project.slug}
                  </span>
                  <span className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-tertiary)]">
                    {project.status}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
        </Command.List>

        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
          <span>
            {isEmptyQuery
              ? t('indexed', { count: totalCorpus })
              : t('matches', { count: totalMatches })}
          </span>
          <span className="flex items-center gap-3">
            <span>{t('shortcutMove')}</span>
            <span>{t('shortcutSelect')}</span>
            <span>{t('shortcutClose')}</span>
          </span>
        </div>
          </Command>
          <div
            aria-hidden="true"
            data-testid="global-search-bottom-reserve-scrim"
            data-bottom-reserve-scrim-contract="opaque-sheet-continuation"
            data-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
            className="fixed inset-x-0 bottom-0 h-[var(--topology-mobile-bottom-tab-reserve)] border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] md:hidden"
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
