"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import type { KnowledgeDocument } from "@/entities/knowledge-document";
import { ManualSourceChip, type KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { getOntologyKindLabel } from "@/entities/ontology-class";
import type { Project } from "@/entities/project";
import {
  MEANINGFUL_ONTOLOGY_KINDS,
  type MeaningfulOntologyKind,
} from "@/shared/lib/ontology-tree";
import { matchKnowledgeDocuments, matchOntologyNodes, matchProjects } from "../lib/match";

export interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ontology approved 노드 — 첫 검색 source. */
  nodes: readonly KnowledgeGraphNode[];
  /** ontology 노드 선택 콜백. */
  onSelectNode: (node: KnowledgeGraphNode) => void;
  /**
   * knowledge documents — 옵션. 전달되면 별도 카테고리로 검색 결과 노출.
   * `onSelectDocument` 와 함께 와야 함.
   */
  documents?: readonly KnowledgeDocument[];
  onSelectDocument?: (document: KnowledgeDocument) => void;
  /**
   * projects — 옵션. A0-4: S4 closure. ⌘K 한 번에 ontology/문서/프로젝트
   * 통합 검색. `onSelectProject` 와 함께 와야 함.
   */
  projects?: readonly Project[];
  onSelectProject?: (project: Project) => void;
}

/**
 * 글로벌 검색 (cmdk 기반).
 *
 * 우리 자체 매처 (`matchOntologyNodes`, `matchKnowledgeDocuments`) 로 score / 정렬
 * → cmdk 는 `shouldFilter={false}` 로 표시·키보드 nav 만 담당. 한·영 혼합 매치 의도.
 *
 * Source 두 개 (ontology + documents) 를 별도 그룹으로 노출. cmdk Item value 는
 * `<source>:<id>` 로 prefix 충돌 회피. 빈 query 일 때는 두 source 모두 sample 표시
 * (ontology = title localeCompare 순 / documents = updatedAt desc).
 */
export function GlobalSearch({
  open,
  onOpenChange,
  nodes,
  onSelectNode,
  documents,
  onSelectDocument,
  projects,
  onSelectProject,
}: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  // Fire 2 — kind / project filter chip 으로 ontology 결과 좁히기. set 으로
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
  const documentResults = useMemo(
    () => (documents ? matchKnowledgeDocuments(query, documents, 20) : []),
    [query, documents],
  );
  const projectResults = useMemo(
    () => (projects ? matchProjects(query, projects, 20) : []),
    [query, projects],
  );

  const isEmptyQuery = query.trim() === "";
  const ontologySize = nodes.length;
  const documentSize = documents?.length ?? 0;
  const projectSize = projects?.length ?? 0;
  const totalCorpus = ontologySize + documentSize + projectSize;
  const totalMatches = ontologyResults.length + documentResults.length + projectResults.length;
  const hasFilter = selectedKinds.size > 0 || selectedProjectIds.size > 0;

  // workspace project chip row 의 source — projects prop 이 있으면 그대로
  // (slug + name), 없으면 nodes 에서 발견된 distinct projectIds 만으로 fallback
  // (slug 만 표시). 진안 본인 계정에서는 projects prop 이 흐르고, 데모 / aslan
  // 공개 surface 에서는 nodes 만 흐르는 시나리오 양쪽 다 chip 표시.
  //
  // Fire 5 — @tanstack/react-virtual 도입으로 PROJECT_CHIP_LIMIT 캡 제거.
  // stress-lab (1,979 project) 같은 큰 워크스페이스 에서도 horizontal
  // virtualizer 로 viewport 안 chip 만 렌더 (보통 ~10-15 개). ontology 빈도
  // 가중 정렬은 유지 — 첫 화면에 가장 관련 있는 chip 이 먼저 보이도록.
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
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[color:rgba(8,9,12,0.66)]" />
        <Dialog.Content
          aria-label="글로벌 검색"
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
        >
          <VisuallyHidden>
            <Dialog.Title>글로벌 검색</Dialog.Title>
            <Dialog.Description>
              ontology 노드와 knowledge 문서를 한 번에 검색합니다. 위·아래
              화살표로 이동, Enter 로 선택, ESC 로 닫기.
            </Dialog.Description>
          </VisuallyHidden>
          <Command
            label="글로벌 검색"
            shouldFilter={false}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-[color:var(--color-overlay-3)] bg-[color:var(--color-panel)] shadow-[0_20px_56px_rgba(0,0,0,0.50)]"
            onClick={(event) => event.stopPropagation()}
          >
        <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-4 py-3">
          <Search size={14} className="shrink-0 text-[color:var(--color-text-quaternary)]" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder={
              documents
                ? "노드 · 문서 검색 — 한·영 혼합 OK"
                : "ontology 노드 검색 — 한·영 혼합 OK"
            }
            className="flex-1 bg-transparent text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-2)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--color-text-quaternary)] sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Fire 2 — kind / project chip filter row. ontology 결과 좁히기 전용
            (documents / projects 결과는 영향 없음). 기본 펼침 — 사용자가
            "어떻게 좁힐 수 있는지" 한눈에 보이게. 다중 선택 toggle. */}
        <div
          className="flex flex-col gap-1 border-b border-[color:var(--color-border-soft)] px-3 py-2"
          aria-label="ontology 필터"
        >
          <div className="flex items-center gap-2 overflow-x-auto">
            <span
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]"
              aria-hidden
            >
              Kind
            </span>
            {MEANINGFUL_ONTOLOGY_KINDS.map((kind) => {
              const active = selectedKinds.has(kind);
              return (
                <button
                  key={`kind-${kind}`}
                  type="button"
                  onClick={() => toggleKind(kind)}
                  aria-pressed={active}
                  className={
                    active
                      ? "shrink-0 rounded-full border border-[color:rgba(94,106,210,0.5)] bg-[color:rgba(94,106,210,0.16)] px-2 py-0.5 text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-indigo-accent)]"
                      : "shrink-0 rounded-full border border-[color:var(--color-divider)] bg-transparent px-2 py-0.5 text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]"
                  }
                >
                  {getOntologyKindLabel(kind)}
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
                className="ml-auto shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
              >
                필터 해제
              </button>
            ) : null}
          </div>
          {projectChipSource.length > 0 ? (
            <div className="flex items-center gap-2">
              <span
                className="shrink-0 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]"
                aria-hidden
              >
                Project · {projectChipSource.length}
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
                        className={
                          active
                            ? "rounded-full border border-[color:rgba(94,106,210,0.5)] bg-[color:rgba(94,106,210,0.16)] px-2 py-0.5 text-[10px] text-[color:var(--color-indigo-accent)] mr-1.5 whitespace-nowrap"
                            : "rounded-full border border-[color:var(--color-divider)] bg-transparent px-2 py-0.5 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)] mr-1.5 whitespace-nowrap"
                        }
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

        <Command.List className="max-h-[52vh] overflow-y-auto px-2 py-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-[color:var(--color-text-tertiary)]">
            {isEmptyQuery
              ? totalCorpus === 0
                ? "아직 색인된 ontology 노드·문서가 없어요. 검수 큐에서 후보를 승인하면 여기로 자라요."
                : `${totalCorpus}개 항목이 색인되어 있어요. 한·영 모두 OK.`
              : `"${query}" 와 일치하는 결과가 없어요.`}
          </Command.Empty>

          {ontologyResults.length > 0 ? (
            <Command.Group
              heading={
                <span className="px-2 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  {isEmptyQuery ? "Ontology · 최근" : "Ontology · 매치"} · {ontologyResults.length}
                  {isEmptyQuery && ontologySize > ontologyResults.length ? ` / ${ontologySize}` : ""}
                </span>
              }
            >
              {ontologyResults.map(({ node }) => {
                const evidenceCount = node.evidenceCount ?? node.evidenceIds.length;
                return (
                  <Command.Item
                    key={`ontology:${node.id}`}
                    value={`ontology:${node.id}`}
                    onSelect={() => {
                      onSelectNode(node);
                      closeAndClear();
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-[color:var(--color-text-secondary)] aria-selected:bg-[color:rgba(94,106,210,0.14)] aria-selected:text-[color:var(--color-text-primary)]"
                  >
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                      {getOntologyKindLabel(node.kind)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                      {node.title}
                    </span>
                    <ManualSourceChip source={node.source} size="compact" />
                    {node.summary ? (
                      <span className="hidden min-w-0 max-w-[14rem] truncate text-xs text-[color:var(--color-text-quaternary)] md:block">
                        {node.summary}
                      </span>
                    ) : null}
                    {evidenceCount > 0 ? (
                      <span
                        className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]"
                        title={`근거 문서 ${evidenceCount}개`}
                      >
                        근거 {evidenceCount}
                      </span>
                    ) : null}
                  </Command.Item>
                );
              })}
            </Command.Group>
          ) : null}

          {documents && documentResults.length > 0 && onSelectDocument ? (
            <Command.Group
              heading={
                <span className="px-2 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  {isEmptyQuery ? "Documents · 최근" : "Documents · 매치"} · {documentResults.length}
                  {isEmptyQuery && documentSize > documentResults.length ? ` / ${documentSize}` : ""}
                </span>
              }
            >
              {documentResults.map(({ document }) => (
                <Command.Item
                  key={`document:${document.id}`}
                  value={`document:${document.id}`}
                  onSelect={() => {
                    onSelectDocument(document);
                    closeAndClear();
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-[color:var(--color-text-secondary)] aria-selected:bg-[color:rgba(94,106,210,0.14)] aria-selected:text-[color:var(--color-text-primary)]"
                >
                  <span className="inline-flex shrink-0 items-center rounded-full border border-[color:rgba(255,242,224,0.12)] bg-[color:rgba(255,242,224,0.04)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)]">
                    {document.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                    {document.title}
                  </span>
                  {document.projectIds[0] ? (
                    <span className="hidden shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)] md:inline">
                      {document.projectIds[0]}
                    </span>
                  ) : null}
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {document.status}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {projects && projectResults.length > 0 && onSelectProject ? (
            <Command.Group
              heading={
                <span className="px-2 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  {isEmptyQuery ? "Projects · 최근" : "Projects · 매치"} · {projectResults.length}
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
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-[color:var(--color-text-secondary)] aria-selected:bg-[color:rgba(94,106,210,0.14)] aria-selected:text-[color:var(--color-text-primary)]"
                >
                  <span className="inline-flex shrink-0 items-center rounded-full border border-[color:rgba(94,106,210,0.20)] bg-[color:rgba(94,106,210,0.06)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)]">
                    {project.isHub ? "허브" : "프로젝트"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                    {project.name}
                  </span>
                  <span className="hidden shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)] md:inline">
                    {project.slug}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {project.status}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
        </Command.List>

        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
          <span>
            {isEmptyQuery
              ? `${totalCorpus} 색인`
              : `${totalMatches} 매치`}
          </span>
          <span className="flex items-center gap-3">
            <span>↑↓ 이동</span>
            <span>↵ 선택</span>
            <span>ESC 닫기</span>
          </span>
        </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
