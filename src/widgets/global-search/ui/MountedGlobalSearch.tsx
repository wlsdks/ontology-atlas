"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  buildOntologyNodeHref,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { type Project, buildProjectRuntimeDetailHref } from "@/entities/project";
import { useProjects } from "@/features/project-data-source";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useGlobalSearchHotkey } from "../lib/use-global-search-hotkey";
import { GlobalSearch } from "./GlobalSearch";

// A stable fallback reference while insight loads, or GlobalSearch's useMemo invalidates every
// render.
const EMPTY_NODES: readonly KnowledgeGraphNode[] = Object.freeze([]);

export interface MountedGlobalSearchProps {
  onSelectNode?: (node: KnowledgeGraphNode) => void;
  onSelectProject?: (project: Project) => void;
  onSelectionFocus?: (keyboard: boolean) => void;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /**
   * Binds Cmd+K even when the caller owns the open state, so the lazily loaded dialog carries its
   * own key.
   */
  bindHotkey?: boolean;
  onMap?: boolean;
}

export function MountedGlobalSearch({
  onSelectNode,
  onSelectProject,
  onSelectionFocus,
  open: controlledOpen,
  onOpenChange,
  bindHotkey = false,
  onMap = false,
}: MountedGlobalSearchProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };
  const { insight } = useOntologyInsight();
  const nodes = insight?.nodes ?? EMPTY_NODES;
  const { projects } = useProjects();

  useGlobalSearchHotkey(open, setOpen, { disabled: isControlled && !bindHotkey });

  return (
    <GlobalSearch
      onSelectionFocus={onSelectionFocus}
      onMap={onMap}
      open={open}
      onOpenChange={setOpen}
      nodes={nodes}
      projects={projects}
      onSelectNode={(node) => {
        if (onSelectNode) {
          onSelectNode(node);
          return;
        }
        router.push(buildOntologyNodeHref(node.id));
      }}
      onSelectProject={(project) => {
        if (onSelectProject) {
          onSelectProject(project);
          return;
        }
        router.push(buildProjectRuntimeDetailHref(project.slug));
      }}
    />
  );
}
