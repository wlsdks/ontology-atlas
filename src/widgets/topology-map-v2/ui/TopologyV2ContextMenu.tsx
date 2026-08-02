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
  /**
   * 자기 `.md` 가 없는 노드(다른 문서의 관계 키에서 이름만 불린 개념)에서
   * `actionDocument` 대신 쓰는 라벨. 링크가 향하는 곳이 "이 개념의 문서" 가
   * 아니라 "이 개념을 적어 둔 문서" 라서 라벨도 그렇게 말해야 한다.
   */
  actionMentionDocument: string;
  /** 위 항목의 hover 한 줄 풀이 — 왜 다른 문서로 가는지. */
  actionMentionDocumentTip: string;
  actionEditRelations: string;
  actionCopyHandoff: string;
  actionPath: string;
  openFullDetail: string;
}

export interface TopologyV2ContextMenuProps {
  /** Viewport-space anchor (the right-click's `clientX`/`clientY`). */
  position: { x: number; y: number };
  /** **이 노드 자신의** 문서. 자기 `.md` 가 없으면 null. */
  documentHref: string | null;
  /** 자기 문서가 없을 때, 이 노드를 적어 둔 다른 문서. 있으면 정직한 라벨로 렌더. */
  mentionDocumentHref?: string | null;
  studioEditHref: string;
  labels: TopologyV2ContextMenuLabels;
  onCopyHandoff: () => void;
  onSetPathSource: () => void;
  onOpenFullDetail: () => void;
  onClose: () => void;
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

const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-[var(--topology-v2-panel-row-radius)] px-2.5 py-1.5 text-left text-body text-[color:var(--topology-v2-panel-text-secondary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)]";
const MENU_ITEM_DISABLED_CLASS = "pointer-events-none opacity-40";

export function TopologyV2ContextMenu({
  position,
  documentHref,
  mentionDocumentHref = null,
  studioEditHref,
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

  const anchor =
    typeof window === "undefined"
      ? position
      : clampContextMenuPosition(position, {
          width: window.innerWidth,
          height: window.innerHeight,
        });

  return (
    <div
      ref={menuRef}
      role="menu"
      data-testid="topology-v2-context-menu"
      style={{ position: "fixed", left: anchor.x, top: anchor.y, zIndex: 50 }}
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
      ) : mentionDocumentHref ? (
        // 자기 문서가 없는 노드 — 링크를 지우면 "이 개념이 어디에 적혀 있나"
        // 를 잃는다. 목적지를 말하는 라벨로 바꿔 남긴다.
        <Link
          href={mentionDocumentHref}
          role="menuitem"
          title={labels.actionMentionDocumentTip}
          data-testid="topology-v2-context-menu-mention-document"
          className={MENU_ITEM_CLASS}
        >
          <FileText size={14} aria-hidden="true" />
          {labels.actionMentionDocument}
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
        href={studioEditHref}
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
