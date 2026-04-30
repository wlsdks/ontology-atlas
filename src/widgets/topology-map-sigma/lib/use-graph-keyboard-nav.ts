'use client';

import { useEffect, type MutableRefObject } from 'react';
import type Graph from 'graphology';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from './graph-build';

interface Options {
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>;
  selectedSlugRef: MutableRefObject<string | null | undefined>;
  searchQueryRef: MutableRefObject<string | undefined>;
  onSelectProjectRef: MutableRefObject<((slug: string) => void) | undefined>;
  onEscape?: () => void;
  /** 검색창 input 의 DOM id. 이 엘리먼트에서 키 입력이 올 때만 Enter/↑/↓ 처리. */
  searchInputId?: string;
  /** false 면 window keydown 리스너 자체를 붙이지 않음. minimal 모드 용. */
  enabled?: boolean;
}

/**
 * 토폴로지 그래프의 키보드 네비게이션 한 번에 처리.
 * - Tab / Shift+Tab: 선택 노드의 이웃들을 이름 사전순으로 순회
 * - Esc: onEscape 콜백 (경로 찾기 해제 등)
 * - 검색 input focus 중 Enter / ↓ / ↑: 검색 매치 cycle + 포커스 이동
 *
 * ref 로 현재 선택/검색어/콜백을 참조해 effect 재실행 없이 최신값 반영.
 */
export function useGraphKeyboardNav({
  graph,
  selectedSlugRef,
  searchQueryRef,
  onSelectProjectRef,
  onEscape,
  searchInputId = 'sigma-search-input',
  enabled = true,
}: Options): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInSearchInput = target?.id === searchInputId;

      // 검색 input 안에서 Enter/↓/↑: 매치 순회
      if (
        isInSearchInput &&
        (event.key === 'Enter' ||
          event.key === 'ArrowDown' ||
          event.key === 'ArrowUp')
      ) {
        const q = searchQueryRef.current?.trim().toLowerCase();
        if (!q) return;
        const matches: string[] = [];
        graph.forEachNode((id, attrs) => {
          if (
            attrs.projectSlug.toLowerCase().includes(q) ||
            attrs.label.toLowerCase().includes(q)
          ) {
            matches.push(id);
          }
        });
        if (matches.length === 0) return;
        event.preventDefault();
        matches.sort();
        const current = selectedSlugRef.current;
        const currentIdx = current ? matches.indexOf(current) : -1;
        let nextIdx = 0;
        if (event.key === 'Enter') {
          nextIdx = currentIdx >= 0 ? currentIdx : 0;
        } else if (event.key === 'ArrowDown') {
          nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % matches.length;
        } else {
          nextIdx =
            currentIdx < 0
              ? matches.length - 1
              : (currentIdx - 1 + matches.length) % matches.length;
        }
        onSelectProjectRef.current?.(matches[nextIdx]);
        return;
      }

      // 폼 안에서는 Tab / Esc 처리 생략 (네이티브 동작 유지)
      const isForm =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        (target?.isContentEditable ?? false);
      if (isForm) return;

      if (event.key === 'Escape') {
        onEscape?.();
        return;
      }

      if (event.key !== 'Tab') return;
      const focus = selectedSlugRef.current;
      if (!focus || !graph.hasNode(focus)) {
        // 선택 노드 없을 때 Tab 은 첫 허브 (이름순) 로 진입시킨다. 허브도
        // 없으면 첫 노드. 이로써 키보드 유저도 바로 순회를 시작할 수 있다.
        event.preventDefault();
        const hubs: string[] = [];
        const allNodes: string[] = [];
        graph.forEachNode((id, attrs) => {
          allNodes.push(id);
          if (attrs.isHub) hubs.push(id);
        });
        const pool = hubs.length > 0 ? hubs : allNodes;
        if (pool.length === 0) return;
        pool.sort();
        onSelectProjectRef.current?.(pool[0]);
        return;
      }
      event.preventDefault();
      const neighbors: string[] = [];
      graph.forEachNeighbor(focus, (n) => neighbors.push(n));
      if (neighbors.length === 0) return;
      neighbors.sort();
      const step = event.shiftKey ? -1 : 1;
      const nextIdx = (step + neighbors.length) % neighbors.length;
      onSelectProjectRef.current?.(neighbors[nextIdx]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    enabled,
    graph,
    onEscape,
    onSelectProjectRef,
    searchInputId,
    searchQueryRef,
    selectedSlugRef,
  ]);
}
