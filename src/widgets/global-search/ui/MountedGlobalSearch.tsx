"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  buildOntologyNodeHref,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { type Project, getProjectRuntimeDetailHref } from "@/entities/project";
import { useProjects } from "@/features/project-data-source";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useGlobalSearchHotkey } from "../lib/use-global-search-hotkey";
import { GlobalSearch } from "./GlobalSearch";

// insight 가 아직 로드 안 된 경우 동일 reference 로 fallback — 매 render
// 새 [] 할당하면 GlobalSearch 의 useMemo 가 매번 invalidate.
const EMPTY_NODES: readonly KnowledgeGraphNode[] = Object.freeze([]);

export interface MountedGlobalSearchProps {
  /**
   * ontology 노드 선택 시 — 미제공이면 default = `/ontology/` 라우트로 push.
   * 페이지가 자체 패널 등 inline 처리하려면 이 콜백으로 흡수.
   */
  onSelectNode?: (node: KnowledgeGraphNode) => void;
  /**
   * project 선택 시 — 미제공이면 정적 export-safe fallback 상세로 push.
   */
  onSelectProject?: (project: Project) => void;
  /**
   * 홈 토폴로지의 SearchPalette (⌘K) 와 동거 시 기본 hotkey 를 ⇧⌘K 로 변경.
   */
  hotkeyShift?: boolean;
  /**
   * 외부에서 open state 를 관리하고 싶을 때 (다른 hotkey / 버튼 등). 미지정
   * 시 self-managed.
   */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}

/**
 * 글로벌 검색 단일 mount — vault frontmatter (또는 빌드타임 dogfood) 의
 * ontology nodes + 사용자 projects 구독, ⌘K hotkey 등록, GlobalSearch 렌더
 * 모두 처리. raw markdown 검색은 vault 가 진실원이라 \`/docs\` 의 자체 검색이
 * 담당.
 */
export function MountedGlobalSearch({
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
  // ontology nodes — vault frontmatter (또는 빌드타임 dogfood) 진실원에서
  // 직접 가져옴. useOntologyInsight 가 mode-aware 우선순위 (vault > static)
  // 로 알아서 결정.
  const { insight } = useOntologyInsight();
  const nodes = insight?.nodes ?? EMPTY_NODES;
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
        router.push(buildOntologyNodeHref(node.id));
      }}
      onSelectProject={(project) => {
        if (onSelectProject) {
          onSelectProject(project);
          return;
        }
        // default — 빌드 시점에 알 수 없는 로컬 slug도 여는 fallback으로 점프.
        router.push(getProjectRuntimeDetailHref(project.slug));
      }}
    />
  );
}
