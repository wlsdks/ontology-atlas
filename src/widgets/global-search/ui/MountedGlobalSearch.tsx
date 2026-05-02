"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { type Project, getProjectDetailHref } from "@/entities/project";
import { useProjects } from "@/features/project-data-source";
import { useGlobalSearchHotkey } from "../lib/use-global-search-hotkey";
import { GlobalSearch } from "./GlobalSearch";

export interface MountedGlobalSearchProps {
  accountId: string | null;
  /**
   * ontology 노드 선택 시 — 미제공이면 default = `/ontology/` 라우트로 push.
   * 페이지가 자체 패널 등 inline 처리하려면 이 콜백으로 흡수.
   */
  onSelectNode?: (node: KnowledgeGraphNode) => void;
  /**
   * project 선택 시 — 미제공이면 default = `/project/[slug]/` 로 push.
   */
  onSelectProject?: (project: Project) => void;
  /** legacy returnTo prop — KnowledgeDocument 호스팅 제거 후 미사용. 호환을 위해 유지. */
  returnTo?: string;
  /**
   * Fire 2 — 홈 토폴로지의 SearchPalette (⌘K) 와 동거. 기본 hotkey 를 ⇧⌘K
   * 로 변경.
   */
  hotkeyShift?: boolean;
  /**
   * Fire 2 — 외부에서 open state 를 관리하고 싶을 때 (다른 hotkey / 버튼 등).
   * 미지정 시 self-managed.
   */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}

/**
 * 글로벌 검색 단일 mount — accountId 만 받으면 자체 ontology + projects 구독,
 * ⌘K hotkey 등록, GlobalSearch 렌더 모두 처리.
 *
 * mission v2 정렬: cloud markdown 호스팅 (`/knowledge/documents/*`) 제거 후
 * 검색 source 는 ontology nodes + projects 두 개. raw markdown 검색은 vault
 * 가 진실원이라 `/docs` 의 자체 검색이 담당.
 */
export function MountedGlobalSearch({
  accountId,
  onSelectNode,
  onSelectProject,
  hotkeyShift = false,
  open: controlledOpen,
  onOpenChange,
}: MountedGlobalSearchProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };
  // R10b — ontology nodes 검색은 vault frontmatter 기반으로 미래 재구성. 지금은
  // projects 만 검색.
  const nodes: KnowledgeGraphNode[] = [];
  const { projects } = useProjects();

  // controlled mount 시 hotkey 비활성 — caller 가 다른 hotkey 로 open 관리.
  useGlobalSearchHotkey(open, setOpen, {
    shift: hotkeyShift,
    disabled: isControlled,
  });

  return (
    <GlobalSearch
      open={open}
      onOpenChange={setOpen}
      nodes={nodes}
      projects={projects}
      onSelectNode={(node) => {
        if (onSelectNode) {
          onSelectNode(node);
          return;
        }
        // default — /ontology 페이지로 점프 + deeplink ?node=<id>. 페이지가
        // insight 로드 후 해당 노드를 selectedNode 로 자동 설정.
        // R10 — accountId 항상 null 이라 account query 무의미. 단순화.
        router.push(`/ontology/?node=${encodeURIComponent(node.id)}`);
      }}
      onSelectProject={(project) => {
        if (onSelectProject) {
          onSelectProject(project);
          return;
        }
        // default — /project/[slug]/ 라우트로 점프. account 쿼리 보존.
        router.push(getProjectDetailHref(project.slug, accountId));
      }}
    />
  );
}
