"use client";

import { type KeyboardEvent, useState } from "react";
import { Plus } from "lucide-react";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { isImeComposing } from "@/shared/lib/keyboard/ime-composition";
import { controlClass } from "@/shared/ui";
import { Input } from "@/shared/ui/fields/input";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

export type IndexAddKind = "domain" | "capability" | "element";

export type IndexAddConcept = (parent: KnowledgeGraphNode, kind: IndexAddKind, title: string) => Promise<boolean>;

export const ADD_KINDS_BY_GROUP: Readonly<Record<string, readonly IndexAddKind[]>> = {
  project: ["domain"],
  domain: ["capability", "element"],
};

/** Keys the tree walks rows with; inside the name field they move the caret instead. */
const FIELD_KEYS = new Set(["ArrowUp", "ArrowDown", "Home", "End", "ArrowLeft", "ArrowRight"]);

/**
 * The quiet row at the end of an open group. Pressing it turns it into a name field: Enter creates
 * the concept in that group and leaves the field ready for the next; Escape or leaving ends it.
 */
export function TopologyIndexAddRow({
  parent,
  kind,
  depth,
  onAdd,
  labels,
}: {
  parent: KnowledgeGraphNode;
  kind: IndexAddKind;
  depth: number;
  onAdd: IndexAddConcept;
  labels: { action: string; field: string };
}) {
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const handleKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (FIELD_KEYS.has(event.key)) event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setNaming(false);
      setTitle("");
      return;
    }
    if (event.key !== "Enter" || isImeComposing(event) || creating || !title.trim()) return;
    event.preventDefault();
    setCreating(true);
    const created = await onAdd(parent, kind, title.trim());
    setCreating(false);
    if (created) setTitle("");
  };

  return (
    // A tree owns only tree items, so the row is one at its group's level; it holds a control,
    // which a tree item may.
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={false}
      aria-label={naming ? labels.field : labels.action}
      data-testid="topology-index-add-row"
      data-add-kind={kind}
      data-add-state={naming ? "naming" : "idle"}
      style={{ marginLeft: depth * 16 }}
    >
      {naming ? (
        <Input
          aria-label={labels.field}
          placeholder={labels.field}
          size="sm"
          className="w-full"
          value={title}
          autoFocus
          autoComplete="off"
          readOnly={creating}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => void handleKeyDown(event)}
          onBlur={() => {
            if (!title.trim()) setNaming(false);
          }}
          data-testid="topology-index-add-field"
        />
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className={controlClass({ shape: "row", size: "sm", scope: "panel", hoverInk: "strong", className: "pl-[30px]" })}
          data-testid="topology-index-add"
        >
          <Plus size={ICON_SIZE.sm} aria-hidden />
          {labels.action}
        </button>
      )}
    </div>
  );
}
