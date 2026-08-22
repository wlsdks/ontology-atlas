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

// Falls back to the same reference while insight has not loaded — allocating a fresh
// [] each render would invalidate GlobalSearch's useMemo every time.
const EMPTY_NODES: readonly KnowledgeGraphNode[] = Object.freeze([]);

export interface MountedGlobalSearchProps {
  /**
   * On ontology node selection — unset defaults to pushing the `/ontology/` route.
   * A page handling it inline (its own panel and so on) absorbs it through this callback.
   */
  onSelectNode?: (node: KnowledgeGraphNode) => void;
  /**
   * On project selection — unset defaults to pushing the static-export-safe fallback detail.
   */
  onSelectProject?: (project: Project) => void;
  /**
   * Move the default hotkey to ⇧⌘K when coexisting with the home topology's SearchPalette (⌘K).
   */
  hotkeyShift?: boolean;
  /**
   * For managing the open state externally (another hotkey, a button …). Unset means
   * self-managed.
   */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}

/**
 * The single mount for global search — subscribes to the ontology nodes from vault
 * frontmatter (or the build-time dogfood) plus the user's projects, registers the ⌘K
 * hotkey, and renders GlobalSearch. Raw markdown search belongs to `/docs`'s own
 * search, because the vault is the source of truth there.
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
  // Ontology nodes — taken straight from the source of truth, vault frontmatter (or
  // the build-time dogfood). useOntologyInsight settles the mode-aware priority
  // (vault > static) on its own.
  const { insight } = useOntologyInsight();
  const nodes = insight?.nodes ?? EMPTY_NODES;
  const { projects } = useProjects();

  // The hotkey is inactive on a controlled mount — the caller manages open with another hotkey.
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
        // Default — jump to the /ontology page with the deeplink ?node=<id>. The page
        // sets that node as selectedNode once insight loads.
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
