"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getKnowledgeDocumentDetailHref,
  type KnowledgeDocument,
} from "@/entities/knowledge-document";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { type Project, getProjectDetailHref } from "@/entities/project";
import { useProjects } from "@/features/project-data-source";
import { ACCOUNT_QUERY_KEY } from "@/shared/lib/account-scope";
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
   * document 선택 시 — 미제공이면 default = `/knowledge/documents/view/?id=...` 로 push.
   */
  onSelectDocument?: (document: KnowledgeDocument) => void;
  /**
   * project 선택 시 — 미제공이면 default = `/project/[slug]/` 로 push (S4 closure).
   */
  onSelectProject?: (project: Project) => void;
  /** document view 점프 시 returnTo 파라미터. 기본 = 현재 path 추론은 호출자가 결정. */
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
 * 글로벌 검색 단일 mount — accountId 만 받으면 자체 ontology + documents 구독,
 * ⌘K hotkey 등록, GlobalSearch 렌더 모두 처리. 각 surface 가 똑같은 boilerplate
 * 반복하지 않도록.
 *
 * 페이지가 검색 결과 처리를 inline 화 하고 싶으면 onSelectNode / onSelectDocument
 * 로 override. default 는 라우팅 점프.
 */
export function MountedGlobalSearch({
  accountId,
  onSelectNode,
  onSelectDocument,
  onSelectProject,
  returnTo,
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
  const [nodes, setNodes] = useState<KnowledgeGraphNode[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const { projects } = useProjects(accountId);

  // controlled mount 시 hotkey 비활성 — caller 가 다른 hotkey 로 open 관리.
  useGlobalSearchHotkey(open, setOpen, {
    shift: hotkeyShift,
    disabled: isControlled,
  });

  // ontology approved nodes — public projection. 권한 없으면 빈 배열.
  useEffect(() => {
    setNodes([]);
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void import("@/entities/knowledge-graph/api").then(({ subscribeKnowledgePublicGraph }) => {
      if (cancelled) return;
      unsubscribe = subscribeKnowledgePublicGraph(
        accountId,
        (insight) => setNodes(insight.nodes),
        () => setNodes([]),
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [accountId]);

  // knowledge documents — 권한 게이팅은 Firestore rules. 권한 없으면 빈 배열.
  useEffect(() => {
    setDocuments([]);
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void import("@/entities/knowledge-document/api").then(({ subscribeKnowledgeDocuments }) => {
      if (cancelled) return;
      unsubscribe = subscribeKnowledgeDocuments(
        accountId,
        (next) => setDocuments(next),
        () => setDocuments([]),
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [accountId]);

  return (
    <GlobalSearch
      open={open}
      onOpenChange={setOpen}
      nodes={nodes}
      documents={documents}
      projects={projects}
      onSelectNode={(node) => {
        if (onSelectNode) {
          onSelectNode(node);
          return;
        }
        // default — /ontology 페이지로 점프 + deeplink ?node=<id>. 페이지가
        // insight 로드 후 해당 노드를 selectedNode 로 자동 설정.
        const accountQuery = accountId ? `&${ACCOUNT_QUERY_KEY}=${encodeURIComponent(accountId)}` : "";
        router.push(`/ontology/?node=${encodeURIComponent(node.id)}${accountQuery}`);
      }}
      onSelectDocument={(document) => {
        if (onSelectDocument) {
          onSelectDocument(document);
          return;
        }
        router.push(
          getKnowledgeDocumentDetailHref(document.id, accountId, { returnTo }),
        );
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
