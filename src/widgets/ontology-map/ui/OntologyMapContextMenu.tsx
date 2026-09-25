"use client";

import { useEffect, useRef } from "react";
import { transientSurface } from "@/shared/ui/transient-surface";
import { Copy, FileText, GitBranch, Maximize2, Route } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { controlClass, RowButton, Surface } from "@/shared/ui";
import { currentFloatingRightBound } from "@/shared/lib/right-dock-reserve";

/**
 * W2-B — node right-click context menu (`use-topology-loop.ts`'s
 * `handleContextMenu` opens this ONLY when the right-click hit a node,
 * `topology-pointer-handlers.ts#createTopologyPointerHandlers` doc). Popover
 * (click) = information, this menu (right-click) = actions — the same 4
 * action-row items from `OntologyMapDetailPanel` (W2-A) plus the opt-in
 * "full detail" (full detail) link, reachable without first selecting the node.
 *
 * Hand-rolled rather than a Radix `DropdownMenu` — this repo's overlays
 * (`ShortcutSheet`, `SearchPalette`) already implement their own manual
 * Escape/focus-trap/outside-click handling even where a Radix primitive
 * (`@radix-ui/react-dialog`) is installed but unused; a cursor-anchored menu
 * with 5 static items doesn't need a new dependency to match that pattern.
 * Closing is owned by the caller (the Esc dismissal order's `close-context-menu`
 * tier plus `onClose`, see `topology-esc-ladder.ts`) — this component only
 * reports outside-clicks, it doesn't decide close priority itself.
 */
interface OntologyMapContextMenuLabels {
  actionDocument: string;
  /**
   * The label used instead of `actionDocument` for a node with no `.md` of its
   * own (a concept named only in another document's relation key). The link goes
   * not to "this concept's document" but to "the document that wrote this concept
   * down", so the label has to say that.
   */
  actionMentionDocument: string;
  /** The hover one-liner for the item above — why it goes to a different document. */
  actionMentionDocumentTip: string;
  actionEditRelations: string;
  actionCopyHandoff: string;
  actionPath: string;
  openFullDetail: string;
}

export interface OntologyMapContextMenuProps {
  /**
   * Whether it is open. **Closing is not an immediate unmount** — `Surface` opens
   * an exit window, and the parent holds the last model for its duration.
   */
  open: boolean;
  /** Once, after the exit finishes. Only for work that belongs to unmount, such as focus return. */
  onExited?: () => void;
  /** Viewport-space anchor (the right-click's `clientX`/`clientY`). */
  position: { x: number; y: number };
  /** **This node's own** document. null when it has no `.md` of its own. */
  documentHref: string | null;
  /** With no document of its own, another document that wrote this node down. Rendered under an honest label when present. */
  mentionDocumentHref?: string | null;
  meaningEditHref: string;
  labels: OntologyMapContextMenuLabels;
  onCopyHandoff: () => void;
  onSetPathSource: () => void;
  onOpenFullDetail: () => void;
  onClose: () => void;
  /** The menu's accessible name — it names the node the actions apply to. */
  ariaLabel: string;
}

/** Static estimate of the menu's own footprint (5 items + 1 divider, `p-1` padding) — good enough for the edge clamp below without a measure-then-reposition double-render. */
const MENU_WIDTH = 200;
const MENU_HEIGHT_ESTIMATE = 210;
const VIEWPORT_MARGIN = 8;

/**
 * Design Guardian nice-to-have (W2-B review) — a right-click near the
 * viewport's right/bottom edge used to position the menu off-screen (raw
 * `clientX`/`clientY`, no clamp). Pulls the anchor back in by the menu's own
 * footprint + a small margin; never pushes it past the top/left edge either.
 */
export function clampContextMenuPosition(
  position: { x: number; y: number },
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const maxX = Math.max(VIEWPORT_MARGIN, viewport.width - MENU_WIDTH - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, viewport.height - MENU_HEIGHT_ESTIMATE - VIEWPORT_MARGIN);
  return {
    x: Math.min(Math.max(position.x, VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(position.y, VIEWPORT_MARGIN), maxY),
  };
}

/**
 * The **only things true in this one place** for a menu item — the map panel's
 * scoped tokens (radius, ink, hover surface). Shape, size and alignment come from
 * `controlClass({ shape: "row" })` below. `row` has no radius in the ramp (rows
 * outside a panel live square), so only the radius is added here — the value is
 * `--radius-chip`, the same as `--map-panel-row-radius`, so it is written
 * with the global ramp utility.
 */
const MENU_ITEM_LOCAL =
  "rounded-chip text-[color:var(--map-panel-text-secondary)] hover:bg-[color:var(--map-panel-row-hover)]";
/** For the `<Link>`/`<span>` siblings — must be byte-identical to what `<RowButton>` emits. */
const MENU_ITEM_CLASS = controlClass({ shape: "row", size: "md", className: MENU_ITEM_LOCAL });
// `<Link>`/`<span>` cannot take the `disabled:` variant, so the dimming is
// written directly — at the same step as the value layer's disabled dim (the 55
// in `CONTROL_DISABLED_CLASS`). This is where it had drifted to 40.
const MENU_ITEM_DISABLED_CLASS = "pointer-events-none opacity-55";

const ENABLED_ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

/**
 * The next item for a menu key, or null when the key is not the menu's. Roving is
 * cyclic, the WAI-ARIA menu pattern: past the last item comes the first.
 */
function nextContextMenuItemIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : (current + 1) % count;
    case "ArrowUp":
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function OntologyMapContextMenu({
  open,
  onExited,
  position,
  documentHref,
  mentionDocumentHref = null,
  meaningEditHref,
  labels,
  onCopyHandoff,
  onSetPathSource,
  onOpenFullDetail,
  onClose,
  ariaLabel,
}: OntologyMapContextMenuProps) {
  const menuRef = useRef<HTMLElement | null>(null);

  /*
   * ★ **The menu takes focus when it opens** (interaction audit, 2026-09-25).
   *   Focus used to stay on the canvas, so the first ArrowDown walked the map's
   *   selection instead — it opened the next domain's panel and left this menu
   *   floating over that panel, anchored to a node that had moved away. Focus on
   *   the first item makes the arrow keys the menu's, and the canvas's keyboard
   *   walk (bound to the canvas element) never hears them.
   */
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>(ENABLED_ITEM_SELECTOR)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Bound natively: `Surface` passes no key handlers through, and the listener
  // only lives while the menu is open.
  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        // A menu is one stop: Tab leaves it, and leaving closes it.
        onClose();
        return;
      }
      const items = [...menu.querySelectorAll<HTMLElement>(ENABLED_ITEM_SELECTOR)];
      const current = items.findIndex((item) => item === document.activeElement);
      const next = nextContextMenuItemIndex(event.key, current, items.length);
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      items[next]?.focus({ preventScroll: true });
    };
    menu.addEventListener("keydown", handleKeyDown);
    return () => menu.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  // Outside-click closes — Esc is owned by the window-level dismissal order
  // (`HomePage.tsx`'s keydown effect + the `close-context-menu` tier) so both
  // dismissal paths route through the same `onClose`.
  //
  // ★ It does not close again during the exit window — a menu already closing
  //   that leaks another outside click into `onClose` cancels the parent's *next*
  //   right-click in the same frame.
  useEffect(() => {
    if (!open) return;
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
  }, [onClose, open]);

  const anchor =
    typeof window === "undefined"
      ? position
      : clampContextMenuPosition(position, {
          /*
           * The right wall is **the map's edge, not the screen's** (review,
           * 2026-08-16). With a conversation panel standing to the right of the
           * map, folding against the screen width puts the menu on top of that
           * panel — while what the menu acts on is a node in the map.
           */
          width: currentFloatingRightBound(),
          height: window.innerHeight,
        });

  return (
    // It grows from the cursor — the anchor is the menu's top-left, so the entry
    // origin is there too. (A menu born at its centre loses where it came from.)
    <Surface
      open={open}
      onExited={onExited}
      origin="top left"
      ref={menuRef}
      {...transientSurface("menu")}
      role="menu"
      aria-label={ariaLabel}
      data-testid="map-context-menu"
      className="fixed z-50 flex w-[200px] flex-col gap-0.5 rounded-[var(--map-panel-row-radius)] border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] p-1 shadow-[var(--map-panel-shadow)]"
      style={{ left: anchor.x, top: anchor.y }}
    >
      {documentHref ? (
        <Link
          href={documentHref}
          role="menuitem"
          data-testid="map-context-menu-document"
          className={MENU_ITEM_CLASS}
        >
          <FileText size={ICON_SIZE.md} aria-hidden="true" />
          {labels.actionDocument}
        </Link>
      ) : mentionDocumentHref ? (
        // A node with no document of its own — deleting the link would lose
        // "where is this concept written down". It stays, under a label that
        // names its destination.
        <Link
          href={mentionDocumentHref}
          role="menuitem"
          title={labels.actionMentionDocumentTip}
          data-testid="map-context-menu-mention-document"
          className={MENU_ITEM_CLASS}
        >
          <FileText size={ICON_SIZE.md} aria-hidden="true" />
          {labels.actionMentionDocument}
        </Link>
      ) : (
        <span
          role="menuitem"
          aria-disabled="true"
          data-testid="map-context-menu-document"
          className={[MENU_ITEM_CLASS, MENU_ITEM_DISABLED_CLASS].join(" ")}
        >
          <FileText size={ICON_SIZE.md} aria-hidden="true" />
          {labels.actionDocument}
        </span>
      )}
      <Link
        href={meaningEditHref}
        role="menuitem"
        data-testid="map-context-menu-edit"
        className={MENU_ITEM_CLASS}
      >
        <GitBranch size={ICON_SIZE.md} aria-hidden="true" />
        {labels.actionEditRelations}
      </Link>
      <RowButton
        role="menuitem"
        size="md"
        onClick={onCopyHandoff}
        data-testid="map-context-menu-handoff"
        className={MENU_ITEM_LOCAL}
      >
        <Copy size={ICON_SIZE.md} aria-hidden="true" />
        {labels.actionCopyHandoff}
      </RowButton>
      <RowButton
        role="menuitem"
        size="md"
        onClick={onSetPathSource}
        data-testid="map-context-menu-path"
        className={MENU_ITEM_LOCAL}
      >
        <Route size={ICON_SIZE.md} aria-hidden="true" />
        {labels.actionPath}
      </RowButton>
      <div className="my-0.5 border-t border-[color:var(--map-panel-divider)]" />
      <RowButton
        role="menuitem"
        size="md"
        onClick={onOpenFullDetail}
        data-testid="map-context-menu-full-detail"
        className={MENU_ITEM_LOCAL}
      >
        <Maximize2 size={ICON_SIZE.md} aria-hidden="true" />
        {labels.openFullDetail}
      </RowButton>
    </Surface>
  );
}
