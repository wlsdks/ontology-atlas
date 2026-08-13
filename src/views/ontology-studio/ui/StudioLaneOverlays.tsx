"use client";

/**
 * 레인 위 임시 표면 둘 — `StudioCompass.tsx` 분할 3탄 (2026-08-13).
 *
 * 한 레인의 이웃 전체를 훑는 오버플로 목록(`LaneOverflowList`)과, 위성 하나를
 * 제자리에서 고치는 앵커드 편집 카드(`InlineEditCard`). 둘 다 무대 좌표계
 * (`studio-board-geometry`)에 앵커되는 자기완결 표면이라 본체 상태를 받지
 * 않는다 — 본체에서 받는 것은 타입뿐(type-only, 순환 아님).
 */

import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { cn } from "@/shared/lib/cn";
import { IconButton, RowButton, controlClass } from "@/shared/ui";
import type { StudioBearing, StudioRelation, StudioSatellite } from "../lib/build-studio-item";
import { BOARD, CARD, CX, CY, SAT, clampX, clampY } from "./studio-board-geometry";
import { KindGlyph } from "./StudioKindGlyph";
import type { CompassBearingView, LaneLayout, StudioCompassLabels } from "./StudioCompass";

export function LaneOverflowList({
  exiting,
  view,
  layout,
  labels,
  kindLabelFor,
  onOpenNode,
  onEditNeighbor,
  pendingNeighborIds,
  onClose,
}: {
  /** 퇴장 창 동안 `true` — 「더 보기」 칩으로 되접히며 나가고, 그 사이 조작을 받지 않는다. */
  exiting: boolean;
  view: CompassBearingView;
  layout: LaneLayout;
  labels: StudioCompassLabels;
  kindLabelFor: (kind: string) => string;
  onOpenNode?: (id: string) => void;
  onEditNeighbor?: (neighbor: StudioSatellite) => void;
  pendingNeighborIds?: ReadonlySet<string>;
  onClose: () => void;
}) {
  const W = 288;
  const foldX = layout.fold?.x ?? 0;
  const foldY = layout.fold?.y ?? 0;
  const cardRight = CX + CARD.w / 2;
  const estH = Math.min(300, 60 + view.neighbors.length * 40);
  // Anchor beside the fold on the outward side so the center card stays clear.
  // up/down folds are centered under the card → send the list to the right gutter.
  const left =
    view.bearing === "right"
      ? clampX(foldX + SAT.w + 12, W)
      : view.bearing === "left"
        ? clampX(foldX - W - 12, W)
        : clampX(cardRight + 14, W);
  const top =
    view.bearing === "up" || view.bearing === "down"
      ? clampY(CY - estH / 2, estH)
      : clampY(foldY + 30 - estH / 2, estH);
  /*
   * 자라고 되접히는 **원점은 「더 보기」 칩**이다 — 목록은 그 칩 옆 여백에 붙으므로
   * 원점이 없으면 상자 가운데에서 커져, 어느 방위의 목록인지가 화면에서 사라진다.
   * 상자 밖으로 나간 값은 클램프한다(원점이 상자 밖이면 방향이 뒤집혀 보인다).
   */
  const originX = Math.max(0, Math.min(W, foldX + SAT.w / 2 - left));
  const originY = Math.max(0, Math.min(estH, foldY + 15 - top));
  return (
    <div
      data-testid={`studio-lane-list-${view.bearing}`}
      inert={exiting || undefined}
      data-exiting={exiting ? "true" : undefined}
      className={cn(
        "absolute z-[8] rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]",
        exiting ? "studio-anchored-out pointer-events-none" : "studio-anchored-in",
      )}
      style={
        {
          left,
          top,
          width: W,
          boxShadow: "var(--shadow-elevation-2)",
          "--studio-anchor-origin": `${originX}px ${originY}px`,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-3.5 py-2.5">
        <span className="min-w-0 truncate text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)] [word-break:keep-all]">
          {labels.foldTitle(view.laneLabel, view.neighbors.length)}
        </span>
        <IconButton
          size="sm"
          tone="muted"
          label={labels.close}
          onClick={onClose}
          className="ml-auto flex-none hover:text-[color:var(--color-text-secondary)]"
        >
          <X size={ICON_SIZE.md} aria-hidden />
        </IconButton>
      </div>
      <div className="max-h-[260px] overflow-y-auto p-1.5">
        {view.neighbors.map((sat) => {
          const onClick = onOpenNode ? () => onOpenNode(sat.id) : undefined;
          const Tag = onClick ? "button" : "div";
          const pending = pendingNeighborIds?.has(sat.id) ?? false;
          return (
            <div key={sat.id} className="group flex items-center rounded-card transition-colors hover:bg-[color:var(--color-indigo-a08)]">
              <Tag
                {...(onClick ? { type: "button" as const, onClick } : {})}
                data-testid={`studio-lane-row-${sat.id}`}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
              >
                <KindGlyph kind={sat.kind} />
                <span className="min-w-0 truncate text-body text-[color:var(--color-text-primary)]">{sat.title}</span>
                <span className="ml-auto flex-none text-label text-[color:var(--color-text-quaternary)]">
                  {pending ? labels.pendingBadge : kindLabelFor(sat.kind)}
                </span>
              </Tag>
              {onEditNeighbor ? (
                <IconButton
                  size="sm"
                  tone="muted"
                  data-testid={`studio-lane-edit-${sat.id}`}
                  label={labels.edit}
                  title={labels.edit}
                  onClick={() => onEditNeighbor(sat)}
                  className="mr-1.5 flex-none opacity-70 hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)] group-hover:opacity-100"
                >
                  <MoreHorizontal size={ICON_SIZE.md} aria-hidden />
                </IconButton>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Inline anchored edit card (Slice 1 — 지지대 편집) ──────────────────────────
/**
 * Retype / cut ONE existing relation, anchored beside its lane so the hero stays
 * visible. When the edge is NOT recorded on the focal node's own frontmatter
 * (e.g. a domain "contains" a child only because the child said `domain:`), the
 * card shows an honest note + a re-center button instead of a broken write.
 */
export function InlineEditCard({
  exiting,
  relation,
  neighbor,
  bearing,
  layout,
  cardLeft,
  cardRight,
  labels,
  editable,
  bearingLabelFor,
  onRetype,
  onRemove,
  onOpenOther,
  onClose,
}: {
  relation: StudioRelation;
  neighbor: StudioSatellite;
  bearing: StudioBearing;
  layout: LaneLayout | null;
  cardLeft: number;
  cardRight: number;
  labels: StudioCompassLabels;
  editable: boolean;
  bearingLabelFor: (relation: StudioRelation) => string;
  onRetype: (to: StudioRelation) => void;
  onRemove: () => void;
  onOpenOther: () => void;
  /** 퇴장 창 동안 `true` — 그 위성으로 되접히며 나가고, 그 사이 조작을 받지 않는다. */
  exiting: boolean;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const W = 264;
  const GAP = 14;
  const PAD = 8;
  const anchor = layout?.anchor ?? { x: CX, y: CY };
  const estH = editable ? 232 : 150;
  // Keep the card out of the hero: right/up/down → right gutter, left → left gutter.
  const left =
    bearing === "left"
      ? Math.max(PAD, cardLeft - GAP - W)
      : Math.min(Math.max(anchor.x + GAP, cardRight + GAP), BOARD.w - PAD - W);
  const top = clampY(anchor.y - estH / 2, estH);
  const otherRelations = (["isA", "dependsOn", "contains", "relates"] as StudioRelation[]).filter(
    (r) => r !== relation,
  );
  /*
   * 원점은 **그 위성**이다(`anchor`) — 카드는 위성 옆 여백에 붙으므로, 원점이
   * 없으면 상자 가운데에서 커져 「어느 관계의 카드인지」가 화면에서 사라진다.
   */
  const originX = Math.max(0, Math.min(W, anchor.x - left));
  const originY = Math.max(0, Math.min(estH, anchor.y - top));
  return (
    <div
      data-testid="studio-edit-card"
      data-relation={relation}
      inert={exiting || undefined}
      data-exiting={exiting ? "true" : undefined}
      className={cn(
        "absolute z-[9] flex flex-col rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]",
        exiting ? "studio-anchored-out pointer-events-none" : "studio-anchored-in",
      )}
      style={
        {
          left,
          top,
          width: W,
          boxShadow: "var(--shadow-elevation-2)",
          "--studio-anchor-origin": `${originX}px ${originY}px`,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-3.5 py-2.5">
        <span className="min-w-0 flex-1 truncate text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)] [word-break:keep-all]">
          {labels.editTitle}
        </span>
        <IconButton
          size="sm"
          tone="muted"
          label={labels.close}
          onClick={onClose}
          className="flex-none hover:text-[color:var(--color-text-secondary)]"
        >
          <X size={ICON_SIZE.md} aria-hidden />
        </IconButton>
      </div>
      <div className="flex items-center gap-2 px-3.5 pt-2.5">
        <KindGlyph kind={neighbor.kind} />
        <span className="min-w-0 truncate text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
          {neighbor.title}
        </span>
      </div>

      {editable ? (
        <>
          <div className="px-3.5 pb-1 pt-3">
            <span className="text-label text-[color:var(--color-text-quaternary)]">{labels.editRetypeHeading}</span>
          </div>
          <div className="flex flex-col gap-1 px-2 pb-1.5">
            {otherRelations.map((to) => (
              <RowButton
                key={to}
                data-testid={`studio-edit-retype-${to}`}
                onClick={() => onRetype(to)}
                className="hover:bg-[color:var(--color-indigo-a08)] hover:text-[color:var(--color-text-primary)]"
              >
                <span className="text-[color:var(--color-text-quaternary)]">→</span>
                {labels.editMoveTo(bearingLabelFor(to))}
              </RowButton>
            ))}
          </div>
          <div className="border-t border-[color:var(--color-divider)] p-2">
            {confirmDelete ? (
              <div className="flex items-center gap-2 px-1.5">
                <span className="min-w-0 flex-1 text-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
                  {labels.editDeleteConfirm}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className={controlClass({
                    shape: "link",
                    className: "flex-none hover:text-[color:var(--color-text-secondary)]",
                  })}
                >
                  {labels.editDeleteCancel}
                </button>
                <button
                  type="button"
                  data-testid="studio-edit-delete-confirm"
                  onClick={onRemove}
                  className={controlClass({
                    shape: "chip",
                    tone: "danger",
                    className:
                      "flex-none font-[var(--font-weight-emphasis)] hover:bg-[color:var(--color-danger-a32)]",
                  })}
                >
                  {labels.editDeleteYes}
                </button>
              </div>
            ) : (
              <RowButton
                data-testid="studio-edit-delete"
                onClick={() => setConfirmDelete(true)}
                className="hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]"
              >
                <X size={ICON_SIZE.md} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
                {labels.editDelete}
              </RowButton>
            )}
          </div>
        </>
      ) : (
        <div className="px-3.5 pb-3.5 pt-3">
          <p className="text-label leading-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
            {labels.editElsewhere(neighbor.title)}
          </p>
          <button
            type="button"
            data-testid="studio-edit-open-other"
            onClick={onOpenOther}
            className={controlClass({
              shape: "card",
              size: "sm",
              className:
                "mt-2.5 font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]",
            })}
          >
            {labels.editElsewhereGo}
          </button>
        </div>
      )}
    </div>
  );
}
