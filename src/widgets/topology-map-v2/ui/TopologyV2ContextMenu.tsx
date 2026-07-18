"use client";

import { useEffect, useRef } from "react";
import { Copy, FileText, GitBranch, Maximize2, Route } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * W2-B — node right-click context menu (`use-topology-loop.ts`'s
 * `handleContextMenu` opens this ONLY when the right-click hit a node,
 * `topology-pointer-handlers.ts#createTopologyPointerHandlers` doc). Popover
 * (click) = information, this menu (right-click) = actions — the same 4
 * action-row items from `TopologyV2DetailPanel` (W2-A) plus the opt-in
 * "전체 상세" link, reachable without first selecting the node.
 *
 * Hand-rolled rather than a Radix `DropdownMenu` — this repo's overlays
 * (`ShortcutSheet`, `SearchPalette`) already implement their own manual
 * Escape/focus-trap/outside-click handling even where a Radix primitive
 * (`@radix-ui/react-dialog`) is installed but unused; a cursor-anchored menu
 * with 5 static items doesn't need a new dependency to match that pattern.
 * Closing is owned by the caller (Esc ladder tier `close-context-menu` +
 * `onClose`, see `topology-esc-ladder.ts`) — this component only reports
 * outside-clicks, it doesn't decide close priority itself.
 */
export interface TopologyV2ContextMenuLabels {
  actionDocument: string;
  actionEditRelations: string;
  actionCopyHandoff: string;
  actionPath: string;
  openFullDetail: string;
}

export interface TopologyV2ContextMenuProps {
  /** Viewport-space anchor (the right-click's `clientX`/`clientY`). */
  position: { x: number; y: number };
  documentHref: string | null;
  builderEditHref: string;
  labels: TopologyV2ContextMenuLabels;
  onCopyHandoff: () => void;
  onSetPathSource: () => void;
  onOpenFullDetail: () => void;
  onClose: () => void;
}

const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-[var(--topology-v2-panel-row-radius)] px-2.5 py-1.5 text-left text-[12.5px] text-[color:var(--topology-v2-panel-text-secondary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)]";
const MENU_ITEM_DISABLED_CLASS = "pointer-events-none opacity-40";

export function TopologyV2ContextMenu({
  position,
  documentHref,
  builderEditHref,
  labels,
  onCopyHandoff,
  onSetPathSource,
  onOpenFullDetail,
  onClose,
}: TopologyV2ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Outside-click closes — Esc is owned by the window-level ladder
  // (`HomePage.tsx`'s keydown effect + `close-context-menu` tier) so both
  // dismissal paths route through the same `onClose`.
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    // Capture phase: the canvas's own pointerdown handler runs in bubble
    // phase and doesn't call `stopPropagation`, so a bubble-phase listener
    // here would still fire correctly — capture is used defensively so an
    // ancestor `stopPropagation` elsewhere can never swallow the dismiss.
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      data-testid="topology-v2-context-menu"
      style={{ position: "fixed", left: position.x, top: position.y, zIndex: 50 }}
      className="flex w-[200px] flex-col gap-0.5 rounded-[var(--topology-v2-panel-row-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-1 shadow-[var(--topology-v2-panel-shadow)]"
    >
      {documentHref ? (
        <Link
          href={documentHref}
          role="menuitem"
          data-testid="topology-v2-context-menu-document"
          className={MENU_ITEM_CLASS}
        >
          <FileText size={14} aria-hidden="true" />
          {labels.actionDocument}
        </Link>
      ) : (
        <span
          role="menuitem"
          aria-disabled="true"
          data-testid="topology-v2-context-menu-document"
          className={[MENU_ITEM_CLASS, MENU_ITEM_DISABLED_CLASS].join(" ")}
        >
          <FileText size={14} aria-hidden="true" />
          {labels.actionDocument}
        </span>
      )}
      <Link
        href={builderEditHref}
        role="menuitem"
        data-testid="topology-v2-context-menu-edit"
        className={MENU_ITEM_CLASS}
      >
        <GitBranch size={14} aria-hidden="true" />
        {labels.actionEditRelations}
      </Link>
      <button
        type="button"
        role="menuitem"
        onClick={onCopyHandoff}
        data-testid="topology-v2-context-menu-handoff"
        className={MENU_ITEM_CLASS}
      >
        <Copy size={14} aria-hidden="true" />
        {labels.actionCopyHandoff}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onSetPathSource}
        data-testid="topology-v2-context-menu-path"
        className={MENU_ITEM_CLASS}
      >
        <Route size={14} aria-hidden="true" />
        {labels.actionPath}
      </button>
      <div className="my-0.5 border-t border-[color:var(--topology-v2-panel-divider)]" />
      <button
        type="button"
        role="menuitem"
        onClick={onOpenFullDetail}
        data-testid="topology-v2-context-menu-full-detail"
        className={MENU_ITEM_CLASS}
      >
        <Maximize2 size={14} aria-hidden="true" />
        {labels.openFullDetail}
      </button>
    </div>
  );
}
