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

// A stable fallback reference while insight loads, or GlobalSearch's useMemo invalidates every
// render.
const EMPTY_NODES: readonly KnowledgeGraphNode[] = Object.freeze([]);

export interface MountedGlobalSearchProps {
  /** Ontology node selection; defaults to pushing the `/ontology/` route. */
  onSelectNode?: (node: KnowledgeGraphNode) => void;
  /** Project selection; defaults to the static-export-safe fallback detail. */
  onSelectProject?: (project: Project) => void;
  onSelectionFocus?: (keyboard: boolean) => void;
  /** Controls the open state externally; unset means self-managed. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /**
   * Binds Cmd+K even when the caller owns the open state, so the lazily loaded dialog carries its
   * own key.
   */
  bindHotkey?: boolean;
  /** The map's own mount: there the dialog may speak of "this map" (`GlobalSearch`'s `onMap`). */
  onMap?: boolean;
}

/**
 * Single mount for global search: vault ontology nodes plus projects, the Cmd+K hotkey and
 * GlobalSearch. Raw markdown search belongs to `/docs`.
 */
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
  // Ontology nodes from vault frontmatter or the build-time dogfood; useOntologyInsight picks the
  // source.
  const { insight } = useOntologyInsight();
  const nodes = insight?.nodes ?? EMPTY_NODES;
  const { projects } = useProjects();

  // Inactive on a controlled mount unless the caller asked the hotkey to travel with the dialog
  // (`bindHotkey`).
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
        // Default: the /ontology page with `?node=<id>`.
        router.push(buildOntologyNodeHref(node.id));
      }}
      onSelectProject={(project) => {
        if (onSelectProject) {
          onSelectProject(project);
          return;
        }
        // Default — jump to the fallback that also opens local slugs unknown at build time.
        router.push(getProjectRuntimeDetailHref(project.slug));
      }}
    />
  );
}
